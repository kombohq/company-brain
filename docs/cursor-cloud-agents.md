# Running company-brain with Cursor Cloud Agents

This guide sets up a Cursor Automation that listens in a Slack channel and answers questions using the synced `context/` files, no local machine needed.

## Prerequisites

- A **paid Cursor plan** (Cloud Agents require one).
- **Admin** on the GitHub org that owns this repo, and **read-write** access to the repo.

## 1. Connect GitHub and select the repo

In [Dashboard → Integrations](https://www.cursor.com/dashboard/integrations), connect GitHub (needs Cursor admin + GitHub org admin). Choose **Selected repositories** and include this repo.

Docs: [GitHub integration](https://cursor.com/docs/integrations/github).

## 2. Configure the cloud environment

Cloud Agents run in an isolated Ubuntu VM. This repo already ships [`.cursor/environment.json`](../.cursor/environment.json), which installs Bun and runs `bun install`, so there's nothing to set up here.

If a connector needs credentials to run a live sync, add them as **secrets** in [Dashboard → Cloud Agents → Secrets](https://www.cursor.com/dashboard/cloud-agents) (e.g. `NOTION_TOKEN`), scoped to the environment.

Docs: [Cloud agent setup](https://cursor.com/docs/cloud-agent/setup).

## 3. Connect Slack

In [Dashboard → Integrations](https://www.cursor.com/dashboard/integrations), connect Slack (a workspace admin installs the Cursor app). During setup, confirm the GitHub connection and set `company-brain` as the default repository. Only **public channels** are visible to Slack triggers.

Docs: [Slack integration](https://cursor.com/docs/integrations/slack).

## 4. Create the Automation

Go to [cursor.com/automations](https://cursor.com/automations) and create a new automation.

**Trigger**: _Any message_ from _Anyone_ in the Slack channel you want to use. Make sure **Ignore Thread Replies** is **off** so the agent also responds inside threads.

**Repository**: set it to `company-brain`. Slack-triggered automations default to no repository, so you must set this explicitly.

**Tools**: add **Send to Slack** pointed at the same channel so the agent can reply.

**Agent instructions**: give the agent enough context to behave well. A starting point:

> You are a company knowledge assistant. You have access to the company's synced context under `context/`. When a question comes in, grep and read the relevant files, then reply **in the thread** (not to the channel directly). Cite the files you used. If you can't find the answer, say so clearly.

Customize this to match your team's needs — for example, tell the agent which sources exist under `context/` and what kinds of questions to expect.
