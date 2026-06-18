// Super Admin API (platform owner). Email/password login → its own session cookie. Lets the
// owner edit token-pack pricing (live for every tenant) and view all organizations.

import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { formatPackPrice } from "../plans.js";
import { getStripeSecretKey, isStripeConfigured, maskKey, setStripeSecretKey } from "../settings.js";
import {
  createSuperAdminSession,
  deleteSuperAdminSession,
  getSuperAdminBySession,
  listOrgsOverview,
  listTokenPacks,
  updateTokenPack,
  verifySuperAdmin,
} from "../store.js";

const SA_COOKIE = "jcm_sa_sess";

function setSaCookie(res: Response, token: string) {
  res.cookie(SA_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60 * 1000 });
}

async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const sa = await getSuperAdminBySession(req.cookies?.[SA_COOKIE]);
    if (!sa) return res.status(401).json({ error: "not_authenticated" });
    next();
  } catch (err) {
    next(err);
  }
}

const withLabel = (packs: Awaited<ReturnType<typeof listTokenPacks>>) =>
  packs.map((p) => ({ ...p, priceLabel: formatPackPrice(p.priceCents) }));

export const superAdminRouter = Router();

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

superAdminRouter.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: "validation_error" });
    const sa = await verifySuperAdmin(parsed.data.email, parsed.data.password);
    if (!sa) return res.status(401).json({ error: "invalid_credentials", message: "Wrong email or password." });
    setSaCookie(res, await createSuperAdminSession(sa.id));
    res.json({ ok: true, email: sa.email });
  } catch (err) {
    next(err);
  }
});

superAdminRouter.post("/logout", async (req, res, next) => {
  try {
    await deleteSuperAdminSession(req.cookies?.[SA_COOKIE]);
    res.clearCookie(SA_COOKIE, { path: "/" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

superAdminRouter.get("/me", async (req, res, next) => {
  try {
    const sa = await getSuperAdminBySession(req.cookies?.[SA_COOKIE]);
    if (!sa) return res.status(401).json({ error: "not_authenticated" });
    res.json({ email: sa.email });
  } catch (err) {
    next(err);
  }
});

// ---- protected ----
superAdminRouter.get("/packs", requireSuperAdmin, async (_req, res, next) => {
  try {
    res.json({ packs: withLabel(await listTokenPacks()) });
  } catch (err) {
    next(err);
  }
});

const packUpdateSchema = z.object({
  name: z.string().min(1).max(40).optional(),
  tokens: z.number().int().min(1).max(100_000_000).optional(),
  priceCents: z.number().int().min(0).max(100_000_000).optional(),
  tagline: z.string().max(120).optional(),
  popular: z.boolean().optional(),
});

superAdminRouter.patch("/packs/:id", requireSuperAdmin, async (req, res, next) => {
  try {
    const parsed = packUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: "validation_error", details: parsed.error.flatten() });
    const updated = await updateTokenPack(req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: "pack_not_found" });
    res.json({ ...updated, priceLabel: formatPackPrice(updated.priceCents) });
  } catch (err) {
    next(err);
  }
});

superAdminRouter.get("/orgs", requireSuperAdmin, async (_req, res, next) => {
  try {
    res.json({ orgs: await listOrgsOverview() });
  } catch (err) {
    next(err);
  }
});

// ---- platform settings: Stripe / payments ----
superAdminRouter.get("/settings", requireSuperAdmin, (_req, res) => {
  const key = getStripeSecretKey();
  res.json({
    stripeConfigured: isStripeConfigured(),
    stripeKeyMasked: maskKey(key),
    stripeMode: key.startsWith("sk_live") ? "live" : key ? "test" : null,
  });
});

const settingsSchema = z.object({
  stripeSecretKey: z.string().max(255).optional(),
});

superAdminRouter.patch("/settings", requireSuperAdmin, async (req, res, next) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: "validation_error" });
    if (parsed.data.stripeSecretKey !== undefined) {
      const v = parsed.data.stripeSecretKey.trim();
      // Light sanity check so an obviously-wrong value isn't saved.
      if (v && !/^sk_(test|live)_/.test(v)) {
        return res.status(422).json({ error: "invalid_key", message: "Stripe secret keys start with sk_test_ or sk_live_." });
      }
      await setStripeSecretKey(v);
    }
    res.json({ ok: true, stripeConfigured: isStripeConfigured() });
  } catch (err) {
    next(err);
  }
});
