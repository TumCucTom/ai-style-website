import constellation from "@/data/constellation.json";
import projects from "@/data/projects.json";
import achievements from "@/data/achievements.json";
import experience from "@/data/experience.json";
import type { MapData } from "@/lib/umap";

type Item = { id: string; name: string; kind: string; x: number; y: number; z: number; cluster: number };
const items = constellation.items as Item[];
const KIND: Record<string, string> = { repo: "r", project: "p", achievement: "a", experience: "e", tech: "t" };

export const mapCounts = {
  total: items.length,
  dim: constellation.dim,
  source: constellation.embedSource,
  kinds: items.reduce<Record<string, number>>((m, i) => ((m[i.kind] = (m[i.kind] ?? 0) + 1), m), {}),
  clusters: constellation.clusters.map((c) => ({ name: c.name, color: c.color, count: c.count })),
};

/** The packed map (~12 KB gzipped), served as a static JSON file and fetched when the figure nears the viewport. */
export function mapData(): MapData {
  const byId = new Map(items.map((it) => [it.id, it.name]));
  const meta: MapData["meta"] = {};
  items.forEach((it, i) => {
    if (it.kind === "project") {
      const p = projects.find((p) => `project-${p.slug}` === it.id);
      if (p) {
        const links = p.links as { live?: string; github?: string; appstore?: string };
        meta[i] = { t: p.tagline, u: links.live ?? links.github ?? links.appstore };
      }
    } else if (it.kind === "achievement") {
      const a = achievements.find((a) => `ach-${a.id}` === it.id);
      if (a) meta[i] = { t: a.blurb };
    } else if (it.kind === "experience") {
      const e = experience.jobs.find((e) => `exp-${e.id}` === it.id);
      if (e) meta[i] = { t: `${e.role}, ${e.org}. ${e.summary}` };
    } else if (it.kind === "tech") {
      const o = byId.get(it.id.slice(5).split("--")[0]);
      if (o) meta[i] = { o };
    }
  });
  return {
    c: items.map((i) => i.cluster.toString(36)).join(""),
    k: items.map((i) => KIND[i.kind] ?? "r").join(""),
    clusters: mapCounts.clusters,
    names: items.map((i) => i.name),
    p: items.flatMap((i) => [Math.round(i.x * 1000), Math.round(i.y * 1000), Math.round(i.z * 1000)]),
    meta,
  };
}
