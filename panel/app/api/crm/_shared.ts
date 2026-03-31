// ============================================================
// Mini-CRM Operacional — Backend (panel/app/api/crm/_shared.ts)
// Escopo: tipos, enums, validação, ações do CRM operacional
// Ownership: crm_lead_meta = status macro CRM (não altera fase_conversa)
// ============================================================

// ── Enums ──

export const ANALYSIS_STATUS = [
  "DOCS_PENDING", "DOCS_READY", "SENT", "UNDER_ANALYSIS",
  "ADJUSTMENT_REQUIRED", "APPROVED_HIGH", "APPROVED_LOW",
  "REJECTED_RECOVERABLE", "REJECTED_HARD",
] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUS)[number];

export const APPROVED_PURCHASE_BAND = ["HIGH", "LOW"] as const;
export type ApprovedPurchaseBand = (typeof APPROVED_PURCHASE_BAND)[number];

export const APPROVED_TARGET_MATCH = ["FULL", "PARTIAL", "WEAK"] as const;
export type ApprovedTargetMatch = (typeof APPROVED_TARGET_MATCH)[number];

export const APPROVED_NEXT_STEP = ["VISIT", "NEGOTIATION", "FOLLOW_UP", "DROP"] as const;
export type ApprovedNextStep = (typeof APPROVED_NEXT_STEP)[number];

export const VISIT_STATUS = [
  "TO_SCHEDULE", "SCHEDULED", "CONFIRMED", "DONE", "NO_SHOW", "CANCELED",
] as const;
export type VisitStatus = (typeof VISIT_STATUS)[number];

export const VISIT_CONTEXT = ["FIRST_ATTENDANCE", "APPROVED_ALREADY"] as const;
export type VisitContext = (typeof VISIT_CONTEXT)[number];

export const VISIT_RESULT = [
  "DONE_WAITING", "CLOSED_PURCHASE", "FOLLOW_UP", "LOST", "NO_SHOW",
] as const;
export type VisitResult = (typeof VISIT_RESULT)[number];

export const RESERVE_STATUS = [
  "OPEN", "DOCS_PENDING", "UNDER_REVIEW", "ADJUSTMENT_REQUIRED",
  "WAITING_CLIENT", "WAITING_CORRESPONDENT", "WAITING_BUILDER",
  "APPROVED", "SIGNED", "CANCELED",
] as const;
export type ReserveStatus = (typeof RESERVE_STATUS)[number];

// ── Types ──

export type CrmAction =
  | "update_analysis"
  | "update_visit"
  | "update_reserve"
  | "update_approved"
  | "update_rejection"
  | "log_override";

export type CrmRequest = {
  action?: CrmAction;
  wa_id?: string;
  // analysis
  analysis_status?: string;
  analysis_reason_code?: string;
  analysis_reason_text?: string;
  analysis_partner_name?: string;
  analysis_adjustment_note?: string;
  // approved
  approved_purchase_band?: string;
  approved_target_match?: string;
  approved_next_step?: string;
  // rejection/recovery
  rejection_reason_code?: string;
  rejection_reason_label?: string;
  recovery_status?: string;
  recovery_strategy_code?: string;
  recovery_note_short?: string;
  next_retry_at?: string;
  // visit
  visit_status?: string;
  visit_context?: string;
  visit_date?: string;
  visit_result?: string;
  visit_objection_code?: string;
  visit_next_step?: string;
  visit_owner?: string;
  visit_notes_short?: string;
  // reserve
  reserve_status?: string;
  reserve_stage_detail?: string;
  reserve_risk_level?: string;
  reserve_next_action_label?: string;
  reserve_next_action_due_at?: string;
  // log override
  field?: string;
  from_value?: string;
  to_value?: string;
  reason_code?: string;
  reason_text?: string;
  operator?: string;
};

export const REQUIRED_ENVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const;

// ── Helpers ──

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function isValidEnum<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
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

// ── DB Operations ──

async function patchCrmLeadMeta(
  supabaseUrl: string,
  serviceRoleKey: string,
  waId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
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
    throw new Error(`FAILED_TO_PATCH_CRM_META:${response.status}`);
  }

  const rows = (await readJsonResponse<Record<string, unknown>[]>(response)) ?? [];
  return rows[0] ?? null;
}

async function insertOverrideLog(
  supabaseUrl: string,
  serviceRoleKey: string,
  row: {
    wa_id: string;
    field: string;
    from_value: string | null;
    to_value: string | null;
    reason_code: string | null;
    reason_text: string | null;
    operator: string | null;
  },
): Promise<void> {
  const endpoint = new URL("/rest/v1/crm_override_log", supabaseUrl);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildSupabaseHeaders(serviceRoleKey, {
      Prefer: "return=minimal",
    }),
    body: JSON.stringify(row),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FAILED_TO_INSERT_OVERRIDE_LOG:${response.status}`);
  }
}

export async function listCrmLeads(
  supabaseUrl: string,
  serviceRoleKey: string,
  options: { tab?: string; limit?: number } = {},
): Promise<Record<string, unknown>[]> {
  const endpoint = new URL("/rest/v1/crm_leads_v1", supabaseUrl);
  endpoint.searchParams.set("select", "*");
  endpoint.searchParams.set("order", "atualizado_em.desc.nullsfirst,wa_id.asc");

  const limit = Math.max(1, Math.min(200, Number.isFinite(Number(options.limit)) ? Math.trunc(Number(options.limit)) : 50));
  endpoint.searchParams.set("limit", String(limit));

  // Tab-based filtering
  if (options.tab === "analise") {
    endpoint.searchParams.set("status_analise", "not.is.null");
  } else if (options.tab === "aprovados") {
    endpoint.searchParams.set("faixa_aprovacao", "not.is.null");
  } else if (options.tab === "reprovados") {
    endpoint.searchParams.set("codigo_motivo_reprovacao", "not.is.null");
  } else if (options.tab === "visita") {
    endpoint.searchParams.set("status_visita", "not.is.null");
  } else if (options.tab === "reserva") {
    endpoint.searchParams.set("status_reserva", "not.is.null");
  }

  const response = await fetch(endpoint, {
    method: "GET",
    headers: buildSupabaseHeaders(serviceRoleKey),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FAILED_TO_LIST_CRM_LEADS:${response.status}`);
  }

  return (await readJsonResponse<Record<string, unknown>[]>(response)) ?? [];
}

// ── Action Router ──

export async function runCrmAction(
  payload: CrmRequest,
  envMap: NodeJS.ProcessEnv = process.env,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const missingEnvs = REQUIRED_ENVS.filter((k) => !envMap[k]);
  if (missingEnvs.length > 0) {
    return { status: 500, body: { ok: false, error: `missing env: ${missingEnvs.join(", ")}` } };
  }

  const action = payload.action;
  if (!action) {
    return { status: 400, body: { ok: false, error: "action é obrigatória" } };
  }

  const waId = normalizeText(payload.wa_id);
  if (!waId) {
    return { status: 400, body: { ok: false, error: "wa_id é obrigatório" } };
  }

  const supabaseUrl = envMap.SUPABASE_URL as string;
  const serviceRoleKey = envMap.SUPABASE_SERVICE_ROLE as string;

  try {
    if (action === "update_analysis") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const logFields: Array<{ field: string; to: string | null }> = [];

      if (payload.analysis_status !== undefined) {
        if (!isValidEnum(payload.analysis_status, ANALYSIS_STATUS)) {
          return { status: 400, body: { ok: false, error: "analysis_status inválido" } };
        }
        patch.analysis_status = payload.analysis_status;
        logFields.push({ field: "analysis_status", to: payload.analysis_status });

        if (payload.analysis_status === "SENT") {
          patch.analysis_last_sent_at = new Date().toISOString();
        }
        if (["APPROVED_HIGH", "APPROVED_LOW", "REJECTED_RECOVERABLE", "REJECTED_HARD", "ADJUSTMENT_REQUIRED"].includes(payload.analysis_status)) {
          patch.analysis_last_return_at = new Date().toISOString();
        }
      }
      if (payload.analysis_reason_code !== undefined) {
        patch.analysis_reason_code = normalizeText(payload.analysis_reason_code);
      }
      if (payload.analysis_reason_text !== undefined) {
        patch.analysis_reason_text = normalizeText(payload.analysis_reason_text);
      }
      if (payload.analysis_partner_name !== undefined) {
        patch.analysis_partner_name = normalizeText(payload.analysis_partner_name);
      }
      if (payload.analysis_adjustment_note !== undefined) {
        patch.analysis_adjustment_note = normalizeText(payload.analysis_adjustment_note);
      }

      const saved = await patchCrmLeadMeta(supabaseUrl, serviceRoleKey, waId, patch);

      for (const lf of logFields) {
        await insertOverrideLog(supabaseUrl, serviceRoleKey, {
          wa_id: waId,
          field: lf.field,
          from_value: null,
          to_value: lf.to,
          reason_code: normalizeText(payload.analysis_reason_code),
          reason_text: normalizeText(payload.analysis_reason_text),
          operator: normalizeText(payload.operator),
        });
      }

      return { status: 200, body: { ok: true, action, lead: saved } };
    }

    if (action === "update_visit") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const logFields: Array<{ field: string; to: string | null }> = [];

      if (payload.visit_status !== undefined) {
        if (!isValidEnum(payload.visit_status, VISIT_STATUS)) {
          return { status: 400, body: { ok: false, error: "visit_status inválido" } };
        }
        patch.visit_status = payload.visit_status;
        logFields.push({ field: "visit_status", to: payload.visit_status });

        if (payload.visit_status === "CONFIRMED") {
          patch.visit_confirmed_at = new Date().toISOString();
        }
      }
      if (payload.visit_context !== undefined) {
        if (!isValidEnum(payload.visit_context, VISIT_CONTEXT)) {
          return { status: 400, body: { ok: false, error: "visit_context inválido" } };
        }
        patch.visit_context = payload.visit_context;
      }
      if (payload.visit_date !== undefined) {
        const ts = normalizeTimestamp(payload.visit_date);
        if (payload.visit_date && !ts) {
          return { status: 400, body: { ok: false, error: "visit_date inválido" } };
        }
        patch.visit_date = ts;
      }
      if (payload.visit_result !== undefined) {
        if (!isValidEnum(payload.visit_result, VISIT_RESULT)) {
          return { status: 400, body: { ok: false, error: "visit_result inválido" } };
        }
        patch.visit_result = payload.visit_result;
        logFields.push({ field: "visit_result", to: payload.visit_result });
      }
      if (payload.visit_objection_code !== undefined) {
        patch.visit_objection_code = normalizeText(payload.visit_objection_code);
      }
      if (payload.visit_next_step !== undefined) {
        patch.visit_next_step = normalizeText(payload.visit_next_step);
      }
      if (payload.visit_owner !== undefined) {
        patch.visit_owner = normalizeText(payload.visit_owner);
      }
      if (payload.visit_notes_short !== undefined) {
        patch.visit_notes_short = normalizeText(payload.visit_notes_short);
      }

      const saved = await patchCrmLeadMeta(supabaseUrl, serviceRoleKey, waId, patch);

      for (const lf of logFields) {
        await insertOverrideLog(supabaseUrl, serviceRoleKey, {
          wa_id: waId,
          field: lf.field,
          from_value: null,
          to_value: lf.to,
          reason_code: normalizeText(payload.reason_code),
          reason_text: normalizeText(payload.reason_text),
          operator: normalizeText(payload.operator),
        });
      }

      return { status: 200, body: { ok: true, action, lead: saved } };
    }

    if (action === "update_reserve") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const logFields: Array<{ field: string; to: string | null }> = [];

      if (payload.reserve_status !== undefined) {
        if (!isValidEnum(payload.reserve_status, RESERVE_STATUS)) {
          return { status: 400, body: { ok: false, error: "reserve_status inválido" } };
        }
        patch.reserve_status = payload.reserve_status;
        patch.reserve_last_movement_at = new Date().toISOString();
        logFields.push({ field: "reserve_status", to: payload.reserve_status });
      }
      if (payload.reserve_stage_detail !== undefined) {
        patch.reserve_stage_detail = normalizeText(payload.reserve_stage_detail);
      }
      if (payload.reserve_risk_level !== undefined) {
        patch.reserve_risk_level = normalizeText(payload.reserve_risk_level);
      }
      if (payload.reserve_next_action_label !== undefined) {
        patch.reserve_next_action_label = normalizeText(payload.reserve_next_action_label);
      }
      if (payload.reserve_next_action_due_at !== undefined) {
        const ts = normalizeTimestamp(payload.reserve_next_action_due_at);
        if (payload.reserve_next_action_due_at && !ts) {
          return { status: 400, body: { ok: false, error: "reserve_next_action_due_at inválido" } };
        }
        patch.reserve_next_action_due_at = ts;
      }

      const saved = await patchCrmLeadMeta(supabaseUrl, serviceRoleKey, waId, patch);

      for (const lf of logFields) {
        await insertOverrideLog(supabaseUrl, serviceRoleKey, {
          wa_id: waId,
          field: lf.field,
          from_value: null,
          to_value: lf.to,
          reason_code: normalizeText(payload.reason_code),
          reason_text: normalizeText(payload.reason_text),
          operator: normalizeText(payload.operator),
        });
      }

      return { status: 200, body: { ok: true, action, lead: saved } };
    }

    if (action === "update_approved") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const logFields: Array<{ field: string; to: string | null }> = [];

      if (payload.approved_purchase_band !== undefined) {
        if (!isValidEnum(payload.approved_purchase_band, APPROVED_PURCHASE_BAND)) {
          return { status: 400, body: { ok: false, error: "approved_purchase_band inválido" } };
        }
        patch.approved_purchase_band = payload.approved_purchase_band;
        logFields.push({ field: "approved_purchase_band", to: payload.approved_purchase_band });
      }
      if (payload.approved_target_match !== undefined) {
        if (!isValidEnum(payload.approved_target_match, APPROVED_TARGET_MATCH)) {
          return { status: 400, body: { ok: false, error: "approved_target_match inválido" } };
        }
        patch.approved_target_match = payload.approved_target_match;
      }
      if (payload.approved_next_step !== undefined) {
        if (!isValidEnum(payload.approved_next_step, APPROVED_NEXT_STEP)) {
          return { status: 400, body: { ok: false, error: "approved_next_step inválido" } };
        }
        patch.approved_next_step = payload.approved_next_step;
        logFields.push({ field: "approved_next_step", to: payload.approved_next_step });
      }

      patch.approved_last_contact_at = new Date().toISOString();

      const saved = await patchCrmLeadMeta(supabaseUrl, serviceRoleKey, waId, patch);

      for (const lf of logFields) {
        await insertOverrideLog(supabaseUrl, serviceRoleKey, {
          wa_id: waId,
          field: lf.field,
          from_value: null,
          to_value: lf.to,
          reason_code: normalizeText(payload.reason_code),
          reason_text: normalizeText(payload.reason_text),
          operator: normalizeText(payload.operator),
        });
      }

      return { status: 200, body: { ok: true, action, lead: saved } };
    }

    if (action === "update_rejection") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const logFields: Array<{ field: string; to: string | null }> = [];

      if (payload.rejection_reason_code !== undefined) {
        patch.rejection_reason_code = normalizeText(payload.rejection_reason_code);
        logFields.push({ field: "rejection_reason_code", to: normalizeText(payload.rejection_reason_code) });
      }
      if (payload.rejection_reason_label !== undefined) {
        patch.rejection_reason_label = normalizeText(payload.rejection_reason_label);
      }
      if (payload.recovery_status !== undefined) {
        patch.recovery_status = normalizeText(payload.recovery_status);
        logFields.push({ field: "recovery_status", to: normalizeText(payload.recovery_status) });
      }
      if (payload.recovery_strategy_code !== undefined) {
        patch.recovery_strategy_code = normalizeText(payload.recovery_strategy_code);
      }
      if (payload.recovery_note_short !== undefined) {
        patch.recovery_note_short = normalizeText(payload.recovery_note_short);
      }
      if (payload.next_retry_at !== undefined) {
        const ts = normalizeTimestamp(payload.next_retry_at);
        if (payload.next_retry_at && !ts) {
          return { status: 400, body: { ok: false, error: "next_retry_at inválido" } };
        }
        patch.next_retry_at = ts;
      }

      patch.last_retry_contact_at = new Date().toISOString();

      const saved = await patchCrmLeadMeta(supabaseUrl, serviceRoleKey, waId, patch);

      for (const lf of logFields) {
        await insertOverrideLog(supabaseUrl, serviceRoleKey, {
          wa_id: waId,
          field: lf.field,
          from_value: null,
          to_value: lf.to,
          reason_code: normalizeText(payload.reason_code),
          reason_text: normalizeText(payload.reason_text),
          operator: normalizeText(payload.operator),
        });
      }

      return { status: 200, body: { ok: true, action, lead: saved } };
    }

    if (action === "log_override") {
      const field = normalizeText(payload.field);
      if (!field) {
        return { status: 400, body: { ok: false, error: "field é obrigatório para log_override" } };
      }

      await insertOverrideLog(supabaseUrl, serviceRoleKey, {
        wa_id: waId,
        field,
        from_value: normalizeText(payload.from_value),
        to_value: normalizeText(payload.to_value),
        reason_code: normalizeText(payload.reason_code),
        reason_text: normalizeText(payload.reason_text),
        operator: normalizeText(payload.operator),
      });

      return { status: 200, body: { ok: true, action, logged: true } };
    }

    return { status: 400, body: { ok: false, error: "UNKNOWN_ACTION" } };
  } catch (error) {
    return {
      status: 500,
      body: {
        ok: false,
        error: error instanceof Error ? error.message : "internal error",
      },
    };
  }
}
