// The places you can walk around.
//
// Bristol, Monaco and MIT are laid out from real map data: the ground heights,
// the building outlines and the streets are where they really are (see
// scripts/bake-osm.mjs and real.ts). The landmarks on top (the bridge, the
// hairpin's kerbs and barriers, the dome) are modelled by hand. The other
// places are made up; the credit shown in each place (stops.ts) says which.
import type * as T from "three";
import { buildReal, cityBlocks, plantTrees, type Osm } from "./real";
import type { Surface } from "./tex";

export type Tone = "sky" | "ground" | "stone" | "dark" | "light" | "water" | "grass" | "accent" | "cool" | "road" | "snow" | "warm";
type P3 = [number, number, number];
type Row = string | { t: string; big?: boolean; hot?: boolean };

export type Exhibit = { x: number; z: number; title: string; body: string; link?: { href: string; label: string } };

export type Built = {
  exhibits: Exhibit[];
  /** x, z, and which way you face (0 looks down -z) */
  spawn: [number, number, number];
  /** radius of the bit you can walk in, and its centre if not the origin */
  bound: number;
  centre?: [number, number];
  /** fog distance, in bounds; or an explicit density */
  far?: number;
  fog?: number;
  ground?: Tone;
  /** the place lays its own ground */
  ownGround?: boolean;
  height?(x: number, z: number): number;
  blocked?(x: number, z: number): boolean;
  /** walking pace, metres a second */
  speed?: number;
  /** scale the sky's fill light (indoors) and the exposure */
  env?: number;
  exposure?: number;
  /** where the sun (or moon) is: bearing and height, radians */
  sun?: [number, number];
  solids?: { x: number; z: number; r: number }[];
  tick?(t: number, me: { x: number; z: number }): void;
  dispose?(): void;
};

export type Kit = {
  THREE: typeof T;
  scene: T.Scene;
  night: boolean;
  /** 0 phones, 1 shadows, 2 shadows and post-processing */
  tier: number;
  /** added to everything placed through the kit */
  origin: T.Vector3;
  mat(tone: Tone, opts?: { glow?: boolean; alpha?: number; surface?: Surface; color?: string }): T.Material;
  put<O extends T.Object3D>(o: O, x?: number, y?: number, z?: number, ry?: number): O;
  solid<M extends T.Mesh | T.InstancedMesh>(m: M, cast?: boolean): M;
  planarUV(geo: T.BufferGeometry, tile: number): T.BufferGeometry;
  box(w: number, h: number, d: number, tone: Tone, x: number, y: number, z: number, ry?: number): T.Mesh;
  cyl(r: number, h: number, tone: Tone, x: number, y: number, z: number, seg?: number, rTop?: number): T.Mesh;
  ball(r: number, tone: Tone, x: number, y: number, z: number, glow?: boolean): T.Mesh;
  flat(w: number, d: number, tone: Tone, x: number, y: number, z: number, ry?: number): T.Mesh;
  disc(r: number, tone: Tone, x: number, y: number, z: number): T.Mesh;
  prism(w: number, h: number, d: number, tone: Tone, x: number, y: number, z: number, ry?: number): T.Mesh;
  tube(pts: P3[], r: number, tone: Tone): T.Mesh;
  lines(pairs: P3[], tone: Tone): T.LineSegments;
  sign(rows: Row[], w: number, h: number, x: number, y: number, z: number, ry?: number, tone?: Tone): T.Mesh;
  /** spots: x, y, z, optional turn and scale */
  many(geo: T.BufferGeometry, tone: Tone, spots: number[][], glow?: boolean): T.InstancedMesh;
  /** a light that is on at night */
  lamp(x: number, y: number, z: number, color?: string, power?: number, always?: boolean): void;
  rand(): number;
};

const face = (dx: number, dz: number) => Math.atan2(-dx, -dz);
const flatGround = () => 0;

// ---------- shared bits ----------

function trees(k: Kit, spots: [number, number][], kind: "leaf" | "pine" | "palm" = "leaf") {
  plantTrees(k, flatGround, spots.map(([x, z]) => [x, z, 0.8 + k.rand() * 0.5]), kind);
}

/** A row of server racks with lights. Returns the lights so they can blink. */
function racks(k: Kit, x0: number, z: number, n: number, gpus = 0) {
  const { THREE } = k;
  const leds: number[][] = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + i * 1.25;
    k.box(1.05, 2.3, 1.2, "dark", x, 1.15, z);
    const door = k.box(0.9, 2.05, 0.04, "dark", x, 1.15, z + 0.61);
    door.material = k.mat("dark", { color: "#15171a" });
    for (let r = 0; r < 9; r++) for (let c = 0; c < 3; c++) if (k.rand() > 0.35) leds.push([x - 0.3 + c * 0.3, 0.35 + r * 0.2, z + 0.64]);
  }
  const a = k.many(new THREE.BoxGeometry(0.12, 0.07, 0.02), "cool", leds.filter((_, i) => i % 2 === 0), true);
  const b = k.many(new THREE.BoxGeometry(0.12, 0.07, 0.02), "accent", leds.filter((_, i) => i % 2 === 1), true);
  // GPUs: glowing slabs in the first racks
  const slabs: number[][] = [];
  for (let g = 0; g < gpus; g++) slabs.push([x0 + (g % 2) * 1.25, 0.5 + Math.floor(g / 2) * 0.42, z + 0.66]);
  if (gpus) k.many(new THREE.BoxGeometry(0.8, 0.22, 0.06), "accent", slabs, true);
  k.lamp(x0 + (n * 1.25) / 2, 3.2, z + 2.4, "#bcd8ff", 22);
  return [a, b];
}

/** A made-up skyline, far off, with windows. */
function skyline(k: Kit, from: number, to: number, n: number, tints = ["#9aa3ad", "#b6b0a4", "#8c949e", "#c2bcb0"], arc: [number, number] = [0, Math.PI * 2], tall = 30) {
  const list: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = arc[0] + ((i + k.rand() * 0.6) / n) * (arc[1] - arc[0]);
    const r = from + k.rand() * (to - from);
    list.push([Math.sin(a) * r, Math.cos(a) * r, 14 + k.rand() * 22, 14 + k.rand() * 22, 14 + k.rand() * k.rand() * tall * 3, k.rand() * 3]);
  }
  cityBlocks(k, list, tints);
}

/** The qubit, the racks and the strip of frames: the three things from Bristol, set down at the kit's origin. */
function bristolExhibits(k: Kit) {
  const { THREE } = k;
  const leds = racks(k, 9, 2, 6);
  k.cyl(0.9, 0.6, "stone", -12, 0.3, 3, 24);
  const rings = new THREE.Group();
  for (const r of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, 0, Math.PI / 2]]) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.025, 8, 64), k.mat("light", { glow: true }));
    m.rotation.set(r[0], r[1], r[2]);
    rings.add(m);
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.46, 32, 20), new THREE.MeshPhysicalMaterial({ color: "#cfe6ff", roughness: 0.05, metalness: 0, transmission: 0.92, thickness: 0.6, transparent: true, opacity: 0.35 }));
  rings.add(ball);
  k.put(rings, -12, 2.4, 3);
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 10), k.mat("accent", { glow: true }));
  shaft.position.y = 0.65;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 12), k.mat("accent", { glow: true }));
  tip.position.y = 1.4;
  arrow.add(shaft, tip);
  k.put(arrow, -12, 2.4, 3);
  // the dissertation: a strip of video frames on a rail, a few of them picked out
  k.box(5.4, 0.06, 0.06, "dark", -14.9, 1.05, 11.7, 0.83);
  for (let i = 0; i < 9; i++) {
    const keep = i === 2 || i === 5 || i === 6;
    const f = k.box(1.5, 1, 0.05, keep ? "accent" : "light", -17 + i * 0.5, keep ? 2.25 : 1.6, 14 - i * 0.55, 0.9);
    if (keep) f.material = k.mat("accent", { glow: true });
  }
  return {
    tick(t: number) {
      arrow.rotation.set(Math.sin(t * 0.7) * 0.9, t * 0.9, 0);
      leds[0].visible = Math.sin(t * 5) > -0.6;
      leds[1].visible = Math.sin(t * 3.1 + 1) > -0.4;
    },
  };
}

// ---------- the places ----------

const essex = (k: Kit): Built => {
  const { THREE } = k;
  // a school: long brick building, slate roof, a clock gable
  const brick = k.mat("warm", { color: "#9b5e47", surface: "brick" });
  const slate = k.mat("dark", { color: "#3d424a", surface: "stone" });
  const wing = k.box(16, 5, 6, "warm", -10, 2.5, -11);
  wing.material = brick;
  k.prism(6.4, 2.6, 16, "dark", -10, 5, -11, Math.PI / 2).material = slate;
  k.box(4, 7.5, 6.6, "warm", -10, 3.75, -11).material = brick;
  k.prism(4.4, 2.2, 6.8, "dark", -10, 7.5, -11).material = slate;
  k.box(1.3, 2.3, 0.1, "dark", -10, 1.15, -7.66).material = k.mat("dark", { color: "#3b2a22", surface: "wood" });
  const clock = k.cyl(0.55, 0.08, "light", -10, 6.6, -7.69, 32);
  clock.rotation.x = Math.PI / 2;
  // windows: stone surround, dark glass, lit at night
  const win: number[][] = [], lit: number[][] = [];
  for (let i = 0; i < 6; i++) for (let r = 0; r < 2; r++) {
    const s = [-17 + i * 1.1 + (i > 2 ? 10.4 : 0), 1.4 + r * 2, -7.98];
    win.push(s);
    if (k.night && k.rand() > 0.4) lit.push([s[0], s[1], s[2] + 0.04]);
  }
  k.many(new THREE.BoxGeometry(0.86, 1.3, 0.08), "light", win);
  const glass = k.many(new THREE.BoxGeometry(0.66, 1.1, 0.1), "dark", win);
  glass.material = new THREE.MeshStandardMaterial({ color: "#1a222c", roughness: 0.08, metalness: 0.4 });
  if (lit.length) k.many(new THREE.BoxGeometry(0.66, 1.1, 0.02), "warm", lit, true).material = k.mat("warm", { glow: true, color: "#ffcf8a" });
  k.sign(["SCHOOL"], 3.2, 0.7, -10, 3.1, -7.6, 0, "light");
  k.flat(4, 14, "ground", -10, 0.02, -0.6);
  k.lamp(-12.6, 3.2, -7.2);
  k.lamp(-7.4, 3.2, -7.2);

  // the 8×8×8 board: a lattice of cells you can walk through
  const cx = 9, cz = -7, s = 0.95;
  const a: number[][] = [], b: number[][] = [];
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) for (let l = 0; l < 8; l++) {
    ((i + j + l) % 2 ? a : b).push([cx + (i - 3.5) * s, 0.5 + j * s, cz + (l - 3.5) * s]);
  }
  k.many(new THREE.BoxGeometry(0.2, 0.2, 0.2), "light", a).material = new THREE.MeshStandardMaterial({ color: "#f1ece2", roughness: 0.25, metalness: 0.1 });
  k.many(new THREE.BoxGeometry(0.2, 0.2, 0.2), "dark", b).material = new THREE.MeshStandardMaterial({ color: "#22262c", roughness: 0.25, metalness: 0.5 });
  const cell = (i: number, j: number, l: number): [number, number, number] => [cx + (i - 3.5) * s, 0.5 + j * s, cz + (l - 3.5) * s];
  [[1, 1, 2], [4, 2, 3], [2, 5, 6]].forEach((c) => k.ball(0.3, "accent", ...cell(c[0], c[1], c[2]), true));
  [[6, 6, 5], [5, 3, 1], [3, 4, 4]].forEach((c) => k.ball(0.3, "cool", ...cell(c[0], c[1], c[2]), true));
  k.box(8.4, 0.12, 8.4, "stone", cx, 0.06, cz);
  k.lamp(cx, 8.6, cz, "#cfe0ff", 60);

  trees(k, [[-22, -3], [-19, 4], [-3, -18], [1, -15], [20, -16], [22, 2], [17, 8], [-14, 10], [-6, 14], [12, 14], [-26, -16], [26, -10], [-30, 6], [30, 14], [0, -30], [-18, -28], [16, -30], [-34, -8]]);
  return {
    ground: "grass",
    bound: 26,
    fog: 0.0022,
    spawn: [0, 12, 0],
    solids: [{ x: -10, z: -11, r: 6.5 }],
    exhibits: [
      { x: -10, z: -4, title: "School", body: "Felsted for GCSEs, then Colchester Royal Grammar for A-levels. A*A*AA, and I ran the computer science society." },
      {
        x: 9, z: -0.5, title: "3D chess",
        body: "My A-level project: chess on an 8×8×8 board, with an engine to play against. 75 out of 75. This lattice is the board. You can walk through it.",
        link: { href: "https://github.com/TumCucTom/ai-chess-3d", label: "the code" },
      },
    ],
  };
};

const bristol = async (k: Kit): Promise<Built> => {
  const { THREE } = k;
  const d = (await import("./osm/bristol.json")).default as unknown as Osm;
  // the two ends of the span, from the map
  const A: [number, number] = [-88.2, 54.9], B: [number, number] = [94.2, -59.1];
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L;
  const DECK = 66;
  const real = buildReal(k, d, {
    walls: ["#d9cdb4", "#e6dcc8", "#cfc3a8", "#e9d9c9", "#d7dfe0", "#e8cfc6", "#dfd3bb"],
    roofs: ["#4a4f57", "#5a5f66", "#6b6258"],
    land: ["#6f8048", "#5d7d3c", "#3d5730", "#8c8474"],
    water: 1.6,
    waterColor: "#4d4a3c", // the Avon is tidal and brown
    steep: 0.7,
    treeEvery: 6.5,
    raise: [[A[0] - ux * 20, A[1] - uz * 20, 48, DECK - 0.1], [B[0] + ux * 20, B[1] + uz * 20, 48, DECK - 0.1]],
    decks: { "Clifton Suspension Bridge": [DECK, DECK] },
  });

  // ---- the bridge, built along its own axis and set down between the real abutments
  const g = new THREE.Group();
  g.position.set(A[0], DECK, A[1]);
  g.rotation.y = Math.atan2(-uz, ux);
  k.scene.add(g);
  const stoneW = k.mat("warm", { color: "#b7a888", surface: "ashlar" });
  const stoneE = k.mat("warm", { color: "#a9836a", surface: "ashlar" }); // the Clifton tower is the redder one
  const iron = k.mat("dark", { color: "#2a2d31", surface: "metal" });
  const paint = k.mat("light", { color: "#d9d6cc", surface: "metal" });
  const add = (m: T.Mesh, x: number, y: number, z: number) => {
    m.position.set(x, y, z);
    k.solid(m);
    g.add(m);
    return m;
  };
  const TOP = 24.5;
  const tower = (x: number, mat: T.Material) => {
    // seen along the bridge: a tapering pier with an arch for the road
    const s = new THREE.Shape();
    s.moveTo(-7, -1); s.lineTo(7, -1); s.lineTo(5.7, TOP); s.lineTo(-5.7, TOP); s.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-3.3, -1); hole.lineTo(-3.3, 9.5); hole.absarc(0, 9.5, 3.3, Math.PI, 0, true); hole.lineTo(3.3, -1); hole.closePath();
    s.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 5.6, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 1, curveSegments: 20 });
    geo.translate(0, 0, -2.8);
    geo.rotateY(Math.PI / 2);
    add(new THREE.Mesh(k.planarUV(geo, 4), mat), x, 0, 0);
    add(new THREE.Mesh(k.planarUV(new THREE.BoxGeometry(6.6, 1.1, 12.6), 4), mat), x, TOP + 0.55, 0);
    add(new THREE.Mesh(k.planarUV(new THREE.BoxGeometry(5.4, 2.0, 10.4), 4), mat), x, TOP + 2.1, 0);
    add(new THREE.Mesh(k.planarUV(new THREE.BoxGeometry(6.2, 0.5, 11.6), 4), mat), x, TOP + 3.35, 0);
    // the abutment it stands on, down into the cliff
    add(new THREE.Mesh(k.planarUV(new THREE.BoxGeometry(24, 46, 17), 4), mat), x + (x < 1 ? -9 : 9), -24, 0);
  };
  tower(0, stoneW);
  tower(L, stoneE);
  // deck, with its footways and lattice parapets
  add(new THREE.Mesh(k.planarUV(new THREE.BoxGeometry(L, 0.9, 9.6), 4), iron), L / 2, -0.42, 0);
  for (const z of [-4.75, 4.75]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(L, 0.09, 0.09), paint), L / 2, 1.3, z);
    add(new THREE.Mesh(new THREE.BoxGeometry(L, 0.07, 0.07), paint), L / 2, 0.7, z);
    add(new THREE.Mesh(new THREE.BoxGeometry(L, 0.3, 0.12), iron), L / 2, 0.22, z);
  }
  const posts: number[][] = [];
  for (let x = 1.2; x < L; x += 2.4) for (const z of [-4.75, 4.75]) posts.push([x, 0.72, z]);
  const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 1.25, 0.07), paint, posts.length);
  const o = new THREE.Object3D();
  posts.forEach((p, i) => { o.position.set(p[0], p[1], p[2]); o.updateMatrix(); pm.setMatrixAt(i, o.matrix); });
  g.add(k.solid(pm));
  // chains: a pair each side, sagging between the towers and running back to the anchorages
  const chainY = (x: number) => 3.4 + (TOP - 1.2 - 3.4) * ((x - L / 2) / (L / 2)) ** 2;
  const hang: number[][] = [];
  for (const z of [-5.25, 5.25]) {
    for (const dy of [0, -0.5]) {
      const main: T.Vector3[] = [];
      for (let i = 0; i <= 60; i++) main.push(new THREE.Vector3((i / 60) * L, chainY((i / 60) * L) + dy, z));
      g.add(k.solid(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(main), 120, 0.16, 8), iron)));
      for (const [x0, x1] of [[0, -62], [L, L + 62]]) {
        const land = [new THREE.Vector3(x0, TOP - 1.2 + dy, z), new THREE.Vector3((x0 + x1) / 2, (TOP - 1.2) * 0.42 + dy, z), new THREE.Vector3(x1, 0.6 + dy, z)];
        g.add(k.solid(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(land), 30, 0.16, 8), iron)));
      }
    }
    for (let x = 2.4; x < L - 1; x += 2.4) hang.push([x, z, chainY(x)]);
  }
  const hm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5), paint, hang.length);
  hang.forEach(([x, z, y], i) => {
    o.position.set(x, (y - 0.5 + 0.2) / 2, z);
    o.scale.set(1, y - 0.5 - 0.2, 1);
    o.updateMatrix();
    hm.setMatrixAt(i, o.matrix);
  });
  g.add(k.solid(hm));
  if (k.night) {
    // it is lit at night: a bead of lamps along the chains
    const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 6, 4), k.mat("warm", { glow: true, color: "#ffe2b0" }), hang.length);
    o.scale.set(1, 1, 1);
    hang.forEach(([x, z, y], i) => { o.position.set(x, y + 0.25, z); o.updateMatrix(); beads.setMatrixAt(i, o.matrix); });
    g.add(beads);
    for (const x of [0, L]) for (const z of [-7, 7]) {
      const p = new THREE.PointLight("#ffd9a3", 90, 70, 1.5);
      p.position.set(x, 3, z);
      g.add(p);
    }
  }

  // ---- the three things about my time here, on the grass by the lookout
  const ox = 150, oz = -36;
  k.origin.set(ox, real.ground(ox, oz), oz);
  const ex = bristolExhibits(k);
  k.origin.set(0, 0, 0);

  const onBridge = (x: number, z: number) => {
    const t = (x - A[0]) * ux + (z - A[1]) * uz, p = Math.abs((x - A[0]) * -uz + (z - A[1]) * ux);
    return t > -4 && t < L + 4 ? p : -1;
  };
  return {
    ownGround: true,
    height: real.height,
    blocked(x, z) {
      const p = onBridge(x, z);
      if (p >= 0 && p < 16) return p > 4.4; // the parapets
      if (real.blocked(x, z)) return true;
      const gy = real.ground(x, z);
      if (real.height(x, z) > gy + 0.05) return false; // on a road
      return gy < (real.waterY ?? -99) + 0.4 || real.slope(x, z) > 0.9;
    },
    bound: 190,
    centre: [50, -40],
    fog: 0.0011,
    speed: 6,
    sun: [k.night ? 0.4 : 0.75, k.night ? 0.7 : 0.72],
    spawn: [126, -8, face(-0.9, -0.42)],
    exhibits: [
      { x: 112, z: -64, title: "Bristol", body: "The Clifton Suspension Bridge. I did computer science here, 2023 to 2026, and got a First. You can walk across." },
      {
        x: ox + 12, z: oz + 6.2, title: "The HPC bit",
        body: "A coursework: take a lattice Boltzmann fluid solver and make it faster. I did 28 versions. I also captained the uni's cluster team at CIUK twice.",
        link: { href: "https://github.com/TumCucTom/hpc-2", label: "the solver" },
      },
      { x: ox - 12, z: oz + 7, title: "Quantum society", body: "I started the Quantum Computing Society and we ran its first hackathon. This is meant to be a qubit." },
      {
        x: ox - 12.5, z: oz + 13.5, title: "Dissertation",
        body: "I gave a vision-language model a memory, so it can pick the frames that matter out of a long video. 85%, and Best Computer Vision Project.",
        link: { href: "https://github.com/TumCucTom/VLM-memory", label: "VLM-memory" },
      },
    ],
    tick: (t) => ex.tick(t),
  };
};

// Hills and mountains from layered noise, for the lake.
function alpine(x: number, z: number) {
  const n = (px: number, pz: number) => {
    const xi = Math.floor(px), zi = Math.floor(pz), fx = px - xi, fz = pz - zi;
    const h = (a: number, b: number) => (((Math.sin(a * 127.1 + b * 311.7) * 43758.5453) % 1) + 1) % 1;
    const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    return h(xi, zi) * (1 - sx) * (1 - sz) + h(xi + 1, zi) * sx * (1 - sz) + h(xi, zi + 1) * (1 - sx) * sz + h(xi + 1, zi + 1) * sx * sz;
  };
  // broad shapes only: the far ground is a coarse mesh, and fine noise there turns into spikes
  let ridge = 0, amp = 1, f = 1 / 1700, total = 0;
  for (let o = 0; o < 4; o++) {
    ridge += amp * (1 - Math.abs(n(x * f + 40, z * f + 17) * 2 - 1));
    total += amp;
    amp *= 0.45;
    f *= 2.1;
  }
  ridge /= total;
  const r = Math.hypot(x, z);
  // a flat meadow where you stand, foothills, then the mountains a few km off
  const rise = Math.min(1, Math.max(0, (r - 260) / 5200));
  const hills = Math.min(1, Math.max(0, (r - 260) / 1400));
  const land = 0.9 + n(x / 40, z / 40) * 0.8 + hills * hills * (n(x / 310 + 9, z / 310) * 150 + 20) + rise * rise * (3 - 2 * rise) * ridge * ridge * 2300;
  // the lake: a long basin to the north-west
  const lx = (x + 560) / 900, lz = (z + 420) / 520;
  const lake = Math.min(1, Math.max(0, 1.25 - Math.hypot(lx, lz) * 1.25));
  return land * (1 - Math.min(1, lake * 3)) - Math.min(1, lake * 3) * 7;
}

const ironman = (k: Kit): Built => {
  const { THREE } = k;
  // ---- the ground: one big mesh, finer near you
  const N = 240, SIZE = 17000;
  const pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3), uv = new Float32Array(N * N * 2);
  const grass = new THREE.Color("#6a8a43"), rock = new THREE.Color("#7d7a74"), snow = new THREE.Color("#f4f6f9"), forest = new THREE.Color("#3a5230"), shore = new THREE.Color("#8d8674");
  const c = new THREE.Color();
  const warp = (t: number) => Math.sign(t) * Math.pow(Math.abs(t), 2.1); // more vertices in the middle
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = warp((i / (N - 1)) * 2 - 1) * (SIZE / 2), z = warp((j / (N - 1)) * 2 - 1) * (SIZE / 2);
    const h = alpine(x, z);
    H[j * N + i] = h;
    const q = (j * N + i) * 3;
    pos[q] = x; pos[q + 1] = h; pos[q + 2] = z;
    uv[(j * N + i) * 2] = x / 11; uv[(j * N + i) * 2 + 1] = z / 11;
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const q = (j * N + i) * 3, h = H[j * N + i];
    const hx = H[j * N + Math.min(N - 1, i + 1)] - H[j * N + Math.max(0, i - 1)], hz = H[Math.min(N - 1, j + 1) * N + i] - H[Math.max(0, j - 1) * N + i];
    const dx = pos[(j * N + Math.min(N - 1, i + 1)) * 3] - pos[(j * N + Math.max(0, i - 1)) * 3] || 1;
    const st = Math.hypot(hx, hz) / dx;
    const wob = Math.sin(pos[q] * 0.013) * 60 + Math.cos(pos[q + 2] * 0.017) * 60;
    if (h < 0.6) c.copy(shore);
    else if (h + wob > 1050) c.copy(st > 1.9 ? rock : snow);
    else if (st > 1.05) c.copy(rock);
    else if (h > 60 && h + wob < 820) c.copy(forest).lerp(grass, Math.min(1, st * 0.4));
    else c.copy(grass).lerp(rock, Math.min(1, Math.max(0, (h - 760) / 350)));
    const v = 0.93 + ((((Math.sin(pos[q] * 3.1 + pos[q + 2] * 7.7) * 43758.5453) % 1) + 1) % 1) * 0.07;
    col[q] = c.r * v; col[q + 1] = c.g * v; col[q + 2] = c.b * v;
  }
  const idx: number[] = [];
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const a = j * N + i, b = (j + 1) * N + i, cc = (j + 1) * N + i + 1, e = j * N + i + 1;
    idx.push(a, b, e, b, cc, e);
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  tg.setAttribute("color", new THREE.BufferAttribute(col, 3));
  tg.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  tg.setIndex(idx);
  tg.computeVertexNormals();
  const grassMat = k.mat("grass") as T.MeshStandardMaterial;
  const land = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, map: grassMat.map, normalMap: grassMat.normalMap, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 1 }));
  land.receiveShadow = true;
  land.castShadow = true;
  k.scene.add(land);
  // the lake
  const wg = new THREE.PlaneGeometry(17000, 17000);
  wg.rotateX(-Math.PI / 2);
  const wuv = wg.attributes.uv;
  for (let i = 0; i < wuv.count; i++) wuv.setXY(i, wuv.getX(i) * 1400, wuv.getY(i) * 1400);
  const lake = new THREE.Mesh(wg, k.mat("water", { color: "#1d5a6e" }));
  lake.position.y = 0;
  lake.receiveShadow = true;
  k.scene.add(lake);

  // pines on the lower slopes, a few by the shore
  const spots: [number, number, number][] = [];
  for (let i = 0; i < (k.tier === 0 ? 700 : 2400); i++) {
    const a = k.rand() * Math.PI * 2, r = 70 + Math.pow(k.rand(), 1.6) * 2100;
    const x = Math.sin(a) * r, z = Math.cos(a) * r, h = alpine(x, z);
    if (h < 1.2 || h > 760) continue;
    if (Math.abs(x - 9) < 6 && z < 20) continue; // keep the road clear
    if (r < 240 && k.rand() > 0.25) continue;
    spots.push([x, z, 0.8 + k.rand() * 0.9]);
  }
  plantTrees(k, alpine, spots, "pine");

  // ---- the three legs, laid out on the meadow by the water
  const y0 = (x: number, z: number) => Math.max(alpine(x, z), 0);
  const buoys: number[][] = [];
  for (let i = 0; i < 9; i++) buoys.push([-58 - i * 22, 0.25, -34 - i * 15 + Math.sin(i) * 4]);
  k.many(new THREE.SphereGeometry(0.55, 14, 10), "accent", buoys).material = new THREE.MeshStandardMaterial({ color: "#f25a1e", roughness: 0.35 });
  // a jetty out to the swim start
  for (let i = 0; i < 12; i++) k.box(2.2, 0.14, 1.6, "warm", -30 - i * 1.5, 0.75, -20 - i * 1.0, 0.98).material = k.mat("warm", { color: "#8a6a4a", surface: "wood" });
  const onJetty = (x: number, z: number) => {
    const dx = -16.5, dz = -11, t = Math.min(1, Math.max(0, ((x + 30) * dx + (z + 20) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x + 30 - dx * t, z + 20 - dz * t) < 1.2;
  };
  // the bike course: a road along the shore
  const roadPts: number[] = [], roadUv: number[] = [], roadIdx: number[] = [];
  for (let i = 0; i <= 120; i++) {
    const z = 30 - i * 6, x = 9 + Math.sin(i * 0.11) * 14 + i * 0.6;
    const y = y0(x, z) + 0.12;
    roadPts.push(x - 3.2, y, z, x + 3.2, y, z);
    roadUv.push(0, i * 1.5, 1.6, i * 1.5);
    if (i) { const a = (i - 1) * 2; roadIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute("position", new THREE.Float32BufferAttribute(roadPts, 3));
  rg.setAttribute("uv", new THREE.Float32BufferAttribute(roadUv, 2));
  rg.setIndex(roadIdx);
  rg.computeVertexNormals();
  const rm = k.mat("road").clone() as T.MeshStandardMaterial;
  rm.polygonOffset = true; rm.polygonOffsetFactor = -2; rm.polygonOffsetUnits = -2; rm.side = THREE.DoubleSide;
  const roadMesh = new THREE.Mesh(rg, rm);
  roadMesh.receiveShadow = true;
  k.scene.add(roadMesh);
  const dash: number[][] = [];
  for (let i = 0; i < 60; i++) { const z = 28 - i * 12, x = 9 + Math.sin((i * 2) * 0.11) * 14 + i * 1.2; dash.push([x, y0(x, z) + 0.15, z]); }
  k.many(new THREE.BoxGeometry(0.14, 0.02, 3), "light", dash);
  const bike = new THREE.Group();
  const tyre = new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.8 });
  const carbon = new THREE.MeshStandardMaterial({ color: "#e8501f", roughness: 0.35, metalness: 0.3 });
  for (const wz of [-0.52, 0.52]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.022, 8, 40), tyre);
    w.rotation.y = Math.PI / 2;
    w.position.set(0, 0.36, wz);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.012, 32), wz < 0 ? new THREE.MeshStandardMaterial({ color: "#1b1b1b", roughness: 0.3, metalness: 0.4 }) : new THREE.MeshStandardMaterial({ color: "#c9c9c9", roughness: 0.3, metalness: 0.8, transparent: true, opacity: 0.25 }));
    disc.rotation.z = Math.PI / 2;
    disc.position.copy(w.position);
    bike.add(w, disc);
  }
  const bar = (a: P3, b: P3, r = 0.022) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, va.distanceTo(vb), 8), carbon);
    m.position.copy(va).lerp(vb, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    bike.add(m);
  };
  bar([0, 0.36, -0.52], [0, 0.9, -0.2]); bar([0, 0.9, -0.2], [0, 0.85, 0.33]); bar([0, 0.85, 0.33], [0, 0.36, 0.52]);
  bar([0, 0.36, -0.52], [0, 0.4, 0.05]); bar([0, 0.4, 0.05], [0, 0.9, -0.2]); bar([0, 0.4, 0.05], [0, 0.85, 0.33]);
  bar([0, 0.9, -0.2], [0, 1.04, -0.27]); bar([0, 0.85, 0.33], [0, 0.98, 0.45]); bar([-0.2, 0.98, 0.45], [0.2, 0.98, 0.45]);
  bike.traverse((o) => { (o as T.Mesh).castShadow = true; });
  k.put(bike, 13.4, y0(13.4, -6), -6, 0.1);
  // the run, and the finish: a gantry, barriers, a carpet
  k.flat(3.2, 30, "accent", 4, 0.93 + 0.04, 4).material = new THREE.MeshStandardMaterial({ color: "#a32218", roughness: 0.95 });
  for (const sx of [2.2, 5.8]) k.cyl(0.16, 5, "dark", sx, 3.4, 16, 12);
  k.box(4.2, 1.2, 0.5, "dark", 4, 5.6, 16);
  k.sign([{ t: "FINISH", big: true }], 3.8, 0.9, 4, 5.6, 15.74, Math.PI, "dark");
  k.sign([{ t: "FINISH", big: true }], 3.8, 0.9, 4, 5.6, 16.26, 0, "dark");
  const fence: number[][] = [];
  for (let i = 0; i < 12; i++) for (const sx of [1.9, 6.1]) fence.push([sx, 1.45, -9 + i * 2.2]);
  k.many(new THREE.BoxGeometry(0.06, 1.05, 2.1), "light", fence).material = new THREE.MeshStandardMaterial({ color: "#c9ccd1", roughness: 0.35, metalness: 0.85 });
  k.sign(["IRONMAN SWITZERLAND 2024", { t: "10:30", big: true, hot: true }], 3.6, 1.8, 9.2, 2.6, 16.6, -0.35);
  k.lamp(2.2, 6.2, 16, "#fff0d6", 80);
  k.lamp(5.8, 6.2, 16, "#fff0d6", 80);
  return {
    ownGround: true,
    height: (x, z) => (onJetty(x, z) ? 0.82 : y0(x, z)),
    blocked: (x, z) => alpine(x, z) < 0.25 && !onJetty(x, z),
    bound: 70,
    fog: 0.00013,
    speed: 5.2,
    sun: [k.night ? 0.5 : 0.9, k.night ? 0.55 : 0.42],
    spawn: [2, 34, face(-0.5, -1)],
    exhibits: [
      { x: -22, z: -13, title: "Swim", body: "3.8 km in the lake. Eleven years of competitive swimming helped." },
      { x: 14, z: -10, title: "Bike", body: "180 km. The long bit." },
      { x: 4, z: 10, title: "Run", body: "Then a marathon. 10h30 in total, after about nine months of training." },
    ],
  };
};

const monaco = async (k: Kit): Promise<Built> => {
  const { THREE } = k;
  const d = (await import("./osm/monaco.json")).default as unknown as Osm;
  const real = buildReal(k, d, {
    walls: ["#efe3cf", "#e9d2b4", "#f1e9dc", "#e6c7a6", "#dcd4c8", "#f0d9c4", "#e2b9a0"],
    roofs: ["#b6674a", "#8d8f92", "#c9bfae", "#a45b40"],
    land: ["#a39c8e", "#6f8a45", "#4c6a35", "#b3a995"],
    water: 2.15,
    waterColor: "#0f4f6d",
    retain: true,
    steep: 1.4,
    trees: "palm",
  });
  // the lap, as far as this bit goes: down Avenue des Spélugues, round the
  // hairpin, down Avenue Princesse Grace to Mirabeau Bas and on to Portier
  const lap: [number, number][] = [
    [-87, -62], [-81, -61], [-76, -59], [-70, -54], [-66, -49], [-64, -43], [-63, -39], [-62, -22], [-60, -14], [-55, -5], [-40, 16], [-31, 34], [-29, 36], [-25, 38], [-21, 38], [-17, 36], [-14, 33], [-13, 29], [-12, 26], [-13, 22],
    [-31, 3], [-46, -17], [-48, -24], [-48, -31], [-44, -37], [-40, -40], [-30, -44], [-17, -47], [-10, -50], [1, -57], [11, -60],
  ];
  const curve = new THREE.CatmullRomCurve3(lap.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
  const N = 260;
  const line = curve.getSpacedPoints(N);
  const yAt = (x: number, z: number) => real.height(x, z);
  // barriers down both sides, kerbs on the inside of the hairpin
  const rail: number[][] = [], red: number[][] = [], white: number[][] = [];
  for (let i = 0; i < N; i++) {
    const p = line[i], q = line[i + 1];
    const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l, ry = Math.atan2(dx, dz);
    for (const s of [3.4, -3.4]) rail.push([p.x + nx * s, yAt(p.x, p.z) + 0.62, p.z + nz * s, ry]);
    const apex = Math.hypot(p.x + 22, p.z - 31);
    if (apex < 13) (i % 2 ? red : white).push([p.x + nx * 2.7, yAt(p.x, p.z) + 0.05, p.z + nz * 2.7, ry]);
  }
  // two rails of steel, as armco is
  const armco = k.many(new THREE.BoxGeometry(0.06, 0.3, 1.0), "light", [...rail, ...rail.map((r) => [r[0], r[1] - 0.36, r[2], r[3]])]);
  armco.material = new THREE.MeshStandardMaterial({ color: "#9aa0a6", roughness: 0.4, metalness: 0.85 });
  const posts = k.many(new THREE.BoxGeometry(0.1, 1.0, 0.1), "dark", rail.filter((_, i) => i % 6 < 2).map((r) => [r[0], r[1] - 0.2, r[2], r[3]]));
  posts.castShadow = false;
  k.many(new THREE.BoxGeometry(0.9, 0.09, 1.0), "accent", red).material = new THREE.MeshStandardMaterial({ color: "#c8281c", roughness: 0.6 });
  k.many(new THREE.BoxGeometry(0.9, 0.09, 1.0), "light", white).material = new THREE.MeshStandardMaterial({ color: "#ecebe6", roughness: 0.6 });
  // street lamps along the lap
  for (let i = 8; i < N; i += 26) {
    const p = line[i], q = line[i + 1];
    const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
    const x = p.x - (dz / l) * 4.2, z = p.z + (dx / l) * 4.2, y = yAt(p.x, p.z);
    k.cyl(0.07, 6, "dark", x, y + 3, z, 8);
    k.box(1.2, 0.08, 0.2, "dark", x + (dz / l) * 0.5, y + 6, z - (dx / l) * 0.5, Math.atan2(dx, dz) + Math.PI / 2);
    k.lamp(x + (dz / l) * 1.0, y + 5.9, z - (dx / l) * 1.0, "#ffd9a3", 90);
  }
  // two cars on the lap: generic single-seaters, no team's colours
  const cars = [0, 0.46].map((start, ci) => {
    const car = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: ci ? "#1f5fbf" : "#d7d9dc", roughness: 0.25, metalness: 0.55 });
    const black = new THREE.MeshStandardMaterial({ color: "#121212", roughness: 0.7 });
    const part = (g: T.BufferGeometry, m: T.Material, x: number, y: number, z: number) => {
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      car.add(o);
      return o;
    };
    part(new THREE.BoxGeometry(0.72, 0.3, 3.3), paint, 0, 0.36, 0.1);
    part(new THREE.BoxGeometry(1.5, 0.34, 1.5), paint, 0, 0.36, -0.5);
    const nose = part(new THREE.ConeGeometry(0.3, 1.5, 12), paint, 0, 0.32, 2.2);
    nose.rotation.x = Math.PI / 2;
    part(new THREE.BoxGeometry(1.8, 0.05, 0.45), black, 0, 0.16, 2.75);
    part(new THREE.BoxGeometry(1.1, 0.06, 0.4), black, 0, 0.92, -1.75);
    for (const sx of [-0.5, 0.5]) part(new THREE.BoxGeometry(0.05, 0.45, 0.4), black, sx, 0.7, -1.75);
    part(new THREE.TorusGeometry(0.28, 0.035, 8, 20, Math.PI), black, 0, 0.56, 0.35).rotation.y = Math.PI / 2;
    for (const [wx, wz] of [[0.8, 1.55], [-0.8, 1.55], [0.82, -1.25], [-0.82, -1.25]]) {
      const w = part(new THREE.CylinderGeometry(0.34, 0.34, wz > 0 ? 0.32 : 0.42, 20), black, wx, 0.34, wz);
      w.rotation.z = Math.PI / 2;
    }
    k.scene.add(car);
    return { car, u: start };
  });

  // the timing board, by the outside of the hairpin
  const bx = -8, bz = 46, by = yAt(bx, bz);
  for (const sx of [-2.4, 2.4]) k.cyl(0.1, 4.6, "dark", bx + sx, by + 2.3, bz, 8);
  k.sign(["F1 25 · MONACO · SIM", { t: "1:11.96", big: true, hot: true }, "TARGET 1:09.0"], 5, 2.6, bx, by + 3.5, bz, face(14, 9) + Math.PI);
  k.lamp(bx, by + 5.2, bz - 0.6, "#ffffff", 60);

  // the hills behind the town
  const far: number[][] = [];
  for (let i = 0; i < 9; i++) far.push([-900 - k.rand() * 500, -1200 + i * 300, 500 + k.rand() * 300]);
  far.forEach(([x, z, h]) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(h * 1.5, h, 7, 3), k.mat("stone", { color: "#8a8f86", surface: "rock" }));
    m.position.set(x, h / 2 - 40, z);
    k.scene.add(m);
  });

  return {
    ownGround: true,
    height: real.height,
    blocked(x, z) {
      if (real.blocked(x, z)) return true;
      const gy = real.ground(x, z);
      if (real.height(x, z) > gy + 0.05) return false;
      return gy < (real.waterY ?? -99) + 0.3;
    },
    bound: 120,
    centre: [-25, 0],
    fog: 0.0009,
    speed: 5.5,
    sun: [k.night ? 1.0 : 0.75, k.night ? 0.6 : 0.62],
    spawn: [-49, 0, face(0.55, 0.83)],
    exhibits: [
      { x: -2, z: 44, title: "Monaco", body: "I haven't been. My lap is from F1 25 on the sim: 1:11.96, aiming for 1:09." },
      { x: -22, z: 28, title: "The hairpin", body: "The slowest corner on the F1 calendar." },
      {
        x: -58, z: -20, title: "F1 projects",
        body: "I've built a few F1 things, including a ghost-car replay of qualifying laps and a race predictor.",
        link: { href: "https://github.com/TumCucTom/f1-ghost-car", label: "ghost car" },
      },
    ],
    tick(t) {
      cars.forEach((c, i) => {
        // slower through the hairpin, like everyone
        const u = (c.u + t * 0.021 + i * 0) % 1;
        const p = curve.getPointAt(u), q = curve.getPointAt(Math.min(1, u + 0.004));
        c.car.position.set(p.x, yAt(p.x, p.z), p.z);
        c.car.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
        c.car.visible = u < 0.985 && u > 0.01;
      });
    },
  };
};

const london = (k: Kit): Built => {
  const { THREE } = k;
  skyline(k, 150, 420, 110, ["#9aa3ad", "#b6b0a4", "#8c949e", "#c2bcb0", "#7f8892"], [0, Math.PI * 2], 34);
  const river = k.flat(1400, 90, "water", 0, 0.04, -105);
  river.material = k.mat("water", { color: "#3a4a4a" });
  // the office: a floor, a glass wall, a desk, a screen
  const floor = k.box(18, 0.12, 12, "light", 0, 0.06, -3);
  floor.material = new THREE.MeshStandardMaterial({ color: "#b9b4aa", roughness: 0.22, metalness: 0.1 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#cfe3ee", roughness: 0.03, metalness: 0, transmission: 0.9, thickness: 0.1, transparent: true, opacity: 0.3 });
  for (let i = 0; i < 6; i++) {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(2.9, 3.2, 0.04), glass);
    k.put(pane, -7.5 + i * 3, 1.72, -8.9);
    k.box(0.08, 3.3, 0.08, "dark", -9 + i * 3, 1.7, -8.9);
  }
  k.box(0.08, 3.3, 0.08, "dark", 9, 1.7, -8.9);
  k.box(18, 0.1, 0.1, "dark", 0, 3.35, -8.9);
  k.box(3.2, 0.06, 1.4, "warm", 0, 0.78, -5).material = k.mat("warm", { color: "#b08d62", surface: "wood" });
  for (const [lx, lz] of [[-1.5, -5.6], [1.5, -5.6], [-1.5, -4.4], [1.5, -4.4]]) k.box(0.06, 0.74, 0.06, "dark", lx, 0.37, lz);
  k.box(0.1, 0.4, 0.1, "dark", 0, 1, -5.3);
  k.box(1.5, 0.9, 0.06, "dark", 0, 1.6, -5.3);
  k.sign([{ t: "anima", big: true, hot: true }, "product engineer"], 1.4, 0.8, 0, 1.6, -5.26, 0);
  k.box(0.6, 0.08, 0.6, "dark", 0, 0.5, -3.7);
  k.box(0.6, 0.6, 0.08, "dark", 0, 0.82, -3.4);
  k.cyl(0.05, 0.5, "dark", 0, 0.25, -3.7, 12);
  k.lamp(0, 3.1, -4.5, "#fff1dc", 40);
  k.lamp(-7, 3.1, -4.5, "#fff1dc", 40);
  k.lamp(7, 3.1, -4.5, "#fff1dc", 40);
  // four product lines; one of them is the one I rebuilt
  [-9.5, -8.3, -7.1, -5.9].forEach((x, i) => {
    const mine = i === 2;
    const p = k.cyl(0.38, mine ? 3.4 : 2.4, mine ? "accent" : "stone", x, (mine ? 3.4 : 2.4) / 2, -6, 32);
    p.material = mine ? k.mat("accent", { glow: true }) : new THREE.MeshStandardMaterial({ color: "#c9c5bb", roughness: 0.2, metalness: 0.05 });
  });
  // the loop: build, ship, check, round again
  const loop = new THREE.Mesh(new THREE.TorusGeometry(2, 0.05, 10, 96), k.mat("light", { glow: true }));
  loop.rotation.x = Math.PI / 2;
  k.put(loop, 8, 1.5, -6);
  const runner = k.ball(0.22, "accent", 10, 1.5, -6, true);
  ["BUILD", "SHIP", "CHECK"].forEach((w, i) => {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    k.sign([w], 1.3, 0.4, 8 + Math.cos(a) * 2.6, 2.3, -6 + Math.sin(a) * 2.6, -a + Math.PI / 2);
  });
  trees(k, [[-16, 8], [15, 9], [-20, -4], [21, -2], [-12, 16], [10, 18]]);
  return {
    bound: 24,
    fog: 0.0016,
    spawn: [0, 10, 0],
    solids: [{ x: 0, z: -5, r: 1.6 }],
    exhibits: [
      { x: 0, z: -1.2, title: "Anima", body: "Where I work now, as a product engineer. Started June 2026." },
      { x: -7.7, z: -2.6, title: "Four product lines", body: "Anima has four main product lines. I led the rebuild of one, from customer calls to rollout." },
      { x: 8, z: -1.6, title: "The loop", body: "A loop I built that gets software changes shipped and checked with much less manual work." },
    ],
    tick(t) {
      runner.position.set(8 + Math.cos(t * 1.4) * 2, 1.5, -6 + Math.sin(t * 1.4) * 2);
    },
  };
};

const mit = async (k: Kit): Promise<Built> => {
  const { THREE } = k;
  const d = (await import("./osm/mit.json")).default as unknown as Osm;
  const real = buildReal(k, d, {
    walls: ["#d8d0bd", "#cfc7b3", "#ddd6c6", "#d3cbb8"],
    // the main building's listed height is the top of the dome; its roofline is lower
    heightOf: (cx, cz, h) => (Math.hypot(cx + 28, cz + 78) < 95 ? Math.min(h, 21) : h),
    roofs: ["#7d8286", "#6d7377", "#8a8478"],
    land: ["#9a9588", "#5f8238", "#42602f", "#999999"],
    water: 1.25,
    waterColor: "#2c4a5a",
    steep: 3,
  });
  // The court runs square to the river: find the north wall by walking from
  // the middle of the lawn until we hit the main building.
  const ax = -0.38, az = -0.925; // towards the dome
  let reach = 20;
  while (reach < 160 && !real.blocked(ax * reach, az * reach)) reach += 1;
  const fx = ax * reach, fz = az * reach, base = real.ground(fx, fz);
  const g = new THREE.Group();
  g.position.set(fx, base, fz);
  g.rotation.y = Math.atan2(ax, az) + Math.PI; // local +z points back down the court
  k.scene.add(g);
  const lime = k.mat("light", { color: "#d6cfbd", surface: "ashlar" });
  const add = (geo: T.BufferGeometry, m: T.Material, x: number, y: number, z: number, uv = 4) => {
    const o = new THREE.Mesh(uv ? k.planarUV(geo, uv) : geo, m);
    o.position.set(x, y, z);
    k.solid(o);
    g.add(o);
    return o;
  };
  // steps, ten Ionic-ish columns, the entablature with its inscription, the attic
  for (let i = 0; i < 7; i++) add(new THREE.BoxGeometry(46 - i * 1.2, 0.34, 11 - i * 1.3), lime, 0, 0.17 + i * 0.34, 6.5 - i * 0.65);
  const colH = 14.5, colY = 2.4;
  for (let i = 0; i < 10; i++) {
    const x = -18.9 + i * 4.2;
    add(new THREE.CylinderGeometry(0.86, 1.0, colH, 28), lime, x, colY + colH / 2, 3.2, 3);
    add(new THREE.BoxGeometry(2.4, 0.5, 2.4), lime, x, colY + 0.25, 3.2);
    add(new THREE.BoxGeometry(2.5, 0.7, 2.2), lime, x, colY + colH + 0.35, 3.2);
  }
  add(new THREE.BoxGeometry(44, 3.2, 4.4), lime, 0, colY + colH + 2.3, 2.4);
  add(new THREE.BoxGeometry(45.5, 0.7, 5.4), lime, 0, colY + colH + 4.25, 2.4);
  add(new THREE.BoxGeometry(44, 4, 5), lime, 0, colY + colH + 6.6, 1.6);
  const ins = k.sign(["MASSACHVSETTS INSTITVTE OF TECHNOLOGY"], 38, 1.5, 0, 0, 0, 0, "light");
  k.scene.remove(ins);
  ins.position.set(0, colY + colH + 2.4, 4.63);
  ins.rotation.set(0, 0, 0);
  (ins.material as T.MeshStandardMaterial).emissiveIntensity = k.night ? 0.25 : 0.05;
  g.add(ins);
  add(new THREE.BoxGeometry(44, colY + colH + 8.6, 4), lime, 0, (colY + colH + 8.6) / 2, -1.2);
  // the drum and the dome, set back over the building
  const dz = -17, roof = colY + colH + 8.6;
  for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(18.6 - i * 0.9, 19.4 - i * 0.9, 1.5, 64), lime, 0, roof + 0.75 + i * 1.5, dz);
  const dome = new THREE.SphereGeometry(16, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 0.66, 1);
  add(dome, k.mat("stone", { color: "#b9b6ab", surface: "stone" }), 0, roof + 6, dz, 5);
  add(new THREE.CylinderGeometry(2.6, 3.0, 1.2, 32), lime, 0, roof + 6 + 16 * 0.66, dz);
  const oculus = add(new THREE.CylinderGeometry(2.3, 2.3, 0.3, 32), k.mat("cool", { glow: true, color: k.night ? "#ffe9c4" : "#9fc6e6" }), 0, roof + 6 + 16 * 0.66 + 0.7, dz, 0);
  oculus.castShadow = false;
  if (k.night) {
    // floodlit, as it is
    for (const x of [-16, 0, 16]) {
      const p = new THREE.SpotLight("#ffe3b8", 2600, 90, 0.7, 0.6, 1.4);
      p.position.set(x, 1.2, 16);
      p.target.position.set(x * 0.6, 26, -8);
      g.add(p, p.target);
    }
  }

  // Boston, across the river: made up
  const sx = 0.38, sz = 0.925;
  const list: number[][] = [];
  for (let i = 0; i < 70; i++) {
    const along = (k.rand() - 0.5) * 2600, back = 760 + k.rand() * 700;
    list.push([sx * back - sz * along, sz * back + sx * along, 26 + k.rand() * 34, 26 + k.rand() * 34, 24 + k.rand() * k.rand() * 190, Math.atan2(sx, sz)]);
  }
  cityBlocks(k, list, ["#9aa3ad", "#b6b0a4", "#8c949e", "#a9785f", "#c2bcb0"], real.ground(sx * 300, sz * 300));

  // the ion trap, on the lawn
  const tx = 26, tz = 6;
  k.origin.set(tx, real.ground(tx, tz), tz);
  k.box(9, 0.5, 2.2, "stone", 0, 0.25, 0);
  const rails = new THREE.MeshStandardMaterial({ color: "#c9a44a", roughness: 0.25, metalness: 1 });
  k.box(8.5, 0.12, 0.12, "light", 0, 1.1, -0.6).material = rails;
  k.box(8.5, 0.12, 0.12, "light", 0, 1.1, 0.6).material = rails;
  const ions: T.Mesh[] = [];
  for (let i = 0; i < 7; i++) ions.push(k.ball(0.2, i === 2 || i === 4 ? "accent" : "cool", -3 + i, 1.5, 0, true));
  k.tube([[-1, 1.5, 0], [0, 2.1, 0], [1, 1.5, 0]], 0.03, "accent").material = k.mat("accent", { glow: true });
  k.origin.set(0, 0, 0);

  return {
    ownGround: true,
    height: real.height,
    blocked(x, z) {
      if (real.blocked(x, z)) return true;
      const gy = real.ground(x, z);
      return real.height(x, z) <= gy + 0.05 && gy < (real.waterY ?? -99) + 0.3;
    },
    bound: 150,
    centre: [10, 30],
    fog: 0.00075,
    speed: 5.5,
    sun: [k.night ? 0.3 : 0.55, k.night ? 0.6 : 0.6],
    spawn: [21, 52, face(ax, az)],
    solids: [{ x: tx, z: tz, r: 1.2 }],
    exhibits: [
      { x: fx - ax * 16, z: fz - az * 16, title: "iQuHACK", body: "MIT's quantum hackathon. I've led one Bristol team here and coached two others. This is Killian Court." },
      { x: tx, z: tz + 3.4, title: "IonQ", body: "IonQ's challenges run on trapped ions, hence these. We won their bounty in 2025 and were first after day one in 2026." },
    ],
    tick(t) {
      ions.forEach((m, i) => (m.position.y = k.origin.y + real.ground(tx, tz) + 1.5 + Math.sin(t * 3 + i * 0.9) * 0.05));
    },
  };
};

const isc = (k: Kit): Built => {
  const { THREE } = k;
  // an exhibition hall: polished floor, a truss roof with lights, the team's cluster
  const floor = k.box(60, 0.1, 44, "light", 0, 0.05, -4);
  floor.material = new THREE.MeshStandardMaterial({ color: "#55595e", roughness: 0.2, metalness: 0.1 });
  for (const [x, z, w, dd] of [[0, -27, 60, 0.4], [-30, -4, 0.4, 46], [30, -4, 0.4, 46]] as number[][]) k.box(w, 14, dd, "light", x, 7, z).material = k.mat("light", { color: "#c9ccd0", surface: "plaster" });
  for (let i = 0; i < 6; i++) {
    const z = -24 + i * 8;
    k.box(60, 0.5, 0.3, "dark", 0, 13, z);
    for (const x of [-18, -6, 6, 18]) {
      const p = k.box(1.6, 0.12, 0.5, "light", x, 12.6, z);
      p.material = k.mat("light", { glow: true, color: "#f4f8ff" });
      p.castShadow = false;
    }
  }
  const roof = k.box(60, 0.3, 46, "dark", 0, 14, -4);
  roof.castShadow = false;
  k.box(9, 0.02, 7, "cool", 0, 0.115, -4.5).material = new THREE.MeshStandardMaterial({ color: "#1d3350", roughness: 0.9 }); // the stand's carpet
  const leds = racks(k, -1.9, -6, 4, 8);
  k.sign(["UK · ISC'25 STUDENT CLUSTER COMPETITION", { t: "208 CORES · 8× H100", big: true, hot: true }], 7, 1.6, 0, 3.6, -6, 0);
  for (const sx of [-3.4, 3.4]) k.box(0.15, 4.4, 0.15, "dark", sx, 2.2, -6.05);
  // the two workloads, as benches either side
  k.box(3, 0.9, 1.2, "light", -8, 0.45, -2);
  k.sign([{ t: "OpenMX", big: true }, "materials simulation"], 2.6, 1.1, -8, 1.8, -2, 0.3);
  k.box(3, 0.9, 1.2, "light", 8, 0.45, -2);
  k.sign([{ t: "Llama", big: true }, "fine-tuning"], 2.6, 1.1, 8, 1.8, -2, -0.3);
  // other stands, in the distance
  for (let i = 0; i < 10; i++) {
    const x = -24 + (i % 5) * 12, z = i < 5 ? -20 : 12;
    if (Math.abs(x) < 8 && z < 0) continue;
    k.box(6, 2.6, 0.2, "light", x, 1.3, z).material = k.mat("light", { color: ["#d9dde2", "#c8d4e0", "#e2d9cc"][i % 3], surface: "plaster" });
    k.box(2.4, 1, 1, "dark", x, 0.5, z + (i < 5 ? 2 : -2));
  }
  k.lamp(0, 9, -3, "#ffffff", 220, true);
  k.lamp(-14, 9, 2, "#ffffff", 160, true);
  k.lamp(14, 9, 2, "#ffffff", 160, true);
  k.lamp(0, 9, -18, "#ffffff", 160, true);
  return {
    bound: 20,
    fog: 0.0012,
    env: 0.22,
    exposure: 1.5,
    spawn: [0, 9, 0],
    solids: [{ x: 0, z: -6, r: 3.2 }],
    exhibits: [
      { x: 0, z: -1.8, title: "The cluster", body: "I was on the UK team at the ISC'25 Student Cluster Competition. 208 cores and eight H100s. We were the first English team to enter." },
      { x: -8, z: 1, title: "OpenMX", body: "One job was making OpenMX run faster on it. A lot of profiling." },
      {
        x: 8, z: 1, title: "Llama", body: "The other was fine-tuning Llama on the GPUs. We tried FP8, FlashAttention 3 and a few LoRA variants.",
        link: { href: "https://github.com/TumCucTom/llama-8b-ISC-25", label: "write-up" },
      },
    ],
    tick(t) {
      leds[0].visible = Math.sin(t * 6) > -0.5;
      leds[1].visible = Math.sin(t * 4.3 + 2) > -0.5;
    },
  };
};

export const PLACES: Record<string, (k: Kit) => Built | Promise<Built>> = { essex, bristol, ironman, monaco, london, mit, isc };

/** The places laid out from real map data, for the note on the page. */
export const REAL_PLACES = ["bristol", "monaco", "mit"];
