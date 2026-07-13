import { HiddenAgenda } from "./types";

export function hiddenAgendaLabel(agenda: HiddenAgenda): string {
  return agenda.stance === "Approve" ? `Get ${agenda.topic} Approved.` : `Make sure ${agenda.topic} is never Approved.`;
}
