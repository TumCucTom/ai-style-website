// scripts/chess.mjs
// Fetch Tom's chess.com public profile + stats and write
// data/live-chess.json. Re-run anytime with `npm run chess`.
//
// Chess.com's public API is unauthenticated and rate-limited to 1
// req/s on /pub/* endpoints. We only call two of them, so even
// back-to-back cron runs (4h interval) stay well under the cap.
//
// Output shape is shaped for a single LiveWall tile: rapid rating
// front-and-centre, plus best-ever, W/L/D record, and the time of
// the most recent game.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");

const USER = "reewyyn";
const UA = "tom-bale-v3-site";
const PROFILE_URL = `https://api.chess.com/pub/player/${USER}`;
const STATS_URL = `https://api.chess.com/pub/player/${USER}/stats`;

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    throw new Error(`chess.com ${res.status} on ${url}: ${await res.text()}`);
  }
  return res.json();
}

function pickCategory(stats, key) {
  const cat = stats?.[key];
  if (!cat) return null;
  return {
    rating: cat.last?.rating ?? null,
    best: cat.best?.rating ?? null,
    bestDate: cat.best?.date ?? null,
    wins: cat.record?.win ?? 0,
    losses: cat.record?.loss ?? 0,
    draws: cat.record?.draw ?? 0,
    lastGameDate: cat.last?.date ?? null,
  };
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function relTime(epoch) {
  if (!epoch) return null;
  const diff = Date.now() - epoch * 1000;
  if (diff < HOUR) return "just now";
  const m = Math.round(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

try {
  const [profile, stats] = await Promise.all([getJson(PROFILE_URL), getJson(STATS_URL)]);

  const out = {
    user: USER,
    profileUrl: profile.url,
    avatar: profile.avatar,
    country: profile.country?.split("/").pop() ?? null,
    fetchedAt: new Date().toISOString(),
    rapid: pickCategory(stats, "chess_rapid"),
    blitz: pickCategory(stats, "chess_blitz"),
    bullet: pickCategory(stats, "chess_bullet"),
    daily: pickCategory(stats, "chess_daily"),
  };

  fs.writeFileSync(path.join(DATA, "live-chess.json"), JSON.stringify(out, null, 2));

  const r = out.rapid;
  if (r) {
    console.log(
      `rapid ${r.rating} (best ${r.best}) · ${r.wins}-${r.losses}-${r.draws} · last ${relTime(r.lastGameDate)}`
    );
  } else {
    console.log("no rapid stats returned");
  }
} catch (err) {
  // Don't crash the dev server on a transient chess.com failure.
  // Write a stub so the component still has something to read.
  const stub = {
    user: USER,
    profileUrl: `https://www.chess.com/member/${USER}`,
    fetchedAt: new Date().toISOString(),
    rapid: null,
    blitz: null,
    bullet: null,
    daily: null,
    error: String(err?.message ?? err),
  };
  fs.writeFileSync(path.join(DATA, "live-chess.json"), JSON.stringify(stub, null, 2));
  console.warn(`chess fetch failed, wrote stub: ${stub.error}`);
  process.exit(0);
}
