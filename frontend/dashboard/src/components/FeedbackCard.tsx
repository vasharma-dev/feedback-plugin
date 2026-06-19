import { useState, type ReactNode } from "react";
import { getEvents, type FeedbackEvent } from "../api";
import { fullTime, initials, relativeTime } from "../lib/format";
import type { Feedback, FeedbackStatus } from "../types";

const EVENT_ICON: Record<string, string> = { created: "📥", status: "🏷️", assigned: "🙋", unassigned: "↩️", comment: "💬" };
function eventText(e: FeedbackEvent): string {
  if (e.kind === "created") return "reported this";
  if (e.kind === "status") return `set status to ${e.detail.replace("_", " ")}`;
  if (e.kind === "assigned") return `took this${e.detail ? ` (→ ${e.detail})` : ""}`;
  if (e.kind === "unassigned") return "unassigned this";
  return e.detail;
}

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
  apiKey,
  onStatus,
  onTake,
}: {
  item: Feedback;
  apiKey: string;
  onStatus: (id: string, status: FeedbackStatus) => void;
  onTake: (id: string) => void;
}) {
  const m = item.metadata || {};
  const img = item.attachments[0];
  const type = TYPE_META[item.type] ?? { label: item.type, emoji: "•", cls: "bg-slate-100 text-slate-600 ring-slate-200" };
  const who = item.endUser?.email || item.endUser?.id;

  const [showActivity, setShowActivity] = useState(false);
  const [events, setEvents] = useState<FeedbackEvent[] | null>(null);
  function toggleActivity() {
    const next = !showActivity;
    setShowActivity(next);
    if (next && !events) getEvents(apiKey, item.id).then(setEvents).catch(() => setEvents([]));
  }

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
        {item.module && (
          <span className="text-[11px] font-medium text-violet-700 bg-violet-50 ring-1 ring-inset ring-violet-200 rounded-md px-1.5 py-0.5" title="AI-detected module">
            {item.module}
          </span>
        )}
        {item.groupId ? (
          <span className="text-[11px] font-medium text-slate-500 bg-slate-100 rounded-md px-1.5 py-0.5" title="Grouped as a duplicate of an earlier report">
            ↳ duplicate
          </span>
        ) : item.similarCount ? (
          <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 ring-1 ring-inset ring-amber-200 rounded-md px-1.5 py-0.5" title="Similar reports grouped under this one">
            🔁 {item.similarCount + 1} reports
          </span>
        ) : null}
        <Stars n={item.rating} />
        <span className="text-slate-400 text-xs" title={fullTime(item.createdAt)}>
          {relativeTime(item.createdAt)}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {item.assigneeName ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600" title={`Assigned to ${item.assigneeName}`}>
              <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-[10px] font-semibold">
                {initials(item.assigneeName)}
              </span>
              {item.assigneeName}
            </span>
          ) : (
            <button
              onClick={() => onTake(item.id)}
              className="text-xs font-semibold text-brand-700 border border-brand-200 hover:bg-brand-50 rounded-full px-3 py-1.5 transition"
              title="Assign to me and mark in progress"
            >
              Take
            </button>
          )}
          <div className="relative">
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
      </div>

      <p className="mt-3 text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap">
        {item.message}
      </p>

      {item.summary && (
        <p className="mt-2 text-[13px] text-slate-500 flex items-start gap-1.5">
          <span aria-hidden>✨</span>
          <span><span className="font-medium text-slate-600">AI:</span> {item.summary}</span>
        </p>
      )}

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

      {/* activity timeline */}
      <button
        onClick={toggleActivity}
        className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
      >
        <span className={`transition-transform ${showActivity ? "rotate-90" : ""}`}>▸</span> Activity
      </button>
      {showActivity && (
        <ol className="mt-2 pl-1 space-y-2 border-l-2 border-slate-100">
          {!events ? (
            <li className="text-xs text-slate-400 pl-3">Loading…</li>
          ) : events.length === 0 ? (
            <li className="text-xs text-slate-400 pl-3">No activity yet.</li>
          ) : (
            events.map((e) => (
              <li key={e.id} className="relative pl-4 text-xs text-slate-600">
                <span className="absolute -left-[7px] top-0.5 text-[10px]">{EVENT_ICON[e.kind] || "•"}</span>
                <span className="font-medium text-slate-700">{e.actorName}</span> {eventText(e)}
                <span className="text-slate-400" title={fullTime(e.createdAt)}> · {relativeTime(e.createdAt)}</span>
              </li>
            ))
          )}
        </ol>
      )}
    </div>
  );
}
