import { ClientGameState, DraftView, PendingVoteView } from "../../shared/protocol";
import { draftTurnPlayerId, GameState } from "./engine";

function buildPendingVoteView(game: GameState, viewerId: string): PendingVoteView | undefined {
  const vote = game.pendingVote;
  if (!vote) return undefined;
  return {
    candidates: vote.candidates.map((c) => {
      const player = game.players.get(c.playerId)!;
      const card = game.deckById.get(c.cardId)!;
      return { playerId: c.playerId, playerName: player.name, card };
    }),
    voterIds: vote.voterIds,
    votes: vote.votes.map((v) => ({
      voterId: v.voterId,
      voterName: game.players.get(v.voterId)!.name,
      candidatePlayerId: v.candidatePlayerId,
    })),
    youAreVoter: vote.voterIds.includes(viewerId),
    youHaveVoted: vote.votes.some((v) => v.voterId === viewerId),
  };
}

function buildDraftView(game: GameState, viewerId: string): DraftView {
  const me = game.players.get(viewerId)!;
  const recentPicks = game.draftPicks.slice(-8).map((p) => {
    const player = game.players.get(p.playerId)!;
    return { playerId: p.playerId, playerName: player.name, cardId: p.cardId };
  });
  return {
    pool: game.draftPool.map((id) => game.deckById.get(id)!),
    deckSize: game.draftDeckSize,
    turnPlayerId: draftTurnPlayerId(game),
    yourDeck: me.personalDeck.map((id) => game.deckById.get(id)!),
    playerPickCounts: game.seatOrder.map((id) => {
      const p = game.players.get(id)!;
      return { playerId: p.id, playerName: p.name, count: p.personalDeck.length };
    }),
    recentPicks,
  };
}

export function buildClientState(game: GameState, viewerId: string): ClientGameState {
  const me = game.players.get(viewerId)!;
  const players = game.seatOrder.map((id) => {
    const p = game.players.get(id)!;
    return {
      id: p.id,
      name: p.name,
      connected: p.connected,
      isBot: p.isBot,
      handCount: p.hand.length,
      stamina: p.stamina,
      seat: p.seat,
      avatar: p.avatar ?? "🧑‍💼", // in-flight matches persisted before avatars existed
    };
  });

  return {
    phase: game.phase,
    you: {
      id: me.id,
      name: me.name,
      hand: me.hand.map((cid) => game.deckById.get(cid)!),
      agendaCard: me.agendaCard,
      stamina: me.stamina,
      drawPileCount: me.drawPile.length,
      discardPileCount: me.discardPile.length,
      avatar: me.avatar ?? "🧑‍💼",
    },
    players,
    draft: game.phase === "draft" ? buildDraftView(game, viewerId) : undefined,
    pendingVote: buildPendingVoteView(game, viewerId),
    topics: game.topics,
    hasUndoTarget: game.lastPlaySnapshot !== null,
    duration: game.duration,
    round: game.round,
    chairSeat: game.chairSeat,
    fatigue: game.fatigue,
    log: game.log.slice(-40),
    committedPlayerIds: [...game.commits.keys()],
    youSwappedThisRound: game.swappedThisRound.includes(viewerId),
    config: game.config,
    endSummary: game.endSummary,
  };
}
