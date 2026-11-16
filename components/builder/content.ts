import projects from "@/data/projects.json";
import experience from "@/data/experience.json";
import education from "@/data/education.json";
import achievements from "@/data/achievements.json";
import commits from "@/data/live-commits.json";
import chess from "@/data/live-chess.json";
import spotify from "@/data/live-spotify.json";
import type { Content } from "./Site";

// Everything the page can ever show. The spec only chooses from this and
// arranges it; no text about Tom is generated.
export function content(): Content {
  type P = { name: string; tagline: string; domain: string; year?: number; image?: string; links: Record<string, string | undefined> };
  const c = commits as unknown as { summary: { last24h: { commits: number }; last7d: { commits: number } } };
  const ch = chess as unknown as { rapid: { rating: number | null } | null; blitz: { rating: number | null } | null };
  const sp = spotify as unknown as { current: { name: string; artist: string } | null };
  return {
    projects: (projects as P[]).map((p) => ({
      name: p.name,
      tagline: p.tagline,
      domain: p.domain,
      year: p.year,
      image: p.image,
      href: p.links.live ?? p.links.github ?? p.links.appstore,
    })),
    jobs: experience.jobs.map((j) => ({ id: j.id, role: j.role, org: j.org, dates: j.dates, summary: j.summary })),
    schools: education.schools.map((s) => ({ name: s.name, qualification: s.qualification, dates: s.dates, grade: s.grade })),
    wins: achievements
      .filter((a) => a.category === "hackathons" || a.category === "competition")
      .sort((a, b) => b.year - a.year)
      .map((a) => ({ name: a.name, year: a.year, blurb: a.blurb, tags: a.tags, photo: a.photo })),
    sport: achievements
      .filter((a) => a.category.startsWith("sport") || a.category === "interests")
      .map((a) => ({ name: a.name, year: a.year, blurb: a.blurb, photo: a.photo })),
    live: {
      c24: c.summary.last24h.commits,
      c7: c.summary.last7d.commits,
      rapid: ch.rapid?.rating ?? null,
      blitz: ch.blitz?.rating ?? null,
      track: sp.current ? { name: sp.current.name, artist: sp.current.artist } : null,
    },
  };
}
