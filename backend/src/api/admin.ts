// Admin API (DESIGN.md §3) — powers the tenant dashboard. SECRET key only.
// Every query is scoped to req.apiKey.tenantId so tenants never see each other's data.

import { Router } from "express";
import { z } from "zod";
import { requireSecretKey } from "../middleware/auth.js";
import {
  listProjects,
  queryFeedback,
  statsFor,
  updateFeedbackStatus,
} from "../store.js";

export const adminRouter = Router();

adminRouter.use(requireSecretKey);

// GET /v1/admin/projects
adminRouter.get("/projects", async (req, res, next) => {
  try {
    res.json({ projects: await listProjects(req.apiKey!.tenantId) });
  } catch (err) {
    next(err);
  }
});

// GET /v1/admin/stats
adminRouter.get("/stats", async (req, res, next) => {
  try {
    res.json(await statsFor(req.apiKey!.tenantId));
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
    const items = await queryFeedback({ tenantId: req.apiKey!.tenantId, ...parsed.data });
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
      req.apiKey!.tenantId,
      req.params.id,
      parsed.data.status
    );
    if (!updated) return res.status(404).json({ error: "not_found" });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
