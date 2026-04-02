// ============================================================
// Incidentes — Backend helper (panel/app/api/incidentes/_shared.ts)
// Escopo: leitura da view enova_incidents_v1 (read-only)
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

export async function listIncidents(
  supabaseUrl: string,
  serviceRoleKey: string,
  options: { limit?: number } = {},
): Promise<Record<string, unknown>[]> {
  const endpoint = new URL("/rest/v1/enova_incidents_v1", supabaseUrl);
  endpoint.searchParams.set("select", "*");
  endpoint.searchParams.set("order", "aberto_em.desc.nullsfirst,id_incidente.asc");

  const limit = Math.max(1, Math.min(500, Number.isFinite(Number(options.limit)) ? Math.trunc(Number(options.limit)) : 200));
  endpoint.searchParams.set("limit", String(limit));

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: buildSupabaseHeaders(serviceRoleKey),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FAILED_TO_LIST_INCIDENTS:${response.status}`);
  }

  return (await readJsonResponse<Record<string, unknown>[]>(response)) ?? [];
}
