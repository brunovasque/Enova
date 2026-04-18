/**
 * cognitive-contract.js — Contrato canônico worker ↔ cognitivo
 *
 * Define o shape de entrada (worker → cognitivo) e saída (cognitivo → worker).
 * Este é o contrato único e estável. Nenhum outro formato paralelo deve existir.
 *
 * ─── Responsabilidades ───────────────────────────────────────────────
 * Worker é dono de: stage, gate, parser, nextStage, persistência, envio final
 * Cognitivo é dono de: reply_text, signal, confidence, needs_confirmation,
 *                       slots_detected, pending_slots, conflicts, reason_codes
 *
 * ─── Regra central ───────────────────────────────────────────────────
 * O worker valida SOMENTE o sinal (signal). Nunca reescreve reply_text.
 * No caminho cognitivo normal: surface_sent_to_customer === reply_text
 */

// ── Canonical INPUT shape (worker → cognitivo) ─────────────────────────────

/**
 * buildCognitiveInput — Constrói o payload canônico de entrada para o cognitivo.
 *
 * @param {object} params
 * @param {string} params.current_stage — Stage atual do funil
 * @param {string} params.message_text — Texto da mensagem do cliente
 * @param {object} params.known_slots — Slots já coletados { slot_name: { value } }
 * @param {string} params.goal_of_current_stage — Objetivo do stage atual
 * @param {string[]} params.forbidden_topics_for_stage — Tópicos proibidos para este stage
 * @param {string[]} params.allowed_signals_for_stage — Sinais permitidos para este stage
 * @param {object[]} [params.normative_context] — Contexto normativo útil do MCMV
 * @param {object[]} [params.recent_messages] — Memória útil estritamente necessária
 * @param {object} [params.stage_contract] — Contrato cognitivo-mecânico do stage (PR2)
 * @returns {CognitiveInput}
 */
export function buildCognitiveInput({
  current_stage,
  message_text,
  known_slots = {},
  goal_of_current_stage = "",
  forbidden_topics_for_stage = [],
  allowed_signals_for_stage = [],
  normative_context = [],
  recent_messages = [],
  stage_contract = null
} = {}) {
  return Object.freeze({
    current_stage: String(current_stage || "inicio"),
    message_text: String(message_text || ""),
    known_slots: known_slots && typeof known_slots === "object" ? { ...known_slots } : {},
    goal_of_current_stage: String(goal_of_current_stage || ""),
    forbidden_topics_for_stage: Array.isArray(forbidden_topics_for_stage) ? [...forbidden_topics_for_stage] : [],
    allowed_signals_for_stage: Array.isArray(allowed_signals_for_stage) ? [...allowed_signals_for_stage] : [],
    normative_context: Array.isArray(normative_context) ? [...normative_context] : [],
    recent_messages: Array.isArray(recent_messages) ? [...recent_messages] : [],
    stage_contract: stage_contract && typeof stage_contract === "object" ? { ...stage_contract } : null
  });
}

// ── Canonical OUTPUT shape (cognitivo → worker) ────────────────────────────

/**
 * buildCognitiveOutput — Constrói o payload canônico de saída do cognitivo.
 *
 * @param {object} params
 * @param {string} params.reply_text — Fala final para o cliente (soberana)
 * @param {string|null} params.signal — Sinal estruturado da rodada (e.g. "estado_civil:casado")
 * @param {number} params.confidence — Confiança [0,1]
 * @param {boolean} params.needs_confirmation — Precisa de confirmação do cliente?
 * @param {object} params.slots_detected — Slots detectados { name: { value, raw } }
 * @param {string[]} params.pending_slots — Slots pendentes
 * @param {object[]} params.conflicts — Conflitos detectados
 * @param {string[]} params.reason_codes — Códigos de razão para decisão
 * @param {string} params.speech_origin — Origem da fala: "llm_real" | "heuristic_guidance" | "fallback_mechanical"
 * @returns {CognitiveOutput}
 */
export function buildCognitiveOutput({
  reply_text = "",
  signal = null,
  confidence = 0,
  needs_confirmation = false,
  slots_detected = {},
  pending_slots = [],
  conflicts = [],
  reason_codes = [],
  speech_origin = "fallback_mechanical"
} = {}) {
  return Object.freeze({
    reply_text: String(reply_text || ""),
    signal: signal != null ? String(signal) : null,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    needs_confirmation: Boolean(needs_confirmation),
    slots_detected: slots_detected && typeof slots_detected === "object" ? { ...slots_detected } : {},
    pending_slots: Array.isArray(pending_slots) ? [...pending_slots] : [],
    conflicts: Array.isArray(conflicts) ? [...conflicts] : [],
    reason_codes: Array.isArray(reason_codes) ? [...reason_codes] : [],
    speech_origin: String(speech_origin || "fallback_mechanical")
  });
}

// ── Signal validation (worker-side) ────────────────────────────────────────

/**
 * ALLOWED_SIGNALS_BY_STAGE — Mapa de sinais permitidos por stage.
 * O worker usa isso para validar se o signal do cognitivo é compatível.
 * Ele NÃO julga reply_text; apenas valida o sinal.
 */
const ALLOWED_SIGNAL_PREFIXES = Object.freeze({
  estado_civil:       ["estado_civil:"],
  confirmar_casamento: ["estado_civil:"],
  financiamento_conjunto: ["composicao:"],
  quem_pode_somar:    ["composicao:"],
  interpretar_composicao: ["composicao:"],
  somar_renda_solteiro: ["composicao:"],
  somar_renda_familiar: ["composicao:"],
  regime_trabalho:    ["regime:"],
  autonomo_ir_pergunta: ["ir:"],
  renda:              ["renda:"],
  ir_declarado:       ["ir:"]
});

/**
 * validateSignal — Valida se o signal do cognitivo é compatível com o stage.
 *
 * @param {string} stage — Stage atual do funil
 * @param {string|null} signal — Signal retornado pelo cognitivo
 * @returns {{ valid: boolean, reason: string }}
 */
export function validateSignal(stage, signal) {
  if (!signal) {
    return { valid: true, reason: "no_signal" };
  }
  const prefixes = ALLOWED_SIGNAL_PREFIXES[stage];
  if (!prefixes) {
    // Stages sem mapa de sinais: aceitar qualquer sinal (operacionais, gates, etc.)
    return { valid: true, reason: "no_prefix_restriction" };
  }
  const signalStr = String(signal);
  const isCompatible = prefixes.some(prefix => signalStr.startsWith(prefix));
  return {
    valid: isCompatible,
    reason: isCompatible ? "signal_compatible" : "signal_incompatible"
  };
}

// ── Telemetry shape for separation of responsibilities ──────────────────────

/**
 * buildSeparationTelemetry — Constrói telemetria que prova a separação de responsabilidades.
 *
 * @param {object} params
 * @returns {object} Telemetria canônica
 */
export function buildSeparationTelemetry({
  stage_before = null,
  stage_after = null,
  reply_text_from_cognitive = null,
  signal_from_cognitive = null,
  signal_validated_by_worker = false,
  signal_validation_result = null,
  surface_sent_to_customer = null,
  needs_confirmation = false,
  confidence = null,
  advance_allowed = false,
  advance_block_reason = null
} = {}) {
  const surfaceEqualReplyText = (
    reply_text_from_cognitive != null &&
    surface_sent_to_customer != null &&
    surface_sent_to_customer === reply_text_from_cognitive
  );
  return {
    stage_before,
    stage_after,
    reply_text_from_cognitive: reply_text_from_cognitive != null ? String(reply_text_from_cognitive).slice(0, 500) : null,
    signal_from_cognitive,
    signal_validated_by_worker,
    signal_validation_result,
    surface_sent_to_customer: surface_sent_to_customer != null ? String(surface_sent_to_customer).slice(0, 500) : null,
    surface_equal_reply_text: surfaceEqualReplyText,
    worker_rewrote_reply: !surfaceEqualReplyText && reply_text_from_cognitive != null,
    needs_confirmation,
    confidence,
    advance_allowed,
    advance_block_reason
  };
}

// ── Stage goals (used by buildCognitiveInput) ──────────────────────────────

const STAGE_GOALS = Object.freeze({
  inicio: "Acolher o cliente e entender o motivo do contato",
  inicio_decisao: "Confirmar se o cliente quer seguir com o Minha Casa Minha Vida",
  inicio_programa: "Confirmar interesse e apresentar o programa",
  inicio_nome: "Coletar o nome do cliente",
  inicio_nacionalidade: "Verificar nacionalidade do cliente",
  inicio_rnm: "Coletar RNM do cliente estrangeiro",
  inicio_rnm_validade: "Verificar validade do RNM",
  estado_civil: "Coletar o estado civil do cliente",
  confirmar_casamento: "Confirmar tipo de casamento",
  financiamento_conjunto: "Definir se financiamento será conjunto",
  quem_pode_somar: "Identificar quem pode somar renda",
  interpretar_composicao: "Interpretar tipo de composição de renda",
  somar_renda_solteiro: "Definir composição de renda (solteiro)",
  somar_renda_familiar: "Definir composição de renda (casado/familiar)",
  regime_trabalho: "Coletar regime de trabalho",
  autonomo_ir_pergunta: "Verificar se autônomo declara IR",
  renda: "Coletar a renda mensal do cliente",
  ir_declarado: "Confirmar se declara IR",
  envio_docs: "Orientar envio de documentos",
  agendamento_visita: "Agendar visita ao imóvel",
  visita_confirmada: "Confirmar detalhes da visita",
  finalizacao_processo: "Finalizar processo",
  aguardando_retorno_correspondente: "Aguardar retorno do correspondente"
});

// ── Bucket-aware goals for inicio_programa ─────────────────────────────────
// When the topo bucket is known, the goal is more specific than the generic
// inicio_programa goal. This prevents how_it_works from collapsing with greeting.
const INICIO_PROGRAMA_BUCKET_GOALS = Object.freeze({
  greeting: "Saudação acolhedora: apresente-se como Enova, assistente do Minha Casa Minha Vida. Pergunte se o cliente já sabe como funciona ou quer explicação. REGRA DE VARIAÇÃO: varie o tom e a forma da saudação a cada interação — use abordagens diferentes (calorosa, leve, direta, simpática, curiosa). NÃO repita a mesma estrutura fixa de abertura. Seja natural e humana, como uma pessoa real que cumprimenta de formas diferentes a cada vez. Mantenha curto (2-3 frases no máximo).",
  identity: "O cliente perguntou quem você é. Explique que você é a Enova, assistente virtual do Minha Casa Minha Vida. NÃO repita saudação de boas-vindas.",
  how_it_works: "O cliente pediu explicação do programa. EXPLIQUE o Minha Casa Minha Vida: programa do governo que oferece subsídio na entrada e parcela reduzida conforme renda familiar. Mencione benefícios reais (subsídio, faixas, parcela). NÃO pergunte 'já sabe como funciona?' — ele já disse que quer explicação. Ao final, pergunte se quer seguir com a análise.",
  program_choice: "Pergunte ao cliente se já sabe como funciona o Minha Casa Minha Vida ou se quer explicação.",
  unknown_topo: "Confirmar interesse e apresentar o programa Minha Casa Minha Vida"
});

/**
 * getStageGoal — Retorna o objetivo do stage.
 * @param {string} stage — Stage atual
 * @param {string} [bucket] — Bucket do topo (opcional). Se fornecido para inicio_programa, retorna goal específico do bucket.
 */
export function getStageGoal(stage, bucket) {
  if (stage === "inicio_programa" && bucket && INICIO_PROGRAMA_BUCKET_GOALS[bucket]) {
    return INICIO_PROGRAMA_BUCKET_GOALS[bucket];
  }
  return STAGE_GOALS[stage] || "Conduzir a conversa com o cliente";
}

/**
 * getAllowedSignalsForStage — Retorna prefixos de sinais permitidos para o stage.
 */
export function getAllowedSignalsForStage(stage) {
  return ALLOWED_SIGNAL_PREFIXES[stage] || [];
}

// ── Stage Contract: contrato cognitivo-mecânico por stage ───────────────────
// PR1 — Fundação do contrato entre camada mecânica e camada cognitiva.
//
// O mecânico permanece soberano em: stage, gate, parse, nextStage, regras, micro regras.
// O cognitivo recebe este contrato estruturado e o usa como fonte de verdade
// para formular a fala ao cliente (renderer futuro em PR2).
//
// STAGE_CONTRACT_METADATA: dados estáticos por stage derivados do mecânico existente.
// buildStageContract(): monta o objeto de contrato no turno, usando dados do state + metadata.
// ────────────────────────────────────────────────────────────────────────────

/**
 * STAGE_CONTRACT_METADATA — Metadados canônicos do contrato por stage.
 *
 * Campos:
 *   expected_slot: slot que o mecânico espera coletar neste stage
 *   allowed_topics_now: tópicos que o cognitivo pode abordar
 *   forbidden_topics_now: tópicos que o cognitivo NÃO pode tocar
 *   stage_micro_rules: regras finas do stage que o cognitivo deve respeitar
 *   brief_answer_allowed: se o stage aceita resposta curta sim/não
 *   canonical_prompt: prompt canônico que o mecânico usaria (fallback reference)
 *   return_to_stage_prompt: frase para trazer o cliente de volta ao stage
 *   fallback_prompt: frase de segurança se tudo falhar
 *
 * Derivados das regras mecânicas existentes (COGNITIVE_PLAYBOOK_V1, STAGE_GOALS,
 * _MINIMAL_FALLBACK_SPEECH_MAP, ALLOWED_SIGNAL_PREFIXES). Nenhuma regra nova inventada.
 */
const STAGE_CONTRACT_METADATA = Object.freeze({
  inicio_programa: {
    expected_slot: null,
    allowed_topics_now: ["apresentacao_programa", "duvida_mcmv", "duvida_fgts", "duvida_entrada", "duvida_renda_minima"],
    forbidden_topics_now: ["coleta_nome", "coleta_estado_civil", "coleta_renda", "coleta_documentos", "valor_parcela", "valor_entrada", "aprovacao"],
    stage_micro_rules: [
      "Apresentar-se como Enova, assistente do MCMV",
      "Perguntar se cliente já sabe como funciona ou quer explicação",
      "NÃO iniciar coleta de dados neste stage",
      "NÃO prometer aprovação ou valores",
      "Variar tom de abertura — não repetir mesma saudação"
    ],
    brief_answer_allowed: false,
    canonical_prompt: "Eu sou a Enova, assistente do programa Minha Casa Minha Vida. Você já sabe como funciona ou prefere que eu explique rapidinho?",
    return_to_stage_prompt: "Antes de continuar, você quer saber como funciona o programa ou já conhece?",
    fallback_prompt: "Oi! 😊 Eu sou a Enova, assistente do programa Minha Casa Minha Vida. Você já sabe como funciona ou prefere que eu explique rapidinho?"
  },
  inicio_nome: {
    expected_slot: "nome",
    allowed_topics_now: ["coleta_nome", "duvida_nome", "resistencia_nome"],
    forbidden_topics_now: ["coleta_estado_civil", "coleta_renda", "coleta_documentos", "valor_parcela", "aprovacao"],
    stage_micro_rules: [
      "Pedir nome COMPLETO do cliente",
      "Se der só apelido/primeiro nome, pedir novamente o nome completo",
      "NÃO pular para próximo stage sem nome"
    ],
    brief_answer_allowed: false,
    canonical_prompt: "Pode me dizer seu nome completo?",
    return_to_stage_prompt: "Preciso do seu nome completo pra seguir com a análise 😊",
    fallback_prompt: "Pode me dizer seu nome completo? 😊"
  },
  inicio_nacionalidade: {
    expected_slot: "nacionalidade",
    allowed_topics_now: ["coleta_nacionalidade", "duvida_estrangeiro", "duvida_por_que_nacionalidade"],
    forbidden_topics_now: ["coleta_renda", "coleta_documentos", "valor_parcela", "aprovacao"],
    stage_micro_rules: [
      "Perguntar se é brasileiro(a) nato(a)",
      "Se estrangeiro, seguir para RNM",
      "NÃO coletar outros dados aqui"
    ],
    brief_answer_allowed: true,
    canonical_prompt: "Você é brasileiro(a) nato(a)?",
    return_to_stage_prompt: "Preciso confirmar sua nacionalidade para seguir 😊",
    fallback_prompt: "Você é brasileiro(a) nato(a)?"
  },
  estado_civil: {
    expected_slot: "estado_civil",
    allowed_topics_now: ["coleta_estado_civil", "duvida_composicao", "duvida_imovel_pre_analise"],
    forbidden_topics_now: ["coleta_renda", "coleta_documentos", "valor_parcela", "aprovacao", "coleta_nome"],
    stage_micro_rules: [
      "Aceitar: solteiro, casado, união estável, divorciado, separado, viúvo",
      "Se ambíguo, pedir esclarecimento",
      "NÃO coletar renda ou documentos aqui"
    ],
    brief_answer_allowed: false,
    canonical_prompt: "Me conta seu estado civil — solteiro(a), casado(a) ou outra situação?",
    return_to_stage_prompt: "Ainda preciso saber seu estado civil pra continuar a análise 😊",
    fallback_prompt: "Me conta seu estado civil — solteiro(a), casado(a) ou outra situação? 😊"
  },
  somar_renda_solteiro: {
    expected_slot: "composicao",
    allowed_topics_now: ["composicao_renda", "duvida_somar", "duvida_solo"],
    forbidden_topics_now: ["coleta_documentos", "valor_parcela", "aprovacao", "coleta_nome", "coleta_estado_civil"],
    stage_micro_rules: [
      "Perguntar se vai somar renda com alguém ou seguir sozinho",
      "Aceitar: sozinho, parceiro, familiar",
      "NÃO decidir por conta própria"
    ],
    brief_answer_allowed: false,
    canonical_prompt: "Sobre renda — vai somar com parceiro(a), familiar, ou segue sozinho(a)?",
    return_to_stage_prompt: "Preciso saber se vai somar renda com alguém ou seguir sozinho(a) 😊",
    fallback_prompt: "Sobre renda — vai somar com parceiro(a), familiar, ou segue sozinho(a)? 😊"
  },
  regime_trabalho: {
    expected_slot: "regime_trabalho",
    allowed_topics_now: ["coleta_regime", "duvida_regime"],
    forbidden_topics_now: ["coleta_documentos", "valor_parcela", "aprovacao", "coleta_nome"],
    stage_micro_rules: [
      "Aceitar: CLT, autônomo, MEI, servidor público, aposentado",
      "Se ambíguo, pedir esclarecimento",
      "NÃO coletar valor de renda aqui"
    ],
    brief_answer_allowed: false,
    canonical_prompt: "Qual é o seu regime de trabalho? CLT, autônomo, MEI, servidor ou aposentado?",
    return_to_stage_prompt: "Preciso saber seu regime de trabalho pra seguir 😊",
    fallback_prompt: "Qual é o seu regime de trabalho? CLT, autônomo, MEI, servidor ou aposentado?"
  },
  renda: {
    expected_slot: "renda",
    allowed_topics_now: ["coleta_renda", "duvida_valor_sem_analise"],
    forbidden_topics_now: ["coleta_documentos", "valor_parcela", "aprovacao", "coleta_nome", "coleta_estado_civil"],
    stage_micro_rules: [
      "Coletar renda MENSAL bruta",
      "Aceitar valor numérico",
      "NÃO prometer aprovação com base na renda informada",
      "NÃO antecipar faixa ou valor de parcela"
    ],
    brief_answer_allowed: false,
    canonical_prompt: "Qual é a sua renda mensal bruta?",
    return_to_stage_prompt: "Preciso saber sua renda mensal pra continuar a análise 😊",
    fallback_prompt: "Qual é a sua renda mensal bruta?"
  },
  ir_declarado: {
    expected_slot: "ir_declarado",
    allowed_topics_now: ["coleta_ir", "duvida_ir"],
    forbidden_topics_now: ["coleta_documentos", "valor_parcela", "aprovacao", "coleta_nome", "coleta_renda"],
    stage_micro_rules: [
      "Perguntar se declarou IR nos últimos 2 anos",
      "Aceitar: sim ou não",
      "NÃO julgar a resposta"
    ],
    brief_answer_allowed: true,
    canonical_prompt: "Você declarou Imposto de Renda nos últimos 2 anos?",
    return_to_stage_prompt: "Preciso saber se você declarou IR nos últimos 2 anos 😊",
    fallback_prompt: "Você declarou Imposto de Renda nos últimos 2 anos? 😊"
  },
  dependente: {
    expected_slot: "dependente",
    allowed_topics_now: ["coleta_dependente", "duvida_o_que_e_dependente"],
    forbidden_topics_now: ["coleta_documentos", "valor_parcela", "aprovacao", "coleta_renda"],
    stage_micro_rules: [
      "Perguntar se tem dependente (filho menor de idade, por exemplo)",
      "Aceitar: sim ou não",
      "NÃO expandir para outros temas"
    ],
    brief_answer_allowed: true,
    canonical_prompt: "Tem algum dependente? Filho(a) menor de idade, por exemplo?",
    return_to_stage_prompt: "Preciso saber se você tem dependentes pra continuar 😊",
    fallback_prompt: "Tem algum dependente? Filho(a) menor de idade, por exemplo 😊"
  },
  restricao: {
    expected_slot: "restricao",
    allowed_topics_now: ["coleta_restricao", "duvida_barra"],
    forbidden_topics_now: ["coleta_documentos", "valor_parcela", "aprovacao", "coleta_renda"],
    stage_micro_rules: [
      "Perguntar se tem restrição no CPF (SPC, Serasa)",
      "Aceitar: sim ou não",
      "Se sim, seguir para regularização"
    ],
    brief_answer_allowed: true,
    canonical_prompt: "Existe alguma restrição no seu CPF? Pode ser SPC, Serasa ou similar.",
    return_to_stage_prompt: "Preciso saber se existe alguma restrição no seu CPF 😊",
    fallback_prompt: "Existe alguma restrição no seu CPF? Pode ser SPC, Serasa ou similar 😊"
  },
  envio_docs: {
    expected_slot: null,
    allowed_topics_now: ["orientacao_docs", "duvida_seguranca", "duvida_canal"],
    forbidden_topics_now: ["coleta_renda", "coleta_estado_civil", "valor_parcela", "aprovacao"],
    stage_micro_rules: [
      "Orientar sobre envio de documentos para análise",
      "NÃO prometer resultado",
      "Responder dúvidas sobre segurança do envio"
    ],
    brief_answer_allowed: false,
    canonical_prompt: "Agora preciso que envie os documentos pra análise.",
    return_to_stage_prompt: "Pra seguir, preciso que envie os documentos solicitados 📎",
    fallback_prompt: "Agora preciso que envie os documentos pra análise 📎😊"
  }
});

/**
 * buildStageContract — Monta o contrato cognitivo-mecânico do stage atual.
 *
 * O mecânico permanece soberano. Este contrato é READ-ONLY para o cognitivo:
 * ele informa ao LLM o que o stage espera, o que é permitido, o que é proibido.
 *
 * @param {object} params
 * @param {string} params.stage — Stage atual do mecânico (fase_conversa)
 * @param {object} [params.state] — State snapshot do lead (para extrair slots conhecidos)
 * @param {string} [params.bucket] — Bucket do topo (para inicio_programa)
 * @returns {StageContract} Objeto de contrato imutável
 */
export function buildStageContract({ stage, state = {}, bucket = null } = {}) {
  const safeStage = String(stage || "inicio");
  const meta = STAGE_CONTRACT_METADATA[safeStage] || null;
  const goal = getStageGoal(safeStage, bucket);
  const allowedSignals = getAllowedSignalsForStage(safeStage);

  return Object.freeze({
    // ── Identificação do stage ──
    stage_current: safeStage,
    stage_goal: goal,

    // ── Prompt canônico (referência mecânica) ──
    canonical_prompt: meta?.canonical_prompt || goal,

    // ── Slot esperado neste turno ──
    expected_slot: meta?.expected_slot || null,

    // ── Disciplina de tópicos ──
    allowed_topics_now: meta?.allowed_topics_now || [],
    forbidden_topics_now: meta?.forbidden_topics_now || [],

    // ── Micro regras do stage ──
    stage_micro_rules: meta?.stage_micro_rules || [],

    // ── Regras de formato ──
    brief_answer_allowed: meta?.brief_answer_allowed || false,

    // ── Recuperação e fallback ──
    return_to_stage_prompt: meta?.return_to_stage_prompt || "Vamos continuar de onde paramos 😊",
    fallback_prompt: meta?.fallback_prompt || "Pode continuar 😊",

    // ── Sinais permitidos (do ALLOWED_SIGNAL_PREFIXES existente) ──
    allowed_signals: allowedSignals,

    // ── Fonte de verdade ──
    mechanical_source_of_truth: true,

    // ── Versão do contrato (para evolução futura) ──
    contract_version: "1.0.0"
  });
}

/**
 * buildStageContractTelemetrySummary — Versão resumida do contrato para telemetria.
 *
 * Retorna um objeto compacto e legível para log/telemetria sem poluir com arrays longos.
 *
 * @param {StageContract} contract — Contrato de stage construído por buildStageContract
 * @returns {object} Resumo compacto do contrato
 */
export function buildStageContractTelemetrySummary(contract) {
  if (!contract || typeof contract !== "object") {
    return { contract_stage: null, contract_valid: false };
  }
  return {
    contract_stage: contract.stage_current || null,
    contract_expected_slot: contract.expected_slot || null,
    contract_has_forbidden_topics: Array.isArray(contract.forbidden_topics_now) && contract.forbidden_topics_now.length > 0,
    contract_brief_answer_allowed: contract.brief_answer_allowed === true,
    contract_has_micro_rules: Array.isArray(contract.stage_micro_rules) && contract.stage_micro_rules.length > 0,
    contract_version: contract.contract_version || null,
    mechanical_source_of_truth: contract.mechanical_source_of_truth === true,
    contract_valid: true
  };
}

// ── PR3: Mechanical Arbiter — validação dura da superfície cognitiva ────────
// Antes de mandar a resposta final do LLM para o cliente, valida se a resposta
// respeita o stage mecânico atual. Se não respeitar, descarta ou corrige pela
// via segura do próprio stage.
//
// SOBERANIA: mecânico real > stage contract > LLM (renderer).
// Se metadata estático conflitar com mecânico real do turno, mecânico vence.
// ────────────────────────────────────────────────────────────────────────────

/**
 * _normalizeForArbiter — Normaliza texto para comparação no arbiter.
 * Remove acentos, lowercase, trim.
 * @param {string} text
 * @returns {string}
 */
function _normalizeForArbiter(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * _checkForbiddenTopics — Verifica se reply_text toca em tópico proibido.
 *
 * Usa os forbidden_topics_now do contrato. Mapeamento semântico simples:
 * cada tópico proibido é testado contra keywords derivadas do próprio nome.
 *
 * @param {string} normalizedReply — Reply normalizado
 * @param {string[]} forbiddenTopics — Lista de tópicos proibidos do contrato
 * @returns {{ blocked: boolean, topic: string|null }}
 */
const _FORBIDDEN_TOPIC_KEYWORDS = Object.freeze({
  coleta_nome: /\b(qual\s+(?:e\s+)?(?:o\s+)?seu\s+nome|me\s+diz\s+(?:o\s+)?seu\s+nome|nome\s+completo)\b/,
  coleta_estado_civil: /\b(estado\s+civil|casad[oa]|solteir[oa]|uniao\s+estavel|divorc)/,
  coleta_renda: /\b(sua\s+renda|renda\s+mensal|quanto\s+(?:voce\s+)?ganha|valor.*renda|renda.*valor)/,
  coleta_documentos: /\b(envie?\s+(?:os?\s+)?doc|mande?\s+(?:os?\s+)?doc|documentos?\s+(?:necessario|precis))/,
  valor_parcela: /\b(parcela\s+(?:de|sera|vai)|valor\s+(?:da\s+)?parcela|sua\s+parcela)/,
  valor_entrada: /\b(entrada\s+(?:de|sera|vai)|valor\s+(?:da\s+)?entrada|sua\s+entrada)/,
  aprovacao: /\b(aprovad[oa]|aprovacao|vai\s+ser\s+aprovad|sera\s+aprovad|garantia.*aprovacao)/
});

function _checkForbiddenTopics(normalizedReply, forbiddenTopics) {
  if (!normalizedReply || !Array.isArray(forbiddenTopics) || forbiddenTopics.length === 0) {
    return { blocked: false, topic: null };
  }
  for (const topic of forbiddenTopics) {
    const topicKey = _normalizeForArbiter(topic);
    const pattern = _FORBIDDEN_TOPIC_KEYWORDS[topicKey];
    if (pattern && pattern.test(normalizedReply)) {
      return { blocked: true, topic };
    }
  }
  return { blocked: false, topic: null };
}

/**
 * _checkSlotMismatch — Verifica se o LLM está coletando slot errado.
 *
 * Se o stage espera um expected_slot específico e o cognitivo detectou
 * slots de outro stage, é mismatch.
 *
 * @param {string|null} expectedSlot — Slot esperado pelo contrato
 * @param {object} slotsDetected — Slots detectados pelo cognitivo { name: { value } }
 * @returns {{ blocked: boolean, wrongSlot: string|null }}
 */
function _checkSlotMismatch(expectedSlot, slotsDetected) {
  if (!expectedSlot || !slotsDetected || typeof slotsDetected !== "object") {
    return { blocked: false, wrongSlot: null };
  }
  const detectedKeys = Object.keys(slotsDetected);
  if (detectedKeys.length === 0) return { blocked: false, wrongSlot: null };

  // Se algum slot detectado NÃO é o esperado E é diferente do esperado, mismatch
  for (const key of detectedKeys) {
    if (key !== expectedSlot) {
      return { blocked: true, wrongSlot: key };
    }
  }
  return { blocked: false, wrongSlot: null };
}

/**
 * _checkStageDrift — Verifica se a reply está puxando assunto de outro stage.
 *
 * Usa allowed_topics_now como whitelist. Se a resposta contém padrões fortes
 * de outro domínio (renda quando está em estado_civil, docs quando está em renda, etc.),
 * marca como drift.
 *
 * Conservador: só bloqueia padrões fortes e inequívocos.
 *
 * @param {string} normalizedReply
 * @param {string} currentStage
 * @param {string|null} expectedSlot
 * @returns {{ blocked: boolean, driftTarget: string|null }}
 */
const _STAGE_DRIFT_PATTERNS = Object.freeze([
  { target: "coleta_renda", pattern: /\b(qual\s+(?:e\s+)?(?:a\s+)?sua\s+renda|renda\s+mensal|quanto\s+(?:voce\s+)?ganha)\b/, excludeStages: new Set(["renda", "renda_parceiro", "renda_familiar_valor", "renda_parceiro_familiar", "renda_parceiro_familiar_p3", "possui_renda_extra"]) },
  { target: "coleta_documentos", pattern: /\b(envie?\s+(?:os?\s+)?doc|mande?\s+(?:os?\s+)?doc|preciso\s+(?:dos?\s+)?(?:seus?\s+)?doc)\b/, excludeStages: new Set(["envio_docs"]) },
  { target: "coleta_estado_civil", pattern: /\b(qual\s+(?:e\s+)?(?:o\s+)?seu\s+estado\s+civil|(?:voce\s+)?e\s+casad[oa]\s+ou\s+solteir[oa])\b/, excludeStages: new Set(["estado_civil", "confirmar_casamento"]) },
  { target: "coleta_regime", pattern: /\b(qual\s+(?:e\s+)?(?:o\s+)?seu\s+regime\s+(?:de\s+)?trabalho|(?:voce\s+)?e\s+clt\s+ou\s+autonomo)\b/, excludeStages: new Set(["regime_trabalho", "regime_trabalho_parceiro", "regime_trabalho_parceiro_familiar", "regime_trabalho_parceiro_familiar_p3"]) },
  { target: "coleta_visita", pattern: /\b(agendar\s+(?:uma?\s+)?visita|quer\s+(?:agendar|marcar)\s+(?:uma?\s+)?visita)\b/, excludeStages: new Set(["agendamento_visita", "visita_confirmada"]) }
]);

function _checkStageDrift(normalizedReply, currentStage, expectedSlot) {
  if (!normalizedReply || !currentStage) return { blocked: false, driftTarget: null };
  const stage = _normalizeForArbiter(currentStage);

  for (const drift of _STAGE_DRIFT_PATTERNS) {
    if (drift.excludeStages.has(stage)) continue;
    if (drift.pattern.test(normalizedReply)) {
      return { blocked: true, driftTarget: drift.target };
    }
  }
  return { blocked: false, driftTarget: null };
}

/**
 * _checkBriefAnswerViolation — Verifica se resposta de stage sim/não é longa demais.
 *
 * Se brief_answer_allowed === true e a resposta é muito longa (>MAX_BRIEF_ANSWER_LENGTH chars)
 * e contém elaboração excessiva (>2 frases com MIN_SENTENCE_LENGTH+ chars), marca como violação.
 *
 * @param {boolean} briefAnswerAllowed
 * @param {string} replyText
 * @returns {{ blocked: boolean }}
 */
const MAX_BRIEF_ANSWER_LENGTH = 300;
const MIN_SENTENCE_LENGTH = 10;

function _checkBriefAnswerViolation(briefAnswerAllowed, replyText) {
  if (!briefAnswerAllowed) return { blocked: false };
  const text = String(replyText || "").trim();
  if (text.length <= MAX_BRIEF_ANSWER_LENGTH) return { blocked: false };
  // Conta frases (pontos finais, exclamações, interrogações)
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > MIN_SENTENCE_LENGTH);
  if (sentences.length <= 2) return { blocked: false };
  return { blocked: true };
}

/**
 * _checkRepetitionReopen — Verifica se a resposta reabre pergunta já respondida.
 *
 * Se o mecânico já tem sinal suficiente para o slot esperado no turno
 * (slot já existe em known_slots) e a reply está perguntando de novo.
 *
 * @param {string} normalizedReply
 * @param {string|null} expectedSlot
 * @param {object} knownSlots — Slots já coletados
 * @param {string|null} canonicalPrompt — Prompt canônico do stage
 * @returns {{ blocked: boolean }}
 */
function _checkRepetitionReopen(normalizedReply, expectedSlot, knownSlots, canonicalPrompt) {
  if (!expectedSlot || !knownSlots || typeof knownSlots !== "object") {
    return { blocked: false };
  }
  // Se o slot esperado já está coletado e a reply faz a mesma pergunta canônica
  const slotValue = knownSlots[expectedSlot];
  if (!slotValue || (typeof slotValue === "object" && !slotValue.value)) {
    return { blocked: false };
  }
  // Se a reply contém a mesma pergunta canônica, está reabrindo
  if (canonicalPrompt) {
    const normCanonical = _normalizeForArbiter(canonicalPrompt);
    const matchLen = Math.min(normCanonical.length, 40);
    if (normCanonical && matchLen > 0 && normalizedReply.includes(normCanonical.slice(0, matchLen))) {
      return { blocked: true };
    }
  }
  return { blocked: false };
}

/**
 * @typedef {Object} ArbitrationDecision
 * @property {boolean} valid — Se a superfície do LLM é válida para o stage
 * @property {string} reason_code — Código da razão da decisão
 * @property {string} chosen_surface — Superfície final escolhida para o cliente
 * @property {string} source — Origem da superfície: "llm_real" | "contract_reanchor" | "contract_fallback" | "mechanical_fallback"
 * @property {string[]} used_contract_guardrails — Guardrails do contrato que foram acionados
 * @property {boolean} arbitration_triggered — Se a arbitragem foi de fato executada
 * @property {object} arbitration_details — Detalhes adicionais da arbitragem
 */

/**
 * arbitrateCognitiveSurface — Árbitro final duro da superfície cognitiva (PR3).
 *
 * Valida se a resposta do LLM respeita o stage mecânico atual.
 * Se respeitar, segue. Se não, descarta ou corrige pela via segura.
 *
 * SOBERANIA: mecânico real > stage contract > LLM (renderer).
 *
 * @param {object} params
 * @param {string} params.currentStage — Stage atual do mecânico
 * @param {object|null} params.stageContract — Contrato cognitivo-mecânico (buildStageContract)
 * @param {string} params.canonicalPrompt — Prompt canônico do stage (fallback reference)
 * @param {string} params.replyText — Texto de resposta do LLM
 * @param {object} params.slotsDetected — Slots detectados pelo cognitivo
 * @param {string|null} params.intent — Intent detectado pelo cognitivo
 * @param {number} params.confidence — Confiança do cognitivo [0,1]
 * @param {object} params.knownSlots — Slots já coletados (state atual)
 * @param {string} params.speechOrigin — Origem da fala: "llm_real" | "heuristic_guidance" | etc.
 * @returns {ArbitrationDecision} Decisão explícita do árbitro
 */
export function arbitrateCognitiveSurface({
  currentStage = "",
  stageContract = null,
  canonicalPrompt = "",
  replyText = "",
  slotsDetected = {},
  intent = null,
  confidence = 0,
  knownSlots = {},
  speechOrigin = "fallback_mechanical"
} = {}) {
  const stage = String(currentStage || "");
  const contract = stageContract && typeof stageContract === "object" ? stageContract : null;
  const normalizedReply = _normalizeForArbiter(replyText);
  const guardrails = [];

  // ── Se não há contrato OU não é llm_real, não arbitrar — passthrough ──
  // Só arbitramos a fala quando é LLM real que pode ter fugido do escopo.
  // Heurística e fallback mecânico já são controlados pelo worker.
  if (!contract || speechOrigin !== "llm_real") {
    return Object.freeze({
      valid: true,
      reason_code: "no_arbitration_needed",
      chosen_surface: replyText,
      source: speechOrigin || "mechanical_fallback",
      used_contract_guardrails: [],
      arbitration_triggered: false,
      arbitration_details: {}
    });
  }

  const expectedSlot = contract.expected_slot || null;
  const forbiddenTopics = contract.forbidden_topics_now || [];
  const briefAnswerAllowed = contract.brief_answer_allowed === true;
  const returnToStagePrompt = contract.return_to_stage_prompt || "";
  const fallbackPrompt = contract.fallback_prompt || "Pode continuar 😊";
  const contractCanonicalPrompt = contract.canonical_prompt || canonicalPrompt || "";

  // ── A. Fuga de tópico proibido ──
  const forbiddenCheck = _checkForbiddenTopics(normalizedReply, forbiddenTopics);
  if (forbiddenCheck.blocked) {
    guardrails.push("forbidden_topic:" + forbiddenCheck.topic);
    return Object.freeze({
      valid: false,
      reason_code: "forbidden_topic_violation",
      chosen_surface: fallbackPrompt,
      source: "contract_fallback",
      used_contract_guardrails: guardrails,
      arbitration_triggered: true,
      arbitration_details: {
        blocked_forbidden_topic: forbiddenCheck.topic,
        expected_slot: expectedSlot,
        stage: stage
      }
    });
  }

  // ── B. Coleta de slot errado ──
  const slotCheck = _checkSlotMismatch(expectedSlot, slotsDetected);
  if (slotCheck.blocked) {
    guardrails.push("slot_mismatch:" + slotCheck.wrongSlot);
    return Object.freeze({
      valid: false,
      reason_code: "slot_mismatch",
      chosen_surface: returnToStagePrompt || fallbackPrompt,
      source: "contract_reanchor",
      used_contract_guardrails: guardrails,
      arbitration_triggered: true,
      arbitration_details: {
        expected_slot: expectedSlot,
        wrong_slot_detected: slotCheck.wrongSlot,
        stage: stage
      }
    });
  }

  // ── C. Deriva de stage ──
  const driftCheck = _checkStageDrift(normalizedReply, stage, expectedSlot);
  if (driftCheck.blocked) {
    guardrails.push("stage_drift:" + driftCheck.driftTarget);
    return Object.freeze({
      valid: false,
      reason_code: "stage_drift",
      chosen_surface: returnToStagePrompt || fallbackPrompt,
      source: "contract_reanchor",
      used_contract_guardrails: guardrails,
      arbitration_triggered: true,
      arbitration_details: {
        drift_target: driftCheck.driftTarget,
        expected_slot: expectedSlot,
        stage: stage
      }
    });
  }

  // ── D. Repetição burra / reabertura indevida ──
  const repetitionCheck = _checkRepetitionReopen(
    normalizedReply, expectedSlot, knownSlots, contractCanonicalPrompt
  );
  if (repetitionCheck.blocked) {
    guardrails.push("repetition_reopen");
    return Object.freeze({
      valid: false,
      reason_code: "repetition_reopen",
      chosen_surface: returnToStagePrompt || fallbackPrompt,
      source: "contract_reanchor",
      used_contract_guardrails: guardrails,
      arbitration_triggered: true,
      arbitration_details: {
        expected_slot: expectedSlot,
        slot_already_collected: true,
        stage: stage
      }
    });
  }

  // ── E. Violação de brief_answer_allowed ──
  const briefCheck = _checkBriefAnswerViolation(briefAnswerAllowed, replyText);
  if (briefCheck.blocked) {
    guardrails.push("brief_answer_violation");
    // Reancorar em vez de bloquear completamente — usar return_to_stage_prompt
    return Object.freeze({
      valid: false,
      reason_code: "brief_answer_violation",
      chosen_surface: returnToStagePrompt || contractCanonicalPrompt || fallbackPrompt,
      source: "contract_reanchor",
      used_contract_guardrails: guardrails,
      arbitration_triggered: true,
      arbitration_details: {
        brief_answer_allowed: true,
        reply_length: String(replyText || "").length,
        expected_slot: expectedSlot,
        stage: stage
      }
    });
  }

  // ── Todos os checks passaram — superfície LLM é válida ──
  return Object.freeze({
    valid: true,
    reason_code: "all_checks_passed",
    chosen_surface: replyText,
    source: "llm_real",
    used_contract_guardrails: [],
    arbitration_triggered: true,
    arbitration_details: {
      stage: stage,
      expected_slot: expectedSlot,
      checks_passed: ["forbidden_topics", "slot_mismatch", "stage_drift", "repetition", "brief_answer"]
    }
  });
}

// ── Adapter: convert legacy adaptCognitiveV2Output → canonical output ──────

/**
 * adaptLegacyToCanonical — Converte saída legada do adapter para o formato canônico.
 * Usado durante a transição. Não cria formato novo — apenas mapeia.
 *
 * @param {object} legacyOutput — Saída de adaptCognitiveV2Output()
 * @returns {CognitiveOutput}
 */
export function adaptLegacyToCanonical(legacyOutput) {
  if (!legacyOutput || typeof legacyOutput !== "object") {
    return buildCognitiveOutput();
  }
  return buildCognitiveOutput({
    reply_text: legacyOutput.reply_text || "",
    signal: legacyOutput.safe_stage_signal || null,
    confidence: legacyOutput.confidence || 0,
    needs_confirmation: legacyOutput.still_needs_original_answer === true,
    slots_detected: legacyOutput.entities || {},
    pending_slots: [],
    conflicts: [],
    reason_codes: [legacyOutput.reason || "unknown"].filter(Boolean),
    speech_origin: legacyOutput.speech_origin || "fallback_mechanical"
  });
}
