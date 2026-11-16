import { Injectable } from "@nestjs/common";
import { parseDecimal, FX_SCALE } from "@embryo/roundup";

/**
 * USD value of one major unit of each currency (FX_SCALE fixed-point).
 * GCC currencies are hard-pegged to USD; floating currencies come from the live provider.
 */
const PEGS: Record<string, string> = {
  USD: "1",
  AED: "0.272294", // 3.6725
  SAR: "0.266667", // 3.75
  QAR: "0.274725", // 3.64
  BHD: "2.659574", // 0.376
  OMR: "2.600780", // 0.3845
  JOD: "1.410437", // 0.709
};

export interface LiveRateSource {
  usdPerUnit(currency: string): Promise<string | null>;
}

@Injectable()
export class FxService {
  private live: LiveRateSource | null = null;
  private cache = new Map<string, { rate: bigint; at: number }>();
  private readonly ttlMs = 5 * 60 * 1000;

  setLiveSource(source: LiveRateSource) {
    this.live = source;
  }

  async usdPerUnit(currency: string): Promise<bigint> {
    const c = currency.toUpperCase();
    if (PEGS[c]) return parseDecimal(PEGS[c], 18);
    const hit = this.cache.get(c);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.rate;
    const raw = this.live ? await this.live.usdPerUnit(c) : null;
    if (!raw) throw new Error(`No FX rate for ${c}`);
    const rate = parseDecimal(raw, 18);
    if (rate <= 0n || rate > 1000n * FX_SCALE) throw new Error(`Implausible FX rate for ${c}: ${raw}`);
    this.cache.set(c, { rate, at: Date.now() });
    return rate;
  }
}
