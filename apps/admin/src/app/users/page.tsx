import { revalidatePath } from "next/cache";
import { api, when } from "../../lib/api";

interface U { id: string; email: string | null; countryCode: string | null; kycStatus: string; tier: string; walletAddress: string | null; zodiacSign: string | null; track: string; createdAt: string; cards: { last4: string; status: string }[] }

export const dynamic = "force-dynamic";

async function setTier(form: FormData) {
  "use server";
  await api(`/admin/users/${form.get("id")}/tier`, { method: "PUT", body: JSON.stringify({ tier: form.get("tier") }) });
  revalidatePath("/users");
}

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string; kyc?: string }> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const users = await api<U[]>(`/admin/users${qs ? `?${qs}` : ""}`);
  return (
    <>
      <div className="toolbar">
        <h1>Users &amp; KYC</h1>
        <form className="inline">
          <input type="text" name="q" placeholder="id, email or wallet" defaultValue={sp.q} />
          <select name="kyc" defaultValue={sp.kyc ?? ""}>
            <option value="">All KYC</option>
            {["NOT_STARTED", "PENDING", "APPROVED", "REJECTED", "BLOCKED"].map((s) => <option key={s}>{s}</option>)}
          </select>
          <button>Filter</button>
        </form>
      </div>
      <table>
        <thead><tr><th>User</th><th>Country</th><th>KYC</th><th>Sign</th><th>Track</th><th>Card</th><th>Wallet</th><th>Joined</th><th>Tier</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><code>{u.id.slice(0, 10)}</code><br /><small>{u.email ?? ""}</small></td>
              <td>{u.countryCode ?? "-"}</td>
              <td><span className={`pill ${u.kycStatus === "APPROVED" ? "good" : ["REJECTED", "BLOCKED"].includes(u.kycStatus) ? "bad" : ""}`}>{u.kycStatus}</span></td>
              <td>{u.zodiacSign ?? "-"}</td>
              <td>{u.track}</td>
              <td>{u.cards[0] ? `•••• ${u.cards[0].last4} (${u.cards[0].status})` : "-"}</td>
              <td><code>{u.walletAddress ? `${u.walletAddress.slice(0, 6)}…${u.walletAddress.slice(-4)}` : "-"}</code></td>
              <td>{when(u.createdAt)}</td>
              <td>
                <form action={setTier} className="inline" key={`${u.id}-${u.tier}`}>
                  <input type="hidden" name="id" value={u.id} />
                  <select name="tier" defaultValue={u.tier}>{["FREE", "PLUS", "ELITE"].map((t) => <option key={t}>{t}</option>)}</select>
                  <button>Set</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
