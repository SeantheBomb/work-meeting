import { CardDef } from "../../shared/types";
import { Commit, GameState, Peek, PlayerState, RemoveEvent } from "./engine";

export interface PersistedGameState {
  matchId: string;
  phase: GameState["phase"];
  config: GameState["config"];
  deck: CardDef[];
  players: [string, PlayerState][];
  seatOrder: string[];
  draftPool: string[];
  draftPickNumber: number;
  draftDeckSize: number;
  draftPicks: GameState["draftPicks"];
  minutes: GameState["minutes"];
  floor: GameState["floor"];
  duration: number;
  round: number;
  chairSeat: number;
  overtimeUses: number;
  fatigue: number;
  commits: [string, Commit][];
  log: GameState["log"];
  removeEvents: RemoveEvent[];
  peeks: Peek[];
  endSummary: GameState["endSummary"];
}

export function toPersisted(state: GameState): PersistedGameState {
  return {
    matchId: state.matchId,
    phase: state.phase,
    config: state.config,
    deck: [...state.deckById.values()],
    players: [...state.players.entries()],
    seatOrder: state.seatOrder,
    draftPool: state.draftPool,
    draftPickNumber: state.draftPickNumber,
    draftDeckSize: state.draftDeckSize,
    draftPicks: state.draftPicks,
    minutes: state.minutes,
    floor: state.floor,
    duration: state.duration,
    round: state.round,
    chairSeat: state.chairSeat,
    overtimeUses: state.overtimeUses,
    fatigue: state.fatigue,
    commits: [...state.commits.entries()],
    log: state.log,
    removeEvents: state.removeEvents,
    peeks: state.peeks,
    endSummary: state.endSummary,
  };
}

export function fromPersisted(p: PersistedGameState): GameState {
  return {
    matchId: p.matchId,
    phase: p.phase,
    config: p.config,
    deckById: new Map(p.deck.map((c) => [c.id, c])),
    players: new Map(p.players),
    seatOrder: p.seatOrder,
    draftPool: p.draftPool,
    draftPickNumber: p.draftPickNumber,
    draftDeckSize: p.draftDeckSize,
    draftPicks: p.draftPicks,
    minutes: p.minutes,
    floor: p.floor,
    duration: p.duration,
    round: p.round,
    chairSeat: p.chairSeat,
    overtimeUses: p.overtimeUses,
    fatigue: p.fatigue,
    commits: new Map(p.commits),
    log: p.log,
    removeEvents: p.removeEvents,
    peeks: p.peeks ?? [],
    endSummary: p.endSummary,
  };
}
