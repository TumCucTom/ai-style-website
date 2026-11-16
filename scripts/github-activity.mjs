// Commit activity is not the GitHub contribution graph. Private activity is
// counted, but only public commit details may be written to the site's JSON.
const DAY = 86_400_000;
const USER = "TumCucTom";
const REQUIRED_REPOS = ["mycontinuum-com/serenity", "mycontinuum-com/anima-service", "mycontinuum-com/anima-clinics-app"];
const PAGE = "pageInfo { hasNextPage endCursor }";

function automated(message) {
  return /^refresh: live data\b/i.test(message);
}

export function failedActivity(previous, now = Date.now()) {
  return { ...previous, refreshError: true, lastAttemptAt: new Date(now).toISOString() };
}

export function summariseActivity(records, now = Date.now()) {
  const unique = new Map();
  for (const row of records) {
    if (!row.sha || automated(row.message)) continue;
    const time = Date.parse(row.time);
    if (!Number.isFinite(time) || time > now || time < now - 7 * DAY) continue;
    const previous = unique.get(row.sha);
    // A commit authored and subsequently merged is one commit, not two.
    // Use its earliest qualifying activity within the seven-day window.
    if (!previous || time < Date.parse(previous.time)) unique.set(row.sha, row);
  }
  const rows = [...unique.values()].sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  function summary(window) {
    const selected = rows.filter((r) => Date.parse(r.time) >= now - window);
    const repos = new Map();
    for (const r of selected.filter((r) => r.public)) repos.set(r.repo, (repos.get(r.repo) || 0) + 1);
    return {
      commits: selected.length,
      repoCount: new Set(selected.map((r) => r.repo)).size,
      topRepos: [...repos].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([repo, count]) => `${repo.split("/")[1]} ×${count}`),
    };
  }
  const publicRows = rows.filter((r) => r.public).map(({ public: _, ...row }) => row);
  return {
    user: USER,
    fetchedAt: new Date(now).toISOString(),
    authed: true,
    metric: "authored-or-delivered-commits",
    capped: false,
    latest: publicRows[0] ?? null,
    last24h: publicRows.filter((r) => Date.parse(r.time) >= now - DAY),
    last7d: publicRows,
    summary: { last24h: summary(DAY), last7d: summary(7 * DAY) },
  };
}

export async function fetchCommitActivity({ token = process.env.GH_USER_TOKEN, fetchImpl = fetch, now = Date.now(), requiredRepos = REQUIRED_REPOS } = {}) {
  // The workflow's GITHUB_TOKEN is scoped to this website and cannot measure
  // Anima activity. Never silently fall back to it for personal statistics.
  if (!token) throw new Error("GH_USER_TOKEN is required for commit activity");
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "tom-bale-v3-site" };
  async function request(url, init = {}) {
    const res = await fetchImpl(url, { ...init, headers: { ...headers, ...init.headers }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`GitHub activity request failed (${res.status})`);
    return res.json();
  }
  async function gql(query, variables = {}) {
    const result = await request("https://api.github.com/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
    if (result.errors?.length || !result.data) throw new Error("GitHub activity GraphQL response is incomplete");
    return result.data;
  }
  const viewer = await request("https://api.github.com/user");
  if (viewer.login?.toLowerCase() !== USER.toLowerCase()) throw new Error("GH_USER_TOKEN must belong to TumCucTom");
  for (const repo of requiredRepos) await request(`https://api.github.com/repos/${repo}`);

  const since = new Date(now - 7 * DAY).toISOString();
  const records = [];
  // Split search windows if necessary instead of truncating at 1,000 results.
  async function authored(from, to) {
    const query = `author:${USER} author-date:${new Date(from).toISOString()}..${new Date(to).toISOString()}`;
    const url = `https://api.github.com/search/commits?q=${encodeURIComponent(query)}&per_page=100`;
    const first = await request(url);
    if (first.incomplete_results) throw new Error("GitHub commit search is incomplete");
    if (first.total_count > 1000) {
      if (to - from < 2000) throw new Error("Too many commits in one search interval");
      const middle = Math.floor((from + to) / 2);
      await authored(from, middle);
      await authored(middle, to);
      return;
    }
    const items = [...(first.items ?? [])];
    for (let page = 2; items.length < first.total_count; page++) {
      const next = await request(`${url}&page=${page}`);
      if (next.incomplete_results || !next.items?.length) throw new Error("GitHub commit search pagination is incomplete");
      items.push(...next.items);
    }
    for (const c of items) records.push({ sha: c.sha, message: c.commit.message.split("\n")[0], time: c.commit.author.date, repo: c.repository.full_name, short: c.repository.name, branch: "default", url: c.html_url, public: c.repository.private === false && c.repository.visibility !== "internal" });
  }
  await authored(now - 7 * DAY, now);

  const repos = new Map();
  // Include external repositories in which Tom authored a merged PR, even if
  // he is not a collaborator and they are absent from viewer.repositories.
  let cursor = null;
  do {
    const data = await gql(`query($query:String!, $cursor:String) { search(query:$query,type:ISSUE,first:100,after:$cursor) { issueCount nodes { ... on PullRequest { repository { nameWithOwner visibility } } } ${PAGE} } }`, { query: `is:pr is:merged author:${USER} merged:>=${since}`, cursor });
    if (data.search.issueCount > 1000) throw new Error("Merged PR discovery exceeds GitHub's search limit");
    for (const pr of data.search.nodes) if (pr.repository) repos.set(pr.repository.nameWithOwner, pr.repository);
    cursor = data.search.pageInfo.hasNextPage ? data.search.pageInfo.endCursor : null;
  } while (cursor);

  // Enumerate accessible repositories to find PRs merged by Tom whose authors
  // are Serenity or other accounts. There is no REST issue-search merger filter.
  cursor = null;
  do {
    const data = await gql(`query($cursor:String) { viewer { repositories(first:100,after:$cursor,affiliations:[OWNER,COLLABORATOR,ORGANIZATION_MEMBER],orderBy:{field:PUSHED_AT,direction:DESC}) { nodes { nameWithOwner visibility pushedAt } ${PAGE} } } }`, { cursor });
    const connection = data.viewer.repositories;
    for (const repo of connection.nodes) if (repo.pushedAt && repo.pushedAt >= since) repos.set(repo.nameWithOwner, repo);
    cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
    // PUSHED_AT ordering means older repositories cannot contain recent merges.
    if (connection.nodes.some((r) => r.pushedAt && r.pushedAt < since)) break;
  } while (cursor);

  const pending = [...repos.values()];
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
   while (pending.length) {
    const repo = pending.shift();
    const [owner, name] = repo.nameWithOwner.split("/");
    let prCursor = null;
    do {
      const data = await gql(`query($owner:String!,$name:String!,$cursor:String) { repository(owner:$owner,name:$name) { pullRequests(states:MERGED,first:100,after:$cursor,orderBy:{field:UPDATED_AT,direction:DESC}) { nodes { number updatedAt mergedAt author { login } mergedBy { login } } ${PAGE} } } }`, { owner, name, cursor: prCursor });
      if (!data.repository) throw new Error("Activity repository is inaccessible");
      const connection = data.repository.pullRequests;
      for (const pr of connection.nodes) {
        if (pr.mergedAt < since || Date.parse(pr.mergedAt) > now) continue;
        if (pr.author?.login !== USER && pr.mergedBy?.login !== USER) continue;
        let commitCursor = null;
        do {
          const detail = await gql(`query($owner:String!,$name:String!,$number:Int!,$cursor:String) { repository(owner:$owner,name:$name) { pullRequest(number:$number) { commits(first:100,after:$cursor) { nodes { commit { oid messageHeadline url } } ${PAGE} } } } }`, { owner, name, number: pr.number, cursor: commitCursor });
          const commits = detail.repository?.pullRequest?.commits;
          if (!commits) throw new Error("PR commit response is incomplete");
          for (const { commit: c } of commits.nodes) records.push({ sha: c.oid, message: c.messageHeadline, time: pr.mergedAt, repo: repo.nameWithOwner, short: name, branch: "merged", url: c.url, public: repo.visibility === "PUBLIC" });
          commitCursor = commits.pageInfo.hasNextPage ? commits.pageInfo.endCursor : null;
        } while (commitCursor);
      }
      prCursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
      if (connection.nodes.some((pr) => pr.updatedAt < since)) break;
    } while (prCursor);
   }
  }));
  return summariseActivity(records, now);
}
