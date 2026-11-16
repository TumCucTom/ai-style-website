// scripts/chess-fit.mjs
// Teach the /chess bot to play like me, and measure how well it does.
//
//   npx tsx scripts/chess-fit.mjs            (about ten minutes on a laptop)
//   npx tsx scripts/chess-fit.mjs --refit    (reuse the last run's features)
//
// It pulls my public games from chess.com, holds back the newest 15%, and
// fits the weights in components/chess/bot.ts so that the move I actually
// played is as likely as possible in the other 85%. Then it asks: in the
// games it never saw, how often is the bot's favourite move the one I played?
// The answer, and everything the bot needs, goes to data/chess-tom.json.
//
// Needs tsx because it imports the bot's TypeScript directly, so the script
// and the page can't drift apart. Only the public username goes to chess.com;
// nothing about opponents is kept. The Maia weights (GPL-3.0) are downloaded
// to a temp folder from the Maia repository, never into this one.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";
import { Position, to } from "../components/chess/engine.ts";
import { parseNet } from "../components/chess/maia.ts";
import { featurise, learn, family, uci, FEATURES, MAIA_URL } from "../components/chess/bot.ts";

const HERE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(HERE), "..");
const OUT = path.join(ROOT, "data", "chess-tom.json");
const TMP = path.join(os.tmpdir(), "chess-fit");
const USER = "reewyyn";
const UA = "personal-site-chess-style/1.0";
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const HOLD = 0.15;
const FOLDS = 5;
const SHARDS = Math.max(2, Math.min(8, os.cpus().length - 2));
// The bot this one replaced (my opening book, then a noisy two-move search),
// scored the same way on the same held-out games before it was deleted.
const OLD = { top1: 0.36, top3: 0.546 };
const NAMES = ["maia", "book", "setup", "place", "slip", "blunder", "disaster", "capture", "recapture", "check", "castleK", "castleQ", "knight", "bishop", "rook", "queen", "king", "earlyQueen", "mate1", "forced", "battery", "hPush", "trick"];

fs.mkdirSync(TMP, { recursive: true });
const gamesFile = path.join(TMP, "games.json");
const maiaFile = path.join(TMP, "maia.pb.gz");
const phase = (ply) => { const n = Math.floor(ply / 2) + 1; return n <= 10 ? "1-10" : n <= 25 ? "11-25" : "26+"; };

/** Replay a game on the bot's own board, calling back before each move. */
function walk(g, fn) {
  const pos = new Position(START);
  const hist = [{ b: pos.b.slice(), side: pos.side, castle: pos.castle }];
  let half = 0;
  let lastTo = -1;
  for (let ply = 0; ply < g.moves.length; ply++) {
    const legal = pos.legal();
    const m = legal.find((x) => uci(x) === g.moves[ply]);
    if (m === undefined) return;
    if ((ply % 2 === 0) === (g.mine === "w")) fn({ ply, pos, history: hist.slice(0, 8), played: m, half, lastTo });
    half = pos.b[to(m)] !== 0 || Math.abs(pos.b[m & 63]) === 1 ? 0 : half + 1;
    lastTo = to(m);
    pos.make(m);
    hist.unshift({ b: pos.b.slice(), side: pos.side, castle: pos.castle });
  }
}

// ---------- worker: turn a slice of the games into rows of numbers ----------

if (process.argv[2] === "--worker") {
  const shard = Number(process.argv[3]);
  const games = JSON.parse(fs.readFileSync(gamesFile, "utf8"));
  const cut = Math.floor(games.length * (1 - HOLD));
  const train = games.slice(0, cut);
  const net = parseNet(new Uint8Array(zlib.gunzipSync(fs.readFileSync(maiaFile))));
  // A game must not be scored against a book that already contains it, so
  // each training game is scored with tables learnt from the other folds.
  const tables = {};
  const tablesFor = (gi) => {
    const k = gi < cut ? gi % FOLDS : -1;
    return (tables[k] ??= learn(k < 0 ? train : train.filter((_, i) => i % FOLDS !== k)));
  };
  const lines = [];
  games.forEach((g, gi) => {
    if (gi % SHARDS !== shard) return;
    const tom = { ...tablesFor(gi), weights: { maia: [], plain: [] } };
    const fam = family(g.mine, g.moves);
    walk(g, (r) => {
      const s = featurise({ history: r.history, pos: r.pos, family: fam, moveNo: Math.floor(r.ply / 2) + 1, halfmoves: r.half, lastTo: r.lastTo }, tom, net);
      lines.push(JSON.stringify({ g: gi, ply: r.ply, played: s.moves.indexOf(r.played), n: s.moves.length, f: Buffer.from(s.feats.buffer, s.feats.byteOffset, s.feats.byteLength).toString("base64") }));
    });
  });
  fs.writeFileSync(path.join(TMP, `feats-${shard}.jsonl`), lines.join("\n"));
  process.exit(0);
}

// ---------- main ----------

const refit = process.argv.includes("--refit");
if (!refit || !fs.existsSync(gamesFile)) {
  const get = async (url) => {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`${res.status} on ${url}`);
    return res;
  };
  const { archives } = await (await get(`https://api.chess.com/pub/player/${USER}/games/archives`)).json();
  const games = [];
  for (const url of archives) {
    for (const g of (await (await get(url)).json()).games) {
      if (g.rules !== "chess" || !g.pgn || (g.initial_setup && g.initial_setup !== START)) continue;
      const mine = g.white.username.toLowerCase() === USER ? "w" : g.black.username.toLowerCase() === USER ? "b" : null;
      if (!mine) continue;
      const c = new Chess();
      try {
        c.loadPgn(g.pgn);
      } catch {
        continue;
      }
      const h = c.history({ verbose: true });
      if (h.length < 8) continue;
      games.push({ end: g.end_time, mine, moves: h.map((m) => m.from + m.to + (m.promotion ?? "")), sans: h.map((m) => m.san) });
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  games.sort((a, b) => a.end - b.end);
  fs.writeFileSync(gamesFile, JSON.stringify(games));
  fs.writeFileSync(maiaFile, Buffer.from(await (await get(MAIA_URL)).arrayBuffer()));
  console.log(`${games.length} games; working out what the bot sees in each position, on ${SHARDS} cores…`);
  await Promise.all(
    Array.from({ length: SHARDS }, (_, i) =>
      new Promise((res, rej) => {
        const p = spawn(process.execPath, [...process.execArgv, HERE, "--worker", String(i)], { stdio: "inherit" });
        p.on("exit", (code) => (code ? rej(new Error(`worker ${i} failed`)) : res()));
      }),
    ),
  );
}

const games = JSON.parse(fs.readFileSync(gamesFile, "utf8"));
const cut = Math.floor(games.length * (1 - HOLD));
const rows = [];
for (const f of fs.readdirSync(TMP).filter((f) => /^feats-\d+\.jsonl$/.test(f))) {
  for (const line of fs.readFileSync(path.join(TMP, f), "utf8").split("\n")) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (r.played < 0) continue;
    const b = Buffer.from(r.f, "base64");
    rows.push({ g: r.g, ply: r.ply, played: r.played, n: r.n, x: new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice() });
  }
}
const train = rows.filter((r) => r.g < cut);
const held = rows.filter((r) => r.g >= cut);

function probs(r, w) {
  const p = new Float64Array(r.n);
  let max = -Infinity;
  for (let i = 0; i < r.n; i++) {
    let v = 0;
    for (let k = 0; k < FEATURES; k++) v += w[k] * r.x[i * FEATURES + k];
    p[i] = v;
    if (v > max) max = v;
  }
  let sum = 0;
  for (let i = 0; i < r.n; i++) sum += p[i] = Math.exp(p[i] - max);
  for (let i = 0; i < r.n; i++) p[i] /= sum;
  return p;
}

/** Maximum likelihood, by Adam: make the move I played as probable as possible. */
function fit(useMaia) {
  const w = new Float64Array(FEATURES);
  const m = new Float64Array(FEATURES);
  const v = new Float64Array(FEATURES);
  if (useMaia) w[0] = 1;
  for (let it = 1; it <= 400; it++) {
    const g = new Float64Array(FEATURES);
    for (const r of train) {
      const p = probs(r, w);
      for (let k = useMaia ? 0 : 1; k < FEATURES; k++) {
        let e = 0;
        for (let i = 0; i < r.n; i++) e += p[i] * r.x[i * FEATURES + k];
        g[k] += r.x[r.played * FEATURES + k] - e;
      }
    }
    for (let k = useMaia ? 0 : 1; k < FEATURES; k++) {
      const gk = g[k] / train.length - 1e-4 * w[k];
      m[k] = 0.9 * m[k] + 0.1 * gk;
      v[k] = 0.999 * v[k] + 0.001 * gk * gk;
      w[k] += (0.05 * (m[k] / (1 - 0.9 ** it))) / (Math.sqrt(v[k] / (1 - 0.999 ** it)) + 1e-8);
    }
  }
  return w;
}

function score(w) {
  const acc = {};
  for (const r of held) {
    const p = probs(r, w);
    const order = [...p.keys()].sort((a, b) => p[b] - p[a]);
    const rank = order.indexOf(r.played);
    for (const k of ["all", phase(r.ply), games[r.g].mine === "w" ? "white" : "black"]) {
      const a = (acc[k] ??= [0, 0, 0]);
      a[0]++;
      if (rank === 0) a[1]++;
      if (rank < 3) a[2]++;
    }
  }
  return acc;
}
const show = (name, acc) =>
  console.log(name.padEnd(12), ["all", "1-10", "11-25", "26+", "white", "black"].map((k) => `${k} ${((100 * acc[k][1]) / acc[k][0]).toFixed(1)}/${((100 * acc[k][2]) / acc[k][0]).toFixed(1)}`).join("  "));

console.log(`${train.length} of my moves to learn from, ${held.length} held back (${games.length - cut} games). top-1 / top-3 %, by move number and colour:`);
const alone = new Float64Array(FEATURES);
alone[0] = 1;
const sAlone = score(alone);
show("maia alone", sAlone);
const wMaia = fit(true);
const wPlain = fit(false);
// Things I do too rarely for 450 games to pin down, set by hand: play the
// h-file mate when it's there, and don't miss a mate in one.
for (const w of [wMaia, wPlain]) {
  w[NAMES.indexOf("trick")] = 4;
  w[NAMES.indexOf("mate1")] = Math.max(w[NAMES.indexOf("mate1")], 4);
  w[NAMES.indexOf("forced")] = Math.max(w[NAMES.indexOf("forced")], 0.5);
}
const sMaia = score(wMaia);
const sPlain = score(wPlain);
show("without maia", sPlain);
show("the bot", sMaia);
console.log(NAMES.map((n, k) => `${n} ${wMaia[k].toFixed(2)}`).join("  "));

// what I say I do, counted
const mySans = (g) => g.sans.filter((_, i) => (i % 2 === 0) === (g.mine === "w"));
const white = games.filter((g) => g.mine === "w");
const has = (g, re, n = 999) => mySans(g).slice(0, n).some((s) => re.test(s));
const counts = {
  whiteGames: white.length,
  battery: white.filter((g) => has(g, /^Bd3/, 16) && has(g, /^Q(c2|d3|b1)/, 16)).length,
  hPush: white.filter((g) => has(g, /^h4/, 20)).length,
  bxh7: white.filter((g) => has(g, /^Bxh7/)).length,
  trick: white.filter((g) => { const s = mySans(g); const i = s.findIndex((x) => x.startsWith("Bxh7+")); return i >= 0 && /^Bg8/.test(s[i + 1] ?? "") && /^Qx?h7#/.test(s[i + 2] ?? ""); }).length,
  longCastle: white.filter((g) => has(g, /^O-O-O/)).length,
};

const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const pct = (a) => Math.round((1000 * a[1]) / a[0]) / 10;
const pct3 = (a) => Math.round((1000 * a[2]) / a[0]) / 10;
const round = (w) => [...w].map((v) => Math.round(v * 1000) / 1000);
const out = {
  generatedAt: new Date().toISOString(),
  ...learn(games),
  weights: { maia: round(wMaia), plain: round(wPlain) },
  fit: {
    games: games.length,
    trainGames: cut,
    heldGames: games.length - cut,
    heldMoves: held.length,
    from: day(games[0].end),
    to: day(games.at(-1).end),
    top1: { maia: pct(sMaia.all), plain: pct(sPlain.all), old: OLD.top1 * 100, maiaAlone: pct(sAlone.all) },
    top3: { maia: pct3(sMaia.all), plain: pct3(sPlain.all), old: OLD.top3 * 100, maiaAlone: pct3(sAlone.all) },
    ...counts,
  },
};
fs.writeFileSync(OUT, JSON.stringify(out) + "\n");
console.log(`${Object.keys(out.book).length} book positions, ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB → ${path.relative(ROOT, OUT)}`);
