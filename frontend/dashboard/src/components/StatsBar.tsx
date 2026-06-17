import type { Stats } from "../types";
import { BugIcon, FolderIcon, InboxIcon, LightbulbIcon, StarIcon } from "./icons";

type Card = {
  label: string;
  value: string | number;
  hint?: string;
  icon: JSX.Element;
  tone: string; // tailwind classes for the icon chip
};

export default function StatsBar({ stats }: { stats: Stats }) {
  const open = (stats.byStatus.new || 0) + (stats.byStatus.in_progress || 0);
  const cards: Card[] = [
    {
      label: "Total feedback",
      value: stats.total,
      icon: <InboxIcon className="w-5 h-5" />,
      tone: "bg-slate-100 text-slate-600",
    },
    {
      label: "Open",
      value: open,
      hint: open > 0 ? "needs triage" : "all clear",
      icon: <FolderIcon className="w-5 h-5" />,
      tone: "bg-brand-100 text-brand-700",
    },
    {
      label: "Avg rating",
      value: stats.avgRating != null ? stats.avgRating.toFixed(1) : "—",
      hint: stats.avgRating != null ? "out of 5" : undefined,
      icon: <StarIcon className="w-5 h-5" />,
      tone: "bg-amber-100 text-amber-600",
    },
    {
      label: "Bugs",
      value: stats.byType.bug || 0,
      icon: <BugIcon className="w-5 h-5" />,
      tone: "bg-red-100 text-red-600",
    },
    {
      label: "Ideas",
      value: stats.byType.idea || 0,
      icon: <LightbulbIcon className="w-5 h-5" />,
      tone: "bg-blue-100 text-blue-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-white rounded-2xl border border-slate-200/70 shadow-card px-4 py-3.5 flex items-start gap-3"
        >
          <div className={`shrink-0 w-9 h-9 rounded-xl grid place-items-center ${c.tone}`}>
            {c.icon}
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-bold tracking-tight text-slate-900 leading-none">
              {c.value}
            </div>
            <div className="text-[13px] text-slate-500 mt-1 truncate">{c.label}</div>
            {c.hint && <div className="text-[11px] text-slate-400 mt-0.5">{c.hint}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
