// The real path: a small instruct model running in the visitor's browser on
// WebGPU, via WebLLM. Nothing here runs until the visitor asks for it; the
// library itself comes from a CDN at that moment, so it is not in the bundle.

import { DESIGN_SCHEMA } from "./design";
import { LOCAL_BRIEF } from "./prompts";
import { SCHEMA, type Spec } from "./spec";

// From WebLLM's prebuilt list (src/config.ts of 0.2.88). Download sizes are
// the totals of the files in each mlc-ai Hugging Face repo; "vram" is what
// WebLLM says the model needs on the GPU. Weights are cached by the browser
// after the first load.
export const MODELS = {
  small: { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 0.5B", downloadMB: 290, vramMB: 945, minutes: "a few minutes" },
  // Chosen by testing: on eight design requests the 3B wrote distinct, complete
  // pages; the 1.5B (880 MB) mostly reworked the examples it was shown.
  big: { id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", label: "Qwen2.5 3B", downloadMB: 1750, vramMB: 2505, minutes: "ten to twenty minutes" },
} as const;
export type LocalModel = keyof typeof MODELS;
/** "290 MB", "1.7 GB" */
export const size = (mb: number) => (mb >= 1000 ? `${(Math.floor(mb / 100) / 10).toFixed(1)} GB` : `${mb} MB`);
/** Kept for callers that only know the small one. */
export const MODEL = MODELS.small;

const WEBLLM_URL = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.88/+esm";

type Engine = {
  chat: {
    completions: {
      create(req: unknown): Promise<{ choices: { message: { content: string | null } }[] }>;
    };
  };
};

export type Support = { ok: true; f16: boolean } | { ok: false; why: string };

export async function checkSupport(): Promise<Support> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
  if (!gpu) return { ok: false, why: "This browser has no WebGPU, which the model needs. Recent Chrome, Edge and Safari have it." };
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { ok: false, why: "WebGPU is here but no GPU adapter is available on this device." };
    return { ok: true, f16: adapter.features.has("shader-f16") };
  } catch {
    return { ok: false, why: "WebGPU is here but could not be started on this device." };
  }
}

const engines: Partial<Record<LocalModel, Engine>> = {};

export async function loadModel(which: LocalModel, onProgress: (fraction: number, text: string) => void) {
  if (engines[which]) return;
  // A URL import the bundler must leave alone: resolved by the browser at click time.
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ WEBLLM_URL);
  engines[which] = (await mod.CreateMLCEngine(MODELS[which].id, {
    initProgressCallback: (r: { progress: number; text: string }) => onProgress(r.progress, r.text),
  })) as Engine;
}

export const modelReady = (which: LocalModel = "small") => !!engines[which];

/** True if this browser already holds the weights, so loading takes seconds, not minutes. */
export async function isCached(which: LocalModel = "small"): Promise<boolean> {
  try {
    if (!("caches" in window) || !(await caches.has("webllm/model"))) return false;
    const keys = await (await caches.open("webllm/model")).keys();
    return keys.some((k) => k.url.includes(MODELS[which].id));
  } catch {
    return false;
  }
}

/** "Fetching param cache[3/8]: …" → "3 of 8 files". WebLLM only reports when a whole file lands. */
export function files(text: string): string {
  const m = text.match(/\[(\d+)\/(\d+)\]/);
  return m ? `${m[1]} of ${m[2]} files` : "";
}

const SYSTEM = `You restyle and rearrange a personal website by editing a JSON spec. You never write content about the person; you only choose values.
Reply with one JSON object and nothing else, with exactly these keys:
- name: 2-3 words naming this version.
- theme.bg, theme.ink, theme.accent: colours as #rrggbb. ink must be readable on bg.
- theme.font and theme.display: one of grotesk, serif, mono, system, comic.
- theme.radius: 0 to 28. theme.density: airy, normal or dense. theme.border: none, hairline or heavy.
- theme.case: normal, upper or lower. theme.fx: none, scanlines, bevel, rules or grid.
- layout.shape: the page structure. stack (sections of cards), shell (a terminal session), paper (newspaper front page), rail (sidebar and rows), index (big numbered list), bento (mosaic of tiles), poster (bands, huge words), timeline (everything by year), desktop (1997 windows). Pick the one that suits the request; do not always pick stack.
- layout.hero: giant, split, terminal, masthead, marquee or quiet.
- layout.columns: 1 to 3. layout.limit: how many projects, 3 to 24. layout.images: true or false.
- layout.sections: which to show, in order, from live, projects, experience, education, wins, sport, contact.
- layout.focus: [] for everything, or a subset of ai, hpc, quantum, f1, ios, web, games, defi, puzzles to show only that work.
- tone: plain, loud, dry, formal, friendly or terse.
Start from the current spec and change only what the request asks for. Colour words in the request decide the colours. Commit to the look the request describes.`;

// A 0.5B model follows examples far better than rules, so it gets a few.
const base = { radius: 4, density: "normal", border: "hairline", case: "normal", fx: "none" };
const SHOTS: [string, unknown][] = [
  [
    "a green terminal, only projects and contact",
    {
      name: "green terminal",
      theme: { ...base, bg: "#050805", ink: "#35f06a", accent: "#ffb000", font: "mono", display: "mono", radius: 0, density: "dense", case: "lower", fx: "scanlines" },
      layout: { shape: "shell", hero: "terminal", columns: 1, sections: ["projects", "contact"], focus: [], limit: 8, images: false },
      tone: "terse",
    },
  ],
  [
    "pink and friendly, rounded",
    {
      name: "pink and friendly",
      theme: { ...base, bg: "#ffd6e7", ink: "#3a0020", accent: "#e6006f", font: "system", display: "grotesk", radius: 24, density: "airy" },
      layout: { shape: "bento", hero: "split", columns: 3, sections: ["live", "projects", "experience", "education", "wins", "sport", "contact"], focus: [], limit: 9, images: true },
      tone: "friendly",
    },
  ],
  [
    "like an old newspaper",
    {
      name: "old newspaper",
      theme: { ...base, bg: "#f6f1e4", ink: "#141210", accent: "#7a0c0c", font: "serif", display: "serif", radius: 0, density: "dense", fx: "rules" },
      layout: { shape: "paper", hero: "masthead", columns: 3, sections: ["live", "projects", "experience", "education", "wins", "sport", "contact"], focus: [], limit: 12, images: true },
      tone: "formal",
    },
  ],
  [
    "dark blue, just the quantum and HPC work, big heading",
    {
      name: "quantum and hpc",
      theme: { ...base, bg: "#0a1a44", ink: "#eef3ff", accent: "#6fd0ff", font: "system", display: "grotesk", radius: 6 },
      layout: { shape: "index", hero: "giant", columns: 2, sections: ["projects", "experience", "wins", "contact"], focus: ["quantum", "hpc"], limit: 24, images: true },
      tone: "plain",
    },
  ],
];

/** Ask the model for a new spec. The caller validates whatever comes back. */
export async function askModel(which: LocalModel, prompt: string, current: Spec): Promise<unknown> {
  const engine = engines[which];
  if (!engine) throw new Error("model not loaded");
  const res = await engine.chat.completions.create({
    messages: [
      { role: "system", content: SYSTEM },
      ...SHOTS.flatMap(([ask, spec]) => [
        { role: "user", content: `Request: ${ask}` },
        { role: "assistant", content: JSON.stringify(spec) },
      ]),
      { role: "user", content: `Current spec:\n${JSON.stringify(current)}\n\nRequest: ${prompt.slice(0, 400)}` },
    ],
    // low: it should follow the request, not improvise
    temperature: 0.2,
    max_tokens: 420,
    response_format: { type: "json_object", schema: JSON.stringify(SCHEMA) },
  });
  // Parsed as data, never evaluated.
  return JSON.parse(res.choices[0].message.content ?? "{}");
}

/** Ask a local model for a whole Design (blocks and a stylesheet). The caller validates it. */
export async function askModelDesign(which: LocalModel, prompt: string): Promise<unknown> {
  const engine = engines[which];
  if (!engine) throw new Error("model not loaded");
  const res = await engine.chat.completions.create({
    messages: [
      { role: "system", content: LOCAL_BRIEF },
      { role: "user", content: `Request: ${prompt.slice(0, 400)}` },
    ],
    temperature: 0.5,
    max_tokens: 1500,
    response_format: { type: "json_object", schema: JSON.stringify(DESIGN_SCHEMA) },
  });
  return JSON.parse(res.choices[0].message.content ?? "{}");
}

/** For the test harness: the exact prompts and schemas the engines use. */
export const __prompts = { SYSTEM, SHOTS, SCHEMA, LOCAL_BRIEF, DESIGN_SCHEMA };
