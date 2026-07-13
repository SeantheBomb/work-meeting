export const TOPICS = ["Budget", "Timeline", "Personnel", "Strategy", "Operations"] as const;
export type Topic = (typeof TOPICS)[number];

export const STATUSES = ["Raised", "Disputed", "Tabled", "Approved"] as const;
export type Status = (typeof STATUSES)[number];

export type Verb = "Add" | "Rewrite" | "Remove" | "NewBusiness" | "Overtime";

export type CardTemplateId = "QuickNote" | "PushBack" | "TableIt" | "SignOff" | "ShootDown";

/** A concrete card instance in the deck (topic-specific, or a universal card). */
export interface CardDef {
  /** Stable id, e.g. "Budget-QuickNote" or "NewBusinessA" */
  id: string;
  name: string;
  /** Plain-English mechanical effect, e.g. "Rewrite Budget to Disputed. Needs Sustain >= the item's Entrenchment to succeed." */
  effectText: string;
  flavorText: string;
  topic: Topic | null;
  verb: Verb;
  /** The Status this card produces/targets, for Floor-matching purposes. null for Remove/wild cards. */
  resultStatus: Status | null;
  attack: number;
  sustain: number;
  decay: number;
}

export interface LineItem {
  topic: Topic;
  status: Status;
  /** playerId currently credited */
  credit: string;
  /** stored Sustain of whichever card most recently wrote this item */
  entrenchment: number;
}

export interface Floor {
  topic: Topic;
  status: Status;
}

export type HiddenAgendaType =
  | "CreditOnApproved"
  | "CreditOnTwoPlusItems"
  | "TopicNeverApproved"
  | "ItemRemovedByOther";

export interface HiddenAgenda {
  type: HiddenAgendaType;
  /** for TopicNeverApproved: the topic that must never reach Approved */
  targetTopic?: Topic;
}

export interface GameConfig {
  startingDuration: number;
  handSize: number;
  roundSafetyCap: number;
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
  /** only meaningful when isWinner: false means the entrenchment check bounced */
  success: boolean;
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

export type GamePhase = "lobby" | "commit" | "reveal" | "ended";

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
