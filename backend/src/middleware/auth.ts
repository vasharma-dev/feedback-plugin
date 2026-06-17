// API-key auth + tenancy guard (DESIGN.md §8).
// Two trust levels:
//   - requirePublicKey: ingest only. Resolves the key's project. Used by widget/SDK/REST.
//   - requireSecretKey: dashboard/admin. Tenant-wide. Never accepted on ingest routes.

import type { NextFunction, Request, Response } from "express";
import { findApiKey, getProject } from "../store.js";
import type { ApiKey, Project } from "../types.js";

// Augment Express's Request with what the guards resolve.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
      project?: Project;
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
