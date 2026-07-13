export const TOPICS = ["Budget", "Timeline", "Personnel", "Strategy", "Operations"] as const;
export type Topic = (typeof TOPICS)[number];

export const STATUSES = ["Raised", "Disputed", "Tabled", "Approved"] as const;
export type Status = (typeof STATUSES)[number];

export type Verb = "Add" | "Rewrite" | "Remove" | "NewBusiness" | "Overtime";

export type CardTemplateId = "QuickNote" | "PushBack" | "TableIt" | "SignOff" | "ShootDown";

export const SIDE_EFFECTS = ["BonusDraw", "Peek", "Undermine", "Rebate", "Deflect"] as const;
export type SideEffectId = (typeof SIDE_EFFECTS)[number];

/** A concrete card instance in the deck (topic-specific, or a universal card). */
export interface CardDef {
  /** Stable id, e.g. "Budget-QuickNote" or "NewBusinessA" */
  id: string;
  name: string;
  /** Plain-English mechanical effect, e.g. "Rewrite Budget to Disputed. Needs Sustain >= the item's Resolve to succeed." */
  effectText: string;
  flavorText: string;
  topic: Topic | null;
  verb: Verb;
  /** The Status this card produces/targets, for Floor-matching purposes. null for Remove/wild cards. */
  resultStatus: Status | null;
  attack: number;
  sustain: number;
  decay: number;
  /** Triggers whenever this card wins priority (success or bounce). null for universal/wild cards. */
  sideEffect: SideEffectId | null;
}

export interface LineItem {
  topic: Topic;
  status: Status;
  /** playerId currently credited */
  credit: string;
  /** How hard this item is to overturn. Base = the Sustain of whichever card last wrote it, plus a
   * per-Status modifier (see engine.ts statusResolveModifier) -- Disputed/Approved add a bonus,
   * Tabled decays automatically each round it sits untouched. */
  resolve: number;
  /** Failed (talked-over) Rewrite/Remove attempts against this item accumulate here; at 3, Resolve
   * drops by 1 and this resets. Means a losing round still wears down the target. */
  pressure: number;
}

export interface Floor {
  topic: Topic;
  status: Status;
}

export type AgendaStance = "Approve" | "Block";

/** Every player gets exactly one (topic, stance) pair. Assignment guarantees no two players share
 * the identical pair, and whenever 2+ players share a topic they're split across both stances --
 * so agendas are never redundant and always create real opposition wherever they overlap. */
export interface HiddenAgenda {
  topic: Topic;
  stance: AgendaStance;
}

export interface GameConfig {
  startingDuration: number;
  handSize: number;
  roundSafetyCap: number;
  /** Cards each player drafts into their personal deck; auto-clamped to deck size / player count. */
  draftDeckSize: number;
  /** Talked-over Rewrite/Remove attempts accumulate Pressure on their target; at this
   * threshold Resolve drops by 1 and Pressure resets. See DESIGN_NOTES.md section 3. */
  pressureThreshold: number;
}

export interface LogEntry {
  round: number;
  text: string;
}

export type RoundOutcome =
  | { kind: "resolved"; cardId: string; playerId: string; success: boolean; effect: string }
  | { kind: "no-legal-plays" }
  | { kind: "awkward-silence" };

export interface RevealPlay {
  playerId: string;
  playerName: string;
  cardId: string;
  cardName: string;
  topic: Topic | null;
  effAttack: number;
  legal: boolean;
  isWinner: boolean;
  /** only meaningful when isWinner: false means the Resolve check bounced */
  success: boolean;
  /** the side effect that fired, if this play won priority and the card has one */
  sideEffect: SideEffectId | null;
}

export interface RoundReveal {
  round: number;
  plays: RevealPlay[];
  passed: string[];
  outcomeText: string;
}

export interface PlayerPublic {
  id: string;
  name: string;
  connected: boolean;
  handCount: number;
  decayPenalty: number;
  seat: number;
}

export type GamePhase = "lobby" | "draft" | "commit" | "ended";

export interface EndSummaryPlayer {
  id: string;
  name: string;
  hiddenAgenda: HiddenAgenda;
  hiddenAgendaSuccess: boolean;
  creditedApproved: number;
  creditedTotal: number;
}

export interface EndSummary {
  sharedAgendaSuccess: boolean;
  approvedCount: number;
  players: EndSummaryPlayer[];
  rounds: number;
  reason: "duration-exhausted" | "shared-agenda-complete" | "awkward-silence" | "safety-cap";
}
