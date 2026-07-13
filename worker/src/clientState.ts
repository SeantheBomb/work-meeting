import { ClientGameState } from "../../shared/protocol";
import { GameState } from "./engine";

export function buildClientState(game: GameState, viewerId: string): ClientGameState {
  const me = game.players.get(viewerId)!;
  const players = game.seatOrder.map((id) => {
    const p = game.players.get(id)!;
    return {
      id: p.id,
      name: p.name,
      connected: p.connected,
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
    },
    players,
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
    drawPileCount: game.drawPile.length,
    discardPileCount: game.discardPile.length,
  };
}
