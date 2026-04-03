"use server";

// ============================================================
// Dossiê do Correspondente — Server Action
// Escopo: leitura consolidada de enova_state + crm_leads_v1 + enova_attendance_meta
// Replica EXATAMENTE o contrato do dossiê real do sistema
// (buildCorrespondenteDossierPayloadFromCanonical → buildCorrespondenteEntryCoverHtml)
// Sem criar endpoint HTTP novo. Sem alterar backend canônico.
// ============================================================

export type DocItem = {
  tipo: string | null;
  participante: string | null;
};

export type DossieData = {
  // Identificação (meta do dossiê real)
  wa_id: string;
  pre_cadastro_numero: string | null;

  // Dados do cliente (enova_state — fonte canônica)
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

  // Perfil técnico consolidado (enova_state — campos do dossiê real)
  renda: string | null;
  renda_parceiro: string | null;
  somar_renda: boolean | null;
  ctps_36: boolean | null;
  ctps_36_parceiro: boolean | null;
  dependente: boolean | null;
  dependentes_qtd: number | null;
  restricao: string | null;
  regularizacao_restricao: string | null;

  // Correspondente (enova_state)
  corr_lock_correspondente_wa_id: string | null;
  corr_publicacao_status: string | null;
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

// ── Normalização do telefone do correspondente ──
// Replica a lógica do worker: normalizeCorrespondenteWaIdCmp / normalizeCorrespondenteWaIdOutbound
// corr_lock_correspondente_wa_id é salvo com prefixo 55 (ex: 5541997780518)

function normalizeCorrPhone(input: string): { withPrefix: string; withoutPrefix: string } {
  const digits = input.replace(/\D/g, "");
  const withoutPrefix = digits.startsWith("55") ? digits.slice(2) : digits;
  const withPrefix = `55${withoutPrefix}`;
  return { withPrefix, withoutPrefix };
}

// ── Main server action ──

export async function fetchDossieDataAction(corrPhone: string): Promise<DossieResponse> {
  const trimmedInput = (corrPhone || "").trim();
  if (!trimmedInput) {
    return { ok: false, data: null, error: "telefone obrigatório" };
  }

  const missingEnvs = REQUIRED_ENVS.filter((k) => !process.env[k]);
  if (missingEnvs.length > 0) {
    return { ok: false, data: null, error: `missing env: ${missingEnvs.join(", ")}` };
  }

  const supabaseUrl = process.env.SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE as string;
  const headers = buildHeaders(serviceRoleKey);

  // Normalize: try with 55 prefix first (canonical storage), fallback to without 55
  const { withPrefix: corrWaIdWith55, withoutPrefix: corrWaIdWithout55 } = normalizeCorrPhone(trimmedInput);

  try {
    // ── 1. enova_state — fonte canônica do funil, perfil técnico e docs ──
    // Busca pelo campo real de vínculo do correspondente: corr_lock_correspondente_wa_id
    // (NÃO pelo wa_id do lead — o dossiê já tem o correspondente vinculado nesse campo)
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
      // Perfil técnico (dossiê real)
      "renda",
      "renda_parceiro",
      "somar_renda",
      "ctps_36",
      "ctps_36_parceiro",
      "dependente",
      "dependentes_qtd",
      "restricao",
      "regularizacao_restricao",
      // Correspondente
      "corr_lock_correspondente_wa_id",
      "corr_publicacao_status",
      "processo_enviado_correspondente",
      "aguardando_retorno_correspondente",
      "retorno_correspondente_status",
      "retorno_correspondente_motivo",
      "retorno_correspondente_bruto",
      // Docs
      "docs_status",
      "docs_itens_recebidos",
      "docs_itens_pendentes",
      "docs_faltantes",
    ].join(",");

    // Busca primária: com prefixo 55 (formato canônico do WhatsApp)
    const buildStateEndpoint = (corrFieldValue: string) => {
      const ep = new URL("/rest/v1/enova_state", supabaseUrl);
      ep.searchParams.set("select", stateFields);
      ep.searchParams.set("corr_lock_correspondente_wa_id", `eq.${corrFieldValue}`);
      ep.searchParams.set("limit", "1");
      return ep.toString();
    };

    let stateRow: Record<string, unknown> | null = null;

    const stateRes = await fetch(buildStateEndpoint(corrWaIdWith55), {
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
    stateRow = Array.isArray(stateRows) && stateRows.length > 0 ? stateRows[0] : null;

    // Fallback: sem prefixo 55 (cobre registros salvos sem o prefixo)
    if (!stateRow && corrWaIdWithout55 !== corrWaIdWith55) {
      const stateRes2 = await fetch(buildStateEndpoint(corrWaIdWithout55), {
        method: "GET",
        headers,
        cache: "no-store",
      });
      if (stateRes2.ok) {
        const stateRows2 = await readJson<Record<string, unknown>[]>(stateRes2);
        stateRow = Array.isArray(stateRows2) && stateRows2.length > 0 ? stateRows2[0] : null;
      }
    }

    if (!stateRow) {
      return { ok: false, data: null, error: "dossiê não encontrado para este correspondente" };
    }

    // Lead wa_id real (usado para queries CRM e Attendance)
    const leadWaId = safeString(stateRow.wa_id) ?? trimmedInput;

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
    crmEndpoint.searchParams.set("wa_id", `eq.${leadWaId}`);
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
    attendanceEndpoint.searchParams.set("wa_id", `eq.${leadWaId}`);
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

    // ── Consolidar resposta (replica contrato real do dossiê) ──
    const data: DossieData = {
      wa_id: leadWaId,
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

      // Perfil técnico
      renda: safeString(stateRow.renda),
      renda_parceiro: safeString(stateRow.renda_parceiro),
      somar_renda: safeBool(stateRow.somar_renda),
      ctps_36: safeBool(stateRow.ctps_36),
      ctps_36_parceiro: safeBool(stateRow.ctps_36_parceiro),
      dependente: safeBool(stateRow.dependente),
      dependentes_qtd: safeNumber(stateRow.dependentes_qtd),
      restricao: safeString(stateRow.restricao),
      regularizacao_restricao: safeString(stateRow.regularizacao_restricao),

      // Correspondente
      corr_lock_correspondente_wa_id: safeString(stateRow.corr_lock_correspondente_wa_id),
      corr_publicacao_status: safeString(stateRow.corr_publicacao_status),
      processo_enviado_correspondente: safeBool(stateRow.processo_enviado_correspondente),
      aguardando_retorno_correspondente: safeBool(stateRow.aguardando_retorno_correspondente),
      retorno_correspondente_status: safeString(stateRow.retorno_correspondente_status),
      retorno_correspondente_motivo: safeString(stateRow.retorno_correspondente_motivo),
      retorno_correspondente_bruto: safeString(stateRow.retorno_correspondente_bruto),

      // Docs
      docs_status: safeString(stateRow.docs_status),
      docs_itens_recebidos: safeArray<DocItem>(stateRow.docs_itens_recebidos),
      docs_itens_pendentes: safeArray<DocItem>(stateRow.docs_itens_pendentes),
      docs_faltantes: safeArray<DocItem>(stateRow.docs_faltantes),

      // CRM
      correspondente_retorno: safeString(crmRow?.correspondente_retorno),
      status_analise: safeString(crmRow?.status_analise),
      resumo_retorno_analise: safeString(crmRow?.resumo_retorno_analise),
      motivo_retorno_analise: safeString(crmRow?.motivo_retorno_analise),
      valor_financiamento_aprovado: safeNumber(crmRow?.valor_financiamento_aprovado),
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

      // Operational
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
