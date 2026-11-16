// Surface detail made in code: tileable noise turned into colour, normal and
// roughness maps. Nothing here is a photo or a downloaded texture.
import * as THREE from "three";

export type Surface = "brick" | "stone" | "ashlar" | "asphalt" | "grass" | "plaster" | "metal" | "paving" | "rock" | "snow" | "sand" | "wood";

const N = 256;

function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable fractal value noise, 0..1, on an N×N grid. */
function fbm(seed: number, base: number, octaves: number, gain = 0.5) {
  const out = new Float32Array(N * N);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = base << o;
    const r = rng(seed + o * 101);
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = r();
    for (let y = 0; y < N; y++) {
      const fy = (y / N) * cells, y0 = Math.floor(fy), ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * cells, x0 = Math.floor(fx), tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const a = g[(y0 % cells) * cells + (x0 % cells)], b = g[(y0 % cells) * cells + ((x0 + 1) % cells)];
        const c = g[((y0 + 1) % cells) * cells + (x0 % cells)], d = g[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
        out[y * N + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    total += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function canvasTex(draw: (set: (i: number, r: number, g: number, b: number) => void) => void, srgb: boolean, repeat: number) {
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(N, N);
  draw((i, r, g, b) => {
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  });
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function normalFrom(h: Float32Array, strength: number, repeat: number) {
  return canvasTex((set) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const l = h[y * N + ((x + N - 1) % N)], r = h[y * N + ((x + 1) % N)];
      const u = h[((y + N - 1) % N) * N + x], d = h[((y + 1) % N) * N + x];
      let nx = (l - r) * strength, ny = (u - d) * strength;
      const len = Math.hypot(nx, ny, 1);
      nx /= len;
      ny /= len;
      set(y * N + x, (nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (1 / len) * 127 + 128);
    }
  }, false, repeat);
}

export type Maps = { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture; roughness: number; metalness: number; tile: number; bump: number };

const cache = new Map<Surface, Maps>();

/**
 * Colour is a near-white variation map (so one set tints to any albedo),
 * `tile` is how many metres one repeat should cover.
 */
export function surface(kind: Surface): Maps {
  const hit = cache.get(kind);
  if (hit) return hit;
  let h: Float32Array;
  let tile = 3, strength = 3, rough = 0.9, metal = 0, vary = 0.18, roughVary = 0.2, bump = 1;
  const fine = fbm(11, 32, 3);
  switch (kind) {
    case "brick":
    case "ashlar": {
      // coursed blocks (or bricks) with mortar lines
      h = fbm(3, 8, 5);
      const brick = kind === "brick";
      const courses = brick ? 16 : 8, per = brick ? 5 : 4, r = rng(5);
      const offs = Array.from({ length: courses }, () => r());
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const row = Math.floor((y / N) * courses);
        const fy = ((y / N) * courses) % 1;
        const off = brick ? (row % 2) * 0.5 : offs[row];
        const fx = (((x / N) * per + off) % 1 + 1) % 1;
        const block = Math.floor((x / N) * per + off) * 7 + row * 13;
        const tone = ((Math.sin(block * 12.9898) * 43758.5453) % 1 + 1) % 1;
        const mortar = fy < (brick ? 0.14 : 0.06) || fx < (brick ? 0.05 : 0.03) ? 0 : 1;
        h[y * N + x] = mortar * (0.55 + tone * 0.25 + h[y * N + x] * 0.25);
      }
      tile = brick ? 1.2 : 4; strength = brick ? 3 : 5; rough = 0.92; vary = brick ? 0.34 : 0.3; bump = brick ? 0.6 : 1;
      break;
    }
    case "stone": h = fbm(7, 4, 6, 0.55); tile = 5; strength = 5; vary = 0.28; break;
    case "rock": h = fbm(9, 3, 6, 0.6); tile = 14; strength = 9; rough = 0.95; vary = 0.4; break;
    case "asphalt": h = fbm(13, 128, 1); tile = 2.5; strength = 2.2; rough = 1; vary = 0.16; roughVary = 0.06; bump = 0.18; break;
    case "paving": {
      h = fbm(17, 16, 3);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (y % 32 < 2 || (x + (Math.floor(y / 32) % 2) * 32) % 64 < 2) h[y * N + x] *= 0.35;
      tile = 2.4; strength = 3; rough = 0.88; vary = 0.1; bump = 0.5;
      break;
    }
    case "grass": h = fbm(19, 6, 6, 0.62); tile = 7; strength = 4; rough = 1; vary = 0.42; break;
    case "plaster": h = fbm(23, 12, 4); tile = 5; strength = 1.2; rough = 0.88; vary = 0.08; break;
    case "metal": h = fbm(29, 48, 2); tile = 2; strength = 0.6; rough = 0.55; metal = 0.6; vary = 0.06; roughVary = 0.25; bump = 0.12; break;
    case "snow": h = fbm(31, 8, 5); tile = 9; strength = 1.5; rough = 0.75; vary = 0.05; break;
    case "sand": h = fbm(37, 24, 4); tile = 4; strength = 1.6; rough = 0.95; vary = 0.12; break;
    case "wood": {
      h = fbm(41, 4, 4);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = 0.5 + 0.5 * Math.sin((x / N) * 60 + h[y * N + x] * 9);
      tile = 2; strength = 1.2; rough = 0.7; vary = 0.22;
      break;
    }
  }
  const hh = h!;
  const maps: Maps = {
    map: canvasTex((set) => {
      for (let i = 0; i < N * N; i++) {
        const v = 255 * (1 - vary + vary * (hh[i] * 0.75 + fine[i] * 0.25));
        set(i, v, v, v);
      }
    }, true, 1),
    normalMap: normalFrom(hh, strength, 1),
    roughnessMap: canvasTex((set) => {
      for (let i = 0; i < N * N; i++) {
        const v = 255 * Math.min(1, 1 - roughVary * hh[i]);
        set(i, v, v, v);
      }
    }, false, 1),
    roughness: rough,
    metalness: metal,
    tile,
    bump,
  };
  cache.set(kind, maps);
  return maps;
}

/** Ripples for water: a normal map to scroll. */
let ripples: THREE.Texture | null = null;
export function waterNormals() {
  if (!ripples) ripples = normalFrom(fbm(53, 6, 5, 0.6), 2.4, 1);
  return ripples;
}

/**
 * A façade: one tile is `cols` windows wide and `rows` floors tall. Returns
 * colour (near-white walls so buildings can be tinted), roughness (glass is
 * shiny) and an emissive map with some of the windows lit.
 */
let facadeMaps: { map: THREE.Texture; roughnessMap: THREE.Texture; emissiveMap: THREE.Texture } | null = null;
export function facade() {
  if (facadeMaps) return facadeMaps;
  const S = 512, cols = 4, rows = 4;
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = c.height = S;
    return [c, c.getContext("2d")!] as const;
  };
  const [cc, col] = mk();
  const [rc, ro] = mk();
  const [ec, em] = mk();
  const r = rng(77);
  col.fillStyle = "#f2f0ec";
  col.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    col.fillStyle = `rgba(${r() > 0.5 ? 255 : 120},${r() > 0.5 ? 250 : 115},${r() > 0.5 ? 240 : 110},${r() * 0.07})`;
    col.fillRect(r() * S, r() * S, 2 + r() * 10, 1 + r() * 3);
  }
  ro.fillStyle = "#e0e0e0";
  ro.fillRect(0, 0, S, S);
  em.fillStyle = "#000";
  em.fillRect(0, 0, S, S);
  const cw = S / cols, ch = S / rows;
  for (let j = 0; j < rows; j++) {
    // a string course under each floor
    col.fillStyle = "rgba(0,0,0,0.10)";
    col.fillRect(0, j * ch, S, 3);
    for (let i = 0; i < cols; i++) {
      const x = i * cw + cw * 0.27, y = j * ch + ch * 0.2, w = cw * 0.46, h = ch * 0.56;
      col.fillStyle = "#cfcac0"; // surround
      col.fillRect(x - 5, y - 5, w + 10, h + 12);
      const g = col.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, "#3b4a5c");
      g.addColorStop(1, "#1d242e");
      col.fillStyle = g;
      col.fillRect(x, y, w, h);
      col.fillStyle = "#e9e6df"; // glazing bars
      col.fillRect(x + w / 2 - 1.5, y, 3, h);
      col.fillRect(x, y + h * 0.45, w, 3);
      col.fillStyle = "rgba(0,0,0,0.22)"; // sill shadow
      col.fillRect(x - 5, y + h + 7, w + 10, 4);
      ro.fillStyle = "#1a1a1a";
      ro.fillRect(x, y, w, h);
      const lit = r();
      if (lit > 0.45) {
        const warm = lit > 0.8 ? "#ffd9a0" : lit > 0.6 ? "#ffc27a" : "#8a6a44";
        em.fillStyle = warm;
        em.fillRect(x, y, w, h);
        em.fillStyle = "rgba(0,0,0,0.35)";
        em.fillRect(x, y + h * 0.55, w, h * 0.45);
      }
    }
  }
  const tex = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  facadeMaps = { map: tex(cc, true), roughnessMap: tex(rc, false), emissiveMap: tex(ec, true) };
  return facadeMaps;
}

export function disposeTextures() {
  for (const m of cache.values()) {
    m.map.dispose();
    m.normalMap.dispose();
    m.roughnessMap.dispose();
  }
  cache.clear();
  ripples?.dispose();
  ripples = null;
  if (facadeMaps) {
    facadeMaps.map.dispose();
    facadeMaps.roughnessMap.dispose();
    facadeMaps.emissiveMap.dispose();
    facadeMaps = null;
  }
}
