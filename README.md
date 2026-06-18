# jicama feedback plugin — prototype

[![GitHub stars](https://img.shields.io/github/stars/vasharma-dev/feedback-plugin?logo=github)](https://github.com/vasharma-dev/feedback-plugin/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/vasharma-dev/feedback-plugin?logo=git&logoColor=white)](https://github.com/vasharma-dev/feedback-plugin/commits/main)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

A runnable, end-to-end prototype of the system described in [`DESIGN.md`](./DESIGN.md):
a hosted backend (ingest + admin API), an embeddable widget, a JS SDK, and a tenant dashboard.

> **Prototype scope:** data persists in **SQLite via Prisma** (a single `dev.db` file), seeded
> with a demo tenant — so it runs with zero external services and survives restarts. The schema
> matches DESIGN.md §6 exactly; going to Postgres is a one-line change (`provider = "postgresql"`
> in `prisma/schema.prisma` + a Postgres `DATABASE_URL`). All DB access is behind
> `backend/src/store.ts`, so the widget, SDK, and dashboard never change.

## Run it

```bash
cd backend
cp .env.example .env   # SQLite path + port; no secrets, safe defaults
npm install
npm run dev      # auto-runs `prisma generate` + `prisma db push`, seeds, then starts
```

The first `npm install` generates the Prisma client; `npm run dev`/`start` create the SQLite
schema and seed the demo tenant automatically. No manual DB steps.

Then open:

| URL | What |
|-----|------|
| http://localhost:4000/demo | A pretend tenant app with the widget embedded (try the 💬 button) |
| http://localhost:4000/signup | **Pricing + self-serve signup** — pick a plan & pay (test mode), or **Continue with Google** for instant onboarding |
| http://localhost:4000/auth/google | **Simulated "Sign in with Google"** → onboarding form → personalized dashboard |
| http://localhost:4000/dashboard | The tenant admin console (React + Vite + Tailwind) — **Feedback inbox**, **Widget** (theming), **Billing**, **Settings** tabs |
| http://localhost:4000/health | Health check |

> **Sign-in is a simulated Google login** (test mode) — no Google Cloud setup, works offline.
> Clicking "Sign in with Google" creates a user + an httpOnly session cookie; first-timers complete
> a short onboarding form that creates their org, then land on their own dashboard (no key-pasting).
> The admin API accepts **either** that session **or** a secret key, so the legacy `?key=sk_…` flow
> still works. **Real Google OAuth is built in** and switches on automatically when you set
> `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (see [Going live](#going-live-real-google-oauth--stripe-optional)) —
> otherwise the simulated login is used.

> **Billing is token-based, in simulated "test mode"** — no real charges. Tokens are the
> currency: every accepted feedback spends **1 token**, and orgs buy **token packs** (Starter
> 1k/$9, Growth 10k/$79, Scale 100k/$599) from the dashboard's **Billing** tab to top up. New
> orgs get a free starter grant. In the simulated fallback, use card `4242 4242 4242 4242` (any
> future expiry + CVC) to succeed, or `4000 0000 0000 0002` to see a decline. **Real Stripe
> Checkout is built in** and switches on when you set `STRIPE_SECRET_KEY` (see
> [Going live](#going-live-real-google-oauth--stripe-optional)).

> The dashboard at `/dashboard` is the **prebuilt** React app (`frontend/dashboard/dist`) and is
> served by the backend, so the single `npm run dev` above is enough to use it. If `/dashboard`
> shows a "not built yet" hint, build it once:
>
> ```bash
> cd frontend/dashboard && npm install && npm run build
> ```
>
> For hot-reload while developing the dashboard, run it on its own Vite server instead — it
> proxies `/v1` to the backend, so keep the backend running too:
>
> ```bash
> cd frontend/dashboard && npm run dev   # → http://localhost:5173/dashboard/
> ```

Two demo orgs are seeded (printed on boot) to show **multi-tenant isolation** — each org's
dashboard only ever sees its own feedback:

```
Acme Inc.    (pro)   public pk_demo_acme_123     secret sk_demo_acme_456
Globex Corp. (free)  public pk_demo_globex_789   secret sk_demo_globex_012
```

In the dashboard, switch orgs by pasting another secret key (top-right "API key"), or deep-link
straight in with `…/dashboard/?key=<secret>` (the signup page does this automatically).

## Check it works (automated)

With the server running, in another terminal:

```bash
cd backend
npm run smoke
```

It runs 66 checks across the whole system (in the zero-setup fallback mode) — ingest, auth/trust separation, validation, spam
honeypot, admin stats/list/filter/patch, **signup, simulated payments (incl. declined cards),
token balance + spend-per-feedback + buying token packs, multi-tenant isolation, per-project
origin lock-down, widget theming/branding, simulated Google login → onboarding → session-based
dashboard**, and that the widget + signup + React dashboard are served — printing ✅/❌ per check
and exiting non-zero on any failure. Expected:

```
✅ ALL PASS — 66 passed, 0 failed
```

## The three integration surfaces (DESIGN.md §2)

**1. Zero-code `<script>`** — one tag, a floating button appears:

```html
<script src="https://cdn.jicama.tech/feedback.js"
        data-key="pk_demo_acme_123"
        data-color="#6C2BD9"></script>
```

> The widget pulls its **theme/branding from the server** (`GET /v1/config`), so brand color,
> **dialog background**, button text, modal copy and white-labeling are all controlled from the dashboard's **Widget** tab —
> change them there and every embed updates, no code edit. `data-*` attributes act as the initial
> look until the saved theme loads.

**2. SDK** (`frontend/sdk`) — full control + user context:

```js
import { Feedback } from '@jicama/feedback';
Feedback.init({ key: 'pk_demo_acme_123', user: { id: 'u_1', email: 'jane@acme.example' } });
Feedback.open();                                  // open the widget UI
await Feedback.submit({ type: 'bug', message: 'Crash on save', rating: 2 }); // headless
```

**3. REST** — any platform (mobile, desktop, CLI, backend):

```bash
curl -X POST http://localhost:4000/v1/feedback \
  -H "Authorization: Bearer pk_demo_acme_123" \
  -H "Content-Type: application/json" \
  -d '{"type":"idea","message":"Add CSV export","rating":5,
       "metadata":{"appVersion":"2.1.0","os":"iOS 17"}}'
```

## Integrate into your own project (local testing)

Drop the widget into **any** local app or site you're building and see the feedback land in
**your** dashboard only — each org's keys are fully isolated from every other org's.

**1. Run the backend** (it's the API + dashboard host):

```bash
cd backend && cp .env.example .env && npm install && npm run dev   # → http://localhost:4000
```

**2. Get your own keys.** Open <http://localhost:4000/signup>, create an org (the **free** plan
needs no card). You'll get a **public** key (`pk_…`, for the widget) and a **secret** key
(`sk_…`, for your dashboard). _Or_ just reuse the seeded demo keys `pk_demo_acme_123` /
`sk_demo_acme_456`.

**3. Embed the widget** in your project's HTML. Because your app runs on a different port than
the backend, point `data-api` at the backend — CORS is open, so cross-origin works:

```html
<script src="http://localhost:4000/frontend/widget/feedback.js"
        data-key="pk_YOUR_PUBLIC_KEY"
        data-api="http://localhost:4000"
        data-color="#6C2BD9"></script>
```

A floating 💬 button appears. (Inside this prototype's own `/demo` page, `data-api` is omitted
because the page and API share an origin — across projects you must set it.)

**4. View feedback as the admin.** Open <http://localhost:4000/dashboard>, paste your `sk_…`
(or deep-link `…/dashboard/?key=sk_…`). You'll see **only** your org's submissions, live.

> **Status: fully working locally; the main production-hardening items are now built in.**
> **API keys are hashed** (secrets stored as SHA-256, never plaintext), **attachment storage** is
> pluggable (inline → filesystem → S3/R2), the **rate limiter** is behind a swappable store
> (in-memory → Redis), and **origin allow-lists**, **real Google OAuth**, and **real Stripe
> Checkout** are all available (see below). What's left for a real deployment is mostly ops:
> a managed **Postgres**, an **S3/R2** bucket, **Redis**, and the backend behind **HTTPS**. See
> [`DESIGN.md`](./DESIGN.md) §10 and [Production hardening](#production-hardening) below.

## Going live: real Google OAuth + Stripe (optional)

Both production integrations are **opt-in via env vars** — set them and they switch on; leave
them blank and the app uses the simulated login / simulated charge (zero setup). Both work with
free **test-mode** credentials. Copy the keys into `backend/.env` (see `backend/.env.example`).

**Real "Sign in with Google":**

1. In [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**,
   create an **OAuth client ID** of type **Web application**.
2. Add an **Authorized redirect URI**: `http://localhost:4000/auth/google/callback`.
3. Put the values in `backend/.env`:
   ```bash
   APP_URL="http://localhost:4000"
   GOOGLE_CLIENT_ID="…apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="…"
   ```
   Restart the backend — `/auth/google` now redirects to the real Google consent screen, exchanges
   the code, and creates the session. No code change. (Implementation: `backend/src/auth/google.ts`.)

**Real Stripe Checkout** (for buying token packs):

1. In the [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys) (test mode), copy your
   **Secret key** (`sk_test_…`).
2. Put it in `backend/.env`:
   ```bash
   STRIPE_SECRET_KEY="sk_test_…"
   ```
   Restart the backend. Now **Buy** in the dashboard's Billing tab redirects to Stripe's hosted
   checkout page; on success the backend verifies the session and credits the tokens (idempotently
   via the Checkout session id). Pay with Stripe's test card `4242 4242 4242 4242`. (Implementation:
   `backend/src/billing/stripe.ts` + the `/v1/billing/checkout/return` endpoint.)

> The 66-check smoke test runs against the **fallback** (no keys) path, so it stays green with zero
> setup; the real paths activate only when the env vars are present.

## Production hardening

The security/architecture hardening is built in and **opt-in via env** where it needs external
services, so the zero-setup prototype keeps working:

| Concern | Prototype default | Production switch |
|---|---|---|
| **API key storage** | — *(always on)* | Secrets are stored as **SHA-256 hashes** (`keyHash`), never plaintext. The raw secret is shown **once** at signup/onboarding. Public keys keep plaintext (they ship in the customer's HTML). Lookups hash the incoming key. (`backend/src/store.ts` `hashKey`) |
| **Attachments** | `inline` data-URLs in the DB | Set `STORAGE=filesystem` to write blobs to `./uploads` and store a `/uploads/…` URL instead. Adding S3/R2 is one `put()` branch in `backend/src/storage.ts` — nothing upstream changes. |
| **Rate limiter** | in-memory store | Implement the `RedisStore` in `backend/src/middleware/rateLimit.ts` and set `REDIS_URL` for multi-instance counting. The middleware is already store-agnostic. |
| **Database** | SQLite (`dev.db`) | Set `provider = "postgresql"` in `prisma/schema.prisma`, point `DATABASE_URL` at Postgres, `npx prisma db push`. All DB access is behind `store.ts`; the rest of the app is unchanged. (On Postgres you'd also switch the JSON-encoded `String` columns to native `Json`/enums.) |

> Existing keys in a pre-hardening `dev.db` are migrated automatically on boot (hashed, and the
> plaintext of secrets is dropped). The 66-check smoke test covers hashed-key auth and an
> attachment round-trip.

## API summary

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/v1/feedback` | public key | Submit feedback (ingest). Spends **1 token**; returns **402** when the org is out of tokens |
| GET  | `/v1/config` | public key | Widget pulls project theme |
| GET  | `/v1/plans` | — | Plan catalogue (free/pro/enterprise) for the pricing page |
| POST | `/v1/signup` | — | Self-serve org signup → creates an isolated tenant + keys (charges card for paid plans) |
| GET  | `/auth/google` | — | Start sign-in → redirects to real Google (if configured) or the mock page |
| GET/POST | `/auth/google/callback` | — | OAuth code exchange (real) / mock form post → creates the user + session cookie |
| GET  | `/v1/billing/checkout/return` | — | Stripe Checkout success return → verifies payment, credits tokens (idempotent) |
| POST | `/auth/logout` | session | End the session |
| GET  | `/v1/me` | session | Current user + org (drives the dashboard & onboarding) |
| POST | `/v1/onboarding` | session | Create the org for a signed-in user (first-time setup) |
| GET  | `/v1/admin/feedback` | secret key | List/filter feedback |
| PATCH| `/v1/admin/feedback/:id` | secret key | Change status |
| GET  | `/v1/admin/stats` | secret key | Counts + avg rating |
| GET  | `/v1/admin/projects` | secret key | List projects |
| PATCH| `/v1/admin/projects/:id` | secret key | Lock the public key to specific origins (or `["*"]` for any) |
| GET  | `/v1/admin/billing` | secret key / session | Token balance, packs, card on file, invoices |
| POST | `/v1/admin/billing/buy-tokens` | secret key / session | Buy a token pack (charges card → tops up balance) |
| POST | `/v1/admin/billing/checkout` | secret key / session | Change plan tier (legacy; charges card) |
| GET  | `/v1/admin/billing/invoices` | secret key / session | Payment history |

## Layout

```
backend/   Express + TS. ingest API, admin API, auth + rate-limit middleware.
  prisma/    schema.prisma (data model §6) + seed; dev.db is the SQLite file.
  src/store.ts  the only file that touches the DB — swap target for Postgres.
frontend/
  widget/    feedback.js (embeddable) + demo.html
  sdk/       @jicama/feedback npm package (wraps API + widget)
  dashboard/ React + Vite + Tailwind admin console (built to dist/, served by backend)
```

## What maps to "real" next (per DESIGN.md §10)

- ✅ ~~Replace the in-memory store with Prisma~~ — done (SQLite now; flip provider for Postgres).
- ✅ ~~Build the dashboard as the planned React + Vite app~~ — done (`frontend/dashboard`).
- ✅ ~~Hash API keys~~ — done (SHA-256 hash-only secrets; see [Production hardening](#production-hardening)).
- ✅ ~~Move attachments off inline data-URLs~~ — pluggable storage (`STORAGE=filesystem`; S3/R2 is one `put()` branch).
- ✅ ~~Real accounts + billing~~ — Google login (mock + real OAuth), tokens, Stripe Checkout.
- ✅ ~~Per-project origin allow-lists & widget theming~~ — done (Settings + Widget tabs).
- Provision the managed services (Postgres, Redis, S3/R2) + deploy behind HTTPS.
- Key-management endpoints (rotate/revoke) in the admin API; notifications/webhooks; team roles.
