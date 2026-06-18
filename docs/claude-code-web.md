# Chatting with the repository via Claude Code

Claude Code on the web lets you chat with this repository from anywhere — browser, phone, wherever. You connect your GitHub account, point Claude at this repo, and ask it questions the same way the [Cursor Cloud Agents setup](cursor-cloud-agents.md) works.

## Prerequisites

- A **Claude Pro, Max, Team, or Enterprise** plan with Claude Code access.
- A **GitHub account** with read access to this repository.

## Setup

1. Go to [claude.ai/code](https://claude.ai/code) and sign in.
2. Connect your GitHub account and authenticate this repository.
3. Start a session and ask questions — Claude reads the `context/` files to answer.

You can now use it from any device.

## Optional: Slack integration

You can also @mention Claude directly in a Slack channel. A workspace admin installs the Claude app once from the Slack App Marketplace, then each user connects their own Claude account via the Claude App Home in Slack.

**This is not a shared resource.** Every person who wants to interact in Slack must individually have a qualifying Claude plan and GitHub access to this repository. If you want the whole team to ask questions without individual setup, use the [Cursor Cloud Agents setup](cursor-cloud-agents.md) instead — it's a single shared bot anyone in the channel can talk to.

### Slack setup (per user)

1. Open the **Claude** app in Slack → **App Home** → **Connect**.
2. In the channel: `/invite @Claude`.
3. @mention Claude — on first use it will ask you to select the default repository.

Configure **Code + Chat** routing in the App Home so Claude handles both questions and coding tasks in the same channel.
