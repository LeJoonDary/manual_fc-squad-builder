# Deterministic striker verification — 2026-11-05

The continuation cursor and automatic rotation have been removed. Candidate fetching and both build entry points discard all currentSquad entries without isLocked === true, including unlocked owned cards. Locked cards, explicit exclusions, ST ranking/budgets and the small-gap direct solver are preserved.

## Verification

- `npm run build`: passed.
- Regression tests in `utils/strikerAnchorOrder.test.ts`: five successive builds preserve every selected card ID, including Pajor at LS. Previous results are supplied as unlocked owned cards to verify they cannot affect ranking or cost. The test runs with both normal and reversed candidate input order.
- Requested-price test: Pajor 131,000 C, Kika 56,500 C, Gyokeres 21,000 C. Every run is 33/33 within 300,000 C.
- Explicitly excluding Pajor selects Kika; excluding Pajor and Kika selects Gordon. Both are 33/33. No automatic exclusions are created.
- Candidate fetch regression: an unlocked owned Pajor changes neither DB queries nor returned candidates.
- The old unlocked-ownership override expectation in autoBuildConstraints was updated to the newly requested empty-slot behavior.

## Live DB

Command: `npx tsx scripts/check-striker-anchor-order.ts`. Timings exclude network fetching; locked cards are owned.

Five successive builds all selected the identical Pajor squad, 33/33, total 249,900 C, taking 527–569 ms each. The live Pajor price was 139,000 C; the requested 131,000 C price is separately covered by the offline test.

Pajor explicitly excluded: Kika ST, 33/33, 80,100 C. Both explicitly excluded: Gordon ST, 33/33, 128,650 C.

Seven locks: Mariona / De Paul / Saliba / Frimpong, MLS/Poland, 33/33, 203 ms.
Eight locks: Mariona / De Paul / Timber, MLS/Poland, 33/33, 36 ms.

Full suite: 951 passed, 279 failed, 5 skipped. Remaining failing assertion names match the earlier baseline report. All 50 focused bridge/MRV/locked-puzzle/striker tests passed.
