// The bot that plays like me.
//
// Every legal move gets a score, and the bot picks one in proportion: it does
// not look for the best move, it looks for the move I would play. The score
// is a weighted sum of:
//   - what Maia thinks a club player would do here (maia.ts);
//   - what I actually played in this exact position, if I've been in it;
//   - my set-ups: the London as White, the fianchetto-and-c5 thing as Black,
//     and where my pieces usually end up, for when the position is new;
//   - a two-move lookahead, so it only hangs pieces about as often as I do;
//   - habits: recapturing, checks, castling long, early queen moves;
//   - the tricks I go for: queen and bishop lined up at h7, pushing the
//     h-pawn at a castled king, and Bxh7+ / Bg8+ / Qh7# down an open h-file.
// The weights are fitted to my own games by scripts/chess-fit.mjs (most
// likely move given the position, nothing cleverer) and checked on games the
// fit never saw. If Maia can't be downloaded the same thing runs without it,
// with its own weights.

import { Position, P, N, B, R, Q, K, from, to, promo, isCastle, name } from "./engine";
import { predict, type Net, type Snapshot } from "./maia";

/** data/chess-tom.json */
export type Tom = {
  /** position (board, side, castling) → moves I played there, as uci with counts */
  book: Record<string, [string, number][]>;
  /** family → move → share of my games in that family where I played it early */
  setup: Record<string, Record<string, number>>;
  /** family → piece*64+square → share of games with that piece there at move 12 */
  place: Record<string, Record<string, number>>;
  weights: { maia: number[]; plain: number[] };
  fit: {
    games: number; trainGames: number; heldGames: number; heldMoves: number; from: string; to: string;
    top1: { maia: number; plain: number; old: number; maiaAlone: number };
    top3: { maia: number; plain: number; old: number; maiaAlone: number };
    battery: number; whiteGames: number; hPush: number; bxh7: number; trick: number; longCastle: number;
  };
};

export type Choice = {
  move: { from: string; to: string; promotion?: string };
  /** what the move was mostly down to, for the note under the board */
  why: "book" | "setup" | "battery" | "hfile" | "trick" | "mate" | "habit";
  played?: number;
  seen?: number;
  /** how likely the bot thought this move was */
  p: number;
};

export type Ctx = {
  /** current position first, then the ones before it */
  history: Snapshot[];
  pos: Position;
  /** e.g. "Wd5": my colour and the opponent's first move (see `family`) */
  family: string;
  moveNo: number;
  halfmoves: number;
  /** square the opponent's last move landed on, or -1 */
  lastTo: number;
};

/** One Maia network, from the Maia repository (GPL-3.0; fetched by the visitor's browser, not kept here). */
export const MAIA_URL = "https://raw.githubusercontent.com/CSSLab/maia-chess/master/maia_weights/maia-1300.pb.gz";

export const FEATURES = 23;
const F = {
  maia: 0, book: 1, setup: 2, place: 3, slip: 4, blunder: 5, disaster: 6, capture: 7, recapture: 8, check: 9,
  castleK: 10, castleQ: 11, knight: 12, bishop: 13, rook: 14, queen: 15, king: 16, earlyQueen: 17,
  mate1: 18, forced: 19, battery: 20, hPush: 21, trick: 22,
} as const;

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// ---------- keys ----------

const LETTER = " pnbrqk";

/** Board, side to move and castling rights: the first three fields of a FEN. */
export function keyOf(pos: Position): string {
  let s = "";
  for (let r = 7; r >= 0; r--) {
    let gap = 0;
    for (let f = 0; f < 8; f++) {
      const p = pos.b[r * 8 + f];
      if (!p) gap++;
      else {
        if (gap) s += gap;
        gap = 0;
        s += p > 0 ? LETTER[p].toUpperCase() : LETTER[-p];
      }
    }
    if (gap) s += gap;
    if (r) s += "/";
  }
  const c = pos.castle;
  const rights = (c & 1 ? "K" : "") + (c & 2 ? "Q" : "") + (c & 4 ? "k" : "") + (c & 8 ? "q" : "");
  return `${s} ${pos.side > 0 ? "w" : "b"} ${rights || "-"}`;
}

export const uci = (m: number) => name(from(m)) + name(to(m)) + (promo(m) ? LETTER[promo(m)] : "");

/** Which of my repertoires a game belongs to: my colour, and how the other side started. */
export function family(mine: "w" | "b", moves: string[]): string {
  if (mine === "w") {
    const r = moves[1];
    return r === "d7d5" ? "Wd5" : r === "e7e5" ? "We5" : r === "g8f6" ? "WNf6" : "Wx";
  }
  const r = moves[0];
  return r === "e2e4" ? "Be4" : r === "d2d4" ? "Bd4" : "Bx";
}

// ---------- a small search, for "does this hang something" ----------

const VALUE = [0, 100, 310, 325, 500, 900, 0];

// Piece-square tables from White's side, a8 first. Small numbers: enough to
// develop, castle and push passed pawns, not enough to look clever.
const TABLES: number[][] = [
  [],
  [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
];
const MATE = 100000;

/** Static score from the side to move's point of view. */
function evaluate(pos: Position): number {
  let s = 0;
  const b = pos.b;
  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq];
    if (p > 0) s += VALUE[p] + TABLES[p][(7 - (sq >> 3)) * 8 + (sq & 7)];
    else if (p < 0) s -= VALUE[-p] + TABLES[-p][sq];
  }
  return s * pos.side;
}

// most valuable victim first, cheapest attacker first
const worth = (pos: Position, m: number) => {
  const v = Math.abs(pos.b[to(m)]);
  return v ? VALUE[v] * 10 - VALUE[Math.abs(pos.b[from(m)])] : 0;
};
const ordered = (pos: Position, moves: number[]) => moves.sort((x, y) => worth(pos, y) - worth(pos, x));

/** Captures only, so it doesn't stop looking halfway through a trade. */
function quiesce(pos: Position, alpha: number, beta: number, left: number): number {
  const stand = evaluate(pos);
  if (left === 0 || stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  for (const m of ordered(pos, pos.pseudo(true))) {
    if (!pos.make(m)) continue;
    const s = -quiesce(pos, -beta, -alpha, left - 1);
    pos.unmake();
    if (s >= beta) return s;
    if (s > alpha) alpha = s;
  }
  return alpha;
}

function search(pos: Position, depth: number, alpha: number, beta: number, ply: number): number {
  if (depth === 0) return quiesce(pos, alpha, beta, 4);
  let any = false;
  for (const m of ordered(pos, pos.pseudo())) {
    if (!pos.make(m)) continue;
    any = true;
    const s = -search(pos, depth - 1, -beta, -alpha, ply + 1);
    pos.unmake();
    if (s >= beta) return s;
    if (s > alpha) alpha = s;
  }
  if (!any) return pos.inCheck() ? -MATE + ply : 0;
  return alpha;
}

/** Can the side to move force mate in `n` of its own moves, using only checks? */
function matesIn(pos: Position, n: number): boolean {
  for (const m of pos.legal()) {
    pos.make(m);
    let ok = false;
    if (pos.inCheck()) {
      const replies = pos.legal();
      if (!replies.length) ok = true;
      else if (n > 1) {
        ok = true;
        for (const r of replies) {
          pos.make(r);
          const still = matesIn(pos, n - 1);
          pos.unmake();
          if (!still) {
            ok = false;
            break;
          }
        }
      }
    }
    pos.unmake();
    if (ok) return true;
  }
  return false;
}

// ---------- the things I do ----------

// b1 c2 d3 e4 f5 g6 h7, and its mirror for Black
const DIAG_W = [1, 10, 19, 28, 37, 46, 55];
const DIAG_B = DIAG_W.map((s) => s ^ 56);

/** My queen and a bishop on the long diagonal aimed at the other king's h-pawn. */
function battery(pos: Position, me: number): boolean {
  let q = false;
  let b = false;
  for (const s of me > 0 ? DIAG_W : DIAG_B) {
    const p = pos.b[s] * me;
    if (p === Q) q = true;
    else if (p === B) b = true;
  }
  return q && b;
}

/** The other king has castled short and my rook is still on the h-file behind my h-pawn or an open file. */
function hFileOn(pos: Position, me: number): boolean {
  const back = me > 0 ? 0 : 7;
  const far = me > 0 ? 7 : 0;
  if (pos.b[back * 8 + 7] !== me * R) return false;
  const k = pos.kingSq(-me);
  return k >> 3 === far && (k & 7) >= 6;
}

// ---------- scoring ----------

export type Scored = { moves: number[]; feats: Float32Array; inBook: number };

/** One row of numbers per legal move. `maia` is the network, or null to do without. */
export function featurise(ctx: Ctx, tom: Tom, maia: Net | null): Scored {
  const { pos, moveNo, family: fam } = ctx;
  const me = pos.side;
  const legal = pos.legal();
  const n = legal.length;
  const x = new Float32Array(n * FEATURES);
  if (!n) return { moves: legal, feats: x, inBook: 0 };

  if (maia) {
    const p = predict(maia, ctx.history, legal, ctx.halfmoves);
    for (let i = 0; i < n; i++) x[i * FEATURES + F.maia] = Math.log(Math.max(p[i], 1e-4));
  }

  const entry = tom.book[keyOf(pos)];
  const seen = entry ? entry.reduce((a, [, c]) => a + c, 0) : 0;
  const setup = moveNo <= 16 ? tom.setup[fam] : undefined;
  const place = moveNo <= 20 ? tom.place[fam] : undefined;
  const hadBattery = battery(pos, me);
  const hOn = hFileOn(pos, me);
  const hFile = 7;

  const score = new Float32Array(n);
  let best = -Infinity;
  for (let i = 0; i < n; i++) {
    const m = legal[i];
    const o = i * FEATURES;
    const f = from(m);
    const t = to(m);
    const piece = Math.abs(pos.b[f]);
    const victim = Math.abs(pos.b[t]);
    const u = uci(m);

    if (seen >= 2) {
      const c = entry!.find(([mv]) => mv === u)?.[1] ?? 0;
      x[o + F.book] = Math.log((c + 0.3) / (seen + 0.3 * n));
    }
    // My set-up counts for more when I've never had this exact position and
    // it's still the opening: that is when I fall back on it hardest.
    if (setup) x[o + F.setup] = (setup[u] ?? 0) * (seen < 2 && moveNo <= 10 ? 2.2 : 1);
    if (place && !isCastle(m)) x[o + F.place] = (place[piece * 64 + t] ?? 0) - (place[piece * 64 + f] ?? 0);
    if (victim) x[o + F.capture] = VALUE[victim] / 900;
    if (victim && t === ctx.lastTo) x[o + F.recapture] = 1;
    if (isCastle(m)) x[o + ((t & 7) === 6 ? F.castleK : F.castleQ)] = 1;
    if (piece === N) x[o + F.knight] = 1;
    else if (piece === B) x[o + F.bishop] = 1;
    else if (piece === R) x[o + F.rook] = 1;
    else if (piece === Q) x[o + F.queen] = 1;
    else if (piece === K && !isCastle(m)) x[o + F.king] = 1;
    if (piece === Q && moveNo <= 7) x[o + F.earlyQueen] = 1;
    // pushing the h-pawn at a castled king, or taking toward the h-file to open it
    if (hOn && piece === P && (f & 7) === hFile) x[o + F.hPush] = 1;

    pos.make(m);
    const check = pos.inCheck();
    if (check) x[o + F.check] = 1;
    let s: number;
    if (check && !pos.legal().length) {
      s = MATE;
      x[o + F.mate1] = 1;
    } else {
      s = -search(pos, 2, -MATE, MATE, 1);
      if (check && s < MATE - 100) {
        // a forcing line of checks that ends in mate within two more of my moves
        let forced = true;
        for (const r of pos.legal()) {
          pos.make(r);
          const still = matesIn(pos, 2);
          pos.unmake();
          if (!still) {
            forced = false;
            break;
          }
        }
        if (forced) {
          x[o + F.forced] = 1;
          // the one I like: the bishop goes into h7 and then g8 with my rook
          // behind it on the h-file, and the queen follows
          if (piece === B && (f & 7) >= 3 && pos.b[(me > 0 ? 0 : 7) * 8 + 7] === me * R && (pos.kingSq(-me) & 7) >= 6) x[o + F.trick] = 1;
          s = MATE - 10;
        }
      }
    }
    if (!hadBattery && battery(pos, me)) x[o + F.battery] = 1;
    pos.unmake();
    score[i] = s;
    if (s > best) best = s;
  }
  for (let i = 0; i < n; i++) {
    // how much worse than the best move the lookahead thinks this is, in pawns
    const r = Math.min(20, (Math.min(best, 3000) - Math.min(score[i], 3000)) / 100);
    const o = i * FEATURES;
    x[o + F.slip] = Math.min(r, 1);
    x[o + F.blunder] = Math.min(Math.max(r - 1, 0), 3);
    x[o + F.disaster] = r >= 4 ? 1 : 0;
  }
  return { moves: legal, feats: x, inBook: seen };
}

/** Probabilities over the legal moves. */
export function probs(s: Scored, w: number[]): Float32Array {
  const n = s.moves.length;
  const p = new Float32Array(n);
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let k = 0; k < FEATURES; k++) v += w[k] * s.feats[i * FEATURES + k];
    p[i] = v;
    if (v > max) max = v;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    p[i] = Math.exp(p[i] - max);
    sum += p[i];
  }
  for (let i = 0; i < n; i++) p[i] /= sum;
  return p;
}

/** Pick a move the way I would: usually the likely one, sometimes not. */
export function choose(ctx: Ctx, tom: Tom, maia: Net | null, rnd: () => number = Math.random): Choice {
  const s = featurise(ctx, tom, maia);
  const p = probs(s, maia ? tom.weights.maia : tom.weights.plain);
  let roll = rnd();
  let i = 0;
  for (; i < p.length - 1; i++) {
    roll -= p[i];
    if (roll <= 0) break;
  }
  const m = s.moves[i];
  const o = i * FEATURES;
  const x = s.feats;
  const entry = tom.book[keyOf(ctx.pos)];
  const played = entry?.find(([mv]) => mv === uci(m))?.[1];
  const why: Choice["why"] = x[o + F.trick]
    ? "trick"
    : x[o + F.mate1] || x[o + F.forced]
      ? "mate"
      : played && s.inBook >= 2
        ? "book"
        : x[o + F.battery]
          ? "battery"
          : x[o + F.hPush]
            ? "hfile"
            : x[o + F.setup] >= 0.4
              ? "setup"
              : "habit";
  const pr = promo(m);
  return {
    move: { from: name(from(m)), to: name(to(m)), ...(pr ? { promotion: LETTER[pr] } : {}) },
    why,
    played: why === "book" ? played : undefined,
    seen: why === "book" ? s.inBook : undefined,
    p: p[i],
  };
}

/**
 * Build what the bot needs from a game in progress: every position so far as
 * a FEN (oldest first, the current one last) and the moves between them.
 */
export function contextOf(fens: string[], moves: string[], mine: "w" | "b"): Ctx {
  const now = fens[fens.length - 1];
  const pos = new Position(now);
  const history: Snapshot[] = [];
  for (let i = fens.length - 1; i >= 0 && history.length < 8; i--) {
    const p = i === fens.length - 1 ? pos : new Position(fens[i]);
    history.push({ b: p.b, side: p.side, castle: p.castle });
  }
  const parts = now.split(" ");
  const last = moves[moves.length - 1];
  return {
    history,
    pos,
    family: fens[0] === START && moves.length === fens.length - 1 ? family(mine, moves) : mine === "w" ? "Wx" : "Bx",
    moveNo: Number(parts[5]) || 1,
    halfmoves: Number(parts[4]) || 0,
    lastTo: last ? last.charCodeAt(2) - 97 + (Number(last[3]) - 1) * 8 : -1,
  };
}

// ---------- learning the tables from my games ----------

export type Game = { mine: "w" | "b"; moves: string[] };

/** The book, the set-ups and where my pieces go, counted from a list of games. */
export function learn(games: Game[], bookPlies = 30, minSeen = 2): Pick<Tom, "book" | "setup" | "place"> {
  const book = new Map<string, Map<string, number>>();
  const setup: Record<string, Record<string, number>> = {};
  const place: Record<string, Record<string, number>> = {};
  const count: Record<string, number> = {};
  for (const g of games) {
    const fam = family(g.mine, g.moves);
    count[fam] = (count[fam] ?? 0) + 1;
    setup[fam] ??= {};
    place[fam] ??= {};
    const pos = new Position(START);
    const early = new Set<string>();
    for (let ply = 0; ply < g.moves.length && ply < 44; ply++) {
      const mv = g.moves[ply];
      const m = pos.legal().find((x) => uci(x) === mv);
      if (m === undefined) break;
      const mine = (ply % 2 === 0) === (g.mine === "w");
      if (mine) {
        if (ply < bookPlies) {
          const k = keyOf(pos);
          const e = book.get(k) ?? new Map<string, number>();
          e.set(mv, (e.get(mv) ?? 0) + 1);
          book.set(k, e);
        }
        if (ply < 32) early.add(mv);
      }
      pos.make(m);
      // where everything of mine is once I've made my 12th move
      if (mine && Math.floor(ply / 2) + 1 === 12) {
        const me = g.mine === "w" ? 1 : -1;
        for (let sq = 0; sq < 64; sq++) {
          const p = pos.b[sq] * me;
          if (p > 0) place[fam][p * 64 + sq] = (place[fam][p * 64 + sq] ?? 0) + 1;
        }
      }
    }
    for (const mv of early) setup[fam][mv] = (setup[fam][mv] ?? 0) + 1;
  }
  const round = (v: number) => Math.round(v * 1000) / 1000;
  for (const fam of Object.keys(count)) {
    for (const k of Object.keys(setup[fam])) {
      setup[fam][k] = round(setup[fam][k] / count[fam]);
      if (setup[fam][k] < 0.03) delete setup[fam][k];
    }
    for (const k of Object.keys(place[fam])) {
      place[fam][k] = round(place[fam][k] / count[fam]);
      if (place[fam][k] < 0.03) delete place[fam][k];
    }
  }
  const packed: Tom["book"] = {};
  for (const [k, e] of book) {
    const total = [...e.values()].reduce((a, b) => a + b, 0);
    if (total >= minSeen) packed[k] = [...e.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }
  return { book: packed, setup, place };
}
