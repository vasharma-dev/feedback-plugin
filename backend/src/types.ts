// Core domain types — mirror DESIGN.md §6 (Data model).
// In the prototype these live in memory; the same shapes map 1:1 to Prisma models later.

export type Plan = "free" | "pro" | "enterprise";

export type FeedbackType = "bug" | "idea" | "praise" | "question";
export type FeedbackStatus = "new" | "in_progress" | "done" | "wont_do";

export type SubStatus = "active" | "past_due" | "canceled" | "trialing";

export interface CardOnFile {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface Tenant {
  id: string;
  name: string;
  website: string | null;
  plan: Plan;
  tokenBalance: number;
  createdAt: string;
  billingEmail: string | null;
  subStatus: SubStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  card: CardOnFile | null;
}

export interface Payment {
  id: string;
  tenantId: string;
  plan: Plan;
  amountCents: number;
  currency: string;
  status: "paid" | "failed" | "refunded";
  cardBrand: string | null;
  cardLast4: string | null;
  description: string;
  periodStart: string;
  periodEnd: string | null;
  createdAt: string;
}

export interface WidgetTheme {
  color: string;
  position: "bottom-right" | "bottom-left";
  launcherText: string;
  launcherIcon: string;
  headerTitle: string;
  headerSubtitle: string;
  dialogBg: string;
  emailField: string; // off | optional | required
  nameField: string; // off | optional | required
  phoneField: string; // off | optional | required
  severityField: boolean; // show the Severity dropdown
  hideBranding: boolean;
}

export interface Project {
  id: string;
  tenantId: string;
  name: string;
  feedbackPrefix: string; // "" = no custom reference; else e.g. "jicamabug"
  settings: {
    theme: WidgetTheme;
    allowedOrigins: string[]; // ["*"] in dev; real domains in prod
  };
}

// ApiKey: public keys (pk_) can only create feedback for one project.
// Secret keys (sk_) authenticate the dashboard and are scoped to the whole tenant.
export interface ApiKey {
  id: string;
  tenantId: string;
  projectId: string | null; // public keys belong to a project; secret keys are tenant-wide
  key: string | null; // plaintext for PUBLIC keys only (embedded in HTML); null for secrets (hash-only)
  kind: "public" | "secret";
  active: boolean;
}

export interface FeedbackMetadata {
  url?: string;
  browser?: string;
  os?: string;
  device?: string;
  screen?: string;
  appVersion?: string;
  [k: string]: unknown;
}

export interface Attachment {
  id: string;
  filename: string;
  mime: string;
  dataUrl: string; // prototype inlines as data URL; production uploads to S3/R2
}

export interface Feedback {
  id: string;
  ref: string | null; // human-friendly reference, e.g. "jicamabug01"
  groupId: string | null; // canonical feedback id this duplicates (null = canonical)
  summary: string | null; // AI one-line context
  module: string | null; // AI-derived area/module
  similarCount?: number; // duplicates grouped under this one (computed, canonicals only)
  projectId: string;
  tenantId: string;
  type: FeedbackType;
  message: string;
  severity: string | null; // low | medium | high | critical
  rating: number | null; // 1..5
  status: FeedbackStatus;
  assigneeId: string | null; // team member working on it
  assigneeName?: string | null; // resolved display name (list view)
  endUser: { id?: string; email?: string; name?: string; phone?: string } | null;
  metadata: FeedbackMetadata;
  attachments: Attachment[];
  createdAt: string;
}
