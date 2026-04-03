"use server";

// ============================================================
// Dossiê do Correspondente — Server Action
// Escopo: leitura consolidada de crm_leads_v1 + enova_state + enova_attendance_meta
// Padrão: segue exatamente o mesmo padrão de crm/actions.ts e atendimento/actions.ts
// Sem criar endpoint HTTP novo. Sem alterar backend canônico.
// ============================================================

export type DocItem = {
  tipo: string | null;
  participante: string | null;
};

export type DossieData = {
  // Identificação
  wa_id: string;
  pre_cadastro_numero: string | null;

  // Dados do cliente (via crm_leads_v1 / enova_state)
  nome: string | null;
  fase_conversa: string | null;
  funil_status: string | null;
  faixa_renda_programa: string | null;
  renda_total_para_fluxo: number | null;
  composicao_pessoa: string | null;
  regime_trabalho: string | null;
  estado_civil: string | null;
  nacionalidade: string | null;
  dossie_resumo: string | null;
  created_at: string | null;

  // Campos correspondente (enova_state)
  corr_lock_correspondente_wa_id: string | null;
  processo_enviado_correspondente: boolean | null;
  aguardando_retorno_correspondente: boolean | null;
  retorno_correspondente_status: string | null;
  retorno_correspondente_motivo: string | null;
  retorno_correspondente_bruto: string | null;

  // Docs (enova_state)
  docs_status: string | null;
  docs_itens_recebidos: DocItem[] | null;
  docs_itens_pendentes: DocItem[] | null;
  docs_faltantes: DocItem[] | null;

  // CRM data (crm_leads_v1 — read-only)
  correspondente_retorno: string | null;
  status_analise: string | null;
  resumo_retorno_analise: string | null;
  motivo_retorno_analise: string | null;
  valor_financiamento_aprovado: number | null;
  valor_subsidio_aprovado: number | null;
  valor_entrada_informada: number | null;
  valor_parcela_informada: number | null;
  resumo_perfil_analise: string | null;
  renda_total_analise: number | null;
  renda_familiar_analise: number | null;
  ticket_desejado_analise: number | null;
  faixa_perfil_analise: string | null;
  score_perfil_analise: number | null;
  nivel_risco_reserva: string | null;
  data_envio_analise: string | null;
  data_retorno_analise: string | null;
  parceiro_analise: string | null;

  // Operational (enova_attendance_meta)
  status_atencao: string | null;
  prazo_proxima_acao: string | null;
  proxima_acao: string | null;
  current_base: string | null;
};

export type DossieResponse = {
  ok: boolean;
  data: DossieData | null;
  error: string | null;
};

const REQUIRED_ENVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const;

function buildHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function safeArray<T>(value: unknown): T[] | null {
  if (!Array.isArray(value)) return null;
  return value as T[];
}

function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s.length > 0 ? s : null;
}

function safeBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}

// ── wa_id normalization ──

/**
 * Returns a list of candidate wa_ids derived from the raw user input.
 *
 * Handles the three most common lookup failures in production:
 *   1. Formatting characters (spaces, dashes, parentheses) — stripped to digits.
 *   2. Missing Brazilian country code (55) — prepended when input is ≤ 11 digits.
 *   3. Optional 9th digit in BR mobile numbers — both 12-digit and 13-digit
 *      variants are included so either DB format matches.
 */
function buildWaIdCandidates(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return [];

  const set = new Set<string>();
  set.add(digits);

  // When no country code is present, try with Brazil prefix 55
  if (!digits.startsWith("55") && digits.length <= 11) {
    set.add(`55${digits}`);
  }

  // BR 9-digit flex: 55 + DDD(2) + [9] + number(8)
  //   13-digit variant → also try 12-digit (remove leading 9 after DDD)
  //   12-digit variant → also try 13-digit (insert leading 9 after DDD)
  for (const c of Array.from(set)) {
    if (c.startsWith("55") && c.length === 13 && c[4] === "9") {
      set.add(`${c.slice(0, 4)}${c.slice(5)}`);
    } else if (c.startsWith("55") && c.length === 12) {
      set.add(`${c.slice(0, 4)}9${c.slice(4)}`);
    }
  }

  return Array.from(set);
}

// ── Main server action ──

export async function fetchDossieDataAction(waId: string): Promise<DossieResponse> {
  const trimmedId = (waId || "").trim();
  if (!trimmedId) {
    return { ok: false, data: null, error: "wa_id obrigatório" };
  }

  const candidates = buildWaIdCandidates(trimmedId);
  if (candidates.length === 0) {
    return { ok: false, data: null, error: "wa_id inválido" };
  }

  const missingEnvs = REQUIRED_ENVS.filter((k) => !process.env[k]);
  if (missingEnvs.length > 0) {
    return { ok: false, data: null, error: `missing env: ${missingEnvs.join(", ")}` };
  }

  const supabaseUrl = process.env.SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE as string;
  const headers = buildHeaders(serviceRoleKey);

  try {
    // ── 1. enova_state — fonte canônica do funil e docs ──
    // Campos não cobertos pelas views consolidadas (crm_leads_v1, enova_attendance_v1)
    const stateFields = [
      "wa_id",
      "nome",
      "fase_conversa",
      "funil_status",
      "pre_cadastro_numero",
      "faixa_renda_programa",
      "renda_total_para_fluxo",
      "composicao_pessoa",
      "regime_trabalho",
      "estado_civil",
      "nacionalidade",
      "dossie_resumo",
      "created_at",
      "corr_lock_correspondente_wa_id",
      "processo_enviado_correspondente",
      "aguardando_retorno_correspondente",
      "retorno_correspondente_status",
      "retorno_correspondente_motivo",
      "retorno_correspondente_bruto",
      "docs_status",
      "docs_itens_recebidos",
      "docs_itens_pendentes",
      "docs_faltantes",
    ].join(",");

    const stateEndpoint = new URL("/rest/v1/enova_state", supabaseUrl);
    stateEndpoint.searchParams.set("select", stateFields);
    if (candidates.length === 1) {
      stateEndpoint.searchParams.set("wa_id", `eq.${candidates[0]}`);
    } else {
      stateEndpoint.searchParams.set(
        "or",
        `(${candidates.map((c) => `wa_id.eq.${c}`).join(",")})`,
      );
    }
    stateEndpoint.searchParams.set("limit", "1");

    const stateRes = await fetch(stateEndpoint.toString(), {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!stateRes.ok) {
      const body = await stateRes.text().catch(() => "");
      return {
        ok: false,
        data: null,
        error: `enova_state fetch failed (${stateRes.status}) ${body.slice(0, 120)}`,
      };
    }

    const stateRows = await readJson<Record<string, unknown>[]>(stateRes);
    const stateRow =
      Array.isArray(stateRows) && stateRows.length > 0 ? stateRows[0] : null;

    if (!stateRow) {
      return { ok: false, data: null, error: "lead não encontrado" };
    }

    // Use the wa_id exactly as stored in enova_state for all subsequent queries
    const resolvedWaId = safeString(stateRow.wa_id);
    if (!resolvedWaId) {
      return { ok: false, data: null, error: "lead não encontrado" };
    }

    // ── 2. crm_leads_v1 — view canônica CRM (enova_state LEFT JOIN crm_lead_meta) ──
    // Mesma view usada pelo painel CRM (fetchCrmLeadsAction → listCrmLeads)
    const crmFields = [
      "wa_id",
      "status_analise",
      "parceiro_analise",
      "data_envio_analise",
      "data_retorno_analise",
      "resumo_retorno_analise",
      "motivo_retorno_analise",
      "valor_financiamento_aprovado",
      "valor_subsidio_aprovado",
      "valor_entrada_informada",
      "valor_parcela_informada",
      "correspondente_retorno",
      "renda_total_analise",
      "renda_familiar_analise",
      "ticket_desejado_analise",
      "resumo_perfil_analise",
      "score_perfil_analise",
      "faixa_perfil_analise",
      "nivel_risco_reserva",
    ].join(",");

    const crmEndpoint = new URL("/rest/v1/crm_leads_v1", supabaseUrl);
    crmEndpoint.searchParams.set("select", crmFields);
    crmEndpoint.searchParams.set("wa_id", `eq.${resolvedWaId}`);
    crmEndpoint.searchParams.set("limit", "1");

    let crmRow: Record<string, unknown> | null = null;
    const crmRes = await fetch(crmEndpoint.toString(), {
      method: "GET",
      headers,
      cache: "no-store",
    });
    if (crmRes.ok) {
      const crmRows = await readJson<Record<string, unknown>[]>(crmRes);
      crmRow =
        Array.isArray(crmRows) && crmRows.length > 0 ? crmRows[0] : null;
    }

    // ── 3. enova_attendance_meta — dados operacionais ──
    // Mesma tabela usada pelo painel Atendimento (fetchAttendanceLeadsAction → listAttendanceLeads)
    const attendanceFields = [
      "wa_id",
      "attention_status",
      "enova_next_action_due_at",
      "enova_next_action_label",
      "current_base",
    ].join(",");

    const attendanceEndpoint = new URL("/rest/v1/enova_attendance_meta", supabaseUrl);
    attendanceEndpoint.searchParams.set("select", attendanceFields);
    attendanceEndpoint.searchParams.set("wa_id", `eq.${resolvedWaId}`);
    attendanceEndpoint.searchParams.set("limit", "1");

    let attendanceRow: Record<string, unknown> | null = null;
    const attendanceRes = await fetch(attendanceEndpoint.toString(), {
      method: "GET",
      headers,
      cache: "no-store",
    });
    if (attendanceRes.ok) {
      const attRows = await readJson<Record<string, unknown>[]>(attendanceRes);
      attendanceRow =
        Array.isArray(attRows) && attRows.length > 0 ? attRows[0] : null;
    }

    // ── Consolidar resposta ──
    const data: DossieData = {
      wa_id: resolvedWaId,
      pre_cadastro_numero: safeString(stateRow.pre_cadastro_numero),

      nome: safeString(stateRow.nome),
      fase_conversa: safeString(stateRow.fase_conversa),
      funil_status: safeString(stateRow.funil_status),
      faixa_renda_programa: safeString(stateRow.faixa_renda_programa),
      renda_total_para_fluxo: safeNumber(stateRow.renda_total_para_fluxo),
      composicao_pessoa: safeString(stateRow.composicao_pessoa),
      regime_trabalho: safeString(stateRow.regime_trabalho),
      estado_civil: safeString(stateRow.estado_civil),
      nacionalidade: safeString(stateRow.nacionalidade),
      dossie_resumo: safeString(stateRow.dossie_resumo),
      created_at: safeString(stateRow.created_at),

      corr_lock_correspondente_wa_id: safeString(
        stateRow.corr_lock_correspondente_wa_id,
      ),
      processo_enviado_correspondente: safeBool(
        stateRow.processo_enviado_correspondente,
      ),
      aguardando_retorno_correspondente: safeBool(
        stateRow.aguardando_retorno_correspondente,
      ),
      retorno_correspondente_status: safeString(
        stateRow.retorno_correspondente_status,
      ),
      retorno_correspondente_motivo: safeString(
        stateRow.retorno_correspondente_motivo,
      ),
      retorno_correspondente_bruto: safeString(
        stateRow.retorno_correspondente_bruto,
      ),

      docs_status: safeString(stateRow.docs_status),
      docs_itens_recebidos: safeArray<DocItem>(stateRow.docs_itens_recebidos),
      docs_itens_pendentes: safeArray<DocItem>(stateRow.docs_itens_pendentes),
      docs_faltantes: safeArray<DocItem>(stateRow.docs_faltantes),

      correspondente_retorno: safeString(crmRow?.correspondente_retorno),
      status_analise: safeString(crmRow?.status_analise),
      resumo_retorno_analise: safeString(crmRow?.resumo_retorno_analise),
      motivo_retorno_analise: safeString(crmRow?.motivo_retorno_analise),
      valor_financiamento_aprovado: safeNumber(
        crmRow?.valor_financiamento_aprovado,
      ),
      valor_subsidio_aprovado: safeNumber(crmRow?.valor_subsidio_aprovado),
      valor_entrada_informada: safeNumber(crmRow?.valor_entrada_informada),
      valor_parcela_informada: safeNumber(crmRow?.valor_parcela_informada),
      resumo_perfil_analise: safeString(crmRow?.resumo_perfil_analise),
      renda_total_analise: safeNumber(crmRow?.renda_total_analise),
      renda_familiar_analise: safeNumber(crmRow?.renda_familiar_analise),
      ticket_desejado_analise: safeNumber(crmRow?.ticket_desejado_analise),
      faixa_perfil_analise: safeString(crmRow?.faixa_perfil_analise),
      score_perfil_analise: safeNumber(crmRow?.score_perfil_analise),
      nivel_risco_reserva: safeString(crmRow?.nivel_risco_reserva),
      data_envio_analise: safeString(crmRow?.data_envio_analise),
      data_retorno_analise: safeString(crmRow?.data_retorno_analise),
      parceiro_analise: safeString(crmRow?.parceiro_analise),

      status_atencao: safeString(attendanceRow?.attention_status),
      prazo_proxima_acao: safeString(attendanceRow?.enova_next_action_due_at),
      proxima_acao: safeString(attendanceRow?.enova_next_action_label),
      current_base: safeString(attendanceRow?.current_base),
    };

    return { ok: true, data, error: null };
  } catch (error) {
    console.error("fetchDossieDataAction internal error", error);
    return { ok: false, data: null, error: "internal error" };
  }
}
