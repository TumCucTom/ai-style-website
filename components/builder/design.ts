// The freeform level. Where a Spec picks from a handful of options, a Design
// is something a capable model actually designs: which blocks, in what order
// and shape, a few headings of its own, and a whole stylesheet.
//
// None of it is trusted. Blocks are checked against a whitelist and rendered
// by React as text (never as HTML). The stylesheet is parsed, every selector
// is fenced inside the site's root element, and only known-safe properties
// and values survive. A shared link goes through exactly the same door.

import { FOCUS, type Focus } from "./spec";

export const BLOCKS = {
  hero: ["giant", "split", "quiet", "terminal", "masthead"],
  text: ["plain", "lead", "aside"],
  projects: ["grid", "list", "table", "cards", "marquee"],
  experience: ["timeline", "list", "table"],
  education: ["list", "cards"],
  wins: ["list", "table", "grid"],
  sport: ["list", "grid"],
  live: ["bignum", "row", "ticker"],
  contact: ["plain"],
  marquee: ["plain"],
  divider: ["plain"],
  image: ["plain", "wide", "cover", "round"],
  video: ["plain", "wide", "cover"],
} as const;
export type BlockType = keyof typeof BLOCKS;

export type Block = {
  type: BlockType;
  variant: string;
  /** heading the model wrote for this block (hero: the big line) */
  title: string;
  /** hero subtitle, or the body of a text/marquee block */
  text: string;
  /** width on a 12-column grid, so blocks can sit side by side */
  span: number;
  /** how many items a list shows */
  limit: number;
  /** only this kind of work; empty means everything */
  focus: Focus[];
  images: boolean;
  /** an extra class name for the stylesheet to hook */
  cls: string;
  /** image and video blocks: where the picture or clip is, on the web */
  src: string;
};

// The page's skeleton, under whatever the stylesheet does: stacked blocks on a
// grid, a sidebar, a mosaic, a front page, poster bands, or a numbered index.
export const FRAMES = ["stack", "rail", "bento", "paper", "poster", "index"] as const;
export type Frame = (typeof FRAMES)[number];

export type Design = { name: string; css: string; blocks: Block[]; frame?: Frame; fonts?: string[] };

// control characters and the two Unicode line separators have no business in a heading
const JUNK = new RegExp("[\\x00-\\x08\\x0b-\\x1f\\x7f" + String.fromCharCode(0x2028, 0x2029) + "]", "g");
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(JUNK, "").trim().slice(0, max) : "");

/**
 * A picture, clip or stylesheet image may come from anywhere on the web, but
 * only over https, only as a plain address (no login, no odd characters), and
 * never from this machine or a private network.
 */
export function mediaUrl(v: unknown): string {
  if (typeof v !== "string") return "";
  const raw = v.trim();
  if (raw.length < 12 || raw.length > 600 || !/^https:\/\//i.test(raw) || /[\s"'<>\\`(){}]/.test(raw)) return "";
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "";
  }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || u.username || u.password || !host.includes(".")) return "";
  if (/^(localhost|.*\.local|.*\.internal|\[.*\]|\d+\.\d+\.\d+\.\d+)$/.test(host)) return "";
  return u.href;
}

/** Web fonts are named, not linked: a few Google Fonts families, letters, digits and spaces only. */
function fontNames(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const f of v) {
    const name = typeof f === "string" ? f.trim().replace(/\s+/g, " ") : "";
    if (/^[A-Za-z0-9][A-Za-z0-9 ]{1,38}$/.test(name) && !out.includes(name)) out.push(name);
    if (out.length === 3) break;
  }
  return out;
}

/**
 * Whatever came in, return a Design that is safe to render, and say what was changed.
 * `media: false` is for a model that can't be trusted to know real addresses: no pictures, clips or web fonts.
 */
export function validateDesign(input: unknown, { media = true }: { media?: boolean } = {}): { design: Design; notes: string[] } | null {
  if (!input || typeof input !== "object") return null;
  const src = input as Record<string, unknown>;
  const notes: string[] = [];
  const raw = Array.isArray(src.blocks) ? src.blocks : [];
  const blocks: Block[] = [];
  for (const b of raw.slice(0, 24)) {
    if (!b || typeof b !== "object") continue;
    const o = b as Record<string, unknown>;
    const type = String(o.type) as BlockType;
    if (!Object.hasOwn(BLOCKS, type)) {
      notes.push(`dropped an unknown block “${clean(String(o.type), 20)}”`);
      continue;
    }
    const variants = BLOCKS[type] as readonly string[];
    const variant = variants.includes(String(o.variant)) ? String(o.variant) : variants[0];
    const src = media ? mediaUrl(o.src) : "";
    if ((type === "image" || type === "video") && !src) {
      notes.push(`dropped ${type === "image" ? "an image" : "a video"} with no usable https address`);
      continue;
    }
    const span = Math.round(Number(o.span));
    const limit = Math.round(Number(o.limit));
    blocks.push({
      type,
      variant,
      title: clean(o.title, 90),
      text: clean(o.text, type === "text" ? 420 : 220),
      span: Number.isFinite(span) && span >= 3 && span <= 12 ? span : 12,
      limit: Number.isFinite(limit) && limit >= 1 ? Math.min(limit, 66) : type === "projects" ? 9 : 12,
      focus: Array.isArray(o.focus) ? (o.focus.filter((f) => (FOCUS as readonly string[]).includes(f as string)) as Focus[]) : [],
      images: o.images !== false,
      cls: clean(o.cls, 24).replace(/[^a-z0-9-]/gi, ""),
      src,
    });
  }
  if (raw.length > 24) notes.push("kept the first 24 blocks");
  if (!blocks.length) return null;
  // contact is the one thing a page must not lose
  if (!blocks.some((b) => b.type === "contact")) {
    blocks.push({ type: "contact", variant: "plain", title: "Say hi", text: "", span: 12, limit: 1, focus: [], images: false, cls: "", src: "" });
    notes.push("added the contact block");
  }
  const { css, dropped } = sanitizeCss(typeof src.css === "string" ? src.css : "", media);
  if (dropped) notes.push(`removed ${dropped} thing${dropped === 1 ? "" : "s"} from the stylesheet that could reach outside the page`);
  const frame = (FRAMES as readonly string[]).includes(String(src.frame)) ? (src.frame as Frame) : "stack";
  const fonts = media ? fontNames(src.fonts) : [];
  return { design: { name: clean(src.name, 40) || "Untitled", css, blocks, frame, ...(fonts.length ? { fonts } : {}) }, notes };
}

// ---------- the stylesheet ----------

// Properties a page design needs. Nothing here can load a resource, run
// anything, or position an element relative to the window.
const PROP =
  /^(--[a-z0-9-]+|color|accent-color|caret-color|opacity|visibility|background(-(color|image|size|position|repeat|clip|origin|blend-mode|attachment))?|font(-(family|size|weight|style|variant|variant-numeric|stretch|feature-settings|kerning|synthesis))?|line-height|letter-spacing|word-spacing|text-(align|align-last|transform|decoration|decoration-(color|line|style|thickness)|underline-offset|indent|shadow|overflow|wrap|rendering|orientation|emphasis)|white-space|word-break|overflow-wrap|hyphens|tab-size|writing-mode|direction|vertical-align|margin(-(top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?|padding(-(top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?|border(-(top|right|bottom|left|inline|block))?(-(width|style|color))?|border-(radius|collapse|spacing|image)|border-(top|bottom)-(left|right)-radius|outline(-(width|style|color|offset))?|box-(shadow|sizing|decoration-break)|display|grid(-(template|template-columns|template-rows|template-areas|area|column|row|auto-flow|auto-columns|auto-rows|column-start|column-end|row-start|row-end))?|flex(-(direction|wrap|flow|grow|shrink|basis))?|gap|row-gap|column-gap|order|align-(items|self|content)|justify-(items|self|content)|place-(items|self|content)|columns|column-(count|width|rule|rule-color|rule-style|rule-width|span|fill)|width|height|min-width|min-height|max-width|max-height|inline-size|block-size|aspect-ratio|object-(fit|position)|overflow(-(x|y))?|position|top|right|bottom|left|inset(-(inline|block))?|z-index|float|clear|transform(-(origin|style))?|rotate|scale|translate|perspective|transition(-(property|duration|timing-function|delay))?|animation(-(name|duration|timing-function|delay|iteration-count|direction|fill-mode|play-state))?|filter|backdrop-filter|mix-blend-mode|isolation|clip-path|list-style(-(type|position))?|counter-(reset|increment|set)|content|quotes|cursor|user-select|scroll-(margin|padding)(-(top|bottom))?|break-(inside|before|after)|text-wrap|font-variation-settings|-webkit-text-stroke(-(width|color))?|-webkit-background-clip|-webkit-text-fill-color)$/;

const BAD_VALUE = /url\s*\(|image-set|element\s*\(|expression|javascript:|@import|behavior|-moz-binding|\\|[<>{}]|paint\s*\(|src\s*\(/i;
const SELECTOR_OK = /^[a-z0-9 .#:>+~*_\-[\]="'()^$|,%]+$/i;

// url() is allowed for pictures only: in these properties, pointing at a checked https address,
// and never in a rule that looks at attributes or form fields (a stylesheet that can both read a
// value and fetch an address can leak the one through the other).
const URL_PROP = /^(background|background-image|border-image|border-image-source|list-style|list-style-image)$/;
const CSS_URL = /url\(\s*(["']?)([^"')\s]+)\1\s*\)/gi;

function declarations(body: string, kf: Map<string, string>, urls = false): { out: string; dropped: number } {
  let dropped = 0;
  const keep: string[] = [];
  for (const part of body.split(";")) {
    const i = part.indexOf(":");
    if (i < 1) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    let value = part.slice(i + 1).trim().replace(/\s*!important\s*$/i, "");
    let bare = value;
    if (/url\s*\(/i.test(value) && urls && URL_PROP.test(prop)) {
      let ok = true;
      let seen = 0;
      const checked = value.replace(CSS_URL, (_m, _q, addr) => {
        const safe = mediaUrl(addr);
        if (!safe) ok = false;
        seen++;
        return `url("${safe}")`;
      });
      // every url( in the value has to be one that was read and checked; anything the pattern skipped fails it
      if (ok && seen === (value.match(/url\s*\(/gi) ?? []).length) {
        value = checked;
        // judge the rest of the value with the checked addresses taken out
        bare = value.replace(/url\("[^"]*"\)/g, "none");
      }
    }
    if (!PROP.test(prop) || !value || value.length > 1400 || BAD_VALUE.test(bare)) {
      dropped++;
      continue;
    }
    // nothing may pin itself to the window or sit above the page's own controls
    if (prop === "position" && !/^(static|relative|absolute)$/i.test(value)) {
      dropped++;
      continue;
    }
    if (prop === "z-index") value = String(Math.max(0, Math.min(20, parseInt(value, 10) || 0)));
    if (prop === "animation" || prop === "animation-name") {
      for (const [from, to] of kf) value = value.replace(new RegExp(`(^|[\\s,])${from}(?=$|[\\s,])`, "g"), `$1${to}`);
    }
    keep.push(`${prop}:${value}`);
  }
  return { out: keep.join(";"), dropped };
}

function scope(selector: string): string | null {
  const parts: string[] = [];
  for (let s of selector.split(",")) {
    s = s.trim();
    if (!s || !SELECTOR_OK.test(s)) return null;
    // the page's root stands in for the document
    s = s.replace(/(^|[\s>+~])(:root|html|body)(?![\w-])/gi, "$1").replace(/^\.fs(?![\w-])/, "").trim();
    if (/:(has|host|global)|::?(backdrop|view-transition)/i.test(s)) return null;
    // a leading sibling combinator would select things next to the page, not in it
    if (/^[~+]/.test(s)) return null;
    parts.push(s ? `.fs ${s}` : ".fs");
  }
  return parts.length ? parts.join(",") : null;
}

/** Parse a stylesheet and rebuild it from only the parts that are allowed. */
export function sanitizeCss(input: string, media = true): { css: string; dropped: number } {
  let dropped = 0;
  const raw = input.slice(0, 24000).replace(/\/\*[\s\S]*?\*\//g, "");
  // statements with no block (@import, @charset, @namespace) are never copied
  const src = raw.replace(/@[a-z-]+[^;{}]*;/gi, () => {
    dropped++;
    return "";
  });
  // keyframe names are global, so they get a prefix of their own
  const kf = new Map<string, string>();
  for (const m of src.matchAll(/@keyframes\s+([a-z0-9_-]+)/gi)) kf.set(m[1], `fs-${m[1]}`.slice(0, 40));

  const rules = (text: string, depth: number): string => {
    let out = "";
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      const head = text.slice(i, open).trim();
      // find the matching brace
      let n = 1;
      let j = open + 1;
      while (j < text.length && n) {
        if (text[j] === "{") n++;
        else if (text[j] === "}") n--;
        j++;
      }
      if (n) break; // unbalanced: stop here
      const body = text.slice(open + 1, j - 1);
      i = j;
      if (head.startsWith("@")) {
        const media = /^@media\s+([a-z0-9\s():,.<>=-]+)$/i.exec(head);
        const frames = /^@keyframes\s+([a-z0-9_-]+)$/i.exec(head);
        if (media && depth === 0 && !/url|import/i.test(media[1])) out += `@media ${media[1].trim()}{${rules(body, 1)}}`;
        else if (frames && depth === 0) {
          let steps = "";
          for (const m of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            const step = m[1].trim();
            if (!/^(from|to|\d{1,3}(\.\d+)?%)(\s*,\s*(from|to|\d{1,3}(\.\d+)?%))*$/i.test(step)) continue;
            const d = declarations(m[2], kf);
            dropped += d.dropped;
            steps += `${step}{${d.out}}`;
          }
          out += `@keyframes ${kf.get(frames[1])}{${steps}}`;
        } else dropped++;
        continue;
      }
      if (body.includes("{")) {
        dropped++; // nested rules: not supported, not needed
        continue;
      }
      const sel = scope(head);
      if (!sel) {
        dropped++;
        continue;
      }
      const d = declarations(body, kf, media && !/[\[\]]|\b(input|textarea|select|form)\b|gate/i.test(head));
      dropped += d.dropped;
      if (d.out) out += `${sel}{${d.out}}`;
    }
    return out;
  };
  // anything outside a rule (a stray @import, say) is simply never copied
  return { css: rules(src, 0), dropped };
}

// ---------- what a model is told ----------

/** JSON Schema for engines that support structured output. */
export const DESIGN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "css", "blocks"],
  properties: {
    name: { type: "string", description: "Two or three words naming this version." },
    frame: { type: "string", enum: [...FRAMES], description: "The page's skeleton." },
    fonts: { type: "array", items: { type: "string" }, description: "Up to three Google Fonts family names to load." },
    css: { type: "string", description: "The stylesheet for the page. Plain CSS rules; selectors are relative to the page root." },
    blocks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "variant", "title", "text", "span", "limit", "focus", "images", "cls"],
        properties: {
          type: { type: "string", enum: Object.keys(BLOCKS) },
          variant: { type: "string" },
          title: { type: "string" },
          text: { type: "string" },
          span: { type: "integer" },
          limit: { type: "integer" },
          focus: { type: "array", items: { type: "string", enum: [...FOCUS] } },
          images: { type: "boolean" },
          cls: { type: "string" },
          src: { type: "string", description: "image and video blocks: an https address" },
        },
      },
    },
  },
} as const;

/** The block reference, as prose a model (or a person) can follow. */
export const BLOCK_GUIDE = `BLOCKS (each is {type, variant, title, text, span, limit, focus, images, cls}):
- hero: variant giant | split | quiet | terminal | masthead. title = the big line, text = one sentence under it.
- text: variant plain | lead | aside. title optional, text = up to two sentences of your own connective copy.
- projects: variant grid | list | table | cards | marquee. limit = how many (1-66). images true/false.
- experience: variant timeline | list | table.
- education: variant list | cards.
- wins: variant list | table | grid (hackathons and competitions).
- sport: variant list | grid (sport and interests).
- live: variant bignum | row | ticker (GitHub contributions, chess ratings, last song).
- contact: variant plain. Always include one. It renders a puzzle gate; you cannot change what is inside.
- marquee: text = a short line that scrolls across. divider: a rule.
- image: variant plain | wide | cover | round. src = an https address of a picture or GIF. title = alt text (say what it shows), text = optional caption.
- video: variant plain | wide | cover. src = an https address of an .mp4 or .webm. It plays muted, on a loop, with no controls, so use short clips.
FRAME (top-level "frame", optional, default "stack"): the page's skeleton. Pick the one the idea calls for; do not default to stack.
- stack: blocks flow on the 12-column grid using span.
- rail: the hero is a sticky sidebar on the left, everything else scrolls in one column on the right.
- bento: every block is a tile in a dense mosaic; span sets tile width.
- paper: a newspaper front page; lists flow in text columns under a centred masthead.
- poster: full-width bands, very large block titles, lists as ruled rows.
- index: lists become big numbered rows, one item per line, no images.
Common fields: title = heading for the block (yours to write). span = width out of 12 (12 full, 6 half, 4 third, 8 two-thirds; blocks flow left to right and wrap). focus = [] for everything or a subset of ${FOCUS.join(", ")} to show only that work. cls = an extra class name you can target.

HTML YOU ARE STYLING (class names are fixed):
.fs                      the page root (set background, color, font here)
.fs-grid                 12-column grid holding the blocks
section.b.b-TYPE.v-VARIANT[.cls]   each block
  h2.b-title             its heading
  .hero-title (h1), .hero-sub (p)            in hero
  .text-body (p)                               in text
  ul.items > li.item                           in projects, experience, education, wins, sport
    img.item-img, .item-name, .item-line, .item-meta, .item-org
  .nums > .num > b.num-v + span.num-k          in live
  .mq > span                                   in marquee and projects/marquee
  hr                                           in divider
  figure > img.pic + figcaption.cap            in image
  video.clip                                   in video
The base stylesheet already lays each variant out sensibly in black on white, so your CSS only needs to say what should be different. It may use any normal property (grid, flex, gradients, shadows, transforms, transitions, @keyframes, @media). It may not use @import, @font-face or position: fixed or sticky; those are stripped.

PICTURES, GIFS, CLIPS AND FONTS FROM THE WEB (use them; a page with real imagery is far better than one without):
- In blocks: image and video blocks, above. In CSS: url("https://…") in background, background-image, border-image and list-style-image, for textures, hero backdrops and the like. Put a background-color behind any background image so text stays readable if it fails to load.
- Every address must be https, a direct link to the file (not a web page about it), and one you are sure exists. If you can browse or search, find real ones. If you cannot, use sources whose addresses you can construct: https://picsum.photos/seed/ANYWORD/1600/900 (a photograph, always works, the word picks it), https://placehold.co/1200x800/1a1a1a/ffffff?text=Words (flat colour with text), and Wikimedia Commons upload.wikimedia.org addresses you know. Do not invent plausible-looking addresses: a broken picture is hidden, which leaves a hole.
- Pictures must suit a personal site that anyone might open: nothing explicit, nothing of real people other than public-domain or freely licensed images.
- "fonts": up to three Google Fonts family names (e.g. ["Fraunces", "Space Grotesk"]). They are loaded for you; then use them in font-family with a fallback. Otherwise use families likely installed (system-ui, Georgia, "Times New Roman", "Courier New", ui-monospace, "Comic Sans MS", Impact, "Helvetica Neue", Arial) or var(--font-display) for a heavy grotesque.

HTML for the new blocks: section.b-image > figure > img.pic + figcaption.cap ; section.b-video > video.clip`;

// ---------- sharing ----------

const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
type Streams = { CompressionStream?: new (f: string) => TransformStream<Uint8Array, Uint8Array>; DecompressionStream?: new (f: string) => TransformStream<Uint8Array, Uint8Array> };
async function pipe(bytes: Uint8Array, stream: TransformStream<Uint8Array, Uint8Array>) {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** A Design, deflated into something that fits in a link. Null if it is too big to share. */
export async function encodeDesign(d: Design): Promise<string | null> {
  const bytes = new TextEncoder().encode(JSON.stringify(d));
  const CS = (globalThis as Streams).CompressionStream;
  const packed = CS ? "z" + b64url(await pipe(bytes, new CS("deflate-raw"))) : "j" + b64url(bytes);
  return packed.length > 12000 ? null : packed;
}

export async function decodeDesign(hash: string): Promise<{ design: Design; notes: string[] } | null> {
  const m = /[#&]d=([zj])([A-Za-z0-9_-]{8,16000})/.exec(hash);
  if (!m) return null;
  try {
    let bytes = unb64url(m[2]);
    if (m[1] === "z") {
      const DS = (globalThis as Streams).DecompressionStream;
      if (!DS) return null;
      bytes = await pipe(bytes, new DS("deflate-raw"));
    }
    if (bytes.length > 60000) return null;
    return validateDesign(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

/** Find the JSON in whatever someone pasted back: fenced, bare, or with chatter around it. */
export function parseReply(text: string): unknown | null {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  const candidates = [...fenced, text];
  for (const c of candidates) {
    const start = c.indexOf("{");
    if (start < 0) continue;
    // walk to the matching brace, minding strings
    let depth = 0;
    let inStr = false;
    for (let i = start; i < c.length; i++) {
      const ch = c[i];
      if (inStr) {
        if (ch === "\\") i++;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try {
          return JSON.parse(c.slice(start, i + 1));
        } catch {
          break;
        }
      }
    }
  }
  return null;
}
