# Git repository connector

Mirrors another Git repository into the context as plain files. The source is shallow-cloned, its `.git` is dropped, and files removed upstream are deleted, so the result is a clean snapshot you can grep and link to. This is intentionally not a Git submodule: by copying the files directly into this repo, they are available to Cloud Agents and other tools that clone only this repository, with no extra setup required.

Output: `context/<name>/`

## Setup

1. Public repositories need no token. For a private repository, create a **fine-grained** personal access token at <https://github.com/settings/personal-access-tokens/new>.
2. Give it the minimal access it needs:
   - **Resource owner**: the org/user that owns the source repo.
   - **Repository access**: _Only select repositories_ → pick just the source repo.
   - **Repository permissions**: _Contents_ → **Read-only** (leave everything else as _No access_).
   - Set the shortest expiration you're comfortable with.
3. Add the token as a repo secret (e.g. `EXAMPLE_REPO_TOKEN`) and reference it from the workflow step.

Required env vars:

| Variable   | Description                                                         |
| ---------- | ------------------------------------------------------------------- |
| `REPO_URL` | Repository to mirror, as `owner/name` (GitHub) or a full clone URL. |

Optional env vars:

| Variable       | Default          | Description                                                   |
| -------------- | ---------------- | ------------------------------------------------------------- |
| `REPO_TOKEN`   | _(none)_         | Access token for private repositories. Omit for public repos. |
| `REPO_REF`     | `HEAD`           | Branch, tag, or commit to check out.                          |
| `REPO_OUT_DIR` | `context/<name>` | Override the output directory.                                |

Note: `git` and `rsync` must be on PATH. Both are available on GitHub Actions `ubuntu-latest`.

## Running

```bash
REPO_URL=owner/name bun run repo:sync
REPO_URL=owner/name REPO_REF=prod REPO_OUT_DIR=context/foo bun run repo:sync
```

The reusable `./.github/actions/sync-repo` action syncs one repository per step. To mirror several repositories, add more steps to `.github/workflows/sync-repo.yml` or copy the workflow, each pointing at a different repository and secret.

CI: `.github/workflows/sync-repo.yml` — uncomment the `schedule:` block to enable automatic syncs.
