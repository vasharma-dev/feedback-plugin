// Data-access layer — now backed by Prisma/SQLite (was in-memory).
//
// The rest of the app imports only these functions, so the storage swap touched
// nothing above it. The exported signatures match the domain types in types.ts;
// all functions are async because the DB is.

import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { prisma } from "./db.js";
import { superAdmin as superAdminCfg } from "./config.js";
import { getPlan, starterTokens, TOKEN_PACKS, type PlanId, type TokenPack } from "./plans.js";
import { putAttachment } from "./storage.js";
import type {
  ApiKey,
  Attachment,
  CardOnFile,
  Feedback,
  FeedbackStatus,
  FeedbackType,
  Payment,
  Plan,
  Project,
  Tenant,
} from "./types.js";

// Fixed demo keys the widget/SDK/dashboard use out of the box.
export const DEMO = {
  publicKey: "pk_demo_acme_123",
  secretKey: "sk_demo_acme_456",
};

// A second seeded org, to demonstrate tenant isolation (its dashboard only ever
// shows its own feedback — never Acme's).
export const DEMO2 = {
  publicKey: "pk_demo_globex_789",
  secretKey: "sk_demo_globex_012",
};

// ---- Row → domain mappers (decode the JSON-encoded SQLite columns) ----
type ProjectRow = {
  id: string;
  tenantId: string;
  name: string;
  themeColor: string;
  themePosition: string;
  launcherText: string;
  launcherIcon: string;
  headerTitle: string;
  headerSubtitle: string;
  dialogBg: string;
  hideBranding: boolean;
  allowedOrigins: string;
};

function toProject(r: ProjectRow): Project {
  return {
    id: r.id,
    tenantId: r.tenantId,
    name: r.name,
    settings: {
      theme: {
        color: r.themeColor,
        position: r.themePosition as Project["settings"]["theme"]["position"],
        launcherText: r.launcherText,
        launcherIcon: r.launcherIcon,
        headerTitle: r.headerTitle,
        headerSubtitle: r.headerSubtitle,
        dialogBg: r.dialogBg,
        hideBranding: r.hideBranding,
      },
      allowedOrigins: JSON.parse(r.allowedOrigins) as string[],
    },
  };
}

type TenantRow = {
  id: string;
  name: string;
  plan: string;
  tokenBalance: number;
  createdAt: Date;
  billingEmail: string | null;
  subStatus: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date | null;
  cardBrand: string | null;
  cardLast4: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
};

function toTenant(r: TenantRow): Tenant {
  return {
    id: r.id,
    name: r.name,
    plan: r.plan as Plan,
    tokenBalance: r.tokenBalance,
    createdAt: r.createdAt.toISOString(),
    billingEmail: r.billingEmail,
    subStatus: r.subStatus as Tenant["subStatus"],
    currentPeriodStart: r.currentPeriodStart.toISOString(),
    currentPeriodEnd: r.currentPeriodEnd ? r.currentPeriodEnd.toISOString() : null,
    card:
      r.cardBrand && r.cardLast4 && r.cardExpMonth && r.cardExpYear
        ? { brand: r.cardBrand, last4: r.cardLast4, expMonth: r.cardExpMonth, expYear: r.cardExpYear }
        : null,
  };
}

type PaymentRow = {
  id: string;
  tenantId: string;
  plan: string;
  amountCents: number;
  currency: string;
  status: string;
  cardBrand: string | null;
  cardLast4: string | null;
  description: string;
  periodStart: Date;
  periodEnd: Date | null;
  createdAt: Date;
};

function toPayment(r: PaymentRow): Payment {
  return {
    id: r.id,
    tenantId: r.tenantId,
    plan: r.plan as Plan,
    amountCents: r.amountCents,
    currency: r.currency,
    status: r.status as Payment["status"],
    cardBrand: r.cardBrand,
    cardLast4: r.cardLast4,
    description: r.description,
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd ? r.periodEnd.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

type FeedbackRow = {
  id: string;
  projectId: string;
  tenantId: string;
  type: string;
  message: string;
  rating: number | null;
  status: string;
  endUser: string | null;
  metadata: string;
  createdAt: Date;
  attachments: Attachment[];
};

function toFeedback(r: FeedbackRow): Feedback {
  return {
    id: r.id,
    projectId: r.projectId,
    tenantId: r.tenantId,
    type: r.type as FeedbackType,
    message: r.message,
    rating: r.rating,
    status: r.status as FeedbackStatus,
    endUser: r.endUser ? JSON.parse(r.endUser) : null,
    metadata: JSON.parse(r.metadata),
    attachments: r.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      mime: a.mime,
      dataUrl: a.dataUrl,
    })),
    createdAt: r.createdAt.toISOString(),
  };
}

// API keys are looked up by a SHA-256 hash, so the raw secret is never stored. (These are
// high-entropy random tokens, not passwords, so a fast hash is the right tool — not bcrypt.)
export function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

// Build the DB columns for a new key: secrets are hash-only; public keys also keep plaintext
// (they ship inside the customer's HTML anyway, and the dashboard shows them for the embed).
function keyColumns(plaintext: string, kind: "public" | "secret") {
  return { keyHash: hashKey(plaintext), key: kind === "public" ? plaintext : null };
}

// ---- Auth lookups ----
export async function findApiKey(key: string): Promise<ApiKey | undefined> {
  const k = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(key) } });
  if (!k || !k.active) return undefined;
  return {
    id: k.id,
    tenantId: k.tenantId,
    projectId: k.projectId,
    key: k.key,
    kind: k.kind as ApiKey["kind"],
    active: k.active,
  };
}

export async function getProject(id: string): Promise<Project | undefined> {
  const p = await prisma.project.findUnique({ where: { id } });
  return p ? toProject(p) : undefined;
}

export async function listProjects(tenantId: string): Promise<Project[]> {
  const rows = await prisma.project.findMany({ where: { tenantId } });
  return rows.map(toProject);
}

/** Projects plus their public key (pk_…) — used by the dashboard's widget/embed UI. */
export async function listProjectsWithKeys(
  tenantId: string
): Promise<Array<Project & { publicKey: string | null }>> {
  const rows = await prisma.project.findMany({ where: { tenantId }, include: { apiKeys: true } });
  return rows.map((r) => ({
    ...toProject(r),
    publicKey: r.apiKeys.find((k) => k.kind === "public")?.key ?? null,
  }));
}

/**
 * Replace a project's origin allow-list. Scoped by tenantId so one tenant can never edit
 * another's project — a mismatched tenant updates 0 rows and gets `undefined` (→ 404).
 * The widget's public key is only accepted from these origins (or any, when ["*"]).
 */
export async function updateProjectOrigins(
  tenantId: string,
  projectId: string,
  allowedOrigins: string[]
): Promise<Project | undefined> {
  const res = await prisma.project.updateMany({
    where: { id: projectId, tenantId },
    data: { allowedOrigins: JSON.stringify(allowedOrigins) },
  });
  if (res.count === 0) return undefined;
  return getProject(projectId);
}

export interface ProjectThemeInput {
  color?: string;
  position?: "bottom-right" | "bottom-left";
  launcherText?: string;
  launcherIcon?: string;
  headerTitle?: string;
  headerSubtitle?: string;
  dialogBg?: string;
  hideBranding?: boolean;
}

/**
 * Update a project's widget theme/branding. Tenant-scoped (a wrong tenant updates 0 rows → 404).
 * Only the provided fields change; the rest keep their stored values.
 */
export async function updateProjectTheme(
  tenantId: string,
  projectId: string,
  theme: ProjectThemeInput
): Promise<Project | undefined> {
  const data: Record<string, unknown> = {};
  if (theme.color !== undefined) data.themeColor = theme.color;
  if (theme.position !== undefined) data.themePosition = theme.position;
  if (theme.launcherText !== undefined) data.launcherText = theme.launcherText;
  if (theme.launcherIcon !== undefined) data.launcherIcon = theme.launcherIcon;
  if (theme.headerTitle !== undefined) data.headerTitle = theme.headerTitle;
  if (theme.headerSubtitle !== undefined) data.headerSubtitle = theme.headerSubtitle;
  if (theme.dialogBg !== undefined) data.dialogBg = theme.dialogBg;
  if (theme.hideBranding !== undefined) data.hideBranding = theme.hideBranding;
  const res = await prisma.project.updateMany({ where: { id: projectId, tenantId }, data });
  if (res.count === 0) return undefined;
  return getProject(projectId);
}

// ---- Feedback ----
export interface CreateFeedbackInput {
  projectId: string;
  tenantId: string;
  type: FeedbackType;
  message: string;
  rating: number | null;
  endUser: { id?: string; email?: string } | null;
  metadata: Record<string, unknown>;
  attachments: Array<{ filename: string; mime: string; dataUrl: string }>;
}

export async function createFeedback(input: CreateFeedbackInput): Promise<Feedback> {
  // Route each blob through the storage layer (inline data URL, or written to disk → a URL).
  const attachments = await Promise.all(
    input.attachments.map(async (a) => ({
      id: `att_${nanoid(10)}`,
      filename: a.filename,
      mime: a.mime,
      dataUrl: await putAttachment(a),
    }))
  );
  const row = await prisma.feedback.create({
    data: {
      id: `fb_${nanoid(10)}`,
      projectId: input.projectId,
      tenantId: input.tenantId,
      type: input.type,
      message: input.message,
      rating: input.rating,
      status: "new",
      endUser: input.endUser ? JSON.stringify(input.endUser) : null,
      metadata: JSON.stringify(input.metadata ?? {}),
      attachments: { create: attachments },
    },
    include: { attachments: true },
  });
  return toFeedback(row);
}

export interface FeedbackQuery {
  tenantId: string;
  projectId?: string;
  status?: FeedbackStatus;
  type?: FeedbackType;
  q?: string;
}

export async function queryFeedback(query: FeedbackQuery): Promise<Feedback[]> {
  const rows = await prisma.feedback.findMany({
    where: {
      tenantId: query.tenantId,
      projectId: query.projectId,
      status: query.status,
      type: query.type,
      message: query.q ? { contains: query.q } : undefined, // LIKE is case-insensitive on SQLite ASCII
    },
    include: { attachments: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toFeedback);
}

export async function updateFeedbackStatus(
  tenantId: string,
  id: string,
  status: FeedbackStatus
): Promise<Feedback | undefined> {
  // updateMany scoped by tenantId enforces isolation — a wrong tenant updates 0 rows.
  const res = await prisma.feedback.updateMany({ where: { id, tenantId }, data: { status } });
  if (res.count === 0) return undefined;
  const row = await prisma.feedback.findUnique({ where: { id }, include: { attachments: true } });
  return row ? toFeedback(row) : undefined;
}

export async function statsFor(tenantId: string) {
  const items = await prisma.feedback.findMany({
    where: { tenantId },
    select: { status: true, type: true, rating: true },
  });
  const by = (pick: (f: { status: string; type: string }) => string) =>
    items.reduce<Record<string, number>>((acc, f) => {
      const k = pick(f);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
  const rated = items.filter((f) => typeof f.rating === "number");
  return {
    total: items.length,
    byStatus: by((f) => f.status),
    byType: by((f) => f.type),
    avgRating: rated.length
      ? Number((rated.reduce((s, f) => s + (f.rating ?? 0), 0) / rated.length).toFixed(2))
      : null,
  };
}

// ====================================================================================
// Billing & accounts (prototype: simulated "test mode" — no real money moves)
// ====================================================================================

// A typed, HTTP-aware error so the API layer can translate failures into clean responses
// instead of generic 500s.
export class BillingError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

export interface CardInput {
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
  name?: string;
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function detectBrand(digits: string): string {
  if (/^4/.test(digits)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "Mastercard";
  if (/^3[47]/.test(digits)) return "Amex";
  if (/^6/.test(digits)) return "Discover";
  return "Card";
}

// Stripe's well-known test card that always declines, so the demo can show a failure path.
const DECLINE_CARD = "4000000000000002";

/**
 * Validate a card and "charge" it. In test mode this never contacts a payment processor:
 * it Luhn-checks the number, validates expiry/cvc, and simulates approval/decline.
 * Returns the display-safe card details to persist. Throws BillingError on bad/declined cards.
 */
function chargeCard(card: CardInput, _amountCents: number): CardOnFile {
  const number = String(card.number || "").replace(/[\s-]/g, "");
  if (!/^\d{13,19}$/.test(number) || !luhnValid(number)) {
    throw new BillingError(402, "card_invalid", "That card number looks invalid.");
  }
  const now = new Date();
  const expMonth = Number(card.expMonth);
  const expYear = Number(card.expYear);
  if (!(expMonth >= 1 && expMonth <= 12)) {
    throw new BillingError(402, "card_exp_invalid", "Invalid expiry month.");
  }
  // Card is valid through the last day of its expiry month.
  const expiresEnd = new Date(expYear, expMonth, 1).getTime();
  if (Number.isNaN(expiresEnd) || expiresEnd <= now.getTime()) {
    throw new BillingError(402, "card_expired", "That card has expired.");
  }
  if (!/^\d{3,4}$/.test(String(card.cvc || ""))) {
    throw new BillingError(402, "card_cvc_invalid", "Invalid security code.");
  }
  if (number === DECLINE_CARD) {
    throw new BillingError(402, "card_declined", "Your card was declined.");
  }
  return { brand: detectBrand(number), last4: number.slice(-4), expMonth, expYear };
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function genKey(prefix: "pk" | "sk"): string {
  return `${prefix}_${nanoid(20)}`;
}

/** Count feedback submitted in the tenant's current billing window. */
export async function usageForPeriod(tenantId: string, periodStart: Date): Promise<number> {
  return prisma.feedback.count({ where: { tenantId, createdAt: { gte: periodStart } } });
}

export async function getTenant(tenantId: string): Promise<Tenant | undefined> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
  return t ? toTenant(t) : undefined;
}

export interface BillingSummary {
  tenant: Tenant;
  usage: { used: number; quota: number; remaining: number };
}

export async function getBilling(tenantId: string): Promise<BillingSummary | undefined> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!t) return undefined;
  const tenant = toTenant(t);
  const quota = getPlan(tenant.plan).monthlyQuota;
  const used = await usageForPeriod(tenantId, t.currentPeriodStart);
  return { tenant, usage: { used, quota, remaining: Math.max(0, quota - used) } };
}

/**
 * Spend one token for an accepted feedback. Atomic + race-safe: the conditional update only
 * decrements when the balance is still > 0, so it can never go negative. Returns false when
 * the tenant is out of tokens (the ingest API then responds 402).
 */
export async function spendToken(tenantId: string): Promise<boolean> {
  const res = await prisma.tenant.updateMany({
    where: { id: tenantId, tokenBalance: { gt: 0 } },
    data: { tokenBalance: { decrement: 1 } },
  });
  return res.count > 0;
}

export interface BuyTokensResult {
  tenant: Tenant;
  pack: TokenPack;
  payment: Payment;
}

/**
 * Buy a token pack: charge a card (a fresh one, or the card on file), credit the tokens to the
 * tenant's balance, and record the invoice. Simulated charge — see chargeCard.
 */
export async function buyTokens(
  tenantId: string,
  packId: string,
  newCard?: CardInput
): Promise<BuyTokensResult> {
  const pack = await getTokenPack(packId);
  if (!pack) throw new BillingError(404, "pack_not_found", "Unknown token pack.");
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!existing) throw new BillingError(404, "tenant_not_found");

  let card: CardOnFile | null =
    existing.cardBrand && existing.cardLast4 && existing.cardExpMonth && existing.cardExpYear
      ? { brand: existing.cardBrand, last4: existing.cardLast4, expMonth: existing.cardExpMonth, expYear: existing.cardExpYear }
      : null;
  if (newCard) card = chargeCard(newCard, pack.priceCents);
  else if (!card) throw new BillingError(402, "card_required", "Payment details are required to buy tokens.");

  const now = new Date();
  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      tokenBalance: { increment: pack.tokens },
      cardBrand: card?.brand ?? existing.cardBrand,
      cardLast4: card?.last4 ?? existing.cardLast4,
      cardExpMonth: card?.expMonth ?? existing.cardExpMonth,
      cardExpYear: card?.expYear ?? existing.cardExpYear,
    },
  });

  const payment = await recordPayment({
    tenantId,
    plan: existing.plan as PlanId,
    amountCents: pack.priceCents,
    card,
    description: `${pack.tokens.toLocaleString()} tokens — ${pack.name} pack`,
    periodStart: now,
    periodEnd: now,
  });

  return { tenant: toTenant(updated), pack, payment };
}

/**
 * Credit tokens for a completed external (Stripe) purchase. Idempotent: the unique extId means
 * a replayed return/webhook for the same Checkout session won't double-credit.
 */
export async function creditPurchasedTokens(opts: {
  tenantId: string;
  packId: string;
  extId: string;
  amountCents?: number;
}): Promise<{ credited: boolean; tokenBalance: number }> {
  const pack = await getTokenPack(opts.packId);
  if (!pack) throw new BillingError(404, "pack_not_found");
  const tenant = await prisma.tenant.findUnique({ where: { id: opts.tenantId } });
  if (!tenant) throw new BillingError(404, "tenant_not_found");

  const now = new Date();
  try {
    await prisma.payment.create({
      data: {
        id: `pay_${nanoid(12)}`,
        tenantId: opts.tenantId,
        extId: opts.extId, // unique → guards against double-credit
        plan: tenant.plan,
        amountCents: opts.amountCents ?? pack.priceCents,
        currency: "usd",
        status: "paid",
        description: `${pack.tokens.toLocaleString()} tokens — ${pack.name} pack`,
        periodStart: now,
        periodEnd: now,
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return { credited: false, tokenBalance: tenant.tokenBalance }; // already processed
    }
    throw e;
  }

  const updated = await prisma.tenant.update({
    where: { id: opts.tenantId },
    data: { tokenBalance: { increment: pack.tokens } },
  });
  return { credited: true, tokenBalance: updated.tokenBalance };
}

export async function listPayments(tenantId: string): Promise<Payment[]> {
  const rows = await prisma.payment.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toPayment);
}

async function recordPayment(opts: {
  tenantId: string;
  plan: PlanId;
  amountCents: number;
  card: CardOnFile | null;
  description: string;
  periodStart: Date;
  periodEnd: Date;
}): Promise<Payment> {
  const row = await prisma.payment.create({
    data: {
      id: `pay_${nanoid(12)}`,
      tenantId: opts.tenantId,
      plan: opts.plan,
      amountCents: opts.amountCents,
      currency: "usd",
      status: "paid",
      cardBrand: opts.card?.brand ?? null,
      cardLast4: opts.card?.last4 ?? null,
      description: opts.description,
      periodStart: opts.periodStart,
      periodEnd: opts.periodEnd,
    },
  });
  return toPayment(row);
}

export interface CreateAccountInput {
  company: string;
  billingEmail: string;
  plan: PlanId;
  card?: CardInput;
}

export interface CreatedAccount {
  tenant: Tenant;
  project: Project;
  publicKey: string;
  secretKey: string;
}

/**
 * Self-serve org signup: creates an isolated tenant + project + its own API keys, applies the
 * chosen plan (charging the card for paid plans), and returns the plaintext keys ONCE so the
 * org can copy them. Everything this org's widget collects is scoped to this tenant.
 */
export async function createTenantAccount(input: CreateAccountInput): Promise<CreatedAccount> {
  const plan = getPlan(input.plan);
  const company = input.company.trim();
  if (!company) throw new BillingError(422, "company_required", "Company name is required.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.billingEmail || "")) {
    throw new BillingError(422, "email_invalid", "A valid billing email is required.");
  }

  // Paid plans require a card; charge it before creating anything persistent.
  let card: CardOnFile | null = null;
  if (plan.priceCents > 0) {
    if (!input.card) throw new BillingError(402, "card_required", "Payment details are required for paid plans.");
    card = chargeCard(input.card, plan.priceCents);
  }

  const now = new Date();
  const periodEnd = addDays(now, 30);
  const tenantId = `ten_${nanoid(10)}`;
  const projectId = `prj_${nanoid(10)}`;
  const publicKey = genKey("pk");
  const secretKey = genKey("sk");

  const created = await prisma.tenant.create({
    data: {
      id: tenantId,
      name: company,
      plan: plan.id,
      tokenBalance: starterTokens(plan.id), // free starter grant (free=100, pro=5k, ent=100k)
      billingEmail: input.billingEmail.trim(),
      subStatus: "active",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cardBrand: card?.brand ?? null,
      cardLast4: card?.last4 ?? null,
      cardExpMonth: card?.expMonth ?? null,
      cardExpYear: card?.expYear ?? null,
      projects: {
        create: {
          id: projectId,
          name: `${company} — Web`,
          themeColor: "#6C2BD9",
          themePosition: "bottom-right",
          allowedOrigins: JSON.stringify(["*"]),
        },
      },
      apiKeys: {
        create: [
          { id: `key_${nanoid(8)}`, projectId, kind: "public", ...keyColumns(publicKey, "public") },
          { id: `key_${nanoid(8)}`, projectId: null, kind: "secret", ...keyColumns(secretKey, "secret") },
        ],
      },
    },
  });

  if (plan.priceCents > 0) {
    await recordPayment({
      tenantId,
      plan: plan.id,
      amountCents: plan.priceCents,
      card,
      description: `${plan.name} plan — initial subscription`,
      periodStart: now,
      periodEnd,
    });
  }

  const project = await getProject(projectId);
  return { tenant: toTenant(created), project: project!, publicKey, secretKey };
}

/**
 * Change a tenant's plan (upgrade/downgrade). Paid plans charge a card — a freshly supplied
 * one, or the card already on file. Starts a new billing period on change.
 */
export async function changePlan(
  tenantId: string,
  planId: PlanId,
  newCard?: CardInput
): Promise<BillingSummary> {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!existing) throw new BillingError(404, "tenant_not_found");
  const plan = getPlan(planId);
  const now = new Date();
  const periodEnd = addDays(now, 30);

  let card: CardOnFile | null = existing.cardBrand && existing.cardLast4 && existing.cardExpMonth && existing.cardExpYear
    ? { brand: existing.cardBrand, last4: existing.cardLast4, expMonth: existing.cardExpMonth, expYear: existing.cardExpYear }
    : null;

  if (plan.priceCents > 0) {
    if (newCard) {
      card = chargeCard(newCard, plan.priceCents);
    } else if (card) {
      // Re-use the card on file (re-validate the simulated charge path).
      // No new card details to validate; treat the stored card as chargeable.
    } else {
      throw new BillingError(402, "card_required", "Payment details are required for paid plans.");
    }
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      plan: plan.id,
      subStatus: "active",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cardBrand: card?.brand ?? existing.cardBrand,
      cardLast4: card?.last4 ?? existing.cardLast4,
      cardExpMonth: card?.expMonth ?? existing.cardExpMonth,
      cardExpYear: card?.expYear ?? existing.cardExpYear,
    },
  });

  if (plan.priceCents > 0) {
    await recordPayment({
      tenantId,
      plan: plan.id,
      amountCents: plan.priceCents,
      card,
      description: `Switched to ${plan.name} plan`,
      periodStart: now,
      periodEnd,
    });
  }

  const summary = await getBilling(tenantId);
  return summary!;
}

// ====================================================================================
// Users, accounts & sessions (simulated Google login)
// ====================================================================================

export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  googleId: string | null;
  tenantId: string | null;
}

const SESSION_TTL_DAYS = 30;

/** Find a user by email, or create one. Keeps name/avatar fresh on each login. */
export async function findOrCreateUser(profile: {
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  googleId?: string | null;
}): Promise<AppUser> {
  const email = profile.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: profile.name ?? existing.name,
        avatarUrl: profile.avatarUrl ?? existing.avatarUrl,
        googleId: existing.googleId ?? profile.googleId ?? null,
      },
    });
    return updated;
  }
  return prisma.user.create({
    data: {
      id: `usr_${nanoid(12)}`,
      email,
      name: profile.name ?? null,
      avatarUrl: profile.avatarUrl ?? null,
      googleId: profile.googleId ?? null,
    },
  });
}

/** Issue a new opaque session token for a user (stored server-side). */
export async function createSession(userId: string): Promise<string> {
  const token = `sess_${nanoid(32)}`;
  await prisma.session.create({
    data: { id: token, userId, expiresAt: addDays(new Date(), SESSION_TTL_DAYS) },
  });
  return token;
}

/** Resolve a session token to its user, or null if missing/expired. */
export async function getSessionUser(token: string | undefined): Promise<AppUser | null> {
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { id: token }, include: { user: true } });
  if (!s || s.expiresAt.getTime() <= Date.now()) return null;
  return s.user;
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { id: token } });
}

/**
 * The tenant's PUBLIC key, for showing the embed snippet. The secret key is hash-only and can't
 * be retrieved — it's returned exactly once at signup/onboarding, never again.
 */
export async function getTenantKeys(
  tenantId: string
): Promise<{ publicKey: string | null; secretKey: null }> {
  const keys = await prisma.apiKey.findMany({ where: { tenantId } });
  return {
    publicKey: keys.find((k) => k.kind === "public")?.key ?? null,
    secretKey: null,
  };
}

/**
 * Complete onboarding for a freshly-signed-in user: create their org (free plan, no card)
 * and link the user to it. Idempotency: a user who already has a tenant is rejected.
 */
export async function onboardUser(
  userId: string,
  input: { company: string }
): Promise<CreatedAccount> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new BillingError(404, "user_not_found");
  if (user.tenantId) throw new BillingError(409, "already_onboarded", "This account already has an organization.");

  const account = await createTenantAccount({
    company: input.company,
    billingEmail: user.email,
    plan: "free",
  });
  await prisma.user.update({ where: { id: userId }, data: { tenantId: account.tenant.id } });
  return account;
}

// ====================================================================================
// Token packs (DB-backed pricing — editable by the Super Admin)
// ====================================================================================
type TokenPackRow = {
  id: string;
  name: string;
  tokens: number;
  priceCents: number;
  tagline: string;
  popular: boolean;
  sortOrder: number;
};

function toTokenPack(r: TokenPackRow): TokenPack {
  return { id: r.id as TokenPack["id"], name: r.name, tokens: r.tokens, priceCents: r.priceCents, tagline: r.tagline, popular: r.popular };
}

export async function listTokenPacks(): Promise<TokenPack[]> {
  const rows = await prisma.tokenPack.findMany({ orderBy: { sortOrder: "asc" } });
  return rows.map(toTokenPack);
}

export async function getTokenPack(id: string): Promise<TokenPack | undefined> {
  const r = await prisma.tokenPack.findUnique({ where: { id } });
  return r ? toTokenPack(r) : undefined;
}

export interface TokenPackUpdate {
  name?: string;
  tokens?: number;
  priceCents?: number;
  tagline?: string;
  popular?: boolean;
}

export async function updateTokenPack(id: string, fields: TokenPackUpdate): Promise<TokenPack | undefined> {
  const data: Record<string, unknown> = {};
  if (fields.name !== undefined) data.name = fields.name;
  if (fields.tokens !== undefined) data.tokens = fields.tokens;
  if (fields.priceCents !== undefined) data.priceCents = fields.priceCents;
  if (fields.tagline !== undefined) data.tagline = fields.tagline;
  if (fields.popular !== undefined) data.popular = fields.popular;
  const res = await prisma.tokenPack.updateMany({ where: { id }, data });
  if (res.count === 0) return undefined;
  return getTokenPack(id);
}

// ====================================================================================
// Super Admin (platform owner) — email/password auth + sessions
// ====================================================================================
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(test, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface SuperAdmin {
  id: string;
  email: string;
}

export async function verifySuperAdmin(email: string, password: string): Promise<SuperAdmin | null> {
  const sa = await prisma.superAdmin.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!sa || !verifyPassword(password, sa.passwordHash)) return null;
  return { id: sa.id, email: sa.email };
}

export async function createSuperAdminSession(superAdminId: string): Promise<string> {
  const token = `sa_${nanoid(32)}`;
  await prisma.superAdminSession.create({
    data: { id: token, superAdminId, expiresAt: addDays(new Date(), 7) },
  });
  return token;
}

export async function getSuperAdminBySession(token: string | undefined): Promise<SuperAdmin | null> {
  if (!token) return null;
  const s = await prisma.superAdminSession.findUnique({ where: { id: token } });
  if (!s || s.expiresAt.getTime() <= Date.now()) return null;
  const sa = await prisma.superAdmin.findUnique({ where: { id: s.superAdminId } });
  return sa ? { id: sa.id, email: sa.email } : null;
}

export async function deleteSuperAdminSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.superAdminSession.deleteMany({ where: { id: token } });
}

/** Every org with the numbers the platform owner cares about. */
export async function listOrgsOverview() {
  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: "desc" } });
  const out = [];
  for (const t of tenants) {
    const feedbackCount = await prisma.feedback.count({ where: { tenantId: t.id } });
    out.push({
      id: t.id,
      name: t.name,
      plan: t.plan,
      tokenBalance: t.tokenBalance,
      billingEmail: t.billingEmail,
      feedbackCount,
      createdAt: t.createdAt.toISOString(),
    });
  }
  return out;
}

// ---- Idempotent seed (runs on boot; safe to call repeatedly) ----
async function seedTenant(opts: {
  tenantId: string;
  name: string;
  plan: PlanId;
  projectId: string;
  projectName: string;
  publicKey: string;
  secretKey: string;
  card: CardOnFile | null;
  url: string;
  samples: Array<{ type: FeedbackType; message: string; rating: number }>;
}) {
  if (await prisma.tenant.findUnique({ where: { id: opts.tenantId } })) return;
  const now = new Date();
  await prisma.tenant.create({
    data: {
      id: opts.tenantId,
      name: opts.name,
      plan: opts.plan,
      tokenBalance: starterTokens(opts.plan),
      billingEmail: `billing@${opts.url.replace(/^https?:\/\//, "").split("/")[0]}`,
      subStatus: "active",
      currentPeriodStart: now,
      currentPeriodEnd: addDays(now, 30),
      cardBrand: opts.card?.brand ?? null,
      cardLast4: opts.card?.last4 ?? null,
      cardExpMonth: opts.card?.expMonth ?? null,
      cardExpYear: opts.card?.expYear ?? null,
      projects: {
        create: {
          id: opts.projectId,
          name: opts.projectName,
          themeColor: "#6C2BD9",
          themePosition: "bottom-right",
          allowedOrigins: JSON.stringify(["*"]),
        },
      },
      apiKeys: {
        create: [
          { id: `key_pub_${nanoid(6)}`, projectId: opts.projectId, kind: "public", ...keyColumns(opts.publicKey, "public") },
          { id: `key_sec_${nanoid(6)}`, projectId: null, kind: "secret", ...keyColumns(opts.secretKey, "secret") },
        ],
      },
    },
  });

  const plan = getPlan(opts.plan);
  if (plan.priceCents > 0 && opts.card) {
    await recordPayment({
      tenantId: opts.tenantId,
      plan: opts.plan,
      amountCents: plan.priceCents,
      card: opts.card,
      description: `${plan.name} plan — subscription`,
      periodStart: now,
      periodEnd: addDays(now, 30),
    });
  }

  for (const s of opts.samples) {
    await createFeedback({
      projectId: opts.projectId,
      tenantId: opts.tenantId,
      type: s.type,
      message: s.message,
      rating: s.rating,
      endUser: null,
      metadata: { url: opts.url, browser: "seed", os: "seed" },
      attachments: [],
    });
  }
}

export async function ensureSeed() {
  await seedTenant({
    tenantId: "ten_acme",
    name: "Acme Inc.",
    plan: "pro",
    projectId: "prj_acme_web",
    projectName: "Acme Web App",
    publicKey: DEMO.publicKey,
    secretKey: DEMO.secretKey,
    card: { brand: "Visa", last4: "4242", expMonth: 12, expYear: new Date().getFullYear() + 2 },
    url: "https://acme.example/app",
    samples: [
      { type: "bug", message: "Export button does nothing on Safari.", rating: 2 },
      { type: "idea", message: "Please add dark mode 🙏", rating: 5 },
      { type: "praise", message: "Onboarding was super smooth, thanks!", rating: 5 },
    ],
  });

  // Second org — proves isolation: its dashboard (sk_demo_globex_012) only ever sees these.
  await seedTenant({
    tenantId: "ten_globex",
    name: "Globex Corp.",
    plan: "free",
    projectId: "prj_globex_web",
    projectName: "Globex Portal",
    publicKey: DEMO2.publicKey,
    secretKey: DEMO2.secretKey,
    card: null,
    url: "https://globex.example",
    samples: [
      { type: "question", message: "How do I reset my API token?", rating: 4 },
      { type: "bug", message: "Invoices PDF is blank on Firefox.", rating: 1 },
    ],
  });

  // Keep the two demo orgs topped up so the live demo + smoke test never run out of tokens.
  // (Real signups keep their actual balances — this only refills the seeded demo tenants.)
  await prisma.tenant.updateMany({
    where: { id: { in: ["ten_acme", "ten_globex"] }, tokenBalance: { lt: 500 } },
    data: { tokenBalance: 100_000 },
  });

  // One-time migration: hash any legacy plaintext keys, and drop the plaintext of secret keys.
  const legacy = await prisma.apiKey.findMany({ where: { keyHash: null } });
  for (const k of legacy) {
    if (!k.key) continue;
    await prisma.apiKey.update({
      where: { id: k.id },
      data: { keyHash: hashKey(k.key), key: k.kind === "public" ? k.key : null },
    });
  }

  // Seed token packs from the code defaults (only inserts missing ones — never overwrites
  // prices the Super Admin has since changed).
  let order = 0;
  for (const p of Object.values(TOKEN_PACKS)) {
    order += 1;
    const o = order;
    await prisma.tokenPack.upsert({
      where: { id: p.id },
      update: {},
      create: { id: p.id, name: p.name, tokens: p.tokens, priceCents: p.priceCents, tagline: p.tagline, popular: !!p.popular, sortOrder: o },
    });
  }

  // Seed the Super Admin account (idempotent). Credentials come from env or the defaults.
  if (!(await prisma.superAdmin.findUnique({ where: { email: superAdminCfg.email } }))) {
    await prisma.superAdmin.create({
      data: { id: `sa_${nanoid(10)}`, email: superAdminCfg.email, passwordHash: hashPassword(superAdminCfg.password) },
    });
  }
}
