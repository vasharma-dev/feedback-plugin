import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// base "/dashboard/" so the built assets resolve correctly when the backend serves
// this app under http://localhost:4000/dashboard/. In dev (vite, :5173) the app lives
// at /dashboard/ too, and /v1 calls are proxied to the backend so there's no CORS dance.
export default defineConfig({
  base: "/dashboard/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/v1": "http://localhost:4000",
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
