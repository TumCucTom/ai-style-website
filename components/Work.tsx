import projects from "@/data/projects.json";
import { DOMAINS } from "@/lib/domains";
import { LoopVideo } from "@/components/Bits";
import { ProjectIndex, type Project } from "@/components/ProjectIndex";
import { Section } from "@/components/Section";

const all = projects as Project[];

export function Work() {
  const top = all.filter((p) => p.highlight).sort((a, b) => (a.highlightOrder ?? 99) - (b.highlightOrder ?? 99));
  return (
    <Section
      id="work"
      n="§2"
      title="Selected work"
      wide
      kicker={`Five to start with, then a table of the other ${all.length - top.length}.`}
    >
      <div className="grid gap-x-5 gap-y-10 md:grid-cols-6">
        {top.map((p, i) => {
          const d = DOMAINS[p.domain] ?? DOMAINS.other;
          return (
            <figure key={p.slug} className={`rise ${i < 2 ? "md:col-span-3" : "md:col-span-2"}`}>
              <a href={p.links.live ?? p.links.github} target="_blank" rel="noreferrer" className="group block">
                <div className={`shot plate ${i < 2 ? "aspect-[2/1]" : "aspect-[4/3]"}`}>
                  {p.video ? (
                    <LoopVideo src={p.video} poster={p.image!} label={p.name} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" loading="lazy" />
                  )}
                </div>
                <figcaption>
                  <b>Fig. 3{String.fromCharCode(97 + i)}.</b>{" "}
                  <i className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: d.color }} />
                  {d.label}, {p.year}
                </figcaption>
                <h3 className="h3 mt-1.5 flex items-baseline gap-2 !text-2xl">
                  {p.name}
                  <span className="arrow font-mono text-sm text-muted transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent">
                    ↗
                  </span>
                </h3>
                <p className="mt-1 text-[0.95rem] leading-snug text-muted">{p.tagline}</p>
                <p className="mono mt-2 text-muted">{p.stack.slice(0, 4).join(" · ")}</p>
              </a>
            </figure>
          );
        })}
      </div>

      <ProjectIndex projects={all.filter((p) => !p.highlight).map(({ slug, name, tagline, domain, year, links }) => ({ slug, name, tagline, domain, year, links, stack: [] }))} />
    </Section>
  );
}
