// Runtime platform settings (editable by the Super Admin), cached in memory so the rest of the
// app can read them synchronously. Currently: the Stripe secret key — set it from the panel and
// payments switch on, no restart. Falls back to the STRIPE_SECRET_KEY env var if unset.

import { stripe as stripeEnv } from "./config.js";
import { prisma } from "./db.js";

const STRIPE_KEY = "stripe_secret_key";
const cache: Record<string, string> = {};

/** Load all settings into the cache (call once on boot). */
export async function loadSettings(): Promise<void> {
  const rows = await prisma.setting.findMany();
  for (const r of rows) cache[r.key] = r.value;
}

export function getStripeSecretKey(): string {
  return cache[STRIPE_KEY] || stripeEnv.secretKey || "";
}

export function isStripeConfigured(): boolean {
  return Boolean(getStripeSecretKey());
}

/** Set (or clear, with an empty string) the Stripe secret key — persisted + cached live. */
export async function setStripeSecretKey(value: string): Promise<void> {
  const v = (value || "").trim();
  if (v) {
    await prisma.setting.upsert({ where: { key: STRIPE_KEY }, update: { value: v }, create: { key: STRIPE_KEY, value: v } });
    cache[STRIPE_KEY] = v;
  } else {
    await prisma.setting.deleteMany({ where: { key: STRIPE_KEY } });
    delete cache[STRIPE_KEY];
  }
}

/** A display-safe view of a key: "sk_test_••••1234". */
export function maskKey(key: string): string {
  if (!key) return "";
  const head = key.slice(0, 8);
  const tail = key.slice(-4);
  return `${head}${"•".repeat(6)}${tail}`;
}
