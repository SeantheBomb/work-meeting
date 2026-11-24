# Card Connectivity Graph Analysis

Sean's ask: model the deck as a graph (card = vertex, "can be played right after" = edge), check whether New Business's edge-dominance reflects unhealthy clustering, and propose/test fixes. This ties directly into the New Business dominance issue flagged as a follow-up in the last balance pass (DESIGN_NOTES.md section 11) — this analysis explains *why* it dominates, at a structural level, not just that it does.

## Methodology

Legality in this game is fully determined by which Topics are "touched" (have a Line Item, any Status) or not — `isLegal()` in `engine.ts` never looks at anything else for Rewrite/Remove, and Add/New Business only check touched-ness too. With 5 Topics, that's exactly 2<sup>5</sup> = 32 possible board configurations. Rather than sampling this space via Monte Carlo (like the balance sims), it can be **enumerated exhaustively** — no seed, no sample size, no variance. New tooling: `worker/src/sim/cardGraph.ts` (the exact graph builder + metrics), `worker/src/sim/cardGraphCandidates.ts` (baseline + candidate deck models), `worker/src/sim/cardGraphReport.ts` (the comparison runner).

**A modeling trap worth flagging, since it changes the results substantially**: a naive version of this ("does there exist any of the 32 states where B is legal right after A") massively over-counts. Two cards on *different, unrelated* Topics (e.g. Budget's Push Back and Timeline's Push Back) would get linked any time the *other* Topic just happens to already be touched in the sampled state — that's coincidence, not causation, and it silently erases the very clustering this analysis exists to find (everything looks connected to everything once unrelated Topics are allowed to vary freely). The fix implemented: when testing edge A→B, only the Topics **A itself can actually influence** are allowed to vary; every other Topic (including B's own, if A has no bearing on it) is held at its neutral default (untouched). This is what correctly distinguishes "A causally enables B" from "B merely also happens to be true."

## Baseline findings (current shipped 35-card deck)

- **1,175 → 575 edges** once the causal-vs-coincidental fix above was applied (the naive version overstated connectivity by ~2x).
- **56.5% of all edges touch a universal/wild card** (New Business ×4 or Overtime) — more than half the graph's real connectivity funnels through 5 of the 35 cards.
- **Raise capacity**: each Topic has exactly **1** committed, always-available card that can raise it from untouched (its own Quick Note) — versus **4** universal copies (New Business) that can raise *any* Topic, freely retargetable, never Topic-locked.
- The graph is *technically* fully connected even with the universal cards removed (every Topic's Quick Note has no prerequisite, so it's trivially reachable from anywhere) — so the real story isn't "isolated islands," it's **concentration and reusability**. Quick Note is single-copy and permanently spent once its Topic is raised; New Business is never spent. Once a topic's own Quick Note is gone from play, New Business is the *only* reliable fallback — that's the structural root of its dominance, confirmed by the last balance pass's card-usage data (New Business's dominant-match share was 46-73% depending on config).

## Candidates tested

| | What it does | New cards |
|---|---|---|
| **C1: Linked Cycle** | 5 new Add cards, one per Topic, each legal only once a *specific different* Topic is touched (a directed 5-ring: Budget needs Operations, Timeline needs Budget, etc.) — genuine new cross-Topic edges that don't exist today | +5 |
| **C4: Partial Links** | Same idea, only 2 of the 5 possible links (lighter touch) | +2 |
| **C2: Extra Resets** | A 2nd Remove-verb card per Topic | +5 |
| **C5: Extra Raises** | A 2nd, unconditional Add-verb card per Topic — directly targets the raise-capacity scarcity found above | +5 |
| **C3: Combined** | C1 + C2 | +10 |
| **C6: Combined** | C1 + C5 | +10 |

## Results — graph metrics (exact, exhaustive)

| Scenario | Edges | Hub-edge % | Avg shortest path |
|---|---|---|---|
| C0 Baseline | 575 | 56.5% | 1.74 |
| C1 Linked Cycle | 720 | 52.1% | 1.73 |
| C4 Partial Links | 631 | 54.7% | 1.73 |
| C2 Extra Resets | 675 | 55.6% | 1.76 |
| **C5 Extra Raises** | 815 | **46.0%** | 1.65 |
| C3 Combined (C1+C2) | 830 | 51.2% | 1.75 |
| **C6 Combined (C1+C5)** | 980 | **43.4%** | **1.66** |

**C2 (Extra Resets) barely moves the needle** (55.6%, basically flat) — confirmed prediction: a 2nd Remove card adds redundancy (a Topic isn't dependent on drawing that one specific removal card) but doesn't add any new *edge*, since the reachable-state graph is unchanged. It solves an availability/robustness problem, not the clustering one.

**C5 (Extra Raises) is the strongest single-lever fix** — directly attacks the raise-capacity scarcity (per-Topic committed raise cards go from 1 to 2, versus New Business's fixed 4), cutting hub-edge-fraction by 10.5 points and shortening the average path. **C6 (C5 + the Linked Cycle) is the best result overall** (43.4%), but the Linked Cycle mechanic doesn't exist in the shipped engine today — `isLegal()` has no concept of a card depending on a *different* Topic's state, so shipping it means extending the engine, not just adding data-driven cards.

## Results — real gameplay validation (C5 only, since it needs no engine changes)

Ran C5 through the actual bot-driven balance harness (`worker/src/sim/cardGraphBalanceCheck.ts`, n=600/player-count), checking it doesn't regress the agenda-achiever target from the last pass:

| | 2P | 4P | 5P | 8P |
|---|---|---|---|---|
| Baseline: single-card-dominance fails | 67.2% | 37.2% | 15.2% | 26.5% |
| **C5**: single-card-dominance fails | 68.8% | **10.0%** | **9.8%** | 24.3% |
| Baseline: >=1 agenda achiever | 87.5% | 75.3% | 79.0% | 66.2% |
| **C5**: >=1 agenda achiever | 87.2% | 76.8% | 83.2% | **77.7%** |

**4P and 5P show a large, genuine improvement in New Business dominance** (fails drop from 37%/15% to ~10% each), and **8P's agenda-achiever rate crosses the 75% target** (66.2% → 77.7%) as a side benefit. **2P shows no meaningful change either way** — consistent with 2P's bottleneck being Duration/hand-size scarcity (already addressed in the last pass), not raise-capacity.

## Recommendation

1. **Ship C5 (Extra Raise per Topic)** — it's validated in both the abstract graph model and real gameplay, needs no engine changes (a plain Add-verb `CardDef`), and directly improves both the thing this analysis was about (New Business dominance) and the thing the last pass was about (agenda-achiever rate at 8P), with no observed downside.
2. **C6 (add the Linked Cycle on top) is the better ceiling** (43.4% vs 46.0% hub-edge-fraction) but requires extending `isLegal()`/`CardDef` to support cross-Topic-conditional legality — a real mechanic, not a data tweak. Worth a dedicated follow-up if Sean wants to push further after seeing C5 in play; not bundled into this pass.
3. **C2 (Extra Resets) is not recommended as a clustering fix** — it solves a different problem (redundancy) and shows negligible movement on the actual metric this analysis targeted.

This document is a proposal only — nothing has been implemented in the shipped game yet, per the "document it for me to review" framing. Card names/flavor text above are placeholders; final stats would need the same "no duplicate stat triple" pass the rest of the deck already went through.
