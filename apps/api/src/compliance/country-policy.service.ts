import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

export interface Eligibility {
  countryCode: string | null;
  onboarding: boolean;
  card: boolean;
  vault: boolean;
  trading: boolean;
  reason?: string;
}

/** Comprehensively sanctioned (OFAC / UN / EU) — never onboard. */
export const SANCTIONED = new Set(["CU", "IR", "KP", "SY", "RU", "BY"]);

/** Restricted for v1: licensing regimes we don't cover yet. */
export const RESTRICTED: Record<string, Partial<Omit<Eligibility, "countryCode" | "reason">> & { reason: string }> = {
  US: { onboarding: false, card: false, vault: false, trading: false, reason: "US money transmission / securities licensing not in place" },
  CN: { onboarding: false, card: false, vault: false, trading: false, reason: "Mainland China prohibits crypto services" },
  EG: { onboarding: true, card: false, vault: false, trading: false, reason: "CBE crypto restrictions; Egypt fiat product planned via Nexta" },
};

/**
 * Global-minus-restricted geo policy (PRD decision #2). Static rules first, then DB overrides
 * from the admin console (e.g. switching on card availability as Rain expands coverage).
 */
@Injectable()
export class CountryPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async eligibility(countryCode: string | null | undefined): Promise<Eligibility> {
    if (!countryCode) {
      return { countryCode: null, onboarding: false, card: false, vault: false, trading: false, reason: "Country not set" };
    }
    const cc = countryCode.toUpperCase();
    if (SANCTIONED.has(cc)) {
      return { countryCode: cc, onboarding: false, card: false, vault: false, trading: false, reason: "Sanctioned jurisdiction" };
    }
    const base: Eligibility = { countryCode: cc, onboarding: true, card: true, vault: true, trading: true };
    const restricted = RESTRICTED[cc];
    const merged: Eligibility = restricted ? { ...base, ...restricted } : base;
    const override = await this.prisma.countryPolicy.findUnique({ where: { countryCode: cc } });
    if (override) {
      Object.assign(merged, {
        onboarding: override.onboarding,
        card: override.card,
        vault: override.vault,
        trading: override.trading,
        reason: override.note ?? merged.reason,
      });
    }
    return merged;
  }
}
