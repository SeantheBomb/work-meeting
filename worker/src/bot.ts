import { CardDef, Topic, TOPICS } from "../../shared/types";
import { GameState, isLegal, PlayerState } from "./engine";

/**
 * Simple heuristic bot: scores each legal card in hand by how much it advances
 * the Shared Agenda (2+ Approved) and the bot's own Hidden Agenda, with a small
 * random jitter so bots aren't fully predictable round to round. Not adversarial
 * about other players' hidden agendas — it just tries not to sabotage its own.
 */
function scoreCard(card: CardDef, state: GameState, player: PlayerState): number {
  let score = card.attack;

  if (card.verb === "Add") {
    score += 4;
  } else if (card.verb === "NewBusiness") {
    score += 3;
  } else if (card.verb === "Rewrite") {
    const item = state.minutes[card.topic!]!;
    const willSucceed = card.sustain >= item.entrenchment;
    if (willSucceed) {
      score += 5;
      if (card.resultStatus === "Approved") {
        score += 8;
        if (player.hiddenAgenda.type === "TopicNeverApproved" && player.hiddenAgenda.targetTopic === card.topic) {
          score -= 20;
        }
        if (player.hiddenAgenda.type === "CreditOnApproved") score += 6;
      }
      if (player.hiddenAgenda.type === "CreditOnTwoPlusItems" && item.credit !== player.id) score += 4;
    } else {
      score -= 3;
    }
  } else if (card.verb === "Remove") {
    const item = state.minutes[card.topic!]!;
    const willSucceed = card.sustain >= item.entrenchment;
    if (willSucceed) {
      score += 3;
      if (item.status === "Approved") score -= 6;
      if (item.credit !== player.id) {
        score += 2;
        if (player.hiddenAgenda.type === "ItemRemovedByOther") score += 3;
      }
      if (
        player.hiddenAgenda.type === "TopicNeverApproved" &&
        item.topic === player.hiddenAgenda.targetTopic &&
        item.status !== "Approved"
      ) {
        score += 5;
      }
    } else {
      score -= 2;
    }
  } else if (card.verb === "Overtime") {
    score -= 4;
  }

  score += (Math.random() - 0.5) * 2;
  return score;
}

function pickTopicForNewBusiness(state: GameState, player: PlayerState): Topic {
  const open = TOPICS.filter((t) => !state.minutes[t]);
  const forbidden = player.hiddenAgenda.type === "TopicNeverApproved" ? player.hiddenAgenda.targetTopic : undefined;
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
