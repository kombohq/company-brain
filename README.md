# company-brain

A long-term **sync hub** that checks your company's data sources into Git as plain, searchable files, so an AI agent (e.g. a Cursor agent) has durable, greppable context about your business.

The idea is simple: instead of giving an agent a pile of MCP servers and hoping it searches them well, you **pull the data into the repo as Markdown + JSON** and let the agent do what it's good at, reading files, running `grep`, and following links. It scales to hundreds of files, finds far more relevant context, and is easy to inspect and reason about.

## How it works

- Each **data source** has a small sync script under `src/<source>/` that fetches data and writes it into a top-level folder as raw JSON next to agent-friendly Markdown.
- A **GitHub Actions** workflow runs each sync on a schedule and commits the result back to the repo.
- An AI agent reads `AGENTS.md` and the skills under `.agents/skills/` to learn what's in the repo and how to search it.

Everything runs on [Bun](https://bun.sh). TypeScript scripts, no build step.

## Setup

```bash
# Install Bun if you haven't: https://bun.sh
bun install

# Type-check the scripts
bun run typecheck
```

Copy `.env.example` to `.env` and fill in the credentials for the sources you enable. Bun loads `.env` from the project root automatically.

## Data sources

All synced data lives under `context/<source>/`.

### Notion → `context/notion/`

Mirrors the Notion pages and databases shared with an internal integration. Each node (page or database) becomes a folder with an `index.md`: YAML frontmatter holds the Notion metadata (`notion_id`, `title`, `last_edited_time`, author, `url`, normalized `properties`/`schema`), the body is the page content as Markdown. The on-disk tree mirrors the Notion hierarchy, and relations link to the sibling files. Syncs are incremental (only pages whose `last_edited_time` changed are refetched) and prune pages that were unshared or deleted.

Setup:

1. Create an internal integration at <https://www.notion.com/my-integrations> with the **Read content** and **Read user information including email addresses** capabilities.
2. Share the top-level pages/databases you want synced with the integration.
3. Put the token in `.env` as `NOTION_TOKEN` (local) and as a repo secret `NOTION_TOKEN` (for CI).

```bash
bun run notion:sync         # incremental
bun run notion:sync full    # ignore on-disk timestamps, refetch all
```

CI runs `.github/workflows/sync-notion.yml` daily (03:30 UTC) and on manual dispatch.

### Git repository → `context/<name>/`

Mirrors another Git repository into the context as plain files. The source is shallow-cloned, its `.git` is dropped, and files removed upstream are deleted, so the result is a clean snapshot you can grep and link to.

```bash
REPO_URL=owner/name bun run repo:sync          # mirror into context/name
REPO_URL=owner/name REPO_REF=prod REPO_OUT_DIR=context/foo bun run repo:sync
```

Setup:

1. Public repositories need no token. For a private repository, create a **fine-grained** personal access token at <https://github.com/settings/personal-access-tokens/new>.
2. Give it the **minimal** access it needs and nothing more:
   - **Resource owner**: the org/user that owns the source repo.
   - **Repository access**: _Only select repositories_ → pick just the source repo.
   - **Repository permissions**: _Contents_ → **Read-only** (fine-grained tokens always add the required _Metadata: Read-only_ automatically; leave everything else as _No access_).
   - Set the shortest expiration you're comfortable with.
3. Add the token as a repo secret (e.g. `EXAMPLE_REPO_TOKEN`) and reference it from the workflow step.

The reusable `./.github/actions/sync-repo` action syncs one repository per step (its own repository, secret, and directory). To mirror several repositories, add more steps to `.github/workflows/sync-repo.yml` or copy the workflow, each pointing at a different repository and secret.

### Web → `context/<host>/`

Mirrors web content (a marketing site, docs, a help center, ...) into the context as one markdown file per page (frontmatter records the source URL, body is the page's main content). The start URL can be a page or a sitemap (`…/sitemap.xml`, including sitemap indexes); both are crawled breadth-first within the host, so a fetched URL is either followed as a sitemap or saved as a page. An optional regex restricts which paths are synced, and pages that disappear upstream (gone or 404) are pruned, with a guardrail that skips pruning when a run discovers nothing.

```bash
WEB_URL=https://docs.example.com bun run web:sync
WEB_URL=https://example.com WEB_INCLUDE='^/docs/' bun run web:sync
WEB_URL=https://example.com/sitemap.xml WEB_OUT_DIR=context/example bun run web:sync
```

The reusable `./.github/actions/sync-web` action syncs one source per step (its own URL and directory). To mirror several sources, add more steps to `.github/workflows/sync-web.yml` or copy the workflow, each pointing at a different URL and directory.

### Zendesk Help Center → `context/<subdomain>/`

Mirrors a Zendesk Help Center's **published** articles into the context as one markdown file per article (`<article-id>.md`): YAML frontmatter holds the metadata (`zendesk_id`, `title`, `url`, `locale`, `section_id`, `labels`, timestamps), the body is the article content as Markdown. It uses the anonymous public API (no token), reads only published articles (drafts are skipped), and prunes articles that were unpublished or deleted, with a guardrail that skips pruning when a run discovers nothing.

```bash
ZENDESK_SUBDOMAIN=acme bun run zendesk:sync                    # mirror into context/acme
ZENDESK_SUBDOMAIN=acme ZENDESK_LOCALE=de bun run zendesk:sync  # a different Guide locale
```

`ZENDESK_SUBDOMAIN` is the `X` in `X.zendesk.com`. The reusable `./.github/actions/sync-zendesk` action syncs one Help Center per step; to mirror several, add more steps to `.github/workflows/sync-zendesk.yml` or copy the workflow, each pointing at a different subdomain and directory.

### Pylon → `context/pylon/`

Mirrors **closed** Pylon support tickets and their accounts into the context:

- `tickets/<created-date>-TICKET-<number>.md` — one file per closed ticket. Frontmatter holds the metadata (`pylon_id`, `number`, `title`, `state`, `type`, timestamps, response/resolution metrics `first_response_*`/`resolution_*`/`number_of_touches`, `time_in_status_seconds`, `csat_score`/`csat_comment`, `source`, `slack`, `tags`, `requester`, `assignee_id`, `account_id`/`account`/`account_file`, `link`, any `custom_fields`); the body is the description and full conversation as Markdown, with a link to the account.
- `accounts/<slug>-<id>.md` — one file per account (name, domain, type, `external_ids`, timestamps) listing the synced tickets that reference it.

Listing every closed ticket is cheap, so ticket syncs are incremental on `updated_at`: only new or changed tickets have their messages refetched, and closed tickets aren't pruned. Accounts are few, so they're fully refetched each run and pruned when they disappear upstream.

```bash
PYLON_API_TOKEN=... bun run pylon:sync              # incremental
PYLON_CREATED_AFTER=2026-06-14 bun run pylon:sync   # only tickets created after a date
```

Set `PYLON_CREATED_AFTER` (a date or RFC3339 timestamp) to only sync tickets created after it, which keeps the listing small. To force a full refetch, delete `context/pylon/tickets/` and run again.

Setup:

1. Create an API token at <https://app.usepylon.com/settings/api-tokens> with read access to issues and messages.
2. Put it in `.env` as `PYLON_API_TOKEN` (local) and as a repo secret `PYLON_API_TOKEN` (for CI).

CI runs `.github/workflows/sync-pylon.yml` on manual dispatch (uncomment the schedule to run it daily).

## Running it with Cursor Cloud Agents

To run this repo in the cloud and answer questions from Slack (no local machine needed), see [docs/cursor-cloud-agents.md](docs/cursor-cloud-agents.md).

## Adding a new source

See `.agents/skills/add-connector/SKILL.md` for the pattern (where code goes, naming, the commit-and-push action, and the checklist for wiring a new source into CI). Skills live in `.agents/skills/` and are shared with each agent tool via a committed symlink (`.claude/skills`, `.codex/skills`, `.cursor/skills`).

## Local development

Set `CONTEXT_ROOT=context-dev` in your `.env` so sync output lands in a gitignored directory instead of the committed `context/` folder:

```bash
# .env
CONTEXT_ROOT=context-dev
```

All connectors pick this up automatically. Leave it unset in CI so production syncs go to `context/` as normal.

## License

[MIT](LICENSE)
