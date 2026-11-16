// scripts/chess-games.mjs
// Pull my public game archives from chess.com and boil them down to
// data/chess-style.json: the opening moves I actually play, with counts, and
// a few plain statistics. The /chess page's bot plays from this.
//
//   node scripts/chess-games.mjs
//
// Only the public username goes to chess.com. Nothing about opponents is
// kept: no names, no ratings, no game links.
//
// Not wired into the scheduled refresh. To do that, call it from
// scripts/fetch-all.mjs next to the chess.com stats fetch (it makes one
// request per month of history, so once a day is plenty).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "chess-style.json");
const USER = "reewyyn";
const UA = "personal-site-chess-style/1.0";
const BOOK_PLIES = 24; // how deep into each game the book looks
const MIN_SEEN = 2; // a position has to have come up twice to count as habit

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`chess.com ${res.status} on ${url}`);
  return res.json();
}

/** Position key shared with the page: board, side to move, castling, en passant. */
export const key = (fen) => fen.split(" ").slice(0, 4).join(" ");

const { archives } = await getJson(`https://api.chess.com/pub/player/${USER}/games/archives`);
const games = [];
for (const url of archives) {
  const month = await getJson(url);
  games.push(...month.games);
  await sleep(350);
}

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const book = new Map(); // key → Map(san → count)
const count = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

const s = {
  games: 0,
  skipped: 0,
  first: Infinity,
  last: 0,
  byClass: new Map(),
  record: { win: 0, draw: 0, loss: 0 },
  asWhite: 0,
  asBlack: 0,
  myMoves: 0,
  myCaptures: 0,
  myChecks: 0,
  fullMoves: 0,
  castle: { king: 0, queen: 0, never: 0, moveSum: 0 },
  earlyQueen: 0,
  lossBy: new Map(),
  winBy: new Map(),
  accuracySum: 0,
  accuracyGames: 0,
  openings: new Map(), // name → { n, win, draw, loss }
};

const DRAWS = new Set(["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"]);

for (const g of games) {
  if (g.rules !== "chess" || (g.initial_setup && g.initial_setup !== START) || !g.pgn) {
    s.skipped++;
    continue;
  }
  const mine = g.white.username.toLowerCase() === USER ? "w" : g.black.username.toLowerCase() === USER ? "b" : null;
  if (!mine) {
    s.skipped++;
    continue;
  }
  const replay = new Chess();
  let moves;
  try {
    replay.loadPgn(g.pgn);
    moves = replay.history({ verbose: true });
  } catch {
    s.skipped++;
    continue;
  }
  if (moves.length < 2) {
    s.skipped++;
    continue;
  }

  s.games++;
  s.first = Math.min(s.first, g.end_time);
  s.last = Math.max(s.last, g.end_time);
  count(s.byClass, g.time_class);
  if (mine === "w") s.asWhite++;
  else s.asBlack++;
  const me = mine === "w" ? g.white : g.black;
  const outcome = me.result === "win" ? "win" : DRAWS.has(me.result) ? "draw" : "loss";
  s.record[outcome]++;
  if (outcome === "loss") count(s.lossBy, me.result);
  if (outcome === "win") count(s.winBy, (mine === "w" ? g.black : g.white).result);
  const acc = g.accuracies?.[mine === "w" ? "white" : "black"];
  if (typeof acc === "number") {
    s.accuracySum += acc;
    s.accuracyGames++;
  }
  // "https://www.chess.com/openings/Old-Benoni-Defense-2.e3" → "Old Benoni Defense"
  const name = (g.eco ?? "").split("/openings/")[1]?.replace(/-\d.*$/, "").replace(/-/g, " ");
  if (name) {
    const o = s.openings.get(name) ?? { n: 0, win: 0, draw: 0, loss: 0 };
    o.n++;
    o[outcome]++;
    s.openings.set(name, o);
  }

  s.fullMoves += Math.ceil(moves.length / 2);
  let castled = false;
  let queenOut = false;
  moves.forEach((m, i) => {
    if (m.color !== mine) return;
    s.myMoves++;
    if (m.captured) s.myCaptures++;
    if (m.san.includes("+") || m.san.includes("#")) s.myChecks++;
    const n = Math.floor(i / 2) + 1;
    if (!castled && (m.san.startsWith("O-O-O") || m.san.startsWith("O-O"))) {
      castled = true;
      s.castle[m.san.startsWith("O-O-O") ? "queen" : "king"]++;
      s.castle.moveSum += n;
    }
    if (m.piece === "q" && n <= 7) queenOut = true;
    if (i < BOOK_PLIES) {
      const k = key(m.before);
      if (!book.has(k)) book.set(k, new Map());
      count(book.get(k), m.san.replace(/[+#]/g, ""));
    }
  });
  if (!castled) s.castle.never++;
  if (queenOut) s.earlyQueen++;
}

// Keep habits, drop one-offs.
const packed = {};
let positions = 0;
for (const [k, m] of book) {
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  if (total < MIN_SEEN) continue;
  packed[k] = top(m, 6);
  positions++;
}

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const startKey = key(START);
const reply = (san) => {
  const c = new Chess();
  c.move(san);
  return packed[key(c.fen())] ?? [];
};

const out = {
  user: USER,
  generatedAt: new Date().toISOString(),
  games: s.games,
  skipped: s.skipped,
  from: day(s.first),
  to: day(s.last),
  byClass: Object.fromEntries(top(s.byClass, 9)),
  record: s.record,
  asWhite: s.asWhite,
  asBlack: s.asBlack,
  avgMoves: Math.round(s.fullMoves / s.games),
  captureRate: pct(s.myCaptures, s.myMoves),
  checkRate: pct(s.myChecks, s.myMoves),
  castle: {
    king: pct(s.castle.king, s.games),
    queen: pct(s.castle.queen, s.games),
    never: pct(s.castle.never, s.games),
    avgMove: Math.round((s.castle.moveSum / Math.max(1, s.castle.king + s.castle.queen)) * 10) / 10,
  },
  earlyQueen: pct(s.earlyQueen, s.games),
  lossBy: Object.fromEntries(top(s.lossBy, 6)),
  winBy: Object.fromEntries(top(s.winBy, 6)),
  accuracy: s.accuracyGames ? { mean: Math.round((s.accuracySum / s.accuracyGames) * 10) / 10, games: s.accuracyGames } : null,
  firstMoves: packed[startKey] ?? [],
  vsE4: reply("e4"),
  vsD4: reply("d4"),
  openings: top(new Map([...s.openings].map(([k, v]) => [k, v.n])), 8).map(([name]) => ({ name, ...s.openings.get(name) })),
  bookPlies: BOOK_PLIES,
  bookPositions: positions,
  book: packed,
};

fs.writeFileSync(OUT, JSON.stringify(out) + "\n");
console.log(
  `${s.games} games (${out.from} to ${out.to}), ${s.skipped} skipped, ${positions} book positions, ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB → ${path.relative(ROOT, OUT)}`,
);
