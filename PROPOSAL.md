# Design proposal — fifth pass (not yet implemented)

Written in response to playtesting feedback (2026-07-13): the card-variety fix didn't actually add variety (same 30 cards, just each one more complicated), Duration is being refunded when it shouldn't be, and there's a suspicion the two Hidden Agenda stances aren't equally winnable. Per Sean's instruction, this is a **design document only** — nothing here is implemented or deployed. It's meant to be reacted to, not shipped.

---

## 1. Hidden Agenda balance — confirmed broken, badly

Ran the simulator on the currently-shipped config specifically to check Approve vs. Block win rates. The gap is severe and consistent across every player count:

| Player count | Approve win rate | Block win rate |
|---|---|---|
| 2P | 22.2% | **94.3%** |
| 4P | 37.1% | **71.4%** |
| 5P | 36.9% | **68.3%** |
| 8P | 24.8% | **75.8%** |

Block is winning **2-3x more often than Approve** everywhere. The mechanical reason: **Approve requires a specific, contested positive outcome** (your exact Topic has to survive all the way to Approved, which needs someone to land a high-Sustain Rewrite and defend it) while **Block succeeds by default** — most Topics never reach Approved in a given match just from base rates (Shared Agenda only needs 2 of 5 Topics Approved to succeed at all), so a Block-holder often wins by doing nothing.

**Two ways to fix it, not mutually exclusive:**

- **Option A — require engagement.** Block only counts if the Topic was actually Raised at some point (can't win by a topic nobody ever touched) *and* never reached Approved. This closes the "free win from an untouched topic" loophole but keeps the mechanic otherwise the same. Smaller change, probably not enough on its own given the size of the gap above.
- **Option B — make Block an active task, symmetric to Approve.** Redefine Block success as "you personally got this Topic Removed/reset back below Disputed at least once after it reached Disputed or higher" — i.e., Block-holders have to *do something*, not just hope. This is a bigger mechanical change (adds a real job for Block-holders: watch your Topic and intervene) but is the only option that structurally matches Approve's difficulty, since both now require landing a specific play.

My recommendation is **B** — A alone likely doesn't close a gap this size (most topics that get touched still don't reach Approved), and B gives Block-holders something active to do with their draft/hand, which also serves the "find the fun" problem (a passive win condition isn't fun to hold).

---

## 2. Duration should only change via Overtime — confirmed, queued fix

Agreed without reservation. **Rebate** (the side effect that refunds 1 Duration on a normal card) directly undermines the point of a shared, ticking clock and will be removed from the side-effect pool. Queued as a definite fix for the next implementation pass, along with whatever comes out of the discussion below (need a replacement side effect to keep 5 templates × 5 side effects symmetric — see the palette revision below).

---

## 3. Why the side-effect pass didn't add variety

You're right: main+side effects gave every one of the existing 25 topic-card *slots* a bolt-on, but the slot count never changed (still 5 templates × 5 topics = 25, +5 universal = 30). "Permutation" only creates new variants if a main effect can pair with *more than one* side effect — right now the Latin square assigns exactly **one** side effect per (template, topic) cell, so nothing actually multiplied.

**To get real variety from permutation, each main-effect template needs 2-3 side-effect variants per Topic, not 1** — see the expanded list below.

## 4. Side-effect palette revision

Proposed pool (Rebate removed, Peek reconsidered, three new player-targeting effects added per your examples):

| Side effect | Effect | Notes |
|---|---|---|
| **Bonus Draw** | Draw 1 extra card now. | Kept as-is — safe, solo, always useful. |
| **Undermine** | Drop a *different* Topic's Resolve by 1. | Kept as-is. |
| **Deflect** | Halve this play's own Decay. | Kept as-is. |
| **Neighbor Tax** *(your idea)* | The player in the next seat gets +1 Decay. | New. Direct, low-complexity aggression — always know who's affected (seat order is public). |
| **Crown's Burden** *(your idea, reframed)* | Whoever currently holds the Chair gets +1 Decay. | You suggested +1 Atk for the Chair-holder instead — I'd lean toward a debuff here rather than a buff, since the Chair already has a tie-break advantage; stacking a second advantage on top of it risks a snowball (the same shape of problem New Business had). Flagging both readings — your call. |
| **Undercut** *(your idea)* | The next card anywhere at the table to win a round gets -1 Sustain when it resolves. | New. A delayed, table-wide trap rather than a targeted hit — rewards timing/reading the room. |
| ~~Rebate~~ | ~~Refund 1 Duration~~ | **Removed** per item 2. |
| **Peek** | Privately see one opponent's Hidden Agenda. | Under review — see below. |

**On Peek specifically:** you flagged it as maybe overpowered but also said you're not sure what to *do* with the information, which is the more important observation — right now, knowing an agenda tells you a Topic+stance, but there's no strong follow-up play (you can't directly interfere with someone else's agenda apart from the Topic actions everyone already has). Two options: **(a)** cut it in favor of another player-targeting effect like the three above, which at least DO something rather than just inform, or **(b)** keep it but make the payoff sharper — e.g., peeking also lets you immediately apply a small debuff to that specific player (fold it into Neighbor Tax's family: "Peek and Tax" — see their agenda AND give them +1 Decay). Leaning toward (a) for simplicity unless you want the combined version.

That's 6 solid candidates (Bonus Draw, Undermine, Deflect, Neighbor Tax, Crown's Burden, Undercut) if Peek is cut, or 7 if kept/merged. Either works with the expansion below.

## 5. Expanded card-variant list (proposal, not final numbers)

Give each main-effect template **2 side-effect variants per Topic** instead of 1, and vary stats slightly between variants so **no two cards ever share the same (Attack, Sustain, Decay) triple** (your idea — also directly helps with tie-breaking and makes every card recognizable by its numbers alone). Using Budget as the example (repeat the pattern for all 5 Topics):

| Card | Verb → Status | Atk | Sus | Dec | Side effect |
|---|---|---|---|---|---|
| Quick Note (Draw) | Add → Raised | 1 | 1 | 0 | Bonus Draw |
| Quick Note (Tax) | Add → Raised | 1 | 2 | 0 | Neighbor Tax |
| Push Back (Undermine) | Rewrite → Disputed | 2 | 2 | 1 | Undermine |
| Push Back (Crown) | Rewrite → Disputed | 2 | 3 | 1 | Crown's Burden |
| Let's Table That (Deflect) | Rewrite → Tabled | 2 | 3 | 1 | Deflect |
| Let's Table That (Undercut) | Rewrite → Tabled | 3 | 3 | 2 | Undercut |
| Per My Last Email (Draw) | Rewrite → Approved | 2 | 4 | 2 | Bonus Draw |
| Per My Last Email (Solo) | Rewrite → Approved | 3 | 5 | 2 | *(none — a clean, powerful, no-gimmick option)* |
| Take This Offline (Tax) | Remove | 2 | 3 | 1 | Neighbor Tax |
| Take This Offline (Undermine) | Remove | 1 | 4 | 1 | Undermine |

10 unique cards per Topic × 5 Topics = **50 topic cards**, + universals (New Business/Overtime, unchanged) = **~55 total**, up from 30. Every row has a distinct stat triple. This roughly doubles the pool — draft deck size (currently 10) and hand size (currently 5) would likely want re-tuning against a bigger pool, and this needs a fresh simulation pass once built, but it directly answers "compile a list of cards which provides more variants."

Open question for you: is ~55 cards / ~10 unique identities per Topic the right amount of variety, or should I scope it up/down before building it?

---

## 6. Ten ideas to improve the fun, prioritized

| # | Idea | Impact | Feasibility | Notes |
|---|---|---|---|---|
| 1 | Fix Hidden Agenda balance (section 1) | High | Medium | Structural fairness issue; Option B is a real mechanic, not just a number tweak. |
| 2 | Remove Rebate; Duration only moves via Overtime (section 2) | High | Trivial | One-line change, already agreed. |
| 3 | Expand card variety via main+side permutation (sections 4-5) | High | Medium | The core ask this round; needs a resim pass once built. |
| 4 | No-duplicate-stat-triple rule (section 5) | Medium | Low | Cheap to apply once the expanded list exists. |
| 5 | More player-targeting side effects, fewer pure-info ones | High | Medium | Directly addresses "Peek is OP but I don't know what to do with it" — targeting effects have an obvious use the instant you see them. |
| 6 | Visual/audio "juice" for side effects specifically | Medium-High | Medium | Client-only. Right now a side effect is just a log line; a Neighbor Tax landing on a specific opponent should *feel* like something happened to them, not read like a stat update. |
| 7 | Prominent Pressure feedback in the UI | Medium | Low | Talked-over cards already build Pressure; right now it's a small number on the board. A visible "crack" animation/indicator when Pressure builds would make "my card didn't win but still helped" land emotionally, not just numerically. |
| 8 | Topic-specific quirks (each Topic plays a little differently, not just reskinned) | High | High | Bigger idea: e.g. Personnel bounces cost extra Decay (people take it personally), Budget's Approved bonus is smaller (money's boring once it's settled). Real flavor-per-Topic, not just per-Status. Biggest lift of the list. |
| 9 | Lightweight bluffing/read-the-table layer (a way to react to what you see committed, even blind) | High | Low | This is the GDD's own core social-deduction promise (Section 3) and the prototype doesn't have it yet in any form. Probably the single highest-ceiling improvement, but also the biggest new mechanic — likely a project of its own, not a tuning pass. |
| 10 | Auto-generated post-match recap (GDD Section 16, "incident report" framing) | Medium | Medium | Out of scope earlier as "not core loop," but even a lightweight version (a few templated sentences off data the engine already has) could help retrospectively sell *why* a match was fun, which might matter more right now than any single mechanic while "the fun" is still being found moment-to-moment. |

Items 1-2 are ready to build whenever you say go. Items 3-5 are the direct answer to this message's card-variety ask and should probably move together. Items 6-10 are follow-ups roughly in the order I'd tackle them.
