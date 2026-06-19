import { useCallback, useEffect, useState } from "react";
import { getMembers, inviteMember, removeMember, type Member } from "../api";
import { initials } from "../lib/format";

export default function Team({ apiKey }: { apiKey: string }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMembers(await getMembers(apiKey));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [apiKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function invite() {
    const e = email.trim();
    if (!e) return;
    setBusy(true);
    setError(null);
    try {
      await inviteMember(apiKey, e);
      setEmail("");
      setToast(`Invited ${e} — they join when they sign in with Google.`);
      setTimeout(() => setToast(null), 3500);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: Member) {
    if (!confirm(`Remove ${m.name || m.email} from the team?`)) return;
    try {
      await removeMember(apiKey, m.id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-brand-50 border border-brand-100 rounded-2xl px-5 py-4 text-sm text-slate-600">
        Invite your teammates by email. They <span className="font-medium">sign in with Google</span> and join your
        org as <span className="font-medium">members</span> — they can triage and take feedback, but only an{" "}
        <span className="font-medium">owner</span> can change billing, the widget, settings and the team.
      </div>

      {toast && (
        <div className="text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm">{toast}</div>
      )}
      {error && (
        <div className="text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">⚠ {error}</div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-card p-5">
        <div className="font-semibold text-slate-900 mb-3">Invite a teammate</div>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && invite()}
            placeholder="teammate@yourcompany.com"
            className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
          />
          <button
            onClick={invite}
            disabled={busy}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition"
          >
            {busy ? "Inviting…" : "Invite"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-card overflow-hidden">
        <div className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
          Team ({members?.length ?? 0})
        </div>
        {!members ? (
          <div className="px-5 py-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : (
          members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-5 py-3 border-b border-slate-50 last:border-0">
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt="" className="w-9 h-9 rounded-full bg-slate-100" />
              ) : (
                <span className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xs font-semibold">
                  {initials(m.name || m.email)}
                </span>
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{m.name || m.email}</div>
                <div className="text-xs text-slate-400 truncate">{m.email}</div>
              </div>
              <span
                className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-full ring-1 ring-inset capitalize ${
                  m.role === "owner" ? "bg-brand-50 text-brand-700 ring-brand-200" : "bg-slate-100 text-slate-600 ring-slate-200"
                }`}
              >
                {m.role}
              </span>
              {!m.joined && (
                <span className="text-xs text-amber-600 bg-amber-50 ring-1 ring-inset ring-amber-200 px-2 py-1 rounded-full">invite pending</span>
              )}
              {m.role !== "owner" && (
                <button onClick={() => remove(m)} className="text-xs text-slate-400 hover:text-red-600 transition" title="Remove">
                  Remove
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
