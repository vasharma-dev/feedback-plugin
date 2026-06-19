import type { ReactNode } from "react";
import { fullTime, initials, relativeTime } from "../lib/format";
import type { Feedback, FeedbackStatus } from "../types";

const TYPE_META: Record<string, { label: string; cls: string; emoji: string }> = {
  bug: { label: "Bug", emoji: "🐞", cls: "bg-red-50 text-red-700 ring-red-200" },
  idea: { label: "Idea", emoji: "💡", cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  praise: { label: "Praise", emoji: "❤️", cls: "bg-green-50 text-green-700 ring-green-200" },
  question: { label: "Question", emoji: "❓", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
};

const STATUSES: Array<[FeedbackStatus, string]> = [
  ["new", "New"],
  ["in_progress", "In progress"],
  ["done", "Done"],
  ["wont_do", "Won't do"],
];

const STATUS_PILL: Record<FeedbackStatus, string> = {
  new: "bg-brand-50 text-brand-700 ring-brand-200",
  in_progress: "bg-amber-50 text-amber-700 ring-amber-200",
  done: "bg-green-50 text-green-700 ring-green-200",
  wont_do: "bg-slate-100 text-slate-500 ring-slate-200",
};

function Stars({ n }: { n: number | null }) {
  if (!n) return null;
  return (
    <span className="text-amber-400 text-sm tracking-tight" title={`${n} / 5`}>
      {"★".repeat(n)}
      <span className="text-slate-200">{"★".repeat(5 - n)}</span>
    </span>
  );
}

function Meta({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 border border-slate-100 px-2 py-0.5 text-slate-500">
      {children}
    </span>
  );
}

export default function FeedbackCard({
  item,
  onStatus,
}: {
  item: Feedback;
  onStatus: (id: string, status: FeedbackStatus) => void;
}) {
  const m = item.metadata || {};
  const img = item.attachments[0];
  const type = TYPE_META[item.type] ?? { label: item.type, emoji: "•", cls: "bg-slate-100 text-slate-600 ring-slate-200" };
  const who = item.endUser?.email || item.endUser?.id;

  return (
    <div className="group bg-white rounded-2xl border border-slate-200/70 shadow-card hover:shadow-cardHover transition-shadow p-4 animate-fadeInUp">
      <div className="flex items-center gap-2.5">
        <span
          className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ring-inset ${type.cls}`}
        >
          <span aria-hidden>{type.emoji}</span>
          {type.label}
        </span>
        {item.ref && (
          <span className="font-mono text-[11px] font-semibold text-slate-500 bg-slate-100 rounded-md px-1.5 py-0.5" title="Reference ID">
            {item.ref}
          </span>
        )}
        <Stars n={item.rating} />
        <span className="text-slate-400 text-xs" title={fullTime(item.createdAt)}>
          {relativeTime(item.createdAt)}
        </span>

        <div className="ml-auto relative">
          <select
            className={`appearance-none text-xs font-medium rounded-full ring-1 ring-inset pl-3 pr-7 py-1.5
              cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-300 transition ${STATUS_PILL[item.status]}`}
            value={item.status}
            onChange={(e) => onStatus(item.id, e.target.value as FeedbackStatus)}
            aria-label="Change status"
          >
            {STATUSES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <svg
            className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>

      <p className="mt-3 text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap">
        {item.message}
      </p>

      {img && (
        <a href={img.dataUrl} target="_blank" rel="noreferrer" className="inline-block mt-3">
          <img
            src={img.dataUrl}
            alt={img.filename || "screenshot"}
            className="max-h-40 rounded-xl border border-slate-200 hover:opacity-90 transition"
          />
        </a>
      )}

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap text-xs">
        {who && (
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-600">
            <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-[10px] font-semibold">
              {initials(who)}
            </span>
            {who}
          </span>
        )}
        {m.browser && m.browser !== "unknown" && <Meta>🌐 {m.browser}</Meta>}
        {m.os && m.os !== "unknown" && <Meta>🖥 {m.os}</Meta>}
        {m.device && <Meta>{m.device === "mobile" ? "📱" : "💻"} {m.device}</Meta>}
        {m.url && (
          <a
            className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 hover:underline ml-auto"
            href={m.url}
            target="_blank"
            rel="noreferrer"
          >
            View source ↗
          </a>
        )}
      </div>
    </div>
  );
}
