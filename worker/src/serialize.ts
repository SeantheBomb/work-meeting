import { CardDef } from "../../shared/types";
import { Commit, GameState, PendingVote, PlayerState, PlaySnapshot } from "./engine";

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
  topics: GameState["topics"];
  duration: number;
  round: number;
  chairSeat: number;
  fatigue: number;
  commits: [string, Commit][];
  swappedThisRound: string[];
  log: GameState["log"];
  pendingVote: PendingVote | null;
  pendingSustainMultiplier: number;
  lastPlaySnapshot: PlaySnapshot | null;
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
    topics: state.topics,
    duration: state.duration,
    round: state.round,
    chairSeat: state.chairSeat,
    fatigue: state.fatigue,
    commits: [...state.commits.entries()],
    swappedThisRound: state.swappedThisRound,
    log: state.log,
    pendingVote: state.pendingVote,
    pendingSustainMultiplier: state.pendingSustainMultiplier,
    lastPlaySnapshot: state.lastPlaySnapshot,
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
    topics: p.topics,
    duration: p.duration,
    round: p.round,
    chairSeat: p.chairSeat,
    fatigue: p.fatigue,
    commits: new Map(p.commits),
    swappedThisRound: p.swappedThisRound ?? [],
    log: p.log,
    pendingVote: p.pendingVote ?? null,
    pendingSustainMultiplier: p.pendingSustainMultiplier ?? 1,
    lastPlaySnapshot: p.lastPlaySnapshot ?? null,
    endSummary: p.endSummary,
  };
}
