import { notFound } from "next/navigation";
import { fetchAttendanceDetailAction, fetchClientProfileAction } from "../actions";
import { AtendimentoDetalheUI, type AttendanceDetalheRow } from "./AtendimentoDetalheUI";
import type { ClientProfileRow } from "../../api/client-profile/_shared";

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

  // Fetch client profile server-side so the edit form is pre-populated on load.
  // Non-critical: a null profile just means all fields start empty.
  const profileResult = await fetchClientProfileAction(wa_id);
  const initialProfile = (profileResult.ok ? (profileResult.profile ?? null) : null) as ClientProfileRow | null;

  return (
    <AtendimentoDetalheUI
      lead={result.lead as unknown as AttendanceDetalheRow}
      initialProfile={initialProfile}
    />
  );
}
