// Billing & account APIs.
//
//   PUBLIC (no key):
//     GET  /v1/plans            — the plan catalogue (used by the signup/pricing page)
//     POST /v1/signup           — self-serve org signup → creates an isolated tenant + keys
//
//   SECRET key (the tenant's own dashboard):
//     GET  /v1/admin/billing            — current plan, card on file, usage vs quota
//     POST /v1/admin/billing/checkout   — change plan / add a card (simulated charge)
//     GET  /v1/admin/billing/invoices   — payment history
//
// All charges are SIMULATED (test mode). See store.ts `chargeCard` and plans.ts.

import { Router } from "express";
import { z } from "zod";
import { resolveTenant } from "../middleware/auth.js";
import {
  formatPackPrice,
  formatPrice,
  getPlan,
  isPackId,
  isPlanId,
  PLANS,
  TOKEN_PACKS,
} from "../plans.js";
import {
  BillingError,
  buyTokens,
  changePlan,
  createTenantAccount,
  getBilling,
  listPayments,
} from "../store.js";

// Flat, display-friendly token packs for the dashboard's "buy tokens" UI.
const packsView = () =>
  Object.values(TOKEN_PACKS).map((p) => ({ ...p, priceLabel: formatPackPrice(p.priceCents) }));

// ---- public: plan catalogue + signup ----
export const publicBillingRouter = Router();

// A flat, display-friendly view of the plans for the pricing page.
publicBillingRouter.get("/plans", (_req, res) => {
  res.json({
    plans: Object.values(PLANS).map((p) => ({ ...p, priceLabel: formatPrice(p.priceCents) })),
  });
});

const cardSchema = z.object({
  number: z.string().min(12).max(25),
  expMonth: z.coerce.number().int().min(1).max(12),
  expYear: z.coerce.number().int().min(2000).max(2100),
  cvc: z.string().min(3).max(4),
  name: z.string().max(120).optional(),
});

const signupSchema = z.object({
  company: z.string().min(1).max(120),
  email: z.string().email(),
  plan: z.string().refine(isPlanId, "unknown plan"),
  card: cardSchema.optional(),
});

publicBillingRouter.post("/signup", async (req, res, next) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: "validation_error", details: parsed.error.flatten() });
    }
    const { company, email, plan, card } = parsed.data;
    const account = await createTenantAccount({
      company,
      billingEmail: email,
      plan: isPlanId(plan) ? plan : "free",
      card,
    });
    res.status(201).json({
      tenantId: account.tenant.id,
      name: account.tenant.name,
      plan: account.tenant.plan,
      projectId: account.project.id,
      publicKey: account.publicKey,
      secretKey: account.secretKey,
    });
  } catch (err) {
    if (err instanceof BillingError) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    next(err);
  }
});

// ---- secret-key: the tenant's own billing console ----
export const billingRouter = Router();
billingRouter.use(resolveTenant);

billingRouter.get("/", async (req, res, next) => {
  try {
    const summary = await getBilling(req.tenantId!);
    if (!summary) return res.status(404).json({ error: "tenant_not_found" });
    res.json({
      ...summary,
      tokenBalance: summary.tenant.tokenBalance,
      packs: packsView(),
      plan: getPlan(summary.tenant.plan),
      plans: Object.values(PLANS).map((p) => ({ ...p, priceLabel: formatPrice(p.priceCents) })),
    });
  } catch (err) {
    next(err);
  }
});

const checkoutSchema = z.object({
  plan: z.string().refine(isPlanId, "unknown plan"),
  card: cardSchema.optional(),
});

billingRouter.post("/checkout", async (req, res, next) => {
  try {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: "validation_error", details: parsed.error.flatten() });
    }
    const { plan, card } = parsed.data;
    const summary = await changePlan(req.tenantId!, isPlanId(plan) ? plan : "free", card);
    res.json({ ok: true, ...summary, plan: getPlan(summary.tenant.plan) });
  } catch (err) {
    if (err instanceof BillingError) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    next(err);
  }
});

const buyTokensSchema = z.object({
  pack: z.string().refine(isPackId, "unknown token pack"),
  card: cardSchema.optional(),
});

// POST /v1/admin/billing/buy-tokens  { pack, card? } — top up the token balance.
billingRouter.post("/buy-tokens", async (req, res, next) => {
  try {
    const parsed = buyTokensSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: "validation_error", details: parsed.error.flatten() });
    }
    const result = await buyTokens(req.tenantId!, parsed.data.pack, parsed.data.card);
    res.json({
      ok: true,
      tokenBalance: result.tenant.tokenBalance,
      pack: { ...result.pack, priceLabel: formatPackPrice(result.pack.priceCents) },
      payment: result.payment,
    });
  } catch (err) {
    if (err instanceof BillingError) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    next(err);
  }
});

billingRouter.get("/invoices", async (req, res, next) => {
  try {
    res.json({ invoices: await listPayments(req.tenantId!) });
  } catch (err) {
    next(err);
  }
});
