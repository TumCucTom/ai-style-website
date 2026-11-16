// The globe for /world. Imported dynamically, so three.js is only
// downloaded on this route.
import * as THREE from "three";
import { LAND } from "@/app/world/land";
import type { Stop } from "./stops";

const RAD = Math.PI / 180;

function onSphere(lat: number, lon: number, r = 1) {
  const phi = lat * RAD;
  const lam = lon * RAD;
  return new THREE.Vector3(Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam)).multiplyScalar(r);
}

function slerp(a: THREE.Vector3, b: THREE.Vector3, t: number) {
  const w = a.angleTo(b);
  if (w < 1e-5) return a.clone();
  const s = Math.sin(w);
  return a
    .clone()
    .multiplyScalar(Math.sin((1 - t) * w) / s)
    .add(b.clone().multiplyScalar(Math.sin(t * w) / s));
}

/** Evenly spread points on the sphere, kept where the baked mask says land. */
function landDots(count: number) {
  const raw = atob(LAND.bits);
  const bit = (i: number) => (raw.charCodeAt(i >> 3) >> (i & 7)) & 1;
  const out: number[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const lat = Math.asin(y) / RAD;
    let lon = ((i * golden) / RAD) % 360;
    if (lon > 180) lon -= 360;
    const px = Math.min(LAND.w - 1, Math.floor(((lon + 180) / 360) * LAND.w));
    const py = Math.min(LAND.h - 1, Math.floor(((90 - lat) / 180) * LAND.h));
    if (bit(py * LAND.w + px)) {
      const v = onSphere(lat, lon);
      out.push(v.x, v.y, v.z);
    }
  }
  return new Float32Array(out);
}

const DOT_VS = `
uniform float uSize;
uniform float uMax;
varying float vFace;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // fade dots as they turn toward the limb
  vFace = dot(normalize(normalMatrix * position), normalize(-mv.xyz));
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(uSize / -mv.z, uMax);
}`;
const DOT_FS = `
uniform vec3 uColor;
uniform float uAlpha;
varying float vFace;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(uColor, uAlpha * smoothstep(0.5, 0.36, d) * smoothstep(0.0, 0.35, vFace));
}`;
const AIR_VS = `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const AIR_FS = `
uniform vec3 uColor;
uniform float uPower;
varying vec3 vN;
varying vec3 vV;
void main() {
  // back faces of a shell 1.16 radii out: zero at the shell's own edge,
  // full where the line of sight grazes the planet
  float rim = pow(clamp(-dot(vN, vV) / 0.507, 0.0, 1.0), 2.2);
  gl_FragColor = vec4(uColor, rim * uPower);
}`;

export type Scene = {
  /** 0 is the title shot; k is stop k (1-based). Fractions are in flight. */
  setTarget(f: number, jump?: boolean): void;
  /** Drop the camera onto the stop you are at (and come back up). */
  dive(on: boolean): void;
  /** Stop drawing while a place is open on top. */
  pause(on: boolean): void;
  /** Where stop i's pin is on screen, in CSS pixels; null if it faces away. */
  pinAt(i: number): { x: number; y: number } | null;
  dispose(): void;
};

export function createScene(
  canvas: HTMLCanvasElement,
  stops: Stop[],
  onFrame: (f: number) => void,
): Scene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
  const globe = new THREE.Group();
  scene.add(globe);

  // ---- the planet
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.994, 96, 64), new THREE.MeshBasicMaterial());
  globe.add(body);

  const sampled = innerWidth < 700 ? 70000 : 120000;
  const spacing = Math.sqrt((4 * Math.PI) / sampled); // radians between neighbouring dots
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute("position", new THREE.BufferAttribute(landDots(sampled), 3));
  const dotMat = new THREE.ShaderMaterial({
    vertexShader: DOT_VS,
    fragmentShader: DOT_FS,
    transparent: true,
    depthWrite: false,
    uniforms: { uSize: { value: 10 }, uMax: { value: 1e4 }, uColor: { value: new THREE.Color() }, uAlpha: { value: 0.9 } },
  });
  globe.add(new THREE.Points(dotGeo, dotMat));

  const airMat = new THREE.ShaderMaterial({
    vertexShader: AIR_VS,
    fragmentShader: AIR_FS,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color() }, uPower: { value: 1 } },
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.16, 64, 48), airMat));

  // ---- stars (night only)
  const starPos = new Float32Array(1800 * 3);
  for (let i = 0; i < 1800; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(60 + Math.random() * 30);
    starPos.set([v.x, v.y, v.z], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false });
  scene.add(new THREE.Points(starGeo, starMat));

  // ---- the route: a faint arc for every leg, a bright one drawn as it is flown
  const P = stops.map((s) => onSphere(s.lat, s.lon));
  const SEG = 96;
  const faintMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.16, depthWrite: false });
  const brightMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 1, depthWrite: false });
  const arcs: { pts: THREE.Vector3[]; bright: THREE.Line }[] = [];
  for (let i = 0; i < P.length - 1; i++) {
    const w = P[i].angleTo(P[i + 1]);
    const lift = 0.012 + 0.2 * (w / Math.PI);
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG;
      pts.push(slerp(P[i], P[i + 1], t).multiplyScalar(1.003 + lift * Math.sin(Math.PI * t)));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    globe.add(new THREE.Line(geo, faintMat));
    const bright = new THREE.Line(geo.clone(), brightMat);
    bright.geometry.setDrawRange(0, 0);
    globe.add(bright);
    arcs.push({ pts, bright });
  }

  // ---- pins, the craft, and a beacon on the stop you are at
  const pinGeo = new THREE.BufferGeometry().setFromPoints(P.map((p) => p.clone().multiplyScalar(1.004)));
  const pinMat = new THREE.ShaderMaterial({
    vertexShader: DOT_VS,
    fragmentShader: DOT_FS,
    transparent: true,
    depthWrite: false,
    uniforms: { uSize: { value: 30 }, uMax: { value: 16 }, uColor: { value: new THREE.Color() }, uAlpha: { value: 1 } },
  });
  globe.add(new THREE.Points(pinGeo, pinMat));

  const craftGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]);
  const craftMat = new THREE.ShaderMaterial({
    vertexShader: DOT_VS.replace("vFace = dot(normalize(normalMatrix * position), normalize(-mv.xyz));", "vFace = 1.0;"),
    fragmentShader: DOT_FS,
    transparent: true,
    depthWrite: false,
    uniforms: { uSize: { value: 46 }, uMax: { value: 22 }, uColor: { value: new THREE.Color() }, uAlpha: { value: 1 } },
  });
  const craft = new THREE.Points(craftGeo, craftMat);
  craft.frustumCulled = false;
  globe.add(craft);

  const ringMat = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), ringMat);
  globe.add(ring);
  const beamMat = new THREE.LineBasicMaterial({ transparent: true, depthWrite: false });
  const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]), beamMat);
  globe.add(beam);

  // ---- theme, read from the site's tokens
  const css = (name: string) => {
    const [r, g, b] = getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(/\s+/).map(Number);
    return new THREE.Color(r / 255, g / 255, b / 255);
  };
  let night = true;
  function theme() {
    night = !document.documentElement.classList.contains("light");
    const bg = css("--bg-rgb");
    const ink = css("--ink-rgb");
    const accent = css("--accent-rgb");
    const cool = css("--cool-rgb");
    renderer.setClearColor(bg);
    (body.material as THREE.MeshBasicMaterial).color.copy(bg).lerp(night ? cool : ink, night ? 0.07 : 0.035);
    dotMat.uniforms.uColor.value.copy(night ? ink.clone().lerp(cool, 0.25) : ink);
    dotMat.uniforms.uAlpha.value = night ? 0.85 : 0.8;
    dotMat.blending = night ? THREE.AdditiveBlending : THREE.NormalBlending;
    airMat.uniforms.uColor.value.copy(cool);
    airMat.uniforms.uPower.value = night ? 0.9 : 0.28;
    airMat.blending = night ? THREE.AdditiveBlending : THREE.NormalBlending;
    starMat.color.copy(ink);
    starMat.opacity = night ? 0.55 : 0;
    faintMat.color.copy(ink);
    brightMat.color.copy(accent);
    pinMat.uniforms.uColor.value.copy(accent);
    craftMat.uniforms.uColor.value.copy(night ? new THREE.Color(1, 1, 1) : accent);
    ringMat.color.copy(accent);
    beamMat.color.copy(accent);
  }
  theme();
  const themeObs = new MutationObserver(theme);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  // ---- size
  let W = 1;
  let H = 1;
  let dpr = 1;
  function resize() {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    dpr = Math.min(2, devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // ---- the camera: a shot for the title and one for each stop
  type Shot = { dir: THREE.Vector3; alt: number; tilt: number };
  const shots: Shot[] = [
    { dir: onSphere(24, -24), alt: 3.5, tilt: 0 },
    ...stops.map((s, i) => ({ dir: P[i], alt: s.alt, tilt: s.alt < 1.45 ? 0.42 : s.alt < 1.6 ? 0.34 : 0.22 })),
  ];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  let target = 0;
  let f = 0;
  let spin = 0;
  let diveTo = 0;
  let diveF = 0;
  let paused = false;
  const NORTH = new THREE.Vector3(0, 1, 0);

  function frame(now: number, dt: number) {
    f = reduced ? Math.round(target) : f + (target - f) * (1 - Math.exp(-dt * 3.2));
    if (Math.abs(target - f) < 0.0004) f = target;
    const i = Math.min(shots.length - 2, Math.floor(f));
    const t = ease(Math.min(1, Math.max(0, f - i)));
    const a = shots[i];
    const b = shots[i + 1];
    const w = a.dir.angleTo(b.dir);
    const dir = slerp(a.dir, b.dir, t).normalize();
    // climb on the way: a hop across Europe barely leaves the ground,
    // the Atlantic takes you most of the way to orbit
    const climb = i === 0 ? 0 : Math.min(1.5, w * 1.15) * Math.sin(Math.PI * t);
    diveF = reduced ? diveTo : diveF + (diveTo - diveF) * (1 - Math.exp(-dt * 4.5));
    const down = ease(Math.min(1, diveF));
    const alt = (a.alt + (b.alt - a.alt) * t + climb) * (1 - down) + 1.012 * down;
    const tilt = (a.tilt + (b.tilt - a.tilt) * t) * (1 - 0.75 * Math.sin(Math.PI * t) * Math.min(1, w * 2)) * (1 - down);

    // slow spin while the title is up; unwound (the short way) on departure
    if (f < 0.01 && !reduced) spin += dt * 0.05;
    if (i === 0) {
      const wrapped = Math.atan2(Math.sin(spin), Math.cos(spin));
      dir.applyAxisAngle(NORTH, wrapped * (1 - t));
    }
    // sit south of the target and look north across it, so the horizon shows
    const east = new THREE.Vector3().crossVectors(NORTH, dir).normalize();
    const south = new THREE.Vector3().crossVectors(east, dir).normalize();
    const pos = dir.clone().multiplyScalar(Math.cos(tilt)).add(south.multiplyScalar(Math.sin(tilt))).multiplyScalar(alt);
    const q = Math.min(1, tilt / 0.2); // 0: looking at the centre, north up. 1: low orbit, horizon level
    camera.position.copy(pos);
    camera.up.copy(NORTH).lerp(dir, q).normalize();
    camera.lookAt(dir.clone().multiplyScalar(0.99 * q));

    // leave room for the card: push the planet right on wide screens, up on narrow ones
    const settle = Math.min(1, f) * (1 - down);
    if (W > 820) camera.setViewOffset(W, H, -W * 0.17 * settle, 0, W, H);
    else camera.setViewOffset(W, H, 0, H * 0.17 * settle, W, H);

    // a dot is a fixed share of the gap to its neighbour at any zoom:
    // screen px per world unit at distance d is H / (2 d tan(fov/2))
    const perUnit = (H * dpr) / (2 * Math.tan((camera.fov * RAD) / 2));
    dotMat.uniforms.uSize.value = spacing * perUnit * 0.5;
    pinMat.uniforms.uSize.value = dotMat.uniforms.uSize.value * 3.4;
    pinMat.uniforms.uMax.value = 15 * dpr;
    craftMat.uniforms.uSize.value = dotMat.uniforms.uSize.value * 5;
    craftMat.uniforms.uMax.value = 20 * dpr;

    // route progress
    const leg = f - 1; // leg k runs from stop k to stop k+1
    arcs.forEach((arc, k) => {
      const done = leg >= k + 1 ? 1 : leg > k ? ease(leg - k) : 0;
      arc.bright.geometry.setDrawRange(0, Math.round(done * SEG) + (done > 0 ? 1 : 0));
    });
    const k = Math.floor(leg);
    const flying = leg > 0 && leg - k > 0.002 && k < arcs.length;
    craft.visible = flying;
    if (flying) {
      const u = ease(leg - k) * SEG;
      const j = Math.min(SEG - 1, Math.floor(u));
      const p = arcs[k].pts[j].clone().lerp(arcs[k].pts[j + 1], u - j);
      craftGeo.attributes.position.setXYZ(0, p.x, p.y, p.z);
      craftGeo.attributes.position.needsUpdate = true;
    }

    // beacon on the stop you are at (or arriving at)
    const at = Math.round(f) - 1;
    const near = 1 - Math.min(1, Math.abs(f - Math.round(f)) * 4);
    const show = at >= 0 && near > 0;
    ring.visible = beam.visible = show;
    if (show) {
      const p = P[at];
      const pulse = (now * 0.0006) % 1;
      ring.position.copy(p).multiplyScalar(1.004);
      ring.lookAt(p.clone().multiplyScalar(2));
      ring.scale.setScalar(0.006 + pulse * 0.032 * (stops[at].alt / 1.4));
      ringMat.opacity = (1 - pulse) * near;
      beam.position.copy(p);
      beam.lookAt(p.clone().multiplyScalar(2));
      beam.scale.setScalar(0.05 * near * (stops[at].alt / 1.4));
      beamMat.opacity = near;
    }

    renderer.render(scene, camera);
    onFrame(f);
  }

  let raf = 0;
  let last = performance.now();
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (paused) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(now, dt);
  };
  const onVis = () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };
  document.addEventListener("visibilitychange", onVis);
  frame(performance.now(), 0); // paint before the first animation frame
  raf = requestAnimationFrame(loop);

  return {
    setTarget(v, jump) {
      target = Math.max(0, Math.min(shots.length - 1, v));
      if (jump) f = target;
    },
    dive(on) {
      diveTo = on ? 1 : 0;
    },
    pause(on) {
      paused = on;
      last = performance.now();
    },
    pinAt(i) {
      if (!P[i]) return null;
      if (P[i].dot(camera.position) < 1) return null; // over the horizon
      const v = P[i].clone().project(camera);
      return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
    },
    dispose() {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      themeObs.disconnect();
      ro.disconnect();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
      renderer.dispose();
    },
  };
}
