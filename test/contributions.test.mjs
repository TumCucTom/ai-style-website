import assert from "node:assert/strict";
import test from "node:test";
import { failedContributions, parseContributions } from "../scripts/contributions.mjs";

// A calendar in the shape GitHub serves: a cell per day and a tool-tip per cell.
function calendar(days, total) {
  const cells = days.map(([date], i) => `<td tabindex="0" data-ix="${i}" style="width: 10px" data-date="${date}" id="contribution-day-component-${i % 7}-${Math.floor(i / 7)}" data-level="1" role="gridcell" class="ContributionCalendar-day"></td>`);
  const tips = days.map(([, text], i) => `<tool-tip id="tooltip-${i}" for="contribution-day-component-${i % 7}-${Math.floor(i / 7)}" popover="manual" class="sr-only position-absolute">${text}</tool-tip>`);
  return `<h2 class="f4 text-normal mb-2">\n      ${total}\n        contributions\n        in the last year\n    </h2><table>${cells.join("")}</table>${tips.join("")}`;
}
function year(end, n, text) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push([new Date(Date.parse(end) - i * 86_400_000).toISOString().slice(0, 10), text(i)]);
  return out;
}
const NOW = Date.parse("2026-11-16T09:00:00Z");

test("reads each day, the total, and the sums the site shows", () => {
  const days = year("2026-11-16", 366, (i) => (i === 4 ? "346 contributions on November 12th." : i === 0 ? "12 contributions on November 16th." : i === 1 ? "1 contribution on November 15th." : "No contributions on that day."));
  const c = parseContributions(calendar(days, "18,789"), NOW);
  assert.deepEqual(c.today, { date: "2026-11-16", count: 12 });
  assert.equal(c.last7d, 346 + 12 + 1);
  assert.equal(c.lastYear, 18789);
  assert.deepEqual(c.best, { date: "2026-11-12", count: 346 });
  assert.equal(c.days.length, 14);
});

test("ignores the days the calendar pads the current week with", () => {
  const days = year("2026-11-21", 371, () => "3 contributions on some day.");
  const c = parseContributions(calendar(days, "1,098"), NOW);
  assert.equal(c.today.date, "2026-11-16");
  assert.equal(c.last7d, 21);
});

test("a page that is not a calendar is an error, not a zero", () => {
  assert.throws(() => parseContributions("<html><body>Sign in to GitHub</body></html>", NOW), /did not parse/);
  assert.throws(() => parseContributions(calendar(year("2026-11-16", 20, () => "1 contribution on a day."), "20"), NOW), /did not parse/);
});

test("a failed refresh keeps the last good numbers and marks them stale", () => {
  const previous = { last7d: 831, lastYear: 18789, fetchedAt: "2026-11-16T08:00:00.000Z" };
  const kept = failedContributions(previous, NOW);
  assert.equal(kept.last7d, 831);
  assert.equal(kept.refreshError, true);
  assert.equal(kept.lastAttemptAt, "2026-11-16T09:00:00.000Z");
});
