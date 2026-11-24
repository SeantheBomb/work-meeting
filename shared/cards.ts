import { Axis, CardDef, CardEffect, Topic, TOPICS } from "./types";

/** Plain-English mechanical effect text, generated from the card's effect so the UI
 * never has to special-case anything. */
function describeEffect(effect: CardEffect): string {
  switch (effect.kind) {
    case "transfer": {
      const points = Math.round(effect.amount * 100);
      return `Takes ${points} ${effect.costAxis} points from ${effect.costTopic} and gives them to ${effect.benefitTopic}'s ${effect.benefitAxis} (less if either Topic's Pressure resists it).`;
    }
    case "extendDuration":
      return `Adds ${effect.amount} to the shared Duration clock.`;
    case "durationMultiplier":
      return effect.multiplier < 1
        ? `The next card anywhere to win a round costs half its usual Duration.`
        : `The next card anywhere to win a round costs double its usual Duration.`;
    case "undo":
      return `Undoes whatever the single most recent winning play did, anywhere on the board.`;
  }
}

interface TransferTemplate {
  id: string;
  costAxis: Axis;
  benefitAxis: Axis;
  sustain: number;
  staminaReturn: number;
}

/**
 * The four transfer families (see DESIGN_NOTES.md section 27) -- one Agreement/Pressure
 * combination each, sharing mechanical stats (Sustain, Stamina Return) across all 12
 * ordered Topic pairs. Naming and flavor, though, are bespoke per pair (see
 * TRANSFER_CONTENT below) -- see DESIGN_NOTES.md section 31. This is also the expansion
 * point: a new family is just one more entry here plus 12 more content rows.
 */
const TRANSFER_TEMPLATES: TransferTemplate[] = [
  { id: "ReallocateGoodwill", costAxis: "Agreement", benefitAxis: "Agreement", sustain: 3, staminaReturn: 2 },
  { id: "VolunteerSomeoneElse", costAxis: "Agreement", benefitAxis: "Pressure", sustain: 2, staminaReturn: 2 },
  { id: "CashInAFavor", costAxis: "Pressure", benefitAxis: "Agreement", sustain: 2, staminaReturn: 3 },
  { id: "ChangeTheSubject", costAxis: "Pressure", benefitAxis: "Pressure", sustain: 1, staminaReturn: 2 },
];

interface CardContent {
  name: string;
  flavor: string;
}

/**
 * One unique title + joke per (template, ordered Topic pair) -- 48 distinct cards, not
 * 4 templates re-skinned with topic names swapped in. Each array is indexed in the same
 * order buildTransferCards iterates pairs (TOPICS x TOPICS, from!=to, TOPICS =
 * [Budget, Timeline, Personnel, Strategy]): Budget->Timeline, Budget->Personnel,
 * Budget->Strategy, Timeline->Budget, Timeline->Personnel, Timeline->Strategy,
 * Personnel->Budget, Personnel->Timeline, Personnel->Strategy, Strategy->Budget,
 * Strategy->Timeline, Strategy->Personnel. See DESIGN_NOTES.md section 31.
 */
const TRANSFER_CONTENT: Record<string, CardContent[]> = {
  ReallocateGoodwill: [
    { name: "Borrow From the Runway", flavor: "Nobody's touching Budget's cushion until the deadline needs it more." },
    { name: "Poach the Enthusiasm", flavor: "Budget's biggest fan just got reassigned to root for Personnel instead." },
    { name: "Fund the Vision Deck", flavor: "Turns out the strategy slides just needed someone else's line item." },
    { name: "Bank the Buffer", flavor: "That extra sprint nobody used just became Budget's new best friend." },
    { name: "Lend Out the Momentum", flavor: "Timeline's goodwill packs a box and transfers to Personnel." },
    { name: "Repurpose the Sprint Win", flavor: "One good sprint report becomes three good strategy slides." },
    { name: "Redirect the Applause", flavor: "Everyone was clapping for Personnel. Now they're clapping for Budget." },
    { name: "Borrow the Culture Fit", flavor: "Personnel's warm fuzzies get repackaged as an on-time delivery." },
    { name: "Reassign the Buy-In", flavor: "The team that trusted Personnel now, mysteriously, trusts Strategy." },
    { name: "Cash the Vision Check", flavor: "The five-year plan finally pays for something: this quarter's budget line." },
    { name: "Borrow Tomorrow's Confidence", flavor: "Strategy's blue-sky optimism gets rescheduled for this sprint." },
    { name: "Redirect the Roadmap Applause", flavor: "Turns out the applause for the roadmap was really about headcount." },
  ],
  VolunteerSomeoneElse: [
    { name: "Volunteer the Budget", flavor: "Someone has to take the blame for the schedule slipping. It's Budget. It's always Budget." },
    { name: "Blame It on the Spend", flavor: "Personnel digs in and holds the line, now that Budget took the fall." },
    { name: "Sacrifice the Line Item", flavor: "One quietly-cut expense buys Strategy a much firmer stance." },
    { name: "Volunteer the Deadline", flavor: "The schedule takes one for the team so Budget can stop budging." },
    { name: "Blame the Sprint", flavor: "Nobody remembers whose sprint slipped, but Personnel just got tougher." },
    { name: "Throw the Gantt Chart Under the Bus", flavor: "The roadmap holds firm because the timeline just got scapegoated." },
    { name: "Volunteer HR", flavor: "Someone in Personnel is quietly absorbing the blame so Budget can stand its ground." },
    { name: "Blame the Headcount", flavor: "Turns out the real reason for the delay was \"staffing,\" and now nobody's moving the deadline." },
    { name: "Sacrifice the Culture Survey", flavor: "Personnel takes the hit; Strategy suddenly feels very confident." },
    { name: "Volunteer the Vision Deck", flavor: "The five-year plan gets quietly shelved so Budget can dig its heels in." },
    { name: "Blame the Pivot", flavor: "Someone blames the strategy pivot, and the deadline suddenly feels untouchable." },
    { name: "Sacrifice the Roadmap", flavor: "Strategy eats the blame; Personnel won't budge an inch now." },
  ],
  CashInAFavor: [
    { name: "Cash In Budget's Goodwill", flavor: "All that quiet stonewalling Budget was doing? Spent, in exchange for the timeline looking better." },
    { name: "Call In the Favor", flavor: "Budget stops digging in so Personnel can finally get some support." },
    { name: "Spend the War Chest", flavor: "Budget's defensive reserves just bought Strategy a warmer reception." },
    { name: "Cash In the Buffer", flavor: "The schedule's stubbornness converts, one favor at a time, into budget support." },
    { name: "Call In a Sprint Favor", flavor: "Timeline stops resisting changes so Personnel can get some love." },
    { name: "Spend the Deadline Capital", flavor: "All that scheduling rigidity gets cashed in for strategic goodwill." },
    { name: "Cash In the Trust", flavor: "Personnel's hard-won credibility gets spent to make Budget look good." },
    { name: "Call In an HR Favor", flavor: "Whatever Personnel was quietly banking, the timeline just spent." },
    { name: "Spend the Political Capital", flavor: "Personnel's built-up trust turns into applause for Strategy." },
    { name: "Cash In the Vision", flavor: "Strategy's stubborn confidence gets spent buying Budget some love." },
    { name: "Call In a Roadmap Favor", flavor: "Strategy stops resisting scrutiny, and the timeline benefits." },
    { name: "Spend the Five-Year Plan", flavor: "All that strategic conviction, redirected into support for Personnel." },
  ],
  ChangeTheSubject: [
    { name: "Change the Subject From Budget", flavor: "Everyone stops scrutinizing the spreadsheet the second the deadline looks scarier." },
    { name: "Deflect to Headcount", flavor: "Budget stops getting questioned; Personnel becomes the new interesting problem." },
    { name: "Redirect to the Roadmap", flavor: "Nobody's auditing Budget anymore now that there's a shiny new strategy slide." },
    { name: "Change the Subject From the Deadline", flavor: "The schedule stops getting grilled the moment Budget looks more dramatic." },
    { name: "Deflect to the Org Chart", flavor: "Suddenly everyone's talking about headcount instead of the missed sprint." },
    { name: "Redirect to the Vision Deck", flavor: "The timeline dodges scrutiny by pointing everyone at the five-year plan." },
    { name: "Deflect to the Spreadsheet", flavor: "Personnel stops being the topic of conversation the second Budget looks worse." },
    { name: "Change the Subject From HR", flavor: "Nobody's asking about headcount anymore; the deadline is way more interesting." },
    { name: "Redirect to the Pivot", flavor: "Personnel quietly exits the spotlight; Strategy walks right into it." },
    { name: "Deflect to the Bottom Line", flavor: "The vision deck stops getting picked apart once Budget looks shakier." },
    { name: "Change the Subject From the Roadmap", flavor: "Strategy dodges scrutiny by pointing at the slipping deadline." },
    { name: "Redirect to Culture Fit", flavor: "Nobody's questioning the pivot anymore; they're questioning Personnel instead." },
  ],
};

const TRANSFER_COPIES = 2;
const TRANSFER_AMOUNT_PLACEHOLDER = 0; // overwritten per-card from config at deck-build time

function buildTransferCards(transferAmount: number): CardDef[] {
  const cards: CardDef[] = [];
  let pairIndex = 0;
  for (const from of TOPICS) {
    for (const to of TOPICS) {
      if (from === to) continue;
      for (const t of TRANSFER_TEMPLATES) {
        const content = TRANSFER_CONTENT[t.id][pairIndex];
        for (let copy = 0; copy < TRANSFER_COPIES; copy++) {
          const effect: CardEffect = {
            kind: "transfer",
            costTopic: from,
            costAxis: t.costAxis,
            benefitTopic: to,
            benefitAxis: t.benefitAxis,
            amount: transferAmount || TRANSFER_AMOUNT_PLACEHOLDER,
          };
          cards.push({
            id: `${from}-${t.id}-${to}-${copy}`,
            name: content.name,
            effectText: describeEffect(effect),
            flavorText: content.flavor,
            effect,
            sustain: t.sustain,
            staminaReturn: t.staminaReturn,
          });
        }
      }
      pairIndex += 1;
    }
  }
  return cards;
}

function buildBonusCards(): CardDef[] {
  const cards: CardDef[] = [];
  const push = (id: string, name: string, flavor: string, effect: CardEffect, sustain: number, staminaReturn: number, copies: number) => {
    for (let i = 0; i < copies; i++) {
      cards.push({ id: `${id}-${i}`, name, effectText: describeEffect(effect), flavorText: flavor, effect, sustain, staminaReturn });
    }
  };

  push(
    "ExtendMeeting",
    "Extend the Meeting",
    `"Before we wrap -- one more thing." Nobody has ever left a meeting on time.`,
    { kind: "extendDuration", amount: 8 },
    3,
    2,
    2
  );
  push(
    "FastTrackIt",
    "Fast-Track It",
    `Somebody found the express lane. Whoever wins next round barely has to lift a finger.`,
    { kind: "durationMultiplier", multiplier: 0.5 },
    1,
    2,
    1
  );
  push(
    "BuryInCommittee",
    "Bury It in Committee",
    `Whoever wins next is about to discover just how long "further review" can take.`,
    { kind: "durationMultiplier", multiplier: 2 },
    1,
    2,
    1
  );
  push(
    "StrikeFromMinutes",
    "Strike That From the Minutes",
    `"Can we go back to what was just said?" Someone always asks eventually.`,
    { kind: "undo" },
    1,
    2,
    1
  );
  push(
    "OnSecondThought",
    "On Second Thought",
    `The room reconsiders. Nothing is ever really final in here.`,
    { kind: "undo" },
    2,
    1,
    1
  );

  return cards;
}

export const DEFAULT_CONFIG = {
  startingDuration: 65,
  handSize: 10,
  roundSafetyCap: 40,
  /** A full draft at the old deck-size/numPlayers clamp (17-51 picks) was grueling in
   * practice -- picks stopped being deliberate well before the end. 16 is small enough
   * to bind uniformly at every supported player count (floor(102/N) for N=2..6 is
   * always >=17) so every lobby size gets the same draft length, while still being
   * enough personal-deck variety to matter. See DESIGN_NOTES.md section 28. */
  draftDeckSize: 16,
  startingStamina: 10,
  /** Flat Stamina for a plain Pass -- no consecutive-pass growth. Sim-swept (3/5/7)
   * before settling; see DESIGN_NOTES.md section 29. */
  passReward: 5,
  approveThreshold: 0.7,
  transferAmount: 0.3,
};

/** The full shared deck. Transfer cards carry a placeholder `amount`; `applyOverrides`
 * (and initial deck construction below) always stamps the live config's
 * `transferAmount` onto every transfer card so a D1-tuned value takes effect without a
 * code change. */
export const DEFAULT_DECK: CardDef[] = [...buildTransferCards(DEFAULT_CONFIG.transferAmount), ...buildBonusCards()];

export function applyOverrides(deck: CardDef[], overrides: Map<string, { sustain?: number; staminaReturn?: number }>): CardDef[] {
  return deck.map((c) => {
    const o = overrides.get(c.id);
    if (!o) return c;
    return { ...c, sustain: o.sustain ?? c.sustain, staminaReturn: o.staminaReturn ?? c.staminaReturn };
  });
}

/** Stamps the live config's transferAmount onto every transfer card's effect --
 * DEFAULT_DECK bakes in DEFAULT_CONFIG's value, but a D1-configured transferAmount
 * needs the same treatment before the deck reaches a real match. */
export function applyTransferAmount(deck: CardDef[], transferAmount: number): CardDef[] {
  return deck.map((c) => (c.effect.kind === "transfer" ? { ...c, effect: { ...c.effect, amount: transferAmount } } : c));
}
