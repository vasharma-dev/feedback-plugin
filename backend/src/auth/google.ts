// Real Google OAuth 2.0 (authorization-code flow), implemented with plain fetch — no SDK.
// Only used when GOOGLE_CLIENT_ID/SECRET are set; otherwise the mock sign-in page is served.

import { google } from "../config.js";

export interface GoogleProfile {
  email: string;
  name: string;
  avatarUrl: string | null;
  googleId: string;
}

/** Build the Google consent-screen URL to redirect the user to. */
export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: google.clientId,
    redirect_uri: google.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Exchange the authorization code for the user's verified Google profile. */
export async function exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: google.clientId,
      client_secret: google.clientSecret,
      redirect_uri: google.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!tokenRes.ok) {
    throw new Error(`google_token_exchange_failed_${tokenRes.status}`);
  }
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error("google_no_access_token");

  const infoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoRes.ok) throw new Error(`google_userinfo_failed_${infoRes.status}`);
  const info = (await infoRes.json()) as {
    sub: string;
    email: string;
    name?: string;
    picture?: string;
  };
  return {
    email: info.email,
    name: info.name || info.email.split("@")[0],
    avatarUrl: info.picture || null,
    googleId: info.sub,
  };
}
