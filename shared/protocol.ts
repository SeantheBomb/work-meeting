import { AgendaCard, CardDef, EndSummary, GameConfig, GamePhase, LogEntry, RoundReveal, Topic, TopicState } from "./types";

export type ClientMessage =
  | { type: "join"; playerId: string; name: string }
  | { type: "start" }
  | { type: "draft-pick"; cardId: string }
  | { type: "draft-auto-pick" }
  | { type: "commit"; cardId: string | null; attackSpend?: number }
  | { type: "discard-swap"; cardId: string }
  | { type: "chat"; templateId: string; values: string[] }
  | { type: "vote"; candidatePlayerId: string }
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
  agendaCard: AgendaCard;
  stamina: number;
  drawPileCount: number;
  discardPileCount: number;
  avatar: string;
}

export interface PlayerPublicView {
  id: string;
  name: string;
  connected: boolean;
  isBot: boolean;
  handCount: number;
  stamina: number;
  seat: number;
  avatar: string;
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

export interface PendingVoteCandidate {
  playerId: string;
  playerName: string;
  card: CardDef;
}

export interface PendingVoteCast {
  voterId: string;
  voterName: string;
  candidatePlayerId: string;
}

/** A tie among top-Attack legal plays. Present only while at least one eligible voter
 * (anyone whose own card isn't part of the tie) hasn't voted yet. See DESIGN_NOTES.md
 * section 7 -- ties are settled by table vote instead of always going to the Chair. */
export interface PendingVoteView {
  candidates: PendingVoteCandidate[];
  voterIds: string[];
  votes: PendingVoteCast[];
  youAreVoter: boolean;
  youHaveVoted: boolean;
}

export interface ClientGameState {
  phase: GamePhase;
  you: YouView;
  players: PlayerPublicView[];
  draft?: DraftView;
  pendingVote?: PendingVoteView;
  /** All 4 Topics, always -- see shared/types.ts. */
  topics: Record<Topic, TopicState>;
  /** Whether an Undo card currently has anything to revert -- lets the client preview
   * the "undo" effect's legality without knowing the actual snapshot contents. */
  hasUndoTarget: boolean;
  duration: number;
  round: number;
  chairSeat: number;
  fatigue: number;
  log: LogEntry[];
  committedPlayerIds: string[];
  /** Whether YOU have used this round's one free discard-swap (doesn't consume the turn). */
  youSwappedThisRound: boolean;
  config: GameConfig;
  endSummary?: EndSummary;
}

export type ServerMessage =
  | { type: "lobby"; roomCode: string; players: LobbyPlayerView[]; youId: string; hostId: string }
  | { type: "state"; state: ClientGameState }
  | { type: "reveal"; reveal: RoundReveal }
  | { type: "chat"; chat: import("./chat").ChatBroadcast }
  | { type: "error"; message: string };
