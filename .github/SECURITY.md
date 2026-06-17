# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Company Brain, please report it responsibly.

**Do not open a public issue.** Instead, email **support@kombo.dev** with:

- A description of the vulnerability
- Steps to reproduce
- Impact assessment (if possible)

You should receive a response within 48 hours.

## Supported Versions

Security fixes are applied to the latest release only. We recommend always running the most recent version.

## Scope

Company Brain syncs data from third-party APIs into a Git repository. Security considerations include:

- **Credentials**: API tokens and secrets are passed via environment variables and never committed to the repository
- **Synced content**: The `context/` directory contains data pulled from your company's sources — review what you commit and who has repo access
- **Dependencies**: We track CVEs in Bun/npm dependencies via Dependabot
