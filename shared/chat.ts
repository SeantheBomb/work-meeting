import { TOPICS } from "./types";

/**
 * Madlibs-style table talk. Nobody types free text -- every message is a template with
 * slots filled from fixed pools (a Topic, another player's name, or a phrase list),
 * which keeps the tone in-world, makes moderation a non-issue, and gives bots the same
 * voice as humans. Built for three jobs: humor, taunting, and just-enough signaling
 * ("stay off Budget") -- which, like everything else in this game, might be a lie.
 */

export type ChatSlot = { kind: "topic" } | { kind: "player" } | { kind: "phrase"; options: string[] };

export interface ChatTemplate {
  id: string;
  /** Literal strings interleaved with slot indexes: ["I saw that, ", 0, "."] */
  parts: (string | number)[];
  slots: ChatSlot[];
}

export const CHAT_TEMPLATES: ChatTemplate[] = [
  { id: "circle-back", parts: ["Can we PLEASE circle back to ", 0, "?"], slots: [{ kind: "topic" }] },
  {
    id: "judgment",
    parts: ["", 0, " is ", 1, "."],
    slots: [{ kind: "topic" }, { kind: "phrase", options: ["non-negotiable", "a dumpster fire", "fine, actually", "above my pay grade", "the hill I die on", "everyone's problem now"] }],
  },
  { id: "saw-that", parts: ["I saw that, ", 0, "."], slots: [{ kind: "player" }] },
  { id: "hiding", parts: ["", 0, " is definitely hiding something."], slots: [{ kind: "player" }] },
  { id: "own-up", parts: ["Who keeps touching ", 0, "? Own up."], slots: [{ kind: "topic" }] },
  { id: "offline", parts: ["Let's take ", 0, " offline."], slots: [{ kind: "topic" }] },
  {
    id: "snacks",
    parts: ["I'm just here for the ", 0, "."],
    slots: [{ kind: "phrase", options: ["coffee", "donuts", "free lunch", "exposure", "vibes", "per diem"] }],
  },
  { id: "per-my-last", parts: ["Per my last card, ", 0, "."], slots: [{ kind: "player" }] },
  {
    id: "email",
    parts: ["This meeting could have been ", 0, "."],
    slots: [{ kind: "phrase", options: ["an email", "a Slack thread", "a text", "two emails", "a calendar decline"] }],
  },
  {
    id: "feeling",
    parts: ["I ", 0, " that last play."],
    slots: [{ kind: "phrase", options: ["loved", "hated", "did not understand", "called", "am escalating to HR about"] }],
  },
  { id: "trust", parts: ["Trust me on ", 0, "."], slots: [{ kind: "topic" }] },
  { id: "absolutely-not", parts: ["Absolutely not, ", 0, "."], slots: [{ kind: "player" }] },
];

export function chatTemplateById(id: string): ChatTemplate | undefined {
  return CHAT_TEMPLATES.find((t) => t.id === id);
}

function slotValueValid(slot: ChatSlot, value: string, playerNames: string[]): boolean {
  switch (slot.kind) {
    case "topic":
      return (TOPICS as readonly string[]).includes(value);
    case "player":
      return playerNames.includes(value);
    case "phrase":
      return slot.options.includes(value);
  }
}

/** Server-side gate: only a known template with every slot drawn from its legal pool
 * renders; anything else is rejected. This is the whole anti-free-text guarantee. */
export function validateAndRenderChat(templateId: string, values: string[], playerNames: string[]): string | null {
  const template = chatTemplateById(templateId);
  if (!template) return null;
  if (values.length !== template.slots.length) return null;
  for (let i = 0; i < template.slots.length; i++) {
    if (!slotValueValid(template.slots[i], values[i], playerNames)) return null;
  }
  return template.parts.map((p) => (typeof p === "number" ? values[p] : p)).join("");
}

/** One rendered chat line as broadcast to the room. */
export interface ChatBroadcast {
  senderId: string;
  senderName: string;
  avatar: string;
  text: string;
  round: number;
}
