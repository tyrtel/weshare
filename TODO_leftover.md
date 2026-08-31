# Leftover work

Consolidated from TODO_groups.md, TODO_ui.md, and TODO_userMerge.md during a
2026-07-19 cleanup pass — all three source docs were fully complete except for
the one item below, which was still genuinely open. The three source files
have been deleted.

---

## Cross-group balance rollover

**From:** TODO_groups.md, "What is explicitly deferred"

Trip-level settlement already supports rollover (`src/features/settlement/screens/RolloverScreen.tsx`,
`src/features/settlement/hooks/useRollover.ts`) — unsettled balances from a
closed trip can roll into a new one. Groups have no equivalent: when a group
expense is settled, or a group is otherwise "closed out," there's no path to
carry a residual balance forward the way trips do.

Not started. No group-level rollover hook, screen, or repository method
exists yet.
