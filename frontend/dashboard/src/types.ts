export type FeedbackType = "bug" | "idea" | "praise" | "question";
export type FeedbackStatus = "new" | "in_progress" | "done" | "wont_do";

export interface Attachment {
  id: string;
  filename: string;
  mime: string;
  dataUrl: string;
}

export interface Feedback {
  id: string;
  ref: string | null;
  groupId: string | null;
  summary: string | null;
  module: string | null;
  similarCount?: number;
  type: FeedbackType;
  message: string;
  severity: string | null;
  rating: number | null;
  status: FeedbackStatus;
  assigneeId: string | null;
  assigneeName?: string | null;
  endUser: { id?: string; email?: string; name?: string; phone?: string } | null;
  metadata: Record<string, string>;
  attachments: Attachment[];
  createdAt: string;
}

export interface Stats {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  avgRating: number | null;
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
  nameField: string;
  phoneField: string;
  severityField: boolean;
  hideBranding: boolean;
}

export interface Project {
  id: string;
  tenantId: string;
  name: string;
  publicKey?: string | null;
  feedbackPrefix?: string;
  settings: {
    theme: WidgetTheme;
    allowedOrigins: string[];
  };
}

// ---- Billing ----
export interface Plan {
  id: string;
  name: string;
  priceCents: number;
  priceLabel?: string;
  monthlyQuota: number;
  projects: number;
  tagline: string;
  features: string[];
  popular?: boolean;
}

export interface CardOnFile {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface Tenant {
  id: string;
  name: string;
  plan: string;
  tokenBalance: number;
  billingEmail: string | null;
  subStatus: string;
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  card: CardOnFile | null;
}

export interface TokenPack {
  id: string;
  name: string;
  tokens: number;
  priceCents: number;
  priceLabel?: string;
  tagline: string;
  popular?: boolean;
}

export interface BillingResponse {
  tenant: Tenant;
  usage: { used: number; quota: number; remaining: number };
  tokenBalance: number;
  packs: TokenPack[];
  stripeEnabled?: boolean; // true → buying redirects to Stripe Checkout; false → simulated form
  plan: Plan;
  plans?: Plan[];
}

export interface Invoice {
  id: string;
  plan: string;
  amountCents: number;
  currency: string;
  status: string;
  cardBrand: string | null;
  cardLast4: string | null;
  description: string;
  periodStart: string;
  periodEnd: string | null;
  createdAt: string;
}

export interface CardInput {
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
  name?: string;
}
