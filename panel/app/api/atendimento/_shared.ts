// ============================================================
// Atendimento — Backend helper (panel/app/api/atendimento/_shared.ts)
// Escopo: leitura da view enova_attendance_v1 (read-only)
//         + arquivamento em enova_attendance_meta (write restrito)
// ============================================================

function buildSupabaseHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}

export async function getAttendanceLead(
  supabaseUrl: string,
  serviceRoleKey: string,
  wa_id: string,
): Promise<Record<string, unknown> | null> {
  // Guard: whitespace-only or empty wa_id has no valid DB row.
  // Do NOT trim the value itself — the link href encodes the raw stored value and
  // trimming here would break exact-match for any wa_id that contains leading/trailing
  // whitespace in the database (e.g. legacy imports). The round-trip must be exact.
  if (!wa_id || !wa_id.trim()) return null;

  const endpoint = new URL("/rest/v1/enova_attendance_v1", supabaseUrl);
  // Build the filter directly with encodeURIComponent instead of URLSearchParams.set().
  // URLSearchParams.set() uses application/x-www-form-urlencoded encoding and encodes
  // spaces as '+', but PostgREST uses RFC 3986 decoding where '+' is a literal plus sign.
  // encodeURIComponent encodes spaces as '%20', which PostgREST decodes correctly.
  // Use the RAW (untrimmed) value so the DB comparison is exact against what is stored.
  endpoint.search = `?select=*&wa_id=eq.${encodeURIComponent(wa_id)}&limit=1`;

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: buildSupabaseHeaders(serviceRoleKey),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FAILED_TO_GET_ATTENDANCE_LEAD:${response.status}`);
  }

  const rows = (await readJsonResponse<Record<string, unknown>[]>(response)) ?? [];
  return rows[0] ?? null;
}

export async function listAttendanceLeads(
  supabaseUrl: string,
  serviceRoleKey: string,
  options: { limit?: number } = {},
): Promise<Record<string, unknown>[]> {
  const endpoint = new URL("/rest/v1/enova_attendance_v1", supabaseUrl);
  endpoint.searchParams.set("select", "*");
  endpoint.searchParams.set("order", "atualizado_em.desc.nullsfirst,wa_id.asc");

  const limit = Math.max(1, Math.min(500, Number.isFinite(Number(options.limit)) ? Math.trunc(Number(options.limit)) : 200));
  endpoint.searchParams.set("limit", String(limit));

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: buildSupabaseHeaders(serviceRoleKey),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FAILED_TO_LIST_ATTENDANCE:${response.status}`);
  }

  return (await readJsonResponse<Record<string, unknown>[]>(response)) ?? [];
}

// ── Arquivamento — escreve em enova_attendance_meta ─────────────────────────
//
// A view enova_attendance_v1 lê archived_at de enova_attendance_meta (LEFT JOIN).
// O arquivamento de leads do painel de atendimento DEVE escrever nessa tabela,
// não em crm_lead_meta (que é o domínio do painel de Bases).
//
// UPSERT garante que mesmo leads sem linha em enova_attendance_meta possam ser
// arquivados (cria a linha com wa_id + campos de archive).

export async function archiveAttendanceLead(
  supabaseUrl: string,
  serviceRoleKey: string,
  wa_id: string,
  archive_reason_code: string | null,
  archive_reason_note: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const endpoint = new URL("/rest/v1/enova_attendance_meta", supabaseUrl);
  endpoint.searchParams.set("on_conflict", "wa_id");

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: {
      ...buildSupabaseHeaders(serviceRoleKey),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([{
      wa_id,
      archived_at: now,
      archive_reason_code,
      archive_reason_note,
      updated_at: now,
    }]),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FAILED_TO_ARCHIVE_ATTENDANCE:${response.status}`);
  }
}

export async function unarchiveAttendanceLead(
  supabaseUrl: string,
  serviceRoleKey: string,
  wa_id: string,
): Promise<void> {
  const now = new Date().toISOString();
  const endpoint = new URL("/rest/v1/enova_attendance_meta", supabaseUrl);
  endpoint.search = `?wa_id=eq.${encodeURIComponent(wa_id)}`;

  const response = await fetch(endpoint.toString(), {
    method: "PATCH",
    headers: {
      ...buildSupabaseHeaders(serviceRoleKey),
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      archived_at: null,
      archive_reason_code: null,
      archive_reason_note: null,
      updated_at: now,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FAILED_TO_UNARCHIVE_ATTENDANCE:${response.status}`);
  }
}
