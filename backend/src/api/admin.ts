// Admin API (DESIGN.md §3) — powers the tenant dashboard. SECRET key only.
// Every query is scoped to req.apiKey.tenantId so tenants never see each other's data.

import { Router } from "express";
import { z } from "zod";
import { resolveTenant } from "../middleware/auth.js";
import {
  getTenantKeys,
  listProjectsWithKeys,
  queryFeedback,
  statsFor,
  updateFeedbackStatus,
  updateProjectOrigins,
  updateProjectTheme,
} from "../store.js";

export const adminRouter = Router();

adminRouter.use(resolveTenant);

// GET /v1/admin/projects
adminRouter.get("/projects", async (req, res, next) => {
  try {
    res.json({ projects: await listProjectsWithKeys(req.tenantId!) });
  } catch (err) {
    next(err);
  }
});

// GET /v1/admin/keys — the org's own API keys, for the dashboard to display.
adminRouter.get("/keys", async (req, res, next) => {
  try {
    res.json(await getTenantKeys(req.tenantId!));
  } catch (err) {
    next(err);
  }
});

// An origin is "*" (allow any) or a bare scheme://host[:port] with no path/query/hash —
// exactly what a browser sends in the Origin header and what auth.ts compares against.
function normalizeOrigin(raw: string): string | null {
  const o = raw.trim();
  if (o === "*") return "*";
  try {
    const u = new URL(o);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    // u.origin drops any trailing slash/path; require the input to already be canonical.
    return u.origin === o.replace(/\/$/, "") ? u.origin : null;
  } catch {
    return null;
  }
}

const themeSchema = z
  .object({
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "color must be a #rrggbb hex").optional(),
    position: z.enum(["bottom-right", "bottom-left"]).optional(),
    launcherText: z.string().max(40).optional(),
    launcherIcon: z.string().max(8).optional(),
    headerTitle: z.string().max(80).optional(),
    headerSubtitle: z.string().max(160).optional(),
    dialogBg: z.string().regex(/^#[0-9a-fA-F]{6}$/, "dialogBg must be a #rrggbb hex").optional(),
    hideBranding: z.boolean().optional(),
  })
  .optional();

const projectPatchSchema = z.object({
  allowedOrigins: z.array(z.string().max(2000)).max(50).optional(),
  theme: themeSchema,
});

// PATCH /v1/admin/projects/:id  { allowedOrigins?: string[], theme?: {...} }
// Lock the public key to specific origins, and/or update the widget theme/branding.
adminRouter.patch("/projects/:id", async (req, res, next) => {
  try {
    const parsed = projectPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: "validation_error", details: parsed.error.flatten() });
    }
    const { allowedOrigins, theme } = parsed.data;
    if (!allowedOrigins && !theme) {
      return res.status(422).json({ error: "nothing_to_update" });
    }

    let updated;

    if (allowedOrigins) {
      // Validate + canonicalize each entry; reject the whole request on any bad origin.
      const seen = new Set<string>();
      const cleaned: string[] = [];
      for (const raw of allowedOrigins) {
        const norm = normalizeOrigin(raw);
        if (norm === null) {
          return res.status(422).json({
            error: "invalid_origin",
            message: `"${raw}" is not a valid origin. Use "*" or a full origin like https://app.example.com.`,
          });
        }
        if (!seen.has(norm)) {
          seen.add(norm);
          cleaned.push(norm);
        }
      }
      // A literal "*" anywhere means "allow any" — collapse to the canonical wildcard.
      const origins = cleaned.includes("*") ? ["*"] : cleaned;
      updated = await updateProjectOrigins(req.tenantId!, req.params.id, origins);
      if (!updated) return res.status(404).json({ error: "not_found" });
    }

    if (theme) {
      updated = await updateProjectTheme(req.tenantId!, req.params.id, theme);
      if (!updated) return res.status(404).json({ error: "not_found" });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /v1/admin/stats
adminRouter.get("/stats", async (req, res, next) => {
  try {
    res.json(await statsFor(req.tenantId!));
  } catch (err) {
    next(err);
  }
});

const querySchema = z.object({
  projectId: z.string().optional(),
  status: z.enum(["new", "in_progress", "done", "wont_do"]).optional(),
  type: z.enum(["bug", "idea", "praise", "question"]).optional(),
  q: z.string().optional(),
});

// GET /v1/admin/feedback?status=&type=&q=
adminRouter.get("/feedback", async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return res.status(422).json({ error: "validation_error" });
    const items = await queryFeedback({ tenantId: req.tenantId!, ...parsed.data });
    res.json({ items, count: items.length });
  } catch (err) {
    next(err);
  }
});

const patchSchema = z.object({
  status: z.enum(["new", "in_progress", "done", "wont_do"]),
});

// PATCH /v1/admin/feedback/:id  { status }
adminRouter.patch("/feedback/:id", async (req, res, next) => {
  try {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: "validation_error" });
    const updated = await updateFeedbackStatus(
      req.tenantId!,
      req.params.id,
      parsed.data.status
    );
    if (!updated) return res.status(404).json({ error: "not_found" });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
