# Security considerations

A company brain is useful precisely because it knows a lot. That same property makes it worth thinking carefully about how it is operated.

## The Lethal Trifecta

An agent becomes dangerous when three conditions are present simultaneously:

1. **Access to sensitive data** — the repo contains private business information by design
2. **Exposure to untrusted content** — everything the agent reads (tickets, call notes, Notion pages, code comments) could contain adversarial instructions
3. **The ability to communicate externally** — without an exfiltration channel, the other two conditions are mostly contained

Every security decision should be evaluated against this: does it reduce one or more of these three factors without meaningfully degrading the agent's usefulness?

## Controls, in order of impact

### Disable network access

This is the highest-leverage single control. An agent with no outbound network access cannot exfiltrate the repository, cannot download a malicious dependency that uploads data, and cannot be used as a relay. It removes the external communication leg of the risk model almost entirely.

In practice: disable network access at the sandbox level, not in the system prompt. A manipulated agent does not follow its own prompt.

### Keep the repo private and scope who can access it

The repo contains your company's operational context. Keep it private. Access to the raw repository should be limited to people who genuinely need it, the same way you would scope access to any sensitive internal system.

For the Cursor Automation (or equivalent bot), restrict which channels it can post in. If everything has to go through one designated channel, you get a natural audit trail and limit blast radius.

### Sync only what you would show an employee

The data in this repo should be treated the same way you treat internal access levels. Do not sync data that you would not show to a general employee. The agent will be able to read and surface everything you put in it.

If you have data with different sensitivity levels, keep the higher-sensitivity data out, or in a separate private repo with tighter access.

### Use shared channels

Having the agent operate in a shared Slack channel is a meaningful security layer. It makes interactions visible to multiple people, creates accountability for the person interacting with the agent, and surfaces prompt injection attempts to observers.

It also has a non-security benefit: people learn from watching others interact with the agent and discover capabilities they would not have found on their own.

### Supply chain attacks

A malicious package published to npm, runs with full access to the environment at sync time, including any secrets loaded from `.env`.

The most effective control is a minimum release age: refuse to install any package version that was published less than 5 days ago, giving the community time to detect and report malicious publishes before they reach you. Bun, npm, pnpm, and Yarn all support this natively; `scripts/harden-package-managers.bash` sets it globally on the developer's machine and runs automatically on `bun install` via the `postinstall` hook.

## Risk cannot be zero

Humans with access to sensitive internal knowledge also carry risk, they can be phished, manipulated, or act in bad faith. The goal is to reduce the risk to a level where exploitation costs more than it is worth, and where the most likely failure modes are visible, contained, and recoverable.

## What we do at Kombo

We run a more restricted version where:

- Network access is disabled at the sandbox level.
- We are deliberate about what we sync, we do not put data in the repo that we would not share with all employees. We redact most PII before storing files.
- The Cursor Automation is configured to a designated channel; all interactions go through that channel and are visible to the team
- Only Kombo employees can interact with the agent.
