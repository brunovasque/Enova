export const LEAD_POOLS = ["COLD_POOL", "WARM_POOL", "HOT_POOL"] as const;
export const LEAD_TEMPS = ["COLD", "WARM", "HOT"] as const;
export const CANONICAL_SOURCE_TYPES = ["campanha", "morna", "fria", "lyx"] as const;

export type LeadPool = (typeof LEAD_POOLS)[number];
export type LeadTemp = (typeof LEAD_TEMPS)[number];
export type SourceType = (typeof CANONICAL_SOURCE_TYPES)[number];

export type CrmLeadMetaRow = {
  wa_id: string;
  nome: string | null;
  telefone: string | null;
  lead_pool: LeadPool;
  lead_temp: LeadTemp;
  lead_source: string | null;
  tags: string[];
  obs_curta: string | null;
  import_ref: string | null;
  auto_outreach_enabled: boolean;
  is_paused: boolean;
  created_at: string | null;
  updated_at: string | null;
  ultima_acao: string | null;
  ultimo_contato_at: string | null;
  status_operacional: string | null;
  // Arquivamento — colunas próprias, independentes de is_paused
  is_archived: boolean;
  archived_at: string | null;
  archive_reason_code: string | null;
  archive_reason_note: string | null;
  // Incidente aberto — lido de enova_attendance_meta via bases_leads_v1
  tem_incidente_aberto: boolean | null;
  tipo_incidente: string | null;
  severidade_incidente: string | null;
};

type LeadMetaInput = {
  wa_id?: unknown;
  nome?: unknown;
  telefone?: unknown;
  lead_pool?: unknown;
  lead_temp?: unknown;
  lead_source?: unknown;
  tags?: unknown;
  obs_curta?: unknown;
  import_ref?: unknown;
  auto_outreach_enabled?: unknown;
  is_paused?: unknown;
};

type NormalizeLeadMetaOptions = {
  defaultLeadPool?: LeadPool;
  defaultLeadTemp?: LeadTemp;
  defaultLeadSource?: string;
  defaultImportRef?: string | null;
  defaultAutoOutreachEnabled?: boolean;
  defaultPaused?: boolean;
};

export type WarmupSelectionOptions = {
  lead_pool?: LeadPool | null;
  lead_temp?: LeadTemp | null;
  lead_source?: string | null;
  limit?: number;
};

export type BasesAction =
  | "add_lead_manual"
  | "import_base"
  | "move_base"
  | "pause_lead"
  | "resume_lead"
  | "call_now"
  | "warmup_base"
  | "warmup_dispatch"
  | "update_obs"
  | "archive_lead"
  | "unarchive_lead";

export type BasesRequest = {
  action?: BasesAction;
  wa_id?: string;
  wa_ids?: string[];
  nome?: string;
  telefone?: string;
  text?: string;
  lead_pool?: string;
  lead_temp?: string;
  lead_source?: string;
  source_type?: string;
  tags?: unknown;
  obs_curta?: string;
  status_operacional?: string;
  import_ref?: string;
  auto_outreach_enabled?: boolean;
  is_paused?: boolean;
  leads?: Array<Record<string, unknown>>;
  limit?: number;
  // arquivamento
  archive_reason_code?: string;
  archive_reason_note?: string;
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
    | "bases_warmup"
    | "bases_warmup_dispatch"
    | "bases_update_obs"
    | "bases_archive"
    | "bases_unarchive";
  meta_text: string;
  details: Record<string, unknown>;
};

export const REQUIRED_ENVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const;
export const CALL_NOW_ENVS = ["WORKER_BASE_URL", "ENOVA_ADMIN_KEY"] as const;
export const VALID_STATUS_OPERACIONAL = ["SEM_CONTATO", "CONTATADO", "AGUARDANDO_RETORNO", "PAUSADO"] as const;
export type StatusOperacional = (typeof VALID_STATUS_OPERACIONAL)[number];

// Limits for panel list queries. Archived leads use a higher default because they
// form a single cross-pool list (not paginated per-pool like active leads).
export const LIST_LEADS_DEFAULT_LIMIT = 50;
export const LIST_ARCHIVED_LEADS_DEFAULT_LIMIT = 200;

export function defaultLeadTempForPool(leadPool: LeadPool): LeadTemp {
  if (leadPool === "WARM_POOL") return "WARM";
  if (leadPool === "HOT_POOL") return "HOT";
  return "COLD";
}

export function isLeadPool(value: unknown): value is LeadPool {
  return typeof value === "string" && LEAD_POOLS.includes(value as LeadPool);
}

export function isLeadTemp(value: unknown): value is LeadTemp {
  return typeof value === "string" && LEAD_TEMPS.includes(value as LeadTemp);
}

export function canonicalSourceType(value: unknown): SourceType {
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if ((CANONICAL_SOURCE_TYPES as readonly string[]).includes(lower)) return lower as SourceType;
  }
  return "fria";
}

export function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeTags(value: unknown): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const unique = new Set<string>();
  for (const entry of rawValues) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    unique.add(trimmed);
  }

  return Array.from(unique);
}

export function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Normalizes a raw phone string to a WhatsApp ID (wa_id).
 * Strips non-digit characters, then prepends Brazil country code "55"
 * when the number has 10–11 digits (DDD + subscriber number).
 * Returns null if the result is not a plausible wa_id (< 10 digits).
 */
export function normalizePhoneToWaId(phone: unknown): string | null {
  if (typeof phone !== "string") return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;
  // Already full international with "55" prefix: 12 digits (landline) or 13 digits (mobile)
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return digits;
  }
  // 10 or 11 digits = DDD + subscriber number (no country code)
  if (digits.length >= 10 && digits.length <= 11) {
    return "55" + digits;
  }
  // Fallback: return digits if they look plausible (≥ 7), caller must validate
  if (digits.length >= 7) return digits;
  return null;
}

export function normalizeLeadMetaInput(
  input: LeadMetaInput,
  options: NormalizeLeadMetaOptions = {},
  // Archive fields (is_archived, archived_at, archive_reason_*) are intentionally excluded from
  // the return type so that operations like move_base and upsert never overwrite them. Archive
  // state is owned exclusively by the archive_lead / unarchive_lead actions.
): Omit<CrmLeadMetaRow, "created_at" | "ultima_acao" | "ultimo_contato_at" | "status_operacional" | "tem_incidente_aberto" | "tipo_incidente" | "severidade_incidente" | "is_archived" | "archived_at" | "archive_reason_code" | "archive_reason_note"> {
  const rawWaId = normalizeOptionalText(input.wa_id);
  const rawTelefone = normalizeOptionalText(input.telefone);
  // wa_id can be provided directly or derived from telefone
  const waId = rawWaId ?? (rawTelefone ? normalizePhoneToWaId(rawTelefone) : null);
  if (!waId) {
    throw new Error("wa_id ou telefone é obrigatório");
  }

  const leadPoolRaw = input.lead_pool ?? options.defaultLeadPool;
  if (!isLeadPool(leadPoolRaw)) {
    throw new Error("lead_pool inválido");
  }

  const leadTempRaw = input.lead_temp ?? options.defaultLeadTemp ?? defaultLeadTempForPool(leadPoolRaw);
  if (!isLeadTemp(leadTempRaw)) {
    throw new Error("lead_temp inválido");
  }

  return {
    wa_id: waId,
    nome: normalizeOptionalText(input.nome),
    telefone: rawTelefone,
    lead_pool: leadPoolRaw,
    lead_temp: leadTempRaw,
    lead_source: normalizeOptionalText(input.lead_source) ?? normalizeOptionalText(options.defaultLeadSource) ?? null,
    tags: normalizeTags(input.tags),
    obs_curta: normalizeOptionalText(input.obs_curta),
    import_ref: normalizeOptionalText(input.import_ref) ?? normalizeOptionalText(options.defaultImportRef) ?? null,
    auto_outreach_enabled: normalizeBoolean(
      input.auto_outreach_enabled,
      options.defaultAutoOutreachEnabled ?? false,
    ),
    is_paused: normalizeBoolean(input.is_paused, options.defaultPaused ?? false),
    updated_at: new Date().toISOString(),
  };
}

export function clampWarmupLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(50, Math.trunc(parsed)));
}

export function buildWarmupSelection(
  rows: CrmLeadMetaRow[],
  options: WarmupSelectionOptions = {},
): CrmLeadMetaRow[] {
  const limit = clampWarmupLimit(options.limit);
  const filtered = rows.filter((row) => {
    if (row.is_paused) {
      return false;
    }
    if (options.lead_pool && row.lead_pool !== options.lead_pool) {
      return false;
    }
    if (options.lead_temp && row.lead_temp !== options.lead_temp) {
      return false;
    }
    if (options.lead_source && row.lead_source !== options.lead_source) {
      return false;
    }
    return true;
  });

  return filtered
    .slice()
    .sort((left, right) => {
      const leftTs = left.updated_at ? new Date(left.updated_at).getTime() : Number.POSITIVE_INFINITY;
      const rightTs = right.updated_at ? new Date(right.updated_at).getTime() : Number.POSITIVE_INFINITY;
      if (leftTs !== rightTs) {
        return leftTs - rightTs;
      }
      return left.wa_id.localeCompare(right.wa_id);
    })
    .slice(0, limit);
}

export function assessCallNowEligibility(
  row: CrmLeadMetaRow | null,
): { ok: true } | { ok: false; reason: string } {
  if (!row) {
    return { ok: false, reason: "LEAD_NOT_FOUND" };
  }
  if (!isLeadPool(row.lead_pool) || !isLeadTemp(row.lead_temp)) {
    return { ok: false, reason: "INVALID_LEAD_META" };
  }
  if (row.is_paused) {
    return { ok: false, reason: "LEAD_PAUSED" };
  }
  return { ok: true };
}

function missingEnvNames(
  names: readonly string[],
  envMap: NodeJS.ProcessEnv,
): string[] {
  return names.filter((envName) => !envMap[envName]);
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
    "wa_id,nome,telefone,lead_pool,lead_temp,lead_source,tags,obs_curta,import_ref,auto_outreach_enabled,is_paused,is_archived,archived_at,archive_reason_code,archive_reason_note,created_at,updated_at,ultima_acao,ultimo_contato_at,status_operacional",
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
    "wa_id,nome,telefone,lead_pool,lead_temp,lead_source,tags,obs_curta,import_ref,auto_outreach_enabled,is_paused,is_archived,archived_at,archive_reason_code,archive_reason_note,created_at,updated_at,ultima_acao,ultimo_contato_at,status_operacional",
  );
  endpoint.searchParams.set("is_paused", "eq.false");
  endpoint.searchParams.set("is_archived", "eq.false");
  endpoint.searchParams.set("order", "updated_at.asc,wa_id.asc");
  endpoint.searchParams.set("limit", String(Math.max(50, clampWarmupLimit(payload.limit) * 2)));

  if (payload.lead_pool && isLeadPool(payload.lead_pool)) {
    endpoint.searchParams.set("lead_pool", `eq.${payload.lead_pool}`);
  }
  if (payload.lead_temp && isLeadTemp(payload.lead_temp)) {
    endpoint.searchParams.set("lead_temp", `eq.${payload.lead_temp}`);
  }
  const leadSource = normalizeOptionalText(payload.lead_source);
  if (leadSource) {
    endpoint.searchParams.set("lead_source", `eq.${leadSource}`);
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

// ── Duplicate check ──

/**
 * Returns true if a row with the given wa_id already exists in crm_lead_meta.
 * Used to block duplicate lead creation via add_lead_manual.
 */
async function checkLeadExistsByWaId(
  supabaseUrl: string,
  serviceRoleKey: string,
  waId: string,
): Promise<boolean> {
  const endpoint = new URL("/rest/v1/crm_lead_meta", supabaseUrl);
  endpoint.searchParams.set("select", "wa_id");
  endpoint.searchParams.set("wa_id", `eq.${waId}`);
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint, {
    method: "GET",
    headers: buildSupabaseHeaders(serviceRoleKey),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FAILED_TO_CHECK_DUPLICATE:${response.status}`);
  }

  const rows = (await readJsonResponse<{ wa_id: string }[]>(response)) ?? [];
  return rows.length > 0;
}

async function upsertEnovaStateSourceType(
  supabaseUrl: string,
  serviceRoleKey: string,
  rows: Array<{ wa_id: string; source_type: string; nome?: string | null }>,
) {
  if (rows.length === 0) return;

  const endpoint = new URL("/rest/v1/enova_state", supabaseUrl);
  endpoint.searchParams.set("on_conflict", "wa_id");

  const payload = rows.map(({ wa_id, source_type, nome }) => {
    const entry: Record<string, unknown> = { wa_id, source_type };
    if (nome != null) entry.nome = nome;
    return entry;
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildSupabaseHeaders(serviceRoleKey, {
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FAILED_TO_SET_SOURCE_TYPE:${response.status}`);
  }
}

export type ListLeadsOptions = {
  lead_pool?: LeadPool | null;
  lead_temp?: LeadTemp | null;
  limit?: number;
};

export async function listLeadsForPanel(
  supabaseUrl: string,
  serviceRoleKey: string,
  options: ListLeadsOptions = {},
): Promise<CrmLeadMetaRow[]> {
  // Uses bases_leads_v1 view (crm_lead_meta LEFT JOIN enova_attendance_meta)
  // so that incident fields arrive in the same payload as lead metadata.
  const endpoint = new URL("/rest/v1/bases_leads_v1", supabaseUrl);
  endpoint.searchParams.set(
    "select",
    "wa_id,nome,telefone,lead_pool,lead_temp,lead_source,tags,obs_curta,import_ref,auto_outreach_enabled,is_paused,is_archived,archived_at,created_at,updated_at,ultima_acao,ultimo_contato_at,status_operacional,tem_incidente_aberto,tipo_incidente,severidade_incidente",
  );
  endpoint.searchParams.set("is_archived", "eq.false");
  endpoint.searchParams.set("order", "updated_at.desc,wa_id.asc");

  const limit = Math.max(1, Math.min(200, Number.isFinite(Number(options.limit)) ? Math.trunc(Number(options.limit)) : LIST_LEADS_DEFAULT_LIMIT));
  endpoint.searchParams.set("limit", String(limit));

  if (options.lead_pool && isLeadPool(options.lead_pool)) {
    endpoint.searchParams.set("lead_pool", `eq.${options.lead_pool}`);
  }
  if (options.lead_temp && isLeadTemp(options.lead_temp)) {
    endpoint.searchParams.set("lead_temp", `eq.${options.lead_temp}`);
  }

  const response = await fetch(endpoint, {
    method: "GET",
    headers: buildSupabaseHeaders(serviceRoleKey),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FAILED_TO_LIST_LEADS:${response.status}`);
  }

  return (await readJsonResponse<CrmLeadMetaRow[]>(response)) ?? [];
}

export async function listArchivedLeadsForPanel(
  supabaseUrl: string,
  serviceRoleKey: string,
  options: { limit?: number } = {},
): Promise<CrmLeadMetaRow[]> {
  // Returns only archived leads (is_archived=true) from bases_leads_v1 view.
  const endpoint = new URL("/rest/v1/bases_leads_v1", supabaseUrl);
  endpoint.searchParams.set(
    "select",
    "wa_id,nome,telefone,lead_pool,lead_temp,lead_source,tags,obs_curta,import_ref,auto_outreach_enabled,is_paused,is_archived,archived_at,created_at,updated_at,ultima_acao,ultimo_contato_at,status_operacional,tem_incidente_aberto,tipo_incidente,severidade_incidente",
  );
  endpoint.searchParams.set("is_archived", "eq.true");
  endpoint.searchParams.set("order", "archived_at.desc.nullsfirst,updated_at.desc,wa_id.asc");

  const limit = Math.max(1, Math.min(200, Number.isFinite(Number(options.limit)) ? Math.trunc(Number(options.limit)) : LIST_ARCHIVED_LEADS_DEFAULT_LIMIT));
  endpoint.searchParams.set("limit", String(limit));

  const response = await fetch(endpoint, {
    method: "GET",
    headers: buildSupabaseHeaders(serviceRoleKey),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FAILED_TO_LIST_ARCHIVED_LEADS:${response.status}`);
  }

  return (await readJsonResponse<CrmLeadMetaRow[]>(response)) ?? [];
}

export async function runBasesAction(
  payload: BasesRequest,
  envMap: NodeJS.ProcessEnv = process.env,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const missingEnvs = missingEnvNames(REQUIRED_ENVS, envMap);
  if (missingEnvs.length > 0) {
    return { status: 500, body: { ok: false, error: `missing env: ${missingEnvs.join(", ")}` } };
  }

  const action = payload.action;
  if (!action) {
    return { status: 400, body: { ok: false, error: "action é obrigatória" } };
  }

  const supabaseUrl = envMap.SUPABASE_URL as string;
  const serviceRoleKey = envMap.SUPABASE_SERVICE_ROLE as string;

  try {
    if (action === "add_lead_manual") {
      const sourceType = canonicalSourceType(payload.source_type ?? payload.lead_source);
      const row = normalizeLeadMetaInput({ ...payload, lead_source: sourceType }, {
        defaultLeadSource: sourceType,
        defaultAutoOutreachEnabled: true,
        defaultPaused: false,
      });
      const alreadyExists = await checkLeadExistsByWaId(supabaseUrl, serviceRoleKey, row.wa_id);
      if (alreadyExists) {
        return {
          status: 409,
          body: { ok: false, error: "Já existe um lead cadastrado com este número." },
        };
      }
      // Note: the check above and the upsert below are not atomic. In a concurrent
      // request scenario, two simultaneous add_lead_manual calls for the same wa_id
      // could both pass the check. The underlying upsert with on_conflict:wa_id ensures
      // only one row exists at the end (merge-duplicates), so no data corruption occurs.
      // The second request would then be a silent update, not a true duplicate.
      const savedRows = await upsertLeadMetaRows(supabaseUrl, serviceRoleKey, [row]);
      const savedRow = savedRows[0] ?? null;
      await upsertEnovaStateSourceType(supabaseUrl, serviceRoleKey, [
        { wa_id: row.wa_id, source_type: sourceType, nome: row.nome },
      ]);
      await insertAuditLogs(supabaseUrl, serviceRoleKey, [
        buildAuditRow(row.wa_id, "bases_add_lead_manual", "Lead adicionado manualmente em Bases", {
          lead_pool: row.lead_pool,
          lead_temp: row.lead_temp,
          lead_source: row.lead_source,
          source_type: sourceType,
          import_ref: row.import_ref,
          auto_outreach_enabled: row.auto_outreach_enabled,
          is_paused: row.is_paused,
        }),
      ]);
      return { status: 200, body: { ok: true, action, lead: savedRow } };
    }

    if (action === "import_base") {
      const leads = Array.isArray(payload.leads) ? payload.leads : [];
      if (leads.length === 0) {
        return { status: 400, body: { ok: false, error: "leads é obrigatório" } };
      }
      const importRef = normalizeOptionalText(payload.import_ref);
      const rows = leads.map((lead) => {
        const leadSourceType = canonicalSourceType(lead.source_type ?? payload.source_type);
        return normalizeLeadMetaInput(
          { ...lead, lead_source: leadSourceType },
          {
            defaultLeadSource: leadSourceType,
            defaultImportRef: importRef,
            defaultAutoOutreachEnabled: true,
            defaultPaused: false,
          },
        );
      });
      const savedRows = await upsertLeadMetaRows(supabaseUrl, serviceRoleKey, rows);
      await upsertEnovaStateSourceType(
        supabaseUrl,
        serviceRoleKey,
        rows.map((row) => ({ wa_id: row.wa_id, source_type: canonicalSourceType(row.lead_source) })),
      );
      await insertAuditLogs(
        supabaseUrl,
        serviceRoleKey,
        rows.map((row) =>
          buildAuditRow(row.wa_id, "bases_import", "Lead importado para Bases", {
            lead_pool: row.lead_pool,
            lead_temp: row.lead_temp,
            lead_source: row.lead_source,
            source_type: row.lead_source,
            import_ref: row.import_ref,
            auto_outreach_enabled: row.auto_outreach_enabled,
            is_paused: row.is_paused,
          }),
        ),
      );
      return {
        status: 200,
        body: {
          ok: true,
          action,
          imported_count: savedRows.length,
          import_ref: importRef,
        },
      };
    }

    if (action === "move_base") {
      const waId = normalizeOptionalText(payload.wa_id);
      if (!waId) {
        return { status: 400, body: { ok: false, error: "wa_id é obrigatório" } };
      }
      const existing = await loadLeadMeta(supabaseUrl, serviceRoleKey, waId);
      if (!existing) {
        return { status: 404, body: { ok: false, error: "LEAD_NOT_FOUND" } };
      }
      const normalized = normalizeLeadMetaInput(
        {
          ...existing,
          wa_id: waId,
          lead_pool: payload.lead_pool ?? existing.lead_pool,
          lead_temp: payload.lead_temp,
          lead_source: payload.lead_source ?? existing.lead_source,
          tags: payload.tags ?? existing.tags,
          obs_curta: payload.obs_curta ?? existing.obs_curta,
          import_ref: payload.import_ref ?? existing.import_ref,
          auto_outreach_enabled: payload.auto_outreach_enabled ?? existing.auto_outreach_enabled,
          is_paused: existing.is_paused,
        },
        {},
      );
      const savedRow = await patchLeadMetaRow(supabaseUrl, serviceRoleKey, waId, {
        ...normalized,
        ultima_acao: "MOVE",
      });
      await insertAuditLogs(supabaseUrl, serviceRoleKey, [
        buildAuditRow(waId, "bases_move", "Lead movido de base", {
          from_pool: existing.lead_pool,
          to_pool: normalized.lead_pool,
          from_temp: existing.lead_temp,
          to_temp: normalized.lead_temp,
        }),
      ]);
      return { status: 200, body: { ok: true, action, lead: savedRow } };
    }

    if (action === "pause_lead" || action === "resume_lead") {
      const waId = normalizeOptionalText(payload.wa_id);
      if (!waId) {
        return { status: 400, body: { ok: false, error: "wa_id é obrigatório" } };
      }
      const existing = await loadLeadMeta(supabaseUrl, serviceRoleKey, waId);
      if (!existing) {
        return { status: 404, body: { ok: false, error: "LEAD_NOT_FOUND" } };
      }
      const isPaused = action === "pause_lead";
      const now = new Date().toISOString();
      const statusOp: string | null = isPaused
        ? "PAUSADO"
        : existing.ultimo_contato_at
          ? "AGUARDANDO_RETORNO"
          : null;
      const savedRow = await patchLeadMetaRow(supabaseUrl, serviceRoleKey, waId, {
        is_paused: isPaused,
        updated_at: now,
        ultima_acao: isPaused ? "PAUSE" : "RESUME",
        status_operacional: statusOp,
      });
      await insertAuditLogs(supabaseUrl, serviceRoleKey, [
        buildAuditRow(
          waId,
          isPaused ? "bases_pause" : "bases_resume",
          isPaused ? "Lead pausado em Bases" : "Lead retomado em Bases",
          { is_paused: isPaused },
        ),
      ]);
      return { status: 200, body: { ok: true, action, lead: savedRow } };
    }

    if (action === "call_now") {
      const waId = normalizeOptionalText(payload.wa_id);
      const text = normalizeOptionalText(payload.text);
      if (!waId || !text) {
        return { status: 400, body: { ok: false, error: "wa_id e text são obrigatórios" } };
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
        return { status: 409, body: { ok: false, error: eligibility.reason } };
      }

      const missingCallNowEnvs = missingEnvNames(CALL_NOW_ENVS, envMap);
      if (missingCallNowEnvs.length > 0) {
        return {
          status: 500,
          body: { ok: false, error: `missing env: ${missingCallNowEnvs.join(", ")}` },
        };
      }

      const workerEndpoint = new URL("/__admin__/send", envMap.WORKER_BASE_URL as string);
      const workerResponse = await fetch(workerEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-enova-admin-key": envMap.ENOVA_ADMIN_KEY as string,
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

      if (workerResponse.ok) {
        const contactedAt = new Date().toISOString();
        await patchLeadMetaRow(supabaseUrl, serviceRoleKey, waId, {
          ultima_acao: "CALL_NOW",
          ultimo_contato_at: contactedAt,
          status_operacional: "AGUARDANDO_RETORNO",
          updated_at: contactedAt,
        });
      }

      return {
        status: workerResponse.status,
        body: { ok: workerResponse.ok, action, ...workerJson },
      };
    }

    if (action === "warmup_base") {
      const leadSource = normalizeOptionalText(payload.lead_source) ?? null;
      const candidates = await loadWarmupCandidates(supabaseUrl, serviceRoleKey, payload);
      const selection = buildWarmupSelection(candidates, {
        lead_pool: payload.lead_pool && isLeadPool(payload.lead_pool) ? payload.lead_pool : null,
        lead_temp: payload.lead_temp && isLeadTemp(payload.lead_temp) ? payload.lead_temp : null,
        lead_source: leadSource,
        limit: payload.limit,
      });

      const selectionLogs =
        selection.length > 0
          ? selection.map((row) =>
              buildAuditRow(row.wa_id, "bases_warmup", "Warmup v0 selecionou lead elegível", {
                dispatch_mode: "selection_only",
                lead_pool: row.lead_pool,
                lead_temp: row.lead_temp,
                lead_source: leadSource,
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
                lead_source: leadSource,
                limit: clampWarmupLimit(payload.limit),
                selected_count: 0,
              }),
            ];
      await insertAuditLogs(supabaseUrl, serviceRoleKey, selectionLogs);

      return {
        status: 200,
        body: {
          ok: true,
          action,
          dispatch_mode: "selection_only",
          selected_count: selection.length,
          leads: selection,
        },
      };
    }

    if (action === "warmup_dispatch") {
      const waIds = Array.isArray(payload.wa_ids)
        ? payload.wa_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        : [];
      const text = normalizeOptionalText(payload.text);

      if (waIds.length === 0) {
        return { status: 400, body: { ok: false, error: "wa_ids é obrigatório" } };
      }
      if (!text) {
        return { status: 400, body: { ok: false, error: "text é obrigatório" } };
      }

      const missingCallNowEnvs = missingEnvNames(CALL_NOW_ENVS, envMap);
      if (missingCallNowEnvs.length > 0) {
        return {
          status: 500,
          body: { ok: false, error: `missing env: ${missingCallNowEnvs.join(", ")}` },
        };
      }

      const workerEndpoint = new URL("/__admin__/send", envMap.WORKER_BASE_URL as string);

      type DispatchResult = { wa_id: string; ok: boolean; reason?: string; message_id?: string };
      const results: DispatchResult[] = [];

      for (const waId of waIds) {
        const existing = await loadLeadMeta(supabaseUrl, serviceRoleKey, waId);
        const eligibility = assessCallNowEligibility(existing);
        if (!eligibility.ok) {
          results.push({ wa_id: waId, ok: false, reason: eligibility.reason });
          continue;
        }
        try {
          const workerResponse = await fetch(workerEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-enova-admin-key": envMap.ENOVA_ADMIN_KEY as string,
            },
            body: JSON.stringify({ wa_id: waId, text }),
            cache: "no-store",
          });
          const workerJson = (await readJsonResponse<Record<string, unknown>>(workerResponse)) ?? {};
          results.push({
            wa_id: waId,
            ok: workerResponse.ok,
            message_id: typeof workerJson.message_id === "string" ? workerJson.message_id : undefined,
          });
          if (workerResponse.ok) {
            const contactedAt = new Date().toISOString();
            await patchLeadMetaRow(supabaseUrl, serviceRoleKey, waId, {
              ultima_acao: "WARMUP",
              ultimo_contato_at: contactedAt,
              status_operacional: "AGUARDANDO_RETORNO",
              updated_at: contactedAt,
            });
            if (existing?.lead_source) {
              try {
                await upsertEnovaStateSourceType(supabaseUrl, serviceRoleKey, [
                  { wa_id: waId, source_type: canonicalSourceType(existing.lead_source) },
                ]);
              } catch (sourceTypeErr) {
                console.error("[warmup_dispatch] failed to reconsolidate source_type for wa_id:", waId, sourceTypeErr);
              }
            }
          }
        } catch (dispatchErr) {
          console.error("[warmup_dispatch] failed to dispatch wa_id:", waId, dispatchErr);
          results.push({ wa_id: waId, ok: false, reason: "DISPATCH_ERROR" });
        }
      }

      await insertAuditLogs(
        supabaseUrl,
        serviceRoleKey,
        results.map((r) =>
          buildAuditRow(r.wa_id, "bases_warmup_dispatch", r.ok ? "Warmup dispatch enviado" : "Warmup dispatch bloqueado", {
            ok: r.ok,
            reason: r.reason ?? null,
            message_id: r.message_id ?? null,
          }),
        ),
      );

      const sentCount = results.filter((r) => r.ok).length;
      return {
        status: 200,
        body: {
          ok: true,
          action,
          sent_count: sentCount,
          total: waIds.length,
          results,
        },
      };
    }

    if (action === "update_obs") {
      const waId = normalizeOptionalText(payload.wa_id);
      if (!waId) {
        return { status: 400, body: { ok: false, error: "wa_id é obrigatório" } };
      }
      const patch: Record<string, unknown> = {
        obs_curta: normalizeOptionalText(payload.obs_curta),
        updated_at: new Date().toISOString(),
      };
      if (payload.status_operacional && VALID_STATUS_OPERACIONAL.includes(payload.status_operacional as StatusOperacional)) {
        patch.status_operacional = payload.status_operacional;
      }
      const savedRow = await patchLeadMetaRow(supabaseUrl, serviceRoleKey, waId, patch);
      await insertAuditLogs(supabaseUrl, serviceRoleKey, [
        buildAuditRow(waId, "bases_update_obs", "Obs. curta atualizada em Bases", {
          obs_curta: patch.obs_curta,
          status_operacional: patch.status_operacional ?? null,
        }),
      ]);
      return { status: 200, body: { ok: true, action, lead: savedRow } };
    }

    if (action === "archive_lead" || action === "unarchive_lead") {
      const waId = normalizeOptionalText(payload.wa_id);
      if (!waId) {
        return { status: 400, body: { ok: false, error: "wa_id é obrigatório" } };
      }
      const existing = await loadLeadMeta(supabaseUrl, serviceRoleKey, waId);
      if (!existing) {
        return { status: 404, body: { ok: false, error: "LEAD_NOT_FOUND" } };
      }
      const isArchiving = action === "archive_lead";
      const now = new Date().toISOString();
      const archivePatch: Record<string, unknown> = {
        is_archived: isArchiving,
        updated_at: now,
        ultima_acao: isArchiving ? "ARCHIVE" : "UNARCHIVE",
      };
      if (isArchiving) {
        archivePatch.archived_at = now;
        archivePatch.archive_reason_code = normalizeOptionalText(payload.archive_reason_code);
        archivePatch.archive_reason_note = normalizeOptionalText(payload.archive_reason_note);
      } else {
        // Unarchive: clear archive fields
        archivePatch.archived_at = null;
        archivePatch.archive_reason_code = null;
        archivePatch.archive_reason_note = null;
      }
      const savedRow = await patchLeadMetaRow(supabaseUrl, serviceRoleKey, waId, archivePatch);
      await insertAuditLogs(supabaseUrl, serviceRoleKey, [
        buildAuditRow(
          waId,
          isArchiving ? "bases_archive" : "bases_unarchive",
          isArchiving ? "Lead arquivado em Bases" : "Lead desarquivado em Bases",
          {
            is_archived: isArchiving,
            archive_reason_code: isArchiving ? (normalizeOptionalText(payload.archive_reason_code) ?? null) : null,
            archive_reason_note: isArchiving ? (normalizeOptionalText(payload.archive_reason_note) ?? null) : null,
          },
        ),
      ]);
      return { status: 200, body: { ok: true, action, lead: savedRow } };
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
