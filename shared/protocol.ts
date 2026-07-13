import { CardDef, EndSummary, Floor, GameConfig, GamePhase, HiddenAgenda, LineItem, LogEntry, RoundReveal, Topic } from "./types";

export type ClientMessage =
  | { type: "join"; playerId: string; name: string }
  | { type: "start" }
  | { type: "draft-pick"; cardId: string }
  | { type: "commit"; cardId: string | null; targetTopic?: Topic }
  | { type: "restart" }
  | { type: "add-bot" }
  | { type: "remove-bot"; playerId: string };

export interface LobbyPlayerView {
  id: string;
  name: string;
  connected: boolean;
  isBot: boolean;
}

export interface KnownAgendaView {
  playerId: string;
  playerName: string;
  agenda: HiddenAgenda;
}

export interface YouView {
  id: string;
  name: string;
  hand: CardDef[];
  hiddenAgenda: HiddenAgenda;
  decayPenalty: number;
  drawPileCount: number;
  discardPileCount: number;
  /** Opponents' Hidden Agendas learned via the Peek side effect this match. */
  knownAgendas: KnownAgendaView[];
}

export interface PlayerPublicView {
  id: string;
  name: string;
  connected: boolean;
  isBot: boolean;
  handCount: number;
  decayPenalty: number;
  seat: number;
}

export interface DraftPickView {
  playerId: string;
  playerName: string;
  cardId: string;
}

export interface DraftView {
  pool: CardDef[]; // cards not yet drafted by anyone
  deckSize: number; // cards each player is drafting
  turnPlayerId: string | null; // null once the draft is complete
  yourDeck: CardDef[]; // what you've drafted so far, in pick order
  playerPickCounts: { playerId: string; playerName: string; count: number }[];
  recentPicks: DraftPickView[]; // most recent picks across the table, newest last
}

export interface ClientGameState {
  phase: GamePhase;
  you: YouView;
  players: PlayerPublicView[];
  draft?: DraftView;
  minutes: Partial<Record<Topic, LineItem>>;
  floor: Floor | null;
  duration: number;
  round: number;
  chairSeat: number;
  fatigue: number;
  overtimeUses: number;
  log: LogEntry[];
  committedPlayerIds: string[];
  config: GameConfig;
  endSummary?: EndSummary;
}

export type ServerMessage =
  | { type: "lobby"; roomCode: string; players: LobbyPlayerView[]; youId: string; hostId: string }
  | { type: "state"; state: ClientGameState }
  | { type: "reveal"; reveal: RoundReveal }
  | { type: "error"; message: string };
