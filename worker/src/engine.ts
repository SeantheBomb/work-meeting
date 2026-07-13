import {
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
  Topic,
  TOPICS,
} from "../../shared/types";
import { HIDDEN_AGENDA_TYPES } from "../../shared/hiddenAgenda";

export interface PlayerState {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
  isBot: boolean;
  hand: string[]; // card ids
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

export interface GameState {
  matchId: string;
  phase: GamePhase;
  config: GameConfig;
  deckById: Map<string, CardDef>;
  players: Map<string, PlayerState>;
  seatOrder: string[]; // playerId by seat
  drawPile: string[];
  discardPile: string[];
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

export function createGame(
  playerInputs: { id: string; name: string; isBot: boolean }[],
  deck: CardDef[],
  config: GameConfig,
  seed = Date.now(),
  matchId = crypto.randomUUID()
): GameState {
  const rng = mulberry32(seed);
  const deckById = new Map(deck.map((c) => [c.id, c]));
  const shuffled = shuffle(
    deck.map((c) => c.id),
    rng
  );

  const seatOrder = playerInputs.map((p) => p.id);
  const players = new Map<string, PlayerState>();
  const handSize = Math.max(1, Math.min(config.handSize, Math.floor(deck.length / Math.max(1, playerInputs.length))));

  let cursor = 0;
  const hiddenAgendaTypes = shuffle(HIDDEN_AGENDA_TYPES, rng);
  playerInputs.forEach((p, seat) => {
    const hand = shuffled.slice(cursor, cursor + handSize);
    cursor += handSize;
    const agendaType = hiddenAgendaTypes[seat % hiddenAgendaTypes.length];
    const hiddenAgenda: HiddenAgenda =
      agendaType === "TopicNeverApproved"
        ? { type: agendaType, targetTopic: TOPICS[Math.floor(rng() * TOPICS.length)] }
        : { type: agendaType };
    players.set(p.id, {
      id: p.id,
      name: p.name,
      seat,
      connected: true,
      isBot: p.isBot,
      hand,
      decayPenalty: 0,
      hiddenAgenda,
    });
  });

  return {
    matchId,
    phase: "commit",
    config,
    deckById,
    players,
    seatOrder,
    drawPile: shuffled.slice(cursor),
    discardPile: [],
    minutes: {},
    floor: null,
    duration: config.startingDuration,
    round: 1,
    chairSeat: 0,
    overtimeUses: 0,
    fatigue: 0,
    commits: new Map(),
    log: [{ round: 0, text: "The meeting has started. Someone should probably take minutes." }],
    removeEvents: [],
  };
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

function cardTopicMatches(card: CardDef, floor: Floor | null): boolean {
  if (!floor) return true;
  if (card.topic && card.topic === floor.topic) return true;
  if (card.resultStatus && card.resultStatus === floor.status) return true;
  return false;
}

export function isLegal(card: CardDef, state: GameState): boolean {
  if (card.sustain > state.duration && card.verb !== "Overtime") return false;
  if (card.verb === "NewBusiness") {
    return TOPICS.some((t) => !state.minutes[t]);
  }
  if (card.verb === "Overtime") {
    return true;
  }
  if (card.verb === "Add") {
    const topic = card.topic!;
    if (state.minutes[topic]) return false; // must be untouched
    if (!state.floor) return true;
    if (state.floor.status === "Raised") return true;
    return false;
  }
  if (card.verb === "Rewrite") {
    const topic = card.topic!;
    const item = state.minutes[topic];
    if (!item) return false;
    return cardTopicMatches(card, state.floor);
  }
  if (card.verb === "Remove") {
    if (!state.floor) return false;
    if (card.topic !== state.floor.topic) return false;
    return true;
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
  while (player.hand.length < state.config.handSize) {
    if (state.drawPile.length === 0) {
      if (state.discardPile.length === 0) return;
      state.drawPile = shuffle(state.discardPile, Math.random);
      state.discardPile = [];
    }
    const drawn = state.drawPile.pop();
    if (!drawn) return;
    player.hand.push(drawn);
  }
}

function findNewLiveFloor(state: GameState): Floor | null {
  const items = Object.values(state.minutes) as LineItem[];
  if (items.length === 0) return null;
  const last = items[items.length - 1];
  return { topic: last.topic, status: last.status };
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
    });
    if (legal) candidates.push({ playerId, card, effAttack, seat: player.seat });
  }

  const round = state.round;
  const allPlayedCardIds = [...state.commits.values()].filter((c) => c.cardId !== null).map((c) => c.cardId!) as string[];

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
    advanceRound(state, allPlayedCardIds);
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

  let effectText = "";
  let success = true;

  if (card.verb === "NewBusiness") {
    const openTopics = TOPICS.filter((t) => !state.minutes[t]);
    const topic = commit.targetTopic && openTopics.includes(commit.targetTopic) ? commit.targetTopic : openTopics[0];
    state.minutes[topic] = { topic, status: "Raised", credit: winner.playerId, entrenchment: card.sustain };
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
    state.minutes[topic] = { topic, status: "Raised", credit: winner.playerId, entrenchment: card.sustain };
    state.floor = { topic, status: "Raised" };
    effectText = `${winnerPlayer.name} raised ${topic}.`;
  } else if (card.verb === "Rewrite") {
    const topic = card.topic!;
    const item = state.minutes[topic]!;
    if (card.sustain >= item.entrenchment) {
      item.status = card.resultStatus!;
      item.credit = winner.playerId;
      item.entrenchment = card.sustain;
      state.floor = { topic, status: item.status };
      effectText = `${winnerPlayer.name} moved ${topic} to ${item.status}.`;
    } else {
      success = false;
      item.entrenchment = Math.max(0, item.entrenchment - 1);
      effectText = `${winnerPlayer.name}'s attempt to rewrite ${topic} bounced. It's a little easier to crack now.`;
    }
  } else if (card.verb === "Remove") {
    const topic = state.floor!.topic;
    const item = state.minutes[topic]!;
    if (card.sustain >= item.entrenchment) {
      state.removeEvents.push({ topic, removedCredit: item.credit, removedBy: winner.playerId, round: state.round });
      delete state.minutes[topic];
      state.floor = findNewLiveFloor(state);
      effectText = `${winnerPlayer.name} struck ${topic} from the record.`;
    } else {
      success = false;
      item.entrenchment = Math.max(0, item.entrenchment - 1);
      effectText = `${winnerPlayer.name}'s attempt to remove ${topic} bounced.`;
    }
  }

  if (card.verb !== "Overtime") {
    state.duration = Math.max(0, state.duration - card.sustain);
  }
  winnerPlayer.decayPenalty += card.decay;
  if (winningPlay) winningPlay.success = success;

  state.log.push({ round, text: effectText });

  const talkedOver = allPlays.filter((p) => !p.isWinner).map((p) => p.playerName);
  if (talkedOver.length > 0) {
    state.log.push({ round, text: `Talked over: ${talkedOver.join(", ")}.` });
  }

  advanceRound(state, allPlayedCardIds);
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

function advanceRound(state: GameState, playedCardIds: string[]) {
  state.discardPile.push(...playedCardIds);
  for (const [playerId, commit] of state.commits.entries()) {
    if (commit.cardId !== null) {
      const player = state.players.get(playerId)!;
      player.hand = player.hand.filter((c) => c !== commit.cardId);
      drawUpTo(state, playerId);
    }
  }
  state.commits.clear();
  state.round += 1;
  state.chairSeat = (state.chairSeat + 1) % state.seatOrder.length;
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
    let hiddenAgendaSuccess = false;
    switch (p.hiddenAgenda.type) {
      case "CreditOnApproved":
        hiddenAgendaSuccess = approvedItems.some((i) => i.credit === p.id);
        break;
      case "CreditOnTwoPlusItems":
        hiddenAgendaSuccess = creditedItems.length >= 2;
        break;
      case "TopicNeverApproved": {
        const item = state.minutes[p.hiddenAgenda.targetTopic!];
        hiddenAgendaSuccess = !item || item.status !== "Approved";
        break;
      }
      case "ItemRemovedByOther":
        hiddenAgendaSuccess = state.removeEvents.some((e) => e.removedCredit !== p.id);
        break;
    }
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
