import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AdminGuard } from "../auth/admin.guard";
import { ZodPipe } from "../common/zod.pipe";
import { LedgerService } from "../ledger/ledger.service";
import { PrismaService } from "../prisma.service";
import { SettlementService } from "../roundups/settlement.service";

const policySchema = z.object({
  onboarding: z.boolean(),
  card: z.boolean(),
  vault: z.boolean(),
  trading: z.boolean(),
  note: z.string().max(500).optional(),
});

const tierSchema = z.object({ tier: z.enum(["FREE", "PLUS", "ELITE"]) });

@Controller("admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly settlement: SettlementService,
  ) {}

  @Get("metrics")
  async metrics() {
    const [users, kycApproved, cards, pending, invested, batches, trial] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { kycStatus: "APPROVED" } }),
      this.prisma.card.count({ where: { status: "ACTIVE" } }),
      this.prisma.roundUpEntry.aggregate({ where: { status: { in: ["PENDING", "SUBMITTED"] } }, _sum: { amountMicro: true } }),
      this.prisma.roundUpEntry.aggregate({ where: { status: "INVESTED" }, _sum: { amountMicro: true } }),
      this.prisma.settlementBatch.count(),
      this.ledger.trialBalance(),
    ]);
    return {
      users,
      kycApproved,
      activeCards: cards,
      pendingMicro: pending._sum.amountMicro ?? 0n,
      investedMicro: invested._sum.amountMicro ?? 0n,
      batches,
      ledgerBalanced: trial === 0n,
    };
  }

  @Get("users")
  users(@Query("q") q?: string, @Query("kyc") kyc?: string) {
    return this.prisma.user.findMany({
      where: {
        ...(kyc ? { kycStatus: kyc as never } : {}),
        ...(q ? { OR: [{ email: { contains: q } }, { id: q }, { walletAddress: q.toLowerCase() }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { cards: true },
    });
  }

  @Put("users/:id/tier")
  async setTier(@Param("id") id: string, @Body(new ZodPipe(tierSchema)) body: { tier: "FREE" | "PLUS" | "ELITE" }) {
    const user = await this.prisma.user.update({ where: { id }, data: { tier: body.tier } });
    await this.prisma.auditLog.create({ data: { actor: "admin", action: "user.tier", target: id, data: body } });
    return user;
  }

  @Get("batches")
  batches() {
    return this.prisma.settlementBatch.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  }

  @Post("settlement/run")
  runSettlement() {
    return this.settlement.run();
  }

  @Get("country-policies")
  policies() {
    return this.prisma.countryPolicy.findMany({ orderBy: { countryCode: "asc" } });
  }

  @Put("country-policies/:code")
  async setPolicy(@Param("code") code: string, @Body(new ZodPipe(policySchema)) body: z.infer<typeof policySchema>) {
    const countryCode = code.toUpperCase();
    const row = await this.prisma.countryPolicy.upsert({
      where: { countryCode },
      create: { countryCode, ...body },
      update: body,
    });
    await this.prisma.auditLog.create({ data: { actor: "admin", action: "country.policy", target: countryCode, data: body } });
    return row;
  }

  @Get("audit")
  audit() {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  }
}
