// scripts/embed.mjs
// Build data/constellation.json from:
//   - ALL_REPOS.md            (parsed, 1 item per repo, kind=repo)
//   - data/projects.json      (kind=project)
//   - data/achievements.json  (kind=achievement)
//   - data/experience.json    (kind=experience)
//   - /Users/tom/toms-brain/wiki/**  (kind=tb-*; see below)
//
// Text for each item is concatenated (name + description + stack/tags).
// Embed with bge-base-en-v1.5 via the Hugging Face inference API
// (free tier, no token needed but rate-limited). Falls back to a
// pure-Node TF-IDF if the API is unavailable.
// Then PCA to 3D and KMeans to cluster.
//
// Re-run with `npm run embed`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const SITE_ROOT = path.resolve(ROOT, "..");

const REPOS_MD = path.join(SITE_ROOT, "ALL_REPOS.md");
const BRAIN_DIR = "/Users/tom/toms-brain/wiki";
const HF_MODEL = "BAAI/bge-base-en-v1.5";
const HF_URLS = [
  `https://router.huggingface.co/hf-inference/models/${HF_MODEL}`,
  `https://api-inference.huggingface.co/models/${HF_MODEL}`,
  `https://api-inference.huggingface.co/pipeline/feature-extraction/${HF_MODEL}`,
];
const HF_TOKEN = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN;
const BATCH = 24;
const TARGET_DIM = 3;
// Only sub-cluster very large domains. Most domains stay as a single
// cluster so the legend reads "Web", "iOS Apps", "AI/ML" — not
// "Web" and "Web · Typescript · Mediapipe" side-by-side. Sub-clusters
// are only worth it when the domain has 40+ items, and even then the
// suffix should be a real sub-category (e.g. "AI/ML · Vision" vs
// "AI/ML · NLP") rather than whatever token wins a TF battle.
const SUB_CLUSTER_THRESHOLDS = [
  // [minSize, K] — only the very biggest domains get split
  { min: 60, k: 2 },
];

// Real content kinds — used to drive clustering. These are the items the
// user actually did/built, not context about them.
const PRIMARY_KINDS = new Set([
  "repo", "project", "achievement", "experience", "timeline",
  "fork", "meta",
]);
// Wiki kinds — never clustered. They get projected onto the nearest
// primary item in 3D and rendered as small ambient dots.
const WIKI_KINDS = new Set([
  "tb-projects", "tb-projects-section", "tb-projects-sub",
  "tb-articles", "tb-articles-section", "tb-articles-sub",
  "tb-concepts", "tb-concepts-section",
  "tb-bullet", "tb-row", "tb-resource",
]);

// ---------- load data ----------

const projects = JSON.parse(fs.readFileSync(path.join(DATA, "projects.json"), "utf8"));
const achievements = JSON.parse(fs.readFileSync(path.join(DATA, "achievements.json"), "utf8"));
const experience = fs.existsSync(path.join(DATA, "experience.json"))
  ? JSON.parse(fs.readFileSync(path.join(DATA, "experience.json"), "utf8"))
  : { jobs: [] };
const timeline = fs.existsSync(path.join(DATA, "timeline.json"))
  ? JSON.parse(fs.readFileSync(path.join(DATA, "timeline.json"), "utf8"))
  : [];

// ---------- parse ALL_REPOS.md ----------

function parseAllRepos(md) {
  const items = [];
  // Each entry is tried in order — first prefix match wins. Section
  // headers in ALL_REPOS.md have suffixes like "(Swift)" or
  // "(board, video, ai)" so plain equality would miss them.
  const sectionPrefixes = [
    ["ai / machine learning", "ai"],
    ["puzzles", "puzzle"],
    ["f1 / motorsport", "f1"],
    ["hpc / distributed systems", "hpc"],
    ["quantum computing", "quantum"],
    ["defi / blockchain", "defi"],
    ["games", "game"],
    ["ios apps", "ios"],
    ["web projects", "web"],
    ["coursework", "coursework"],
    ["data analysis", "other"],
    ["forks", "fork"],
    ["profile & meta", "meta"],
  ];
  const lines = md.split(/\r?\n/);
  let section = null;
  let cur = null;
  const flush = () => {
    if (cur && cur.description) {
      items.push(cur);
    }
    cur = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      flush();
      const header = line.replace(/^##\s+/, "").trim().toLowerCase();
      section = null;
      for (const [prefix, cat] of sectionPrefixes) {
        if (header.startsWith(prefix)) { section = cat; break; }
      }
      continue;
    }
    if (line.startsWith("### ")) {
      flush();
      const raw = line.replace(/^###\s+/, "").trim();
      const name = raw
        .replace(/[🟢🟡🟠⭐](\s*Fork|\s*Placeholder|\s*Empty)?/g, "")
        .replace(/\s*—\s*see.*$/, "")
        .trim();
      cur = {
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        name,
        description: "",
        stack: [],
        category: section ?? "other",
        kind: "repo",
      };
      continue;
    }
    if (!cur) continue;
    const desc = line.match(/^- \*\*Description:\*\*\s*(.+)$/);
    if (desc) {
      cur.description = desc[1].trim();
      continue;
    }
    const tech = line.match(/^- \*\*Tech stack:\*\*\s*(.+)$/);
    if (tech) {
      cur.stack = tech[1]
        .split(/,\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      continue;
    }
  }
  flush();
  const seen = new Set();
  return items.filter((it) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });
}

const reposMd = fs.existsSync(REPOS_MD) ? fs.readFileSync(REPOS_MD, "utf8") : "";
const repos = parseAllRepos(reposMd);

// ALL_REPOS.md has a few entries miscategorized (e.g. focused/keep-sharp
// are iOS apps in the AI section). Cross-reference with projects.json:
// if the repo name matches a project's slug, trust the project's domain.
const projectBySlug = new Map(projects.map((p) => [p.slug.toLowerCase(), p]));
const projectByName = new Map(
  projects.map((p) => [p.name.toLowerCase().replace(/\s+/g, ""), p])
);
for (const r of repos) {
  const bySlug = projectBySlug.get(r.id);
  const byName = projectByName.get(r.name.toLowerCase().replace(/\s+/g, ""));
  const ref = bySlug ?? byName;
  if (ref && ref.domain && r.category !== ref.domain) {
    r.category = ref.domain;
  }
}

// ---------- parse toms-brain wiki ----------
// Pull from /Users/tom/toms-brain/wiki/{projects,articles,concepts}/*.md.
// Safety blocklist drops people, family, EF, lifestyle, philosophy, design
// taste, OpenClaw, ChatGPT stats, and the ACL injury (per toms-brain-
// irrelevant feedback memory). For each kept file we emit 1 page item + N
// H2 section items. Reading-list articles additionally emit 1 item per
// Resource bullet. Structured-table pages (Achievements/Sports/Travel/
// Publications) additionally emit 1 item per table row.

const BRAIN_BLOCKLIST = new Set([
  // people / family
  "Beth.md", "Matthew.md", "Jaz-Bale.md", "Joey-Bale.md", "Dzung-Bale.md",
  "Dylan-Lin.md", "Divit-Kashyap.md", "Sarah-Eccles.md", "georgia-AI.md",
  "Matthew-Agents.md", "Toby-and-Archie.md", "people.md",
  // personal / sensitive
  "ACL-Injury.md", "ChatGPT-Conversations.md", "OpenClaw.md",
  "OpenClaw-Crons.md", "OpenClaw-App.md", "OpenClaw-App-Template.md",
  "openclaw-memory.md", "design-aesthetic.md", "inspiration.md",
  "philosophy.md", "Identity.md", "Lifestyle.md", "Petrichor.md",
  "Lacrimosum.md", "Phrases.md", "Tom-Bale.md", "lifo-finance.md",
  "dissertation-project.md", "PhD-Proposal.md", "Thomas-Bale-CV.md",
  // EF / hiring pipeline
  "Entrepreneurs-First.md", "Hiring.md", "EF-Fall26-Reading-List.md",
  // index/structural
  "Home.md", "index.md", "log.md", "Home",
  // pure-question article (no item content)
  "Questions-Reading.md",
]);

const BRAIN_SECTION_BLOCKLIST = [
  /\bbeth\b/i, /\bmatthew\b/i, /\bjoey\b/i, /\bjaz\b/i, /\bdzung\b/i,
  /\bopenclaw\b/i, /\bchatgpt\b/i, /\bdrinking\b/i,
  /\bgirlfriend\b/i, /\bvikings?\b/i, /\bfamily athletics\b/i,
  /\bpersonal timeline\b/i, /\bacl\b/i, /\bheart scare\b/i,
];

// Applied to the rendered name + text of every brain item. Anything that
// trips a pattern is dropped, even if the section it came from was clean.
const BRAIN_TEXT_BLOCKLIST = [
  /\bbeth\b/i, /\bmatthew\b/i, /\bjoey\b/i, /\bjaz\b/i, /\bdzung\b/i,
  /\bdivit\b/i, /\bsarah eccles\b/i, /\bdylan lin\b/i, /\btoby\b/i, /\barchie\b/i,
  /\bopenclaw\b/i, /\bchatgpt\b/i, /\bgirlfriend\b/i,
  /\bacl (tear|injury|reconstruction|recovery)\b/i,
  /\bwith beth\b/i, /\bbale family\b/i, /\bswitzerland with beth\b/i,
];

function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { tags: [], body: md };
  const fm = m[1];
  const body = md.slice(m[0].length);
  const tags = [];
  for (const line of fm.split(/\r?\n/)) {
    const t = line.match(/^\s*-\s*(.+?)\s*$/);
    if (t) tags.push(t[1].replace(/['"]/g, ""));
  }
  return { tags, body };
}

function parseTitle(body) {
  const m = body.match(/^#\s+(.+?)\s*$/m);
  if (!m) return null;
  // drop trailing "— author", "— date", "[tag]" etc, keep main title
  return m[1].replace(/\s+—\s+.+$/, "").replace(/\s*\(formerly.+$/, "").trim();
}

function parseWikiFile(absPath, relKind) {
  const raw = fs.readFileSync(absPath, "utf8");
  const { tags, body } = parseFrontmatter(raw);
  const title = parseTitle(body) || path.basename(absPath, ".md");
  const fileId = path.basename(absPath, ".md").toLowerCase().replace(/[^a-z0-9]+/g, "-");

  // Split into H2 sections, then into H3 subsections. Skip frontmatter
  // and the leading H1 (it becomes the page item).
  const lines = body.split(/\r?\n/);
  const sections = []; // { heading, body, subsections: [{heading, body}] }
  let cur = null;
  let inCode = false;
  for (const line of lines) {
    if (line.startsWith("```")) { inCode = !inCode; if (cur && cur.subs) cur.body.push(line); else if (cur) cur.body.push(line); continue; }
    if (!inCode && /^###\s+/.test(line)) {
      if (cur) {
        if (cur.subs) {
          cur.subs.push({ heading: line.replace(/^###\s+/, "").trim(), body: [] });
        } else {
          cur.subs = [{ heading: line.replace(/^###\s+/, "").trim(), body: [] }];
        }
      }
      continue;
    }
    if (!inCode && /^##\s+/.test(line)) {
      if (cur) sections.push(cur);
      cur = { heading: line.replace(/^##\s+/, "").trim(), body: [], subs: [] };
      continue;
    }
    if (cur) {
      // If we have an H3 sub active, push there; else push to section body.
      if (cur.subs && cur.subs.length > 0) {
        cur.subs[cur.subs.length - 1].body.push(line);
      } else {
        cur.body.push(line);
      }
    }
  }
  if (cur) sections.push(cur);

  // Detect reading-list resources: bullets with [text](url)
  const resources = [];
  for (const sec of sections) {
    if (/^Resources?$/i.test(sec.heading) || /^Reading List$/i.test(sec.heading)) {
      for (const ln of sec.body) {
        const b = ln.match(/^-\s+\[([^\]]+)\]\(([^)]+)\)(?:\s*—\s*(.+))?$/);
        if (b) {
          resources.push({ title: b[1].trim(), url: b[2].trim(), author: (b[3] || "").trim() });
        }
      }
    }
  }

  // Detect table rows: simple markdown tables under any section.
  // We emit one row item per non-header, non-divider line.
  const tableRows = [];
  let inTable = false;
  let headerCols = [];
  for (const sec of sections) {
    for (let i = 0; i < sec.body.length; i++) {
      const line = sec.body[i];
      if (/^\s*\|.*\|\s*$/.test(line)) {
        const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
        if (!inTable) {
          // next line must be a divider |---|---|
          const next = sec.body[i + 1] || "";
          if (/^\s*\|[\s:|-]+\|\s*$/.test(next)) {
            inTable = true;
            headerCols = cells;
            i++; // skip divider
            continue;
          }
        } else {
          tableRows.push({ header: sec.heading, cols: headerCols, cells });
        }
      } else {
        inTable = false;
      }
    }
    inTable = false;
  }

  // Detect top-level bullet points across all sections (excluding
  // "Related" / "See Also" which are wiki cross-refs, not content).
  const SKIP_BULLET_HEADINGS = /^(related|see also|status|concepts covered|linked concepts)$/i;
  const bullets = [];
  for (const sec of sections) {
    if (SKIP_BULLET_HEADINGS.test(sec.heading)) continue;
    for (const ln of sec.body) {
      const b = ln.match(/^-\s+(?:\[[^\]]+\]\([^)]+\)\s*)?(.+)$/);
      if (b && b[1].length > 12) {
        bullets.push({ section: sec.heading, text: b[1] });
      }
    }
  }

  return { fileId, title, tags, sections, resources, tableRows, bullets, relKind };
}

function buildText(parts) {
  return parts
    .filter(Boolean)
    .join(". ")
    .replace(/\s+/g, " ")
    .trim();
}

const brainItems = [];
if (fs.existsSync(BRAIN_DIR)) {
  const subdirs = ["projects", "articles", "concepts"];
  for (const sub of subdirs) {
    const dir = path.join(BRAIN_DIR, sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".md")) continue;
      if (BRAIN_BLOCKLIST.has(f)) continue;
      const abs = path.join(dir, f);
      let parsed;
      try { parsed = parseWikiFile(abs, sub); }
      catch (e) { console.warn(`skip ${abs}: ${e.message}`); continue; }

      // Page-level item: title + tags + joined section bodies
      const pageText = buildText([
        parsed.title,
        parsed.tags.join(" "),
        ...parsed.sections.map((s) => `${s.heading}. ${s.body.join(" ")}`),
      ]);
      if (pageText.length > 20) {
        brainItems.push({
          id: `tb-${sub}-${parsed.fileId}`,
          name: parsed.title,
          text: pageText.slice(0, 1500),
          meta: { kind: `tb-${sub}`, tags: parsed.tags },
        });
      }

      // Section-level items
      for (const s of parsed.sections) {
        if (BRAIN_SECTION_BLOCKLIST.some((re) => re.test(s.heading))) continue;
        const secText = buildText([
          parsed.title, s.heading, s.body.join(" "),
        ]);
        if (secText.length < 30) continue;
        if (BRAIN_TEXT_BLOCKLIST.some((re) => re.test(secText))) continue;
        brainItems.push({
          id: `tb-${sub}-${parsed.fileId}--${s.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`,
          name: `${parsed.title} — ${s.heading}`,
          text: secText.slice(0, 800),
          meta: { kind: `tb-${sub}-section`, section: s.heading, tags: parsed.tags },
        });

        // H3 subsection items: richer items than the section-level summary
        for (let h3i = 0; h3i < (s.subs || []).length; h3i++) {
          const h3 = s.subs[h3i];
          if (BRAIN_SECTION_BLOCKLIST.some((re) => re.test(h3.heading))) continue;
          const subText = buildText([parsed.title, s.heading, h3.heading, h3.body.join(" ")]);
          if (subText.length < 30) continue;
          if (BRAIN_TEXT_BLOCKLIST.some((re) => re.test(subText))) continue;
          brainItems.push({
            id: `tb-${sub}-${parsed.fileId}--${s.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20)}-${h3.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 25)}-${h3i}`,
            name: `${parsed.title} — ${h3.heading}`,
            text: subText.slice(0, 600),
            meta: { kind: `tb-${sub}-sub`, section: s.heading, sub: h3.heading, tags: parsed.tags },
          });
        }
      }

      // Reading-list resources
      for (const r of parsed.resources) {
        const t = buildText([parsed.title, r.title, r.author]);
        if (t.length < 10) continue;
        brainItems.push({
          id: `tb-resource-${parsed.fileId}--${r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`,
          name: r.title,
          text: t.slice(0, 400),
          meta: { kind: "tb-resource", list: parsed.title, author: r.author, url: r.url },
        });
      }

      // Table rows
      for (const row of parsed.tableRows) {
        const t = buildText([
          parsed.title, row.header, row.headerCols?.join(" "), row.cells.join(" "),
        ]);
        if (t.length < 20) continue;
        const first = row.cells[0] || row.header;
        brainItems.push({
          id: `tb-row-${parsed.fileId}--${row.header.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20)}-${row.cells.join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`,
          name: `${parsed.title} — ${first}`,
          text: t.slice(0, 400),
          meta: { kind: "tb-row", table: row.header, tags: parsed.tags },
        });
      }

      // Per-bullet items (skip noisy Related/See Also + apply blocklists)
      for (let i = 0; i < parsed.bullets.length; i++) {
        const b = parsed.bullets[i];
        if (b.text.length < 15) continue;
        if (BRAIN_SECTION_BLOCKLIST.some((re) => re.test(b.section))) continue;
        const nm = b.text.slice(0, 60).replace(/\s+/g, " ").trim();
        const full = buildText([parsed.title, b.section, b.text]);
        if (BRAIN_TEXT_BLOCKLIST.some((re) => re.test(nm) || re.test(full))) continue;
        brainItems.push({
          id: `tb-bullet-${parsed.fileId}--${b.section.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 15)}-${i}`,
          name: nm,
          text: full.slice(0, 400),
          meta: { kind: "tb-bullet", section: b.section, tags: parsed.tags },
        });
      }
    }
  }
}

// ---------- build corpus ----------

function buildItemText(item) {
  const parts = [item.name];
  if (item.description) parts.push(item.description);
  if (item.blurb) parts.push(item.blurb);
  if (item.tagline) parts.push(item.tagline);
  if (item.summary) parts.push(item.summary);
  if (item.stack?.length) parts.push(item.stack.join(" "));
  if (item.tags?.length) parts.push(item.tags.join(" "));
  if (item.domain) parts.push(item.domain);
  if (item.category) parts.push(item.category);
  return parts.join(". ");
}

const items = [];
for (const r of repos) {
  items.push({
    id: `repo-${r.id}`,
    name: r.name,
    text: buildItemText(r),
    meta: { kind: "repo", category: r.category, stack: r.stack ?? [], description: r.description },
  });
}
for (const p of projects) {
  items.push({
    id: `project-${p.slug}`,
    name: p.name,
    text: buildItemText(p),
    meta: { kind: "project", domain: p.domain, year: p.year, stack: p.stack ?? [] },
  });
}
for (const a of achievements) {
  items.push({
    id: `ach-${a.id}`,
    name: a.name,
    text: buildItemText(a),
    meta: { kind: "achievement", category: a.category, year: a.year, tags: a.tags ?? [] },
  });
}
for (const j of experience.jobs ?? []) {
  items.push({
    id: `exp-${j.id}`,
    name: `${j.role} · ${j.org}`,
    text: buildItemText({ ...j, tags: [j.kind, ...(j.stack ?? [])] }),
    meta: { kind: "experience", subkind: j.kind, org: j.org, dates: j.dates, tags: [j.kind, ...(j.stack ?? [])] },
  });
}
for (const t of timeline) {
  items.push({
    id: `tl-${t.year}-${(t.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
    name: t.title,
    text: buildItemText(t),
    meta: { kind: "timeline", year: t.year, tags: t.tags ?? [] },
  });
}
for (const b of brainItems) {
  items.push(b);
}

const corpus = items.filter((i) => i.text && i.text.trim().length > 4);

const brainByKind = brainItems.reduce((acc, b) => {
  acc[b.meta.kind] = (acc[b.meta.kind] || 0) + 1;
  return acc;
}, {});

const primaryItems = corpus.filter((c) => PRIMARY_KINDS.has(c.meta?.kind));
const wikiItems = corpus.filter((c) => WIKI_KINDS.has(c.meta?.kind));

// --dump: emit a corpus.json with the text for each primary item so
// scripts/embed_umap.py can embed + UMAP them offline and write back
// 3D coords. This avoids re-implementing ALL_REPOS.md + wiki parsing
// in Python. `npm run embed:corpus` calls this path.
if (process.argv.includes("--dump")) {
  const out = primaryItems.map((it) => ({
    id: it.id,
    text: primaryText(it),
    name: it.name,
    meta: it.meta,
  }));
  fs.writeFileSync(path.join(DATA, "corpus.json"), JSON.stringify(out, null, 2));
  console.log(`dumped ${out.length} primary items to data/corpus.json`);
  process.exit(0);
}

console.log(
  `corpus: ${corpus.length} items (${primaryItems.length} primary + ${wikiItems.length} wiki) — ${repos.length} repos + ${projects.length} projects + ${achievements.length} achievements + ${(experience.jobs ?? []).length} experience + ${timeline.length} timeline + ${brainItems.length} brain: ${Object.entries(brainByKind).map(([k, n]) => `${k}=${n}`).join(", ")})`
);

// Build focused text for embedding. Domain is repeated 2x — a single
// occurrence of a domain token at K=21 barely shifts the centroid, so
// we double-up to give the cluster a coherent direction without making
// the embedding 1D (which is what 6x used to do — see the 4-boulder
// bug). Stack/tags/stack provide secondary signal.
function primaryText(item) {
  const m = item.meta || {};
  const parts = [item.name, item.name];
  const dom = m.domain || m.category || m.subkind;
  if (dom) {
    for (let i = 0; i < 2; i++) parts.push(dom);
  }
  if (m.tags?.length) parts.push(m.tags.join(" "));
  if (m.stack?.length) parts.push(m.stack.join(" "));
  if (item.text) parts.push(item.text.slice(0, 200));
  return parts.filter(Boolean).join(" ");
}

function wikiText(item) {
  const m = item.meta || {};
  const parts = [item.name, item.name];
  if (m.section) parts.push(m.section);
  if (m.sub) parts.push(m.sub);
  if (m.list) parts.push(m.list);
  if (m.tags?.length) parts.push(m.tags.join(" "));
  if (item.text) parts.push(item.text.slice(0, 300));
  return parts.filter(Boolean).join(" ");
}

const primaryTexts = primaryItems.map(primaryText);
const wikiTexts = wikiItems.map(wikiText);

// ---------- embed via HF (with TF-IDF fallback) ----------

async function embedViaHF(texts) {
  const headers = { "Content-Type": "application/json" };
  if (HF_TOKEN) headers.Authorization = `Bearer ${HF_TOKEN}`;
  const all = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    let lastErr = null;
    let success = false;
    for (const url of HF_URLS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ inputs: batch, options: { wait_for_model: true } }),
        });
        if (!res.ok) {
          lastErr = `${res.status} ${await res.text().then((t) => t.slice(0, 200))}`;
          continue;
        }
        const data = await res.json();
        if (!Array.isArray(data) || !Array.isArray(data[0])) {
          lastErr = "bad response shape";
          continue;
        }
        all.push(...data);
        success = true;
        break;
      } catch (e) {
        lastErr = String(e?.message ?? e);
      }
    }
    if (!success) {
      throw new Error(`HF API failed on batch ${i}: ${lastErr}`);
    }
    process.stdout.write(
      `\r  embedded ${Math.min(i + BATCH, texts.length)} / ${texts.length}`
    );
  }
  process.stdout.write("\n");
  return all;
}

// TF-IDF with bigrams. Returns a fitted object so the same vocab can be
// applied to wiki items afterwards, keeping primary and wiki in the same
// feature space.
const TFIDF_STOPWORDS = new Set([
  "the","and","for","with","that","this","from","into","using","used","use",
  "via","based","build","built","make","made","new","one","two","also","see",
  "like","item","items","work","project","projects","section","sections",
  "wiki","wiki-section","wiki-bullet","wiki-row","wiki-sub","wiki-project",
  "wiki-article","wiki-concept","wiki-note","wiki-ref","wiki-section","wiki-sub",
  "bullet","bullets","row","rows","ref","refs","sub","subs",
  "tom","bale","thomas","thomas-bale","tombale","tom-bale",
  "repo","repos","achievement","achievements","milestone","milestones",
  "note","notes","list","entry","entries","readme","readmed",
  "app","apps","api","apis","web","ios","cli","sdk","lib",
  "data","dataset","datasets","info","information","version","versions",
  "year","years","time","times","day","days","week","weeks","month","months",
  "page","pages","file","files","docs","doc","guide","guides",
  "first","next","last","back","top","bottom","left","right","center",
  "small","large","big","tiny","huge","high","low","full","part","parts",
  "good","bad","new","old","many","few","most","more","less","least",
  "feature","features","function","functions",
  "test","tests","example","examples","sample","samples","demo","demos",
  "related","about","overview","intro","introduction",
  "code","script","scripts","tool","tools","system","systems","service","services",
  "method","methods","approach","approaches","technique","techniques",
  "implementation","implementations","library","libraries",
  "framework","frameworks","package","packages","module","modules",
  "reading","list","category","categories","tag","tags","label","labels",
  "value","values","type","types","name","names","title","titles",
  "output","outputs","input","inputs","result","results",
  "main","core","primary","secondary","basic","advanced","simple","complex",
  "https","http","www","com","net","org","io","github","tumcuctom",
  "yes","no","ok","okay","true","false","none","null","undefined",
  "are","have","had","has","their","thi","tha","wer","own",
  "key","major","your","our","there","where","when",
  "visible","without","with","against","between","within",
  "could","would","should","might","must","will","shall","cannot",
  "any","all","each","every","some","other","another",
  "thing","way","place","idea","ha",
  "do","did","done","doing","make","made","making",
  "here","how","why","what","who","whom","whose",
  "overview","status","summary","background","context","goal",
  "goals","objective","objectives","motivation","scope",
  "misc","other","note","notes","todo","to-do",
  "listed","listing","profile","user","users","account",
  "history","historical","development","versioned","launched",
  "name","named","title","titled","call","calls","called",
  "still","yet","already","often","always","never","later",
  "look","looks","looking","see","sees","seeing","found",
  "across","along","around","behind","beyond","inside","outside",
  "main","mostly","especially","particularly","specifically",
  "biggest","smallest","largest","earliest","latest",
  "ensure","ensuring","ensure-that","helps","helping",
  "solve","solving","solver","solved",
  "not","cannot","cant","wont","dont","doesnt","isnt","arent",
  "pattern","patterns",
  "knowing","know","knows","known",
  "relationship","relationships",
  "dissertation","thesis",
  "fyp","final-year-project","dissertation-project",
  "fully","completely","totally",
  "training","trained","train",
  "personal","personally",
  "startup","startups","startup-",
  "arbitrage",
  // generic self-references that add no signal
  "available","provide","provides","provided","including","include","includes",
  "including","allows","allow","allowed","support","supports","supported",
  "require","requires","required","need","needs","needed",
  "also","too","well","just","really","actually",
  "thing","things","stuff","bit","bits","piece","pieces",
  "kind","sort","type","types","way","ways",
  "etc","eg","ie","al","per","via","per",
  // repo-name / project-name bleed (caught earlier with no effect)
  "rhino","rhinos","rhino-deck","rhino-website",
  "plantdrobe","zippy","laptop","sticker","stickers",
  "vlm-memory","vlm-3r","vlm3r","vlm",
  "yuki","yuki-gpt","yukigpt","yukigt",
  "georgia","georgia-ai",
  "agentic-playground","agentic","playground",
  "can-u-dig-it","canudig",
  // chess character bleed
  "icarus","sisyphe","sisyphus","prometheus","tartarus",
  "persephone","orpheus","eurydice","achilles","troy",
  "odysseus","theseus","minotaur","daedalus",
]);

function tokeniseTfidf(s) {
  const toks = s
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/\.md$/i, ""))
    .filter((t) => t.length > 2 && !/^\d+$/.test(t) && !TFIDF_STOPWORDS.has(t));
  // Adjacent bigrams — captures "machine learning", "high performance",
  // "student cluster" etc. that single tokens can't represent.
  const bigrams = [];
  for (let i = 0; i < toks.length - 1; i++) {
    bigrams.push(`${toks[i]}_${toks[i + 1]}`);
  }
  return [...toks, ...bigrams];
}

function buildTfidf(texts) {
  const docs = texts.map(tokeniseTfidf);
  const df = new Map();
  for (const d of docs) {
    const seen = new Set(d);
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
  }
  // Drop singletons — terms that appear in only one doc are noise at this
  // scale (we only have ~200 primary items, and many domain terms are
  // unique to a single repo).
  const vocab = [...df.entries()].filter(([, c]) => c >= 2).map(([t]) => t);
  const vocabIdx = new Map(vocab.map((t, i) => [t, i]));
  const idf = new Map(vocab.map((t) => [t, Math.log((docs.length + 1) / (df.get(t) + 1)) + 1]));
  const vec = (d) => {
    const tf = new Map();
    for (const t of d) tf.set(t, (tf.get(t) || 0) + 1);
    const v = new Array(vocab.length).fill(0);
    for (const [t, c] of tf) {
      const i = vocabIdx.get(t);
      if (i >= 0) v[i] = (1 + Math.log(c)) * (idf.get(t) ?? 0);
    }
    const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
    return v.map((x) => x / n);
  };
  return {
    vocab,
    vectors: docs.map(vec),
    transform: (text) => vec(tokeniseTfidf(text)),
  };
}

// Try the offline UMAP path first. If data/constellation-vectors.json
// exists (produced by scripts/embed_umap.py), use those 3D coords
// directly and skip both HF embedding and t-SNE. This is the
// "literally what the page says" path: BAAI/bge-base-en-v1.5 + UMAP.
//
// Fall back to the old in-process path (HF → t-SNE) when the file is
// missing, so the dev server / npm run embed keeps working without
// the Python step. The wiki items still get the old treatment either
// way: they cluster onto the nearest primary item in 3D rather than
// having their own position.
let coordsNormFromUmap = null;
let embedSource = "hf";

const UMAP_VECTORS_PATH = path.join(DATA, "constellation-vectors.json");
if (fs.existsSync(UMAP_VECTORS_PATH)) {
  const umapData = JSON.parse(fs.readFileSync(UMAP_VECTORS_PATH, "utf8"));
  const byId = new Map(umapData.items.map((it) => [it.id, it]));
  coordsNormFromUmap = primaryItems.map((it) => {
    const v = byId.get(it.id);
    if (!v) {
      throw new Error(`constellation-vectors.json missing id ${it.id}`);
    }
    return [v.x, v.y, v.z];
  });
  embedSource = `umap (${umapData.source})`;
  console.log(
    `using pre-computed UMAP coords from ${path.basename(UMAP_VECTORS_PATH)} (${umapData.items.length} items, source: ${umapData.source})`
  );
}

let primaryVectors;
let wikiVectors = [];
if (coordsNormFromUmap) {
  // Use the UMAP coords as the "vectors" so any later KMeans operates
  // in 3D (cheap). For our domain-based clustering, this is fine —
  // we only run KMeans for sub-clusters of large domains, and 3D
  // distance is a reasonable proxy at that scale.
  primaryVectors = coordsNormFromUmap;
  wikiVectors = wikiItems.map(() => [0, 0, 0]); // not used
} else {
  try {
    console.log(`embedding ${primaryItems.length} primary via HF (bge-base-en-v1.5)...`);
    primaryVectors = await embedViaHF(primaryTexts);
    if (wikiItems.length > 0) {
      console.log(`embedding ${wikiItems.length} wiki via HF...`);
      wikiVectors = await embedViaHF(wikiTexts);
    }
  } catch (err) {
    console.warn(`HF embed failed (${err.message}); falling back to TF-IDF`);
    const tfidf = buildTfidf(primaryTexts);
    primaryVectors = tfidf.vectors;
    wikiVectors = wikiItems.map((_, i) => tfidf.transform(wikiTexts[i]));
    embedSource = "tfidf";
  }
}

const dim = primaryVectors[0]?.length ?? 0;
if (!dim) throw new Error("no vectors produced");
const X = primaryVectors.map((v) => {
  if (v.length === dim) return v;
  if (v.length < dim) return v.concat(new Array(dim - v.length).fill(0));
  return v.slice(0, dim);
});

// ---------- t-SNE to 3D ----------
// t-SNE (van der Maaten & Hinton, 2008). Preserves local neighborhoods
// in high-D so projects cluster near projects, items in different
// domains end up far apart, and intermediate items live in between.
// Standard implementation: per-point Gaussian sigma chosen so the
// perplexity of the conditional distribution matches a target (30),
// symmetric joint P, Student-t in low-D, KL gradient descent with
// early exaggeration + momentum schedule.

function tsne(X, k = 3, opts = {}) {
  const n = X.length;
  const dim = X[0].length;
  const iterations = opts.iterations ?? 500;
  const perplexity = opts.perplexity ?? 30;
  const learningRate = opts.learningRate ?? 80;
  const exagIter = 100;
  const targetH = Math.log(perplexity);

  // Pairwise squared distances. O(n^2 * dim).
  const D = Array.from({ length: n }, () => new Array(n));
  for (let i = 0; i < n; i++) {
    const xi = X[i];
    for (let j = i + 1; j < n; j++) {
      const xj = X[j];
      let s = 0;
      for (let d = 0; d < dim; d++) {
        const diff = xi[d] - xj[d];
        s += diff * diff;
      }
      // Small floor so sigma binary search can't collapse when points coincide
      D[i][j] = s + 1e-12;
      D[j][i] = s + 1e-12;
    }
    D[i][i] = 0;
  }

  // Per-point sigma via binary search on perplexity. For 202 items this
  // is ~200 searches * 10-20 iterations * 202 = <1M ops, fast.
  const Pi = Array.from({ length: n }, () => new Array(n));
  for (let i = 0; i < n; i++) {
    let lo = 1e-20, hi = 1e10, sigma = 1.0;
    for (let it = 0; it < 50; it++) {
      const sigma2 = 2 * sigma * sigma;
      let sumP = 0;
      const probs = new Array(n);
      for (let j = 0; j < n; j++) {
        if (i === j) { probs[j] = 0; continue; }
        const p = Math.exp(-D[i][j] / sigma2);
        probs[j] = p;
        sumP += p;
      }
      if (sumP === 0) { sigma *= 2; lo *= 2; continue; }
      let h = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const p = probs[j] / sumP;
        if (p > 0) h -= p * Math.log(p);
      }
      const diff = h - targetH;
      if (Math.abs(diff) < 1e-5) break;
      if (diff > 0) lo = sigma; else hi = sigma;
      sigma = (lo + hi) / 2;
    }
    const sigma2 = 2 * sigma * sigma;
    let sumP = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) { Pi[i][j] = 0; continue; }
      Pi[i][j] = Math.exp(-D[i][j] / sigma2);
      sumP += Pi[i][j];
    }
    if (sumP > 0) for (let j = 0; j < n; j++) Pi[i][j] /= sumP;
  }

  // Symmetrize and normalise by 2n (van der Maaten convention)
  const P = Array.from({ length: n }, () => new Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pij = (Pi[i][j] + Pi[j][i]) / (2 * n);
      P[i][j] = pij;
      P[j][i] = pij;
    }
    P[i][i] = 0;
  }

  // Initialize Y at small random scale; 3D specifically
  const Y = Array.from({ length: n }, () =>
    Array.from({ length: k }, () => (Math.random() - 0.5) * 1e-4)
  );
  const dY = Array.from({ length: n }, () => new Array(k).fill(0));

  for (let iter = 0; iter < iterations; iter++) {
    const exaggeration = iter < exagIter ? 4.0 : 1.0;
    const momentum = iter < exagIter ? 0.5 : 0.8;

    // Student-t with df=1 in low-D: Q_ij = (1 + |y_i - y_j|^2)^-1
    const Q = Array.from({ length: n }, () => new Array(n));
    let sumQ = 0;
    for (let i = 0; i < n; i++) {
      const yi = Y[i];
      for (let j = i + 1; j < n; j++) {
        const yj = Y[j];
        let s = 0;
        for (let d = 0; d < k; d++) {
          const diff = yi[d] - yj[d];
          s += diff * diff;
        }
        const q = 1 / (1 + s);
        Q[i][j] = q;
        Q[j][i] = q;
        sumQ += 2 * q;
      }
    }
    const qSum = sumQ || 1e-10;

    // KL gradient. The 1/(1+|y_i-y_j|^2) factor (which is the
    // un-normalized Q_ij) is the t-SNE decay term — without it the
    // gradient blows up as Y spreads out.
    for (let i = 0; i < n; i++) {
      const yi = Y[i];
      for (let d = 0; d < k; d++) {
        let grad = 0;
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const pij = exaggeration * P[i][j];
          const qij = Q[i][j] / qSum;
          // Q[i][j] is the un-normalized 1/(1+|y_i-y_j|^2)
          grad += (pij - qij) * (yi[d] - Y[j][d]) * Q[i][j];
        }
        grad *= 4;
        dY[i][d] = momentum * dY[i][d] - learningRate * grad;
        yi[d] += dY[i][d];
      }
    }

    // Center Y each iter — keeps the low-D distribution from drifting.
    const meanY = new Array(k).fill(0);
    for (let i = 0; i < n; i++) for (let d = 0; d < k; d++) meanY[d] += Y[i][d] / n;
    for (let i = 0; i < n; i++) for (let d = 0; d < k; d++) Y[i][d] -= meanY[d];

    if ((iter + 1) % 100 === 0) {
      process.stdout.write(`\r  t-SNE iter ${iter + 1}/${iterations}`);
    }
  }
  process.stdout.write("\n");
  return Y;
}

const coords3d = coordsNormFromUmap
  ? // UMAP path: coords are already in the right space. Pad with
    // zeros so the rest of the pipeline (which expects 3D per item)
    // works without branching. The downstream `normaliseAxes` call
    // will re-clip outliers either way.
    primaryItems.map((_, i) => primaryVectors[i])
  : tsne(X, TARGET_DIM, { iterations: 500, perplexity: 25 });

// Normalise to [-1, 1] per axis using 1st-99th percentile so a few
// outliers don't squash the bulk into a dot.
function normaliseAxes(coords) {
  const axes = [0, 1, 2].map((a) => {
    const vals = coords.map((c) => c[a]).sort((x, y) => x - y);
    const lo = vals[Math.floor(vals.length * 0.01)];
    const hi = vals[Math.floor(vals.length * 0.99)];
    return { lo, hi, range: hi - lo || 1 };
  });
  return coords.map((c) =>
    axes.map((a, i) => {
      const x = (c[i] - a.lo) / a.range;
      return Math.max(-1.2, Math.min(1.2, x * 2 - 1));
    })
  );
}
const coordsNorm = normaliseAxes(coords3d);

// ---------- KMeans (k-means++) ----------

function kmeans(X, k, iters = 50) {
  const n = X.length;
  const d = X[0].length;
  const centres = [X[Math.floor(Math.random() * n)].slice()];
  while (centres.length < k) {
    const dists = X.map((p) => {
      let m = Infinity;
      for (const c of centres) {
        const dd = p.reduce((s, x, i) => s + (x - c[i]) ** 2, 0);
        if (dd < m) m = dd;
      }
      return m;
    });
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      r -= dists[i];
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    centres.push(X[idx].slice());
  }
  const assign = new Array(n).fill(0);
  for (let it = 0; it < iters; it++) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d2 = X[i].reduce((s, x, j) => s + (x - centres[c][j]) ** 2, 0);
        if (d2 < bestD) {
          bestD = d2;
          best = c;
        }
      }
      if (assign[i] !== best) {
        changed++;
        assign[i] = best;
      }
    }
    const sums = Array.from({ length: k }, () => new Array(d).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assign[i];
      counts[c]++;
      for (let j = 0; j < d; j++) sums[c][j] += X[i][j];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) {
        centres[c] = X[Math.floor(Math.random() * n)].slice();
      } else {
        centres[c] = sums[c].map((s) => s / counts[c]);
      }
    }
    if (changed === 0) break;
  }
  return assign;
}

const DOMAIN_LABELS = {
  quantum: "Quantum",
  ai: "AI/ML",
  hpc: "HPC",
  f1: "F1 / Motorsport",
  ios: "iOS Apps",
  web: "Web",
  puzzle: "Puzzles",
  defi: "DeFi / Blockchain",
  game: "Games",
  coursework: "Coursework",
  other: "Other",
  repo: "Repos",
  meta: "Meta",
  fork: "Forks",
  experience: "Experience",
  achievement: "Achievements",
  timeline: "Timeline",
  // achievements categories
  hackathons: "Hackathons",
  competition: "Competitions",
  sport: "Sport",
  "sport-current": "Sport",
  "sport-done": "Sport",
  interests: "Interests",
  // experience subkinds
  teaching: "Teaching",
  research: "Research",
  industry: "Industry",
  business: "Business",
  society: "Societies",
  // wiki buckets (used by effectiveDomain, but never as a cluster name)
  "wiki-projects": "Wiki · Projects",
  "wiki-articles": "Wiki · Articles",
  "wiki-concepts": "Wiki · Concepts",
  "wiki-bullets": "Wiki · Notes",
};

// Roll up wiki kinds into a base bucket so domain-hint can recognise
// "this cluster is mostly wiki project pages" the same as one project
// entry with domain=ai. Returns the rolled-up label key.
function effectiveDomain(meta) {
  if (!meta) return null;
  if (meta.domain) return meta.domain;
  if (meta.category && DOMAIN_LABELS[meta.category]) {
    // Collapse sport-current / sport-done into a single "Sport" domain
    // so both halves of training history live in the same cluster.
    if (meta.category === "sport-current" || meta.category === "sport-done") {
      return "sport";
    }
    return meta.category;
  }
  // All experience kinds (teaching/research/industry/business/society) go
  // into a single "experience" cluster — each kind has 1 item, splitting
  // them produced five 1-item clusters of no value.
  if (meta.kind === "experience") return "experience";
  if (meta.subkind && DOMAIN_LABELS[meta.subkind]) return meta.subkind;
  const k = meta.kind;
  if (!k) return null;
  if (k === "achievement" || k === "timeline") return k;
  if (k.startsWith("tb-projects")) return "wiki-projects";
  if (k.startsWith("tb-articles")) return "wiki-articles";
  if (k.startsWith("tb-concepts")) return "wiki-concepts";
  if (k === "tb-bullet" || k === "tb-row" || k === "tb-resource") return "wiki-bullets";
  if (k === "repo" || k === "fork" || k === "meta") return k;
  return null;
}

const PALETTE = [
  "#00d4ff", "#a78bfa", "#34d399", "#fbbf24", "#f472b6",
  "#60a5fa", "#fb7185", "#4ade80", "#c084fc", "#22d3ee",
  "#facc15", "#f97316", "#10b981", "#e879f9",
];

// ---------- name each cluster ----------
// For sub-clusters of items that are *already known to be one domain*,
// pick 1-2 distinctive sub-topic tokens. Different from the old nameCluster
// (which had to figure out the domain AND the topic) — this just needs
// a short sub-topic.

const CLUSTER_STOPWORDS = new Set([
  "the","and","for","with","that","this","from","into","using","used","use",
  "via","based","build","built","make","made","new","one","two","also","see",
  "like","item","items","work","project","projects","section","sections",
  "wiki","wiki-section","wiki-bullet","wiki-row","wiki-sub","wiki-project",
  "wiki-article","wiki-concept","wiki-note","wiki-ref","wiki-section","wiki-sub",
  "bullet","bullets","row","rows","ref","refs","sub","subs",
  "tom","bale","thomas","thomas-bale","tombale","tom-bale",
  "repo","repos","project","achievement","achievements","milestone","milestones",
  "note","notes","list","entry","entries","readme","readmed",
  "app","apps","api","apis","web","ios","cli","sdk","lib",
  "data","dataset","datasets","info","information","version","versions",
  "year","years","time","times","day","days","week","weeks","month","months",
  "page","pages","file","files","docs","doc","guide","guides",
  "first","next","last","back","top","bottom","left","right","center",
  "small","large","big","tiny","huge","high","low","full","part","parts",
  "good","bad","new","old","many","few","most","more","less","least",
  "support","supports","supported","feature","features","function","functions",
  "test","tests","example","examples","sample","samples","demo","demos",
  "based","related","see","also","about","overview","intro","introduction",
  "code","script","scripts","tool","tools","system","systems","service","services",
  "model","models","method","methods","approach","approaches","technique",
  "techniques","implementation","implementations","library","libraries",
  "framework","frameworks","package","packages","module","modules",
  "reading","list","category","categories","tag","tags","label","labels",
  "value","values","type","types","name","names","title","titles",
  "output","outputs","input","inputs","result","results",
  "main","core","primary","secondary","basic","advanced","simple","complex",
  "https","http","www","com","net","org","io","github","tumcuctom",
  "yes","no","ok","okay","true","false","none","null","undefined",
  "section","subsection","bullets",
  "are","have","had","has","their","thi","tha","wer","own",
  "key","major","your","our","there","where","when",
  "visible","without","with","against","between","within",
  "could","would","should","might","must","will","shall","cannot",
  "any","all","each","every","some","other","another",
  "thing","way","place","idea",
  "do","did","done","doing","make","made","making",
  "here","how","why","what","who","whom","whose",
  "overview","status","summary","background","context","goal",
  "goals","objective","objectives","motivation","scope",
  "misc","other","note","notes","todo","to-do",
  "listed","listing","profile","user","users","account",
  "history","historical","development","versioned","launched",
  "name","named","title","titled","call","calls","called",
  "still","yet","already","often","always","never","later",
  "look","looks","looking","see","sees","seeing","found",
  "across","along","around","behind","beyond","inside","outside",
  "main","mostly","especially","particularly","specifically",
  "biggest","smallest","largest","earliest","latest",
  "ensure","ensuring","ensure-that","helps","helping",
  "icarus","sisyphe","sisyphus","prometheus","tartarus",
  "persephone","orpheus","eurydice","achilles","troy",
  "odysseus","theseus","minotaur","daedalus",
  "vlm-memory","vlm-3r","vlm3r","vlm",
  "yuki","yuki-gpt","yukigpt","yukigt",
  "georgia","georgia-ai",
  "agentic-playground","agentic","playground",
  "can-u-dig-it","canudig",
  "pin","tack","tacking","tackle",
  "case","cases","physical","actually","really",
  "interest","interests","public","private",
  "ever","never","still","yet","already",
  "you","your","yours","mine","ours",
  "resource","resources","learning","learn","teach","teaching",
  "study","studying","researching",
  "design","designing","designed",
  "stack","stacks","setup",
  "fashion","style","trend",
  "set","setting","settings",
  "cut3r","cut-3r",
  "thinking","thought","thoughts",
  "foundation","foundations",
  "intelligence","intelligent",
  "mind","minds","mental",
  "language","languages","english",
  "sport","sports","athletic","athlete","athletes",
  "solve","solving","solver","solved",
  "not","cannot","cant","wont","dont","doesnt","isnt","arent",
  "pattern","patterns",
  "knowing","know","knows","known",
  "relationship","relationships",
  "dissertation","thesis",
  "fyp","final-year-project","dissertation-project",
  "fully","completely","totally",
  "training","trained","train",
  "personal","personally",
  "startup","startups","startup-",
  "arbitrage",
  // generic self-references that add no signal
  "available","provide","provides","provided","including","include","includes",
  "allows","allow","allowed","support","supports","supported",
  "require","requires","required","need","needs","needed",
  "also","too","well","just",
  "things","stuff","bit","bits","piece","pieces",
  "kind","sort","type","types","way","ways",
  "etc","eg","ie","al","per",
  // common noise from repo descriptions
  "cloned","forked","original","source","sources",
  "inference","infer","train","training","trained",
  "jupyter","notebook","notebooks",
  "agent","agents","agentic",
  "react","nextjs","next-js","gatsby",
  "minimax","claude","hermes","MiniMax","mcp","MCPMiniMax-MCP",
  "machine","machines","machining",
  "portfolio","portfolios",
]);

function clusterTokenize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/\.md$/i, ""))
    .map((t) => t.replace(/[.,;:!?]+$/, ""))
    .map((t) => /[uioa]s$/i.test(t) ? t : t.replace(/([^s])s$/i, "$1"))
    .filter((t) => t.length > 2 && !CLUSTER_STOPWORDS.has(t));
}

function subClusterSubtopic(itemList) {
  const tf = new Map();
  const docFreq = new Map();
  for (const it of itemList) {
    const toks = clusterTokenize(it.name + " " + (it.text || ""));
    const seen = new Set();
    for (const t of toks) {
      tf.set(t, (tf.get(t) || 0) + 1);
      if (!seen.has(t)) { docFreq.set(t, (docFreq.get(t) || 0) + 1); seen.add(t); }
    }
  }
  const scored = [...tf.entries()]
    .map(([t, c]) => ({ t, df: docFreq.get(t) || 0, score: (docFreq.get(t) || 0) * c }))
    .filter((x) => x.df >= 2)
    .sort((a, b) => b.score - a.score);
  const picked = [];
  for (const { t } of scored) {
    if (picked.includes(t)) continue;
    picked.push(t);
    if (picked.length >= 2) break;
  }
  if (picked.length === 0) return null;
  return picked
    .map((t) => t.replace(/(^|[-/.])(\w)/g, (_, p, c) => p + c.toUpperCase()))
    .join(" · ");
}

// ---------- domain-based clustering ----------
// K-Means on TF-IDF/PCA gives us "things that happened to be near each
// other in vector space" — useful for 3D layout, useless for cluster
// names ("2026 · Swimming · Llm" was the result of weak K-Means). The
// clusters the user actually wants are the *domains*: Quantum, AI/ML,
// iOS, Web, Games, etc. So we group by effectiveDomain first, then
// sub-cluster the big ones. This is deterministic, always meaningful,
// and never produces "Wiki · Notes" as a category.

function pickSubK(n) {
  for (const { min, k } of SUB_CLUSTER_THRESHOLDS) {
    if (n >= min) return k;
  }
  return 1;
}

// Group primary items by effectiveDomain.
const domainGroups = new Map(); // domain key -> [primary index]
for (let i = 0; i < primaryItems.length; i++) {
  const d = effectiveDomain(primaryItems[i].meta) || "other";
  if (!domainGroups.has(d)) domainGroups.set(d, []);
  domainGroups.get(d).push(i);
}

// Sort by size desc — big domains get early cluster IDs and consistent colours.
const sortedDomains = [...domainGroups.entries()].sort(
  (a, b) => b[1].length - a[1].length
);

const primaryCluster = new Array(primaryItems.length).fill(-1);
const clusterItems = new Map(); // clusterId -> [primary items]
const clusterMeta = [];
let nextClusterId = 0;

for (const [domain, indices] of sortedDomains) {
  const n = indices.length;
  const subK = pickSubK(n);

  // Single cluster for small domains.
  if (subK === 1) {
    const cid = nextClusterId++;
    primaryCluster.fill ? null : null; // (no-op, just for readability)
    for (const idx of indices) primaryCluster[idx] = cid;
    clusterItems.set(cid, indices.map((i) => primaryItems[i]));
    clusterMeta.push({
      id: cid,
      count: n,
      name: DOMAIN_LABELS[domain] ?? domain,
      color: PALETTE[cid % PALETTE.length],
    });
    continue;
  }

  // Sub-cluster large domains with K-Means on the full vector space
  // (not the 3D PCA, which loses discriminative info at this size).
  const subVectors = indices.map((i) => X[i]);
  const subAssigns = kmeans(subVectors, subK);
  for (let s = 0; s < subK; s++) {
    const subIndices = indices.filter((_, j) => subAssigns[j] === s);
    if (subIndices.length === 0) continue;
    const cid = nextClusterId++;
    for (const idx of subIndices) primaryCluster[idx] = cid;
    clusterItems.set(cid, subIndices.map((i) => primaryItems[i]));

    // Name: just the domain label. The sub-group is already a sub-slice
    // of a single domain, so any "top tokens" we pick just reflect
    // whatever items happen to dominate — they read as confusing
    // suffixes ("AI/ML · Python · Pytorch", "Web · Typescript ·
    // Mediapipe") rather than meaningful sub-categories. Drop them.
    const label = DOMAIN_LABELS[domain] ?? domain;
    clusterMeta.push({
      id: cid,
      count: subIndices.length,
      name: label,
      color: PALETTE[cid % PALETTE.length],
    });
  }
}

const fullClusters = primaryCluster;

clusterMeta.sort((a, b) => b.count - a.count);

// ---------- cluster-aware 3D layout ----------
// t-SNE positions items based on raw text similarity, but we cluster by
// domain — so items in the same domain-cluster often end up scattered
// across the 3D space, and items from different clusters end up next to
// each other. The user sees a cloud of dots, not "clusters". To fix:
// 1. Place each cluster at a deterministic point on a sphere
//    (Fibonacci-spiral for even coverage).
// 2. Within each cluster, scatter items in a small neighborhood around
//    the cluster center. The radius scales with the cluster's count so
//    big clusters are visibly bigger blobs. t-SNE's local ordering is
//    preserved as a small directional offset (items that were near each
//    other in t-SNE stay near each other within the cluster).
// 3. Tech sub-points are nested under their parent (already done below).

const SCATTER_BIAS = 0.35;  // how strongly t-SNE's local order pulls items within a cluster

// Re-scale UMAP coords per-cluster so each cluster's items span a
// compact neighbourhood. We re-fit each axis to ~[-1, 1] within the
// cluster, then scale by a per-cluster radius that grows with sqrt(count).
function rescaleInCluster(indices) {
  if (indices.length === 0) return [];
  const out = indices.map(() => [0, 0, 0]);
  for (let axis = 0; axis < 3; axis++) {
    const vals = indices.map((i) => coordsNorm[i][axis]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const range = hi - lo || 1;
    for (let k = 0; k < indices.length; k++) {
      out[k][axis] = (coordsNorm[indices[k]][axis] - lo) / range * 2 - 1;
    }
  }
  return out;
}

const itemPositions = new Array(primaryItems.length);
const byClusterIdx = new Map(); // cid -> [primary item indices]
for (let i = 0; i < primaryItems.length; i++) {
  const cid = fullClusters[i];
  if (!byClusterIdx.has(cid)) byClusterIdx.set(cid, []);
  byClusterIdx.get(cid).push(i);
}

// Cluster centers: use the centroid of each cluster's items in UMAP 3D.
// This preserves semantic layout — items near each other in UMAP space
// are near each other in the final 3D view, instead of evenly spaced
// on a Fibonacci sphere.
const clusterCenters = new Map();
for (const [cid, indices] of byClusterIdx) {
  let cx = 0, cy = 0, cz = 0;
  for (const idx of indices) {
    cx += coordsNorm[idx][0];
    cy += coordsNorm[idx][1];
    cz += coordsNorm[idx][2];
  }
  clusterCenters.set(cid, [cx / indices.length, cy / indices.length, cz / indices.length]);
}

for (const [cid, indices] of byClusterIdx) {
  const center = clusterCenters.get(cid);
  if (!center) continue;
  const count = indices.length;
  // Big clusters get more room. Floor at 0.18 so 2-3 item clusters are
  // still visible; cap at 0.45 so the largest blob doesn't swallow
  // the sphere.
  const radius = Math.min(0.45, 0.18 + Math.sqrt(count) * 0.06);
  const scaled = rescaleInCluster(indices);
  for (let k = 0; k < indices.length; k++) {
    const [sx, sy, sz] = scaled[k];
    const offset = [
      sx * radius * SCATTER_BIAS,
      sy * radius * SCATTER_BIAS,
      sz * radius * SCATTER_BIAS,
    ];
    // Center is already in coordsNorm space; offset is [-1, 1] scaled by radius.
    // Final position stays in roughly [-1, 1] per axis so SPREAD=2.5 works.
    itemPositions[indices[k]] = [
      center[0] + offset[0],
      center[1] + offset[1],
      center[2] + offset[2],
    ];
  }
}

// ---------- tech sub-points ----------
// Each primary item emits 2-4 "tech" sub-points, one per distinct token
// in its stack/tags. The sub-point sits at a small random offset from
// the parent in 3D so each project gets a small "tech cloud". They
// inherit the parent's cluster and colour — meaningful (this project
// uses Python), not noise.

const TECH_STOPWORDS = new Set([
  "the","and","for","with","that","this","from","into","using","used","use",
  "via","based","build","built","make","made","new","one","two","also","see",
  "like","item","items","work","project","projects",
  "tom","bale","thomas","thomas-bale","tombale","tom-bale",
  "repo","repos","achievement","achievements","milestone","milestones",
  "app","apps","api","apis","web","ios","cli","sdk","lib",
  "data","dataset","datasets","info","information","version","versions",
  "year","years","time","times","day","days","week","weeks","month","months",
  "feature","features","function","functions",
  "test","tests","example","examples","sample","samples","demo","demos",
  "related","about","overview","intro","introduction",
  "code","script","scripts","tool","tools","system","systems","service","services",
  "method","methods","approach","approaches","technique","techniques",
  "implementation","implementations","library","libraries",
  "framework","frameworks","package","packages","module","modules",
  "reading","list","category","categories","tag","tags","label","labels",
  "value","values","type","types","name","names","title","titles",
  "output","outputs","input","inputs","result","results",
  "main","core","primary","secondary","basic","advanced","simple","complex",
  "https","http","www","com","net","org","io","github","tumcuctom",
  "available","provide","provides","provided","including","include","includes",
  "allows","allow","allowed","support","supports","supported",
  "require","requires","required","need","needs","needed",
  "thing","things","stuff","bit","bits","piece","pieces",
  "kind","sort","way","ways",
  "etc","eg","ie","al","per",
  "other","misc","note","notes","todo",
  "stack","setup","config","configuration","env",
  "inference","infer","train","training","trained",
  "agent","agents","agentic",
  "react","nextjs","next-js","gatsby",
  "claude","hermes","mcp",
  "machine","machines","machining",
  "portfolio","portfolios",
]);

function techTokenize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .split(/[\s,/]+/)
    .map((t) => t.replace(/[+#]+/g, "").replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length >= 2 && !TECH_STOPWORDS.has(t));
}

const techItems = [];
for (let i = 0; i < primaryItems.length; i++) {
  const item = primaryItems[i];
  const m = item.meta || {};
  const stack = Array.isArray(m.stack) ? m.stack : [];
  const tags = Array.isArray(m.tags) ? m.tags : [];
  const tokens = [...new Set([...stack, ...tags].flatMap(techTokenize))].slice(0, 3);
  const parent = itemPositions[i];
  for (const tok of tokens) {
    // Small random offset in 3D so tech points form a visible cloud
    // around the parent rather than overlapping it.
    const r = 0.05 + Math.random() * 0.06;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const ox = r * Math.sin(phi) * Math.cos(theta);
    const oy = r * Math.sin(phi) * Math.sin(theta);
    const oz = r * Math.cos(phi);
    techItems.push({
      id: `tech-${item.id}--${tok.replace(/[^a-z0-9]+/g, "-")}`,
      name: tok,
      kind: "tech",
      x: parent[0] + ox,
      y: parent[1] + oy,
      z: parent[2] + oz,
      cluster: fullClusters[i],
    });
  }
}

const allItems = [
  ...primaryItems.map((item, i) => ({
    id: item.id,
    name: item.name,
    kind: item.meta.kind,
    x: itemPositions[i][0],
    y: itemPositions[i][1],
    z: itemPositions[i][2],
    cluster: fullClusters[i],
  })),
  ...techItems,
];

const out = {
  generatedAt: new Date().toISOString(),
  embedSource,
  dim,
  numClusters: clusterMeta.length,
  clusters: clusterMeta,
  items: allItems,
};

fs.writeFileSync(path.join(DATA, "constellation.json"), JSON.stringify(out, null, 2));
console.log(
  `wrote ${primaryItems.length} primary + ${techItems.length} tech sub-points in ${clusterMeta.length} named clusters (source: ${embedSource})`
);
