// Account & session APIs — the simulated "Sign in with Google" flow.
//
//   /auth/google/callback  (POST, form)  — the mock sign-in page posts here → session
//   /auth/logout           (POST)        — destroy the session
//   /v1/me                 (GET)         — who am I? (drives the dashboard + onboarding)
//   /v1/onboarding         (POST, JSON)  — create the org for a signed-in user
//
// Real OAuth: when GOOGLE_CLIENT_ID/SECRET are set, /auth/google redirects to the real Google
// consent screen and the GET callback exchanges the code; otherwise the mock page + POST is used.

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Response } from "express";
import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { exchangeCodeForProfile, googleAuthUrl } from "../auth/google.js";
import {
  clearSessionCookie,
  mockGoogleProfile,
  readSessionCookie,
  setSessionCookie,
} from "../auth/session.js";
import { isGoogleConfigured } from "../config.js";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK_SIGNIN_PAGE = path.resolve(__dirname, "../../../frontend/auth/google.html");
const OAUTH_STATE_COOKIE = "g_oauth_state";

// ---- /auth/* ----
export const authRouter = Router();

// Create the session for a resolved profile, returning where to send the browser next.
async function startSession(
  res: Response,
  profile: { email: string; name?: string; avatarUrl?: string | null; googleId?: string | null }
): Promise<string> {
  const user = await findOrCreateUser(profile);
  const token = await createSession(user.id);
  setSessionCookie(res, token);
  // New users finish onboarding; returning users go straight to their dashboard.
  return user.tenantId ? "/dashboard" : "/onboarding";
}

// Start sign-in. Real Google OAuth when configured (redirect to consent), else the mock page.
authRouter.get("/google", (req, res) => {
  if (!isGoogleConfigured()) return res.sendFile(MOCK_SIGNIN_PAGE);
  const state = nanoid(24);
  res.cookie(OAUTH_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600_000 });
  res.redirect(googleAuthUrl(state));
});

// Real Google OAuth redirect target (?code=&state=) — only reached when configured.
authRouter.get("/google/callback", async (req, res, next) => {
  try {
    if (!isGoogleConfigured()) return res.status(404).json({ error: "oauth_not_configured" });
    const { code, state } = req.query as { code?: string; state?: string };
    const expected = req.cookies?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
    if (!state || !expected || state !== expected) {
      return res.status(403).type("text/plain").send("OAuth state mismatch — please sign in again.");
    }
    if (!code) return res.status(400).type("text/plain").send("Missing authorization code.");
    const next = await startSession(res, await exchangeCodeForProfile(code));
    res.redirect(next);
  } catch (err) {
    next(err);
  }
});

// The mock Google page posts the chosen account here (application/x-www-form-urlencoded).
authRouter.post("/google/callback", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(422).type("text/plain").send("A valid email is required.");
    }
    const next = await startSession(res, mockGoogleProfile({ email, name: req.body?.name }));
    res.redirect(next);
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
  website: z.string().max(200).optional(),
});

accountRouter.post("/onboarding", async (req, res, next) => {
  try {
    const user = await getSessionUser(readSessionCookie(req));
    if (!user) return res.status(401).json({ error: "not_authenticated" });

    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: "validation_error", details: parsed.error.flatten() });
    }
    const account = await onboardUser(user.id, { company: parsed.data.company, website: parsed.data.website });
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
