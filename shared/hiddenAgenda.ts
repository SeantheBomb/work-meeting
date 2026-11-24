import { AgendaCell } from "./types";

export function agendaCellLabel(cell: AgendaCell): string {
  return cell.stance === "Approve" ? `Get ${cell.topic} Approved.` : `Keep ${cell.topic} from being Approved.`;
}
