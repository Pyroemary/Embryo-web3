import { createRemoteJWKSet, jwtVerify } from "jose";

export const TOKEN_VERIFIER = Symbol("TOKEN_VERIFIER");

export interface VerifiedToken {
  subject: string; // Privy DID, e.g. did:privy:abc
}

export interface TokenVerifier {
  verify(authorization: string | undefined): Promise<VerifiedToken | null>;
}

/** Verifies Privy access tokens (ES256 JWT, issuer "privy.io", audience = app id). */
export class PrivyTokenVerifier implements TokenVerifier {
  private readonly jwks;

  constructor(
    private readonly appId: string,
    private readonly devBypass: boolean,
  ) {
    this.jwks = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`));
  }

  async verify(authorization: string | undefined): Promise<VerifiedToken | null> {
    if (!authorization) return null;
    const [scheme, token] = authorization.split(" ");
    if (this.devBypass && scheme === "Dev" && token) {
      return { subject: token };
    }
    if (scheme !== "Bearer" || !token || !this.appId) return null;
    try {
      const { payload } = await jwtVerify(token, this.jwks, { issuer: "privy.io", audience: this.appId });
      return payload.sub ? { subject: payload.sub } : null;
    } catch {
      return null;
    }
  }
}
