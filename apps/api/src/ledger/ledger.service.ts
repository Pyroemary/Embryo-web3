import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

type Tx = Prisma.TransactionClient;

export const ACCOUNTS = {
  wallet: "user:wallet", // user's on-chain USDC (mirror)
  pending: "user:roundup_pending", // earmarked round-ups awaiting settlement
  invested: "user:invested", // principal moved into vault (cost basis)
} as const;

export interface PostingLine {
  userId: string | null;
  code: string;
  amountMicro: bigint; // + debit / - credit
}

/** Double-entry ledger. Every transaction must sum to zero and is idempotent by `reference`. */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async post(tx: Tx, kind: string, reference: string, lines: PostingLine[], memo?: string) {
    const sum = lines.reduce((s, l) => s + l.amountMicro, 0n);
    if (sum !== 0n) throw new BadRequestException(`Unbalanced ledger posting ${reference}: ${sum}`);
    const existing = await tx.ledgerTransaction.findUnique({ where: { reference } });
    if (existing) return existing;

    const accountIds = await Promise.all(lines.map((l) => this.account(tx, l.userId, l.code)));
    return tx.ledgerTransaction.create({
      data: {
        kind,
        reference,
        memo,
        lines: { create: lines.map((l, i) => ({ accountId: accountIds[i], amountMicro: l.amountMicro })) },
      },
    });
  }

  async balance(userId: string | null, code: string, tx: Tx = this.prisma): Promise<bigint> {
    const account = await tx.ledgerAccount.findFirst({ where: { userId, code, currency: "USDC" } });
    if (!account) return 0n;
    const agg = await tx.ledgerLine.aggregate({ where: { accountId: account.id }, _sum: { amountMicro: true } });
    return agg._sum.amountMicro ?? 0n;
  }

  /** Global invariant: all lines across the ledger sum to zero. */
  async trialBalance(): Promise<bigint> {
    const agg = await this.prisma.ledgerLine.aggregate({ _sum: { amountMicro: true } });
    return agg._sum.amountMicro ?? 0n;
  }

  private async account(tx: Tx, userId: string | null, code: string): Promise<string> {
    const found = await tx.ledgerAccount.findFirst({ where: { userId, code, currency: "USDC" } });
    if (found) return found.id;
    const created = await tx.ledgerAccount.create({ data: { userId, code, currency: "USDC" } });
    return created.id;
  }
}
