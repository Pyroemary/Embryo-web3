# Embryo: your wealth conceived

Round-up investing on stablecoin rails, with a personalized virtual zodiac card. Built on **Base**.

Every card purchase rounds up (spare change, % of spend, multipliers, recurring deposits). The spare
change moves from the user's own non-custodial wallet into ERC-4626 vaults (Conventional or
Sharia × Conservative / Balanced / Aggressive). Spend with a virtual Visa whose art follows your star sign.

See **[docs/PRD.md](docs/PRD.md)** for the product spec and decision record, and
**[docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md)** for what stands between this repo and mainnet.

## Monorepo

| Path | What | Tests |
|---|---|---|
| `packages/contracts` | Solidity: `EmbryoVault` (ERC-4626, fees, KYC gate), strategies (ERC-4626 / Aave V3 / oracle-bounded swap), `RoundUpRouter`, `AllowlistGate`, governance deploy | 37 Hardhat tests |
| `packages/roundup` | Pure TS round-up engine shared by API and app (FX, caps, MCC exclusions, settlement policy, zodiac) | 21 Vitest tests |
| `packages/ui` | Brand tokens (forest `#1E4D45`, lime `#DDF98A`, element palettes) | – |
| `apps/api` | NestJS + Prisma/Postgres: auth, geo policy, KYC, cards, round-ups, double-entry ledger, on-chain settlement, admin API | 17 e2e tests on Postgres |
| `apps/mobile` | Expo SDK 58 (iOS / Android / Web), Arabic + English (RTL), offline demo mode | typecheck + web export |
| `apps/admin` | Next.js ops & compliance console (users/KYC, tiers, settlement, country policy, audit) | build |

```
Mobile (Expo) ──HTTPS──► API (NestJS) ──► Postgres (ledger, users, cards, round-ups)
                           │  ▲
                 webhooks  │  │  Sumsub (KYC) · Rain (card txns)
                           ▼
                     viem keeper ──► Base: RoundUpRouter ─► EmbryoVault ×6 ─► strategies
                                           AllowlistGate ◄── KYC mirror
                                           Safe 3/5 → Timelock 48h → admin roles
```

## Quick start

```bash
pnpm install
docker compose up -d                          # or any Postgres 16
pnpm --filter @embryo/roundup build

# contracts
pnpm --filter @embryo/contracts test
pnpm --filter @embryo/contracts deploy:local

# API (http://localhost:4000)
cp apps/api/.env.example apps/api/.env        # set AUTH_DEV_BYPASS=true for local dev
pnpm --filter @embryo/api db:migrate
pnpm --filter @embryo/api dev
pnpm --filter @embryo/api test                # needs embryo_test DB (TEST_DATABASE_URL)

# Mobile app / clickable prototype (demo mode, no backend needed)
pnpm --filter @embryo/mobile start            # press w for web, i/a for simulators

# Admin console (http://localhost:3001)
cp apps/admin/.env.example apps/admin/.env.local
pnpm --filter @embryo/admin dev
```

> Builds are hermetic: Solidity compiles with the solc-js bundled in the `solc` npm package
> (no compiler download), and Expo installs can run with `EXPO_OFFLINE=1`.
