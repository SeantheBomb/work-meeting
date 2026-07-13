import { HiddenAgendaType } from "./types";

export const HIDDEN_AGENDA_TYPES: HiddenAgendaType[] = [
  "CreditOnApproved",
  "CreditOnTwoPlusItems",
  "TopicNeverApproved",
  "ItemRemovedByOther",
];

export const HIDDEN_AGENDA_DESCRIPTIONS: Record<HiddenAgendaType, string> = {
  CreditOnApproved: "Get Credit on any Approved item.",
  CreditOnTwoPlusItems: "Get Credit on 2+ items, regardless of status.",
  TopicNeverApproved: "Ensure your assigned Topic never reaches Approved.",
  ItemRemovedByOther: "See an item you don't hold Credit on get Removed.",
};
