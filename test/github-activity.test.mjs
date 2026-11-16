import test from "node:test";
import assert from "node:assert/strict";
import { summariseActivity, fetchCommitActivity, failedActivity } from "../scripts/github-activity.mjs";

const now = Date.parse("2026-11-05T12:00:00Z");
const row = (sha, time, extra = {}) => ({ sha, time, repo: "Tom/public", short: "public", branch: "main", message: "fix", url: "https://github.com/Tom/public/commit/" + sha, public: true, ...extra });

test("deduplicates authored and PR commits and excludes automation and out-of-window timestamps", () => {
  const data = summariseActivity([
    row("a", "2026-11-04T14:00:00Z"), row("a", "2026-11-05T10:00:00Z"),
    row("old", "2026-10-01T12:00:00Z"), row("future", "2026-12-01T12:00:00Z"),
    row("refresh", "2026-11-05T10:00:00Z", { message: "refresh: live data [skip ci]" }),
    row("invalid", "invalid"), row("b", "2026-10-30T12:00:00Z"),
  ], now);
  assert.equal(data.summary.last24h.commits, 1);
  assert.equal(data.summary.last7d.commits, 2);
});

test("private details stay out of serialized output while contributing to totals", () => {
  const data = summariseActivity([row("secret-sha", "2026-11-05T10:00:00Z", { public: false, repo: "private/secret", short: "secret", message: "confidential", url: "secret-url" })], now);
  assert.equal(data.summary.last24h.commits, 1);
  assert.equal(data.latest, null);
  assert.deepEqual(data.summary.last7d.topRepos, []);
  for (const secret of ["private/secret", "confidential", "secret-url", "secret-sha"]) assert.ok(!JSON.stringify(data).includes(secret));
});

test("deduplication uses the earliest activity in the seven-day window", () => {
  const data = summariseActivity([row("same", "2026-11-01T10:00:00Z"), row("same", "2026-11-05T10:00:00Z")], now);
  assert.equal(data.summary.last7d.commits, 1);
  assert.equal(data.summary.last24h.commits, 0);
});

test("failure preserves last successful timestamp and counts", () => {
  const old = summariseActivity([row("a", "2026-11-05T10:00:00Z")], now);
  const stale = failedActivity(old, now + 1000);
  assert.deepEqual(stale.summary, old.summary);
  assert.equal(stale.fetchedAt, old.fetchedAt);
  assert.equal(stale.refreshError, true);
  assert.notEqual(stale.lastAttemptAt, old.fetchedAt);
});

test("requires the personal token rather than silently using the workflow token", async () => {
  await assert.rejects(fetchCommitActivity({ token: "", now }), /GH_USER_TOKEN/);
});

const page = (next = false, cursor = null) => ({ hasNextPage: next, endCursor: cursor });
function mockGitHub({ failAccess = false, incomplete = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: init.body && JSON.parse(init.body) });
    const ok = (data) => ({ ok: true, json: async () => data });
    if (url.endsWith("/user")) return ok({ login: "TumCucTom" });
    if (url.includes("/repos/")) return failAccess ? { ok: false, status: 404 } : ok({});
    if (url.includes("/search/commits")) return ok({ total_count: 0, items: [], incomplete_results: incomplete });
    const { query, variables: v } = JSON.parse(init.body);
    if (query.includes("search(")) return ok({ data: { search: { issueCount: 0, nodes: [], pageInfo: page() } } });
    if (query.includes("viewer { repositories")) return ok({ data: { viewer: { repositories: { nodes: [{ nameWithOwner: "private/secret", visibility: "PRIVATE", pushedAt: "2026-11-05T10:00:00Z" }], pageInfo: page() } } } });
    if (query.includes("pullRequests(")) return ok({ data: { repository: { pullRequests: { nodes: [
      { number: 1, updatedAt: "2026-11-05T10:00:00Z", mergedAt: "2026-11-05T10:00:00Z", author: { login: "serenity-agents[bot]" }, mergedBy: { login: "TumCucTom" } },
      { number: 2, updatedAt: "2026-11-05T10:00:00Z", mergedAt: "2026-11-05T10:00:00Z", author: { login: "TumCucTom" }, mergedBy: { login: "colleague" } },
      { number: 3, updatedAt: "2026-11-05T10:00:00Z", mergedAt: "2026-11-05T10:00:00Z", author: { login: "other" }, mergedBy: { login: "other" } },
    ], pageInfo: page() } } } });
    const nodes = [{ commit: { oid: v.cursor ? "second" : "first", messageHeadline: "agent fix", url: "private-url" } }];
    return ok({ data: { repository: { pullRequest: { commits: { nodes, pageInfo: v.cursor ? page() : page(true, "next") } } } } });
  };
  return { fetchImpl, calls };
}

test("counts bot PRs merged by Tom and Tom's PRs merged by others; paginates and deduplicates", async () => {
  const mock = mockGitHub();
  const data = await fetchCommitActivity({ token: "test", now, requiredRepos: ["required/repo"], fetchImpl: mock.fetchImpl });
  assert.equal(data.summary.last24h.commits, 2);
  assert.deepEqual(data.last7d, []);
  const details = mock.calls.filter((c) => c.body?.query.includes("pullRequest(number:"));
  assert.equal(details.length, 4);
  assert.ok(details.every((c) => c.body.variables.number !== 3));
});

test("missing private repository access fails collection", async () => {
  const mock = mockGitHub({ failAccess: true });
  await assert.rejects(fetchCommitActivity({ token: "test", now, requiredRepos: ["required/repo"], fetchImpl: mock.fetchImpl }), /404/);
});

test("incomplete search fails collection instead of reporting zero", async () => {
  const mock = mockGitHub({ incomplete: true });
  await assert.rejects(fetchCommitActivity({ token: "test", now, requiredRepos: [], fetchImpl: mock.fetchImpl }), /incomplete/);
});
