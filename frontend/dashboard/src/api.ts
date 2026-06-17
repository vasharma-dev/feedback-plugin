// Typed client for the Admin API. Calls are same-origin ("/v1/...") — when served by the
// backend that hits it directly; under the Vite dev server the proxy forwards to :4000.
import type { BillingResponse, CardInput, Feedback, FeedbackStatus, Invoice, Project, Stats, WidgetTheme } from "./types";

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

// Two auth modes: a secret key (legacy / programmatic) sends a Bearer header; a logged-in
// session sends nothing here and relies on the httpOnly cookie (credentials: "include").
// Passing an empty key selects the session path.
function api(path: string, key: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (key) headers.Authorization = `Bearer ${key}`;
  return fetch(path, { ...init, headers, credentials: "include" });
}

// ---- Session / account (Google sign-in) ----
export interface Me {
  user: { email: string; name: string | null; avatarUrl: string | null };
  onboarded: boolean;
  tenant: { id: string; name: string; plan: string } | null;
  keys: { publicKey: string | null; secretKey: string | null } | null;
}

export async function getMe(): Promise<Me | null> {
  const res = await fetch("/v1/me", { credentials: "include" });
  if (res.status === 401) return null;
  return json<Me>(res);
}

export async function logout(): Promise<void> {
  await fetch("/auth/logout", { method: "POST", credentials: "include" });
}

export function getStats(key: string): Promise<Stats> {
  return api("/v1/admin/stats", key).then(json<Stats>);
}

export async function listFeedback(key: string, f: Filters): Promise<Feedback[]> {
  const p = new URLSearchParams();
  if (f.status) p.set("status", f.status);
  if (f.type) p.set("type", f.type);
  if (f.q) p.set("q", f.q);
  const data = await api(`/v1/admin/feedback?${p.toString()}`, key).then(
    json<{ items: Feedback[] }>
  );
  return data.items;
}

export function patchStatus(key: string, id: string, status: FeedbackStatus): Promise<Feedback> {
  return api(`/v1/admin/feedback/${id}`, key, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  }).then(json<Feedback>);
}

// ---- Projects ----
export function getProjects(key: string): Promise<Project[]> {
  return api("/v1/admin/projects", key)
    .then(json<{ projects: Project[] }>)
    .then((d) => d.projects);
}

export function patchProjectOrigins(
  key: string,
  id: string,
  allowedOrigins: string[]
): Promise<Project> {
  return api(`/v1/admin/projects/${id}`, key, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allowedOrigins }),
  }).then(json<Project>);
}

export function patchProjectTheme(
  key: string,
  id: string,
  theme: Partial<WidgetTheme>
): Promise<Project> {
  return api(`/v1/admin/projects/${id}`, key, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme }),
  }).then(json<Project>);
}

// ---- Billing ----
export function getBilling(key: string): Promise<BillingResponse> {
  return api("/v1/admin/billing", key).then(json<BillingResponse>);
}

export function getInvoices(key: string): Promise<Invoice[]> {
  return api("/v1/admin/billing/invoices", key)
    .then(json<{ invoices: Invoice[] }>)
    .then((d) => d.invoices);
}

export function checkout(key: string, plan: string, card?: CardInput): Promise<BillingResponse> {
  return api("/v1/admin/billing/checkout", key, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, card }),
  }).then(json<BillingResponse>);
}
