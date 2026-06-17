// Typed client for the Admin API. Calls are same-origin ("/v1/...") — when served by the
// backend that hits it directly; under the Vite dev server the proxy forwards to :4000.
import type { BillingResponse, CardInput, Feedback, FeedbackStatus, Invoice, Stats } from "./types";

export interface Filters {
  status?: string;
  type?: string;
  q?: string;
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `http_${res.status}`);
  return body as T;
}

const auth = (key: string) => ({ Authorization: `Bearer ${key}` });

export function getStats(key: string): Promise<Stats> {
  return fetch("/v1/admin/stats", { headers: auth(key) }).then(json<Stats>);
}

export async function listFeedback(key: string, f: Filters): Promise<Feedback[]> {
  const p = new URLSearchParams();
  if (f.status) p.set("status", f.status);
  if (f.type) p.set("type", f.type);
  if (f.q) p.set("q", f.q);
  const data = await fetch(`/v1/admin/feedback?${p.toString()}`, { headers: auth(key) }).then(
    json<{ items: Feedback[] }>
  );
  return data.items;
}

export function patchStatus(key: string, id: string, status: FeedbackStatus): Promise<Feedback> {
  return fetch(`/v1/admin/feedback/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...auth(key) },
    body: JSON.stringify({ status }),
  }).then(json<Feedback>);
}

// ---- Billing ----
export function getBilling(key: string): Promise<BillingResponse> {
  return fetch("/v1/admin/billing", { headers: auth(key) }).then(json<BillingResponse>);
}

export function getInvoices(key: string): Promise<Invoice[]> {
  return fetch("/v1/admin/billing/invoices", { headers: auth(key) })
    .then(json<{ invoices: Invoice[] }>)
    .then((d) => d.invoices);
}

export function checkout(key: string, plan: string, card?: CardInput): Promise<BillingResponse> {
  return fetch("/v1/admin/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth(key) },
    body: JSON.stringify({ plan, card }),
  }).then(json<BillingResponse>);
}
