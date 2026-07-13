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
