# Production checklist (v1 → Base mainnet)

Legend: ✅ done in repo · 🔧 engineering left · 🤝 founder / partner action

## Smart contracts
- ✅ ERC-4626 vaults with inflation-attack offset, mgmt + HWM performance fees, deposit caps, KYC gate on deposits *and* share transfers
- ✅ Withdrawals never pausable; liquidity-aware `maxWithdraw`; guardian emergency de-allocation
- ✅ Oracle-bounded swaps (staleness + slippage) for the BTC/ETH legs
- ✅ RoundUpRouter: per-user on-chain daily cap, opt-in/opt-out, batch failure isolation
- ✅ Governance deploy: Safe → 48h Timelock → admin; deployer renounces (`HANDOVER=true`)
- 🔧 Fuzz/invariant tests (Foundry or Echidna) for share-price monotonicity & fee bounds
- 🔧 Choose and wire real yield sources per vault: Morpho USDC vault, RWA T-bill wrapper, sukuk wrapper, cbBTC/WETH feeds (Chainlink on Base)
- 🔧 Base Sepolia deployment + verification; keeper relayer (OZ Defender / Gelato) instead of raw key
- 🤝 Two independent audits + public bug bounty (Immunefi) before mainnet
- 🤝 Sharia board approval of the Sharia vaults' strategy allowlist and fee structure (wakala)

## Backend
- ✅ Signed + idempotent webhooks (Sumsub, card issuer), double-entry ledger with global trial balance
- ✅ Settlement batching with advisory lock, partial-failure retry, recurring deposits
- ✅ Fail-fast production config guard (no dev auth, no dry-run chain, required secrets)
- 🔧 Verify Rain adapter paths/fields/signature header against Rain's API reference (marked in `card-issuer.ts`)
- 🔧 Verify the user's wallet address server-side via Privy before linking
- 🔧 Hourly reconciliation job: ledger vs on-chain vault shares vs Rain balances, with alerting
- 🔧 Retry ceiling for repeatedly failing round-ups (+ user notification)
- 🔧 Live FX source for floating currencies (EUR, GBP, EGP…); GCC pegs are built in
- 🔧 Observability: OpenTelemetry traces, Sentry, structured logs, uptime checks; rate limiting
- 🔧 Secrets in a KMS / secret manager; column-level encryption for PII (DOB, phone)
- 🔧 Admin console SSO (Google Workspace/Okta) + RBAC + 4-eyes on country-policy changes

## Mobile
- ✅ Onboarding → KYC → invest profile → card → home/round-ups/card tiers/profile, AR/EN with RTL
- 🔧 `@privy-io/expo` login + embedded wallet; gas-sponsored `approve` + `RoundUpRouter.optIn`
- 🔧 Sumsub MobileSDK; Rain push-provisioning to Apple Pay / Google Pay
- 🔧 Withdraw flow (vault redeem → USDC → off-ramp), on-ramp top-ups (bank transfer / card)
- 🔧 Subscriptions for Plus/Elite (store billing for perks; fees from USDC balance)
- 🔧 Push notifications, biometric lock, jailbreak/root detection, certificate pinning
- 🤝 Apple/Google developer accounts; Apple Pay In-App Provisioning entitlement (via Rain)

## Compliance & legal
- ✅ Geo policy: sanctioned countries blocked; US, CN closed; EG no card/vault; per-country overrides with audit
- 🤝 Legal opinion on the partner-led (non-custodial) model per launch region; operating entity
- 🤝 Partner contracts + sandbox keys: Rain, Privy/Turnkey, Sumsub, on-ramp, Chainalysis/TRM
- 🤝 VARA / ADGM licensing roadmap; PDPL/GDPR DPIA; Travel Rule provider
- 🤝 Terms, privacy policy, risk disclosures (Arabic + English)
