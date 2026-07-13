import { CardDef, CardTemplateId, SIDE_EFFECTS, SideEffectId, Status, Topic, TOPICS, Verb } from "./types";
import { SIDE_EFFECT_TEXT } from "./sideEffects";

interface Template {
  id: CardTemplateId;
  name: string;
  verb: Verb;
  resultStatus: Status | null;
  attack: number;
  sustain: number;
  decay: number;
  flavor: (topic: Topic) => string;
  effect: (topic: Topic) => string;
}

const TEMPLATES: Template[] = [
  {
    id: "QuickNote",
    name: "Quick Note",
    verb: "Add",
    resultStatus: "Raised",
    attack: 1,
    sustain: 1,
    decay: 0,
    flavor: (t) => `Just flagging ${t} for the record — no action needed. (There will be action needed.)`,
    effect: (t) => `Raises ${t} (Add). Only legal while ${t} hasn't been touched yet — one-shot per meeting.`,
  },
  {
    id: "PushBack",
    name: "Push Back",
    verb: "Rewrite",
    resultStatus: "Disputed",
    attack: 2,
    sustain: 2,
    decay: 1,
    flavor: (t) => `"I have some concerns about ${t}." (There is one concern. It is personal.)`,
    effect: (t) => `Rewrites ${t} to Disputed. Needs Sustain 2+ vs. its current Resolve, or it bounces.`,
  },
  {
    id: "TableIt",
    name: "Let's Table That",
    verb: "Rewrite",
    resultStatus: "Tabled",
    attack: 2,
    sustain: 3,
    decay: 1,
    flavor: (t) => `The ${t} conversation goes into the parking lot, where all good ideas quietly expire.`,
    effect: (t) => `Rewrites ${t} to Tabled. Needs Sustain 3+ vs. its current Resolve, or it bounces.`,
  },
  {
    id: "SignOff",
    name: "Per My Last Email",
    verb: "Rewrite",
    resultStatus: "Approved",
    attack: 2,
    sustain: 4,
    decay: 2,
    flavor: (t) => `You did email this about ${t}. Three times. It didn't help then either.`,
    effect: (t) => `Rewrites ${t} to Approved. Needs Sustain 4+ vs. its current Resolve, or it bounces.`,
  },
  {
    id: "ShootDown",
    name: "Take This Offline",
    verb: "Remove",
    resultStatus: null,
    attack: 2,
    sustain: 3,
    decay: 1,
    flavor: () => `A phrase that has never once resulted in anything happening offline.`,
    effect: (t) => `Strikes ${t} from the Minutes entirely. Needs Sustain 3+ vs. its current Resolve, or it bounces.`,
  },
];

/** 5x5 Latin square over (template, topic): every template sees every side effect exactly
 * once across its 5 topic variants, and every topic sees every side effect exactly once
 * across its 5 templates. See DESIGN_NOTES.md section 2. */
function sideEffectFor(templateIndex: number, topicIndex: number): SideEffectId {
  return SIDE_EFFECTS[(templateIndex + topicIndex) % SIDE_EFFECTS.length];
}

function buildTopicCards(): CardDef[] {
  const cards: CardDef[] = [];
  TOPICS.forEach((topic, topicIndex) => {
    TEMPLATES.forEach((t, templateIndex) => {
      const sideEffect = sideEffectFor(templateIndex, topicIndex);
      cards.push({
        id: `${topic}-${t.id}`,
        name: t.name,
        effectText: `${t.effect(topic)} ${SIDE_EFFECT_TEXT[sideEffect]}`,
        flavorText: t.flavor(topic),
        topic,
        verb: t.verb,
        resultStatus: t.resultStatus,
        attack: t.attack,
        sustain: t.sustain,
        decay: t.decay,
        sideEffect,
      });
    });
  });
  return cards;
}

const UNIVERSAL_CARDS: CardDef[] = [
  {
    id: "NewBusinessA",
    name: "New Business",
    effectText: `Raises any untouched topic you choose (Add, wild). Only legal while at least one topic is untouched.`,
    flavorText: `"Before we wrap — one more thing." The meeting was never going to end on time anyway.`,
    topic: null,
    verb: "NewBusiness",
    resultStatus: null,
    attack: 2,
    sustain: 1,
    decay: 1,
    sideEffect: null,
  },
  {
    id: "NewBusinessB",
    name: "New Business",
    effectText: `Raises any untouched topic you choose (Add, wild). Only legal while at least one topic is untouched.`,
    flavorText: `"Before we wrap — one more thing." The meeting was never going to end on time anyway.`,
    topic: null,
    verb: "NewBusiness",
    resultStatus: null,
    attack: 2,
    sustain: 1,
    decay: 1,
    sideEffect: null,
  },
  {
    id: "NewBusinessC",
    name: "New Business",
    effectText: `Raises any untouched topic you choose (Add, wild). Only legal while at least one topic is untouched.`,
    flavorText: `"Before we wrap — one more thing." The meeting was never going to end on time anyway.`,
    topic: null,
    verb: "NewBusiness",
    resultStatus: null,
    attack: 2,
    sustain: 1,
    decay: 1,
    sideEffect: null,
  },
  {
    id: "NewBusinessD",
    name: "New Business",
    effectText: `Raises any untouched topic you choose (Add, wild). Only legal while at least one topic is untouched.`,
    flavorText: `"Before we wrap — one more thing." The meeting was never going to end on time anyway.`,
    topic: null,
    verb: "NewBusiness",
    resultStatus: null,
    attack: 2,
    sustain: 1,
    decay: 1,
    sideEffect: null,
  },
  {
    id: "Overtime",
    name: "Can I Just Add One More Thing",
    effectText: `Adds Duration back to the clock instead of spending it (+5, then +3, then +1 per meeting). Always legal, but costs the whole table 1 Fatigue.`,
    flavorText: `The nine words that have derailed more meetings than any layoff announcement.`,
    topic: null,
    verb: "Overtime",
    resultStatus: null,
    attack: 3,
    sustain: 0,
    decay: 1,
    sideEffect: null,
  },
];

/** The full 30-card shared deck (default values — D1 `card_definitions` can override attack/sustain/decay). */
export const DEFAULT_DECK: CardDef[] = [...buildTopicCards(), ...UNIVERSAL_CARDS];

export const DEFAULT_CONFIG = {
  startingDuration: 30,
  handSize: 5,
  roundSafetyCap: 40,
  draftDeckSize: 10,
  pressureThreshold: 3,
};

export function applyOverrides(
  deck: CardDef[],
  overrides: Map<string, { attack?: number; sustain?: number; decay?: number }>
): CardDef[] {
  return deck.map((c) => {
    const o = overrides.get(c.id);
    if (!o) return c;
    return { ...c, attack: o.attack ?? c.attack, sustain: o.sustain ?? c.sustain, decay: o.decay ?? c.decay };
  });
}
