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

// ── Campos humanos editáveis — escreve em enova_attendance_meta ─────────────
// Campos canônicos já existentes na tabela (sem nova coluna).
// UPSERT: cria linha se não existir (leads sem row em enova_attendance_meta).

export type AttendanceMetaHumanPayload = {
  wa_id: string;
  interesse_atual?: string | null;
  objecao_principal?: string | null;
  momento_do_cliente?: string | null;
  responsavel?: string | null;
  quick_note?: string | null;
};

export async function patchAttendanceMeta(
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: AttendanceMetaHumanPayload,
): Promise<void> {
  const { wa_id, ...fields } = payload;
  const now = new Date().toISOString();

  const endpoint = new URL("/rest/v1/enova_attendance_meta", supabaseUrl);
  endpoint.searchParams.set("on_conflict", "wa_id");

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: {
      ...buildSupabaseHeaders(serviceRoleKey),
      // "resolution=merge-duplicates" enables UPSERT: when combined with on_conflict=wa_id,
      // PostgREST merges the new fields into an existing row (preserving other columns)
      // or inserts a new row if none exists. This is safe for leads without a meta row yet.
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([{ wa_id, ...fields, updated_at: now }]),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FAILED_TO_PATCH_ATTENDANCE_META:${response.status}`);
  }
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

  // 1) Fonte primária de atendimento: UPSERT em enova_attendance_meta.
  //    archived_at aqui exclui o lead de enova_attendance_v1 (WHERE a.archived_at IS NULL).
  const attendanceEndpoint = new URL("/rest/v1/enova_attendance_meta", supabaseUrl);
  attendanceEndpoint.searchParams.set("on_conflict", "wa_id");

  const attendanceResponse = await fetch(attendanceEndpoint.toString(), {
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

  if (!attendanceResponse.ok) {
    throw new Error(`FAILED_TO_ARCHIVE_ATTENDANCE:${attendanceResponse.status}`);
  }

  // 2) Sincronização para Bases: PATCH em crm_lead_meta para que o lead apareça
  //    em Bases > Arquivados (que lê is_archived de crm_lead_meta via bases_leads_v1).
  const crmPatchEndpoint = new URL("/rest/v1/crm_lead_meta", supabaseUrl);
  crmPatchEndpoint.search = `?wa_id=eq.${encodeURIComponent(wa_id)}`;

  const crmPatchResponse = await fetch(crmPatchEndpoint.toString(), {
    method: "PATCH",
    headers: {
      ...buildSupabaseHeaders(serviceRoleKey),
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      is_archived: true,
      archived_at: now,
      archive_reason_code,
      archive_reason_note,
      updated_at: now,
    }),
    cache: "no-store",
  });

  if (!crmPatchResponse.ok) {
    throw new Error(`FAILED_TO_SYNC_CRM_ARCHIVE:${crmPatchResponse.status}`);
  }

  const patchedRows = (await readJsonResponse<Record<string, unknown>[]>(crmPatchResponse)) ?? [];

  // Se nenhuma row foi atualizada, este lead não tem row em crm_lead_meta.
  // Leads orgânicos podem chegar ao funil sem terem sido importados em Bases
  // (registerOrganicLeadInCrmMeta no Worker é non-blocking e pode falhar silenciosamente).
  // Inserimos uma row mínima para que o lead apareça em Bases > Arquivados e
  // não entre em limbo operacional.
  if (patchedRows.length === 0) {
    const crmInsertEndpoint = new URL("/rest/v1/crm_lead_meta", supabaseUrl);

    const crmInsertResponse = await fetch(crmInsertEndpoint.toString(), {
      method: "POST",
      headers: {
        ...buildSupabaseHeaders(serviceRoleKey),
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        wa_id,
        lead_pool: "COLD_POOL",
        lead_temp: "COLD",
        lead_source: "organico",
        is_archived: true,
        archived_at: now,
        archive_reason_code,
        archive_reason_note,
        updated_at: now,
      }),
      cache: "no-store",
    });

    if (!crmInsertResponse.ok) {
      throw new Error(`FAILED_TO_INSERT_CRM_ARCHIVE:${crmInsertResponse.status}`);
    }
  }
}

export async function unarchiveAttendanceLead(
  supabaseUrl: string,
  serviceRoleKey: string,
  wa_id: string,
): Promise<void> {
  const now = new Date().toISOString();

  // 1) Limpa arquivo em enova_attendance_meta.
  const attendanceEndpoint = new URL("/rest/v1/enova_attendance_meta", supabaseUrl);
  attendanceEndpoint.search = `?wa_id=eq.${encodeURIComponent(wa_id)}`;

  const attendanceResponse = await fetch(attendanceEndpoint.toString(), {
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

  if (!attendanceResponse.ok) {
    throw new Error(`FAILED_TO_UNARCHIVE_ATTENDANCE:${attendanceResponse.status}`);
  }

  // 2) Sincronização para Bases: limpa is_archived em crm_lead_meta.
  //    PATCH em linha inexistente retorna 204 vazio (seguro).
  const crmEndpoint = new URL("/rest/v1/crm_lead_meta", supabaseUrl);
  crmEndpoint.search = `?wa_id=eq.${encodeURIComponent(wa_id)}`;

  const crmResponse = await fetch(crmEndpoint.toString(), {
    method: "PATCH",
    headers: {
      ...buildSupabaseHeaders(serviceRoleKey),
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      is_archived: false,
      archived_at: null,
      archive_reason_code: null,
      archive_reason_note: null,
      updated_at: now,
    }),
    cache: "no-store",
  });

  if (!crmResponse.ok) {
    throw new Error(`FAILED_TO_SYNC_CRM_UNARCHIVE:${crmResponse.status}`);
  }
}
