/**
 * Shallow-fetch a Git repository and mirror its tree into a context directory.
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

import { appendFile, mkdir, rm } from "fs/promises";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";
import { contextDir } from "../../lib/paths.js";

function run(cmd: string, args: string[], cwd?: string): void {
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${cmd} exited with status ${result.status}`);
  }
}

function repoName(repoUrl: string): string {
  const name = repoUrl
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .split("/")
    .pop();
  if (!name) {
    throw new Error(
      `Could not derive a directory name from REPO_URL "${repoUrl}"; set REPO_OUT_DIR explicitly.`,
    );
  }
  return name;
}

/** Resolve "owner/name" to a github.com clone URL, leaving full URLs untouched. */
function remoteUrl(repoUrl: string): string {
  if (/^[\w.-]+\/[\w.-]+$/.test(repoUrl)) {
    return `https://github.com/${repoUrl.replace(/\.git$/, "")}.git`;
  }
  return repoUrl;
}

async function syncRepo(): Promise<void> {
  const repoUrl = process.env.REPO_URL?.trim();
  if (!repoUrl) {
    throw new Error(
      "REPO_URL is required (e.g. owner/name or a full clone URL)",
    );
  }
  const token = process.env.REPO_TOKEN?.trim() || undefined;
  const ref = process.env.REPO_REF?.trim() || "HEAD";
  const outDir = process.env.REPO_OUT_DIR
    ? resolve(process.env.REPO_OUT_DIR)
    : contextDir(repoName(repoUrl));

  const tmp = resolve(tmpdir(), `repo-sync-${Date.now()}`);

  try {
    run("git", ["init", "-q", tmp]);
    run("git", ["remote", "add", "origin", remoteUrl(repoUrl)], tmp);
    // Authenticate via an http header written to the repo config rather than the
    // clone URL, so the token never lands in a URL string or a process argument.
    // Fetching by ref (not `clone --branch`) also resolves commit SHAs, not just
    // branches and tags.
    if (token) {
      const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
      await appendFile(
        join(tmp, ".git", "config"),
        `[http]\n\textraheader = Authorization: Basic ${basic}\n`,
      );
    }
    run("git", ["fetch", "--depth", "1", "origin", ref], tmp);
    run("git", ["checkout", "-q", "FETCH_HEAD"], tmp);

    await mkdir(outDir, { recursive: true });
    run("rsync", ["-a", "--delete", "--exclude=.git", `${tmp}/`, `${outDir}/`]);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  console.log(`Synced ${repoUrl}#${ref} into ${outDir}`);
}

syncRepo().catch((err) => {
  console.error("Repo sync failed:", err);
  process.exit(1);
});
