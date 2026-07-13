# Work Meeting (prototype)

A multiplayer social-deduction deckbuilder where players play conversation cards to Add, Rewrite, or Remove items on a shared meeting record ("the Minutes"). Based on the GDD (`Work-Meeting-GDD-v2-Final.md`), Sections 5-9 (the simulation-tuned core loop).

This prototype implements **the core loop only**: a deck-building draft, Minutes/Floor/turn structure, the deck, Duration/Entrenchment/Decay, Shared + Hidden Agenda win conditions, real-time multiplayer (2-8 players, humans and bots) over WebSockets. It intentionally leaves out audio, the Section 16 post-match "incident report" (a simple end screen stands in for it), and Section 10 meta-progression (Workday/Career).

New players get a "How to Play" walkthrough (auto-opens once, reachable any time from the `?`/"How to Play" button) and a dismissible in-hand hint for their first two rounds explaining legal-vs-illegal cards. Every card shows a plain-English effect line in addition to its flavor text, and Rewrite/Remove cards show the live target Entrenchment and whether the play would currently succeed or bounce.

## Deck-building draft

Every meeting opens with a draft, not a random deal. As soon as you start the meeting, everyone is told their Hidden Agenda, then the whole table takes turns (a snake draft — pick order reverses each round so nobody is stuck picking last every time) drafting cards one at a time into a personal deck from the shared, fully-visible pool. Once a card is taken, it's gone for everyone else — the scarcity that makes Entrenchment interesting is preserved, it's just allocated by choice instead of random deal. From then on you only ever draw from, and discard back into, the deck you built.

Deck size defaults to 10 cards per player, auto-clamped down at high player counts so the math never asks for more cards than exist (`min(config.draftDeckSize, floor(deckSize / playerCount))` — e.g. 8 players share a 30-card pool, so everyone drafts 3). Tunable in D1 `game_config`. Bots draft too, using a simple heuristic in [`worker/src/bot.ts`](worker/src/bot.ts) (`chooseBotDraftPick`) that favors raw power (Attack + Sustain), fit with their own Hidden Agenda, and a mild push toward Topic diversity so they don't draft themselves into a corner.

## Stack

- **Worker**: Cloudflare Worker + Durable Objects (one `MeetingRoom` DO per room code), TypeScript. Server-authoritative — clients never determine their own priority or resolve entrenchment math.
- **Client**: Vanilla TypeScript + Vite, plain HTML/CSS/DOM (no canvas renderer for this prototype).
- **Data**: Cloudflare D1, `card_definitions` table + `game_config` table — lets you tune Attack/Sustain/Decay or starting Duration/hand size from the D1 dashboard without a redeploy of game logic.
- Deployed as a single Worker with static assets (client build) + DO + D1 binding — one `wrangler deploy`.

## Bots

Add up to 8 (humans + bots combined) in the lobby with "Add Bot." Bots auto-commit every round the instant it's legal for them to, so a solo human never has to click anything on a bot's behalf — the room just resolves as soon as the human(s) commit. The bot in [`worker/src/bot.ts`](worker/src/bot.ts) is a simple heuristic, not adversarial search: it scores each legal card in hand by (a) whether it would push a Line Item to Approved (serves the Shared Agenda), (b) whether it serves the bot's own Hidden Agenda (chases Credit for `CreditOnApproved`/`CreditOnTwoPlusItems`, avoids Approving its own `TopicNeverApproved` topic, leans toward Removing items it doesn't hold Credit on for `ItemRemovedByOther`), with a small random jitter so bots vary run to run. It does not model or react to other players' hidden agendas — no bluffing or reading opponents.

## Match log (balance & troubleshooting)

Every match writes to two D1 tables (`migrations/0002_match_log.sql`):

- **`matches`** — one row per match: room code, player/bot count, start/end time, final round count, Shared Agenda success, end reason, and a `players_json` blob with each player's Hidden Agenda and whether they achieved it.
- **`match_events`** — one row per card played/passed/round-resolved: player, card, effective Attack, legal/illegal, won-the-floor or bounced, and the resulting log text.

Query it from the D1 dashboard (Cloudflare dashboard → Workers & Pages → D1 → `work-meeting-db`) or from the CLI, e.g.:

```
npx wrangler d1 execute work-meeting-db --remote --command "SELECT shared_agenda_success, COUNT(*) FROM matches GROUP BY shared_agenda_success"
npx wrangler d1 execute work-meeting-db --remote --command "SELECT card_name, COUNT(*) wins FROM match_events WHERE is_winner=1 AND success=1 GROUP BY card_name ORDER BY wins DESC"
```

## Simulation & balance findings

The GDD documents its own bot-driven simulation pass (Section 9); this prototype has the equivalent tool built in, at [`worker/src/sim/`](worker/src/sim/) — pure TypeScript reusing the exact same `engine.ts` and `bot.ts` real matches run on, so results always reflect actual game logic, not a reimplementation. Run it with:

```
npm run simulate                 # 800 games per player count per scenario
SIM_GAMES=2000 npm run simulate  # more games, tighter confidence
```

It plays out all-bot matches at 2P/4P/8P and reports round length, Shared Agenda success rate, end-reason breakdown, and — the metric that mattered most here — **the distribution of legal card counts per turn**, plus per-card legal/chosen/win rates so dead or dominant cards show up directly in the numbers.

**What the first pass found:** the original legality rule (a card must match a single global "Floor" by Topic or Status, Uno-style) left **44-58% of all turns with zero legal cards**, which collapsed 2P and 4P meetings via mass "awkward silence" passes within 3-4 rounds **86-96% of the time**. It also made Overtime ("Can I Just Add One More Thing") win **99% of the time it was played** — the only always-legal card, so it won by default whenever nothing else could act.

**What changed (validated over 2000 games/config):**

| | Before | After |
|---|---|---|
| 2P Shared Agenda success | 13.4% | **56.3%** |
| 4P Shared Agenda success | 29.7% | **81.5%** |
| 2P avg legal cards/turn | 0.79 | **1.60** |
| 4P avg legal cards/turn | 0.70 | **2.13** |
| Overtime win-rate-when-chosen | 98.9% | 74.6% |

The fixes, in order of impact:
1. **Rewrite/Remove no longer require matching the current Floor** — they're legal any time their own Topic has an existing Line Item, full stop. The Floor is now pure display (what was most recently touched), not a legality gate. This was the dominant fix; hand size alone couldn't have closed a gap this large.
2. **Hand size 3 → 5** (tunable in D1 `game_config`).
3. **Overtime's Attack 5 → 3** — at Attack 5 it beat almost everything by default; at 3 it's competitive but not automatic.
4. **New Business copies 2 → 4** (deck grows from the GDD's stated 28 to 30 cards) — mattered most at 2P, where card scarcity is most acute; isolated testing showed hand-size+Overtime fixes alone got 2P to ~37% Shared Agenda success, the extra copies pushed it to 56%.

**8P games hit the 40-round safety cap 7-9% of the time** even after the fix — worth knowing about, not treated as broken. Median 8P games run 12-16 rounds (matches the GDD's own validated ~14.7), and 8-player tables naturally take longer to reach consensus; I left the cap as-is rather than guess at a fix for what reads as a legitimate long tail, not a stalemate loop (no other symptom of a dead-end state showed up in the card-usage data). Worth a look if human playtesting flags it as actually feeling stuck rather than just "this meeting ran long" (which, thematically, is somewhat the point).

**Second pass, after adding the deck-building draft (replacing the shared random deal):** re-ran the same simulation at 2000 games/config to make sure giving players choice over their deck didn't reopen the decision-space problem or introduce new softlocks. It didn't — every number improved further, because players (and bots) now draft a sensible Topic spread instead of hoping a random deal gives them one, and each player's own discard pile reshuffles independently, so a small personal deck still gets reliable repeat access to your chosen cards:

| | Shared random deal | Personal drafted deck |
|---|---|---|
| 2P Shared Agenda success | 56.3% | **64.0%** |
| 4P Shared Agenda success | 81.5% | **84.5%** |
| 8P Shared Agenda success | 92.3% | **97.5%** |
| 8P safety-cap rate | 7.8% | **2.5%** |
| Overtime win-rate-when-chosen | 74.6% | 59.8% (healthier still) |

One thing to watch, not urgent: **Quick Note cards are drafted far less often than everything else** (~1.5% of legal-card appearances vs. 6-8%+ for other templates, and a ~1% win rate when played) — bots consistently prefer New Business for the same "raise a topic" job since it has higher Attack and is wild. That's arguably fine (Quick Note was always meant to be the cheap, low-power option per the GDD's own rationale), but if human playtesting finds nobody ever wants it, it's a candidate to buff (higher Attack) or cut.

**Third pass: New Business was breaking real matches.** A real playthrough showed one bot win 6 straight rounds with New Business, including raising a topic, striking it, and immediately re-raising it — every other player got talked over every single round. Root cause: New Business (Attack 3, Decay 0) never got weaker no matter how often it won, while every other card that won accrued Decay and got progressively worse at winning priority. This prompted defining measurable "happy path" criteria from a design interview (see [HAPPY_PATH.md](HAPPY_PATH.md)) before tuning further, rather than guessing again — a match now scores "happy path" only if the Shared Agenda succeeds, no single card wins more than 1/3 of rounds, no player wins more than their fair share + 25 points, nobody gets shut out entirely, and 1-to-(N-1) players achieve their Hidden Agenda. That framework caught the problem precisely: baseline happy-path conformance was **0.5-2.8%** across player counts, with New Business the dominant card in 84-98% of matches.

Fix: New Business Attack 3→2, Decay 0→1. Overtime kept Attack 3 (nerfing it too broke its actual job — reliably winning priority when the table needs Duration back) but also gained Decay 0→1, since it had the identical repeat-without-consequence property. Validated at 2000 games/config:

| | Before | After |
|---|---|---|
| 2P happy path | 0.7% | 4.0% |
| 4P happy path | 2.8% | **35.1%** |
| 5P happy path | 1.0% | **37.4%** |
| 8P happy path | 0.5% | **18.6%** |
| New Business win-rate-when-chosen | ~53-54% | ~25% |

Two known gaps this pass didn't close, both detailed in HAPPY_PATH.md: **2P conformance is still low (4%)** — looks structural to having only 2 players (little contention/diversity by nature) rather than a New Business-specific problem, and probably needs the GDD's own "2P intense mode" concept, not implemented here. **8P matches hit the round safety cap more often now (2.3%→28.6%)**, though they're much happier when they do resolve (0.5%→18.6%) — compressing Attack values closer together means more ties and slower resolution with 8P's already-thin 3-card personal decks.

Full per-scenario reports are written to `sim-results/*.txt` (gitignored — regenerate with `npm run simulate`).

## Engine assumptions (GDD gaps I filled in — please correct these)

The GDD's Section 6 turn structure and Section 8 deck table left several mechanical details unspecified. I made the following calls; flag any that don't match your intent and I'll adjust:

1. **Each player builds their own deck via a draft** (see "Deck-building draft" above) from a shared 30-card pool (30, not the GDD's stated 28 — see Simulation findings for why) with no duplicates except the New Business copies. Played cards (won or fizzled) go to your own discard pile; your own draw pile reshuffles from your own discard when empty — decks are fully personal once the draft ends, not shared during play.
2. **Hand size**: 5 cards, refilled at the start of each round via the Draw step, clamped down automatically so it never exceeds your own drafted deck size (e.g. 8 players auto-clamps draft deck size, and therefore hand size, to 3). Tunable in D1 `game_config`.
3. **Starting Duration**: 30. Chosen to land near the simulation's validated ~11-15 round average meeting length. Tunable in D1.
4. **Card-to-topic legality**: each per-topic card has a fixed `topic`. Add is legal any time its topic is untouched; Rewrite/Remove are legal any time their topic has an existing Line Item (see Simulation findings — this replaced an earlier, much more restrictive "must match the current Floor" rule that badly starved decision space). The Floor itself is still tracked and shown, but only as "what was most recently touched," not as a legality gate.
5. **New Business**: wild — legal any time ≥1 topic is untouched, targets a topic of the player's choice.
6. **Overtime ("Can I Just Add One More Thing")**: wild — always legal, no Topic/Status target, doesn't touch the Minutes. Diminishing +5/+3/+1 Duration tracked per meeting; adds 1 to a shared Fatigue counter (displayed, but Political Capital payout is out of scope for this prototype since meta-progression isn't built).
7. **Hidden Agenda pool**: implemented the 4 examples listed in Section 7 verbatim, one assigned per player at random (non-exclusive, can repeat across players).
8. **Fizzled/talked-over cards are discarded**, not returned to hand — otherwise there's no cost to committing a losing card every round.
9. **Passing** keeps your hand as-is (no draw that round for you); "awkward silence" early end triggers when every player passes in the same round while at least one player still holds cards.

## Local dev

```
npm install
npm run dev:worker   # wrangler dev, serves the Worker + DO + D1 (local sqlite)
npm run dev:client   # vite dev server for the client (proxied to the worker for /ws)
```

## Deploy

```
npm run deploy
```
