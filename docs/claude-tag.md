# Running company-brain with Claude Tag

> Draft. Claude Tag is in beta for Claude Team and Enterprise customers. Exact console wording may change, follow the official [Claude Tag docs](https://www.anthropic.com/news/introducing-claude-tag) for the current flow.

[Claude Tag](https://www.anthropic.com/news/introducing-claude-tag) is Anthropic's shared, always-on `@Claude` teammate for Slack. You add it to a channel, connect it to this repository, and anyone in the channel can tag `@Claude` to ask questions or delegate tasks. It answers from the synced `context/` files, no local machine needed.

This is the **recommended way to use company-brain from Slack**. Unlike the old per-user Claude in Slack app (retired August 3, 2026), Claude Tag is one shared identity for the whole channel: everyone talks to the same `@Claude`, it remembers context across conversations, and there's no per-user setup.

## Prerequisites

- A **Claude Team or Enterprise** plan (Claude Tag is in beta for these).
- A **Slack workspace admin** to pair Claude Tag with your workspace.
- A **Claude admin** to configure access, connect the repo, and set spend limits.

## 1. Pair Claude Tag with your Slack workspace

From the [Claude Tag admin settings](https://claude.ai/admin-settings/claude-tag), a workspace admin installs Claude Tag into Slack.

## 2. Configure access with an Access Bundle

Everything Claude can reach is defined in an **Access Bundle** in the [admin settings](https://claude.ai/admin-settings/claude-tag). A bundle groups the repositories, tool credentials, domains, plugins, and instructions Claude gets, and it can be reused across multiple channels ("places").

On the bundle's **Repositories** tab, connect your GitHub org and select `company-brain` so Claude can read and grep the synced `context/` files.

**You don't have to mirror everything into** `context/`**.** For code, you can connect other repositories to the same bundle directly. Claude reads them live with full git history and picks which ones it needs for a given task, so you don't need the `repo` [connector](connectors/repo.md) to snapshot them into this repo. Keep `company-brain` for the sources that aren't git (Notion, Zendesk, call notes, etc.), and let Claude read code repos straight from GitHub. Connecting more repos gives `@Claude` broader, always-current context.

## 3. Scope the bundle to channels

Attach the bundle only to the channels where your team should be able to use the company brain, rather than the whole workspace. Memories and data access stay scoped to those channels, so a company-brain Claude won't leak context into unrelated ones.

Private channels work too, so you can keep a sensitive company-brain channel invite-only. Note that ambient cross-channel learning never pulls _from_ private channels into others.

Keep the channel shared and team-visible. See [Security considerations](security.md) for why a single designated channel is useful.

## 4. Tag `@Claude` in Slack

In the channel, open **Integrations → Add apps**, add the **Claude** app, then `/invite @Claude`. Tag it with a question and it breaks the task into steps, reads the relevant files, and replies in a thread citing what it used.
