"use client";

import { useState } from "react";
import { DOMAINS } from "@/lib/domains";

export type Project = {
  slug: string;
  name: string;
  tagline: string;
  domain: string;
  year?: number;
  stack: string[];
  links: { github?: string; live?: string; appstore?: string };
  image?: string;
  video?: string;
  highlight?: boolean;
  highlightOrder?: number;
};

const FOLD = 12;

export function ProjectIndex({ projects }: { projects: Project[] }) {
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const counts: Record<string, number> = {};
  projects.forEach((p) => (counts[p.domain] = (counts[p.domain] ?? 0) + 1));
  const domains = Object.keys(DOMAINS).filter((d) => counts[d]);
  const list = projects.filter((p) => filter === "all" || p.domain === filter);
  const shown = open || filter !== "all" ? list : list.slice(0, FOLD);

  return (
    <div className="mt-20">
      <p className="cap !mt-0">
        <b className="text-ink">Table 1.</b> The other {projects.length}. Filter by field.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {["all", ...domains].map((d) => (
          <button
            key={d}
            onClick={() => setFilter(d)}
            aria-pressed={filter === d}
            className={`chip flex items-center gap-1.5 hover:text-ink ${filter === d ? "!border-ink !bg-ink !text-bg" : ""}`}
          >
            {d !== "all" && <i className="h-1.5 w-1.5 rounded-full" style={{ background: DOMAINS[d].color }} />}
            {d === "all" ? "All" : DOMAINS[d].label}
            <span className="tabular opacity-60">{d === "all" ? projects.length : counts[d]}</span>
          </button>
        ))}
      </div>

      <ul className="rule-top rule-bot mt-4 grid grid-cols-1 md:grid-cols-2 md:gap-x-10">
        {shown.map((p) => {
          const d = DOMAINS[p.domain] ?? DOMAINS.other;
          return (
            <li key={p.slug} className="min-w-0 border-b border-line">
              <a
                href={p.links.live ?? p.links.github ?? p.links.appstore}
                target="_blank"
                rel="noreferrer"
                className="row flex items-baseline gap-3 px-2 py-2.5"
              >
                <i className="h-1.5 w-1.5 shrink-0 -translate-y-0.5 rounded-full" style={{ background: d.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-sans font-bold tracking-tight">{p.name}</span>
                  <span className="block truncate text-[0.88rem] text-muted">{p.tagline}</span>
                </span>
                {p.year && <span className="mono tabular text-muted">{p.year}</span>}
                <span className="arrow font-mono text-sm">↗</span>
              </a>
            </li>
          );
        })}
      </ul>
      {filter === "all" && list.length > FOLD && (
        <button className="btn mt-5" onClick={() => setOpen(!open)}>
          {open ? "show fewer" : `show all ${list.length}`}
        </button>
      )}
    </div>
  );
}
