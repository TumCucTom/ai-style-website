// scripts/spotify.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");

const API_KEY = "1e9027e3b91363a8a84cc9578ff8e84d";
const USER = "trvbale";
const API_URL = `https://ws.audioscrobbler.com/2.0`;

async function fetchNowPlaying() {
  const url = `${API_URL}/?method=user.getrecenttracks&user=${USER}&api_key=${API_KEY}&format=json&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Last.fm API ${res.status}`);
  const data = await res.json();

  const track = data.recenttracks?.track?.[0];
  if (!track) return null;

  const isNowPlaying = track["@attr"]?.nowplaying === "true";

  return {
    name: track.name,
    artist: track.artist?.["#text"] || "",
    album: track.album?.["#text"] || "",
    url: track.url,
    image: track.image?.find((i) => i.size === "large")?.["#text"] || null,
    isNowPlaying,
    playedAt: track.date?.["#text"] || null,
  };
}

async function fetchWeeklyStats() {
  // Get recent tracks for the last 7 days to count scrobbles
  const weekAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
  const url = `${API_URL}/?method=user.getrecenttracks&user=${USER}&api_key=${API_KEY}&format=json&limit=200&from=${weekAgo}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();

  const tracks = data.recenttracks?.track || [];
  const totalScrobbles = typeof data.recenttracks?.["@attr"]?.total === "number"
    ? parseInt(data.recenttracks["@attr"].total)
    : tracks.length;

  return { totalScrobbles };
}

async function fetchTopArtists() {
  const url = `${API_URL}/?method=user.gettopartists&user=${USER}&api_key=${API_KEY}&format=json&period=7day&limit=3`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();

  const artists = (data.topartists?.artist || []).map((a) => ({
    name: a.name,
    playCount: a.playcount,
  }));
  return { artists };
}

async function fetchUserStats() {
  const url = `${API_URL}/?method=user.getinfo&user=${USER}&api_key=${API_KEY}&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return {
    totalScrobbles: data.user?.playcount || "0",
    subscriber: data.user?.subscriber === "1",
  };
}

try {
  const [current, weeklyStats, topArtists, userStats] = await Promise.all([
    fetchNowPlaying(),
    fetchWeeklyStats(),
    fetchTopArtists(),
    fetchUserStats(),
  ]);

  const out = {
    user: USER,
    fetchedAt: new Date().toISOString(),
    current,
    weeklyStats: weeklyStats || null,
    topArtists: topArtists?.artists || [],
    totalScrobbles: userStats?.totalScrobbles || null,
  };
  fs.writeFileSync(path.join(DATA, "live-spotify.json"), JSON.stringify(out, null, 2));
  if (current) {
    console.log(`now playing: ${current.artist} — ${current.name}`);
  } else {
    console.log("no active stream found");
  }
  if (weeklyStats) {
    console.log(`last 7d scrobbles: ${weeklyStats.totalScrobbles}`);
  }
  if (topArtists?.artists?.length) {
    console.log(`top artists: ${topArtists.artists.map((a) => `${a.name} (${a.playCount})`).join(", ")}`);
  }
} catch (err) {
  const stub = { user: USER, fetchedAt: new Date().toISOString(), current: null, error: String(err?.message ?? err) };
  fs.writeFileSync(path.join(DATA, "live-spotify.json"), JSON.stringify(stub, null, 2));
  console.warn(`spotify fetch failed: ${stub.error}`);
  process.exit(0);
}