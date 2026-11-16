// GitHub contributions, read from the same calendar the profile page shows,
// so the numbers on the site are the numbers on the heatmap. No token: the
// calendar is a public page. (The API is not used because, with the tokens
// available to a workflow, it leaves out contributions the profile includes.)
import { fileURLToPath } from "node:url";

const USER = "TumCucTom";
const URL_ = `https://github.com/users/${USER}/contributions`;

/** Pull every day and the yearly total out of the calendar's HTML. Throws if it doesn't look like a calendar. */
export function parseContributions(html, now = Date.now()) {
  const ids = new Map();
  for (const m of html.matchAll(/<td\b[^>]*\bdata-date="(\d{4}-\d{2}-\d{2})"[^>]*\bid="(contribution-day-component-[\d-]+)"/g)) ids.set(m[2], m[1]);
  // attribute order is not guaranteed
  for (const m of html.matchAll(/<td\b[^>]*\bid="(contribution-day-component-[\d-]+)"[^>]*\bdata-date="(\d{4}-\d{2}-\d{2})"/g)) ids.set(m[1], m[2]);
  const counts = new Map();
  for (const m of html.matchAll(/<tool-tip\b[^>]*\bfor="(contribution-day-component-[\d-]+)"[^>]*>\s*([^<]*?)\s*<\/tool-tip>/g)) {
    const date = ids.get(m[1]);
    if (!date) continue;
    const n = /^No contributions/i.test(m[2]) ? 0 : Number((m[2].match(/^([\d,]+) contributions?\b/) ?? [])[1]?.replaceAll(",", ""));
    if (Number.isFinite(n)) counts.set(date, n);
  }
  const today = new Date(now).toISOString().slice(0, 10);
  // the calendar pads its last week with days that haven't happened yet
  const days = [...counts].map(([date, count]) => ({ date, count })).filter((d) => d.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const total = Number((html.match(/([\d,]+)\s+contributions?\s+in the last year/) ?? [])[1]?.replaceAll(",", ""));
  if (days.length < 300 || !Number.isFinite(total)) throw new Error(`contribution calendar did not parse (${days.length} days)`);
  const sum = (n) => days.slice(-n).reduce((s, d) => s + d.count, 0);
  return {
    user: USER,
    fetchedAt: new Date(now).toISOString(),
    source: URL_,
    // dates are UTC days, as the public calendar draws them
    today: days.at(-1),
    last7d: sum(7),
    last30d: sum(30),
    lastYear: total,
    best: days.reduce((a, b) => (b.count > a.count ? b : a)),
    days: days.slice(-14),
  };
}

export async function fetchContributions({ fetchImpl = fetch, now = Date.now() } = {}) {
  const res = await fetchImpl(URL_, { headers: { "User-Agent": "Mozilla/5.0 (compatible; site-refresh)", Accept: "text/html" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`contribution calendar request failed (${res.status})`);
  return parseContributions(await res.text(), now);
}

/** A failed refresh keeps the last good numbers and says so. */
export function failedContributions(previous, now = Date.now()) {
  return { ...previous, refreshError: true, lastAttemptAt: new Date(now).toISOString() };
}

// `node scripts/contributions.mjs` prints the current numbers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(JSON.stringify(await fetchContributions(), null, 2));
