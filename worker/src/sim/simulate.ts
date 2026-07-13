import { CardDef, GameConfig } from "../../../shared/types";
import { chooseBotCommit } from "../bot";
import { allCommitted, commitCard, createGame, GameState, isLegal, resolveRound } from "../engine";

export interface MatchStats {
  numPlayers: number;
  rounds: number;
  sharedAgendaSuccess: boolean;
  approvedCount: number;
  endReason: string;
  totalPlayerDecisions: number;
  zeroLegalDecisions: number;
  oneLegalDecisions: number;
  twoPlusLegalDecisions: number;
  legalCountSum: number;
  cardLegalCounts: Map<string, number>;
  cardChosenCounts: Map<string, number>;
  cardWinCounts: Map<string, number>;
  cardBounceCounts: Map<string, number>;
  overtimeUses: number;
  bounces: number;
  hitSafetyCap: boolean;
}

function emptyStats(numPlayers: number): MatchStats {
  return {
    numPlayers,
    rounds: 0,
    sharedAgendaSuccess: false,
    approvedCount: 0,
    endReason: "",
    totalPlayerDecisions: 0,
    zeroLegalDecisions: 0,
    oneLegalDecisions: 0,
    twoPlusLegalDecisions: 0,
    legalCountSum: 0,
    cardLegalCounts: new Map(),
    cardChosenCounts: new Map(),
    cardWinCounts: new Map(),
    cardBounceCounts: new Map(),
    overtimeUses: 0,
    bounces: 0,
    hitSafetyCap: false,
  };
}

function bump(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

/** Runs one full match with `numPlayers` all-bot players against the given deck/config,
 * instrumenting decision-space (legal card counts at commit time) and card usage. */
export function simulateOneMatch(numPlayers: number, deck: CardDef[], config: GameConfig, seed: number): MatchStats {
  const stats = emptyStats(numPlayers);
  const players = Array.from({ length: numPlayers }, (_, i) => ({ id: `p${i}`, name: `Bot${i}`, isBot: true }));
  const state: GameState = createGame(players, deck, config, seed);

  let guard = 0;
  while (state.phase === "commit" && guard++ < 500) {
    for (const player of state.players.values()) {
      const legalCards = player.hand.map((id) => state.deckById.get(id)!).filter((c) => isLegal(c, state));

      stats.totalPlayerDecisions++;
      stats.legalCountSum += legalCards.length;
      if (legalCards.length === 0) stats.zeroLegalDecisions++;
      else if (legalCards.length === 1) stats.oneLegalDecisions++;
      else stats.twoPlusLegalDecisions++;
      for (const c of legalCards) bump(stats.cardLegalCounts, c.id);

      const choice = chooseBotCommit(state, player.id);
      if (choice.cardId) bump(stats.cardChosenCounts, choice.cardId);
      commitCard(state, player.id, choice.cardId, choice.targetTopic);
    }

    if (!allCommitted(state)) break;
    const reveal = resolveRound(state);
    for (const play of reveal.plays) {
      if (play.isWinner) {
        if (play.success) bump(stats.cardWinCounts, play.cardId);
        else {
          bump(stats.cardBounceCounts, play.cardId);
          stats.bounces++;
        }
      }
    }
    const winningCard = reveal.plays.find((p) => p.isWinner);
    if (winningCard && state.deckById.get(winningCard.cardId)?.verb === "Overtime") {
      stats.overtimeUses++;
    }
  }

  stats.rounds = state.round - 1;
  stats.hitSafetyCap = guard >= 500 || state.endSummary?.reason === "safety-cap";
  if (state.endSummary) {
    stats.sharedAgendaSuccess = state.endSummary.sharedAgendaSuccess;
    stats.approvedCount = state.endSummary.approvedCount;
    stats.endReason = state.endSummary.reason;
  } else {
    stats.endReason = "did-not-terminate";
  }
  return stats;
}

