// One-command smoke test for the running prototype.
//   npm run smoke          (server must be running on :4000)
//   BASE=http://host:port npm run smoke
//
// Exercises the full system: ingest API, auth/trust separation, validation, spam honeypot,
// admin API (stats/list/filter/patch), and that the widget + React dashboard are served.
// Prints PASS/FAIL per check and exits non-zero if any fail.

const BASE = (process.env.BASE || "http://localhost:4000").replace(/\/$/, "");
const PUBLIC = "pk_demo_acme_123";
const SECRET = "sk_demo_acme_456";
const GLOBEX_SECRET = "sk_demo_globex_012";

// Stripe-style test cards (simulated by the backend).
const CARD_OK = { number: "4242424242424242", expMonth: 12, expYear: new Date().getFullYear() + 2, cvc: "123" };
const CARD_DECLINE = { number: "4000000000000002", expMonth: 12, expYear: new Date().getFullYear() + 2, cvc: "123" };

let pass = 0;
let fail = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

const j = (key) => ({ Authorization: `Bearer ${key}`, "Content-Type": "application/json" });

async function main() {
  console.log(`\nSmoke testing ${BASE}\n`);

  // --- reachability ---
  let health;
  try {
    health = await fetch(`${BASE}/health`);
  } catch {
    console.error(
      `\n❌ Cannot reach ${BASE}. Start the server first:\n   cd backend && npm run dev\n`
    );
    process.exit(2);
  }
  ok("health endpoint responds 200", health.status === 200);

  // --- baseline count (to verify real vs dropped submissions) ---
  const stats0 = await (await fetch(`${BASE}/v1/admin/stats`, { headers: j(SECRET) })).json();
  const total0 = stats0.total;

  // --- ingest: happy path with public key ---
  const create = await fetch(`${BASE}/v1/feedback`, {
    method: "POST",
    headers: j(PUBLIC),
    body: JSON.stringify({
      type: "bug",
      message: "smoke-test submission",
      rating: 4,
      metadata: { browser: "smoke", os: "smoke", device: "ci", url: "https://acme.example/app" },
    }),
  });
  const created = await create.json();
  ok("ingest accepts public key (201)", create.status === 201, `got ${create.status}`);
  ok("ingest returns an id", typeof created.id === "string" && created.id.startsWith("fb_"));

  // --- security: trust separation ---
  const secretOnIngest = await fetch(`${BASE}/v1/feedback`, {
    method: "POST",
    headers: j(SECRET),
    body: JSON.stringify({ type: "bug", message: "x" }),
  });
  ok("ingest REJECTS secret key (403)", secretOnIngest.status === 403, `got ${secretOnIngest.status}`);

  const badKey = await fetch(`${BASE}/v1/feedback`, {
    method: "POST",
    headers: j("pk_not_a_real_key"),
    body: JSON.stringify({ type: "bug", message: "x" }),
  });
  ok("ingest REJECTS unknown key (401)", badKey.status === 401, `got ${badKey.status}`);

  const adminWithPublic = await fetch(`${BASE}/v1/admin/feedback`, { headers: j(PUBLIC) });
  ok("admin REJECTS public key (403)", adminWithPublic.status === 403, `got ${adminWithPublic.status}`);

  // --- validation ---
  const empty = await fetch(`${BASE}/v1/feedback`, {
    method: "POST",
    headers: j(PUBLIC),
    body: JSON.stringify({ type: "bug", message: "" }),
  });
  ok("ingest rejects empty message (422)", empty.status === 422, `got ${empty.status}`);

  // --- spam honeypot: accepted silently, but NOT stored ---
  const bot = await fetch(`${BASE}/v1/feedback`, {
    method: "POST",
    headers: j(PUBLIC),
    body: JSON.stringify({ type: "bug", message: "spam", _hp: "http://spam.example" }),
  });
  ok("honeypot drops bot silently (202)", bot.status === 202, `got ${bot.status}`);

  // --- widget config (public key) ---
  const cfg = await fetch(`${BASE}/v1/config`, { headers: j(PUBLIC) });
  const cfgBody = await cfg.json();
  ok("widget config returns theme (200)", cfg.status === 200 && !!cfgBody.theme);

  // --- admin: stats reflect exactly ONE new real item (bot + invalid not counted) ---
  const stats1 = await (await fetch(`${BASE}/v1/admin/stats`, { headers: j(SECRET) })).json();
  ok(
    "stats counted the valid submission only",
    stats1.total === total0 + 1,
    `expected ${total0 + 1}, got ${stats1.total}`
  );

  // --- admin: list + filter finds our item ---
  const list = await (
    await fetch(`${BASE}/v1/admin/feedback?type=bug`, { headers: j(SECRET) })
  ).json();
  const found = list.items.find((i) => i.id === created.id);
  ok("admin list (filter type=bug) returns the item", !!found);

  // --- admin: status update ---
  const patch = await fetch(`${BASE}/v1/admin/feedback/${created.id}`, {
    method: "PATCH",
    headers: j(SECRET),
    body: JSON.stringify({ status: "in_progress" }),
  });
  const patched = await patch.json();
  ok("admin updates status (200)", patch.status === 200 && patched.status === "in_progress");

  // --- admin: tenant isolation — unknown id can't be patched ---
  const ghost = await fetch(`${BASE}/v1/admin/feedback/fb_does_not_exist`, {
    method: "PATCH",
    headers: j(SECRET),
    body: JSON.stringify({ status: "done" }),
  });
  ok("admin patch of unknown id (404)", ghost.status === 404, `got ${ghost.status}`);

  // --- frontends are served ---
  const demo = await fetch(`${BASE}/demo`);
  ok("widget demo page served (200)", demo.status === 200);

  const widgetJs = await fetch(`${BASE}/frontend/widget/feedback.js`);
  ok("embeddable widget.js served (200)", widgetJs.status === 200);

  // ====================================================================================
  // Billing, signup & multi-tenant isolation
  // ====================================================================================

  // --- plan catalogue (public) ---
  const plans = await (await fetch(`${BASE}/v1/plans`)).json();
  ok("plan catalogue lists free/pro/enterprise", Array.isArray(plans.plans) && plans.plans.length >= 3);

  // --- self-serve signup: FREE plan, no card ---
  const freeSignup = await fetch(`${BASE}/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company: "SmokeCo", email: "smoke@smokeco.test", plan: "free" }),
  });
  const freeAcct = await freeSignup.json();
  ok("signup (free) creates an org (201)", freeSignup.status === 201, `got ${freeSignup.status}`);
  ok("signup returns public + secret keys", /^pk_/.test(freeAcct.publicKey || "") && /^sk_/.test(freeAcct.secretKey || ""));

  // The new org's secret key works and shows the free plan + its own (empty) usage.
  const freeBilling = await (await fetch(`${BASE}/v1/admin/billing`, { headers: j(freeAcct.secretKey) })).json();
  ok("new org billing shows free plan, quota 100, usage 0",
    freeBilling.plan?.id === "free" && freeBilling.usage?.quota === 100 && freeBilling.usage?.used === 0);

  // --- self-serve signup: PRO plan, valid test card → charged ---
  const proSignup = await fetch(`${BASE}/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company: "PaidCo", email: "ap@paidco.test", plan: "pro", card: CARD_OK }),
  });
  const proAcct = await proSignup.json();
  ok("signup (pro + test card) succeeds (201)", proSignup.status === 201, `got ${proSignup.status}`);
  const proBilling = await (await fetch(`${BASE}/v1/admin/billing`, { headers: j(proAcct.secretKey) })).json();
  ok("pro org shows pro plan + card on file (••4242)",
    proBilling.plan?.id === "pro" && proBilling.tenant?.card?.last4 === "4242");
  const proInvoices = await (await fetch(`${BASE}/v1/admin/billing/invoices`, { headers: j(proAcct.secretKey) })).json();
  ok("pro signup recorded a $29 paid invoice",
    proInvoices.invoices?.length === 1 && proInvoices.invoices[0].amountCents === 2900 && proInvoices.invoices[0].status === "paid");

  // --- payment failure paths ---
  const declined = await fetch(`${BASE}/v1/signup`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company: "DeclineCo", email: "d@d.test", plan: "pro", card: CARD_DECLINE }),
  });
  ok("declined card is rejected (402)", declined.status === 402, `got ${declined.status}`);

  const noCard = await fetch(`${BASE}/v1/signup`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company: "NoCardCo", email: "n@n.test", plan: "pro" }),
  });
  ok("paid plan without a card is rejected (402)", noCard.status === 402, `got ${noCard.status}`);

  // --- upgrade an existing org via checkout (uses test card) ---
  const upgrade = await fetch(`${BASE}/v1/admin/billing/checkout`, {
    method: "POST", headers: j(freeAcct.secretKey),
    body: JSON.stringify({ plan: "pro", card: CARD_OK }),
  });
  const upgraded = await upgrade.json();
  ok("free org can upgrade to pro (200)", upgrade.status === 200 && upgraded.plan?.id === "pro");

  // --- multi-tenant isolation: Globex's dashboard only sees Globex feedback ---
  const globexList = await (await fetch(`${BASE}/v1/admin/feedback`, { headers: j(GLOBEX_SECRET) })).json();
  ok("second org (Globex) sees its own feedback", globexList.items?.length >= 2);
  ok("Globex feedback is isolated to its tenant",
    globexList.items.every((i) => i.tenantId === "ten_globex"));
  const acmeList = await (await fetch(`${BASE}/v1/admin/feedback`, { headers: j(SECRET) })).json();
  ok("Acme feedback never leaks Globex rows",
    acmeList.items.every((i) => i.tenantId === "ten_acme"));

  // ====================================================================================
  // Project settings — allowed-origins lock-down
  // ====================================================================================

  // Find the new free org's project id.
  const freeProjects = await (await fetch(`${BASE}/v1/admin/projects`, { headers: j(freeAcct.secretKey) })).json();
  const freeProjectId = freeProjects.projects?.[0]?.id;
  ok("admin lists the org's project", typeof freeProjectId === "string");

  // Lock the public key to a specific origin (canonicalized, deduped).
  const lock = await fetch(`${BASE}/v1/admin/projects/${freeProjectId}`, {
    method: "PATCH", headers: j(freeAcct.secretKey),
    body: JSON.stringify({ allowedOrigins: ["https://app.example.com", "https://app.example.com/"] }),
  });
  const locked = await lock.json();
  ok("admin locks project to an origin (200)", lock.status === 200, `got ${lock.status}`);
  ok("origins are canonicalized + deduped",
    JSON.stringify(locked.settings?.allowedOrigins) === JSON.stringify(["https://app.example.com"]));

  // Ingest from a now-disallowed origin is rejected; the allowed origin still works.
  const wrongOrigin = await fetch(`${BASE}/v1/feedback`, {
    method: "POST", headers: { ...j(freeAcct.publicKey), Origin: "https://evil.example.com" },
    body: JSON.stringify({ type: "bug", message: "from a blocked site" }),
  });
  ok("ingest REJECTS a disallowed origin (403)", wrongOrigin.status === 403, `got ${wrongOrigin.status}`);
  const rightOrigin = await fetch(`${BASE}/v1/feedback`, {
    method: "POST", headers: { ...j(freeAcct.publicKey), Origin: "https://app.example.com" },
    body: JSON.stringify({ type: "bug", message: "from the allowed site" }),
  });
  ok("ingest ACCEPTS an allowed origin (201)", rightOrigin.status === 201, `got ${rightOrigin.status}`);

  // Bad origins are validated.
  const badOrigin = await fetch(`${BASE}/v1/feedback`, {
    method: "POST", headers: { ...j(freeAcct.publicKey), Origin: "not-a-url" },
    body: JSON.stringify({ type: "bug", message: "x" }),
  });
  ok("ingest REJECTS an unlisted/garbage origin (403)", badOrigin.status === 403, `got ${badOrigin.status}`);
  const invalidPatch = await fetch(`${BASE}/v1/admin/projects/${freeProjectId}`, {
    method: "PATCH", headers: j(freeAcct.secretKey),
    body: JSON.stringify({ allowedOrigins: ["not-a-valid-origin"] }),
  });
  ok("admin rejects an invalid origin (422)", invalidPatch.status === 422, `got ${invalidPatch.status}`);

  // A tenant can't edit another tenant's project (isolation).
  const crossLock = await fetch(`${BASE}/v1/admin/projects/${freeProjectId}`, {
    method: "PATCH", headers: j(GLOBEX_SECRET),
    body: JSON.stringify({ allowedOrigins: ["*"] }),
  });
  ok("admin can't edit another tenant's project (404)", crossLock.status === 404, `got ${crossLock.status}`);

  // Re-open the key so this org is left in a clean ["*"] state.
  const reopen = await fetch(`${BASE}/v1/admin/projects/${freeProjectId}`, {
    method: "PATCH", headers: j(freeAcct.secretKey),
    body: JSON.stringify({ allowedOrigins: ["*"] }),
  });
  ok("admin can re-open the key to any origin (200)", reopen.status === 200, `got ${reopen.status}`);

  // ====================================================================================
  // Widget theming / branding
  // ====================================================================================

  // Projects listing now includes the public key (for the embed snippet).
  ok("admin projects include the public key", typeof freeProjects.projects?.[0]?.publicKey === "string");

  // Update the theme via PATCH; the project echoes the new values back.
  const themePatch = await fetch(`${BASE}/v1/admin/projects/${freeProjectId}`, {
    method: "PATCH", headers: j(freeAcct.secretKey),
    body: JSON.stringify({ theme: { color: "#ff0066", launcherText: "Tell us!", headerTitle: "Got feedback?", hideBranding: true } }),
  });
  const themed = await themePatch.json();
  ok("admin updates widget theme (200)", themePatch.status === 200, `got ${themePatch.status}`);
  ok("theme fields are persisted",
    themed.settings?.theme?.color === "#ff0066" &&
    themed.settings?.theme?.launcherText === "Tell us!" &&
    themed.settings?.theme?.hideBranding === true);

  // The widget pulls this via GET /v1/config — confirm it reflects the new theme.
  const cfg2 = await (await fetch(`${BASE}/v1/config`, { headers: j(freeAcct.publicKey) })).json();
  ok("widget /v1/config serves the saved theme",
    cfg2.theme?.color === "#ff0066" && cfg2.theme?.launcherText === "Tell us!" && cfg2.theme?.hideBranding === true);

  // Invalid theme values are rejected.
  const badTheme = await fetch(`${BASE}/v1/admin/projects/${freeProjectId}`, {
    method: "PATCH", headers: j(freeAcct.secretKey),
    body: JSON.stringify({ theme: { color: "not-a-hex" } }),
  });
  ok("admin rejects an invalid theme color (422)", badTheme.status === 422, `got ${badTheme.status}`);

  // ====================================================================================
  // Simulated Google login → onboarding → session-based dashboard
  // ====================================================================================
  const cookieFrom = (res) => (res.headers.get("set-cookie")?.match(/jicama_sess=[^;]+/) || [""])[0];
  const owner = `owner_${Date.now()}@smoke.test`;

  // No session yet.
  ok("/v1/me without a session → 401", (await fetch(`${BASE}/v1/me`)).status === 401);

  // Mock "Sign in with Google" posts the chosen account; backend sets a session cookie.
  const cb = await fetch(`${BASE}/auth/google/callback`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: owner, name: "Smoke Owner" }).toString(),
    redirect: "manual",
  });
  const cookie = cookieFrom(cb);
  ok("Google sign-in redirects a new user to onboarding (302)",
    cb.status === 302 && (cb.headers.get("location") || "").endsWith("/onboarding"), `got ${cb.status}`);
  ok("Google sign-in issues a session cookie", /^jicama_sess=/.test(cookie));

  const sess = { Cookie: cookie };
  const me1 = await (await fetch(`${BASE}/v1/me`, { headers: sess })).json();
  ok("/v1/me shows the user signed-in but not onboarded", me1.user?.email === owner && me1.onboarded === false);

  // Complete onboarding → creates the org for this user.
  const onboard = await fetch(`${BASE}/v1/onboarding`, {
    method: "POST", headers: { ...sess, "Content-Type": "application/json" },
    body: JSON.stringify({ company: "SmokeOrg" }),
  });
  ok("onboarding creates an org (201)", onboard.status === 201, `got ${onboard.status}`);
  const me2 = await (await fetch(`${BASE}/v1/me`, { headers: sess })).json();
  ok("/v1/me now shows onboarded + tenant", me2.onboarded === true && me2.tenant?.name === "SmokeOrg");

  // The dashboard works via the SESSION COOKIE alone — no secret key.
  const sessStats = await fetch(`${BASE}/v1/admin/stats`, { headers: sess });
  const sessStatsBody = await sessStats.json();
  ok("admin API works via session cookie (no key), isolated to the new org",
    sessStats.status === 200 && sessStatsBody.total === 0);

  // Logout invalidates the session.
  ok("logout succeeds (200)", (await fetch(`${BASE}/auth/logout`, { method: "POST", headers: sess })).status === 200);
  ok("/v1/me after logout → 401", (await fetch(`${BASE}/v1/me`, { headers: sess })).status === 401);

  // Auth pages are served.
  ok("simulated Google sign-in page served (200)", (await fetch(`${BASE}/auth/google`)).status === 200);
  ok("onboarding page served (200)", (await fetch(`${BASE}/onboarding`)).status === 200);

  // --- signup page served ---
  const signupPage = await fetch(`${BASE}/signup`);
  ok("pricing / signup page served (200)", signupPage.status === 200);

  const dash = await fetch(`${BASE}/dashboard`); // fetch follows the trailing-slash redirect
  const dashHtml = await dash.text();
  ok("React dashboard served (200)", dash.status === 200);
  const assetMatch = dashHtml.match(/\/dashboard\/assets\/[^"']+\.js/);
  if (assetMatch) {
    const asset = await fetch(`${BASE}${assetMatch[0]}`);
    ok("dashboard JS bundle served (200)", asset.status === 200);
  } else {
    ok("dashboard JS bundle served (200)", false, "no asset found — run `npm run build` in frontend/dashboard");
  }

  // --- summary ---
  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nSmoke test crashed:", e);
  process.exit(2);
});
