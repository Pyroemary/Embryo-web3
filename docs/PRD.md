# Embryo — Production Product & Technical Spec (v1)

> *Your wealth conceived.* Automated round-up investing on stablecoin rails, with a
> personalized virtual zodiac card, built on Base.

Status: **Draft v1** · Source: founder interview + `Embryo-Main-V2` deck

---

## 1. Decision record (from founder interview)

| # | Topic | Decision |
|---|-------|----------|
| 1 | Card form factor | **Virtual card first** (Apple Pay / Google Pay). Physical card is a later add-on through the same issuer API. |
| 2 | Geography | **Global, minus restricted countries.** Exclude OFAC/UN/EU sanctioned countries, the US, mainland China and Egypt (crypto features). Features are switched on per country according to partner coverage. Commercial/brand focus: MENA + expats. |
| 3 | Web3 scope | Stablecoin rails · on-chain round-up vault · crypto buy/sell/spend |
| 4 | v1 features | **Round-up investing** + **virtual zodiac card**. BNPL, lending and SME products move to later phases. |
| 5 | Platforms | iOS + Android (Expo / React Native) and an internal admin/compliance web console |
| 6 | Chain | **Base** (Ethereum L2) |
| 7 | Custody | **Embedded MPC smart wallets** (Privy / Turnkey class): non-custodial, no seed phrase, sponsored gas |
| 8 | Card issuer | **Rain** (stablecoin-funded Visa, virtual cards, tokenization) |
| 9 | Investment destination | **Embryo on-chain ERC-4626 vaults**. Sarwa is no longer needed for v1. |
| 10 | Licensing | **None yet; partner-led.** Design for a later VARA / ADGM application. |
| 11 | Sharia | **Both**: a conventional vault and an opt-in Sharia-screened vault |
| 12 | On/off-ramp | Bank transfer · debit card top-up · external crypto deposit |
| 13 | Round-up modes | Spare change to 1/5/10 · % of transaction · multiplier (x2, x3…) · recurring deposits |
| 14 | Card tiers | **Free / Plus (~$4/mo) / Elite (~$13/mo)**, each with 12 zodiac designs |
| 15 | Crypto trading | **Partner swap/brokerage + DEX aggregation** inside the user's own wallet; 1–2% spread |
| 16 | KYC | **Sumsub** (global: 220+ countries) + UAE Pass as an optional fast path |
| 17 | Base currency | **USD (USDC)** balances; local currency shown via live FX |
| 18 | Languages | Arabic + English, full RTL |
| 19 | Vault assets | Tokenized T-bills/MMF · tokenized sukuk · blue-chip crypto basket · Aave/Morpho USDC |
| 20 | Fees | 1%/yr management fee · performance fee (HWM) · interchange share · tier subscriptions · swap spread |
| 21 | Admin keys | **Safe multisig (3-of-5) + 48h timelock**, plus a pause guardian (2-of-3) |
| 22 | Backend | **TypeScript: NestJS + Postgres (Prisma) + Redis/BullMQ + viem** |
| 23 | Delivery | Built mostly by Claude, ASAP; founder owns partner contracts, legal and audit |

---

## 2. Product scope

### 2.1 v1 user journeys
1. **Onboard**: phone/email sign-in → embedded wallet created silently → choose zodiac sign (or derive it from date of birth) → Sumsub KYC (+ UAE Pass) → country eligibility check.
2. **Fund**: bank transfer / debit card via the on-ramp partner → USDC in the user's smart wallet; or deposit USDC on Base directly.
3. **Get card**: Rain virtual Visa issued instantly → zodiac card art for the user's tier → push-provision to Apple Pay / Google Pay.
4. **Spend & round up**: card purchase → Rain webhook → round-up computed under the user's rules → queued → batched into the vault.
5. **Invest**: choose a profile (Conservative / Balanced / Aggressive) and a track (Conventional / Sharia) → watch the portfolio grow (the "Invested AED 5,000 · +240%" screen).
6. **Withdraw**: redeem vault shares → USDC → off-ramp to bank, or keep spending on the card.
7. **Trade crypto**: buy/sell BTC/ETH (cbBTC, WETH on Base) through the aggregator, with the spread shown upfront.
8. **Upgrade tier**: Plus/Elite subscription (paid from the USDC balance or app-store billing for cosmetic perks only).

### 2.2 Round-up engine rules
- Input: the settled card transaction (amount, currency, merchant, MCC).
- Modes (can be combined; the user sets a daily/monthly cap):
  - `SPARE_CHANGE`: `ceil(amount / step) * step - amount`, with step ∈ {1, 5, 10} in the **transaction currency**, converted to USD.
  - `PERCENT`: `amount * pct` (e.g. 5%, 10%).
  - `MULTIPLIER`: applied to the spare change (x1–x10).
  - `RECURRING`: a fixed amount daily, weekly or monthly.
- Round-ups accrue in an off-chain **pending ledger** and settle on-chain once a user threshold is met (default $5) or every 24h, so gas stays negligible.
- Refunds/chargebacks reverse the pending round-up; a round-up that has already been invested is not unwound.
- If the balance is too low for a round-up, skip it and notify the user. Never overdraw.

### 2.3 Zodiac card tiers

| | Free | Plus | Elite |
|---|---|---|---|
| Price | $0 | ~$4/mo | ~$13/mo |
| Card art | Static zodiac | Animated zodiac + element theme | Premium metal-look + monthly constellation drops |
| Round-up multiplier | x1–x2 | up to x5 | up to x10 |
| FX markup | 1.5% | 0.75% | 0% |
| Vault mgmt fee | 1.0% | 0.75% | 0.5% |
| Cashback into vault | — | 0.5% | 1% |
| Swap spread | 2% | 1.5% | 1% |

*(The pricing numbers are placeholders to validate against Rain's economics.)*

### 2.4 Out of scope for v1 (roadmap)
BNPL (later as Murabaha for the Sharia track) · P2P/high-return lending · SME accounts ·
physical card · Embryo Fund for institutions · Egypt fiat product via Nexta · own exchange.

---

## 3. Architecture

```
┌──────────────┐   ┌──────────────────┐
│ Mobile (Expo)│   │ Admin (Next.js)  │
└──────┬───────┘   └────────┬─────────┘
       │ HTTPS/JWT          │ SSO + RBAC
┌──────▼────────────────────▼──────────────────────────────┐
│ API (NestJS)                                              │
│  auth · users · kyc · cards · roundups · vault · trade ·  │
│  subscriptions · ledger · compliance · notifications      │
└──┬──────────┬──────────┬───────────┬───────────┬──────────┘
   │Postgres  │Redis/    │ viem      │ Webhooks  │ Partner APIs
   │(ledger)  │BullMQ    │ (Base RPC)│ (signed)  │
   │          │jobs      │           │           │ Rain · Privy/Turnkey · Sumsub
   │          │          │           │           │ On-ramp · 0x/1inch · FX · Chainalysis
              ┌──────────▼───────────┐
              │ Base: Embryo Vaults  │  ERC-4626 ×2 (Conventional, Sharia)
              │ + Strategy adapters  │  Safe multisig + Timelock + Guardian
              └──────────────────────┘
```

### 3.1 Monorepo layout (Turborepo + pnpm)
```
apps/
  mobile/        Expo (React Native), expo-router, i18n (ar/en, RTL)
  admin/         Next.js — compliance, users, card ops, vault ops, support
  api/           NestJS — REST + webhooks + workers
packages/
  contracts/     Foundry — vaults, strategies, fee logic, deploy scripts
  sdk/           Typed API client + contract ABIs (generated)
  ui/            Design tokens (Embryo green #1E4D45 / lime #DDF98A), shared components
  roundup/       Pure round-up calculation library (shared and heavily tested)
  config/        eslint, tsconfig, prettier
```

### 3.2 Smart contracts
- `EmbryoVault` (ERC-4626, USDC underlying, OpenZeppelin v5):
  - Multi-strategy allocation with per-strategy caps (`targetBps`, `maxBps`).
  - **Management fee**: accrued continuously by minting shares to the treasury.
  - **Performance fee**: on gains above a high-water mark of price-per-share, minted as shares.
  - Deposit/withdraw limits, an allowlist hook (KYC-gated through an on-chain attestation, e.g. Coinbase Verifications / EAS), and `Pausable`.
  - Roles: `DEFAULT_ADMIN` (Timelock), `STRATEGIST` (allocations within caps), `GUARDIAN` (pause only), `KEEPER` (harvest/rebalance).
  - Inflation-attack protection (virtual shares/decimals offset).
- Strategy adapters (`IStrategy`): `IdleUSDC`, `AaveV3USDC`, `MorphoUSDC`, `RWATBill` (whitelisted RWA token), `SukukRWA`, `BlueChipBasket` (cbBTC/WETH through a swap adapter with oracle-checked slippage).
- **Two vault deployments**:
  - Conventional: T-bill RWA, Aave/Morpho, blue-chip basket.
  - Sharia: sukuk RWA, idle USDC, blue-chip basket (spot only, no interest). Strategy allowlist approved by the Sharia board.
- Risk profiles = per-vault or per-user allocation sets (Conservative / Balanced / Aggressive). v1 implementation: **one vault per (track × profile)**, so 6 vaults from one factory, which keeps the accounting simple.
- Governance: Safe 3-of-5 → `TimelockController` (48h) → vault admin. Guardian Safe 2-of-3 can pause instantly.
- Round-up deposits from non-custodial wallets: the user grants a **scoped session key / smart-account permission** (ERC-7579-style) that lets the Embryo keeper call only `vault.deposit(USDC, user)` up to a per-day cap. The user can revoke it at any time.

### 3.3 Backend core: double-entry ledger
- Every value movement (card spend, round-up pending/settled, deposit, withdraw, fee, trade) is a balanced ledger entry in Postgres. On-chain state is the source of truth for balances; the ledger is reconciled against chain + Rain + on-ramp every hour, with discrepancy alerts.
- Idempotent webhook ingestion (signature-verified, deduplicated by provider event ID).
- Outbox pattern for chain transactions; nonce management; retries with backoff.

### 3.4 Data model (core tables)
`users`, `wallets`, `kyc_checks`, `country_policies`, `cards`, `card_transactions`,
`roundup_rules`, `roundup_entries`, `roundup_batches`, `vault_positions`,
`ledger_accounts`, `ledger_entries`, `subscriptions`, `trades`, `onramp_orders`,
`audit_log`, `admin_users`, `feature_flags`.

---

## 4. Compliance & risk (partner-led model)

- **Regulatory posture**: Embryo is a non-custodial technology interface. The card program runs under Rain's BIN sponsor; fiat conversion runs under the on-ramp's license; KYC/AML is done by Sumsub with Embryo as the controller. Before launch: **get a legal opinion per launch region**, then file for VARA or ADGM as the brand grows.
- **Geo-gating**: a `country_policies` table (feature flags for card / trade / vault / on-ramp per ISO country), checked at onboarding, by IP + document country, and again on every sensitive action.
- **AML**: Sumsub screening (sanctions/PEP/adverse media) + ongoing monitoring; Chainalysis/TRM wallet screening on external deposits; transaction-monitoring rules; Travel Rule support through a partner.
- **Sharia**: retain a Sharia supervisory board for the Sharia vault's asset allowlist and get an annual certification; keep fees in the Sharia track as a *wakala* fee model.
- **Data protection**: UAE PDPL + GDPR; PII encrypted at the column level; data residency to be decided with counsel.
- **Security**: two independent smart-contract audits + a public bug bounty before mainnet; mobile app pen-test; secrets in a KMS; SOC 2 path for the backend.

---

## 5. Delivery plan

| Phase | Output |
|---|---|
| 0. Foundations | Monorepo, CI, design tokens, round-up library + tests |
| 1. Contracts | Vault + strategies + fees + governance, Foundry tests (unit/fuzz/invariant), Base Sepolia deploy |
| 2. API | Auth, wallets, KYC, cards (Rain sandbox), round-up pipeline, ledger, webhooks |
| 3. Mobile | Onboarding, zodiac card, round-up settings, portfolio, fund/withdraw, AR/EN |
| 4. Admin | Users/KYC review, card ops, vault ops, reconciliation, feature flags |
| 5. Hardening | Audits, pen-test, load tests, monitoring, runbooks → **Base mainnet launch** |

### Founder action items (things Claude can't do)
1. Sign partner agreements and get sandbox keys: **Rain**, **Privy or Turnkey**, **Sumsub**, an on-ramp (e.g. Transak / MoonPay / a regional provider), **0x/1inch**, Chainalysis/TRM.
2. Get a legal opinion on the partner-led model for the launch countries; register the operating entity (DIFC/ADGM/RAK DAO etc.).
3. Retain a Sharia advisory board.
4. Book two smart-contract audit firms (~4–6 weeks lead time).
5. Get Apple/Google developer accounts, and Apple Pay in-app provisioning entitlement (through Rain).
6. Choose RWA token sources (T-bill and sukuk) and confirm their KYC/transfer restrictions on Base.

### Known deck inconsistencies to update
- The deck's 2025 milestones (Nexta acquisition, Egypt BNPL) are now behind schedule; the roadmap above re-sequences to a global, Web3-first v1.
- Sarwa is replaced by on-chain vaults; keep it as a possible future distribution partner.
- "High-return lending 45–60%" is EGP-denominated (high local inflation). It isn't comparable to USD returns, and it isn't Sharia-compliant in its current form.
