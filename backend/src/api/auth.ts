// Account & session APIs — the simulated "Sign in with Google" flow.
//
//   /auth/google/callback  (POST, form)  — the mock sign-in page posts here → session
//   /auth/logout           (POST)        — destroy the session
//   /v1/me                 (GET)         — who am I? (drives the dashboard + onboarding)
//   /v1/onboarding         (POST, JSON)  — create the org for a signed-in user
//
// Real OAuth later: replace mockGoogleProfile() with a Google code→token→profile exchange.

import { Router } from "express";
import { z } from "zod";
import {
  clearSessionCookie,
  mockGoogleProfile,
  readSessionCookie,
  setSessionCookie,
} from "../auth/session.js";
import {
  BillingError,
  createSession,
  deleteSession,
  findOrCreateUser,
  getSessionUser,
  getTenant,
  getTenantKeys,
  onboardUser,
} from "../store.js";

// ---- /auth/* ----
export const authRouter = Router();

// The mock Google page posts the chosen account here (application/x-www-form-urlencoded).
authRouter.post("/google/callback", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(422).type("text/plain").send("A valid email is required.");
    }
    const profile = mockGoogleProfile({ email, name: req.body?.name });
    const user = await findOrCreateUser(profile);
    const token = await createSession(user.id);
    setSessionCookie(res, token);
    // New users land on onboarding; returning users go straight to their dashboard.
    res.redirect(user.tenantId ? "/dashboard" : "/onboarding");
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    await deleteSession(readSessionCookie(req));
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- /v1/me + /v1/onboarding ----
export const accountRouter = Router();

accountRouter.get("/me", async (req, res, next) => {
  try {
    const user = await getSessionUser(readSessionCookie(req));
    if (!user) return res.status(401).json({ error: "not_authenticated" });

    let tenant = null;
    let keys = null;
    if (user.tenantId) {
      const t = await getTenant(user.tenantId);
      tenant = t ? { id: t.id, name: t.name, plan: t.plan } : null;
      keys = await getTenantKeys(user.tenantId);
    }
    res.json({
      user: { email: user.email, name: user.name, avatarUrl: user.avatarUrl },
      onboarded: !!user.tenantId,
      tenant,
      keys,
    });
  } catch (err) {
    next(err);
  }
});

const onboardingSchema = z.object({
  company: z.string().min(1).max(120),
});

accountRouter.post("/onboarding", async (req, res, next) => {
  try {
    const user = await getSessionUser(readSessionCookie(req));
    if (!user) return res.status(401).json({ error: "not_authenticated" });

    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: "validation_error", details: parsed.error.flatten() });
    }
    const account = await onboardUser(user.id, { company: parsed.data.company });
    res.status(201).json({
      ok: true,
      tenantId: account.tenant.id,
      name: account.tenant.name,
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
