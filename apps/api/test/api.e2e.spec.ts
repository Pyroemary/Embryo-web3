import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { createHmac } from "node:crypto";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma.service";
import { LedgerService } from "../src/ledger/ledger.service";
import { ChainService } from "../src/chain/chain.service";

const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
let walletSeq = 0;
/** Unique, valid 20-byte address per call (tests never collide across runs, so no DB wipes needed). */
const wallet = () => "0x" + Buffer.from(`${RUN}:${++walletSeq}`).toString("hex").padEnd(40, "0").slice(0, 40);
const ADMIN = { "x-admin-key": process.env.ADMIN_API_KEY! };
const auth = (sub: string) => ({ Authorization: `Dev ${sub}:${RUN}` });
const sign = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("hex");

describe("Embryo API (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  function sumsub(body: object) {
    const raw = JSON.stringify(body);
    return http
      .post("/webhooks/sumsub")
      .set("Content-Type", "application/json")
      .set("x-payload-digest", sign("sumsub-secret", raw))
      .set("x-payload-digest-alg", "HMAC_SHA256_HEX")
      .send(raw);
  }

  function cardEvent(body: object) {
    const raw = JSON.stringify(body);
    return http
      .post("/webhooks/card")
      .set("Content-Type", "application/json")
      .set("x-signature", sign("card-secret", raw))
      .send(raw);
  }

  /** Onboard a user all the way to an issued card. */
  async function onboard(sub: string, wallet: string, country = "AE") {
    await http.patch("/me").set(auth(sub)).send({ dateOfBirth: "1994-08-01", countryCode: country, walletAddress: wallet }).expect(200);
    const me = (await http.get("/me").set(auth(sub)).expect(200)).body;
    await sumsub({
      type: "applicantReviewed", applicantId: `app-${sub}-${RUN}`, externalUserId: me.id, correlationId: `c-${sub}-${RUN}`,
      reviewResult: { reviewAnswer: "GREEN" },
    }).expect(200);
    const card = (await http.post("/cards").set(auth(sub)).expect(201)).body;
    return { me, card };
  }

  it("GET /health", async () => {
    await http.get("/health").expect(200, { status: "ok", service: "embryo-api" });
  });

  it("rejects unauthenticated requests", async () => {
    await http.get("/me").expect(401);
    await http.get("/me").set("Authorization", "Bearer garbage").expect(401);
  });

  describe("onboarding & compliance", () => {
    it("derives zodiac from DOB and returns eligibility", async () => {
      await http.patch("/me").set(auth("did:privy:leo")).send({ dateOfBirth: "1990-08-01", countryCode: "ae", locale: "ar" }).expect(200);
      const me = (await http.get("/me").set(auth("did:privy:leo")).expect(200)).body;
      expect(me.zodiacSign).toBe("leo");
      expect(me.zodiac.nameAr).toBe("الأسد");
      expect(me.eligibility).toMatchObject({ countryCode: "AE", onboarding: true, card: true, vault: true });
    });

    it("rejects minors and bad input", async () => {
      await http.patch("/me").set(auth("did:privy:kid")).send({ dateOfBirth: "2015-01-01" }).expect(400);
      await http.patch("/me").set(auth("did:privy:kid")).send({ walletAddress: "0xnope" }).expect(400);
    });

    it("blocks sanctioned and restricted countries", async () => {
      await http.patch("/me").set(auth("did:privy:ir")).send({ countryCode: "IR" }).expect(200);
      expect((await http.get("/me/eligibility").set(auth("did:privy:ir"))).body).toMatchObject({ onboarding: false });
      await http.patch("/me").set(auth("did:privy:us")).send({ countryCode: "US" }).expect(200);
      expect((await http.get("/me/eligibility").set(auth("did:privy:us"))).body).toMatchObject({ onboarding: false, card: false });
      await http.patch("/me").set(auth("did:privy:eg")).send({ countryCode: "EG" }).expect(200);
      expect((await http.get("/me/eligibility").set(auth("did:privy:eg"))).body).toMatchObject({ onboarding: true, card: false, vault: false });
      await http.post("/kyc/token").set(auth("did:privy:ir")).expect(403);
    });

    it("rejects Sumsub webhooks with a bad signature", async () => {
      await http
        .post("/webhooks/sumsub")
        .set("Content-Type", "application/json")
        .set("x-payload-digest", "deadbeef")
        .send(JSON.stringify({ type: "applicantReviewed" }))
        .expect(401);
    });

    it("approves KYC via webhook and syncs the on-chain gate; duplicates are ignored", async () => {
      const sub = "did:privy:kyc";
      await http.patch("/me").set(auth(sub)).send({ countryCode: "SA", walletAddress: wallet() }).expect(200);
      const me = (await http.get("/me").set(auth(sub))).body;
      const payload = { type: "applicantReviewed", applicantId: `app1-${RUN}`, externalUserId: me.id, correlationId: `corr-1-${RUN}`, reviewResult: { reviewAnswer: "GREEN" } };
      await sumsub(payload).expect(200);
      const dup = await sumsub(payload).expect(200);
      expect(dup.body.duplicate).toBe(true);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
      expect(user.kycStatus).toBe("APPROVED");
      expect(user.gateSynced).toBe(true);
    });
  });

  describe("cards", () => {
    it("requires KYC before issuing a card", async () => {
      await http.patch("/me").set(auth("did:privy:nokyc")).send({ countryCode: "AE" }).expect(200);
      await http.post("/cards").set(auth("did:privy:nokyc")).expect(403);
    });

    it("issues one zodiac card per user and can freeze it", async () => {
      const { card } = await onboard("did:privy:card", wallet());
      expect(card.design).toBe("leo-free");
      expect(card.last4).toMatch(/^\d{4}$/);
      const again = (await http.post("/cards").set(auth("did:privy:card")).expect(201)).body;
      expect(again.id).toBe(card.id);
      const frozen = (await http.post(`/cards/${card.id}/freeze`).set(auth("did:privy:card")).expect(201)).body;
      expect(frozen.status).toBe("FROZEN");
      await http.post(`/cards/${card.id}/freeze`).set(auth("did:privy:other")).expect(404);
    });
  });

  describe("round-ups", () => {
    it("validates settings against the card tier", async () => {
      const sub = "did:privy:settings";
      await http.put("/roundups/settings").set(auth(sub)).send({ multiplier: 3 }).expect(400); // free tier max x2
      const ok = (await http.put("/roundups/settings").set(auth(sub)).send({ multiplier: 2, percentBps: 500, dailyCapMicro: "20000000" }).expect(200)).body;
      expect(ok).toMatchObject({ multiplier: 2, percentBps: 500, dailyCapMicro: "20000000" });
      await http.put("/roundups/settings").set(auth(sub)).send({ bogus: 1 }).expect(400);
      await http.put("/roundups/settings").set(auth(sub)).send({ recurringMicro: "1000000" }).expect(400);
    });

    it("card webhook → round-up → reversal, idempotently", async () => {
      const sub = "did:privy:coffee";
      const { me, card } = await onboard(sub, wallet());
      await prisma.user.update({ where: { id: me.id }, data: { tier: "PLUS" } });
      await http.put("/roundups/settings").set(auth(sub)).send({ multiplier: 3 }).expect(200);

      const coffee = {
        eventId: `evt-1-${RUN}`, cardId: card.issuerCardId, transactionId: `tx-1-${RUN}`, amountMinor: 2450, currency: "AED",
        merchantName: "Attibassi Coffee", mcc: "5814", status: "SETTLED", occurredAt: new Date().toISOString(),
      };
      await cardEvent(coffee).expect(200);
      expect((await cardEvent(coffee).expect(200)).body.duplicate).toBe(true);

      let entries = (await http.get("/roundups").set(auth(sub)).expect(200)).body;
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ amountMicro: "408441", localMinor: "150", localCurrency: "AED", status: "PENDING" });
      expect(entries[0].transaction.merchantName).toBe("Attibassi Coffee");

      // ATM withdrawal is never rounded up
      await cardEvent({ ...coffee, eventId: `evt-atm-${RUN}`, transactionId: `tx-atm-${RUN}`, mcc: "6011", merchantName: "ATM" }).expect(200);
      // refund
      await cardEvent({ ...coffee, eventId: `evt-2-${RUN}`, status: "REVERSED" }).expect(200);
      entries = (await http.get("/roundups").set(auth(sub)).expect(200)).body;
      expect(entries).toHaveLength(1);
      expect(entries[0].status).toBe("REVERSED");
      expect((await http.get("/roundups/summary").set(auth(sub))).body.pendingMicro).toBe("0");
    });

    it("rejects card webhooks with a bad signature", async () => {
      await http.post("/webhooks/card").set("Content-Type", "application/json").set("x-signature", "00").send("{}").expect(401);
    });

    it("settles pending round-ups on-chain in a batch and keeps the ledger balanced", async () => {
      const sub = "did:privy:saver";
      const { me, card } = await onboard(sub, wallet());
      await http.put("/roundups/settings").set(auth(sub)).send({ spareChangeStep: null, percentBps: 1000 }).expect(200);
      // $40 purchase at 10% -> $4: below the $5 threshold, so not due yet
      await cardEvent({
        eventId: `s-1-${RUN}`, cardId: card.issuerCardId, transactionId: `s-tx-1-${RUN}`, amountMinor: 4000, currency: "USD",
        merchantName: "Carrefour", status: "SETTLED", occurredAt: new Date().toISOString(),
      }).expect(200);
      await http.post("/admin/settlement/run").set(ADMIN).expect(201);
      let entries = (await http.get("/roundups").set(auth(sub))).body;
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ status: "PENDING", amountMicro: "4000000" });

      await http.post("/roundups/one-time").set(auth(sub)).send({ amountMicro: "2000000" }).expect(201);
      const report = (await http.post("/admin/settlement/run").set(ADMIN).expect(201)).body;
      expect(report.invested).toBeGreaterThanOrEqual(1);
      expect(report.failed).toBe(0);

      entries = (await http.get("/roundups").set(auth(sub))).body;
      expect(entries.map((e: { status: string }) => e.status)).toEqual(["INVESTED", "INVESTED"]);
      const batch = await prisma.settlementBatch.findUniqueOrThrow({ where: { id: entries[0].batchId } });
      expect(batch.status).toBe("confirmed");
      expect(batch.txHash).toMatch(/^0x/);

      const summary = (await http.get("/roundups/summary").set(auth(sub))).body;
      expect(summary).toMatchObject({ pendingMicro: "0", investedPrincipalMicro: "6000000" });
      expect(me.id).toBeTruthy();

      const metrics = (await http.get("/admin/metrics").set(ADMIN).expect(200)).body;
      expect(metrics.ledgerBalanced).toBe(true);
      expect(await app.get(LedgerService).trialBalance()).toBe(0n);
    });

    it("returns failed on-chain deposits to PENDING for retry", async () => {
      const sub = "did:privy:revoked";
      const { me } = await onboard(sub, wallet());
      await http.post("/roundups/one-time").set(auth(sub)).send({ amountMicro: "7000000" }).expect(201);
      const target = (await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).walletAddress!.toLowerCase();
      const chain = app.get(ChainService);
      const spy = jest.spyOn(chain, "batchDeposit").mockImplementation(async (users) => ({
        txHash: "0xabc",
        invested: users.filter((u) => u.toLowerCase() !== target),
        failed: users.filter((u) => u.toLowerCase() === target),
      }));
      const report = (await http.post("/admin/settlement/run").set(ADMIN).expect(201)).body;
      spy.mockRestore();
      expect(report.failed).toBe(1);
      const entries = (await http.get("/roundups").set(auth(sub))).body;
      expect(entries[0]).toMatchObject({ status: "PENDING", batchId: null });
      // park it so later runs of this suite don't keep retrying a test user
      await prisma.roundUpEntry.updateMany({ where: { userId: me.id }, data: { status: "FAILED" } });
    });

    it("creates recurring deposits when due", async () => {
      const sub = "did:privy:recurring";
      const { me } = await onboard(sub, wallet());
      await http.put("/roundups/settings").set(auth(sub)).send({ recurringMicro: "500000000", recurringFreq: "daily" }).expect(200);
      const { RoundUpsService } = await import("../src/roundups/roundups.service");
      const svc = app.get(RoundUpsService);
      const tomorrow = new Date(Date.now() + 25 * 3600 * 1000);
      expect(await svc.runRecurring(tomorrow)).toBeGreaterThanOrEqual(1);
      await svc.runRecurring(tomorrow); // already advanced → no duplicate
      const entries = await prisma.roundUpEntry.findMany({ where: { userId: me.id, source: "recurring" } });
      expect(entries).toHaveLength(1);
      expect(entries[0].amountMicro).toBe(500_000_000n);
    });
  });

  describe("admin", () => {
    it("requires the admin key", async () => {
      await http.get("/admin/metrics").expect(401);
      await http.get("/admin/metrics").set("x-admin-key", "wrong").expect(401);
    });

    it("overrides country policy per market from the console", async () => {
      await http.put("/admin/country-policies/pk").set(ADMIN).send({ onboarding: true, card: false, vault: true, trading: false, note: "Card not live in PK yet" }).expect(200);
      await http.patch("/me").set(auth("did:privy:pk")).send({ countryCode: "PK" }).expect(200);
      expect((await http.get("/me/eligibility").set(auth("did:privy:pk"))).body).toMatchObject({ card: false, vault: true, reason: "Card not live in PK yet" });
      const audit = (await http.get("/admin/audit").set(ADMIN)).body;
      expect(audit.some((a: { action: string }) => a.action === "country.policy")).toBe(true);
    });
  });
});
