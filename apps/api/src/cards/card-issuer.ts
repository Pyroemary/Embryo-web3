import { randomBytes } from "node:crypto";
import { config } from "../config";
import { verifyHmac } from "../common/hmac";

export const CARD_ISSUER = Symbol("CARD_ISSUER");

export interface IssuedCard {
  issuerCardId: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

/** Issuer-agnostic card transaction event (what the round-up engine consumes). */
export interface CardEvent {
  eventId: string;
  issuerCardId: string;
  issuerTxId: string;
  amountMinor: bigint;
  currency: string;
  merchantName: string;
  mcc?: string;
  status: "PENDING" | "SETTLED" | "REVERSED" | "DECLINED";
  occurredAt: Date;
}

export interface CardIssuer {
  readonly name: string;
  issueVirtualCard(input: { userId: string; walletAddress: string; design: string }): Promise<IssuedCard>;
  setFrozen(issuerCardId: string, frozen: boolean): Promise<void>;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook(body: unknown): CardEvent | null;
}

interface NormalizedPayload {
  eventId: string;
  cardId: string;
  transactionId: string;
  amountMinor: string | number;
  currency: string;
  merchantName: string;
  mcc?: string;
  status: CardEvent["status"];
  occurredAt: string;
}

function fromNormalized(p: NormalizedPayload): CardEvent {
  return {
    eventId: p.eventId,
    issuerCardId: p.cardId,
    issuerTxId: p.transactionId,
    amountMinor: BigInt(p.amountMinor),
    currency: p.currency.toUpperCase(),
    merchantName: p.merchantName,
    mcc: p.mcc,
    status: p.status,
    occurredAt: new Date(p.occurredAt),
  };
}

/** Sandbox issuer for development and tests. Webhooks are HMAC-SHA256 over the raw body. */
export class MockCardIssuer implements CardIssuer {
  readonly name = "mock";

  async issueVirtualCard(): Promise<IssuedCard> {
    const last4 = (1000 + (randomBytes(2).readUInt16BE() % 9000)).toString();
    const now = new Date();
    return { issuerCardId: `mock_${randomBytes(8).toString("hex")}`, last4, expMonth: now.getMonth() + 1, expYear: now.getFullYear() + 4 };
  }

  async setFrozen(): Promise<void> {}

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    return verifyHmac("sha256", config().RAIN_WEBHOOK_SECRET, rawBody, headers["x-signature"] as string | undefined);
  }

  parseWebhook(body: unknown): CardEvent | null {
    return fromNormalized(body as NormalizedPayload);
  }
}

/**
 * Rain (stablecoin-funded Visa) adapter.
 *
 * IMPORTANT: endpoint paths, payload fields and the signature header below are placeholders
 * modelled on a typical issuing API. Verify every one against Rain's API reference when the
 * sandbox account is provisioned, then add contract tests with recorded sandbox payloads.
 */
export const RAIN_PATHS = {
  issueCard: (userId: string) => `/v1/issuing/users/${userId}/cards`,
  updateCard: (cardId: string) => `/v1/issuing/cards/${cardId}`,
  signatureHeader: "x-rain-signature",
};

export class RainCardIssuer implements CardIssuer {
  readonly name = "rain";

  private async call(method: string, path: string, body?: unknown) {
    const cfg = config();
    const res = await fetch(cfg.RAIN_API_URL + path, {
      method,
      headers: { "Content-Type": "application/json", "Api-Key": cfg.RAIN_API_KEY },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Rain ${method} ${path} failed: ${res.status}`);
    return res.json() as Promise<Record<string, unknown>>;
  }

  async issueVirtualCard(input: { userId: string; walletAddress: string; design: string }): Promise<IssuedCard> {
    const r = await this.call("POST", RAIN_PATHS.issueCard(input.userId), { type: "virtual", status: "active" });
    return {
      issuerCardId: String(r.id),
      last4: String(r.last4),
      expMonth: Number(r.expirationMonth),
      expYear: Number(r.expirationYear),
    };
  }

  async setFrozen(issuerCardId: string, frozen: boolean): Promise<void> {
    await this.call("PATCH", RAIN_PATHS.updateCard(issuerCardId), { status: frozen ? "locked" : "active" });
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    return verifyHmac("sha256", config().RAIN_WEBHOOK_SECRET, rawBody, headers[RAIN_PATHS.signatureHeader] as string | undefined);
  }

  parseWebhook(body: unknown): CardEvent | null {
    const b = body as { id?: string; resource?: string; body?: Record<string, unknown> };
    if (b.resource !== "transaction" || !b.body) return null;
    const t = b.body as Record<string, unknown> & { merchant?: Record<string, string> };
    const statusMap: Record<string, CardEvent["status"]> = {
      pending: "PENDING", completed: "SETTLED", reversed: "REVERSED", declined: "DECLINED",
    };
    return {
      eventId: String(b.id),
      issuerCardId: String(t.cardId),
      issuerTxId: String(t.id),
      amountMinor: BigInt(String(t.localAmount ?? t.amount)),
      currency: String(t.localCurrency ?? t.currency ?? "USD").toUpperCase(),
      merchantName: t.merchant?.name ?? "Unknown",
      mcc: t.merchant?.category,
      status: statusMap[String(t.status)] ?? "PENDING",
      occurredAt: new Date(String(t.authorizedAt ?? t.createdAt ?? Date.now())),
    };
  }
}
