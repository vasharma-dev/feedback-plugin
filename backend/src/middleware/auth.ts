// API-key auth + tenancy guard (DESIGN.md §8).
// Two trust levels:
//   - requirePublicKey: ingest only. Resolves the key's project. Used by widget/SDK/REST.
//   - requireSecretKey: dashboard/admin. Tenant-wide. Never accepted on ingest routes.

import type { NextFunction, Request, Response } from "express";
import { readSessionCookie } from "../auth/session.js";
import { findApiKey, getProject, getSessionUser } from "../store.js";
import type { ApiKey, Project } from "../types.js";

// Augment Express's Request with what the guards resolve.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
      project?: Project;
      cookies?: Record<string, string>;
      tenantId?: string; // resolved tenant (from a secret key OR a session cookie)
      userId?: string; // resolved user id (session path only)
      userRole?: string; // owner | member (secret key = owner)
      userName?: string; // actor display name for the timeline
    }
  }
}

function extractKey(req: Request): string | undefined {
  const header = req.header("authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length).trim();
  // Convenience for the zero-code <script> case where setting headers is awkward.
  if (typeof req.query.key === "string") return req.query.key;
  return undefined;
}

export async function requirePublicKey(req: Request, res: Response, next: NextFunction) {
  try {
    const key = extractKey(req);
    const apiKey = key ? await findApiKey(key) : undefined;
    if (!apiKey) return res.status(401).json({ error: "invalid_api_key" });
    // A secret key MUST NOT be usable from the browser/public ingest path.
    if (apiKey.kind !== "public" || !apiKey.projectId) {
      return res.status(403).json({ error: "public_key_required" });
    }
    const project = await getProject(apiKey.projectId);
    if (!project) return res.status(401).json({ error: "project_not_found" });

    // Origin allowlist — stops a leaked public key being used from another site.
    const origin = req.header("origin");
    const allowed = project.settings.allowedOrigins;
    if (origin && !allowed.includes("*") && !allowed.includes(origin)) {
      return res.status(403).json({ error: "origin_not_allowed" });
    }

    req.apiKey = apiKey;
    req.project = project;
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireSecretKey(req: Request, res: Response, next: NextFunction) {
  try {
    const key = extractKey(req);
    const apiKey = key ? await findApiKey(key) : undefined;
    if (!apiKey) return res.status(401).json({ error: "invalid_api_key" });
    if (apiKey.kind !== "secret") return res.status(403).json({ error: "secret_key_required" });
    req.apiKey = apiKey;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Admin/dashboard guard that accepts EITHER a secret key (programmatic / legacy) OR a logged-in
 * session cookie (the Google sign-in flow). Either way it resolves `req.tenantId`, which every
 * admin route is scoped to. A Bearer key that isn't a valid secret is still rejected exactly as
 * `requireSecretKey` would (401 unknown / 403 wrong kind), so existing clients are unaffected.
 */
export async function resolveTenant(req: Request, res: Response, next: NextFunction) {
  try {
    // 1) Explicit API key wins (Authorization: Bearer sk_… or ?key=).
    const key = extractKey(req);
    if (key) {
      const apiKey = await findApiKey(key);
      if (!apiKey) return res.status(401).json({ error: "invalid_api_key" });
      if (apiKey.kind !== "secret") return res.status(403).json({ error: "secret_key_required" });
      req.apiKey = apiKey;
      req.tenantId = apiKey.tenantId;
      req.userRole = "owner"; // the secret key is the admin credential → full access
      req.userName = "API";
      return next();
    }
    // 2) Otherwise fall back to the session cookie.
    const user = await getSessionUser(readSessionCookie(req));
    if (user?.tenantId) {
      req.userId = user.id;
      req.tenantId = user.tenantId;
      req.userRole = user.role;
      req.userName = user.name || user.email;
      return next();
    }
    return res.status(401).json({ error: "auth_required" });
  } catch (err) {
    next(err);
  }
}

/** Gate for owner-only actions (billing, settings, widget config, team management). */
export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.userRole !== "owner") {
    return res.status(403).json({ error: "owner_only", message: "Only an organization owner can do this." });
  }
  next();
}
