# Happy Path — what a good meeting looks like

Defined from an interview with Sean (2026-07-13), before the second simulation pass. This is the target the simulator checks every simulated match against — see "Happy path conformance" in README.md for the numbers.

## The core complaint that triggered this

A real playthrough log showed one bot ("Standup Stan") win six straight rounds, all with New Business, including raising a topic, immediately striking it, and immediately re-raising it — locking every other player out entirely (`Talked over: ...` on every single round). Root cause: New Business (Attack 3, Decay 0, wild) never weakens the player who spams it, while every other card that wins accrues Decay and gets progressively worse at winning priority. It's a rich-get-richer loop, not just a "slightly too strong" card.

## Narrative sketch

A happy-path meeting runs about 8-12 real-world minutes. Different players win different rounds — nobody watches the same bot (or the same card) take the floor over and over. Over the course of the meeting, players Add, Rewrite, *and* Remove — the Minutes visibly evolve, topics get contested and sometimes bounce (a near-miss, not a dead end), and by the end the table has usually landed the Shared Agenda together. Along the way, at least one player (but not everyone) quietly got what they actually came for.

## Measurable criteria

A simulated match counts as "happy path" if **all** of the following hold:

1. **Shared Agenda succeeds.** Sean: "Shared Agenda should normally be reached... everyone loses if it isn't." This is the opposite of the GDD's original 12-21% "stretch goal" framing — intentional per this interview, tension should live in the Hidden Agendas, not in whether the table finishes at all.
2. **No single card wins more than 1/3 of all decided rounds.** "I don't think a single card should be played more than 33% of the time." Measured per functional identity: topic-locked cards (e.g. Budget-QuickNote) are counted separately from the same template on other topics, since they're mechanically distinct; the 4 New Business copies are counted as one card, since they're mechanically identical.
3. **No single player wins more than their fair share + 25 points.** Round wins should be "roughly equal" across players (ceiling = `1/numPlayers + 0.25`, e.g. 75% at 2P, 50% at 4P, 37.5% at 8P — a flat 50% ceiling turned out to be nearly unreachable at 2 players, where an odd round count makes even a "fair" 5-4 split exceed it).
4. **Every player wins at least one round.** Nobody gets shut out entirely — the simplest measurable proxy for "everyone gets at least one move that matters."
5. **At least 1 but not all players achieve their Hidden Agenda.** "At least one person should achieve their Hidden Agenda per match. There should never be a case where everyone does."

## Results (2026-07-13, 2000 games/config)

| | Before | After |
|---|---|---|
| 2P happy path | 0.7% | 4.0% |
| 4P happy path | 2.8% | 35.1% |
| 5P happy path | 1.0% | 37.4% |
| 8P happy path | 0.5% | 18.6% |
| New Business win-rate-when-chosen | ~53-54% | ~25% |

Fix: New Business Attack 3→2, Decay 0→1; Overtime kept Attack 3 (it needs to reliably win when the table actually needs Duration back) but also gained Decay 0→1, since it had the identical "never gets weaker no matter how often it wins" property that caused the New Business problem in the first place. Explored and rejected: cutting New Business's Attack to 1 or its copy count from 4 to 2/3 both reopened the original zero-legal-cards collapse from the first balance pass, especially at 2P — the fix that actually worked left supply (4 copies) and Attack "good enough to matter" alone, and attacked the *repeat-use-without-consequence* mechanic specifically.

Remaining known gaps, not solved in this pass:
- **2P conformance is still low (4%)** even after the fix. New Business (or whichever card is currently strongest) still dominates in ~60% of 2P matches specifically, because with only 2 players there's inherently little contention/diversity — this looks structural to low player counts, not a New Business problem specifically. The GDD's own Section 4 calls 2P an "intense mode" distinct from the main game, which this prototype doesn't implement separately; that's probably the real fix, not further card nerfs.
- **8P matches hit the round safety cap more often now (2.3%→28.6%)** even though they're much "happier" when they do resolve (0.5%→18.6%). Compressing Attack values closer together (nerfing the two wild cards) means more ties and slower resolution with 8P's already-thin 3-card personal decks. Net positive on the metric Sean defined as the priority, but worth watching in human playtesting — if 8P matches feel like they drag, this is why.

## Reported but not hard-gated (no precise target given yet, needs human playtesting to calibrate)

- **Match length in rounds** — Sean's target was minutes (8-12), not rounds, and there's no reliable rounds-to-minutes conversion without human playtesting. Reported for reference, not part of the pass/fail gate.
- **Entrenchment bounce rate** — should happen "sometimes" for tension, not never and not constantly. No specific number given.
- **Card-template usage spread** — QuickNote/PushBack/TableIt/SignOff/ShootDown should each see meaningful use across a match; not gated yet since "meaningful" wasn't quantified.
- **Draft coherence** (does a player's drafted deck visibly serve their Hidden Agenda) — Sean explicitly said this needs human playtesting to tune, not something to gate in a bot simulation.
