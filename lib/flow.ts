// Fig. 1: a D2Q9 lattice Boltzmann wind tunnel, running in fragment shaders.
//
// The fluid enters at the top of the hero and leaves at the bottom. Anything
// marked [data-flow-text] is rasterised into the lattice as a solid, so the
// name sheds vortices; [data-flow-solid] boxes are solids too, so the flow
// goes round the card that sits on top of it.
//
// Scheme: BGK collision with a Smagorinsky eddy viscosity (keeps it stable at
// the Reynolds numbers that look good), pull streaming, halfway bounce-back
// on solids, equilibrium inflow, a viscous sponge before the outflow, and
// periodic sides. Distributions are stored as deviations from the rest
// weights so half-float targets have enough precision.
//
// WebGL2, no dependencies.

const VS = `#version 300 es
layout(location=0) in vec2 p;
out vec2 vUv;
void main() { vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const STEP = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uA, uB, uC, uM;
uniform ivec2 uN;
uniform float uTau, uU, uInit, uCs;
uniform vec2 uMouse, uMouseV;
uniform float uWall;   // a nudge from the obstacles while the page scrolls
uniform int uShift;    // cells the page has scrolled since the last step
layout(location=0) out vec4 oA;
layout(location=1) out vec4 oB;
layout(location=2) out vec4 oC;

const ivec2 E[9] = ivec2[9](ivec2(0,0), ivec2(1,0), ivec2(0,1), ivec2(-1,0), ivec2(0,-1),
                            ivec2(1,1), ivec2(-1,1), ivec2(-1,-1), ivec2(1,-1));
const float W[9] = float[9](4./9., 1./9., 1./9., 1./9., 1./9., 1./36., 1./36., 1./36., 1./36.);
const int OPP[9] = int[9](0, 3, 4, 1, 2, 7, 8, 5, 6);

// equilibrium, minus the rest weight
float geq(int i, float rho, vec2 u) {
  float eu = dot(vec2(E[i]), u);
  return W[i] * (rho * (1. + 3. * eu + 4.5 * eu * eu - 1.5 * dot(u, u)) - 1.);
}
// The fluid belongs to the page, not the window. When the page scrolls, the
// old state is read from where that bit of page used to be; page that has
// only just come into view starts as undisturbed stream.
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float G(int i, ivec2 q) {
  q.y -= uShift;
  // (a little sideways noise, so wakes on fresh page break up quickly)
  if (q.y < 0 || q.y >= uN.y) return geq(i, 1., vec2((hash(vec2(q)) - 0.5) * 0.5 * uU, -uU));
  if (i == 0) return texelFetch(uC, q, 0).r;
  if (i < 5) return texelFetch(uA, q, 0)[i - 1];
  return texelFetch(uB, q, 0)[i - 5];
}
bool solid(ivec2 q) { vec4 m = texelFetch(uM, q, 0); return max(m.r, m.g) > 0.5; }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 uin = vec2(0., -uU);
  float g[9];
  // solids store a negative density, so a cell can tell it was solid last step
  if (solid(p)) { oA = vec4(0.); oB = vec4(0.); oC = vec4(0., -1., 0., 0.); return; }
  ivec2 was = ivec2(p.x, clamp(p.y - uShift, 0, uN.y - 1));
  if (uInit < 0.5 && texelFetch(uC, was, 0).g < 0.) {
    // uncovered by an obstacle that moved or changed size: start from a
    // slowed stream rather than a hard-edged pocket of still fluid
    vec2 uw = vec2(0., -0.4 * uU + uWall);
    for (int i = 0; i < 9; i++) g[i] = geq(i, 1., uw);
    oA = vec4(g[1], g[2], g[3], g[4]); oB = vec4(g[5], g[6], g[7], g[8]); oC = vec4(g[0], 1., uw);
    return;
  }
  if (uInit > 0.5) {
    // uniform stream, with a breath of noise so symmetric wakes can break
    vec2 u0 = uin + vec2((hash(vec2(p)) - 0.5) * 0.06 * uU, 0.);
    for (int i = 0; i < 9; i++) g[i] = geq(i, 1., u0);
    oA = vec4(g[1], g[2], g[3], g[4]); oB = vec4(g[5], g[6], g[7], g[8]); oC = vec4(g[0], 1., u0);
    return;
  }
  for (int i = 0; i < 9; i++) {
    ivec2 q = p - E[i];
    q.x = (q.x + uN.x) % uN.x;
    if (q.y >= uN.y) g[i] = geq(i, 1., uin);        // inflow
    else if (q.y < 0) g[i] = G(i, p);                // outflow
    else if (solid(q)) g[i] = G(OPP[i], p) + 6. * W[i] * float(E[i].y) * uWall;  // bounce-back off a (moving) wall
    else g[i] = G(i, q);
  }
  float rho = 1.;
  vec2 m = vec2(0.);
  for (int i = 0; i < 9; i++) { rho += g[i]; m += vec2(E[i]) * g[i]; }
  rho = clamp(rho, 0.7, 1.3);
  vec2 u = m / rho;
  vec2 d = vec2(p) - uMouse;
  u += uMouseV * exp(-dot(d, d) / 90.);
  float sp = length(u);
  if (sp > 0.24) u *= 0.24 / sp;

  float ge[9];
  float pxx = 0., pxy = 0., pyy = 0.;
  for (int i = 0; i < 9; i++) {
    ge[i] = geq(i, rho, u);
    float n = g[i] - ge[i];
    vec2 e = vec2(E[i]);
    pxx += e.x * e.x * n; pxy += e.x * e.y * n; pyy += e.y * e.y * n;
  }
  float Q = sqrt(pxx * pxx + 2. * pxy * pxy + pyy * pyy);
  float sponge = 1. - smoothstep(0., float(uN.y) * 0.07, float(p.y));
  float tau0 = mix(uTau, max(uTau, 1.), sponge);
  float tau = 0.5 * (tau0 + sqrt(tau0 * tau0 + 25.456 * uCs * uCs * Q / rho));
  for (int i = 0; i < 9; i++) g[i] -= (g[i] - ge[i]) / tau;
  oA = vec4(g[1], g[2], g[3], g[4]);
  oB = vec4(g[5], g[6], g[7], g[8]);
  oC = vec4(g[0], rho, u);
}`;

// Vorticity and speed, at lattice resolution, into an 8-bit texture that the
// display pass can sample with plain bilinear filtering.
const VIS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uC;
uniform ivec2 uN;
uniform float uU;   // the fastest the flow is expected to get (jet speed)
uniform float uGain;
out vec4 o;
vec2 V(ivec2 q) { q.x = (q.x + uN.x) % uN.x; q.y = clamp(q.y, 0, uN.y - 1); return texelFetch(uC, q, 0).ba; }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float curl = 0.5 * ((V(p + ivec2(1,0)).y - V(p - ivec2(1,0)).y) - (V(p + ivec2(0,1)).x - V(p - ivec2(0,1)).x));
  float s = length(V(p)) / uU;
  o = vec4(0.5 + 0.5 * tanh(curl / uU * uGain), clamp(s * 0.5, 0., 1.), 0., 1.);
}`;

// Passive dye (page mode). Every obstacle bleeds its own colour into the fluid
// touching it and the flow carries it off, so each section leaves a wake you
// can tell apart. Semi-Lagrangian: look upstream, take what was there.
const DYE = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uD, uC, uM, uS;
uniform ivec2 uN;
uniform float uDt, uKeep, uInject, uShiftD;
in vec2 vUv;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 m = texelFetch(uM, p, 0);
  if (max(m.r, m.g) > 0.5) { o = vec4(0.); return; }
  vec2 u = texelFetch(uC, p, 0).ba;
  vec2 back = (gl_FragCoord.xy - u * uDt - vec2(0., uShiftD)) / vec2(uN);
  vec4 d = (back.y >= 1. || back.y <= 0.) ? vec4(0.) : texture(uD, back) * uKeep;
  vec4 s = texture(uS, vUv);
  o = mix(d, vec4(s.rgb, 1.), min(1., s.a * uInject));
}`;

const SHOW = `#version 300 es
precision highp float;
uniform sampler2D uV, uH, uD;
uniform vec3 uBg, uPos, uNeg, uInk;
uniform float uView, uDark, uGlyph, uFade, uHot, uDye;
in vec2 vUv;
out vec4 o;
void main() {
  vec4 f = texture(uV, vUv);
  float c = uView > 0.5 ? min(1., f.g * 1.7) : f.r * 2. - 1.;
  c = sign(c) * max(0., abs(c) - 0.045) / 0.955;
  float a = pow(abs(c), 0.9);
  vec3 col = mix(uBg, c > 0. ? uPos : uNeg, a);
  col += uDark * a * a * a * uHot;
  if (uDye > 0.) {
    // smoke: the dye gives the hue, the vorticity lights its edges
    vec4 d = texture(uD, vUv);
    float s = smoothstep(0.008, uDark > 0.5 ? 0.42 : 0.2, d.a);
    vec3 hue = d.rgb / max(d.a, 1e-3);
    float e = pow(abs(f.r * 2. - 1.), 0.75);
    vec3 smoke = uDark > 0.5
      ? uBg + hue * (0.3 + 0.72 * e) * (0.34 + 0.66 * s) + e * e * e * 0.14
      : mix(uBg, hue * (1. - 0.2 * e), (0.42 + 0.58 * e) * (0.55 + 0.45 * s));
    col = mix(mix(uBg, col, 0.28), smoke, s * uDye);
  }
  col = mix(col, mix(uBg, col, smoothstep(0., 0.16, vUv.y)), uFade);
  float m = uGlyph * smoothstep(0.42, 0.58, texture(uH, vUv).r);
  o = vec4(mix(col, uInk, m), 1.);
}`;

// One dye colour per section (data-hue="n" on the section).
// The page's stylesheet owns the palette (a --hue custom property on the
// section); these are only the fallback when it sets none.
const HUES_NIGHT = ["#ff7a45", "#58b8ff", "#ff6b93", "#63dba0", "#a898ff", "#f0bf52"];
const HUES_PAPER = ["#cc3c12", "#18489c", "#a8195a", "#1f7a58", "#5b3cc4", "#a66a00"];

export type FlowStats = { nx: number; ny: number; re: number; mlups: number };

type Target = { fbo: WebGLFramebuffer; tex: WebGLTexture[] };

export class Flow {
  private gl: WebGL2RenderingContext | null = null;
  private progs: Record<string, WebGLProgram> = {};
  private locs = new Map<string, WebGLUniformLocation | null>();
  private state: Target[] = [];
  private vis: Target | null = null;
  private maskLo: WebGLTexture | null = null;
  private maskHi: WebGLTexture | null = null;
  private fmt: [number, number] = [0, 0];
  private nx = 0;
  private ny = 0;
  private cell = 2.5;
  private L = 40;
  private U = 0.03; // inflow speed, lattice units
  private Uj = 0.1; // speed through the tightest gap between obstacles
  private re = 420;
  private rate = 560; // lattice steps per second (page mode sets its own)
  private debt = 0;
  private raf = 0;
  private visible = true;
  private paused = false;
  private view = 0;
  private mouse = [-999, -999];
  private mouseV = [0, 0];
  private lastPt: [number, number] | null = null;
  private frames = 0;
  private stepped = 0;
  private clock = 0;
  private slow = 0;
  private cleanup: (() => void)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private host: HTMLElement,
    private onStats: (s: FlowStats) => void,
    /** page: the canvas is fixed behind a scrolling page and everything
     *  marked in the document is an obstacle while it is on screen. The DOM
     *  draws the text itself, so the canvas only draws the fluid. */
    private opts: { page?: boolean } = {},
  ) {}

  private broken = false;
  private dye: Target[] = [];
  private dyeSrc: WebGLTexture | null = null;
  private pending = 0; // lattice steps the dye has not caught up with yet
  private wall = 0;
  private shift = 0; // whole cells of scroll not yet applied to the fluid
  private shiftRem = 0;
  private dyeShift = 0;
  private lastScroll = -1;
  /** Starting Reynolds number; page mode runs livelier. */
  startRe() {
    if (this.opts.page) {
      this.re = 700;
      this.rate = 680;
      this.view = 2;
    }
    return this.re;
  }
  private quiet = false;

  /** Returns false if the GPU can't do it; the caller keeps the plain heading. */
  init(): boolean {
    const gl = this.canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false });
    if (!gl) { console.warn("flow: no webgl2"); return false; }
    if (gl.getExtension("EXT_color_buffer_float")) this.fmt = [gl.RGBA32F, gl.FLOAT];
    else if (gl.getExtension("EXT_color_buffer_half_float")) this.fmt = [gl.RGBA16F, gl.HALF_FLOAT];
    else { console.warn("flow: no float targets"); return false; }
    this.gl = gl;
    for (const [name, fs] of Object.entries({ step: STEP, vis: VIS, show: SHOW, dye: DYE })) {
      const p = gl.createProgram()!;
      for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]] as const) {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
          console.warn("flow shader:", name, gl.getShaderInfoLog(s));
          return false;
        }
        gl.attachShader(p, s);
      }
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn("flow link:", name, gl.getProgramInfoLog(p), gl.isContextLost()); return false; }
      this.progs[name] = p;
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // A hero with no size yet (hidden tab, mid-layout) is not a failure: the
    // resize observer builds the lattice when it gets one.
    this.build();
    if (this.broken) { console.warn("flow: no usable float framebuffer"); return false; }

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // a developed, still figure; the play button starts it
      if (this.state.length) {
        for (let i = 0; i < 3200; i++) this.step();
        this.draw();
      }
      this.paused = true;
    }

    let t = 0;
    const onResize = () => {
      clearTimeout(t);
      t = window.setTimeout(() => this.build(), 180);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(this.host);
    // page mode: an obstacle that changes size (a card opening) changes the
    // page height; rasterise again on the next frame
    if (this.opts.page) new ResizeObserver(() => (this.lastScroll = -2)).observe(document.body);
    const io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      this.loop();
    });
    io.observe(this.host);
    const onVis = () => this.loop();
    const onMove = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / this.cell;
      const y = (r.bottom - e.clientY) / this.cell;
      if (this.lastPt) {
        const k = 0.05;
        this.mouseV[0] = Math.max(-0.14, Math.min(0.14, (x - this.lastPt[0]) * k));
        this.mouseV[1] = Math.max(-0.14, Math.min(0.14, (y - this.lastPt[1]) * k));
      }
      this.lastPt = [x, y];
      this.mouse = [x, y];
    };
    const onLeave = () => (this.lastPt = null);
    const mq = new MutationObserver(() => {
      if (this.opts.page) this.build(); // the dye colours are per theme
      else if (this.paused) this.draw();
    });
    mq.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const pad: EventTarget = this.opts.page ? window : this.host;
    pad.addEventListener("pointermove", onMove as EventListener, { passive: true });
    this.host.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVis);
    document.fonts?.ready.then(() => this.build());
    this.cleanup.push(() => {
      ro.disconnect();
      io.disconnect();
      mq.disconnect();
      pad.removeEventListener("pointermove", onMove as EventListener);
      this.host.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVis);
      cancelAnimationFrame(this.raf);
    });
    this.loop();
    return true;
  }

  destroy() {
    // The context stays alive: a remount gets the same one back from the canvas.
    this.cleanup.forEach((f) => f());
    const gl = this.gl;
    if (!gl) return;
    for (const t of [...this.state, ...this.dye, this.vis]) {
      if (!t) continue;
      t.tex.forEach((x) => gl.deleteTexture(x));
      gl.deleteFramebuffer(t.fbo);
    }
    this.state = [];
    this.dye = [];
  }

  // ---------- controls ----------

  get isPaused() {
    return this.paused;
  }
  setPaused(p: boolean) {
    this.paused = p;
    this.loop();
  }
  /** 0 vorticity, 1 speed, 2 smoke (page mode: dye lit by vorticity) */
  setView(v: 0 | 1 | 2) {
    this.view = v;
    if (this.paused) this.draw();
  }
  setRe(re: number) {
    this.re = re;
    this.stats();
  }
  reset() {
    this.seed();
    if (this.paused) this.draw();
  }

  // ---------- setup ----------

  private tex(w: number, h: number, internal: number, type: number, filter: number, data: TexImageSource | null = null) {
    const gl = this.gl!;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (data) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private target(n: number, internal: number, type: number, filter: number): Target | null {
    const gl = this.gl!;
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const tex: WebGLTexture[] = [];
    const bufs: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = this.tex(this.nx, this.ny, internal, type, filter);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      tex.push(t);
      bufs.push(gl.COLOR_ATTACHMENT0 + i);
    }
    gl.drawBuffers(bufs);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;
    return { fbo, tex };
  }

  /** (Re)size the lattice to the hero and rasterise the obstacles. */
  private build(): boolean {
    const gl = this.gl!;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w < 50 || h < 50) return false;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const page = !!this.opts.page;
    const root: ParentNode = page ? document : this.host;
    // ~2.5 CSS px per cell, capped so big screens don't melt laptops
    this.cell = page ? Math.max(1.9, Math.sqrt((w * h) / 330000)) : Math.max(2, Math.sqrt((w * h) / 230000), w / 760);
    const nx = Math.round(w / this.cell);
    const ny = Math.round(h / this.cell);
    const resized = nx !== this.nx || ny !== this.ny;
    // a small lattice (a phone) can afford to run the fluid faster
    if (page && resized) this.rate = Math.min(1400, (680 * 330000) / (nx * ny));
    this.nx = nx;
    this.ny = ny;

    // obstacles: glyphs in red, boxes in green
    // (page mode re-rasterises on every scroll frame, so it draws straight
    // at lattice resolution)
    const hi = document.createElement("canvas");
    hi.width = page ? nx : this.canvas.width;
    hi.height = page ? ny : this.canvas.height;
    const c = hi.getContext("2d", { willReadFrequently: page })!;
    c.fillStyle = "#000";
    c.fillRect(0, 0, hi.width, hi.height);
    if (page) c.scale(nx / w, ny / h);
    else c.scale(dpr, dpr);
    c.globalCompositeOperation = "lighter";
    const origin = this.canvas.getBoundingClientRect();
    let size = 100;
    // page mode: a second raster, each obstacle in its own colour and a few
    // cells fatter than it is, which is where the dye comes from
    let tint: CanvasRenderingContext2D | null = null;
    const light = document.documentElement.classList.contains("light");
    const hues = light ? HUES_PAPER : HUES_NIGHT;
    const hueCache = new Map<Element, string>();
    const hueOf = (el: HTMLElement) => {
      const sec = el.closest("[data-hue]") as HTMLElement | null;
      if (!sec) return hues[0];
      let hue = hueCache.get(sec);
      if (!hue) {
        hue = getComputedStyle(sec).getPropertyValue("--hue").trim() || hues[(Number(sec.dataset.hue) || 0) % hues.length];
        hueCache.set(sec, hue);
      }
      return hue;
    };
    if (page) {
      const tc = document.createElement("canvas");
      tc.width = nx;
      tc.height = ny;
      tint = tc.getContext("2d")!;
      tint.scale(nx / w, ny / h);
      tint.lineJoin = "round";
      tint.lineWidth = this.cell * 4;
    }
    root.querySelectorAll<HTMLElement>("[data-flow-text]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < origin.top || r.top > origin.bottom || !r.width) return;
      const cs = getComputedStyle(el);
      size = Math.max(page ? size : 0, parseFloat(cs.fontSize));
      c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if ("letterSpacing" in c) (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = cs.letterSpacing;
      const text = cs.textTransform === "uppercase" ? el.textContent!.toUpperCase() : el.textContent!;
      const m = c.measureText(text);
      const asc = m.fontBoundingBoxAscent ?? size * 0.8;
      const desc = m.fontBoundingBoxDescent ?? size * 0.2;
      c.textBaseline = "alphabetic";
      c.fillStyle = "#f00";
      const tx = r.left - origin.left;
      const ty = r.top - origin.top + (r.height - asc - desc) / 2 + asc;
      c.fillText(text, tx, ty);
      if (tint) {
        tint.font = c.font;
        if ("letterSpacing" in tint) (tint as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = cs.letterSpacing;
        tint.fillStyle = tint.strokeStyle = hueOf(el);
        tint.strokeText(text, tx, ty);
        tint.fillText(text, tx, ty);
      }
    });
    c.fillStyle = "#0f0";
    root.querySelectorAll<HTMLElement>("[data-flow-solid]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < origin.top || r.top > origin.bottom) return;
      // a box nearly as wide as the tunnel would dam it (phones): let the
      // flow pass underneath instead
      if (!r.width || r.width > w * 0.7) return;
      c.beginPath();
      const rad = parseFloat(getComputedStyle(el).borderRadius) || 0;
      c.roundRect(r.left - origin.left, r.top - origin.top, r.width, r.height, rad);
      c.fill();
      if (tint) {
        tint.fillStyle = tint.strokeStyle = hueOf(el);
        tint.beginPath();
        tint.roundRect(r.left - origin.left, r.top - origin.top, r.width, r.height, rad);
        tint.fill();
        tint.stroke();
      }
    });
    this.L = Math.max(8, (size * 0.62) / this.cell);
    let lo = hi;
    let lc = c;
    if (!page) {
      lo = document.createElement("canvas");
      lo.width = nx;
      lo.height = ny;
      lc = lo.getContext("2d", { willReadFrequently: true })!;
      lc.drawImage(hi, 0, 0, nx, ny);
    }
    lc.setTransform(1, 0, 0, 1, 0, 0);
    // The name is nearly a dam across the tunnel. Continuity says the flow
    // speeds up by 1/(open fraction) through the gaps, so pick the inflow
    // that keeps those jets comfortably subsonic.
    const px = lc.getImageData(0, 0, nx, ny).data;
    let open = 1;
    for (let y = 0; y < ny; y++) {
      let free = 0;
      for (let x = 0; x < nx; x++) {
        const o = (y * nx + x) * 4;
        if (px[o] < 128 && px[o + 1] < 128) free++;
      }
      open = Math.min(open, free / nx);
    }
    open = Math.max(0.12, open);
    this.Uj = 0.105;
    this.U = this.Uj * open;

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    if (this.maskHi) gl.deleteTexture(this.maskHi);
    if (this.maskLo) gl.deleteTexture(this.maskLo);
    this.maskHi = this.tex(0, 0, 0, 0, gl.LINEAR, hi);
    this.maskLo = this.tex(0, 0, 0, 0, gl.NEAREST, lo);
    if (tint) {
      if (this.dyeSrc) gl.deleteTexture(this.dyeSrc);
      this.dyeSrc = this.tex(0, 0, 0, 0, gl.LINEAR, tint.canvas);
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    if (resized || !this.state.length) {
      for (const t of [...this.state, ...this.dye, this.vis]) {
        if (!t) continue;
        t.tex.forEach((x) => gl.deleteTexture(x));
        gl.deleteFramebuffer(t.fbo);
      }
      this.dye = [];
      if (page) {
        // half floats filter linearly everywhere, which the dye needs
        const d0 = this.target(1, gl.RGBA16F, gl.HALF_FLOAT, gl.LINEAR);
        const d1 = this.target(1, gl.RGBA16F, gl.HALF_FLOAT, gl.LINEAR);
        if (d0 && d1) {
          this.dye = [d0, d1];
          for (const d of this.dye) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, d.fbo);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
          }
        }
      }
      const a = this.target(3, this.fmt[0], this.fmt[1], gl.NEAREST);
      const b = this.target(3, this.fmt[0], this.fmt[1], gl.NEAREST);
      const v = this.target(1, gl.RGBA8, gl.UNSIGNED_BYTE, gl.LINEAR);
      if (!a || !b || !v) {
        this.broken = true;
        return false;
      }
      this.state = [a, b];
      this.vis = v;
      this.seed();
    }
    this.stats();
    // paint now, so the name is on screen before the first animation frame
    if (!this.quiet) this.draw();
    return true;
  }

  private seed() {
    this.step(true);
    this.step(true);
  }

  private u(prog: string, name: string) {
    const key = prog + name;
    if (!this.locs.has(key)) this.locs.set(key, this.gl!.getUniformLocation(this.progs[prog], name));
    return this.locs.get(key)!;
  }

  private bind(unit: number, t: WebGLTexture) {
    const gl = this.gl!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
  }

  // ---------- simulation ----------

  private step(init = false) {
    const gl = this.gl!;
    const [src, dst] = this.state;
    gl.useProgram(this.progs.step);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, this.nx, this.ny);
    this.bind(0, src.tex[0]);
    this.bind(1, src.tex[1]);
    this.bind(2, src.tex[2]);
    this.bind(3, this.maskLo!);
    gl.uniform1i(this.u("step", "uA"), 0);
    gl.uniform1i(this.u("step", "uB"), 1);
    gl.uniform1i(this.u("step", "uC"), 2);
    gl.uniform1i(this.u("step", "uM"), 3);
    gl.uniform2i(this.u("step", "uN"), this.nx, this.ny);
    const nu = (this.Uj * this.L) / this.re;
    gl.uniform1f(this.u("step", "uTau"), Math.max(0.5 + 3 * nu, this.opts.page ? 0.508 : 0.503));
    gl.uniform1f(this.u("step", "uU"), this.U);
    gl.uniform1f(this.u("step", "uCs"), this.opts.page ? 0.19 : 0.15);
    gl.uniform1f(this.u("step", "uInit"), init ? 1 : 0);
    gl.uniform2f(this.u("step", "uMouse"), this.mouse[0], this.mouse[1]);
    gl.uniform2f(this.u("step", "uMouseV"), this.mouseV[0], this.mouseV[1]);
    gl.uniform1f(this.u("step", "uWall"), init ? 0 : this.wall);
    gl.uniform1i(this.u("step", "uShift"), init ? 0 : this.shift);
    if (!init) {
      this.dyeShift += this.shift;
      this.shift = 0;
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.state = [dst, src];
    if (!init) this.pending++;
  }

  /** Carry the dye along by however many lattice steps have run since. */
  private advect() {
    const gl = this.gl!;
    if (!this.dye.length || !this.dyeSrc) {
      this.pending = 0;
      return;
    }
    gl.useProgram(this.progs.dye);
    gl.viewport(0, 0, this.nx, this.ny);
    gl.uniform1i(this.u("dye", "uD"), 0);
    gl.uniform1i(this.u("dye", "uC"), 1);
    gl.uniform1i(this.u("dye", "uM"), 2);
    gl.uniform1i(this.u("dye", "uS"), 3);
    gl.uniform2i(this.u("dye", "uN"), this.nx, this.ny);
    while (this.pending > 0) {
      const n = Math.min(12, this.pending);
      this.pending -= n;
      const [src, dst] = this.dye;
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      this.bind(0, src.tex[0]);
      this.bind(1, this.state[0].tex[2]);
      this.bind(2, this.maskLo!);
      this.bind(3, this.dyeSrc);
      gl.uniform1f(this.u("dye", "uDt"), n);
      gl.uniform1f(this.u("dye", "uShiftD"), this.dyeShift);
      this.dyeShift = 0;
      // fades over about ten seconds of flow; picks colour up quickly
      gl.uniform1f(this.u("dye", "uKeep"), Math.exp(-n / (this.rate * 10)));
      gl.uniform1f(this.u("dye", "uInject"), 1 - Math.exp(-n / 26));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.dye = [dst, src];
    }
  }

  private draw() {
    const gl = this.gl!;
    if (!this.vis || !this.state.length) return;
    this.advect();
    gl.useProgram(this.progs.vis);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.vis!.fbo);
    gl.viewport(0, 0, this.nx, this.ny);
    this.bind(0, this.state[0].tex[2]);
    gl.uniform1i(this.u("vis", "uC"), 0);
    gl.uniform2i(this.u("vis", "uN"), this.nx, this.ny);
    gl.uniform1f(this.u("vis", "uU"), this.Uj);
    gl.uniform1f(this.u("vis", "uGain"), this.opts.page ? 3.6 : 3.2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const light = document.documentElement.classList.contains("light");
    const rgb = (r: number, g: number, b: number) => [r / 255, g / 255, b / 255] as const;
    const pal = light
      ? { bg: rgb(244, 241, 234), pos: rgb(214, 66, 22), neg: rgb(24, 72, 156), ink: rgb(22, 22, 20) }
      : { bg: rgb(9, 11, 15), pos: rgb(255, 112, 54), neg: rgb(56, 178, 255), ink: rgb(238, 236, 229) };
    gl.useProgram(this.progs.show);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.bind(0, this.vis!.tex[0]);
    this.bind(1, this.maskHi!);
    const smoke = this.view === 2 && this.dye.length > 0;
    this.bind(2, smoke ? this.dye[0].tex[0] : this.maskHi!);
    gl.uniform1i(this.u("show", "uV"), 0);
    gl.uniform1i(this.u("show", "uH"), 1);
    gl.uniform1i(this.u("show", "uD"), 2);
    gl.uniform1f(this.u("show", "uDye"), smoke ? 1 : 0);
    gl.uniform3f(this.u("show", "uBg"), ...pal.bg);
    gl.uniform3f(this.u("show", "uPos"), ...pal.pos);
    gl.uniform3f(this.u("show", "uNeg"), ...pal.neg);
    gl.uniform3f(this.u("show", "uInk"), ...pal.ink);
    gl.uniform1f(this.u("show", "uView"), this.view === 1 ? 1 : 0);
    gl.uniform1f(this.u("show", "uDark"), light ? 0 : 1);
    gl.uniform1f(this.u("show", "uGlyph"), this.opts.page ? 0 : 1);
    gl.uniform1f(this.u("show", "uFade"), this.opts.page ? 0.7 : 1);
    gl.uniform1f(this.u("show", "uHot"), this.opts.page ? 0.55 : 0.22);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private stats(mlups = 0) {
    this.onStats({ nx: this.nx, ny: this.ny, re: this.re, mlups });
  }

  private loop() {
    cancelAnimationFrame(this.raf);
    if (this.paused || !this.visible || document.hidden) return;
    let last = performance.now();
    this.clock = last;
    this.frames = this.stepped = 0;
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      if (!this.state.length) return;
      const dt = now - last;
      last = now;
      // Same simulated speed on a 60 Hz or a 144 Hz display. If the GPU
      // can't keep up, slow the fluid down rather than drop frames.
      if (dt > 26) this.slow++;
      else this.slow = Math.max(0, this.slow - 1);
      if (this.slow > 24 && this.rate > 120) {
        this.rate *= 0.8;
        this.slow = 0;
      }
      if (this.opts.page && scrollY !== this.lastScroll) {
        // the page moved: the obstacles are somewhere else now, and they
        // drag a little of the fluid along with them
        // (in lattice units per step, capped well below the speed of sound)
        if (this.lastScroll >= 0) {
          const cells = (scrollY - this.lastScroll) / this.cell;
          this.shiftRem += cells;
          const whole = Math.trunc(this.shiftRem);
          this.shiftRem -= whole;
          this.shift += whole;
          // the fluid travels with the page, plus a small shove from the
          // obstacles so a fast scroll kicks the wakes about
          const per = cells / Math.max(1, (this.rate * Math.min(dt, 50)) / 1000);
          this.wall = Math.max(-0.03, Math.min(0.03, per * 0.4));
        }
        this.lastScroll = scrollY;
        this.quiet = true;
        this.build();
        this.quiet = false;
      }
      else this.wall *= 0.6;
      this.debt = Math.min(24, this.debt + (this.rate * Math.min(dt, 50)) / 1000);
      const steps = Math.floor(this.debt);
      this.debt -= steps;
      for (let i = 0; i < steps; i++) this.step();
      this.mouseV[0] *= 0.86;
      this.mouseV[1] *= 0.86;
      this.draw();
      this.frames++;
      this.stepped += steps;
      if (now - this.clock > 700) {
        this.stats((this.stepped * this.nx * this.ny) / ((now - this.clock) * 1000));
        this.clock = now;
        this.frames = this.stepped = 0;
      }
    };
    this.raf = requestAnimationFrame(tick);
  }
}
