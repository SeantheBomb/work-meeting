import { ClientGameState, DraftView } from "../../shared/protocol";
import { draftTurnPlayerId, GameState } from "./engine";

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
      decayPenalty: p.decayPenalty,
      seat: p.seat,
    };
  });

  return {
    phase: game.phase,
    you: {
      id: me.id,
      name: me.name,
      hand: me.hand.map((cid) => game.deckById.get(cid)!),
      hiddenAgenda: me.hiddenAgenda,
      decayPenalty: me.decayPenalty,
      drawPileCount: me.drawPile.length,
      discardPileCount: me.discardPile.length,
      knownAgendas: game.peeks
        .filter((p) => p.viewerId === viewerId)
        .map((p) => {
          const about = game.players.get(p.aboutPlayerId)!;
          return { playerId: about.id, playerName: about.name, agenda: about.hiddenAgenda };
        }),
    },
    players,
    draft: game.phase === "draft" ? buildDraftView(game, viewerId) : undefined,
    minutes: game.minutes,
    floor: game.floor,
    duration: game.duration,
    round: game.round,
    chairSeat: game.chairSeat,
    fatigue: game.fatigue,
    overtimeUses: game.overtimeUses,
    log: game.log.slice(-40),
    committedPlayerIds: [...game.commits.keys()],
    config: game.config,
    endSummary: game.endSummary,
  };
}
