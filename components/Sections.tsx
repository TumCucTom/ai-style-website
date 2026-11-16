import experience from "@/data/experience.json";
import education from "@/data/education.json";
import oss from "@/data/open-source.json";
import achievements from "@/data/achievements.json";
import { mapCounts } from "@/lib/map-data";
import { MapFigure } from "@/components/MapFigure";
import { Section } from "@/components/Section";

export function Abstract() {
  return (
    <Section id="abstract" n="§0" title="Abstract">
      <div className="prose text-[1.12rem] leading-[1.6]">
        <p>
          I&apos;m a product engineer at Anima<sup className="fn">1</sup>, where I led the revamp of one of the four core
          product lines and built the autonomous engineering loop that now ships changes to it. Before that I represented
          the UK at the ISC&apos;25 Student Cluster Competition<sup className="fn">2</sup>, and graduated from Bristol with
          a First in Computer Science<sup className="fn">3</sup>, ranked 1st of 211 in the machine learning and computer
          systems coursework, with a dissertation on memory for vision-language models that won Best Computer Vision
          Project.
        </p>
        <p>
          Away from the keyboard: eleven years of competitive swimming, one Ironman, bouldering, Muay Thai, and a weekly
          board game night. I like puzzles and making computers go fast.
        </p>
      </div>
      <ol className="mono mt-8 space-y-1 text-muted">
        <li><span className="text-accent">1</span> Anima (YC W21), London. Jun 2026 to now.</li>
        <li><span className="text-accent">2</span> UKSCC. A 208-core cluster with eight H100s.</li>
        <li><span className="text-accent">3</span> University of Bristol, 2023 to 2026.</li>
      </ol>
      <p className="mono mt-6 text-muted">
        <span className="text-ink">Keywords:</span> product engineering · agents · voice AI · HPC · vision-language models ·
        quantum · endurance sport
      </p>
    </Section>
  );
}

export function TheMap() {
  const k = mapCounts.kinds;
  return (
    <Section
      id="map"
      n="§3"
      title="The map"
      wide
      kicker="Everything I've made and the tools I made it with, placed by what it's about. Drag to turn it. Click a point to see its neighbours."
    >
      <figure>
        <MapFigure clusters={mapCounts.clusters} total={mapCounts.total} />
        <figcaption>
          <b>Fig. 4.</b> {mapCounts.total} nodes: {k.repo} repos, {k.project} projects, {k.achievement} milestones,{" "}
          {k.experience} roles, and the {k.tech} tools they use, which orbit their parent. Each item&apos;s description is
          embedded ({mapCounts.source === "tfidf" ? `TF-IDF over ${mapCounts.dim.toLocaleString("en-GB")} terms` : mapCounts.source}),
          projected to three dimensions and laid out by cluster. Things that sit together are about the same thing. Lines
          join a node to its four nearest neighbours.
        </figcaption>
      </figure>
    </Section>
  );
}

export function Experience() {
  return (
    <Section id="experience" n="§4" title="Experience">
      <ol>
        {experience.jobs.map((j) => (
          <li key={j.id} className="rise grid grid-cols-1 gap-x-8 border-b border-line py-7 first:pt-0 md:grid-cols-[9.5rem_minmax(0,1fr)]">
            <p className="mono pt-1 text-muted tabular">{j.dates}</p>
            <div>
              <h3 className="h3">{j.role}</h3>
              <p className="mt-0.5 text-muted">
                <i>{j.org}</i>
              </p>
              <p className="mt-3 max-w-[41rem]">{j.summary}</p>
              {j.bullets.length > 0 && (
                <ul className="mt-3 max-w-[41rem] space-y-1.5 text-[0.95rem] text-muted">
                  {j.bullets.map((b, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mono shrink-0 pt-[3px] text-accent">{String.fromCharCode(97 + i)}.</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
              {(j.stack.length > 0 || j.links?.length) && (
                <p className="mono mt-3 text-muted">
                  {j.stack.join(" · ")}
                  {j.links?.map((l) => (
                    <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="link ml-3 text-ink">
                      {l.label} ↗
                    </a>
                  ))}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function Education() {
  return (
    <Section id="education" n="§5" title="Education">
      <div className="cells md:grid-cols-3">
        {education.schools.map((s) => (
          <div key={s.id} className="rise">
            <p className="caps tabular">{s.dates}</p>
            <h3 className="h3 mt-3">{s.name}</h3>
            <p className="mt-0.5 text-muted">
              <i>{s.qualification}</i>
            </p>
            <p className={`mt-3 font-sans font-extrabold tracking-tight ${s.grade.length > 20 ? "text-lg leading-tight" : "text-2xl"}`}>
              {s.grade.replaceAll(",", ", ")}
            </p>
            <ul className="mono mt-3 space-y-1 text-muted">
              {s.highlights.map((h) => (
                <li key={h}>· {h}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="cap">
        <b className="text-ink">At Bristol I also:</b> founded and ran the Quantum Computing Society and its first hackathon,
        led and coached teams at MIT&apos;s iQuHACK, captained the cluster team at CIUK twice, and was treasurer and
        planning-and-control lead for Formula Student AI.
      </p>
    </Section>
  );
}

const STATE: Record<string, string> = { MERGED: "#a78bfa", OPEN: "#2fbf7a", CLOSED: "rgb(var(--muted-rgb))" };

export function OpenSource() {
  type Pr = { n: number; title: string; state: string; date: string };
  const repos = oss as { id: string; org: string; repo: string; url: string; blurb: string; prs: Pr[] }[];
  return (
    <Section
      id="open-source"
      n="§6"
      title="Related work"
      kicker="Other people's code I've sent pull requests to. The list refreshes with the rest of the data."
    >
      <ol className="rule-top">
        {repos.map((r, i) => (
          <li key={r.id} className="rise grid grid-cols-1 gap-x-6 border-b border-line py-5 md:grid-cols-[2.5rem_minmax(0,1fr)]">
            <span className="mono pt-1 text-accent">[{i + 1}]</span>
            <div className="min-w-0">
              <a href={r.url} target="_blank" rel="noreferrer" className="h3 link">
                {r.org}/{r.repo}
              </a>
              <span className="ml-2 text-muted">{r.blurb}</span>
              <ul className="mt-2 space-y-0.5">
                {r.prs.slice(0, 3).map((pr) => (
                  <li key={pr.n} className="mono flex min-w-0 gap-2 text-muted">
                    <i className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATE[pr.state] }} title={pr.state.toLowerCase()} />
                    <a href={`https://github.com/${r.org}/${r.repo}/pull/${pr.n}`} target="_blank" rel="noreferrer" className="truncate hover:text-ink">
                      #{pr.n} {pr.title}
                    </a>
                  </li>
                ))}
                {r.prs.length > 3 && <li className="mono pl-3.5 text-muted">and {r.prs.length - 3} more</li>}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function Results() {
  const wins = achievements.filter((a) => a.category === "hackathons" || a.category === "competition").sort((a, b) => b.year - a.year);
  return (
    <Section id="results" n="§7" title="Results" kicker="Hackathons and competitions. Some rows show a photo when you hover.">
      <p className="cap !mt-0">
        <b className="text-ink">Table 2.</b> {wins.length} entries, newest first.
      </p>
      <ol className="rule-top rule-bot mt-3">
        {wins.map((a) => (
          <li key={a.id} className="row grid grid-cols-[3.2rem_minmax(0,1fr)] gap-x-4 border-b border-line px-2 py-3 last:border-0">
            <span className="mono pt-0.5 text-muted tabular">{a.year}</span>
            <div className="min-w-0 md:pr-56">
              <p className="font-sans font-bold leading-snug tracking-tight">{a.name}</p>
              <p className="text-[0.92rem] leading-snug text-muted">{a.blurb}</p>
            </div>
            {a.photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.photo} alt="" loading="lazy" className="peek" />
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}

const PLATES = [
  { src: "/collage/ironman.webp", cap: "Ironman Switzerland, 2024. 3.8 km, 180 km, 42.2 km in 10h30.", span: "md:row-span-2" },
  { src: "/collage/swim.webp", cap: "BUCS, Bristol performance squad.", span: "" },
  { src: "/collage/cycle.webp", cap: "Time trial.", span: "" },
  { src: "/collage/present.webp", cap: "Presenting QAOA at a seminar.", span: "" },
  { src: "/collage/team.webp", cap: "With the team.", span: "" },
];

export function Appendix() {
  const rest = achievements.filter((a) => a.category.startsWith("sport") || a.category === "interests");
  return (
    <Section id="appendix" n="Appendix A" title="Off the keyboard" wide kicker="The author is also, on occasion, outdoors.">
      <div className="grid auto-rows-[11rem] grid-cols-2 gap-3 md:auto-rows-[13rem] md:grid-cols-4">
        {PLATES.map((p, i) => (
          <figure key={p.src} className={`rise relative ${p.span} ${i === 0 ? "col-span-2 row-span-2 md:col-span-2" : ""}`}>
            <div className="shot plate h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt={p.cap} loading="lazy" />
            </div>
            <figcaption className="absolute bottom-0 left-0 !mt-0 bg-bg/85 px-2 py-1 backdrop-blur">
              <b>Fig. 5{String.fromCharCode(97 + i)}.</b> {p.cap}
            </figcaption>
          </figure>
        ))}
      </div>
      <ul className="mt-8 grid grid-cols-1 gap-x-10 md:grid-cols-2">
        {rest.map((a) => (
          <li key={a.id} className="border-b border-line py-3">
            <p className="font-sans font-bold tracking-tight">
              {a.name} <span className="mono ml-1 font-normal text-muted">{a.category === "sport-done" ? a.year : `since ${a.year}`}</span>
            </p>
            <p className="text-[0.92rem] leading-snug text-muted">{a.blurb}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
