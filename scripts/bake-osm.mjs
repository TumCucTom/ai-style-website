// One-off bake of real map data for the walk-around places on /world.
//
//   node scripts/bake-osm.mjs            # all places
//   node scripts/bake-osm.mjs bristol    # one
//
// Building footprints, roads and green areas come from OpenStreetMap through
// the public Overpass API (© OpenStreetMap contributors, ODbL). Ground heights
// come from the Open Topo Data public API (EU-DEM 25 m in Europe, USGS NED
// 10 m in the US). Everything is projected to metres around a centre point,
// clipped, simplified and written to components/world/osm/<id>.json, so the
// site needs no network for it at runtime.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "components", "world", "osm");
const UA = "world-bake/1.0 (static site build script)";

const PLACES = {
  // centred on the middle of the Clifton Suspension Bridge
  bristol: { lat: 51.45495, lon: -2.62785, r: 360, dem: "eudem25m", step: 18, h: 9 },
  // centred near the hairpin on Avenue des Spélugues
  monaco: { lat: 43.74055, lon: 7.4299, r: 260, dem: "eudem25m", step: 13, h: 21 },
  // centred on Killian Court, in front of the Great Dome
  mit: { lat: 42.35895, lon: -71.0918, r: 300, dem: "ned10m", step: 15, h: 19 },
};

const ROAD_W = { motorway: 11, trunk: 10, primary: 9, secondary: 8, tertiary: 7, unclassified: 6, residential: 6, living_street: 5, service: 3.6, pedestrian: 5, footway: 2, path: 1.6, steps: 2, cycleway: 2.2, track: 3 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(q) {
  for (const host of ["https://overpass.openstreetmap.fr/api/interpreter", "https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]) {
    try {
      const res = await fetch(host, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q), signal: AbortSignal.timeout(120000) });
      if (res.ok) return await res.json();
      console.warn(host, res.status);
    } catch (e) {
      console.warn(host, String(e));
    }
  }
  throw new Error("Overpass unreachable");
}

// Douglas–Peucker
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = 0, at = -1;
    const [ax, az] = pts[a], [bx, bz] = pts[b];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / len;
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const r1 = (n) => Math.round(n * 10) / 10;
const flat = (pts) => pts.flatMap(([x, z]) => [r1(x), r1(z)]);
const hash = (n) => { let x = (n | 0) * 2654435761; x ^= x >>> 15; return ((x >>> 0) % 1000) / 1000; };

async function bake(id) {
  const P = PLACES[id];
  const kx = Math.cos((P.lat * Math.PI) / 180) * 111320, kz = 110540;
  const xy = (lat, lon) => [(lon - P.lon) * kx, -(lat - P.lat) * kz];
  const R = P.r;
  const q = `[out:json][timeout:90];(
    way["building"](around:${R},${P.lat},${P.lon});
    relation["building"](around:${R},${P.lat},${P.lon});
    way["highway"](around:${R},${P.lat},${P.lon});
    way["natural"~"wood|scrub|grassland|water|bare_rock"](around:${R},${P.lat},${P.lon});
    relation["natural"="water"](around:${R},${P.lat},${P.lon});
    way["man_made"~"bridge|tower"](around:${R},${P.lat},${P.lon});
    way["landuse"~"forest|grass|meadow|recreation_ground|village_green"](around:${R},${P.lat},${P.lon});
    way["leisure"~"park|garden|pitch"](around:${R},${P.lat},${P.lon});
    relation["leisure"~"park|garden"](around:${R},${P.lat},${P.lon});
    relation["natural"="wood"](around:${R},${P.lat},${P.lon});
    node["natural"="tree"](around:${R},${P.lat},${P.lon});
  );out body geom;`;
  console.log(id, "overpass…");
  const data = await overpass(q);
  const inside = (pts) => pts.some(([x, z]) => Math.hypot(x, z) < R);
  const b = [], roads = [], green = [], water = [], trees = [], names = {};
  const kinds = {};
  const footprint = (geom, tags, eid) => {
    let pts = geom.map((g) => xy(g.lat, g.lon));
    if (pts.length < 4) return;
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    if (Math.hypot(cx, cz) > R) return;
    pts = simplify(pts.slice(0, -1), 0.7);
    if (pts.length < 3) return;
    let h = parseFloat(tags.height);
    if (!(h > 0)) h = tags["building:levels"] ? parseFloat(tags["building:levels"]) * 3.3 + 1.2 : 0;
    const known = h > 0;
    if (!known) h = P.h * (0.7 + hash(eid) * 0.6);
    if (["garage", "garages", "shed", "hut", "kiosk", "roof"].includes(tags.building)) h = Math.min(h, 3.5);
    b.push({ p: flat(pts), h: r1(h), ...(known ? { k: 1 } : {}) });
    if (tags.name) names[tags.name] = [r1(cx), r1(cz)];
  };
  for (const e of data.elements) {
    const t = e.tags ?? {};
    const kk = e.type + ":" + (t.building ? "building" : t.highway ? "highway" : t.natural || t.landuse || t.leisure || t.man_made || "?");
    kinds[kk] = (kinds[kk] ?? 0) + 1;
    if (e.type === "way" && t.man_made && e.geometry) {
      const pts = e.geometry.map((g) => xy(g.lat, g.lon));
      names[(t.name ?? t.man_made) + " (outline)"] = flat(simplify(pts.slice(0, -1), 0.5));
      continue;
    }
    if (e.type === "node" && t.natural === "tree") {
      const [x, z] = xy(e.lat, e.lon);
      if (Math.hypot(x, z) < R) trees.push(r1(x), r1(z));
    } else if (e.type === "way" && t.building && e.geometry) footprint(e.geometry, t, e.id);
    else if (e.type === "relation" && t.building) {
      for (const m of e.members ?? []) if (m.type === "way" && m.role !== "inner" && m.geometry) footprint(m.geometry, t, e.id + m.ref);
    } else if (e.type === "way" && t.highway && ROAD_W[t.highway] && e.geometry) {
      let pts = e.geometry.map((g) => xy(g.lat, g.lon));
      if (!inside(pts)) continue;
      pts = simplify(pts, 0.5).filter(([x, z]) => Math.hypot(x, z) < R * 1.25);
      if (pts.length < 2) continue;
      const road = { p: flat(pts), w: ROAD_W[t.highway] * (t.lanes > 2 ? 1.3 : 1), c: ["footway", "path", "steps", "cycleway", "pedestrian", "track"].includes(t.highway) ? 1 : 0 };
      if (t.bridge && t.bridge !== "no") road.b = 1;
      if (t.tunnel && t.tunnel !== "no") road.t = 1;
      if (t.name) road.n = t.name;
      roads.push(road);
    } else if (t.natural || t.landuse || t.leisure) {
      const rings = e.type === "way" ? [e.geometry] : (e.members ?? []).filter((m) => m.role !== "inner" && m.geometry).map((m) => m.geometry);
      for (const g of rings) {
        if (!g || g.length < 4) continue;
        const pts = simplify(g.map((p) => xy(p.lat, p.lon)).slice(0, -1), 2.5);
        if (pts.length < 3 || !inside(pts)) continue;
        if (t.natural === "water") water.push({ p: flat(pts) });
        else green.push({ p: flat(pts), w: t.natural === "wood" || t.landuse === "forest" || t.natural === "scrub" ? 1 : t.natural === "bare_rock" ? 2 : 0 });
      }
    }
  }

  // ground heights on a square grid
  const n = Math.floor((R * 2) / P.step) + 1;
  const half = ((n - 1) * P.step) / 2;
  const pts = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -half + i * P.step, z = -half + j * P.step;
    pts.push([P.lat - z / kz, P.lon + x / kx]);
  }
  const heights = [];
  console.log(id, "elevation…", pts.length, "points");
  for (let i = 0; i < pts.length; i += 100) {
    const chunk = pts.slice(i, i + 100).map(([la, lo]) => `${la.toFixed(6)},${lo.toFixed(6)}`).join("|");
    let ok = false;
    for (let tries = 0; tries < 4 && !ok; tries++) {
      const res = await fetch(`https://api.opentopodata.org/v1/${P.dem}?locations=${chunk}&interpolation=cubic`, { headers: { "User-Agent": UA } });
      if (res.ok) {
        const j = await res.json();
        heights.push(...j.results.map((r) => Math.round((r.elevation ?? 0) * 10)));
        ok = true;
      } else await sleep(2500);
      await sleep(1100);
    }
    if (!ok) throw new Error("elevation failed");
  }
  console.log(id, JSON.stringify(kinds));
  const out = { id, lat: P.lat, lon: P.lon, r: R, b, roads, green, water, trees, e: { n, s: P.step, d: heights }, names };
  const file = path.join(OUT, id + ".json");
  fs.writeFileSync(file, JSON.stringify(out));
  const hs = heights.map((h) => h / 10);
  console.log(id, "→", (fs.statSync(file).size / 1024).toFixed(0), "KB;", b.length, "buildings (", b.filter((x) => x.k).length, "with real heights ),", roads.length, "roads,", green.length, "green,", water.length, "water,", trees.length / 2, "trees; ground", Math.min(...hs).toFixed(1), "to", Math.max(...hs).toFixed(1), "m");
}

fs.mkdirSync(OUT, { recursive: true });
for (const id of process.argv[2] ? [process.argv[2]] : Object.keys(PLACES)) await bake(id);
