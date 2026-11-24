# Design Notes — third pass (card variety, status clarity, adversarial agendas, risk/reward)

Written before implementation, from Sean's request (2026-07-13) for: more card variety via main+side effects, status mechanics that carry their own "flavor and challenge," Hidden Agendas that never overlap and always contradict, a measurable risk/reward framework, and permission to get structurally experimental in simulation rather than just re-tuning numbers. Every judgment call below is something to correct if it doesn't match intent — this is genuinely a redesign, not just tuning.

## 1. Entrenchment → Resolve, with per-Status mechanics

Sean: "I have no idea what Entrenchment means... this needs to either be better explained or removed." Rather than just relabeling a still-generic number, each Status now does something mechanically distinct, so the number means something different depending on where an item sits — that's the "flavor and challenge per status" ask too.

Renamed **Entrenchment → Resolve** everywhere (engine, protocol, UI). Per-status rules:

| Status | Flavor | Mechanic |
|---|---|---|
| **Raised** | Fresh, undefended | Resolve = the card's Sustain, no modifier. Easiest status to challenge — nobody's invested in it yet. |
| **Disputed** | Actively fought over | Resolve = Sustain **+1**. Being actively contested makes it harder to just walk over. |
| **Tabled** | Fading from memory | Resolve **drops by 1 automatically at the start of each round** it sits Tabled untouched (floor 0). The longer something sits in limbo, the easier it gets to revisit. |
| **Approved** | Locked in, costly to undo | Resolve = Sustain **+2**. Removing an Approved item costs the remover **+1 extra Decay** on top of the card's own — undoing a done deal is politically expensive. |

This also gives Remove a reason to specifically target Tabled items (softest target after time passes) vs. Approved items (hardest, but worth it to deny a Shared Agenda point) — a real tactical axis that didn't exist when every status used the same flat number.

## 2. Card variety: Main Effect + Side Effect

Every card keeps its main effect (Add/Rewrite/Remove/NewBusiness/Overtime, unchanged) and gains one **Side Effect**, applied whenever the card **wins priority** (success or bounce — so even a bounced Rewrite/Remove still does something, addressing "underwhelming when my card doesn't take effect" for the bounce case specifically):

| Side Effect | What it does |
|---|---|
| **Bonus Draw** | Draw 1 extra card immediately. |
| **Peek** | Privately see one chosen opponent's Hidden Agenda (topic + stance). |
| **Undermine** | Drop a *different* topic's Resolve by 1 — soften up a future target. |
| **Rebate** | Refund 1 Duration to the shared clock. |
| **Deflect** | Halve (round down) this play's own Decay cost. |

Assigned via a 5×5 Latin square (row = template, column = topic; side effect index = `(templateIndex + topicIndex) mod 5`) so **every template experiences every side effect exactly once** across its 5 topic variants, and **every topic experiences every side effect exactly once** across its 5 templates — maximum permutation variety from a small, easy-to-learn pool, no two topic-cards of the same template play identically. Universal cards (New Business, Overtime) don't get a side effect — they're already wild/flexible by design.

## 3. Talked-over plays aren't wasted: Pressure

Still addressing "most rounds my card doesn't take effect" — being talked over is structurally the norm (only one card wins the floor per round), but it shouldn't be *totally* wasted. Every **talked-over** Rewrite/Remove attempt now adds **+1 Pressure** to its target topic (shown on the Minutes board). At **3 Pressure**, the topic's Resolve drops by 1 and Pressure resets to 0. Losing the round for the floor still measurably wears down the target — the same spirit as the existing bounce-lowers-Resolve rule, extended to cards that never even got a chance to attempt their check.

## 4. Hidden Agendas: guaranteed non-overlapping and adversarial

Replaced the old 4-type pool (CreditOnApproved / CreditOnTwoPlusItems / TopicNeverApproved / ItemRemovedByOther) — none of those have a natural, guaranteed-pairable opposite, so "always contradict" wasn't achievable with them. New system:

Every player is assigned **one Topic and one Stance**: **Approve** (succeed if that Topic reaches Approved by match end) or **Block** (succeed if it never does). Assignment guarantees:
- **No two players ever get the identical (Topic, Stance) pair** — never share an agenda.
- **Whenever 2+ players land on the same Topic, they're split as evenly as possible between Approve and Block** — guaranteed direct opposition on every contested topic, not just independently-random goals that happen not to conflict.

This is a real simplification (1 pair type instead of 4 independent types) traded for a property Sean explicitly asked for (guaranteed contradiction) that the old pool structurally couldn't deliver. Worth watching in playtesting for whether the agenda space now feels too thin — a second contradictory pair (credit-based) is a natural follow-up if so.

## 5. Risk/reward measurement

Every card gets a designed **reward weight** (how much value it delivers if it fully succeeds):

| Effect | Reward weight |
|---|---|
| Rewrite → Approved | 5 (Shared Agenda + likely someone's Hidden Agenda) |
| Remove | 3 (denies/resets, situationally big) |
| Rewrite → Disputed/Tabled | 2 |
| Add / New Business | 2 (sets up future plays) |
| Overtime | 1 (utility, not agenda progress) |
| + side effect | +0.5 to +1 depending on the effect |

Simulation measures **risk** directly per card, from real outcomes: `P(talked over | chosen)` and `P(bounce | won priority)`. The combination is reported as a risk/reward scatter per card — the design goal is a real spectrum (safe/low-reward options *and* risky/high-reward gambits both present) with no card strictly dominated by another (same-or-lower risk, strictly worse reward). See README.md "Risk/reward findings" for what the simulator found.

## Results (2026-07-13, 2000 games/config, validated against HAPPY_PATH.md criteria)

The redesign was tested against the same happy-path criteria from the previous pass to confirm it didn't regress those gains while adding variety/clarity/adversarial agendas:

| | Before this pass | After (with Pressure, side effects, Resolve, new agendas) |
|---|---|---|
| 2P happy path | 4.0% | **4.9%** |
| 4P happy path | 35.1% | 38.9% |
| 5P happy path | 37.4% | **44.7%** |
| 8P happy path | 18.6% | 17.5% (roughly flat) |

Net: no regressions, and a real improvement at 5P (the player count Sean's own bug report used). Pressure threshold was tested at 2/3/4 -- 3 (the shipped default) was already at least as good as the alternatives, so no change there.

**Risk/reward spectrum found:** correlation between measured risk and designed reward was **+0.40** — riskier cards do generally pay out more, which is the right direction. But **22 of 30 cards came out "dominated"** (a same-or-lower-risk card with strictly higher reward exists) — mostly because most topic cards cluster at high risk (0.86-0.90, since winning any given round depends heavily on what everyone else committed, not just the card itself) while differing a lot in reward weight. This is a real finding for a future pass: either Remove's reward weight is too low relative to its actual risk, or the topic-card tier needs more differentiation so equally-risky cards aren't so unevenly rewarded. Flagging rather than fixing now, since Sean's ask this round was to build the *measurement*, and it's now in place to guide the next tuning pass.

**8P is still the weakest player count** — 44% of 8P matches hit the round safety cap (matches the prior pass), and it's now failing "shared-agenda-failed" as the top criterion rather than card dominance. This still looks like the same root cause flagged before: 8P's personal decks are thin (3 cards, since 30 cards / 8 players), and that hasn't changed this pass.

## 6. Rejected status: Approve/Block → Approve/Reject (2026-07-13)

Sean's fix for the Approve/Block imbalance below: instead of Block winning by default from inaction (nothing to actively achieve, just prevent), every Topic can now reach a new terminal status, **Rejected** — mechanically Approved's mirror image (Resolve = Sustain +2, costly to undo, same rules), but the opposite outcome. Hidden Agendas are now always **Approve Topic X** vs. **Reject Topic X** — two equally active goals that both require landing and holding a contested Rewrite, not one active goal vs. one passive non-outcome.

Added a 6th template, **"Let's Revisit Next Quarter"** (Rewrite → Rejected, Atk 2/Sus 4/Dec 1) alongside the existing 5, giving Reject-stance players a card to actively pursue their agenda with (previously Block-stance players had no card that helped them directly — only Remove cards, which mostly just delay). This also answers Sean's question directly: **the old "get credit for a topic" agenda type was removed in the previous redesign pass** (section 4 above), when the 4-type pool was consolidated into the single adversarial pair — it hasn't come back.

The Shared Agenda condition is unchanged: **any 2 Topics reaching Approved** (Rejected doesn't count toward it). This was a deliberate choice to keep the win condition simple, but see the balance finding below — it does create a residual asymmetry.

Also fixed a real bug this surfaced: `ShootDown`'s Decay moved 1→2 in `shared/cards.ts` (to avoid a stat-triple collision with `TableIt`, both previously (2,3,1) — see section 7), but the D1 `card_definitions` table still had `{Topic}-ShootDown` rows pinned at decay=1 from the very first migration. Without a fix those stale overrides would have silently reintroduced the exact collision the code change was meant to remove. Fixed in `migrations/0007_reject_status_and_vote.sql`.

## 7. No two cards share a stat triple

Sean: no two cards should ever have the same (Attack, Sustain, Decay), to cut down on ties and repetitive outcomes. With the 6th template added, all 6 now have unique triples: Quick Note (1,1,0), Push Back (2,2,1), Let's Table That (2,3,1), Per My Last Email→Approved (2,4,2), Let's Revisit Next Quarter→Rejected (2,4,1), Take This Offline/Remove (2,3,2). (Universal cards New Business (2,1,1) and Overtime (3,0,1) are also distinct from all of these and each other.)

Ironically, this doesn't eliminate ties overall — it can't, since ties are about **effective Attack** (post-Decay), not the full stat triple, and plenty of cards share the same Attack value by design (most topic cards are Atk 2). That's exactly why tie-breaking-by-vote (next section) exists as a separate fix for a separate problem.

## 8. Ties: settled by table vote, not automatic Chair priority

Previously, any tie for top effective Attack resolved instantly in favor of whoever sat closest to the rotating Chair — a fixed rule with no player agency. Now: when 2+ plays tie for the top effective Attack, **everyone whose own card isn't part of the tie votes** on which tied play wins the floor. Only if there's nobody left to vote (everyone at the table is part of the tie) or **the vote itself ties** does it fall back to Chair-proximity.

This is a genuinely new interaction layer — it turns a mechanical tiebreak into a moment of table politics (voters have their own Hidden Agendas and can reason about which outcome helps or hurts them, even though they don't know anyone else's exact agenda). Bots vote using a simplified version of the same Hidden-Agenda-relevant scoring used for card choice, evaluated from the voter's own perspective rather than the card-owner's.

Implementation-wise this required splitting round resolution into three states: normal instant resolution (no tie), a **paused** state where `GameState.pendingVote` holds the tied candidates/voters/votes and no round-advance/end-check logic runs, and completion (via `castVote`) once every voter has cast a ballot, which then runs the same resolution path either way. Confirmed working end-to-end in a live production smoke test (see Results below).

## 9. Side effect pool revision

Sean: cut Peek (gives information with no clear follow-up play — "I'm not sure I understand what we can do with that information"), and Rebate (refunds Duration outside of Overtime, undermining the "meeting should feel time-sensitive" rule). Renamed "Neighbor Tax" → **Distract**. Added two more player-targeting effects per Sean's suggestion that side effects should reach beyond the acting player:

| Side Effect | What it does |
|---|---|
| Bonus Draw | Draw 1 extra card (unchanged) |
| Undermine | Drop a different topic's Resolve by 1 (unchanged) |
| Deflect | Halve this play's own Decay cost (unchanged) |
| **Distract** | The player in the next seat gets +1 Decay |
| **Crown's Burden** | Whoever holds the Chair gets +1 Decay (regardless of who played the card) |
| **Undercut** | The next card *anywhere* to win a round gets -1 Sustain when it resolves (reduces both its Duration cost and its Resolve-check power that round) |

Still 6 effects total (was 5), rotated the same Latin-square way across the now-6 templates so every template × topic combination still gets a distinct effect.

## Results (2026-07-13, 600 games/config, sections 6-9 above)

Re-ran simulations specifically to check whether Approve and Reject now have equal win rates (Sean's direct ask):

| Player count | Approve win rate | Reject win rate | Gap |
|---|---|---|---|
| 2P | 21.3% | 21.2% | ~0 (essentially perfect) |
| 4P | 28.9% | 20.3% | 8.6pp |
| 5P | 30.2% | 24.3% | 5.9pp |
| 8P | 23.0% | 19.2% | 3.8pp |

Massive improvement over the old Approve/Block system (previously 22-37% vs. 68-94% — a 40-70 point gap). 2P is now essentially perfectly balanced. There's a modest residual gap at 4P+ favoring Approve, and it looks structural rather than a tuning miss: **the Shared Agenda only counts Approved topics**, so at higher player counts (more decisions, more chances for the table's collective self-interest to matter) there's a mild extra push toward Approved that Rejected doesn't get — bots pursuing the Shared Agenda incidentally help every Approve-agenda but never help a Reject-agenda. Flagging this rather than patching it now (e.g. bot-heuristic special-casing would mask the asymmetry rather than fix it); a real fix would be a Shared Agenda change (e.g. counting 2 locked-in statuses of either kind), which is a bigger design call than this pass's scope.

No regressions found in the other happy-path criteria; the tie-vote mechanic ran correctly across hundreds of simulated matches (including bot-only auto-voting) with no stalls. **8P remains the weakest player count** (54% hit the safety cap, "Can I Just Add One More Thing" dominant in 54% of 8P matches) — this looks like the same pre-existing 8P scaling issue from prior passes, not something introduced this round, and is being flagged rather than fixed here since it needs its own dedicated balance pass.

## 10. Hidden Agenda → 2x2 Agenda Card (2026-07-13)

Sean's fix for "every player barrels toward a single goal": each player's private Hidden Agenda is now a 2x2 card of 4 cells over 4 distinct Topics (out of 5) — 2 want Approved, 2 want Rejected, leaving exactly 1 Topic with no personal stake. A player achieves their agenda if **any 2 of the 4 cells** land by game end (`AGENDA_SUCCESS_THRESHOLD`), independent of the table's Shared Agenda (both are tracked and reported separately, same relationship as before).

Assignment (`assignAgendaCards`, replaces `assignHiddenAgendas`): each player's 1 excluded Topic is cycled through a shuffled Topic order so exclusions spread evenly across players. For the remaining 4, a running per-Topic Approve-minus-Reject tally (across all players assigned so far) decides the split — this player's most Approve-heavy-so-far Topics get their Reject cells, pulling the table-wide count back toward 0. Verified live: with 4 players, exclusions landed on 4 different Topics (the 5th Topic appeared on every card), and per-Topic Approve/Reject counts came out within 1 of each other across the table.

Bot heuristics (`scoreCard`, `scoreDraftPick`, `scoreCandidateForVoter`, `pickTopicForNewBusiness`) generalized from "is this the one agenda Topic" to "does any of my 4 cells match this card's Topic" — same branches, just checked against `find()` over 4 cells instead of 1.

### Finding: "any 2 of 4" is *harder* to achieve than the old "1 of 1", not easier

Resimmed (600 games/config) expecting the mechanic to trivially raise personal-agenda success rates (more chances should mean an easier bar). It didn't — `no-agenda-achievers` (nobody at the table hits 2-of-4) got *worse* at every player count:

| | Old (1-of-1) "no achievers" | New (2-of-4) "no achievers" |
|---|---|---|
| 2P | 62.8% | 66.8% |
| 4P | 33.7% | 52.8% |
| 5P | 16.8% | 30.0% |
| 8P | 12.0% | 44.2% |

The math: per-cell Approve/Reject achieve-rate is still ~18-25% (roughly unchanged from the old per-agenda rate, since it's driven by the same Rewrite-and-hold-it mechanic). Needing 2 independent hits out of 4 low-probability (~20%) events is not an easier bar than needing 1 hit out of 1 — with p≈0.2, P(≥2 of 4) ≈ 18%, essentially the same as P(1 of 1) ≈ 20%. "More chances" only makes a threshold easier when the per-event odds are decent; at ~20% per cell, adding more cells mostly just adds more ways to *also* fail. Underlying game-flow stats (Shared Agenda rate, awkward-silence rate) are basically unchanged from the prior pass — this isn't a regression in how games play out, it's specifically about how hard the personal-agenda bar is to clear given those same game-flow numbers.

Not preemptively fixed — Sean's ask was implemented exactly as specified ("any two... they win"), and whether "personal agendas succeed less often than before" is actually a problem (versus an acceptable side effect of a stricter, more strategic bar) is his call, not a default to silently tune away. If it needs addressing, the levers are: lower `AGENDA_SUCCESS_THRESHOLD` isn't really available (2-of-4 is already the loosest non-trivial threshold), buff Rewrite/Remove success odds specifically for on-agenda plays, or accept that personal-agenda success is now rarer by design and let the Shared Agenda carry more of the "did this meeting go well" signal.

## 11. Agenda-achiever balance pass: hitting the ">=75% of matches" target (2026-07-14)

Sean's ask: at least one player should achieve their Agenda Card (2-of-4) in >=75% of matches. Baseline (Duration 30, Hand 5): 32-63% depending on player count -- well short everywhere.

**Root cause**, confirmed via sim instrumentation: games weren't resolving enough Topics to a terminal status (Approved/Rejected) before ending. 2P stalls hard via awkward silence (nobody has a legal card -- 26% of individual turns had zero legal options); 8P routinely blows past the round safety cap. Fewer terminal-status Topics means fewer chances for any player's 4 cells to land, regardless of how the cells are assigned.

**Levers tested** (see `worker/src/sim/run.ts`'s reusable `withNewBusinessStats`/`withNewBusinessCopies` helpers for the experiment harness): starting Duration, hand size, Pressure erosion speed, round safety cap, and New Business copies/stats. Hand size was the dominant lever by far -- a bigger hand directly cuts the "nothing legal to play" rate, which is the actual bottleneck. Lowering Pressure threshold and raising the round safety cap were both tested and **made things worse**, not better (extending already-struggling games doesn't help them resolve, it just prolongs them) -- both left untouched.

**Shipped**: Duration 30->50, Hand size 5->7, New Business Decay 1->2 (`shared/cards.ts` `DEFAULT_CONFIG`, `migrations/0008_agenda_achiever_balance.sql`). Validated at n=800/player-count:

| | 2P | 4P | 5P | 8P |
|---|---|---|---|---|
| Baseline | 32-38% | 44-48% | 63-69% | 50-60% |
| Shipped | **86.3%** | **74.6%** | **75.6%** | 64.5% |

2P/5P clear the target comfortably, 4P lands right at it (74.6%, within normal sim noise of 75%). **8P remains short** (64.5%) -- it's been the structurally weakest player count all project (fewer effective rounds of progress per player at large table sizes isn't something a numeric dial alone fixes) and is being flagged, not force-fixed, consistent with how 8P has been treated in every prior pass.

**Known regression, deliberately accepted**: bigger hands make New Business -- the always-legal wildcard -- win noticeably more often (dominant-card share ~46% -> ~65-73% of matches at 2P/4P, per the risk/reward and card-usage tables). Tried nerfing it directly first (fewer copies, weaker Attack) -- both backfired hard, since New Business's availability was precisely what was keeping games from stalling; removing that availability reintroduced the exact awkward-silence collapse this pass was fixing (achiever rate cratered back to 32-38% in those variants). The Decay 1->2 tweak (shipped) is a mild compromise -- discourages back-to-back spam without weakening its per-play reliability -- but does not fully resolve the dominance increase.

Sean's call on this trade-off: ship the achiever-rate fix now, treat New Business's elevated dominance as its own dedicated follow-up (a real rate-limiting mechanic -- e.g. a cooldown after playing it, or once-per-N-rounds -- rather than another numeric tweak) rather than solving it today. Flagged as a follow-up task, not scheduled for this pass.

## 12. Generalized card requirements: one interconnected web instead of five tracks (2026-07-14)

Sean's ask, following directly from CARD_GRAPH_ANALYSIS.md's finding that New Business dominates because it's the only unconditionally-legal card: replace the fixed verb/template system (Add/Rewrite/Remove, each gated only by its own Topic's touched-ness) with a fully generalized schema. **Only New Business is ever unconditionally legal now.** Every other card -- including raising a Topic at all -- carries exactly one requirement, drawn from a flexible menu, and it's very often about a *different* Topic's Status or about the Chair:

```ts
type CardRequirement =
  | { kind: "targetStatus"; status: TopicStateValue }
  | { kind: "otherTopicStatus"; topic: Topic; status: TopicStateValue }
  | { kind: "countThreshold"; status: TopicStateValue; atLeast: number }
  | { kind: "isChairHolder" }
  | { kind: "chairDistanceLessThan"; distance: number }
  | { kind: "hasUndoTarget" }
  | { kind: "anyTopicUntouched" }; // New Business's own case

type CardMainEffect =
  | { kind: "setStatus"; status: TopicStateValue }  // generalizes Rewrite AND Remove (status "Untouched" clears the Topic)
  | { kind: "raiseTopic" }                          // generalizes Add
  | { kind: "undo" }                                // wildcard: reverts the single most recent resolved play, anywhere
  | { kind: "extendDuration"; amount: number }
  | { kind: "reduceDuration"; amount: number };
```

**Bootstrap**: since nothing could ever be raised without something else already having a state, one Topic starts pre-Raised (Resolve 0) for free. Whoever holds the Chair *last* in the first round-robin (`seatOrder[numSeats-1]`) picks which one, in a new `topic-pick` phase between draft and the first commit round.

**Undo**: a small wildcard family (no Target Topic) that reverts whatever the single most recently resolved play did -- reopening a Topic that just got a new Status, or restoring Duration that just changed. Captured as a `PlaySnapshot` right before each resolution; consumed and cleared (not replaced) by Undo, so undo-of-undo isn't possible.

### Design/search process

Built an exact graph-search sandbox (`worker/src/sim/cardGraph.ts`, evolved from the prior pass's tool) modeling the full 6-value per-Topic Status space (2^5 boolean touched/untouched wasn't enough anymore -- now 6^5 = 7,776 exact combinations, still small enough to enumerate exhaustively rather than sample). A subtle modeling bug surfaced twice during this: naively testing "is B legal in some state after A" lets *unrelated* Topics manufacture spurious edges (A's play didn't cause B's precondition, it just happened to coincide) -- fixed by only varying the Topics A itself can influence when testing an edge, holding everything else at the neutral default.

Tested three Topic-linking arrangements for the new "raise" and "setStatus" requirements: **Neighbor** (every card listens to the same 1 neighboring Topic -- naive baseline), **Spread** (each of a Topic's 7 cards references a different other Topic, a count-threshold, or its own prior status), and **Spread+Chair** (2 of the 7 slots swapped for Chair-relative requirements). Fraction of edges touching New Business: Neighbor 91.5%, Spread 72.3%, **Spread+Chair 61.2%** -- confirming spreading dependencies across multiple different Topics (plus a couple of Chair-relative "political" gates) meaningfully reduces reliance on the one universal wildcard, and a single fixed neighbor is actually *worse* than the old design. Shipped Spread+Chair: 7 templates per Topic (2 raise, 4 setStatus, 1 remove-equivalent), mirrored identically across all 5 Topics (parameterized by which other Topic each references) for symmetry, plus a small Overtime-family (extend/reduce Duration, now Chair/count-gated instead of unconditional) and Undo-family (2 variants).

(One caveat found while re-verifying this note: an early version of the sandbox's `mainEffectPrecondition` had a bug that made New Business register as permanently illegal in the graph model -- `targetTopic !== null && ...` instead of `targetTopic === null || ...`. The SAME bug existed in the real `engine.ts` at one point during implementation and was caught before shipping. Fixed in both; re-ran the search after the fix -- absolute hub-edge-fraction numbers shifted up (New Business legitimately dominates more once it's actually functioning), but the *relative* ranking across the three arrangements was unchanged, so Spread+Chair still stood as the winner.)

### Balance tuning (real gameplay, not just graph topology)

The graph search validates topology, not play frequency -- a full balance resim (`worker/src/sim/run.ts`) after wiring the new schema into the real engine found genuinely broken results that no amount of graph analysis alone would have caught: Shared Agenda success near 0% at every player count, Approve win rate near 0% vs. Reject 20-65%, and one Overtime-family card (gated on ">=2 Topics Tabled") **completely dead** -- Tabled itself depended on Approved existing elsewhere, and Approved's own gate (">=2 Topics Disputed") was too strict, so the whole chain never bootstrapped.

Fixes, in order:
1. `SetApproved`'s count-threshold lowered 2->1, and `OvertimeExtend`'s impossible ">=2 Tabled" gate changed to ">=1 Disputed" -- unblocked the dead-card chain.
2. Still severely scarce at 2P specifically (94% of matches ending via awkward silence) -- raised `startingDuration` 50->65, `handSize` 7->9, `draftDeckSize` 10->14. The new interdependent-requirement design needs materially more legal-card headroom per turn than the old "always legal once touched" Rewrite/Remove clique did.
3. Approve/Reject imbalance persisted even after (1)-(2) -- traced to `SetApproved` and `SetRejected` using different-shaped requirements (count-threshold vs. Chair-distance) with different real-world frequency. Fixed by giving both the *same* requirement (`chairDistanceLessThan(2)`) -- guarantees symmetric difficulty by construction rather than by tuning two different mechanics to coincidentally match.

Final validated numbers (n=600/player-count): Shared Agenda 73.3% / 82.3% / 84.7% / 78.5% (2P/4P/5P/8P) -- a dramatic recovery from the near-0% broken state and comparable to or better than the prior card system. Approve/Reject: 32.1/26.4%, 36.2/30.1%, 35.9/31.3% -- much closer than before, a modest gap remains.

**Known remaining gaps, not chased further given scope**: the >=75% agenda-achiever target from the previous pass now regresses at 2P (down to ~55%, since games resolving the Shared Agenda faster means less time for personal Agenda cells to land -- a real tension between the two passes' goals, not a bug) and 5P/8P show elevated single-card-dominance/player-shut-out rates. Flagging for a future pass rather than over-fitting this already-large change further.

## 13. Cross-referencing the graph search against the real shipped deck (2026-07-14)

Section 12's graph search validated a *hand-modeled* candidate arrangement, then the real `shared/cards.ts` was written by hand to match it -- never mechanically checked against the actual graph tool. Sean asked to run both tools (the exact-graph analyzer and the gameplay balance sim) against the real shipped deck together and keep iterating until both read healthy, not just one.

Built `worker/src/sim/cardGraphFromDeck.ts` (`toGraphCards`), a pure relabeling of the real `CardDef[]` into the sandbox's `GraphCard[]` shape -- `CardDef` already carries `requirement`/`mainEffect`/`targetTopic` in the exact form the graph tool expects, so this is not a reinterpretation. Rewrote `worker/src/sim/cardGraphReport.ts` to run the analyzer against `DEFAULT_DECK` directly instead of the old synthetic Neighbor/Spread/Spread+Chair candidates (`cardGraphCandidates.ts` is left in place, just no longer imported, as a record of the design-search process).

**Baseline finding**: the real deck's hub-edge-fraction came back at 67.8% -- worse than section 12's chosen Spread+Chair candidate (61.2%). Root cause: section 12's own Approve/Reject balance fix (`SetApproved` and `SetRejected` sharing an identical Chair-based requirement, for gameplay-symmetry reasons) pushed 2 more cards into the sandbox's "always satisfiable" category, since `chairDistanceLessThan` is deliberately modeled as trivially-true for graph-topology purposes (it gates *who/when*, not *whether a state is reachable at all* -- see `cardGraph.ts`'s documented scope). A gameplay fix and a topology metric pulling in different directions on the same two cards.

**Failed experiment**: tried swapping `SetApproved`/`SetRejected` off the Chair-based requirement onto a shared `otherTopicStatus` reference instead, reasoning that a narrower, graph-visible-by-construction requirement would read better on both fronts while staying symmetric between the two cards. It backfired on *both*: hub-fraction got worse (67.8% -> 74.7%, not better) and gameplay balance broke (2P collapsed to 97.2% awkward-silence endings; Approve/Reject gap widened at 4P). The graph regression itself was a metric artifact worth flagging for future tuning passes: narrowing one card's own legality shrinks the *denominator* (total edges), which can inflate its measured hub-share even though nothing about New Business changed -- fraction-of-edges is sensitive to unrelated changes elsewhere in the deck, not a clean absolute measure. Reverted both cards back to the shared `chairDistanceLessThan(2)` requirement from section 12.

**What actually worked**: `OvertimeExtend` (from section 12's fix #1) was still gated on `countThreshold` (">=1 Disputed"), a requirement kind the sandbox also treats as trivially satisfiable once `relevantTopicsFor` expands to all 5 Topics -- and it isn't tied to the Approve/Reject symmetry mechanic, so it could be tuned in isolation without gameplay risk. Narrowed it to a fixed cross-topic reference, `{ kind: "otherTopicStatus", topic: "Operations", status: "Disputed" }`. This dropped hub-edge-fraction 67.8% -> 66.2% (OvertimeExtend fell out of the top-hub list entirely) *and*, on full resim, improved gameplay simultaneously: Shared Agenda 66.8/77.4/84.2/79.6% (2P/4P/5P/8P) and a tighter Approve/Reject gap (within ~1-5pp at every player count) versus the section-12 baseline.

No irreconcilable design block was hit this pass -- the one real tension found (Approve/Reject shared-requirement choice vs. hub-edge-fraction) was resolved by finding an *independent* lever (`OvertimeExtend`) rather than trading one metric for the other, so no primary/adversarial recommendation was needed. The pre-existing 2P agenda-achiever gap (~55%, below the older 75% target) and elevated 8P player-shut-out rate (65.2%) are unchanged from section 12 and still flagged as open follow-ups, not regressions introduced here.

Deployed via `wrangler deploy` (worker only -- `shared/cards.ts` has zero references under `client/src`, confirmed by grep, so no client rebuild; `requirement`/`mainEffect` are compile-time fields, not D1-overridable, so no new migration). Live smoke test: draft screen renders `OvertimeExtend`'s new requirement text correctly ("Only legal while Operations is currently Disputed"), topic-pick bootstrap and round 1 commit/resolution all functioned normally with no console errors.

## 14. New Business copy-count experiment, and removing the early Shared-Agenda end trigger (2026-07-14)

**New Business reliance check**: Sean asked what the odds were of cutting or removing New Business entirely, since it's the deck's one always-legal wildcard. Ran the sim at 4 (current)/2/1/0 copies (400 games/count, real deck). Result was unambiguous, not a close call: at 0 copies, 2P Shared Agenda success collapsed to 1.5% (98.3% of matches ending in `awkward-silence`, i.e. total deadlock), and even 8P spent 76.4% of turns with zero legal cards. The other two raise paths -- `RaiseChair` (needs the Chair *and* that specific Topic's card in hand) and `RaiseNeighbor` (needs a *different* Topic already Disputed, a chain that has to have started somewhere) -- both depend on draft luck or board state that may never materialize, so neither is a reliable fallback. New Business isn't a crutch that can be trimmed away; it's the only unconditional unstick mechanism the deck has. Left it at 4 copies; no code change made.

**Shared Agenda no longer ends the match early**: Sean's actual ask -- the match should always run until Duration is exhausted, even once 2+ Topics reach Approved. Previously `checkEndConditions` (`engine.ts`) called `endGame(state, "shared-agenda-complete")` the instant `checkSharedAgenda` saw >=2 Approved Topics, cutting games short. Removed that branch and the now-dead `checkSharedAgenda` function; removed the now-unreachable `"shared-agenda-complete"` literal from `EndSummary["reason"]` in `shared/types.ts`. `sharedAgendaSuccess` is still computed and reported at whatever point the match *does* end (duration-exhausted / awkward-silence / safety-cap) -- meaningful because Approved isn't sticky: `SetApproved`/`SetRejected` share the same Chair-gated requirement with no check on the Topic's current status, so a Topic can flip between Approved and Rejected more than once before the clock runs out.

Resim (n=600) confirmed the change and turned up a welcome side effect: `shared-agenda-complete` no longer appears as an end reason anywhere; 2P rounds went 9.3 -> 15.2 as matches now play out fully. More playtime per match gave personal Agenda cells more chances to land -- **2P's >=1-achiever rate jumped 54.5% -> 77.8%**, clearing the >=75% target that's been an open gap since section 12/13. 4P/5P/8P sit at 98.2/99.7/99.2%. No new softlocks (safety-cap rate unchanged at 5P/8P, ~2-3%).

Deployed worker-only (no client source touched; the `shared/types.ts` union change is compile-time-only, doesn't affect the built client bundle).

## 15. Bug fix: `decayPenalty` was a permanent accumulator, not a one-play debuff (2026-07-14)

Sean spotted every player's lobby pill sitting at -3 to -5 Attack simultaneously mid-match and asked why -- suspected effects were stacking when they should only apply for one turn. They were: `player.decayPenalty` (`engine.ts`) is fed by three sources -- the winning card's own `decay` stat (every round, on the winner), `Distract`/`Crown's Burden` side effects (+1 to a target), and an undo-lock-in penalty -- but was only ever incremented, never reset anywhere. `effectiveAttack = card.attack - player.decayPenalty` read it fresh every round, so it silently compounded for the rest of the match. Section 14's fix (removing the early Shared-Agenda end trigger, 2P rounds 9.3->15.2) made this much more visible by giving it far more rounds to snowball in.

The intended behavior (confirmed by the existing `Undercut`/`pendingSustainDebuff` pattern elsewhere in the same file, which *does* consume-and-clear correctly) is a one-play debuff: whatever `decayPenalty` a player is carrying applies to their next commit's effective Attack, then clears. Fix: in `resolveRound`'s per-player loop, immediately after `effectiveAttack` reads `player.decayPenalty` for that round, reset it to 0 (`engine.ts`, right after the `effAttack` computation).

Resim (n=600) after the fix: numbers held steady or improved slightly (safety-cap rate actually dropped 2-2.7% -> 0.2-0.7%, suggesting the runaway accumulation was also degrading late-game decision quality, not just cosmetic). Deployed worker-only.

## 16. Hidden Agenda winner: ranking instead of a fixed threshold (2026-07-14)

Sean's ask: "Winner should just be whoever completed the most of their hidden agenda, instead of having a win threshold." Previously `agendaSuccess` (`engine.ts` `endGame`) was `agendaAchievedCount >= AGENDA_SUCCESS_THRESHOLD` (2 of 4 cells, independently per player -- section 10's original design). Asked Sean how ties should resolve since agenda achievement was tracked independently per player, not competitively; answer was a shared win (all players tied for the max are winners together, no secondary tiebreaker).

Changed `endGame` to compute `maxAchieved` across all players first, then set `agendaSuccess: agendaAchievedCount === maxAchieved` -- a ranking, ties share the win. Removed the now-dead `AGENDA_SUCCESS_THRESHOLD` constant (`shared/types.ts`) and its import in `engine.ts`; nothing else referenced it. Updated the end-screen per-player label from "Achieved"/"Did not achieve" to "Winner"/"Runner-up" (`client/src/main.ts`) to match.

**Known consequence for the sim harness, not chased further this pass**: `run.ts`'s ">=1 player achieves their Agenda Card (target: >=75%)" metric is now trivially 100% at every player count, always -- with a ranking there is by definition always at least one top scorer, so this can never fail anymore. The metric isn't broken, just no longer meaningful as a health signal; the "all-agenda-achievers" (everyone tied for the win) failure criterion is now the more interesting one, and it went up as expected (2P 21.5% -> 24.2%, since ties are much more likely at low player counts / few possible cell outcomes). A future pass should retire the >=1-achiever metric from the report rather than let it keep printing a meaningless 100%.

Deployed worker + rebuilt client (this one touches `client/src/main.ts`, unlike the last several passes).

## 17. Visual polish and "juice" for playtest readiness (2026-07-14)

Sean's ask: prepare the client for an external playtest -- add a graphics/animation library, redesign the cards for readability, and add feedback signifiers (value-change impact, tweening to carry focus through the action). Recommended CSS/DOM animation over a canvas renderer (crisp text for free, much smaller lift for a card game that lives or dies on readable text) -- confirmed, went with GSAP as a lightweight tweening layer over the existing vanilla-DOM/`innerHTML` renderer rather than rewriting the render architecture.

**Constraint that shaped everything**: `main.ts`'s render loop fully replaces `#app`'s `innerHTML` on every state change -- no persistent DOM nodes, no React-style diffing. Animations can't rely on a node surviving across renders; each one has to be a self-contained "play once on the node that just got inserted" effect, driven by values *we* diff in JS, not by the DOM's own before/after state.

Built `client/src/anim.ts`: five primitives (`tweenNumber`, `flash`, `staggerIn`, `popIn`, `glowPulse`), all GSAP-backed, all safe to call on a freshly-inserted node with no assumption of DOM continuity. Every later effect reuses these instead of one-off tweens.

**Card redesign** (`style.css` `.card` family): topic pill badge (colored background tint, not just a thin border), stat chips with icon+value in their own rounded backgrounds, a left accent bar in the topic's color, and a real legal/illegal visual split (`grayscale` filter + opacity for illegal/faded, versus a lift-on-hover + colored glow for legal/clickable) instead of the old opacity-only treatment that made "why can't I play this" ambiguous at a glance.

**Round-resolution sequencing** -- the highest-value piece, since this is the moment players watch every round: the server always broadcasts `reveal` before `state` (`MeetingRoom.ts`), so the client now snapshots `state.game` into `preRoundGameSnapshot` the instant `reveal` arrives, *before* the incoming `state` message can overwrite it with post-round values. While the reveal overlay is showing, `render()` deliberately draws the board from that frozen snapshot instead of the live (already-updated) `state.game`, so the board doesn't silently jump to new values underneath the overlay. `runEntryAnimations()` staggers each play into the reveal overlay and glow-pulses the winner. When the overlay's timer clears, one call to `animateBoardDiff(prev, curr)` tweens every number that changed (Duration, Fatigue, per-Topic Resolve/Pressure) from old to new, flashes the Floor label on change, and pops in any newly-appeared Decay-penalty badge (meaningful now that section 15 made `decayPenalty` a true one-play debuff -- a badge appearing is always new information, not stale carry-over).

Lighter versions of the same primitives cover the secondary screens: staggered card entrance in the draft pool and tie-break vote panel, staggered reveal of each player's Hidden Agenda on the end screen.

Verified live (not just resim, since this is pure client/visual work untestable by the sim harness): drafted a deck, confirmed the card redesign's legal/illegal contrast, played a round, confirmed the board froze correctly under the reveal overlay and the winner highlighted, confirmed Duration/Resolve tweened and a Decay badge popped in correctly on the next round's board, no console errors.

Deployed worker + rebuilt client. Added `gsap` as a client dependency (~50KB gzipped bundle growth, zero production vulnerabilities per `npm audit --omit=dev`).

## 18. Sticky Board: concept review, then the real card redesign (2026-07-14)

Section 17's card redesign (accent-bar-on-rounded-panel) landed but Sean's reaction was "doesn't look that different" -- correctly identified in hindsight as a generically-templated pattern rather than a real visual direction. Rather than keep iterating blind, built three genuinely distinct concept mockups as a static Artifact (not wired into the game) -- The Memo (redlined interoffice memo, rubber-stamped verdicts), Sticky Board (the Minutes as a physical sprint-retro board, topic = note color), and Live Feed (a phosphor status-board projection, ticker rows instead of trading cards) -- each rendering the same two real cards so they were a fair comparison.

Sean picked Sticky Board, then asked for the info broken up further so what you need reads at a glance instead of requiring you to read sentences. Iterated the artifact (same URL, redeployed in place) into a before/after comparison: the original mockup's two problems were (a) three unlabeled circled stat numbers requiring you to memorize Atk/Sus/Dec order, and (b) "can I play this" / "what does it do" / "will it actually land" all mashed into one prose sentence. Redesigned into four independently-scannable zones -- **condition** (green/red pass-fail chip, always showing the gate regardless of prose), **effect** (colored by resulting Status -- Rejected=brick red, Approved=green, Disputed=amber, Raise/Duration get their own colors -- scan the color before the words), **check** (Sustain-vs-Resolve, shown only when it's actually in question), **stats** (now labeled). Approved after one iteration.

### Implementation

`shared/cards.ts`'s baked-in `effectText` (one combined prose string) can't drive four separate chips, so the client now derives each zone from the card's own typed `requirement`/`mainEffect` fields instead of the precomposed sentence:
- `shortRequirementLabel` -- compact condition text ("Chair &le; 2 seats", "Timeline: Disputed"), independent of whether it's currently satisfied.
- `shortBlockedLabel` -- mirrors `illegalReason()`'s exact priority (Duration shortfall, then mainEffect precondition, then requirement) but in compact phrasing, used only when a hand card is actually blocked.
- `shortEffectLabel` -- compact effect text + a `status-*` class key (rejected/approved/disputed/tabled/untouched/raise/duration/undo) driving the effect chip's color.
- The existing full-sentence `describeRequirement`/`illegalReason` didn't become dead code -- they're now the chip's hover `title` for anyone who wants the full sentence.

Visual: cards are pastel sticky notes (`topicNoteColor()`, one hue family per `topicColor()`'s existing vivid accent so a card in hand still visually pairs with its board column), each with a small per-card-id rotation (`noteRotation()`, hashed from the card id so it's stable across re-renders, not jittering every frame), a pin dot, and a peeling-corner highlight. Illegal cards desaturate and get a diagonal strike across the note. Gave `.hand`/`.draft-cards`/`.vote-candidates` a corkboard-textured background so the notes read as pinned to a board rather than floating on the plain dark shell -- the only chrome change outside the card itself, deliberately scoped to just the three card-holding containers.

**Bug caught in live testing, not the mockup**: the resolve-check chip ("SUS 4 &ge; RES 2 &middot; succeeds") was showing on cards that were *also* blocked by their condition -- technically accurate (the two gates are independent) but reads as contradictory next to a struck-through, red-flagged card. Fixed by suppressing the check chip whenever the card is illegal; it's only meaningful once the card is actually playable. `renderCard()`'s `showCheck` now requires `opts.legal !== false`.

Verified live: full draft-to-hand flow, condition/effect chip colors correct across setStatus/raiseTopic/extendDuration/removed cards, illegal-card strike-through and blocked-reason chips correct, no console errors. Deployed worker + rebuilt client.

### Regression found and fixed: Side Effects had silently stopped rendering

Sean noticed Side Effects (BonusDraw/Undermine/Deflect/Distract/CrownsBurden/Undercut -- section 2/9) weren't on the new cards. They used to be (task list item 34: "show ... side effects"), but the section-12 full card-schema rewrite replaced the old verb-based `effectText` generation with the new requirement/mainEffect-based one and never re-added a side-effect line -- a real regression, not something reintroduced by this pass, just never noticed because every subsequent pass (including sections 17-18) was built on top of the already-broken baseline without a reason to look for it.

Fixed as a fifth card zone rather than restoring prose: `shortSideEffectLabel(id)` gives each of the 6 side effects compact chip text ("Draw a bonus card", "Chair holder: +1 Decay", etc.), rendered as a `card-side-effect` row (muted violet, visually distinct from the green/red condition and status-colored effect chips, signaling "this also always happens" rather than "this is the outcome") between the check row and the flavor text. Only shown when `card.sideEffect` is non-null (universal cards mostly don't carry one). Deployed worker + rebuilt client.

### Second regression found in the same review pass: wildcard raises showed "Raise null"

Sean also caught the vote-tie panel showing "→ Raise null" for New Business plays. Root cause: `New Business`'s `CardDef.targetTopic` is (correctly) `null` -- it's a wildcard, the player picks which Topic to raise at commit time via `Commit.targetTopic` (`engine.ts`), a separate field from the card definition. But the display-facing data never carried that per-play choice: `RevealPlay.topic` was populated from `card.targetTopic` (always null for New Business) instead of `commit.targetTopic`, and the engine's `PendingVoteCandidate` (used for the tie-vote panel) didn't carry the choice at all -- only `playerId`/`cardId`/`effAttack`/`seat`. The actual game logic was never wrong (round resolution already reads `commit.targetTopic` directly when applying the raise, `engine.ts` ~line 533) -- this was purely a display gap, in the same family as the Side Effect regression: the schema has the data, the view layer just wasn't threading it through.

Fixed by threading the chosen Topic through every layer that was missing it: `RevealPlay.topic` now falls back through `commit.targetTopic ?? card.targetTopic`; added `chosenTopic: Topic | null` to both the engine's internal `PendingVoteCandidate` (`engine.ts`) and the client-facing one (`shared/protocol.ts`), populated in `clientState.ts`'s `buildPendingVoteView`. Client's `renderCard()` gained a `topicOverride` option so the effect chip can show the actual chosen Topic instead of the card's own (null) one -- used by the vote panel (`chosenTopic`) and by the player's own hand once they've picked a Topic for a selected New Business card (`state.selectedTopic`). When no choice is known yet (draft pool, an unselected copy in hand), the raise effect chip now reads "&rarr; Raise (your choice)" instead of the literal "Raise null".

Resim (n=200) confirmed no behavior change (this is display-only; game logic untouched). Deployed worker + rebuilt client.

## 19. The Stamina economy: Attack becomes a player-managed resource (2026-07-14)

Sean's biggest structural pivot of the project: replace the fixed per-card Attack/Decay stats with a resource the player actively manages. Two small fixes got folded into the same pass rather than patched into the doomed old model first: (1) Decay was only ever applied to the round's *winner* -- talked-over players took none, which didn't match intent; (2) the Chair holder should get a free +1 Attack.

### Design

- **Stamina** -- a persistent per-player pool (`PlayerState.stamina`, `GameConfig.startingStamina`).
- **Attack** is no longer printed on a card -- it's chosen at commit time, `0 <= Attack <= current Stamina`.
- **Stamina Return** (`CardDef.staminaReturn`) is the one new printed number, replacing both the old Attack and Decay stats.
- Chair holder's effective Attack = `chosen Attack + 1`, free (not spent from Stamina).
- Resolution: only the round's *winner* has their Stamina touched, to `current - Attack + Return`. A talked-over play is a full, automatic refund (nothing was ever actually deducted) -- fixes (1) for free, since Return/no-change now applies uniformly regardless of who wins, rather than a separate always-on-winner-only Decay stat.
- This self-regulates without a separate regen mechanic (confirmed with Sean before implementing): since Return is always > 0 by design, the worst case -- bidding your entire pool and winning with the lowest-Return card -- still leaves you with that card's Return amount. Never zero from your own play.
- `Deflect` reframed: halves this play's own Stamina *cost* (`Math.floor(attackSpend / 2)`), not the Return -- you still fight at full committed Attack, it's just cheaper.
- `Distract`/`Crown's Burden` (previously "+1 Decay" to a target) now debit the target's Stamina pool directly, floored at 0 -- these come from *outside* the self-regulating loop above, so a target can be pushed to 0 by someone else's play. Accepted as a real, intentional cost of those side effects rather than over-engineered away; watching for it in future balance passes.
- Undoing a locked-in (Approved/Rejected) item still costs 1 extra Stamina on top of the normal Return-Attack delta, same spirit as the old extra-Decay rule.

### Implementation

Touched nearly every layer: `shared/types.ts` (`CardDef.attack`/`decay` -> `staminaReturn`; `GameConfig.startingStamina`; `RevealPlay` gained `staminaReturn`; `PlayerPublic.decayPenalty` -> `stamina`), `shared/cards.ts` (every template's Attack/Decay pair collapsed into one Return value -- roughly inverse to power, cheap utility raises return more than a locked-in Approve/Reject or a Remove), `shared/protocol.ts` (`commit` message gained `attackSpend`), `worker/src/engine.ts` (`Commit.attackSpend`; `effectiveAttack` now reads the commit + Chair bonus instead of `card.attack - decayPenalty`; `finishRoundResolution`'s Stamina delta; `applySideEffect`'s Distract/Crown's Burden), `worker/src/bot.ts` (`scoreCard` dropped its Attack baseline to become a pure "conviction" score; new `chooseAttackSpend(conviction, currentStamina)` maps conviction to a 10%-95% share of the bot's pool -- per Sean's steer: bid big when the play obviously advances the bot's own Hidden Agenda, small when it's a throwaway, since losing a bid is free but wasting a genuinely useful card isn't), `worker/src/clientState.ts`/`MeetingRoom.ts` (stamina in the client view; D1 load/save), and `client/src/main.ts`/`style.css` (card face now shows Sustain + Return instead of Atk/Sus/Dec; a new Attack-spend slider appears once a card is selected, defaulting to the player's full pool, with a live net-Stamina preview; player chips show a persistent Stamina badge instead of a conditional Decay badge; Help modal rewritten for the new mechanic).

D1: `card_definitions` recreated with `(sustain, stamina_return)` replacing `(attack, sustain, decay)` -- safe straight drop-and-recreate since the table was already empty (cleared in migration 0009 when card ids last changed); new `startingStamina` game_config key. See `migrations/0010_stamina_economy.sql`.

First-pass numeric choices, explicitly meant to be tuned via the balance sim like every other constant in this project (Sean's own framing): `startingStamina: 10`, and the bot's conviction-to-bid-share mapping. Resim (n=400) confirms the mechanic works end-to-end with no crashes or runaway degenerate behavior -- 2P's awkward-silence rate came in elevated (~62%) relative to the pre-Stamina baseline, flagged as the clearest target for a dedicated follow-up tuning pass rather than chased down in the same turn as the structural rewrite.

Verified live: card faces render Sustain/Return correctly, the Attack-spend slider defaults to full pool and live-updates its net-Stamina preview as dragged, Chair's +1 bonus and the "talked over = full refund" / "win = Return-minus-Attack" rules all confirmed correct via the round log and a clean reconnect (Sean 10 -> 9 after eating a Crown's Burden while chair-holding and being talked over; the winning bot dropping from 10 -> 1 after a big bid against a Return-1 card; the other talked-over bot unchanged at 10). No console errors.

**Still pending from this same request, deliberately sequenced after the Stamina rewrite landed** (each needs its own pass): reducing reliance on New Business via more creative requirement/effect permutations; a discard-and-draw option when passing; more suspense/clarity in the round-resolution reveal; and a visual map of each Topic's Raised/Disputed/Tabled/Approved/Rejected state transitions.

## 20. Four features in one pass: discard-swap, reveal suspense, state map, and the New Business diet (2026-07-14)

The four items deferred at the end of section 19, implemented together and then validated against BOTH tools (balance sim + exact graph traversal) per Sean's instruction.

### Discard-and-draw on pass

A pass can now carry a `discardId` (`Commit.discardId`, `commit` protocol message): trade one hand card for a fresh draw, free, no board effect. Client: a "Discard & draw" button on each hand card (hidden while a play is selected, `stopPropagation` so it doesn't fight the card's own click-to-select). Bots use it whenever they have zero legal cards, discarding whatever `scoreCard` rates worst.

**Two knock-on rules this forced, both caught by the sim rather than foresight:**
1. `scoreCard` crashed scoring ILLEGAL setStatus cards (the discard heuristic evaluates the whole hand; the old code assumed the target item existed, which only legality guaranteed). Now returns a low score when there's nothing to act on.
2. **Awkward-silence redefined**: a discard-swap is not silence. The all-passed early-end now requires that nobody swapped -- otherwise the swap mechanic could never actually rescue a stalled table (first sim run: swap-rounds still ended games instantly). And since swap-rounds then let stuck tables grind to the 40-round safety cap (second sim run: 2P safety-cap 23.8%), **a winnerless round now burns Duration equal to max(1, number of swaps)** -- time passes even when nothing happens. Third run: safety-cap back to 0-3.5%, awkward-silence 0% everywhere, 96.5-100% of games end by the clock.

### Reveal suspense + clarity

The round reveal now flips plays over one at a time, weakest Attack first, the winner LAST (0.22s stagger, display time scales with play count), then a color-coded outcome banner announces what actually happened: `RoundReveal.outcomeStatusClass` mirrors the card-effect-chip palette (Rejected=brick, Approved=green, Disputed=amber, raise/duration/undo their own colors, plus a distinct `status-bounced` amber-italic for failed attempts), driven by GSAP popIn after the last play lands.

### Topic state map

New "State map" button in the game header opens a modal showing every state transition as scannable from->to rows with colored status chips and the exact card that causes it (Untouched->Raised via the three raise paths; Raised->Disputed via Actually, Wait; any-active->Disputed via I Have Thoughts; any-active->Tabled/Approved/Rejected/Untouched via their cards), plus plain-language explainers for **Resolve (the shield)** and **Pressure (the cracks)** -- directly addressing "I'm not sure I understand Resolve, Pressure, Disputed, and Tabled."

### The New Business diet

New requirement kind `staminaAtLeast` (the acting player's pool >= N -- a player-state gate, the first requirement to lean on the section-19 Stamina economy). Two new templates per Topic (deck 43 -> 51 cards):
- **Light Agenda Today** (`RaiseSparse`): raise, gated on >=2 OTHER Topics Untouched -- legal precisely when the board is sparse, i.e. when stalls happen and New Business used to be the only way back in. No cross-Topic chain needed.
- **I Have Thoughts** (`SetDisputedBold`): set Disputed from any active state, gated on the player having >=7 Stamina -- a second, chain-free writer for Disputed, the hub status other requirements reference most (RaiseNeighbor, OvertimeExtend).

Then **New Business cut 4 -> 2 copies** -- the cut that section 14 proved catastrophic without replacements (2P Shared Agenda collapsed to 25.3% at NB=2 back then).

One more bot fix surfaced by the sim: "I Have Thoughts" reopening a LOCKED-IN topic is ruinous when the current outcome matches your own agenda and a rescue when it doesn't -- `scoreCard` now scores mid-state writes against locked-in items accordingly (-18 own-goal / +12 rescue / -4 no stake), instead of happily churning its own wins.

### Validation (both tools, as requested)

**Graph traversal** (real 51-card deck): New Business hub-edge-fraction **66.2% -> 37.2%** -- the single biggest structural improvement of the project; the RaiseSparse cards are now strong secondary hubs so connectivity no longer funnels through one wildcard. Write-counts stay perfectly symmetric across all 5 Topics (Raised 3 writers, Disputed 2, Tabled/Approved/Rejected 1 each; mean 1.60, up from 1.20).

**Balance sim** (n=400/player-count): NO 2P collapse this time (Shared Agenda 62.3% at NB=2, vs. 25.3% in section 14's unreplaced cut) -- the replacement paths work. Awkward-silence 0% everywhere; safety-cap 0/0/0.5/3.5%; Approve/Reject within ~3pp at every count; single-card dominance DOWN (max win share 13-16%, from 19-24%). Shared Agenda 62.3/64.5/61.8/59.5 (2P/4P/5P/8P) -- a few points below the NB=4 stamina baseline at 5P/8P (70.0/67.8), the accepted price of halving the dominant wildcard; flagged with the 0-legal-turn share (30-37%, partially offset by discard-swaps giving those turns an action the metric doesn't credit) as the targets for the next tuning pass.

No D1 migration (new cards are compile-time data; `card_definitions` empty; config unchanged). Verified live: new cards render with correct gate chips, state map opens/closes with all 7 transition rows, discard-swap removed a card and drew a replacement while the round resolved around it, reveal staggers weakest-first with a correctly color-coded `status-approved` banner. No console errors.

### Follow-up: discard-and-draw now costs 1 Stamina (2026-07-14)

Free swaps were still a soft trap: holding Stamina and cycling for a better card had no downside, which quietly pressured "always swap when unsure" over ever committing to a real play. `advanceRound` now debits `max(0, stamina - 1)` on every discard-swap, and the button/tooltip read "Discard & draw (-1 ⚡)". Resim (n=800/player-count) confirms no regression: agenda-achiever holds at 100% across 2P/4P/5P/8P, safety-cap stays low (0.0/0.0/1.5/4.6%, same range as the section-20 fix), Shared Agenda unchanged. Deployed (worker + client rebuild; no D1 migration needed).

## 21. Legality-balance metric (built, hypothesis tested and rejected) + Pass now rewards Stamina (2026-07-14)

**Per-game-state legality metric.** Added `computeStateLegalityBalance` to [cardGraph.ts](worker/src/sim/cardGraph.ts) -- exhaustively enumerates all 7,776 Topic-state combinations (6 values ^ 5 Topics) and reports what fraction of the 51-card deck is legal in each, plus a breakdown by how many Topics are still Untouched (a proxy for how far into the game a state is). Wired into `cardGraphReport.ts`. Baseline on the shipped deck: min 29.4%, max 45.1%, mean 39.5%, stdDev 1.64 -- already tight, and the low end is structural (turn 1, nothing exists yet for `setStatus` cards to act on) rather than a requirement-design flaw.

**Tested and rejected:** converting the single-neighbor `otherTopicStatus` checks (Someone Brought It Up, Let's Circle Back, Struck From the Record, Can I Just Add One More Thing) to `countThreshold`-style "any Topic in status X" checks, per the hypothesis that narrow single-Topic checks were driving imbalance. Measured result: stdDev got WORSE (1.64 -> 2.00-2.85 depending on threshold) -- loosening "which Topic" makes those cards trivially easy once the board fills up, inflating late-game legality without touching the low early-game floor. Reverted; shared/cards.ts requirement kinds are unchanged from section 20.

**Pass now rewards Stamina, growing with a streak.** `PlayerState.passStreak` (new field, resets to 0 on any card play or discard-swap) tracks consecutive plain Passes; `advanceRound` now does `passStreak += 1; stamina += passStreak` on a plain pass -- 1st consecutive Pass earns +1, 2nd earns +2, 3rd earns +3, and so on, so resting compounds the longer you do it uninterrupted. Exposed to the client as `YouView.passStreak`; the Pass button now reads "Pass (+N ⚡)" with a live preview of the next reward.

Bots: `chooseBotCommit` previously always discard-swapped (paying 1 Stamina) when it had zero legal cards. Now that plain-passing pays instead of costing, it only discard-swaps when the worst hand card is genuinely dead (score < -2) AND there's no streak already worth protecting (`passStreak === 0`) -- otherwise it keeps resting.

**Regression caught and fixed by the sim:** first resim showed 2P awkward-silence jumping from 0% to 17.1% -- the old "everyone passed with cards in hand = dead table, end instantly" check (section 20) treated a plain Pass as a sign of a stuck game, but Pass is now a deliberate, rewarded strategy (banking Stamina), not silence. Removed that instant-end branch entirely; a winnerless round now always just burns Duration and continues (same as a swap round), relying on Duration-exhaustion/safety-cap to end the game. Re-resim (n=800/player-count): awkward-silence back to 0% everywhere, safety-cap unchanged (0.0/0.0/0.9/6.5%), agenda-achiever 100% across the board, Shared Agenda stable to slightly up. Deployed (worker + client rebuild; no D1 migration -- no schema/config change). Verified live: streak preview and stamina both tracked correctly through two consecutive Passes (10 -> 11 -> 13 Stamina, "+1 ⚡" then "+2 ⚡").

## 22. Back to roots: no more Resolve/Pressure/bounce/side effects, fixed status cycle, Topic count scales with players (2026-07-14)

Sean's core critique: calling Resolve "load-bearing" while also "invisible" is a contradiction -- a mechanic that gates outcomes has to be legible at decision time. The game already had three real, visible tension sources (graph-legality gating, a limited hand, and the live Stamina bid); layering a fourth, hidden pass/fail roll on top (Sustain vs Resolve, only revealed after you'd already won the bid) added static, not depth. Comparison: Uno punishing a legal 7-on-7 play anyway. Decision: fold "can this succeed" entirely into "is this legal" -- winning the Attack bid means the card's effect just happens, full stop.

### The fixed status cycle

Sean specified the exact graph: `Untouched -> Raised -> {Approved, Rejected} -> Disputed -> {Tabled, Untouched}`, `Tabled -> {Approved, Rejected}`. 9 edges, one card per edge per Topic (45 topic cards total, `targetStatus`-gated on the edge's FROM state only -- no more cross-Topic/Chair/Stamina requirement web for topic cards, since the graph itself is now the whole legibility story). Disputed/Tabled keep real strategic weight without any hidden defense stat: they're now *mandatory waypoints* to reopen a locked-in Approved/Rejected result (a 3-round minimum swing: lock-in -> Disputed -> Tabled -> new lock-in, each step independently contestable).

**Cut entirely:** `statusResolveModifier`, `addPressure`, `applySideEffect`, `pendingSustainDebuff` (Undercut's leftover), the `effectiveSustain >= item.resolve` bounce check, `GameConfig.pressureThreshold` (still stored in D1 `game_config`/`DEFAULT_CONFIG`, now inert -- not worth a schema change for a dead knob). Sustain now does exactly what Sean said it should: costs Duration on a win, nothing else. `LineItem.resolve`/`.pressure` fields kept in the type (always 0) to minimize blast radius; a future pass can delete them outright.

### Validation caught a real regression, twice

First sim pass (deck rewritten, `handSize` still 9) collapsed hard: 2P hit 65.7% zero-legal-card turns and 20% safety-cap. Root cause: legality is now purely "my own Topic's current Status," and with only 5 Topics each in exactly one state, a 9-card hand had poor odds of holding the one matching card -- the old cross-Topic web had been doing real work keeping *something* legal even with a narrow hand. Wrong fixes tried first: doubling card copies (made it worse -- diluted a bigger deck against the same fixed hand), bumping `draftDeckSize` 14->25 (also worse -- a deeper personal deck behind a fixed hand size lowers per-turn concentration). Actual fix: `handSize` 9 -> 12 (sim-validated sweet spot; 14, tested, overcorrects into single-card dominance at 84% of matches since there's no hand-management tension left at all).

### Topic count now scales with player count

Follow-up question: does trimming Topics help, and does the right count depend on player count? Built a real sweep (`worker/src/sim/topicCountExperiment.ts`, n=600-2000/cell) across 2/3/4/5 Topics x 2/4/5/8 players. Findings: 2 Topics collapses everywhere (players collide constantly, single-card dominance spikes); 3-4 Topics beats the 5-Topic baseline at every count except 2P, which wants the full 5 (more players benefit from forced overlap, fewer players benefit from room to spread out). Not perfectly monotonic -- confirmed with n=2000 that 4P/5P do best at 3 Topics while 8P does best at 4 -- so `topicCountForPlayers`/`topicsForPlayers` (`shared/types.ts`) hardcode the sim-measured table (2P:5, 3P:4 interpolated, 4-6P:3, 7-8P:4 interpolated) rather than a smoothed guess.

Wired into `beginDraft` (`engine.ts`): `topics` now defaults to `topicsForPlayers(numPlayers)` and the function filters its own `deck` param down to just the active Topics (plus universal wildcards) before building the draft pool -- callers just pass the full deck, topic selection and deck-filtering can never drift apart. `GameState.topics` is the new source of truth, threaded through `assignAgendaCards` (generalized the old hardcoded "5 Topics, exclude 1, split 4 remaining 2/2" into `Math.floor(remaining.length / 2)`), the Shared Agenda threshold (`Math.max(1, Math.round(topics.length * 0.4))`, preserving the original 2-of-5 = 40% ratio instead of a hardcoded 2), and every `TOPICS`-direct reference in engine.ts/bot.ts. Full baseline resim with scaling live (n=1500/count): Shared Agenda success 67-74% across the board (up from 50-62% at fixed 5 Topics), safety-cap healthy (4.7-7.1%), agenda-achiever 100% everywhere.

### Deployment

`shared/protocol.ts`/`clientState.ts` gained `ClientGameState.topics`; `client/src/main.ts` replaced every hardcoded `TOPIC_ORDER` (5 Topics) reference with the live `g.topics`, stripped the Resolve/Pressure minutes-board rows, the SUS/RES bounce-check card chip, the side-effect card chip, the bounce-specific reveal styling, and rewrote the help modal + state-map modal to describe the actual fixed cycle instead of the old mechanic. `serialize.ts` gained `topics` in the persisted shape (with a fallback for any in-flight match saved before this change) and dropped `pendingSustainDebuff`. New migration `0011_status_cycle_rewrite.sql`: `card_definitions` needed no change (confirmed empty), but `game_config.handSize` had to be explicitly updated 9 -> 12 -- it was already overriding `DEFAULT_CONFIG.handSize` from a much earlier migration (0009), which would have silently shipped the broken pre-fix value in production despite the code default being correct. Verified live (2P game): all 5 Topics present as expected, no Resolve/Pressure/bounce text anywhere in the UI, hand size 12, Pass streak/Stamina economy tracking correctly (10 -> 11 -> 13 across two Passes), no console errors.

## 23. Cross-Topic web experiment (tested, rejected: snowball) (2026-07-15)

Sean's core critique from section 22 didn't ban cross-Topic requirements -- only the *hidden* Resolve/Pressure/bounce layer was the problem; a requirement like "2+ other Topics are Approved" is printed on the card and checked before commit, exactly as legible as "my own Topic is Raised." Follow-up question: can that interconnection come back without reopening the decision-space hole the fixed cycle just fixed?

**Schema fix needed first:** a naive `countThreshold`-only requirement on a reopen-style card (e.g. "any Topic with 2+ other Approved -> Approved") drops the own-Topic-status gate entirely, letting a card skip states the fixed cycle is supposed to enforce (Disputed jumping straight to Approved, bypassing the Tabled waypoint). `CardRequirement` only supported one requirement per card, so added `{ kind: "all"; of: CardRequirement[] }` (`shared/types.ts`) -- every sub-requirement must hold, letting a card combine "own Topic is Approved" with "2+ other Topics are Disputed" correctly. Threaded through `requirementHolds` (`engine.ts`, `cardGraph.ts`) and the client's three requirement-mirroring switches (`requirementHoldsForCard`, `describeRequirement`, `shortRequirementLabel` in `main.ts`) so nothing silently mis-renders if this comes back later. Kept in the schema even though the experiment below was rejected -- it's correct, reusable infrastructure.

**Design:** 4 new templates (`WEB_TEMPLATES`), each an ADDITIONAL way to make an existing edge (the base targetStatus-only card stays legal too, so this was meant to be additive): Consensus Building / Pattern Forms (Raised -> Approved/Rejected, gated on 2+ other Topics already sharing that outcome) and Momentum Shift x2 (Approved/Rejected -> Disputed, gated on 1+ other Topic already Disputed) -- all cheaper Sustain and better Stamina Return than their base counterparts, as the reward for tracking the whole board.

**First result: decision-space collapse, again.** Deck grew 51 -> 71 cards with `draftDeckSize`/`handSize` unchanged: 2P hit 95% zero-legal turns, 99.6% safety-cap. Root cause was the same lever as section 22's first regression but one level deeper -- what matters isn't total deck size, it's coverage *per Topic*: growing from 9 to 13 templates/Topic outpaces a proportionally-scaled `draftDeckSize` (tried 20, still only ~25% happy-path at 2P) because each player now owns a smaller fraction of that Topic's 13 possible transitions, not just a smaller fraction of the deck. Bumping `handSize` 12 -> 15 on top of `draftDeckSize` 20 recovered 2P/4P/5P close to (or above) baseline.

**Second, more interesting result: a snowball, even with decision-space fixed.** At that config, 8P happy-path dropped from 30.1% to 16.7% (n=1500) -- not a decision-space problem (0-legal share was normal), but `player-shut-out` hit 57.7% and Hidden Agenda win rate split 44.8% Approve / 10.9% Reject. Risk/reward table confirmed it: the web cards were the strongest in the entire deck (reward 5.0, lowest risk of any card). Mechanism: once 2 Topics tip Approved, Consensus Building goes legal-and-cheap on every OTHER Topic simultaneously, so Approve cascades faster than Reject-leaning players can respond -- compounded by the Shared Agenda already only counting Approved, giving bots extra incentive to chase the runaway. More players means more agendas on the losing side of that swing, hence the 8P-specific collapse.

**Verdict:** rejected as designed, but not a dead end -- the lesson is that "cheaper + better Return for tracking the board" is a genuine positive-feedback loop, and positive-feedback loops need an explicit brake (diminishing returns as the threshold is exceeded, a per-Topic cap, or reserving the web bonus for the reopen/Disputed side only, which isn't Shared-Agenda-favored the way Approve is) before they're safe to add. Reverted cleanly -- `shared/cards.ts` is back to the section 22 baseline (confirmed via resim: 51.7/67.6/55.5/29.5% happy-path, matching pre-experiment numbers exactly within noise). Nothing here was deployed.

## 24. Sean's revised graph (tested, rejected: friction and an over-loosening) + catch-up mechanic (tested, promising but exposes a structural ceiling) (2026-07-15)

### Sean's redrawn cycle

Sean sent a state diagram redefining the graph: same 7 same-Topic edges as section 22 minus the direct Tabled -> Approved/Rejected pair, plus a new same-Topic edge (Raised -> Tabled) and two cross-Topic edges (Disputed -> Tabled, Tabled -> Raised), each dashed on the diagram to mean "legal only when another Topic is already in that same source state."

**Strict reading** (own-Topic status AND the cross-Topic count, using the `all` requirement from section 23): resim showed a real regression at every player count (2P 51.7% -> 43.8%, 4P 67.6% -> 51.3%, 5P 55.5% -> 44.5%, 8P 29.5% -> 24.0%) despite HEALTHY decision space (2P actually improved: 2.35 legal cards/turn, only 17.9% zero-legal). The cause wasn't dilution this time -- `shared-agenda-failed` became the dominant failure everywhere. Removing the direct Tabled -> Approved/Rejected exit means a Tabled Topic needs two separate, independently-contestable rounds to resolve (Tabled -> Raised, then later Raised -> Approved/Rejected) instead of one, which measurably hurt Shared Agenda success. Worse, Tabled -> Raised requiring a SECOND simultaneously-Tabled Topic creates a genuine dead-end risk: a lone Tabled Topic has no legal exit at all until another Topic also lands there, unlike Disputed (which always has Wipe the Slate, no cross-Topic condition).

**Loose reading** (Sean's clarification: drop the own-Topic-status gate entirely, keep only the cross-Topic count): far worse, and got worse with MORE players (2P 43.4%, 4P 40.6%, 5P 36.3%, 8P 11.7%). Root cause: since `setStatus`'s only precondition is that the Topic exists (not what status it's in), dropping the own-status gate turned Table It / Dust It Off into *universal undo cards for any locked-in Approved/Rejected result* -- legal on an ALREADY-Approved or ALREADY-Rejected Topic as long as some OTHER Topic anywhere is Disputed/Tabled. With more players, something is nearly always Disputed or Tabled somewhere, so the trigger became close to permanently available late-game, gutting Shared Agenda success (8P: 27.7%, down from ~74% baseline).

Both readings reverted; `shared/cards.ts` restored to the section 22 nine-edge baseline before the next experiment.

### Research pass: applying feedback-loop theory

Before iterating further, did a literature pass on runaway-leader/catch-up-mechanic design theory (Settlers of Catan-style positive feedback loops, Power Grid-style catch-up pricing, Caylus-style action scarcity as a brake, avoiding strictly-dominant cards). Key reframe: **whether a positive feedback loop is good or bad depends on the win condition.** Monopoly's win condition wants escalation, so its positive loop is correct; our Shared Agenda win condition wants *stability* (a Topic staying Approved), so any mechanic that makes locked-in results progressively MORE vulnerable as a stance wins is directly hostile to the win condition -- exactly what section 23's and this section's first two experiments did. The actionable fix: invert the polarity. Make the cross-Topic bonus cheaper to attack the *leading* stance's wins, not to extend them -- genuine negative feedback, Power-Grid-style.

Also useful: a catch-up alternate can only matter on edges that AREN'T already unconditionally legal -- adding an alternate path to an edge with an existing always-legal base card (e.g. Raised -> Approved) can never unlock a play the base card didn't already allow, so it's pure redundancy. The reopen edges (Approved/Rejected -> Disputed) are the right target since they're the ones actually gated.

### "Rescue the Underdog": the catch-up-shaped web

Restored the section 22 nine-edge baseline (best known-good), then ADDED two new templates (not replacing anything): reopening an Approved item gets cheaper (Sustain 1 vs. the base Reopen the Approval's 2) and better-returning (3 vs. 2) specifically when Approve is ALREADY dominant (2+ other Topics also Approved) -- own-Topic-status gate preserved via `all`, so it can't skip states. Mirrored for Rejected. This is the *opposite* polarity from section 23's rejected cards: the more a stance wins, the more exposed its wins become, rather than the more a stance wins the cheaper it is to win more.

**Result: this actually worked, for the thing it was designed to fix.** Approve/Reject Hidden Agenda win rates came back symmetric at every player count (e.g. 2P 45.5%/46.4%, 4P 34.3%/33.7%, 5P 31.0%/31.8%) -- the runaway/asymmetry problem from both prior experiments is gone. Shared Agenda success is strong, matching or beating the original baseline (2P 74.9%, 4P 68.1%, 5P 66.1%, 8P 60.5%, vs. baseline's 67-74%). 2P and 4P happy-path came in at or above baseline (50.8%/57.6% vs. 51.7%/67.6% -- 2P essentially flat, 4P softer but still healthy).

**But 5P/8P got worse (44.7%/21.9% vs. baseline 55.5%/29.5%), and it's not fixable by the usual `draftDeckSize`/`handSize` levers.** Diagnosis: `draftDeckSize` is clamped to `floor(deckSize / numPlayers)`, and at high player counts that clamp is the actual binding constraint regardless of the config value -- bumping `draftDeckSize` to 17 did *nothing* for 5P (still clamped to 12) or 8P (still clamped to 7). This isn't new to this experiment: even the untouched section-22 baseline had 5P clamped to 10 cards and 8P clamped to 6 (with the original 51-card deck) -- 8P has been running on a 6-7 card personal deck the entire session, which is almost certainly *why* 8P has been the persistent weak point across every configuration tested (including the pre-existing, previously-flagged task #78). Growing total deck size to add ANY new template variety unavoidably costs high-player-count games more (in per-Topic coverage %) than it costs low-player-count games, because their personal decks are structurally smaller by construction (a disjoint shared draft pool divided by more players) -- no amount of card-content or pricing tuning fixes this; it needs a change to the draft mechanic itself (e.g. not requiring fully disjoint personal decks at high player counts, or scaling total deck size much more aggressively with player count than card-variety needs alone would justify).

**Status:** not yet reverted or deployed -- holding for a decision on whether to (a) ship "Rescue the Underdog" as a 2-5P improvement while treating 8P's personal-deck-size ceiling as a separate, pre-existing structural problem, or (b) address the draft-mechanic ceiling first since it's now clearly identified as the actual bottleneck behind 8P's persistent weakness all session, not just this experiment.

## 25. The two-axis transfer redesign (Sean's pitch): prototyped, iterated to golden standard for 3-6P (2026-07-15)

Sean's redirect after section 24's structural ceiling: the sims had drifted from the experience. The three feelings the game exists to deliver -- draft-room prep pressure, too-many-egos bidding chaos, outcome excitement/dread -- plus two new goals: cards as the expandable, joke-carrying heart of the game, and player motives that stay AMBIGUOUS (a draft pick or play shouldn't reveal your Hidden Agenda). Challenge should come from hidden opposition, never from restricted options. After four pitches, Sean pitched his own redesign, and it won:

### The pitch

4 Topics; Shared Agenda = 2+ Approved. Hidden Agenda = which 2 of the 4 should be Approved (implicitly rejecting the other 2) -- C(4,2) = 6 permutations, so up to 6 players, each dealt a DISTINCT permutation. Every Topic has two normalized axes starting at (0.5, 0.5): **Agreement** (X, 1.0 = Approved) and **Pressure** (Y, inversely scales Agreement changes: applied delta = nominal x (1 - pressure)). Every card is a **transfer**: take N from one Topic's X or Y, give N to another Topic's X or Y -- 12 ordered Topic pairs x 4 axis combos = 48 bespoke cards, one per permutation (the office-humor canvas). Legality = the cost must be payable. Draft/bid/Stamina/Chair/pass-streak carry over unchanged.

Why it fits the goals: the cost side of a transfer is itself a strategic act (draining Agreement from a Topic you secretly want rejected looks identical to "just paying a cost" -- ambiguity in the atom of the game), and a neat emergent: at 6P the full permutation deal means every player has exactly one perfect nemesis and partial overlap with everyone else.

### Prototype + iteration loop (research -> iterate -> simulate -> review, per Sean's directive)

Built standalone (`worker/src/sim/axisPrototype.ts`), no shipped-engine changes. Modeling choices flagged as tunable: friction applies to Agreement changes on both transfer ends; N is a scenario knob; "Approved" measured at thresholds 1.0/0.9/0.8 rather than assumed.

**Round 1 -- the base pitch as written:** nails four of five experiential goals (legal cards/turn 4-9 with ~0% dead hands; permutation win share a near-perfect 15-19% each; 15-24 tug-of-war direction flips per game; no dominant card) but **nothing ever resolves**: max Agreement averages 0.73-0.83, nothing reaches 1.0, and even a relaxed 0.8 threshold approves anything in only 2-16% of games. The "perfect fairness" is a stalemate artifact -- with 3 of 6 permutations pushing each Topic up and 3 down, everything converges to mush and 55-72% of games end with ALL players tied on cells. The transfer economy conserves total Agreement; symmetric opposition means it can never concentrate. Root insight (echoing section 24's research): the win condition needs games to CONCLUDE, so the design needs an irreversibility mechanism -- the Monopoly lesson, positive feedback in service of ending.

**Round 2 -- crystallization:** ratchet locks (Agreement >= 0.85 locks to 1.0 Approved permanently; <= 0.15 locks dead; locked Topics leave the card economy entirely) + escalation (N grows +5%/round -- the meeting gets blunter as it drags). Locks WORK (6P: Shared Agenda 70%, all-tie 2.8%, ~3 Topics crystallizing per game) but exposed endgame starvation: every card is a cross-Topic pair, so with < 2 unlocked Topics nothing is ever legal again -- games ground at the safety cap (63-99%) with 56-72% dead turns.

**Round 3 -- the meeting ends when there's nothing left to argue:** end the game when < 2 Topics remain unlocked, and each lock drains 5 Duration (a decision eats real meeting time). Safety cap collapsed to 2-16% at 4-6P; Shared Agenda 59-70%. Also tested and REJECTED at this stage: looser locks 0.8/0.2 (kills tug-of-war flips), stronger escalation +8% (shortens games without improving resolution), banning complementary agenda deals at 2P (no effect -- see below), and bot discard-swap (marginal; kept anyway for realism since the real game has it).

**Round 4 -- the clock always ticks:** +1 Duration drain every round on top of the winner's Sustain. This was the last piece: safety cap 0-2% at 3-6P (11.8% at 2P, down from 56%), games end naturally at 12-19 rounds, and Shared Agenda holds 41/57/66/68% at 3/4/5/6P **at the strict X=1.0 reading** -- the locks make Sean's original "1 is approved" definition real instead of unreachable.

### Final state vs. golden standard (n=600/cell, scenario: lock 0.85/0.15 + escalate 5%/round + endEarly + lockCost 5 + tick 1)

| | 2P | 3P | 4P | 5P | 6P |
|---|---|---|---|---|---|
| Shared Agenda (strict 1.0) | 25.5% | 41.0% | 56.8% | 65.5% | 68.3% |
| Safety-cap | 11.8% | 1.8% | 0.3% | 0.0% | 0.0% |
| All-players-tied | 50.3% | 25.2% | 9.0% | 3.2% | 1.8% |
| Legal cards/turn | 2.9 | 3.8 | 4.4 | 5.2 | 5.5 |
| Permutation win share | 16-18% | 16-18% | 15-18% | 15-19% | 14-18% |

**2P is structurally tie-prone and that's (mostly) not a bug:** with identical bots and one winning play per round, contested Topics can't resolve and shared Topics resolve symmetrically -- a tie is the Nash outcome of mirror-matched play. Verified by testing the "never deal perfectly complementary agendas" fix: no effect, because OVERLAPPING 2P deals also tie, just via symmetric hits instead of symmetric mush. Real 2P humans would differentiate via skill/bluffing where identical bots can't. The permutation structure makes this a 3-6P design by construction (Sean's pitch said as much), and 3-6P is where it hits golden standard.

**What the old happy-path metric can't see:** this prototype measures the experiential goals directly -- tug-of-war flips (contested outcomes), all-tie rate (do outcomes differentiate players), permutation fairness (no seat/agenda advantage), dead plays (0% everywhere). By those measures the transfer design beats the shipped status-cycle game decisively while ALSO fixing the two things no amount of tuning fixed there: motive ambiguity (built into every transfer) and the option-starvation problem (payability legality keeps 2.9-5.5 cards legal per turn vs. the shipped game's 0.8-1.9).

**Fictional layer for the new mechanics, to be workshopped:** locks = "the motion passes / the motion dies" (gavel moment); escalation = the meeting running long, people getting blunt; tick = the wall clock; the 48 transfer cards = the office-humor canvas (per axis combo: X->X "rob Peter to pay Paul" horse-trades, X->Y "throw under the bus", Y->X "spend political capital", Y->Y "deflect the heat").

**Status:** prototype only -- `worker/src/sim/axisPrototype.ts`; shipped game untouched (still section 22 baseline + section 24's un-reverted Rescue-the-Underdog experiment in shared/cards.ts, pending Sean's ship/revert decision, now likely moot if this redesign proceeds). Next step if greenlit: full implementation (engine/protocol/client/bots), the real 48-card office-humor naming pass, and live playtesting to validate that identical-bot 2P ties don't reproduce with humans.

## 26. Threshold decision: 0.7, no lock, original ruleset restored (2026-07-15)

Sean's redirect on section 25's auto-lock variant: locking felt wrong -- staying Approved should be Pressure's job, organically, not a hardcoded snap at a threshold. Reverted `axisPrototype.ts` to the ORIGINAL pitch exactly: no ratchet-lock, no forced early-end, no artificial per-round Duration tick. "Approved" is a live reading (Agreement >= threshold at whatever moment it's checked), and the approve threshold became the actual tunable to sweep. Also added, per request: every card still costs Duration (the transfer cards always did; unchanged), plus two new universal bonus-card families with zero axis interaction -- **Extend the Meeting** (+8 Duration) and a **Duration-cost-multiplier pair**, **Fast-Track It** (next winning play's Sustain x0.5) and **Bury It in Committee** (x2).

**Threshold sweep, n=800-2000/cell, original ruleset:**

| Threshold | 2P | 3P | 4P | 5P | 6P |
|---|---|---|---|---|---|
| 0.6 | 29.0% | 26.3% | 41.3% | 41.0% | 39.9% |
| 0.65 | 29.8% | 22.3% | 33.1% | 37.5% | 37.9% |
| **0.7** | **21.6%** | **13.3%** | **22.4%** | **21.8%** | **22.3%** |
| 0.75 | 13.0% | 7.3% | 9.8% | 10.9% | 9.1% |
| 0.8 | 5.5% | 3.5% | 4.1% | 5.1% | 3.9% |
| 0.9 | 4.3% | 1.4% | 1.8% | 0.6% | 1.0% |

(Shared Agenda success rate; all-tie rate is the inverse-ish concern and moves 26-44% at 0.7 vs. 41-73% at 0.75.)

**Key organic finding, no hardcoding involved:** max Agreement plateaus naturally around 0.78-0.80 regardless of threshold tested -- Pressure's friction alone creates a soft ceiling, exactly the "let Pressure do this more organically" ask. 0.75 sits right AT that ceiling's edge (hard, ~7-13% success); 0.7 sits solidly below it (real, ~13-22% success, with genuine all-tie risk still present as the actual difficulty). This is the honest tradeoff: reaching the ceiling is a skill expression current bots don't yet exploit well (deliberately suppressing a Topic's own Pressure via Y-axis transfers before pushing its Agreement) -- a human table would likely do better than these numbers suggest.

**Decision: 0.7, confirmed at n=2000/cell.** Stable and consistent with the n=800 sweep (2P 21.6%, 3P 13.3%, 4P 22.4%, 5P 21.8%, 6P 22.3%). Bonus cards behave sanely at low, non-dominant usage rates (Extend 0.1-1.4%, Fast-Track 0-1.5%, Bury 0-0.5%) across all configurations tested.

**Status:** prototype only, `worker/src/sim/axisPrototype.ts`. Shipped game still untouched. Next decision: greenlight full implementation (engine rewrite, protocol, client, bot heuristics upgraded to actually play the Pressure-suppression game, real 48-card office-humor naming pass), and if so, whether to build it alongside the current shipped game or replace it outright.

## 27. Full implementation: axis-transfer model replaces the status-cycle engine entirely (2026-07-15)

Sean greenlit full replacement: "Let's go ahead and build it. This will be replacing what we've built so far, but trying to harness a lot of the things that have worked well so far instead of starting from scratch." Ported section 25/26's validated prototype mechanics into the real production stack, keeping the draft/bidding/Stamina/Chair/pass-streak/discard-swap machinery untouched throughout.

**Schema (`shared/types.ts`):** `TOPICS` fixed at 4 (Budget, Timeline, Personnel, Strategy), `MAX_PLAYERS = 6` (matches the 6 distinct 2-of-4 Hidden Agenda permutations). `TopicState = { agreement, pressure, credit }`, both axes 0-1, starting at (0.5, 0.5). `CardEffect` is a 4-way discriminated union: `transfer` (costTopic/costAxis -> benefitTopic/benefitAxis, amount), `extendDuration`, `durationMultiplier` (applies to the next winning play's Sustain cost, consumed once), `undo` (reverts the single most recent transfer or Duration-clock change; not chainable, and a `durationMultiplier` play itself isn't revertible since it has no persistent state to restore).

**Cards (`shared/cards.ts`):** 4 transfer-family templates (Reallocate the Goodwill: Agreement->Agreement; Volunteer Someone Else: Agreement->Pressure; Cash In a Favor: Pressure->Agreement; Change the Subject: Pressure->Pressure) x all 12 ordered Topic pairs x 2 copies = 96 transfer cards, plus 6 bonus cards (Extend the Meeting x2, Fast-Track It, Bury It in Committee, Strike That From the Minutes, On Second Thought) = 102 total. Every card, transfer or bonus, still carries a Duration cost -- no exemptions.

**Engine (`worker/src/engine.ts`):** `isLegal` collapsed to two checks: `card.sustain <= state.duration`, and (for transfers only) whether the cost axis currently holds enough to pay after Pressure friction -- no separate requirement system at all. `beginDraft` deals one of the 6 Hidden Agenda permutations per seat and initializes all 4 Topics to (0.5, 0.5); `finalizeDraft` goes straight from draft to `commit` phase (no topic-pick bootstrap needed, since every Topic already has a valid starting state). `finishRoundResolution` branches on `CardEffect.kind`, captures a `PlaySnapshot` before any transfer/Duration-extend so `undo` can revert it, and threads a `pendingSustainMultiplier` through Fast-Track/Bury that's consumed by whichever card next wins a round, regardless of kind. `endGame` reads Approved live (`agreement >= config.approveThreshold`) rather than from any locked state.

**Bot (`worker/src/bot.ts`):** scores transfers by weighing both the cost side (draining an axis I want high is bad, draining one I want kept low is good) and the benefit side (raising Agreement toward my stance is good; raising Pressure is good only if it locks in a Topic that already matches my stance) against the bot's own Hidden Agenda cell for each of the two Topics touched. `undo` scored by comparing agenda-cell-achieved counts before vs. after the snapshot -- only worth it if reverting genuinely helps. First-pass heuristics, not yet tuned to exploit deliberate Pressure-suppression the way section 26 flagged a human table might.

**Protocol/client:** `ClientGameState.topics` sends the full `Record<Topic, TopicState>` (Agreement/Pressure bars with a threshold marker, replacing the old discrete-status board and the "Floor" concept entirely -- a transfer always touches two Topics, so there's no single "most recently touched" Topic to headline). Cards render their own `effectText`/`flavorText` directly instead of the client re-deriving requirement/effect text from a separate schema. Topic-pick screen, wildcard-topic card-target selection, and the state-map modal are all gone -- structurally unneeded now (every Topic always exists, every transfer's Topics are fixed on the card itself).

**Sim harness:** `worker/src/sim/simulate.ts`/`run.ts` rewritten against the real engine/bot instead of the standalone prototype; `cardGraph*.ts`, `topicCountExperiment.ts`, `happyPath.ts`, `riskReward.ts`, and `axisPrototype.ts` retired (built around now-nonexistent legality-web/bounce/status concepts).

**Validation, n=200/player-count, real engine + real bots (not yet re-tuned to prototype-level play):** Shared Agenda success 26.5% (2P) / 39.5% (3P) / 40.5% (4P) / 37.0% (5P) / 44.5% (6P) -- same ballpark as section 26's prototype sweep at 0.7. >=1 Agenda Card achiever rate 100% at every player count (target was >=75%). Decision space healthy: ~86-89% of turns have 2+ legal cards, no card is ever-illegal (dead). Full local browser smoke test (draft -> commit -> round resolution, transfer costs/benefits applied correctly, Chair rotation, credit tracking) passed, then repeated against the live production deploy after a remote D1 migration (0012_axis_transfer_rewrite.sql: clears stale `card_definitions` overrides, adds `approveThreshold`/`transferAmount` config keys, reverts `handSize`/`draftDeckSize` to the smaller axis-model defaults, drops the long-vestigial `pressureThreshold` knob).

**Status:** shipped. This replaces the entire section 22-24 status-cycle engine in production.

## 28. Post-launch UX/feedback pass (2026-07-15)

Sean's playtest feedback on the shipped axis-transfer game, addressed as a batch:

- **Point scale, not decimals:** Agreement/Pressure/threshold/transfer amounts now display as rounded 0-100 integers everywhere in the client (axis bars, effect symbols, tooltips) via a `pts()` helper. Purely presentational -- the engine still balances against the original 0-1 floats, nothing about `transferAmount`/`approveThreshold` changed internally.
- **Symbol-based card effects:** the paragraph effect sentence on each card is replaced with compact chips -- a colored 2-letter Topic badge (reusing the board's `topicColor()`), an axis icon (handshake for Agreement, scale for Pressure), and a signed point value, cost side an arrow benefit side. The full prose lives on as a title tooltip. This doubles as a fix for cards "all looking the same" -- the colored Topic chips make a card visually identifiable even when the family name (e.g. "Reallocate the Goodwill") repeats across all 12 Topic pairs; a full renaming pass was considered but not done this round.
- **Draft length:** `draftDeckSize` 50 -> 16, which (unlike the old value) binds uniformly at every supported player count instead of scaling with the table (floor(102/N) for N=2..6 is always >=17, so 16 always wins the clamp). Cuts the draft from 17-51 picks down to a flat 16.
- **Stamina economy inverted:** previously, a winning play netted Return-minus-spend and a talked-over play was a full refund (spend never left the pool). Now a bid is *always* spent, win or lose; only a *talked-over* play gets its card's Stamina Return credited back as a consolation (net = Return - spend, often a small loss or gain). A winning play keeps nothing (net = -spend). Implemented as a new `applyStaminaEconomy()` in engine.ts, applied uniformly to every committed (non-pass) play including illegal ones, in both `finishRoundResolution` and `resolveRound`'s no-legal-candidates branch.
- **Bid slider drag fix:** the slider's `input` handler was calling the full `render()` on every tick, which replaces the `<input>` DOM node mid-drag and effectively "lets go" of it in the browser. Now `input` patches just the spend number and preview text directly via targeted DOM writes (`attackSpendPreviewNumbers()` shared with the full-render path so they can't drift), and a full `render()` only runs on `change` (fires once, on release).
- **Reveal tween on topic bars:** `animateBoardDiff()` now tweens each touched Topic's `.axis-fill` width and its numeric label from the pre-round to post-round value (new `tweenWidth()` in anim.ts), instead of only flashing the column.

**Balance check found during this pass, and mitigated:** a resim (n=200/player-count) after the stamina-economy change showed 2P Shared-Agenda games hitting the round-40 safety cap 67% of the time (was 17.5%), with 0-legal-card turns up to ~45% (was ~4.8%); 3P milder but also worse; 4-6P roughly unchanged. Root cause: under the new economy, Extend the Meeting's 0 Sustain + 2 Stamina Return made it a *net stamina gain* at a low bid regardless of win/lose, so bots spammed it, and its wins replenished Duration faster than transfers burned it -- stalling games into the round cap instead of a natural ending. Confirmed via a live instrumented playtest that the underlying transfer math and stamina deltas were applying correctly; the imbalance was purely this one card's stats interacting with the new economy, not a rules bug.

**Fix:** Extend the Meeting's Sustain 0 -> 3 (`shared/cards.ts`), removing its "free" status -- it now costs real Duration to play regardless of outcome, the same as everything else. Resim after the fix: 3P/4P/5P/6P all now resolve naturally (safety-cap 0-3%, 0-legal 2.5-13%, actually *better* than the pre-batch baseline at 4-6P). 2P improved (safety-cap 67% -> 44%, still worse than the original 17.5%) but remains the project's persistent weak player count, consistent with every prior balance pass this session (see sections 25-26) -- the design is a 3-6 player game by construction (the Hidden Agenda's 6 permutations), so this is treated as an acceptable known limitation rather than something to keep chasing in simulation right now. No D1 migration needed -- `card_definitions` has no override row for Extend the Meeting, so the new baked-in default takes effect automatically.

## 29. Playtest-readiness: rules tightening + full product pass (2026-07-15)

Second playtest-feedback batch ("this felt very close to playable"), plus Sean's greenlight to get it ready to share with playtesters. Two halves.

**Rules/engine tightening:**
- **Bids:** a card can never be played for 0 Stamina -- minimum bid is 1, and at 0 Stamina you must Pass (`commitCard` rejects it; client fades the hand with an explainer; bots pass). The Chair's +1 is now *displayed everywhere as arithmetic*, not folded silently into a total: player chips show "👑 +1 to bids", the bid slider shows "counts as N+1", and the reveal spells out "10 + 👑1 = 11" -- fixing the "I swear that should have been a tie" confusion (it never was a tie; the Chair's bid was genuinely higher).
- **Pass:** flat +5 Stamina (`passReward`, D1-tunable, migration 0014), no consecutive-pass growth. Sim-swept 3/5/7 -- balance is insensitive across the range (3-6P all healthy, 2P unchanged-weak regardless), so 5 stands as specced.
- **Bots bid uniformly at random, 1..their full pool** (replacing conviction-scaled bidding) -- keeps humans guessing and leaks nothing about how much the bot values its card.
- **Scoring:** the winner is whoever completes the *most* of their 4 Hidden Agenda cells (ties share it) -- the old "any 2 of 4 wins it" copy is gone everywhere. And the Shared Agenda is a hard gate: fewer than 2 Topics Approved at the end means *nobody* wins, full stop (`endGame` now zeroes `agendaSuccess` when the shared goal fails; the end screen frames it as "The Meeting Failed").
- **Reveal revamp:** the round reveal now shows plays weakest-to-winner with avatar + explicit bid math, a tie-note banner when a tie actually occurred (vote-broken vs. Chair-proximity-broken, stated plainly), then the winner's **full card face rendered readable** next to per-axis before -> after point changes ("BU 🤝 50 ➔ 35 (-15)", with "now APPROVED"/"no longer Approved" flags when the threshold is crossed) -- the board's tweens were invisible behind the modal, so the modal now carries the information itself. Auto-dismiss lengthened and an explicit Continue button added, since the card is meant to be read. Engine side: `RoundReveal` carries `winningCard`/`winnerName`/`baseAttack+chairBonus`/`topicChanges`/`tieNote` (engine.ts computes them at resolution).
- **Draft:** "✨ Choose for me" button (server reuses the bot's agenda-fit draft scorer, which degrades to effectively-random via its jitter when nothing stands out) -- keeps the draft's strategy for those who want it without making 16 deliberate picks mandatory.
- **Robustness find:** GSAP tweens run on requestAnimationFrame, which browsers pause in hidden tabs -- a tween started there overwrites the just-rendered value with its FROM value and freezes, leaving stale numbers indefinitely. All anim.ts helpers now no-op (or snap to final state) when `document.hidden`.

**Product pass (research-grounded -- one primary CTA above the fold, show real gameplay components immediately, live activity as social proof, landing and game share one visual language):**
- **Welcome page:** hero ("This meeting could have been a *card game*."), one-line pitch, a 3-step how-it-works strip (draft / bid / motive ambiguity), then create/join forms below the fold.
- **Quick Start:** single name field + button -> creates a room, auto-adds 4 bots, auto-starts. Zero-friction solo session as the primary CTA.
- **Live tracker:** rooms heartbeat their connected-human count into a new `active_rooms` D1 table (`MeetingRoom.touchPresence`, best-effort, on join/close/start); `GET /api/stats` aggregates rows fresher than 10 minutes; the landing shows "N meetings in progress · M people pretending to work" with a pulsing live dot (or a friendly "the office is quiet" idle state). Client polls it every 30s while on the landing page only.
- **Avatars:** every player gets a unique silly-office-worker emoji (`AVATARS` pool in shared/types.ts, shuffled and dealt by seat at `beginDraft`), shown in player chips, the reveal, and the end screen.
- **Reskin:** full light theme -- Figma-adjacent palette (white surfaces on #f4f5f7, #0d99ff primary, brand-rainbow accents reserved for topics/status), rounded 8-14px radii, soft layered shadows, whiteboard-with-gridlines "desk" behind the sticky-note cards (cards themselves kept -- they're the most office thing in the game). Dead state-map CSS from the status-cycle era removed.
- **Guided journey:** a persistent phase banner on the game screen always answers "what's happening / what do I do": pick-and-bid prompt, locked-in-waiting-on-N, tie-vote-in-progress (with "you decide" when applicable), and out-of-Stamina ("Pass to recover +5").

Validated end-to-end in a live browser session (quick start -> auto-draft via Choose-for-me -> commit -> reveal with correct bid math and topic deltas -> stats endpoint), then deployed: migration 0014 to remote D1 + worker/client deploy. Transfer math and the new stamina economy re-verified against ground truth mid-test (winner pays full bid; talked-over nets Return minus bid; friction halves Agreement moves at Pressure 50).

**Follow-up (2026-07-15): discard-swap no longer consumes the turn.** It's now a standalone free action (`discardSwap` in engine.ts, its own `discard-swap` protocol message): swap one hand card for a fresh draw at 1 Stamina, once per round, only while still uncommitted -- then you still play a card or Pass that same round. `Commit` lost its piggybacked `discardId` entirely; `swappedThisRound` tracks usage per round (cleared in `advanceRound`, persisted with an empty-array fallback for in-flight matches). Bots no longer swap at all -- with the flat Pass reward, banking +5 when nothing's playable is fine, and it keeps a bot turn a single decision. Client hides the per-card swap button once used, when a card is selected, or at 0 Stamina. Live-verified: swap keeps hand size, costs exactly 1 Stamina, button disappears after one use, and committing a card afterward works in the same round.

## 30. Experiential bots + madlibs table talk (2026-07-16)

Sean's direction: bots should play "like what a human would think a human would play like" -- the experiential goals of the person actually playing come first -- plus a structured chat system, with bots using it.

**Experience-first bots (`worker/src/bot.ts`):** pure-random bidding replaced with bids that read as INTENT. `chooseAttackSpend` = conviction x late-game urgency, +0.3 share on threshold-crossing plays, then table-noise: 8% bluffs (huge bid on a nothing card, so big bids can't be blindly trusted), 8% sandbagging, otherwise ordinary wobble. `scoreCard` gained the dramatic beats a human actually reacts to: +/-10-12 for plays that would flip a Topic's Approved reading (via new `crossingImpact()`), a `lateGameUrgency()` multiplier (quadratic in elapsed Duration) so bots visibly go agenda-hunting as the clock runs down, and Extend the Meeting valued exactly when a human would want it (low clock AND unmet agenda cells). Bots also rest-to-bank: low Stamina + nothing exciting -> Pass and recover, like a person saving themselves for a play that matters. Resim: no balance regression (3-6P safety-cap 0-5%, natural endings; 2P Shared Agenda actually improved 20% -> 36%).

**Madlibs table talk (`shared/chat.ts`):** nobody types free text. Every message is a template with slots filled from fixed pools -- a Topic, another player's name, or a phrase list ("{Topic} is {a dumpster fire / non-negotiable / above my pay grade / ...}", "I saw that, {player}.", "Per my last card, {player}.", "Trust me on {Topic}.", 12 templates total, built for humor/taunting/light signaling). `validateAndRenderChat` is the single server-side gate: unknown template or out-of-pool slot value -> rejected, so free text is structurally impossible. New `chat` client/server protocol messages; MeetingRoom validates + broadcasts (ephemeral, not persisted). Client: floating chat drawer (toggle with unread badge, feed, builder: template dropdown -> per-slot dropdowns -> live preview -> Send), available in lobby and game; compose state survives the full-DOM re-renders.

**Bots talk (`chooseBotReactions`):** post-reveal reactions grounded in what each bot actually experienced, in the same template voice as humans: the winner gloats ("Per my last card, {loser}." or "Trust me on {topic}" -- usually its real Approve topic, sometimes deliberate misdirection), a talked-over bot complains about the winner, a Topic crossing the Approved threshold draws a stance-true reaction from a bot with skin in it ("non-negotiable" if it wanted it up, "Who keeps touching {topic}?" if it didn't -- 75% honest by design), and winnerless rounds get a weary "this meeting could have been an email." Capped at 2 messages per round.

Live-verified end-to-end: human message composed via the builder, validated, and broadcast with avatar; bot gloat appeared organically after a bot won a round. Deployed (no migration needed).

## 31. Every transfer card gets its own name and joke (2026-07-16)

Sean's ask: cards should each feel identifiable and unique -- own title, own joke, inspired by the effect -- while staying "uniform and coherent" as families. Literal duplicates (same card twice) can share identity; distinct effects can't.

Previously all 96 transfer cards came from 4 templates (one name + one joke function each), with the SAME title and joke structure just substituting Topic names in across all 12 ordered pairs -- exactly the flatness this feedback was about. `shared/cards.ts` now separates mechanics from content: `TRANSFER_TEMPLATES` keeps only the per-family stats (costAxis/benefitAxis/Sustain/Stamina Return), and a new `TRANSFER_CONTENT` table supplies one bespoke `{name, flavor}` per (template, ordered Topic pair) -- 48 entries, each a standalone joke grounded in that specific pair's mechanical direction (which Topic gets raided, which one benefits) and topic-flavored humor (Budget = spreadsheets/spend, Timeline = deadlines/sprints, Personnel = HR/headcount, Strategy = roadmaps/vision decks). The 2 identical copies of each of the 48 effects still share their one identity, as specified -- nothing else does. Bonus cards were already unique per effect (Extend the Meeting's 2 copies share a name for the same reason).

Result: 102 total cards, 53 distinct names/jokes (48 transfer + 5 bonus), verified programmatically (no name shared by more than the 2 legitimately-identical copies) and live in the draft screen. Pure content change -- mechanics, stats, and `describeEffect()`'s auto-generated effect text untouched, so no resim was needed (confirmed anyway: numbers matched the prior run). Deployed, no migration needed.
