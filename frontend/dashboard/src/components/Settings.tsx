import { useCallback, useEffect, useState } from "react";
import { getProjects, patchProjectOrigins } from "../api";
import type { Project } from "../types";
import { CheckIcon } from "./icons";

export default function Settings({ apiKey }: { apiKey: string }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setProjects(await getProjects(apiKey));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [apiKey]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
        ⚠ {error}
      </div>
    );
  }
  if (!projects) return <div className="text-slate-400 py-10 text-center">Loading projects…</div>;
  if (projects.length === 0)
    return <div className="text-slate-400 py-10 text-center">No projects yet.</div>;

  return (
    <div className="space-y-5">
      {projects.map((p) => (
        <ApiKeyCard key={`k-${p.id}`} project={p} />
      ))}

      <div className="bg-brand-50 border border-brand-100 rounded-2xl px-5 py-4 text-sm text-slate-600">
        <span className="font-semibold text-brand-700">Allowed origins</span> lock a project's{" "}
        <span className="font-mono text-xs">pk_…</span> public key to the sites you choose. If the
        key leaks, a browser on any other site is rejected with <code>403</code>. Server-to-server
        REST calls (no <code>Origin</code> header) are always allowed.
      </div>
      {projects.map((p) => (
        <OriginEditor key={p.id} apiKey={apiKey} project={p} />
      ))}
    </div>
  );
}

function ApiKeyCard({ project }: { project: Project }) {
  const [copied, setCopied] = useState<"key" | "snippet" | null>(null);
  const pk = project.publicKey || "pk_…";
  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-backend";
  const snippet = `<script src="${origin}/frontend/widget/feedback.js"\n        data-key="${pk}"\n        data-api="${origin}"></script>`;

  async function copy(text: string, which: "key" | "snippet") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-card p-5">
      <div className="font-semibold text-slate-900">Your API key</div>
      <p className="text-sm text-slate-500 mt-0.5">
        This is your <span className="font-medium">public</span> key — put it in your site's widget. It's safe to expose.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 font-mono text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 truncate">
          {pk}
        </code>
        <button
          onClick={() => copy(pk, "key")}
          className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2.5 transition"
        >
          {copied === "key" ? "Copied!" : "Copy"}
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm font-medium text-slate-700">Embed snippet</div>
        <button onClick={() => copy(snippet, "snippet")} className="text-xs font-medium text-brand-700 hover:text-brand-800">
          {copied === "snippet" ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="mt-1.5 text-xs bg-slate-900 text-slate-100 rounded-xl p-3 overflow-x-auto whitespace-pre">{snippet}</pre>

      <p className="text-xs text-slate-400 mt-2">
        Your <span className="font-medium">secret</span> key (for the REST admin API) was shown once at sign-up — you sign in here with Google, so you won't need it for the dashboard.
      </p>
    </div>
  );
}

function isLocked(origins: string[]): boolean {
  return !origins.includes("*");
}

function OriginEditor({ apiKey, project }: { apiKey: string; project: Project }) {
  const initial = project.settings.allowedOrigins;
  const [mode, setMode] = useState<"any" | "locked">(isLocked(initial) ? "locked" : "any");
  const [origins, setOrigins] = useState<string[]>(
    isLocked(initial) ? (initial.length ? initial : [""]) : [""]
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setAt(i: number, v: string) {
    setOrigins((o) => o.map((x, idx) => (idx === i ? v : x)));
  }
  function addRow() {
    setOrigins((o) => [...o, ""]);
  }
  function removeRow(i: number) {
    setOrigins((o) => (o.length === 1 ? [""] : o.filter((_, idx) => idx !== i)));
  }

  async function save() {
    setErr(null);
    setSaved(false);
    const payload = mode === "any" ? ["*"] : origins.map((o) => o.trim()).filter(Boolean);
    setBusy(true);
    try {
      const updated = await patchProjectOrigins(apiKey, project.id, payload);
      const next = updated.settings.allowedOrigins;
      setMode(isLocked(next) ? "locked" : "any");
      setOrigins(isLocked(next) ? (next.length ? next : [""]) : [""]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const radio = "flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition";

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-900">{project.name}</div>
          <div className="text-xs text-slate-400 font-mono mt-0.5">{project.id}</div>
        </div>
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ring-1 ring-inset ${
            mode === "any"
              ? "bg-amber-50 text-amber-700 ring-amber-200"
              : "bg-green-50 text-green-700 ring-green-200"
          }`}
        >
          {mode === "any" ? "Open to any site" : "Locked"}
        </span>
      </div>

      <div className="mt-4 grid sm:grid-cols-2 gap-3">
        <label className={`${radio} ${mode === "any" ? "border-brand-400 ring-2 ring-brand-100" : "border-slate-200"}`}>
          <input
            type="radio"
            className="mt-0.5 accent-brand-600"
            checked={mode === "any"}
            onChange={() => setMode("any")}
          />
          <span>
            <span className="block text-sm font-medium text-slate-800">Allow any site</span>
            <span className="block text-xs text-slate-500">
              <code>*</code> — fine for development.
            </span>
          </span>
        </label>
        <label className={`${radio} ${mode === "locked" ? "border-brand-400 ring-2 ring-brand-100" : "border-slate-200"}`}>
          <input
            type="radio"
            className="mt-0.5 accent-brand-600"
            checked={mode === "locked"}
            onChange={() => setMode("locked")}
          />
          <span>
            <span className="block text-sm font-medium text-slate-800">Lock to specific origins</span>
            <span className="block text-xs text-slate-500">Only the sites you list below.</span>
          </span>
        </label>
      </div>

      {mode === "locked" && (
        <div className="mt-4 space-y-2">
          {origins.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={o}
                onChange={(e) => setAt(i, e.target.value)}
                spellCheck={false}
                placeholder="https://app.example.com"
                className="flex-1 font-mono text-sm px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
              />
              <button
                onClick={() => removeRow(i)}
                className="shrink-0 w-9 h-9 grid place-items-center rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                title="Remove"
                aria-label="Remove origin"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={addRow}
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            + Add origin
          </button>
        </div>
      )}

      {err && (
        <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          ⚠ {err}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition"
        >
          {busy ? "Saving…" : "Save origins"}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-green-600 font-medium">
            <CheckIcon className="w-4 h-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
