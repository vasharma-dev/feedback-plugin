// Session cookie helpers + the simulated Google identity.
// The cookie holds an opaque server-side session token (see store.ts createSession).

import type { Request, Response } from "express";

export const SESSION_COOKIE = "jicama_sess";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function readSessionCookie(req: Request): string | undefined {
  return req.cookies?.[SESSION_COOKIE];
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, // not readable by page JS — mitigates XSS token theft
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

/**
 * Stand-in for a real Google OAuth callback. In production you'd exchange the auth code
 * for the user's verified Google profile; here the "Sign in with Google" page posts the
 * chosen email/name straight back, and we trust it (test mode only).
 */
export function mockGoogleProfile(input: { email: string; name?: string }) {
  const email = String(input.email || "").trim().toLowerCase();
  const name = (input.name || "").trim() || email.split("@")[0];
  return {
    email,
    name,
    // Deterministic fake "sub" + avatar so the same email maps to the same identity.
    googleId: `mock_${email}`,
    avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
  };
}
