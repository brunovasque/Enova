import { notFound } from "next/navigation";
import { fetchAttendanceDetailAction } from "../actions";
import { AtendimentoDetalheUI, type AttendanceDetalheRow } from "./AtendimentoDetalheUI";

interface Props {
  params: Promise<{ wa_id: string }>;
}

export default async function AtendimentoDetalhePage({ params }: Props) {
  const { wa_id } = await params;

  const result = await fetchAttendanceDetailAction(wa_id);

  if (!result.ok || !result.lead) {
    notFound();
  }

  return <AtendimentoDetalheUI lead={result.lead as unknown as AttendanceDetalheRow} />;
}
