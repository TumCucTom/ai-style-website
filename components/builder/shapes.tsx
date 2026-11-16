// Page structures. A look used to be paint on one skeleton (a headline, then
// stacked sections of cards). A shape is the skeleton itself: a shell session,
// a newspaper front page, a sidebar, a numbered index, a mosaic, a poster, a
// single timeline, a 1997 desktop. Each one arranges the same facts.

import type { ReactNode } from "react";
import type { Section, Spec } from "./spec";
import type { Content } from "./Site";

export type Parts = {
  spec: Spec;
  h: string;
  sub: string;
  title: Record<Section, string>;
  sections: Section[];
  projects: Content["projects"];
  jobs: Content["jobs"];
  wins: Content["wins"];
  schools: Content["schools"];
  sport: Content["sport"];
  live: Content["live"];
  images: boolean;
  gate: ReactNode;
};

type Item = { name: string; line: string; meta: string; href?: string; image?: string; year: number };
const yr = (dates: string) => Number(dates.match(/\d{4}/)?.[0]) || 0;
const pad = (n: number) => String(n).padStart(2, "0");

/** One section's facts, in a common form every shape can lay out. */
function items(p: Parts, s: Section): Item[] {
  switch (s) {
    case "projects":
      return p.projects.map((x) => ({ name: x.name, line: x.tagline, meta: [x.domain, x.year].filter(Boolean).join(" · "), href: x.href, image: p.images ? x.image : undefined, year: x.year ?? 0 }));
    case "experience":
      return p.jobs.map((j) => ({ name: j.role, line: j.summary, meta: `${j.org} · ${j.dates}`, year: yr(j.dates) }));
    case "education":
      return p.schools.map((x) => ({ name: x.name, line: `${x.qualification}. ${x.grade.replaceAll(",", ", ")}`, meta: x.dates, year: yr(x.dates) }));
    case "wins":
      return p.wins.map((w) => ({ name: w.name, line: w.blurb, meta: String(w.year), year: w.year }));
    case "sport":
      return p.sport.map((x) => ({ name: x.name, line: x.blurb, meta: String(x.year), image: p.images ? x.photo : undefined, year: x.year }));
    default:
      return [];
  }
}
const stats = (l: Content["live"]): [string | number, string][] => [
  [l.c7.toLocaleString("en-GB"), "GitHub contributions in the last 7 days"],
  [l.cYear.toLocaleString("en-GB"), "GitHub contributions in the last year"],
  ...(l.rapid ? ([[l.rapid, "chess.com rapid"]] as [number, string][]) : []),
  ...(l.track ? ([[l.track.name, `last played · ${l.track.artist}`]] as [string, string][]) : []),
];
/** The sections this page shows, minus any a focus has emptied. */
const shown = (p: Parts) => p.sections.filter((s) => s === "live" || s === "contact" || items(p, s).length > 0);
const lists = (p: Parts) => shown(p).filter((s) => s !== "live" && s !== "contact");
const has = (p: Parts, s: Section) => shown(p).includes(s);
const go = (s: Section) => document.getElementById(`llm-s-${s}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

function L({ it, className, children }: { it: Item; className?: string; children: ReactNode }) {
  return it.href ? (
    <a href={it.href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  ) : (
    <span className={className ? `${className} nl` : "nl"}>{children}</span>
  );
}
function Img({ it }: { it: Item }) {
  // eslint-disable-next-line @next/next/no-img-element
  return it.image ? <img src={it.image} alt="" loading="lazy" /> : null;
}

// ---------- a shell session ----------
const hash = (s: string) => {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(7, "0").slice(0, 7);
};
function Shell(p: Parts) {
  const cmd: Record<Section, string> = {
    live: "uptime",
    projects: `ls -lt ~/projects | head -${p.projects.length}`,
    experience: "git log --oneline ~/career",
    education: "cat ~/education.txt",
    wins: 'grep -r "won" ~/hackathons',
    sport: "ls ~/away-from-the-desk",
    contact: "./say-hi.sh",
  };
  const l = p.live;
  return (
    <div className="sp sp-shell">
      <p className="sh-cmd">whoami</p>
      <h1>{p.h}</h1>
      <p className="sh-out">{p.sub}</p>
      {shown(p).map((s) => (
        <section key={s}>
          <h2 className="sh-cmd">
            <span className="llm-sr">{p.title[s]}: </span>
            {cmd[s]}
          </h2>
          {s === "live" ? (
            <p className="sh-out">
              up since 2018, {l.c7} contributions in 7 days, {l.cYear} in a year
              {l.rapid ? `, rapid ${l.rapid}` : ""}
              {l.track ? `, last played ${l.track.name}` : ""}
            </p>
          ) : s === "contact" ? (
            <div className="sh-gate">{p.gate}</div>
          ) : s === "projects" ? (
            <ul className="sh-ls">
              {items(p, s).map((it) => (
                <li key={it.name}>
                  <i>-rwxr-xr-x</i>
                  <i>{it.year || "----"}</i>
                  <L it={it}>
                    <b>{it.name}</b>
                  </L>
                  <span>{it.line}</span>
                </li>
              ))}
            </ul>
          ) : s === "experience" ? (
            <ul className="sh-log">
              {p.jobs.map((j) => (
                <li key={j.id}>
                  <i>{hash(j.id)}</i>
                  <div>
                    <b>{j.role}</b> @ {j.org} <i>({j.dates})</i>
                    <span>{j.summary}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="sh-log">
              {items(p, s).map((it) => (
                <li key={it.name}>
                  <i>{it.year}</i>
                  <div>
                    <b>{it.name}</b>
                    <span>{it.line}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <p className="sh-cmd">
        <span className="llm-cursor" />
      </p>
    </div>
  );
}

// ---------- a newspaper front page ----------
function Paper(p: Parts) {
  const [lead, ...rest] = has(p, "projects") ? items(p, "projects") : [];
  return (
    <div className="sp sp-paper">
      <header className="pp-mast">
        <p className="llm-dateline">
          <span>London</span>
          <span>Fourth edition</span>
          <span>thomasbale.com</span>
        </p>
        <h1>{p.h}</h1>
        <p>{p.sub}</p>
      </header>
      <div className="pp-body">
        <div className="pp-main">
          {lead && (
            <article className="pp-lead">
              <Img it={lead} />
              <p className="pp-kick">{lead.meta}</p>
              <h2>
                <L it={lead}>{lead.name}</L>
              </h2>
              <p className="pp-stand">{lead.line}</p>
            </article>
          )}
          {rest.length > 0 && (
            <section>
              <h3 className="pp-h">{p.title.projects}, continued</h3>
              <div className="pp-cols">
                {rest.map((it) => (
                  <article key={it.name}>
                    <h4>
                      <L it={it}>{it.name}</L>
                    </h4>
                    <p>
                      {it.line} <em>{it.meta}</em>
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}
          {has(p, "experience") && (
            <section>
              <h3 className="pp-h">{p.title.experience}</h3>
              <div className="pp-cols two">
                {items(p, "experience").map((it) => (
                  <article key={it.name + it.meta}>
                    <h4>{it.name}</h4>
                    <p className="pp-by">{it.meta}</p>
                    <p>{it.line}</p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
        <aside className="pp-side">
          {has(p, "live") && (
            <section className="pp-box">
              <h3>In brief</h3>
              <ul>
                {stats(p.live).map(([v, k]) => (
                  <li key={k}>
                    <b>{v}</b> {k}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {(["wins", "education", "sport"] as const).filter((s) => has(p, s)).map((s) => (
            <section key={s}>
              <h3 className="pp-h">{p.title[s]}</h3>
              <ul className="pp-briefs">
                {items(p, s).map((it) => (
                  <li key={it.name}>
                    <em>{it.meta}</em>
                    <b>{it.name}</b>
                    <span>{it.line}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {has(p, "contact") && (
            <section className="pp-box">
              <h3>{p.title.contact}</h3>
              {p.gate}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------- a sidebar and one long column of rows ----------
function Rail(p: Parts) {
  return (
    <div className="sp sp-rail">
      <aside>
        <h1>{p.h}</h1>
        <p>{p.sub}</p>
        <nav aria-label="Sections">
          {shown(p)
            .filter((s) => s !== "live")
            .map((s) => (
              <button key={s} onClick={() => go(s)}>
                {p.title[s]}
              </button>
            ))}
        </nav>
        {has(p, "live") && (
          <dl>
            {stats(p.live).map(([v, k]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </aside>
      <div className="rl-main">
        {shown(p)
          .filter((s) => s !== "live")
          .map((s) => (
            <section key={s} id={`llm-s-${s}`}>
              <h2>{p.title[s]}</h2>
              {s === "contact" ? (
                p.gate
              ) : (
                <ul>
                  {items(p, s).map((it) => (
                    <li key={it.name + it.meta}>
                      <L it={it}>
                        <strong>{it.name}</strong>
                      </L>
                      <span>{it.line}</span>
                      <em>{it.meta}</em>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
      </div>
    </div>
  );
}

// ---------- everything as one big numbered index ----------
function Index(p: Parts) {
  return (
    <div className="sp sp-index">
      <header>
        <h1>{p.h}</h1>
        <p>{p.sub}</p>
      </header>
      {shown(p).map((s, i) => (
        <section key={s}>
          <h2>
            <i>{pad(i + 1)}</i>
            {p.title[s]}
          </h2>
          {s === "live" ? (
            <p className="ix-live">
              {stats(p.live).map(([v, k]) => (
                <span key={k}>
                  <b>{v}</b> {k}
                </span>
              ))}
            </p>
          ) : s === "contact" ? (
            <div className="ix-gate">{p.gate}</div>
          ) : (
            <ol>
              {items(p, s).map((it, k) => (
                <li key={it.name + it.meta}>
                  <L it={it}>
                    <i>{pad(k + 1)}</i>
                    <strong>{it.name}</strong>
                    <em>{it.meta}</em>
                    <span>{it.line}</span>
                  </L>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}

// ---------- a mosaic of tiles ----------
function Bento(p: Parts) {
  return (
    <div className="sp sp-bento">
      <header className="t t-hero">
        <h1>{p.h}</h1>
        <p>{p.sub}</p>
      </header>
      {has(p, "live") &&
        stats(p.live).map(([v, k]) => (
          <div className="t t-stat" key={k}>
            <b className={typeof v === "string" ? "txt" : ""}>{v}</b>
            <span>{k}</span>
          </div>
        ))}
      {lists(p).flatMap((s) =>
        s === "projects"
          ? items(p, s).map((it, i) => (
              <L it={it} key={it.name} className={`t t-proj${it.image ? " pic" : ""}${i === 0 ? " lead" : ""}`}>
                <Img it={it} />
                <em>{it.meta}</em>
                <strong>{it.name}</strong>
                <span>{it.line}</span>
              </L>
            ))
          : [
              <section className={`t t-list t-${s}${lists(p).filter((x) => x !== "projects").length % 2 && s === lists(p).find((x) => x !== "projects") ? " wide" : ""}`} key={s}>
                <h2>{p.title[s]}</h2>
                <ul>
                  {items(p, s).map((it) => (
                    <li key={it.name + it.meta}>
                      <b>{it.name}</b>
                      <span>{it.meta}</span>
                    </li>
                  ))}
                </ul>
              </section>,
            ],
      )}
      {has(p, "contact") && (
        <section className="t t-contact">
          <h2>{p.title.contact}</h2>
          {p.gate}
        </section>
      )}
    </div>
  );
}

// ---------- a poster: bands and very large words ----------
function Poster(p: Parts) {
  return (
    <div className="sp sp-poster">
      <header>
        <h1>{p.h}</h1>
        <p>{p.sub}</p>
      </header>
      {shown(p).map((s, i) => (
        <section key={s} className={s !== "contact" && i % 2 === 0 ? "inv" : ""}>
          <h2>{p.title[s]}</h2>
          {s === "live" ? (
            <div className="po-stats">
              {stats(p.live).map(([v, k]) => (
                <div key={k}>
                  <b className={typeof v === "string" ? "txt" : ""}>{v}</b>
                  <span>{k}</span>
                </div>
              ))}
            </div>
          ) : s === "contact" ? (
            p.gate
          ) : (
            <ul>
              {items(p, s).map((it) => (
                <li key={it.name + it.meta}>
                  <em>{it.meta}</em>
                  <L it={it}>
                    <strong>{it.name}</strong>
                  </L>
                  <span>{it.line}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

// ---------- one timeline, everything by year ----------
const KIND: Partial<Record<Section, string>> = { experience: "worked", projects: "made", wins: "won", education: "studied", sport: "did" };
function Timeline(p: Parts) {
  const all = lists(p).flatMap((s) => items(p, s).map((it) => ({ ...it, kind: KIND[s] ?? "", s })));
  const years = [...new Set(all.map((e) => e.year))].sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : b - a));
  return (
    <div className="sp sp-time">
      <header>
        <h1>{p.h}</h1>
        <p>{p.sub}</p>
        {has(p, "live") && (
          <p className="tl-live">
            {stats(p.live).map(([v, k]) => (
              <span key={k}>
                <b>{v}</b> {k}
              </span>
            ))}
          </p>
        )}
      </header>
      <ol className="tl">
        {years.map((y) => (
          <li key={y}>
            <h2>{y || "Undated"}</h2>
            <ul>
              {all
                .filter((e) => e.year === y)
                .map((e) => (
                  <li key={e.s + e.name + e.meta} className={`k-${e.s}`}>
                    <em>{e.kind}</em>
                    <div>
                      <L it={e}>
                        <strong>{e.name}</strong>
                      </L>
                      <span>{e.line}</span>
                    </div>
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ol>
      {has(p, "contact") && (
        <section className="tl-contact">
          <h2>{p.title.contact}</h2>
          {p.gate}
        </section>
      )}
    </div>
  );
}

// ---------- a 1997 desktop ----------
function Desktop(p: Parts) {
  return (
    <div className="sp sp-desk">
      <div className="llm-marquee" aria-hidden="true">
        <span>
          {p.h} ✦ {p.h} ✦ {p.h} ✦ {p.h} ✦&nbsp;
        </span>
      </div>
      <div className="dk-body">
        <aside className="dk-win">
          <div className="dk-bar">
            <b>links</b>
          </div>
          <div className="dk-in">
            <ul>
              {shown(p).map((s) => (
                <li key={s}>
                  <button onClick={() => go(s)}>{p.title[s]}</button>
                </li>
              ))}
            </ul>
            <p className="dk-count">
              contributions this week
              <b>{String(p.live.c7).padStart(6, "0")}</b>
            </p>
            <p className="dk-uc">Under construction since 2018</p>
          </div>
        </aside>
        <div className="dk-main">
          <div className="dk-win">
            <div className="dk-bar">
              <b>about_me.txt</b>
              <i aria-hidden="true">_ □ ×</i>
            </div>
            <div className="dk-in">
              <h1>{p.h}</h1>
              <p>{p.sub}</p>
            </div>
          </div>
          {shown(p).map((s) => (
            <section key={s} id={`llm-s-${s}`} className={`dk-win${s === "contact" ? " dk-contact" : ""}`}>
              <div className="dk-bar">
                <h2>{p.title[s]}</h2>
                <i aria-hidden="true">_ □ ×</i>
              </div>
              <div className="dk-in">
                {s === "live" ? (
                  <table>
                    <tbody>
                      {stats(p.live).map(([v, k]) => (
                        <tr key={k}>
                          <th>{k}</th>
                          <td>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : s === "contact" ? (
                  p.gate
                ) : (
                  <ul className="dk-list">
                    {items(p, s).map((it) => (
                      <li key={it.name + it.meta}>
                        <Img it={it} />
                        <div>
                          <L it={it}>
                            <b>{it.name}</b>
                          </L>{" "}
                          <em>({it.meta})</em>
                          <span>{it.line}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export const SHAPE_VIEWS = { shell: Shell, paper: Paper, rail: Rail, index: Index, bento: Bento, poster: Poster, timeline: Timeline, desktop: Desktop } as const;
