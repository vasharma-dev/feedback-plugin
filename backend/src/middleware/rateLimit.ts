// Minimal fixed-window rate limiter (DESIGN.md §8 — spam/bot protection).
// Keyed per API key + client IP. In-memory; production would use Redis.

import type { NextFunction, Request, Response } from "express";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

const hits = new Map<string, { count: number; resetAt: number }>();

// Drop expired windows so the map can't grow unbounded under key/IP churn.
function sweep(now: number) {
  for (const [k, v] of hits) {
    if (now > v.resetAt) hits.delete(k);
  }
}

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  const id = `${req.apiKey?.key ?? "anon"}:${req.ip}`;
  const now = Date.now();
  // Opportunistic cleanup: cheap, and only when the map is large enough to matter.
  if (hits.size > 5000) sweep(now);
  const entry = hits.get(id);

  if (!entry || now > entry.resetAt) {
    hits.set(id, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }
  if (entry.count >= MAX_PER_WINDOW) {
    res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
    return res.status(429).json({ error: "rate_limited" });
  }
  entry.count += 1;
  next();
}
