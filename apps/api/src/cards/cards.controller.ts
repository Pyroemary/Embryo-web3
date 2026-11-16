import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Headers, HttpCode, Inject, NotFoundException, Param, Post,
  RawBodyRequest, Req, UnauthorizedException, UseGuards,
} from "@nestjs/common";
import { Prisma, User } from "@prisma/client";
import type { Request } from "express";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import { CountryPolicyService } from "../compliance/country-policy.service";
import { PrismaService } from "../prisma.service";
import { RoundUpsService } from "../roundups/roundups.service";
import { CARD_ISSUER, CardIssuer } from "./card-issuer";

@Controller()
export class CardsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: CountryPolicyService,
    private readonly roundups: RoundUpsService,
    @Inject(CARD_ISSUER) private readonly issuer: CardIssuer,
  ) {}

  @Get("cards")
  @UseGuards(AuthGuard)
  list(@CurrentUser() user: User) {
    return this.prisma.card.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  }

  /** Issue the user's virtual zodiac card (one active card per user in v1). */
  @Post("cards")
  @UseGuards(AuthGuard)
  async issue(@CurrentUser() user: User) {
    if (user.kycStatus !== "APPROVED") throw new ForbiddenException("KYC approval required");
    if (!user.walletAddress) throw new BadRequestException("Wallet not linked");
    const elig = await this.policy.eligibility(user.countryCode);
    if (!elig.card) throw new ForbiddenException(elig.reason ?? "Card not available in your country");
    const existing = await this.prisma.card.findFirst({ where: { userId: user.id, status: { not: "CANCELLED" } } });
    if (existing) return existing;

    const design = `${user.zodiacSign ?? "classic"}-${user.tier.toLowerCase()}`;
    const issued = await this.issuer.issueVirtualCard({ userId: user.id, walletAddress: user.walletAddress, design });
    const card = await this.prisma.card.create({
      data: { userId: user.id, issuer: this.issuer.name, design, ...issued },
    });
    await this.prisma.auditLog.create({ data: { actor: user.id, action: "card.issued", target: card.id } });
    return card;
  }

  @Post("cards/:id/freeze")
  @UseGuards(AuthGuard)
  freeze(@CurrentUser() user: User, @Param("id") id: string) {
    return this.setFrozen(user, id, true);
  }

  @Post("cards/:id/unfreeze")
  @UseGuards(AuthGuard)
  unfreeze(@CurrentUser() user: User, @Param("id") id: string) {
    return this.setFrozen(user, id, false);
  }

  private async setFrozen(user: User, id: string, frozen: boolean) {
    const card = await this.prisma.card.findFirst({ where: { id, userId: user.id } });
    if (!card || card.status === "CANCELLED") throw new NotFoundException();
    await this.issuer.setFrozen(card.issuerCardId, frozen);
    return this.prisma.card.update({ where: { id }, data: { status: frozen ? "FROZEN" : "ACTIVE" } });
  }

  /** Card issuer → Embryo transaction webhooks. Idempotent per event and per transaction. */
  @Post("webhooks/card")
  @HttpCode(200)
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers() headers: Record<string, string>, @Body() body: unknown) {
    if (!req.rawBody || !this.issuer.verifyWebhook(req.rawBody, headers)) throw new UnauthorizedException("bad signature");
    const event = this.issuer.parseWebhook(body);
    if (!event) return { ok: true, ignored: true };

    try {
      await this.prisma.webhookEvent.create({
        data: { provider: this.issuer.name, eventId: event.eventId, payload: body as Prisma.InputJsonValue },
      });
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "P2002") return { ok: true, duplicate: true };
      throw e;
    }

    const card = await this.prisma.card.findUnique({ where: { issuerCardId: event.issuerCardId } });
    if (!card) return { ok: true, ignored: "unknown card" };

    const tx = await this.prisma.cardTransaction.upsert({
      where: { issuerTxId: event.issuerTxId },
      create: {
        cardId: card.id,
        issuerTxId: event.issuerTxId,
        amountMinor: event.amountMinor,
        currency: event.currency,
        merchantName: event.merchantName,
        mcc: event.mcc,
        status: event.status,
        occurredAt: event.occurredAt,
      },
      update: { status: event.status, amountMinor: event.amountMinor },
    });

    if (event.status === "SETTLED") await this.roundups.onSettled(tx.id);
    if (event.status === "REVERSED") await this.roundups.onReversed(tx.id);
    return { ok: true };
  }
}
