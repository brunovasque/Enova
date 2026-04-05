import { fetchAttendanceLeadsAction } from "../atendimento/actions";
import { agregaLeituraGlobal, type LeituraGlobal } from "../lib/enova-ia-leitura";
import { buildFilaInteligente, type FilaItem } from "../lib/enova-ia-fila";
import { sugereProgramas, type ProgramaSugerido } from "../lib/enova-ia-programas";
import { EnovaIaUI } from "./EnovaIaUI";

export default async function EnovaIaPage() {
  let leituraGlobal: LeituraGlobal | null = null;
  let filaInteligente: FilaItem[] = [];
  let programasSugeridos: ProgramaSugerido[] = [];

  const result = await fetchAttendanceLeadsAction(500);
  if (result.ok && result.leads) {
    leituraGlobal = agregaLeituraGlobal(result.leads);
    filaInteligente = buildFilaInteligente(result.leads);
    programasSugeridos = sugereProgramas(leituraGlobal, filaInteligente);
  }

  return (
    <EnovaIaUI
      leituraGlobal={leituraGlobal}
      filaInteligente={filaInteligente}
      programasSugeridos={programasSugeridos}
    />
  );
}
