# Auto Build post-processing (2026-11-13)

Both the normal search and the few-open-slots solver now use `postProcessSquad`.

- Rescue targets 33 even when the requested target is lower. It visits unlocked, low-chemistry slots first using broad positional candidates retained before construction caps. A plateau triggers atomic two-slot bridge evaluation; only a strict net chemistry increase is committed.
- Optimization makes at most three weakest-slot-first passes. The extra-cost allowance is `min(remaining, max(15000, floor(remaining * .40)))` per swap. Cheaper upgrades are allowed.
- Performance uses assigned-position stat weights and Playstyle/skill bonuses, plus two points per matching Role level (maximum Role++), and a two-point positional acceleration-type bonus. Primary-position bonuses and chemistry scores are excluded.
- Each swap recomputes the optimal manager when manager assistance is enabled. Optimization never lowers the current team chemistry, even if rescue could not reach the target.
- Top-five selection is proportional to the improvement over the current slot score. Below 33, full-chemistry upgrades take precedence over neutral upgrades. Main search also samples a stable per-card/slot score jitter in [-3, 3] once per pass. This intentionally replaces the old globally deterministic post-processing behavior. Fixed-random tests still verify that unlocked pitch cards are ignored.
- Locks, player uniqueness, exclusions, tactical requirements, OVR, female/special-card and constrained-group budget limits remain enforced. Candidate pools remain slot aligned. `alternate_positions` is now recognized by the chemistry adapter.
- Rescue and optimization each receive an independent 1.5-second / 1,500-evaluation allowance, with event-loop yields. Expired main-search deadlines are ignored. If final chemistry is below the requested target, one final rescue pass receives a separate bounded allowance (maximum total phase allowances: 4.5 seconds). Exhaustion returns the best accepted state; infeasible candidate pools cannot guarantee 33 chemistry.

Validation:

- `npm run build`: passed.
- Post-processing and locked/low-budget/repair/MRV/striker regression files: 70 passed.
- Full suite: 991 passed, 277 failed, 5 skipped. The repository-wide suite is not clean; unrelated legacy failures remain.
- Regression assertions based on fixed manager tie ordering, minimum striker purchase price, and fixed random output were updated to verify the requested final chemistry, price ceilings, pure performance and reproducibility under a fixed random draw.
