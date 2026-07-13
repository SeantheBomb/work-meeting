import { CardDef, EndSummary, Floor, GameConfig, GamePhase, HiddenAgenda, LineItem, LogEntry, RoundReveal, Topic } from "./types";

export type ClientMessage =
  | { type: "join"; playerId: string; name: string }
  | { type: "start" }
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

export interface YouView {
  id: string;
  name: string;
  hand: CardDef[];
  hiddenAgenda: HiddenAgenda;
  decayPenalty: number;
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

export interface ClientGameState {
  phase: GamePhase;
  you: YouView;
  players: PlayerPublicView[];
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
  drawPileCount: number;
  discardPileCount: number;
}

export type ServerMessage =
  | { type: "lobby"; roomCode: string; players: LobbyPlayerView[]; youId: string; hostId: string }
  | { type: "state"; state: ClientGameState }
  | { type: "reveal"; reveal: RoundReveal }
  | { type: "error"; message: string };
