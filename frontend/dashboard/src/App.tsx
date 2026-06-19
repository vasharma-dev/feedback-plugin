import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBilling,
  getMe,
  getStats,
  listFeedback,
  logout,
  patchStatus,
  type Filters,
  type Me,
} from "./api";
import { patchFeedback } from "./api";
import Billing from "./components/Billing";
import FeedbackCard from "./components/FeedbackCard";
import FiltersBar from "./components/Filters";
import Settings from "./components/Settings";
import StatsBar from "./components/StatsBar";
import Team from "./components/Team";
import Widget from "./components/Widget";
import { InboxIcon, SettingsIcon } from "./components/icons";
import type { Feedback, FeedbackStatus, Stats } from "./types";

const DEFAULT_KEY = "sk_demo_acme_456";

// Allow deep-linking from the signup page: /dashboard/?key=sk_...
function initialKey(): string {
  const fromUrl = new URLSearchParams(window.location.search).get("key");
  if (fromUrl) {
    localStorage.setItem("jicama_key", fromUrl);
    // Clean the key out of the address bar so it isn't bookmarked/shared by accident.
    window.history.replaceState({}, "", window.location.pathname);
    return fromUrl;
  }
  return localStorage.getItem("jicama_key") || DEFAULT_KEY;
}

type Tab = "inbox" | "widget" | "billing" | "settings" | "team";

const TAB_LABELS: Record<Tab, string> = {
  inbox: "Feedback inbox",
  widget: "Widget",
  billing: "Billing & plan",
  settings: "Settings",
  team: "Team",
};

const OWNER_TABS: Tab[] = ["inbox", "widget", "billing", "settings", "team"];
const MEMBER_TABS: Tab[] = ["inbox"]; // employees: feedback only

export default function App() {
  const [key, setKey] = useState(initialKey);
  const [tab, setTab] = useState<Tab>("inbox");
  const [filters, setFilters] = useState<Filters>({});
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<Feedback[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [account, setAccount] = useState<{ name: string; plan: string } | null>(null);
  const [session, setSession] = useState<Me | null>(null); // set when logged in via Google
  const [authReady, setAuthReady] = useState(false);

  const keyRef = useRef(key);
  keyRef.current = key;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Detect a logged-in session first. If onboarded → use cookie auth (empty key). If signed in
  // but not onboarded → finish onboarding. Otherwise fall back to the legacy API-key flow.
  useEffect(() => {
    let alive = true;
    getMe()
      .then((me) => {
        if (!alive) return;
        if (me && me.onboarded && me.tenant) {
          setSession(me);
          setAccount({ name: me.tenant.name, plan: me.tenant.plan });
          setKey(""); // empty key → api() uses the session cookie
        } else if (me && !me.onboarded) {
          window.location.href = "/onboarding";
          return;
        }
        setAuthReady(true);
      })
      .catch(() => alive && setAuthReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([
        getStats(keyRef.current),
        listFeedback(keyRef.current, filtersRef.current),
      ]);
      setStats(s);
      setItems(list);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (key) localStorage.setItem("jicama_key", key); // never persist the empty session key
  }, [key]);

  // Resolve the org name + plan for the header whenever the key changes (legacy/key mode).
  useEffect(() => {
    if (!authReady || session) return; // session mode already has the account from /v1/me
    let alive = true;
    getBilling(key)
      .then((b) => alive && setAccount({ name: b.tenant.name, plan: b.plan.name }))
      .catch(() => alive && setAccount(null));
    return () => {
      alive = false;
    };
  }, [key, authReady, session]);

  useEffect(() => {
    if (!authReady) return;
    setLoading(true);
    refresh();
  }, [refresh, filters, key, authReady]);

  // Poll so new submissions appear live (only while viewing the inbox).
  useEffect(() => {
    if (tab !== "inbox") return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh, tab]);

  async function onStatus(id: string, status: FeedbackStatus) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    try {
      await patchStatus(keyRef.current, id, status);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // "Take" a bug: assign to me + mark in progress, so the whole team sees who's on it.
  async function onTake(id: string) {
    try {
      await patchFeedback(keyRef.current, id, { assigneeId: "me", status: "in_progress" });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onLogout() {
    await logout();
    window.location.href = "/"; // back to the landing page
  }

  // Role-based tabs: owners get everything, members (employees) just the inbox.
  const isOwner = session ? session.role === "owner" : true; // legacy key mode = owner
  const tabs = isOwner ? OWNER_TABS : MEMBER_TABS;
  const activeTab = tabs.includes(tab) ? tab : "inbox";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 grid place-items-center text-white text-lg shadow-sm">
            🍠
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-slate-900">jicama feedback</div>
            <div className="text-xs text-slate-400">{account ? account.name : "—"}</div>
          </div>
          {account && (
            <span className="ml-2 hidden sm:inline-flex items-center text-xs font-medium text-brand-700 bg-brand-50 px-2.5 py-1 rounded-full ring-1 ring-inset ring-brand-200">
              {account.plan} plan
            </span>
          )}
          <span className="ml-2 hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-full ring-1 ring-inset ring-green-200">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulseDot" />
            Live
          </span>

          <div className="ml-auto relative">
            {session ? (
              <>
                <button
                  onClick={() => setSettingsOpen((v) => !v)}
                  className="inline-flex items-center gap-2 text-sm text-slate-700 hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl pl-1.5 pr-3 py-1.5 transition"
                >
                  {session.user.avatarUrl ? (
                    <img src={session.user.avatarUrl} alt="" className="w-7 h-7 rounded-full bg-slate-100" />
                  ) : (
                    <span className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xs font-semibold">
                      {(session.user.name || session.user.email)[0]?.toUpperCase()}
                    </span>
                  )}
                  <span className="hidden sm:inline max-w-[140px] truncate">{session.user.email}</span>
                </button>
                {settingsOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setSettingsOpen(false)} />
                    <div className="absolute right-0 mt-2 w-64 z-20 bg-white rounded-2xl shadow-pop border border-slate-200 p-2 animate-fadeInUp">
                      <div className="px-3 py-2">
                        <div className="text-sm font-medium text-slate-800 truncate">{session.user.name || "Signed in"}</div>
                        <div className="text-xs text-slate-400 truncate">{session.user.email}</div>
                      </div>
                      <div className="border-t border-slate-100 my-1" />
                      <button
                        onClick={onLogout}
                        className="w-full text-left text-sm text-slate-600 hover:bg-slate-50 rounded-lg px-3 py-2 transition"
                      >
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => setSettingsOpen((v) => !v)}
                  className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2 transition"
                >
                  <SettingsIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">API key</span>
                </button>
                {settingsOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setSettingsOpen(false)} />
                    <div className="absolute right-0 mt-2 w-80 z-20 bg-white rounded-2xl shadow-pop border border-slate-200 p-4 animate-fadeInUp">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Secret API key
                      </label>
                      <input
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        spellCheck={false}
                        className="mt-1.5 w-full font-mono text-sm px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
                      />
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        Switch organizations by pasting another secret key. Stored locally in your browser only.
                      </p>
                      <a
                        href="/auth/google"
                        className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:text-brand-800"
                      >
                        Sign in with Google instead →
                      </a>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* tabs */}
        <div className="max-w-5xl mx-auto px-5 flex gap-1 -mb-px">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                activeTab === t
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-6">
        {error && activeTab === "inbox" && (
          <div className="text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm flex items-center gap-2">
            <span>⚠</span>
            <span>{error}</span>
          </div>
        )}

        {activeTab === "widget" ? (
          <>
            <div className="mb-5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Widget</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Brand your feedback widget — colors, text and white-labeling. Changes go live instantly.
              </p>
            </div>
            <Widget apiKey={key} />
          </>
        ) : activeTab === "billing" ? (
          <>
            <div className="mb-5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Billing &amp; plan</h1>
              <p className="text-sm text-slate-500 mt-0.5">Manage your subscription, payment method and usage.</p>
            </div>
            <Billing apiKey={key} />
          </>
        ) : activeTab === "settings" ? (
          <>
            <div className="mb-5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Settings</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Lock your widget's public key to the sites that are allowed to use it.
              </p>
            </div>
            <Settings apiKey={key} />
          </>
        ) : activeTab === "team" ? (
          <>
            <div className="mb-5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Team</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Invite teammates to triage and take feedback. Owners manage billing, widget &amp; settings.
              </p>
            </div>
            <Team apiKey={key} />
          </>
        ) : (
          <>
            <div className="mb-5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Feedback inbox</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Triage everything your users send — bugs, ideas, praise and questions.
              </p>
            </div>

            {stats && <StatsBar stats={stats} />}
            <FiltersBar filters={filters} onChange={setFilters} count={loading ? undefined : items.length} />

            {loading ? (
              <SkeletonList />
            ) : items.length === 0 && !error ? (
              <EmptyState />
            ) : (
              <div className="space-y-3">
                {items.map((f) => (
                  <FeedbackCard key={f.id} item={f} apiKey={key} onStatus={onStatus} onTake={onTake} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-200/70 shadow-card p-4">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-16 rounded-full bg-slate-100 animate-pulse" />
            <div className="h-4 w-20 rounded bg-slate-100 animate-pulse" />
            <div className="ml-auto h-7 w-24 rounded-full bg-slate-100 animate-pulse" />
          </div>
          <div className="mt-3 h-4 w-3/4 rounded bg-slate-100 animate-pulse" />
          <div className="mt-2 h-4 w-1/2 rounded bg-slate-100 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-16 text-center">
      <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 text-slate-400 grid place-items-center">
        <InboxIcon className="w-6 h-6" />
      </div>
      <p className="mt-3 font-medium text-slate-700">No feedback matches</p>
      <p className="text-sm text-slate-400 mt-0.5">
        Try clearing filters, or submit one from the demo app.
      </p>
    </div>
  );
}
