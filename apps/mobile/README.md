# Embryo mobile (Expo SDK 58, iOS · Android · Web)

```bash
pnpm --filter @embryo/roundup build   # shared engine used by the app
pnpm --filter @embryo/mobile start     # Expo dev server (i = iOS, a = Android, w = web)
pnpm --filter @embryo/mobile build:web # static web export → dist/ (used as the clickable prototype)
```

**Demo mode (default):** with no `EXPO_PUBLIC_API_URL`, the app runs fully offline against
`DemoBackend`, which uses the real `@embryo/roundup` engine. "＋ Try a purchase" simulates card spend.

**Against the API:** `EXPO_PUBLIC_API_URL=http://localhost:4000 EXPO_PUBLIC_DEV_TOKEN="Dev did:privy:me"`
(the API must run with `AUTH_DEV_BYPASS=true`, development only).

### Production integration points (need partner credentials)
| Concern | Where | What to add |
|---|---|---|
| Auth + embedded wallet | `src/lib/session.tsx` (`createBackend`) | `@privy-io/expo`: `getAccessToken()` as bearer token; link the embedded wallet via `PATCH /me` |
| KYC | `startKyc()` in `session.tsx` | `@sumsub/react-native-mobilesdk-module` launched with the token from `POST /kyc/token` |
| Add to Apple/Google Wallet | `src/app/onboarding/card.tsx` | Rain push-provisioning (PassKit / Google Push Provisioning) |
| Vault approvals | new screen | one-time USDC `approve(RoundUpRouter)` + `optIn(vault, dailyCap)` signed by the embedded wallet (gas sponsored) |

Native modules (Privy, Sumsub) require a development build: `npx eas-cli@latest build --profile development`.
