# JCG Agent Status Protocol

Use these exact lifecycle states in the canonical GitHub issue:

- BACKLOG
- READY
- IN_PROGRESS
- BLOCKED
- READY_FOR_REVIEW
- CHANGES_REQUIRED
- APPROVED
- READY_TO_COMMIT
- DONE

Every agent handoff must update the issue with:

1. current state
2. agent role
3. work performed
4. evidence/tests
5. findings-document path
6. blockers/unknowns
7. exact next action

Do not use chat transcripts as the source of truth.
