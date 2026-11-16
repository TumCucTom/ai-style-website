"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { BLANK, decode, encode, validate, type Spec } from "./spec";
import { interpret, STANDIN_KNOWS } from "./standin";
import { __prompts, askModel, askModelDesign, checkSupport, files, isCached, loadModel, MODELS, modelReady, size, type LocalModel, type Support } from "./model";
import { decodeDesign, encodeDesign, FRAMES, parseReply, sanitizeCss, validateDesign, type Design, type Frame } from "./design";
import { brief, pastePrompt } from "./prompts";
import { ChatHome } from "./Chat";
import { Freeform } from "./Freeform";
import { Site, type Content } from "./Site";

type Source = "start" | "stand-in" | "model" | "model + keyword rules" | "link" | "bigger model" | "your Claude, pasted";
// A version is either a Spec (a pick from fixed options) or a Design (blocks and a stylesheet a model wrote).
type Entry = { spec: Spec; design?: Design; prompt: string; source: Source; notes: string[] };

type EngineId = "rules" | "small" | "big" | "paste";
const ENGINES: { id: EngineId; name: string; note: string; studio: boolean }[] = [
  { id: "rules", name: "Keyword rules", note: "Instant. Picks from looks I made in advance", studio: false },
  { id: "small", name: "Small model in your browser", note: `${size(MODELS.small.downloadMB)} download. Picks from the same looks`, studio: false },
  { id: "big", name: "Bigger model in your browser", note: `${size(MODELS.big.downloadMB)} download. Writes its own layout and CSS, slowly`, studio: false },
  { id: "paste", name: "Your own Claude, by copy and paste", note: "Designs the whole page. Nothing connects to anything", studio: true },
];

const PRESETS = ["brutalist", "a terminal", "like a newspaper", "warm and calm", "looks expensive", "make it weird"];
// Shown once a page exists: the kind of thing you'd say next.
const FOLLOW_UPS = ["make it dark", "bigger", "fewer projects", "no photos", "only the HPC and ML work", "make it weird"];

/**
 * Model output and keyword rules, combined. Anything the request spelled out
 * in words the rules recognise (a colour, "terminal", "no sport") is fixed;
 * the model only gets a say in what was left open. It adds taste, it does not
 * get to overrule an explicit ask.
 */
function settle(current: Spec, rules: Spec, model: Spec): Spec {
  const out = structuredClone(model);
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const k of Object.keys(current.theme) as (keyof Spec["theme"])[]) {
    if (!same(rules.theme[k], current.theme[k])) (out.theme as Record<string, unknown>)[k] = rules.theme[k];
  }
  for (const k of Object.keys(current.layout) as (keyof Spec["layout"])[]) {
    if (!same(rules.layout[k], current.layout[k])) (out.layout as Record<string, unknown>)[k] = rules.layout[k];
  }
  if (rules.tone !== current.tone) out.tone = rules.tone;
  // Two things a small model reaches for at random and that wreck a page when
  // nobody asked: capitals everywhere, and the Windows 95 or CRT effects.
  // Those only ever come from the keyword rules.
  if (same(rules.theme.case, current.theme.case)) out.theme.case = current.theme.case;
  if (same(rules.theme.fx, current.theme.fx) && (out.theme.fx === "bevel" || out.theme.fx === "scanlines")) out.theme.fx = current.theme.fx;
  return out;
}

const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

const FONT: Record<Spec["theme"]["font"], string> = {
  grotesk: "var(--font-display), system-ui, sans-serif",
  serif: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  system: "system-ui, -apple-system, sans-serif",
  comic: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive',
};
const DENSITY = { airy: ["2.4rem", "18px"], normal: ["1.5rem", "16.5px"], dense: ["0.85rem", "14.5px"] } as const;
const BORDER = { none: "0px", hairline: "1px", heavy: "3px" } as const;
const CASE = { normal: "none", upper: "uppercase", lower: "lowercase" } as const;

function vars(spec: Spec): React.CSSProperties {
  const t = spec.theme;
  return {
    "--bg": t.bg,
    "--ink": t.ink,
    "--accent": t.accent,
    "--radius": `${t.radius}px`,
    "--pad": DENSITY[t.density][0],
    "--size": DENSITY[t.density][1],
    "--bw": BORDER[t.border],
    "--tt": CASE[t.case],
    "--font": FONT[t.font],
    // the display grotesk only ships in bold weights, which is what headings use
    "--display": FONT[t.display],
    "--cols": spec.layout.columns,
    "--cols-md": Math.min(spec.layout.columns, 2),
  } as React.CSSProperties;
}

// The versions I made by hand. The prompt is the front door; these are the rooms.
const VERSIONS = [
  { href: "/tunnel", kind: "tunnel", name: "Wind tunnel", line: "The page is a fluid simulation and the text gets in its way." },
  { href: "/world", kind: "world", name: "World tour", line: "A globe with the places things happened. You can walk around a few of them." },
  { href: "/chess", kind: "chess", name: "A career in 17 moves", line: "What I've done so far, pinned to the moves of a famous chess game. Or play me." },
  { href: "/paper", kind: "paper", name: "The paper", line: "Everything, written up like a research paper. The long one." },
  // the CV is its own site; "minimal" is only the key for its thumbnail and preview image
  { href: "https://cv.thomasbale.com", kind: "minimal", name: "The CV", line: "One page, black on white. On its own site." },
] as const;

/** A small drawing of each version, so the list reads as a set of places to go. */
function Thumb({ kind }: { kind: (typeof VERSIONS)[number]["kind"] | "studio" }) {
  const a = "var(--accent)";
  return (
    <svg viewBox="0 0 96 60" className="llm-thumb" aria-hidden="true">
      {kind === "tunnel" && (
        <>
          <rect x="14" y="10" width="30" height="12" fill="currentColor" />
          <path d="M8 34c9-6 13 6 22 0s13 6 22 0 13 6 22 0 9 3 14 0" fill="none" stroke={a} strokeWidth="2" strokeLinecap="round" />
          <path d="M8 44c9-6 13 6 22 0s13 6 22 0 13 6 22 0 9 3 14 0" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".45" strokeLinecap="round" />
        </>
      )}
      {kind === "world" && (
        <>
          <circle cx="48" cy="30" r="21" fill="none" stroke="currentColor" strokeWidth="2" />
          <ellipse cx="48" cy="30" rx="9" ry="21" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
          <path d="M27 30h42M31 19h34M31 41h34" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
          <path d="M40 23q13-11 21 5" fill="none" stroke={a} strokeWidth="2" strokeLinecap="round" />
          <circle cx="40" cy="23" r="2.5" fill={a} />
          <circle cx="61" cy="28" r="2.5" fill={a} />
        </>
      )}
      {kind === "chess" && (
        <>
          <rect x="27" y="9" width="42" height="42" fill="none" stroke="currentColor" strokeWidth="2" />
          {[0, 1, 2].flatMap((r) => [0, 1, 2].filter((c) => (r + c) % 2 === 0).map((c) => <rect key={`${r}${c}`} x={27 + c * 14} y={9 + r * 14} width="14" height="14" fill="currentColor" />))}
          <circle cx="62" cy="30" r="4" fill={a} />
        </>
      )}
      {kind === "paper" && (
        <>
          <path d="M14 13h40" stroke="currentColor" strokeWidth="4" />
          <path d="M14 24h28M14 31h28M14 38h28M14 45h20" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
          <rect x="52" y="23" width="30" height="23" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
          <path d="M55 40c6-10 9 2 13-5s6-3 11-7" fill="none" stroke={a} strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {kind === "minimal" && (
        <>
          <path d="M32 13h32" stroke="currentColor" strokeWidth="4" />
          <path d="M14 22h68" stroke="currentColor" strokeWidth="2" />
          <path d="M14 31h46M14 38h56M14 45h40" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
          <path d="M70 31h12M74 45h8" stroke={a} strokeWidth="1.5" />
        </>
      )}
      {kind === "studio" && (
        <>
          <rect x="14" y="12" width="68" height="16" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20h18" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
          <path d="M42 16v8" stroke={a} strokeWidth="2" />
          <path d="M14 38h30M14 45h22M52 38h30M52 45h30" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
        </>
      )}
    </svg>
  );
}


if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  // test hook: lets a script exercise the sanitiser and prompts directly
  (window as unknown as Record<string, unknown>).__builder = { ...__prompts, validateDesign, sanitizeCss, parseReply, encodeDesign, decodeDesign, brief, pastePrompt };
}

/**
 * The builder. On the home page it offers the engines that run with no
 * account: keyword rules and the two models that download into the browser.
 * On /studio (which is served with a strict Content-Security-Policy) it
 * offers the two that use the visitor's own Claude.
 */
export function Builder({ content, studio = false }: { content: Content; studio?: boolean }) {
  // History and position are one value, held in a ref and mirrored into
  // state. The ref moves the moment a request is made; the state follows when
  // the view transition gets round to painting. So a quick follow-up always
  // builds on the newest version, and the position can never run off the end.
  type Trail = { history: Entry[]; at: number };
  const trail = useRef<Trail>({ history: [{ spec: BLANK, prompt: "", source: "start", notes: [] }], at: 0 });
  const [{ history, at }, setTrail] = useState<Trail>(trail.current);
  function move(fn: (t: Trail) => Trail) {
    const next = fn(trail.current);
    trail.current = next;
    commit(() => setTrail(next));
  }
  const step = (d: number) => move((t) => ({ ...t, at: Math.max(0, Math.min(t.history.length - 1, t.at + d)) }));
  const newest = () => trail.current.history[trail.current.at];

  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState<EngineId>(studio ? "paste" : "rules");
  const [panel, setPanel] = useState(studio);
  const [support, setSupport] = useState<Support | null>(null);
  const [cached, setCached] = useState<Record<LocalModel, boolean>>({ small: false, big: false });
  const [progress, setProgress] = useState<{ which: LocalModel; f: number; text: string; since: number } | null>(null);
  const [now, setNow] = useState(0);
  const [copied, setCopied] = useState("");
  // paste bridge
  const [wish, setWish] = useState("");
  const [reply, setReply] = useState("");
  const [pasteError, setPasteError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const entry = history[at];
  const spec = entry.spec;
  const design = entry.design;
  const blank = !design && spec.layout.sections.length === 0;
  // The home page is a conversation: a built page shows in the thread as a reply with a preview,
  // and opens as the whole page from there (or from a shared link).
  const [view, setView] = useState<"chat" | "page">("chat");
  const chatting = !studio && view === "chat";
  const [asking, setAsking] = useState("");
  // A link inside the preview pane can lead back here. The chat must not open inside itself:
  // tell the page that owns the pane to close it and show its own list of versions.
  const [nested, setNested] = useState(false);
  useEffect(() => {
    if (window.self === window.top || !chatting) return;
    setNested(true);
    window.parent.postMessage({ tb: "versions" }, location.origin);
  }, [chatting]);
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setOpenUrl(null);
    if (blank) return;
    if (!design) setOpenUrl(`/#s=${encode(spec)}`);
    else encodeDesign(design).then((packed) => live && setOpenUrl(packed ? `/#d=${packed}` : null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);

  // The swap is the point of the page, so it is animated: a view transition
  // where the browser has them, a plain state change where it doesn't.
  function commit(update: () => void) {
    type Transition = { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void>; skipTransition?: () => void };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => Transition };
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (doc.startViewTransition && !calm && !document.hidden) {
      // The browser runs the callback on its next frame. If no frame comes
      // (throttled or background tab), apply the change anyway: every update
      // passed in here sets a precomputed value, so running it twice is safe.
      let done = false;
      const t = doc.startViewTransition(() => {
        done = true;
        flushSync(update);
      });
      // a skipped transition rejects these; the update still happens
      for (const p of [t.ready, t.finished, t.updateCallbackDone]) p.catch(() => {});
      window.setTimeout(() => {
        if (done) return;
        done = true;
        t.skipTransition?.();
        update();
      }, 400);
    } else update();
  }

  function push(next: Entry) {
    move((t) => {
      // entry 0 is always the blank sheet, so "start over" has somewhere to go
      const kept = [...t.history.slice(0, t.at + 1), next];
      const h = kept.length > 30 ? [kept[0], ...kept.slice(-29)] : kept;
      return { history: h, at: h.length - 1 };
    });
  }

  function restart() {
    setView("chat");
    move((t) => ({ ...t, at: 0 }));
    setMessage("");
    window.scrollTo({ top: 0 });
    input.current?.focus();
  }

  // A shared link carries a version in its hash. It is validated like any other input.
  useEffect(() => {
    const open = (e: Entry) => {
      if (trail.current.history.length === 1) {
        move((t) => ({ history: [...t.history, e], at: 1 }));
        setView("page"); // a shared link is the page itself, not a conversation about it
      }
    };
    const shared = decode(location.hash);
    if (shared && shared.layout.sections.length) open({ spec: shared, prompt: "", source: "link", notes: [] });
    else decodeDesign(location.hash).then((d) => d && open({ spec: BLANK, design: d.design, prompt: "", source: "link", notes: d.notes }));
    // a second shared link opened in the same tab only changes the hash
    const onHash = () => {
      if (decode(location.hash) || /[#&]d=/.test(location.hash)) location.reload();
    };
    window.addEventListener("hashchange", onHash);
    // which engine a link from the home page asked for
    const want = new URLSearchParams(location.search).get("with");
    if (studio && want === "paste") {
      setEngine(want);
      setPanel(true);
    }
    return () => window.removeEventListener("hashchange", onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // while a model downloads, a clock: the library reports nothing for the first minute or so
  useEffect(() => {
    if (!progress) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [progress]);

  /** A model's reply, of any origin, into a version on the page. */
  function accept(raw: unknown, prompt: string, source: Source): boolean {
    // a small local model invents addresses, so it gets no pictures, clips or web fonts
    const checked = validateDesign(raw, { media: source !== "bigger model" });
    if (!checked) return false;
    if (source === "bigger model") {
      // a small model often ignores "only the HPC work"; the keyword rules don't, so they set the filter
      const focus = interpret(prompt, BLANK).spec.layout.focus;
      if (focus.length) for (const b of checked.design.blocks) if (b.type === "projects" || b.type === "experience" || b.type === "wins") b.focus = focus;
      // A small model reaches for the same skeleton every time. A look the keyword rules know sets it;
      // otherwise it rotates with the request, so two requests don't come out as one page in two colours.
      const pinned = interpret(prompt, BLANK).spec.layout.shape;
      const FROM: Record<string, Frame> = { paper: "paper", rail: "rail", index: "index", bento: "bento", poster: "poster", timeline: "rail", shell: "index" };
      let n = 0;
      for (const c of prompt) n = (n * 31 + c.charCodeAt(0)) >>> 0;
      checked.design.frame = FROM[pinned] ?? FRAMES[1 + (n % (FRAMES.length - 1))];
      // it designs; it doesn't get to write about me. The headline stays my name and its filler copy goes.
      checked.design.blocks = checked.design.blocks.filter((b) => b.type !== "text" && b.type !== "marquee");
      for (const b of checked.design.blocks)
        if (b.type === "hero") {
          if (!/\btom\b/i.test(b.title)) b.title = "Tom Bale";
          b.text = "I'm a product engineer at Anima, in London.";
        }
    }
    push({ spec: BLANK, design: checked.design, prompt, source, notes: checked.notes });
    setMessage(
      `That's “${checked.design.name}”, from ${source === "bigger model" ? "the bigger model" : source}. It did the layout, the CSS and the headings. The facts are from my data.` +
        (checked.notes.length ? ` I tidied it: ${checked.notes.join("; ")}.` : ""),
    );
    return true;
  }

  const root = useRef<HTMLDivElement>(null);
  async function run(prompt: string) {
    const ask = prompt.trim();
    if (!ask || busy) return;
    setText("");
    setCopied("");
    if (/^(undo|go back|back|previous|revert)( (one|that|it))?[.!]?$/i.test(ask) && trail.current.at > 0) {
      step(-1);
      setMessage("Went back one.");
      return;
    }
    if (/^(start (over|again)|blank|clear|wipe it)\b/i.test(ask)) {
      restart();
      return;
    }
    setAsking(ask);
    const current = newest();
    // the settings panel would sit on top of the page it is about to build
    if (engine !== "paste") setPanel(false);

    if (engine === "paste") {
      // nothing can be sent anywhere, so the visitor carries it: open the two-step panel
      setWish(ask);
      setReply("");
      setPasteError("");
      setPanel(true);
      return;
    }

    if (engine === "big" && modelReady("big")) {
      setBusy(true);
      setMessage("The bigger model is working on it. This takes up to a minute.");
      try {
        const raw = await askModelDesign("big", ask);
        if (!accept(raw, ask, "bigger model")) throw new Error("unusable");
      } catch {
        // it could not produce a design: fall back to choosing from the fixed set
        const rules = interpret(ask, current.spec);
        push({ spec: validate(rules.spec, current.spec).spec, prompt: ask, source: "stand-in", notes: [] });
        setMessage(`The bigger model didn't produce a usable design, so the keyword rules took it (${rules.understood.join(", ") || "they didn't recognise anything"}).`);
      }
      setBusy(false);
      return;
    }

    const rules = interpret(ask, current.spec);
    if (engine === "small" && modelReady("small")) {
      setBusy(true);
      setMessage("The model is having a think.");
      try {
        const raw = await askModel("small", ask, current.spec);
        const fromModel = validate(raw, current.spec);
        // what the keyword rules recognised is fixed; the model fills in the rest
        const mixed = settle(current.spec, rules.understood.length ? rules.spec : current.spec, fromModel.spec);
        const { spec: next, notes } = validate(mixed, current.spec);
        if (next.layout.sections.length === 0) next.layout.sections = ["projects", "experience", "contact"];
        // the model sometimes forgets the contact section; only an explicit ask removes it
        if (!next.layout.sections.includes("contact") && (!rules.understood.length || rules.spec.layout.sections.includes("contact"))) next.layout.sections.push("contact");
        // and sometimes picks an accent identical to the text colour
        if (next.theme.accent.toLowerCase() === next.theme.ink.toLowerCase()) next.theme.accent = current.spec.theme.accent;
        // its names are unreliable ("cousin" for a cosy evening), so the name is the look or the request
        next.name = rules.spec.name !== current.spec.name ? rules.spec.name : ask.split(/\s+/).slice(0, 4).join(" ").slice(0, 32);
        push({ spec: next, prompt: ask, source: rules.understood.length ? "model + keyword rules" : "model", notes: [...fromModel.notes, ...notes] });
        setMessage(
          rules.understood.length
            ? `The keyword rules pinned ${rules.understood.join(", ")}. The model chose the rest.`
            : "The model chose all of that. It's a small model, so results vary.",
        );
      } catch {
        push({ spec: validate(rules.spec, current.spec).spec, prompt: ask, source: "stand-in", notes: [] });
        setMessage(`The model fell over on that one, so the keyword rules took it (${rules.understood.join(", ") || "they didn't recognise anything"}).`);
      }
      setBusy(false);
      return;
    }
    const checked = validate(rules.spec, current.spec);
    push({ spec: checked.spec, prompt: ask, source: "stand-in", notes: checked.notes });
    setMessage(
      rules.understood.length
        ? `Picked up: ${rules.understood.join(", ")}.`
        : `Didn't catch any of that. These are keyword rules, not a model, so try ${STANDIN_KNOWS}.`,
    );
  }

  async function openPanel() {
    setPanel(true);
    if (studio) return;
    if (!support) setSupport(await checkSupport());
    setCached({ small: await isCached("small"), big: await isCached("big") });
  }

  // Runs in the background: the page stays usable on the keyword rules meanwhile.
  async function download(which: LocalModel) {
    setProgress({ which, f: 0, text: "", since: Date.now() });
    setNow(Date.now());
    try {
      await loadModel(which, (f, t) => setProgress((p) => (p ? { ...p, f, text: t } : p)));
      setEngine(which);
      setProgress(null);
      setCached((c) => ({ ...c, [which]: true }));
      setMessage(
        which === "small"
          ? `${MODELS.small.label} is running on your GPU. It gets the requests from here on, with the keyword rules keeping it honest.`
          : `${MODELS.big.label} is running on your GPU. It designs the whole page itself from here on. Give it a request.`,
      );
    } catch (e) {
      setProgress(null);
      setSupport({ ok: false, why: `The model wouldn't load here (${e instanceof Error ? e.message.slice(0, 120) : "unknown error"}). The keyword rules still work.` });
    }
  }

  async function copy(what: string, label: string) {
    try {
      await navigator.clipboard.writeText(what);
      setCopied(label);
      return true;
    } catch {
      setCopied("");
      return false;
    }
  }

  async function share() {
    const packed = design ? await encodeDesign(design) : null;
    if (design && !packed) {
      setMessage("This one is too big to fit in a link. Ask for a simpler stylesheet, then share again.");
      return;
    }
    const url = `${location.origin}${location.pathname}#${design ? `d=${packed}` : `s=${encode(spec)}`}`;
    window.history.replaceState(null, "", url);
    if (!(await copy(url, "link"))) setMessage("Your browser blocked the copy. The link is in the address bar.");
  }

  function build() {
    setPasteError("");
    const raw = parseReply(reply);
    if (!raw) {
      setPasteError("I couldn't find any JSON in that. Paste the whole reply, including the code block.");
      return;
    }
    if (!accept(raw, wish, "your Claude, pasted")) {
      setPasteError("There's JSON in that, but no blocks I can use. Ask your Claude to follow the format in the prompt, then paste again.");
      return;
    }
    setReply("");
    setPanel(false);
    // the steps sat above the page; start the new one from its top
    window.scrollTo({ top: 0 });
  }

  const chips = blank ? (studio ? ["a magazine cover", "an airport departures board", "a film poster", "a zine", "a bank statement"] : PRESETS) : studio || design ? ["make it calmer", "bolder", "two columns", "only the HPC and ML work", "something completely different"] : FOLLOW_UPS;
  const waited = progress ? clock(Math.max(0, now - progress.since)) : "";
  const landed = progress ? files(progress.text) : "";
  // a local model that is chosen but not loaded yet doesn't build anything: the keyword rules do, and the label says so
  const waitingFor = (engine === "small" || engine === "big") && !modelReady(engine) ? engine : null;
  const engineName = waitingFor
    ? `keyword rules (${progress?.which === waitingFor ? "the model is still downloading" : "the model isn't loaded yet"})`
    : ENGINES.find((e) => e.id === engine)!.name;
  const offered = ENGINES.filter((e) => e.studio === studio || e.id === "rules");
  const elsewhere = ENGINES.filter((e) => e.studio !== studio && e.id !== "rules");

  function Local({ which }: { which: LocalModel }) {
    const m = MODELS[which];
    if (modelReady(which)) return <p className="llm-dim">{m.label} is loaded and running on your GPU.</p>;
    const mine = progress?.which === which;
    return (
      <>
        <p>
          <b>{m.label}</b> downloads into your browser and runs on your GPU. Nothing you type leaves your machine.{" "}
          {cached[which] ? (
            <b>It&apos;s already downloaded here, so it starts in a few seconds.</b>
          ) : (
            <>
              It&apos;s about <b>{size(m.downloadMB)}</b> and takes {m.minutes} on a decent connection. It wants roughly {size(m.vramMB)} of GPU memory, so use a laptop. The bar sits at zero for the first minute or so, then moves
              in jumps. It looks stuck. It isn&apos;t.
            </>
          )}{" "}
          {which === "big" ? "This one writes its own layout and CSS. It takes 15 to 50 seconds a page. It's still a small model, so some pages come out badly and some headings aren't ones I'd have written." : "This one picks from the same looks as the keyword rules."}
        </p>
        {support === null && <p>Checking your browser…</p>}
        {support && !support.ok && <p className="llm-warn">{support.why}</p>}
        {support?.ok && !support.f16 && <p className="llm-warn">Your GPU doesn&apos;t report shader-f16, which this model may need. It might not start.</p>}
        {mine && progress && (
          <>
            <div className={`llm-progress ${progress.f < 0.01 ? "is-waiting" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.f * 100)}>
              <i style={{ width: `${Math.max(2, Math.round(progress.f * 100))}%` }} />
              <span>
                {waited} · {progress.f < 0.01 ? "downloading the first files" : `${Math.round(progress.f * 100)}%${landed ? ` · ${landed}` : ""}`}
              </span>
            </div>
            <p className="llm-dim">Carry on using the page. It switches over when the model is ready.</p>
          </>
        )}
        {!progress && (
          <p className="llm-row">
            <button onClick={() => download(which)} disabled={!support?.ok}>
              {cached[which] ? "Start it" : `Download ${size(m.downloadMB)}`}
            </button>
          </p>
        )}
        {progress && !mine && <p className="llm-dim">The other model is still downloading. Wait for that one first.</p>}
      </>
    );
  }

  // One quiet panel, closed by default: who builds the page, and whatever that engine needs.
  // The copy-and-paste route: the studio page shows it in its panel, the home page in a chat reply.
  const pasteSteps = (
        <div className="llm-steps">
          <p>
            <b>Nothing on this page connects to anything.</b> You copy a prompt into your own Claude, or any chatbot, and paste its reply
            back here. There&apos;s no key and no login, so there&apos;s nothing I could take.
          </p>
          <label htmlFor="llm-wish">1. What you want</label>
          <input id="llm-wish" value={wish} onChange={(e) => setWish(e.target.value)} placeholder="a 1970s airline timetable, in orange and brown" maxLength={400} />
          <p className="llm-row">
            <span>2.</span>
            {(
              [
                ["Claude", "https://claude.ai/new?q=", 12000],
                ["ChatGPT", "https://chatgpt.com/?q=", 12000],
              ] as const
            ).map(([name, url, max]) => {
              const prompt = pastePrompt(content, design ?? null, wish);
              // each takes the prompt in the link, up to a length; past that only copying works
              return prompt.length <= max ? (
                <a
                  key={name}
                  className={`llm-open${wish.trim() ? "" : " off"}`}
                  href={wish.trim() ? url + encodeURIComponent(prompt) : undefined}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => copy(prompt, "prompt")}
                >
                  Open in {name} ↗
                </a>
              ) : null;
            })}
            <button className="llm-copy" onClick={() => copy(pastePrompt(content, design ?? null, wish), "prompt")} disabled={!wish.trim()}>
              {copied === "prompt" ? "Copied" : "or copy the prompt"}
            </button>
            <span className="llm-dim">
              It holds your request, the format and the facts about me{design ? ", plus this version so it can edit it" : ""}. The links open a new chat
              with it filled in, and copy it too in case the link cuts it short.
            </span>
          </p>
          <details className="llm-peek">
            <summary>Read the prompt</summary>
            <pre>{pastePrompt(content, design ?? null, wish)}</pre>
          </details>
          <label htmlFor="llm-reply">3. Its reply</label>
          <textarea id="llm-reply" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Paste the whole reply. I'll find the JSON." rows={5} spellCheck={false} />
          {pasteError && <p className="llm-warn">{pasteError}</p>}
          <p className="llm-row">
            <button onClick={build} disabled={!reply.trim()}>
              Build
            </button>
            <span className="llm-dim">
              The reply is checked first, and its CSS can only touch the generated page. It can pull pictures, GIFs, clips and fonts from other sites, so
              those sites see the page being opened.
            </span>
          </p>
        </div>
  );

  const about = panel && (
    <div className="llm-panel" role="region" aria-label="Built by">
      <fieldset className="llm-engines">
        <legend>Built by</legend>
        {offered.map((e) => (
          <label key={e.id} className={engine === e.id ? "on" : ""}>
            <input type="radio" name="engine" checked={engine === e.id} onChange={() => setEngine(e.id)} />
            <span>
              <b>{e.name}</b>
              <i>{e.note}</i>
            </span>
          </label>
        ))}
        {elsewhere.map((e) => (
          <a key={e.id} href={studio ? "/" : `/studio?with=${e.id}`}>
            <span>
              <b>{e.name}</b>
              <i>
                {e.note}. {studio ? "On the main page" : "In the studio"} →
              </i>
            </span>
          </a>
        ))}
      </fieldset>

      {engine === "rules" && (
        <p>
          <b>Keyword rules I wrote. There&apos;s no model here.</b> They&apos;re instant and know a fair few words, but they only pick from looks
          I made in advance. For a page designed from scratch, use one of the others.
        </p>
      )}
      {engine === "small" && <Local which="small" />}
      {engine === "big" && <Local which="big" />}

      {engine === "paste" && pasteSteps}

      {!blank && (
        <>
          <p>
            This version is “{design ? design.name : spec.name}”, from{" "}
            {entry.source === "stand-in" ? "the keyword rules" : entry.source === "link" ? "a shared link" : entry.source.startsWith("your") ? entry.source : `the ${entry.source}`}
            {entry.prompt ? `, after you said “${entry.prompt}”` : ""}.{" "}
            {design
              ? "The JSON below is what it wrote: the blocks and a stylesheet. I parse the stylesheet and keep it inside this page (no url(), no imports, nothing fixed to the window, no selectors that reach outside). The headings and linking sentences are its words. Every fact comes from my data files."
              : "The JSON below is everything it gets to decide. The page checks each value against a list of allowed ones, then applies it. Everything written about me comes from my data files."}
          </p>
          {entry.notes.length > 0 && (
            <ul>
              {entry.notes.map((n, i) => (
                <li key={i}>tidied: {n}</li>
              ))}
            </ul>
          )}
          <pre>{JSON.stringify(design ?? spec, null, 2)}</pre>
        </>
      )}
      <p className="llm-row">
        <button onClick={() => setPanel(false)}>Close</button>
      </p>
    </div>
  );

  // A model-designed page sets its own background, so the fade under the composer takes that colour.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const fs = chatting ? null : el.querySelector(".fs");
    const c = fs ? getComputedStyle(fs).backgroundColor : "";
    if (fs && c && !/rgba?\([^)]*,\s*0\)$|transparent/.test(c)) el.style.setProperty("--fade", c);
    else el.style.removeProperty("--fade");
  }, [design, at, chatting]);

  const status = (
    <button type="button" onClick={() => (panel ? setPanel(false) : openPanel())} aria-expanded={panel} className="llm-who-builds">
      <span className="llm-sr">Built by </span>
      <b>{engineName}</b> <span aria-hidden="true">{panel ? "▴" : "▾"}</span>
    </button>
  );
  const loading = progress && (
    <button type="button" onClick={() => setPanel(true)} className="llm-loading">
      Model {progress.f < 0.01 ? "downloading" : `${Math.round(progress.f * 100)}%`} · {waited}
    </button>
  );

  if (nested && chatting) return <div className="llm" style={vars(BLANK)} />;

  return (
    <div ref={root} className={`llm ${design || chatting ? "fx-none" : `fx-${spec.theme.fx}`} ${blank ? "is-blank" : ""} ${studio ? "is-studio" : ""} ${chatting ? "is-chat" : ""}`} style={vars(design || chatting ? BLANK : spec)}>
      {chatting && (
        <ChatHome
          content={content}
          versions={VERSIONS}
          run={run}
          focus={() => input.current?.focus()}
          turns={history.slice(1, at + 1).map((e) => ({ prompt: e.prompt, name: e.design?.name ?? e.spec.name }))}
          message={message}
          pending={busy ? asking : ""}
          by={entry.source.startsWith("your") ? entry.source : entry.source === "bigger model" ? "the bigger model" : engineName}
          openUrl={openUrl}
          onOpen={() => {
            setView("page");
            window.scrollTo({ top: 0 });
          }}
          studio={pasteSteps}
          stage={
            blank ? null : (
              <div className="llm-stage" style={vars(design ? BLANK : spec)}>
                {design ? <Freeform key={at} design={design} content={content} /> : <Site key={at} spec={spec} content={content} />}
              </div>
            )
          }
        />
      )}
      {blank && studio && (
        <header className="llm-intro">
            <p className="llm-who">
              <span>
                <b>Tom Bale</b> · product engineer at Anima, London
              </span>
              {studio && <a href="/">← Main page</a>}
            </p>
            <h1 className="llm-pitch">{studio ? "Get your own Claude to design my site." : "I couldn't settle on one website, so you pick."}</h1>
            {studio && (
              <p className="llm-lede">
                Your Claude writes the layout, the CSS and the headings. Copy a prompt across to your own Claude or ChatGPT and paste the reply
                back. Every page you make has a link you can share.
              </p>
            )}
        </header>
      )}
      {/* content dissolves into the page colour before it reaches the composer */}
      {!(studio && blank) && <div className="llm-fade" aria-hidden="true" />}
      {/* the composer floats at the bottom of the window: panel, status, suggestions, then the prompt */}
      <div className="llm-bar" style={{ viewTransitionName: "llm-bar" }}>
        {about}
        {(message || !blank) && !(chatting && !blank) && (
          <p className="llm-message" role="status">
            {message}
          </p>
        )}
        <div className="llm-chips">
          {chips.map((p) => (
            <button key={p} type="button" onClick={() => run(p)} disabled={busy}>
              {p}
            </button>
          ))}
        </div>
        <form
          className="llm-box"
          onSubmit={(e) => {
            e.preventDefault();
            run(text);
          }}
        >
          <label htmlFor="llm-ask" className="llm-sr">
            {blank ? "Describe the site you want" : "Change this site"}
          </label>
          <input
            id="llm-ask"
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={blank ? "Describe a version of my website and I'll build it" : "Make it dark, fewer projects, no sport"}
            autoComplete="off"
            maxLength={400}
            disabled={busy}
          />
          <div className="llm-tools">
            <div className="llm-status">
              {!blank && (
                <>
                  <button type="button" onClick={() => step(-1)} disabled={at === 0 || busy} aria-label="Previous version">
                    Undo
                  </button>
                  <span className="llm-count">
                    {at}/{history.length - 1}
                  </span>
                  <button type="button" onClick={() => step(1)} disabled={at === history.length - 1 || busy} aria-label="Next version">
                    Redo
                  </button>
                  <button type="button" onClick={share}>
                    {copied === "link" ? "Link copied" : "Share"}
                  </button>
                  <button type="button" onClick={restart}>
                    Start over
                  </button>
                  {!chatting && (
                    <button type="button" onClick={() => document.getElementById("versions")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                      My versions
                    </button>
                  )}
                  {!chatting && !studio && (
                    <button type="button" onClick={() => (setView("chat"), window.scrollTo({ top: 0 }))}>
                      Back to chat
                    </button>
                  )}
                </>
              )}
            </div>
            {loading}
            {status}
            <button className="llm-send" disabled={busy || !text.trim()} aria-label={busy ? "Building" : blank ? "Build" : "Change"}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 13V3.5M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </form>
      </div>

      {!blank && !chatting && (design ? <Freeform key={at} design={design} content={content} /> : <Site key={at} spec={spec} content={content} />)}

      {!chatting && (
      <nav id="versions" className="llm-versions" aria-label="Versions I made by hand">
          <h2 className="llm-versions-k">Or open one I made</h2>
          <ol>
            {VERSIONS.map((v) => (
              <li key={v.href}>
                <Link href={v.href} target="_blank" rel="noopener">
                  <Thumb kind={v.kind} />
                  <span className="t">{v.name}</span>
                  <span className="d">{v.line}</span>
                  <span className="go">↗</span>
                </Link>
              </li>
            ))}
          </ol>
          {!studio && (
            <>
              <h2 className="llm-versions-k llm-versions-k2">Or get your own Claude to design one</h2>
              <ol>
                <li>
                  <Link href="/studio" target="_blank" rel="noopener">
                    <Thumb kind="studio" />
                    <span className="t">The studio</span>
                    <span className="d">Copy a prompt into your own Claude or ChatGPT and paste the reply back. Nothing of yours comes to me.</span>
                    <span className="go">↗</span>
                  </Link>
                </li>
              </ol>
            </>
          )}
        </nav>
      )}

    </div>
  );
}
