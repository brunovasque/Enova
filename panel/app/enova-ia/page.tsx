import { fetchAttendanceLeadsAction } from "../atendimento/actions";
import { agregaLeituraGlobal, type LeituraGlobal } from "../lib/enova-ia-leitura";
import { buildFilaInteligente, type FilaItem } from "../lib/enova-ia-fila";
import { EnovaIaUI } from "./EnovaIaUI";

export default async function EnovaIaPage() {
  let leituraGlobal: LeituraGlobal | null = null;
  let filaInteligente: FilaItem[] = [];

  const result = await fetchAttendanceLeadsAction(500);
  if (result.ok && result.leads) {
    leituraGlobal = agregaLeituraGlobal(result.leads);
    filaInteligente = buildFilaInteligente(result.leads);
  }

  return <EnovaIaUI leituraGlobal={leituraGlobal} filaInteligente={filaInteligente} />;
}
