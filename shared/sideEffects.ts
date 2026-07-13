import { SideEffectId } from "./types";

/** Short player-facing description, appended to a card's effect text. Triggers whenever
 * the card wins priority (success or bounce) -- see DESIGN_NOTES.md section 2-3. */
export const SIDE_EFFECT_TEXT: Record<SideEffectId, string> = {
  BonusDraw: "Side effect: draw 1 extra card.",
  Peek: "Side effect: privately see one opponent's Hidden Agenda.",
  Undermine: "Side effect: drop a different topic's Resolve by 1.",
  Rebate: "Side effect: refund 1 Duration to the clock.",
  Deflect: "Side effect: halve this play's own Decay cost.",
};
