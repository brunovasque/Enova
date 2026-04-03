import { READ_ONLY_COGNITIVE_FIXTURES } from "../fixtures/read-only-cases.js";

// ── Etapa 5: Global cognitive layer imports ──────────────────────────────────
import { getCanonicalFAQ } from "./faq-lookup.js";
import { getCanonicalObjection } from "./objections-lookup.js";
import { getKnowledgeBaseItem } from "./knowledge-lookup.js";
import { buildReanchor } from "./reanchor-helper.js";

const REQUIRED_RESPONSE_FIELDS = Object.freeze([
  "reply_text",
  "slots_detected",
  "pending_slots",
  "conflicts",
  "suggested_next_slot",
  "consultive_notes",
  "should_request_confirmation",
  "should_advance_stage",
  "confidence"
]);

const STAGE_DEFAULT_PENDING_SLOTS = Object.freeze({
  estado_civil: ["estado_civil", "composicao"],
  somar_renda_solteiro: ["composicao", "familiar", "renda"],
  somar_renda_familiar: ["familiar", "p3"],
  regime_trabalho: ["regime_trabalho", "renda", "ir_declarado"],
  autonomo_ir_pergunta: ["ir_declarado", "renda"],
  renda: ["renda", "ir_declarado"],
  ir_declarado: ["ir_declarado"],
  autonomo_compor_renda: ["composicao"],
  ctps_36: ["ctps_36"],
  ctps_36_parceiro: ["ctps_36_parceiro"],
  ctps_36_parceiro_p3: ["ctps_36_parceiro_p3"],
  dependente: ["dependente"],
  restricao: ["restricao"],
  restricao_parceiro: ["restricao_parceiro"],
  restricao_parceiro_p3: ["restricao_parceiro_p3"],
  regularizacao_restricao: ["regularizacao_restricao"],
  regularizacao_restricao_parceiro: ["regularizacao_restricao_parceiro"],
  regularizacao_restricao_p3: ["regularizacao_restricao_p3"],
  inicio_nome: ["nome"],
  inicio_nacionalidade: ["nacionalidade"],
  inicio_rnm: ["rnm_status"],
  inicio_rnm_validade: ["rnm_validade"],
  possui_renda_extra: ["renda_extra"],
  inicio_multi_regime_pergunta: ["multi_regime"],
  inicio_multi_regime_coletar: ["multi_regime"],
  inicio_multi_renda_pergunta: ["multi_renda"],
  inicio_multi_renda_coletar: ["multi_renda"],
  parceiro_tem_renda: ["parceiro_tem_renda"],
  regime_trabalho_parceiro: ["regime_trabalho_parceiro"],
  inicio_multi_regime_pergunta_parceiro: ["multi_regime_parceiro"],
  inicio_multi_regime_coletar_parceiro: ["multi_regime_parceiro"],
  renda_parceiro: ["renda_parceiro"],
  inicio_multi_renda_pergunta_parceiro: ["multi_renda_parceiro"],
  inicio_multi_renda_coletar_parceiro: ["multi_renda_parceiro"],
  pais_casados_civil_pergunta: ["pais_casados_civil"],
  confirmar_avo_familiar: ["confirmar_avo"],
  renda_familiar_valor: ["renda_familiar"],
  regime_trabalho_parceiro_familiar: ["regime_trabalho_familiar"],
  renda_parceiro_familiar: ["renda_parceiro_familiar"],
  inicio_multi_regime_familiar_pergunta: ["multi_regime_familiar"],
  inicio_multi_regime_familiar_loop: ["multi_regime_familiar"],
  inicio_multi_renda_familiar_pergunta: ["multi_renda_familiar"],
  inicio_multi_renda_familiar_loop: ["multi_renda_familiar"],
  p3_tipo_pergunta: ["p3_tipo"],
  regime_trabalho_parceiro_familiar_p3: ["regime_trabalho_p3"],
  renda_parceiro_familiar_p3: ["renda_p3"],
  inicio_multi_regime_p3_pergunta: ["multi_regime_p3"],
  inicio_multi_regime_p3_loop: ["multi_regime_p3"],
  inicio_multi_renda_p3_pergunta: ["multi_renda_p3"],
  inicio_multi_renda_p3_loop: ["multi_renda_p3"]
});

const BRL_CURRENCY_PATTERN = /(?<!\d)(?:r\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?(?!\d)/i;
const OFFTRACK_HINTS = /\b(valor|entrada|parcela|imovel|imóvel|casa|apartamento|bairro|regiao|região|metros)\b/i;
const AMBIGUOUS_HINTS = /\b(acho|talvez|mais ou menos|nao sei|não sei|meio|duvida|dúvida)\b/i;
const DEFER_ACTION_PATTERN = /\b(depois eu vejo|depois vejo|vejo depois|depois eu mando|depois mando|te mando depois|mando depois|depois eu vejo isso|depois vejo isso|depois te falo)\b/i;
const NO_TIME_PATTERN = /\b(nao tenho tempo|não tenho tempo|agora nao tenho tempo|agora não tenho tempo|agora nao consigo|agora não consigo|to sem tempo|tô sem tempo|corrido agora)\b/i;
const FEAR_PATTERN = /\b(medo|receio|insegur|preocupad|expost[oa]|vazar|golpe)\b/i;
const REMOTE_REFUSAL_PATTERN =
  /\b(nao quero atendimento online|não quero atendimento online|nao quero atendimento remoto|não quero atendimento remoto|nao quero seguir online|não quero seguir online|nao quero continuar online|não quero continuar online|nao quero no whatsapp|não quero no whatsapp|prefiro presencial|quero atendimento presencial|quero ir presencial|sem whatsapp)\b/i;
const DOCS_HINT_PATTERN =
  /\b(doc|documento|documentos|rg|cpf|holerite|extrato|imposto de renda|declara[cç][aã]o de ir|comprovante de residencia|comprovante de residência)\b/i;
const HOLERITE_VARIATION_PATTERN = /\b(comissao|comissão|hora extra|horas extras|adicional|bonus|b[oô]nus|vari[aá]vel|variacao|varia[cç][aã]o)\b/i;
const DOCS_STAGE_PATTERN = /\b(envio docs|envio_docs|docs|documento|documentos)\b/;
const CORRESPONDENTE_STAGE_PATTERN =
  /\b(correspondente|analise correspondente|an[aá]lise correspondente|retorno correspondente|analise_correspondente|retorno_correspondente)\b/;
const CORRESPONDENTE_HINT_PATTERN = /\b(correspondente|aprovad|analise|an[aá]lise|retorno)\b/i;
const APPROVAL_HINT_PATTERN = /\b(aprovad[oa]|aprovou|aprovacao|aprovação)\b/i;
const FINANCIAL_DETAILS_PATTERN = /\b(valor|credito|crédito|liberad|taxa|juros|subs[ií]dio|poder de compra|entrada|parcela)\b/i;
const APPROVAL_PROOF_PATTERN = /\b(print|imagem|comprov|prova|evid[eê]ncia)\b/i;
const VISITA_STAGE_PATTERN = /\b(visita|agendamento_visita|visita_confirmada|plantao|plantão|finalizacao processo|finalizacao_processo)\b/;
const VISITA_HINT_PATTERN = /\b(visita|plantao|plantão|hor[aá]rio|dia|remarcar|reagendar|escolher im[oó]vel|empreendimento|apartamento|unidade)\b/i;
const VISITA_RESCHEDULE_PATTERN = /\b(remarcar|reagendar|outro hor[aá]rio|outro dia)\b/i;
const VISITA_ACCEPT_PATTERN = /\b(quero visitar|aceito visita|vamos agendar|pode agendar|quero agendar)\b/i;
const VISITA_RESIST_PATTERN = /\b(n[aã]o quero visitar|prefiro n[aã]o visitar|pra que visitar|por que visitar)\b/i;
const VISITA_ESFRIAMENTO_PATTERN = /\b(vou pensar|preciso pensar|quem sabe|ainda nao decidi|ainda não decidi|deixa eu ver|quando puder|sem pressa)\b/i;
const ALUGUEL_HINT_PATTERN = /\b(aluguel|alugar|alugo|alugando)\b/i;
const DOC_TIPO_RESPOSTA_PATTERN =
  /\b(holerite|comprovante(?: de (?:residencia|renda))?|ctps|carteira de trabalho|rg|cnh|cpf|declaracao|imposto de renda|extrato|identidade|documento pessoal)\b/i;
const AUTONOMO_HINT_PATTERN = /\bautonom[oa]|aut[oô]nomo|por conta|bico|uber|taxa\b/i;
const DEPENDENTE_HINT_PATTERN = /\b(dependente|filho|filha|menor de 18|terceiro grau)\b/i;
const CTPS_36_HINT_PATTERN = /\b(ctps|carteira de trabalho|36 meses|trinta e seis meses)\b/i;
const REPROVACAO_HINT_PATTERN =
  /\b(reprovad|restri[cç][aã]o|scr|bacen|registrato|sinad|conres|comprometimento|emprestimo|empr[eé]stimo)\b/i;
const ESTADO_CIVIL_COMPOSICAO_HINT_PATTERN =
  /\b(uni[aã]o est[aá]vel|casad[oa] no civil|casad[oa]|moro junto|moramos juntos|composi[cç][aã]o)\b/i;
const MORA_JUNTO_PATTERN = /\bmoro junto\b|\bmoramos juntos\b/;
const EXPLICIT_UNIAO_ESTAVEL_PATTERN = /\buniao estavel\b|\buni[aã]o est[aá]vel\b/;
const SEM_UNIAO_ESTAVEL_PATTERN = /\bsem uniao estavel\b|\bsem uni[aã]o est[aá]vel\b/;
const FAMILY_MEMBER_PATTERN = /\bm[aã]e\b|\bpai\b|\birm[aã](?:o)?\b|\bav[oó]\b|\btio\b|\btia\b|\bprima\b|\bprimo\b/g;
const CONFIRMATION_SLOT_KEYS = new Set(["p3"]);
const ESTADO_CIVIL_CONFIDENCE = Object.freeze({
  default: 0.88,
  ambiguous: 0.41
});
const CONFIDENCE_RULES = Object.freeze({
  detectedBase: 0.58,
  detectedIncrement: 0.1,
  noSlotBase: 0.32,
  conflictPenalty: 0.22,
  offtrackPenalty: 0.08,
  offtrackBase: 0.58
});
const DEFAULT_COGNITIVE_AI_MODEL = "gpt-4.1-mini";
const COGNITIVE_SLOT_DEPENDENCIES = Object.freeze({
  estado_civil: ["composicao"],
  composicao: ["parceiro_p2", "familiar", "p3"],
  regime_trabalho: ["renda", "ir_declarado"],
  autonomo_ir: ["docs"],
  ctps: ["docs"],
  restricao: ["docs"],
  docs: ["correspondente"],
  correspondente: ["visita"]
});
const TOPO_FUNIL_STAGES = new Set(["inicio", "inicio_decisao", "inicio_programa", "inicio_nome", "inicio_nacionalidade", "inicio_rnm", "inicio_rnm_validade"]);
const COMPOSICAO_INICIAL_STAGES = new Set(["somar_renda_solteiro", "somar_renda_familiar", "quem_pode_somar", "interpretar_composicao"]);
const RENDA_TRABALHO_STAGES = new Set(["regime_trabalho", "autonomo_ir_pergunta", "renda"]);
const APROFUNDAMENTO_RENDA_STAGES = new Set(["possui_renda_extra", "inicio_multi_regime_pergunta", "inicio_multi_regime_coletar", "inicio_multi_renda_pergunta", "inicio_multi_renda_coletar"]);
const PARCEIRO_RENDA_STAGES = new Set(["parceiro_tem_renda", "regime_trabalho_parceiro", "inicio_multi_regime_pergunta_parceiro", "inicio_multi_regime_coletar_parceiro", "renda_parceiro", "inicio_multi_renda_pergunta_parceiro", "inicio_multi_renda_coletar_parceiro"]);
const FAMILIAR_RENDA_STAGES = new Set(["pais_casados_civil_pergunta", "confirmar_avo_familiar", "renda_familiar_valor", "regime_trabalho_parceiro_familiar", "renda_parceiro_familiar", "inicio_multi_regime_familiar_pergunta", "inicio_multi_regime_familiar_loop", "inicio_multi_renda_familiar_pergunta", "inicio_multi_renda_familiar_loop"]);
const P3_RENDA_STAGES = new Set(["p3_tipo_pergunta", "regime_trabalho_parceiro_familiar_p3", "renda_parceiro_familiar_p3", "inicio_multi_regime_p3_pergunta", "inicio_multi_regime_p3_loop", "inicio_multi_renda_p3_pergunta", "inicio_multi_renda_p3_loop"]);
const GATE_FINAIS_STAGES = new Set(["ir_declarado", "autonomo_compor_renda", "ctps_36", "ctps_36_parceiro", "ctps_36_parceiro_p3", "dependente", "restricao", "restricao_parceiro", "restricao_parceiro_p3", "regularizacao_restricao", "regularizacao_restricao_parceiro", "regularizacao_restricao_p3"]);
const OPERACIONAL_FINAL_STAGES = new Set(["envio_docs", "aguardando_retorno_correspondente", "agendamento_visita", "finalizacao_processo"]);

// ── Etapa 5: FAQ/Objection/KB intent-matching maps ──────────────────────────
// Maps normalized message patterns to canonical global-layer IDs.
// Priority: FAQ → Objection → KB. Only covers topo/docs/visita blocks.

const _TOPO_FAQ_MAP = Object.freeze([
  { pattern: /\b(como funciona|o que [eé]|me explica|minha casa minha vida|mcmv|programa|financiamento|subsidio|subsídio)\b/i, faqId: null, kbId: "elegibilidade_basica" },
  { pattern: /\b(quanto vou|quanto posso|valor.*financ|poder.*financ|financ.*poder|financ.*quanto)\b/i, faqId: "valor_sem_analise", kbId: null },
  { pattern: /\bfgts\b/i, faqId: "fgts_uso", kbId: "fgts_entrada" },
  { pattern: /\b(entrada|entrada m[ií]nima|valor.*entrada|preciso.*entrada)\b/i, faqId: "entrada_minima", kbId: null },
  { pattern: /\b(aprovad[oa]|vou ser aprovad|aprova[cç][aã]o|garantia|chance)\b/i, faqId: "aprovacao_garantia", kbId: null },
  { pattern: /\b(confi[aá]vel|seguro|golpe|medo|fraude|piramide)\b/i, objectionId: "medo_golpe", faqId: null, kbId: null },
  { pattern: /\b(vou pensar|depois.*vejo|pensar.*antes|pra pensar)\b/i, objectionId: "vou_pensar", faqId: null, kbId: null },
  { pattern: /\b(presencial|plant[aã]o|ir.*pessoalmente|prefiro.*presencial|prefiro.*ir)\b/i, objectionId: "presencial_preferido", faqId: null, kbId: null },
  { pattern: /\b(simul|j[aá] d[aá] pra simular|simulacao|simulação)\b/i, faqId: "simulacao_plantao", kbId: "simulacao_aprovacao" },
  { pattern: /\b(restri[cç][aã]o|nome sujo|spc|serasa|negativad)\b/i, faqId: "restricao_impede", kbId: "restricao_credito" },
  { pattern: /\b(demora|prazo|quanto tempo|rapidez)\b/i, faqId: "prazo_processo", kbId: null }
]);

const _DOCS_FAQ_MAP = Object.freeze([
  { pattern: /\b(seguro|segur|confi[aá]vel|golpe|vazar|expost|dados)\b/i, faqId: "seguranca_docs", objectionId: "duvida_seguranca_dados", kbId: null },
  { pattern: /\b(medo.*mandar|medo.*enviar|tenho medo|receio)\b/i, objectionId: "medo_golpe", faqId: null, kbId: null },
  { pattern: /\b(n[aã]o.*t[oô].*com|n[aã]o tenho.*doc|sem.*doc.*agora|n[aã]o.*consigo.*agora)\b/i, objectionId: "sem_documentos_agora", faqId: null, kbId: null },
  { pattern: /\b(mandar depois|posso.*depois|depois.*mando|mando.*depois|depois eu mando)\b/i, objectionId: "sem_documentos_agora", faqId: null, kbId: null },
  { pattern: /\b(quais doc|que doc|lista.*doc|documentos.*precis|preciso.*quais|o que eu preciso)\b/i, faqId: null, kbId: "docs_por_perfil", objectionId: null },
  { pattern: /\b(presencial|plant[aã]o|prefiro.*ir|prefiro.*presencial|n[aã]o.*online)\b/i, objectionId: "presencial_preferido", faqId: null, kbId: null },
  { pattern: /\b(sem tempo|n[aã]o tenho tempo|agora n[aã]o|corrido)\b/i, objectionId: "sem_tempo", faqId: null, kbId: null }
]);

const _VISITA_FAQ_MAP = Object.freeze([
  { pattern: /\b(hor[aá]rio|hora|dia|quando|opç[oõ]es|agenda)\b/i, faqId: null, kbId: "visita_plantao", objectionId: null },
  { pattern: /\b(onde fica|endereço|localiza[cç][aã]o|como cheg)\b/i, faqId: null, kbId: "visita_plantao", objectionId: null },
  { pattern: /\b(presencial|plant[aã]o|prefiro.*ir|prefiro.*presencial)\b/i, objectionId: "presencial_preferido", faqId: null, kbId: "visita_plantao" },
  { pattern: /\b(vou pensar|depois.*vejo|pensar.*antes|quem sabe|sem pressa)\b/i, objectionId: "vou_pensar", faqId: null, kbId: null },
  { pattern: /\b(n[aã]o quero online|n[aã]o.*online|n[aã]o.*quero.*online)\b/i, objectionId: "nao_quero_online", faqId: null, kbId: null },
  { pattern: /\b(escolher im[oó]vel|j[aá].*escolher|unidade|empreendimento)\b/i, faqId: "imovel_escolha", kbId: null, objectionId: null }
]);

/**
 * Etapa 5 — resolveGlobalLayerReply
 *
 * Given a normalized message and a map of patterns, resolves the best
 * canonical global-layer response (FAQ → Objection → KB).
 * Returns { reply, source, needsReanchor } or null if no match.
 *
 * @param {string} normalizedMessage
 * @param {readonly {pattern: RegExp, faqId?: string|null, objectionId?: string|null, kbId?: string|null}[]} layerMap
 * @returns {{ reply: string, source: string, needsReanchor: boolean } | null}
 */
function resolveGlobalLayerReply(normalizedMessage, layerMap) {
  if (!normalizedMessage) return null;
  for (const entry of layerMap) {
    if (!entry.pattern.test(normalizedMessage)) continue;

    // Priority 1: FAQ
    if (entry.faqId) {
      const faq = getCanonicalFAQ(entry.faqId);
      if (faq) return { reply: faq.resposta, source: `faq:${entry.faqId}`, needsReanchor: true };
    }

    // Priority 2: Objection
    if (entry.objectionId) {
      const obj = getCanonicalObjection(entry.objectionId);
      if (obj) return { reply: obj.resposta_canonica, source: `objection:${entry.objectionId}`, needsReanchor: true };
    }

    // Priority 3: KB
    if (entry.kbId) {
      const kb = getKnowledgeBaseItem(entry.kbId);
      if (kb) return { reply: kb.conteudo, source: `kb:${entry.kbId}`, needsReanchor: true };
    }
  }
  return null;
}

/**
 * Etapa 5 — wrapWithReanchor
 *
 * If the reply came from a global layer (off-stage question), append reanchor
 * to naturally bring the user back to the current stage.
 * Returns a single concatenated string.
 *
 * @param {string} reply - The global-layer canonical reply
 * @param {string} currentStage - Current funnel stage
 * @returns {string}
 */
function wrapWithReanchor(reply, currentStage) {
  if (!reply || !currentStage) return reply || "";
  const reanchor = buildReanchor({ partialReply: reply, currentStage });
  return reanchor.text;
}

const REPLY_TEXT_REPLACEMENTS = Object.freeze([
  [/\brunner read-only\b/gi, "atendimento"],
  [/\bmotor cognitivo de teste\b/gi, "atendimento"],
  [/\bcognitivo de teste\b/gi, "atendimento"],
  [/\bmodo read-only\b/gi, ""],
  [/\bneste teste isolado\b/gi, ""],
  [/\bleitura estruturada do cognitivo\b/gi, "leitura do seu caso"],
  [/\bleitura cognitiva\b/gi, "leitura do seu caso"]
]);
const SLOT_LABELS = Object.freeze({
  estado_civil: "estado civil",
  composicao: "composição de renda",
  familiar: "familiar que vai compor renda",
  p3: "terceira pessoa na composição",
  regime_trabalho: "tipo de trabalho",
  renda: "renda mensal",
  ir_declarado: "Imposto de Renda",
  docs: "documentos",
  correspondente: "documentos pendentes",
  visita: "visita no plantão",
  renda_extra: "renda extra",
  multi_regime: "segundo regime de trabalho",
  multi_renda: "renda adicional",
  parceiro_tem_renda: "renda do parceiro",
  regime_trabalho_parceiro: "regime de trabalho do parceiro",
  multi_regime_parceiro: "segundo regime do parceiro",
  renda_parceiro: "renda do parceiro",
  multi_renda_parceiro: "renda adicional do parceiro",
  pais_casados_civil: "confirmação de casamento civil dos pais",
  confirmar_avo: "confirmação do tipo de familiar (avô/avó)",
  renda_familiar: "renda do familiar na composição",
  regime_trabalho_familiar: "regime de trabalho do familiar",
  renda_parceiro_familiar: "renda do segundo familiar na composição",
  multi_regime_familiar: "segundo regime de trabalho do familiar",
  multi_renda_familiar: "renda adicional do familiar",
  p3_tipo: "tipo da terceira pessoa na composição",
  regime_trabalho_p3: "regime de trabalho do P3",
  renda_p3: "renda do P3",
  multi_regime_p3: "segundo regime de trabalho do P3",
  multi_renda_p3: "renda adicional do P3"
});
const SLOT_ACTION_PROMPTS = Object.freeze({
  estado_civil: "Me confirma seu estado civil hoje: solteiro, casado no civil ou união estável?",
  composicao: "Me confirma se você vai seguir sozinho, com parceiro ou com familiar?",
  familiar: "Me diz com qual familiar você pretende compor renda?",
  p3: "Me confirma se terá uma terceira pessoa compondo renda?",
  regime_trabalho: "Me confirma se hoje você é CLT, autônomo, servidor ou aposentado?",
  renda: "Me informa sua renda média mensal?",
  ir_declarado: "Me confirma se você declara Imposto de Renda?",
  docs: "Se quiser, já pode me mandar os documentos básicos por aqui que eu adianto sua análise.",
  correspondente: "Se quiser, eu sigo acompanhando por aqui e te aviso assim que tiver retorno do correspondente.",
  visita: "Se fizer sentido para você, eu já vejo um horário dentro da agenda oficial do plantão.",
  rnm_status: "Você possui *RNM*? Responda *sim* ou *não*.",
  rnm_validade: "Seu RNM é *com validade* (data definida) ou *indeterminado* (sem prazo)?",
  renda_extra: "Você tem alguma renda extra além da sua renda principal? Responda *sim* ou *não*.",
  multi_regime: "Você tem *mais algum regime de trabalho* além desse? Responda *sim* ou *não*.",
  multi_renda: "Você tem *mais alguma renda* além da principal? Responda *sim* ou *não*.",
  parceiro_tem_renda: "O parceiro tem renda? Responda *sim* ou *não*.",
  regime_trabalho_parceiro: "Qual é o regime de trabalho do parceiro? *CLT*, *autônomo*, *servidor* ou *aposentado*?",
  multi_regime_parceiro: "O parceiro tem *mais algum regime de trabalho*? Responda *sim* ou *não*.",
  renda_parceiro: "Qual é a renda mensal do parceiro?",
  multi_renda_parceiro: "O parceiro tem *mais alguma renda*? Responda *sim* ou *não*.",
  pais_casados_civil: "Seus pais são casados no civil? Responda *sim* ou *não*.",
  confirmar_avo: "Confirma que o familiar é avô ou avó? Responda *sim* ou *não*.",
  renda_familiar: "Qual é a renda mensal do familiar?",
  regime_trabalho_familiar: "Qual é o regime de trabalho do familiar? *CLT*, *autônomo*, *servidor* ou *aposentado*?",
  renda_parceiro_familiar: "Qual é a renda mensal do outro familiar na composição?",
  multi_regime_familiar: "O familiar tem *mais algum regime de trabalho*? Responda *sim* ou *não*.",
  multi_renda_familiar: "O familiar tem *mais alguma renda*? Responda *sim* ou *não*.",
  p3_tipo: "Me confirma quem é a terceira pessoa que vai compor renda?",
  regime_trabalho_p3: "Qual é o regime de trabalho do P3? *CLT*, *autônomo*, *servidor* ou *aposentado*?",
  renda_p3: "Qual é a renda mensal do P3?",
  multi_regime_p3: "O P3 tem *mais algum regime de trabalho*? Responda *sim* ou *não*.",
  multi_renda_p3: "O P3 tem *mais alguma renda*? Responda *sim* ou *não*."
});
const COGNITIVE_SLOT_CONTRACT = Object.freeze([
  {
    key: "estado_civil",
    description: "Leitura consultiva de solteiro/casado civil/união estável.",
    depends_on: []
  },
  {
    key: "composicao",
    description: "Indica se o caso segue sozinho, com parceiro ou com familiar.",
    depends_on: ["estado_civil"]
  },
  {
    key: "familiar",
    description: "Familiar específico quando a composição envolver familiar.",
    depends_on: ["composicao"]
  },
  {
    key: "p3",
    description: "Terceiro participante quando aplicável.",
    depends_on: ["composicao"]
  },
  {
    key: "regime_trabalho",
    description: "Regime como CLT, autônomo, servidor ou aposentado.",
    depends_on: []
  },
  {
    key: "renda",
    description: "Faixa/valor de renda informado pelo cliente.",
    depends_on: ["regime_trabalho"]
  },
  {
    key: "ir_declarado",
    description: "Se o cliente declara imposto de renda.",
    depends_on: ["regime_trabalho", "renda"]
  }
]);

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function repairTextEncoding(value) {
  let text = String(value || "").replace(/\u0000/g, "");
  if (/[ÃÂ]/.test(text)) {
    try {
      text = decodeURIComponent(escape(text));
    } catch (_) {
      // se falhar, segue com o texto original
    }
  }
  return text.normalize("NFC");
}

function normalizeText(value) {
  return repairTextEncoding(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function humanJoinList(values) {
  const items = Array.isArray(values)
    ? values.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} e ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

function normalizeRequest(input = {}) {
  const context = input?.context && typeof input.context === "object" ? input.context : {};
  const message = input?.message && typeof input.message === "object" ? input.message : {};
  const knownSlotsRaw = input?.known_slots ?? context?.known_slots;
  const pendingSlotsRaw = input?.pending_slots ?? context?.pending_slots;
  const recentMessagesRaw = input?.recent_messages ?? context?.recent_messages;
  const normativeContextRaw = input?.normative_context ?? context?.normative_context;
  const normalized = {
    version: String(input?.version || "read_only_test_v1"),
    channel: String(input?.channel || "meta_whatsapp"),
    conversation_id: String(input?.conversation_id || message?.id || "cognitive-test"),
    current_stage: String(input?.current_stage || context?.current_stage || "inicio"),
    message_text: String(input?.message_text || message?.text || ""),
    known_slots:
      knownSlotsRaw && typeof knownSlotsRaw === "object" && !Array.isArray(knownSlotsRaw)
        ? cloneJson(knownSlotsRaw)
        : {},
    pending_slots: Array.isArray(pendingSlotsRaw) ? [...pendingSlotsRaw] : [],
    recent_messages: Array.isArray(recentMessagesRaw)
      ? recentMessagesRaw.map((entry) => {
          if (typeof entry === "string") return { role: "user", text: entry };
          return {
            role: String(entry?.role || "user"),
            text: String(entry?.text || "")
          };
        })
      : [],
    normative_context: Array.isArray(normativeContextRaw)
      ? normativeContextRaw
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const title = String(entry?.title || "").trim();
            const content = String(entry?.content || "").trim();
            if (!title && !content) return null;
            return {
              title: title || "Normative context",
              content,
              source: String(entry?.source || "").trim() || null
            };
          })
          .filter(Boolean)
      : []
  };

  return normalized;
}

function pickDetectedValue(text, pairs) {
  for (const pair of pairs) {
    if (pair.regex.test(text)) return pair.value;
  }
  return null;
}

function detectMoney(text) {
  const matches = String(text || "").match(new RegExp(BRL_CURRENCY_PATTERN.source, "gi"));
  if (!matches || !matches.length) return null;
  const parsedValues = matches
    .map((match) => {
      const raw = match.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    })
    .filter((value) => Number.isFinite(value));

  if (!parsedValues.length) return null;
  return parsedValues.sort((a, b) => b - a)[0];
}

function detectEstadoCivil(text) {
  if (MORA_JUNTO_PATTERN.test(text) && SEM_UNIAO_ESTAVEL_PATTERN.test(text)) return null;
  if (EXPLICIT_UNIAO_ESTAVEL_PATTERN.test(text)) return "uniao_estavel";
  if (/\bcasad[oa]\b/.test(text)) return "casado_civil";
  if (/\bsolteir[oa]\b/.test(text)) return "solteiro";
  return null;
}

function detectRegime(text) {
  return pickDetectedValue(text, [
    { regex: /\bclt\b|\bcarteira assinada\b|\bregistrad[oa]\b/, value: "clt" },
    { regex: /\bautonom[oa]\b|\baut[oô]nomo\b|\bpor conta\b/, value: "autonomo" },
    { regex: /\bservidor\b/, value: "servidor" },
    { regex: /\baposentad[oa]\b/, value: "aposentado" }
  ]);
}

function detectIr(text) {
  if (/\bnao declaro ir\b|\bnão declaro ir\b|\bsem declarar ir\b|\bnao declaro imposto\b|\bnão declaro imposto\b/.test(text)) {
    return "nao";
  }
  if (/\bdeclaro ir\b|\bdeclaro imposto\b|\bfaço imposto de renda\b|\bfa[oç]o ir\b/.test(text)) {
    return "sim";
  }
  return null;
}

function detectComposicao(text) {
  if (/\bsozinh[oa]\b|\bs[oó] eu\b|\bs[oó] minha renda\b/.test(text)) return { tipo: "sozinho" };
  if (/\besposa\b|\bmarido\b|\bconjuge\b|\bc[oô]njuge\b|\bparceir[oa]\b/.test(text)) {
    return { tipo: "parceiro", label: "parceiro" };
  }
  if (/\bmae\b|\bm[aã]e\b|\bpai\b|\birmao\b|\birm[aã]o\b|\bavo\b|\bav[oó]\b|\btio\b|\btia\b|\bprima?\b|\bprimo\b|\bfamiliar\b/.test(text)) {
    return { tipo: "familiar", label: "familiar" };
  }
  return null;
}

function detectFamiliar(text) {
  return pickDetectedValue(text, [
    { regex: /\bm[aã]e\b/, value: "mae" },
    { regex: /\bpai\b/, value: "pai" },
    { regex: /\birma\b|\birmã\b/, value: "irma" },
    { regex: /\birmao\b|\birmão\b/, value: "irmao" },
    { regex: /\bav[oó]\b/, value: "avo" },
    { regex: /\btio\b/, value: "tio" },
    { regex: /\btia\b/, value: "tia" },
    { regex: /\bprimo\b/, value: "primo" },
    { regex: /\bprima\b/, value: "prima" },
    { regex: /\bfamiliar\b/, value: "familiar_nao_especificado" }
  ]);
}

function detectP3(text) {
  if (/\bseremos tres\b|\bseremos 3\b|\bp3\b|\bterceira pessoa\b|\bmais uma pessoa\b/.test(text)) return "sim";
  const familyCount = (text.match(FAMILY_MEMBER_PATTERN) || []).length;
  if (familyCount >= 2) return "sim";
  return null;
}

function buildSlot(value, confidence, evidence, source = "message_text") {
  return { value, confidence, evidence, source };
}

function clampConfidence(value, fallback = 0.5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, Number(numeric.toFixed(2))));
}

function sanitizeReplyText(value) {
  return REPLY_TEXT_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    repairTextEncoding(value)
  )
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

function humanizeSlotName(slot) {
  const safe = String(slot || "").trim();
  if (!safe) return "informação pendente";
  return SLOT_LABELS[safe] || safe.replace(/_/g, " ");
}

function buildSlotActionPrompt(slot) {
  const safe = String(slot || "").trim();
  return SLOT_ACTION_PROMPTS[safe] || `Me confirma primeiro a informação de ${humanizeSlotName(safe)}?`;
}

function getKnownSlotValue(knownSlots, slotName) {
  const value = knownSlots?.[slotName];
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "value")) {
    return value.value;
  }
  return value;
}

function hasApprovedCorrespondenteStatus(value) {
  return ["aprovado", "aprovada", "sim", "aprovado_condicionado"].includes(normalizeText(value));
}

function hasAguardandoCorrespondenteStatus(value) {
  return ["aguardando", "em_analise", "aguardando_retorno", "enviado", "em_analise_correspondente"].includes(normalizeText(value));
}

function hasReprovadoCorrespondenteStatus(value) {
  return ["reprovado", "reprovada", "nao_aprovado", "nao_aprovada", "reprovado_correspondente"].includes(normalizeText(value));
}

function hasComplementoCorrespondenteStatus(value) {
  return ["complemento", "complemento_pos_analise", "pendencia_complementar", "docs_complementares", "adjustment_required"].includes(normalizeText(value));
}

function isDocsContext(request, pendingSlots) {
  const stage = normalizeText(request?.current_stage);
  const pending = Array.isArray(pendingSlots) ? pendingSlots.map((slot) => normalizeText(slot)) : [];
  return DOCS_STAGE_PATTERN.test(stage) || DOCS_HINT_PATTERN.test(request?.message_text) || pending.includes("docs");
}

function isCorrespondenteContext(request, pendingSlots) {
  const stage = normalizeText(request?.current_stage);
  const pending = Array.isArray(pendingSlots) ? pendingSlots.map((slot) => normalizeText(slot)) : [];
  return CORRESPONDENTE_STAGE_PATTERN.test(stage) || CORRESPONDENTE_HINT_PATTERN.test(request?.message_text) || pending.includes("correspondente");
}

function isVisitaContext(request, suggestedNextSlot, pendingSlots) {
  const stage = normalizeText(request?.current_stage);
  const nextSlot = normalizeText(suggestedNextSlot);
  const pending = Array.isArray(pendingSlots) ? pendingSlots.map((slot) => normalizeText(slot)) : [];
  return VISITA_STAGE_PATTERN.test(stage) || VISITA_HINT_PATTERN.test(request?.message_text) || nextSlot === "visita" || pending.includes("visita");
}

function isAluguelContext(request) {
  return ALUGUEL_HINT_PATTERN.test(String(request?.message_text || ""));
}

function isUnknownDocTypeContext(request) {
  const knownSlots = request?.known_slots || {};
  return (
    normalizeText(getKnownSlotValue(knownSlots, "doc_tipo_incerto")) === "sim" ||
    normalizeText(getKnownSlotValue(knownSlots, "aguardando_confirmacao_tipo_doc")) === "sim"
  );
}

function buildUnknownDocTypeGuidance(request) {
  const normalizedMessage = normalizeText(request?.message_text);
  if (DOC_TIPO_RESPOSTA_PATTERN.test(normalizedMessage)) {
    return "Perfeito, anotei aqui. Vou considerar esse documento no seu checklist e seguimos com os próximos itens.";
  }
  return "Recebi seu arquivo aqui, mas não consegui identificar com segurança qual documento ele é. Você pode me dizer se isso é holerite, comprovante de residência, CTPS, documento pessoal ou outro arquivo?";
}

function isDocForaDeOrdemContext(request) {
  const knownSlots = request?.known_slots || {};
  return normalizeText(getKnownSlotValue(knownSlots, "doc_fora_de_ordem")) === "sim";
}

function buildDocForaDeOrdemGuidance(request) {
  const knownSlots = request?.known_slots || {};
  const docRecebido = getKnownSlotValue(knownSlots, "doc_tipo_recebido") || "documento";
  const pendienciaPrincipal = getKnownSlotValue(knownSlots, "doc_pendencia_principal") || null;
  const recebimento = `Recebi o ${docRecebido} que você enviou — ele será útil mais adiante.`;
  if (pendienciaPrincipal) {
    return `${recebimento} Para seguirmos no trilho correto agora, preciso que você me envie o ${pendienciaPrincipal}.`;
  }
  return `${recebimento} Para seguirmos no trilho correto, me manda agora o documento que está como pendência principal do seu checklist.`;
}

function isAutonomoContext(request, pendingSlots) {
  const stage = normalizeText(request?.current_stage);
  const regime = normalizeText(getKnownSlotValue(request?.known_slots || {}, "regime_trabalho"));
  const pending = Array.isArray(pendingSlots) ? pendingSlots.map((slot) => normalizeText(slot)) : [];
  return AUTONOMO_HINT_PATTERN.test(String(request?.message_text || "")) || regime === "autonomo" || stage.includes("autonomo") || pending.includes("ir_declarado");
}

function isDependenteContext(request, pendingSlots) {
  const stage = normalizeText(request?.current_stage);
  const pending = Array.isArray(pendingSlots) ? pendingSlots.map((slot) => normalizeText(slot)) : [];
  return DEPENDENTE_HINT_PATTERN.test(String(request?.message_text || "")) || stage.includes("dependente") || pending.includes("dependente");
}

function isCtps36Context(request, pendingSlots) {
  const stage = normalizeText(request?.current_stage);
  const pending = Array.isArray(pendingSlots) ? pendingSlots.map((slot) => normalizeText(slot)) : [];
  return CTPS_36_HINT_PATTERN.test(String(request?.message_text || "")) || stage.includes("ctps") || pending.includes("ctps");
}

function isReprovacaoContext(request, pendingSlots) {
  const stage = normalizeText(request?.current_stage);
  const pending = Array.isArray(pendingSlots) ? pendingSlots.map((slot) => normalizeText(slot)) : [];
  return REPROVACAO_HINT_PATTERN.test(String(request?.message_text || "")) || stage.includes("reprov") || pending.includes("restricao");
}

function isEstadoCivilComposicaoContext(request, pendingSlots) {
  const stage = normalizeText(request?.current_stage);
  const pending = Array.isArray(pendingSlots) ? pendingSlots.map((slot) => normalizeText(slot)) : [];
  return (
    ESTADO_CIVIL_COMPOSICAO_HINT_PATTERN.test(String(request?.message_text || "")) ||
    stage.includes("estado_civil") ||
    pending.includes("estado_civil") ||
    pending.includes("composicao")
  );
}

function isTopoFunilContext(request) {
  return TOPO_FUNIL_STAGES.has(normalizeText(request?.current_stage));
}

function isComposicaoInicialContext(request) {
  return COMPOSICAO_INICIAL_STAGES.has(normalizeText(request?.current_stage));
}

function isRendaTrabalhoContext(request) {
  return RENDA_TRABALHO_STAGES.has(normalizeText(request?.current_stage));
}

function isAprofundamentoRendaContext(request) {
  return APROFUNDAMENTO_RENDA_STAGES.has(normalizeText(request?.current_stage));
}

function isParceiroRendaContext(request) {
  return PARCEIRO_RENDA_STAGES.has(normalizeText(request?.current_stage));
}

function isFamiliarRendaContext(request) {
  return FAMILIAR_RENDA_STAGES.has(normalizeText(request?.current_stage));
}

function isP3RendaContext(request) {
  return P3_RENDA_STAGES.has(normalizeText(request?.current_stage));
}

function isGateFinaisContext(request) {
  return GATE_FINAIS_STAGES.has(normalizeText(request?.current_stage));
}

function isOperacionalFinalContext(request) {
  return OPERACIONAL_FINAL_STAGES.has(normalizeText(request?.current_stage));
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getRendaPrincipal(knownSlots, fallbackFromText) {
  const candidate =
    getKnownSlotValue(knownSlots, "renda_formal") ??
    getKnownSlotValue(knownSlots, "renda_principal") ??
    getKnownSlotValue(knownSlots, "renda");
  return toNumber(candidate) ?? toNumber(fallbackFromText);
}

function getFollowupAttempts(knownSlots) {
  const candidate =
    getKnownSlotValue(knownSlots, "docs_followup_tentativas") ??
    getKnownSlotValue(knownSlots, "tentativas_followup_docs") ??
    getKnownSlotValue(knownSlots, "followup_tentativas");
  return toNumber(candidate) ?? 0;
}

function getVisitaSlotStatus(knownSlots) {
  const raw = normalizeText(getKnownSlotValue(knownSlots, "visita"));
  if (["confirmada", "aceita", "agendada"].includes(raw)) return "confirmada";
  if (raw === "convite") return "convite";
  return null;
}

function hasVariableIncomeForHolerite(knownSlots, normalizedMessage) {
  const candidateKeys = [
    "renda_variavel",
    "variacao_renda",
    "salario_variavel",
    "comissao",
    "hora_extra",
    "adicional",
    "tem_variacao_renda"
  ];
  const slotSignalsVariable = candidateKeys.some((key) => normalizeText(getKnownSlotValue(knownSlots, key)) === "sim");
  if (slotSignalsVariable) return true;
  const messageText = String(normalizedMessage || "");
  const negatesVariation =
    /\bsem (comissao|comissão|hora extra|horas extras|adicional|bonus|b[oô]nus|variacao|varia[cç][aã]o)\b|\bn[aã]o tenho (comissao|comissão|hora extra|horas extras|adicional|bonus|b[oô]nus|variacao|varia[cç][aã]o)\b/.test(
    messageText
  );
  if (negatesVariation) return false;
  return HOLERITE_VARIATION_PATTERN.test(messageText);
}

function buildDocsParticipantStatusGuidance(knownSlots) {
  const recebidoTitular = getKnownSlotValue(knownSlots, "docs_recebidos_titular");
  const pendentesTitular = getKnownSlotValue(knownSlots, "docs_pendentes_titular");
  const recebidoParceiro = getKnownSlotValue(knownSlots, "docs_recebidos_parceiro");
  const pendentesParceiro = getKnownSlotValue(knownSlots, "docs_pendentes_parceiro");
  const recebidoFamiliar = getKnownSlotValue(knownSlots, "docs_recebidos_familiar");
  const pendentesFamiliar = getKnownSlotValue(knownSlots, "docs_pendentes_familiar");

  const hasParticipantData =
    recebidoTitular || pendentesTitular || recebidoParceiro || pendentesParceiro || recebidoFamiliar || pendentesFamiliar;
  if (!hasParticipantData) return null;

  const parts = [];
  if (recebidoTitular) parts.push(`Recebi ${recebidoTitular} do titular.`);
  if (pendentesTitular) parts.push(`Agora falta ${pendentesTitular} do titular.`);
  if (recebidoParceiro) parts.push(`Recebi ${recebidoParceiro} do parceiro.`);
  if (pendentesParceiro) parts.push(`Agora falta ${pendentesParceiro} do parceiro.`);
  if (recebidoFamiliar) parts.push(`Recebi ${recebidoFamiliar} do familiar.`);
  if (pendentesFamiliar) parts.push(`Agora falta ${pendentesFamiliar} do familiar.`);
  return parts.join(" ");
}

function buildDocsGuidanceByProfile(request) {
  const normalizedMessage = normalizeText(request?.message_text);
  const knownSlots = request?.known_slots || {};

  const participantStatusGuidance = buildDocsParticipantStatusGuidance(knownSlots);
  if (participantStatusGuidance) return participantStatusGuidance;

  // Etapa 5 — global layer: FAQ/objeção/KB + reancoragem para perguntas sobre docs
  const stage = normalizeText(request?.current_stage);
  const globalReply = resolveGlobalLayerReply(normalizedMessage, _DOCS_FAQ_MAP);
  if (globalReply) return wrapWithReanchor(globalReply.reply, stage || "envio_docs");

  const composicao = normalizeText(getKnownSlotValue(knownSlots, "composicao"));
  const regime = normalizeText(getKnownSlotValue(knownSlots, "regime_trabalho"));
  const irDeclarado = normalizeText(getKnownSlotValue(knownSlots, "ir_declarado"));
  const ctps = normalizeText(getKnownSlotValue(knownSlots, "ctps"));
  const regimeExtra = normalizeText(getKnownSlotValue(knownSlots, "regime_trabalho_extra"));
  const regimeParceiro = normalizeText(getKnownSlotValue(knownSlots, "regime_trabalho_parceiro"));
  const regimeFamiliar = normalizeText(getKnownSlotValue(knownSlots, "regime_trabalho_familiar"));
  const regimeP3 = normalizeText(getKnownSlotValue(knownSlots, "regime_trabalho_p3"));
  const familiarSlot = normalizeText(getKnownSlotValue(knownSlots, "familiar"));
  const multiRenda = normalizeText(getKnownSlotValue(knownSlots, "multi_renda")) === "sim" || /\bmulti renda|renda extra|segunda renda|bico|uber|taxa\b/.test(normalizedMessage);
  const rendaPrincipal = getRendaPrincipal(knownSlots, detectMoney(request?.message_text));
  const holeriteVariavel = hasVariableIncomeForHolerite(knownSlots, normalizedMessage);
  const asksHoleriteQuantity = /\bquantos?\b.*\bholerite\b|\bholerite\b.*\bquantos?\b/.test(normalizedMessage);
  const docs = ["RG ou CNH com CPF", "comprovante de residência atualizado"];

  if (regime === "clt") {
    docs.push(holeriteVariavel ? "os últimos 3 holerites (renda com variação)" : "somente o último holerite (salário fixo)");
    docs.push(ctps === "nao" ? "NÃO CONFIRMADO: validar documento equivalente de vínculo formal no plantão" : "CTPS (foto da identificação e vínculo atual)");
  } else if (regime === "autonomo") {
    if (irDeclarado === "sim") {
      docs.push("declaração de IR");
      docs.push("recibo de entrega da declaração");
    } else {
      docs.push("os últimos 6 extratos bancários recentes de movimentação bancária");
      docs.push("NÃO CONFIRMADO: validar comprovantes complementares da atividade no plantão, se necessário");
    }
  } else if (regime === "servidor" || regime === "aposentado") {
    docs.push("comprovante de renda recente do benefício/remuneração");
  } else {
    docs.push("comprovante de renda mais recente conforme seu perfil");
  }

  if (composicao === "parceiro") {
    docs.push("documentos pessoais e de renda do parceiro na composição");
  }
  if (composicao === "familiar") {
    docs.push("documentos pessoais e de renda do familiar na composição");
  }
  if (familiarSlot && composicao !== "familiar") {
    docs.push("documentos pessoais e de renda do familiar na composição");
  }
  if (normalizeText(getKnownSlotValue(knownSlots, "p3")) === "sim") {
    docs.push("documentos pessoais e de renda da terceira pessoa (P3) na composição");
  }

  const rendaExtraNaComposicao =
    normalizeText(getKnownSlotValue(knownSlots, "renda_extra_na_composicao")) === "sim" ||
    /\brenda extra.*compos|compos.*renda extra|entra na composicao|entrar na composicao|usar renda extra\b/.test(normalizedMessage);
  const formalPrincipal = regime === "clt" || regime === "servidor" || regime === "aposentado";
  const formalAbaixo2550 = formalPrincipal && Number.isFinite(rendaPrincipal) && rendaPrincipal < 2550;
  const formalAcima2550 = formalPrincipal && Number.isFinite(rendaPrincipal) && rendaPrincipal >= 2550;

  if (multiRenda && rendaExtraNaComposicao) {
    docs.push("comprovação da renda extra usada na composição");
    docs.push("NÃO CONFIRMADO: validar no plantão o comprovante específico aceito pelo banco para a renda extra");
  }

  const regimesEnvolvidos = [regime, regimeExtra, regimeParceiro, regimeFamiliar, regimeP3].filter(Boolean);
  const multiRegime = new Set(regimesEnvolvidos).size > 1;
  if (multiRenda && multiRegime) {
    docs.push("comprovantes de renda de todos os regimes envolvidos na composição");
  }

  if (formalPrincipal && multiRenda) {
    if (formalAbaixo2550) {
      docs.push("extratos bancários recentes para comprovar movimentação da renda extra");
    } else if (formalAcima2550) {
      docs.push("se a renda formal principal ficar acima de 2550, a soma da renda extra pode ser dispensada na estratégia");
    }
  }

  docs.push("NÃO CONFIRMADO: validar lista documental fina por regime/renda no plantão");
  if (/\brg\b|\bcnh\b|\bcpf\b/.test(normalizedMessage)) {
    docs.push("NÃO CONFIRMADO: validar no plantão a combinação de RG/CNH/CPF aceita pelo banco para o seu caso");
  }
  if (/comprovante de residencia|comprovante de residência/.test(normalizedMessage)) {
    docs.push("NÃO CONFIRMADO: validar no plantão os comprovantes de residência aceitos e o prazo de emissão");
  }

  let channelNote = "";
  if (/\b(site|portal)\b/.test(normalizedMessage)) {
    channelNote = "Perfeito, se preferir pode enviar pelo site com tranquilidade que seguimos por lá.";
  } else if (REMOTE_REFUSAL_PATTERN.test(normalizedMessage)) {
    channelNote = "Sem problema, no presencial também conseguimos conferir tudo com você com calma.";
  }

  let doubtNote = "";
  if (asksHoleriteQuantity) {
    if (regime === "clt" && holeriteVariavel) {
      doubtNote = "Sobre holerite: como sua renda tem variação (comissão/hora extra/adicional), eu peço os 3 últimos.";
    } else if (regime === "clt") {
      doubtNote = "Sobre holerite: com salário fixo, eu peço somente o último.";
    } else {
      doubtNote = "No holerite funciona assim: salário fixo pede somente o último, e renda com variação pede os 3 últimos.";
    }
  } else if (DOCS_HINT_PATTERN.test(normalizedMessage)) {
    doubtNote = "Se quiser, eu também posso te explicar rapidinho o que entra em RG, CPF, holerite, extrato, CTPS, IR ou comprovante de residência.";
  }

  let autonomoIrNote = "";
  if (regime === "autonomo" && irDeclarado === "nao") {
    autonomoIrNote =
      "Até 29 de maio ainda dá para declarar IR e formalizar sua renda. Se preferir não declarar agora, a alternativa é composição com alguém próximo.";
  }

  let empathyNote = "";
  if (FEAR_PATTERN.test(normalizedMessage)) {
    empathyNote = "Entendo sua preocupação, e dá para fazer isso com calma e segurança.";
  }

  let deferNote = "";
  if (DEFER_ACTION_PATTERN.test(normalizedMessage) || NO_TIME_PATTERN.test(normalizedMessage)) {
    // Gentle urgency nudge when user defers sending documents
    deferNote = "Quanto antes você me enviar os documentos, mais rápido consigo adiantar sua análise.";
  }

  return [
    empathyNote,
    `Pelo seu perfil, para adiantar sua análise, o ideal é separar ${humanJoinList(docs)}.`,
    autonomoIrNote,
    doubtNote,
    channelNote,
    deferNote
  ]
    .filter(Boolean)
    .join(" ");
}

function buildCorrespondenteReprovacaoGuidance(request, knownSlots) {
  const normalizedMessage = normalizeText(request?.message_text);
  const motivoSlot = normalizeText(getKnownSlotValue(knownSlots, "motivo_reprovacao"));

  const hasScrBacen =
    /^scr[_-]?bacen$/.test(motivoSlot) || /^scr$/.test(motivoSlot) || /^bacen$/.test(motivoSlot) ||
    /\bscr\b|\bbacen\b|\bregistrato\b/.test(normalizedMessage);
  const hasSinadConres =
    /^sinad[_-]?conres$/.test(motivoSlot) || /^sinad$/.test(motivoSlot) || /^conres$/.test(motivoSlot) ||
    /\bsinad\b|\bconres\b/.test(normalizedMessage);
  const hasComprometimento =
    /comprometimento/.test(motivoSlot) ||
    /\bcomprometimento\b/.test(normalizedMessage) ||
    /\bemprestimo\b|\bempr[eé]stimo\b/.test(normalizedMessage);

  if (hasScrBacen) {
    return "O correspondente identificou uma restrição em SCR/BACEN que impediu o avanço do processo. O caminho é consultar o Registrato, levantar os extratos dos últimos 6 meses e, se necessário, regularizar antes de tentar uma nova análise.";
  }
  if (hasSinadConres) {
    return "Houve uma pendência em SINAD ou CONRES que bloqueou o processo no correspondente. Para resolver, o caminho é ir a uma agência da Caixa e conversar diretamente com o gerente de pessoa física.";
  }
  if (hasComprometimento) {
    return "O correspondente identificou comprometimento de renda acima do limite permitido pela Caixa — que é de 30% da renda. Uma alternativa possível é ajuste de entrada, composição de renda com alguém próximo ou reorganização das parcelas existentes.";
  }

  return "Infelizmente o processo não conseguiu avançar nesta análise do correspondente. Assim que houver mais detalhes ou orientação sobre os próximos passos, eu te oriento por aqui.";
}

function buildComplementoPosAnaliseGuidance(request, knownSlots) {
  const docComplementar =
    getKnownSlotValue(knownSlots, "docs_complementares_banco") ||
    getKnownSlotValue(knownSlots, "pendencia_complementar") ||
    getKnownSlotValue(knownSlots, "item_pendente_correspondente");

  if (docComplementar) {
    return `O correspondente pediu um complemento para seguir com a análise: ${docComplementar}. Isso não reinicia o processo — ele continua em análise, e esse item é o que falta para seguirmos.`;
  }
  return "O correspondente pediu um complemento para seguir com a análise. Me confirma qual documento ou informação está sendo solicitada para eu te orientar no envio correto.";
}

function buildCorrespondenteGuidance(request) {
  const normalizedMessage = normalizeText(request?.message_text);
  const knownSlots = request?.known_slots || {};
  const correspondenteSlot = normalizeText(getKnownSlotValue(knownSlots, "correspondente"));
  const retornoStatus = normalizeText(getKnownSlotValue(knownSlots, "retorno_correspondente_status"));
  const currentStage = normalizeText(request?.current_stage);

  const approved = hasApprovedCorrespondenteStatus(correspondenteSlot) || hasApprovedCorrespondenteStatus(retornoStatus);
  const reprovado = hasReprovadoCorrespondenteStatus(correspondenteSlot) || hasReprovadoCorrespondenteStatus(retornoStatus);
  const aguardando =
    hasAguardandoCorrespondenteStatus(correspondenteSlot) ||
    hasAguardandoCorrespondenteStatus(retornoStatus) ||
    /aguardando_retorno_correspondente/.test(currentStage);
  const complemento =
    hasComplementoCorrespondenteStatus(retornoStatus) ||
    Boolean(getKnownSlotValue(knownSlots, "pendencia_complementar")) ||
    Boolean(getKnownSlotValue(knownSlots, "docs_complementares_banco"));
  const insistsFinancial = FINANCIAL_DETAILS_PATTERN.test(normalizedMessage) || APPROVAL_PROOF_PATTERN.test(normalizedMessage);

  if (reprovado) {
    return buildCorrespondenteReprovacaoGuidance(request, knownSlots);
  }

  if (complemento) {
    return buildComplementoPosAnaliseGuidance(request, knownSlots);
  }

  if (aguardando) {
    return "Seu processo já foi encaminhado para análise. Esse trâmite leva um tempo, e eu sigo acompanhando aqui. Assim que houver qualquer retorno — aprovação, pedido de complemento ou próxima orientação — eu te aviso.";
  }

  if (approved) {
    if (insistsFinancial || APPROVAL_HINT_PATTERN.test(normalizedMessage)) {
      return "Queria muito conseguir te abrir isso por aqui, mas eu realmente não tenho acesso ao sistema de aprovação. O que chegou para mim foi só a informação de que houve aprovação, e os detalhes de financiamento, taxas, subsídios e poder de compra são tratados presencialmente com o corretor Vasques no plantão.";
    }
    return "Recebemos o retorno de aprovação, e agora essa parte de financiamento, taxas, subsídios e poder de compra é tratada presencialmente com o corretor Vasques no plantão.";
  }

  return "Entendo sua ansiedade, de verdade, e sigo acompanhando com você. Enquanto não houver retorno do correspondente, eu ainda não consigo confirmar aprovação.";
}

function buildVisitaGuidance(request) {
  const normalizedMessage = normalizeText(request?.message_text);
  const knownSlots = request?.known_slots || {};
  const stage = normalizeText(request?.current_stage);
  const followupAttempts = getFollowupAttempts(knownSlots);
  const recusouOnline =
    REMOTE_REFUSAL_PATTERN.test(normalizedMessage) ||
    /\bnao enviar online|não enviar online|nao mando online|não mando online|nao vou mandar docs online|não vou mandar docs online\b/.test(normalizedMessage);

  if (recusouOnline && followupAttempts >= 2) {
    return "Sem problema em não enviar online. Como já tentamos esse follow-up algumas vezes, te convido para o plantão com os documentos do seu perfil. Para evitar perda de tempo sua e do corretor, me confirma se existe mais alguém com poder de decisão para já participarem todos da visita.";
  }

  if (stage === "finalizacao_processo") {
    return "Tudo certo até aqui. O próximo passo é formalizar sua proposta com o corretor e seguir para o trâmite de contrato. Me confirma se ficou tudo alinhado no plantão ou se tem alguma dúvida para fechar.";
  }

  const visitaStatus = getVisitaSlotStatus(knownSlots);
  const visitaConfirmada = stage === "visita_confirmada" || visitaStatus === "confirmada";
  const visitaConvite = visitaStatus === "convite";

  if (VISITA_RESCHEDULE_PATTERN.test(normalizedMessage)) {
    if (visitaConfirmada) {
      return "Sem problema, a gente remarca dentro da agenda oficial do plantão. Me confirma qual dia e horário funciona melhor para você que eu já te passo as opções disponíveis.";
    }
    return "Claro, a gente consegue remarcar dentro dos dias e horários oficiais do plantão, sem perder a organização do seu atendimento.";
  }
  if (VISITA_RESIST_PATTERN.test(normalizedMessage)) {
    return "Eu entendo. A visita é o momento de te mostrar o processo com mais clareza, tirar dúvidas com segurança e alinhar tudo sem criar expectativa errada pelo WhatsApp.";
  }
  if (VISITA_ACCEPT_PATTERN.test(normalizedMessage)) {
    return "Perfeito, faz sentido avançar por aqui. Já te conduzo pelas opções oficiais de agenda.";
  }

  // Etapa 5 — global layer: FAQ/objeção/KB + reancoragem para perguntas sobre visita
  const globalReply = resolveGlobalLayerReply(normalizedMessage, _VISITA_FAQ_MAP);
  if (globalReply) return wrapWithReanchor(globalReply.reply, stage || "agendamento_visita");

  if (/\bescolher im[oó]vel|unidade|empreendimento|apartamento espec[ií]fico|casa espec[ií]fica\b/.test(normalizedMessage)) {
    return "Para não te gerar expectativa errada, escolha de unidade, imóvel e disponibilidade é alinhada presencialmente no plantão com o corretor.";
  }

  if (VISITA_ESFRIAMENTO_PATTERN.test(normalizedMessage) || AMBIGUOUS_HINTS.test(normalizedMessage) || DEFER_ACTION_PATTERN.test(normalizedMessage)) {
    if (visitaConfirmada) {
      return "Entendi. Você já tem a visita encaminhada, que é o passo certo agora. Me confirma se mantém a data ou prefere remarcar para outro horário.";
    }
    if (visitaConvite) {
      return "Queria só confirmar com você sobre a visita que conversamos. É um passo direto, sem compromisso de fechar nada no dia. Me confirma se quer reservar um horário ou prefere retomar online.";
    }
    return "Visitar não é compromisso de fechar nada no dia. É o momento de entender as opções reais do seu perfil sem criar expectativa errada pelo WhatsApp. Me confirma se quer avançar com a visita ou prefere continuar por aqui.";
  }

  if (visitaConfirmada) {
    return "Você já tem a visita encaminhada, que é o passo certo para entender seu caminho com segurança. Me confirma se consegue comparecer ou precisa remarcar.";
  }

  return "A visita ajuda você a avançar com segurança, dentro da agenda oficial do plantão e sem quebrar o trilho do processo.";
}

function buildOperacionalFinalGuidance(request) {
  const stage = normalizeText(request?.current_stage);
  const normalizedMessage = normalizeText(request?.message_text);

  if (stage === "envio_docs") {
    // When the profile (regime) is already known, delegate to buildDocsGuidanceByProfile
    // so the response includes the full doc list + empathy/defer/channel notes
    const knownSlots = request?.known_slots || {};
    const regime = normalizeText(getKnownSlotValue(knownSlots, "regime_trabalho"));
    if (regime) return null;

    // Etapa 5 — global layer: FAQ/objeção/KB + reancoragem para docs
    const globalReply = resolveGlobalLayerReply(normalizedMessage, _DOCS_FAQ_MAP);
    if (globalReply) return wrapWithReanchor(globalReply.reply, stage);

    if (DEFER_ACTION_PATTERN.test(normalizedMessage) || NO_TIME_PATTERN.test(normalizedMessage)) {
      return "Sem problema. Sempre que puder, me manda os documentos por aqui que eu adianto sua análise.";
    }
    if (/\b(site|portal)\b/.test(normalizedMessage)) {
      return "Perfeito, pode enviar pelo site com tranquilidade que seguimos por lá.";
    }
    return null;
  }

  if (stage === "aguardando_retorno_correspondente") {
    if (/\bquanto tempo\b|\bdemora\b|\btempo\b|\bprazo\b|\bquando\b/.test(normalizedMessage)) {
      return "Não tenho como informar prazo exato — o retorno depende da análise do correspondente. Sigo acompanhando e te aviso assim que houver novidade.";
    }
    if (/\bj[aá]\s*teve\b|\bj[aá]\s*voltou\b|\bj[aá]\s*respondeu\b|\bj[aá]\s*tem\b|\bresposta\b|\bretornou\b/.test(normalizedMessage)) {
      return "Ainda estou aguardando o retorno. Assim que chegar qualquer informação, eu te aviso aqui.";
    }
    if (/\be agora\b|\bo que\s*fa[cç]o\b|\bo que\s*acontece\b|\bpr[oó]ximo\b/.test(normalizedMessage)) {
      return "Por enquanto, o processo está em análise com o correspondente. Não precisa fazer nada agora — eu te aviso quando houver retorno.";
    }
    return null;
  }

  if (stage === "agendamento_visita") {
    // Etapa 5 — global layer: FAQ/objeção/KB + reancoragem para visita
    const globalReply = resolveGlobalLayerReply(normalizedMessage, _VISITA_FAQ_MAP);
    if (globalReply) return wrapWithReanchor(globalReply.reply, stage);

    // Reschedule requests (remarcar/reagendar/outro dia/outro horário) defer to buildVisitaGuidance
    // which produces the canonical "a gente consegue remarcar" response
    if (/\bprecisa levar\b|\bvir acompanhaad\b|\bvir com\b|\blevar algu[eé]m\b|\bacompanhante\b/.test(normalizedMessage)) {
      return "Para aproveitar melhor a visita, recomendo que venha com quem vai participar da decisão. Isso facilita o alinhamento no plantão.";
    }
    if (DEFER_ACTION_PATTERN.test(normalizedMessage) || VISITA_ESFRIAMENTO_PATTERN.test(normalizedMessage)) {
      return "Sem pressa. Quando estiver pronto, me confirma que eu verifico as opções disponíveis na agenda oficial do plantão.";
    }
    return null;
  }

  if (stage === "finalizacao_processo") {
    if (/\bo que\s*acontece\b|\bpr[oó]ximo\s*passo\b|\bo que\s*vem\b|\bo que\s*segue\b/.test(normalizedMessage)) {
      return "O processo segue para as etapas finais de formalização. Assim que houver orientação concreta, eu te informo por aqui.";
    }
    if (/\bvoc[eê]s?\s*me\s*avis[ao]\b|\bme\s*avis[ao]\b|\bserei\s*avisad\b|\bvou\s*saber\b/.test(normalizedMessage)) {
      return "Sim, qualquer movimentação no processo eu te comunico por aqui.";
    }
    if (/\bacabou\b|\btermin[ao]u\b|\bfoi\b|\bencerr[ao]u\b|\btudob[eê]m\b/.test(normalizedMessage)) {
      return "Chegamos ao fim desta etapa. O processo segue pelo trilho correto e eu te mantenho informado sobre qualquer próximo passo.";
    }
    return null;
  }

  return null;
}

function buildAluguelGuidance() {
  return "Hoje a Enova não trabalha com aluguel. Mas vale um ponto importante: no aluguel você já paga uma parcela todo mês para o imóvel de outra pessoa. Aqui a ideia é transformar esse mesmo esforço em financiamento do seu próprio imóvel, com estratégia segura para o seu perfil.";
}

function buildAutonomoGuidance(request) {
  const normalizedMessage = normalizeText(request?.message_text);
  const knownSlots = request?.known_slots || {};
  const regime = normalizeText(getKnownSlotValue(knownSlots, "regime_trabalho")) || (AUTONOMO_HINT_PATTERN.test(normalizedMessage) ? "autonomo" : "");
  const irDeclarado = normalizeText(getKnownSlotValue(knownSlots, "ir_declarado")) || detectIr(normalizedMessage);
  const rendaPrincipal = getRendaPrincipal(knownSlots, detectMoney(request?.message_text));

  if (regime !== "autonomo") return null;
  if (irDeclarado === "sim") {
    if (Number.isFinite(rendaPrincipal) && rendaPrincipal < 3000) {
      return "Perfeito, com IR sua renda já entra como formal. Como sua renda formal está abaixo de 3 mil, vale muito a pena compor com alguém próximo para ganhar força na análise.";
    }
    return "Perfeito, autônomo com IR entra como renda formal e já ajuda bastante na estratégia do seu atendimento.";
  }

  if (irDeclarado === "nao") {
    const composeSnippet =
      Number.isFinite(rendaPrincipal) && rendaPrincipal < 3000
        ? "Como sua renda formal está abaixo de 3 mil, recomendo composição com alguém próximo."
        : "Se você preferir não declarar agora, a alternativa é compor renda com alguém próximo.";
    return `Entendi. Até 29 de maio ainda dá para declarar IR e formalizar sua renda. ${composeSnippet}`;
  }

  return null;
}

function buildDependenteGuidance(request) {
  const knownSlots = request?.known_slots || {};
  const composicao = normalizeText(getKnownSlotValue(knownSlots, "composicao"));
  const rendaPrincipal = getRendaPrincipal(knownSlots, detectMoney(request?.message_text));
  const emConjunto = ["parceiro", "familiar"].includes(composicao) || normalizeText(getKnownSlotValue(knownSlots, "p3")) === "sim";

  if (emConjunto) {
    return "Como o processo está em composição conjunta, nessa lógica a etapa de dependente pode ser pulada para seguirmos mais objetivos.";
  }
  if (Number.isFinite(rendaPrincipal) && rendaPrincipal > 4000) {
    return "Com processo solo e renda formal acima de 4 mil, nessa lógica podemos pular dependente e seguir para o próximo ponto.";
  }
  return "No seu processo solo com renda formal abaixo de 4 mil, me confirma se você tem filho menor de 18 anos ou dependente sem renda até terceiro grau.";
}

function buildCtps36Guidance() {
  return "Me confirma uma coisa: você soma 36 meses de registro em CTPS, contando vínculos do primeiro até o atual/último? Quando isso acontece, pode reduzir taxa de juros e, com custo menor para o banco, aumentar seu valor financiado.";
}

function buildReprovacaoGuidance(request) {
  const normalizedMessage = normalizeText(request?.message_text);
  if (/\bscr\b|\bbacen\b|\bregistrato\b/.test(normalizedMessage)) {
    return "Quando a reprovação vem por SCR/BACEN, o melhor caminho é consultar o Registrato, trazer extrato dos últimos 6 meses e a gente te ajuda a interpretar e orientar os próximos passos.";
  }
  if (/\bsinad\b|\bconres\b/.test(normalizedMessage)) {
    return "Quando aparece SINAD ou CONRES, a orientação é procurar uma agência da Caixa e falar com o gerente de pessoa física para obter mais detalhes.";
  }
  if (/\bcomprometimento\b|\bemprestimo\b|\bempr[eé]stimo\b/.test(normalizedMessage)) {
    return "Nesse caso é comprometimento de renda: pelas regras da Caixa, não pode haver empréstimo ou financiamento puxando a parcela, e o limite de comprometimento é 30% da renda.";
  }
  if (/\breprovad/.test(normalizedMessage)) {
    return "Entendi sua reprovação. Eu te explico o motivo de forma clara por aqui, sem expor valores do correspondente, e te oriento no próximo passo dentro do trilho.";
  }
  return "Se houver restrição, seguimos o trilho normal: identificar a natureza da restrição, orientar o caminho certo e avançar com segurança.";
}

function buildEstadoCivilComposicaoGuidance(request) {
  const normalizedMessage = normalizeText(request?.message_text);
  const knownSlots = request?.known_slots || {};
  const estadoCivil = normalizeText(getKnownSlotValue(knownSlots, "estado_civil"));
  const composicao = normalizeText(getKnownSlotValue(knownSlots, "composicao"));
  const hasRestricao = /\brestri[cç][aã]o\b/.test(normalizedMessage) || /\brestri[cç][aã]o\b/.test(normalizeText(getKnownSlotValue(knownSlots, "restricao")));

  if (MORA_JUNTO_PATTERN.test(normalizedMessage)) {
    if (SEM_UNIAO_ESTAVEL_PATTERN.test(normalizedMessage)) {
      return "Quando moram juntos sem união estável formal, pode seguir solo ou em conjunto, conforme estratégia de aprovação.";
    }
    if (!EXPLICIT_UNIAO_ESTAVEL_PATTERN.test(normalizedMessage)) {
      return "Quando vocês moram juntos, isso por si só não define união estável. O processo pode seguir solo ou em conjunto, conforme a melhor estratégia.";
    }
  }
  if (EXPLICIT_UNIAO_ESTAVEL_PATTERN.test(normalizedMessage) || estadoCivil === "uniao_estavel") {
    const mode = composicao && composicao !== "sozinho" ? "em conjunto" : "solo";
    return `Na união estável, não há reclassificação automática de estado civil e o processo pode seguir ${mode} ou em conjunto, conforme a melhor estratégia.`;
  }
  if (/\bcasad[oa]\b/.test(normalizedMessage) || estadoCivil === "casado_civil") {
    if (hasRestricao) {
      return "No casamento civil, o processo é sempre em conjunto. Regularizar restrição é importante, mas isso não impede tentar avaliação com o banco no fluxo normal.";
    }
    return "No casamento civil, o processo segue sempre em conjunto para avaliação do banco.";
  }
  return null;
}

function buildComposicaoInicialGuidance(request) {
  const stage = normalizeText(request?.current_stage);
  const normalizedMessage = normalizeText(request?.message_text);

  if (stage === "somar_renda_solteiro") {
    if (/\b(posso tentar sozinho|ir sozinho|sem somar|so eu|só eu|so a minha|só a minha)\b/i.test(normalizedMessage)) {
      return "Você pode sim seguir sem somar. O sistema vai verificar a viabilidade pelo seu perfil. Você vai seguir sozinho ou vai somar renda com alguém?";
    }
    if (/\b(melhora|melhora minhas chances|aumenta|ajuda|vale a pena|faz diferenca|faz diferença)\b/i.test(normalizedMessage)) {
      return "Somar renda pode ampliar o perfil de análise, mas o sistema vai avaliar o melhor caminho. Você vai somar renda com alguém ou vai seguir sozinho?";
    }
    if (/\b(precisa|preciso|obrigatorio|obrigatório|e obrigatorio|é obrigatório|tem que somar|precisa somar)\b/i.test(normalizedMessage)) {
      return "Não é obrigatório. Você pode seguir sozinho ou somar com outra pessoa, conforme seu perfil. Você vai somar renda com alguém ou vai seguir sozinho?";
    }
    if (/\b(muda|diferente|diferenca|diferença|muda alguma coisa)\b/i.test(normalizedMessage)) {
      return "Somar pode mudar o perfil de avaliação, mas o caminho correto depende da sua situação específica. Você vai somar renda com alguém ou vai seguir sozinho?";
    }
    return "Você vai somar renda com alguém ou vai seguir sozinho?";
  }

  if (stage === "somar_renda_familiar") {
    if (/\bm[aã]e\b/i.test(normalizedMessage) || /\bpai\b/i.test(normalizedMessage)) {
      return "Mãe e pai podem entrar como familiar na composição. O sistema vai verificar as condições do seu caso. Me diz com qual familiar você pretende compor renda?";
    }
    if (/\birm[aã](?:o)?\b/i.test(normalizedMessage)) {
      return "Irmão ou irmã pode entrar como familiar. O sistema vai verificar o perfil. Me diz com qual familiar você pretende compor renda?";
    }
    if (/\bqualquer pessoa\b|\bqualquer um\b|\bqualquer familiar\b/i.test(normalizedMessage)) {
      return "O sistema precisa entender quem vai compor para seguir corretamente — não pode confirmar qualquer pessoa sem verificar. Me diz com qual familiar você pretende compor renda?";
    }
    if (/\b(namorad[oa]|noiv[oa]|amig[oa]|vizinho|vizinha|colega)\b/i.test(normalizedMessage)) {
      return "Essa relação tem uma verificação específica no sistema. Me diz com qual familiar você pretende compor renda?";
    }
    return "Me diz com qual familiar você pretende compor renda?";
  }

  if (stage === "quem_pode_somar") {
    if (/\bainda nao sei\b|\bainda não sei\b|\bnao sei ainda\b|\bnão sei ainda\b|\bnao sei\b|\bnão sei\b/i.test(normalizedMessage)) {
      return "Sem problema. Quando você souber, me confirma com quem vai compor renda para eu seguir corretamente.";
    }
    if (/\bnamorad[oa]\b/i.test(normalizedMessage)) {
      return "Namorado(a) tem uma verificação específica no sistema. Me confirma com quem você pretende compor renda?";
    }
    if (/\b(m[aã]e|pai|irm[aã](?:o)?|av[oó]|tio|tia|prima|primo)\b/i.test(normalizedMessage)) {
      return "Familiar pode entrar na composição. Me confirma o nome do familiar para o sistema seguir corretamente.";
    }
    if (/\besposa\b|\besposo\b|\bmarido\b|\bcompanheira\b|\bcompanheiro\b|\bparceiro\b|\bparceira\b/i.test(normalizedMessage)) {
      return "Parceiro(a) pode compor. Me confirma quem vai compor renda para eu seguir.";
    }
    return "Me confirma com quem você pretende compor renda?";
  }

  if (stage === "interpretar_composicao") {
    if (/\b(nao sei|não sei|talvez|ainda nao|ainda não|nao tenho certeza|não tenho certeza)\b/i.test(normalizedMessage)) {
      return "Sem problema. Quando você tiver certeza, me confirma se vai seguir com parceiro, familiar ou sozinho.";
    }
    if (/\b(m[aã]e|pai|irm[aã](?:o)?|av[oó]|tio|tia|prima|primo)\b/i.test(normalizedMessage) &&
        /\b(parceiro|esposa|esposo|marido|companheira|companheiro)\b/i.test(normalizedMessage)) {
      return "Entendi que pode ter mais de uma pessoa. O sistema vai identificar o caminho correto. Me confirma se vai seguir com parceiro, familiar ou sozinho?";
    }
    if (/\b(m[aã]e|pai|irm[aã](?:o)?|av[oó]|tio|tia|prima|primo)\b/i.test(normalizedMessage)) {
      return "Familiar entendido. O sistema vai verificar as condições. Me confirma se é familiar que vai compor renda?";
    }
    if (/\b(parceiro|esposa|esposo|marido|companheira|companheiro)\b/i.test(normalizedMessage)) {
      return "Parceiro(a) entendido. Me confirma se é com parceiro que vai compor renda?";
    }
    if (/\bsozinh\b|\bso\s*eu\b|\bso\s*a\s*minha\b/i.test(normalizedMessage)) {
      return "Entendi que vai seguir sozinho. Me confirma para o sistema seguir corretamente.";
    }
    return "Me confirma se vai seguir com parceiro, familiar ou sozinho?";
  }

  return null;
}

function buildRendaTrabalhoGuidance(request) {
  const stage = normalizeText(request?.current_stage);
  const normalizedMessage = normalizeText(request?.message_text);

  if (stage === "regime_trabalho") {
    if (/\b(clt|carteira assinada|registrad|de carteira)\b/i.test(normalizedMessage)) {
      return "CLT entendido. O sistema vai registrar corretamente. Você é *CLT*, *autônomo* ou tem outro tipo de renda?";
    }
    if (/\bmei\b|\bmicro\s*empreendedor\b/i.test(normalizedMessage)) {
      return "MEI entra como autônomo no sistema — o que importa é o CPF como pessoa física. Você é *CLT*, *autônomo/MEI* ou tem outro tipo de renda?";
    }
    if (/\baposentad\b/i.test(normalizedMessage)) {
      return "Aposentadoria é um regime reconhecido. O sistema vai verificar as condições. Você é *aposentado(a)* ou tem também outra renda ativa?";
    }
    if (/\bbico\b|\binformal\b|\bfreela\b|\buber\b|\bifood\b/i.test(normalizedMessage)) {
      return "Trabalho informal entra como autônomo. O sistema vai verificar o melhor caminho pelo seu perfil. Você é *CLT*, *autônomo* ou tem outro tipo de renda?";
    }
    if (/\bnao sei\b|\bnão sei\b|\bnao tenho certeza\b|\bnão tenho certeza\b|\bnao sei qual\b|\bnão sei qual\b/i.test(normalizedMessage)) {
      return "Sem problema. A mais comum: *CLT* = carteira assinada; *autônomo* = por conta própria, MEI ou informal; *aposentado* = renda de benefício. Qual se encaixa no seu caso?";
    }
    return "Preciso saber como você recebe sua renda para seguir corretamente. Você é *CLT*, *autônomo* ou tem outro tipo de renda?";
  }

  if (stage === "autonomo_ir_pergunta") {
    // If ir_declarado is already known, defer to buildAutonomoGuidance for contextual advice
    const knownSlotsForIr = request?.known_slots || {};
    const irAlreadyKnown = normalizeText(getKnownSlotValue(knownSlotsForIr, "ir_declarado"));
    if (irAlreadyKnown) return null;

    if (/\bnao declaro\b|\bnão declaro\b|\bnao tenho ir\b|\bnão tenho ir\b|\bnao declarei\b|\bnão declarei\b/i.test(normalizedMessage)) {
      return "Tudo bem. O IR ajuda a formalizar a renda, mas a ausência não impede automaticamente — o sistema vai verificar o caminho mais seguro. Você já declarou IR nos últimos anos? Responda *sim* ou *não*.";
    }
    if (/\bnao consigo\b|\bnão consigo\b|\bnao vou conseguir\b|\bnão vou conseguir\b|\bse eu nao tiver\b|\bse eu não tiver\b/i.test(normalizedMessage)) {
      return "Não ter IR não trava automaticamente. Vai depender do perfil completo na análise. Você já declarou IR? Responda *sim* ou *não*.";
    }
    if (/\bda tempo\b|\bdá tempo\b|\bainda da\b|\bainda dá\b|\bprazo\b/i.test(normalizedMessage)) {
      return "O prazo de declaração depende do calendário da Receita. Por aqui, o importante é saber se você já declarou ou não. Você já declarou IR? Responda *sim* ou *não*.";
    }
    if (/\bmei\b|\bsou mei\b/i.test(normalizedMessage)) {
      return "MEI emite CNPJ, mas o financiamento é como pessoa física. O IR do titular como PF é o que conta aqui. Você já declarou IR como pessoa física? Responda *sim* ou *não*.";
    }
    return "O IR ajuda a formalizar renda autônoma na análise. Você já declarou IR? Responda *sim* ou *não*.";
  }

  if (stage === "renda") {
    // Aluguel off-topic: defer to buildAluguelGuidance
    if (ALUGUEL_HINT_PATTERN.test(normalizedMessage)) return null;
    // Off-track questions (entrada/parcela/imóvel): let LLM handle with full context
    if (OFFTRACK_HINTS.test(normalizedMessage)) return null;
    // Docs question while in renda stage: defer to buildDocsGuidanceByProfile
    if (DOCS_HINT_PATTERN.test(request?.message_text)) return null;
    // Visita question while in renda stage: defer to buildVisitaGuidance
    if (/\bvisit/.test(normalizedMessage)) return null;
    // User is directly providing their income (>R$300): let LLM parse and reply
    const moneyDetected = detectMoney(request?.message_text);
    if (Number.isFinite(moneyDetected) && moneyDetected > 300) return null;
    if (/\bbruto\b|\bliquido\b|\blíquido\b/i.test(normalizedMessage)) {
      return "Use o valor que você recebe na mão (líquido), descontando impostos e contribuições quando houver. Qual é o seu valor mensal?";
    }
    if (/\bvaria\b|\bvari[aá]vel\b|\bdepende do mes\b|\bdepende do mês\b|\bnao e fixo\b|\bnão é fixo\b/i.test(normalizedMessage)) {
      return "Quando a renda varia, use a média dos últimos meses como referência. Qual é a sua média mensal aproximada?";
    }
    if (/\bnao sei\b|\bnão sei\b|\bnao sei ao certo\b|\bnão sei ao certo\b|\bnao sei exato\b|\bnão sei exato\b/i.test(normalizedMessage)) {
      return "Sem problema — uma estimativa já ajuda. Qual valor você recebe por mês, em média?";
    }
    if (/\bextra\b|\badicional\b|\bbonus\b|\bbônus\b|\bcomissao\b|\bcomissão\b/i.test(normalizedMessage)) {
      return "Para esta etapa, informe apenas a renda principal. Renda extra e composição são tratados em etapas específicas. Qual é o seu valor mensal principal?";
    }
    if (/\bgira em torno\b|\baproximadamente\b|\bmais ou menos\b|\bpor volta de\b/i.test(normalizedMessage)) {
      const money = detectMoney(request?.message_text);
      if (Number.isFinite(money) && money > 300) {
        return `Entendido, valor aproximado registrado. O sistema vai usar R$ ${money.toLocaleString("pt-BR")} como referência. Confirma esse valor mensal?`;
      }
      return "Entendido. Me confirma o valor aproximado mensal para eu seguir?";
    }
    return "Qual é o seu valor de renda mensal?";
  }

  return null;
}

function buildAprofundamentoRendaGuidance(request) {
  const stage = normalizeText(request?.current_stage);
  const normalizedMessage = normalizeText(request?.message_text);

  if (stage === "possui_renda_extra") {
    if (/\bbico\b|\bbicos\b|\bfreela\b|\bfreelas\b|\binformal\b/i.test(normalizedMessage)) {
      return "Bicos e trabalhos informais podem entrar como renda extra. O sistema vai verificar o que se encaixa no seu perfil. Você tem alguma renda extra além da principal? Responda *sim* ou *não*.";
    }
    if (/\bvendo\b|\bvendendo\b|\bvenda\b|\bvendas\b/i.test(normalizedMessage)) {
      return "Renda de vendas pode ser considerada extra. O sistema avalia o que entra na composição. Você tem alguma renda extra além da principal? Responda *sim* ou *não*.";
    }
    if (/\bpor fora\b|\brecebo por fora\b|\bganho por fora\b/i.test(normalizedMessage)) {
      return "Renda extra informal pode ser considerada. O sistema verifica o que entra. Você tem alguma renda extra além da principal? Responda *sim* ou *não*.";
    }
    if (/\bprecisa entrar\b|\btem que entrar\b|\bconta\b|\bentra\b/i.test(normalizedMessage)) {
      return "A decisão de o que entra ou não na composição fica com o sistema. Aqui só precisamos saber se você tem alguma renda extra. Você tem alguma renda extra além da principal? Responda *sim* ou *não*.";
    }
    return "Você tem alguma renda extra além da sua renda principal? Responda *sim* ou *não*.";
  }

  if (stage === "inicio_multi_regime_pergunta") {
    if (/\bclt\b|\bcarteira assinada\b|\bregistrad[oa]\b/i.test(normalizedMessage) && /\bextra\b|\bbico\b|\bautonom[oa]\b/i.test(normalizedMessage)) {
      return "Entendido que pode haver mais de um regime. O sistema registra cada um — aqui só coletamos a informação, sem classificar. Você tem *mais algum regime de trabalho* além do principal? Responda *sim* ou *não*.";
    }
    if (/\bmei\b|\bmicro\s*empreendedor\b/i.test(normalizedMessage) && /\bclt\b|\btrabalhando registrad[oa]\b|\bcarteira\b/i.test(normalizedMessage)) {
      return "MEI junto com CLT é uma situação que o sistema verifica corretamente. Aqui só precisamos confirmar. Você tem *mais algum regime de trabalho* além do principal? Responda *sim* ou *não*.";
    }
    if (/\baposentad[oa]\b/i.test(normalizedMessage) && /\bbico\b|\bextra\b|\bfreela\b|\bautonom[oa]\b/i.test(normalizedMessage)) {
      return "Aposentado com renda adicional é uma situação que o sistema avalia. Aqui só confirmamos a existência. Você tem *mais algum regime de trabalho* além do principal? Responda *sim* ou *não*.";
    }
    return "Verificar múltiplos regimes ajuda a montar o perfil completo de renda. Você tem *mais algum regime de trabalho*? Responda *sim* ou *não*.";
  }

  if (stage === "inicio_multi_regime_coletar") {
    if (/\bmei\b|\bmicro\s*empreendedor\b/i.test(normalizedMessage)) {
      return "MEI é reconhecido pelo sistema. Me diz qual é o regime: *CLT*, *Autônomo/MEI*, *Servidor* ou *Aposentado*?";
    }
    if (/\bnao sei\b|\bnão sei\b|\bnao tenho certeza\b|\bnão tenho certeza\b/i.test(normalizedMessage)) {
      return "Sem problema. Os regimes mais comuns: *CLT* = carteira assinada; *Autônomo* = por conta própria, MEI ou informal; *Aposentado* = renda de benefício. Qual se encaixa?";
    }
    if (/\btrabalhando\b|\btrampo\b|\bemprego\b/i.test(normalizedMessage) && !/\bclt\b|\bautonom[oa]\b|\bservidor\b|\baposentad[oa]\b/i.test(normalizedMessage)) {
      return "Me diz o regime específico: *CLT*, *Autônomo*, *Servidor* ou *Aposentado*? Preciso do regime para o sistema seguir corretamente.";
    }
    return "Me diz qual é o *outro regime de trabalho*. Exemplos: *CLT*, *Autônomo*, *Servidor*, *MEI*, *Aposentado*.";
  }

  if (stage === "inicio_multi_renda_pergunta") {
    if (/\bvaria\b|\bvari[aá]vel\b|\bdepende\b|\bnao e fixo\b|\bnão é fixo\b/i.test(normalizedMessage)) {
      return "Renda variável pode ser considerada — usamos a média como referência. O sistema vai verificar o que se encaixa. Você tem *mais alguma renda* além dessa? Responda *sim* ou *não*.";
    }
    if (/\bsal[aá]rio\b.*\bextra\b|\bextra\b.*\bsal[aá]rio\b|\btambem tenho\b|\btambém tenho\b/i.test(normalizedMessage)) {
      return "Ter salário e uma renda extra é uma situação que o sistema avalia. Aqui só confirmamos a existência. Você tem *mais alguma renda* além da principal? Responda *sim* ou *não*.";
    }
    if (/\bnao sei se conta\b|\bnão sei se conta\b|\bnao sei se e renda\b|\bnão sei se é renda\b|\bnao sei se essa\b|\bnão sei se essa\b/i.test(normalizedMessage)) {
      return "A decisão de o que conta como renda separada fica com o sistema. Aqui só precisamos saber se há mais alguma fonte de renda. Você tem *mais alguma renda*? Responda *sim* ou *não*.";
    }
    return "Verificar múltiplas rendas ajuda a montar o perfil completo. Você tem *mais alguma renda* além da principal? Responda *sim* ou *não*.";
  }

  if (stage === "inicio_multi_renda_coletar") {
    if (/\bgira em torno\b|\baproximadamente\b|\bmais ou menos\b|\bpor volta de\b/i.test(normalizedMessage)) {
      const money = detectMoney(request?.message_text);
      if (Number.isFinite(money) && money > 100) {
        return `Valor aproximado registrado como referência. Me confirma o valor mensal aproximado da renda extra para o sistema seguir?`;
      }
      return "Entendido. Me confirma um valor mensal aproximado para a renda extra?";
    }
    if (/\bdepende\b|\bvaria\b|\bnao e fixo\b|\bnão é fixo\b/i.test(normalizedMessage)) {
      return "Quando a renda varia, use a média dos últimos meses. Me confirma um valor mensal aproximado para a renda extra?";
    }
    if (/\bnao sei\b|\bnão sei\b|\bnao sei ao certo\b|\bnão sei ao certo\b/i.test(normalizedMessage)) {
      return "Sem problema — uma estimativa já ajuda. Me diz um valor aproximado mensal para a renda extra?";
    }
    return "Me diz qual é a *outra renda* e o *valor mensal*. Exemplo: *Bico — 1200*.";
  }

  return null;
}

function buildParceiroRendaGuidance(request) {
  const stage = normalizeText(request?.current_stage);
  const normalizedMessage = normalizeText(request?.message_text);

  if (stage === "parceiro_tem_renda") {
    if (/\bso\s*eu\b|\bsó\s*eu\b|\bso\s*a\s*minha\b|\bapenas\s*eu\b|\bso\s*tenho\b|\bsó\s*tenho\b/i.test(normalizedMessage)) {
      return "Entendido. O sistema precisa confirmar oficialmente se o parceiro tem renda para seguir corretamente. O parceiro tem renda? Responda *sim* ou *não*.";
    }
    if (/\bnao\s*trabalha\b|\bnão\s*trabalha\b|\bdo\s*lar\b|\bdesempregad\b|\bsem\s*emprego\b|\bsem\s*renda\b/i.test(normalizedMessage)) {
      return "Tudo bem. O sistema precisa da confirmação oficial para seguir. O parceiro tem renda? Responda *sim* ou *não*.";
    }
    if (/\bbico\b|\bfreela\b|\binformal\b|\bfaz\s*bico\b|\bfaz\s*uns\s*bicos\b/i.test(normalizedMessage)) {
      return "Bico e trabalhos informais podem ser considerados. O sistema vai verificar. O parceiro tem renda? Responda *sim* ou *não*.";
    }
    if (/\bprecisa\s*entrar\b|\btem\s*que\s*entrar\b|\bentra\b|\bconta\b|\bpode\s*entrar\b/i.test(normalizedMessage)) {
      return "A decisão de o que entra na composição fica com o sistema. Aqui só precisamos saber se o parceiro tem renda. O parceiro tem renda? Responda *sim* ou *não*.";
    }
    return "O parceiro tem renda? Responda *sim* ou *não*.";
  }

  if (stage === "regime_trabalho_parceiro") {
    if (/\bregistrad[oa]\b|\bclt\b|\bcarteira\s*assinada\b/i.test(normalizedMessage)) {
      return "CLT entendido. O sistema vai registrar corretamente. Qual é o regime do parceiro: *CLT*, *autônomo*, *servidor* ou *aposentado*?";
    }
    if (/\bautonom[oa]\b|\bpor\s*conta\s*pr[oó]pria\b/i.test(normalizedMessage)) {
      return "Autônomo entendido. O sistema vai verificar as condições. Qual é o regime do parceiro: *CLT*, *autônomo*, *servidor* ou *aposentado*?";
    }
    if (/\bmei\b|\bmicro\s*empreendedor\b/i.test(normalizedMessage)) {
      return "MEI entra como autônomo no sistema. Qual é o regime do parceiro: *CLT*, *autônomo/MEI*, *servidor* ou *aposentado*?";
    }
    if (/\baposentad[oa]\b/i.test(normalizedMessage)) {
      return "Aposentadoria é um regime reconhecido. O sistema vai verificar. Qual é o regime do parceiro: *CLT*, *autônomo*, *servidor* ou *aposentado*?";
    }
    if (/\bnao\s*sei\b|\bnão\s*sei\b|\bnao\s*sei\s*qual\b|\bnão\s*sei\s*qual\b/i.test(normalizedMessage)) {
      return "Os regimes mais comuns: *CLT* = carteira assinada; *autônomo* = por conta própria, MEI ou informal; *aposentado* = renda de benefício. Qual se encaixa no parceiro?";
    }
    return "Qual é o regime de trabalho do parceiro? *CLT*, *autônomo*, *servidor* ou *aposentado*?";
  }

  if (stage === "inicio_multi_regime_pergunta_parceiro") {
    if (/\bclt\b.*\bextra\b|\bclt\b.*\bautonom[oa]\b|\bclt\b.*\bbico\b/i.test(normalizedMessage)) {
      return "Entendido que pode haver mais de um regime. O sistema registra cada um separado — aqui só confirmamos. O parceiro tem *mais algum regime de trabalho*? Responda *sim* ou *não*.";
    }
    if (/\bmei\b.*\bclt\b|\bclt\b.*\bmei\b|\bmei\b.*\bregistrad[oa]\b/i.test(normalizedMessage)) {
      return "MEI junto com CLT é uma situação que o sistema verifica. O parceiro tem *mais algum regime de trabalho*? Responda *sim* ou *não*.";
    }
    if (/\baposentad[oa]\b.*\bbico\b|\baposentad[oa]\b.*\bextra\b|\baposentad[oa]\b.*\bautonom[oa]\b/i.test(normalizedMessage)) {
      return "Aposentado com renda adicional é avaliado pelo sistema. O parceiro tem *mais algum regime de trabalho*? Responda *sim* ou *não*.";
    }
    return "Verificar múltiplos regimes ajuda a montar o perfil completo do parceiro. O parceiro tem *mais algum regime de trabalho*? Responda *sim* ou *não*.";
  }

  if (stage === "inicio_multi_regime_coletar_parceiro") {
    if (/\bmei\b|\bmicro\s*empreendedor\b/i.test(normalizedMessage)) {
      return "MEI é reconhecido pelo sistema. Qual é o regime do parceiro: *CLT*, *Autônomo/MEI*, *Servidor* ou *Aposentado*?";
    }
    if (/\bnao\s*sei\b|\bnão\s*sei\b|\bnao\s*tenho\s*certeza\b|\bnão\s*tenho\s*certeza\b/i.test(normalizedMessage)) {
      return "Sem problema. Os regimes: *CLT* = carteira assinada; *Autônomo* = por conta própria, MEI; *Aposentado* = benefício. Qual se encaixa no parceiro?";
    }
    if (/\btrabalhando\b|\btrampo\b|\bemprego\b/i.test(normalizedMessage) && !/\bclt\b|\bautonom[oa]\b|\bservidor\b|\baposentad[oa]\b/i.test(normalizedMessage)) {
      return "Me diz o regime específico do parceiro: *CLT*, *Autônomo*, *Servidor* ou *Aposentado*?";
    }
    return "Me diz qual é o *outro regime de trabalho* do parceiro. Exemplos: *CLT*, *Autônomo*, *Servidor*, *MEI*, *Aposentado*.";
  }

  if (stage === "renda_parceiro") {
    if (/\bbruto\b|\bliquido\b|\blíquido\b/i.test(normalizedMessage)) {
      return "Use o valor que o parceiro recebe na mão (líquido). Qual é a renda mensal do parceiro?";
    }
    if (/\bvaria\b|\bvari[aá]vel\b|\bdepende\b|\bnao\s*e\s*fixo\b|\bnão\s*é\s*fixo\b/i.test(normalizedMessage)) {
      return "Quando a renda varia, use a média dos últimos meses como referência. Qual é a renda mensal média do parceiro?";
    }
    if (/\bnao\s*sei\b|\bnão\s*sei\b|\bnao\s*sei\s*ao\s*certo\b|\bnão\s*sei\s*ao\s*certo\b|\bnao\s*sei\s*a\s*media\b|\bnão\s*sei\s*a\s*média\b/i.test(normalizedMessage)) {
      return "Sem problema — uma estimativa já ajuda. Qual é o valor mensal aproximado do parceiro?";
    }
    if (/\bgira\s*em\s*torno\b|\baproximadamente\b|\bmais\s*ou\s*menos\b|\bpor\s*volta\s*de\b/i.test(normalizedMessage)) {
      const money = detectMoney(request?.message_text);
      if (Number.isFinite(money) && money > 100) {
        return `Valor aproximado registrado. Confirma R$ ${money.toLocaleString("pt-BR")} como renda mensal do parceiro?`;
      }
      return "Entendido. Me confirma um valor mensal aproximado para a renda do parceiro?";
    }
    return "Qual é a renda mensal do parceiro?";
  }

  if (stage === "inicio_multi_renda_pergunta_parceiro") {
    if (/\bvaria\b|\bvari[aá]vel\b|\bdepende\b|\bnao\s*e\s*fixo\b|\bnão\s*é\s*fixo\b/i.test(normalizedMessage)) {
      return "Renda variável pode ser considerada — usamos a média. O sistema vai verificar. O parceiro tem *mais alguma renda*? Responda *sim* ou *não*.";
    }
    if (/\bsal[aá]rio\b.*\bextra\b|\bextra\b.*\bsal[aá]rio\b|\btambem\s*tem\b|\btambém\s*tem\b/i.test(normalizedMessage)) {
      return "Salário e renda extra é uma situação que o sistema avalia. O parceiro tem *mais alguma renda*? Responda *sim* ou *não*.";
    }
    if (/\bnao\s*sei\s*se\s*conta\b|\bnão\s*sei\s*se\s*conta\b|\bnao\s*sei\s*se\s*e\s*renda\b|\bnão\s*sei\s*se\s*é\s*renda\b/i.test(normalizedMessage)) {
      return "A decisão do que conta como renda separada fica com o sistema. Aqui só precisamos saber se existe mais alguma renda. O parceiro tem *mais alguma renda*? Responda *sim* ou *não*.";
    }
    return "Verificar múltiplas rendas do parceiro ajuda a montar o perfil completo. O parceiro tem *mais alguma renda*? Responda *sim* ou *não*.";
  }

  if (stage === "inicio_multi_renda_coletar_parceiro") {
    if (/\bgira\s*em\s*torno\b|\baproximadamente\b|\bmais\s*ou\s*menos\b|\bpor\s*volta\s*de\b/i.test(normalizedMessage)) {
      const money = detectMoney(request?.message_text);
      if (Number.isFinite(money) && money > 100) {
        return `Valor aproximado do parceiro registrado como referência. Me confirma o valor mensal aproximado da renda extra do parceiro para o sistema seguir?`;
      }
      return "Entendido. Me confirma um valor mensal aproximado para a renda extra do parceiro?";
    }
    if (/\bdepende\b|\bvaria\b|\bnao\s*e\s*fixo\b|\bnão\s*é\s*fixo\b/i.test(normalizedMessage)) {
      return "Quando a renda varia, use a média dos últimos meses. Me confirma um valor mensal aproximado para a renda extra do parceiro?";
    }
    if (/\bnao\s*sei\b|\bnão\s*sei\b|\bnao\s*sei\s*ao\s*certo\b|\bnão\s*sei\s*ao\s*certo\b/i.test(normalizedMessage)) {
      return "Sem problema — uma estimativa já ajuda. Me diz um valor aproximado mensal para a renda extra do parceiro?";
    }
    return "Me diz qual é a *outra renda* do parceiro e o *valor mensal*. Exemplo: *Autônomo — 1200*.";
  }

  return null;
}

function buildFamiliarRendaGuidance(request) {
  const stage = normalizeText(request?.current_stage);
  const normalizedMessage = normalizeText(request?.message_text);

  if (stage === "pais_casados_civil_pergunta") {
    if (/\bseparad[oa]\b|\bdivorciad[oa]\b|\bex-casad[oa]\b/i.test(normalizedMessage)) {
      return "Entendido. O sistema precisa confirmar o estado civil atual dos pais para seguir corretamente. Seus pais são casados no civil hoje? Responda *sim* ou *não*.";
    }
    if (/\bmoram juntos\b|\bvivem juntos\b|\bjuntos mas\b/i.test(normalizedMessage)) {
      return "União informal não equivale a casamento civil para este efeito. O sistema precisa confirmar. Seus pais são casados no civil? Responda *sim* ou *não*.";
    }
    if (/\buniao estavel\b|\buni[aã]o est[aá]vel\b/i.test(normalizedMessage)) {
      return "União estável tem um caminho específico no sistema — o sistema vai verificar. Seus pais são casados no civil? Responda *sim* ou *não*.";
    }
    if (/\b(nao sei|não sei|nao tenho certeza|não tenho certeza)\b/i.test(normalizedMessage)) {
      return "Sem problema. Você consegue verificar? Para o sistema seguir corretamente precisa confirmar: seus pais são casados no civil? Responda *sim* ou *não*.";
    }
    return "Seus pais são casados no civil? Responda *sim* ou *não*.";
  }

  if (stage === "confirmar_avo_familiar") {
    if (/\bav[oó]\b|\bavozinha\b|\bavozinho\b|\bagv[oó]\b/i.test(normalizedMessage)) {
      return "Avô ou avó entendido. O sistema vai verificar as condições. Confirma que o familiar é avô ou avó? Responda *sim* ou *não*.";
    }
    if (/\baposentad[oa]\b.*\bbio\b|\bbio\b.*\baposentad[oa]\b|\baposentad[oa]\b.*\brural\b|\brural\b.*\baposentad[oa]\b/i.test(normalizedMessage)) {
      return "A situação de aposentadoria do familiar tem verificação específica no sistema. Confirma que o familiar é avô ou avó? Responda *sim* ou *não*.";
    }
    if (/\b(nao sei|não sei|nao tenho certeza|não tenho certeza|nao sei informar|não sei informar)\b/i.test(normalizedMessage)) {
      return "Sem problema. O sistema precisa confirmar o vínculo para seguir no trilho correto. Confirma que o familiar é avô ou avó? Responda *sim* ou *não*.";
    }
    return "Confirma que o familiar é avô ou avó? Responda *sim* ou *não*.";
  }

  if (stage === "renda_familiar_valor") {
    if (/\bbruto\b|\bliquido\b|\blíquido\b/i.test(normalizedMessage)) {
      return "Use o valor que o familiar recebe na mão (líquido). Qual é a renda mensal do familiar?";
    }
    if (/\bvaria\b|\bvari[aá]vel\b|\bdepende\b|\bnao\s*e\s*fixo\b|\bnão\s*é\s*fixo\b/i.test(normalizedMessage)) {
      return "Quando a renda varia, use a média dos últimos meses como referência. Qual é a renda mensal média do familiar?";
    }
    if (/\bnao\s*sei\b|\bnão\s*sei\b|\bnao\s*sei\s*ao\s*certo\b|\bnão\s*sei\s*ao\s*certo\b|\bnao\s*sei\s*a\s*media\b|\bnão\s*sei\s*a\s*média\b/i.test(normalizedMessage)) {
      return "Sem problema — uma estimativa já ajuda. Qual é o valor mensal aproximado do familiar?";
    }
    if (/\bgira\s*em\s*torno\b|\baproximadamente\b|\bmais\s*ou\s*menos\b|\bpor\s*volta\s*de\b/i.test(normalizedMessage)) {
      const money = detectMoney(request?.message_text);
      if (Number.isFinite(money) && money > 100) {
        return `Valor aproximado registrado. Confirma R$ ${money.toLocaleString("pt-BR")} como renda mensal do familiar?`;
      }
      return "Entendido. Me confirma um valor mensal aproximado para a renda do familiar?";
    }
    return "Qual é a renda mensal do familiar?";
  }

  if (stage === "regime_trabalho_parceiro_familiar") {
    if (/\bregistrad[oa]\b|\bclt\b|\bcarteira\s*assinada\b/i.test(normalizedMessage)) {
      return "CLT entendido. O sistema vai registrar corretamente. Qual é o regime do familiar: *CLT*, *autônomo*, *servidor* ou *aposentado*?";
    }
    if (/\bautonom[oa]\b|\bpor\s*conta\s*pr[oó]pria\b/i.test(normalizedMessage)) {
      return "Autônomo entendido. O sistema vai verificar as condições. Qual é o regime do familiar: *CLT*, *autônomo*, *servidor* ou *aposentado*?";
    }
    if (/\bmei\b|\bmicro\s*empreendedor\b/i.test(normalizedMessage)) {
      return "MEI entra como autônomo no sistema. Qual é o regime do familiar: *CLT*, *autônomo/MEI*, *servidor* ou *aposentado*?";
    }
    if (/\baposentad[oa]\b/i.test(normalizedMessage)) {
      return "Aposentadoria é um regime reconhecido. O sistema vai verificar. Qual é o regime do familiar: *CLT*, *autônomo*, *servidor* ou *aposentado*?";
    }
    if (/\bnao\s*sei\b|\bnão\s*sei\b|\bnao\s*sei\s*qual\b|\bnão\s*sei\s*qual\b/i.test(normalizedMessage)) {
      return "Os regimes mais comuns: *CLT* = carteira assinada; *autônomo* = por conta própria, MEI ou informal; *aposentado* = renda de benefício. Qual se encaixa no familiar?";
    }
    return "Qual é o regime de trabalho do familiar? *CLT*, *autônomo*, *servidor* ou *aposentado*?";
  }

  if (stage === "renda_parceiro_familiar") {
    if (/\bbruto\b|\bliquido\b|\blíquido\b/i.test(normalizedMessage)) {
      return "Use o valor que o familiar recebe na mão (líquido). Qual é a renda mensal desse familiar?";
    }
    if (/\bvaria\b|\bvari[aá]vel\b|\bdepende\b|\bnao\s*e\s*fixo\b|\bnão\s*é\s*fixo\b/i.test(normalizedMessage)) {
      return "Quando a renda varia, use a média dos últimos meses como referência. Qual é a renda mensal média desse familiar?";
    }
    if (/\bnao\s*sei\b|\bnão\s*sei\b|\bnao\s*sei\s*ao\s*certo\b|\bnão\s*sei\s*ao\s*certo\b/i.test(normalizedMessage)) {
      return "Sem problema — uma estimativa já ajuda. Qual é o valor mensal aproximado desse familiar?";
    }
    if (/\bgira\s*em\s*torno\b|\baproximadamente\b|\bmais\s*ou\s*menos\b|\bpor\s*volta\s*de\b/i.test(normalizedMessage)) {
      const money = detectMoney(request?.message_text);
      if (Number.isFinite(money) && money > 100) {
        return `Valor aproximado registrado. Confirma R$ ${money.toLocaleString("pt-BR")} como renda mensal desse familiar?`;
      }
      return "Entendido. Me confirma um valor mensal aproximado para a renda desse familiar?";
    }
    return "Qual é a renda mensal desse familiar?";
  }

  if (stage === "inicio_multi_regime_familiar_pergunta") {
    if (/\bclt\b.*\bextra\b|\bclt\b.*\bautonom[oa]\b|\bclt\b.*\bbico\b/i.test(normalizedMessage)) {
      return "Entendido que pode haver mais de um regime. O sistema registra cada um separado — aqui só confirmamos. O familiar tem *mais algum regime de trabalho*? Responda *sim* ou *não*.";
    }
    if (/\bmei\b.*\bclt\b|\bclt\b.*\bmei\b|\bmei\b.*\bregistrad[oa]\b/i.test(normalizedMessage)) {
      return "MEI junto com CLT é uma situação que o sistema verifica. O familiar tem *mais algum regime de trabalho*? Responda *sim* ou *não*.";
    }
    if (/\baposentad[oa]\b.*\bbico\b|\baposentad[oa]\b.*\bextra\b|\baposentad[oa]\b.*\bautonom[oa]\b/i.test(normalizedMessage)) {
      return "Aposentado com renda adicional é avaliado pelo sistema. O familiar tem *mais algum regime de trabalho*? Responda *sim* ou *não*.";
    }
    return "Verificar múltiplos regimes ajuda a montar o perfil completo do familiar. O familiar tem *mais algum regime de trabalho*? Responda *sim* ou *não*.";
  }

  if (stage === "inicio_multi_regime_familiar_loop") {
    if (/\bmei\b|\bmicro\s*empreendedor\b/i.test(normalizedMessage)) {
      return "MEI é reconhecido pelo sistema. Qual é o regime do familiar: *CLT*, *Autônomo/MEI*, *Servidor* ou *Aposentado*?";
    }
    if (/\bnao\s*sei\b|\bnão\s*sei\b|\bnao\s*tenho\s*certeza\b|\bnão\s*tenho\s*certeza\b/i.test(normalizedMessage)) {
      return "Sem problema. Os regimes: *CLT* = carteira assinada; *Autônomo* = por conta própria, MEI; *Aposentado* = benefício. Qual se encaixa no familiar?";
    }
    if (/\btrabalhando\b|\btrampo\b|\bemprego\b/i.test(normalizedMessage) && !/\bclt\b|\bautonom[oa]\b|\bservidor\b|\baposentad[oa]\b/i.test(normalizedMessage)) {
      return "Me diz o regime específico do familiar: *CLT*, *Autônomo*, *Servidor* ou *Aposentado*?";
    }
    return "Me diz qual é o *outro regime de trabalho* do familiar. Exemplos: *CLT*, *Autônomo*, *Servidor*, *MEI*, *Aposentado*.";
  }

  if (stage === "inicio_multi_renda_familiar_pergunta") {
    if (/\bvaria\b|\bvari[aá]vel\b|\bdepende\b|\bnao\s*e\s*fixo\b|\bnão\s*é\s*fixo\b/i.test(normalizedMessage)) {
      return "Renda variável pode ser considerada — usamos a média. O sistema vai verificar. O familiar tem *mais alguma renda*? Responda *sim* ou *não*.";
    }
    if (/\bsal[aá]rio\b.*\bextra\b|\bextra\b.*\bsal[aá]rio\b|\btambem\s*tem\b|\btambém\s*tem\b/i.test(normalizedMessage)) {
      return "Salário e renda extra é uma situação que o sistema avalia. O familiar tem *mais alguma renda*? Responda *sim* ou *não*.";
    }
    if (/\bnao\s*sei\s*se\s*conta\b|\bnão\s*sei\s*se\s*conta\b|\bnao\s*sei\s*se\s*e\s*renda\b|\bnão\s*sei\s*se\s*é\s*renda\b/i.test(normalizedMessage)) {
      return "A decisão do que conta como renda separada fica com o sistema. Aqui só precisamos saber se existe mais alguma renda. O familiar tem *mais alguma renda*? Responda *sim* ou *não*.";
    }
    return "Verificar múltiplas rendas do familiar ajuda a montar o perfil completo. O familiar tem *mais alguma renda*? Responda *sim* ou *não*.";
  }

  if (stage === "inicio_multi_renda_familiar_loop") {
    if (/\bgira\s*em\s*torno\b|\baproximadamente\b|\bmais\s*ou\s*menos\b|\bpor\s*volta\s*de\b/i.test(normalizedMessage)) {
      const money = detectMoney(request?.message_text);
      if (Number.isFinite(money) && money > 100) {
        return `Valor aproximado do familiar registrado como referência. Me confirma o valor mensal aproximado da renda extra do familiar para o sistema seguir?`;
      }
      return "Entendido. Me confirma um valor mensal aproximado para a renda extra do familiar?";
    }
    if (/\bdepende\b|\bvaria\b|\bnao\s*e\s*fixo\b|\bnão\s*é\s*fixo\b/i.test(normalizedMessage)) {
      return "Quando a renda varia, use a média dos últimos meses. Me confirma um valor mensal aproximado para a renda extra do familiar?";
    }
    if (/\bnao\s*sei\b|\bnão\s*sei\b|\bnao\s*sei\s*ao\s*certo\b|\bnão\s*sei\s*ao\s*certo\b/i.test(normalizedMessage)) {
      return "Sem problema — uma estimativa já ajuda. Me diz um valor aproximado mensal para a renda extra do familiar?";
    }
    return "Me diz qual é a *outra renda* do familiar e o *valor mensal*. Exemplo: *Autônomo — 1200*.";
  }

  return null;
}


function buildP3RendaGuidance(request) {
  const stage = normalizeText(request?.current_stage);
  const normalizedMessage = normalizeText(request?.message_text);

  if (stage === "p3_tipo_pergunta") {
    if (/\bconjuge\b|\bcônjuge\b|\besposo\b|\besposa\b|\bmarido\b|\bmulher\b/i.test(normalizedMessage)) {
      return "Entendido. Só para garantir: aqui estamos registrando a terceira pessoa da composição, que não é o seu parceiro(a) conjugal. Qual é o vínculo desta terceira pessoa com você?";
    }
    if (/\bconjuge\s*da\s*minha\s*mae\b|\bconjuge\s*da\s*minha\s*mãe\b|\besposa\s*do\s*meu\s*pai\b|\bmarido\s*da\s*minha\s*mae\b|\bmarido\s*da\s*minha\s*mãe\b/i.test(normalizedMessage)) {
      return "Entendido — o sistema vai registrar como terceira pessoa da composição. Me confirma qual é o vínculo (ex: padrasto, madrasta, cônjuge do familiar)?";
    }
    if (/\bnao\s*sei\b|\bnão\s*sei\b|\bnao\s*sei\s*como\b|\bnão\s*sei\s*como\b|\bnao\s*entendi\b|\bnão\s*entendi\b/i.test(normalizedMessage)) {
      return "Sem problema. Esta etapa pergunta quem é a terceira pessoa que vai compor renda com você (além do titular e do familiar principal). Qual é o parentesco dela?";
    }
    return "Qual é o vínculo desta terceira pessoa com você?";
  }

  if (stage === "regime_trabalho_parceiro_familiar_p3") {
    if (/\bregistrad[oa]\b|\bclt\b|\bcarteira\s*assinada\b/i.test(normalizedMessage)) {
      return "CLT entendido. O sistema vai registrar corretamente para o P3. Qual é o regime do P3: *CLT*, *autônomo*, *servidor* ou *aposentado*?";
    }
    if (/\bautonom[oa]\b|\bpor\s*conta\s*pr[oó]pria\b/i.test(normalizedMessage)) {
      return "Autônomo entendido. O sistema vai verificar as condições do P3. Qual é o regime do P3: *CLT*, *autônomo*, *servidor* ou *aposentado*?";
    }
    if (/\bmei\b|\bmicro\s*empreendedor\b/i.test(normalizedMessage)) {
      return "MEI entra como autônomo no sistema. Qual é o regime do P3: *CLT*, *autônomo/MEI*, *servidor* ou *aposentado*?";
    }
    if (/\baposentad[oa]\b/i.test(normalizedMessage)) {
      return "Aposentadoria é um regime reconhecido. O sistema vai verificar para o P3. Qual é o regime do P3: *CLT*, *autônomo*, *servidor* ou *aposentado*?";
    }
    if (/\bnao\s*sei\b|\bnão\s*sei\b|\bnao\s*sei\s*qual\b|\bnão\s*sei\s*qual\b/i.test(normalizedMessage)) {
      return "Os regimes mais comuns: *CLT* = carteira assinada; *autônomo* = por conta própria, MEI ou informal; *aposentado* = renda de benefício. Qual se encaixa no P3?";
    }
    return "Qual é o regime de trabalho do P3? *CLT*, *autônomo*, *servidor* ou *aposentado*?";
  }

  if (stage === "renda_parceiro_familiar_p3") {
    if (/\bbruto\b|\bliquido\b|\blíquido\b/i.test(normalizedMessage)) {
      return "Use o valor que o P3 recebe na mão (líquido). Qual é a renda mensal do P3?";
    }
    if (/\bvaria\b|\bvari[aá]vel\b|\bdepende\b|\bnao\s*e\s*fixo\b|\bnão\s*é\s*fixo\b/i.test(normalizedMessage)) {
      return "Quando a renda varia, use a média dos últimos meses como referência. Qual é a renda mensal média do P3?";
    }
    if (/\bnao\s*sei\b|\bnão\s*sei\b|\bnao\s*sei\s*ao\s*certo\b|\bnão\s*sei\s*ao\s*certo\b|\bnao\s*sei\s*a\s*media\b|\bnão\s*sei\s*a\s*média\b/i.test(normalizedMessage)) {
      return "Sem problema — uma estimativa já ajuda. Qual é o valor mensal aproximado do P3?";
    }
    if (/\bgira\s*em\s*torno\b|\baproximadamente\b|\bmais\s*ou\s*menos\b|\bpor\s*volta\s*de\b/i.test(normalizedMessage)) {
      const money = detectMoney(request?.message_text);
      if (Number.isFinite(money) && money > 100) {
        return `Valor aproximado registrado. Confirma R$ ${money.toLocaleString("pt-BR")} como renda mensal do P3?`;
      }
      return "Entendido. Me confirma um valor mensal aproximado para a renda do P3?";
    }
    return "Qual é a renda mensal do P3?";
  }

  if (stage === "inicio_multi_regime_p3_pergunta") {
    if (/\bclt\b.*\bextra\b|\bclt\b.*\bautonom[oa]\b|\bclt\b.*\bbico\b/i.test(normalizedMessage)) {
      return "Entendido que o P3 pode ter mais de um regime. O sistema registra cada um separado — aqui só confirmamos. O P3 tem *mais algum regime de trabalho*? Responda *sim* ou *não*.";
    }
    if (/\bmei\b.*\bclt\b|\bclt\b.*\bmei\b|\bmei\b.*\bregistrad[oa]\b/i.test(normalizedMessage)) {
      return "MEI junto com CLT é uma situação que o sistema verifica para o P3. O P3 tem *mais algum regime de trabalho*? Responda *sim* ou *não*.";
    }
    if (/\baposentad[oa]\b.*\bbico\b|\baposentad[oa]\b.*\bextra\b|\baposentad[oa]\b.*\bautonom[oa]\b/i.test(normalizedMessage)) {
      return "Aposentado com renda adicional é avaliado pelo sistema para o P3. O P3 tem *mais algum regime de trabalho*? Responda *sim* ou *não*.";
    }
    return "Verificar múltiplos regimes ajuda a montar o perfil completo do P3. O P3 tem *mais algum regime de trabalho*? Responda *sim* ou *não*.";
  }

  if (stage === "inicio_multi_regime_p3_loop") {
    if (/\bmei\b|\bmicro\s*empreendedor\b/i.test(normalizedMessage)) {
      return "MEI é reconhecido pelo sistema para o P3. Qual é o regime do P3: *CLT*, *Autônomo/MEI*, *Servidor* ou *Aposentado*?";
    }
    if (/\bnao\s*sei\b|\bnão\s*sei\b|\bnao\s*tenho\s*certeza\b|\bnão\s*tenho\s*certeza\b/i.test(normalizedMessage)) {
      return "Sem problema. Os regimes: *CLT* = carteira assinada; *Autônomo* = por conta própria, MEI; *Aposentado* = benefício. Qual se encaixa no P3?";
    }
    if (/\btrabalhando\b|\btrampo\b|\bemprego\b/i.test(normalizedMessage) && !/\bclt\b|\bautonom[oa]\b|\bservidor\b|\baposentad[oa]\b/i.test(normalizedMessage)) {
      return "Me diz o regime específico do P3: *CLT*, *Autônomo*, *Servidor* ou *Aposentado*?";
    }
    return "Me diz qual é o *outro regime de trabalho* do P3. Exemplos: *CLT*, *Autônomo*, *Servidor*, *MEI*, *Aposentado*.";
  }

  if (stage === "inicio_multi_renda_p3_pergunta") {
    if (/\bvaria\b|\bvari[aá]vel\b|\bdepende\b|\bnao\s*e\s*fixo\b|\bnão\s*é\s*fixo\b/i.test(normalizedMessage)) {
      return "Renda variável pode ser considerada — usamos a média. O sistema vai verificar. O P3 tem *mais alguma renda*? Responda *sim* ou *não*.";
    }
    if (/\bsal[aá]rio\b.*\bextra\b|\bextra\b.*\bsal[aá]rio\b|\btambem\s*tem\b|\btambém\s*tem\b/i.test(normalizedMessage)) {
      return "Salário e renda extra é uma situação que o sistema avalia para o P3. O P3 tem *mais alguma renda*? Responda *sim* ou *não*.";
    }
    if (/\bnao\s*sei\s*se\s*conta\b|\bnão\s*sei\s*se\s*conta\b|\bnao\s*sei\s*se\s*e\s*renda\b|\bnão\s*sei\s*se\s*é\s*renda\b/i.test(normalizedMessage)) {
      return "A decisão do que conta como renda separada fica com o sistema. Aqui só precisamos saber se existe mais alguma renda. O P3 tem *mais alguma renda*? Responda *sim* ou *não*.";
    }
    return "Verificar múltiplas rendas do P3 ajuda a montar o perfil completo. O P3 tem *mais alguma renda*? Responda *sim* ou *não*.";
  }

  if (stage === "inicio_multi_renda_p3_loop") {
    if (/\bgira\s*em\s*torno\b|\baproximadamente\b|\bmais\s*ou\s*menos\b|\bpor\s*volta\s*de\b/i.test(normalizedMessage)) {
      const money = detectMoney(request?.message_text);
      if (Number.isFinite(money) && money > 100) {
        return `Valor aproximado do P3 registrado como referência. Me confirma o valor mensal aproximado da renda extra do P3 para o sistema seguir?`;
      }
      return "Entendido. Me confirma um valor mensal aproximado para a renda extra do P3?";
    }
    if (/\bdepende\b|\bvaria\b|\bnao\s*e\s*fixo\b|\bnão\s*é\s*fixo\b/i.test(normalizedMessage)) {
      return "Quando a renda varia, use a média dos últimos meses. Me confirma um valor mensal aproximado para a renda extra do P3?";
    }
    if (/\bnao\s*sei\b|\bnão\s*sei\b|\bnao\s*sei\s*ao\s*certo\b|\bnão\s*sei\s*ao\s*certo\b/i.test(normalizedMessage)) {
      return "Sem problema — uma estimativa já ajuda. Me diz um valor aproximado mensal para a renda extra do P3?";
    }
    return "Me diz qual é a *outra renda* do P3 e o *valor mensal*. Exemplo: *Autônomo — 1200*.";
  }

  return null;
}


function buildGateFinaisGuidance(request) {
  const stage = normalizeText(request?.current_stage);
  const normalizedMessage = normalizeText(request?.message_text);

  if (stage === "ir_declarado") {
    if (/\bnao\s*declaro\b|\bnão\s*declaro\b|\bsem\s*ir\b|\bsem\s*declarar\b|\bnao\s*tenho\s*ir\b|\bnão\s*tenho\s*ir\b/.test(normalizedMessage)) {
      return "Tudo bem. Não ter IR não barra automaticamente — o sistema verifica o perfil completo para orientar o melhor caminho. Você declara Imposto de Renda? Responda *sim* ou *não*.";
    }
    if (/\bmei\b|\bsou\s*mei\b|\bmicro\s*empreendedor\b/.test(normalizedMessage)) {
      return "MEI emite CNPJ, mas o financiamento é como pessoa física. O que conta aqui é o IR do titular como PF. Você declara IR como pessoa física? Responda *sim* ou *não*.";
    }
    if (/\bainda\s*consigo\b|\bconsigo\s*sem\b|\bpossivel\s*sem\b|\bpossível\s*sem\b/.test(normalizedMessage)) {
      return "Não ter IR não trava automaticamente — o sistema verifica o perfil completo. Você declara IR? Responda *sim* ou *não*.";
    }
    if (/\btrapalha\b|\bprejudica\b|\bimpede\b|\batrapalha\b/.test(normalizedMessage)) {
      return "IR ajuda a formalizar renda, mas sua ausência não impede por conta própria — o sistema verifica. Você declara IR? Responda *sim* ou *não*.";
    }
    return "Me confirma se você declara Imposto de Renda? Responda *sim* ou *não*.";
  }

  if (stage === "autonomo_compor_renda") {
    if (/\bposso\s*tentar\s*sozinho\b|\btentar\s*sozinho\b|\bir\s*sozinho\b|\bsem\s*compor\b|\bso\s*eu\b|\bsó\s*eu\b/.test(normalizedMessage)) {
      return "Você pode sim tentar sozinho — o sistema vai verificar a viabilidade pelo seu perfil. Composição pode ampliar o perfil de análise, mas não é obrigatória.";
    }
    if (/\bpreciso\s*compor\b|\bprecisa\s*compor\b|\be\s*obrigatorio\b|\bé\s*obrigatório\b|\btem\s*que\s*compor\b/.test(normalizedMessage)) {
      return "Composição não é obrigatória. O sistema avalia o melhor caminho pelo seu perfil completo.";
    }
    if (/\bmelhora\b|\bmelhora\s*a\s*chance\b|\baumento\b|\baumenta\b|\bajuda\b|\bfaz\s*diferenca\b|\bfaz\s*diferença\b/.test(normalizedMessage)) {
      return "Compor renda pode ampliar o perfil de análise, mas a decisão de seguir solo ou em conjunto fica com o sistema após avaliar seu caso.";
    }
    return "Para autônomo sem IR, composição pode ser sugerida para ampliar o perfil de análise, mas o sistema avalia o melhor caminho.";
  }

  if (stage === "ctps_36" || stage === "ctps_36_parceiro" || stage === "ctps_36_parceiro_p3") {
    const pessoa = stage === "ctps_36" ? "você" : stage === "ctps_36_parceiro" ? "o parceiro" : "o P3";
    const label = stage === "ctps_36" ? "no seu CPF" : stage === "ctps_36_parceiro" ? "do parceiro" : "do P3";
    if (/\bprecisa\s*ser\s*seguido\b|\bprecisa\s*ser\s*continuo\b|\bininterrupto\b|\btem\s*que\s*ser\s*seguido\b/.test(normalizedMessage)) {
      return `Não precisa ser um vínculo ininterrupto — o sistema soma os períodos dos registros em CTPS. Me confirma se ${pessoa} soma 36 meses? Responda *sim* ou *não*.`;
    }
    if (/\bcarteira\s*digital\b|\bdigital\b/.test(normalizedMessage) && /\bctps\b|\bcarteira\b/.test(normalizedMessage)) {
      return `Carteira digital é aceita — o que importa é o registro, físico ou digital. Me confirma se ${pessoa} soma 36 meses ${label}? Responda *sim* ou *não*.`;
    }
    if (/\bnao\s*tenho\s*tudo\b|\bnão\s*tenho\s*tudo\b|\bnao\s*chego\b|\bnão\s*chego\b|\bfalta\b|\bnao\s*bate\b|\bnão\s*bate\b/.test(normalizedMessage)) {
      return `Mesmo sem os 36 meses o processo segue — só com impacto diferente na taxa. Me confirma se ${pessoa} soma ou não os 36 meses? Responda *sim* ou *não*.`;
    }
    if (stage === "ctps_36") return "Me confirma se você soma 36 meses de CTPS? Responda *sim* ou *não*.";
    if (stage === "ctps_36_parceiro") return "Me confirma se o parceiro soma 36 meses de CTPS? Responda *sim* ou *não*.";
    return "Me confirma se o P3 soma 36 meses de CTPS? Responda *sim* ou *não*.";
  }

  if (stage === "dependente") {
    // If composicao is known, buildDependenteGuidance provides better context-aware guidance
    const knownSlotsGate = request?.known_slots || {};
    const composicaoKnown = normalizeText(getKnownSlotValue(knownSlotsGate, "composicao"));
    if (composicaoKnown) return null;

    if (/\bnao\s*entendi\b|\bnão\s*entendi\b|\bque\s*e\s*isso\b|\bque\s*é\s*isso\b|\bpor\s*que\b|\bpra\s*que\b/.test(normalizedMessage)) {
      return "Essa etapa verifica se você tem filho menor de 18 anos ou dependente sem renda própria até terceiro grau, pois isso pode impactar o perfil de análise. Você tem dependente? Responda *sim* ou *não*.";
    }
    if (/\bnao\s*sei\b|\bnão\s*sei\b|\bnao\s*tenho\s*certeza\b|\bnão\s*tenho\s*certeza\b/.test(normalizedMessage)) {
      return "Sem problema. Para o sistema, o que conta é filho menor de 18 anos ou dependente sem renda própria até terceiro grau. Você tem dependente? Responda *sim* ou *não*.";
    }
    return "Você tem filho menor de 18 anos ou dependente sem renda até terceiro grau? Responda *sim* ou *não*.";
  }

  if (stage === "restricao" || stage === "restricao_parceiro" || stage === "restricao_parceiro_p3") {
    // If message has reprovação context (SCR/BACEN/SINAD etc.), defer to buildReprovacaoGuidance
    // Reprovação context (SCR/BACEN/SINAD/CONRES/comprometimento): defer to buildReprovacaoGuidance
    if (/\breprovad\b|\bscr\b|\bbacen\b|\bsinad\b|\bconres\b|\bcomprometimento\b/.test(normalizedMessage)) {
      return null;
    }
    const pessoa = stage === "restricao" ? "seu CPF" : stage === "restricao_parceiro" ? "o CPF do parceiro" : "o CPF do P3";
    const pronome = stage === "restricao" ? "há alguma restrição no seu CPF" : stage === "restricao_parceiro" ? "há alguma restrição no CPF do parceiro" : "há alguma restrição no CPF do P3";
    if (/\bnome\s*sujo\b|\bcpf\s*sujo\b|\bspc\b|\bserasa\b|\bnegatad[oa]\b|\bnegativad[oa]\b/.test(normalizedMessage)) {
      return `Entendi. Ter restrição não impede automaticamente — o sistema verifica a natureza e o valor para orientar o caminho certo. Me confirma se ${pronome}? Responda *sim* ou *não*.`;
    }
    if (/\bpouca\s*coisa\b|\be\s*pequeno\b|\bé\s*pequeno\b|\bpouco\s*valor\b|\bquase\s*nada\b|\bpequena\s*divida\b|\bpequena\s*dívida\b/.test(normalizedMessage)) {
      return `Entendido. O sistema verifica a situação completa para orientar o melhor caminho. Me confirma se ${pronome}? Responda *sim* ou *não*.`;
    }
    if (/\bestou\s*pagando\b|\bpagando\b|\bem\s*negociacao\b|\bem\s*negociação\b|\bjá\s*paguei\b|\bjá\s*quitei\b/.test(normalizedMessage)) {
      return `Regularização em andamento é considerada pelo sistema. Me confirma se ainda ${pronome} ativa? Responda *sim* ou *não*.`;
    }
    if (/\bisso\s*barra\b|\bvai\s*barrar\b|\bbloqueia\b|\bimpede\b|\bpassa\b|\bconsigo\b/.test(normalizedMessage)) {
      return `Restrição tem verificação específica no sistema — não é possível afirmar sem a análise completa. Me confirma se ${pronome}? Responda *sim* ou *não*.`;
    }
    if (stage === "restricao") return "Há alguma restrição no seu CPF? Responda *sim* ou *não*.";
    if (stage === "restricao_parceiro") return "Há alguma restrição no CPF do parceiro? Responda *sim* ou *não*.";
    return "Há alguma restrição no CPF do P3? Responda *sim* ou *não*.";
  }

  if (stage === "regularizacao_restricao" || stage === "regularizacao_restricao_parceiro" || stage === "regularizacao_restricao_p3") {
    const pronome = stage === "regularizacao_restricao" ? "a restrição no seu CPF foi regularizada" : stage === "regularizacao_restricao_parceiro" ? "a restrição no CPF do parceiro foi regularizada" : "a restrição no CPF do P3 foi regularizada";
    if (/\bestou\s*negociando\b|\bem\s*negociacao\b|\bem\s*negociação\b|\bnegociando\b|\bnegociacao\b|\bnegociação\b/.test(normalizedMessage)) {
      return `Negociação em andamento é um passo importante, mas o sistema precisa que a regularização esteja formalizada no CPF. Me confirma se ${pronome}? Responda *sim* ou *não*.`;
    }
    if (/\bjá\s*quitei\b|\bjá\s*paguei\b|\bquitei\b|\bpaguei\b|\bpagamento\s*feito\b/.test(normalizedMessage)) {
      return `Pagamento feito é um passo importante. Me confirma se ${pronome} e já baixou no CPF? Responda *sim* ou *não*.`;
    }
    if (/\bainda\s*nao\s*baixou\b|\bainda\s*não\s*baixou\b|\bnao\s*baixou\b|\bnão\s*baixou\b|\bpendente\s*no\s*cpf\b/.test(normalizedMessage)) {
      return `Entendido. O sistema precisa que a regularização esteja formal no CPF para considerar. Me confirma se ${pronome}? Responda *sim* ou *não*.`;
    }
    if (/\bisso\s*já\s*serve\b|\bjá\s*serve\b|\bjá\s*conta\b|\bjá\s*basta\b/.test(normalizedMessage)) {
      return `O sistema precisa que a regularização esteja formal no CPF para validar. Me confirma se ${pronome}? Responda *sim* ou *não*.`;
    }
    if (stage === "regularizacao_restricao") return "A restrição no seu CPF foi regularizada? Responda *sim* ou *não*.";
    if (stage === "regularizacao_restricao_parceiro") return "A restrição no CPF do parceiro foi regularizada? Responda *sim* ou *não*.";
    return "A restrição no CPF do P3 foi regularizada? Responda *sim* ou *não*.";
  }

  return null;
}


function buildTopoFunilGuidance(request) {
  const stage = normalizeText(request?.current_stage);
  const normalizedMessage = normalizeText(request?.message_text);

  // Padrões de saudação curta e reentrada — compartilhados nos 3 stages do topo
  const GREETING_TOPO = /^(oi+|ola|olá|opa|eae|eai|fala|bom dia|boa tarde|boa noite|e ai|e aí)\b/i;
  const REENTRY_TOPO = /\b(quero comecar|quero começar|me tira uma duvida|me tira uma dúvida|quero saber|quero entender|tenho duvida|tenho dúvida|vim saber|voltei|to de volta|tô de volta|vamos la|vamos lá)\b/i;

  if (stage === "inicio") {
    // Saudação curta / reentrada — resposta humana + reancoragem no topo
    if (GREETING_TOPO.test(normalizedMessage) || REENTRY_TOPO.test(normalizedMessage)) {
      return "Oi! Que bom ter você aqui 😊 Eu sou a Enova, assistente do programa Minha Casa Minha Vida. Posso te ajudar com dúvidas ou, se quiser, já começamos a pré-análise rapidinho.";
    }
    // Etapa 5 — global layer: FAQ/objeção/KB + reancoragem para perguntas fora do stage
    const globalReply = resolveGlobalLayerReply(normalizedMessage, _TOPO_FAQ_MAP);
    if (globalReply) return wrapWithReanchor(globalReply.reply, stage);
    if (FEAR_PATTERN.test(normalizedMessage)) {
      return "Entendo, e pode ficar tranquilo(a). É um processo seguro e transparente.";
    }
    if (NO_TIME_PATTERN.test(normalizedMessage)) {
      return "É rápido mesmo, são poucas perguntas diretas para entender seu perfil.";
    }
    return null;
  }

  if (stage === "inicio_decisao") {
    // Saudação curta / reentrada — resposta humana + reancoragem na decisão
    if (GREETING_TOPO.test(normalizedMessage) || REENTRY_TOPO.test(normalizedMessage)) {
      return "Oi! Que bom te ver de volta 😊 Você já tem um atendimento aqui. Quer continuar de onde paramos (*1*) ou prefere começar do zero (*2*)?";
    }
    if (/\b(onde parei|onde estava|em que fase|em que etapa)\b/.test(normalizedMessage)) {
      return "Você já tinha iniciado o atendimento por aqui. Continuando, eu retomo de onde paramos com seus dados anteriores.";
    }
    if (/\b(precisa|necessario|necessário|tudo de novo|recomecar|recomeçar|perder)\b/.test(normalizedMessage)) {
      return "Não precisa perder o que já avançou. Pode continuar de onde parou. Se preferir, também pode começar do zero.";
    }
    // Etapa 5 — global layer: perguntas genéricas no inicio_decisao
    const globalReply = resolveGlobalLayerReply(normalizedMessage, _TOPO_FAQ_MAP);
    if (globalReply) return wrapWithReanchor(globalReply.reply, stage);
    return "É só escolher: *1* para continuar de onde paramos ou *2* para começar do zero.";
  }

  if (stage === "inicio_programa") {
    // Saudação curta / reentrada (inclui pós-reset) — resposta humana + reancoragem
    if (GREETING_TOPO.test(normalizedMessage) || REENTRY_TOPO.test(normalizedMessage)) {
      return "Oi! Fico feliz em te ajudar 😊 O Minha Casa Minha Vida é um programa do governo com subsídio e condições especiais. Você já sabe como funciona ou prefere que eu explique rapidinho?";
    }
    if (/\bestrangeiro|estrang[ei]\b/.test(normalizedMessage)) {
      return "Estrangeiro pode sim participar, desde que tenha RNM com prazo indeterminado.";
    }
    if (/\brenda\b/.test(normalizedMessage) && /\b(minima|mínima|precisa|preciso|necessaria|necessária|quanto)\b/.test(normalizedMessage)) {
      return "A renda mínima varia conforme o imóvel e o perfil. O programa atende diferentes faixas — por isso eu analiso o seu caso específico.";
    }
    // Etapa 5 — global layer: FAQ/objeção/KB + reancoragem para perguntas fora do stage
    const globalReply = resolveGlobalLayerReply(normalizedMessage, _TOPO_FAQ_MAP);
    if (globalReply) return wrapWithReanchor(globalReply.reply, stage);
    if (NO_TIME_PATTERN.test(normalizedMessage) || /\b(rapido|rapida|demora|demorar|tempo|quanto tempo)\b/.test(normalizedMessage)) {
      return "São poucas perguntas bem diretas. Leva poucos minutos e já te dá uma orientação clara sobre o seu perfil.";
    }
    if (FEAR_PATTERN.test(normalizedMessage)) {
      return "Entendo sua preocupação. É um processo transparente e seguro. A pré-análise não gera compromisso e não tem custo.";
    }
    return "Posso te explicar qualquer detalhe. Para te orientar certinho, me confirma como prefere prosseguir.";
  }

  if (stage === "inicio_nome") {
    if (/\b(pra que|para que|por que|porque)\b.*\b(nome|chamar|precisar?)\b/i.test(normalizedMessage) ||
        /\b(precisar? do|usar o|guardar o|registrar o)\b.*\bnome\b/i.test(normalizedMessage)) {
      return "Seu nome é usado para identificar seu atendimento aqui e facilitar a comunicação.";
    }
    if (/\b(so o primeiro|só o primeiro|primeiro nome|apelido|me chama de|pode ser so|pode ser só)\b/i.test(normalizedMessage)) {
      return "Pode me passar o nome completo, com nome e sobrenome — assim fica certinho no sistema.";
    }
    if (DEFER_ACTION_PATTERN.test(normalizedMessage)) {
      return "Não tem problema, é rapidinho. Me manda só o *nome completo* para eu registrar certinho.";
    }
    return "Me passa seu *nome completo* (nome e sobrenome) para eu registrar no seu atendimento.";
  }

  if (stage === "inicio_nacionalidade") {
    if (/\b(o que e|o que é|o que significa|significa|rnm|registro nacional|registro migrat)\b/i.test(normalizedMessage)) {
      return "RNM é o Registro Nacional Migratório, documento oficial para estrangeiros residentes no Brasil. O sistema precisa verificar essa situação para seguir corretamente.";
    }
    if (/\b(estrangeiro|estrangeira)\b.*\b(pode|consigo|conseg|tentar|tenho chance|funciona)\b/i.test(normalizedMessage) ||
        /\b(ainda posso|posso sim|posso tentar)\b/i.test(normalizedMessage)) {
      return "Estrangeiro pode sim avançar, mas o sistema precisa verificar a situação documental para te orientar corretamente.";
    }
    if (/\b(muda|diferente|diferenca|diferença|muda alguma)\b/i.test(normalizedMessage)) {
      return "Para estrangeiro, o sistema verifica a situação do RNM antes de seguir. O caminho pode ser diferente dependendo da documentação.";
    }
    if (/\b(por que|pra que|para que|porque)\b.*\b(nacionalidade|brasileiro|estrangeiro)\b/i.test(normalizedMessage)) {
      return "A nacionalidade define qual caminho o sistema vai seguir — o processo para estrangeiros tem etapas adicionais de documentação.";
    }
    return "Você é *brasileiro(a)* ou *estrangeiro(a)*?";
  }

  if (stage === "inicio_rnm") {
    if (/\b(o que e|o que é|o que significa|significa|rnm|registro nacional|registro migrat[oó]rio)\b/i.test(normalizedMessage)) {
      return "RNM é o Registro Nacional Migratório — documento oficial emitido pela Polícia Federal para estrangeiros residentes no Brasil. O sistema precisa confirmar o RNM para seguir corretamente.";
    }
    if (/\b(nao sei|não sei|nao tenho certeza|não tenho certeza|nao sei se|não sei se|meu documento|conta|serve|funciona|vale)\b/i.test(normalizedMessage)) {
      return "Entendo a dúvida. O sistema precisa confirmar o RNM especificamente para seguir no trilho correto. Você possui RNM?";
    }
    if (/\b(estrangeiro|estrangeira)\b.*\b(pode|consigo|conseg|tentar|tenho chance)\b|\b(sou estrangeiro|sou estrangeira|pessoa estrangeira)\b/i.test(normalizedMessage)) {
      return "Estrangeiro pode avançar no processo, desde que o sistema confirme o RNM. Você possui RNM?";
    }
    if (/\b(documento de estrangeiro|documento estrangeiro|doc estrangeiro)\b/i.test(normalizedMessage)) {
      return "O sistema precisa confirmar o RNM especificamente para seguir no trilho correto — não posso informar se outro documento serve sem essa confirmação. Você possui RNM?";
    }
    return "Você possui *RNM*? Responda *sim* ou *não*.";
  }

  if (stage === "inicio_rnm_validade") {
    if (/\b(como sei|como saber|onde vejo|onde fica|onde esta|onde está|como descubro|onde descobre)\b/i.test(normalizedMessage)) {
      return "O prazo de validade aparece na frente do documento RNM. Se não houver data de validade impressa, é prazo indeterminado. O sistema precisa confirmar essa condição documental para seguir.";
    }
    if (/\b(nao entendi|não entendi|o que e|o que é|o que significa|diferenca|diferença|explica|o que quer dizer)\b/i.test(normalizedMessage)) {
      return "Validade *determinada* significa que há uma data de vencimento no documento. *Indeterminado* significa que não há prazo de vencimento — o documento é permanente. O sistema precisa confirmar essa condição para seguir.";
    }
    if (/\b(se tiver validade|ainda da|ainda dá|tem validade|validade definida|com validade)\b/i.test(normalizedMessage) &&
        /\b(da|dá|funciona|ainda|posso|seguir|consigo)\b/i.test(normalizedMessage)) {
      return "O sistema verifica essa condição documental para seguir no trilho correto. Não é possível avançar sem essa confirmação. Seu RNM é *com validade* ou *indeterminado*?";
    }
    return "Seu RNM é *com validade* (data definida) ou *indeterminado* (sem prazo)?";
  }

  return null;
}

function buildPhaseGuidanceReply({ request, suggestedNextSlot, pendingSlots }) {
  // Prioridade intencional: temas operacionais específicos antes de temas amplos
  // (docs/correspondente/visita) para evitar resposta genérica quando há regra fechada.
  if (isTopoFunilContext(request)) {
    const topoReply = buildTopoFunilGuidance(request);
    if (topoReply) return topoReply;
  }
  if (isComposicaoInicialContext(request)) {
    const composicaoReply = buildComposicaoInicialGuidance(request);
    if (composicaoReply) return composicaoReply;
  }
  if (isRendaTrabalhoContext(request)) {
    const rendaTrabalhoReply = buildRendaTrabalhoGuidance(request);
    if (rendaTrabalhoReply) return rendaTrabalhoReply;
  }
  if (isAprofundamentoRendaContext(request)) {
    const aprofundamentoReply = buildAprofundamentoRendaGuidance(request);
    if (aprofundamentoReply) return aprofundamentoReply;
  }
  if (isParceiroRendaContext(request)) {
    const parceiroReply = buildParceiroRendaGuidance(request);
    if (parceiroReply) return parceiroReply;
  }
  if (isFamiliarRendaContext(request)) {
    const familiarReply = buildFamiliarRendaGuidance(request);
    if (familiarReply) return familiarReply;
  }
  if (isP3RendaContext(request)) {
    const p3Reply = buildP3RendaGuidance(request);
    if (p3Reply) return p3Reply;
  }
  if (isGateFinaisContext(request)) {
    const gateFinaisReply = buildGateFinaisGuidance(request);
    if (gateFinaisReply) return gateFinaisReply;
  }
  if (isOperacionalFinalContext(request)) {
    const operacionalFinalReply = buildOperacionalFinalGuidance(request);
    if (operacionalFinalReply) return operacionalFinalReply;
  }
  if (isAluguelContext(request)) return buildAluguelGuidance(request);
  if (isUnknownDocTypeContext(request)) return buildUnknownDocTypeGuidance(request);
  if (isDocForaDeOrdemContext(request)) return buildDocForaDeOrdemGuidance(request);
  if (isDocsContext(request, pendingSlots)) return buildDocsGuidanceByProfile(request);
  if (isCorrespondenteContext(request, pendingSlots)) return buildCorrespondenteGuidance(request);
  if (isVisitaContext(request, suggestedNextSlot, pendingSlots)) return buildVisitaGuidance(request);
  if (isReprovacaoContext(request, pendingSlots)) return buildReprovacaoGuidance(request);
  if (isCtps36Context(request, pendingSlots)) return buildCtps36Guidance(request);
  if (isDependenteContext(request, pendingSlots)) return buildDependenteGuidance(request);
  if (isEstadoCivilComposicaoContext(request, pendingSlots)) {
    const estadoCivilReply = buildEstadoCivilComposicaoGuidance(request);
    if (estadoCivilReply) return estadoCivilReply;
  }
  if (isAutonomoContext(request, pendingSlots)) {
    const autonomoReply = buildAutonomoGuidance(request);
    if (autonomoReply) return autonomoReply;
  }
  return null;
}

function shouldDriveToDocuments(request, suggestedNextSlot, pendingSlots) {
  const stage = normalizeText(request?.current_stage);
  const candidateSlots = [suggestedNextSlot, ...(Array.isArray(pendingSlots) ? pendingSlots : [])]
    .map((slot) => normalizeText(slot))
    .filter(Boolean);

  return (
    candidateSlots.some((slot) => ["docs", "documentos", "correspondente"].includes(slot)) ||
    /\b(doc|documento|envio docs|envio_docs|correspondente)\b/.test(stage)
  );
}

function shouldDriveToVisit(request, suggestedNextSlot) {
  const stage = normalizeText(request?.current_stage);
  const nextSlot = normalizeText(suggestedNextSlot);
  return nextSlot === "visita" || /\b(visita|plantao|plantão|finalizacao processo|finalizacao_processo)\b/.test(stage);
}

function buildNextActionPrompt({ request, suggestedNextSlot, pendingSlots }) {
  const normalizedMessage = normalizeText(request?.message_text);
  const nextSlot = suggestedNextSlot || pendingSlots[0] || null;

  if (REMOTE_REFUSAL_PATTERN.test(normalizedMessage)) {
    return "No plantão você consegue entender melhor as opções e ver o que faz sentido para o seu perfil. Quer que eu já veja um horário de visita para você?";
  }

  if (DEFER_ACTION_PATTERN.test(normalizedMessage)) {
    if (shouldDriveToDocuments(request, suggestedNextSlot, pendingSlots)) {
      return "Quanto antes você me enviar os documentos, mais rápido eu consigo te orientar com precisão. Se quiser, já me manda agora que eu adianto sua análise.";
    }
    return `Quanto antes você me confirmar isso, mais rápido eu consigo te orientar com precisão no seu caso. ${buildSlotActionPrompt(nextSlot)}`;
  }

  if (NO_TIME_PATTERN.test(normalizedMessage)) {
    if (shouldDriveToDocuments(request, suggestedNextSlot, pendingSlots)) {
      return "É rapidinho e já adianta bastante sua análise. Se quiser, me manda o básico agora e depois a gente complementa.";
    }
    return `É rapidinho e já adianta bastante sua análise. ${buildSlotActionPrompt(nextSlot)}`;
  }

  if (shouldDriveToDocuments(request, suggestedNextSlot, pendingSlots)) {
    return buildSlotActionPrompt(suggestedNextSlot === "correspondente" ? "correspondente" : "docs");
  }

  if (shouldDriveToVisit(request, suggestedNextSlot)) {
    return buildSlotActionPrompt("visita");
  }

  if (nextSlot) {
    return buildSlotActionPrompt(nextSlot);
  }

  const topoStage = normalizeText(request?.current_stage);
  if (TOPO_FUNIL_STAGES.has(topoStage)) {
    if (topoStage === "inicio_decisao") return "Digite *1* para continuar de onde paramos ou *2* para começar do zero.";
    if (topoStage === "inicio_programa") return "Você *já sabe como funciona* o programa ou prefere que eu explique rapidinho?";
    if (topoStage === "inicio_nome") return "Me manda seu *nome completo* (nome e sobrenome).";
    if (topoStage === "inicio_nacionalidade") return "Você é *brasileiro(a)* ou *estrangeiro(a)*?";
    if (topoStage === "inicio_rnm") return "Você possui *RNM*? Responda *sim* ou *não*.";
    if (topoStage === "inicio_rnm_validade") return "Seu RNM é *com validade* (data definida) ou *indeterminado* (sem prazo)?";
    return "Pode continuar por aqui — são só algumas perguntas rápidas.";
  }

  if (COMPOSICAO_INICIAL_STAGES.has(topoStage)) {
    if (topoStage === "somar_renda_solteiro") return "Você vai somar renda com alguém ou vai seguir sozinho?";
    if (topoStage === "somar_renda_familiar") return "Me diz com qual familiar você pretende compor renda?";
    if (topoStage === "quem_pode_somar") return "Me confirma com quem você pretende compor renda?";
    if (topoStage === "interpretar_composicao") return "Me confirma se vai seguir com parceiro, familiar ou sozinho?";
  }

  if (RENDA_TRABALHO_STAGES.has(topoStage)) {
    if (topoStage === "regime_trabalho") return "Você é *CLT*, *autônomo* ou tem outro tipo de renda?";
    if (topoStage === "autonomo_ir_pergunta") return "Você já declarou IR? Responda *sim* ou *não*.";
    if (topoStage === "renda") return "Qual é o seu valor de renda mensal?";
  }

  if (APROFUNDAMENTO_RENDA_STAGES.has(topoStage)) {
    if (topoStage === "possui_renda_extra") return "Você tem alguma renda extra além da principal? Responda *sim* ou *não*.";
    if (topoStage === "inicio_multi_regime_pergunta") return "Você tem *mais algum regime de trabalho* além desse? Responda *sim* ou *não*.";
    if (topoStage === "inicio_multi_regime_coletar") return "Me diz qual é o *outro regime de trabalho*. Exemplos: *CLT*, *Autônomo*, *Servidor*, *MEI*, *Aposentado*.";
    if (topoStage === "inicio_multi_renda_pergunta") return "Você tem *mais alguma renda* além da principal? Responda *sim* ou *não*.";
    if (topoStage === "inicio_multi_renda_coletar") return "Me diz qual é a *outra renda* e o *valor mensal*. Exemplo: *Bico — 1200*.";
  }

  if (PARCEIRO_RENDA_STAGES.has(topoStage)) {
    if (topoStage === "parceiro_tem_renda") return "O parceiro tem renda? Responda *sim* ou *não*.";
    if (topoStage === "regime_trabalho_parceiro") return "Qual é o regime de trabalho do parceiro? *CLT*, *autônomo*, *servidor* ou *aposentado*?";
    if (topoStage === "inicio_multi_regime_pergunta_parceiro") return "O parceiro tem *mais algum regime de trabalho*? Responda *sim* ou *não*.";
    if (topoStage === "inicio_multi_regime_coletar_parceiro") return "Me diz qual é o *outro regime de trabalho* do parceiro. Exemplos: *CLT*, *Autônomo*, *Servidor*, *MEI*, *Aposentado*.";
    if (topoStage === "renda_parceiro") return "Qual é a renda mensal do parceiro?";
    if (topoStage === "inicio_multi_renda_pergunta_parceiro") return "O parceiro tem *mais alguma renda*? Responda *sim* ou *não*.";
    if (topoStage === "inicio_multi_renda_coletar_parceiro") return "Me diz qual é a *outra renda* do parceiro e o *valor mensal*. Exemplo: *Autônomo — 1200*.";
  }

  if (FAMILIAR_RENDA_STAGES.has(topoStage)) {
    if (topoStage === "pais_casados_civil_pergunta") return "Seus pais são casados no civil? Responda *sim* ou *não*.";
    if (topoStage === "confirmar_avo_familiar") return "Confirma que o familiar é avô ou avó? Responda *sim* ou *não*.";
    if (topoStage === "renda_familiar_valor") return "Qual é a renda mensal do familiar?";
    if (topoStage === "regime_trabalho_parceiro_familiar") return "Qual é o regime de trabalho do familiar? *CLT*, *autônomo*, *servidor* ou *aposentado*?";
    if (topoStage === "renda_parceiro_familiar") return "Qual é a renda mensal desse familiar?";
    if (topoStage === "inicio_multi_regime_familiar_pergunta") return "O familiar tem *mais algum regime de trabalho*? Responda *sim* ou *não*.";
    if (topoStage === "inicio_multi_regime_familiar_loop") return "Me diz qual é o *outro regime de trabalho* do familiar. Exemplos: *CLT*, *Autônomo*, *Servidor*, *MEI*, *Aposentado*.";
    if (topoStage === "inicio_multi_renda_familiar_pergunta") return "O familiar tem *mais alguma renda*? Responda *sim* ou *não*.";
    if (topoStage === "inicio_multi_renda_familiar_loop") return "Me diz qual é a *outra renda* do familiar e o *valor mensal*. Exemplo: *Autônomo — 1200*.";
  }

  if (P3_RENDA_STAGES.has(topoStage)) {
    if (topoStage === "p3_tipo_pergunta") return "Qual é o vínculo desta terceira pessoa com você?";
    if (topoStage === "regime_trabalho_parceiro_familiar_p3") return "Qual é o regime de trabalho do P3? *CLT*, *autônomo*, *servidor* ou *aposentado*?";
    if (topoStage === "renda_parceiro_familiar_p3") return "Qual é a renda mensal do P3?";
    if (topoStage === "inicio_multi_regime_p3_pergunta") return "O P3 tem *mais algum regime de trabalho*? Responda *sim* ou *não*.";
    if (topoStage === "inicio_multi_regime_p3_loop") return "Me diz qual é o *outro regime de trabalho* do P3. Exemplos: *CLT*, *Autônomo*, *Servidor*, *MEI*, *Aposentado*.";
    if (topoStage === "inicio_multi_renda_p3_pergunta") return "O P3 tem *mais alguma renda*? Responda *sim* ou *não*.";
    if (topoStage === "inicio_multi_renda_p3_loop") return "Me diz qual é a *outra renda* do P3 e o *valor mensal*. Exemplo: *Autônomo — 1200*.";
  }

  if (GATE_FINAIS_STAGES.has(topoStage)) {
    if (topoStage === "ir_declarado") return "Me confirma se você declara Imposto de Renda? Responda *sim* ou *não*.";
    if (topoStage === "autonomo_compor_renda") return "Você vai querer compor renda com alguém ou prefere tentar sozinho?";
    if (topoStage === "ctps_36") return "Me confirma se você soma 36 meses de CTPS? Responda *sim* ou *não*.";
    if (topoStage === "ctps_36_parceiro") return "Me confirma se o parceiro soma 36 meses de CTPS? Responda *sim* ou *não*.";
    if (topoStage === "ctps_36_parceiro_p3") return "Me confirma se o P3 soma 36 meses de CTPS? Responda *sim* ou *não*.";
    if (topoStage === "dependente") return "Você tem filho menor de 18 anos ou dependente sem renda até terceiro grau? Responda *sim* ou *não*.";
    if (topoStage === "restricao") return "Há alguma restrição no seu CPF? Responda *sim* ou *não*.";
    if (topoStage === "restricao_parceiro") return "Há alguma restrição no CPF do parceiro? Responda *sim* ou *não*.";
    if (topoStage === "restricao_parceiro_p3") return "Há alguma restrição no CPF do P3? Responda *sim* ou *não*.";
    if (topoStage === "regularizacao_restricao") return "A restrição no seu CPF foi regularizada? Responda *sim* ou *não*.";
    if (topoStage === "regularizacao_restricao_parceiro") return "A restrição no CPF do parceiro foi regularizada? Responda *sim* ou *não*.";
    if (topoStage === "regularizacao_restricao_p3") return "A restrição no CPF do P3 foi regularizada? Responda *sim* ou *não*.";
  }

  if (OPERACIONAL_FINAL_STAGES.has(topoStage)) {
    if (topoStage === "envio_docs") return "Se quiser, já pode me mandar os documentos básicos por aqui que eu adianto sua análise.";
    if (topoStage === "aguardando_retorno_correspondente") return "Se quiser, eu sigo acompanhando por aqui e te aviso assim que tiver retorno do correspondente.";
    if (topoStage === "agendamento_visita") return "Se fizer sentido para você, eu já vejo um horário dentro da agenda oficial do plantão.";
    if (topoStage === "finalizacao_processo") return "Se tiver alguma dúvida sobre o processo, pode me perguntar por aqui.";
  }

  return "Se estiver tudo certo até aqui, já me manda os documentos básicos agora que isso adianta sua análise.";
}

function ensureReplyHasNextAction(replyText, context) {
  const safeReply = sanitizeReplyText(replyText);
  const actionPrompt = sanitizeReplyText(buildNextActionPrompt(context));
  if (!safeReply) return actionPrompt;
  if (!actionPrompt) return safeReply;

  const normalizedReply = normalizeText(safeReply);
  const normalizedAction = normalizeText(actionPrompt);
  if (normalizedAction && normalizedReply.includes(normalizedAction)) return safeReply;

  return `${safeReply} ${actionPrompt}`.trim();
}

function uniqueStringArray(values, fallback = []) {
  const normalized = Array.isArray(values) ? values : fallback;
  return [...new Set(normalized.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeConflictList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const slot = String(entry.slot || "").trim();
      const reason = String(entry.reason || "").trim();
      if (!slot || !reason) return null;
      return { slot, reason };
    })
    .filter(Boolean);
}

function normalizeSlotObject(rawSlots, fallbackSlots = {}) {
  const normalized = {};
  if (!rawSlots || typeof rawSlots !== "object" || Array.isArray(rawSlots)) {
    return { ...fallbackSlots };
  }

  for (const [slotName, rawValue] of Object.entries(rawSlots)) {
    const fallback = fallbackSlots[slotName];
    if (rawValue == null) {
      if (fallback) normalized[slotName] = fallback;
      continue;
    }

    if (typeof rawValue === "object" && !Array.isArray(rawValue)) {
      const hasValue = Object.prototype.hasOwnProperty.call(rawValue, "value");
      const slotValue = hasValue ? rawValue.value : fallback?.value;
      if (slotValue == null) continue;
      normalized[slotName] = {
        value: slotValue,
        confidence: clampConfidence(rawValue.confidence, fallback?.confidence ?? 0.72),
        evidence: String(rawValue.evidence || fallback?.evidence || "").trim() || null,
        source: String(rawValue.source || fallback?.source || "openai_cognitive")
      };
      continue;
    }

    normalized[slotName] = {
      value: rawValue,
      confidence: fallback?.confidence ?? 0.72,
      evidence: fallback?.evidence || null,
      source: fallback?.source || "openai_cognitive"
    };
  }

  return {
    ...fallbackSlots,
    ...normalized
  };
}

function detectSlotsFromConversation(request) {
  const combinedText = [request.message_text, ...request.recent_messages.map((entry) => entry.text)]
    .filter(Boolean)
    .join(" | ");
  const normalized = normalizeText(combinedText);
  const slotsDetected = {};
  const consultiveNotes = [];
  const conflicts = [];

  const estadoCivil = detectEstadoCivil(normalized);
  const regimeTrabalho = detectRegime(normalized);
  const renda = detectMoney(combinedText);
  const irDeclarado = detectIr(normalized);
  const composicao = detectComposicao(normalized);
  const familiar = detectFamiliar(normalized);
  const p3 = detectP3(normalized);
  const offtrack = OFFTRACK_HINTS.test(normalized);
  const ambiguous = AMBIGUOUS_HINTS.test(normalized);

  if (estadoCivil) {
    slotsDetected.estado_civil = buildSlot(
      estadoCivil,
      ambiguous ? ESTADO_CIVIL_CONFIDENCE.ambiguous : ESTADO_CIVIL_CONFIDENCE.default,
      request.message_text
    );
  }
  if (regimeTrabalho) {
    slotsDetected.regime_trabalho = buildSlot(regimeTrabalho, 0.87, request.message_text);
  }
  if (Number.isFinite(renda)) {
    slotsDetected.renda = buildSlot(renda, 0.84, request.message_text);
  }
  if (irDeclarado) {
    slotsDetected.ir_declarado = buildSlot(irDeclarado, 0.91, request.message_text);
  }
  if (composicao) {
    slotsDetected.composicao = buildSlot(composicao.tipo, composicao.tipo === "familiar" ? 0.83 : 0.86, request.message_text);
  }
  if (familiar) {
    slotsDetected.familiar = buildSlot(familiar, 0.82, request.message_text);
  }
  if (p3) {
    slotsDetected.p3 = buildSlot(p3, 0.68, request.message_text);
    consultiveNotes.push("Há indício de composição com P3; manter a validação apenas em modo consultivo.");
  }

  if (ambiguous) {
    conflicts.push({
      slot: "ambiguous_answer",
      reason: "A resposta contém termos ambíguos e precisa de confirmação humana."
    });
  }

  if (offtrack) {
    consultiveNotes.push("Cliente trouxe dúvida fora do fluxo; responder consultivamente e retornar ao stage atual.");
  }

  return {
    normalized_text: normalized,
    slots_detected: slotsDetected,
    consultive_notes: consultiveNotes,
    conflicts,
    offtrack,
    ambiguous
  };
}

function resolveRuntimeConfig(options = {}) {
  const processEnv =
    typeof process !== "undefined" && process?.env && typeof process.env === "object" ? process.env : {};
  const fetchImpl =
    typeof options.fetchImpl === "function"
      ? options.fetchImpl
      : typeof globalThis?.fetch === "function"
        ? globalThis.fetch.bind(globalThis)
        : null;
  const openaiApiKey =
    typeof options.openaiApiKey === "string" && options.openaiApiKey.trim()
      ? options.openaiApiKey.trim()
      : String(processEnv.OPENAI_API_KEY_PROD || "").trim() || null;
  const model =
    typeof options.model === "string" && options.model.trim()
      ? options.model.trim()
      : String(processEnv.COGNITIVE_AI_MODEL || DEFAULT_COGNITIVE_AI_MODEL).trim();

  return {
    fetchImpl,
    openaiApiKey,
    model,
    normativeContext: Array.isArray(options.normativeContext) ? options.normativeContext : null
  };
}

function buildNormativeContext(request, runtimeConfig) {
  const hasRuntimeNormativeContext =
    Array.isArray(runtimeConfig?.normativeContext) && runtimeConfig.normativeContext.length > 0;
  const rawContext = hasRuntimeNormativeContext
    ? runtimeConfig.normativeContext
    : request.normative_context;

  return Array.isArray(rawContext)
    ? rawContext
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const title = String(entry.title || "").trim();
          const content = String(entry.content || "").trim();
          if (!title && !content) return null;
          return {
            title: title || "Normative context",
            content,
            source: String(entry.source || "").trim() || null
          };
        })
        .filter(Boolean)
    : [];
}

function buildOpenAISystemPrompt() {
  return [
    "Você é o Enova Cognitive Engine read-only da fase 3, especialista consultivo em MCMV/CEF da Enova.",
    "Converse em português do Brasil de forma humana, natural, consultiva e objetiva.",
    "Interprete respostas abertas, extraia slots úteis, sugira a próxima melhor pergunta e aponte ambiguidades.",
    "Toda resposta deve acolher brevemente, orientar com firmeza e fechar com uma próxima ação concreta.",
    "Nunca deixe a resposta aberta: sempre conduza para envio de documentos, próxima pergunta do funil ou agendamento de visita, conforme o contexto.",
    "Você NÃO pode aprovar financiamento, NÃO pode alterar o stage oficial, NÃO pode inventar regra fora do contrato ou do contexto normativo recebido.",
    "Você NÃO pode acionar produção, Meta, Supabase oficial ou qualquer side effect.",
    "Responda APENAS JSON válido compatível com este contrato:",
    JSON.stringify({
      reply_text: "string",
      slots_detected: {
        slot_name: {
          value: "unknown",
          confidence: 0.0,
          evidence: "string|null",
          source: "openai_cognitive"
        }
      },
      pending_slots: ["string"],
      conflicts: [{ slot: "string", reason: "string" }],
      suggested_next_slot: "string|null",
      consultive_notes: ["string"],
      should_request_confirmation: false,
      should_advance_stage: false,
      confidence: 0.0
    }),
    "Se faltar sinal suficiente, mantenha slots_detected vazio e use reply_text consultivo com chamada para ação.",
    "Sempre preserve should_advance_stage=false."
  ].join(" ");
}

function buildOpenAIUserPrompt(request, analysis, normativeContext) {
  return JSON.stringify({
    task: "enova_cognitive_phase_3_read_only",
    request: {
      version: request.version,
      channel: request.channel,
      conversation_id: request.conversation_id,
      current_stage: request.current_stage,
      message_text: request.message_text,
      history: request.recent_messages,
      known_slots: request.known_slots,
      pending_slots: request.pending_slots
    },
    slot_contract: COGNITIVE_SLOT_CONTRACT,
    slot_dependencies: COGNITIVE_SLOT_DEPENDENCIES,
    normative_context: normativeContext,
    safety_contract: {
      should_advance_stage: false,
      official_write_count: 0,
      would_send_meta: false,
      production_activation: false
    },
    analysis_seed: {
      slots_detected: analysis.slots_detected,
      pending_slots: buildPendingSlots(request, analysis.slots_detected),
      conflicts: analysis.conflicts,
      suggested_next_slot: buildSuggestedNextSlot(buildPendingSlots(request, analysis.slots_detected), analysis.conflicts),
      consultive_notes: analysis.consultive_notes,
      offtrack: analysis.offtrack,
      ambiguous: analysis.ambiguous
    }
  });
}

async function callOpenAIReadOnly(runtimeConfig, prompt) {
  if (!runtimeConfig?.openaiApiKey || !runtimeConfig?.fetchImpl) {
    return { ok: false, reason: "missing_openai_config", raw: null, parsed: null };
  }

  let response;
  try {
    response = await runtimeConfig.fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtimeConfig.openaiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: runtimeConfig.model || DEFAULT_COGNITIVE_AI_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user }
        ]
      })
    });
  } catch {
    return { ok: false, reason: "openai_fetch_failed", raw: null, parsed: null };
  }

  if (!response?.ok) {
    return { ok: false, reason: `openai_http_${response?.status || "error"}`, raw: null, parsed: null };
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    return { ok: false, reason: "openai_invalid_json", raw: null, parsed: null };
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    return { ok: false, reason: "openai_empty_content", raw: content ?? null, parsed: null };
  }

  try {
    return {
      ok: true,
      reason: null,
      raw: content,
      parsed: JSON.parse(content)
    };
  } catch {
    return { ok: false, reason: "openai_parse_failed", raw: content, parsed: null };
  }
}

function detectKnownSlotConflicts(knownSlots, detectedSlots) {
  const conflicts = [];
  for (const [slot, detected] of Object.entries(detectedSlots)) {
    const existing = knownSlots?.[slot];
    if (!existing) continue;
    const knownValue = typeof existing === "object" && existing !== null && "value" in existing ? existing.value : existing;
    if (knownValue == null) continue;
    if (String(knownValue) !== String(detected.value)) {
      conflicts.push({
        slot,
        reason: `Valor detectado (${detected.value}) diverge do valor já conhecido (${knownValue}).`
      });
    }
  }
  return conflicts;
}

function buildPendingSlots(request, detectedSlots) {
  const seed = request.pending_slots.length
    ? request.pending_slots
    : STAGE_DEFAULT_PENDING_SLOTS[request.current_stage] || [];
  return [...new Set(seed.filter((slot) => !detectedSlots[slot]))];
}

function buildSuggestedNextSlot(pendingSlots, conflicts) {
  if (conflicts.some((conflict) => conflict.slot === "ambiguous_answer")) return "confirmacao_humana";
  return pendingSlots[0] || null;
}

function buildReplyText({ request, detectedSlots, pendingSlots, suggestedNextSlot, conflicts, offtrack }) {
  const phaseGuidanceReply = buildPhaseGuidanceReply({
    request,
    suggestedNextSlot,
    pendingSlots
  });

  if (phaseGuidanceReply) {
    return ensureReplyHasNextAction(phaseGuidanceReply, {
      request,
      pendingSlots,
      suggestedNextSlot
    });
  }

  if (offtrack) {
    return ensureReplyHasNextAction(
      "Entendi sua dúvida, e eu te explico isso com segurança, mas antes preciso fechar esta etapa para te orientar com mais precisão.",
      { request, pendingSlots, suggestedNextSlot }
    );
  }

  if (conflicts.length) {
    return ensureReplyHasNextAction(
      "Entendi sua resposta, mas ela ficou ambígua e eu prefiro alinhar isso certinho antes de seguir, para te orientar do jeito certo.",
      { request, pendingSlots, suggestedNextSlot: suggestedNextSlot || conflicts[0]?.slot || request.current_stage }
    );
  }

  const detectedKeys = Object.keys(detectedSlots);
  if (!detectedKeys.length) {
    return ensureReplyHasNextAction(
      "Entendi, mas ainda preciso de um ponto objetivo seu para conseguir te orientar com segurança no próximo passo.",
      { request, pendingSlots, suggestedNextSlot }
    );
  }

  if (detectedKeys.length > 2) {
    return ensureReplyHasNextAction(
      "Perfeito, isso já adianta bastante sua análise e me dá um bom contexto do seu perfil.",
      { request, pendingSlots, suggestedNextSlot }
    );
  }

  return ensureReplyHasNextAction(
    "Perfeito, já entendi o ponto principal da sua resposta e consigo te conduzir com mais precisão daqui para frente.",
    { request, pendingSlots, suggestedNextSlot }
  );
}

function buildHeuristicResponse(request, analysis, conflictList) {
  const pendingSlots = buildPendingSlots(request, analysis.slots_detected);
  const suggestedNextSlot = buildSuggestedNextSlot(pendingSlots, conflictList);
  const slotsDetectedCount = Object.keys(analysis.slots_detected).length;
  const shouldRequestConfirmation =
    conflictList.length > 0 ||
    slotsDetectedCount > 3 ||
    Object.keys(analysis.slots_detected).some((slot) => CONFIRMATION_SLOT_KEYS.has(slot));

  const consultiveNotes = [...analysis.consultive_notes];
  if (slotsDetectedCount > 2) {
    consultiveNotes.push("A resposta concentrou múltiplos slots; revisar a ordem canônica apenas fora do fluxo real.");
  }
  if (suggestedNextSlot) {
    consultiveNotes.push(`Próximo slot sugerido em modo read-only: ${suggestedNextSlot}.`);
  }
  consultiveNotes.push("Runner isolado: sem write oficial, sem Meta real e sem alteração de stage.");

  const confidenceBase = slotsDetectedCount
    ? CONFIDENCE_RULES.detectedBase + Math.min(slotsDetectedCount, 4) * CONFIDENCE_RULES.detectedIncrement
    : analysis.offtrack ? CONFIDENCE_RULES.offtrackBase
    : TOPO_FUNIL_STAGES.has(request.current_stage) ? 0.72 // topo: phase guidance is the signal; floor above COGNITIVE_V1_CONFIDENCE_MIN (0.66)
    : COMPOSICAO_INICIAL_STAGES.has(request.current_stage) ? 0.70 // composicao inicial: guidance floor above min
    : RENDA_TRABALHO_STAGES.has(request.current_stage) ? 0.70 // renda/trabalho: guidance floor above min
    : APROFUNDAMENTO_RENDA_STAGES.has(request.current_stage) ? 0.70 // aprofundamento renda: guidance floor above min
    : PARCEIRO_RENDA_STAGES.has(request.current_stage) ? 0.70 // parceiro: guidance floor above min
    : FAMILIAR_RENDA_STAGES.has(request.current_stage) ? 0.70 // familiar: guidance floor above min
    : P3_RENDA_STAGES.has(request.current_stage) ? 0.70 // p3: guidance floor above min
    : GATE_FINAIS_STAGES.has(request.current_stage) ? 0.70 // gate finais: guidance floor above min
    : OPERACIONAL_FINAL_STAGES.has(request.current_stage) ? 0.70 // bloco operacional final: guidance floor above min
    : CONFIDENCE_RULES.noSlotBase;
  const confidencePenalty =
    conflictList.length * CONFIDENCE_RULES.conflictPenalty +
    (analysis.offtrack ? CONFIDENCE_RULES.offtrackPenalty : 0);
  // Topo stage com phase guidance como sinal: piso acima de COGNITIVE_V1_CONFIDENCE_MIN (0.66)
  // para que penalidades de ambiguidade/conflito não suprimam a guidance do topo.
  // 0.68 = margem de 0.02 acima do threshold 0.66, sobrevive a penalidades parciais.
  const topoGuidanceFloor = TOPO_FUNIL_STAGES.has(request.current_stage) && !slotsDetectedCount ? 0.68 : 0.05;
  const confidence = Math.max(topoGuidanceFloor, Math.min(0.99, Number((confidenceBase - confidencePenalty).toFixed(2))));

  return {
    reply_text: buildReplyText({
      request,
      detectedSlots: analysis.slots_detected,
      pendingSlots,
      suggestedNextSlot,
      conflicts: conflictList,
      offtrack: analysis.offtrack
    }),
    slots_detected: analysis.slots_detected,
    pending_slots: pendingSlots,
    conflicts: conflictList,
    suggested_next_slot: suggestedNextSlot,
    consultive_notes: consultiveNotes,
    should_request_confirmation: shouldRequestConfirmation,
    should_advance_stage: false,
    confidence
  };
}

function normalizeModelResponse({
  request,
  analysis,
  heuristicResponse,
  modelResponse,
  llmUsed
}) {
  if (!modelResponse || typeof modelResponse !== "object") {
    return heuristicResponse;
  }

  const slotsDetected = normalizeSlotObject(modelResponse.slots_detected, heuristicResponse.slots_detected);
  const conflicts = [
    ...heuristicResponse.conflicts,
    ...normalizeConflictList(modelResponse.conflicts)
  ].filter(
    (entry, index, array) =>
      array.findIndex((candidate) => candidate.slot === entry.slot && candidate.reason === entry.reason) === index
  );
  const pendingSlots = uniqueStringArray(
    modelResponse.pending_slots,
    buildPendingSlots(request, slotsDetected)
  );
  const suggestedNextSlot =
    typeof modelResponse.suggested_next_slot === "string" && modelResponse.suggested_next_slot.trim()
      ? modelResponse.suggested_next_slot.trim()
      : buildSuggestedNextSlot(pendingSlots, conflicts);
  const consultiveNotes = uniqueStringArray([
    ...heuristicResponse.consultive_notes,
    ...(Array.isArray(modelResponse.consultive_notes) ? modelResponse.consultive_notes : []),
    llmUsed ? `Modelo cognitivo read-only utilizado: ${request.current_stage}.` : null
  ]);
  const parsedReplyText = sanitizeReplyText(modelResponse.reply_text);
  const hasParsedReplyText = parsedReplyText && parsedReplyText.trim().length > 0;
  const existingReplyFallback =
    sanitizeReplyText(modelResponse.human_response) ||
    heuristicResponse.reply_text;
  const normalizedMessage = normalizeText(request.message_text);
  const phaseGuidanceReply = buildPhaseGuidanceReply({
    request,
    suggestedNextSlot,
    pendingSlots
  });
  if (phaseGuidanceReply) {
    return {
      reply_text: ensureReplyHasNextAction(phaseGuidanceReply, {
        request,
        pendingSlots,
        suggestedNextSlot
      }),
      slots_detected: slotsDetected,
      pending_slots: pendingSlots,
      conflicts,
      suggested_next_slot: suggestedNextSlot,
      consultive_notes: consultiveNotes,
      should_request_confirmation:
        typeof modelResponse.should_request_confirmation === "boolean"
          ? modelResponse.should_request_confirmation || conflicts.length > 0
          : heuristicResponse.should_request_confirmation || conflicts.length > 0,
      should_advance_stage: false,
      confidence: clampConfidence(
        modelResponse.confidence,
        heuristicResponse.confidence
      )
    };
  }
  const preferHeuristicReply =
    analysis.offtrack ||
    conflicts.length > 0 ||
    Object.keys(slotsDetected).length === 0 ||
    DEFER_ACTION_PATTERN.test(normalizedMessage) ||
    NO_TIME_PATTERN.test(normalizedMessage) ||
    REMOTE_REFUSAL_PATTERN.test(normalizedMessage);
  const replyText = hasParsedReplyText
    ? parsedReplyText
    : preferHeuristicReply
      ? heuristicResponse.reply_text
      : existingReplyFallback;
  const shouldRequestConfirmation =
    typeof modelResponse.should_request_confirmation === "boolean"
      ? modelResponse.should_request_confirmation || conflicts.length > 0
      : heuristicResponse.should_request_confirmation || conflicts.length > 0;

  return {
    reply_text: ensureReplyHasNextAction(replyText, {
      request,
      pendingSlots,
      suggestedNextSlot
    }),
    slots_detected: slotsDetected,
    pending_slots: pendingSlots,
    conflicts,
    suggested_next_slot: suggestedNextSlot,
    consultive_notes: consultiveNotes,
    should_request_confirmation: shouldRequestConfirmation,
    should_advance_stage: false,
    confidence: clampConfidence(
      modelResponse.confidence,
      heuristicResponse.confidence
    )
  };
}

export function validateReadOnlyCognitiveResponse(response) {
  const errors = [];
  const value = response && typeof response === "object" ? response : null;

  if (!value) errors.push("response must be an object");
  for (const field of REQUIRED_RESPONSE_FIELDS) {
    if (!value || !(field in value)) errors.push(`missing field: ${field}`);
  }

  if (value && typeof value.reply_text !== "string") errors.push("reply_text must be a string");
  if (value && (!value.slots_detected || typeof value.slots_detected !== "object" || Array.isArray(value.slots_detected))) {
    errors.push("slots_detected must be an object");
  }
  if (value && !Array.isArray(value.pending_slots)) errors.push("pending_slots must be an array");
  if (value && !Array.isArray(value.conflicts)) errors.push("conflicts must be an array");
  if (value && !(typeof value.suggested_next_slot === "string" || value.suggested_next_slot === null)) {
    errors.push("suggested_next_slot must be string|null");
  }
  if (value && !Array.isArray(value.consultive_notes)) errors.push("consultive_notes must be an array");
  if (value && typeof value.should_request_confirmation !== "boolean") {
    errors.push("should_request_confirmation must be boolean");
  }
  if (value && value.should_advance_stage !== false) errors.push("should_advance_stage must be false");
  if (value && (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1)) {
    errors.push("confidence must be a number between 0 and 1");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function listReadOnlyCognitiveFixtures() {
  return READ_ONLY_COGNITIVE_FIXTURES.map((fixture) => ({
    id: fixture.id,
    title: fixture.title,
    current_stage: fixture.input.current_stage
  }));
}

export function getReadOnlyCognitiveFixtureById(fixtureId) {
  if (!fixtureId) return null;
  return READ_ONLY_COGNITIVE_FIXTURES.find((fixture) => fixture.id === fixtureId) || null;
}

export async function runReadOnlyCognitiveEngine(rawInput = {}, options = {}) {
  const request = normalizeRequest(rawInput);
  const analysis = detectSlotsFromConversation(request);
  const knownSlotConflicts = detectKnownSlotConflicts(request.known_slots, analysis.slots_detected);
  const conflicts = [...analysis.conflicts, ...knownSlotConflicts];
  const heuristicResponse = buildHeuristicResponse(request, analysis, conflicts);
  const runtimeConfig = resolveRuntimeConfig(options);
  const normativeContext = buildNormativeContext(request, runtimeConfig);
  const prompt = {
    system: buildOpenAISystemPrompt(),
    user: buildOpenAIUserPrompt(request, analysis, normativeContext)
  };
  const llmResult = await callOpenAIReadOnly(runtimeConfig, prompt);
  const llmAttempted = llmResult.ok || llmResult.reason !== "missing_openai_config";
  const llmError = llmAttempted && !llmResult.ok ? llmResult.reason : null;
  const fallbackUsed = !llmResult.ok;
  const response = normalizeModelResponse({
    request,
    analysis,
    heuristicResponse,
    modelResponse: llmResult.parsed,
    llmUsed: llmResult.ok
  });

  const validation = validateReadOnlyCognitiveResponse(response);

  return {
    ok: validation.valid,
    mode: "read_only_test",
    request,
    response,
    llm_raw_response: llmResult.raw ?? null,
    llm_parsed_response: llmResult.parsed ?? null,
    validation,
    engine: {
      llm_attempted: llmAttempted,
      llm_requested: Boolean(runtimeConfig.openaiApiKey),
      llm_used: llmResult.ok,
      llm_error: llmError,
      fallback_used: fallbackUsed,
      provider: llmResult.ok ? "openai" : "heuristic_fallback",
      model: runtimeConfig.openaiApiKey ? runtimeConfig.model : null,
      fallback_reason: llmResult.ok ? null : llmResult.reason
    }
  };
}

function parseCliArgs(argv) {
  const parsed = {};
  for (const rawArg of argv) {
    if (!rawArg.startsWith("--")) continue;
    const [key, ...rest] = rawArg.slice(2).split("=");
    parsed[key] = rest.length ? rest.join("=") : true;
  }
  return parsed;
}

async function runCli() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args["list-fixtures"]) {
    console.log(JSON.stringify({ ok: true, fixtures: listReadOnlyCognitiveFixtures() }, null, 2));
    return;
  }

  if (typeof args.fixture === "string") {
    const fixture = getReadOnlyCognitiveFixtureById(args.fixture);
    if (!fixture) {
      console.error(JSON.stringify({ ok: false, error: "fixture_not_found", fixture_id: args.fixture }, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(await runReadOnlyCognitiveEngine(fixture.input), null, 2));
    return;
  }

  if (typeof args.json === "string") {
    console.log(JSON.stringify(await runReadOnlyCognitiveEngine(JSON.parse(args.json)), null, 2));
    return;
  }

  console.log(
    JSON.stringify(
      {
        ok: false,
        error: "usage",
        details: "Use --list-fixtures, --fixture=<id> ou --json='<payload>'."
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}

if (
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  /run-cognitive\.js$/.test(process.argv[1])
) {
  await runCli();
}
