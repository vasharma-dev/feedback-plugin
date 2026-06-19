// Admin API (DESIGN.md §3) — powers the tenant dashboard. SECRET key only.
// Every query is scoped to req.apiKey.tenantId so tenants never see each other's data.

import { Router } from "express";
import { z } from "zod";
import { requireOwner, resolveTenant } from "../middleware/auth.js";
import {
  assignFeedback,
  getTenantKeys,
  inviteMember,
  listFeedbackEvents,
  listMembers,
  listProjectsWithKeys,
  queryFeedback,
  removeMember,
  statsFor,
  updateFeedbackStatus,
  updateProjectOrigins,
  updateProjectPrefix,
  updateProjectTheme,
} from "../store.js";
import { BillingError } from "../store.js";

export const adminRouter = Router();

adminRouter.use(resolveTenant);

// Actor for timeline events from the current request.
const actorOf = (req: import("express").Request) => ({ id: req.userId ?? null, name: req.userName || "API" });

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
  // Reference-ID prefix: letters/numbers/_/- only, so it reads cleanly (e.g. "jicamabug").
  feedbackPrefix: z.string().regex(/^[A-Za-z0-9_-]*$/, "prefix can use letters, numbers, _ and -").max(20).optional(),
});

// PATCH /v1/admin/projects/:id  { allowedOrigins?: string[], theme?: {...} } — OWNER ONLY.
// Lock the public key to specific origins, and/or update the widget theme/branding.
adminRouter.patch("/projects/:id", requireOwner, async (req, res, next) => {
  try {
    const parsed = projectPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: "validation_error", details: parsed.error.flatten() });
    }
    const { allowedOrigins, theme, feedbackPrefix } = parsed.data;
    if (!allowedOrigins && !theme && feedbackPrefix === undefined) {
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

    if (feedbackPrefix !== undefined) {
      updated = await updateProjectPrefix(req.tenantId!, req.params.id, feedbackPrefix);
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
  status: z.enum(["new", "in_progress", "done", "wont_do"]).optional(),
  assigneeId: z.string().nullable().optional(), // null = unassign; "me" = current user
});

// PATCH /v1/admin/feedback/:id  { status?, assigneeId? } — any team member can triage/take.
adminRouter.patch("/feedback/:id", async (req, res, next) => {
  try {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: "validation_error" });
    const { status, assigneeId } = parsed.data;
    if (status === undefined && assigneeId === undefined) {
      return res.status(422).json({ error: "nothing_to_update" });
    }
    const actor = actorOf(req);
    let updated;
    if (assigneeId !== undefined) {
      const who = assigneeId === "me" ? req.userId ?? null : assigneeId;
      updated = await assignFeedback(req.tenantId!, req.params.id, who, actor);
      if (!updated) return res.status(404).json({ error: "not_found" });
    }
    if (status !== undefined) {
      updated = await updateFeedbackStatus(req.tenantId!, req.params.id, status, actor);
      if (!updated) return res.status(404).json({ error: "not_found" });
    }
    res.json(updated);
  } catch (err) {
    if (err instanceof BillingError) return res.status(err.status).json({ error: err.code, message: err.message });
    next(err);
  }
});

// GET /v1/admin/feedback/:id/events — the bug's activity timeline.
adminRouter.get("/feedback/:id/events", async (req, res, next) => {
  try {
    const events = await listFeedbackEvents(req.tenantId!, req.params.id);
    if (events === null) return res.status(404).json({ error: "not_found" });
    res.json({ events });
  } catch (err) {
    next(err);
  }
});

// ---- Team members (RBAC) — owner only ----
adminRouter.get("/members", requireOwner, async (req, res, next) => {
  try {
    res.json({ members: await listMembers(req.tenantId!) });
  } catch (err) {
    next(err);
  }
});

const inviteSchema = z.object({ email: z.string().email(), role: z.enum(["member", "owner"]).optional() });

adminRouter.post("/members", requireOwner, async (req, res, next) => {
  try {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: "validation_error" });
    const member = await inviteMember(req.tenantId!, parsed.data.email, parsed.data.role ?? "member");
    res.status(201).json(member);
  } catch (err) {
    if (err instanceof BillingError) return res.status(err.status).json({ error: err.code, message: err.message });
    next(err);
  }
});

adminRouter.delete("/members/:id", requireOwner, async (req, res, next) => {
  try {
    const ok = await removeMember(req.tenantId!, req.params.id);
    if (!ok) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof BillingError) return res.status(err.status).json({ error: err.code, message: err.message });
    next(err);
  }
});
