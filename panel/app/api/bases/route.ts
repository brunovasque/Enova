import { NextResponse } from "next/server";

import {
  assessCallNowEligibility,
  buildWarmupSelection,
  clampWarmupLimit,
  CrmLeadMetaRow,
  isLeadPool,
  isLeadTemp,
  normalizeLeadMetaInput,
  normalizeOptionalText,
} from "./_shared";

type BasesAction =
  | "add_lead_manual"
  | "import_base"
  | "move_base"
  | "pause_lead"
  | "resume_lead"
  | "call_now"
  | "warmup_base";

type BasesRequest = {
  action?: BasesAction;
  wa_id?: string;
  text?: string;
  lead_pool?: string;
  lead_temp?: string;
  lead_source?: string;
  tags?: unknown;
  obs_curta?: string;
  import_ref?: string;
  auto_outreach_enabled?: boolean;
  is_paused?: boolean;
  leads?: Array<Record<string, unknown>>;
  limit?: number;
};

type AuditLogRow = {
  wa_id: string | null;
  tag:
    | "bases_add_lead_manual"
    | "bases_import"
    | "bases_move"
    | "bases_pause"
    | "bases_resume"
    | "bases_call_now"
    | "bases_warmup";
  meta_text: string;
  details: Record<string, unknown>;
};

const REQUIRED_ENVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const;
const CALL_NOW_ENVS = ["WORKER_BASE_URL", "ENOVA_ADMIN_KEY"] as const;

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

function missingEnvNames(names: readonly string[]): string[] {
  return names.filter((envName) => !process.env[envName]);
}

function buildSupabaseHeaders(serviceRoleKey: string, extra: Record<string, string> = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}

async function loadLeadMeta(
  supabaseUrl: string,
  serviceRoleKey: string,
  waId: string,
): Promise<CrmLeadMetaRow | null> {
  const endpoint = new URL("/rest/v1/crm_lead_meta", supabaseUrl);
  endpoint.searchParams.set(
    "select",
    "wa_id,lead_pool,lead_temp,lead_source,tags,obs_curta,import_ref,auto_outreach_enabled,is_paused,created_at,updated_at",
  );
  endpoint.searchParams.set("wa_id", `eq.${waId}`);
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint, {
    method: "GET",
    headers: buildSupabaseHeaders(serviceRoleKey),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FAILED_TO_LOAD_META:${response.status}`);
  }

  const rows = (await readJsonResponse<CrmLeadMetaRow[]>(response)) ?? [];
  return rows[0] ?? null;
}

async function loadWarmupCandidates(
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: BasesRequest,
): Promise<CrmLeadMetaRow[]> {
  const endpoint = new URL("/rest/v1/crm_lead_meta", supabaseUrl);
  endpoint.searchParams.set(
    "select",
    "wa_id,lead_pool,lead_temp,lead_source,tags,obs_curta,import_ref,auto_outreach_enabled,is_paused,created_at,updated_at",
  );
  endpoint.searchParams.set("auto_outreach_enabled", "eq.true");
  endpoint.searchParams.set("is_paused", "eq.false");
  endpoint.searchParams.set("order", "updated_at.asc,wa_id.asc");
  endpoint.searchParams.set("limit", String(Math.max(50, clampWarmupLimit(payload.limit) * 2)));

  if (payload.lead_pool && isLeadPool(payload.lead_pool)) {
    endpoint.searchParams.set("lead_pool", `eq.${payload.lead_pool}`);
  }
  if (payload.lead_temp && isLeadTemp(payload.lead_temp)) {
    endpoint.searchParams.set("lead_temp", `eq.${payload.lead_temp}`);
  }

  const response = await fetch(endpoint, {
    method: "GET",
    headers: buildSupabaseHeaders(serviceRoleKey),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FAILED_TO_LOAD_WARMUP:${response.status}`);
  }

  return (await readJsonResponse<CrmLeadMetaRow[]>(response)) ?? [];
}

async function upsertLeadMetaRows(
  supabaseUrl: string,
  serviceRoleKey: string,
  rows: Array<Record<string, unknown>>,
) {
  const endpoint = new URL("/rest/v1/crm_lead_meta", supabaseUrl);
  endpoint.searchParams.set("on_conflict", "wa_id");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildSupabaseHeaders(serviceRoleKey, {
      Prefer: "resolution=merge-duplicates,return=representation",
    }),
    body: JSON.stringify(rows),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FAILED_TO_UPSERT_META:${response.status}`);
  }

  return (await readJsonResponse<CrmLeadMetaRow[]>(response)) ?? [];
}

async function patchLeadMetaRow(
  supabaseUrl: string,
  serviceRoleKey: string,
  waId: string,
  patch: Record<string, unknown>,
) {
  const endpoint = new URL("/rest/v1/crm_lead_meta", supabaseUrl);
  endpoint.searchParams.set("wa_id", `eq.${waId}`);

  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: buildSupabaseHeaders(serviceRoleKey, {
      Prefer: "return=representation",
    }),
    body: JSON.stringify(patch),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FAILED_TO_PATCH_META:${response.status}`);
  }

  const rows = (await readJsonResponse<CrmLeadMetaRow[]>(response)) ?? [];
  return rows[0] ?? null;
}

async function insertAuditLogs(
  supabaseUrl: string,
  serviceRoleKey: string,
  rows: AuditLogRow[],
) {
  if (rows.length === 0) {
    return;
  }

  const endpoint = new URL("/rest/v1/enova_log", supabaseUrl);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildSupabaseHeaders(serviceRoleKey, {
      Prefer: "return=minimal",
    }),
    body: JSON.stringify(rows),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FAILED_TO_LOG_BASES:${response.status}`);
  }
}

function buildAuditRow(
  waId: string | null,
  tag: AuditLogRow["tag"],
  metaText: string,
  details: Record<string, unknown>,
): AuditLogRow {
  return {
    wa_id: waId,
    tag,
    meta_text: metaText,
    details,
  };
}

export async function POST(request: Request) {
  const missingEnvs = missingEnvNames(REQUIRED_ENVS);
  if (missingEnvs.length > 0) {
    return jsonResponse(500, { ok: false, error: `missing env: ${missingEnvs.join(", ")}` });
  }

  let payload: BasesRequest;
  try {
    payload = (await request.json()) as BasesRequest;
  } catch {
    return jsonResponse(400, { ok: false, error: "INVALID_JSON" });
  }

  const action = payload.action;
  if (!action) {
    return jsonResponse(400, { ok: false, error: "action é obrigatória" });
  }

  const supabaseUrl = process.env.SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE as string;

  try {
    if (action === "add_lead_manual") {
      const row = normalizeLeadMetaInput(payload, {
        defaultLeadSource: "manual",
        defaultAutoOutreachEnabled: false,
        defaultPaused: false,
      });
      const savedRows = await upsertLeadMetaRows(supabaseUrl, serviceRoleKey, [row]);
      const savedRow = savedRows[0] ?? null;
      await insertAuditLogs(supabaseUrl, serviceRoleKey, [
        buildAuditRow(row.wa_id, "bases_add_lead_manual", "Lead adicionado manualmente em Bases", {
          lead_pool: row.lead_pool,
          lead_temp: row.lead_temp,
          lead_source: row.lead_source,
          import_ref: row.import_ref,
          auto_outreach_enabled: row.auto_outreach_enabled,
          is_paused: row.is_paused,
        }),
      ]);
      return jsonResponse(200, { ok: true, action, lead: savedRow });
    }

    if (action === "import_base") {
      const leads = Array.isArray(payload.leads) ? payload.leads : [];
      if (leads.length === 0) {
        return jsonResponse(400, { ok: false, error: "leads é obrigatório" });
      }
      const importRef = normalizeOptionalText(payload.import_ref);
      const rows = leads.map((lead) =>
        normalizeLeadMetaInput(lead, {
          defaultLeadSource: "import",
          defaultImportRef: importRef,
          defaultAutoOutreachEnabled: false,
          defaultPaused: false,
        }),
      );
      const savedRows = await upsertLeadMetaRows(supabaseUrl, serviceRoleKey, rows);
      await insertAuditLogs(
        supabaseUrl,
        serviceRoleKey,
        rows.map((row) =>
          buildAuditRow(row.wa_id, "bases_import", "Lead importado para Bases", {
            lead_pool: row.lead_pool,
            lead_temp: row.lead_temp,
            lead_source: row.lead_source,
            import_ref: row.import_ref,
            auto_outreach_enabled: row.auto_outreach_enabled,
            is_paused: row.is_paused,
          }),
        ),
      );
      return jsonResponse(200, {
        ok: true,
        action,
        imported_count: savedRows.length,
        import_ref: importRef,
      });
    }

    if (action === "move_base") {
      const waId = normalizeOptionalText(payload.wa_id);
      if (!waId) {
        return jsonResponse(400, { ok: false, error: "wa_id é obrigatório" });
      }
      const existing = await loadLeadMeta(supabaseUrl, serviceRoleKey, waId);
      if (!existing) {
        return jsonResponse(404, { ok: false, error: "LEAD_NOT_FOUND" });
      }
      const normalized = normalizeLeadMetaInput(
        {
          ...existing,
          wa_id: waId,
          lead_pool: payload.lead_pool ?? existing.lead_pool,
          lead_temp: payload.lead_temp ?? existing.lead_temp,
          lead_source: payload.lead_source ?? existing.lead_source,
          tags: payload.tags ?? existing.tags,
          obs_curta: payload.obs_curta ?? existing.obs_curta,
          import_ref: payload.import_ref ?? existing.import_ref,
          auto_outreach_enabled: payload.auto_outreach_enabled ?? existing.auto_outreach_enabled,
          is_paused: existing.is_paused,
        },
        {},
      );
      const savedRow = await patchLeadMetaRow(supabaseUrl, serviceRoleKey, waId, normalized);
      await insertAuditLogs(supabaseUrl, serviceRoleKey, [
        buildAuditRow(waId, "bases_move", "Lead movido de base", {
          from_pool: existing.lead_pool,
          to_pool: normalized.lead_pool,
          from_temp: existing.lead_temp,
          to_temp: normalized.lead_temp,
        }),
      ]);
      return jsonResponse(200, { ok: true, action, lead: savedRow });
    }

    if (action === "pause_lead" || action === "resume_lead") {
      const waId = normalizeOptionalText(payload.wa_id);
      if (!waId) {
        return jsonResponse(400, { ok: false, error: "wa_id é obrigatório" });
      }
      const existing = await loadLeadMeta(supabaseUrl, serviceRoleKey, waId);
      if (!existing) {
        return jsonResponse(404, { ok: false, error: "LEAD_NOT_FOUND" });
      }
      const isPaused = action === "pause_lead";
      const savedRow = await patchLeadMetaRow(supabaseUrl, serviceRoleKey, waId, {
        is_paused: isPaused,
        updated_at: new Date().toISOString(),
      });
      await insertAuditLogs(supabaseUrl, serviceRoleKey, [
        buildAuditRow(
          waId,
          isPaused ? "bases_pause" : "bases_resume",
          isPaused ? "Lead pausado em Bases" : "Lead retomado em Bases",
          { is_paused: isPaused },
        ),
      ]);
      return jsonResponse(200, { ok: true, action, lead: savedRow });
    }

    if (action === "call_now") {
      const waId = normalizeOptionalText(payload.wa_id);
      const text = normalizeOptionalText(payload.text);
      if (!waId || !text) {
        return jsonResponse(400, { ok: false, error: "wa_id e text são obrigatórios" });
      }
      const existing = await loadLeadMeta(supabaseUrl, serviceRoleKey, waId);
      const eligibility = assessCallNowEligibility(existing);
      if (!eligibility.ok) {
        await insertAuditLogs(supabaseUrl, serviceRoleKey, [
          buildAuditRow(waId, "bases_call_now", "Call now bloqueado", {
            blocked: true,
            reason: eligibility.reason,
          }),
        ]);
        return jsonResponse(409, { ok: false, error: eligibility.reason });
      }

      const missingCallNowEnvs = missingEnvNames(CALL_NOW_ENVS);
      if (missingCallNowEnvs.length > 0) {
        return jsonResponse(500, { ok: false, error: `missing env: ${missingCallNowEnvs.join(", ")}` });
      }

      const workerEndpoint = new URL("/__admin__/send", process.env.WORKER_BASE_URL as string);
      const workerResponse = await fetch(workerEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-enova-admin-key": process.env.ENOVA_ADMIN_KEY as string,
        },
        body: JSON.stringify({ wa_id: waId, text }),
        cache: "no-store",
      });
      const workerJson = (await readJsonResponse<Record<string, unknown>>(workerResponse)) ?? {};

      await insertAuditLogs(supabaseUrl, serviceRoleKey, [
        buildAuditRow(waId, "bases_call_now", "Call now executado em Bases", {
          blocked: false,
          lead_pool: existing?.lead_pool ?? null,
          lead_temp: existing?.lead_temp ?? null,
          meta_status: workerJson.meta_status ?? null,
          message_id: workerJson.message_id ?? null,
        }),
      ]);

      return jsonResponse(workerResponse.status, { ok: workerResponse.ok, action, ...workerJson });
    }

    if (action === "warmup_base") {
      const candidates = await loadWarmupCandidates(supabaseUrl, serviceRoleKey, payload);
      const selection = buildWarmupSelection(candidates, {
        lead_pool: payload.lead_pool && isLeadPool(payload.lead_pool) ? payload.lead_pool : null,
        lead_temp: payload.lead_temp && isLeadTemp(payload.lead_temp) ? payload.lead_temp : null,
        limit: payload.limit,
      });

      const selectionLogs =
        selection.length > 0
          ? selection.map((row) =>
              buildAuditRow(row.wa_id, "bases_warmup", "Warmup v0 selecionou lead elegível", {
                dispatch_mode: "selection_only",
                lead_pool: row.lead_pool,
                lead_temp: row.lead_temp,
                import_ref: row.import_ref,
                limit: clampWarmupLimit(payload.limit),
              }),
            )
          : [
              buildAuditRow(null, "bases_warmup", "Warmup v0 executado sem leads elegíveis", {
                dispatch_mode: "selection_only",
                lead_pool:
                  payload.lead_pool && isLeadPool(payload.lead_pool) ? payload.lead_pool : null,
                lead_temp:
                  payload.lead_temp && isLeadTemp(payload.lead_temp) ? payload.lead_temp : null,
                limit: clampWarmupLimit(payload.limit),
                selected_count: 0,
              }),
            ];
      await insertAuditLogs(supabaseUrl, serviceRoleKey, selectionLogs);

      return jsonResponse(200, {
        ok: true,
        action,
        dispatch_mode: "selection_only",
        selected_count: selection.length,
        leads: selection,
      });
    }

    return jsonResponse(400, { ok: false, error: "UNKNOWN_ACTION" });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: error instanceof Error ? error.message : "internal error",
    });
  }
}
