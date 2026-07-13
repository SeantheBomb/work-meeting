import { CardDef } from "../../../shared/types";
import { MatchStats } from "./simulate";

/**
 * Criteria from HAPPY_PATH.md (interview with Sean, 2026-07-13). A match must clear
 * all five to count as "happy path." Round-length and bounce-rate are intentionally
 * left out -- no precise target was given, they're reported separately instead.
 */
export interface HappyPathResult {
  isHappy: boolean;
  failedCriteria: string[];
  maxCardShare: number;
  dominantCard: string | null;
  maxPlayerShare: number;
  zeroWinPlayers: number;
  hiddenAgendaAchieverCount: number;
}

/** Topic-locked cards are distinct per topic (Budget-QuickNote != Timeline-QuickNote);
 * same-named universal cards (the 4 New Business copies) are one functional card. */
function functionalIdentity(card: CardDef): string {
  return card.topic ? card.id : card.name;
}

export function evaluateHappyPath(stats: MatchStats, deckById: Map<string, CardDef>): HappyPathResult {
  const failedCriteria: string[] = [];

  if (!stats.sharedAgendaSuccess) failedCriteria.push("shared-agenda-failed");

  const cardSharesByIdentity = new Map<string, number>();
  for (const [cardId, wins] of stats.cardWinCounts) {
    const identity = functionalIdentity(deckById.get(cardId)!);
    cardSharesByIdentity.set(identity, (cardSharesByIdentity.get(identity) ?? 0) + wins);
  }
  let maxCardShare = 0;
  let dominantCard: string | null = null;
  for (const [identity, wins] of cardSharesByIdentity) {
    const share = stats.roundsWithWinner === 0 ? 0 : wins / stats.roundsWithWinner;
    if (share > maxCardShare) {
      maxCardShare = share;
      dominantCard = identity;
    }
  }
  if (maxCardShare > 1 / 3) failedCriteria.push("single-card-dominance");

  let maxPlayerShare = 0;
  let zeroWinPlayers = 0;
  for (let i = 0; i < stats.numPlayers; i++) {
    const wins = stats.playerWinCounts.get(`p${i}`) ?? 0;
    if (wins === 0) zeroWinPlayers++;
    const share = stats.roundsWithWinner === 0 ? 0 : wins / stats.roundsWithWinner;
    if (share > maxPlayerShare) maxPlayerShare = share;
  }
  // A flat 50% ceiling is nearly unreachable at 2 players (an odd round count makes
  // >50% for the leader almost unavoidable even in a "fair" 5-4 split). Scale the
  // ceiling to a fair-share-plus-margin instead: 1/N + 25 percentage points.
  const playerShareCeiling = 1 / stats.numPlayers + 0.25;
  if (maxPlayerShare > playerShareCeiling) failedCriteria.push("single-player-dominance");
  if (zeroWinPlayers > 0) failedCriteria.push("player-shut-out");

  if (stats.hiddenAgendaAchieverCount === 0) failedCriteria.push("no-hidden-agenda-achievers");
  if (stats.hiddenAgendaAchieverCount >= stats.numPlayers) failedCriteria.push("all-hidden-agenda-achievers");

  return {
    isHappy: failedCriteria.length === 0,
    failedCriteria,
    maxCardShare,
    dominantCard,
    maxPlayerShare,
    zeroWinPlayers,
    hiddenAgendaAchieverCount: stats.hiddenAgendaAchieverCount,
  };
}
