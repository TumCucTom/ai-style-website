// The instant stand-in: a keyword interpreter, not a language model. It maps
// words it recognises onto the same Spec the model emits, starting from the
// current spec so requests compose ("brutalist", then "make it pink", then
// "fewer projects"). It is labelled as a stand-in on the page.

import { ALL_SECTIONS, BLANK, SHAPES, type Focus, type Section, type Spec } from "./spec";

type Patch = { name?: string; theme?: Partial<Spec["theme"]>; layout?: Partial<Spec["layout"]>; tone?: Spec["tone"] };

// Whole looks. On a page that already exists these restyle it and leave the
// visitor's choice of sections, focus and project count alone.
const STYLES: { re: RegExp; patch: Patch }[] = [
  {
    re: /brutal/,
    patch: {
      name: "brutalist",
      theme: { bg: "#ffffff", ink: "#000000", accent: "#ff2a00", font: "mono", display: "grotesk", radius: 0, density: "normal", border: "heavy", case: "upper", fx: "none" },
      layout: { shape: "index", hero: "giant", columns: 2, sections: ALL_SECTIONS, images: false },
      tone: "loud",
    },
  },
  {
    re: /199\d|90s|nineties|geocities|retro web|web ?1\b|homepage|myspace/,
    patch: {
      name: "1997 homepage",
      theme: { bg: "#008080", ink: "#ffffff", accent: "#ffff00", font: "comic", display: "comic", radius: 0, density: "normal", border: "heavy", case: "normal", fx: "bevel" },
      layout: { shape: "desktop", hero: "marquee", columns: 3, sections: ALL_SECTIONS, images: true },
      tone: "friendly",
    },
  },
  {
    re: /terminal|hacker|console|\bcli\b|matrix|\bshell\b|command line|\bunix\b|\blinux\b|\bnerd/,
    patch: {
      name: "terminal",
      theme: { bg: "#050805", ink: "#35f06a", accent: "#ffb000", font: "mono", display: "mono", radius: 0, density: "dense", border: "hairline", case: "lower", fx: "scanlines" },
      layout: { shape: "shell", hero: "terminal", columns: 1, sections: ALL_SECTIONS, images: false },
      tone: "terse",
    },
  },
  {
    re: /newspaper|broadsheet|\btimes\b|editorial|gazette|tabloid/,
    patch: {
      name: "broadsheet",
      theme: { bg: "#f6f1e4", ink: "#141210", accent: "#7a0c0c", font: "serif", display: "serif", radius: 0, density: "dense", border: "hairline", case: "normal", fx: "rules" },
      layout: { shape: "paper", hero: "masthead", columns: 3, sections: ALL_SECTIONS, images: true },
      tone: "formal",
    },
  },
  {
    re: /neon|cyberpunk|vaporwave|synthwave|arcade|futuris|sci-?fi|\bspace\b|nightclub|\b80s\b|eighties/,
    patch: {
      name: "neon",
      theme: { bg: "#0d0221", ink: "#f4eaff", accent: "#ff2bd6", font: "mono", display: "grotesk", radius: 14, density: "normal", border: "hairline", case: "upper", fx: "grid" },
      layout: { shape: "poster", hero: "giant", columns: 3, sections: ALL_SECTIONS, images: true },
      tone: "terse",
    },
  },
  {
    re: /blueprint|technical drawing|\bcad\b|schematic/,
    patch: {
      name: "blueprint",
      theme: { bg: "#0b3a7a", ink: "#eaf2ff", accent: "#ffd84a", font: "mono", display: "grotesk", radius: 0, density: "normal", border: "hairline", case: "upper", fx: "grid" },
      layout: { shape: "rail", hero: "split", columns: 2, sections: ALL_SECTIONS, images: false },
      tone: "terse",
    },
  },
  {
    re: /poster|magazine|billboard|\bzine\b|punk/,
    patch: {
      name: "poster",
      theme: { bg: "#ffe14a", ink: "#17150a", accent: "#c2260a", font: "grotesk", display: "grotesk", radius: 0, density: "airy", border: "heavy", case: "upper", fx: "none" },
      layout: { shape: "poster", hero: "giant", columns: 2, sections: ALL_SECTIONS, images: true },
      tone: "loud",
    },
  },
  {
    re: /corporate|startup|saas|linkedin|apple|friendly app|bubbly|modern|sleek|\btech\b|product page|landing page/,
    patch: {
      name: "startup",
      theme: { bg: "#ffffff", ink: "#10131a", accent: "#2f5bff", font: "system", display: "system", radius: 18, density: "airy", border: "hairline", case: "normal", fx: "none" },
      layout: { shape: "bento", hero: "split", columns: 3, sections: ALL_SECTIONS, images: true },
      tone: "friendly",
    },
  },
  {
    re: /\bwarm|\bcalm\b(?! down)|cos[yi]|cozy|autumn|gentle|relax|homely|comfy|earthy|coffee|bookshop/,
    patch: {
      name: "warm",
      theme: { bg: "#f6ecdd", ink: "#2b2018", accent: "#b4532a", font: "serif", display: "serif", radius: 14, density: "airy", border: "hairline", case: "normal", fx: "none" },
      layout: { shape: "timeline", hero: "split", columns: 2, sections: ALL_SECTIONS, images: true },
      tone: "friendly",
    },
  },
  {
    re: /\bbank|financ|\blaw\b|lawyer|consult|professional|business|serious|recruiter|formal|trustworthy|executive|boardroom|grown.?up|\bsuit\b/,
    patch: {
      name: "boardroom",
      theme: { bg: "#f6f7f9", ink: "#0f1b33", accent: "#0b4aa2", font: "system", display: "serif", radius: 3, density: "normal", border: "hairline", case: "normal", fx: "none" },
      layout: { shape: "rail", hero: "split", columns: 2, sections: ALL_SECTIONS, images: false },
      tone: "formal",
    },
  },
  {
    re: /elegan|luxur|expensive|fancy|premium|classy|fashion|vogue|posh|\bgold\b.*\bblack\b|\bblack\b.*\bgold\b/,
    patch: {
      name: "expensive",
      theme: { bg: "#0f0e0c", ink: "#efe7d6", accent: "#c9a24a", font: "serif", display: "serif", radius: 0, density: "airy", border: "hairline", case: "normal", fx: "none" },
      layout: { shape: "index", hero: "giant", columns: 2, sections: ALL_SECTIONS, images: true },
      tone: "formal",
    },
  },
  {
    re: /playful|\bfun\b|\bkids?\b|\btoy|candy|\bcute|happy|cheerful|colou?rful|bouncy|silly/,
    patch: {
      name: "playful",
      theme: { bg: "#fff3d1", ink: "#2a1a4a", accent: "#ff3f7f", font: "system", display: "grotesk", radius: 28, density: "airy", border: "heavy", case: "normal", fx: "none" },
      layout: { shape: "bento", hero: "giant", columns: 3, sections: ALL_SECTIONS, images: true },
      tone: "friendly",
    },
  },
  {
    re: /\bretro\b|\b70s\b|seventies|vintage|groovy|\b60s\b|sixties|timetable/,
    patch: {
      name: "seventies",
      theme: { bg: "#f1dfba", ink: "#3b2414", accent: "#d2601a", font: "serif", display: "grotesk", radius: 22, density: "normal", border: "heavy", case: "normal", fx: "none" },
      layout: { shape: "timeline", hero: "giant", columns: 2, sections: ALL_SECTIONS, images: true },
      tone: "friendly",
    },
  },
  {
    re: /minimal|\bclean\b|\bsimple\b|\bquiet\b|swiss|plain|boring|notion|readme|\bwiki\b|understated|nothing fancy/,
    patch: {
      name: "minimal",
      theme: { bg: "#fbfbf9", ink: "#151515", accent: "#151515", font: "system", display: "system", radius: 0, density: "airy", border: "none", case: "normal", fx: "none" },
      layout: { shape: "stack", hero: "quiet", columns: 1, sections: ["projects", "experience", "contact"], images: false, limit: 6 },
      tone: "plain",
    },
  },
];

// name → the colour itself. Schemes are derived from it (see scheme()).
const HUES: Record<string, string> = {
  pink: "#e6006f",
  red: "#d21f14",
  orange: "#f26a0f",
  yellow: "#f2c200",
  gold: "#c9971a",
  green: "#1f9d55",
  lime: "#8fd400",
  mint: "#3fcf9a",
  teal: "#0f8f8f",
  cyan: "#12b5d6",
  turquoise: "#12b5a6",
  blue: "#1f5fe0",
  navy: "#1b2f7a",
  purple: "#7a3fe0",
  violet: "#7a3fe0",
  lavender: "#9d85e8",
  magenta: "#d417c0",
  maroon: "#7a0c1e",
  brown: "#7a4a1e",
  peach: "#f08a5d",
};
// Words that are a whole scheme rather than a hue.
const NEUTRALS: Record<string, { bg: string; ink: string }> = {
  black: { bg: "#070707", ink: "#f2f2f2" },
  white: { bg: "#ffffff", ink: "#111111" },
  grey: { bg: "#e6e6e3", ink: "#191919" },
  gray: { bg: "#e6e6e3", ink: "#191919" },
  beige: { bg: "#efe6d5", ink: "#2a2118" },
  cream: { bg: "#f4f1ea", ink: "#161614" },
  sand: { bg: "#e9dfc8", ink: "#2a2118" },
};

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}
const isDark = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 < 128;
};
/** A page scheme from one colour: washed out for light, deep for dark. */
function scheme(hue: string, mode: "light" | "dark") {
  return mode === "dark"
    ? { bg: mix(hue, "#000000", 0.84), ink: mix(hue, "#ffffff", 0.9), accent: mix(hue, "#ffffff", 0.35) }
    : { bg: mix(hue, "#ffffff", 0.84), ink: mix(hue, "#000000", 0.82), accent: mix(hue, "#000000", 0.12) };
}

const FOCUS_WORDS: [RegExp, Focus][] = [
  [/\b(ai|ml|machine learning|llms?|vlms?|vision)\b/, "ai"],
  [/\bhpc\b|high.performance|cluster|supercomput|parallel/, "hpc"],
  [/quantum|qubit|qaoa/, "quantum"],
  [/\bf1\b|formula|motorsport|racing/, "f1"],
  [/\bios\b|iphone|\bapps?\b|swift|\bmac\b/, "ios"],
  [/\bweb\b|websites?/, "web"],
  [/\bgames?\b|chess|quoridor/, "games"],
  [/defi|crypto|blockchain/, "defi"],
  [/puzzles?|rubik/, "puzzles"],
];

const SECTION_WORDS: [RegExp, Section][] = [
  [/\blive\b|stats|numbers|dashboard|right now/, "live"],
  [/projects?|\bwork\b|portfolio|things you('ve| have) (made|built)/, "projects"],
  [/experience|jobs?|career|\bcv\b|resume|employment/, "experience"],
  [/education|degree|school|university|\buni\b/, "education"],
  [/\bwins?\b|awards?|hackathons?|results|achievements?|competitions?/, "wins"],
  [/sports?|swim|ironman|triathlon|hobbies|interests/, "sport"],
  [/contact|email|links?/, "contact"],
];

const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, ten: 10, twelve: 12 };
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
const DENSITIES = ["dense", "normal", "airy"] as const;

export type StandinResult = { spec: Spec; understood: string[] };

export function interpret(prompt: string, current: Spec): StandinResult {
  const p = ` ${prompt.toLowerCase().replace(/[“”"]/g, "")} `;
  const understood: string[] = [];
  const blank = current.layout.sections.length === 0;
  const next: Spec = structuredClone(current);
  const apply = (patch: Patch, keepLayout: boolean) => {
    if (patch.name) next.name = patch.name;
    Object.assign(next.theme, patch.theme);
    if (keepLayout) {
      // a restyle of an existing page keeps what the visitor chose to show
      const { sections: _s, limit: _l, ...look } = patch.layout ?? {};
      Object.assign(next.layout, look);
    } else Object.assign(next.layout, patch.layout);
    if (patch.tone) next.tone = patch.tone;
  };

  // "default", "start again from normal"
  if (/\b(default|normal|reset|ordinary|regular)\b/.test(p)) {
    Object.assign(next.theme, BLANK.theme);
    next.layout = { ...BLANK.layout, hero: "split", sections: ALL_SECTIONS };
    next.tone = "plain";
    next.name = "default";
    understood.push("back to the default");
  }

  let styled = false;
  // "make it weird", "surprise me"
  if (/weird|surprise|random|chaos|chaotic|wild|crazy|whatever|anything|dealer'?s choice|go nuts/.test(p)) {
    const style = pick(STYLES.filter((s) => s.patch.name !== "minimal"));
    apply(style.patch, !blank);
    const hue = HUES[pick(Object.keys(HUES))];
    Object.assign(next.theme, scheme(hue, pick(["light", "dark"] as const)));
    next.theme.font = pick(["mono", "serif", "comic", "grotesk", "system"] as const);
    next.theme.display = pick(["grotesk", "serif", "comic", "mono"] as const);
    next.theme.radius = pick([0, 0, 8, 28]);
    next.theme.case = pick(["normal", "upper", "lower"] as const);
    next.theme.fx = pick(["none", "grid", "rules", "scanlines", "bevel"] as const);
    next.theme.border = pick(["hairline", "heavy"] as const);
    next.layout.hero = pick(["giant", "marquee", "split", "masthead", "terminal"] as const);
    next.layout.shape = pick(SHAPES);
    next.layout.columns = pick([1, 2, 3]);
    next.tone = pick(["dry", "friendly", "loud", "terse"] as const);
    next.name = "something weird";
    understood.push("weird (rolled at random, ask again for another)");
  } else {
    for (const s of STYLES) {
      if (s.re.test(p)) {
        styled = true;
        apply(s.patch, !blank);
        understood.push(`the ${s.patch.name} look`);
        break;
      }
    }
  }


  // ----- colour -----
  const wantsDark = /\b(dark|night|dark mode|darker)\b/.test(p);
  const wantsLight = /\b(light|light mode|lighter|bright|day|pastel|pale)\b/.test(p);
  const found: { word: string; at: number; role: "accent" | "text" | "bg" | "" }[] = [];
  for (const word of [...Object.keys(HUES), ...Object.keys(NEUTRALS)]) {
    const m = p.match(new RegExp(`\\b${word}\\b(?:\\s+(accents?|links?|highlights?|text|writing|background|bg))?`));
    if (!m) continue;
    const before = p.slice(Math.max(0, m.index! - 12), m.index!);
    const tail = m[1] ?? "";
    const role = /accent|link|highlight/.test(tail) || /accents?\s*$|links?\s*$/.test(before) ? "accent" : /text|writing/.test(tail) ? "text" : /background|bg/.test(tail) ? "bg" : "";
    found.push({ word, at: m.index!, role });
  }
  found.sort((a, b) => a.at - b.at);
  const hex = (w: string) => HUES[w] ?? NEUTRALS[w].bg;
  let schemed = false;
  for (const f of found) {
    if (f.role === "accent" || (schemed && !f.role)) {
      // "black and yellow": the second colour is the accent
      next.theme.accent = HUES[f.word] ?? NEUTRALS[f.word].ink;
      understood.push(`${f.word} accent`);
    } else if (f.role === "text") {
      next.theme.ink = hex(f.word);
      understood.push(`${f.word} text`);
    } else if (f.role === "bg") {
      next.theme.bg = hex(f.word);
      next.theme.ink = isDark(next.theme.bg) ? "#f3f3f0" : "#141414";
      understood.push(`${f.word} background`);
      schemed = true;
    } else {
      if (HUES[f.word]) {
        // a look named in the same breath keeps its own darkness ("a terminal, in green" stays dark)
        const deep = ["navy", "maroon", "brown"].includes(f.word);
        const mode = wantsDark ? "dark" : wantsLight ? "light" : styled ? (isDark(next.theme.bg) ? "dark" : "light") : deep ? "dark" : "light";
        Object.assign(next.theme, scheme(HUES[f.word], mode));
      } else {
        Object.assign(next.theme, NEUTRALS[f.word]);
        if (!found.some((o) => o !== f)) next.theme.accent = isDark(NEUTRALS[f.word].bg) ? "#ff5a36" : "#cc3c12";
      }
      if (!understood.length) next.name = f.word;
      understood.push(f.word);
      schemed = true;
    }
  }
  if (!schemed && (wantsDark || wantsLight)) {
    // "make it dark": flip the page, keep the accent
    const dark = wantsDark;
    if (isDark(next.theme.bg) !== dark) {
      next.theme.bg = dark ? "#0b0d12" : "#fbfaf6";
      next.theme.ink = dark ? "#eceae4" : "#161614";
    }
    if (!understood.length) next.name = dark ? "dark" : "light";
    understood.push(dark ? "dark" : "light");
  }

  // ----- what to show -----
  const focus = FOCUS_WORDS.filter(([re]) => re.test(p)).map(([, f]) => f);
  const only = /\bonly\b|\bjust\b|nothing but|focus/.test(p);
  const named = SECTION_WORDS.filter(([re]) => re.test(p)).map(([, s]) => s);
  if (focus.length && only) {
    next.layout.focus = focus;
    next.layout.sections = ["projects", "experience", "wins", "contact"];
    next.layout.limit = 24;
    if (understood.length === 0) next.name = `only ${focus.join(" and ")}`;
    understood.push(`only ${focus.join(" and ")}`);
  } else if (only && named.length && !focus.length) {
    // "just the projects"
    next.layout.sections = named.includes("contact") ? named : [...named, "contact"];
    understood.push(`only ${named.join(" and ")}`);
  } else if (/everything|all of it|show all|the lot|whole thing/.test(p)) {
    next.layout.focus = [];
    next.layout.sections = ALL_SECTIONS;
    understood.push("everything");
  }

  // "no sport", "hide education", "projects first", "add the wins"
  if (!(only && named.length && !focus.length)) {
    for (const [re, sec] of SECTION_WORDS) {
      const m = p.match(re);
      if (!m) continue;
      const before = p.slice(Math.max(0, m.index! - 20), m.index!);
      const after = p.slice(m.index! + m[0].length, m.index! + m[0].length + 14);
      if (/\b(no|hide|remove|without|drop|lose|skip|cut)\b[^.,]*$/.test(before)) {
        next.layout.sections = next.layout.sections.filter((s) => s !== sec);
        understood.push(`hide ${sec}`);
      } else if (/^\s*(first|at the top|up top|on top)/.test(after) || /\b(start with|lead with|open with)\b[^.,]*$/.test(before)) {
        next.layout.sections = [sec, ...next.layout.sections.filter((s) => s !== sec)];
        understood.push(`${sec} first`);
      } else if (/^\s*(last|at the bottom|at the end)/.test(after)) {
        next.layout.sections = [...next.layout.sections.filter((s) => s !== sec), sec];
        understood.push(`${sec} last`);
      } else if (/\b(add|show|include|with|bring back)\b[^.,]*$/.test(before) && !next.layout.sections.includes(sec)) {
        next.layout.sections = [...next.layout.sections, sec];
        understood.push(`show ${sec}`);
      }
    }
  }

  // the page's structure, asked for by name
  const SHAPE_WORDS: [RegExp, Spec["layout"]["shape"], string][] = [
    [/sidebar|side bar|side nav|two.pane/, "rail", "a sidebar"],
    [/timeline|chronolog|by year|year by year/, "timeline", "one timeline"],
    [/bento|mosaic|\btiles?\b|dashboard|collage/, "bento", "a mosaic of tiles"],
    [/\bindex\b|numbered|contents page|big list/, "index", "a numbered index"],
    [/front page|columns like a paper/, "paper", "a front page"],
    [/\bbands\b|stripes|huge words/, "poster", "poster bands"],
    [/windows 9|desktop|win95/, "desktop", "a 1997 desktop"],
    [/single column|one page scroll|stacked|ordinary layout|normal layout/, "stack", "stacked sections"],
  ];
  for (const [re, sh, say] of SHAPE_WORDS)
    if (re.test(p)) {
      next.layout.shape = sh;
      understood.push(say);
      break;
    }
  if (/different (layout|structure|shape)|another layout|change the layout|rearrange/.test(p)) {
    const others = SHAPES.filter((x) => x !== next.layout.shape);
    next.layout.shape = pick(others);
    understood.push("a different structure");
  }

  // how many projects
  const count = p.match(/\b(\d{1,2}|one|two|three|four|five|six|eight|ten|twelve)\s+(?:\w+\s+)?projects?\b/);
  if (count) (next.layout.limit = NUM[count[1]] ?? Number(count[1])), understood.push(`${next.layout.limit} projects`);
  else if (/\b(fewer|less|not so many|shorter)\b/.test(p)) (next.layout.limit = Math.max(3, Math.ceil(next.layout.limit / 2))), understood.push(`fewer projects (${next.layout.limit})`);
  else if (/\b(more projects|all (the |of the )?projects|every project|longer)\b/.test(p)) (next.layout.limit = Math.min(24, next.layout.limit * 2)), understood.push(`more projects (${next.layout.limit})`);

  // layout
  const col = p.match(/\b(one|two|three|four|1|2|3|4|single)[- ]col/);
  if (col) {
    next.layout.columns = col[1] === "single" ? 1 : Math.min(3, NUM[col[1]] ?? Number(col[1]));
    understood.push(`${next.layout.columns} column${next.layout.columns > 1 ? "s" : ""}`);
  } else if (/\b(list|stacked)\b/.test(p)) (next.layout.columns = 1), understood.push("one column");
  else if (/\b(grid|cards|tiles)\b/.test(p) && !/grid (lines|paper)/.test(p)) (next.layout.columns = 3), understood.push("three columns");
  if (/no (images|photos|pictures|pics)|text only|without (images|photos|pictures)/.test(p)) (next.layout.images = false), understood.push("no photos");
  else if (/\b(images|photos|pictures|pics)\b/.test(p)) (next.layout.images = true), understood.push("photos");

  // size: steps the density, which carries the type size
  const step = (d: number) => {
    const i = DENSITIES.indexOf(next.theme.density);
    next.theme.density = DENSITIES[Math.max(0, Math.min(2, i + d))];
  };
  if (/\b(bigger|larger|big text|zoom in|can'?t read)\b/.test(p)) step(1), understood.push("bigger");
  if (/\b(smaller|tiny|small text|zoom out)\b/.test(p)) step(-1), understood.push("smaller");
  if (/dense|compact|tight|cramm/.test(p)) (next.theme.density = "dense"), understood.push("dense");
  if (/airy|spacious|roomy|breath|whitespace|white space/.test(p)) (next.theme.density = "airy"), understood.push("airy");

  // shape and type
  if (/\bround|\bsoft|bubbl|\bpill|curv/.test(p)) (next.theme.radius = 22), understood.push("rounded");
  if (/sharp|square|boxy/.test(p)) (next.theme.radius = 0), understood.push("square corners");
  if (/no (borders|outlines|lines)|borderless/.test(p)) (next.theme.border = "none"), understood.push("no borders");
  else if (/(thick|heavy|chunky|fat) (borders|outlines|lines)/.test(p)) (next.theme.border = "heavy"), understood.push("heavy borders");
  else if (/(thin|fine) (borders|outlines|lines)|hairline/.test(p)) (next.theme.border = "hairline"), understood.push("thin borders");
  if (/\bserif\b/.test(p) && !/sans/.test(p)) (next.theme.font = next.theme.display = "serif"), understood.push("serif");
  if (/\bsans\b/.test(p) && !/comic/.test(p)) (next.theme.font = "system"), (next.theme.display = "grotesk"), understood.push("sans-serif");
  if (/monospace|\bmono\b|typewriter|\bcode font\b/.test(p)) (next.theme.font = next.theme.display = "mono"), understood.push("monospace");
  if (/comic/.test(p)) (next.theme.font = next.theme.display = "comic"), understood.push("comic sans");
  if (/normal case|sentence case|(stop|no|less|without) (the )?(shouting|caps|capitals)|calm down|quieter/.test(p)) (next.theme.case = "normal"), (next.tone = "plain"), understood.push("no shouting");
  else if (/lowercase|no capitals|whisper/.test(p)) (next.theme.case = "lower"), understood.push("lowercase");
  else if (/shout|\bcaps\b|capitals|uppercase|\bloud(er)?\b/.test(p)) (next.theme.case = "upper"), (next.tone = "loud"), understood.push("loud");
  if (/scanlines?|\bcrt\b/.test(p)) (next.theme.fx = "scanlines"), understood.push("scanlines");
  if (/grid (lines|paper)|graph paper/.test(p)) (next.theme.fx = "grid"), understood.push("grid paper");
  if (/no effects?|no fx/.test(p)) (next.theme.fx = "none"), understood.push("no effects");

  // voice
  if (/friendly|casual|chatty|\bnice\b/.test(p)) (next.tone = "friendly"), understood.push("friendly tone");
  if (/formal tone|formal voice|sound formal/.test(p)) (next.tone = "formal"), understood.push("formal tone");
  if (/\bdry\b|deadpan|sarcas/.test(p)) (next.tone = "dry"), understood.push("dry tone");
  if (/terse|brief|fewer words|less text/.test(p)) (next.tone = "terse"), understood.push("terse tone");

  // heading
  if (/\b(big|huge|giant|massive|enormous)\b/.test(p)) (next.layout.hero = "giant"), understood.push("giant heading");
  if (/\bbold(er)?\b|chunky|punchy/.test(p)) (next.theme.border = "heavy"), (next.layout.hero = "giant"), understood.push("bolder");
  if (/marquee|scroll(ing)? text|ticker/.test(p)) (next.layout.hero = "marquee"), understood.push("marquee heading");
  if (/masthead/.test(p)) (next.layout.hero = "masthead"), understood.push("masthead");
  if (/(small|quiet|modest) (heading|title|header|hero)/.test(p)) (next.layout.hero = "quiet"), understood.push("quiet heading");

  // From a blank sheet, any recognised request should produce a page.
  if (understood.length && blank && next.layout.sections.length === 0) next.layout.sections = ALL_SECTIONS;
  if (understood.length && blank && next.layout.hero === "quiet" && !/minimal|quiet/.test(next.name)) next.layout.hero = "split";
  if (!understood.length && blank) {
    // nothing recognised on a blank sheet: build the default so there is something to react to
    next.layout.sections = ALL_SECTIONS;
    next.layout.hero = "split";
    next.name = "default";
  }
  return { spec: next, understood };
}

export const STANDIN_KNOWS = "a look (brutalist, terminal, newspaper, warm, expensive, playful, 1997), a colour, “dark”, “no sport”, “only the quantum work”, “fewer projects” or “make it weird”";

export { BLANK };
