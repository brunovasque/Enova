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

export const ANALYSIS_PROFILE_BAND = ["STRONG", "MEDIUM", "WEAK"] as const;
export type AnalysisProfileBand = (typeof ANALYSIS_PROFILE_BAND)[number];

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
  // correspondent return
  analysis_return_summary?: string;
  analysis_return_reason?: string;
  analysis_financing_amount?: number;
  analysis_subsidy_amount?: number;
  analysis_entry_amount?: number;
  analysis_monthly_payment?: number;
  analysis_return_raw?: string;
  analysis_returned_by?: string;
  // profile snapshot
  analysis_profile_type?: string;
  analysis_holder_name?: string;
  analysis_partner_name_snapshot?: string;
  analysis_marital_status?: string;
  analysis_composition_type?: string;
  analysis_income_total?: number;
  analysis_income_holder?: number;
  analysis_income_partner?: number;
  analysis_income_family?: number;
  analysis_holder_work_regime?: string;
  analysis_partner_work_regime?: string;
  analysis_family_work_regime?: string;
  analysis_has_fgts?: boolean;
  analysis_has_down_payment?: boolean;
  analysis_down_payment_amount?: number;
  analysis_has_restriction?: boolean;
  analysis_partner_has_restriction?: boolean;
  analysis_holder_has_ir?: boolean;
  analysis_partner_has_ir?: boolean;
  analysis_ctps_36?: boolean;
  analysis_partner_ctps_36?: boolean;
  analysis_dependents_count?: number;
  analysis_ticket_target?: number;
  analysis_property_goal?: string;
  analysis_profile_summary?: string;
  analysis_snapshot_raw?: string;
  // score
  analysis_profile_score?: number;
  analysis_profile_band?: string;
  analysis_work_score_label?: string;
  analysis_work_score_reason?: string;
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

function normalizeNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeInteger(value: unknown): number | null {
  const n = normalizeNumeric(value);
  return n !== null ? Math.trunc(n) : null;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
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

async function loadCrmLeadMeta(
  supabaseUrl: string,
  serviceRoleKey: string,
  waId: string,
): Promise<Record<string, unknown> | null> {
  const endpoint = new URL("/rest/v1/crm_lead_meta", supabaseUrl);
  endpoint.searchParams.set("select", "*");
  endpoint.searchParams.set("wa_id", `eq.${waId}`);
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint, {
    method: "GET",
    headers: buildSupabaseHeaders(serviceRoleKey),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FAILED_TO_LOAD_CRM_META:${response.status}`);
  }

  const rows = (await readJsonResponse<Record<string, unknown>[]>(response)) ?? [];
  return rows[0] ?? null;
}

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

// Tab filter constants — intentionally explicit subsets of ANALYSIS_STATUS for tab classification
const ANALYSIS_TAB_STATUS = ANALYSIS_STATUS as readonly string[];
const APPROVED_TAB_STATUS: readonly string[] = ["APPROVED_HIGH", "APPROVED_LOW"];
const REJECTED_TAB_STATUS: readonly string[] = ["REJECTED_RECOVERABLE", "REJECTED_HARD"];

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

  // Tab-based filtering using analysis_status enums
  if (options.tab === "analise") {
    endpoint.searchParams.set("status_analise", `in.(${ANALYSIS_TAB_STATUS.join(",")})`);
  } else if (options.tab === "aprovados") {
    endpoint.searchParams.set("status_analise", `in.(${APPROVED_TAB_STATUS.join(",")})`);
  } else if (options.tab === "reprovados") {
    endpoint.searchParams.set("status_analise", `in.(${REJECTED_TAB_STATUS.join(",")})`);
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

// ── Audit helper: log with real from_value ──

async function auditFieldChanges(
  supabaseUrl: string,
  serviceRoleKey: string,
  waId: string,
  current: Record<string, unknown> | null,
  logFields: Array<{ field: string; to: string | null }>,
  operatorName: string | null,
  reasonCode: string | null,
  reasonText: string | null,
): Promise<void> {
  for (const lf of logFields) {
    const rawFrom = current?.[lf.field] ?? null;
    const fromValue = rawFrom !== null && rawFrom !== undefined ? String(rawFrom) : null;
    await insertOverrideLog(supabaseUrl, serviceRoleKey, {
      wa_id: waId,
      field: lf.field,
      from_value: fromValue,
      to_value: lf.to,
      reason_code: reasonCode,
      reason_text: reasonText,
      operator: operatorName,
    });
  }
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
      // Load current state for real audit trail
      const current = await loadCrmLeadMeta(supabaseUrl, serviceRoleKey, waId);

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

      // Correspondent return fields
      if (payload.analysis_return_summary !== undefined) {
        patch.analysis_return_summary = normalizeText(payload.analysis_return_summary);
      }
      if (payload.analysis_return_reason !== undefined) {
        patch.analysis_return_reason = normalizeText(payload.analysis_return_reason);
      }
      if (payload.analysis_financing_amount !== undefined) {
        patch.analysis_financing_amount = normalizeNumeric(payload.analysis_financing_amount);
      }
      if (payload.analysis_subsidy_amount !== undefined) {
        patch.analysis_subsidy_amount = normalizeNumeric(payload.analysis_subsidy_amount);
      }
      if (payload.analysis_entry_amount !== undefined) {
        patch.analysis_entry_amount = normalizeNumeric(payload.analysis_entry_amount);
      }
      if (payload.analysis_monthly_payment !== undefined) {
        patch.analysis_monthly_payment = normalizeNumeric(payload.analysis_monthly_payment);
      }
      if (payload.analysis_return_raw !== undefined) {
        patch.analysis_return_raw = normalizeText(payload.analysis_return_raw);
      }
      if (payload.analysis_returned_by !== undefined) {
        patch.analysis_returned_by = normalizeText(payload.analysis_returned_by);
      }

      // Profile snapshot fields
      if (payload.analysis_profile_type !== undefined) {
        patch.analysis_profile_type = normalizeText(payload.analysis_profile_type);
      }
      if (payload.analysis_holder_name !== undefined) {
        patch.analysis_holder_name = normalizeText(payload.analysis_holder_name);
      }
      if (payload.analysis_partner_name_snapshot !== undefined) {
        patch.analysis_partner_name_snapshot = normalizeText(payload.analysis_partner_name_snapshot);
      }
      if (payload.analysis_marital_status !== undefined) {
        patch.analysis_marital_status = normalizeText(payload.analysis_marital_status);
      }
      if (payload.analysis_composition_type !== undefined) {
        patch.analysis_composition_type = normalizeText(payload.analysis_composition_type);
      }
      if (payload.analysis_income_total !== undefined) {
        patch.analysis_income_total = normalizeNumeric(payload.analysis_income_total);
      }
      if (payload.analysis_income_holder !== undefined) {
        patch.analysis_income_holder = normalizeNumeric(payload.analysis_income_holder);
      }
      if (payload.analysis_income_partner !== undefined) {
        patch.analysis_income_partner = normalizeNumeric(payload.analysis_income_partner);
      }
      if (payload.analysis_income_family !== undefined) {
        patch.analysis_income_family = normalizeNumeric(payload.analysis_income_family);
      }
      if (payload.analysis_holder_work_regime !== undefined) {
        patch.analysis_holder_work_regime = normalizeText(payload.analysis_holder_work_regime);
      }
      if (payload.analysis_partner_work_regime !== undefined) {
        patch.analysis_partner_work_regime = normalizeText(payload.analysis_partner_work_regime);
      }
      if (payload.analysis_family_work_regime !== undefined) {
        patch.analysis_family_work_regime = normalizeText(payload.analysis_family_work_regime);
      }
      if (payload.analysis_has_fgts !== undefined) {
        patch.analysis_has_fgts = normalizeBoolean(payload.analysis_has_fgts);
      }
      if (payload.analysis_has_down_payment !== undefined) {
        patch.analysis_has_down_payment = normalizeBoolean(payload.analysis_has_down_payment);
      }
      if (payload.analysis_down_payment_amount !== undefined) {
        patch.analysis_down_payment_amount = normalizeNumeric(payload.analysis_down_payment_amount);
      }
      if (payload.analysis_has_restriction !== undefined) {
        patch.analysis_has_restriction = normalizeBoolean(payload.analysis_has_restriction);
      }
      if (payload.analysis_partner_has_restriction !== undefined) {
        patch.analysis_partner_has_restriction = normalizeBoolean(payload.analysis_partner_has_restriction);
      }
      if (payload.analysis_holder_has_ir !== undefined) {
        patch.analysis_holder_has_ir = normalizeBoolean(payload.analysis_holder_has_ir);
      }
      if (payload.analysis_partner_has_ir !== undefined) {
        patch.analysis_partner_has_ir = normalizeBoolean(payload.analysis_partner_has_ir);
      }
      if (payload.analysis_ctps_36 !== undefined) {
        patch.analysis_ctps_36 = normalizeBoolean(payload.analysis_ctps_36);
      }
      if (payload.analysis_partner_ctps_36 !== undefined) {
        patch.analysis_partner_ctps_36 = normalizeBoolean(payload.analysis_partner_ctps_36);
      }
      if (payload.analysis_dependents_count !== undefined) {
        patch.analysis_dependents_count = normalizeInteger(payload.analysis_dependents_count);
      }
      if (payload.analysis_ticket_target !== undefined) {
        patch.analysis_ticket_target = normalizeNumeric(payload.analysis_ticket_target);
      }
      if (payload.analysis_property_goal !== undefined) {
        patch.analysis_property_goal = normalizeText(payload.analysis_property_goal);
      }
      if (payload.analysis_profile_summary !== undefined) {
        patch.analysis_profile_summary = normalizeText(payload.analysis_profile_summary);
      }
      if (payload.analysis_snapshot_raw !== undefined) {
        patch.analysis_snapshot_raw = normalizeText(payload.analysis_snapshot_raw);
      }

      // Score fields
      if (payload.analysis_profile_score !== undefined) {
        patch.analysis_profile_score = normalizeInteger(payload.analysis_profile_score);
      }
      if (payload.analysis_profile_band !== undefined) {
        if (payload.analysis_profile_band && !isValidEnum(payload.analysis_profile_band, ANALYSIS_PROFILE_BAND)) {
          return { status: 400, body: { ok: false, error: "analysis_profile_band inválido" } };
        }
        patch.analysis_profile_band = normalizeText(payload.analysis_profile_band);
      }
      if (payload.analysis_work_score_label !== undefined) {
        patch.analysis_work_score_label = normalizeText(payload.analysis_work_score_label);
      }
      if (payload.analysis_work_score_reason !== undefined) {
        patch.analysis_work_score_reason = normalizeText(payload.analysis_work_score_reason);
      }

      const saved = await patchCrmLeadMeta(supabaseUrl, serviceRoleKey, waId, patch);

      await auditFieldChanges(
        supabaseUrl, serviceRoleKey, waId, current, logFields,
        normalizeText(payload.operator),
        normalizeText(payload.analysis_reason_code),
        normalizeText(payload.analysis_reason_text),
      );

      return { status: 200, body: { ok: true, action, lead: saved } };
    }

    if (action === "update_visit") {
      const current = await loadCrmLeadMeta(supabaseUrl, serviceRoleKey, waId);

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

      await auditFieldChanges(
        supabaseUrl, serviceRoleKey, waId, current, logFields,
        normalizeText(payload.operator),
        normalizeText(payload.reason_code),
        normalizeText(payload.reason_text),
      );

      return { status: 200, body: { ok: true, action, lead: saved } };
    }

    if (action === "update_reserve") {
      const current = await loadCrmLeadMeta(supabaseUrl, serviceRoleKey, waId);

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

      await auditFieldChanges(
        supabaseUrl, serviceRoleKey, waId, current, logFields,
        normalizeText(payload.operator),
        normalizeText(payload.reason_code),
        normalizeText(payload.reason_text),
      );

      return { status: 200, body: { ok: true, action, lead: saved } };
    }

    if (action === "update_approved") {
      const current = await loadCrmLeadMeta(supabaseUrl, serviceRoleKey, waId);

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

      await auditFieldChanges(
        supabaseUrl, serviceRoleKey, waId, current, logFields,
        normalizeText(payload.operator),
        normalizeText(payload.reason_code),
        normalizeText(payload.reason_text),
      );

      return { status: 200, body: { ok: true, action, lead: saved } };
    }

    if (action === "update_rejection") {
      const current = await loadCrmLeadMeta(supabaseUrl, serviceRoleKey, waId);

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

      await auditFieldChanges(
        supabaseUrl, serviceRoleKey, waId, current, logFields,
        normalizeText(payload.operator),
        normalizeText(payload.reason_code),
        normalizeText(payload.reason_text),
      );

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
