# JCG Agent Handoff Standard

## Purpose

Use GitHub as the control plane for multi-agent engineering work so Manny is not the message bus between ChatGPT, Claude Code, Codex, and Gemini.

## Roles

- ChatGPT: Delivery Manager / Scrum Master. Owns sequencing, scope, issue state, approvals routing, and cross-agent coordination.
- Claude Code: Lead Implementation Engineer. Reads the assigned GitHub issue and repo documents, implements only authorized scope, runs tests, and writes required findings.
- Codex: Independent Adversarial Reviewer. Reads the assigned GitHub issue, implementation diff, tests, and findings, then records an independent verdict.
- Gemini: Research / Architecture Specialist. Produces research evidence; research is input, not authority.
- Manny: Product Owner and final authority for production actions, credentials, spend, risk acceptance, and final approvals.

## Canonical Work Packet

Each engineering item uses one GitHub issue as the canonical task packet. The issue must contain:

- goal
- scope
- acceptance criteria
- authoritative references
- files or documents to read first
- explicit out-of-scope items
- validation required
- findings-document path
- current owner/agent role
- final disposition

Agents should not rely on another agent's chat transcript.

## Handoff Flow

1. ChatGPT creates or updates the GitHub issue.
2. Claude Code reads the issue and performs implementation or audit work.
3. Claude records durable findings under `docs/` and updates the implementation branch/PR as authorized.
4. Codex reads the same issue plus the diff, tests, and findings and performs an independent review.
5. Codex records only material findings and final disposition.
6. Claude remediates only findings that remain open.
7. CI and staged-tree validation provide objective evidence.
8. Manny approves only gates that require Product Owner authority.

## Required Findings

Material findings must never exist only in chat or terminal output. Each task specifies a findings document under `docs/`.

## Evidence Rules

- PASS only when positively established.
- FAIL only when positively disproven.
- Otherwise use UNVERIFIED, UNKNOWN, NO_RESULTS, NOT_PARSED, UNAVAILABLE, or another explicitly defined non-assertive state.
- Vendor documentation defines intended contract; controlled observation defines observed behavior. Discrepancies are recorded, not hidden.
- Absence of returned evidence is not proof that an event did not occur.

## Scope Control

Anything outside the declared issue scope is reported as a new/deferred finding. It is not implemented unless the issue is updated to authorize it.

## Review Independence

The implementation agent may not self-approve a gate. Codex is the independent review path. If Claude and Codex disagree and both cite evidence, the item remains blocked until Manny or the Delivery Manager resolves the conflict based on evidence.

## Local/Production Actions

Agents must stop and request Manny when work requires:

- production or live-system execution
- access to local-only credentials or SecretStorage
- spending money
- changing repository visibility/settings not exposed through tooling
- destructive or irreversible actions
- explicit risk acceptance

## Default Delivery Policy

Prefer the smallest dependency-complete change. Keep implementation WIP low. Parallelize research and independent review, but avoid multiple agents editing the same code simultaneously.
