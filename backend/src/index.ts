import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { adminRouter } from "./api/admin.js";
import { billingRouter, publicBillingRouter } from "./api/billing.js";
import { ingestRouter } from "./api/ingest.js";
import { DEMO, DEMO2, ensureSeed } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT ?? 4000);

// Widget runs cross-origin from the tenant's site, so CORS is open on the API.
// Real auth is the API key, not the origin (origin is additionally checked per project).
app.use(cors());
app.use(express.json({ limit: "6mb" })); // generous for inlined screenshots in the prototype

app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Three logical surfaces from DESIGN.md §3, plus billing/accounts.
app.use("/v1", publicBillingRouter); // public: GET /v1/plans, POST /v1/signup
app.use("/v1", ingestRouter); // public, API-key authed ingest
app.use("/v1/admin", adminRouter); // dashboard / admin
app.use("/v1/admin/billing", billingRouter); // tenant billing console (secret key)

// ---- Serve the frontend prototypes from this same process (dev convenience) ----
// /frontend/widget/feedback.js, /demo, /dashboard, /sdk
const frontendDir = path.resolve(__dirname, "../../frontend");
app.use("/frontend", express.static(frontendDir));
app.get("/", (_req, res) => res.redirect("/demo"));
app.get("/demo", (_req, res) =>
  res.sendFile(path.join(frontendDir, "widget", "demo.html"))
);
// Self-serve signup / pricing page (the "buy the plugin" flow).
app.get("/signup", (_req, res) =>
  res.sendFile(path.join(frontendDir, "signup", "index.html"))
);

// Dashboard = the built React + Vite app. Serve its dist if present; otherwise a hint.
// For hot-reload dev, run `npm run dev` in frontend/dashboard (Vite at :5173 proxies /v1 here).
const dashboardDist = path.resolve(frontendDir, "dashboard", "dist");
app.use("/dashboard", express.static(dashboardDist));
app.get("/dashboard", (_req, res) => {
  const index = path.join(dashboardDist, "index.html");
  if (fs.existsSync(index)) return res.sendFile(index);
  res
    .status(503)
    .type("text/plain")
    .send(
      "Dashboard not built yet.\n\n" +
        "  cd frontend/dashboard && npm install && npm run build\n\n" +
        "or for hot reload:  npm run dev  → http://localhost:5173/dashboard/"
    );
});

// Central error handler — async route failures land here via next(err).
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
);

// Seed the demo tenant (idempotent) before accepting traffic, then listen.
await ensureSeed();
app.listen(PORT, () => {
  /* eslint-disable no-console */
  console.log(`\n  jicama feedback backend  →  http://localhost:${PORT}`);
  console.log(`  demo widget page         →  http://localhost:${PORT}/demo`);
  console.log(`  tenant dashboard         →  http://localhost:${PORT}/dashboard`);
  console.log(`  pricing / signup         →  http://localhost:${PORT}/signup`);
  console.log(`\n  Acme Inc.   (pro)   public ${DEMO.publicKey}   secret ${DEMO.secretKey}`);
  console.log(`  Globex Corp. (free) public ${DEMO2.publicKey}   secret ${DEMO2.secretKey}\n`);
});
