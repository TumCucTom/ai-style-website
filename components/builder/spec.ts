// The contract between "whatever wrote the spec" (the in-browser model, or the
// keyword stand-in) and the page. Nothing outside these whitelists is ever
// applied: enums are checked, numbers clamped, colours must be #rrggbb, and
// text contrast is repaired. The spec chooses and arranges; every word about
// Tom comes from the data files or from the pre-written headlines below.

export const FONTS = ["grotesk", "serif", "mono", "system", "comic"] as const;
export const DENSITY = ["airy", "normal", "dense"] as const;
export const BORDER = ["none", "hairline", "heavy"] as const;
export const CASE = ["normal", "upper", "lower"] as const;
export const FX = ["none", "scanlines", "bevel", "rules", "grid"] as const;
export const HERO = ["giant", "split", "terminal", "masthead", "marquee", "quiet"] as const;
// The page's skeleton. "stack" is a headline over stacked sections; the rest are in shapes.tsx.
export const SHAPES = ["stack", "shell", "paper", "rail", "index", "bento", "poster", "timeline", "desktop"] as const;
export const SECTIONS = ["live", "projects", "experience", "education", "wins", "sport", "contact"] as const;
export const FOCUS = ["ai", "hpc", "quantum", "f1", "ios", "web", "games", "defi", "puzzles"] as const;
export const TONE = ["plain", "loud", "dry", "formal", "friendly", "terse"] as const;

export type Section = (typeof SECTIONS)[number];
export type Focus = (typeof FOCUS)[number];

export type Spec = {
  name: string;
  theme: {
    bg: string;
    ink: string;
    accent: string;
    font: (typeof FONTS)[number];
    display: (typeof FONTS)[number];
    radius: number;
    density: (typeof DENSITY)[number];
    border: (typeof BORDER)[number];
    case: (typeof CASE)[number];
    fx: (typeof FX)[number];
  };
  layout: {
    shape: (typeof SHAPES)[number];
    hero: (typeof HERO)[number];
    columns: number;
    sections: Section[];
    focus: Focus[];
    limit: number;
    images: boolean;
  };
  tone: (typeof TONE)[number];
};

/** The blank sheet the page opens on. */
export const BLANK: Spec = {
  name: "blank sheet",
  theme: {
    bg: "#f4f1ea",
    ink: "#161614",
    accent: "#cc3c12",
    font: "serif",
    display: "grotesk",
    radius: 4,
    density: "normal",
    border: "hairline",
    case: "normal",
    fx: "none",
  },
  layout: { shape: "stack", hero: "quiet", columns: 2, sections: [], focus: [], limit: 8, images: true },
  tone: "plain",
};

export const ALL_SECTIONS: Section[] = [...SECTIONS];

// Headlines are picked by tone, never written by the model. They are in my
// own words; "formal" is the only one that sounds like a CV, because someone
// asked for that.
export const HEADLINES: Record<Spec["tone"], { h: string; sub: string }> = {
  plain: {
    h: "Tom Bale",
    sub: "I'm a product engineer at Anima, in London. Before that I did computer science at Bristol.",
  },
  loud: {
    h: "It's Tom Bale.",
    sub: "Product engineer at Anima. The shouting was your idea.",
  },
  dry: {
    h: "Tom Bale. I make software.",
    sub: "Currently at Anima. There's a degree and an Ironman further down, if that's your thing.",
  },
  formal: {
    h: "Thomas Bale",
    sub: "Product Engineer, Anima (YC W21). BSc Computer Science, First Class Honours, University of Bristol.",
  },
  friendly: {
    h: "Hi, I'm Tom.",
    sub: "I'm a product engineer at Anima and I make a lot of side projects. Have a look around.",
  },
  terse: { h: "Tom Bale.", sub: "Product engineer, Anima." },
};

const HEX = /^#[0-9a-f]{6}$/i;

function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

type Loose = Record<string, unknown>;
const obj = (v: unknown): Loose => (v && typeof v === "object" && !Array.isArray(v) ? (v as Loose) : {});

/**
 * Turn anything into a valid Spec. Unknown or out-of-range values fall back
 * to `base`; `notes` says what was changed so the page can show it.
 */
export function validate(input: unknown, base: Spec = BLANK): { spec: Spec; notes: string[] } {
  const notes: string[] = [];
  const src = obj(input);
  const t = obj(src.theme);
  const l = obj(src.layout);

  function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T, label: string): T {
    if (typeof v === "string" && (allowed as readonly string[]).includes(v.toLowerCase())) return v.toLowerCase() as T;
    if (v !== undefined) notes.push(`${label}: "${String(v).slice(0, 24)}" is not allowed, kept ${fallback}`);
    return fallback;
  }
  function colour(v: unknown, fallback: string, label: string) {
    if (typeof v === "string" && HEX.test(v.trim())) return v.trim().toLowerCase();
    if (v !== undefined) notes.push(`${label}: not a #rrggbb colour, kept ${fallback}`);
    return fallback;
  }
  function num(v: unknown, lo: number, hi: number, fallback: number, label: string) {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (!Number.isFinite(n)) {
      if (v !== undefined) notes.push(`${label}: not a number, kept ${fallback}`);
      return fallback;
    }
    const c = Math.round(Math.min(hi, Math.max(lo, n)));
    if (c !== n) notes.push(`${label}: ${n} clamped to ${c}`);
    return c;
  }
  function list<T extends string>(v: unknown, allowed: readonly T[], fallback: T[], label: string): T[] {
    if (!Array.isArray(v)) {
      if (v !== undefined) notes.push(`${label}: not a list, kept previous`);
      return fallback;
    }
    const out: T[] = [];
    for (const item of v) {
      const s = typeof item === "string" ? item.toLowerCase() : "";
      if ((allowed as readonly string[]).includes(s)) {
        if (!out.includes(s as T)) out.push(s as T);
      } else notes.push(`${label}: dropped "${String(item).slice(0, 24)}"`);
    }
    return out;
  }

  const bg = colour(t.bg, base.theme.bg, "theme.bg");
  let ink = colour(t.ink, base.theme.ink, "theme.ink");
  let accent = colour(t.accent, base.theme.accent, "theme.accent");
  if (contrast(bg, ink) < 4.5) {
    const fixed = lum(bg) > 0.4 ? "#111111" : "#f5f5f5";
    notes.push(`theme.ink: ${ink} is unreadable on ${bg}, changed to ${fixed}`);
    ink = fixed;
  }
  if (contrast(bg, accent) < 2.2) {
    notes.push(`theme.accent: ${accent} disappears on ${bg}, changed to the text colour`);
    accent = ink;
  }

  const name =
    typeof src.name === "string"
      ? src.name.replace(/[^\w \-'.,&]/g, "").trim().slice(0, 40) || base.name
      : base.name;

  const spec: Spec = {
    name,
    theme: {
      bg,
      ink,
      accent,
      font: pick(t.font, FONTS, base.theme.font, "theme.font"),
      display: pick(t.display, FONTS, base.theme.display, "theme.display"),
      radius: num(t.radius, 0, 28, base.theme.radius, "theme.radius"),
      density: pick(t.density, DENSITY, base.theme.density, "theme.density"),
      border: pick(t.border, BORDER, base.theme.border, "theme.border"),
      case: pick(t.case, CASE, base.theme.case, "theme.case"),
      fx: pick(t.fx, FX, base.theme.fx, "theme.fx"),
    },
    layout: {
      shape: pick(l.shape, SHAPES, base.layout.shape, "layout.shape"),
      hero: pick(l.hero, HERO, base.layout.hero, "layout.hero"),
      columns: num(l.columns, 1, 3, base.layout.columns, "layout.columns"),
      sections: list(l.sections, SECTIONS, base.layout.sections, "layout.sections"),
      focus: list(l.focus, FOCUS, base.layout.focus, "layout.focus"),
      limit: num(l.limit, 3, 24, base.layout.limit, "layout.limit"),
      images: typeof l.images === "boolean" ? l.images : base.layout.images,
    },
    tone: pick(src.tone, TONE, base.tone, "tone"),
  };
  return { spec, notes };
}

/** JSON Schema handed to the model so its output is grammar-constrained. */
export const SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    theme: {
      type: "object",
      properties: {
        bg: { type: "string" },
        ink: { type: "string" },
        accent: { type: "string" },
        font: { type: "string", enum: FONTS },
        display: { type: "string", enum: FONTS },
        radius: { type: "integer" },
        density: { type: "string", enum: DENSITY },
        border: { type: "string", enum: BORDER },
        case: { type: "string", enum: CASE },
        fx: { type: "string", enum: FX },
      },
      required: ["bg", "ink", "accent", "font", "display", "radius", "density", "border", "case", "fx"],
    },
    layout: {
      type: "object",
      properties: {
        shape: { type: "string", enum: SHAPES },
        hero: { type: "string", enum: HERO },
        columns: { type: "integer" },
        sections: { type: "array", items: { type: "string", enum: SECTIONS } },
        focus: { type: "array", items: { type: "string", enum: FOCUS } },
        limit: { type: "integer" },
        images: { type: "boolean" },
      },
      required: ["shape", "hero", "columns", "sections", "focus", "limit", "images"],
    },
    tone: { type: "string", enum: TONE },
  },
  required: ["name", "theme", "layout", "tone"],
} as const;

// ----- sharing: the spec, base64url-encoded in the URL hash -----

export function encode(spec: Spec) {
  const bytes = new TextEncoder().encode(JSON.stringify(spec));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decode(hash: string): Spec | null {
  try {
    const raw = hash.replace(/^#?s=/, "").replace(/-/g, "+").replace(/_/g, "/");
    if (!raw) return null;
    const bin = atob(raw);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    // a shared link is untrusted input like any other: it goes through validate
    return validate(JSON.parse(new TextDecoder().decode(bytes))).spec;
  } catch {
    return null;
  }
}
