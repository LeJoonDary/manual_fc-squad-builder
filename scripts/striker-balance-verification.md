# Striker budget balance — 2026-11-08

Two automatic ST slots now share the 50% group allowance equally: each is capped at 25% of the total budget. Selecting the first paid striker does not expand the second striker's cap. A locked or owned zero-cost partner retains the single-slot exception, with purchased partner cost deducted from the group allowance.

The same rule applies to dynamic caps, live search and prepared pools. Two automatic strikers may now receive legal meta upgrades, subject to their individual/group caps and chemistry. Multi-position cards cannot bypass the ST cap via a CAM pool entry. Single automatic ST refinement behavior is preserved.

## Results

- `npm run build`: passed.
- Full suite: 962 passed, 279 failed, 5 skipped. Remaining failed assertion names match the earlier baseline report. The old ST 35%/26.25% test expectations were updated to the requested equal-share rule; other expectations remain unchanged.
- All 50 focused striker-budget/MRV/determinism/low-budget/locked-puzzle tests passed, including a synthetic 498,000 C elite candidate and a 275,000 C multi-position upgrade.
- Frozen 1M Pinged Pass+ fixture: Pajor 131,000 C + Beerensteyn 188,000 C; total 989,300 C; 33/33. The 300k Adeyemi-locked regression still selects Pajor at 131,000 C for five consecutive builds.
- Live DB, 1M, three CM Pinged Pass+ requirements, Icons/Heroes excluded: Pajor 105,000 C + Beerensteyn 160,000 C; total 897,500 C; 33/33 in 427 ms.
- Live seven-lock case: 33/33 in 198 ms. Live eight-lock case: 33/33 in 45 ms. Timings exclude database fetch latency.

Live check: `npx tsx scripts/check-striker-balance.ts`. Frozen regressions: `npx vitest run utils/strikerBudgetBalance.test.ts utils/mrvOrder.test.ts utils/strikerAnchorOrder.test.ts utils/lowBudgetBuild.test.ts utils/fourSlotLocks.test.ts utils/autoBuildLockedPuzzle.test.ts`.
