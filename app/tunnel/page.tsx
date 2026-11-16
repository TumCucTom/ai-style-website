import projects from "@/data/projects.json";
import experience from "@/data/experience.json";
import oss from "@/data/open-source.json";
import { Tunnel } from "@/components/tunnel/Tunnel";
import "./tunnel.css";

export const metadata = { title: "Tom Bale · wind tunnel" };

// My own one-liners for the five I'd show first. Everything else about them
// (names, links, pictures) comes from the data files.
const SAY: Record<string, string> = {
  "vlm-memory":
    "My dissertation. It gives a vision-language model a memory and lets it pick which frames to look at, so it can keep track of a space over time.",
  "f1-ghost-car": "Rebuilds two drivers' qualifying laps from the telemetry and plays them against each other from above.",
  "llama-8b-isc25": "The Llama fine-tuning setup we ran on eight H100s at the cluster competition.",
  "ai-chess-3d": "Chess on an 8×8×8 board, with an engine to play against. This was my A-level project.",
  "quantum-cross-chain-arbitrage": "A hackathon project that uses QAOA to look for arbitrage across chains. It won at ETH Oxford.",
};

const JOBS: Record<string, string> = {
  veloworks: "A small business making 3D-printed cycling components. I did the website and ran the operations side.",
  "demonstrator-bristol": "Taught first and second years: lectures, workshops, and mentoring a team through their year-long software project.",
  "ml-research-bristol": "Built a pipeline that generates photorealistic faces showing set emotions, for psychology experiments.",
  "edtech-cofounder": "A personal-finance education app. I built it. I turned down a DeepMind internship to do this instead.",
  "digital-u3-intern": "An internship. I worked on an ML service that spots fire, smoke and oil leaks from IoT devices.",
};

export default function Page() {
  const top = projects
    .filter((p) => p.highlight)
    .sort((a, b) => (a.highlightOrder ?? 99) - (b.highlightOrder ?? 99))
    .map((p) => ({
      name: p.name,
      say: SAY[p.slug] ?? p.tagline,
      href: (p.links as { live?: string; github?: string }).live ?? p.links.github,
      image: p.image as string,
      year: p.year,
    }));
  const jobs = experience.jobs
    .filter((j) => JOBS[j.id])
    .map((j) => ({ role: j.role, org: j.org.split(" · ")[0], dates: j.dates, say: JOBS[j.id] }));
  const repos = oss.map((r) => ({ name: `${r.org}/${r.repo}`, href: r.url, n: r.prs.length }));
  return <Tunnel top={top} more={projects.length - top.length} jobs={jobs} repos={repos} />;
}
