import "server-only";

const BASE = process.env.EMBRYO_API_URL ?? "http://localhost:4000";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", "x-admin-key": process.env.ADMIN_API_KEY ?? "", ...init.headers },
  });
  if (!res.ok) throw new Error(`API ${init.method ?? "GET"} ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const usd = (micro: string | number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(micro) / 1e6);

export const when = (iso: string) => new Date(iso).toISOString().replace("T", " ").slice(0, 16);
