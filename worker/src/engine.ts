import {
  AgendaCard,
  AgendaCell,
  AVATARS,
  Axis,
  CardDef,
  EndSummary,
  GameConfig,
  GamePhase,
  LogEntry,
  MAX_PLAYERS,
  RevealPlay,
  RoundReveal,
  Topic,
  TopicChange,
  TOPICS,
  TopicState,
} from "../../shared/types";

export interface PlayerState {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
  isBot: boolean;
  hand: string[]; // card ids
  personalDeck: string[]; // card ids drafted for this match, fixed once the draft ends
  drawPile: string[];
  discardPile: string[];
  /** Persistent resource pool. Attack each round is bid from here (player's own
   * choice, 1..current Stamina -- a card can never be played for free) and is always
   * spent, win or lose; only a talked-over play gets its card's Return back. A plain
   * Pass earns a flat config.passReward. */
  stamina: number;
  agendaCard: AgendaCard;
  avatar: string;
}

export interface Commit {
  cardId: string | null; // null = pass
  /** How much Stamina the player chose to bid this round; becomes their effective
   * Attack (plus the Chair's free +1). Minimum 1 when playing a card -- a player at 0
   * Stamina cannot play at all and must Pass. 0 when cardId is null (a pass). */
  attackSpend: number;
}

export interface PendingVoteCandidate {
  playerId: string;
  cardId: string;
  effAttack: number;
  seat: number;
}

/** A tie among top-Attack legal plays with at least one eligible voter (anyone whose own
 * card isn't part of the tie). Everyone else votes on which tied card wins; a tie in the
 * vote count falls back to Chair-proximity among the still-tied candidates. */
export interface PendingVote {
  candidates: PendingVoteCandidate[];
  voterIds: string[];
  votes: { voterId: string; candidatePlayerId: string }[];
  allPlays: RevealPlay[];
  passed: string[];
  round: number;
}

/** What the "undo" effect reverts -- captured right before a transfer or Duration-
 * changing play resolves. Only these two kinds are revertible: a durationMultiplier
 * play doesn't leave persistent state to restore (it just sets a pending value the
 * next play consumes), and undo itself can't be chained. */
export type PlaySnapshot =
  | { kind: "transfer"; costTopic: Topic; costBefore: TopicState; benefitTopic: Topic; benefitBefore: TopicState }
  | { kind: "duration"; previousDuration: number };

export interface GameState {
  matchId: string;
  phase: GamePhase;
  config: GameConfig;
  deckById: Map<string, CardDef>;
  players: Map<string, PlayerState>;
  seatOrder: string[]; // playerId by seat
  draftPool: string[]; // card ids not yet drafted by anyone
  draftPickNumber: number;
  draftDeckSize: number; // cards each player drafts, clamped to deck size / player count
  draftPicks: { playerId: string; cardId: string }[];
  topics: Record<Topic, TopicState>;
  duration: number;
  round: number;
  chairSeat: number;
  /** Rises every time a Duration-economy card (Extend the Meeting, Fast-Track It, Bury
   * It in Committee) wins -- pure flavor/UI, not scored. */
  fatigue: number;
  commits: Map<string, Commit>;
  /** Players who used their once-per-round discard-swap this round -- a free action
   * (doesn't consume the turn), so it's tracked separately from commits. */
  swappedThisRound: string[];
  log: LogEntry[];
  pendingVote: PendingVote | null;
  /** Set by Fast-Track It / Bury It in Committee; consumed by the next winning play's
   * Duration cost, then reset to 1. */
  pendingSustainMultiplier: number;
  lastPlaySnapshot: PlaySnapshot | null;
  endSummary?: EndSummary;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function effectiveHandSize(state: GameState): number {
  return Math.max(1, Math.min(state.config.handSize, state.draftDeckSize));
}

/** All C(4,2) = 6 ways to pick which 2 of the 4 Topics a player wants Approved --
 * dealt one per player, distinct, so the table is capped at 6 (see MAX_PLAYERS). */
function agendaPermutations(): [Topic, Topic][] {
  const perms: [Topic, Topic][] = [];
  for (let i = 0; i < TOPICS.length; i++) {
    for (let j = i + 1; j < TOPICS.length; j++) {
      perms.push([TOPICS[i], TOPICS[j]]);
    }
  }
  return perms;
}

function assignAgendaCards(numPlayers: number, rng: () => number): AgendaCard[] {
  const perms = shuffle(agendaPermutations(), rng).slice(0, numPlayers);
  return perms.map((approveTopics) => {
    const approveSet = new Set<Topic>(approveTopics);
    return TOPICS.map((topic): AgendaCell => ({ topic, stance: approveSet.has(topic) ? "Approve" : "Reject" }));
  });
}

/** Starts the draft: assigns seats and Hidden Agendas (revealed to each player right
 * away so they can draft around it), and opens the full deck as a shared, visible pool
 * that players pick from in turn. Capped at MAX_PLAYERS (6) -- the agenda permutation
 * pool only has 6 distinct entries. */
export function beginDraft(
  playerInputs: { id: string; name: string; isBot: boolean }[],
  deck: CardDef[],
  config: GameConfig,
  seed = Date.now(),
  matchId = crypto.randomUUID()
): GameState {
  const rng = mulberry32(seed);
  const numPlayers = Math.max(1, Math.min(playerInputs.length, MAX_PLAYERS));
  const capped = playerInputs.slice(0, numPlayers);
  const deckById = new Map(deck.map((c) => [c.id, c]));
  const draftDeckSize = Math.max(1, Math.min(config.draftDeckSize, Math.floor(deck.length / numPlayers)));

  const seatOrder = capped.map((p) => p.id);
  const players = new Map<string, PlayerState>();
  const agendaCards = assignAgendaCards(numPlayers, rng);
  const avatars = shuffle([...AVATARS], rng);
  capped.forEach((p, seat) => {
    players.set(p.id, {
      id: p.id,
      name: p.name,
      seat,
      connected: true,
      isBot: p.isBot,
      hand: [],
      personalDeck: [],
      drawPile: [],
      discardPile: [],
      stamina: config.startingStamina,
      agendaCard: agendaCards[seat],
      avatar: avatars[seat % avatars.length],
    });
  });

  return {
    matchId,
    phase: "draft",
    config,
    deckById,
    players,
    seatOrder,
    draftPool: shuffle(
      deck.map((c) => c.id),
      rng
    ),
    draftPickNumber: 0,
    draftDeckSize,
    draftPicks: [],
    topics: Object.fromEntries(TOPICS.map((t) => [t, { agreement: 0.5, pressure: 0.5, credit: null }])) as Record<Topic, TopicState>,
    duration: config.startingDuration,
    round: 0,
    chairSeat: 0,
    fatigue: 0,
    commits: new Map(),
    swappedThisRound: [],
    log: [],
    pendingVote: null,
    pendingSustainMultiplier: 1,
    lastPlaySnapshot: null,
  };
}

/** Snake draft: seat order reverses each full round so nobody is stuck picking last every time. */
export function draftTurnPlayerId(state: GameState): string | null {
  const numPlayers = state.seatOrder.length;
  const totalPicks = state.draftDeckSize * numPlayers;
  if (state.draftPickNumber >= totalPicks) return null;
  const round = Math.floor(state.draftPickNumber / numPlayers);
  const indexInRound = state.draftPickNumber % numPlayers;
  const seat = round % 2 === 0 ? indexInRound : numPlayers - 1 - indexInRound;
  return state.seatOrder[seat];
}

export function isDraftComplete(state: GameState): boolean {
  return state.phase === "draft" && draftTurnPlayerId(state) === null;
}

export function draftPick(state: GameState, playerId: string, cardId: string): { ok: true } | { ok: false; error: string } {
  if (state.phase !== "draft") return { ok: false, error: "Not in the draft phase." };
  const turnPlayerId = draftTurnPlayerId(state);
  if (turnPlayerId !== playerId) return { ok: false, error: "Not your turn to draft." };
  if (!state.draftPool.includes(cardId)) return { ok: false, error: "That card isn't available." };
  const player = state.players.get(playerId);
  if (!player) return { ok: false, error: "Unknown player." };
  state.draftPool = state.draftPool.filter((id) => id !== cardId);
  player.personalDeck.push(cardId);
  state.draftPickNumber += 1;
  state.draftPicks.push({ playerId, cardId });
  return { ok: true };
}

/** Ends the draft: shuffles each player's drafted cards into their own draw pile, deals
 * their opening hand, and moves straight to the "commit" phase -- every Topic starts at
 * (0.5, 0.5) automatically, so unlike the old status-cycle game there's no bootstrap
 * step needed before Round 1 can begin. */
export function finalizeDraft(state: GameState, seed = Date.now()) {
  const rng = mulberry32(seed);
  const handSize = effectiveHandSize(state);
  for (const player of state.players.values()) {
    player.drawPile = shuffle(player.personalDeck, rng);
    player.discardPile = [];
    player.hand = [];
    while (player.hand.length < handSize && player.drawPile.length > 0) {
      player.hand.push(player.drawPile.pop()!);
    }
  }
  state.phase = "commit";
  state.round = 1;
  state.log.push({ round: 0, text: "The meeting has started. Someone should probably take minutes." });
}

export function commitCard(
  state: GameState,
  playerId: string,
  cardId: string | null,
  attackSpend = 0
): { ok: true } | { ok: false; error: string } {
  if (state.phase !== "commit") return { ok: false, error: "Not in commit phase." };
  if (state.pendingVote) return { ok: false, error: "A tie is being voted on -- wait for that to resolve." };
  const player = state.players.get(playerId);
  if (!player) return { ok: false, error: "Unknown player." };
  if (cardId !== null && !player.hand.includes(cardId)) return { ok: false, error: "Card not in hand." };
  if (cardId !== null && player.stamina < 1) {
    return { ok: false, error: "You're out of Stamina -- you have to Pass to recover." };
  }
  const spend = cardId === null ? 0 : Math.max(1, Math.min(Math.floor(attackSpend), player.stamina));
  state.commits.set(playerId, { cardId, attackSpend: spend });
  return { ok: true };
}

/** Discard-swap: trade one hand card for a fresh draw at a flat 1 Stamina. A FREE
 * action, not a turn -- the player still commits a card (or a Pass) for the round
 * afterward. Once per round, and only while still uncommitted. */
export function discardSwap(state: GameState, playerId: string, cardId: string): { ok: true } | { ok: false; error: string } {
  if (state.phase !== "commit") return { ok: false, error: "Not in commit phase." };
  if (state.pendingVote) return { ok: false, error: "A tie is being voted on -- wait for that to resolve." };
  const player = state.players.get(playerId);
  if (!player) return { ok: false, error: "Unknown player." };
  if (state.commits.has(playerId)) return { ok: false, error: "You've already locked in this round." };
  if (state.swappedThisRound.includes(playerId)) return { ok: false, error: "Only one discard-swap per round." };
  if (player.stamina < 1) return { ok: false, error: "A swap costs 1 Stamina -- you're out." };
  if (!player.hand.includes(cardId)) return { ok: false, error: "Card not in hand." };
  player.hand = player.hand.filter((c) => c !== cardId);
  player.discardPile.push(cardId);
  drawOne(state, playerId);
  player.stamina -= 1;
  state.swappedThisRound.push(playerId);
  return { ok: true };
}

export function allCommitted(state: GameState): boolean {
  for (const id of state.players.keys()) {
    if (!state.commits.has(id)) return false;
  }
  return true;
}

function seatDistance(seat: number, fromSeat: number, numSeats: number): number {
  return (seat - fromSeat + numSeats) % numSeats;
}

/** Stamina economy: a committed bid is always spent, win or lose -- there's no
 * talked-over refund anymore (a plain Pass is the way to recover Stamina; see
 * advanceRound's pass-streak reward). A card's own Stamina Return is instead a
 * consolation payout for losing the round: the winner pays their full bid with no
 * rebate, while everyone talked over pays their bid too but gets their own card's
 * Return credited back. Applies to every committed (non-pass) play, legal or not --
 * an illegal play still cost you the bid, it just could never win. */
function applyStaminaEconomy(state: GameState, allPlays: RevealPlay[]) {
  for (const play of allPlays) {
    const player = state.players.get(play.playerId);
    const commit = state.commits.get(play.playerId);
    if (!player || !commit) continue;
    const delta = play.isWinner ? -commit.attackSpend : play.staminaReturn - commit.attackSpend;
    player.stamina = Math.max(0, player.stamina + delta);
  }
}

/** Agreement changes are dampened by the acting Topic's own Pressure; Pressure changes
 * never are (Pressure is what resists Agreement moving, not itself). */
function effectiveDelta(state: GameState, topic: Topic, axis: Axis, amount: number): number {
  const t = state.topics[topic];
  return axis === "Agreement" ? amount * (1 - t.pressure) : amount;
}

function transferPayable(state: GameState, effect: Extract<CardDef["effect"], { kind: "transfer" }>): boolean {
  const removal = effectiveDelta(state, effect.costTopic, effect.costAxis, effect.amount);
  if (removal <= 1e-9) return false; // a fully-pressurized axis is immovable -- "taking" would take nothing
  const t = state.topics[effect.costTopic];
  const current = effect.costAxis === "Agreement" ? t.agreement : t.pressure;
  return current >= removal - 1e-9;
}

/** Legality is purely "is the cost payable" for transfer cards -- no separate
 * requirement system at all. Every card (transfer or bonus) also needs enough
 * remaining Duration to afford its own Sustain cost. */
export function isLegal(card: CardDef, state: GameState): boolean {
  if (card.sustain > state.duration) return false;
  switch (card.effect.kind) {
    case "transfer":
      return transferPayable(state, card.effect);
    case "extendDuration":
    case "durationMultiplier":
      return true;
    case "undo":
      return state.lastPlaySnapshot !== null;
  }
}

/** The Chair holder gets a free +1 to their effective Attack this round -- not spent
 * from Stamina, just a perk of running the meeting. */
function effectiveAttack(state: GameState, commit: Commit, player: PlayerState): number {
  const isChairHolder = state.seatOrder[state.chairSeat] === player.id;
  return commit.attackSpend + (isChairHolder ? 1 : 0);
}

function drawUpTo(state: GameState, playerId: string) {
  const player = state.players.get(playerId)!;
  const handSize = effectiveHandSize(state);
  while (player.hand.length < handSize) {
    if (!drawOne(state, playerId)) return;
  }
}

/** Draws exactly one card for a player, reshuffling their discard into their draw pile
 * if needed. Returns false if there were no cards anywhere to draw. */
function drawOne(state: GameState, playerId: string): boolean {
  const player = state.players.get(playerId)!;
  if (player.drawPile.length === 0) {
    if (player.discardPile.length === 0) return false;
    player.drawPile = shuffle(player.discardPile, Math.random);
    player.discardPile = [];
  }
  const drawn = player.drawPile.pop();
  if (!drawn) return false;
  player.hand.push(drawn);
  return true;
}

/** Finishes resolving a round once the winner is known -- either immediately (no tie)
 * or after a tie-vote completes. Applies the winning card's effect and Duration cost,
 * then advances to the next round. */
function finishRoundResolution(
  state: GameState,
  winner: PendingVoteCandidate,
  allPlays: RevealPlay[],
  passed: string[],
  round: number,
  tieNote?: string
): RoundReveal {
  const card = state.deckById.get(winner.cardId)!;
  const winnerPlayer = state.players.get(winner.playerId)!;
  const winningPlay = allPlays.find((p) => p.playerId === winner.playerId && p.cardId === winner.cardId);
  if (winningPlay) winningPlay.isWinner = true;

  const sustainCost = card.sustain * state.pendingSustainMultiplier;
  state.pendingSustainMultiplier = 1;

  let effectText = "";
  const topicChanges: TopicChange[] = [];
  const axisValue = (t: Topic, axis: Axis) => (axis === "Agreement" ? state.topics[t].agreement : state.topics[t].pressure);

  if (card.effect.kind === "transfer") {
    const { costTopic, costAxis, benefitTopic, benefitAxis, amount } = card.effect;
    state.lastPlaySnapshot = {
      kind: "transfer",
      costTopic,
      costBefore: { ...state.topics[costTopic] },
      benefitTopic,
      benefitBefore: { ...state.topics[benefitTopic] },
    };
    const costBefore = axisValue(costTopic, costAxis);
    const benefitBefore = axisValue(benefitTopic, benefitAxis);

    const removal = effectiveDelta(state, costTopic, costAxis, amount);
    const addition = effectiveDelta(state, benefitTopic, benefitAxis, amount);
    const src = state.topics[costTopic];
    if (costAxis === "Agreement") src.agreement = Math.max(0, src.agreement - removal);
    else src.pressure = Math.max(0, src.pressure - removal);
    src.credit = winner.playerId;

    const dst = state.topics[benefitTopic];
    if (benefitAxis === "Agreement") dst.agreement = Math.min(1, dst.agreement + addition);
    else dst.pressure = Math.min(1, dst.pressure + addition);
    dst.credit = winner.playerId;

    topicChanges.push({ topic: costTopic, axis: costAxis, before: costBefore, after: axisValue(costTopic, costAxis) });
    topicChanges.push({ topic: benefitTopic, axis: benefitAxis, before: benefitBefore, after: axisValue(benefitTopic, benefitAxis) });

    effectText = `${winnerPlayer.name} moved ${costTopic}'s ${costAxis} to ${benefitTopic}'s ${benefitAxis}.`;
  } else if (card.effect.kind === "extendDuration") {
    state.lastPlaySnapshot = { kind: "duration", previousDuration: state.duration };
    state.duration += card.effect.amount;
    state.fatigue += 1;
    effectText = `${winnerPlayer.name}: "Before we wrap -- one more thing." (+${card.effect.amount} Duration)`;
  } else if (card.effect.kind === "durationMultiplier") {
    state.pendingSustainMultiplier = card.effect.multiplier;
    state.lastPlaySnapshot = null; // not revertible
    state.fatigue += 1;
    effectText =
      card.effect.multiplier < 1
        ? `${winnerPlayer.name} fast-tracked whatever comes next.`
        : `${winnerPlayer.name} buried whatever comes next in committee.`;
  } else {
    const snap = state.lastPlaySnapshot;
    if (!snap) {
      effectText = `${winnerPlayer.name} tried to undo the last play, but there was nothing to undo.`;
    } else if (snap.kind === "transfer") {
      for (const [topic, restored] of [
        [snap.costTopic, snap.costBefore],
        [snap.benefitTopic, snap.benefitBefore],
      ] as const) {
        for (const axis of ["Agreement", "Pressure"] as const) {
          const before = axisValue(topic, axis);
          const after = axis === "Agreement" ? restored.agreement : restored.pressure;
          if (before !== after) topicChanges.push({ topic, axis, before, after });
        }
      }
      state.topics[snap.costTopic] = snap.costBefore;
      state.topics[snap.benefitTopic] = snap.benefitBefore;
      effectText = `${winnerPlayer.name} undid the last play affecting ${snap.costTopic} and ${snap.benefitTopic}.`;
    } else {
      state.duration = snap.previousDuration;
      effectText = `${winnerPlayer.name} undid the last change to the Duration clock.`;
    }
    state.lastPlaySnapshot = null; // no chained undo-of-undo
  }

  state.duration = Math.max(0, state.duration - sustainCost);
  applyStaminaEconomy(state, allPlays);

  state.log.push({ round, text: effectText });

  const talkedOver = allPlays.filter((p) => !p.isWinner).map((p) => p.playerName);
  if (talkedOver.length > 0) {
    state.log.push({ round, text: `Talked over: ${talkedOver.join(", ")}.` });
  }

  advanceRound(state);
  checkEndConditions(state);

  return {
    round,
    plays: allPlays,
    passed,
    outcomeText: effectText,
    winningCard: card,
    winnerId: winner.playerId,
    winnerName: winnerPlayer.name,
    topicChanges,
    tieNote,
  };
}

export function resolveRound(state: GameState): RoundReveal {
  const numSeats = state.seatOrder.length;
  const candidates: { playerId: string; card: CardDef; effAttack: number; seat: number }[] = [];
  const allPlays: RevealPlay[] = [];
  const passed: string[] = [];

  for (const [playerId, commit] of state.commits.entries()) {
    const player = state.players.get(playerId)!;
    if (commit.cardId === null) {
      passed.push(player.name);
      continue;
    }
    const card = state.deckById.get(commit.cardId);
    if (!card) continue;
    const legal = isLegal(card, state);
    const isChairHolder = state.seatOrder[state.chairSeat] === playerId;
    const effAttack = effectiveAttack(state, commit, player);
    allPlays.push({
      playerId,
      playerName: player.name,
      cardId: card.id,
      cardName: card.name,
      baseAttack: commit.attackSpend,
      chairBonus: isChairHolder ? 1 : 0,
      effAttack,
      staminaReturn: card.staminaReturn,
      legal,
      isWinner: false,
    });
    if (legal) candidates.push({ playerId, card, effAttack, seat: player.seat });
  }

  const round = state.round;

  if (candidates.length === 0) {
    // A round of all Passes isn't "silence" in a bad sense -- everyone deliberately
    // banked the Pass reward. A winnerless round never ends the game outright; it
    // just burns a point of Duration and continues.
    const outcomeText = "Nobody had a legal move. The room sits in silence.";
    state.log.push({ round, text: outcomeText });
    state.duration = Math.max(0, state.duration - 1);
    applyStaminaEconomy(state, allPlays);
    advanceRound(state);
    checkEndConditions(state);
    return { round, plays: allPlays, passed, outcomeText };
  }

  const topEffAttack = Math.max(...candidates.map((c) => c.effAttack));
  const tied = candidates.filter((c) => c.effAttack === topEffAttack);

  if (tied.length > 1) {
    const tiedPlayerIds = new Set(tied.map((c) => c.playerId));
    const voterIds = state.seatOrder.filter((id) => !tiedPlayerIds.has(id));
    if (voterIds.length > 0) {
      state.pendingVote = {
        candidates: tied.map((c) => ({ playerId: c.playerId, cardId: c.card.id, effAttack: c.effAttack, seat: c.seat })),
        voterIds,
        votes: [],
        allPlays,
        passed,
        round,
      };
      const outcomeText = "It's a tie for the floor! The rest of the table is voting on whose card gets heard.";
      state.log.push({ round, text: outcomeText });
      return { round, plays: allPlays, passed, outcomeText };
    }
    // Nobody left to vote (everyone's tied) -- fall back to Chair-proximity, same as before.
  }

  tied.sort((a, b) => seatDistance(a.seat, state.chairSeat, numSeats) - seatDistance(b.seat, state.chairSeat, numSeats));
  const winner = tied[0];
  const tieNote =
    tied.length > 1 ? `Tied at ${topEffAttack} with nobody left to vote -- broken by seat distance from the Chair.` : undefined;
  return finishRoundResolution(
    state,
    { playerId: winner.playerId, cardId: winner.card.id, effAttack: winner.effAttack, seat: winner.seat },
    allPlays,
    passed,
    round,
    tieNote
  );
}

export function castVote(state: GameState, voterId: string, candidatePlayerId: string): { ok: true; reveal?: RoundReveal } | { ok: false; error: string } {
  const vote = state.pendingVote;
  if (!vote) return { ok: false, error: "No vote is pending." };
  if (!vote.voterIds.includes(voterId)) return { ok: false, error: "You're not eligible to vote on this tie." };
  if (vote.votes.some((v) => v.voterId === voterId)) return { ok: false, error: "You already voted." };
  if (!vote.candidates.some((c) => c.playerId === candidatePlayerId)) return { ok: false, error: "Not a valid candidate." };

  vote.votes.push({ voterId, candidatePlayerId });
  if (vote.votes.length < vote.voterIds.length) return { ok: true };

  const numSeats = state.seatOrder.length;
  const tally = new Map<string, number>();
  for (const c of vote.candidates) tally.set(c.playerId, 0);
  for (const v of vote.votes) tally.set(v.candidatePlayerId, (tally.get(v.candidatePlayerId) ?? 0) + 1);

  const topVotes = Math.max(...tally.values());
  const winners = vote.candidates.filter((c) => tally.get(c.playerId) === topVotes);
  winners.sort((a, b) => seatDistance(a.seat, state.chairSeat, numSeats) - seatDistance(b.seat, state.chairSeat, numSeats));
  const winner = winners[0];
  const tieNote =
    winners.length > 1
      ? `Tied bids, and the table's vote tied too -- broken by seat distance from the Chair.`
      : `Tied bids -- the table voted, ${topVotes} vote${topVotes === 1 ? "" : "s"} for the winner.`;

  const { allPlays, passed, round } = vote;
  state.pendingVote = null;
  const reveal = finishRoundResolution(state, winner, allPlays, passed, round, tieNote);
  return { ok: true, reveal };
}

function checkEndConditions(state: GameState): void {
  if (state.phase === "ended") return;
  if (state.round > state.config.roundSafetyCap) {
    endGame(state, "safety-cap");
    return;
  }
  if (state.duration <= 0) {
    const anyoneCanStillAct = [...state.players.values()].some((p) => p.hand.some((cid) => isLegal(state.deckById.get(cid)!, state)));
    if (!anyoneCanStillAct) {
      endGame(state, "duration-exhausted");
      return;
    }
  }
}

function advanceRound(state: GameState) {
  for (const [playerId, commit] of state.commits.entries()) {
    const player = state.players.get(playerId)!;
    if (commit.cardId !== null) {
      player.hand = player.hand.filter((c) => c !== commit.cardId);
      player.discardPile.push(commit.cardId);
      drawUpTo(state, playerId);
    } else {
      // A plain Pass earns a flat Stamina reward -- the only way back from an empty pool.
      player.stamina += state.config.passReward;
    }
  }
  state.commits.clear();
  state.swappedThisRound = [];
  state.round += 1;
  state.chairSeat = (state.chairSeat + 1) % state.seatOrder.length;
}

function endGame(state: GameState, reason: EndSummary["reason"]) {
  state.phase = "ended";
  const approvedTopics = new Set(TOPICS.filter((t) => state.topics[t].agreement >= state.config.approveThreshold));

  const playersWithCounts = [...state.players.values()].map((p) => {
    const agendaCard = p.agendaCard.map((cell) => {
      const isApproved = approvedTopics.has(cell.topic);
      const achieved = cell.stance === "Approve" ? isApproved : !isApproved;
      return { ...cell, achieved };
    });
    const agendaAchievedCount = agendaCard.filter((c) => c.achieved).length;
    return { id: p.id, name: p.name, agendaCard, agendaAchievedCount };
  });
  // Winner(s) are whoever completed the most Hidden Agenda cells -- a ranking, not a
  // fixed threshold. Ties share the win rather than picking one player arbitrarily.
  // But nobody wins at all unless the table's Shared Agenda (2+ Topics Approved) was
  // met -- if the meeting failed, everyone failed.
  const sharedAgendaSuccess = approvedTopics.size >= 2;
  const maxAchieved = Math.max(...playersWithCounts.map((p) => p.agendaAchievedCount));
  const players = playersWithCounts.map((p) => ({ ...p, agendaSuccess: sharedAgendaSuccess && p.agendaAchievedCount === maxAchieved }));

  state.endSummary = {
    sharedAgendaSuccess,
    approvedCount: approvedTopics.size,
    players,
    rounds: state.round - 1,
    reason,
  };

  const verdict = state.endSummary.sharedAgendaSuccess
    ? "MEETING ADJOURNED. The Shared Agenda was met."
    : "The meeting ran long. We'll pick this up next time.";
  state.log.push({ round: state.round, text: verdict });
}
