import {
  AgendaStance,
  CardDef,
  EndSummary,
  Floor,
  GameConfig,
  GamePhase,
  HiddenAgenda,
  LineItem,
  LogEntry,
  RevealPlay,
  RoundReveal,
  SideEffectId,
  Status,
  Topic,
  TOPICS,
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
  decayPenalty: number;
  hiddenAgenda: HiddenAgenda;
}

export interface Commit {
  cardId: string | null; // null = pass
  targetTopic?: Topic; // only used for NewBusiness
}

export interface RemoveEvent {
  topic: Topic;
  removedCredit: string;
  removedBy: string;
  round: number;
}

export interface Peek {
  viewerId: string;
  aboutPlayerId: string;
}

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
  minutes: Partial<Record<Topic, LineItem>>;
  floor: Floor | null;
  duration: number;
  round: number;
  chairSeat: number;
  overtimeUses: number;
  fatigue: number;
  commits: Map<string, Commit>;
  log: LogEntry[];
  removeEvents: RemoveEvent[];
  peeks: Peek[];
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

/** Base Resolve for a freshly-written item is the card's Sustain, plus a per-Status
 * modifier that gives each Status its own "flavor and challenge" (see DESIGN_NOTES.md
 * section 1): Disputed items are actively defended (+1), Approved items are locked in
 * and costly to undo (+2), Tabled items instead decay automatically over time (handled
 * in advanceRound, not here), Raised gets no modifier -- fresh and undefended. */
function statusResolveModifier(status: Status): number {
  if (status === "Disputed") return 1;
  if (status === "Approved") return 2;
  return 0;
}

/** Assigns every player exactly one (topic, stance) pair. No two players ever share the
 * identical pair; whenever 2+ players land on the same topic they're split as evenly as
 * possible between Approve and Block, guaranteeing real opposition wherever agendas
 * overlap (see DESIGN_NOTES.md section 4). At most 2 players share any one topic (so
 * every pair is a clean Approve-vs-Block opposite) as long as numPlayers <= 2*TOPICS.length. */
function assignHiddenAgendas(numPlayers: number, rng: () => number): HiddenAgenda[] {
  const topicOrder = shuffle([...TOPICS], rng);
  const playerOrder = shuffle(
    Array.from({ length: numPlayers }, (_, i) => i),
    rng
  );
  const stanceCountByTopicIndex = new Array(topicOrder.length).fill(0);
  const startOffsetByTopicIndex = topicOrder.map(() => (rng() < 0.5 ? 0 : 1));
  const assignments: HiddenAgenda[] = new Array(numPlayers);

  playerOrder.forEach((playerIndex, i) => {
    const topicIndex = i % topicOrder.length;
    const nthOnTopic = stanceCountByTopicIndex[topicIndex]++;
    const stance: AgendaStance = (nthOnTopic + startOffsetByTopicIndex[topicIndex]) % 2 === 0 ? "Approve" : "Block";
    assignments[playerIndex] = { topic: topicOrder[topicIndex], stance };
  });

  return assignments;
}

/** Starts the draft: assigns seats and Hidden Agendas (revealed to each player right
 * away, per Sean's request, so they can draft around it), and opens the full deck as
 * a shared, visible pool that players pick from in turn. */
export function beginDraft(
  playerInputs: { id: string; name: string; isBot: boolean }[],
  deck: CardDef[],
  config: GameConfig,
  seed = Date.now(),
  matchId = crypto.randomUUID()
): GameState {
  const rng = mulberry32(seed);
  const deckById = new Map(deck.map((c) => [c.id, c]));
  const numPlayers = Math.max(1, playerInputs.length);
  const draftDeckSize = Math.max(1, Math.min(config.draftDeckSize, Math.floor(deck.length / numPlayers)));

  const seatOrder = playerInputs.map((p) => p.id);
  const players = new Map<string, PlayerState>();
  const hiddenAgendas = assignHiddenAgendas(numPlayers, rng);
  playerInputs.forEach((p, seat) => {
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
      decayPenalty: 0,
      hiddenAgenda: hiddenAgendas[seat],
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
    minutes: {},
    floor: null,
    duration: config.startingDuration,
    round: 0,
    chairSeat: 0,
    overtimeUses: 0,
    fatigue: 0,
    commits: new Map(),
    log: [],
    removeEvents: [],
    peeks: [],
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

/** Ends the draft: shuffles each player's drafted cards into their own draw pile and
 * deals their opening hand. From here on every player draws only from the cards they
 * personally drafted -- there is no shared deck during play. */
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
  targetTopic?: Topic
): { ok: true } | { ok: false; error: string } {
  if (state.phase !== "commit") return { ok: false, error: "Not in commit phase." };
  const player = state.players.get(playerId);
  if (!player) return { ok: false, error: "Unknown player." };
  if (cardId !== null && !player.hand.includes(cardId)) return { ok: false, error: "Card not in hand." };
  state.commits.set(playerId, { cardId, targetTopic });
  return { ok: true };
}

export function allCommitted(state: GameState): boolean {
  for (const id of state.players.keys()) {
    if (!state.commits.has(id)) return false;
  }
  return true;
}

/**
 * Legality no longer gates Rewrite/Remove on matching "the Floor" (a single global
 * topic+status slot). An early simulation pass (see /sim-results) showed that rule
 * left 44-58% of all turns with zero legal cards and collapsed 2P/4P games via mass
 * "awkward silence" passes in ~3 rounds. Rewrite/Remove are now legal any time their
 * own topic has an existing Line Item; the real tension moved to the Resolve
 * success/bounce check, which was always the interesting risk anyway. The Floor is
 * kept as pure display state (what was most recently touched) for narrative/UI, not
 * as a legality gate.
 */
export function isLegal(card: CardDef, state: GameState): boolean {
  if (card.sustain > state.duration && card.verb !== "Overtime") return false;
  if (card.verb === "NewBusiness") {
    return TOPICS.some((t) => !state.minutes[t]);
  }
  if (card.verb === "Overtime") {
    return true;
  }
  if (card.verb === "Add") {
    return !state.minutes[card.topic!]; // legal any time its own topic is untouched
  }
  if (card.verb === "Rewrite" || card.verb === "Remove") {
    return !!state.minutes[card.topic!]; // legal any time its own topic has an existing item
  }
  return false;
}

function effectiveAttack(card: CardDef, player: PlayerState): number {
  return card.attack - player.decayPenalty;
}

function seatDistance(seat: number, fromSeat: number, numSeats: number): number {
  return (seat - fromSeat + numSeats) % numSeats;
}

function drawUpTo(state: GameState, playerId: string) {
  const player = state.players.get(playerId)!;
  const handSize = effectiveHandSize(state);
  while (player.hand.length < handSize) {
    if (!drawOne(state, playerId)) return;
  }
}

/** Draws exactly one card for a player, reshuffling their discard into their draw pile
 * if needed. Returns false if there were no cards anywhere to draw. Used both for the
 * normal end-of-round refill and for the BonusDraw side effect (which draws beyond the
 * normal hand-size cap). */
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

function addPressure(state: GameState, topic: Topic) {
  const item = state.minutes[topic];
  if (!item) return;
  item.pressure += 1;
  if (item.pressure >= state.config.pressureThreshold) {
    item.pressure = 0;
    item.resolve = Math.max(0, item.resolve - 1);
  }
}

/** Applies a card's side effect. Triggers whenever the card wins priority, win or bounce
 * (see DESIGN_NOTES.md section 2) -- even a losing Rewrite/Remove attempt still does
 * something. Returns a short log fragment describing what happened, or null for Peek
 * (private, not broadcast) and no-ops. */
function applySideEffect(state: GameState, playerId: string, card: CardDef, actedTopic: Topic | null): string | null {
  const player = state.players.get(playerId)!;
  switch (card.sideEffect) {
    case "BonusDraw":
      return drawOne(state, playerId) ? `${player.name} drew a bonus card.` : null;
    case "Peek": {
      const others = state.seatOrder.filter((id) => id !== playerId);
      if (others.length === 0) return null;
      const aboutPlayerId = others[Math.floor(Math.random() * others.length)];
      state.peeks.push({ viewerId: playerId, aboutPlayerId });
      return null; // private -- no public log line
    }
    case "Undermine": {
      const candidates = (Object.values(state.minutes) as LineItem[]).filter((i) => i.topic !== actedTopic);
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => b.resolve - a.resolve);
      const target = candidates[0];
      target.resolve = Math.max(0, target.resolve - 1);
      return `${target.topic}'s Resolve was undermined by 1.`;
    }
    case "Rebate":
      state.duration += 1;
      return `${player.name} clawed back 1 Duration.`;
    case "Deflect":
      return null; // applied inline where Decay is added, since it needs to change the amount itself
    default:
      return null;
  }
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
    const effAttack = effectiveAttack(card, player);
    allPlays.push({
      playerId,
      playerName: player.name,
      cardId: card.id,
      cardName: card.name,
      topic: card.topic,
      effAttack,
      legal,
      isWinner: false,
      success: true,
      sideEffect: null,
    });
    if (legal) candidates.push({ playerId, card, effAttack, seat: player.seat });
  }

  const round = state.round;

  if (candidates.length === 0) {
    const everyonePassedWithCardsInHand =
      [...state.commits.values()].every((c) => c.cardId === null) &&
      [...state.players.values()].some((p) => p.hand.length > 0);
    const outcomeText = "Nobody had a legal move. The room sits in silence.";
    state.log.push({ round, text: outcomeText });
    if (everyonePassedWithCardsInHand) {
      endGame(state, "awkward-silence");
      return { round, plays: allPlays, passed, outcomeText };
    }
    advanceRound(state);
    checkEndConditions(state);
    return { round, plays: allPlays, passed, outcomeText };
  }

  candidates.sort((a, b) => {
    if (b.effAttack !== a.effAttack) return b.effAttack - a.effAttack;
    return seatDistance(a.seat, state.chairSeat, numSeats) - seatDistance(b.seat, state.chairSeat, numSeats);
  });

  const winner = candidates[0];
  const winningPlay = allPlays.find((p) => p.playerId === winner.playerId && p.cardId === winner.card.id);
  if (winningPlay) winningPlay.isWinner = true;
  const winnerPlayer = state.players.get(winner.playerId)!;
  const commit = state.commits.get(winner.playerId)!;
  const card = winner.card;

  // Talked-over legal Rewrite/Remove attempts still wear down their target (Pressure).
  for (const c of candidates) {
    if (c === winner) continue;
    if ((c.card.verb === "Rewrite" || c.card.verb === "Remove") && c.card.topic) {
      addPressure(state, c.card.topic);
    }
  }

  let effectText = "";
  let success = true;

  if (card.verb === "NewBusiness") {
    const openTopics = TOPICS.filter((t) => !state.minutes[t]);
    const topic = commit.targetTopic && openTopics.includes(commit.targetTopic) ? commit.targetTopic : openTopics[0];
    state.minutes[topic] = { topic, status: "Raised", credit: winner.playerId, resolve: card.sustain + statusResolveModifier("Raised"), pressure: 0 };
    state.floor = { topic, status: "Raised" };
    effectText = `${winnerPlayer.name} raised new business: ${topic}.`;
  } else if (card.verb === "Overtime") {
    const bonuses = [5, 3, 1];
    const bonus = bonuses[Math.min(state.overtimeUses, bonuses.length - 1)];
    state.overtimeUses += 1;
    state.duration += bonus;
    state.fatigue += 1;
    effectText = `${winnerPlayer.name}: "Can I just add one more thing?" (+${bonus} Duration, +1 Fatigue)`;
  } else if (card.verb === "Add") {
    const topic = card.topic!;
    state.minutes[topic] = { topic, status: "Raised", credit: winner.playerId, resolve: card.sustain + statusResolveModifier("Raised"), pressure: 0 };
    state.floor = { topic, status: "Raised" };
    effectText = `${winnerPlayer.name} raised ${topic}.`;
  } else if (card.verb === "Rewrite") {
    const topic = card.topic!;
    const item = state.minutes[topic]!;
    if (card.sustain >= item.resolve) {
      item.status = card.resultStatus!;
      item.credit = winner.playerId;
      item.resolve = card.sustain + statusResolveModifier(card.resultStatus!);
      item.pressure = 0;
      state.floor = { topic, status: item.status };
      effectText = `${winnerPlayer.name} moved ${topic} to ${item.status}.`;
    } else {
      success = false;
      item.resolve = Math.max(0, item.resolve - 1);
      effectText = `${winnerPlayer.name}'s attempt to rewrite ${topic} bounced. It's a little easier to crack now.`;
    }
  } else if (card.verb === "Remove") {
    const topic = card.topic!;
    const item = state.minutes[topic]!;
    if (card.sustain >= item.resolve) {
      const wasApproved = item.status === "Approved";
      state.removeEvents.push({ topic, removedCredit: item.credit, removedBy: winner.playerId, round: state.round });
      delete state.minutes[topic];
      if (state.floor?.topic === topic) state.floor = null;
      if (wasApproved) winnerPlayer.decayPenalty += 1; // undoing a done deal costs extra
      effectText = `${winnerPlayer.name} struck ${topic} from the record.${wasApproved ? " Undoing an Approved item cost extra Decay." : ""}`;
    } else {
      success = false;
      item.resolve = Math.max(0, item.resolve - 1);
      effectText = `${winnerPlayer.name}'s attempt to remove ${topic} bounced.`;
    }
  }

  if (card.verb !== "Overtime") {
    state.duration = Math.max(0, state.duration - card.sustain);
  }
  winnerPlayer.decayPenalty += card.sideEffect === "Deflect" ? Math.floor(card.decay / 2) : card.decay;
  if (winningPlay) winningPlay.success = success;

  if (card.sideEffect) {
    if (winningPlay) winningPlay.sideEffect = card.sideEffect;
    const sideEffectText = applySideEffect(state, winner.playerId, card, card.topic);
    if (sideEffectText) effectText += ` ${sideEffectText}`;
  }

  state.log.push({ round, text: effectText });

  const talkedOver = allPlays.filter((p) => !p.isWinner).map((p) => p.playerName);
  if (talkedOver.length > 0) {
    state.log.push({ round, text: `Talked over: ${talkedOver.join(", ")}.` });
  }

  advanceRound(state);
  checkEndConditions(state);

  return { round, plays: allPlays, passed, outcomeText: effectText };
}

function checkEndConditions(state: GameState): void {
  if (state.phase === "ended") return;
  if (checkSharedAgenda(state)) {
    endGame(state, "shared-agenda-complete");
    return;
  }
  if (state.round > state.config.roundSafetyCap) {
    endGame(state, "safety-cap");
    return;
  }
  if (state.duration <= 0) {
    const anyoneCanStillAct = [...state.players.values()].some((p) =>
      p.hand.some((cid) => isLegal(state.deckById.get(cid)!, state))
    );
    if (!anyoneCanStillAct) {
      endGame(state, "duration-exhausted");
      return;
    }
  }
}

function advanceRound(state: GameState) {
  for (const [playerId, commit] of state.commits.entries()) {
    if (commit.cardId !== null) {
      const player = state.players.get(playerId)!;
      player.hand = player.hand.filter((c) => c !== commit.cardId);
      player.discardPile.push(commit.cardId);
      drawUpTo(state, playerId);
    }
  }
  state.commits.clear();
  state.round += 1;
  state.chairSeat = (state.chairSeat + 1) % state.seatOrder.length;

  // Tabled items fade: their Resolve drops on its own each round they sit untouched.
  for (const item of Object.values(state.minutes) as LineItem[]) {
    if (item.status === "Tabled") item.resolve = Math.max(0, item.resolve - 1);
  }
}

function checkSharedAgenda(state: GameState): boolean {
  const approved = Object.values(state.minutes).filter((i) => (i as LineItem).status === "Approved");
  return approved.length >= 2;
}

function endGame(state: GameState, reason: EndSummary["reason"]) {
  state.phase = "ended";
  const approvedItems = (Object.values(state.minutes) as LineItem[]).filter((i) => i.status === "Approved");

  const players = [...state.players.values()].map((p) => {
    const creditedItems = (Object.values(state.minutes) as LineItem[]).filter((i) => i.credit === p.id);
    const item = state.minutes[p.hiddenAgenda.topic];
    const isApproved = !!item && item.status === "Approved";
    const hiddenAgendaSuccess = p.hiddenAgenda.stance === "Approve" ? isApproved : !isApproved;
    return {
      id: p.id,
      name: p.name,
      hiddenAgenda: p.hiddenAgenda,
      hiddenAgendaSuccess,
      creditedApproved: creditedItems.filter((i) => i.status === "Approved").length,
      creditedTotal: creditedItems.length,
    };
  });

  state.endSummary = {
    sharedAgendaSuccess: approvedItems.length >= 2,
    approvedCount: approvedItems.length,
    players,
    rounds: state.round - 1,
    reason,
  };

  const verdict = state.endSummary.sharedAgendaSuccess
    ? "MEETING ADJOURNED. The Shared Agenda was met."
    : "The meeting ran long. We'll pick this up next time.";
  state.log.push({ round: state.round, text: verdict });
}
