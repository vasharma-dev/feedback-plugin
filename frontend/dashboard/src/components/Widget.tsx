import { useCallback, useEffect, useMemo, useState } from "react";
import { getProjects, patchProjectTheme } from "../api";
import type { Project, WidgetTheme } from "../types";
import { CheckIcon } from "./icons";

const DEFAULTS: WidgetTheme = {
  color: "#6C2BD9",
  position: "bottom-right",
  launcherText: "Feedback",
  launcherIcon: "💬",
  headerTitle: "Share your feedback",
  headerSubtitle: "We read every message — thank you for helping us improve.",
  hideBranding: false,
};

export default function Widget({ apiKey }: { apiKey: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const projects = await getProjects(apiKey);
      setProject(projects[0] ?? null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [apiKey]);

  useEffect(() => {
    load();
  }, [load]);

  if (error)
    return <div className="text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">⚠ {error}</div>;
  if (!project) return <div className="text-slate-400 py-10 text-center">Loading widget…</div>;

  return <Editor apiKey={apiKey} project={project} />;
}

function Editor({ apiKey, project }: { apiKey: string; project: Project }) {
  const [theme, setTheme] = useState<WidgetTheme>({ ...DEFAULTS, ...project.settings.theme });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const set = <K extends keyof WidgetTheme>(k: K, v: WidgetTheme[K]) => {
    setTheme((t) => ({ ...t, [k]: v }));
    setSaved(false);
  };

  const snippet = useMemo(() => {
    const origin = window.location.origin;
    return `<script src="${origin}/frontend/widget/feedback.js"\n        data-key="${project.publicKey ?? "pk_your_public_key"}"\n        data-api="${origin}"></script>`;
  }, [project.publicKey]);

  async function save() {
    setErr(null);
    setBusy(true);
    try {
      const updated = await patchProjectTheme(apiKey, project.id, theme);
      setTheme({ ...DEFAULTS, ...updated.settings.theme });
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  const label = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";
  const input =
    "w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition";

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* ---- editor ---- */}
      <div className="space-y-5">
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-card p-5 space-y-4">
          <div className="font-semibold text-slate-900">Branding</div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Brand color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={theme.color}
                  onChange={(e) => set("color", e.target.value)}
                  className="w-10 h-10 rounded-lg border border-slate-200 bg-white cursor-pointer p-0.5"
                />
                <input className={`${input} font-mono`} value={theme.color} onChange={(e) => set("color", e.target.value)} spellCheck={false} />
              </div>
            </div>
            <div>
              <label className={label}>Position</label>
              <div className="grid grid-cols-2 gap-2">
                {(["bottom-left", "bottom-right"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => set("position", p)}
                    className={`py-2 rounded-xl text-xs font-medium border transition ${
                      theme.position === p ? "border-brand-400 bg-brand-50 text-brand-700 ring-2 ring-brand-100" : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {p === "bottom-left" ? "◧ Left" : "Right ◨"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div>
              <label className={label}>Button text</label>
              <input className={input} maxLength={40} value={theme.launcherText} onChange={(e) => set("launcherText", e.target.value)} />
            </div>
            <div className="w-20">
              <label className={label}>Icon</label>
              <input className={`${input} text-center text-lg`} maxLength={8} value={theme.launcherIcon} onChange={(e) => set("launcherIcon", e.target.value)} />
            </div>
          </div>

          <div>
            <label className={label}>Modal title</label>
            <input className={input} maxLength={80} value={theme.headerTitle} onChange={(e) => set("headerTitle", e.target.value)} />
          </div>
          <div>
            <label className={label}>Modal subtitle</label>
            <textarea className={`${input} resize-none`} rows={2} maxLength={160} value={theme.headerSubtitle} onChange={(e) => set("headerSubtitle", e.target.value)} />
          </div>

          <label className="flex items-center gap-3 pt-1 cursor-pointer">
            <input type="checkbox" className="accent-brand-600 w-4 h-4" checked={theme.hideBranding} onChange={(e) => set("hideBranding", e.target.checked)} />
            <span className="text-sm text-slate-700">
              White-label — hide the <span className="text-slate-500">“Powered by jicama”</span> footer
            </span>
          </label>

          {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {err}</div>}

          <div className="flex items-center gap-3 pt-1">
            <button onClick={save} disabled={busy} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition">
              {busy ? "Saving…" : "Save & publish"}
            </button>
            <button onClick={() => setTheme({ ...DEFAULTS })} className="text-sm text-slate-500 hover:text-slate-800">
              Reset to defaults
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-sm text-green-600 font-medium">
                <CheckIcon className="w-4 h-4" /> Published
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">Changes apply to every embed automatically — no code edit needed.</p>
        </div>

        {/* ---- embed snippet ---- */}
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-card p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-slate-900">Embed snippet</div>
            <button onClick={copy} className="text-xs font-medium text-brand-700 hover:text-brand-800">
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre className="text-xs bg-slate-900 text-slate-100 rounded-xl p-3 overflow-x-auto whitespace-pre">{snippet}</pre>
        </div>
      </div>

      {/* ---- live preview ---- */}
      <div className="lg:sticky lg:top-32 h-fit">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Live preview</div>
        <Preview theme={theme} />
      </div>
    </div>
  );
}

function Preview({ theme }: { theme: WidgetTheme }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="relative rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden shadow-card" style={{ height: 420 }}>
      {/* fake site chrome */}
      <div className="h-9 bg-white/70 border-b border-slate-200 flex items-center gap-1.5 px-3">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
        <span className="ml-3 text-[11px] text-slate-400">your-site.com</span>
      </div>

      {/* launcher button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="absolute flex items-center gap-2 text-white font-semibold rounded-full shadow-lg"
        style={{
          background: theme.color,
          padding: "10px 16px",
          fontSize: 13,
          bottom: 16,
          left: theme.position === "bottom-left" ? 16 : undefined,
          right: theme.position === "bottom-right" ? 16 : undefined,
        }}
      >
        <span style={{ fontSize: 15 }}>{theme.launcherIcon || "💬"}</span>
        {theme.launcherText || "Feedback"}
      </button>

      {/* mini modal preview */}
      {open && (
        <div
          className="absolute bg-white rounded-2xl shadow-2xl p-4 w-64"
          style={{
            bottom: 70,
            left: theme.position === "bottom-left" ? 16 : undefined,
            right: theme.position === "bottom-right" ? 16 : undefined,
            // a soft tint of the brand color
            ["--c" as string]: theme.color,
          }}
        >
          <div className="text-[15px] font-bold text-slate-900 leading-tight">{theme.headerTitle || "Share your feedback"}</div>
          <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{theme.headerSubtitle || "We read every message."}</div>
          <div className="grid grid-cols-2 gap-1.5 mt-3">
            {["🐞 Bug", "💡 Idea", "❤️ Praise", "❓ Question"].map((t, i) => (
              <div
                key={t}
                className="text-[11px] rounded-lg border px-2 py-1.5"
                style={
                  i === 0
                    ? { borderColor: theme.color, color: theme.color, background: theme.color + "14", fontWeight: 600 }
                    : { borderColor: "#e2e8f0", color: "#334155" }
                }
              >
                {t}
              </div>
            ))}
          </div>
          <div className="mt-2 h-12 rounded-lg border border-slate-200 bg-slate-50" />
          <div className="mt-2 text-white text-center text-xs font-semibold rounded-lg py-2" style={{ background: theme.color }}>
            Send feedback
          </div>
          {!theme.hideBranding && <div className="mt-2 text-center text-[10px] text-slate-400">Powered by 🍠 jicama</div>}
        </div>
      )}
    </div>
  );
}
