// Public Ingest API (DESIGN.md §3) — receives feedback from widget / SDK / REST.
// Authed with a PUBLIC key only. The project + tenant come from the key, never the body.

import { Router } from "express";
import { z } from "zod";
import { requirePublicKey } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { createFeedback, spendToken } from "../store.js";

export const ingestRouter = Router();

const attachmentSchema = z.object({
  filename: z.string().max(200),
  mime: z.string().max(100),
  dataUrl: z.string().max(5_000_000), // ~5MB inlined; prod uploads to object storage
});

const feedbackSchema = z.object({
  type: z.enum(["bug", "idea", "praise", "question"]),
  message: z.string().min(1).max(5000),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  // honeypot: real users never fill this hidden field; bots do.
  // Accept any value here so we can drop it *silently* below rather than 422-ing
  // (a validation error would tell the bot it tripped a trap).
  _hp: z.string().optional(),
  endUser: z
    .object({ id: z.string().max(200).optional(), email: z.string().email().optional() })
    .nullable()
    .optional(),
  metadata: z.record(z.unknown()).optional(),
  attachments: z.array(attachmentSchema).max(3).optional(),
});

// POST /v1/feedback
ingestRouter.post("/feedback", requirePublicKey, rateLimit, async (req, res, next) => {
  try {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: "validation_error", details: parsed.error.flatten() });
    }
    const body = parsed.data;
    if (body._hp) return res.status(202).json({ ok: true }); // silently drop bots

    const project = req.project!;

    // Tokens are the currency: spend one per accepted feedback. Atomic — returns false when
    // the balance is 0, so we reject before writing anything.
    const spent = await spendToken(project.tenantId);
    if (!spent) {
      return res.status(402).json({
        error: "out_of_tokens",
        message: "You're out of feedback tokens. Buy a token pack to accept more.",
      });
    }

    const fb = await createFeedback({
      projectId: project.id,
      tenantId: project.tenantId,
      type: body.type,
      message: body.message,
      rating: body.rating ?? null,
      endUser: body.endUser ?? null,
      metadata: body.metadata ?? {},
      attachments: body.attachments ?? [],
    });

    res.status(201).json({ id: fb.id, status: fb.status, createdAt: fb.createdAt });
  } catch (err) {
    next(err);
  }
});

// Lets the widget pull the project's theme/config without a secret key.
// GET /v1/config
ingestRouter.get("/config", requirePublicKey, (req, res) => {
  const project = req.project!;
  res.json({
    projectId: project.id,
    name: project.name,
    theme: project.settings.theme,
  });
});
