/**
 * Shallow-clone a Git repository and mirror its tree into a context directory.
 * The .git folder is dropped so the result is plain files committed to this repo
 * (no nested repository), and files removed upstream are deleted locally.
 *
 * Configured entirely through env vars so one workflow step can sync any repo:
 *   REPO_URL     repository to pull, either "owner/name" (GitHub) or a full clone URL
 *   REPO_TOKEN   access token for private repos (optional; omit for public ones)
 *   REPO_REF     branch, tag, or commit to check out (optional; defaults to HEAD)
 *   REPO_OUT_DIR directory to mirror into (optional; defaults to context/<name>)
 *
 * Requires `git` and `rsync` on PATH (present on GitHub Actions ubuntu-latest).
 *
 * Usage:
 *   REPO_URL=owner/name bun run repo:sync
 */

import { mkdir, rm } from "fs/promises";
import { resolve } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";
import { contextDir } from "../../lib/paths.js";

function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${cmd} exited with status ${result.status}`);
  }
}

/** Resolve "owner/name" to a github.com clone URL, leaving full URLs untouched. */
function repoName(repoUrl: string): string {
  const stripped = repoUrl.replace(/\.git$/, "");
  const segments = stripped.split("/");
  return segments[segments.length - 1];
}

function cloneUrl(repoUrl: string, token: string | undefined): string {
  const base = /^[\w.-]+\/[\w.-]+$/.test(repoUrl)
    ? `https://github.com/${repoUrl}.git`
    : repoUrl;
  if (!token) {
    return base;
  }
  return base.replace(/^https:\/\//, `https://x-access-token:${token}@`);
}

async function syncRepo(): Promise<void> {
  const repoUrl = process.env.REPO_URL?.trim();
  if (!repoUrl) {
    throw new Error(
      "REPO_URL is required (e.g. owner/name or a full clone URL)",
    );
  }
  const token = process.env.REPO_TOKEN?.trim() || undefined;
  const ref = process.env.REPO_REF?.trim() || undefined;
  const outDir = process.env.REPO_OUT_DIR
    ? resolve(process.env.REPO_OUT_DIR)
    : contextDir(repoName(repoUrl));

  const tmp = resolve(tmpdir(), `repo-sync-${Date.now()}`);
  const cloneArgs = ["clone", "--depth", "1"];
  if (ref) {
    cloneArgs.push("--branch", ref);
  }
  cloneArgs.push(cloneUrl(repoUrl, token), tmp);

  try {
    run("git", cloneArgs);
    await mkdir(outDir, { recursive: true });
    run("rsync", ["-a", "--delete", "--exclude=.git", `${tmp}/`, `${outDir}/`]);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  console.log(`Synced ${repoUrl}${ref ? `#${ref}` : ""} into ${outDir}`);
}

syncRepo().catch((err) => {
  console.error("Repo sync failed:", err);
  process.exit(1);
});
