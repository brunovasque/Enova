import { fetchAttendanceLeadsAction } from "../atendimento/actions";
import { agregaLeituraGlobal, type LeituraGlobal } from "../lib/enova-ia-leitura";
import { EnovaIaUI } from "./EnovaIaUI";

export default async function EnovaIaPage() {
  let leituraGlobal: LeituraGlobal | null = null;

  const result = await fetchAttendanceLeadsAction(300);
  if (result.ok && result.leads) {
    leituraGlobal = agregaLeituraGlobal(result.leads);
  }

  return <EnovaIaUI leituraGlobal={leituraGlobal} />;
}
