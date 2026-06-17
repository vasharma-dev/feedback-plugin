import { useCallback, useEffect, useState } from "react";
import { checkout, getBilling, getInvoices } from "../api";
import { fullTime } from "../lib/format";
import type { BillingResponse, Invoice, Plan } from "../types";
import { CheckIcon } from "./icons";

function money(cents: number) {
  if (cents === 0) return "$0";
  const d = cents / 100;
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`;
}

export default function Billing({ apiKey }: { apiKey: string }) {
  const [data, setData] = useState<BillingResponse | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Plan | null>(null); // plan being purchased (opens modal)

  const load = useCallback(async () => {
    try {
      const [b, inv] = await Promise.all([getBilling(apiKey), getInvoices(apiKey)]);
      setData(b);
      setInvoices(inv);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [apiKey]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
        ⚠ {error}
      </div>
    );
  }
  if (!data) return <div className="text-slate-400 py-10 text-center">Loading billing…</div>;

  const { tenant, usage, plan } = data;
  const plans = data.plans ?? [];
  const pct = usage.quota ? Math.min(100, Math.round((usage.used / usage.quota) * 100)) : 0;
  const meterColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-brand-500";

  async function switchPlan(p: Plan) {
    if (p.id === plan.id) return;
    if (p.priceCents > 0 && !tenant.card) {
      setTarget(p); // need a card → open modal
      return;
    }
    // Free downgrade, or paid with a card already on file → charge immediately.
    try {
      setData(await checkout(apiKey, p.id));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      {/* current subscription + usage */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-card p-5">
          <div className="text-sm text-slate-500">Current plan</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-bold text-slate-900">{plan.name}</span>
            <span className="text-sm text-slate-500">{money(plan.priceCents)}{plan.priceCents ? " / mo" : ""}</span>
            <span className="ml-auto text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-700 ring-1 ring-inset ring-green-200 capitalize">
              {tenant.subStatus}
            </span>
          </div>
          <div className="mt-4 text-sm text-slate-600 space-y-1">
            <div>Billing email: <span className="text-slate-800">{tenant.billingEmail || "—"}</span></div>
            <div>
              Card on file:{" "}
              {tenant.card ? (
                <span className="text-slate-800">
                  {tenant.card.brand} •••• {tenant.card.last4} (exp {tenant.card.expMonth}/{tenant.card.expYear})
                </span>
              ) : (
                <span className="text-slate-400">none</span>
              )}
            </div>
            {tenant.currentPeriodEnd && (
              <div>Renews: <span className="text-slate-800">{fullTime(tenant.currentPeriodEnd)}</span></div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-card p-5">
          <div className="text-sm text-slate-500">Usage this period</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
            {usage.used.toLocaleString()}{" "}
            <span className="text-base font-medium text-slate-400">/ {usage.quota.toLocaleString()} feedback</span>
          </div>
          <div className="mt-3 h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full rounded-full ${meterColor} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {usage.remaining.toLocaleString()} remaining · {pct}% used
            {pct >= 90 && <span className="text-red-600 font-medium"> · near limit, consider upgrading</span>}
          </div>
        </div>
      </div>

      {/* plan picker */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Plans</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {plans.map((p) => {
            const current = p.id === plan.id;
            return (
              <div
                key={p.id}
                className={`relative bg-white rounded-2xl border p-5 flex flex-col ${
                  current ? "border-brand-400 ring-2 ring-brand-100" : "border-slate-200/70"
                }`}
              >
                {p.popular && !current && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full tracking-wide">
                    POPULAR
                  </span>
                )}
                <div className="font-semibold text-slate-900">{p.name}</div>
                <div className="text-2xl font-bold mt-1">
                  {money(p.priceCents)}
                  <span className="text-sm font-medium text-slate-400">{p.priceCents ? " / mo" : ""}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1 min-h-[32px]">{p.tagline}</p>
                <ul className="mt-3 space-y-1.5 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2 text-xs text-slate-600">
                      <CheckIcon className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  disabled={current}
                  onClick={() => switchPlan(p)}
                  className={`mt-4 w-full rounded-xl py-2.5 text-sm font-semibold transition ${
                    current
                      ? "bg-slate-100 text-slate-400 cursor-default"
                      : "bg-brand-600 text-white hover:bg-brand-700"
                  }`}
                >
                  {current ? "Current plan" : p.priceCents > (plan.priceCents ?? 0) ? "Upgrade" : "Switch"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* invoices */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Billing history</h2>
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-card overflow-hidden">
          {invoices.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No charges yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Description</th>
                  <th className="px-5 py-3 font-medium">Card</th>
                  <th className="px-5 py-3 font-medium text-right">Amount</th>
                  <th className="px-5 py-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-3 text-slate-500">{fullTime(inv.createdAt)}</td>
                    <td className="px-5 py-3 text-slate-800">{inv.description}</td>
                    <td className="px-5 py-3 text-slate-500">
                      {inv.cardBrand ? `${inv.cardBrand} •••• ${inv.cardLast4}` : "—"}
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">{money(inv.amountCents)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 ring-1 ring-inset ring-green-200 capitalize">
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {target && (
        <CardModal
          plan={target}
          onClose={() => setTarget(null)}
          onPaid={async (card) => {
            const res = await checkout(apiKey, target.id, card);
            setTarget(null);
            setData(res);
            await load();
          }}
        />
      )}
    </div>
  );
}

function CardModal({
  plan,
  onClose,
  onPaid,
}: {
  plan: Plan;
  onClose: () => void;
  onPaid: (card: { number: string; expMonth: number; expYear: number; cvc: string }) => Promise<void>;
}) {
  const [number, setNumber] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pay() {
    setErr(null);
    const m = exp.replace(/\s/g, "").match(/^(\d{1,2})[/\-]?(\d{2,4})$/);
    if (!m) return setErr("Enter expiry as MM / YY.");
    let year = parseInt(m[2], 10);
    if (year < 100) year += 2000;
    setBusy(true);
    try {
      await onPaid({ number: number.replace(/\s/g, ""), expMonth: parseInt(m[1], 10), expYear: year, cvc: cvc.trim() });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  const input =
    "w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition";

  return (
    <div className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-pop w-[min(420px,94vw)] p-6 animate-fadeInUp" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Subscribe to {plan.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          {money(plan.priceCents)} / month · billed to your card.
        </p>
        {err && <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {err}</div>}
        <div className="mt-4 space-y-3">
          <input className={input} placeholder="Card number" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <input className={input} placeholder="MM / YY" inputMode="numeric" value={exp} onChange={(e) => setExp(e.target.value)} />
            <input className={input} placeholder="CVC" inputMode="numeric" value={cvc} onChange={(e) => setCvc(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Test mode — use <code className="bg-slate-100 px-1 rounded">4242 4242 4242 4242</code>, any future date & CVC.
        </p>
        <button
          disabled={busy}
          onClick={pay}
          className="mt-4 w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-xl py-3 font-semibold transition"
        >
          {busy ? "Processing…" : `Pay ${money(plan.priceCents)} & subscribe`}
        </button>
      </div>
    </div>
  );
}
