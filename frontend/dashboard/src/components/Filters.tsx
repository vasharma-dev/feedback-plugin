import type { Filters } from "../api";
import { SearchIcon } from "./icons";

const STATUSES = [
  ["", "All statuses"],
  ["new", "New"],
  ["in_progress", "In progress"],
  ["done", "Done"],
  ["wont_do", "Won't do"],
] as const;

const TYPES = [
  ["", "All types"],
  ["bug", "Bug"],
  ["idea", "Idea"],
  ["praise", "Praise"],
  ["question", "Question"],
] as const;

const selectCls =
  "appearance-none pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 " +
  "shadow-card hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 " +
  "transition cursor-pointer bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2394a3b8%22 stroke-width=%223%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-no-repeat bg-[right_0.6rem_center]";

export default function FiltersBar({
  filters,
  onChange,
  count,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  count?: number;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  return (
    <div className="flex items-center gap-2 flex-wrap mb-5">
      <div className="relative flex-1 min-w-[220px]">
        <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700
            placeholder:text-slate-400 shadow-card hover:border-slate-300 focus:outline-none
            focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
          placeholder="Search feedback…"
          value={filters.q || ""}
          onChange={(e) => set({ q: e.target.value || undefined })}
        />
      </div>
      <select
        className={selectCls}
        value={filters.status || ""}
        onChange={(e) => set({ status: e.target.value || undefined })}
      >
        {STATUSES.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <select
        className={selectCls}
        value={filters.type || ""}
        onChange={(e) => set({ type: e.target.value || undefined })}
      >
        {TYPES.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {count != null && (
        <span className="text-sm text-slate-400 ml-auto tabular-nums">
          {count} {count === 1 ? "result" : "results"}
        </span>
      )}
    </div>
  );
}
