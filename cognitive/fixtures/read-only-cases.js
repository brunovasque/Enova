export const READ_ONLY_COGNITIVE_FIXTURES = Object.freeze([
  {
    id: "clt_simples",
    title: "CLT simples",
    input: {
      conversation_id: "fx-clt-001",
      current_stage: "regime_trabalho",
      message_text: "Sou CLT e trabalho registrado.",
      known_slots: {},
      pending_slots: ["regime_trabalho", "renda", "ir_declarado"],
      recent_messages: []
    },
    expected: {
      required_slots: ["regime_trabalho"],
      should_request_confirmation: false,
      min_confidence: 0.72
    }
  },
  {
    id: "autonomo_com_ir",
    title: "Autônomo com IR",
    input: {
      conversation_id: "fx-aut-ir-001",
      current_stage: "autonomo_ir_pergunta",
      message_text: "Sou autônomo, ganho uns 4.800 e declaro IR.",
      known_slots: {},
      pending_slots: ["ir_declarado", "renda"],
      recent_messages: []
    },
    expected: {
      required_slots: ["regime_trabalho", "renda", "ir_declarado"],
      should_request_confirmation: false,
      min_confidence: 0.78
    }
  },
  {
    id: "autonomo_sem_ir",
    title: "Autônomo sem IR",
    input: {
      conversation_id: "fx-aut-noir-001",
      current_stage: "autonomo_ir_pergunta",
      message_text: "Sou autônomo, ganho uns 2.500 e não declaro IR.",
      known_slots: {},
      pending_slots: ["ir_declarado", "renda"],
      recent_messages: []
    },
    expected: {
      required_slots: ["regime_trabalho", "renda", "ir_declarado"],
      should_request_confirmation: false,
      min_confidence: 0.78
    }
  },
  {
    id: "casado_civil",
    title: "Casado civil",
    input: {
      conversation_id: "fx-civil-001",
      current_stage: "estado_civil",
      message_text: "Sou casado no civil e minha esposa também trabalha.",
      known_slots: {},
      pending_slots: ["estado_civil", "composicao", "regime_trabalho_parceiro"],
      recent_messages: []
    },
    expected: {
      required_slots: ["estado_civil", "composicao"],
      should_request_confirmation: false,
      min_confidence: 0.74
    }
  },
  {
    id: "uniao_estavel",
    title: "União estável",
    input: {
      conversation_id: "fx-uniao-001",
      current_stage: "estado_civil",
      message_text: "Moro junto em união estável e vamos compor renda juntos.",
      known_slots: {},
      pending_slots: ["estado_civil", "composicao"],
      recent_messages: []
    },
    expected: {
      required_slots: ["estado_civil", "composicao"],
      should_request_confirmation: false,
      min_confidence: 0.74
    }
  },
  {
    id: "composicao_familiar",
    title: "Composição com familiar",
    input: {
      conversation_id: "fx-familiar-001",
      current_stage: "somar_renda_solteiro",
      message_text: "Sou solteiro, ganho 1.900, minha mãe vai compor comigo.",
      known_slots: {},
      pending_slots: ["estado_civil", "composicao", "familiar", "renda"],
      recent_messages: []
    },
    expected: {
      required_slots: ["estado_civil", "renda", "composicao", "familiar"],
      should_request_confirmation: true,
      min_confidence: 0.8
    }
  },
  {
    id: "composicao_p3",
    title: "Composição com P3",
    input: {
      conversation_id: "fx-p3-001",
      current_stage: "somar_renda_familiar",
      message_text: "Quero compor com minha mãe e com meu irmão também, seremos três.",
      known_slots: {},
      pending_slots: ["composicao", "familiar", "p3"],
      recent_messages: []
    },
    expected: {
      required_slots: ["composicao", "familiar", "p3"],
      should_request_confirmation: true,
      min_confidence: 0.64
    }
  },
  {
    id: "fora_fluxo_duvida",
    title: "Dúvida fora do fluxo",
    input: {
      conversation_id: "fx-offtrack-001",
      current_stage: "renda",
      message_text: "Antes disso, qual valor de entrada e parcela de um imóvel?",
      known_slots: {},
      pending_slots: ["renda"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "multiplos_slots",
    title: "Múltiplos slots em uma frase",
    input: {
      conversation_id: "fx-multi-001",
      current_stage: "estado_civil",
      message_text: "Sou solteiro, autônomo, ganho 3.200 e não declaro IR.",
      known_slots: {},
      pending_slots: ["estado_civil", "regime_trabalho", "renda", "ir_declarado"],
      recent_messages: []
    },
    expected: {
      required_slots: ["estado_civil", "regime_trabalho", "renda", "ir_declarado"],
      should_request_confirmation: true,
      min_confidence: 0.78
    }
  },
  {
    id: "resposta_ambigua",
    title: "Resposta ambígua",
    input: {
      conversation_id: "fx-amb-001",
      current_stage: "estado_civil",
      message_text: "Acho que sou meio casado, talvez união estável, não sei explicar direito.",
      known_slots: {},
      pending_slots: ["estado_civil", "composicao"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: true,
      min_confidence: 0.2
    }
  }
]);
