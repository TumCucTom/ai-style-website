// scripts/oss-prs.mjs
// Fetch all PRs (open, merged, closed) by thomas-bale for repos in open-source.json
// Uses Search API for accuracy (finds PRs across forks) + fallback to pulls API
//
// Run: node scripts/oss-prs.mjs
// Runs as part of refresh-live GitHub Actions workflow.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const OSS_FILE = path.join(DATA, "open-source.json");

const TOKEN = process.env.GH_USER_TOKEN || process.env.GITHUB_TOKEN;

const authHeaders = () => ({
  "User-Agent": "tom-bale-v3-site",
  Accept: "application/vnd.github.v3+json",
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
});

async function fetchAllPRsSearch(org, repo) {
  // Use search API — finds PRs across all forks reliably
  const url = `https://api.github.com/search/issues?q=author:thomas-bale+repo:${org}/${repo}+type:pr&sort=created&order=desc&per_page=100`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    console.error(`  Search API ${res.status} for ${org}/${repo}: ${res.statusText}`);
    return null;
  }
  const data = await res.json();
  if (!data.items) return null;
  return data.items.map(pr => ({
    n: pr.number,
    title: pr.title,
    state: pr.state === "open" ? "OPEN" : pr.state === "closed" ? "CLOSED" : pr.state.toUpperCase(),
    date: pr.created_at.slice(0, 10),
  }));
}

async function main() {
  const raw = fs.readFileSync(OSS_FILE, "utf8");
  const repos = JSON.parse(raw);

  console.log(`Checking PR counts for ${repos.length} repos...`);

  for (const repo of repos) {
    const freshPRs = await fetchAllPRsSearch(repo.org, repo.repo);
    if (freshPRs === null) continue;

    const hadOpen = repo.prs.filter(pr => pr.state === "OPEN").length;
    repo.prs = freshPRs;
    console.log(`  ${repo.org}/${repo.repo}: ${hadOpen} -> ${freshPRs.length} total PRs`);
  }

  fs.writeFileSync(OSS_FILE, JSON.stringify(repos, null, 2) + "\n");
  console.log("Done.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});