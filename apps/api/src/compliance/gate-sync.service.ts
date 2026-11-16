import { Injectable, Logger } from "@nestjs/common";
import { Address, getAddress } from "viem";
import { PrismaService } from "../prisma.service";
import { ChainService } from "../chain/chain.service";

/** Mirrors KYC status into the on-chain AllowlistGate (the vaults' compliance perimeter). */
@Injectable()
export class GateSyncService {
  private readonly log = new Logger(GateSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: ChainService,
  ) {}

  async syncPending(): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: { gateSynced: false, walletAddress: { not: null }, kycStatus: { in: ["APPROVED", "REJECTED", "BLOCKED"] } },
      take: 200,
    });
    const allow = users.filter((u) => u.kycStatus === "APPROVED");
    const deny = users.filter((u) => u.kycStatus !== "APPROVED");
    const toAddr = (w: string | null) => getAddress(w!) as Address;
    await this.chain.setAllowed(allow.map((u) => toAddr(u.walletAddress)), true);
    await this.chain.setAllowed(deny.map((u) => toAddr(u.walletAddress)), false);
    if (users.length) {
      await this.prisma.user.updateMany({ where: { id: { in: users.map((u) => u.id) } }, data: { gateSynced: true } });
      this.log.log(`gate synced: +${allow.length} / -${deny.length}`);
    }
    return users.length;
  }
}
