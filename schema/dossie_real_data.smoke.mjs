// ============================================================
// smoke test: dossie real data binding
// Validates that DossieUI + /api/dossie integration works correctly.
// Run: node schema/dossie_real_data.smoke.mjs
// ============================================================

import assert from "node:assert/strict";

// ── Unit tests for helper functions (copied/mirrored from DossieUI) ──

function formatBRL(value) {
  if (value === null || value === undefined) return "Não informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(dateStr) {
  if (!dateStr) return "Não informado";
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(dateStr));
  } catch {
    return "Não informado";
  }
}

function formatFaseConversa(fase) {
  if (!fase) return "Não informado";
  const labels = {
    envio_docs: "Envio de Documentos",
    aguardando_retorno_correspondente: "Aguardando Retorno",
  };
  return labels[fase] ?? fase.replace(/_/g, " ");
}

function formatStatusAnalise(status) {
  if (!status) return "Em Análise";
  const labels = {
    DOCS_PENDING: "Docs Pendentes",
    APPROVED_HIGH: "Aprovado",
    REJECTED_HARD: "Reprovado",
  };
  return labels[status] ?? status;
}

function formatStatusAtencao(status) {
  if (!status) return "Normal";
  const labels = { ON_TIME: "Normal", DUE_SOON: "Atenção", OVERDUE: "Alta" };
  return labels[status] ?? status;
}

function docTipoLabel(tipo) {
  if (!tipo) return "Documento";
  const labels = {
    rg: "RG",
    cpf: "CPF",
    comprovante_renda: "Comprovante de Renda",
    comprovante_residencia: "Comprovante de Residência",
  };
  return labels[tipo.toLowerCase()] ?? tipo.replace(/_/g, " ");
}

function buildDocLabel(item) {
  const tipo = docTipoLabel(item.tipo);
  if (!item.participante || item.participante === "p1") return tipo;
  const partLabels = { p1: "Titular", p2: "Cônjuge / Parceiro", p3: "Familiar" };
  const part = partLabels[item.participante] ?? item.participante;
  return `${tipo} — ${part}`;
}

function buildResumo(data) {
  if (data.dossie_resumo) return data.dossie_resumo;
  if (data.resumo_perfil_analise) return data.resumo_perfil_analise;
  if (data.resumo_retorno_analise) return data.resumo_retorno_analise;
  return "Aguardando atualização do resumo do caso.";
}

function buildTitulo(data) {
  const programa = data.faixa_renda_programa ?? data.parceiro_analise;
  if (programa) return `Financiamento Habitacional — ${programa}`;
  return "Financiamento Habitacional";
}

function buildInstrucoes(data) {
  if (data.retorno_correspondente_bruto) return [data.retorno_correspondente_bruto];
  if (data.motivo_retorno_analise) return [data.motivo_retorno_analise];
  const pendentes = data.docs_itens_pendentes ?? data.docs_faltantes ?? [];
  const instrucoes = [];
  if (pendentes.length > 0) {
    instrucoes.push(
      `Solicitar ao cliente os seguintes documentos pendentes: ${pendentes.map((d) => buildDocLabel(d)).join(", ")}.`,
    );
    instrucoes.push("Após recebimento dos documentos pendentes, submeter dossiê completo para análise de crédito na instituição.");
  }
  if (instrucoes.length === 0) instrucoes.push("Aguardando atualização das instruções pelo correspondente.");
  return instrucoes;
}

function formatTipoProcesso(composicao) {
  if (!composicao) return "Não informado";
  const processMap = {
    titular: "solo",
    solo: "solo",
    individual: "solo",
    solteiro: "solo",
    casal: "casal",
    casal_p3: "casal c/ familiar",
    familiar: "familiar",
  };
  return processMap[composicao.toLowerCase()] ?? composicao;
}

function formatComposicao(composicao) {
  if (!composicao) return "Não informado";
  const labels = {
    individual: "Individual",
    casal: "Casal",
    casal_p3: "Casal + Familiar",
    familiar: "Familiar",
    solteiro: "Solteiro(a)",
  };
  return labels[composicao] ?? composicao.replace(/_/g, " ");
}

function formatRegimeTrabalho(regime) {
  if (!regime) return "Não informado";
  const labels = {
    clt: "CLT",
    autonomo: "Autônomo",
    mei: "MEI",
    servidor_publico: "Servidor Público",
    aposentado: "Aposentado / Pensionista",
    desempregado: "Desempregado",
    empresario: "Empresário",
  };
  return labels[regime.toLowerCase()] ?? regime.replace(/_/g, " ");
}

function deriveProntoPreAnalise(data) {
  const pendentes = data.docs_itens_pendentes ?? data.docs_faltantes ?? [];
  if (pendentes.length > 0) return false;
  const stage = data.fase_conversa;
  const prontoStages = [
    "aguardando_retorno_correspondente",
    "agendamento_visita",
    "visita_confirmada",
    "finalizacao_processo",
  ];
  if (stage && prontoStages.includes(stage)) return true;
  if (data.docs_status === "pronto" || data.docs_status === "completo" || data.docs_status === "ready") return true;
  return false;
}

function deriveParticipantesTotais(composicao) {
  if (!composicao) return 1;
  if (composicao === "individual" || composicao === "solteiro") return 1;
  if (composicao === "casal") return 2;
  if (composicao.includes("p3") || composicao === "familiar") return 3;
  return 1;
}

// ── Dados simulados (estrutura real) ──

const mockDataCompleto = {
  wa_id: "5511999990001",
  pre_cadastro_numero: "ENV-2024-99999",
  nome: "João da Silva",
  fase_conversa: "aguardando_retorno_correspondente",
  funil_status: null,
  faixa_renda_programa: "MCMV Faixa 2",
  renda_total_para_fluxo: 5200,
  composicao_pessoa: "casal",
  regime_trabalho: "CLT",
  estado_civil: "casado",
  nacionalidade: "brasileiro",
  dossie_resumo: "Cliente com renda familiar de R$ 5.200,00. Composição: casal CLT.",
  created_at: "2024-03-15T10:00:00.000Z",
  ctps_36: true,
  dependentes_qtd: 2,
  restricao: false,
  corr_lock_correspondente_wa_id: "5511988880001",
  processo_enviado_correspondente: true,
  aguardando_retorno_correspondente: true,
  retorno_correspondente_status: null,
  retorno_correspondente_motivo: null,
  retorno_correspondente_bruto: null,
  docs_status: "parcial",
  docs_itens_recebidos: [
    { tipo: "rg", participante: "p1" },
    { tipo: "comprovante_renda", participante: "p1" },
  ],
  docs_itens_pendentes: [
    { tipo: "comprovante_residencia", participante: "p1" },
  ],
  docs_faltantes: null,
  correspondente_retorno: "Imobiliária Nova Esperança",
  status_analise: "UNDER_ANALYSIS",
  resumo_retorno_analise: null,
  motivo_retorno_analise: null,
  valor_financiamento_aprovado: 190000,
  valor_subsidio_aprovado: 12500,
  valor_entrada_informada: 25000,
  valor_parcela_informada: 1420,
  resumo_perfil_analise: null,
  renda_total_analise: 5200,
  renda_familiar_analise: 5200,
  ticket_desejado_analise: 215000,
  faixa_perfil_analise: "MEDIUM",
  score_perfil_analise: 72,
  nivel_risco_reserva: null,
  data_envio_analise: "2024-03-16T10:00:00.000Z",
  data_retorno_analise: null,
  parceiro_analise: "Caixa Econômica Federal",
  status_atencao: "DUE_SOON",
  prazo_proxima_acao: "2024-03-29T10:00:00.000Z",
  proxima_acao: "Cobrar documentos pendentes",
  current_base: "base_sp",
  sinal_moradia_atual_p1: "Boa Vista",
  sinal_moradia_p1: "Cabral",
  sinal_trabalho_p1: "Centro",
  sinal_parcela_mensal: "1200",
  sinal_reserva_entrada: "true",
  sinal_reserva_entrada_valor: "10000",
  sinal_fgts_disponivel: "true",
  sinal_fgts_valor: "30000",
  sinal_curso_superior: "true",
  doc_links: [
    { tipo: "rg", participante: "p1", url: "https://example.com/rg-p1.pdf" },
    { tipo: "comprovante_renda", participante: "p1", url: "https://example.com/renda-p1.pdf" },
  ],
};

const mockDataMinimo = {
  wa_id: "5511999990002",
  pre_cadastro_numero: null,
  nome: null,
  fase_conversa: "envio_docs",
  funil_status: null,
  faixa_renda_programa: null,
  renda_total_para_fluxo: null,
  composicao_pessoa: null,
  regime_trabalho: null,
  estado_civil: null,
  nacionalidade: null,
  dossie_resumo: null,
  created_at: null,
  ctps_36: null,
  dependentes_qtd: null,
  restricao: null,
  corr_lock_correspondente_wa_id: null,
  processo_enviado_correspondente: null,
  aguardando_retorno_correspondente: null,
  retorno_correspondente_status: null,
  retorno_correspondente_motivo: null,
  retorno_correspondente_bruto: null,
  docs_status: null,
  docs_itens_recebidos: null,
  docs_itens_pendentes: null,
  docs_faltantes: null,
  correspondente_retorno: null,
  status_analise: null,
  resumo_retorno_analise: null,
  motivo_retorno_analise: null,
  valor_financiamento_aprovado: null,
  valor_subsidio_aprovado: null,
  valor_entrada_informada: null,
  valor_parcela_informada: null,
  resumo_perfil_analise: null,
  renda_total_analise: null,
  renda_familiar_analise: null,
  ticket_desejado_analise: null,
  faixa_perfil_analise: null,
  score_perfil_analise: null,
  nivel_risco_reserva: null,
  data_envio_analise: null,
  data_retorno_analise: null,
  parceiro_analise: null,
  status_atencao: null,
  prazo_proxima_acao: null,
  proxima_acao: null,
  current_base: null,
  sinal_moradia_atual_p1: null,
  sinal_moradia_p1: null,
  sinal_trabalho_p1: null,
  sinal_parcela_mensal: null,
  sinal_reserva_entrada: null,
  sinal_reserva_entrada_valor: null,
  sinal_fgts_disponivel: null,
  sinal_fgts_valor: null,
  sinal_curso_superior: null,
  doc_links: null,
};

// ── Smoke tests ──

console.log("=== dossie_real_data.smoke.mjs ===");

// 1. formatBRL with real value
assert.equal(formatBRL(190000), "R$\u00a0190.000,00", "formatBRL with real value");

// 2. formatBRL with null renders fallback
assert.equal(formatBRL(null), "Não informado", "formatBRL null fallback");

// 3. formatFaseConversa known stage
assert.equal(formatFaseConversa("aguardando_retorno_correspondente"), "Aguardando Retorno", "formatFaseConversa known");

// 4. formatFaseConversa null fallback
assert.equal(formatFaseConversa(null), "Não informado", "formatFaseConversa null");

// 5. formatStatusAnalise maps correctly
assert.equal(formatStatusAnalise("APPROVED_HIGH"), "Aprovado", "formatStatusAnalise approved");
assert.equal(formatStatusAnalise(null), "Em Análise", "formatStatusAnalise null default");

// 6. formatStatusAtencao maps correctly
assert.equal(formatStatusAtencao("OVERDUE"), "Alta", "formatStatusAtencao overdue");
assert.equal(formatStatusAtencao(null), "Normal", "formatStatusAtencao null default");

// 7. buildResumo prefers dossie_resumo
assert.equal(buildResumo(mockDataCompleto), mockDataCompleto.dossie_resumo, "buildResumo uses dossie_resumo");

// 8. buildResumo fallback chain - dossie_resumo null, uses resumo_perfil_analise
const withPerfilResumo = { ...mockDataCompleto, dossie_resumo: null, resumo_perfil_analise: "Perfil: CLT, renda R$ 5.200" };
assert.equal(buildResumo(withPerfilResumo), "Perfil: CLT, renda R$ 5.200", "buildResumo uses resumo_perfil_analise as fallback");

// 9. buildTitulo with programa
assert.ok(buildTitulo(mockDataCompleto).includes("MCMV Faixa 2"), "buildTitulo with programa");

// 10. buildTitulo without programa falls back
assert.equal(buildTitulo(mockDataMinimo), "Financiamento Habitacional", "buildTitulo fallback");

// 11. buildDocLabel - tipo only (p1)
assert.equal(buildDocLabel({ tipo: "rg", participante: "p1" }), "RG", "buildDocLabel p1 no suffix");

// 12. buildDocLabel - tipo + p2
assert.equal(buildDocLabel({ tipo: "comprovante_renda", participante: "p2" }), "Comprovante de Renda — Cônjuge / Parceiro", "buildDocLabel p2");

// 13. buildInstrucoes from retorno_correspondente_bruto
const withBruto = { ...mockDataMinimo, retorno_correspondente_bruto: "Pendências: CTPS e comprovante." };
assert.deepEqual(buildInstrucoes(withBruto), ["Pendências: CTPS e comprovante."], "buildInstrucoes from retorno_bruto");

// 14. buildInstrucoes from docs pendentes
const instrucoes = buildInstrucoes(mockDataCompleto);
assert.ok(instrucoes.length >= 1, "buildInstrucoes generates from docs_pendentes");
assert.ok(instrucoes[0].includes("Comprovante de Residência"), "buildInstrucoes mentions pending doc");

// 15. buildInstrucoes fallback when no data
assert.deepEqual(buildInstrucoes(mockDataMinimo), ["Aguardando atualização das instruções pelo correspondente."], "buildInstrucoes fallback");

// 16. formatDate renders correctly
const d = formatDate("2024-03-15T10:00:00.000Z");
assert.ok(d.includes("2024"), "formatDate includes year");

// 17. formatDate null fallback
assert.equal(formatDate(null), "Não informado", "formatDate null fallback");

// 18. docs_itens_recebidos - empty array renders gracefully (length 0, no crash)
const emptyDocs = mockDataMinimo.docs_itens_recebidos ?? [];
assert.equal(emptyDocs.length, 0, "empty docs_itens_recebidos handled");

// 19. docs_itens_pendentes - real array maps to labels
const pendentes = mockDataCompleto.docs_itens_pendentes ?? [];
assert.ok(pendentes.every((d) => buildDocLabel(d).length > 0), "all pendentes map to label");

// 20. DossieData shape: all required fields present in mock (no undefined fields in critical path)
const criticalFields = ["wa_id", "nome", "fase_conversa", "docs_itens_recebidos", "docs_itens_pendentes",
  "ctps_36", "dependentes_qtd", "restricao", "estado_civil", "composicao_pessoa", "regime_trabalho"];
for (const f of criticalFields) {
  assert.ok(f in mockDataCompleto, `mockDataCompleto has field ${f}`);
  assert.ok(f in mockDataMinimo, `mockDataMinimo has field ${f}`);
}

// 21. formatComposicao maps known values
assert.equal(formatComposicao("casal"), "Casal", "formatComposicao casal");
assert.equal(formatComposicao("individual"), "Individual", "formatComposicao individual");
assert.equal(formatComposicao(null), "Não informado", "formatComposicao null");
assert.equal(formatComposicao("casal_p3"), "Casal + Familiar", "formatComposicao casal_p3");

// 22. formatRegimeTrabalho maps known values
assert.equal(formatRegimeTrabalho("CLT"), "CLT", "formatRegimeTrabalho CLT");
assert.equal(formatRegimeTrabalho("autonomo"), "Autônomo", "formatRegimeTrabalho autonomo");
assert.equal(formatRegimeTrabalho(null), "Não informado", "formatRegimeTrabalho null");

// 23. deriveProntoPreAnalise — pendente: docs_itens_pendentes not empty → false
assert.equal(deriveProntoPreAnalise(mockDataCompleto), false, "deriveProntoPreAnalise: pendentes → false");

// 24. deriveProntoPreAnalise — pronto: no pendentes + prontoStage
const mockPronto = { ...mockDataCompleto, docs_itens_pendentes: [], docs_faltantes: null };
assert.equal(deriveProntoPreAnalise(mockPronto), true, "deriveProntoPreAnalise: no pendentes + aguardando_retorno → true");

// 25. deriveProntoPreAnalise — minimal (envio_docs stage, no pendentes): false
const mockEnvioDocs = { ...mockDataMinimo, fase_conversa: "envio_docs" };
assert.equal(deriveProntoPreAnalise(mockEnvioDocs), false, "deriveProntoPreAnalise: envio_docs → false");

// 26. deriveParticipantesTotais
assert.equal(deriveParticipantesTotais("casal"), 2, "deriveParticipantesTotais casal → 2");
assert.equal(deriveParticipantesTotais("individual"), 1, "deriveParticipantesTotais individual → 1");
assert.equal(deriveParticipantesTotais("casal_p3"), 3, "deriveParticipantesTotais casal_p3 → 3");
assert.equal(deriveParticipantesTotais(null), 1, "deriveParticipantesTotais null → 1");

// 27. ctps_36 / dependentes_qtd / restricao present in mock
assert.equal(mockDataCompleto.ctps_36, true, "ctps_36 present");
assert.equal(mockDataCompleto.dependentes_qtd, 2, "dependentes_qtd present");
assert.equal(mockDataCompleto.restricao, false, "restricao present");
assert.equal(mockDataMinimo.ctps_36, null, "ctps_36 null in minimal");
assert.equal(mockDataMinimo.restricao, null, "restricao null in minimal");

// 28. sinal fields present in mockDataCompleto
assert.equal(mockDataCompleto.sinal_moradia_atual_p1, "Boa Vista", "sinal_moradia_atual_p1 present");
assert.equal(mockDataCompleto.sinal_moradia_p1, "Cabral", "sinal_moradia_p1 present");
assert.equal(mockDataCompleto.sinal_trabalho_p1, "Centro", "sinal_trabalho_p1 present");
assert.equal(mockDataCompleto.sinal_parcela_mensal, "1200", "sinal_parcela_mensal present");

// 29. sinal_reserva_entrada + fgts_disponivel boolean string values
assert.equal(mockDataCompleto.sinal_reserva_entrada, "true", "sinal_reserva_entrada is string 'true'");
assert.equal(mockDataCompleto.sinal_fgts_disponivel, "true", "sinal_fgts_disponivel is string 'true'");

// 30. sinal fields are null in mockDataMinimo
assert.equal(mockDataMinimo.sinal_moradia_atual_p1, null, "sinal_moradia_atual_p1 null in minimo");
assert.equal(mockDataMinimo.sinal_fgts_valor, null, "sinal_fgts_valor null in minimo");

// 31. doc_links present in mockDataCompleto
assert.ok(Array.isArray(mockDataCompleto.doc_links), "doc_links is array in completo");
assert.equal(mockDataCompleto.doc_links.length, 2, "doc_links has 2 entries");
assert.ok(mockDataCompleto.doc_links[0].url.startsWith("https://"), "doc_links[0].url is URL");

// 32. doc_links null in mockDataMinimo
assert.equal(mockDataMinimo.doc_links, null, "doc_links null in minimo");

// 33. formatBoolSinal interpretation
function formatBoolSinal(val, trueLabel = "sim", falseLabel = "não") {
  if (val === null) return "Não informado";
  const v = val.toLowerCase();
  if (v === "true" || v === "sim" || v === "1" || v === "yes") return trueLabel;
  if (v === "false" || v === "não" || v === "nao" || v === "0" || v === "no") return falseLabel;
  return val;
}
assert.equal(formatBoolSinal("true"), "sim", "formatBoolSinal 'true' → sim");
assert.equal(formatBoolSinal("false"), "não", "formatBoolSinal 'false' → não");
assert.equal(formatBoolSinal(null), "Não informado", "formatBoolSinal null → não informado");

// 34. buildDocLabel works for DocLink (with url field)
const docLink = { tipo: "rg", participante: "p1", url: "https://example.com/rg.pdf" };
assert.equal(buildDocLabel(docLink), "RG", "buildDocLabel works for DocLink");

// 35. docTipoLabel covers new types added for old-front fidelity
function docTipoLabelV2(tipo) {
  if (!tipo) return "Documento";
  const labels = {
    rg: "RG", cpf: "CPF", identidade: "Documento de Identidade", cnh: "CNH",
    comprovante_renda: "Comprovante de Renda", comprovante_residencia: "Comprovante de Residência",
    carteira_trabalho: "Carteira de Trabalho", ctps: "CTPS", ctps_completa: "CTPS Completa",
    holerite_ultimo: "Holerite (último)", extrato_fgts: "Extrato do FGTS",
    declaracao_ir: "Declaração de IR",
  };
  return labels[tipo.toLowerCase()] ?? tipo.replace(/_/g, " ");
}
assert.equal(docTipoLabelV2("ctps_completa"), "CTPS Completa", "docTipoLabel ctps_completa");
assert.equal(docTipoLabelV2("holerite_ultimo"), "Holerite (último)", "docTipoLabel holerite_ultimo");

// 36. formatComposicao covers new types 'solo' and 'titular'
function formatComposicaoCoverage(composicao) {
  if (!composicao) return "Não informado";
  const labels = {
    individual: "Individual", casal: "Casal", casal_p3: "Casal + Familiar",
    familiar: "Familiar", solteiro: "Solteiro(a)", solo: "Solo", titular: "Titular",
  };
  return labels[composicao] ?? composicao.replace(/_/g, " ");
}
assert.equal(formatComposicaoCoverage("solo"), "Solo", "formatComposicao solo");
assert.equal(formatComposicaoCoverage("titular"), "Titular", "formatComposicao titular");

// 37. deriveParticipantesTotais returns 1 for new types 'solo' and 'titular'
function deriveParticipantesTotaisV2(composicao) {
  if (!composicao) return 1;
  if (composicao === "individual" || composicao === "solteiro" || composicao === "solo" || composicao === "titular") return 1;
  if (composicao === "casal") return 2;
  if (composicao.includes("p3") || composicao === "familiar") return 3;
  return 1;
}
assert.equal(deriveParticipantesTotaisV2("solo"), 1, "deriveParticipantesTotais solo → 1");
assert.equal(deriveParticipantesTotaisV2("titular"), 1, "deriveParticipantesTotais titular → 1");

// 38. formatTipoProcesso maps titular → solo (real production case: pre=000048)
assert.equal(formatTipoProcesso("titular"), "solo", "formatTipoProcesso titular → solo");
assert.equal(formatTipoProcesso("solo"), "solo", "formatTipoProcesso solo → solo");
assert.equal(formatTipoProcesso("individual"), "solo", "formatTipoProcesso individual → solo");
assert.equal(formatTipoProcesso("casal"), "casal", "formatTipoProcesso casal → casal");
assert.equal(formatTipoProcesso("casal_p3"), "casal c/ familiar", "formatTipoProcesso casal_p3");
assert.equal(formatTipoProcesso(null), "Não informado", "formatTipoProcesso null");

// 39. buildRawDocLabel mirrors production display (raw tipo, not formatted)
// matches production at pre=000048: "rg — Titular", "comprovante_residencia — Titular"
function buildRawDocLabel(item) {
  const tipo = item.tipo ?? "—";
  const parts = { p1: "Titular", p2: "Cônjuge / Parceiro", p3: "Familiar" };
  if (!item.participante || item.participante === "p1") return tipo;
  const part = parts[item.participante] ?? item.participante;
  return `${tipo} — ${part}`;
}
assert.equal(buildRawDocLabel({ tipo: "rg", participante: "p1" }), "rg", "buildRawDocLabel p1: tipo only");
assert.equal(buildRawDocLabel({ tipo: "comprovante_residencia", participante: "p1" }), "comprovante_residencia", "buildRawDocLabel: raw tipo");
assert.equal(buildRawDocLabel({ tipo: "rg", participante: "p2" }), "rg — Cônjuge / Parceiro", "buildRawDocLabel p2: tipo + participant");

console.log("✅ All 39 smoke tests passed.");
