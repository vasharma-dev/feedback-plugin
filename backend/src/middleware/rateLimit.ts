// Fixed-window rate limiter (DESIGN.md §8 — spam/bot protection).
// Keyed per API key id + client IP.
//
// The counter lives behind a small RateLimitStore interface so the in-memory store (fine for a
// single instance) can be swapped for Redis in a multi-instance deployment without touching the
// middleware. To go to Redis: implement `hit()` with INCR + PEXPIRE and set REDIS_URL.

import type { NextFunction, Request, Response } from "express";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

export interface RateLimitStore {
  /** Record a hit for `key` in the current window; return the running count + when it resets. */
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

// ---- Default: in-memory store (per-process). ----
class MemoryStore implements RateLimitStore {
  private hits = new Map<string, { count: number; resetAt: number }>();

  async hit(key: string, windowMs: number) {
    const now = Date.now();
    if (this.hits.size > 5000) this.sweep(now); // opportunistic cleanup under churn
    const entry = this.hits.get(key);
    if (!entry || now > entry.resetAt) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.hits.set(key, fresh);
      return fresh;
    }
    entry.count += 1;
    return entry;
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (now > v.resetAt) this.hits.delete(k);
  }
}

// Swap this for a RedisStore when REDIS_URL is configured (see note above).
const store: RateLimitStore = new MemoryStore();

export async function rateLimit(req: Request, res: Response, next: NextFunction) {
  try {
    // Key on the API key's id (never the secret) + IP.
    const id = `${req.apiKey?.id ?? "anon"}:${req.ip}`;
    const { count, resetAt } = await store.hit(id, WINDOW_MS);
    if (count > MAX_PER_WINDOW) {
      res.setHeader("Retry-After", Math.ceil((resetAt - Date.now()) / 1000));
      return res.status(429).json({ error: "rate_limited" });
    }
    next();
  } catch (err) {
    next(err);
  }
}
