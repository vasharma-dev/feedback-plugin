import { useCallback, useEffect, useState } from "react";
import { buyTokens, getBilling, getInvoices } from "../api";
import { fullTime } from "../lib/format";
import type { BillingResponse, Invoice, TokenPack } from "../types";
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
  const [buying, setBuying] = useState<TokenPack | null>(null); // pack being purchased (opens modal)
  const [toast, setToast] = useState<string | null>(null);

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

  // Handle the return from Stripe Checkout (?tokens=success|cancel|failed).
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("tokens");
    if (!status) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (status === "success") {
      setToast("Payment complete — tokens added to your balance.");
      setTimeout(() => setToast(null), 4000);
      load();
    } else if (status === "failed") {
      setError("Payment didn't complete. No tokens were added.");
    }
  }, [load]);

  if (error) {
    return (
      <div className="text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
        ⚠ {error}
      </div>
    );
  }
  if (!data) return <div className="text-slate-400 py-10 text-center">Loading billing…</div>;

  const { tenant, plan } = data;
  const packs = data.packs ?? [];
  const balance = data.tokenBalance ?? tenant.tokenBalance ?? 0;
  const low = balance < 50;
  const stripeEnabled = !!data.stripeEnabled;

  async function purchase(pack: TokenPack, card?: { number: string; expMonth: number; expYear: number; cvc: string }) {
    // Stripe mode: no card form — kick off a hosted Checkout Session and redirect to it.
    if (stripeEnabled) {
      try {
        const res = await buyTokens(apiKey, pack.id);
        if (res.mode === "redirect" && res.checkoutUrl) {
          window.location.href = res.checkoutUrl;
          return;
        }
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }

    // Simulated mode: collect a card (modal) and charge immediately.
    if (!card && !tenant.card) {
      setBuying(pack);
      return;
    }
    try {
      const res = await buyTokens(apiKey, pack.id, card);
      setBuying(null);
      if (res.mode === "charge") {
        setToast(`Added ${pack.tokens.toLocaleString()} tokens — new balance ${res.tokenBalance.toLocaleString()}`);
        setTimeout(() => setToast(null), 3500);
      }
      await load();
    } catch (e) {
      if (!card) setError((e as Error).message);
      else throw e; // surfaced inside the modal
    }
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <CheckIcon className="w-4 h-4" /> {toast}
        </div>
      )}

      {/* balance + account */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className={`rounded-2xl border shadow-card p-5 ${low ? "bg-red-50 border-red-200" : "bg-white border-slate-200/70"}`}>
          <div className="text-sm text-slate-500">Feedback tokens</div>
          <div className="mt-1 flex items-end gap-2">
            <span className="text-4xl font-bold text-slate-900 tabular-nums">{balance.toLocaleString()}</span>
            <span className="text-sm text-slate-400 mb-1">tokens left</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            1 token = 1 accepted feedback.
            {low && <span className="text-red-600 font-medium"> · running low — top up below.</span>}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-card p-5">
          <div className="text-sm text-slate-500">Account</div>
          <div className="mt-2 text-sm text-slate-600 space-y-1">
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
            <div>Status: <span className="text-slate-800 capitalize">{tenant.subStatus}</span> · {plan.name}</div>
          </div>
        </div>
      </div>

      {/* buy tokens */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Buy tokens</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {packs.map((p) => (
            <div
              key={p.id}
              className={`relative bg-white rounded-2xl border p-5 flex flex-col ${
                p.popular ? "border-brand-400 ring-2 ring-brand-100" : "border-slate-200/70"
              }`}
            >
              {p.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full tracking-wide">
                  BEST VALUE
                </span>
              )}
              <div className="font-semibold text-slate-900">{p.name}</div>
              <div className="mt-1 text-3xl font-bold text-slate-900 tabular-nums">
                {p.tokens.toLocaleString()}
                <span className="text-sm font-medium text-slate-400"> tokens</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 min-h-[32px]">{p.tagline}</p>
              <div className="mt-2 text-lg font-bold text-slate-800">{p.priceLabel ?? money(p.priceCents)}</div>
              <button
                onClick={() => purchase(p)}
                className="mt-4 w-full rounded-xl py-2.5 text-sm font-semibold transition bg-brand-600 text-white hover:bg-brand-700"
              >
                Buy {p.name}
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-2">
          One-off purchases — tokens never expire.{" "}
          {stripeEnabled ? (
            <>You'll be redirected to <span className="font-medium text-slate-500">Stripe</span> to pay securely.</>
          ) : (
            <>Test mode — use card <code className="bg-slate-100 px-1 rounded">4242 4242 4242 4242</code>.</>
          )}
        </p>
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

      {buying && (
        <CardModal
          pack={buying}
          onClose={() => setBuying(null)}
          onPaid={(card) => purchase(buying, card)}
        />
      )}
    </div>
  );
}

function CardModal({
  pack,
  onClose,
  onPaid,
}: {
  pack: TokenPack;
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
          <h3 className="text-lg font-bold">Buy {pack.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          {pack.tokens.toLocaleString()} tokens · {pack.priceLabel ?? money(pack.priceCents)} one-off.
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
          {busy ? "Processing…" : `Pay ${pack.priceLabel ?? money(pack.priceCents)}`}
        </button>
      </div>
    </div>
  );
}
