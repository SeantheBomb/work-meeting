import { CardDef, CardTemplateId, Status, Topic, TOPICS, Verb } from "./types";

interface Template {
  id: CardTemplateId;
  name: string;
  verb: Verb;
  resultStatus: Status | null;
  attack: number;
  sustain: number;
  decay: number;
  flavor: (topic: Topic) => string;
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
  },
];

function buildTopicCards(): CardDef[] {
  const cards: CardDef[] = [];
  for (const topic of TOPICS) {
    for (const t of TEMPLATES) {
      cards.push({
        id: `${topic}-${t.id}`,
        name: t.name,
        flavorText: t.flavor(topic),
        topic,
        verb: t.verb,
        resultStatus: t.resultStatus,
        attack: t.attack,
        sustain: t.sustain,
        decay: t.decay,
      });
    }
  }
  return cards;
}

const UNIVERSAL_CARDS: CardDef[] = [
  {
    id: "NewBusinessA",
    name: "New Business",
    flavorText: `"Before we wrap — one more thing." The meeting was never going to end on time anyway.`,
    topic: null,
    verb: "NewBusiness",
    resultStatus: null,
    attack: 3,
    sustain: 1,
    decay: 0,
  },
  {
    id: "NewBusinessB",
    name: "New Business",
    flavorText: `"Before we wrap — one more thing." The meeting was never going to end on time anyway.`,
    topic: null,
    verb: "NewBusiness",
    resultStatus: null,
    attack: 3,
    sustain: 1,
    decay: 0,
  },
  {
    id: "Overtime",
    name: "Can I Just Add One More Thing",
    flavorText: `The nine words that have derailed more meetings than any layoff announcement.`,
    topic: null,
    verb: "Overtime",
    resultStatus: null,
    attack: 5,
    sustain: 0,
    decay: 0,
  },
];

/** The full 28-card shared deck (default values — D1 `card_definitions` can override attack/sustain/decay). */
export const DEFAULT_DECK: CardDef[] = [...buildTopicCards(), ...UNIVERSAL_CARDS];

export const DEFAULT_CONFIG = {
  startingDuration: 30,
  handSize: 3,
  roundSafetyCap: 40,
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
