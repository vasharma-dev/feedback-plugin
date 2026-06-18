// Real Stripe Checkout (hosted payment page), implemented with plain fetch — no SDK.
// Only used when STRIPE_SECRET_KEY is set; otherwise buying tokens uses the simulated charge.

import type { TokenPack } from "../plans.js";
import { getStripeSecretKey } from "../settings.js";

const STRIPE_API = "https://api.stripe.com/v1";

function authHeader(): string {
  // Stripe accepts the secret key as a Bearer token. Sourced from the Super Admin panel (or env).
  return `Bearer ${getStripeSecretKey()}`;
}

export interface CheckoutSession {
  id: string;
  url: string | null;
  paymentStatus: string;
  amountTotal: number | null;
  metadata: Record<string, string>;
}

function toSession(s: {
  id: string;
  url?: string | null;
  payment_status?: string;
  amount_total?: number | null;
  metadata?: Record<string, string>;
}): CheckoutSession {
  return {
    id: s.id,
    url: s.url ?? null,
    paymentStatus: s.payment_status ?? "unknown",
    amountTotal: s.amount_total ?? null,
    metadata: s.metadata ?? {},
  };
}

/** Create a one-off Checkout Session for a token pack and return its hosted URL. */
export async function createCheckoutSession(opts: {
  pack: TokenPack;
  tenantId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutSession> {
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", opts.successUrl);
  form.set("cancel_url", opts.cancelUrl);
  form.set("client_reference_id", opts.tenantId);
  form.set("metadata[tenantId]", opts.tenantId);
  form.set("metadata[packId]", opts.pack.id);
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", "usd");
  form.set("line_items[0][price_data][unit_amount]", String(opts.pack.priceCents));
  form.set("line_items[0][price_data][product_data][name]", `${opts.pack.name} pack — ${opts.pack.tokens.toLocaleString()} feedback tokens`);

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`stripe_create_session_failed_${res.status}: ${body.slice(0, 200)}`);
  }
  return toSession(await res.json());
}

/** Retrieve a Checkout Session to verify payment on the return redirect. */
export async function retrieveCheckoutSession(id: string): Promise<CheckoutSession> {
  const res = await fetch(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(id)}`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) throw new Error(`stripe_retrieve_session_failed_${res.status}`);
  return toSession(await res.json());
}
