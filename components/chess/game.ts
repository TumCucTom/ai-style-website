// The Opera Game: Paul Morphy v. Duke Karl of Brunswick and Count Isouard,
// Paris, 1858. Public domain. Morphy's seventeen moves carry my notes.
//
// Moves are hardcoded as from/to squares and replayed by a tiny applier that
// knows the only special cases this game contains: captures and castling.

import type { Move } from "chess.js";

export type Color = "w" | "b";
export type Kind = "k" | "q" | "r" | "b" | "n" | "p";
export type Placed = { id: string; kind: Kind; color: Color; sq: number; alive: boolean };

export type Ply = {
  san: string;
  from: string;
  to: string;
  /** annotation glyph: !, !!, ?, ?! */
  mark?: string;
  year?: string;
  /** chess-book comment on the move itself */
  chess?: string;
  /** what actually happened */
  note?: string;
  link?: { label: string; href: string };
};

export const GAME = {
  white: "Paul Morphy",
  black: "Duke Karl of Brunswick and Count Isouard",
  place: "Paris Opera, 1858",
  result: "1–0",
};

export const PLIES: Ply[] = [
  {
    san: "e4", from: "e2", to: "e4", year: "2018",
    chess: "The obvious first move.",
    note: "GCSEs at Felsted. I was there on an academic scholarship and came out with eight 9s, an A and a Distinction.",
  },
  { san: "e5", from: "e7", to: "e5" },
  {
    san: "Nf3", from: "g1", to: "f3", year: "2021",
    chess: "Develops with a threat.",
    note: "A-levels at Colchester Royal Grammar School: Computer Science, Maths, Further Maths and Physics. A*A*AA. I also ran the Computer Science Society.",
  },
  { san: "d6", from: "d7", to: "d6", chess: "Philidor's Defence. Solid, and passive." },
  {
    san: "d4", from: "d2", to: "d4", year: "2023",
    chess: "Strikes in the centre.",
    note: "For my A-level project I built chess on an 8×8×8 board, with an engine to play against. It got 75 out of 75.",
  },
  { san: "Bg4", from: "c8", to: "g4", mark: "?!", chess: "A pin that costs time." },
  {
    san: "dxe5", from: "d4", to: "e5", year: "2023",
    chess: "Takes the space on offer.",
    note: "Started Computer Science at Bristol. Swam the medley relay for the men's first team at BUCS.",
  },
  { san: "Bxf3", from: "g4", to: "f3", chess: "Forced, or a pawn goes." },
  {
    san: "Qxf3", from: "d1", to: "f3", year: "2024",
    chess: "The queen comes out early and stays out.",
    note: "Ironman Switzerland. A 3.8 km swim, 180 km on the bike, then a marathon. It took me ten and a half hours, and nine months of training before that.",
  },
  { san: "dxe5", from: "d6", to: "e5" },
  {
    san: "Bc4", from: "f1", to: "c4", year: "2024",
    chess: "Points at f7.",
    note: "Interned at DigitalU3 as a machine learning software engineer. Also co-founded Veloworks, which makes 3D-printed cycling components.",
  },
  { san: "Nf6", from: "g8", to: "f6", mark: "?", chess: "Misses the double threat." },
  {
    san: "Qb3", from: "f3", to: "b3", year: "2024",
    chess: "Two threats with one move.",
    note: "Captained Bristol's team at the CIUK cluster challenge. Twice.",
  },
  { san: "Qe7", from: "d8", to: "e7", chess: "Holds f7 and b7, and buries the bishop." },
  {
    san: "Nc3", from: "b1", to: "c3", mark: "!", year: "2025",
    chess: "Development over material.",
    note: "Won an IonQ bounty at MIT's iQuHACK, then came back and started Bristol's Quantum Computing Society. We ran our first hackathon the same year.",
  },
  { san: "c6", from: "c7", to: "c6" },
  {
    san: "Bg5", from: "c1", to: "g5", year: "2025",
    chess: "Every piece is now working.",
    note: "Won the DeFi hackathon at ETH Oxford. The project was quantum cross-chain arbitrage: QAOA, Flare price feeds and Vyper flash loans.",
  },
  { san: "b5", from: "b7", to: "b5", mark: "?", chess: "The Duke and the Count, consulting, ask the bishop to leave. It doesn't." },
  {
    san: "Nxb5", from: "c3", to: "b5", mark: "!", year: "2025",
    chess: "A knight for the attack.",
    note: "Research assistant at Bristol's School of Brain, Behaviour and Health. I built a pipeline that generates photorealistic emotional faces for psychology experiments.",
  },
  { san: "cxb5", from: "c6", to: "b5" },
  {
    san: "Bxb5+", from: "c4", to: "b5", year: "2025",
    chess: "Check.",
    note: "Went to ISC'25 on the UK's Student Cluster Competition team. We tuned OpenMX and Llama 8B on 208 cores and eight H100s.",
  },
  { san: "Nbd7", from: "b8", to: "d7", chess: "Pinned." },
  {
    san: "O-O-O", from: "e1", to: "c1", mark: "!", year: "2025",
    chess: "The safe square was on offer. Castled long instead.",
    note: "Turned down a DeepMind internship to co-found Fini, a personal-finance education app. I did the technical side.",
  },
  { san: "Rd8", from: "a8", to: "d8" },
  {
    san: "Rxd7", from: "d1", to: "d7", mark: "!", year: "2025",
    chess: "Gives the exchange back.",
    note: "Demonstrator and graduate teacher at Bristol, teaching the modules I'd sat a year earlier.",
  },
  { san: "Rxd7", from: "d8", to: "d7" },
  {
    san: "Rd1", from: "h1", to: "d1", year: "2026",
    chess: "The last piece joins.",
    note: "First place on day one of iQuHACK 2026, on the IonQ track. I was also treasurer and planning-and-control lead for Formula Student AI.",
  },
  { san: "Qe6", from: "e7", to: "e6", chess: "Offers a queen trade. Too late." },
  {
    san: "Bxd7+", from: "b5", to: "d7", year: "2026",
    chess: "Removes the defender.",
    note: "Graduated with a First in Computer Science. Came 1st of 211 in the machine learning and computer systems coursework.",
  },
  { san: "Nxd7", from: "f6", to: "d7" },
  {
    san: "Qb8+", from: "b3", to: "b8", mark: "!!", year: "2026",
    chess: "The queen goes, and it doesn't matter.",
    note: "My dissertation was on memory for vision-language models. It got 85% and Best Computer Vision Project. Training ran across 256 GH200 GPUs.",
  },
  { san: "Nxb8", from: "d7", to: "b8", chess: "Forced." },
  {
    san: "Rd8#", from: "d1", to: "d8", year: "2026",
    chess: "Mate, with a rook and a bishop. Everything else got spent getting here.",
    note: "Now I'm a product engineer at Anima (YC W21).",
  },
];

export const sq = (s: string) => (s.charCodeAt(0) - 97) + (Number(s[1]) - 1) * 8;

export function start(): Placed[] {
  const back = "rnbqkbnr";
  const out: Placed[] = [];
  for (let f = 0; f < 8; f++) {
    const file = String.fromCharCode(97 + f);
    out.push({ id: `w${back[f]}${file}`, kind: back[f] as Kind, color: "w", sq: f, alive: true });
    out.push({ id: `wp${file}`, kind: "p", color: "w", sq: 8 + f, alive: true });
    out.push({ id: `bp${file}`, kind: "p", color: "b", sq: 48 + f, alive: true });
    out.push({ id: `b${back[f]}${file}`, kind: back[f] as Kind, color: "b", sq: 56 + f, alive: true });
  }
  return out;
}

export function apply(pos: Placed[], ply: Ply): Placed[] {
  const from = sq(ply.from);
  const to = sq(ply.to);
  const next = pos.map((p) => ({ ...p }));
  const mover = next.find((p) => p.alive && p.sq === from);
  if (!mover) throw new Error(`no piece on ${ply.from} for ${ply.san}`);
  const taken = next.find((p) => p.alive && p.sq === to);
  if (taken) {
    if (taken.color === mover.color) throw new Error(`${ply.san} captures its own piece`);
    taken.alive = false;
  }
  mover.sq = to;
  // castling: the king moved two files, so bring the rook across
  if (mover.kind === "k" && Math.abs((to % 8) - (from % 8)) === 2) {
    const rank = to - (to % 8);
    const kingside = to % 8 > from % 8;
    const rook = next.find((p) => p.alive && p.kind === "r" && p.color === mover.color && p.sq === rank + (kingside ? 7 : 0));
    if (!rook) throw new Error(`no rook to castle with for ${ply.san}`);
    rook.sq = rank + (kingside ? 5 : 3);
  }
  return next;
}

/** positions[n] is the board after n plies; positions[0] is the start. */
export function positions(): Placed[][] {
  const out = [start()];
  for (const ply of PLIES) out.push(apply(out[out.length - 1], ply));
  return out;
}

/** One move of a live game applied to the drawn pieces, keeping each one's identity so it slides. */
export function place(pos: Placed[], m: Move): Placed[] {
  const from = sq(m.from);
  const to = sq(m.to);
  const next = pos.map((p) => ({ ...p }));
  const mover = next.find((p) => p.alive && p.sq === from)!;
  // en passant takes the pawn beside the mover, not the one on the target square
  const victim = m.isEnPassant() ? (from >> 3) * 8 + (to & 7) : to;
  const taken = next.find((p) => p.alive && p.sq === victim);
  if (taken) taken.alive = false;
  mover.sq = to;
  if (m.promotion) mover.kind = m.promotion as Kind;
  if (m.isKingsideCastle() || m.isQueensideCastle()) {
    const rank = to - (to & 7);
    const rook = next.find((p) => p.alive && p.kind === "r" && p.color === mover.color && p.sq === rank + (m.isKingsideCastle() ? 7 : 0))!;
    rook.sq = rank + (m.isKingsideCastle() ? 5 : 3);
  }
  return next;
}

