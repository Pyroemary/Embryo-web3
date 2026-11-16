import { api, usd } from "../lib/api";

interface Metrics { users: number; kycApproved: number; activeCards: number; pendingMicro: string; investedMicro: string; batches: number; ledgerBalanced: boolean }

export const dynamic = "force-dynamic";

export default async function Overview() {
  const m = await api<Metrics>("/admin/metrics");
  const stats: [string, string | number][] = [
    ["Users", m.users],
    ["KYC approved", m.kycApproved],
    ["Active cards", m.activeCards],
    ["Invested via round-ups", usd(m.investedMicro)],
    ["Pending round-ups", usd(m.pendingMicro)],
    ["Settlement batches", m.batches],
  ];
  return (
    <>
      <h1>Overview</h1>
      <div className="grid">
        {stats.map(([k, v]) => (
          <div className="stat" key={k}><div className="k">{k}</div><div className="v">{v}</div></div>
        ))}
        <div className="stat">
          <div className="k">Ledger</div>
          <div className="v"><span className={`pill ${m.ledgerBalanced ? "good" : "bad"}`}>{m.ledgerBalanced ? "Balanced" : "OUT OF BALANCE"}</span></div>
        </div>
      </div>
    </>
  );
}
