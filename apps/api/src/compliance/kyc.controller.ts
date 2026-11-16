import { Body, Controller, ForbiddenException, Headers, HttpCode, Post, RawBodyRequest, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { User } from "@prisma/client";
import type { Request } from "express";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import { verifyHmac } from "../common/hmac";
import { config } from "../config";
import { PrismaService } from "../prisma.service";
import { CountryPolicyService } from "./country-policy.service";
import { GateSyncService } from "./gate-sync.service";
import { SumsubClient } from "./sumsub.client";

interface SumsubWebhook {
  type: string;
  applicantId: string;
  externalUserId: string;
  correlationId?: string;
  createdAtMs?: string;
  reviewResult?: { reviewAnswer: "GREEN" | "RED"; reviewRejectType?: "FINAL" | "RETRY"; rejectLabels?: string[] };
}

@Controller()
export class KycController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sumsub: SumsubClient,
    private readonly policy: CountryPolicyService,
    private readonly gate: GateSyncService,
  ) {}

  /** Mobile app requests a Sumsub WebSDK token to start verification. */
  @Post("kyc/token")
  @UseGuards(AuthGuard)
  async token(@CurrentUser() user: User) {
    const elig = await this.policy.eligibility(user.countryCode);
    if (!elig.onboarding) throw new ForbiddenException(elig.reason);
    const res = await this.sumsub.sdkAccessToken(user.id);
    await this.prisma.user.update({ where: { id: user.id }, data: { kycStatus: "PENDING" } });
    return { token: res.token };
  }

  /** Sumsub → Embryo. Verified with X-Payload-Digest (HMAC of the raw body). */
  @Post("webhooks/sumsub")
  @HttpCode(200)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-payload-digest") digest: string | undefined,
    @Headers("x-payload-digest-alg") alg: string | undefined,
    @Body() body: SumsubWebhook,
  ) {
    const algorithm = alg === "HMAC_SHA512_HEX" ? "sha512" : alg === "HMAC_SHA1_HEX" ? "sha1" : "sha256";
    if (!req.rawBody || !verifyHmac(algorithm, config().SUMSUB_WEBHOOK_SECRET, req.rawBody, digest)) {
      throw new UnauthorizedException("bad signature");
    }
    const eventId = body.correlationId ?? `${body.applicantId}:${body.type}:${body.createdAtMs ?? ""}`;
    const fresh = await this.recordEvent("sumsub", eventId, body);
    if (!fresh) return { ok: true, duplicate: true };

    const user = await this.prisma.user.findUnique({ where: { id: body.externalUserId } });
    if (!user) return { ok: true, ignored: "unknown user" };

    if (body.type === "applicantReviewed" && body.reviewResult) {
      const green = body.reviewResult.reviewAnswer === "GREEN";
      const final = body.reviewResult.reviewRejectType === "FINAL";
      const status = green ? "APPROVED" : final ? "REJECTED" : "PENDING";
      await this.prisma.user.update({
        where: { id: user.id },
        data: { kycStatus: status, kycApplicantId: body.applicantId, gateSynced: false },
      });
      await this.prisma.auditLog.create({
        data: { actor: "sumsub", action: `kyc.${status.toLowerCase()}`, target: user.id, data: body as object },
      });
      await this.gate.syncPending();
    }
    return { ok: true };
  }

  private async recordEvent(provider: string, eventId: string, payload: unknown): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({ data: { provider, eventId, payload: payload as object } });
      return true;
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "P2002") return false;
      throw e;
    }
  }
}
