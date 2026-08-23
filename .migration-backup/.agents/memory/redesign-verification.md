---
name: Redesign verification pipeline
description: Known failure modes of full-page design-subagent passes and the verification order that catches them
---

**Rule:** After any design-subagent pass that rewrites whole pages, run this pipeline before reporting done: (1) `tsc --noEmit`, (2) architect code review with git diff, (3) e2e test of the interactive flows.

**Why:** A full redesign pass has twice dropped things silently: shadcn module exports (`buttonVariants`/`ButtonProps`, breaking sibling ui components) and entire page features (AI assistant tabs, agent hub setup content) that only an architect review caught. Screenshots alone verify layout, not functionality.

**How to apply:**
- Give restoration follow-ups to the SAME design subagent (`sendFollowup`) — it keeps its design-system context; extract pre-redesign file versions from git (`git show HEAD:path`) into temp reference files it can read, then delete them.
- `waitForJob` timeout caps at 600s — loop `waitForJob` for long design jobs instead of passing a bigger number.
- When an e2e tester reports "toggle/mutation didn't persist," check API logs for DOUBLE requests before assuming a bug: a tester (or user) may click twice when UI feedback is subtle, toggling state back. Fix is usually visible feedback (progress counters), not state logic.
- Mutation query invalidation is a recurring gap in generated/redesigned pages: every `mutate` onSuccess needs explicit `queryClient.invalidateQueries` with the orval `get*QueryKey()` helpers, including cross-entity keys (orders↔shipping tasks↔dashboard summary).
