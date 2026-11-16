import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacHex(algorithm: "sha256" | "sha512" | "sha1", secret: string, payload: Buffer | string) {
  return createHmac(algorithm, secret).update(payload).digest("hex");
}

/** Constant-time comparison of hex/ascii strings. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function verifyHmac(
  algorithm: "sha256" | "sha512" | "sha1",
  secret: string,
  payload: Buffer | string,
  signature: string | undefined,
): boolean {
  if (!secret || !signature) return false;
  return safeEqual(hmacHex(algorithm, secret, payload), signature.toLowerCase());
}
