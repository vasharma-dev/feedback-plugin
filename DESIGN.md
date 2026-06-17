# Feedback Plugin — Design Document

A sellable, embeddable feedback system for **jicama.tech**. Any software product can drop it
in and instantly collect, manage, and act on feedback from their own users — on web, mobile,
or desktop, on any device.

---

## 1. Vision

> "One snippet. Any app. All your users' feedback in one place."

A customer of jicama.tech (we'll call them a **tenant**) buys the plugin, gets an **API key**,
and embeds a tiny widget (or calls our API/SDK) inside *their* software. Their end users then
submit feedback (bugs, feature requests, ratings, screenshots). The tenant manages everything
from a dashboard. We host the backend; they integrate the frontend.

### Who are the actors?
| Actor | Description |
|-------|-------------|
| **Platform owner** (jicama.tech) | Operates the hosted backend, bills tenants, manages plans. |
| **Tenant** | A company that buys the plugin and embeds it in their software. |
| **End user** | The tenant's customer who actually submits feedback. |

---

## 2. Core principle: integrate anywhere, run on any device

To work in *any* software on *any* device, the plugin is delivered in layered options so a
tenant picks whatever fits their stack:

1. **Drop-in script (zero-code)** — one `<script>` tag + a data-key. A floating "Feedback"
   button appears. Best for any website / web app.
2. **JavaScript SDK (NPM)** — `npm i @jicama/feedback` for React/Vue/Angular/plain JS, gives
   full control over when/where the widget opens and lets them pass user context.
3. **REST API** — language-agnostic HTTP endpoints. Mobile apps (iOS/Android), desktop apps
   (Electron/.NET), backends, CLI tools — anything that can make an HTTP call can submit
   feedback. This is what makes it truly universal.
4. **Optional native wrappers later** — thin React Native / Flutter / Swift / Kotlin packages
   that wrap the REST API for first-class mobile UX.

Because the API is the foundation and the widget is just one client of it, the system is
inherently cross-platform and device-independent. The widget itself is built responsive and
themeable so it looks native on phone, tablet, and desktop.

---

## 3. High-level architecture

```
 End user's device (any)                Tenant's software
 ┌─────────────────────┐
 │  Feedback Widget /   │  embeds via   ┌───────────────────────────┐
 │  SDK / REST call     │◀──────────────│  <script> | npm | API call │
 └──────────┬──────────┘               └───────────────────────────┘
            │ HTTPS  (API key auth, per-tenant)
            ▼
 ┌───────────────────────────────────────────────────────────┐
 │                     BACKEND (hosted by us)                  │
 │  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐  │
 │  │ Public   │  │  Admin API   │  │  Auth / API-key /     │  │
 │  │ Ingest   │  │ (dashboard)  │  │  multi-tenant guard   │  │
 │  │ API      │  │              │  │                       │  │
 │  └────┬─────┘  └──────┬───────┘  └──────────┬────────────┘  │
 │       └───────────────┴─────────────────────┘               │
 │                    Service layer                            │
 │       ┌──────────────┴───────────────┐                      │
 │       │   Database (per-tenant scoped)│  file/image storage  │
 │       └───────────────────────────────┘                     │
 │   Optional: webhooks, email/Slack notify, rate limiting      │
 └───────────────────────────────────────────────────────────┘
            ▲
            │
 ┌──────────┴──────────┐
 │  Tenant Dashboard    │  (frontend admin app — manage feedback,
 │  (web app)           │   statuses, team, integrations, API keys)
 └─────────────────────┘
```

### Two distinct frontends
- **Widget** (`frontend/widget`) — the embeddable end-user-facing capture UI. Tiny, fast,
  framework-free build, themeable, responsive.
- **Dashboard** (`frontend/dashboard`) — the tenant's admin console for triaging feedback.

### Backend = three logical surfaces
- **Ingest API** — public, API-key authed, receives feedback from widgets/SDK/REST.
- **Admin API** — authenticated, powers the dashboard.
- **Auth & tenancy** — issues/validates API keys, isolates each tenant's data.

---

## 4. Features

### MVP (build first)
- Submit feedback: type (bug / idea / praise / question), message, rating (1–5 / emoji).
- Capture context automatically: URL, browser, OS, screen size, app version, user identifier.
- Optional screenshot / file attachment.
- Floating widget button + modal form, fully responsive & themeable (colors, position, text).
- Per-tenant API keys & data isolation (multi-tenancy).
- Tenant dashboard: list, filter, search, change status (new/in-progress/done/won't-do).
- Basic spam protection + rate limiting.
- REST ingest endpoint for non-web clients.

### Phase 2
- Email / Slack / webhook notifications on new feedback.
- Tags, assignees, internal notes, comment threads.
- Feedback board / upvoting (public roadmap) so end users vote on feature requests.
- Analytics: volume over time, sentiment, top categories, CSAT/NPS.
- Customizable forms (tenant designs their own fields).
- Multiple projects per tenant.

### Phase 3 (sellability / scale)
- Billing & plans (free / pro / enterprise) tied to usage limits.
- Team roles & permissions.
- Native mobile SDK wrappers.
- AI: auto-categorize, summarize, detect duplicates, sentiment scoring.
- Integrations: Jira, Linear, GitHub Issues, Trello, Zendesk.
- White-labeling for enterprise tenants.

---

## 5. Tech stack (proposed)

| Layer | Choice | Why |
|-------|--------|-----|
| Backend | **Node.js + Express (or NestJS)** + TypeScript | Fast, huge ecosystem, easy hosting, type safety. |
| Database | **PostgreSQL** (Prisma ORM) | Relational fits feedback/tenants/users; row-level tenant scoping. |
| File storage | S3-compatible (e.g. AWS S3 / Cloudflare R2) | Screenshots/attachments. |
| Widget | **Vanilla TS + Vite**, compiled to a single small UMD/ESM bundle | No framework dependency = embeds anywhere, tiny size. |
| Dashboard | **React + Vite + Tailwind** | Rich admin UI. |
| SDK | TS package published to NPM | Wraps the API. |
| Auth | API keys (ingest) + JWT/session (dashboard) | Two trust levels. |
| Hosting | Containerized (Docker), deployable to any cloud | Portability. |

> These are recommendations — open to your preferences (e.g. Python/FastAPI backend, Vue
> dashboard). Confirm before we lock it in.

---

## 6. Data model (initial)

- **Tenant** — id, name, plan, created_at.
- **ApiKey** — id, tenant_id, key_hash, scopes, active.
- **User (dashboard)** — id, tenant_id, email, role, password_hash.
- **Project** — id, tenant_id, name, settings (theme, allowed origins).
- **Feedback** — id, project_id, type, message, rating, status, end_user_id, metadata (url,
  browser, os, device, app_version), created_at.
- **Attachment** — id, feedback_id, file_url, mime.
- **Comment/Note** — id, feedback_id, author, body, internal flag.
- **Webhook** — id, tenant_id, url, events.

---

## 7. Integration experience (what the tenant does)

**Zero-code:**
```html
<script src="https://cdn.jicama.tech/feedback.js" data-key="PUBLIC_KEY"></script>
```

**SDK:**
```js
import { Feedback } from '@jicama/feedback';
Feedback.init({ key: 'PUBLIC_KEY', user: { id, email }, theme: { color: '#6C2BD9' } });
Feedback.open(); // open programmatically from your own button
```

**REST (any platform / mobile / desktop):**
```http
POST https://api.jicama.tech/v1/feedback
Authorization: Bearer PUBLIC_KEY
{ "type": "bug", "message": "...", "rating": 4, "metadata": { ... } }
```

---

## 8. Security & multi-tenancy
- Every request scoped to a tenant via API key; data queries always filtered by tenant_id.
- Public (ingest) keys vs secret (admin) keys — public keys can only create feedback.
- Allowed-origins / domain allowlist per project to stop key abuse.
- Rate limiting + spam/bot protection (honeypot, optional CAPTCHA).
- HTTPS everywhere, input validation, file-type/size limits on uploads.
- GDPR considerations: data export/delete, configurable PII handling.

---

## 9. Proposed folder structure

```
feedback-plugin/
├── DESIGN.md                ← this document
├── backend/
│   ├── src/
│   │   ├── api/             (ingest + admin routes)
│   │   ├── services/
│   │   ├── models/          (Prisma schema / entities)
│   │   ├── middleware/      (auth, tenant, rate-limit)
│   │   └── index.ts
│   ├── prisma/              (schema + migrations)
│   ├── tests/
│   └── package.json
└── frontend/
    ├── widget/              (embeddable end-user widget)
    │   ├── src/
    │   └── package.json
    ├── dashboard/           (tenant admin app)
    │   ├── src/
    │   └── package.json
    └── sdk/                 (NPM SDK wrapping the API)
        ├── src/
        └── package.json
```

---

## 10. Build roadmap (phases)

1. **Scaffold & infra** — repos, configs, DB schema, Docker, health check.
2. **Ingest API + auth** — API keys, tenancy, `POST /feedback`, validation, rate limit.
3. **Widget** — responsive button + form, theming, metadata capture, attachments.
4. **Dashboard** — login, feedback list/filter/status, project & API-key management.
5. **SDK + REST docs** — publishable package, integration docs.
6. **Notifications & webhooks** (Phase 2 start).
7. **Polish, tests, deploy, billing hooks**.

---

## 11. Open questions for you (please confirm)
1. **Hosting model** — do we host the backend for tenants (SaaS), or also sell a self-host
   version they run themselves? (Changes auth/billing design.)
2. **Tech stack** — OK with Node + Postgres + React, or do you prefer something else?
3. **MVP scope** — is Section 4 "MVP" the right first cut, or trim/add anything?
4. **Branding** — confirm domains/names: `cdn.jicama.tech`, `api.jicama.tech`, `@jicama/feedback`.
5. **Billing** — build payments now or stub it for later?

---

*Next step:* review this, tell me your answers to Section 11, and I'll start building from the
roadmap (beginning with scaffold + ingest API).
```
