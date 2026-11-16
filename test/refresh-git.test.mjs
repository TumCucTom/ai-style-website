import assert from "node:assert/strict";
import { test } from "node:test";

import { gitConfig, pushRefreshCommit } from "../scripts/refresh-git.mjs";

const pushRejection = Object.assign(new Error("push rejected"), {
  stderr: Buffer.from("! [rejected] main -> main (fetch first)\n"),
});

test("pushRefreshCommit retries non-fast-forward pushes without forcing", () => {
  const commands = [];
  let pushAttempts = 0;

  pushRefreshCommit({
    exec(command) {
      commands.push(command);
      assert.equal(command.includes("--force"), false);

      if (command === "git push origin HEAD:main") {
        pushAttempts += 1;
        if (pushAttempts === 1) {
          throw pushRejection;
        }
      }
    },
    logger: { log() {}, warn() {} },
  });

  assert.deepEqual(commands, [
    "git add data/live-commits.json data/live-chess.json data/live-spotify.json data/open-source.json",
    'git commit -m "refresh: live data [skip ci]" -m "Co-Authored-By: Zippy AI <tomkinsbale@icloud.com>"',
    "git push origin HEAD:main",
    "git fetch origin main:refs/remotes/origin/main",
    "git reset --mixed origin/main",
    "git add data/live-commits.json data/live-chess.json data/live-spotify.json data/open-source.json",
    'git commit -m "refresh: live data [skip ci]" -m "Co-Authored-By: Zippy AI <tomkinsbale@icloud.com>"',
    "git push origin HEAD:main",
  ]);
});

test("gitConfig preserves the full multi-word author name", () => {
  const commands = [];

  gitConfig({
    exec(command) {
      commands.push(command);
    },
  });

  assert.deepEqual(commands, [
    'git config user.name "Thomas Bale"',
    "git config user.email hf23482@bristol.ac.uk",
  ]);
});
