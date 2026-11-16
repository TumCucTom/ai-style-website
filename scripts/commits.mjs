// Standalone refresh uses the same collector as the scheduled workflow.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchCommitActivity } from "./github-activity.mjs";
import { gitConfig, gitPull, pushRefreshCommit } from "./refresh-git.mjs";

const file = fileURLToPath(new URL("../data/live-commits.json", import.meta.url));
// A failed collection leaves the existing snapshot untouched and exits nonzero.
const activity = await fetchCommitActivity();
gitConfig();
gitPull();
fs.writeFileSync(file, JSON.stringify(activity, null, 2));
pushRefreshCommit();
