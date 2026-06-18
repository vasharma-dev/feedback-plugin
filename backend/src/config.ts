// Runtime configuration for the optional production integrations.
//
// Both real Google OAuth and real Stripe are OPT-IN: set the env vars and they switch on;
// leave them unset and the app falls back to the simulated mock login / simulated charge,
// so the prototype still runs with zero setup.

export const APP_URL = (process.env.APP_URL || "http://localhost:4000").replace(/\/$/, "");

export const google = {
  clientId: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  // Must exactly match an "Authorized redirect URI" in your Google Cloud OAuth client.
  redirectUri: `${APP_URL}/auth/google/callback`,
};

export function isGoogleConfigured(): boolean {
  return Boolean(google.clientId && google.clientSecret);
}

export const stripe = {
  secretKey: process.env.STRIPE_SECRET_KEY || "",
};

export function isStripeConfigured(): boolean {
  return Boolean(stripe.secretKey);
}

// Super Admin (platform owner) seed credentials. Override in .env for anything real.
export const superAdmin = {
  email: (process.env.SUPERADMIN_EMAIL || "super@jicama.tech").trim().toLowerCase(),
  password: process.env.SUPERADMIN_PASSWORD || "jicama-super-2026",
};

// Attachment storage backend: "inline" keeps the data-URL in the DB row (zero setup);
// "filesystem" writes the blob to disk and stores a URL (the production shape — swap for S3/R2).
export type StorageMode = "inline" | "filesystem";
export function storageMode(): StorageMode {
  return process.env.STORAGE === "filesystem" ? "filesystem" : "inline";
}
