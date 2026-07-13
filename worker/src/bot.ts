import { CardDef, HiddenAgenda, SideEffectId, Topic, TOPICS } from "../../shared/types";
import { GameState, isLegal, PlayerState } from "./engine";

function sideEffectBonus(id: SideEffectId | null): number {
  switch (id) {
    case "BonusDraw":
      return 1.5;
    case "Rebate":
      return 1;
    case "Undermine":
      return 1;
    case "Deflect":
      return 1;
    case "Peek":
      return 0.5;
    default:
      return 0;
  }
}

/**
 * Simple heuristic bot: scores each legal card in hand by how much it advances
 * the Shared Agenda (2+ Approved) and the bot's own Hidden Agenda, with a small
 * random jitter so bots aren't fully predictable round to round. Not adversarial
 * about other players' hidden agendas — it just tries not to sabotage its own.
 */
function scoreCard(card: CardDef, state: GameState, player: PlayerState): number {
  let score = card.attack;
  const agenda = player.hiddenAgenda;
  const isOwnAgendaTopic = card.topic === agenda.topic;

  if (card.verb === "Add") {
    score += 4;
  } else if (card.verb === "NewBusiness") {
    score += 3;
  } else if (card.verb === "Rewrite") {
    const item = state.minutes[card.topic!]!;
    const willSucceed = card.sustain >= item.resolve;
    if (willSucceed) {
      score += 5;
      if (card.resultStatus === "Approved") {
        score += 8;
        if (isOwnAgendaTopic) score += agenda.stance === "Approve" ? 10 : -20;
      } else if (isOwnAgendaTopic && agenda.stance === "Block") {
        score += 2; // keep it busy in Disputed/Tabled rather than let it drift toward Approved
      }
    } else {
      score -= 3;
    }
  } else if (card.verb === "Remove") {
    const item = state.minutes[card.topic!]!;
    const willSucceed = card.sustain >= item.resolve;
    if (willSucceed) {
      score += 3;
      if (item.status === "Approved") {
        score -= 6;
        if (isOwnAgendaTopic && agenda.stance === "Block") score += 15; // rescue: undo the approval before it's final
      }
      if (isOwnAgendaTopic && agenda.stance === "Approve") score -= 10; // don't destroy your own progress
      if (item.credit !== player.id) score += 2;
    } else {
      score -= 2;
    }
  } else if (card.verb === "Overtime") {
    score -= 4;
  }

  score += sideEffectBonus(card.sideEffect);
  score += (Math.random() - 0.5) * 2;
  return score;
}

function pickTopicForNewBusiness(state: GameState, player: PlayerState): Topic {
  const open = TOPICS.filter((t) => !state.minutes[t]);
  const forbidden = player.hiddenAgenda.stance === "Block" ? player.hiddenAgenda.topic : undefined;
  const preferred = open.filter((t) => t !== forbidden);
  const pool = preferred.length > 0 ? preferred : open;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function chooseBotCommit(state: GameState, playerId: string): { cardId: string | null; targetTopic?: Topic } {
  const player = state.players.get(playerId);
  if (!player) return { cardId: null };

  const legal = player.hand.map((id) => state.deckById.get(id)!).filter((c) => isLegal(c, state));
  if (legal.length === 0) return { cardId: null };

  let best = legal[0];
  let bestScore = -Infinity;
  for (const card of legal) {
    const s = scoreCard(card, state, player);
    if (s > bestScore) {
      bestScore = s;
      best = card;
    }
  }

  if (best.verb === "NewBusiness") {
    return { cardId: best.id, targetTopic: pickTopicForNewBusiness(state, player) };
  }
  return { cardId: best.id };
}

/**
 * Draft-time card evaluation. There's no board state yet, so this scores raw power
 * (Attack + Sustain) plus fit with the bot's own Hidden Agenda, and mildly penalizes
 * stacking too many cards on one Topic so the bot doesn't draft itself into a corner
 * where it can only ever act on one thread of the Minutes.
 */
function scoreDraftPick(card: CardDef, alreadyDrafted: CardDef[], hiddenAgenda: HiddenAgenda): number {
  let score = card.attack + card.sustain * 0.6;

  if (card.verb === "NewBusiness" || card.verb === "Overtime") score += 2;

  if (card.topic === hiddenAgenda.topic) {
    if (card.resultStatus === "Approved") score += hiddenAgenda.stance === "Approve" ? 6 : -4;
    if (card.verb === "Remove") score += hiddenAgenda.stance === "Block" ? 5 : -2;
  }

  score += sideEffectBonus(card.sideEffect);

  if (card.topic) {
    const sameTopicCount = alreadyDrafted.filter((c) => c.topic === card.topic).length;
    score -= sameTopicCount * 1.5;
  }

  score += (Math.random() - 0.5) * 2;
  return score;
}

export function chooseBotDraftPick(state: GameState, playerId: string): string {
  const player = state.players.get(playerId)!;
  const pool = state.draftPool.map((id) => state.deckById.get(id)!);
  const alreadyDrafted = player.personalDeck.map((id) => state.deckById.get(id)!);

  let best = pool[0];
  let bestScore = -Infinity;
  for (const card of pool) {
    const s = scoreDraftPick(card, alreadyDrafted, player.hiddenAgenda);
    if (s > bestScore) {
      bestScore = s;
      best = card;
    }
  }
  return best.id;
}
