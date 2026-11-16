// Walking around inside a place. One three.js scene per stop, built in code
// (see places.ts), on its own canvas so the globe can sit paused behind.
//
// The look: physically based materials with procedural surface detail, a real
// sky that also lights the scene, a sun (or moon) with soft shadows, haze,
// filmic tone mapping, and a little bloom on the things that glow. The paper
// theme is daytime; the night theme is an actual night.
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { PLACES, type Built, type Exhibit, type Kit, type Tone } from "./places";
import { surface, waterNormals, disposeTextures, type Surface } from "./tex";

export type Walk = {
  /** hold to walk forward (the on-screen button on phones) */
  forward(on: boolean): void;
  /** release: also give the GL context back (false when the same canvas is about to be reused) */
  dispose(release?: boolean): void;
};

// Albedos, not theme colours: the light does the rest.
const PAL: Record<Tone, string> = {
  sky: "#9fc4e8", ground: "#8d8778", stone: "#8f8b83", dark: "#34373d", light: "#e4dfd4", water: "#12445c",
  grass: "#5f7f3b", accent: "#e8501f", cool: "#2f9be6", road: "#2f3032", snow: "#f3f5f8", warm: "#c8b28c",
};
const SURF: Record<Tone, Surface> = {
  sky: "plaster", ground: "paving", stone: "stone", dark: "metal", light: "plaster", water: "plaster",
  grass: "grass", accent: "plaster", cool: "plaster", road: "asphalt", snow: "snow", warm: "ashlar",
};

const EYE = 1.7;
const REACH = 3.4;

/** UVs from position, so a texture covers the same number of metres on every face. */
export function planarUV(geo: THREE.BufferGeometry, tile: number) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!pos || !nor) return geo;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u: number, v: number;
    if (ay >= ax && ay >= az) [u, v] = [pos.getX(i), pos.getZ(i)];
    else if (ax >= az) [u, v] = [pos.getZ(i), pos.getY(i)];
    else [u, v] = [pos.getX(i), pos.getY(i)];
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

const FINAL = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.32 }, uGrain: { value: 0.035 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVig, uGrain; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVig * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      c.rgb += (h(vUv * vec2(1920.0, 1080.0)) - 0.5) * uGrain;
      gl_FragColor = c;
    }`,
};

const NIGHT_SKY = {
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
  fragmentShader: `varying vec3 vDir; uniform vec3 uMoon;
    float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    void main(){
      vec3 d = normalize(vDir);
      float up = max(d.y, 0.0);
      vec3 col = mix(vec3(0.085, 0.10, 0.16), vec3(0.012, 0.016, 0.035), pow(up, 0.45));
      col += vec3(0.11, 0.075, 0.04) * pow(1.0 - up, 9.0);            // town glow on the horizon
      vec3 g = floor(d * 420.0);
      float s = h(g);
      col += step(0.9988, s) * (0.3 + 0.7 * h(g + 3.1)) * smoothstep(0.0, 0.25, d.y);
      float m = dot(d, normalize(uMoon));
      col += vec3(0.95, 0.97, 1.0) * smoothstep(0.9996, 0.99975, m) * 3.0;
      col += vec3(0.16, 0.19, 0.27) * pow(max(m, 0.0), 220.0);
      if (d.y < 0.0) col = mix(col, vec3(0.02, 0.025, 0.035), smoothstep(0.0, -0.08, d.y));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createWalk(canvas: HTMLCanvasElement, id: string, onNear: (e: Exhibit | null) => void): Walk | null {
  const build = PLACES[id];
  if (!build) return null;
  const night = !document.documentElement.classList.contains("light");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = matchMedia("(pointer: coarse)").matches || Math.min(innerWidth, innerHeight) < 600;
  // 0: phones (no shadows, no post) · 1: shadows · 2: shadows and post
  let tier = small ? 0 : 2;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = night ? 1.25 : 0.6;
  renderer.shadowMap.enabled = tier > 0;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(66, 1, 0.15, 6000);

  // ---- sky, and the light that comes from it
  const sunDir = new THREE.Vector3();
  const setSun = (az: number, el: number) => sunDir.setFromSphericalCoords(1, Math.PI / 2 - el, az);
  setSun(night ? 2.2 : 2.5, night ? 0.62 : 0.6);
  let skyMesh: THREE.Mesh;
  const horizon = new THREE.Color(night ? "#0d1119" : "#c3d3e2");
  if (night) {
    skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({ ...NIGHT_SKY, uniforms: { uMoon: { value: sunDir } }, side: THREE.BackSide, depthWrite: false }));
    skyMesh.scale.setScalar(4000);
  } else {
    const sky = new Sky();
    sky.scale.setScalar(4000);
    const u = sky.material.uniforms;
    u.turbidity.value = 3.2;
    u.rayleigh.value = 1.1;
    u.mieCoefficient.value = 0.003;
    u.mieDirectionalG.value = 0.8;
    u.sunPosition.value = sunDir;
    skyMesh = sky;
  }
  skyMesh.frustumCulled = false;
  scene.add(skyMesh);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTex: THREE.Texture | null = null;
  const bakeEnv = () => {
    const env = new THREE.Scene();
    const copy = skyMesh.clone();
    env.add(copy);
    envTex?.dispose();
    const prevExposure = renderer.toneMappingExposure;
    renderer.toneMappingExposure = 1;
    // the sun itself is the directional light; leave its disc out of the
    // fill light, or the fill drowns the shadows
    const disc = (skyMesh.material as THREE.ShaderMaterial).uniforms.showSunDisc;
    if (disc) disc.value = 0;
    envTex = pmrem.fromScene(env, 0.02, 1, 5000).texture;
    if (disc) disc.value = 1;
    renderer.toneMappingExposure = prevExposure;
    scene.environment = envTex;
    scene.environmentIntensity = night ? 0.55 : 0.5;
  };
  const sun = new THREE.DirectionalLight(night ? "#a9c0ff" : "#fff0dc", night ? 0.9 : 5.2);
  sun.castShadow = tier > 0;
  sun.shadow.mapSize.setScalar(tier > 1 ? 4096 : 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.25;
  sun.shadow.radius = 3;
  const sc = sun.shadow.camera;
  const SH = 120;
  sc.left = -SH; sc.right = SH; sc.top = SH; sc.bottom = -SH; sc.near = 1; sc.far = 700;
  sc.updateProjectionMatrix();
  scene.add(sun, sun.target);

  // ---- the kit the places are built with
  const mats = new Map<string, THREE.Material>();
  const waters: THREE.MeshStandardMaterial[] = [];
  const waterTime = { value: 0 };
  const mat: Kit["mat"] = (tone, opts = {}) => {
    const key = `${tone}|${opts.glow ? 1 : 0}|${opts.alpha ?? 1}|${opts.surface ?? ""}|${opts.color ?? ""}`;
    let m = mats.get(key);
    if (m) return m;
    const color = new THREE.Color(opts.color ?? PAL[tone]);
    if (opts.glow) {
      // brighter than white, so bloom picks it up
      const b = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(night ? 2.6 : 1.5), transparent: opts.alpha !== undefined, opacity: opts.alpha ?? 1 });
      b.toneMapped = true;
      m = b;
    } else if (tone === "water") {
      const w = new THREE.MeshStandardMaterial({
        color: opts.color ? color.clone().multiplyScalar(night ? 0.25 : 1) : night ? "#07151f" : PAL.water, roughness: 0.05, metalness: 0.02, normalMap: waterNormals(),
        normalScale: new THREE.Vector2(0.32, 0.32), envMapIntensity: night ? 1.8 : 1.5, transparent: true, opacity: 0.97,
      });
      // two layers of ripples at different sizes, drifting apart, so the tiling doesn't show
      w.onBeforeCompile = (sh) => {
        sh.uniforms.uT = waterTime;
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform float uT;")
          .replace("texture2D( normalMap, vNormalMapUv )", "mix( texture2D( normalMap, vNormalMapUv + vec2( uT * 0.011, uT * 0.017 ) ), texture2D( normalMap, vNormalMapUv * 0.237 + vec2( -uT * 0.006, uT * 0.004 ) ), 0.5 )");
      };
      waters.push(w);
      m = w;
    } else {
      const s = surface(opts.surface ?? SURF[tone]);
      m = new THREE.MeshStandardMaterial({
        color, map: s.map, normalMap: s.normalMap, roughnessMap: s.roughnessMap, roughness: s.roughness, metalness: s.metalness,
        transparent: opts.alpha !== undefined, opacity: opts.alpha ?? 1,
      });
      (m as THREE.MeshStandardMaterial).normalScale.setScalar(s.bump);
    }
    mats.set(key, m);
    return m;
  };
  const tileOf = (tone: Tone, s?: Surface) => (tone === "water" ? 9 : surface(s ?? SURF[tone]).tile);
  // builders can move the origin, to set a group of things down somewhere
  const origin = new THREE.Vector3();
  const put = <T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0, ry = 0) => {
    o.position.set(x + origin.x, y + origin.y, z + origin.z);
    o.rotation.y = ry;
    scene.add(o);
    return o;
  };
  const solid = <M extends THREE.Mesh | THREE.InstancedMesh>(m: M, cast = true) => {
    m.castShadow = cast;
    m.receiveShadow = true;
    return m;
  };
  let heightAt: (x: number, z: number) => number = () => 0;
  const kit: Kit = {
    THREE,
    scene,
    night,
    tier,
    origin,
    mat,
    put,
    solid,
    planarUV,
    box: (w, h, d, tone, x, y, z, ry = 0) => put(solid(new THREE.Mesh(planarUV(new THREE.BoxGeometry(w, h, d), tileOf(tone)), mat(tone))), x, y, z, ry),
    cyl: (r, h, tone, x, y, z, seg = 20, rTop = r) => put(solid(new THREE.Mesh(planarUV(new THREE.CylinderGeometry(rTop, r, h, Math.max(seg, 16)), tileOf(tone)), mat(tone))), x, y, z),
    ball: (r, tone, x, y, z, glow = false) => put(solid(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 3), mat(tone, { glow })), !glow), x, y, z),
    flat: (w, d, tone, x, y, z, ry = 0) => {
      const g = new THREE.PlaneGeometry(w, d, 1, 1);
      g.rotateX(-Math.PI / 2);
      const m = solid(new THREE.Mesh(planarUV(g, tileOf(tone)), mat(tone)), false);
      m.rotation.y = ry;
      m.position.set(x + origin.x, y + origin.y, z + origin.z);
      scene.add(m);
      return m;
    },
    disc: (r, tone, x, y, z) => {
      const g = new THREE.CircleGeometry(r, 64);
      g.rotateX(-Math.PI / 2);
      const m = solid(new THREE.Mesh(planarUV(g, tileOf(tone)), mat(tone)), false);
      m.position.set(x + origin.x, y + origin.y, z + origin.z);
      scene.add(m);
      return m;
    },
    prism: (w, h, d, tone, x, y, z, ry = 0) => {
      const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
      const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
      g.translate(0, 0, -d / 2);
      return put(solid(new THREE.Mesh(planarUV(g, tileOf(tone)), mat(tone))), x, y, z, ry);
    },
    tube: (pts, r, tone) => {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
      const m = solid(new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 8, r, 8), mat(tone)));
      m.position.copy(origin);
      scene.add(m);
      return m;
    },
    lines: (pairs, tone) => {
      const g = new THREE.BufferGeometry().setFromPoints(pairs.map((p) => new THREE.Vector3(...p)));
      const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: PAL[tone] }));
      l.position.copy(origin);
      scene.add(l);
      return l;
    },
    sign: (rows, w, h, x, y, z, ry = 0, tone = "dark") => {
      const c = document.createElement("canvas");
      c.width = 1024;
      c.height = Math.round((1024 * h) / w);
      const g = c.getContext("2d")!;
      g.fillStyle = tone === "light" || tone === "snow" ? "#efece4" : "#15181d";
      g.fillRect(0, 0, c.width, c.height);
      const rowH = c.height / rows.length;
      rows.forEach((r, i) => {
        const text = typeof r === "string" ? r : r.t;
        const big = typeof r === "string" ? false : !!r.big;
        const hot = typeof r === "string" ? false : !!r.hot;
        let px = rowH * (big ? 0.78 : 0.5);
        const font = (p: number) => `${big ? 800 : 600} ${p}px ui-monospace, Menlo, Consolas, monospace`;
        g.font = font(px);
        const tw = g.measureText(text).width;
        if (tw > c.width * 0.9) {
          px *= (c.width * 0.9) / tw;
          g.font = font(px);
        }
        g.fillStyle = hot ? "#ff6a36" : tone === "light" || tone === "snow" ? "#23262b" : "#f1eee6";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(text, c.width / 2, rowH * (i + 0.52));
      });
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      // a board that takes light by day and is lit from inside at night
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color("#ffffff"), emissiveIntensity: night ? 0.9 : 0.25, roughness: 0.6, side: THREE.DoubleSide }),
      );
      m.receiveShadow = true;
      return put(m, x, y, z, ry);
    },
    many: (geo, tone, spots, glow = false) => {
      if (!glow) planarUV(geo, tileOf(tone));
      const m = solid(new THREE.InstancedMesh(geo, mat(tone, { glow }), spots.length), !glow);
      const o = new THREE.Object3D();
      spots.forEach((s, i) => {
        o.position.set(s[0], s[1], s[2]);
        o.rotation.set(0, s[3] ?? 0, 0);
        o.scale.setScalar(s[4] ?? 1);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      });
      m.position.copy(origin);
      scene.add(m);
      return m;
    },
    lamp: (x, y, z, color = "#ffd9a3", power = 30, always = false) => {
      // a point of light at night (or always, indoors); by day it is just the fitting
      if (!night && !always) return;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(4) }));
      x += origin.x; y += origin.y; z += origin.z;
      bulb.position.set(x, y, z);
      scene.add(bulb);
      if (tier > 0 && lamps < (tier > 1 ? 10 : 4)) {
        lamps++;
        const p = new THREE.PointLight(color, power, 26, 1.8);
        p.position.set(x, y, z);
        scene.add(p);
      }
    },
    rand: (() => {
      let a = id.length * 7919 + 13;
      return () => {
        a = (a * 1664525 + 1013904223) | 0;
        return ((a >>> 8) & 0xffff) / 0xffff;
      };
    })(),
  };
  let lamps = 0;

  // ---- you
  let place: Built | null = null;
  let x = 0, z = 0, yaw = 0, pitch = -0.04;
  let fwd = false;
  let near: Exhibit | null = null;
  let walked = 0;
  let dead = false;
  const keys = new Set<string>();
  const gems: THREE.Mesh[] = [];
  const rings: THREE.Mesh[] = [];

  // ---- post
  let composer: EffectComposer | null = null;
  let finalPass: ShaderPass | null = null;
  const makeComposer = () => {
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), night ? 0.45 : 0.035, 0.5, night ? 1.0 : 8));
    composer.addPass(new OutputPass());
    finalPass = new ShaderPass(FINAL);
    composer.addPass(finalPass);
  };
  if (tier > 1) makeComposer();

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const pr = Math.min(tier === 0 ? 1.5 : tier === 2 ? 1.5 : 2, devicePixelRatio || 1);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer?.setPixelRatio(pr);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = w < h ? 78 : 64;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  function finish(p: Built) {
    place = p;
    heightAt = p.height ?? (() => 0);
    if (p.sun) setSun(p.sun[0], p.sun[1]);
    bakeEnv();
    scene.fog = new THREE.FogExp2(horizon, p.fog ?? 1.15 / (p.bound * (p.far ?? 3.2)));
    if (p.env !== undefined) scene.environmentIntensity *= p.env;
    if (p.exposure !== undefined) renderer.toneMappingExposure *= p.exposure;
    if (!night) {
      // match the haze to the sky near the horizon
      horizon.set("#cbd8e3");
    }
    if (!p.ownGround) {
      const g = new THREE.CircleGeometry(p.bound * 8, 64);
      g.rotateX(-Math.PI / 2);
      const tone = p.ground ?? "ground";
      const ground = solid(new THREE.Mesh(planarUV(g, tileOf(tone)), mat(tone)), false);
      ground.position.y = -0.02;
      scene.add(ground);
    }
    // exhibits: a post with something bright on top
    p.exhibits.forEach((e) => {
      const y = heightAt(e.x, e.z);
      kit.cyl(0.05, 1.15, "dark", e.x, y + 0.575, e.z, 8);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), mat("accent", { glow: true }));
      gem.position.set(e.x, y + 1.5, e.z);
      scene.add(gem);
      gems.push(gem);
      const ring = new THREE.Mesh(new THREE.RingGeometry(REACH - 0.08, REACH, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.accent).multiplyScalar(1.6), transparent: true, opacity: 0.35, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(e.x, y + 0.06, e.z);
      scene.add(ring);
      rings.push(ring);
    });
    x = p.spawn[0];
    z = p.spawn[1];
    yaw = p.spawn[2];
  }

  let slow = 0, frames = 0;
  function step(dt: number, t: number) {
    const p = place;
    if (!p) return;
    const k = (c: string) => keys.has(c);
    const turn = (k("arrowleft") ? 1 : 0) - (k("arrowright") ? 1 : 0);
    yaw += turn * dt * 1.9;
    const ahead = (k("w") || k("arrowup") || fwd ? 1 : 0) - (k("s") || k("arrowdown") ? 1 : 0);
    const side = (k("d") ? 1 : 0) - (k("a") ? 1 : 0);
    const pace = (p.speed ?? 4.6) * (k("shift") ? 2.4 : 1);
    const sx = -Math.sin(yaw);
    const sz = -Math.cos(yaw);
    let nx = x + (sx * ahead - sz * side) * pace * dt;
    let nz = z + (sz * ahead + sx * side) * pace * dt;
    // forgiving collisions: a round fence, a few round things, and buildings
    const [bx, bz] = p.centre ?? [0, 0];
    const d = Math.hypot(nx - bx, nz - bz);
    if (d > p.bound) {
      nx = bx + ((nx - bx) * p.bound) / d;
      nz = bz + ((nz - bz) * p.bound) / d;
    }
    for (const s of p.solids ?? []) {
      const dx = nx - s.x, dz = nz - s.z, dd = Math.hypot(dx, dz);
      if (dd < s.r && dd > 1e-4) {
        nx = s.x + (dx / dd) * s.r;
        nz = s.z + (dz / dd) * s.r;
      }
    }
    if (p.blocked) {
      // slide along walls: try the whole move, then each axis on its own
      if (p.blocked(nx, nz)) {
        if (!p.blocked(nx, z)) nz = z;
        else if (!p.blocked(x, nz)) nx = x;
        else { nx = x; nz = z; }
      }
    }
    walked += Math.hypot(nx - x, nz - z);
    x = nx;
    z = nz;
    const bob = reduced ? 0 : Math.sin(walked * 1.75) * 0.045;
    const ground = heightAt(x, z);
    camera.position.set(x, ground + EYE + bob, z);
    camera.rotation.set(pitch, yaw, 0, "YXZ");

    // the sun's shadow box follows you, snapped so the edges don't crawl
    const snap = (SH * 2) / sun.shadow.mapSize.x;
    const tx = Math.round(x / snap) * snap, tz = Math.round(z / snap) * snap;
    sun.target.position.set(tx, ground, tz);
    sun.position.set(tx + sunDir.x * 260, ground + sunDir.y * 260, tz + sunDir.z * 260);
    skyMesh.position.copy(camera.position);

    let best: Exhibit | null = null;
    let bd = REACH;
    p.exhibits.forEach((e, i) => {
      const dist = Math.hypot(e.x - x, e.z - z);
      if (dist < bd) {
        bd = dist;
        best = e;
      }
      gems[i].rotation.y = t * 1.2;
      gems[i].position.y = heightAt(e.x, e.z) + 1.5 + (reduced ? 0 : Math.sin(t * 2 + i) * 0.08);
      (rings[i].material as THREE.MeshBasicMaterial).opacity = dist < REACH ? 0.9 : 0.35;
    });
    if (best !== near) {
      near = best;
      onNear(near);
    }
    if (!reduced) {
      p.tick?.(t, { x, z });
      waterTime.value = t % 600;
      const clouds = (skyMesh.material as THREE.ShaderMaterial).uniforms.time;
      if (clouds) clouds.value = t * 40;
    }
    renderer.info.reset();
    if (composer && finalPass) {
      finalPass.uniforms.uTime.value = reduced ? 0 : t % 10;
      composer.render();
    } else renderer.render(scene, camera);

    // too slow for this machine: shed the post chain, then the shadows
    if (dt > 0 && ++frames > 40) {
      slow = slow * 0.95 + (dt > 0.03 ? 1 : 0) * 0.05;
      if (slow > 0.6 && tier > 0 && frames > 120) {
        tier--;
        slow = 0;
        frames = 0;
        if (tier === 1) {
          composer?.dispose();
          composer = null;
        } else {
          renderer.shadowMap.enabled = false;
          sun.castShadow = false;
          scene.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.Material | undefined;
            if (m) m.needsUpdate = true;
          });
        }
        resize();
      }
    }
  }

  // ---- input
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)) {
      if (e.type === "keydown") keys.add(k);
      else keys.delete(k);
      if (k.startsWith("arrow")) e.preventDefault();
    }
  };
  const onBlur = () => keys.clear();
  let drag: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    yaw += (e.clientX - drag.x) * 0.0042;
    pitch = Math.max(-0.9, Math.min(0.9, pitch + (e.clientY - drag.y) * 0.0036));
    drag = { x: e.clientX, y: e.clientY };
  };
  const onUp = () => (drag = null);
  addEventListener("keydown", onKey);
  addEventListener("keyup", onKey);
  addEventListener("blur", onBlur);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  let raf = 0;
  let last = performance.now();
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt, now / 1000);
  };

  // places that use baked map data load it first
  const ready = Promise.resolve(build(kit)).then((p) => {
    if (dead) return;
    finish(p);
    step(0, 0);
    raf = requestAnimationFrame(loop);
  });
  ready.catch((e) => console.error("place failed to build", e));

  if (process.env.NODE_ENV !== "production") {
    // the preview pane throttles animation frames; this lets a frame be forced
    (window as unknown as { __walk: unknown }).__walk = {
      ready,
      goto(nx: number, nz: number, ny = yaw, np = pitch) {
        x = nx;
        z = nz;
        yaw = ny;
        pitch = np;
        step(0, performance.now() / 1000);
      },
      step: (dt = 0.016) => step(dt, performance.now() / 1000),
      pos: () => ({ x, z, yaw, pitch, bound: place?.bound, y: heightAt(x, z) }),
      get exhibits() {
        return place?.exhibits ?? [];
      },
      dbg: { scene, sun, renderer, THREE },
      info: () => ({ tier, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, texs: renderer.info.memory.textures, shadow: [renderer.shadowMap.enabled, sun.castShadow, !!sun.shadow.map, sun.shadow.mapSize.x, sun.intensity, sun.position.toArray().map(Math.round), sun.target.position.toArray().map(Math.round)] }),
    };
  }

  return {
    forward(on) {
      fwd = on;
    },
    dispose(release = true) {
      dead = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      removeEventListener("keydown", onKey);
      removeEventListener("keyup", onKey);
      removeEventListener("blur", onBlur);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mm = m.material as THREE.Material | THREE.Material[] | undefined;
        for (const one of Array.isArray(mm) ? mm : mm ? [mm] : []) {
          const any = one as THREE.Material & { map?: THREE.Texture | null; emissiveMap?: THREE.Texture | null };
          // per-object canvases (signs); the shared procedural maps go below
          if (any.map && any.map === any.emissiveMap) any.map.dispose();
          one.dispose();
        }
      });
      place?.dispose?.();
      disposeTextures();
      envTex?.dispose();
      pmrem.dispose();
      composer?.dispose();
      // hand the GL context back now: browsers only allow a handful, and
      // would otherwise drop the oldest one (the globe) after enough visits
      if (release) renderer.forceContextLoss();
      renderer.dispose();
    },
  };
}
