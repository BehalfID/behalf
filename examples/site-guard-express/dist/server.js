/**
 * BehalfID Site Guard — Express example server
 *
 * Demonstrates two guarded routes (/docs and /admin) and one public route.
 *
 * Start:  npm start
 * Dev:    npm run dev
 *
 * Environment variables:
 *   SITE_GUARD_KEY     – Required. Site key from the BehalfID dashboard.
 *   BEHALFID_BASE_URL  – Optional. Defaults to https://behalfid.com.
 *   PORT               – Optional. Defaults to 3001.
 */
import express from "express";
import { siteGuard } from "./siteGuard.js";
const app = express();
const PORT = Number(process.env.PORT ?? 3001);
// ---------------------------------------------------------------------------
// Public route — no Site Guard check.
// ---------------------------------------------------------------------------
app.get("/", (_req, res) => {
    res.type("text").send("BehalfID Site Guard Express example — see /docs or /admin.");
});
// ---------------------------------------------------------------------------
// Health check — always available, no Site Guard check.
// ---------------------------------------------------------------------------
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
// ---------------------------------------------------------------------------
// Protected: /docs/*
//
// The siteGuard() middleware calls BehalfID before the route handler runs.
// Whether access is allowed or blocked depends on the rules configured in
// the BehalfID dashboard for this site.
//
// Example rule:
//   User-Agent pattern:  *Bot*
//   Allowed paths:       /docs/*
// ---------------------------------------------------------------------------
app.get("/docs/:slug?", siteGuard(), (req, res) => {
    const slug = req.params.slug ?? "index";
    res.json({
        message: `Docs page: ${slug}`,
        note: "Served after Site Guard allowed access.",
    });
});
// ---------------------------------------------------------------------------
// Protected: /admin/*
//
// This route is intentionally blocked for AI agents and crawlers by a
// blockedPaths rule in the dashboard.
//
// Example rule:
//   User-Agent pattern:  *
//   Blocked paths:       /admin/*
// ---------------------------------------------------------------------------
app.get("/admin/:page?", siteGuard(), (req, res) => {
    const page = req.params.page ?? "index";
    res.json({
        message: `Admin page: ${page}`,
        note: "This would only be reached if Site Guard allowed it.",
    });
});
// ---------------------------------------------------------------------------
// Start the server.
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`[site-guard-express] Listening on http://localhost:${PORT}`);
    console.log(`  GET /         – public (no check)`);
    console.log(`  GET /docs     – protected by Site Guard`);
    console.log(`  GET /admin    – protected by Site Guard`);
    if (!process.env.SITE_GUARD_KEY) {
        console.warn("[site-guard-express] WARNING: SITE_GUARD_KEY is not set. " +
            "All guarded routes will fail closed (403).");
    }
});
export default app;
