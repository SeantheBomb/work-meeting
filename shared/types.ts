/** Fixed at 4 Topics (see DESIGN_NOTES.md section 25/27) -- the Hidden Agenda's "which
 * 2 of 4 should be Approved" needs exactly C(4,2) = 6 distinct permutations to deal one
 * per player without repeats, which caps the table at 6 players. */
export const TOPICS = ["Budget", "Timeline", "Personnel", "Strategy"] as const;
export type Topic = (typeof TOPICS)[number];
export const MAX_PLAYERS = 6;

export type Axis = "Agreement" | "Pressure";

/** Every card is a transfer: take `amount` from one Topic's Agreement or Pressure axis
 * (the cost), and give it to another Topic's Agreement or Pressure axis (the benefit).
 * Legality is purely "is the cost payable" -- no separate requirement system. The cost
 * side is itself a real strategic act (draining Agreement from a Topic you secretly
 * want to stay unapproved reads identically to "just paying a cost"), which is the
 * built-in motive ambiguity the whole redesign is built around. `extendDuration` and
 * `durationMultiplier` are Duration-economy-only wildcards (no axis interaction at
 * all); `undo` reverts whatever the single most recent winning play did. See
 * DESIGN_NOTES.md section 27. */
export type CardEffect =
  | { kind: "transfer"; costTopic: Topic; costAxis: Axis; benefitTopic: Topic; benefitAxis: Axis; amount: number }
  | { kind: "extendDuration"; amount: number }
  | { kind: "durationMultiplier"; multiplier: number } // applies to the NEXT winning play's Sustain cost
  | { kind: "undo" };

export interface CardDef {
  id: string;
  name: string;
  effectText: string;
  flavorText: string;
  effect: CardEffect;
  /** Duration cost when this card wins priority. Every card has one -- Sustain's only
   * job is spending the shared clock, nothing else. See DESIGN_NOTES.md section 22. */
  sustain: number;
  /** Stamina returned to the player if this card wins priority. */
  staminaReturn: number;
}

/** A Topic's live state. No discrete status anymore -- Agreement (0-1, "Approved" is a
 * live >= threshold reading, not a permanent lock) and Pressure (0-1, dampens how much
 * an Agreement change actually applies: appliedDelta = nominal * (1 - pressure)) are
 * the whole model. `credit` is flavor/UI only (who moved it last), not scored. */
export interface TopicState {
  agreement: number;
  pressure: number;
  credit: string | null;
}

export type AgendaStance = "Approve" | "Reject";

export interface AgendaCell {
  topic: Topic;
  stance: AgendaStance;
}

/** Every player's Hidden Agenda is which 2 of the 4 Topics they want Approved (the
 * other 2 they want to stay below the approve threshold) -- always all 4 Topics
 * represented as one cell each, since Topics are no longer player-count-scaled. C(4,2)
 * = 6 distinct permutations dealt one per player, up to 6 players. See
 * DESIGN_NOTES.md section 25. */
export type AgendaCard = AgendaCell[];

export interface AgendaCellResult extends AgendaCell {
  achieved: boolean;
}

export interface GameConfig {
  startingDuration: number;
  handSize: number;
  roundSafetyCap: number;
  /** Cards each player drafts into their personal deck; auto-clamped to deck size / player count. */
  draftDeckSize: number;
  /** Every player's starting Stamina pool. */
  startingStamina: number;
  /** Flat Stamina earned by a plain Pass -- no growth for consecutive passes. Since a
   * bid is always spent and a card can never be played for 0 Stamina, this is the one
   * way back from an empty pool. */
  passReward: number;
  /** A Topic reads as Approved whenever its Agreement is currently >= this, live (not
   * locked) -- staying there is Pressure's job. Sim-tuned to 0.7: sits solidly below
   * the natural ~0.78-0.80 Pressure-friction ceiling instead of right at its edge.
   * See DESIGN_NOTES.md section 26. */
  approveThreshold: number;
  /** The flat amount (N) a transfer card moves before Pressure friction is applied. */
  transferAmount: number;
}

export interface LogEntry {
  round: number;
  text: string;
}

export interface RevealPlay {
  playerId: string;
  playerName: string;
  cardId: string;
  cardName: string;
  /** The Stamina this player chose to bid, before the Chair bonus. */
  baseAttack: number;
  /** The Chair's free +1, when this player held the Chair this round; 0 otherwise.
   * Shown separately so a "tie" that the Chair quietly wins by +1 reads as what it is. */
  chairBonus: number;
  /** baseAttack + chairBonus -- what actually competed for the floor. */
  effAttack: number;
  /** The card's own Stamina Return -- only meaningful if this play LOSES (talked-over
   * consolation; the winner pays their full bid with no Return). */
  staminaReturn: number;
  legal: boolean;
  isWinner: boolean;
}

/** One axis moved by the winning play, as a before/after pair -- lets the reveal
 * overlay show exactly what the card did while it's covering the board. */
export interface TopicChange {
  topic: Topic;
  axis: Axis;
  before: number;
  after: number;
}

export interface RoundReveal {
  round: number;
  plays: RevealPlay[];
  passed: string[];
  outcomeText: string;
  /** The full winning card, so the reveal can show a readable card face. Absent when
   * nobody won the round (all passes / nothing legal). */
  winningCard?: CardDef;
  winnerId?: string;
  winnerName?: string;
  topicChanges?: TopicChange[];
  /** Present when the top bid was tied: how the tie was actually broken. */
  tieNote?: string;
}

export interface PlayerPublic {
  id: string;
  name: string;
  connected: boolean;
  handCount: number;
  stamina: number;
  seat: number;
  avatar: string;
}

/** Silly-office-worker avatars, one unique per player in a room (6 players max, so a
 * pool comfortably bigger than that). Assigned at join, stable for the whole session. */
export const AVATARS = ["🧑‍💻", "👩‍💼", "🕴️", "🥸", "🧙", "🤠", "👵", "🧛", "🦸", "🧑‍🔧", "👨‍🎨", "🧑‍🚀"] as const;

export type GamePhase = "lobby" | "draft" | "commit" | "ended";

export interface EndSummaryPlayer {
  id: string;
  name: string;
  agendaCard: AgendaCellResult[];
  agendaAchievedCount: number;
  agendaSuccess: boolean;
}

export interface EndSummary {
  sharedAgendaSuccess: boolean;
  approvedCount: number;
  players: EndSummaryPlayer[];
  rounds: number;
  reason: "duration-exhausted" | "safety-cap";
}
