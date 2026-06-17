// Plan catalogue — the single source of truth for pricing, usage limits and features.
// The billing API, quota enforcement, signup page and dashboard all read from here so a
// price/limit change is made in exactly one place.
//
// Prototype note: charges are SIMULATED (test mode). To go live with Stripe you'd map each
// plan id to a Stripe Price id and replace the simulated charge in store.ts with a real
// PaymentIntent — nothing else in the app needs to change.

export type PlanId = "free" | "pro" | "enterprise";

export interface Plan {
  id: PlanId;
  name: string;
  priceCents: number; // per month
  /** Max feedback submissions accepted per billing month. */
  monthlyQuota: number;
  /** Max projects (widgets) the tenant can run. */
  projects: number;
  tagline: string;
  features: string[];
  popular?: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceCents: 0,
    monthlyQuota: 100,
    projects: 1,
    tagline: "For side-projects and trying things out.",
    features: ["Up to 100 feedback / month", "1 project", "Widget + SDK + REST API", "Community support"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceCents: 2900,
    monthlyQuota: 5000,
    projects: 5,
    tagline: "For growing products that need volume.",
    popular: true,
    features: [
      "Up to 5,000 feedback / month",
      "5 projects",
      "Screenshots & attachments",
      "Priority email support",
      "Usage analytics",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceCents: 9900,
    monthlyQuota: 100000,
    projects: 100,
    tagline: "For scale, security and white-labeling.",
    features: [
      "Up to 100,000 feedback / month",
      "Unlimited projects",
      "White-labeling",
      "SSO & team roles",
      "Dedicated support + SLA",
    ],
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && (PLAN_IDS as string[]).includes(v);
}

export function getPlan(id: string): Plan {
  return PLANS[(isPlanId(id) ? id : "free")];
}

/** "$29 / mo" or "Free". */
export function formatPrice(cents: number): string {
  if (cents === 0) return "Free";
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)} / mo`;
}

// ====================================================================================
// Token packs — the prototype's currency for accepting feedback (1 feedback = 1 token).
// Buying a pack is a one-off simulated charge that tops up the tenant's balance.
// ====================================================================================
export type PackId = "starter" | "growth" | "scale";

export interface TokenPack {
  id: PackId;
  name: string;
  tokens: number;
  priceCents: number;
  tagline: string;
  popular?: boolean;
}

export const TOKEN_PACKS: Record<PackId, TokenPack> = {
  starter: { id: "starter", name: "Starter", tokens: 1_000, priceCents: 900, tagline: "1,000 feedback submissions." },
  growth: { id: "growth", name: "Growth", tokens: 10_000, priceCents: 7900, tagline: "10,000 submissions — best value.", popular: true },
  scale: { id: "scale", name: "Scale", tokens: 100_000, priceCents: 59900, tagline: "100,000 submissions for high volume." },
};

export const PACK_IDS = Object.keys(TOKEN_PACKS) as PackId[];

export function isPackId(v: unknown): v is PackId {
  return typeof v === "string" && (PACK_IDS as string[]).includes(v);
}

export function getPack(id: string): TokenPack | undefined {
  return isPackId(id) ? TOKEN_PACKS[id] : undefined;
}

/** "$9" — one-off pack price (not monthly). */
export function formatPackPrice(cents: number): string {
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}

/** Free starter token grant for a new org, based on the plan it signs up on. */
export function starterTokens(planId: string): number {
  return getPlan(planId).monthlyQuota;
}
