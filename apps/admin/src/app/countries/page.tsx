import { revalidatePath } from "next/cache";
import { api, when } from "../../lib/api";

interface P { countryCode: string; onboarding: boolean; card: boolean; vault: boolean; trading: boolean; note: string | null; updatedAt: string }

export const dynamic = "force-dynamic";
const FLAGS = ["onboarding", "card", "vault", "trading"] as const;

async function save(form: FormData) {
  "use server";
  const code = String(form.get("countryCode")).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) throw new Error("Country code must be 2 letters");
  const body = Object.fromEntries(FLAGS.map((f) => [f, form.get(f) === "on"]));
  await api(`/admin/country-policies/${code}`, { method: "PUT", body: JSON.stringify({ ...body, note: String(form.get("note") ?? "") || undefined }) });
  revalidatePath("/countries");
}

export default async function Countries() {
  const rows = await api<P[]>("/admin/country-policies");
  return (
    <>
      <h1>Country policy</h1>
      <p>Built-in rules: sanctioned (CU, IR, KP, SY, RU, BY) are always blocked; US and CN closed; EG has no card or vault. Overrides below take precedence for non-sanctioned countries. Every change is written to the audit log.</p>
      <form action={save} className="inline" style={{ margin: "16px 0" }}>
        <input type="text" name="countryCode" placeholder="ISO code, e.g. PK" maxLength={2} required style={{ width: 120 }} />
        {FLAGS.map((f) => <label key={f}><input type="checkbox" name={f} defaultChecked /> {f}</label>)}
        <input type="text" name="note" placeholder="Reason shown to users" style={{ minWidth: 240 }} />
        <button>Save override</button>
      </form>
      <table>
        <thead><tr><th>Country</th>{FLAGS.map((f) => <th key={f}>{f}</th>)}<th>Note</th><th>Updated</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.countryCode}>
              <td><strong>{r.countryCode}</strong></td>
              {FLAGS.map((f) => <td key={f}><span className={`pill ${r[f] ? "good" : "bad"}`}>{r[f] ? "on" : "off"}</span></td>)}
              <td>{r.note ?? ""}</td>
              <td>{when(r.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
