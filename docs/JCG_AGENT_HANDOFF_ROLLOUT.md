# JCG Agent Handoff Rollout

## Objective

Eliminate Manny as the manual message bus between ChatGPT, Claude Code, Codex, and Gemini.

## Phase 1 - Control Plane

GitHub issue becomes canonical work packet.

Repo documents:
- `docs/AGENT_HANDOFF_STANDARD.md`
- `docs/AGENT_TASK_TEMPLATE.md`
- `docs/AGENT_STATUS_PROTOCOL.md`

## Phase 2 - Claude Consumption

Claude Code must be configured to read the assigned GitHub issue or a repo-local mirror generated from it before beginning work. Preferred path: GitHub CLI/MCP integration if already available; otherwise use a repo-local task file updated from GitHub.

## Phase 3 - Codex Review

Codex reviews the implementation branch/PR plus the canonical issue and writes findings back to GitHub and `docs/`.

## Phase 4 - Gemini Research

Gemini remains research-only until a direct integration is available. Its report is stored in the repo by the engineering workflow, not manually relied upon as chat-only evidence.

## Exit Criteria

- Manny no longer copies long prompts between Claude and Codex.
- One GitHub issue identifies current scope, owner, state, and next action.
- Findings are durable in `docs/`.
- Review verdict is visible in GitHub.
- Manny intervenes only for approvals, local/live actions, credentials, spending, or risk acceptance.
