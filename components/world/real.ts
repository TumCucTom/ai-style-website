// Builds a place from baked map data (scripts/bake-osm.mjs): the ground from
// real heights, buildings extruded from their real outlines, roads laid along
// their real lines, woods where the map says woods. Landmarks are modelled by
// hand on top of this, in places.ts.
import type * as T from "three";
import type { Kit } from "./places";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { facade, surface } from "./tex";

export type Osm = {
  id: string;
  r: number;
  b: { p: number[]; h: number; k?: 1 }[];
  roads: { p: number[]; w: number; c: 0 | 1; b?: 1; t?: 1; n?: string }[];
  green: { p: number[]; w: 0 | 1 | 2 }[];
  water: { p: number[] }[];
  trees: number[];
  e: { n: number; s: number; d: number[] };
  names: Record<string, number[]>;
};

export type Real = {
  /** where your feet are: the ground, or a road or bridge deck if you are on one */
  height(x: number, z: number): number;
  /** the ground only */
  ground(x: number, z: number): number;
  blocked(x: number, z: number): boolean;
  /** the surface of the river or sea, if there is one */
  waterY: number | null;
  /** polylines of every road with this name */
  road(name: string): [number, number][][];
  /** plant trees at these spots (x, z, scale) */
  plant(spots: [number, number, number][], kind?: "leaf" | "pine" | "palm"): void;
  inPoly(p: number[], x: number, z: number): boolean;
  slope(x: number, z: number): number;
};

type Opts = {
  walls: string[];
  roofs: string[];
  /** ground colours: built-up, grass, woodland floor, rock */
  land: [string, string, string, string];
  /** metres above the lowest ground to put the water; null for none */
  water: number | null;
  waterColor?: string;
  /** flatten and lift the ground round these points: x, z, radius, height */
  raise?: [number, number, number, number][];
  /** set a road's deck height by name: from height, to height (bridges) */
  decks?: Record<string, [number, number]>;
  skipRoad?(r: Osm["roads"][number]): boolean;
  skipBuilding?(cx: number, cz: number, h: number): boolean;
  /** change a building's height */
  heightOf?(cx: number, cz: number, h: number): number;
  trees?: "leaf" | "pine" | "palm";
  treeEvery?: number;
  /** walls under the edges of roads, for hill towns */
  retain?: boolean;
  steep?: number;
};

const pts = (p: number[]) => {
  const o: [number, number][] = [];
  for (let i = 0; i < p.length; i += 2) o.push([p[i], p[i + 1]]);
  return o;
};

export function inPoly(p: number[], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Instanced trees: lumpy crowns, darker underneath, each a slightly different green. */
export function plantTrees(k: Kit, ground: (x: number, z: number) => number, spots: [number, number, number][], kind: "leaf" | "pine" | "palm" = "leaf") {
  const { THREE } = k;
  if (!spots.length) return;
  const dummy = new THREE.Object3D();
  const trunkH = kind === "palm" ? 7 : kind === "pine" ? 3 : 3.2;
  const trunk = new THREE.CylinderGeometry(kind === "palm" ? 0.16 : 0.3, kind === "palm" ? 0.26 : 0.5, trunkH, 7);
  trunk.translate(0, trunkH / 2, 0);
  let crown: T.BufferGeometry;
  if (kind === "pine") {
    crown = new THREE.ConeGeometry(2.2, 8.5, 9, 4);
    crown.translate(0, 6.6, 0);
  } else if (kind === "palm") {
    // a spray of drooping fronds
    const fronds: T.BufferGeometry[] = [];
    for (let i = 0; i < 11; i++) {
      const f = new THREE.PlaneGeometry(0.75, 3.6, 1, 5);
      f.translate(0, 1.8, 0);
      const p = f.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const t = p.getY(v) / 3.6;
        p.setZ(v, -t * t * 1.9); // droop
        p.setX(v, p.getX(v) * (1 - t * 0.85));
      }
      f.rotateX(0.95 + (i % 3) * 0.22);
      f.rotateY((i / 11) * Math.PI * 2);
      f.translate(0, 7, 0);
      fronds.push(f);
    }
    crown = mergeGeometries(fronds);
    fronds.forEach((f) => f.dispose());
  } else {
    // a few overlapping lumps rather than one ball
    const lumps = [[0, 5.6, 0, 2.6], [1.5, 5.0, 0.6, 1.9], [-1.3, 5.2, -0.8, 2.0], [0.2, 6.9, -0.5, 1.8], [-0.4, 4.9, 1.5, 1.7]].map(([x, y, z, r]) => {
      const g = new THREE.IcosahedronGeometry(r, 1);
      g.scale(1, 0.82, 1);
      g.translate(x, y, z);
      return g;
    });
    crown = mergeGeometries(lumps);
    lumps.forEach((g) => g.dispose());
  }
  // lumpy, so they are not balls on sticks
  const cp = crown.attributes.position;
  const tc = new Float32Array(cp.count * 3);
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
    const nz = Math.sin(x * 2.1 + y * 1.3) * Math.cos(z * 1.9 - y * 0.7) + Math.sin(x * 4.7 + z * 3.9) * 0.5;
    const f = 1 + nz * (kind === "pine" ? 0.07 : 0.16);
    cp.setXYZ(i, x * f, y, z * f);
    const shade = kind === "palm" ? 0.85 + nz * 0.1 : 0.5 + 0.5 * Math.min(1, Math.max(0, (y - 3.2) / 4.5)) + nz * 0.08; // darker underneath
    tc[i * 3] = shade; tc[i * 3 + 1] = shade; tc[i * 3 + 2] = shade;
  }
  crown.setAttribute("color", new THREE.BufferAttribute(tc, 3));
  crown.computeVertexNormals();
  const green = kind === "pine" ? "#2b4429" : kind === "palm" ? "#4f6b33" : "#3e5a2a";
  const leaf = new THREE.MeshStandardMaterial({ color: green, vertexColors: true, roughness: 1, map: surface("grass").map, normalMap: surface("rock").normalMap, normalScale: new THREE.Vector2(0.8, 0.8), side: kind === "palm" ? THREE.DoubleSide : THREE.FrontSide });
  k.planarUV(crown, 3);
  const bark = k.mat("dark", { color: "#4b3d30", surface: "wood" });
  const tm = new THREE.InstancedMesh(trunk, bark, spots.length), cm = new THREE.InstancedMesh(crown, leaf, spots.length);
  const col = new THREE.Color();
  spots.forEach(([x, z, sc], i) => {
    dummy.position.set(x, ground(x, z) - 0.15, z);
    dummy.rotation.set(0, (x * 12.9898 + z * 78.233) % 6.283, 0);
    dummy.scale.set(sc, sc * (0.85 + ((x * 3.7 + z * 1.3) % 1 + 1) % 1 * 0.3), sc);
    dummy.updateMatrix();
    tm.setMatrixAt(i, dummy.matrix);
    cm.setMatrixAt(i, dummy.matrix);
    const v = ((Math.sin(x * 5.3 + z * 9.1) * 43758.5453) % 1 + 1) % 1;
    cm.setColorAt(i, col.setRGB(0.75 + v * 0.5, 0.82 + v * 0.3, 0.7 + v * 0.35));
  });
  tm.castShadow = cm.castShadow = k.tier > 0;
  cm.receiveShadow = true;
  k.scene.add(tm, cm);
}

/** Far-off buildings with windows: x, z, width, depth, height, turn. Made up, for skylines. */
export function cityBlocks(k: Kit, list: number[][], tints: string[], y = 0) {
  const { THREE } = k;
  const geos: T.BufferGeometry[] = [];
  const c = new THREE.Color();
  list.forEach(([x, z, w, dp, h, ry], i) => {
    const g = new THREE.BoxGeometry(w, h, dp);
    const uv = g.attributes.uv;
    for (let v = 0; v < uv.count; v++) {
      const face = Math.floor(v / 4);
      const along = face < 2 ? dp : w;
      if (face === 2 || face === 3) uv.setXY(v, 0.01, 0.01); // roofs: one plain texel
      else uv.setXY(v, (uv.getX(v) * Math.max(3, Math.round(along / 3) * 3)) / 12, (uv.getY(v) * h) / 13.2);
    }
    g.rotateY(ry ?? 0);
    g.translate(x, y + h / 2, z);
    c.set(tints[i % tints.length]);
    const col = new Float32Array(uv.count * 3);
    for (let v = 0; v < uv.count; v++) { col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geos.push(g);
  });
  if (!geos.length) return;
  const f = facade();
  const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({
    vertexColors: true, map: f.map, roughnessMap: f.roughnessMap, roughness: 1,
    emissiveMap: f.emissiveMap, emissive: new THREE.Color("#ffffff"), emissiveIntensity: k.night ? 1.6 : 0,
  }));
  m.castShadow = m.receiveShadow = true;
  geos.forEach((g) => g.dispose());
  k.scene.add(m);
  return m;
}

export function buildReal(k: Kit, d: Osm, o: Opts): Real {
  const { THREE } = k;
  const { n, s } = d.e;
  const half = ((n - 1) * s) / 2;
  const H = new Float32Array(n * n);
  for (let i = 0; i < H.length; i++) H[i] = d.e.d[i] / 10;
  // the survey is a little noisy: one light blur
  const B = new Float32Array(H);
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    const c = j * n + i;
    B[c] = H[c] * 0.5 + (H[c - 1] + H[c + 1] + H[c - n] + H[c + n]) * 0.125;
  }
  H.set(B);
  let low = Infinity;
  for (const h of H) low = Math.min(low, h);
  const waterY = o.water === null ? null : low + o.water;
  for (const [rx, rz, rr, ry] of o.raise ?? []) {
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const dd = Math.hypot(-half + i * s - rx, -half + j * s - rz);
      if (dd < rr) {
        const t = Math.min(1, Math.max(0, (dd - rr * 0.45) / (rr * 0.55)));
        H[j * n + i] = ry * (1 - t * t) + H[j * n + i] * t * t;
      }
    }
  }
  // same two triangles per cell as the mesh below, so feet stay on the ground
  const ground = (x: number, z: number) => {
    const fx = Math.min(n - 1.001, Math.max(0, (x + half) / s)), fz = Math.min(n - 1.001, Math.max(0, (z + half) / s));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = H[j * n + i], b = H[(j + 1) * n + i], c = H[(j + 1) * n + i + 1], e = H[j * n + i + 1];
    return u + v <= 1 ? a + (e - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (e - c) * (1 - v);
  };
  const slope = (x: number, z: number) => Math.hypot(ground(x + 2, z) - ground(x - 2, z), ground(x, z + 2) - ground(x, z - 2)) / 4;

  // ---- ground: the surveyed square, with a skirt that runs off into the haze
  {
    const N = n + 2;
    const pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3), uv = new Float32Array(N * N * 2);
    const tint = o.land.map((c) => new THREE.Color(c));
    const cc = new THREE.Color();
    const woods = d.green.filter((g) => g.w === 1), lawns = d.green.filter((g) => g.w === 0), rocks = d.green.filter((g) => g.w === 2);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const gi = Math.min(n - 1, Math.max(0, i - 1)), gj = Math.min(n - 1, Math.max(0, j - 1));
      const out = i === 0 || j === 0 || i === N - 1 || j === N - 1;
      let x = -half + gi * s, z = -half + gj * s;
      if (i === 0) x -= 2600; if (i === N - 1) x += 2600;
      if (j === 0) z -= 2600; if (j === N - 1) z += 2600;
      const h = H[gj * n + gi];
      const q = (j * N + i) * 3;
      pos[q] = x; pos[q + 1] = h; pos[q + 2] = z;
      uv[(j * N + i) * 2] = x / 9; uv[(j * N + i) * 2 + 1] = z / 9;
      const gx = -half + gi * s, gz = -half + gj * s;
      const st = slope(gx, gz);
      let kind = 0;
      if (lawns.some((g) => inPoly(g.p, gx, gz))) kind = 1;
      if (woods.some((g) => inPoly(g.p, gx, gz))) kind = 2;
      if (rocks.some((g) => inPoly(g.p, gx, gz)) || st > (o.steep ?? 0.75)) kind = 3;
      cc.copy(tint[kind]);
      if (waterY !== null && h < waterY + 1.2) cc.lerp(new THREE.Color("#5b5346"), 0.7); // mud at the water's edge
      if (out) cc.lerp(new THREE.Color(k.night ? "#1c222b" : "#8f9a8a"), 0.35);
      const v = 0.92 + ((Math.sin(gx * 12.9898 + gz * 78.233) * 43758.5453) % 1) * 0.08;
      col[q] = cc.r * v; col[q + 1] = cc.g * v; col[q + 2] = cc.b * v;
    }
    const idx: number[] = [];
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      const a = j * N + i, b = (j + 1) * N + i, c = (j + 1) * N + i + 1, e = j * N + i + 1;
      idx.push(a, b, e, b, c, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const sf = surface("grass");
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: sf.map, normalMap: surface("rock").normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1, metalness: 0 }));
    m.receiveShadow = true;
    m.castShadow = true;
    k.scene.add(m);
  }
  if (waterY !== null) {
    const w = new THREE.PlaneGeometry(9000, 9000);
    w.rotateX(-Math.PI / 2);
    const wuv = w.attributes.uv;
    for (let i = 0; i < wuv.count; i++) wuv.setXY(i, wuv.getX(i) * 900, wuv.getY(i) * 900);
    const wm = new THREE.Mesh(w, k.mat("water", o.waterColor ? { color: o.waterColor } : {}));
    wm.position.y = waterY;
    wm.receiveShadow = true;
    k.scene.add(wm);
  }

  // ---- roads: ribbons that sit on the ground, with a wall under any edge left hanging
  type Seg = [number, number, number, number, number, number, number]; // x0 z0 y0 x1 z1 y1 halfWidth
  const CELL = 16;
  const segs = new Map<string, Seg[]>();
  const key = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  const road: number[] = [], roadUv: number[] = [], roadIdx: number[] = [];
  const path: number[] = [], pathUv: number[] = [], pathIdx: number[] = [];
  const wall: number[] = [], wallIdx: number[] = [];
  const byName = new Map<string, [number, number][][]>();
  for (const r of d.roads) {
    const line = pts(r.p);
    if (r.n) byName.set(r.n, [...(byName.get(r.n) ?? []), line]);
    if (r.t || o.skipRoad?.(r)) continue;
    // one point every 3 m
    const sm: [number, number][] = [line[0]];
    for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1], [bx, bz] = line[i];
      const len = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(len / 3));
      for (let q = 1; q <= steps; q++) sm.push([ax + ((bx - ax) * q) / steps, az + ((bz - az) * q) / steps]);
    }
    const hw = r.w / 2;
    const nrm = sm.map((p, i) => {
      const a = sm[Math.max(0, i - 1)], b = sm[Math.min(sm.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      return [-dz / l, dx / l] as [number, number];
    });
    let ys: number[];
    const deck = r.n ? o.decks?.[r.n] : undefined;
    if (deck && r.b) ys = sm.map((_, i) => deck[0] + ((deck[1] - deck[0]) * i) / (sm.length - 1));
    else {
      const raw = sm.map(([x, z], i) => Math.max(ground(x, z), ground(x + nrm[i][0] * hw, z + nrm[i][1] * hw), ground(x - nrm[i][0] * hw, z - nrm[i][1] * hw)));
      if (r.b) ys = raw.map((_, i) => raw[0] + ((raw[raw.length - 1] - raw[0]) * i) / (raw.length - 1));
      else ys = raw.map((_, i) => {
        let sum = 0, c = 0;
        for (let q = Math.max(0, i - 3); q <= Math.min(raw.length - 1, i + 3); q++) { sum += raw[q]; c++; }
        return Math.max(raw[i] - 0.4, sum / c);
      });
    }
    const lift = r.c ? 0.1 : 0.16;
    const P = r.c ? path : road, U = r.c ? pathUv : roadUv, I = r.c ? pathIdx : roadIdx;
    const base = P.length / 3;
    let run = 0;
    sm.forEach(([x, z], i) => {
      if (i) run += Math.hypot(x - sm[i - 1][0], z - sm[i - 1][1]);
      const y = ys[i] + lift;
      P.push(x + nrm[i][0] * hw, y, z + nrm[i][1] * hw, x - nrm[i][0] * hw, y, z - nrm[i][1] * hw);
      U.push(0, run / 4, r.w / 4, run / 4);
      if (i) {
        const a = base + (i - 1) * 2;
        I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        const sg: Seg = [sm[i - 1][0], sm[i - 1][1], ys[i - 1] + lift, x, z, y, hw];
        const seen = new Set<string>();
        for (const [qx, qz] of [[sg[0], sg[1]], [x, z]]) for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
          const kk = key(qx + ox * CELL, qz + oz * CELL);
          if (seen.has(kk)) continue;
          seen.add(kk);
          const list = segs.get(kk);
          if (list) list.push(sg);
          else segs.set(kk, [sg]);
        }
      }
      if (o.retain && !r.c && !r.b) {
        // a retaining wall wherever the edge of the road is off the ground
        for (const sgn of [1, -1]) {
          const ex = x + nrm[i][0] * hw * sgn, ez = z + nrm[i][1] * hw * sgn;
          wall.push(ex, y, ez, ex, Math.min(y, ground(ex + nrm[i][0] * sgn, ez + nrm[i][1] * sgn)) - 0.6, ez);
        }
        if (i) {
          const w0 = wall.length / 3 - 8;
          // two quads, one per side, each seen from outside
          wallIdx.push(w0, w0 + 1, w0 + 4, w0 + 1, w0 + 5, w0 + 4, w0 + 2, w0 + 6, w0 + 3, w0 + 3, w0 + 6, w0 + 7);
        }
      }
    });
  }
  const strip = (P: number[], U: number[], I: number[], mat: T.Material) => {
    if (!P.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    k.scene.add(m);
  };
  const roadMat = k.mat("road").clone() as T.MeshStandardMaterial;
  roadMat.polygonOffset = true;
  roadMat.polygonOffsetFactor = -2;
  roadMat.polygonOffsetUnits = -2;
  roadMat.side = THREE.DoubleSide;
  const pathMat = k.mat("ground", { color: "#a39c8c" }).clone() as T.MeshStandardMaterial;
  pathMat.polygonOffset = true;
  pathMat.polygonOffsetFactor = -3;
  pathMat.polygonOffsetUnits = -3;
  pathMat.side = THREE.DoubleSide;
  strip(road, roadUv, roadIdx, roadMat);
  strip(path, pathUv, pathIdx, pathMat);
  if (wall.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(wall, 3));
    g.setIndex(wallIdx);
    g.computeVertexNormals();
    k.planarUV(g, 4);
    const wm = k.mat("warm").clone() as T.MeshStandardMaterial;
    wm.side = THREE.DoubleSide;
    const m = new THREE.Mesh(g, wm);
    m.castShadow = m.receiveShadow = true;
    k.scene.add(m);
  }
  const roadY = (x: number, z: number) => {
    let best = -Infinity;
    for (const sg of segs.get(key(x, z)) ?? []) {
      const dx = sg[3] - sg[0], dz = sg[4] - sg[1], l2 = dx * dx + dz * dz || 1;
      const t = Math.min(1, Math.max(0, ((x - sg[0]) * dx + (z - sg[1]) * dz) / l2));
      if (Math.hypot(x - sg[0] - dx * t, z - sg[1] - dz * t) <= sg[6] + 0.3) best = Math.max(best, sg[2] + (sg[5] - sg[2]) * t);
    }
    return best;
  };

  // ---- buildings: real outlines, pushed up to their height
  const tintsW = o.walls.map((c) => new THREE.Color(c)), tintsR = o.roofs.map((c) => new THREE.Color(c));
  const wp: number[] = [], wn: number[] = [], wu: number[] = [], wc: number[] = [], wi: number[] = [];
  const rp: number[] = [], rc: number[] = [], ri: number[] = [];
  const BC = 24;
  const bgrid = new Map<string, number[][]>();
  d.b.forEach((f, bi) => {
    let poly = pts(f.p);
    let area = 0, cx = 0, cz = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
      area += x0 * z1 - x1 * z0;
      cx += x0; cz += z0;
    }
    cx /= poly.length; cz /= poly.length;
    if (Math.abs(area) < 16 || o.skipBuilding?.(cx, cz, f.h)) return;
    if (area > 0) poly = poly.reverse(); // one winding, so the walls face out
    let lo = Infinity, hi = -Infinity;
    for (const [x, z] of poly) { const g = ground(x, z); lo = Math.min(lo, g); hi = Math.max(hi, g); }
    const fh = o.heightOf ? o.heightOf(cx, cz, f.h) : f.h;
    const top = hi + fh, bot = lo - 1;
    const rr = ((Math.sin(bi * 12.9898 + cx * 0.37) * 43758.5453) % 1 + 1) % 1;
    const tw = tintsW[Math.floor(rr * tintsW.length)], tr = tintsR[Math.floor(((rr * 7.3) % 1) * tintsR.length)];
    let run = Math.floor(rr * 4) * 3;
    for (let i = 0; i < poly.length; i++) {
      const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.2) continue;
      const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      const v0 = wp.length / 3;
      // windows are 3 m apart and floors 3.3 m: a tile is 4 by 4 of them
      const span = Math.max(3, Math.round(len / 3) * 3);
      const u0 = run / 12, u1 = (run + span) / 12;
      wp.push(x0, bot, z0, x1, bot, z1, x1, top, z1, x0, top, z0);
      const vb = (bot - hi) / 13.2, vt = fh / 13.2;
      wu.push(u0, vb, u1, vb, u1, vt, u0, vt);
      for (let q = 0; q < 4; q++) { wn.push(nx, 0, nz); wc.push(tw.r, tw.g, tw.b); }
      wi.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
      run += span;
    }
    const r0 = rp.length / 3;
    for (const [x, z] of poly) { rp.push(x, top, z); rc.push(tr.r, tr.g, tr.b); }
    for (const t of THREE.ShapeUtils.triangulateShape(poly.map(([x, z]) => new THREE.Vector2(x, z)), [])) ri.push(r0 + t[0], r0 + t[2], r0 + t[1]);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let gx = Math.floor(x0 / BC); gx <= Math.floor(x1 / BC); gx++) for (let gz = Math.floor(z0 / BC); gz <= Math.floor(z1 / BC); gz++) {
      const kk = `${gx},${gz}`;
      const list = bgrid.get(kk);
      if (list) list.push(f.p);
      else bgrid.set(kk, [f.p]);
    }
  });
  if (wp.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(wp, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(wn, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(wu, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(wc, 3));
    g.setIndex(wi);
    const f = facade();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      vertexColors: true, map: f.map, roughnessMap: f.roughnessMap, roughness: 1, metalness: 0, side: THREE.DoubleSide,
      emissiveMap: f.emissiveMap, emissive: new THREE.Color("#ffffff"), emissiveIntensity: k.night ? 1.5 : 0, envMapIntensity: 1.1,
    }));
    m.castShadow = m.receiveShadow = true;
    k.scene.add(m);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.Float32BufferAttribute(rp, 3));
    rg.setAttribute("color", new THREE.Float32BufferAttribute(rc, 3));
    rg.setIndex(ri);
    rg.computeVertexNormals();
    k.planarUV(rg, 5);
    const sf = surface("stone");
    const rm = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ vertexColors: true, map: sf.map, normalMap: sf.normalMap, roughness: 0.9, side: THREE.DoubleSide }));
    rm.castShadow = rm.receiveShadow = true;
    k.scene.add(rm);
  }
  const blocked = (x: number, z: number) => {
    for (const p of bgrid.get(`${Math.floor(x / BC)},${Math.floor(z / BC)}`) ?? []) if (inPoly(p, x, z)) return true;
    return false;
  };

  // ---- trees
  const plant: Real["plant"] = (spots, kind = o.trees ?? "leaf") => plantTrees(k, ground, spots, kind);
  {
    const spots: [number, number, number][] = [];
    for (let i = 0; i < d.trees.length; i += 2) spots.push([d.trees[i], d.trees[i + 1], 0.8 + ((d.trees[i] * 7.7) % 1 + 1) % 1 * 0.5]);
    const every = o.treeEvery ?? 8;
    for (const g of d.green) {
      if (g.w !== 1) continue;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of pts(g.p)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      x0 = Math.max(x0, -half); x1 = Math.min(x1, half); z0 = Math.max(z0, -half); z1 = Math.min(z1, half);
      for (let x = x0; x < x1; x += every) for (let z = z0; z < z1; z += every) {
        const jx = x + (k.rand() - 0.5) * every * 1.6, jz = z + (k.rand() - 0.5) * every * 1.6;
        if (spots.length > (k.tier === 0 ? 900 : 2600)) break;
        if (!inPoly(g.p, jx, jz) || blocked(jx, jz) || roadY(jx, jz) > -1e9) continue;
        if (waterY !== null && ground(jx, jz) < waterY + 1.5) continue;
        spots.push([jx, jz, 0.7 + k.rand() * k.rand() * 1.6]);
      }
    }
    plant(spots);
  }

  return {
    ground,
    height: (x, z) => Math.max(ground(x, z), roadY(x, z)),
    blocked,
    waterY,
    road: (name) => byName.get(name) ?? [],
    plant,
    inPoly,
    slope,
  };
}
