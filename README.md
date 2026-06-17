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
| http://localhost:4000/signup | **Pricing + self-serve signup** — an org "buys" the plugin, picks a plan, pays (test mode), and gets its own keys + dashboard |
| http://localhost:4000/dashboard | The tenant admin console (React + Vite + Tailwind) — **Feedback inbox** + **Billing & plan** tabs |
| http://localhost:4000/health | Health check |

> **Billing runs in simulated "test mode"** — no real charges. Use card `4242 4242 4242 4242`
> (any future expiry + CVC) to succeed, or `4000 0000 0000 0002` to see a decline. The code is
> structured so swapping in real Stripe is a localized change (see `backend/src/store.ts`
> `chargeCard` + `backend/src/plans.ts`).

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

It runs 31 checks across the whole system — ingest, auth/trust separation, validation, spam
honeypot, admin stats/list/filter/patch, **plans/signup, billing + simulated payments (incl.
declined cards), plan quotas, multi-tenant isolation**, and that the widget + signup + React
dashboard are served — printing ✅/❌ per check and exiting non-zero on any failure. Expected:

```
✅ ALL PASS — 31 passed, 0 failed
```

## The three integration surfaces (DESIGN.md §2)

**1. Zero-code `<script>`** — one tag, a floating button appears:

```html
<script src="https://cdn.jicama.tech/feedback.js"
        data-key="pk_demo_acme_123"
        data-color="#6C2BD9"></script>
```

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

## API summary

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/v1/feedback` | public key | Submit feedback (ingest). Returns **402** when the plan's monthly quota is hit |
| GET  | `/v1/config` | public key | Widget pulls project theme |
| GET  | `/v1/plans` | — | Plan catalogue (free/pro/enterprise) for the pricing page |
| POST | `/v1/signup` | — | Self-serve org signup → creates an isolated tenant + keys (charges card for paid plans) |
| GET  | `/v1/admin/feedback` | secret key | List/filter feedback |
| PATCH| `/v1/admin/feedback/:id` | secret key | Change status |
| GET  | `/v1/admin/stats` | secret key | Counts + avg rating |
| GET  | `/v1/admin/projects` | secret key | List projects |
| GET  | `/v1/admin/billing` | secret key | Current plan, card on file, usage vs quota |
| POST | `/v1/admin/billing/checkout` | secret key | Upgrade/downgrade plan (charges card) |
| GET  | `/v1/admin/billing/invoices` | secret key | Payment history |

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
- Move attachments from inline data-URLs to S3/R2.
- Hash API keys; add key-management endpoints to the admin API.
- Build the dashboard as the planned React + Vite app; compile the widget with Vite to UMD/ESM.
- Notifications/webhooks, billing, roles (Phase 2/3).
