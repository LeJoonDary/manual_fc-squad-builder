# Low-budget build verification — 2026-11-08

## Changes

- Repair stops at 2,500 ms or 1,500 trial combinations, including checks during shortlist and pair generation. It returns null on exhaustion.
- Repair evaluates no-manager chemistry first, then uses cached ten-player delta evaluators for manager league/nation combinations. It does not call findBestManager for every replacement.
- Builds with no locks and a positive budget at most 100,000 use a shared 2,500 ms deadline across preparation, main search and repair. Expired searches do not start a second rescue pass. These builds finish on their first valid squad without a subsequent upgrade pass.
- Only this low-budget mode pools affordable reserves for remaining positions, prefers same-league anchor pairs and existing league/club/nation links, and allows the existing concentrated-league configuration (at least two leagues, up to nine players per league). Advanced constraints, uniqueness and the total budget remain enforced.
- Million-coin and locked builds retain their prior search strategy.

## Live DB results

Command: `npx tsx scripts/check-low-budget.ts`. Durations measure the builder, excluding DB fetch latency. No manual exclusions; zero-price market cards excluded. Locked cards in the lock regression are owned.

| Scenario | Chemistry | Cost | Builder duration |
| --- | --- | --- | --- |
| Empty squad, 100,000 C, 937 candidates | 33/33, stage 1, 10 search nodes | 82,000 C | 486 ms |
| Empty squad, 1,000,000 C, 1,034 candidates | 33/33, stage 1 | 664,500 C | 1,532 ms |
| Seven locks | 33/33, Mariona/De Paul/Saliba/Frimpong | 46,700 C | 199 ms |
| Eight locks | 33/33, Mariona/De Paul/Timber | 28,650 C | 50 ms |

## Checks

- Production build passed; existing chunk-size warning remains.
- Repair tests cover the 1,500-evaluation ceiling, deadline termination, manager-assisted repairs, one/two-slot repairs, locks and hard constraints.
- The offline 100k fixture completes in the first main-search stage with fewer than 50 nodes; million-coin constrained midfield and locked puzzle regression tests pass.
- Full suite: 955 passed, 279 failed, 5 skipped. Remaining failed assertion names match the pre-existing scope-verification baseline.
- An additional run of the older striker live-data script passed its seven/eight-lock and five repeated Pajor assertions, but its hardcoded Kika-after-exclusion assertion encountered Alvarez in the updated market pool. The frozen striker regression passes; the requested scenarios above use their own passing live-data script.
