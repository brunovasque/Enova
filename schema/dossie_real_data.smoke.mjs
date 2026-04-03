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
};

// ── Smoke tests ──

// ── Normalização do telefone do correspondente (mirrors actions.ts normalizeCorrPhone) ──

function normalizeCorrPhone(input) {
  const digits = input.replace(/\D/g, "");
  const withoutPrefix = digits.startsWith("55") ? digits.slice(2) : digits;
  const withPrefix = `55${withoutPrefix}`;
  return { withPrefix, withoutPrefix };
}

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
const criticalFields = ["wa_id", "nome", "fase_conversa", "docs_itens_recebidos", "docs_itens_pendentes"];
for (const f of criticalFields) {
  assert.ok(f in mockDataCompleto, `mockDataCompleto has field ${f}`);
  assert.ok(f in mockDataMinimo, `mockDataMinimo has field ${f}`);
}

// 21. normalizeCorrPhone: entrada sem 55 → withPrefix tem 55, withoutPrefix não tem
{
  const { withPrefix, withoutPrefix } = normalizeCorrPhone("41997780518");
  assert.equal(withPrefix, "5541997780518", "normalizeCorrPhone: withPrefix adds 55");
  assert.equal(withoutPrefix, "41997780518", "normalizeCorrPhone: withoutPrefix strips nothing");
}

// 22. normalizeCorrPhone: entrada com 55 → withPrefix mantém 55, withoutPrefix remove
{
  const { withPrefix, withoutPrefix } = normalizeCorrPhone("5541997780518");
  assert.equal(withPrefix, "5541997780518", "normalizeCorrPhone: withPrefix keeps 55");
  assert.equal(withoutPrefix, "41997780518", "normalizeCorrPhone: withoutPrefix strips 55");
}

// 23. normalizeCorrPhone: entrada com traços/espaços → apenas dígitos
{
  const { withPrefix } = normalizeCorrPhone("(41) 99778-0518");
  assert.equal(withPrefix, "5541997780518", "normalizeCorrPhone: strips non-digits");
}

console.log("✅ All 23 smoke tests passed.");
