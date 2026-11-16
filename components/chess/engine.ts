// A small, fast chess position for the bot's search. chess.js referees the
// game the visitor sees (and is the last word on what is legal); this exists
// because searching through chess.js costs about a millisecond a move.
//
// Squares are 0..63 with a1 = 0. White pieces are 1..6 (P N B R Q K), black
// are the negatives. Moves are packed ints: from | to<<6 | promo<<12 | flag<<15.

export const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
const NORMAL = 0, EP = 1, CASTLE = 2, DOUBLE = 3;

export const from = (m: number) => m & 63;
export const to = (m: number) => (m >> 6) & 63;
export const promo = (m: number) => (m >> 12) & 7;
export const flag = (m: number) => m >> 15;
export const isCastle = (m: number) => flag(m) === CASTLE;
const mk = (f: number, t: number, p = 0, fl = NORMAL) => f | (t << 6) | (p << 12) | (fl << 15);

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];

type Undo = { m: number; cap: number; castle: number; ep: number };

export class Position {
  b = new Int8Array(64);
  /** 1 white to move, -1 black */
  side = 1;
  /** bits: 1 white king side, 2 white queen side, 4 black king side, 8 black queen side */
  castle = 0;
  ep = -1;
  private stack: Undo[] = [];

  constructor(fen: string) {
    const [board, turn, rights, ep] = fen.split(" ");
    let r = 7, f = 0;
    for (const ch of board) {
      if (ch === "/") {
        r--;
        f = 0;
      } else if (ch >= "1" && ch <= "8") f += Number(ch);
      else {
        const v = " pnbrqk".indexOf(ch.toLowerCase());
        this.b[r * 8 + f] = ch === ch.toLowerCase() ? -v : v;
        f++;
      }
    }
    this.side = turn === "w" ? 1 : -1;
    for (const ch of rights) this.castle |= ch === "K" ? 1 : ch === "Q" ? 2 : ch === "k" ? 4 : ch === "q" ? 8 : 0;
    this.ep = ep && ep !== "-" ? (ep.charCodeAt(0) - 97) + (Number(ep[1]) - 1) * 8 : -1;
  }

  attacked(sq: number, by: number): boolean {
    const b = this.b;
    const r = sq >> 3, f = sq & 7;
    // pawns: a white pawn attacks upward, so look one rank down for it
    const pr = r - by;
    if (pr >= 0 && pr < 8) {
      if (f > 0 && b[pr * 8 + f - 1] === by * P) return true;
      if (f < 7 && b[pr * 8 + f + 1] === by * P) return true;
    }
    for (const [dr, df] of KNIGHT) {
      const rr = r + dr, ff = f + df;
      if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && b[rr * 8 + ff] === by * N) return true;
    }
    for (const [dr, df] of KING) {
      const rr = r + dr, ff = f + df;
      if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && b[rr * 8 + ff] === by * K) return true;
    }
    for (let d = 0; d < 8; d++) {
      const [dr, df] = d < 4 ? DIAG[d] : ORTH[d - 4];
      let rr = r + dr, ff = f + df;
      while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
        const p = b[rr * 8 + ff];
        if (p !== 0) {
          if (p === by * Q || p === by * (d < 4 ? B : R)) return true;
          break;
        }
        rr += dr;
        ff += df;
      }
    }
    return false;
  }

  kingSq(side: number): number {
    const k = side * K;
    for (let i = 0; i < 64; i++) if (this.b[i] === k) return i;
    return -1;
  }

  inCheck(side = this.side): boolean {
    return this.attacked(this.kingSq(side), -side);
  }

  /** Pseudo-legal moves; `legal()` filters the ones that leave the king hanging. */
  pseudo(capturesOnly = false): number[] {
    const out: number[] = [];
    const b = this.b, s = this.side;
    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq] * s;
      if (p <= 0) continue;
      const r = sq >> 3, f = sq & 7;
      if (p === P) {
        const last = s === 1 ? 7 : 0;
        const one = sq + 8 * s;
        const push = (t: number, fl = NORMAL) => {
          if ((t >> 3) === last) for (const pr of [Q, R, B, N]) out.push(mk(sq, t, pr));
          else out.push(mk(sq, t, 0, fl));
        };
        if (!capturesOnly && b[one] === 0) {
          push(one);
          if (r === (s === 1 ? 1 : 6) && b[one + 8 * s] === 0) out.push(mk(sq, one + 8 * s, 0, DOUBLE));
        }
        for (const df of [-1, 1]) {
          const ff = f + df;
          if (ff < 0 || ff > 7) continue;
          const t = one + df;
          if (b[t] * s < 0) push(t);
          else if (t === this.ep) out.push(mk(sq, t, 0, EP));
        }
      } else if (p === N || p === K) {
        for (const [dr, df] of p === N ? KNIGHT : KING) {
          const rr = r + dr, ff = f + df;
          if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
          const t = rr * 8 + ff;
          if (b[t] * s > 0 || (capturesOnly && b[t] === 0)) continue;
          out.push(mk(sq, t));
        }
        if (p === K && !capturesOnly) {
          const home = s === 1 ? 4 : 60;
          const ks = s === 1 ? 1 : 4, qs = s === 1 ? 2 : 8;
          if (sq === home && !this.attacked(home, -s)) {
            if (this.castle & ks && b[home + 1] === 0 && b[home + 2] === 0 && b[home + 3] === s * R && !this.attacked(home + 1, -s)) out.push(mk(home, home + 2, 0, CASTLE));
            if (this.castle & qs && b[home - 1] === 0 && b[home - 2] === 0 && b[home - 3] === 0 && b[home - 4] === s * R && !this.attacked(home - 1, -s)) out.push(mk(home, home - 2, 0, CASTLE));
          }
        }
      } else {
        const dirs = p === B ? DIAG : p === R ? ORTH : KING;
        for (const [dr, df] of dirs) {
          let rr = r + dr, ff = f + df;
          while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
            const t = rr * 8 + ff;
            if (b[t] === 0) {
              if (!capturesOnly) out.push(mk(sq, t));
            } else {
              if (b[t] * s < 0) out.push(mk(sq, t));
              break;
            }
            rr += dr;
            ff += df;
          }
        }
      }
    }
    return out;
  }

  /** Plays the move. Returns false, and takes it back, if it leaves the mover in check. */
  make(m: number): boolean {
    const b = this.b, s = this.side;
    const f = from(m), t = to(m), fl = flag(m);
    const piece = b[f];
    let cap = b[t];
    this.stack.push({ m, cap, castle: this.castle, ep: this.ep });
    b[t] = promo(m) ? s * promo(m) : piece;
    b[f] = 0;
    if (fl === EP) {
      cap = b[t - 8 * s];
      this.stack[this.stack.length - 1].cap = cap;
      b[t - 8 * s] = 0;
    } else if (fl === CASTLE) {
      if (t > f) {
        b[t - 1] = b[t + 1];
        b[t + 1] = 0;
      } else {
        b[t + 1] = b[t - 2];
        b[t - 2] = 0;
      }
    }
    this.ep = fl === DOUBLE ? f + 8 * s : -1;
    // castling rights go when the king or a rook moves, or a rook is taken
    if (f === 4 || t === 4) this.castle &= ~3;
    if (f === 60 || t === 60) this.castle &= ~12;
    if (f === 7 || t === 7) this.castle &= ~1;
    if (f === 0 || t === 0) this.castle &= ~2;
    if (f === 63 || t === 63) this.castle &= ~4;
    if (f === 56 || t === 56) this.castle &= ~8;
    this.side = -s;
    if (this.attacked(this.kingSq(s), -s)) {
      this.unmake();
      return false;
    }
    return true;
  }

  unmake() {
    const u = this.stack.pop()!;
    const b = this.b;
    const s = -this.side;
    const f = from(u.m), t = to(u.m), fl = flag(u.m);
    b[f] = promo(u.m) ? s * P : b[t];
    b[t] = fl === EP ? 0 : u.cap;
    if (fl === EP) b[t - 8 * s] = u.cap;
    else if (fl === CASTLE) {
      if (t > f) {
        b[t + 1] = b[t - 1];
        b[t - 1] = 0;
      } else {
        b[t - 2] = b[t + 1];
        b[t + 1] = 0;
      }
    }
    this.castle = u.castle;
    this.ep = u.ep;
    this.side = s;
  }

  legal(): number[] {
    return this.pseudo().filter((m) => {
      if (!this.make(m)) return false;
      this.unmake();
      return true;
    });
  }

  perft(depth: number): number {
    if (depth === 0) return 1;
    let n = 0;
    for (const m of this.pseudo()) {
      if (!this.make(m)) continue;
      n += this.perft(depth - 1);
      this.unmake();
    }
    return n;
  }
}

const FILES = "abcdefgh";
export const name = (sq: number) => FILES[sq & 7] + ((sq >> 3) + 1);
