import { execSync } from "node:child_process";

const DATA_FILES = [
  "data/live-contributions.json",
  "data/live-chess.json",
  "data/live-spotify.json",
  "data/open-source.json",
];

const DATA_FILES_ARG = DATA_FILES.join(" ");
const COMMIT_COMMAND =
  'git commit -m "refresh: live data [skip ci]" -m "Co-Authored-By: Zippy AI <tomkinsbale@icloud.com>"';
const PUSH_COMMAND = "git push origin HEAD:main";

function run(exec, command) {
  return exec(command, { stdio: "pipe" });
}

function errorOutput(error) {
  return [
    error?.stdout?.toString?.() ?? "",
    error?.stderr?.toString?.() ?? "",
    error?.message ?? "",
  ].join("\n");
}

function isNoChanges(error) {
  const output = errorOutput(error);
  return output.includes("nothing to commit") || output.includes("no changes added to commit");
}

function isPushRejection(error) {
  const output = errorOutput(error);
  return (
    output.includes("fetch first") ||
    output.includes("non-fast-forward") ||
    output.includes("cannot lock ref")
  );
}

export function gitConfig({ exec = execSync } = {}) {
  run(exec, 'git config user.name "Thomas Bale"');
  run(exec, "git config user.email hf23482@bristol.ac.uk");
}

export function gitPull({ exec = execSync } = {}) {
  run(exec, "git fetch origin main:refs/remotes/origin/main");
  run(exec, "git rebase origin/main");
}

export function pushRefreshCommit({ exec = execSync, logger = console, maxAttempts = 3 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      run(exec, `git add ${DATA_FILES_ARG}`);
      run(exec, COMMIT_COMMAND);
    } catch (error) {
      if (isNoChanges(error)) {
        logger.log?.("no changes to commit");
        return false;
      }
      throw error;
    }

    try {
      run(exec, PUSH_COMMAND);
      return true;
    } catch (error) {
      if (!isPushRejection(error) || attempt === maxAttempts) {
        throw error;
      }

      logger.warn?.("git push rejected; rebasing generated data onto latest origin/main");
      run(exec, "git fetch origin main:refs/remotes/origin/main");
      run(exec, "git reset --mixed origin/main");
    }
  }

  return false;
}
