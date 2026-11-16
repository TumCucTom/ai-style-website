"use client";

import { useLayoutEffect, useRef } from "react";
import { ContactGate } from "@/components/ContactGate";
import type { Block, Design } from "./design";
import { JOBS, projectIn, TAGS, type Content } from "./Site";

// Renders a validated Design. Everything a model wrote arrives here as plain
// strings and is rendered as text; the facts are read from `content`, which
// comes from the site's data files, never from the model.

function Title({ b }: { b: Block }) {
  return b.title ? <h2 className="b-title">{b.title}</h2> : null;
}

function Items({ b, content }: { b: Block; content: Content }) {
  const f = b.focus;
  if (b.type === "projects") {
    const list = content.projects.filter((p) => !f.length || f.some((k) => projectIn[k](p))).slice(0, b.limit);
    if (b.variant === "marquee")
      return (
        <div className="mq" aria-label="Projects">
          {[0, 1].map((k) => (
            <span key={k} aria-hidden={k === 1}>
              {list.map((p) => p.name).join(" · ")} ·{" "}
            </span>
          ))}
        </div>
      );
    return (
      <ul className="items">
        {list.map((p) => (
          <li className="item" key={p.name}>
            {b.images && p.image && (b.variant === "grid" || b.variant === "cards") && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="item-img" src={p.image.replace(/\.gif$/, ".webp")} alt="" loading="lazy" />
            )}
            <a className="item-name" href={p.href} target="_blank" rel="noreferrer">
              {p.name}
            </a>
            <p className="item-line">{p.tagline}</p>
            <span className="item-meta">{[p.domain, p.year].filter(Boolean).join(" · ")}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (b.type === "experience") {
    const ids = f.flatMap((k) => JOBS[k] ?? []);
    const list = content.jobs.filter((j) => !f.length || ids.includes(j.id));
    return (
      <ul className="items">
        {(list.length ? list : content.jobs).slice(0, b.limit).map((j) => (
          <li className="item" key={j.id}>
            <span className="item-meta">{j.dates}</span>
            <span className="item-name">{j.role}</span>
            <span className="item-org">{j.org}</span>
            <p className="item-line">{j.summary}</p>
          </li>
        ))}
      </ul>
    );
  }
  if (b.type === "education")
    return (
      <ul className="items">
        {content.schools.map((s) => (
          <li className="item" key={s.name}>
            <span className="item-meta">{s.dates}</span>
            <span className="item-name">{s.name}</span>
            <span className="item-org">{s.qualification}</span>
            <p className="item-line">{s.grade.replaceAll(",", ", ")}</p>
          </li>
        ))}
      </ul>
    );
  if (b.type === "wins") {
    const list = content.wins.filter((w) => !f.length || f.some((k) => w.tags.some((t) => TAGS[k]?.test(t))));
    return (
      <ul className="items">
        {(list.length ? list : content.wins).slice(0, b.limit).map((w) => (
          <li className="item" key={w.name}>
            <span className="item-meta">{w.year}</span>
            <span className="item-name">{w.name}</span>
            <p className="item-line">{w.blurb}</p>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="items">
      {content.sport.slice(0, b.limit).map((s) => (
        <li className="item" key={s.name}>
          <span className="item-meta">{s.year}</span>
          <span className="item-name">{s.name}</span>
          <p className="item-line">{s.blurb}</p>
        </li>
      ))}
    </ul>
  );
}

function Live({ content }: { content: Content }) {
  const l = content.live;
  const nums: [string | number, string][] = [
    [l.c7, "GitHub contributions, last 7 days"],
    [l.cYear, "GitHub contributions, last year"],
  ];
  if (l.rapid) nums.push([l.rapid, "chess.com rapid"]);
  if (l.blitz) nums.push([l.blitz, "chess.com blitz"]);
  if (l.track) nums.push([l.track.name, `last played, ${l.track.artist}`]);
  return (
    <div className="nums">
      {nums.map(([v, k]) => (
        <div className="num" key={k}>
          <b className={typeof v === "string" ? "num-v is-text" : "num-v"}>{v}</b>
          <span className="num-k">{k}</span>
        </div>
      ))}
    </div>
  );
}

// A model can pick a text colour that can't be read on its own background.
// After its stylesheet applies, anything below 3:1 is set to near-black or
// near-white, whichever the background calls for.
const READ = ".hero-title,.hero-sub,.b-title,.item-name,.item-line,.item-meta,.item-org,.num-v,.num-k,.text-body";
const rgba = (c: string) => {
  const m = c.match(/[\d.]+/g)?.map(Number);
  return m && m.length >= 3 ? [m[0], m[1], m[2], m[3] ?? 1] : null;
};
const lum = (c: number[]) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
function behind(n: Element | null): number[] | null {
  for (let e = n; e; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.backgroundImage !== "none") return null; // a gradient: leave it to the design
    const c = rgba(cs.backgroundColor);
    if (c && c[3] > 0.5) return c;
  }
  return [255, 255, 255, 1];
}

export function Freeform({ design, content }: { design: Design; content: Content }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const fixed: HTMLElement[] = [];
    for (const n of root.current?.querySelectorAll<HTMLElement>(READ) ?? []) {
      const bg = behind(n);
      const cs = getComputedStyle(n);
      const ink = rgba(cs.color);
      if (!bg || !ink) continue;
      // faded text is as hard to read as dim text, so opacity counts
      const o = Math.min(1, Number(cs.opacity) || 1) * ink[3];
      const fg = [0, 1, 2].map((i) => ink[i] * o + bg[i] * (1 - o));
      const a = lum(fg);
      const b = lum(bg);
      // headings get by on 3:1; small text needs more
      const need = n.matches(".hero-title,.b-title,.num-v") ? 3 : 4.2;
      if ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < need) {
        if (o < 0.8) n.style.opacity = "0.85";
        n.style.color = b > 0.35 ? "#161616" : "#f2f2f2";
        fixed.push(n);
      }
    }
    return () => fixed.forEach((n) => ((n.style.color = ""), (n.style.opacity = "")));
  }, [design]);
  const frame = design.frame ?? "stack";
  // a mosaic needs tiles of different widths whatever the model asked for
  const tile: Partial<Record<Block["type"], number>> = { hero: 8, live: 4, projects: 12, contact: 6 };
  const block = (b: Block, i: number) => (
          <section key={i} className={`b b-${b.type} v-${b.variant} ${b.cls}`} style={{ gridColumn: `span ${frame === "bento" ? (tile[b.type] ?? 6) : b.span}` }}>
            {b.type === "hero" ? (
              <>
                <h1 className="hero-title">{b.title || "Tom Bale"}</h1>
                {b.text && <p className="hero-sub">{b.text}</p>}
              </>
            ) : b.type === "text" ? (
              <>
                <Title b={b} />
                <p className="text-body">{b.text}</p>
              </>
            ) : b.type === "marquee" ? (
              <div className="mq">
                {[0, 1].map((k) => (
                  <span key={k} aria-hidden={k === 1}>
                    {b.text || b.title} ·{" "}
                  </span>
                ))}
              </div>
            ) : b.type === "divider" ? (
              <hr />
            ) : b.type === "image" ? (
              <figure>
                {/* from the web: no referrer is sent, and a picture that fails to load takes its block with it */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="pic" src={b.src} alt={b.title} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={(e) => e.currentTarget.closest("section")?.setAttribute("hidden", "")} />
                {b.text && <figcaption className="cap">{b.text}</figcaption>}
              </figure>
            ) : b.type === "video" ? (
              <video className="clip" src={b.src} muted loop autoPlay playsInline preload="metadata" aria-label={b.title || undefined} onError={(e) => e.currentTarget.closest("section")?.setAttribute("hidden", "")} />
            ) : b.type === "live" ? (
              <>
                <Title b={b} />
                <Live content={content} />
              </>
            ) : b.type === "contact" ? (
              <>
                <Title b={b} />
                <ContactGate bare />
              </>
            ) : (
              <>
                <Title b={b} />
                <Items b={b} content={content} />
              </>
            )}
          </section>
  );
  const heroes = design.blocks.map((b, i) => [b, i] as const).filter(([b]) => b.type === "hero");
  const rest = design.blocks.map((b, i) => [b, i] as const).filter(([b]) => frame !== "rail" || b.type !== "hero");
  return (
    <div className={`fs fr-${frame}`} ref={root}>
      {/* already parsed, scoped under .fs and stripped to known-safe properties */}
      {/* web fonts by name only; one request per family so a wrong name can't take the others down */}
      {design.fonts?.map((f) => (
        <link key={f} rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}&display=swap`} />
      ))}
      <style>{design.css}</style>
      {frame === "rail" ? (
        <div className="fs-rail">
          <div className="fs-side">{heroes.map(([b, i]) => block(b, i))}</div>
          <div className="fs-grid">{rest.map(([b, i]) => block(b, i))}</div>
        </div>
      ) : (
        <div className="fs-grid">{rest.map(([b, i]) => block(b, i))}</div>
      )}
    </div>
  );
}
