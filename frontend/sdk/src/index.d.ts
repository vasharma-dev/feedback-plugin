export interface FeedbackUser {
  id?: string;
  email?: string;
  name?: string;
  phone?: string;
}

export interface FeedbackTheme {
  color?: string;
  position?: "bottom-right" | "bottom-left";
  launcherText?: string;
  launcherIcon?: string;
  headerTitle?: string;
  headerSubtitle?: string;
  dialogBg?: string;
  emailField?: "off" | "optional" | "required";
  nameField?: "off" | "optional" | "required";
  phoneField?: "off" | "optional" | "required";
  severityField?: boolean;
  hideBranding?: boolean;
}

export interface InitOptions {
  key: string;
  api?: string;
  widgetUrl?: string;
  user?: FeedbackUser | null;
  theme?: FeedbackTheme;
}

export interface SubmitInput {
  type: "bug" | "idea" | "praise" | "question";
  message: string;
  severity?: "low" | "medium" | "high" | "critical" | null;
  rating?: number | null;
  user?: FeedbackUser | null;
  metadata?: Record<string, unknown>;
  attachments?: Array<{ filename: string; mime: string; dataUrl: string }>;
}

export interface SubmitResult {
  id: string;
  status: string;
  createdAt: string;
}

export declare const Feedback: {
  init(opts: InitOptions): typeof Feedback;
  open(): Promise<void>;
  submit(input: SubmitInput): Promise<SubmitResult>;
};

export default Feedback;
