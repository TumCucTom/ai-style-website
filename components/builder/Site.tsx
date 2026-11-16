import { ContactGate } from "@/components/ContactGate";
import { HEADLINES, type Focus, type Section, type Spec } from "./spec";
import { SHAPE_VIEWS } from "./shapes";

export type Content = {
  projects: { name: string; tagline: string; domain: string; year?: number; image?: string; href?: string }[];
  jobs: { id: string; role: string; org: string; dates: string; summary: string }[];
  schools: { name: string; qualification: string; dates: string; grade: string }[];
  wins: { name: string; year: number; blurb: string; tags: string[]; photo?: string }[];
  sport: { name: string; year: number; blurb: string; photo?: string }[];
  live: { c24: number; c7: number; rapid: number | null; blitz: number | null; track: { name: string; artist: string } | null };
};

const TITLE: Record<Section, string> = {
  live: "This week",
  projects: "Things I've made",
  experience: "Jobs so far",
  education: "School",
  wins: "Hackathons and competitions",
  sport: "Away from the desk",
  contact: "Say hi",
};
// Someone who asks for formal gets the usual headings.
const FORMAL: Record<Section, string> = {
  live: "Current activity",
  projects: "Projects",
  experience: "Experience",
  education: "Education",
  wins: "Awards",
  sport: "Interests",
  contact: "Contact",
};

// How a focus selects from the data. Selection only: nothing is rewritten.
const HPC = /hpc|lbm|lattice|isc|cluster|parallel|openmp|cuda|distributed|slurm|grace/i;
export const projectIn: Record<Focus, (p: Content["projects"][number]) => boolean> = {
  ai: (p) => p.domain === "ai",
  hpc: (p) => p.domain === "coursework" && HPC.test(`${p.name} ${p.tagline}`),
  quantum: (p) => p.domain === "quantum" || /quantum|qaoa|varqite/i.test(`${p.name} ${p.tagline}`),
  f1: (p) => p.domain === "f1",
  ios: (p) => p.domain === "ios",
  web: (p) => p.domain === "web",
  games: (p) => p.domain === "game",
  defi: (p) => p.domain === "defi",
  puzzles: (p) => p.domain === "puzzle",
};
export const JOBS: Partial<Record<Focus, string[]>> = {
  ai: ["anima", "ml-research-bristol", "digital-u3-intern"],
  hpc: ["ukscc-isc25"],
  web: ["veloworks"],
  ios: ["edtech-cofounder"],
};
export const TAGS: Partial<Record<Focus, RegExp>> = {
  ai: /^(ai|llama|agent)$/,
  hpc: /^(hpc|cluster)$/,
  quantum: /^(quantum|ionq|qaoa)$/,
  f1: /^(formula|f1ai)$/,
  defi: /^(defi|vyper|sui|polygon)$/,
};

function Hero({ spec }: { spec: Spec }) {
  const { h, sub } = HEADLINES[spec.tone];
  const kind = spec.layout.hero;
  if (kind === "terminal")
    return (
      <header className="llm-hero llm-hero-terminal">
        <p className="llm-dim">$ whoami</p>
        <h1>{h}</h1>
        <p className="llm-dim">$ cat about.txt</p>
        <p>
          {sub}
          <span className="llm-cursor" />
        </p>
      </header>
    );
  if (kind === "marquee")
    return (
      <header className="llm-hero llm-hero-marquee">
        <div className="llm-marquee" aria-hidden="true">
          <span>
            {h} ✦ {h} ✦ {h} ✦ {h} ✦&nbsp;
          </span>
        </div>
        <h1 className="llm-sr">{h}</h1>
        <p>{sub}</p>
      </header>
    );
  if (kind === "masthead")
    return (
      <header className="llm-hero llm-hero-masthead">
        <p className="llm-dateline">
          <span>London</span>
          <span>Fourth edition</span>
          <span>thomasbale.com</span>
        </p>
        <h1>{h}</h1>
        <p>{sub}</p>
      </header>
    );
  return (
    <header className={`llm-hero llm-hero-${kind}`}>
      <h1>{h}</h1>
      <p>{sub}</p>
    </header>
  );
}

export function Site({ spec, content }: { spec: Spec; content: Content }) {
  const { focus, limit, images, sections } = spec.layout;
  const focused = focus.length > 0;
  const projects = (focused ? content.projects.filter((p) => focus.some((f) => projectIn[f](p))) : content.projects).slice(0, limit);
  const jobIds = focus.flatMap((f) => JOBS[f] ?? []);
  const jobs = focused ? content.jobs.filter((j) => jobIds.includes(j.id)) : content.jobs;
  const wins = focused
    ? content.wins.filter((w) => focus.some((f) => w.tags.some((t) => TAGS[f]?.test(t))))
    : content.wins;

  const shape = spec.layout.shape;
  if (shape !== "stack") {
    const View = SHAPE_VIEWS[shape];
    const { h, sub } = HEADLINES[spec.tone];
    return (
      <div className="llm-site">
        <View
          spec={spec}
          h={h}
          sub={sub}
          title={spec.tone === "formal" ? FORMAL : TITLE}
          sections={sections}
          projects={projects}
          jobs={jobs}
          wins={wins}
          schools={content.schools}
          sport={content.sport}
          live={content.live}
          images={images}
          gate={<ContactGate bare className="llm-gate" />}
        />
      </div>
    );
  }

  const body: Record<Section, React.ReactNode> = {
    live: (
      <div className="llm-grid llm-stats">
        <div className="llm-card">
          <b>{content.live.c24}</b>
          <span>commits in the last 24 hours</span>
        </div>
        <div className="llm-card">
          <b>{content.live.c7}</b>
          <span>commits in the last 7 days</span>
        </div>
        {content.live.rapid && (
          <div className="llm-card">
            <b>{content.live.rapid}</b>
            <span>chess.com rapid rating</span>
          </div>
        )}
        {content.live.track && (
          <div className="llm-card">
            <b className="llm-small">{content.live.track.name}</b>
            <span>last played · {content.live.track.artist}</span>
          </div>
        )}
      </div>
    ),
    projects: projects.length ? (
      <div className="llm-grid">
        {projects.map((p) => (
          <a key={p.name} href={p.href} target="_blank" rel="noreferrer" className="llm-card llm-project">
            {images && p.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt="" loading="lazy" />
            )}
            <strong>{p.name}</strong>
            <span>{p.tagline}</span>
            <em>
              {p.domain}
              {p.year ? ` · ${p.year}` : ""}
            </em>
          </a>
        ))}
      </div>
    ) : (
      <p className="llm-dim">I haven&apos;t made anything that fits that. Try a different focus.</p>
    ),
    experience: jobs.length ? (
      <ul className="llm-list">
        {jobs.map((j) => (
          <li key={j.id}>
            <em>{j.dates}</em>
            <div>
              <strong>{j.role}</strong> · {j.org}
              <span>{j.summary}</span>
            </div>
          </li>
        ))}
      </ul>
    ) : null,
    education: (
      <div className="llm-grid">
        {content.schools.map((s) => (
          <div key={s.name} className="llm-card">
            <em>{s.dates}</em>
            <strong>{s.name}</strong>
            <span>{s.qualification}</span>
            <span>{s.grade.replaceAll(",", ", ")}</span>
          </div>
        ))}
      </div>
    ),
    wins: wins.length ? (
      <ul className="llm-list">
        {wins.map((w) => (
          <li key={w.name}>
            <em>{w.year}</em>
            <div>
              <strong>{w.name}</strong>
              <span>{w.blurb}</span>
            </div>
          </li>
        ))}
      </ul>
    ) : (
      <p className="llm-dim">Nothing here for that one.</p>
    ),
    sport: (
      <div className="llm-grid">
        {content.sport.map((s) => (
          <div key={s.name} className="llm-card llm-project">
            {images && s.photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.photo} alt="" loading="lazy" />
            )}
            <strong>{s.name}</strong>
            <span>{s.blurb}</span>
          </div>
        ))}
      </div>
    ),
    // contact details live behind the puzzle on every version of the site
    contact: <ContactGate bare className="llm-gate" />,
  };

  return (
    <div className="llm-site">
      <div style={{ viewTransitionName: "llm-hero" }}>
        <Hero spec={spec} />
      </div>
      {sections.filter((id) => body[id] !== null).map((id) => (
        <section key={id} className="llm-sec" style={{ viewTransitionName: `llm-sec-${id}` }}>
          <h2>{(spec.tone === "formal" ? FORMAL : TITLE)[id]}</h2>
          {body[id]}
        </section>
      ))}
    </div>
  );
}
