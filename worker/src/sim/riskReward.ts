import { CardDef, SideEffectId } from "../../../shared/types";
import { MatchStats } from "./simulate";

/** Designed value delivered by a fully-successful play (DESIGN_NOTES.md section 5) --
 * NOT measured, a deliberate design weight to compare against measured risk. */
function rewardWeight(card: CardDef): number {
  let base: number;
  if (card.verb === "Rewrite" && card.resultStatus === "Approved") base = 5;
  else if (card.verb === "Remove") base = 3;
  else if (card.verb === "Rewrite") base = 2;
  else if (card.verb === "Add" || card.verb === "NewBusiness") base = 2;
  else base = 1; // Overtime: utility, not agenda progress

  base += sideEffectRewardBonus(card.sideEffect);
  return base;
}

function sideEffectRewardBonus(id: SideEffectId | null): number {
  switch (id) {
    case "BonusDraw":
      return 1;
    case "Undermine":
      return 0.5;
    case "Rebate":
      return 0.5;
    case "Deflect":
      return 1;
    case "Peek":
      return 0.5;
    default:
      return 0;
  }
}

export interface CardRiskReward {
  id: string;
  name: string;
  reward: number;
  risk: number; // 0-1: chance the play delivers nothing or bounces, given it was chosen
  timesChosen: number;
  dominatedBy: string | null; // name of a card that's same-or-lower risk with strictly higher reward
}

export function computeRiskRewardTable(deck: CardDef[], statsList: MatchStats[]): CardRiskReward[] {
  const chosen = new Map<string, number>();
  const won = new Map<string, number>();
  const bounced = new Map<string, number>();
  for (const s of statsList) {
    for (const [id, n] of s.cardChosenCounts) chosen.set(id, (chosen.get(id) ?? 0) + n);
    for (const [id, n] of s.cardWinCounts) won.set(id, (won.get(id) ?? 0) + n);
    for (const [id, n] of s.cardBounceCounts) bounced.set(id, (bounced.get(id) ?? 0) + n);
  }

  const rows: CardRiskReward[] = deck.map((card) => {
    const timesChosen = chosen.get(card.id) ?? 0;
    const timesWon = won.get(card.id) ?? 0;
    const timesBounced = bounced.get(card.id) ?? 0;
    const delivered = timesWon; // won AND succeeded
    const risk = timesChosen === 0 ? 0 : 1 - delivered / timesChosen;
    return { id: card.id, name: card.topic ? `${card.topic}-${card.name}` : card.name, reward: rewardWeight(card), risk, timesChosen, dominatedBy: null };
  });

  for (const row of rows) {
    if (row.timesChosen === 0) continue;
    const dominator = rows.find(
      (o) => o.id !== row.id && o.timesChosen > 0 && o.risk <= row.risk && o.reward > row.reward && (o.risk < row.risk || o.reward > row.reward)
    );
    row.dominatedBy = dominator ? dominator.name : null;
  }

  return rows;
}

/** Pearson correlation between risk and reward across cards that were actually played
 * (weighted by how often chosen, so the spectrum reflects what came up in real matches).
 * Design goal from DESIGN_NOTES.md section 5: this should be positive -- riskier cards
 * should generally pay out more, not less. */
export function riskRewardCorrelation(rows: CardRiskReward[]): number {
  const played = rows.filter((r) => r.timesChosen > 0);
  if (played.length < 2) return 0;
  const meanRisk = played.reduce((a, r) => a + r.risk, 0) / played.length;
  const meanReward = played.reduce((a, r) => a + r.reward, 0) / played.length;
  let cov = 0;
  let varRisk = 0;
  let varReward = 0;
  for (const r of played) {
    const dr = r.risk - meanRisk;
    const dw = r.reward - meanReward;
    cov += dr * dw;
    varRisk += dr * dr;
    varReward += dw * dw;
  }
  if (varRisk === 0 || varReward === 0) return 0;
  return cov / Math.sqrt(varRisk * varReward);
}
