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
  inicio_nacionalidade: "Verificar se o cliente é brasileiro(a) ou estrangeiro(a)",
  inicio_rnm: "Verificar se o cliente estrangeiro possui RNM",
  inicio_rnm_validade: "Verificar se o RNM é com validade definida ou indeterminado",
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
  greeting: "Saudação natural: apresente-se como Enova, do Minha Casa Minha Vida. Pergunte se o cliente já conhece o programa ou quer explicação. REGRA DE VARIAÇÃO: varie o tom a cada interação — calorosa, leve, direta, simpática. NÃO repita a mesma estrutura. Fale como pessoa, não como template. Máximo 2-3 frases. PROIBIDO: 'Obrigado por compartilhar', 'Para continuarmos, preciso', 'Pode me informar'.",
  identity: "O cliente perguntou quem você é. Diga que é a Enova, assistente do Minha Casa Minha Vida. NÃO repita saudação. Seja breve e natural.",
  how_it_works: "O cliente pediu explicação. EXPLIQUE o Minha Casa Minha Vida: programa do governo com subsídio na entrada e parcela reduzida conforme renda. Mencione benefícios reais. NÃO pergunte 'já sabe como funciona?' — ele já pediu explicação. Ao final, pergunte se quer seguir com a análise.",
  program_choice: "Pergunte se já conhece o Minha Casa Minha Vida ou quer explicação. Direto, sem preâmbulo.",
  unknown_topo: "Apresente-se brevemente e pergunte se já conhece o programa"
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
  inicio: {
    expected_slot: null,
    allowed_topics_now: ["saudacao", "apresentacao_programa", "duvida_mcmv"],
    forbidden_topics_now: ["coleta_nome", "coleta_estado_civil", "coleta_renda", "coleta_documentos", "valor_parcela", "valor_entrada", "aprovacao"],
    stage_micro_rules: [
      "Acolher o cliente de forma natural e breve — como uma pessoa real, não um script",
      "Identificar se é primeira visita, retomada ou reset",
      "NÃO iniciar coleta de dados neste stage",
      "NÃO prometer aprovação ou valores",
      "Se for retomada (já tem progresso), encaminhar para inicio_decisao",
      "Se for primeira interação ou saudação, encaminhar para inicio_programa",
      "ESTILO: fala curta, leve, sem frase burocrática. Proibido 'Obrigado por compartilhar', 'Para continuarmos', 'Pode me informar'."
    ],
    brief_answer_allowed: false,
    canonical_prompt: "Oi! Sou a Enova, do Minha Casa Minha Vida. Como posso te ajudar?",
    return_to_stage_prompt: "Oi! Sou a Enova, do Minha Casa Minha Vida. Em que posso te ajudar?",
    fallback_prompt: "Oi! Sou a Enova, do Minha Casa Minha Vida. Como posso te ajudar?"
  },
  inicio_decisao: {
    expected_slot: null,
    allowed_topics_now: ["decisao_continuar_ou_resetar"],
    forbidden_topics_now: ["coleta_nome", "coleta_estado_civil", "coleta_renda", "coleta_documentos", "valor_parcela", "valor_entrada", "aprovacao"],
    stage_micro_rules: [
      "Perguntar se quer continuar de onde parou ou começar do zero",
      "Aceitar: 1/continuar ou 2/começar do zero",
      "NÃO iniciar coleta de dados neste stage",
      "NÃO prometer aprovação ou valores",
      "NÃO pular a escolha do cliente — esperar resposta explícita",
      "ESTILO: direto, sem frase burocrática. Proibido 'Para continuarmos, preciso confirmar'."
    ],
    brief_answer_allowed: true,
    canonical_prompt: "Você quer continuar de onde parou ou começar do zero? *1* continua, *2* recomeça.",
    return_to_stage_prompt: "Quer continuar de onde paramos ou começar do zero? *1* ou *2*.",
    fallback_prompt: "Quer continuar de onde paramos ou começar do zero? *1* ou *2*."
  },
  inicio_programa: {
    expected_slot: null,
    allowed_topics_now: ["apresentacao_programa", "duvida_mcmv", "duvida_fgts", "duvida_entrada", "duvida_renda_minima"],
    forbidden_topics_now: ["coleta_nome", "coleta_estado_civil", "coleta_renda", "coleta_documentos", "valor_parcela", "valor_entrada", "aprovacao"],
    stage_micro_rules: [
      "Apresentar-se como Enova, assistente do MCMV",
      "Perguntar se cliente já sabe como funciona ou quer explicação",
      "NÃO iniciar coleta de dados neste stage",
      "NÃO prometer aprovação ou valores",
      "Variar tom de abertura — não repetir mesma saudação",
      "ESTILO: leve e direto. Proibido 'Obrigado por compartilhar', 'Para continuarmos, preciso saber'. Falar como pessoa, não como robô."
    ],
    brief_answer_allowed: false,
    canonical_prompt: "Sou a Enova, do Minha Casa Minha Vida. Você já sabe como funciona ou quer que eu explique?",
    return_to_stage_prompt: "Você já conhece o Minha Casa Minha Vida ou quer que eu explique?",
    fallback_prompt: "Sou a Enova, do Minha Casa Minha Vida. Você já sabe como funciona ou quer que eu explique?"
  },
  inicio_nome: {
    expected_slot: "nome",
    allowed_topics_now: ["coleta_nome", "duvida_nome", "resistencia_nome"],
    forbidden_topics_now: ["coleta_estado_civil", "coleta_renda", "coleta_documentos", "valor_parcela", "aprovacao"],
    stage_micro_rules: [
      "Pedir nome COMPLETO do cliente",
      "Se der só apelido/primeiro nome, pedir novamente o nome completo",
      "NÃO pular para próximo stage sem nome",
      "ESTILO: pedir o nome de forma direta e simples, sem 'Pode me informar', sem 'Para continuarmos'. Preferir 'Me diz seu nome completo?'"
    ],
    brief_answer_allowed: false,
    canonical_prompt: "Me diz seu nome completo?",
    return_to_stage_prompt: "Só preciso do seu nome completo pra seguir.",
    fallback_prompt: "Me diz seu nome completo?"
  },
  inicio_nacionalidade: {
    expected_slot: "nacionalidade",
    allowed_topics_now: ["coleta_nacionalidade", "duvida_estrangeiro", "duvida_por_que_nacionalidade"],
    forbidden_topics_now: ["coleta_renda", "coleta_documentos", "valor_parcela", "aprovacao"],
    stage_micro_rules: [
      "Perguntar se é brasileiro(a) ou estrangeiro(a)",
      "Aceitar: brasileiro, estrangeiro, sim (=brasileiro), não (=estrangeiro)",
      "Se estrangeiro, seguir para RNM",
      "NÃO coletar outros dados aqui",
      "ESTILO: pergunta direta sem preâmbulo. Proibido 'Obrigado por compartilhar que você é...', 'Para continuar, preciso confirmar'."
    ],
    brief_answer_allowed: true,
    canonical_prompt: "Você é *brasileiro(a)* ou *estrangeiro(a)*?",
    return_to_stage_prompt: "Você é *brasileiro(a)* ou *estrangeiro(a)*?",
    fallback_prompt: "Você é *brasileiro(a)* ou *estrangeiro(a)*?"
  },
  inicio_rnm: {
    expected_slot: "rnm_status",
    allowed_topics_now: ["coleta_rnm", "duvida_rnm", "duvida_estrangeiro"],
    forbidden_topics_now: ["coleta_nome", "coleta_estado_civil", "coleta_renda", "coleta_documentos", "valor_parcela", "valor_entrada", "aprovacao"],
    stage_micro_rules: [
      "Perguntar se o estrangeiro possui RNM (Registro Nacional Migratório)",
      "Aceitar: sim ou não",
      "Se não possui, informar inelegibilidade (RNM é obrigatório para MCMV)",
      "Se possui, seguir para verificar validade do RNM",
      "NÃO coletar outros dados aqui",
      "ESTILO: direto e simples. Proibido preâmbulo burocrático antes da pergunta."
    ],
    brief_answer_allowed: true,
    canonical_prompt: "Você tem *RNM*? *Sim* ou *não*.",
    return_to_stage_prompt: "Você tem RNM — Registro Nacional Migratório? *Sim* ou *não*.",
    fallback_prompt: "Você tem *RNM*? *Sim* ou *não*."
  },
  inicio_rnm_validade: {
    expected_slot: "rnm_validade",
    allowed_topics_now: ["coleta_rnm_validade", "duvida_rnm_validade", "duvida_indeterminado"],
    forbidden_topics_now: ["coleta_nome", "coleta_estado_civil", "coleta_renda", "coleta_documentos", "valor_parcela", "valor_entrada", "aprovacao"],
    stage_micro_rules: [
      "Perguntar se o RNM é com validade definida ou indeterminado",
      "Aceitar: com validade ou indeterminado",
      "Se com validade definida, informar inelegibilidade (MCMV exige RNM indeterminado)",
      "Se indeterminado, seguir para estado civil",
      "NÃO coletar outros dados aqui",
      "ESTILO: pergunta direta. Sem preâmbulo."
    ],
    brief_answer_allowed: true,
    canonical_prompt: "Seu RNM é *com validade* ou *indeterminado*?",
    return_to_stage_prompt: "Seu RNM é *com validade* ou *indeterminado*?",
    fallback_prompt: "Seu RNM é *com validade* ou *indeterminado*?"
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
      "Orientar envio de documentos de forma objetiva e firme",
      "NÃO prometer resultado ou prazo de aprovação",
      "Responder dúvidas sobre segurança do envio",
      "NÃO ficar em loop genérico — dar CTA claro",
      "Se cliente já enviou, confirmar recebimento e orientar próximo passo"
    ],
    brief_answer_allowed: false,
    canonical_prompt: "Agora preciso que envie os documentos pra análise.",
    return_to_stage_prompt: "Pra seguir, preciso que envie os documentos solicitados 📎",
    fallback_prompt: "Agora preciso que envie os documentos pra análise 📎😊"
  },
  // ── PR5: Stages faltantes cobertas na fase textual final ──────────────────
  confirmar_casamento: {
    expected_slot: "estado_civil",
    allowed_topics_now: ["coleta_estado_civil", "duvida_tipo_casamento"],
    forbidden_topics_now: ["coleta_renda", "coleta_documentos", "valor_parcela", "aprovacao", "coleta_nome"],
    stage_micro_rules: [
      "Confirmar se é casamento civil ou união estável",
      "Aceitar: civil, união estável, comunhão parcial, comunhão total",
      "NÃO coletar renda ou documentos aqui"
    ],
    brief_answer_allowed: true,
    canonical_prompt: "Esse casamento é civil registrado ou é união estável?",
    return_to_stage_prompt: "Preciso confirmar o tipo de casamento pra seguir 😊",
    fallback_prompt: "Esse casamento é civil registrado ou é união estável?"
  },
  financiamento_conjunto: {
    expected_slot: "composicao",
    allowed_topics_now: ["composicao_renda", "duvida_financiamento_conjunto"],
    forbidden_topics_now: ["coleta_documentos", "valor_parcela", "aprovacao", "coleta_nome", "coleta_estado_civil"],
    stage_micro_rules: [
      "Perguntar se vai financiar sozinho ou junto com alguém",
      "NÃO decidir por conta própria",
      "NÃO expandir para outros temas"
    ],
    brief_answer_allowed: true,
    canonical_prompt: "Vai financiar sozinho(a) ou junto com alguém?",
    return_to_stage_prompt: "Preciso saber se o financiamento será sozinho ou conjunto 😊",
    fallback_prompt: "Vai financiar sozinho(a) ou junto com alguém?"
  },
  quem_pode_somar: {
    expected_slot: "composicao",
    allowed_topics_now: ["composicao_renda", "duvida_somar"],
    forbidden_topics_now: ["coleta_documentos", "valor_parcela", "aprovacao", "coleta_nome", "coleta_estado_civil"],
    stage_micro_rules: [
      "Identificar quem mais compõe renda com o cliente",
      "Aceitar: parceiro, familiar, sozinho",
      "NÃO decidir por conta própria"
    ],
    brief_answer_allowed: false,
    canonical_prompt: "Quem mais compõe renda com você?",
    return_to_stage_prompt: "Preciso saber quem compõe renda com você 😊",
    fallback_prompt: "Quem mais compõe renda com você?"
  },
  interpretar_composicao: {
    expected_slot: "composicao",
    allowed_topics_now: ["composicao_renda", "duvida_composicao"],
    forbidden_topics_now: ["coleta_documentos", "valor_parcela", "aprovacao", "coleta_nome", "coleta_estado_civil"],
    stage_micro_rules: [
      "Interpretar tipo de composição de renda informado",
      "Aceitar: parceiro, familiar, sozinho",
      "NÃO decidir por conta própria"
    ],
    brief_answer_allowed: false,
    canonical_prompt: "Me conta mais sobre a composição de renda 😊",
    return_to_stage_prompt: "Preciso entender a composição de renda pra continuar 😊",
    fallback_prompt: "Me conta mais sobre a composição de renda 😊"
  },
  somar_renda_familiar: {
    expected_slot: "composicao",
    allowed_topics_now: ["composicao_renda", "duvida_familiar"],
    forbidden_topics_now: ["coleta_documentos", "valor_parcela", "aprovacao", "coleta_nome", "coleta_estado_civil"],
    stage_micro_rules: [
      "Perguntar com qual familiar quer compor renda",
      "Aceitar: pai, mãe, irmão(ã), avô(ó), tio(a)",
      "NÃO decidir por conta própria"
    ],
    brief_answer_allowed: false,
    canonical_prompt: "Com quem quer somar renda? Pode ser pai, mãe, irmão(ã) ou tio(a).",
    return_to_stage_prompt: "Preciso saber com qual familiar quer compor renda 😊",
    fallback_prompt: "Com quem quer somar renda? Pode ser pai, mãe, irmão(ã) ou tio(a). 😊"
  },
  autonomo_ir_pergunta: {
    expected_slot: "ir_declarado",
    allowed_topics_now: ["coleta_ir", "duvida_ir_autonomo"],
    forbidden_topics_now: ["coleta_documentos", "valor_parcela", "aprovacao", "coleta_nome", "coleta_renda"],
    stage_micro_rules: [
      "Perguntar se autônomo declara IR",
      "Aceitar: sim ou não",
      "NÃO julgar a resposta"
    ],
    brief_answer_allowed: true,
    canonical_prompt: "Você fez declaração de IR como autônomo(a)?",
    return_to_stage_prompt: "Preciso saber se você declara IR como autônomo(a) 😊",
    fallback_prompt: "Você fez declaração de IR como autônomo(a)?"
  },
  ctps_36: {
    expected_slot: "ctps_36",
    allowed_topics_now: ["coleta_ctps", "duvida_carteira"],
    forbidden_topics_now: ["coleta_documentos", "valor_parcela", "aprovacao", "coleta_renda"],
    stage_micro_rules: [
      "Perguntar se tem mais de 36 meses de carteira assinada",
      "Aceitar: sim ou não",
      "NÃO expandir para outros temas"
    ],
    brief_answer_allowed: true,
    canonical_prompt: "Você tem mais de 36 meses de carteira assinada? 📋",
    return_to_stage_prompt: "Preciso saber sobre seu tempo de carteira assinada 😊",
    fallback_prompt: "Você tem mais de 36 meses de carteira assinada? 📋"
  },
  ctps_36_parceiro: {
    expected_slot: "ctps_36_parceiro",
    allowed_topics_now: ["coleta_ctps_parceiro", "duvida_carteira"],
    forbidden_topics_now: ["coleta_documentos", "valor_parcela", "aprovacao", "coleta_renda"],
    stage_micro_rules: [
      "Perguntar se parceiro(a) tem mais de 36 meses de carteira assinada",
      "Aceitar: sim ou não",
      "NÃO expandir para outros temas"
    ],
    brief_answer_allowed: true,
    canonical_prompt: "Seu(sua) parceiro(a) tem mais de 36 meses de carteira assinada?",
    return_to_stage_prompt: "Preciso saber sobre o tempo de carteira do(a) parceiro(a) 😊",
    fallback_prompt: "Seu(sua) parceiro(a) tem mais de 36 meses de carteira assinada?"
  },
  restricao_parceiro: {
    expected_slot: "restricao_parceiro",
    allowed_topics_now: ["coleta_restricao_parceiro", "duvida_barra"],
    forbidden_topics_now: ["coleta_documentos", "valor_parcela", "aprovacao", "coleta_renda"],
    stage_micro_rules: [
      "Perguntar se parceiro(a) tem restrição no CPF",
      "Aceitar: sim ou não",
      "Se sim, seguir para regularização"
    ],
    brief_answer_allowed: true,
    canonical_prompt: "E no CPF do(a) parceiro(a), tem alguma restrição?",
    return_to_stage_prompt: "Preciso saber se o(a) parceiro(a) tem restrição no CPF 😊",
    fallback_prompt: "E no CPF do(a) parceiro(a), tem alguma restrição?"
  },
  regularizacao_restricao: {
    expected_slot: "regularizacao_restricao",
    allowed_topics_now: ["regularizacao", "duvida_quitar", "duvida_negociar"],
    forbidden_topics_now: ["coleta_documentos", "valor_parcela", "aprovacao", "coleta_renda"],
    stage_micro_rules: [
      "Perguntar se consegue regularizar a restrição",
      "Aceitar: sim, não, vou tentar",
      "NÃO julgar a capacidade financeira do cliente"
    ],
    brief_answer_allowed: true,
    canonical_prompt: "Consegue regularizar essa restrição? Quitar ou negociar? 😊",
    return_to_stage_prompt: "Preciso saber se você consegue regularizar a restrição 😊",
    fallback_prompt: "Consegue regularizar essa restrição? Quitar ou negociar? 😊"
  },
  agendamento_visita: {
    expected_slot: null,
    allowed_topics_now: ["agendamento", "duvida_visita", "duvida_local"],
    forbidden_topics_now: ["coleta_renda", "coleta_estado_civil", "valor_parcela", "aprovacao"],
    stage_micro_rules: [
      "Orientar agendamento de visita ao empreendimento",
      "Perguntar data disponível",
      "NÃO prometer aprovação ou resultado"
    ],
    brief_answer_allowed: false,
    canonical_prompt: "Vamos agendar a visita ao empreendimento? Me diz uma data boa pra você 📅",
    return_to_stage_prompt: "Preciso agendar uma data pra visita ao empreendimento 😊",
    fallback_prompt: "Vamos agendar a visita ao empreendimento? Me diz uma data boa pra você 📅"
  },
  visita_confirmada: {
    expected_slot: null,
    allowed_topics_now: ["confirmar_visita", "duvida_visita", "duvida_local"],
    forbidden_topics_now: ["coleta_renda", "coleta_estado_civil", "valor_parcela", "aprovacao"],
    stage_micro_rules: [
      "Confirmar detalhes da visita agendada",
      "NÃO prometer resultado",
      "Orientar sobre o que levar"
    ],
    brief_answer_allowed: false,
    canonical_prompt: "Visita confirmada! Te passo os detalhes 😊",
    return_to_stage_prompt: "Preciso confirmar os detalhes da sua visita 😊",
    fallback_prompt: "Visita confirmada! Te passo os detalhes 😊"
  },
  finalizacao_processo: {
    expected_slot: null,
    allowed_topics_now: ["finalizacao", "duvida_proximo_passo", "duvida_prazo"],
    forbidden_topics_now: ["coleta_renda", "coleta_estado_civil", "valor_parcela"],
    stage_micro_rules: [
      "Orientar sobre os últimos passos do processo",
      "NÃO prometer prazo específico de aprovação",
      "Dar CTA claro sobre próxima ação necessária"
    ],
    brief_answer_allowed: false,
    canonical_prompt: "Estamos na reta final! Vou te orientar nos últimos passos 😊",
    return_to_stage_prompt: "Estamos finalizando — vou te orientar nos próximos passos 😊",
    fallback_prompt: "Estamos na reta final! Vou te orientar nos últimos passos 😊"
  },
  aguardando_retorno_correspondente: {
    expected_slot: null,
    allowed_topics_now: ["duvida_prazo", "duvida_proximo_passo", "duvida_status"],
    forbidden_topics_now: ["coleta_renda", "coleta_estado_civil", "valor_parcela", "aprovacao"],
    stage_micro_rules: [
      "Informar que está aguardando retorno do correspondente",
      "NÃO prometer prazo específico",
      "Manter cliente informado e tranquilo"
    ],
    brief_answer_allowed: false,
    canonical_prompt: "Estou aguardando o retorno do correspondente. Te aviso assim que tiver novidade! 😊",
    return_to_stage_prompt: "Ainda aguardando retorno do correspondente — te aviso logo! 😊",
    fallback_prompt: "Estou aguardando o retorno do correspondente. Te aviso assim que tiver novidade! 😊"
  },
  fim_ineligivel: {
    expected_slot: null,
    allowed_topics_now: ["explicacao_inelegibilidade", "duvida_alternativa"],
    forbidden_topics_now: ["coleta_renda", "coleta_estado_civil", "valor_parcela"],
    stage_micro_rules: [
      "Informar que não foi possível seguir com o processo",
      "NÃO dar esperança falsa",
      "Ser empático mas objetivo"
    ],
    brief_answer_allowed: false,
    canonical_prompt: "Infelizmente não foi possível seguir com o processo nesse momento. Se precisar, estou por aqui 💛",
    return_to_stage_prompt: "Infelizmente não foi possível seguir nesse momento 💛",
    fallback_prompt: "Infelizmente não foi possível seguir com o processo nesse momento. Se precisar, estou por aqui 💛"
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
    // PR6 FIX 4: Usar prompt ancorado no stage, não "vamos continuar de onde paramos"
    return_to_stage_prompt: meta?.return_to_stage_prompt || (meta?.canonical_prompt ? meta.canonical_prompt : "Pode continuar 😊"),
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
  coleta_documentos: /\b(envie?\s+(?:os?\s+)?doc|enviar?\s+(?:os?\s+)?(?:seus?\s+)?doc|mande?\s+(?:os?\s+)?doc|documentos?\s+(?:necessario|precis)|documentos?\s+(?:para|pra)\s+analise)/,
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
 * SOMENTE slots de outro stage (sem o esperado junto), é mismatch.
 * Se o expected_slot correto também foi detectado, permite — slots
 * acessórios/secundários junto ao esperado não bloqueiam.
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

  // Se o expected_slot está entre os detectados, permite — slots acessórios junto não bloqueiam
  if (detectedKeys.includes(expectedSlot)) {
    return { blocked: false, wrongSlot: null };
  }

  // expected_slot ausente e existem outros slots → mismatch real
  const wrongSlot = detectedKeys[0] || null;
  return { blocked: true, wrongSlot };
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
  { target: "coleta_documentos", pattern: /\b(envie?\s+(?:os?\s+)?doc|enviar?\s+(?:os?\s+)?(?:seus?\s+)?doc|mande?\s+(?:os?\s+)?doc|preciso\s+(?:dos?\s+)?(?:seus?\s+)?doc|documentos?\s+(?:para|pra)\s+analise)\b/, excludeStages: new Set(["envio_docs"]) },
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

  // ── PR5: Arbitragem unificada — governa TODOS os caminhos de surface ──
  // Antes: apenas llm_real passava pela arbitragem.
  // Agora: llm_real E heuristic_guidance passam pelas mesmas guardrails.
  // fallback_mechanical continua passthrough (já é controlado pelo worker).
  const _ARBITRABLE_ORIGINS = new Set(["llm_real", "heuristic_guidance"]);
  if (!contract || !_ARBITRABLE_ORIGINS.has(speechOrigin)) {
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

  // ── Todos os checks passaram — superfície é válida ──
  return Object.freeze({
    valid: true,
    reason_code: "all_checks_passed",
    chosen_surface: replyText,
    source: speechOrigin,
    used_contract_guardrails: [],
    arbitration_triggered: true,
    arbitration_details: {
      stage: stage,
      expected_slot: expectedSlot,
      original_speech_origin: speechOrigin,
      checks_passed: ["forbidden_topics", "slot_mismatch", "stage_drift", "repetition", "brief_answer"]
    }
  });
}

// ── PR5: Unified Surface Controller ────────────────────────────────────────
// Controlador final unificado de superfície textual.
// TODOS os caminhos de fala (llm_real, heuristic_guidance, contract_reanchor,
// contract_fallback, mechanical_fallback) convergem para uma decisão coerente.
//
// SOBERANIA: mecânico real > stage contract > surface controller > LLM/heurística
//
// O controller não inventa regra nova — aplica guardrails existentes de forma
// unificada a QUALQUER caminho de surface, não apenas a llm_real.
// ────────────────────────────────────────────────────────────────────────────

/**
 * SHORT_ANSWER_EQUIVALENCES — Mapeamento de respostas curtas comuns para
 * interpretação correta sem gerar repetição ou desvio.
 *
 * Usado pelo surface controller para reconhecer "sim", "não", "CLT", "fixo",
 * valores numéricos etc. como respostas legítimas que não devem gerar
 * reabertura, repetição ou pergunta fora de hora.
 */

// Limites para classificação de respostas curtas
const _MAX_SHORT_ANSWER_LENGTH = 50; // Acima disso, não é resposta curta
const _MAX_UNKNOWN_SHORT_LENGTH = 15; // Até esse tamanho, classifica como "unknown_short"

const _SHORT_ANSWER_PATTERNS = Object.freeze({
  affirmative: /^(sim|ss|sii|isso|exato|exatamente|com certeza|claro|ok|pode ser|positivo|uhum|aham|afirmativo|isso mesmo|e isso|eh|isso ai|e sim|sim sim|bora|vamo|vamos|sim,? esta corret[oa]|sim,? esta certo|correto|correta|esta certo|esta correta|certo|certinho|certinha|esta sim|e isso mesmo)$/i,
  // Note: text is NFD-normalized before matching, so accented forms (não→nao, só→so) are implicit
  negative: /^(nao|n|nn|nope|negativo|nunca|nem|nada|de jeito nenhum|nao nao|nao tenho|nao tenho dependentes?|nao tenho nenhum|nenhum|nenhuma|nao possuo)$/i,
  negative_solo: /^(s[oó]\s*(a\s*)?minha|s[oó]\s*eu|somente\s*eu|sozinh[oa]|nao\s*vou\s*somar|nao,?\s*s[oó]\s*(um|uma)\s*mesmo|s[oó]\s*(um|uma)\s*mesmo|nao,?\s*s[oó]\s*eu|somente\s*eu\s*mesm[oa])$/i,
  clt: /^(clt|carteira\s*assinada|registrad[oa]|empregad[oa]|somente\s*(com\s*)?clt|s[oó]\s*(com\s*)?clt)$/i,
  autonomo: /^(autonomo|autonoma|pj|mei|liberal|conta\s*propria)$/i,
  servidor: /^(servidor|servidora|servidor\s*publico|concursad[oa]|funcionari[oa])$/i,
  aposentado: /^(aposentad[oa]|pensionista|inss|beneficio)$/i,
  fixo: /^(fixo|fixa|salario\s*fixo|renda\s*fixa)$/i,
  numeric_value: /^r?\$?\s*\d[\d.,]*$/,
  already_know: /^(ja\s*conh|ja\s*sei|sei\s*sim|conheco|conheco\s*sim|to\s*por\s*dentro|ja\s*conheco)/i,
  civil_status: /^(solteir[oa]|casad[oa]|divorc|separad[oa]|viuv[oa]|uniao\s*(estavel)?|amasiado|juntad[oa])$/i
});

/**
 * classifyShortAnswer — Classifica resposta curta do cliente.
 *
 * @param {string} userText — Texto do cliente
 * @returns {{ isShort: boolean, category: string|null, normalized: string }}
 */
export function classifyShortAnswer(userText) {
  const text = String(userText || "").trim();
  if (text.length > _MAX_SHORT_ANSWER_LENGTH) return { isShort: false, category: null, normalized: text };

  const normalizedText = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  for (const [category, pattern] of Object.entries(_SHORT_ANSWER_PATTERNS)) {
    if (pattern.test(normalizedText)) {
      return { isShort: true, category, normalized: normalizedText };
    }
  }

  // Ainda pode ser curta mas sem categoria conhecida
  if (text.length <= _MAX_UNKNOWN_SHORT_LENGTH) {
    return { isShort: true, category: "unknown_short", normalized: normalizedText };
  }

  return { isShort: false, category: null, normalized: normalizedText };
}

/**
 * _checkInformativeOutOfTurn — Verifica se resposta contém informativo fora de hora.
 *
 * Detecta padrões comuns de informativos que podem ser úteis mas devem ser
 * controlados para não abrir conversa paralela ou furar stage.
 *
 * @param {string} normalizedReply — Reply normalizado
 * @param {string} currentStage — Stage atual
 * @returns {{ detected: boolean, topic: string|null }}
 */
const _INFORMATIVE_OUT_OF_TURN_PATTERNS = Object.freeze([
  {
    topic: "valor_parcela",
    // Detecta menções concretas a valor de parcela (ex: "parcela fica em R$800", "R$1200 a parcela")
    pattern: /\b(parcela[\s\w]+(r\$|reais|\d)|(r\$|reais)\s*\d+.*parcela|parcela\s*(mensal|fixa))/i,
    allowedStages: new Set(["finalizacao_processo", "aguardando_retorno_correspondente"])
  },
  {
    topic: "fgts_antecipacao",
    pattern: /\b(fgts.*(?:usar|utilizar|sacar|aplicar)|(?:usar|utilizar|sacar|aplicar).*fgts)\b/i,
    allowedStages: new Set(["envio_docs", "finalizacao_processo"])
  },
  {
    topic: "entrada_valor",
    pattern: /\b(entrada[\s\w]+(r\$|reais|\d)|(r\$|reais)\s*\d+.*entrada)\b/i,
    allowedStages: new Set(["finalizacao_processo", "aguardando_retorno_correspondente"])
  },
  {
    topic: "consultoria_prematura",
    pattern: /\b(simul(?:acao|ação)|(?:qual|quanto)\s+(?:fica|seria|custa|vale)\s+(?:o\s+)?(?:imovel|imóvel|ap(?:artamento|ê)?|casa))\b/i,
    allowedStages: new Set(["finalizacao_processo", "aguardando_retorno_correspondente", "agendamento_visita"])
  },
  {
    // PR6 FIX 3: Bloquear consultoria prematura gerada pelo LLM durante stages de coleta.
    // Padrões reais observados: "posso te ajudar a entender melhor", "quer saber como isso influencia",
    // "posso te mostrar", "quer conversar sobre isso", "vou te explicar como funciona".
    topic: "consultoria_prematura",
    pattern: /\b(posso te (?:ajudar|mostrar|explicar)|quer (?:saber|conversar|entender)|vou te (?:explicar|mostrar|ajudar)|quer que eu (?:explique|mostre|ajude)|te (?:ajudo|explico|mostro) (?:como|melhor|isso))\b/i,
    allowedStages: new Set(["finalizacao_processo", "aguardando_retorno_correspondente", "agendamento_visita", "envio_docs", "inicio_programa"])
  }
]);

function _checkInformativeOutOfTurn(normalizedReply, currentStage) {
  if (!normalizedReply || !currentStage) return { detected: false, topic: null };
  const stage = _normalizeForArbiter(currentStage);

  for (const info of _INFORMATIVE_OUT_OF_TURN_PATTERNS) {
    if (info.allowedStages.has(stage)) continue;
    if (info.pattern.test(normalizedReply)) {
      return { detected: true, topic: info.topic };
    }
  }
  return { detected: false, topic: null };
}

/**
 * @typedef {Object} UnifiedSurfaceDecision
 * @property {string} chosen_surface — Superfície final escolhida para o cliente
 * @property {string} source — Origem final: "llm_real" | "heuristic_guidance" | "contract_reanchor" | "contract_fallback" | "mechanical_fallback"
 * @property {boolean} arbitration_applied — Se arbitragem foi executada
 * @property {string} control_reason — Razão do controle aplicado
 * @property {boolean} informative_blocked — Se informativo fora de hora foi bloqueado
 * @property {string|null} informative_topic — Tópico informativo bloqueado
 * @property {string|null} short_answer_category — Categoria de resposta curta detectada
 * @property {object} telemetry — Telemetria completa da decisão
 */

/**
 * unifySurfaceControl — Controlador final unificado de superfície textual.
 *
 * Governa TODOS os caminhos de surface de forma coerente.
 * SOBERANIA: mecânico real > stage contract > surface controller > renderer.
 *
 * @param {object} params
 * @param {string} params.replyText — Texto de resposta proposto
 * @param {string} params.speechOrigin — Origem: "llm_real" | "heuristic_guidance" | "fallback_mechanical"
 * @param {string} params.currentStage — Stage atual do mecânico
 * @param {object|null} params.stageContract — Contrato de stage (buildStageContract)
 * @param {object} params.slotsDetected — Slots detectados
 * @param {object} params.knownSlots — Slots já coletados
 * @param {string} params.userText — Texto do cliente
 * @param {number} params.confidence — Confiança do cognitivo
 * @returns {UnifiedSurfaceDecision}
 */
export function unifySurfaceControl({
  replyText = "",
  speechOrigin = "fallback_mechanical",
  currentStage = "",
  stageContract = null,
  slotsDetected = {},
  knownSlots = {},
  userText = "",
  confidence = 0
} = {}) {
  const stage = String(currentStage || "");
  const contract = stageContract && typeof stageContract === "object" ? stageContract : null;
  const shortAnswer = classifyShortAnswer(userText);

  // ── Base telemetry ──
  const baseTelemetry = {
    stage,
    original_speech_origin: speechOrigin,
    short_answer: shortAnswer.isShort ? shortAnswer.category : null,
    confidence,
    contract_present: Boolean(contract),
    unified_surface_version: "1.0.0"
  };

  // ── Passo 1: Se não há contrato, passthrough controlado ──
  if (!contract) {
    return {
      chosen_surface: replyText,
      source: speechOrigin || "mechanical_fallback",
      arbitration_applied: false,
      control_reason: "no_contract_passthrough",
      informative_blocked: false,
      informative_topic: null,
      short_answer_category: shortAnswer.isShort ? shortAnswer.category : null,
      telemetry: { ...baseTelemetry, decision: "passthrough_no_contract" }
    };
  }

  // ── Passo 2: Classificar resposta curta do cliente ──
  // Respostas curtas legítimas (sim, não, CLT, valores) devem ser tratadas
  // sem repetição, sem reabertura, sem puxar assunto errado.
  if (shortAnswer.isShort && shortAnswer.category !== "unknown_short") {
    baseTelemetry.short_answer_handled = true;
    baseTelemetry.short_answer_type = shortAnswer.category;
  }

  // ── Passo 3: Executar arbitragem unificada ──
  // Mesmas guardrails para llm_real e heuristic_guidance.
  const arbiterResult = arbitrateCognitiveSurface({
    currentStage: stage,
    stageContract: contract,
    canonicalPrompt: contract.canonical_prompt || "",
    replyText,
    slotsDetected,
    intent: null,
    confidence,
    knownSlots,
    speechOrigin
  });

  baseTelemetry.arbiter_triggered = arbiterResult.arbitration_triggered;
  baseTelemetry.arbiter_valid = arbiterResult.valid;
  baseTelemetry.arbiter_reason = arbiterResult.reason_code;
  baseTelemetry.arbiter_guardrails = arbiterResult.used_contract_guardrails;

  // ── Passo 4: Se arbiter bloqueou, usar surface segura ──
  if (!arbiterResult.valid) {
    return {
      chosen_surface: arbiterResult.chosen_surface,
      source: arbiterResult.source,
      arbitration_applied: true,
      control_reason: arbiterResult.reason_code,
      informative_blocked: false,
      informative_topic: null,
      short_answer_category: shortAnswer.isShort ? shortAnswer.category : null,
      telemetry: {
        ...baseTelemetry,
        decision: "arbiter_blocked",
        arbiter_details: arbiterResult.arbitration_details
      }
    };
  }

  // ── Passo 5: Verificar informativo fora de hora na reply ──
  const normalizedReply = _normalizeForArbiter(replyText);
  const informativeCheck = _checkInformativeOutOfTurn(normalizedReply, stage);

  if (informativeCheck.detected) {
    // Não bloqueia totalmente — reancorar com surface segura + informativo controlado
    const reanchorPrompt = contract.return_to_stage_prompt || contract.fallback_prompt || "Pode continuar 😊";
    baseTelemetry.informative_detected = informativeCheck.topic;

    return {
      chosen_surface: reanchorPrompt,
      source: "contract_reanchor",
      arbitration_applied: true,
      control_reason: "informative_out_of_turn:" + informativeCheck.topic,
      informative_blocked: true,
      informative_topic: informativeCheck.topic,
      short_answer_category: shortAnswer.isShort ? shortAnswer.category : null,
      telemetry: {
        ...baseTelemetry,
        decision: "informative_out_of_turn_reanchor",
        informative_topic: informativeCheck.topic
      }
    };
  }

  // ── Passo 6: Todos os checks passaram ──
  return {
    chosen_surface: arbiterResult.chosen_surface,
    source: arbiterResult.source,
    arbitration_applied: arbiterResult.arbitration_triggered,
    control_reason: "unified_all_passed",
    informative_blocked: false,
    informative_topic: null,
    short_answer_category: shortAnswer.isShort ? shortAnswer.category : null,
    telemetry: {
      ...baseTelemetry,
      decision: "all_checks_passed",
      final_source: arbiterResult.source
    }
  };
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
