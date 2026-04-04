// ============================================================
// Atendimento — Backend helper (panel/app/api/atendimento/_shared.ts)
// Escopo: leitura da view enova_attendance_v1 (read-only)
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
  // Trim surrounding whitespace to handle values with accidental leading/trailing spaces.
  const safeId = wa_id.trim();
  if (!safeId) return null;

  const endpoint = new URL("/rest/v1/enova_attendance_v1", supabaseUrl);
  // Build the filter directly with encodeURIComponent instead of URLSearchParams.set().
  // URLSearchParams.set() uses application/x-www-form-urlencoded encoding and encodes
  // spaces as '+', but PostgREST uses RFC 3986 decoding where '+' is a literal plus sign.
  // encodeURIComponent encodes spaces as '%20', which PostgREST decodes correctly.
  endpoint.search = `?select=*&wa_id=eq.${encodeURIComponent(safeId)}&limit=1`;

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
