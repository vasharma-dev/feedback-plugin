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
