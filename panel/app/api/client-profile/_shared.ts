// ============================================================
// Client Profile API — panel/app/api/client-profile/_shared.ts
// Escopo: leitura e escrita dos campos de perfil do cliente
//
// REGRA CANÔNICA:
//   - enova_state.{campo} = valor operacional único
//   - enova_prefill_meta.{campo}_source + {campo}_updated_at = metadados de origem
//   - admin e funil escrevem no MESMO campo operacional
//
// GUARDRAIL: fase_conversa, nextStage e controles de fluxo são BLOQUEADOS.
// Somente PROFILE_WRITABLE_FIELDS podem ser escritos via este caminho.
// ============================================================

export type ProfileSource =
  | "admin"         // atualizado por admin no painel
  | "admin_inicial" // preenchido no cadastro manual (Bases)
  | "funil"         // confirmado/atualizado pelo cliente no funil
  | "manual"        // legado (valor original da prefill_meta)
  | null;

export type ClientProfileRow = {
  wa_id: string;
  // ── Valores operacionais (enova_state) ──
  nome: string | null;
  nacionalidade: string | null;
  estado_civil: string | null;
  regime_trabalho: string | null;
  renda: number | null;
  ctps_36: boolean | null;
  dependentes_qtd: number | null;
  entrada_valor: number | null;
  restricao: boolean | null;
  // ── Campos admin-only (enova_prefill_meta) ──
  origem_lead: string | null;
  observacoes_admin: string | null;
  // ── Metadados discretos por campo ──
  nome_source: ProfileSource;
  nome_updated_at: string | null;
  nacionalidade_source: ProfileSource;
  nacionalidade_updated_at: string | null;
  estado_civil_source: ProfileSource;
  estado_civil_updated_at: string | null;
  regime_trabalho_source: ProfileSource;
  regime_trabalho_updated_at: string | null;
  renda_source: ProfileSource;
  renda_updated_at: string | null;
  meses_36_source: ProfileSource;
  meses_36_updated_at: string | null;
  dependentes_source: ProfileSource;
  dependentes_updated_at: string | null;
  valor_entrada_source: ProfileSource;
  valor_entrada_updated_at: string | null;
  restricao_source: ProfileSource;
  restricao_updated_at: string | null;
  // ── Metadado global ──
  updated_by: string | null;
  meta_updated_at: string | null;
};

export type ClientProfileUpdatePayload = {
  wa_id: string;
  nome?: string | null;
  nacionalidade?: string | null;
  estado_civil?: string | null;
  regime_trabalho?: string | null;
  renda?: number | null;
  ctps_36?: boolean | null;
  dependentes_qtd?: number | null;
  entrada_valor?: number | null;
  restricao?: boolean | null;
  // Admin-only (only go to enova_prefill_meta)
  origem_lead?: string | null;
  observacoes_admin?: string | null;
  updated_by?: string | null;
  source?: ProfileSource;
};

function buildHeaders(serviceRoleKey: string, extra?: Record<string, string>) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}

// ── Read profile fields from enova_state ─────────────────────────────
async function readEnovaStateProfile(
  supabaseUrl: string,
  serviceRoleKey: string,
  wa_id: string,
): Promise<Record<string, unknown> | null> {
  const endpoint = new URL("/rest/v1/enova_state", supabaseUrl);
  endpoint.searchParams.set(
    "select",
    "wa_id,nome,nacionalidade,estado_civil,regime_trabalho,renda,ctps_36,dependentes_qtd,entrada_valor,restricao",
  );
  endpoint.searchParams.set("wa_id", `eq.${wa_id}`);
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: buildHeaders(serviceRoleKey),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`PROFILE_STATE_READ_FAILED:${response.status}`);
  }

  const rows = await readJson<Record<string, unknown>[]>(response);
  return rows?.[0] ?? null;
}

// ── Read metadata from enova_prefill_meta ────────────────────────────
async function readPrefillMeta(
  supabaseUrl: string,
  serviceRoleKey: string,
  wa_id: string,
): Promise<Record<string, unknown> | null> {
  const endpoint = new URL("/rest/v1/enova_prefill_meta", supabaseUrl);
  endpoint.searchParams.set("select", "*");
  endpoint.searchParams.set("wa_id", `eq.${wa_id}`);
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: buildHeaders(serviceRoleKey),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`PROFILE_META_READ_FAILED:${response.status}`);
  }

  const rows = await readJson<Record<string, unknown>[]>(response);
  return rows?.[0] ?? null;
}

// ── Get combined client profile ──────────────────────────────────────
export async function getClientProfile(
  supabaseUrl: string,
  serviceRoleKey: string,
  wa_id: string,
): Promise<ClientProfileRow | null> {
  const [stateRow, metaRow] = await Promise.all([
    readEnovaStateProfile(supabaseUrl, serviceRoleKey, wa_id),
    readPrefillMeta(supabaseUrl, serviceRoleKey, wa_id),
  ]);

  if (!stateRow && !metaRow) return null;

  return {
    wa_id,
    nome: (stateRow?.nome as string | null) ?? null,
    nacionalidade: (stateRow?.nacionalidade as string | null) ?? null,
    estado_civil: (stateRow?.estado_civil as string | null) ?? null,
    regime_trabalho: (stateRow?.regime_trabalho as string | null) ?? null,
    renda: stateRow?.renda != null ? Number(stateRow.renda) : null,
    ctps_36: stateRow?.ctps_36 != null ? Boolean(stateRow.ctps_36) : null,
    dependentes_qtd: stateRow?.dependentes_qtd != null ? Number(stateRow.dependentes_qtd) : null,
    entrada_valor: stateRow?.entrada_valor != null ? Number(stateRow.entrada_valor) : null,
    restricao: stateRow?.restricao != null ? Boolean(stateRow.restricao) : null,
    origem_lead: (metaRow?.origem_lead as string | null) ?? null,
    observacoes_admin: (metaRow?.observacoes_admin as string | null) ?? null,
    nome_source: (metaRow?.nome_source as ProfileSource) ?? null,
    nome_updated_at: (metaRow?.nome_updated_at as string | null) ?? null,
    nacionalidade_source: (metaRow?.nacionalidade_source as ProfileSource) ?? null,
    nacionalidade_updated_at: (metaRow?.nacionalidade_updated_at as string | null) ?? null,
    estado_civil_source: (metaRow?.estado_civil_source as ProfileSource) ?? null,
    estado_civil_updated_at: (metaRow?.estado_civil_updated_at as string | null) ?? null,
    regime_trabalho_source: (metaRow?.regime_trabalho_source as ProfileSource) ?? null,
    regime_trabalho_updated_at: (metaRow?.regime_trabalho_updated_at as string | null) ?? null,
    renda_source: (metaRow?.renda_source as ProfileSource) ?? null,
    renda_updated_at: (metaRow?.renda_updated_at as string | null) ?? null,
    meses_36_source: (metaRow?.meses_36_source as ProfileSource) ?? null,
    meses_36_updated_at: (metaRow?.meses_36_updated_at as string | null) ?? null,
    dependentes_source: (metaRow?.dependentes_source as ProfileSource) ?? null,
    dependentes_updated_at: (metaRow?.dependentes_updated_at as string | null) ?? null,
    valor_entrada_source: (metaRow?.valor_entrada_source as ProfileSource) ?? null,
    valor_entrada_updated_at: (metaRow?.valor_entrada_updated_at as string | null) ?? null,
    restricao_source: (metaRow?.restricao_source as ProfileSource) ?? null,
    restricao_updated_at: (metaRow?.restricao_updated_at as string | null) ?? null,
    updated_by: (metaRow?.updated_by as string | null) ?? null,
    meta_updated_at: (metaRow?.updated_at as string | null) ?? null,
  };
}

// ── Write profile fields — admin-controlled path ─────────────────────
// GUARDRAIL: somente campos de PROFILE_WRITABLE_FIELDS são aceitos para enova_state.
// Nenhum campo de controle de fluxo (fase_conversa, etc.) pode passar por aqui.
export async function writeClientProfile(
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: ClientProfileUpdatePayload,
): Promise<ClientProfileRow | null> {
  const { wa_id, updated_by = "admin_panel", source = "admin", ...fields } = payload;

  if (!wa_id?.trim()) {
    throw new Error("WRITE_PROFILE_MISSING_WA_ID");
  }

  const now = new Date().toISOString();
  const trimmedWaId = wa_id.trim();

  // Build enova_state patch — only allowed profile fields
  const statePatch: Record<string, unknown> = {};
  // Build metadata patch for enova_prefill_meta
  const metaPatch: Record<string, unknown> = {
    wa_id: trimmedWaId,
    updated_at: now,
    updated_by: updated_by ?? "admin_panel",
  };

  if (Object.prototype.hasOwnProperty.call(fields, "nome")) {
    statePatch.nome = fields.nome;
    metaPatch.nome_source = source;
    metaPatch.nome_updated_at = now;
  }
  if (Object.prototype.hasOwnProperty.call(fields, "nacionalidade")) {
    statePatch.nacionalidade = fields.nacionalidade;
    metaPatch.nacionalidade_source = source;
    metaPatch.nacionalidade_updated_at = now;
  }
  if (Object.prototype.hasOwnProperty.call(fields, "estado_civil")) {
    statePatch.estado_civil = fields.estado_civil;
    metaPatch.estado_civil_source = source;
    metaPatch.estado_civil_updated_at = now;
  }
  if (Object.prototype.hasOwnProperty.call(fields, "regime_trabalho")) {
    statePatch.regime_trabalho = fields.regime_trabalho;
    metaPatch.regime_trabalho_source = source;
    metaPatch.regime_trabalho_updated_at = now;
  }
  if (Object.prototype.hasOwnProperty.call(fields, "renda")) {
    statePatch.renda = fields.renda;
    metaPatch.renda_source = source;
    metaPatch.renda_updated_at = now;
  }
  if (Object.prototype.hasOwnProperty.call(fields, "ctps_36")) {
    statePatch.ctps_36 = fields.ctps_36;
    metaPatch.meses_36_source = source;
    metaPatch.meses_36_updated_at = now;
  }
  if (Object.prototype.hasOwnProperty.call(fields, "dependentes_qtd")) {
    statePatch.dependentes_qtd = fields.dependentes_qtd;
    metaPatch.dependentes_source = source;
    metaPatch.dependentes_updated_at = now;
  }
  if (Object.prototype.hasOwnProperty.call(fields, "entrada_valor")) {
    statePatch.entrada_valor = fields.entrada_valor;
    metaPatch.valor_entrada_source = source;
    metaPatch.valor_entrada_updated_at = now;
  }
  if (Object.prototype.hasOwnProperty.call(fields, "restricao")) {
    statePatch.restricao = fields.restricao;
    metaPatch.restricao_source = source;
    metaPatch.restricao_updated_at = now;
  }
  // Admin-only fields (enova_prefill_meta only — no funil equivalent)
  if (Object.prototype.hasOwnProperty.call(fields, "origem_lead")) {
    const v = fields.origem_lead;
    metaPatch.origem_lead = typeof v === "string" && v.trim() ? v.trim() : null;
  }
  if (Object.prototype.hasOwnProperty.call(fields, "observacoes_admin")) {
    const v = fields.observacoes_admin;
    metaPatch.observacoes_admin = typeof v === "string" && v.trim() ? v.trim() : null;
  }

  // 1. Write operational values to enova_state (guardrail: only profile fields)
  if (Object.keys(statePatch).length > 0) {
    const stateEndpoint = new URL("/rest/v1/enova_state", supabaseUrl);
    stateEndpoint.searchParams.set("on_conflict", "wa_id");

    const stateResponse = await fetch(stateEndpoint.toString(), {
      method: "POST",
      headers: buildHeaders(serviceRoleKey, {
        Prefer: "resolution=merge-duplicates,return=minimal",
      }),
      body: JSON.stringify({ wa_id: trimmedWaId, ...statePatch }),
      cache: "no-store",
    });

    if (!stateResponse.ok) {
      const errText = await stateResponse.text().catch(() => "");
      throw new Error(`PROFILE_STATE_WRITE_FAILED:${stateResponse.status}:${errText}`);
    }
  }

  // 2. Write source metadata to enova_prefill_meta
  const metaEndpoint = new URL("/rest/v1/enova_prefill_meta", supabaseUrl);

  const metaResponse = await fetch(metaEndpoint.toString(), {
    method: "POST",
    headers: buildHeaders(serviceRoleKey, {
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify(metaPatch),
    cache: "no-store",
  });

  if (!metaResponse.ok) {
    const errText = await metaResponse.text().catch(() => "");
    throw new Error(`PROFILE_META_WRITE_FAILED:${metaResponse.status}:${errText}`);
  }

  // Return fresh combined profile
  return getClientProfile(supabaseUrl, serviceRoleKey, trimmedWaId);
}
