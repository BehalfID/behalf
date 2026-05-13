#!/usr/bin/env node
/**
 * BehalfID X Autoposter
 *
 * Spins up a `claude -p` session on a random interval (35–106 min) that reads
 * brand context + recent posts, generates a tweet, and posts it to X.
 *
 * Usage:
 *   node scripts/x-autoposter.js           # runs forever
 *   node scripts/x-autoposter.js --once    # single run then exit
 *   node scripts/x-autoposter.js --dry-run # generates tweet but does not post
 *
 * Prerequisites:
 *   - `claude` CLI installed and authenticated (run `claude` once to verify)
 *
 * Required env vars (add to .env.local or export before running):
 *   X_API_KEY
 *   X_API_SECRET
 *   X_ACCESS_TOKEN
 *   X_ACCESS_TOKEN_SECRET
 *   X_USERNAME   (account handle without @, used to fetch past tweets)
 *
 * Install deps first:
 *   npm install twitter-api-v2 dotenv
 */

"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { spawn, execSync } = require("child_process");
const { TwitterApi } = require("twitter-api-v2");
const fs = require("fs");

// ─── Config ──────────────────────────────────────────────────────────────────

const MIN_DELAY_MS = 35 * 60 * 1000;   // 35 minutes
const MAX_DELAY_MS = 106 * 60 * 1000;  // 1 hour 46 minutes
const PAST_POSTS_TO_FETCH = 20;
const BRAND_CONTEXT_PATH = path.join(__dirname, "x-brand-context.md");

const args = process.argv.slice(2);
const ONCE = args.includes("--once");
const DRY_RUN = args.includes("--dry-run");

// ─── Validation ───────────────────────────────────────────────────────────────

function assertEnv(name) {
  if (!process.env[name]) {
    console.error(`[autoposter] Missing required env var: ${name}`);
    process.exit(1);
  }
}

function assertClaude() {
  try {
    execSync("which claude", { stdio: "ignore" });
  } catch {
    console.error("[autoposter] `claude` CLI not found in PATH. Install Claude Code and authenticate first.");
    process.exit(1);
  }
}

assertClaude();
if (!DRY_RUN) {
  assertEnv("X_API_KEY");
  assertEnv("X_API_SECRET");
  assertEnv("X_ACCESS_TOKEN");
  assertEnv("X_ACCESS_TOKEN_SECRET");
}

// ─── Clients ─────────────────────────────────────────────────────────────────

function makeXClient() {
  return new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomDelay() {
  return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadBrandContext() {
  if (!fs.existsSync(BRAND_CONTEXT_PATH)) {
    throw new Error(`Brand context file not found: ${BRAND_CONTEXT_PATH}`);
  }
  return fs.readFileSync(BRAND_CONTEXT_PATH, "utf8");
}

async function fetchRecentPosts() {
  const username = process.env.X_USERNAME;
  if (!username) {
    console.warn("[autoposter] X_USERNAME not set — skipping past post fetch");
    return [];
  }

  try {
    const client = makeXClient();
    const user = await client.v2.userByUsername(username, {
      "user.fields": ["id"],
    });

    if (!user.data) {
      console.warn(`[autoposter] Could not find X user @${username}`);
      return [];
    }

    const timeline = await client.v2.userTimeline(user.data.id, {
      max_results: PAST_POSTS_TO_FETCH,
      "tweet.fields": ["created_at", "text"],
      exclude: ["retweets", "replies"],
    });

    return (timeline.data?.data ?? []).map((t) => ({
      text: t.text,
      created_at: t.created_at,
    }));
  } catch (err) {
    console.warn("[autoposter] Failed to fetch past posts:", err.message);
    return [];
  }
}

async function generateTweet(brandContext, recentPosts) {
  const recentPostsBlock =
    recentPosts.length > 0
      ? `## Recent posts (do NOT repeat these angles)\n\n${recentPosts
          .map((p, i) => `${i + 1}. ${p.text}`)
          .join("\n\n")}`
      : "## Recent posts\n\n(none available)";

  const prompt = `You are the social media voice for BehalfID. Your only job is to write a single X (Twitter) post.

${brandContext}

Rules for this response:
- Output ONLY the tweet text. No preamble, no explanation, no quotes around it.
- Maximum 280 characters.
- Match the brand voice exactly as described above.
- Vary your angle from recent posts — don't repeat a topic that was just covered.
- Never include a URL unless it is https://behalfid.com and it genuinely adds value.

${recentPostsBlock}

Write one tweet for BehalfID right now. Output only the tweet text.`;

  return new Promise((resolve, reject) => {
    const proc = spawn("claude", ["-p", prompt], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => { stdout += chunk; });
    proc.stderr.on("data", (chunk) => { stderr += chunk; });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`claude exited with code ${code}: ${stderr.trim()}`));
      }
      const tweet = stdout.trim();
      if (!tweet) return reject(new Error("claude returned empty output"));
      if (tweet.length > 280) {
        return reject(new Error(`Generated tweet is too long (${tweet.length} chars): ${tweet}`));
      }
      resolve(tweet);
    });

    proc.on("error", (err) =>
      reject(new Error(`Failed to spawn claude: ${err.message}`))
    );
  });
}

async function postTweet(text) {
  const client = makeXClient();
  const result = await client.v2.tweet(text);
  return result.data.id;
}

// ─── Main loop ────────────────────────────────────────────────────────────────

async function runOnce() {
  const timestamp = new Date().toISOString();
  console.log(`\n[autoposter] ${timestamp} — starting run`);

  const brandContext = loadBrandContext();
  console.log("[autoposter] Brand context loaded");

  const recentPosts = DRY_RUN ? [] : await fetchRecentPosts();
  console.log(`[autoposter] Fetched ${recentPosts.length} recent posts for context`);

  console.log("[autoposter] Calling claude...");
  const tweet = await generateTweet(brandContext, recentPosts);
  console.log(`[autoposter] Generated tweet (${tweet.length} chars):\n\n  ${tweet}\n`);

  if (DRY_RUN) {
    console.log("[autoposter] Dry run — skipping post");
    return;
  }

  const tweetId = await postTweet(tweet);
  console.log(`[autoposter] Posted: https://x.com/i/web/status/${tweetId}`);
}

async function main() {
  if (DRY_RUN) console.log("[autoposter] Running in DRY RUN mode — no posts will be made");
  if (ONCE) console.log("[autoposter] Running in ONCE mode — will exit after one post");

  while (true) {
    try {
      await runOnce();
    } catch (err) {
      console.error("[autoposter] Run failed:", err.message);
    }

    if (ONCE) break;

    const delayMs = randomDelay();
    const delayMin = Math.round(delayMs / 60000);
    const nextAt = new Date(Date.now() + delayMs).toLocaleTimeString();
    console.log(`[autoposter] Next run in ~${delayMin} min (around ${nextAt})`);
    await sleep(delayMs);
  }
}

main().catch((err) => {
  console.error("[autoposter] Fatal:", err);
  process.exit(1);
});
