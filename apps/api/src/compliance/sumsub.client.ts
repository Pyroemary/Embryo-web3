import { Injectable } from "@nestjs/common";
import { config } from "../config";
import { hmacHex } from "../common/hmac";

/** Minimal Sumsub API client (request signing per Sumsub "App Tokens" auth). */
@Injectable()
export class SumsubClient {
  private readonly base = "https://api.sumsub.com";

  async sdkAccessToken(externalUserId: string): Promise<{ token: string; userId: string }> {
    const cfg = config();
    const path = "/resources/accessTokens/sdk";
    const body = JSON.stringify({ userId: externalUserId, levelName: cfg.SUMSUB_LEVEL_NAME, ttlInSecs: 1200 });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = hmacHex("sha256", cfg.SUMSUB_SECRET_KEY, ts + "POST" + path + body);
    const res = await fetch(this.base + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Token": cfg.SUMSUB_APP_TOKEN,
        "X-App-Access-Ts": ts,
        "X-App-Access-Sig": sig,
      },
      body,
    });
    if (!res.ok) throw new Error(`Sumsub token error ${res.status}`);
    return (await res.json()) as { token: string; userId: string };
  }
}
