import { revalidatePath } from "next/cache";
import { api, usd, when } from "../../lib/api";

interface B { id: string; txHash: string | null; status: string; totalMicro: string; userCount: number; error: string | null; createdAt: string }

export const dynamic = "force-dynamic";

async function run() {
  "use server";
  await api("/admin/settlement/run", { method: "POST" });
  revalidatePath("/batches");
}

export default async function Batches() {
  const batches = await api<B[]>("/admin/batches");
  return (
    <>
      <div className="toolbar">
        <h1>Settlement batches</h1>
        <form action={run}><button>Run settlement now</button></form>
      </div>
      <table>
        <thead><tr><th>Batch</th><th>Status</th><th className="num">Users</th><th className="num">Total</th><th>Tx</th><th>Created</th></tr></thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id}>
              <td><code>{b.id.slice(0, 12)}</code></td>
              <td><span className={`pill ${b.status === "confirmed" ? "good" : b.status === "failed" ? "bad" : ""}`}>{b.status}</span>{b.error ? <><br /><small>{b.error}</small></> : null}</td>
              <td className="num">{b.userCount}</td>
              <td className="num">{usd(b.totalMicro)}</td>
              <td>{b.txHash ? <a href={`https://basescan.org/tx/${b.txHash}`} target="_blank" rel="noreferrer"><code>{b.txHash.slice(0, 10)}…</code></a> : "-"}</td>
              <td>{when(b.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
