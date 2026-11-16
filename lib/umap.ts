// The map figure: every repo, project, role and tool as a point in the 3D
// embedding. Raw WebGL: one draw call for the points, one for the
// nearest-neighbour lines. No dependencies.

export type Cluster = { name: string; color: string; count: number };

export type MapData = {
  /** cluster index per node, base-36, one char each */
  c: string;
  /** kind per node: r(epo) p(roject) a(chievement) e(xperience) t(ool) */
  k: string;
  clusters: Cluster[];
  names: string[];
  /** x,y,z per node, ×1000 */
  p: number[];
  /** node index → tagline, url, "used in" parent */
  meta: Record<string, { t?: string; u?: string; o?: string }>;
};

export type MapState = { selected: number; cluster: number; query: string; matches: number };

const KIND: Record<string, string> = { r: "repo", p: "project", a: "milestone", e: "role", t: "tool" };
const K = 4;

const VS = `
attribute vec2 aPos; attribute float aSize; attribute vec4 aCol;
uniform vec2 uRes; uniform float uDpr; varying vec4 vCol;
void main() {
  vec2 p = aPos / uRes * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
  gl_PointSize = max(aSize * uDpr * 2.0, 1.0);
  vCol = aCol;
}`;
// The quad is twice the dot's diameter, leaving room for a halo on dark.
const FS = `
precision mediump float; varying vec4 vCol; uniform float uGlow;
void main() {
  float d = length(gl_PointCoord - 0.5) * 4.0;
  float a = (1.0 - smoothstep(0.8, 1.0, d)) + pow(max(0.0, 1.0 - d * 0.5), 2.0) * 0.3 * uGlow;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb, vCol.a * a);
}`;
const LVS = `
attribute vec2 aPos; attribute vec4 aCol; uniform vec2 uRes; varying vec4 vCol;
void main() { vec2 p = aPos / uRes * 2.0 - 1.0; gl_Position = vec4(p.x, -p.y, 0.0, 1.0); vCol = aCol; }`;
const LFS = `precision mediump float; varying vec4 vCol; void main() { gl_FragColor = vCol; }`;

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
// Cluster colours are tuned for a dark canvas; on paper they need more ink.
function forPaper([r, g, b]: [number, number, number]): [number, number, number] {
  const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
  const k = l > 0.38 ? 0.38 / l : 1;
  const m = (r + g + b) / 3;
  return [r, g, b].map((v) => Math.max(0, (m + (v - m) * 1.3) * k)) as [number, number, number];
}

export class UMap {
  state: MapState = { selected: -1, cluster: -1, query: "", matches: 0 };
  private listeners = new Set<() => void>();
  private gl: WebGLRenderingContext | null = null;
  private prog!: WebGLProgram;
  private lprog!: WebGLProgram;
  private buf!: WebGLBuffer;
  private lbuf!: WebGLBuffer;
  private n = 0;
  private cl!: Uint8Array;
  private pos!: Float32Array;
  private sx!: Float32Array;
  private sy!: Float32Array;
  private sz!: Float32Array;
  private al!: Float32Array;
  private phase!: Float32Array;
  private rgbDark!: Float32Array;
  private rgbPaper!: Float32Array;
  private knn!: Uint16Array;
  private out!: Float32Array;
  private ldata = new Float32Array(6 * 2 * K * 2);
  private match: Uint8Array | null = null;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private raf = 0;
  private visible = false;
  private grow = 0;
  private born = 0;
  private yaw = 0.6;
  private home = 0.6; // the yaw the idle sway is centred on
  private swayAt = 0;
  private pitch = 0.22;
  private zoom = 1;
  private tyaw: number | null = null;
  private tpitch = 0;
  private mx = -999;
  private my = -999;
  private hover = -1;
  private hi = -1;
  private drag: { x: number; y: number; moved: number } | null = null;
  private reduced = false;
  private cleanup: (() => void)[] = [];
  private places: { el: HTMLElement; c: number; x: number; y: number; z: number }[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private tip: HTMLElement,
    private labels: HTMLElement,
    private data: MapData,
  ) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getState = () => this.state;
  private set(patch: Partial<MapState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((f) => f());
  }

  init(): boolean {
    const gl = this.canvas.getContext("webgl", { alpha: false, antialias: false });
    if (!gl) return false;
    this.gl = gl;
    const d = this.data;
    const n = (this.n = d.c.length);
    this.prog = this.program(VS, FS);
    this.lprog = this.program(LVS, LFS);
    this.buf = gl.createBuffer()!;
    this.lbuf = gl.createBuffer()!;
    this.out = new Float32Array(n * 7);
    this.cl = new Uint8Array(n);
    this.pos = new Float32Array(n * 3);
    this.sx = new Float32Array(n);
    this.sy = new Float32Array(n);
    this.sz = new Float32Array(n);
    this.al = new Float32Array(n);
    this.phase = new Float32Array(n);
    this.rgbDark = new Float32Array(n * 3);
    this.rgbPaper = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.cl[i] = parseInt(d.c[i], 36);
      const c = hexRgb(d.clusters[this.cl[i]].color);
      this.rgbDark.set(c, i * 3);
      this.rgbPaper.set(forPaper(c), i * 3);
      this.phase[i] = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);
    }
    // centre the cloud and scale it to a unit sphere so it fills the frame
    const mid = [0, 0, 0];
    for (let i = 0; i < n * 3; i++) mid[i % 3] += d.p[i] / 1000 / n;
    let far = 0;
    for (let i = 0; i < n; i++) {
      far = Math.max(far, Math.hypot(d.p[i * 3] / 1000 - mid[0], d.p[i * 3 + 1] / 1000 - mid[1], d.p[i * 3 + 2] / 1000 - mid[2]));
    }
    for (let i = 0; i < n * 3; i++) this.pos[i] = (d.p[i] / 1000 - mid[i % 3]) / far;

    // Open on the angle that shows the most of it: the cloud is closer to a
    // sheet than a ball, and edge-on it is just a line.
    let bestSpread = -1;
    for (let a = 0; a < 36; a++) {
      for (let b = -4; b <= 4; b++) {
        const yaw = (a / 36) * Math.PI * 2;
        const pitch = b * 0.2;
        const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
        let depth = 0;
        for (let i = 0; i < n; i += 3) {
          const z1 = -this.pos[i * 3] * sy + this.pos[i * 3 + 2] * cy;
          const z2 = this.pos[i * 3 + 1] * sp + z1 * cp;
          depth += z2 * z2;
        }
        if (bestSpread < 0 || depth < bestSpread) {
          bestSpread = depth;
          this.home = yaw;
          this.pitch = pitch;
        }
      }
    }
    this.yaw = this.home;

    // a place name at the centre of each cluster
    const sum = d.clusters.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      if (d.k[i] === "t") continue;
      const c = sum[this.cl[i]];
      c[0] += this.pos[i * 3];
      c[1] += this.pos[i * 3 + 1];
      c[2] += this.pos[i * 3 + 2];
      c[3]++;
    }
    this.labels.textContent = "";
    this.places = [];
    sum.forEach((c, i) => {
      if (c[3] < 4) return;
      const el = document.createElement("span");
      el.textContent = d.clusters[i].name;
      this.labels.append(el);
      this.places.push({ el, c: i, x: c[0] / c[3], y: c[1] / c[3], z: c[2] / c[3] });
    });

    // nearest neighbours in the embedding (things, not their tools)
    this.knn = new Uint16Array(n * K);
    const best = new Float32Array(K);
    for (let i = 0; i < n; i++) {
      best.fill(1e9);
      for (let j = 0; j < n; j++) {
        if (i === j || d.k[j] === "t") continue;
        const dx = this.pos[i * 3] - this.pos[j * 3];
        const dy = this.pos[i * 3 + 1] - this.pos[j * 3 + 1];
        const dz = this.pos[i * 3 + 2] - this.pos[j * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        for (let k = 0; k < K; k++) {
          if (d2 < best[k]) {
            for (let m = K - 1; m > k; m--) {
              best[m] = best[m - 1];
              this.knn[i * K + m] = this.knn[i * K + m - 1];
            }
            best[k] = d2;
            this.knn[i * K + k] = j;
            break;
          }
        }
      }
    }

    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (this.reduced) this.grow = 1;
    const cv = this.canvas;
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      this.loop();
    }, { threshold: 0.05 });
    io.observe(cv);
    const local = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const onMove = (e: PointerEvent) => {
      const [x, y] = local(e);
      if (this.drag) {
        const dx = x - this.drag.x;
        const dy = y - this.drag.y;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        this.drag.x = x;
        this.drag.y = y;
        this.yaw += dx * 0.006;
        this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch + dy * 0.006));
        this.tyaw = null;
      }
      this.mx = e.pointerType === "touch" ? -999 : x;
      this.my = y;
    };
    const onDown = (e: PointerEvent) => {
      const [x, y] = local(e);
      this.drag = { x, y, moved: 0 };
      cv.setPointerCapture(e.pointerId);
      cv.classList.add("dragging");
    };
    const onUp = (e: PointerEvent) => {
      const click = this.drag && this.drag.moved < 6;
      this.drag = null;
      cv.classList.remove("dragging");
      if (click) {
        const [x, y] = local(e);
        this.select(this.pick(x, y, e.pointerType === "touch" ? 26 : 16));
      }
    };
    const onLeave = () => {
      this.mx = this.my = -999;
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && this.select(-1);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onUp);
    cv.addEventListener("pointerleave", onLeave);
    addEventListener("keydown", onKey);
    const onVis = () => this.loop();
    document.addEventListener("visibilitychange", onVis);
    this.cleanup.push(() => {
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(this.raf);
      removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVis);
    });
    this.resize();
    return true;
  }

  destroy() {
    this.cleanup.forEach((f) => f());
  }

  private program(vs: string, fs: string) {
    const gl = this.gl!;
    const p = gl.createProgram()!;
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    return p;
  }

  private resize() {
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.W = this.canvas.clientWidth;
    this.H = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
  }

  // ---------- controls ----------

  highlight(cluster: number) {
    this.hi = cluster;
  }
  setCluster(cluster: number) {
    this.set({ cluster: this.state.cluster === cluster ? -1 : cluster });
  }
  setQuery(q: string) {
    const query = q.trim().toLowerCase();
    let matches = 0;
    if (query) {
      const m = new Uint8Array(this.n);
      this.data.names.forEach((name, i) => {
        if (name.toLowerCase().includes(query)) {
          m[i] = 1;
          matches++;
        }
      });
      this.match = m;
    } else this.match = null;
    this.set({ query: q, matches });
  }
  firstMatch() {
    if (!this.match) return -1;
    let tool = -1;
    for (let i = 0; i < this.n; i++) {
      if (!this.match[i]) continue;
      if (this.data.k[i] !== "t") return i;
      if (tool < 0) tool = i;
    }
    return tool;
  }
  select(i: number) {
    this.set({ selected: i });
    if (i < 0) return;
    const x = this.pos[i * 3];
    const y = this.pos[i * 3 + 1];
    const z = this.pos[i * 3 + 2];
    // turn the camera so the node faces us, the short way round
    let ty = Math.atan2(-x, z);
    while (ty - this.yaw > Math.PI) ty -= Math.PI * 2;
    while (ty - this.yaw < -Math.PI) ty += Math.PI * 2;
    this.tyaw = ty;
    this.home = ty;
    this.swayAt = 0;
    this.tpitch = Math.max(-1.2, Math.min(1.2, Math.atan2(y, Math.hypot(x, z))));
  }
  zoomBy(f: number) {
    this.zoom = Math.max(0.6, Math.min(3.2, this.zoom * f));
  }
  describe(i: number) {
    if (i < 0) return null;
    const d = this.data;
    const near: { i: number; name: string }[] = [];
    for (let k = 0; k < K; k++) near.push({ i: this.knn[i * K + k], name: d.names[this.knn[i * K + k]] });
    return { name: d.names[i], kind: KIND[d.k[i]] ?? "node", cluster: d.clusters[this.cl[i]], meta: d.meta[i] ?? {}, near };
  }

  private pick(x: number, y: number, r: number) {
    let best = -1;
    let bd = r * r;
    for (let i = 0; i < this.n; i++) {
      if (this.al[i] < 0.12) continue;
      let d = (this.sx[i] - x) ** 2 + (this.sy[i] - y) ** 2;
      if (this.data.k[i] === "t") d *= 1.8; // prefer the things over their tools
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private setHover(i: number) {
    if (i === this.hover) return;
    this.hover = i;
    this.canvas.classList.toggle("hovering", i >= 0);
    if (i < 0) {
      this.tip.style.opacity = "0";
      return;
    }
    const d = this.describe(i)!;
    this.tip.textContent = "";
    const b = document.createElement("b");
    b.textContent = d.name;
    const s = document.createElement("span");
    s.textContent = d.meta.o ? `tool · used in ${d.meta.o}` : `${d.kind} · ${d.cluster.name}`;
    this.tip.append(b, s);
    this.tip.style.setProperty("--c", d.cluster.color);
    this.tip.style.opacity = "1";
  }

  // ---------- frame ----------

  private loop() {
    cancelAnimationFrame(this.raf);
    if (!this.visible || document.hidden) return;
    let last = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.034, (now - last) / 1000);
      last = now;
      this.frame(dt, now / 1000);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private frame(dt: number, t: number) {
    const gl = this.gl!;
    const { n, W, H } = this;
    const d = this.data;
    const light = document.documentElement.classList.contains("light");
    const rgb = light ? this.rgbPaper : this.rgbDark;

    // unfold from a point the first time it scrolls into view
    if (!this.born) this.born = t;
    if (!this.reduced) this.grow = 1 - Math.exp(-(t - this.born) * 2.4);
    if (this.tyaw !== null) {
      const e = 1 - Math.exp(-dt * 5);
      this.yaw += (this.tyaw - this.yaw) * e;
      this.pitch += (this.tpitch - this.pitch) * e;
      if (Math.abs(this.tyaw - this.yaw) < 0.002) this.tyaw = null;
    } else if (!this.drag && !this.reduced && this.hover < 0 && this.state.selected < 0) {
      // sway about the open view instead of spinning through the edge-on one
      this.swayAt += dt;
      this.yaw += (this.home + Math.sin(this.swayAt * 0.22) * 0.55 - this.yaw) * (1 - Math.exp(-dt * 1.5));
    } else if (this.drag) {
      this.home = this.yaw;
      this.swayAt = 0;
    }
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const R = Math.min(W * 0.46, H * 0.58) * this.zoom;
    // smaller dots on a small frame, and less light per dot at night, where
    // overlapping points add up
    const dot = Math.max(0.55, Math.min(1, R / 300));
    const ink = light ? 1 : 0.72;
    const sel = this.state.selected;
    const fc = this.state.cluster;
    const out = this.out;
    const e = this.reduced ? 1 : 1 - Math.exp(-dt * 10);

    for (let i = 0; i < n; i++) {
      const g = Math.min(1, this.grow * (1.15 + this.phase[i] * 0.3));
      const x = this.pos[i * 3] * g;
      const y = this.pos[i * 3 + 1] * g;
      const z = this.pos[i * 3 + 2] * g;
      const x1 = x * cy + z * sy;
      const z1 = -x * sy + z * cy;
      const y2 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      const sc = 3.4 / (3.4 - z2);
      const px = (this.sx[i] = W / 2 + x1 * R * sc);
      const py = (this.sy[i] = H / 2 - y2 * R * sc);
      const tool = d.k[i] === "t";
      let ts = (tool ? 2.6 : 6.5) * dot * sc * sc * Math.sqrt(this.zoom);
      let ta = (tool ? 0.6 : 0.95) * ink * (0.45 + 0.55 * Math.min(1, Math.max(0, (z2 + 1.1) / 2)));
      if (fc >= 0 && this.cl[i] !== fc) ta *= 0.06;
      if (this.match) {
        if (this.match[i]) {
          ta = 1;
          ts *= 1.5;
        } else ta *= 0.06;
      }
      if (this.hi >= 0) {
        if (this.cl[i] === this.hi) {
          ts *= 1.3;
          ta = Math.min(1, ta * 1.8);
        } else ta *= 0.15;
      }
      if (i === sel) {
        ts *= 2.4;
        ta = 1;
      }
      if (i === this.hover) {
        ts = Math.max(ts * 1.8, 9);
        ta = 1;
      }
      const s = (this.sz[i] += (ts - this.sz[i]) * e);
      const a = (this.al[i] += (ta - this.al[i]) * e);
      const o = i * 7;
      out[o] = px;
      out[o + 1] = py;
      out[o + 2] = s;
      out[o + 3] = rgb[i * 3];
      out[o + 4] = rgb[i * 3 + 1];
      out[o + 5] = rgb[i * 3 + 2];
      out[o + 6] = a * Math.min(1, this.grow * 1.5);
    }

    // place names: nearest first, and one that would sit on another is hidden
    const placed: number[] = [];
    const proj = this.places.map((pl) => {
      const x1 = pl.x * cy + pl.z * sy;
      const z1 = -pl.x * sy + pl.z * cy;
      const y2 = pl.y * cp - z1 * sp;
      const z2 = pl.y * sp + z1 * cp;
      const sc = 3.4 / (3.4 - z2);
      return { pl, z2, x: W / 2 + x1 * R * sc * this.grow, y: H / 2 - y2 * R * sc * this.grow - 16 };
    });
    proj.sort((a, b) => b.z2 - a.z2);
    for (const { pl, x, y } of proj) {
      const w = pl.el.textContent!.length * 7 + 16;
      let hit = this.grow < 0.9;
      for (let i = 0; i < placed.length && !hit; i += 3) {
        hit = Math.abs(placed[i] - x) < (placed[i + 2] + w) / 2 && Math.abs(placed[i + 1] - y) < 18;
      }
      const lit = fc === pl.c || this.hi === pl.c;
      const dim = (fc >= 0 || this.hi >= 0 || !!this.match) && !lit;
      if (!hit || lit) placed.push(x, y, w);
      pl.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
      pl.el.style.opacity = hit && !lit ? "0" : dim ? "0.15" : "1";
    }

    this.setHover(this.drag ? -1 : this.pick(this.mx, this.my, 16));
    if (this.hover >= 0) {
      const tw = this.tip.offsetWidth;
      const x = Math.min(W - tw - 8, Math.max(8, this.sx[this.hover] + 14));
      this.tip.style.transform = `translate(${x}px,${this.sy[this.hover] - 34}px)`;
    }

    const bg = light ? [244, 241, 234] : [9, 11, 15];
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(bg[0] / 255, bg[1] / 255, bg[2] / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, light ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);

    // constellation lines for the selected and hovered nodes
    let o = 0;
    const ld = this.ldata;
    const add = (i: number, alpha: number) => {
      for (let k = 0; k < K; k++) {
        for (const q of [i, this.knn[i * K + k]]) {
          ld[o++] = this.sx[q];
          ld[o++] = this.sy[q];
          ld[o++] = rgb[i * 3];
          ld[o++] = rgb[i * 3 + 1];
          ld[o++] = rgb[i * 3 + 2];
          ld[o++] = alpha;
        }
      }
    };
    if (sel >= 0) add(sel, 0.75);
    if (this.hover >= 0 && this.hover !== sel) add(this.hover, 0.45);
    if (o) {
      const p = this.lprog;
      gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lbuf);
      gl.bufferData(gl.ARRAY_BUFFER, ld.subarray(0, o), gl.DYNAMIC_DRAW);
      const aPos = gl.getAttribLocation(p, "aPos");
      const aCol = gl.getAttribLocation(p, "aCol");
      gl.enableVertexAttribArray(aPos);
      gl.enableVertexAttribArray(aCol);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, 24, 8);
      gl.uniform2f(gl.getUniformLocation(p, "uRes"), W, H);
      gl.drawArrays(gl.LINES, 0, o / 6);
    }

    const p = this.prog;
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, out, gl.DYNAMIC_DRAW);
    const aPos = gl.getAttribLocation(p, "aPos");
    const aSize = gl.getAttribLocation(p, "aSize");
    const aCol = gl.getAttribLocation(p, "aCol");
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aSize);
    gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 28, 0);
    gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 28, 8);
    gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, 28, 12);
    gl.uniform2f(gl.getUniformLocation(p, "uRes"), W, H);
    gl.uniform1f(gl.getUniformLocation(p, "uDpr"), this.dpr);
    gl.uniform1f(gl.getUniformLocation(p, "uGlow"), light ? 0 : 1);
    gl.drawArrays(gl.POINTS, 0, n);
  }
}
