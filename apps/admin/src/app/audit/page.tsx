import { api, when } from "../../lib/api";

interface A { id: string; actor: string; action: string; target: string | null; createdAt: string }

export const dynamic = "force-dynamic";

export default async function Audit() {
  const rows = await api<A[]>("/admin/audit");
  return (
    <>
      <h1>Audit log</h1>
      <table>
        <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}><td>{when(r.createdAt)}</td><td>{r.actor}</td><td><code>{r.action}</code></td><td><code>{r.target ?? ""}</code></td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
