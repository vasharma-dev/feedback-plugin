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

  // --- dashboard can view the org's own API keys (public + secret) ---
  const apiKeys = await (await fetch(`${BASE}/v1/admin/keys`, { headers: j(SECRET) })).json();
  ok("dashboard exposes the org's API keys", apiKeys.publicKey === PUBLIC && apiKeys.secretKey === SECRET);

  // --- attachments round-trip through the storage layer (inline by default) ---
  const PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const withAtt = await fetch(`${BASE}/v1/feedback`, {
    method: "POST", headers: j(PUBLIC),
    body: JSON.stringify({
      type: "bug", message: "bug with a screenshot",
      attachments: [{ filename: "shot.png", mime: "image/png", dataUrl: PNG }],
    }),
  });
  const attCreated = await withAtt.json();
  ok("ingest accepts an attachment (201)", withAtt.status === 201, `got ${withAtt.status}`);
  const attList = await (await fetch(`${BASE}/v1/admin/feedback?q=screenshot`, { headers: j(SECRET) })).json();
  const attItem = attList.items.find((i) => i.id === attCreated.id);
  ok("attachment is stored and returned with a url",
    !!attItem && attItem.attachments?.length === 1 && typeof attItem.attachments[0].dataUrl === "string");

  // --- frontends are served ---
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
    body: JSON.stringify({ theme: { color: "#ff0066", dialogBg: "#101828", launcherText: "Tell us!", headerTitle: "Got feedback?", emailField: "required", hideBranding: true } }),
  });
  const themed = await themePatch.json();
  ok("admin updates widget theme (200)", themePatch.status === 200, `got ${themePatch.status}`);
  ok("theme fields are persisted (incl. dialog background)",
    themed.settings?.theme?.color === "#ff0066" &&
    themed.settings?.theme?.dialogBg === "#101828" &&
    themed.settings?.theme?.launcherText === "Tell us!" &&
    themed.settings?.theme?.hideBranding === true);

  // The widget pulls this via GET /v1/config — confirm it reflects the new theme.
  const cfg2 = await (await fetch(`${BASE}/v1/config`, { headers: j(freeAcct.publicKey) })).json();
  ok("widget /v1/config serves the saved theme",
    cfg2.theme?.color === "#ff0066" && cfg2.theme?.dialogBg === "#101828" && cfg2.theme?.launcherText === "Tell us!" && cfg2.theme?.hideBranding === true);
  ok("widget config carries the email-field mode", cfg2.theme?.emailField === "required");
  // name + phone fields are configurable too, and a submission captures them.
  await fetch(`${BASE}/v1/admin/projects/${freeProjectId}`, { method: "PATCH", headers: j(freeAcct.secretKey), body: JSON.stringify({ theme: { emailField: "optional", nameField: "required", phoneField: "optional" } }) });
  const cfg3 = await (await fetch(`${BASE}/v1/config`, { headers: j(freeAcct.publicKey) })).json();
  ok("widget config carries name + phone field modes", cfg3.theme?.nameField === "required" && cfg3.theme?.phoneField === "optional");
  const withContact = await (await fetch(`${BASE}/v1/feedback`, {
    method: "POST", headers: j(freeAcct.publicKey),
    body: JSON.stringify({ type: "bug", message: "contact capture test", endUser: { name: "Jane Q", email: "jane@x.com", phone: "+1 555 0100" } }),
  })).json();
  const contactList = await (await fetch(`${BASE}/v1/admin/feedback?q=contact%20capture`, { headers: j(freeAcct.secretKey) })).json();
  const ci = contactList.items.find((i) => i.id === withContact.id);
  ok("name + email + phone are captured on feedback",
    ci && ci.endUser?.name === "Jane Q" && ci.endUser?.email === "jane@x.com" && ci.endUser?.phone === "+1 555 0100");

  // Invalid theme values are rejected.
  const badTheme = await fetch(`${BASE}/v1/admin/projects/${freeProjectId}`, {
    method: "PATCH", headers: j(freeAcct.secretKey),
    body: JSON.stringify({ theme: { color: "not-a-hex" } }),
  });
  ok("admin rejects an invalid theme color (422)", badTheme.status === 422, `got ${badTheme.status}`);

  // Custom feedback reference prefix → new feedback gets a sequential id like "smokebug01".
  await fetch(`${BASE}/v1/admin/projects/${freeProjectId}`, {
    method: "PATCH", headers: j(freeAcct.secretKey), body: JSON.stringify({ feedbackPrefix: "smokebug" }),
  });
  const refA = await (await fetch(`${BASE}/v1/feedback`, { method: "POST", headers: j(freeAcct.publicKey), body: JSON.stringify({ type: "bug", message: "ref one" }) })).json();
  const refB = await (await fetch(`${BASE}/v1/feedback`, { method: "POST", headers: j(freeAcct.publicKey), body: JSON.stringify({ type: "bug", message: "ref two" }) })).json();
  ok("feedback gets the custom reference prefix", /^smokebug\d{2,}$/.test(refA.ref || ""), `got ${refA.ref}`);
  ok("references increment sequentially", Number(refB.ref.replace(/\D/g, "")) === Number(refA.ref.replace(/\D/g, "")) + 1);
  // invalid prefix rejected
  const badPrefix = await fetch(`${BASE}/v1/admin/projects/${freeProjectId}`, {
    method: "PATCH", headers: j(freeAcct.secretKey), body: JSON.stringify({ feedbackPrefix: "bad prefix!" }),
  });
  ok("admin rejects an invalid prefix (422)", badPrefix.status === 422, `got ${badPrefix.status}`);

  // ---- AI context + duplicate grouping (heuristic fallback when no AI configured) ----
  const sub = (message) => fetch(`${BASE}/v1/feedback`, { method: "POST", headers: j(freeAcct.publicKey), body: JSON.stringify({ type: "bug", message }) }).then((r) => r.json());
  const g1 = await sub("The export button does nothing when I click it on the reports page");
  const g2 = await sub("Clicking the export button on the reports page just does nothing");
  ok("new feedback gets an AI summary", typeof g1.summary === "string" && g1.summary.length > 0);
  ok("a same-issue report is grouped under the first", g2.groupId === g1.id, `got ${g2.groupId} vs ${g1.id}`);
  const glist = await (await fetch(`${BASE}/v1/admin/feedback?type=bug`, { headers: j(freeAcct.secretKey) })).json();
  const canon = glist.items.find((i) => i.id === g1.id);
  ok("the canonical shows a similar-reports count", !!canon && canon.similarCount >= 1, `got ${canon && canon.similarCount}`);

  // ====================================================================================
  // Tokens — the currency for accepting feedback (1 feedback = 1 token)
  // ====================================================================================
  const billingOf = async (sk) => (await fetch(`${BASE}/v1/admin/billing`, { headers: j(sk) })).json();

  const bill0 = await billingOf(freeAcct.secretKey);
  ok("billing reports a token balance", typeof bill0.tokenBalance === "number");
  ok("billing lists token packs", Array.isArray(bill0.packs) && bill0.packs.length >= 3);
  // With no STRIPE_SECRET_KEY set, the prototype uses the simulated charge fallback.
  ok("billing reports stripeEnabled flag", bill0.stripeEnabled === false);
  const before = bill0.tokenBalance;

  // Accepting one feedback spends exactly one token.
  await fetch(`${BASE}/v1/feedback`, {
    method: "POST", headers: j(freeAcct.publicKey),
    body: JSON.stringify({ type: "idea", message: "token-spend check" }),
  });
  const bill1 = await billingOf(freeAcct.secretKey);
  ok("accepting feedback spends one token", bill1.tokenBalance === before - 1, `expected ${before - 1}, got ${bill1.tokenBalance}`);

  // Buying a pack tops up the balance and records an invoice.
  const buy = await fetch(`${BASE}/v1/admin/billing/buy-tokens`, {
    method: "POST", headers: j(freeAcct.secretKey),
    body: JSON.stringify({ pack: "starter", card: CARD_OK }),
  });
  const bought = await buy.json();
  ok("buy starter pack succeeds (200)", buy.status === 200, `got ${buy.status}`);
  ok("token balance increases by the pack size", bought.tokenBalance === before - 1 + 1000, `got ${bought.tokenBalance}`);
  const inv = await (await fetch(`${BASE}/v1/admin/billing/invoices`, { headers: j(freeAcct.secretKey) })).json();
  ok("token purchase recorded as a $9 invoice",
    inv.invoices?.some((i) => /tokens/i.test(i.description) && i.amountCents === 900 && i.status === "paid"));

  // Unknown pack rejected.
  const badPack = await fetch(`${BASE}/v1/admin/billing/buy-tokens`, {
    method: "POST", headers: j(freeAcct.secretKey),
    body: JSON.stringify({ pack: "does_not_exist", card: CARD_OK }),
  });
  ok("unknown token pack rejected (422)", badPack.status === 422, `got ${badPack.status}`);

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

  // ====================================================================================
  // Super Admin — platform owner (token pricing + all orgs)
  // ====================================================================================
  const SA_EMAIL = "super@jicama.tech", SA_PW = "jicama-super-2026";

  ok("super admin rejects a wrong password (401)",
    (await fetch(`${BASE}/v1/superadmin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: SA_EMAIL, password: "nope" }) })).status === 401);
  ok("super admin routes require auth (401)", (await fetch(`${BASE}/v1/superadmin/packs`)).status === 401);

  const saLogin = await fetch(`${BASE}/v1/superadmin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: SA_EMAIL, password: SA_PW }),
  });
  const saCookie = (saLogin.headers.get("set-cookie")?.match(/jcm_sa_sess=[^;]+/) || [""])[0];
  ok("super admin logs in (200)", saLogin.status === 200, `got ${saLogin.status}`);
  ok("super admin session cookie issued", /^jcm_sa_sess=/.test(saCookie));
  const saH = { Cookie: saCookie };

  ok("super admin /me works", (await fetch(`${BASE}/v1/superadmin/me`, { headers: saH })).status === 200);
  const saPacks = await (await fetch(`${BASE}/v1/superadmin/packs`, { headers: saH })).json();
  ok("super admin lists token packs", Array.isArray(saPacks.packs) && saPacks.packs.length >= 3);

  // Edit the Starter pack price → confirm it flows through to a tenant's billing, then reset.
  const setPrice = await fetch(`${BASE}/v1/superadmin/packs/starter`, {
    method: "PATCH", headers: { ...saH, "Content-Type": "application/json" }, body: JSON.stringify({ priceCents: 1234 }),
  });
  ok("super admin edits a pack price (200)", setPrice.status === 200, `got ${setPrice.status}`);
  const tenantBill = await (await fetch(`${BASE}/v1/admin/billing`, { headers: j(freeAcct.secretKey) })).json();
  const starter = (tenantBill.packs || []).find((p) => p.id === "starter");
  ok("pricing change is live for tenants", !!starter && starter.priceCents === 1234, `got ${starter && starter.priceCents}`);
  await fetch(`${BASE}/v1/superadmin/packs/starter`, {
    method: "PATCH", headers: { ...saH, "Content-Type": "application/json" }, body: JSON.stringify({ priceCents: 900 }),
  });

  // Clients = only real Google-authenticated orgs (mock/seed/API signups are filtered out).
  const saOrgs = await (await fetch(`${BASE}/v1/superadmin/orgs`, { headers: saH })).json();
  ok("super admin clients list returns real orgs only",
    Array.isArray(saOrgs.orgs) && saOrgs.orgs.every((o) => typeof o.feedbackCount === "number" && o.ownerEmail));

  // Super admin can move a client between plans (tested against the seeded Acme org).
  const planPatch = (plan) => fetch(`${BASE}/v1/superadmin/orgs/ten_acme`, {
    method: "PATCH", headers: { ...saH, "Content-Type": "application/json" }, body: JSON.stringify({ plan }),
  });
  ok("super admin changes a client's plan (200)", (await planPatch("free")).status === 200);
  const acmeBill = await (await fetch(`${BASE}/v1/admin/billing`, { headers: j(SECRET) })).json();
  ok("plan change is live for the client", acmeBill.plan?.id === "free");
  await planPatch("pro"); // restore

  // A plan upgrade grants that plan's token allotment (free 100 → pro 5,000) without reducing.
  const grantOrg = await (await fetch(`${BASE}/v1/signup`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company: "GrantCo", email: "g@grant.test", plan: "free" }),
  })).json();
  await fetch(`${BASE}/v1/superadmin/orgs/${grantOrg.tenantId}`, {
    method: "PATCH", headers: { ...saH, "Content-Type": "application/json" }, body: JSON.stringify({ plan: "pro" }),
  });
  const grantBill = await (await fetch(`${BASE}/v1/admin/billing`, { headers: j(grantOrg.secretKey) })).json();
  ok("upgrading to Pro grants the plan's tokens", grantBill.tokenBalance === 5000, `got ${grantBill.tokenBalance}`);
  ok("super admin rejects an unknown plan (422)", (await planPatch("ultra")).status === 422);
  const ghostOrg = await fetch(`${BASE}/v1/superadmin/orgs/does_not_exist`, {
    method: "PATCH", headers: { ...saH, "Content-Type": "application/json" }, body: JSON.stringify({ plan: "free" }),
  });
  ok("super admin plan change on unknown org (404)", ghostOrg.status === 404, `got ${ghostOrg.status}`);

  // Platform settings (Stripe / payments).
  ok("super admin settings require auth (401)", (await fetch(`${BASE}/v1/superadmin/settings`)).status === 401);
  const saSettings = await (await fetch(`${BASE}/v1/superadmin/settings`, { headers: saH })).json();
  ok("super admin reads platform settings", typeof saSettings.stripeConfigured === "boolean");
  const saBadKey = await fetch(`${BASE}/v1/superadmin/settings`, {
    method: "PATCH", headers: { ...saH, "Content-Type": "application/json" }, body: JSON.stringify({ stripeSecretKey: "not-a-key" }),
  });
  ok("super admin rejects an invalid Stripe key (422)", saBadKey.status === 422, `got ${saBadKey.status}`);

  ok("landing page served at / (200)", (await fetch(`${BASE}/`)).status === 200);
  ok("login page served at /login (200)", (await fetch(`${BASE}/login`)).status === 200);
  ok("super admin panel served at /admin (200)", (await fetch(`${BASE}/admin`)).status === 200);
  const pubPacks = await (await fetch(`${BASE}/v1/packs`)).json();
  ok("public token-pack catalogue served", Array.isArray(pubPacks.packs) && pubPacks.packs.length >= 3 && !!pubPacks.packs[0].priceLabel);

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

  // ====================================================================================
  // Team / RBAC + bug timeline
  // ====================================================================================
  const login = async (email) =>
    (
      (await fetch(`${BASE}/auth/google/callback`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email, name: email.split("@")[0] }).toString(), redirect: "manual",
      })).headers.get("set-cookie")?.match(/jicama_sess=[^;]+/) || [""]
    )[0];

  const ownerEmail = `team_owner_${Date.now()}@smoke.test`;
  const ownerC = await login(ownerEmail);
  await fetch(`${BASE}/v1/onboarding`, { method: "POST", headers: { Cookie: ownerC, "Content-Type": "application/json" }, body: JSON.stringify({ company: "TeamCo", website: "https://team.test" }) });
  const ownerMe = await (await fetch(`${BASE}/v1/me`, { headers: { Cookie: ownerC } })).json();
  ok("owner account has role owner", ownerMe.role === "owner");
  const ownerPk = ownerMe.keys.publicKey;
  const projs = await (await fetch(`${BASE}/v1/admin/projects`, { headers: { Cookie: ownerC } })).json();
  const teamProjId = projs.projects[0].id;
  const tfb = await (await fetch(`${BASE}/v1/feedback`, { method: "POST", headers: j(ownerPk), body: JSON.stringify({ type: "bug", message: "Login page crashes on submit" }) })).json();

  const memberEmail = `team_member_${Date.now()}@smoke.test`;
  const invRes = await fetch(`${BASE}/v1/admin/members`, { method: "POST", headers: { Cookie: ownerC, "Content-Type": "application/json" }, body: JSON.stringify({ email: memberEmail }) });
  const member = await invRes.json();
  ok("owner invites a teammate (201, member role)", invRes.status === 201 && member.role === "member");
  const mlist = await (await fetch(`${BASE}/v1/admin/members`, { headers: { Cookie: ownerC } })).json();
  ok("members list shows owner + member", Array.isArray(mlist.members) && mlist.members.length >= 2);

  const memberC = await login(memberEmail);
  const memberMe = await (await fetch(`${BASE}/v1/me`, { headers: { Cookie: memberC } })).json();
  ok("invited teammate joins as a member", memberMe.role === "member" && memberMe.tenant?.name === "TeamCo");

  // RBAC: member sees the inbox but not owner-only areas.
  ok("member can read the feedback inbox (200)", (await fetch(`${BASE}/v1/admin/feedback`, { headers: { Cookie: memberC } })).status === 200);
  ok("member CANNOT edit the widget/project (403)", (await fetch(`${BASE}/v1/admin/projects/${teamProjId}`, { method: "PATCH", headers: { Cookie: memberC, "Content-Type": "application/json" }, body: JSON.stringify({ feedbackPrefix: "x" }) })).status === 403);
  ok("member CANNOT access billing (403)", (await fetch(`${BASE}/v1/admin/billing`, { headers: { Cookie: memberC } })).status === 403);

  // The member takes the bug → assigned + in progress; the whole team sees the timeline.
  const take = await fetch(`${BASE}/v1/admin/feedback/${tfb.id}`, { method: "PATCH", headers: { Cookie: memberC, "Content-Type": "application/json" }, body: JSON.stringify({ assigneeId: "me", status: "in_progress" }) });
  const taken = await take.json();
  ok("member can take a bug (assigned + in progress)", take.status === 200 && !!taken.assigneeName && taken.status === "in_progress");
  const ev = await (await fetch(`${BASE}/v1/admin/feedback/${tfb.id}/events`, { headers: { Cookie: ownerC } })).json();
  ok("timeline records created + assigned + status",
    ev.events.some((e) => e.kind === "created") && ev.events.some((e) => e.kind === "assigned") && ev.events.some((e) => e.kind === "status"));

  // Comments: a member posts to the timeline; the owner sees it.
  const cmt = await fetch(`${BASE}/v1/admin/feedback/${tfb.id}/comment`, { method: "POST", headers: { Cookie: memberC, "Content-Type": "application/json" }, body: JSON.stringify({ text: "Reproduced on Chrome — looking into it." }) });
  const cmtBody = await cmt.json();
  ok("member can comment on a bug (200)", cmt.status === 200 && cmtBody.events.some((e) => e.kind === "comment" && /Reproduced/.test(e.detail)));
  ok("an empty comment is rejected (422)", (await fetch(`${BASE}/v1/admin/feedback/${tfb.id}/comment`, { method: "POST", headers: { Cookie: memberC, "Content-Type": "application/json" }, body: JSON.stringify({ text: "" }) })).status === 422);

  // --- summary ---
  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nSmoke test crashed:", e);
  process.exit(2);
});
