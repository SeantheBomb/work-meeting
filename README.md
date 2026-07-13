# Work Meeting (prototype)

A multiplayer social-deduction deckbuilder where players play conversation cards to Add, Rewrite, or Remove items on a shared meeting record ("the Minutes"). Based on the GDD (`Work-Meeting-GDD-v2-Final.md`), Sections 5-9 (the simulation-tuned core loop).

This prototype implements **the core loop only**: Minutes/Floor/turn structure, the 28-card deck, Duration/Entrenchment/Decay, Shared + Hidden Agenda win conditions, real-time multiplayer (2-8 players) over WebSockets. It intentionally leaves out audio, the Section 16 post-match "incident report" (a simple end screen stands in for it), and Section 10 meta-progression (Workday/Career).

## Stack

- **Worker**: Cloudflare Worker + Durable Objects (one `MeetingRoom` DO per room code), TypeScript. Server-authoritative — clients never determine their own priority or resolve entrenchment math.
- **Client**: Vanilla TypeScript + Vite, plain HTML/CSS/DOM (no canvas renderer for this prototype).
- **Data**: Cloudflare D1, `card_definitions` table + `game_config` table — lets you tune Attack/Sustain/Decay or starting Duration/hand size from the D1 dashboard without a redeploy of game logic.
- Deployed as a single Worker with static assets (client build) + DO + D1 binding — one `wrangler deploy`.

## Engine assumptions (GDD gaps I filled in — please correct these)

The GDD's Section 6 turn structure and Section 8 deck table left several mechanical details unspecified. I made the following calls; flag any that don't match your intent and I'll adjust:

1. **The 28 cards are a single shared deck**, shuffled and dealt across the whole table (not per-player decks, no duplicates except the 2 New Business copies). Played cards (won or fizzled) go to a discard pile; draw pile reshuffles from discard when empty.
2. **Hand size**: 3 cards, refilled to 3 at the start of each round via the Draw step. (28 cards / 8 players = 3.5, so hand size 3 keeps an 8-player initial deal inside the deck size. Tunable in D1 `game_config`.)
3. **Starting Duration**: 30. Chosen to land near the simulation's validated ~11-round average meeting length at the deck's average winning Sustain (~2.5-3/round). Tunable in D1.
4. **Card-to-Floor matching**: each per-topic card has a fixed `topic` and a `resultStatus` (QuickNote→Raised, PushBack→Disputed, TableIt→Tabled, SignOff→Approved). A card is legal if `card.topic === floor.topic` OR `card.resultStatus === floor.status`. ShootDown (Remove) has no `resultStatus` — it matches by Topic only, and always targets whatever Line Item currently occupies the Floor (per "Remove... targets the Floor item only").
5. **Add (QuickNote) legality**: legal only if its own topic has no Line Item yet, AND (no Floor exists yet OR Floor.status === 'Raised' OR Floor.topic === its topic — the last case can't occur since its topic is empty, so in practice: first move of the game, or matching an already-Raised item elsewhere).
6. **New Business**: wild — legal any time ≥1 topic is untouched, targets a topic of the player's choice.
7. **Overtime ("Can I Just Add One More Thing")**: wild — always legal, no Topic/Status target, doesn't touch the Minutes. Diminishing +5/+3/+1 Duration tracked per meeting; adds 1 to a shared Fatigue counter (displayed, but Political Capital payout is out of scope for this prototype since meta-progression isn't built).
8. **Hidden Agenda pool**: implemented the 4 examples listed in Section 7 verbatim, one assigned per player at random (non-exclusive, can repeat across players).
9. **Fizzled/talked-over cards are discarded**, not returned to hand — otherwise there's no cost to committing a losing card every round.
10. **Passing** keeps your hand as-is (no draw that round for you); "awkward silence" early end triggers when every player passes in the same round while at least one player still holds cards.

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
