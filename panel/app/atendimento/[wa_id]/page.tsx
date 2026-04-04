import { notFound } from "next/navigation";
import { fetchAttendanceDetailAction } from "../actions";
import { AtendimentoDetalheUI, type AttendanceDetalheRow } from "./AtendimentoDetalheUI";

interface Props {
  params: Promise<{ wa_id: string }>;
}

export default async function AtendimentoDetalhePage({ params }: Props) {
  const { wa_id: rawParam } = await params;
  // Next.js 14 App Router may pass path-segment params with percent-encoding still intact
  // (e.g. %40 not decoded to @). Normalise once here so the action always receives the
  // canonical decoded value — the same value that enova_attendance_v1 stores.
  const wa_id = decodeURIComponent(rawParam);

  const result = await fetchAttendanceDetailAction(wa_id);

  if (!result.ok || !result.lead) {
    notFound();
  }

  return <AtendimentoDetalheUI lead={result.lead as unknown as AttendanceDetalheRow} />;
}
