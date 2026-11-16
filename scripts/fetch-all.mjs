// scripts/fetch-all.mjs
// Fetch all live data and push in a single git cycle.
// Runs as part of the refresh-live workflow or standalone.
//
// Handles: live-contributions.json, live-chess.json, live-spotify.json, open-source.json
//
// Git cycle: sync origin/main -> write data -> commit -> push.
// Non-fast-forward pushes are retried by recommitting generated data on latest main.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gitConfig, gitPull, pushRefreshCommit } from "./refresh-git.mjs";
import { fetchContributions, failedContributions } from "./contributions.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");

const TOKEN = process.env.GH_USER_TOKEN || process.env.GITHUB_TOKEN;
const authHeaders = () => ({
  "User-Agent": "tom-bale-v3-site",
  Accept: "application/vnd.github.v3+json",
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
});

// ------------------------------------------------------------------
// Chess
// ------------------------------------------------------------------
async function fetchChess() {
  const USER = "reewyyn";
  const UA = "tom-bale-v3-site";
  const PROFILE_URL = `https://api.chess.com/pub/player/${USER}`;
  const STATS_URL = `https://api.chess.com/pub/player/${USER}/stats`;

  async function getJson(url) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`chess.com ${res.status} on ${url}: ${await res.text()}`);
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

  const [profile, stats] = await Promise.all([getJson(PROFILE_URL), getJson(STATS_URL)]);
  return {
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
}

// ------------------------------------------------------------------
// Spotify / Last.fm
// ------------------------------------------------------------------
async function fetchSpotify() {
  const API_KEY = "1e9027e3b91363a8a84cc9578ff8e84d";
  const USER = "trvbale";
  const API_URL = "https://ws.audioscrobbler.com/2.0";

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Last.fm ${res.status}`);
    return res.json();
  }

  const [recent, topArtists, userInfo] = await Promise.all([
    fetchJson(`${API_URL}/?method=user.getrecenttracks&user=${USER}&api_key=${API_KEY}&format=json&limit=1`),
    fetchJson(`${API_URL}/?method=user.gettopartists&user=${USER}&api_key=${API_KEY}&format=json&period=7day&limit=3`),
    fetchJson(`${API_URL}/?method=user.getinfo&user=${USER}&api_key=${API_KEY}&format=json`),
  ]);

  const track = recent.recenttracks?.track?.[0];
  const current = track ? {
    name: track.name,
    artist: track.artist?.["#text"] || "",
    album: track.album?.["#text"] || "",
    url: track.url,
    image: track.image?.find((i) => i.size === "large")?.["#text"] || null,
    isNowPlaying: track["@attr"]?.nowplaying === "true",
    playedAt: track.date?.["#text"] || null,
  } : null;

  const weekAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
  const weekly = await fetchJson(`${API_URL}/?method=user.getrecenttracks&user=${USER}&api_key=${API_KEY}&format=json&limit=200&from=${weekAgo}`);
  const weeklyTracks = weekly.recenttracks?.track || [];
  const totalScrobbles = weeklyTracks.length;

  return {
    user: USER,
    fetchedAt: new Date().toISOString(),
    current,
    weeklyStats: { totalScrobbles },
    topArtists: (topArtists.topartists?.artist || []).map((a) => ({ name: a.name, playCount: a.playcount })),
    totalScrobbles: userInfo.user?.playcount || "0",
  };
}

// ------------------------------------------------------------------
// OSS PRs
// ------------------------------------------------------------------
async function fetchOSS() {
  const OSS_FILE = path.join(DATA, "open-source.json");
  const raw = fs.readFileSync(OSS_FILE, "utf8");
  const repos = JSON.parse(raw);

  const authHeaders2 = () => ({
    "User-Agent": "tom-bale-v3-site",
    Accept: "application/vnd.github.v3+json",
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
  });

  async function fetchAllPRsSearch(org, repo) {
    const url = `https://api.github.com/search/issues?q=author:TumCucTom+repo:${org}/${repo}+type:pr&sort=created&order=desc&per_page=100`;
    const res = await fetch(url, { headers: authHeaders2() });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.items) return null;
    return data.items.map((pr) => ({
      n: pr.number,
      title: pr.title,
      state: pr.state === "open" ? "OPEN" : pr.state === "closed" ? "CLOSED" : pr.state.toUpperCase(),
      date: pr.created_at.slice(0, 10),
    }));
  }

  for (const repo of repos) {
    const freshPRs = await fetchAllPRsSearch(repo.org, repo.repo);
    if (freshPRs === null) continue;
    repo.prs = freshPRs;
  }

  return repos;
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
async function main() {
  console.log("Fetching all live data...");
  const [commitsData, chessData, spotifyData, ossData] = await Promise.all([
    fetchContributions().catch((e) => {
      console.warn(`GitHub contributions refresh failed (${e.message}); keeping the last good numbers`);
      const previous = JSON.parse(fs.readFileSync(path.join(DATA, "live-contributions.json"), "utf8"));
      return failedContributions(previous);
    }),
    fetchChess().catch((e) => ({ error: e.message })),
    fetchSpotify().catch((e) => ({ error: e.message })),
    fetchOSS().catch((e) => ({ error: e.message })),
  ]);

  // Log summaries
  if (commitsData && !commitsData.error) {
    const c = commitsData;
    console.log(`contributions: ${c.today.count} today · ${c.last7d}/7d · ${c.lastYear}/year`);
  }
  if (chessData && !chessData.error && chessData.rapid) {
    const r = chessData.rapid;
    console.log(`chess: rapid ${r.rating} (best ${r.best}) · ${r.wins}-${r.losses}-${r.draws}`);
  }
  if (spotifyData && !spotifyData.error) {
    const s = spotifyData;
    if (s.current) console.log(`spotify: ${s.current.isNowPlaying ? "now playing" : "last played"} ${s.current.artist} — ${s.current.name}`);
    if (s.weeklyStats) console.log(`spotify: ${s.weeklyStats.totalScrobbles} scrobbles this week`);
  }
  if (ossData && !ossData.error) {
    const total = ossData.reduce((sum, r) => sum + r.prs.length, 0);
    console.log(`oss-prs: ${total} total PRs across ${ossData.length} repos`);
  }

  // Git cycle — one pull, one push
  gitConfig();
  gitPull();

  // Write files after pull so we commit freshest data
  fs.writeFileSync(path.join(DATA, "live-contributions.json"), JSON.stringify(commitsData, null, 2) + "\n");
  fs.writeFileSync(path.join(DATA, "live-chess.json"), JSON.stringify(chessData, null, 2));
  fs.writeFileSync(path.join(DATA, "live-spotify.json"), JSON.stringify(spotifyData, null, 2));
  if (ossData && !ossData.error) {
    fs.writeFileSync(path.join(DATA, "open-source.json"), JSON.stringify(ossData, null, 2) + "\n");
  }

  pushRefreshCommit();
  console.log("done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

