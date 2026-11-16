// Runs a Maia network in plain JavaScript.
//
// Maia (McIlroy-Young, Sen, Kleinberg, Anderson; github.com/CSSLab/maia-chess)
// is a set of small networks trained to predict the move a human of a given
// rating would play. The weights are GPL-3.0, so they are not in this
// repository: the page downloads one file (about 1.3 MB) from the Maia
// repository when someone starts a game. This file is my own reader for the
// lc0 weights format and my own forward pass; nothing here is copied from
// Maia or Leela. The network is a 6-block, 64-filter squeeze-and-excitation
// residual net with a convolutional policy head: about 35 million
// multiply-adds a position, which plain typed arrays do in tens of
// milliseconds, so there is no ONNX runtime to download.

import { from, to, promo, isCastle } from "./engine";

type Conv = { cin: number; cout: number; w: Float32Array; scale: Float32Array | null; shift: Float32Array };
type Block = { c1: Conv; c2: Conv; w1: Float32Array; b1: Float32Array; w2: Float32Array; b2: Float32Array; se: number };
export type Net = { input: Conv; blocks: Block[]; pol1: Conv; pol: Conv };

// ---------- the weights file: gzip → protobuf → 16-bit linear floats ----------

type Field = [number, number, number | Uint8Array];

function fields(buf: Uint8Array): Field[] {
  const out: Field[] = [];
  let i = 0;
  const varint = () => {
    let r = 0;
    let s = 1;
    for (;;) {
      const b = buf[i++];
      r += (b & 127) * s;
      if (!(b & 128)) return r;
      s *= 128;
    }
  };
  while (i < buf.length) {
    const tag = varint();
    const f = Math.floor(tag / 8);
    const t = tag & 7;
    if (t === 0) out.push([f, t, varint()]);
    else if (t === 2) {
      const n = varint();
      out.push([f, t, buf.subarray(i, i + n)]);
      i += n;
    } else if (t === 5 || t === 1) {
      const n = t === 5 ? 4 : 8;
      out.push([f, t, buf.subarray(i, i + n)]);
      i += n;
    } else throw new Error("unexpected wire type in weights file");
  }
  return out;
}

const sub = (fs: Field[], n: number) => {
  const f = fs.find((x) => x[0] === n);
  return f ? fields(f[2] as Uint8Array) : null;
};
const all = (fs: Field[], n: number) => fs.filter((x) => x[0] === n).map((x) => fields(x[2] as Uint8Array));

/** A Layer: min, max and the values as 16-bit steps between them. */
function layer(fs: Field[] | null): Float32Array | null {
  if (!fs) return null;
  const f32 = (n: number) => {
    const b = fs.find((x) => x[0] === n)![2] as Uint8Array;
    return new DataView(b.buffer, b.byteOffset, 4).getFloat32(0, true);
  };
  const lo = f32(1);
  const hi = f32(2);
  const raw = fs.find((x) => x[0] === 3)![2] as Uint8Array;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const out = new Float32Array(raw.byteLength / 2);
  for (let i = 0; i < out.length; i++) out[i] = lo + (view.getUint16(i * 2, true) / 65535) * (hi - lo);
  return out;
}

/** A ConvBlock, with its batch norm folded into a scale and a shift per channel. */
function conv(fs: Field[], cin: number): Conv {
  const w = layer(sub(fs, 1))!;
  const cout = w.length / (cin * 9);
  const bias = layer(sub(fs, 2));
  const mean = layer(sub(fs, 3));
  const variance = layer(sub(fs, 4));
  const gamma = layer(sub(fs, 5));
  const beta = layer(sub(fs, 6));
  const shift = new Float32Array(cout);
  let scale: Float32Array | null = null;
  if (mean && variance) {
    scale = new Float32Array(cout);
    for (let o = 0; o < cout; o++) {
      const g = gamma ? gamma[o] : 1;
      scale[o] = g / Math.sqrt(variance[o] + 1e-5);
      shift[o] = (beta ? beta[o] : 0) - mean[o] * scale[o] + (bias ? bias[o] * scale[o] : 0);
    }
  } else if (bias) shift.set(bias);
  return { cin, cout, w, scale, shift };
}

export function parseNet(raw: Uint8Array): Net {
  const weights = sub(fields(raw), 10);
  if (!weights) throw new Error("no weights in file");
  const input = conv(sub(weights, 1)!, 112);
  const c = input.cout;
  const blocks = all(weights, 2).map((b) => {
    const se = sub(b, 3)!;
    const b1 = layer(sub(se, 2))!;
    return { c1: conv(sub(b, 1)!, c), c2: conv(sub(b, 2)!, c), w1: layer(sub(se, 1))!, b1, w2: layer(sub(se, 3))!, b2: layer(sub(se, 4))!, se: b1.length };
  });
  const pol1 = sub(weights, 11);
  const pol = sub(weights, 3);
  if (!pol1 || !pol || !blocks.length) throw new Error("not a network this reader understands");
  return { input, blocks, pol1: conv(pol1, c), pol: conv(pol, c) };
}

export async function loadNet(url: string): Promise<Net> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`weights: ${res.status}`);
  const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
  return parseNet(new Uint8Array(await new Response(stream).arrayBuffer()));
}

// ---------- forward pass ----------

const pad = new Float32Array(128 * 100);

/** 3×3 convolution on an 8×8 board, zero padded, then scale, shift and (optionally) ReLU. */
function run(c: Conv, x: Float32Array, relu: boolean): Float32Array {
  const { cin, cout, w } = c;
  pad.fill(0, 0, cin * 100);
  for (let i = 0; i < cin; i++) {
    for (let y = 0; y < 8; y++) {
      const src = i * 64 + y * 8;
      const dst = i * 100 + (y + 1) * 10 + 1;
      for (let k = 0; k < 8; k++) pad[dst + k] = x[src + k];
    }
  }
  const out = new Float32Array(cout * 64);
  for (let o = 0; o < cout; o++) {
    const ob = o * 64;
    for (let i = 0; i < cin; i++) {
      const wb = (o * cin + i) * 9;
      const pb = i * 100;
      const w0 = w[wb], w1 = w[wb + 1], w2 = w[wb + 2], w3 = w[wb + 3], w4 = w[wb + 4], w5 = w[wb + 5], w6 = w[wb + 6], w7 = w[wb + 7], w8 = w[wb + 8];
      for (let y = 0; y < 8; y++) {
        let p = pb + y * 10;
        let q = ob + y * 8;
        for (let k = 0; k < 8; k++, p++, q++) {
          out[q] +=
            w0 * pad[p] + w1 * pad[p + 1] + w2 * pad[p + 2] +
            w3 * pad[p + 10] + w4 * pad[p + 11] + w5 * pad[p + 12] +
            w6 * pad[p + 20] + w7 * pad[p + 21] + w8 * pad[p + 22];
        }
      }
    }
    const s = c.scale ? c.scale[o] : 1;
    const t = c.shift[o];
    for (let k = 0; k < 64; k++) {
      const v = out[ob + k] * s + t;
      out[ob + k] = relu && v < 0 ? 0 : v;
    }
  }
  return out;
}

function forward(net: Net, planes: Float32Array): Float32Array {
  let x = run(net.input, planes, true);
  const c = net.input.cout;
  for (const b of net.blocks) {
    const y = run(b.c2, run(b.c1, x, true), false);
    // squeeze and excitation: one gain and one offset per channel, from the channel means
    const mean = new Float32Array(c);
    for (let o = 0; o < c; o++) {
      let s = 0;
      for (let k = 0; k < 64; k++) s += y[o * 64 + k];
      mean[o] = s / 64;
    }
    const hid = new Float32Array(b.se);
    for (let h = 0; h < b.se; h++) {
      let s = b.b1[h];
      for (let o = 0; o < c; o++) s += b.w1[h * c + o] * mean[o];
      hid[h] = s > 0 ? s : 0;
    }
    for (let o = 0; o < c; o++) {
      let g = b.b2[o];
      let off = b.b2[c + o];
      for (let h = 0; h < b.se; h++) {
        g += b.w2[o * b.se + h] * hid[h];
        off += b.w2[(c + o) * b.se + h] * hid[h];
      }
      g = 1 / (1 + Math.exp(-g));
      for (let k = 0; k < 64; k++) {
        const v = y[o * 64 + k] * g + off + x[o * 64 + k];
        y[o * 64 + k] = v > 0 ? v : 0;
      }
    }
    x = y;
  }
  return run(net.pol, run(net.pol1, x, true), false);
}

// ---------- chess in, chess out ----------

export type Snapshot = { b: Int8Array; side: number; castle: number };

/**
 * The 112 input planes: the last eight positions (newest first), each as six
 * planes of the mover's pieces and six of the opponent's, then castling
 * rights, whose move it is, and a plane of ones. Everything is seen from the
 * side to move, so the board is turned over when that is Black.
 */
function encode(history: Snapshot[], halfmoves: number): Float32Array {
  const x = new Float32Array(112 * 64);
  const now = history[0];
  const black = now.side < 0;
  for (let t = 0; t < 8 && t < history.length; t++) {
    const b = history[t].b;
    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq];
      if (!p) continue;
      const mine = p > 0 === !black;
      const plane = t * 13 + (mine ? 0 : 6) + Math.abs(p) - 1;
      x[plane * 64 + (black ? sq ^ 56 : sq)] = 1;
    }
  }
  const fill = (plane: number, v: number) => x.fill(v, plane * 64, plane * 64 + 64);
  const r = now.castle;
  const [usK, usQ, themK, themQ] = black ? [r & 4, r & 8, r & 1, r & 2] : [r & 1, r & 2, r & 4, r & 8];
  if (usQ) fill(104, 1);
  if (usK) fill(105, 1);
  if (themQ) fill(106, 1);
  if (themK) fill(107, 1);
  if (black) fill(108, 1);
  fill(109, halfmoves);
  fill(111, 1);
  return x;
}

const QUEEN = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

/** Where a move sits in the policy head's 80×64 output. */
function slot(m: number, black: boolean): number {
  let f = from(m);
  let t = to(m);
  // the network writes castling as the king moving onto its own rook
  if (isCastle(m)) t = (t & 56) | ((t & 7) === 6 ? 7 : 0);
  if (black) {
    f ^= 56;
    t ^= 56;
  }
  const dx = (t & 7) - (f & 7);
  const dy = (t >> 3) - (f >> 3);
  const pr = promo(m);
  // rook, bishop and queen promotions have planes of their own; a knight promotion is the plain move
  if (pr && pr !== 2) return (64 + (dx + 1) * 3 + (pr === 4 ? 0 : pr === 3 ? 1 : 2)) * 64 + f;
  const k = KNIGHT.findIndex(([x, y]) => x === dx && y === dy);
  if (k >= 0) return (56 + k) * 64 + f;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const d = QUEEN.findIndex(([x, y]) => x === Math.sign(dx) && y === Math.sign(dy));
  return (d * 7 + steps - 1) * 64 + f;
}

/**
 * How likely the network thinks each legal move is. `history` is the current
 * position first, then the ones before it (up to eight are used).
 */
export function predict(net: Net, history: Snapshot[], legal: number[], halfmoves = 0): Float32Array {
  const out = forward(net, encode(history, halfmoves));
  const black = history[0].side < 0;
  const p = new Float32Array(legal.length);
  let max = -Infinity;
  for (let i = 0; i < legal.length; i++) {
    p[i] = out[slot(legal[i], black)];
    if (p[i] > max) max = p[i];
  }
  let sum = 0;
  for (let i = 0; i < p.length; i++) {
    p[i] = Math.exp(p[i] - max);
    sum += p[i];
  }
  for (let i = 0; i < p.length; i++) p[i] /= sum;
  return p;
}
