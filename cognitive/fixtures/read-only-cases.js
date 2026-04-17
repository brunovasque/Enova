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
  },
  {
    id: "docs_clt_objecao_duvida",
    title: "Docs CLT com objeção, dúvida e medo",
    input: {
      conversation_id: "fx-docs-clt-001",
      current_stage: "envio_docs",
      message_text: "Tenho medo de mandar pelo celular. Quais docs preciso? Quero entender RG, CPF e holerite.",
      known_slots: {
        composicao: "sozinho",
        regime_trabalho: "clt",
        ir_declarado: "sim"
      },
      pending_slots: ["docs"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "docs_autonomo_site_depois",
    title: "Docs autônomo prefere site e quer enviar depois",
    input: {
      conversation_id: "fx-docs-aut-001",
      current_stage: "envio_docs",
      message_text: "Sou autônomo sem IR, prefiro mandar pelo site e mando depois.",
      known_slots: {
        composicao: "familiar",
        regime_trabalho: "autonomo",
        ir_declarado: "nao"
      },
      pending_slots: ["docs"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.58
    }
  },
  {
    id: "correspondente_sem_retorno_ansioso",
    title: "Correspondente sem retorno e cliente ansioso",
    input: {
      conversation_id: "fx-corr-001",
      current_stage: "analise_correspondente",
      message_text: "Já saiu aprovação? Estou ansioso.",
      known_slots: {
        correspondente: "pendente"
      },
      pending_slots: ["correspondente"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "correspondente_aprovado_insiste_detalhes",
    title: "Correspondente aprovado com insistência por detalhes financeiros",
    input: {
      conversation_id: "fx-corr-002",
      current_stage: "analise_correspondente",
      message_text: "Quanto foi aprovado? Manda print e taxa de juros.",
      known_slots: {
        correspondente: "aprovado",
        retorno_correspondente_status: "aprovado"
      },
      pending_slots: ["visita"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "correspondente_aguardando_retorno",
    title: "Correspondente em análise — cliente pergunta sobre status",
    input: {
      conversation_id: "fx-corr-003",
      current_stage: "aguardando_retorno_correspondente",
      message_text: "E aí, tem novidade? Como está meu processo?",
      known_slots: {
        correspondente: "aguardando",
        retorno_correspondente_status: "aguardando"
      },
      pending_slots: ["correspondente"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "correspondente_complemento_pos_analise",
    title: "Correspondente pediu documento complementar pós-análise",
    input: {
      conversation_id: "fx-corr-004",
      current_stage: "aguardando_retorno_correspondente",
      message_text: "O que precisa agora?",
      known_slots: {
        correspondente: "aguardando",
        retorno_correspondente_status: "complemento",
        docs_complementares_banco: "extrato bancário dos últimos 3 meses"
      },
      pending_slots: ["correspondente"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "correspondente_reprovado_com_motivo",
    title: "Reprovação pelo correspondente com motivo mecânico scr_bacen",
    input: {
      conversation_id: "fx-corr-005",
      current_stage: "analise_correspondente",
      message_text: "Me disseram que fui reprovado.",
      known_slots: {
        correspondente: "reprovado",
        retorno_correspondente_status: "reprovado",
        motivo_reprovacao: "scr_bacen"
      },
      pending_slots: [],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "correspondente_reprovado_sem_motivo",
    title: "Reprovação pelo correspondente sem motivo detalhado no estado",
    input: {
      conversation_id: "fx-corr-006",
      current_stage: "analise_correspondente",
      message_text: "Fui reprovado, e agora?",
      known_slots: {
        correspondente: "reprovado",
        retorno_correspondente_status: "reprovado"
      },
      pending_slots: [],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "visita_remarcar_sem_promessa",
    title: "Visita com pedido de remarcação e expectativa comercial",
    input: {
      conversation_id: "fx-visita-001",
      current_stage: "agendamento_visita",
      message_text: "Quero remarcar e saber se já posso escolher apartamento específico.",
      known_slots: {
        visita: "convite"
      },
      pending_slots: ["visita"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "visita_resistencia_por_que",
    title: "Visita com resistência e pergunta do porquê",
    input: {
      conversation_id: "fx-visita-002",
      current_stage: "agendamento_visita",
      message_text: "Pra que precisa visitar? Prefiro não visitar agora.",
      known_slots: {},
      pending_slots: ["visita"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "aluguel_ponte_conversao",
    title: "Aluguel com ponte de conversão",
    input: {
      conversation_id: "fx-aluguel-001",
      current_stage: "renda",
      message_text: "Vocês trabalham com aluguel?",
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
    id: "docs_multi_renda",
    title: "Docs com multi renda",
    input: {
      conversation_id: "fx-docs-mr-001",
      current_stage: "envio_docs",
      message_text: "Sou CLT e faço Uber também, quero saber os docs.",
      known_slots: {
        regime_trabalho: "clt",
        renda_formal: 2200,
        multi_renda: "sim",
        renda_extra_na_composicao: "sim"
      },
      pending_slots: ["docs"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "docs_multi_renda_multi_regime",
    title: "Docs com multi renda e multi regime",
    input: {
      conversation_id: "fx-docs-mrmr-001",
      current_stage: "envio_docs",
      message_text: "Eu sou CLT e meu parceiro é autônomo, vamos compor e usar renda extra.",
      known_slots: {
        composicao: "parceiro",
        regime_trabalho: "clt",
        regime_trabalho_parceiro: "autonomo",
        renda_formal: 2100,
        multi_renda: "sim",
        renda_extra_na_composicao: "sim"
      },
      pending_slots: ["docs"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "autonomo_sem_ir_regra",
    title: "Autônomo sem IR com prazo e composição",
    input: {
      conversation_id: "fx-aut-sem-ir-regra-001",
      current_stage: "autonomo_ir_pergunta",
      message_text: "Sou autônomo, não declaro IR e ganho 2.700.",
      known_slots: {
        regime_trabalho: "autonomo",
        ir_declarado: "nao",
        renda_formal: 2700
      },
      pending_slots: ["ir_declarado", "renda"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "renda_formal_abaixo_3mil_composicao",
    title: "Renda formal abaixo de 3 mil pedindo composição",
    input: {
      conversation_id: "fx-renda-3k-001",
      current_stage: "autonomo_ir_pergunta",
      message_text: "Sou autônomo com IR e minha renda é 2.800.",
      known_slots: {
        regime_trabalho: "autonomo",
        ir_declarado: "sim",
        renda_formal: 2800
      },
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
    id: "dependente_solo_abaixo_4mil",
    title: "Dependente solo abaixo de 4 mil",
    input: {
      conversation_id: "fx-dep-001",
      current_stage: "dependente",
      message_text: "Quero seguir sozinho e minha renda formal é 3.500.",
      known_slots: {
        composicao: "sozinho",
        renda_formal: 3500
      },
      pending_slots: ["dependente"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "dependente_solo_acima_4mil",
    title: "Dependente solo acima de 4 mil",
    input: {
      conversation_id: "fx-dep-002",
      current_stage: "dependente",
      message_text: "Estou sozinho e minha renda formal é 4.500.",
      known_slots: {
        composicao: "sozinho",
        renda_formal: 4500
      },
      pending_slots: ["dependente"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "ctps_36_meses",
    title: "Explicação de CTPS 36 meses",
    input: {
      conversation_id: "fx-ctps-001",
      current_stage: "ctps",
      message_text: "Como funciona isso de 36 meses de CTPS?",
      known_slots: {},
      pending_slots: ["ctps"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "reprovacao_scr_bacen",
    title: "Reprovação por SCR/BACEN",
    input: {
      conversation_id: "fx-reprov-001",
      current_stage: "restricao",
      message_text: "Fui reprovado por SCR/BACEN. E agora?",
      known_slots: {},
      pending_slots: ["restricao"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "reprovacao_sinad_conres",
    title: "Reprovação por SINAD/CONRES",
    input: {
      conversation_id: "fx-reprov-002",
      current_stage: "restricao",
      message_text: "Me falaram que caiu em SINAD e CONRES.",
      known_slots: {},
      pending_slots: ["restricao"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "reprovacao_comprometimento_renda",
    title: "Reprovação por comprometimento de renda",
    input: {
      conversation_id: "fx-reprov-003",
      current_stage: "restricao",
      message_text: "Fui reprovado por comprometimento de renda por causa de empréstimo.",
      known_slots: {},
      pending_slots: ["restricao"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "visita_falta_envio_online",
    title: "Visita por falta de envio online",
    input: {
      conversation_id: "fx-visita-003",
      current_stage: "agendamento_visita",
      message_text: "Não quero enviar online, prefiro presencial.",
      known_slots: {
        docs_followup_tentativas: 2
      },
      pending_slots: ["visita"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "visita_decisores_presentes",
    title: "Visita com exigência de decisores presentes",
    input: {
      conversation_id: "fx-visita-004",
      current_stage: "visita",
      message_text: "Não vou mandar docs online, já tentamos isso antes.",
      known_slots: {
        docs_followup_tentativas: 3
      },
      pending_slots: ["visita"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "moro_junto_sem_uniao_estavel",
    title: "Moro junto sem união estável explícita",
    input: {
      conversation_id: "fx-mj-001",
      current_stage: "estado_civil",
      message_text: "Moro junto, como funciona?",
      known_slots: {},
      pending_slots: ["estado_civil", "composicao"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "moramos_juntos_sem_uniao_estavel",
    title: "Moramos juntos sem união estável explícita",
    input: {
      conversation_id: "fx-mj-002",
      current_stage: "estado_civil",
      message_text: "Moramos juntos e quero entender se pode seguir.",
      known_slots: {},
      pending_slots: ["estado_civil", "composicao"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "uniao_estavel_explicita",
    title: "União estável explícita",
    input: {
      conversation_id: "fx-uex-001",
      current_stage: "estado_civil",
      message_text: "Tenho união estável e quero avaliar o melhor formato.",
      known_slots: {},
      pending_slots: ["estado_civil", "composicao"],
      recent_messages: []
    },
    expected: {
      required_slots: ["estado_civil"],
      should_request_confirmation: false,
      min_confidence: 0.74
    }
  },
  {
    id: "uniao_estavel_solo",
    title: "União estável solo",
    input: {
      conversation_id: "fx-uniao-002",
      current_stage: "estado_civil",
      message_text: "Tenho união estável, mas quero seguir solo.",
      known_slots: {
        estado_civil: "uniao_estavel",
        composicao: "sozinho"
      },
      pending_slots: ["composicao"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "uniao_estavel_conjunto",
    title: "União estável conjunto",
    input: {
      conversation_id: "fx-uniao-003",
      current_stage: "estado_civil",
      message_text: "Tenho união estável e quero fazer em conjunto.",
      known_slots: {
        estado_civil: "uniao_estavel",
        composicao: "parceiro"
      },
      pending_slots: ["composicao"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "casado_civil_conjunto_obrigatorio",
    title: "Casado civil com conjunto obrigatório",
    input: {
      conversation_id: "fx-civil-002",
      current_stage: "estado_civil",
      message_text: "Sou casado no civil e quero seguir sozinho.",
      known_slots: {
        estado_civil: "casado_civil"
      },
      pending_slots: ["composicao"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "clt_fixo_holerite_quantidade",
    title: "CLT salário fixo perguntando holerite",
    input: {
      conversation_id: "fx-docs-hol-fixo-001",
      current_stage: "envio_docs",
      message_text: "Sou CLT com salário fixo, sem comissão. Quantos holerites preciso enviar?",
      known_slots: {
        regime_trabalho: "clt",
        renda_formal: 3200
      },
      pending_slots: ["docs"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "clt_variavel_holerite_quantidade",
    title: "CLT renda variável perguntando holerite",
    input: {
      conversation_id: "fx-docs-hol-var-001",
      current_stage: "envio_docs",
      message_text: "Sou CLT, tenho comissão e hora extra. Quantos holerites preciso?",
      known_slots: {
        regime_trabalho: "clt",
        renda_formal: 3100,
        renda_variavel: "sim"
      },
      pending_slots: ["docs"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "autonomo_com_ir_docs_microregra",
    title: "Autônomo com IR perguntando documentos",
    input: {
      conversation_id: "fx-docs-aut-ir-001",
      current_stage: "envio_docs",
      message_text: "Sou autônomo com IR, quais documentos vocês pedem?",
      known_slots: {
        regime_trabalho: "autonomo",
        ir_declarado: "sim",
        renda_formal: 3600
      },
      pending_slots: ["docs"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "autonomo_sem_ir_docs_microregra",
    title: "Autônomo sem IR perguntando documentos",
    input: {
      conversation_id: "fx-docs-aut-noir-001",
      current_stage: "envio_docs",
      message_text: "Sou autônomo e não declaro IR. Quais docs preciso agora?",
      known_slots: {
        regime_trabalho: "autonomo",
        ir_declarado: "nao",
        renda_formal: 2300
      },
      pending_slots: ["docs"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "renda_extra_abaixo_2550_microregra",
    title: "Renda extra com principal abaixo de 2550",
    input: {
      conversation_id: "fx-docs-extra-low-001",
      current_stage: "envio_docs",
      message_text: "Sou CLT, renda formal 2400 e vou usar renda extra na composição.",
      known_slots: {
        regime_trabalho: "clt",
        renda_formal: 2400,
        multi_renda: "sim",
        renda_extra_na_composicao: "sim"
      },
      pending_slots: ["docs"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "renda_extra_acima_2550_microregra",
    title: "Renda extra com principal acima de 2550",
    input: {
      conversation_id: "fx-docs-extra-high-001",
      current_stage: "envio_docs",
      message_text: "Sou CLT e minha renda formal é 3000, tenho uma renda extra de Uber também.",
      known_slots: {
        regime_trabalho: "clt",
        renda_formal: 3000,
        multi_renda: "sim"
      },
      pending_slots: ["docs"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "multi_renda_multi_regime_microregra",
    title: "Multi renda com multi regime",
    input: {
      conversation_id: "fx-docs-multirule-001",
      current_stage: "envio_docs",
      message_text: "Eu sou CLT, meu parceiro é autônomo e ainda temos renda extra na composição.",
      known_slots: {
        composicao: "parceiro",
        regime_trabalho: "clt",
        regime_trabalho_parceiro: "autonomo",
        renda_formal: 2300,
        multi_renda: "sim",
        renda_extra_na_composicao: "sim"
      },
      pending_slots: ["docs"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "composicao_participantes_docs_microregra",
    title: "Composição com parceiro familiar e P3",
    input: {
      conversation_id: "fx-docs-participantes-001",
      current_stage: "envio_docs",
      message_text: "Vamos compor com parceiro, familiar e terceira pessoa. Quais docs de cada um?",
      known_slots: {
        composicao: "parceiro",
        parceiro_p2: "sim",
        familiar: "mae",
        p3: "sim",
        regime_trabalho: "clt",
        regime_trabalho_parceiro: "autonomo",
        regime_trabalho_familiar: "aposentado",
        regime_trabalho_p3: "servidor"
      },
      pending_slots: ["docs"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: true,
      min_confidence: 0.5
    }
  },
  {
    id: "duvida_identificacao_rg_cnh_cpf_microregra",
    title: "Dúvida de identificação RG CNH CPF",
    input: {
      conversation_id: "fx-docs-id-001",
      current_stage: "envio_docs",
      message_text: "Para identificação pode ser RG, CNH e CPF? Como vocês pedem isso?",
      known_slots: {
        regime_trabalho: "clt"
      },
      pending_slots: ["docs"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "duvida_comprovante_residencia_microregra",
    title: "Dúvida de comprovante de residência",
    input: {
      conversation_id: "fx-docs-res-001",
      current_stage: "envio_docs",
      message_text: "Quais comprovantes de residência vocês aceitam no meu caso?",
      known_slots: {
        regime_trabalho: "autonomo",
        ir_declarado: "sim"
      },
      pending_slots: ["docs"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "doc_tipo_incerto_sem_resposta",
    title: "Documento recebido — tipo não identificado, pede confirmação",
    input: {
      conversation_id: "fx-docs-tipo-incerto-001",
      current_stage: "envio_docs",
      message_text: "Aqui está o arquivo",
      known_slots: {
        doc_tipo_incerto: "sim",
        regime_trabalho: "clt"
      },
      pending_slots: ["docs"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: true,
      min_confidence: 0.3
    }
  },
  {
    id: "doc_tipo_incerto_usuario_respondeu",
    title: "Documento incerto — usuário confirma que é holerite",
    input: {
      conversation_id: "fx-docs-tipo-incerto-002",
      current_stage: "envio_docs",
      message_text: "É o holerite do mês passado",
      known_slots: {
        aguardando_confirmacao_tipo_doc: "sim",
        regime_trabalho: "clt"
      },
      pending_slots: ["docs"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.3
    }
  },
  {
    id: "doc_fora_de_ordem_com_pendencia",
    title: "Documento fora de ordem — reconhece e redireciona para pendência principal",
    input: {
      conversation_id: "fx-docs-fora-ordem-001",
      current_stage: "envio_docs",
      message_text: "Mandei o comprovante de residência aqui.",
      known_slots: {
        doc_fora_de_ordem: "sim",
        doc_tipo_recebido: "comprovante de residência",
        doc_pendencia_principal: "holerite do titular",
        regime_trabalho: "clt"
      },
      pending_slots: ["docs"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.3
    }
  },
  {
    id: "docs_por_participante_status",
    title: "Docs por participante — diferencia o que foi enviado do que falta por pessoa",
    input: {
      conversation_id: "fx-docs-participante-status-001",
      current_stage: "envio_docs",
      message_text: "Já mandei o holerite, e agora?",
      known_slots: {
        composicao: "parceiro",
        regime_trabalho: "clt",
        docs_recebidos_titular: "holerite",
        docs_pendentes_titular: "CTPS",
        docs_pendentes_parceiro: "comprovante de renda"
      },
      pending_slots: ["docs"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.3
    }
  },
  {
    id: "visita_confirmada_duvida_generica",
    title: "Visita confirmada — cliente com dúvida genérica pós-confirmação",
    input: {
      conversation_id: "fx-visita-005",
      current_stage: "visita_confirmada",
      message_text: "Ok, e o que acontece agora?",
      known_slots: {},
      pending_slots: ["visita"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "visita_convite_esfriamento",
    title: "Visita convidada — cliente esfria após convite",
    input: {
      conversation_id: "fx-visita-006",
      current_stage: "agendamento_visita",
      message_text: "Vou pensar, talvez depois.",
      known_slots: {
        visita: "convite"
      },
      pending_slots: ["visita"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "visita_persuasao_indeciso",
    title: "Visita — cliente indeciso, persuasão objetiva",
    input: {
      conversation_id: "fx-visita-007",
      current_stage: "agendamento_visita",
      message_text: "Não sei, acho que não preciso visitar agora.",
      known_slots: {},
      pending_slots: ["visita"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "visita_pos_visita_proximo_passo",
    title: "Pós-visita — condução para próximo passo objetivo",
    input: {
      conversation_id: "fx-visita-008",
      current_stage: "finalizacao_processo",
      message_text: "Fiz a visita, e agora?",
      known_slots: {},
      pending_slots: [],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "visita_confirmada_remarcar",
    title: "Visita confirmada — cliente quer remarcar",
    input: {
      conversation_id: "fx-visita-009",
      current_stage: "visita_confirmada",
      message_text: "Preciso remarcar para outro dia.",
      known_slots: {},
      pending_slots: ["visita"],
      recent_messages: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO A — TOPO (fixtures PR1)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── inicio_programa ──────────────────────────────────────────────────────
  {
    id: "inicio_programa_abertura_normal",
    title: "Abertura normal do programa — saudação acolhedora",
    input: {
      conversation_id: "fx-topo-prog-001",
      current_stage: "inicio_programa",
      message_text: "Oi, boa tarde!",
      known_slots: {},
      pending_slots: [],
      required_slots: [],
      recent_messages: [],
      normative_context: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },
  {
    id: "inicio_programa_cliente_pergunta_antes",
    title: "Cliente chega perguntando antes de responder — retorno ao trilho",
    input: {
      conversation_id: "fx-topo-prog-002",
      current_stage: "inicio_programa",
      message_text: "Vocês são de que empresa? Quero saber antes de falar qualquer coisa.",
      known_slots: {},
      pending_slots: [],
      required_slots: [],
      recent_messages: [],
      normative_context: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  },

  // ── inicio_nome ──────────────────────────────────────────────────────────
  {
    id: "inicio_nome_coleta_normal",
    title: "Coleta normal do nome do cliente",
    input: {
      conversation_id: "fx-topo-nome-001",
      current_stage: "inicio_nome",
      message_text: "Meu nome é Carlos Eduardo.",
      known_slots: {},
      pending_slots: ["nome"],
      required_slots: ["nome"],
      recent_messages: [
        { role: "assistant", content: "Prazer! Para começarmos, qual é o seu nome completo?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: ["nome"],
      should_request_confirmation: false,
      min_confidence: 0.72
    }
  },
  {
    id: "inicio_nome_nome_embutido",
    title: "Nome já embutido na fala do cliente antes da pergunta",
    input: {
      conversation_id: "fx-topo-nome-002",
      current_stage: "inicio_nome",
      message_text: "Sou a Maria da Silva, quero saber do Minha Casa Minha Vida.",
      known_slots: {},
      pending_slots: ["nome"],
      required_slots: ["nome"],
      recent_messages: [],
      normative_context: []
    },
    expected: {
      required_slots: ["nome"],
      should_request_confirmation: false,
      min_confidence: 0.72
    }
  },

  // ── inicio_nacionalidade ─────────────────────────────────────────────────
  {
    id: "inicio_nacionalidade_brasileiro",
    title: "Nacionalidade brasileira — caso direto",
    input: {
      conversation_id: "fx-topo-nac-001",
      current_stage: "inicio_nacionalidade",
      message_text: "Sou brasileiro.",
      known_slots: { nome: "Carlos Eduardo" },
      pending_slots: ["nacionalidade"],
      required_slots: ["nacionalidade"],
      recent_messages: [
        { role: "assistant", content: "Carlos, você é brasileiro(a) ou de outra nacionalidade?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: ["nacionalidade"],
      should_request_confirmation: false,
      min_confidence: 0.78
    }
  },
  {
    id: "inicio_nacionalidade_estrangeiro",
    title: "Nacionalidade estrangeira — caso limítrofe",
    input: {
      conversation_id: "fx-topo-nac-002",
      current_stage: "inicio_nacionalidade",
      message_text: "Sou colombiano, mas moro aqui há 8 anos.",
      known_slots: { nome: "Juan Herrera" },
      pending_slots: ["nacionalidade"],
      required_slots: ["nacionalidade"],
      recent_messages: [
        { role: "assistant", content: "Juan, você é brasileiro(a) ou de outra nacionalidade?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: ["nacionalidade"],
      should_request_confirmation: false,
      min_confidence: 0.72
    }
  },

  // ── inicio_rnm ───────────────────────────────────────────────────────────
  {
    id: "inicio_rnm_resposta_clara",
    title: "Estrangeiro com resposta clara sobre RNM",
    input: {
      conversation_id: "fx-topo-rnm-001",
      current_stage: "inicio_rnm",
      message_text: "Sim, tenho RNM. O número é V123456-7.",
      known_slots: { nome: "Juan Herrera", nacionalidade: "colombiano" },
      pending_slots: ["rnm_status"],
      required_slots: ["rnm_status"],
      recent_messages: [
        { role: "assistant", content: "Juan, como você não é brasileiro, precisamos verificar seu RNM. Você tem o Registro Nacional Migratório?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: ["rnm_status"],
      should_request_confirmation: false,
      min_confidence: 0.72
    }
  },
  {
    id: "inicio_rnm_resposta_ambigua",
    title: "Estrangeiro com resposta ambígua sobre RNM — precisa confirmação",
    input: {
      conversation_id: "fx-topo-rnm-002",
      current_stage: "inicio_rnm",
      message_text: "Acho que tenho, mas não sei se é isso que vocês pedem. Tenho um documento da Polícia Federal.",
      known_slots: { nome: "Juan Herrera", nacionalidade: "colombiano" },
      pending_slots: ["rnm_status"],
      required_slots: ["rnm_status"],
      recent_messages: [
        { role: "assistant", content: "Juan, como você não é brasileiro, precisamos verificar seu RNM. Você tem o Registro Nacional Migratório?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: true,
      min_confidence: 0.4
    }
  },

  // ── inicio_rnm_validade ──────────────────────────────────────────────────
  {
    id: "inicio_rnm_validade_prazo_indeterminado",
    title: "RNM com prazo indeterminado / permanente",
    input: {
      conversation_id: "fx-topo-rnmv-001",
      current_stage: "inicio_rnm_validade",
      message_text: "É permanente, sem prazo de validade.",
      known_slots: { nome: "Juan Herrera", nacionalidade: "colombiano", rnm_status: "sim" },
      pending_slots: ["rnm_validade"],
      required_slots: ["rnm_validade"],
      recent_messages: [
        { role: "assistant", content: "Entendi, Juan. Seu RNM tem prazo de validade ou é permanente?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: ["rnm_validade"],
      should_request_confirmation: false,
      min_confidence: 0.72
    }
  },
  {
    id: "inicio_rnm_validade_resposta_vaga",
    title: "RNM com resposta vaga — exige formulação cuidadosa",
    input: {
      conversation_id: "fx-topo-rnmv-002",
      current_stage: "inicio_rnm_validade",
      message_text: "Não sei, faz tempo que tirei e nunca olhei a validade.",
      known_slots: { nome: "Juan Herrera", nacionalidade: "colombiano", rnm_status: "sim" },
      pending_slots: ["rnm_validade"],
      required_slots: ["rnm_validade"],
      recent_messages: [
        { role: "assistant", content: "Entendi, Juan. Seu RNM tem prazo de validade ou é permanente?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.35
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO B — GATES CRÍTICOS (fixtures PR1)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── autonomo_sem_ir_este_ano ─────────────────────────────────────────────
  {
    id: "autonomo_sem_ir_este_ano_resposta_objetiva",
    title: "Autônomo sem IR — resposta objetiva sobre declarar este ano",
    input: {
      conversation_id: "fx-gate-asir-001",
      current_stage: "autonomo_sem_ir_este_ano",
      message_text: "Não, não pretendo declarar esse ano.",
      known_slots: { regime_trabalho: "autonomo", ir_declarado: "nao" },
      pending_slots: ["autonomo_sem_ir_este_ano"],
      required_slots: ["autonomo_sem_ir_este_ano"],
      recent_messages: [
        { role: "assistant", content: "Entendi que você não declara IR. Você pretende declarar esse ano?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.58
    }
  },
  {
    id: "autonomo_sem_ir_este_ano_resposta_ambigua",
    title: "Autônomo sem IR — resposta ambígua que exige condução cuidadosa",
    input: {
      conversation_id: "fx-gate-asir-002",
      current_stage: "autonomo_sem_ir_este_ano",
      message_text: "Talvez, depende de quanto eu faturar até o meio do ano.",
      known_slots: { regime_trabalho: "autonomo", ir_declarado: "nao" },
      pending_slots: ["autonomo_sem_ir_este_ano"],
      required_slots: ["autonomo_sem_ir_este_ano"],
      recent_messages: [
        { role: "assistant", content: "Entendi que você não declara IR. Você pretende declarar esse ano?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.35
    }
  },

  // ── renda ────────────────────────────────────────────────────────────────
  {
    id: "renda_valor_objetivo",
    title: "Coleta direta de renda — valor objetivo",
    input: {
      conversation_id: "fx-gate-renda-001",
      current_stage: "renda",
      message_text: "Ganho R$ 3.200 por mês.",
      known_slots: { regime_trabalho: "clt" },
      pending_slots: ["renda", "ir_declarado"],
      required_slots: ["renda"],
      recent_messages: [
        { role: "assistant", content: "Qual é a sua renda mensal bruta?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: ["renda"],
      should_request_confirmation: false,
      min_confidence: 0.78
    }
  },
  {
    id: "renda_valor_faixa",
    title: "Coleta de renda — resposta aproximada / faixa",
    input: {
      conversation_id: "fx-gate-renda-002",
      current_stage: "renda",
      message_text: "Fica entre 2.800 e 3.500, depende do mês.",
      known_slots: { regime_trabalho: "clt" },
      pending_slots: ["renda", "ir_declarado"],
      required_slots: ["renda"],
      recent_messages: [
        { role: "assistant", content: "Qual é a sua renda mensal bruta?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: ["renda"],
      should_request_confirmation: false,
      min_confidence: 0.58
    }
  },
  {
    id: "renda_composicao_implicita",
    title: "Renda com composição implícita sem invadir stage alheio",
    input: {
      conversation_id: "fx-gate-renda-003",
      current_stage: "renda",
      message_text: "Eu ganho 2.200 e minha esposa mais uns 1.800.",
      known_slots: { regime_trabalho: "clt", estado_civil: "casado_civil" },
      pending_slots: ["renda", "ir_declarado"],
      required_slots: ["renda"],
      recent_messages: [
        { role: "assistant", content: "Qual é a sua renda mensal bruta?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: ["renda"],
      should_request_confirmation: false,
      min_confidence: 0.58
    }
  },

  // ── ir_declarado ─────────────────────────────────────────────────────────
  {
    id: "ir_declarado_resposta_sim",
    title: "IR declarado — resposta sim",
    input: {
      conversation_id: "fx-gate-ir-001",
      current_stage: "ir_declarado",
      message_text: "Sim, declaro todo ano.",
      known_slots: { regime_trabalho: "autonomo", renda_formal: 4200 },
      pending_slots: ["ir_declarado"],
      required_slots: ["ir_declarado"],
      recent_messages: [
        { role: "assistant", content: "Você declara imposto de renda?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: ["ir_declarado"],
      should_request_confirmation: false,
      min_confidence: 0.78
    }
  },
  {
    id: "ir_declarado_resposta_nao",
    title: "IR declarado — resposta não",
    input: {
      conversation_id: "fx-gate-ir-002",
      current_stage: "ir_declarado",
      message_text: "Não, nunca declarei.",
      known_slots: { regime_trabalho: "autonomo", renda_formal: 2500 },
      pending_slots: ["ir_declarado"],
      required_slots: ["ir_declarado"],
      recent_messages: [
        { role: "assistant", content: "Você declara imposto de renda?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: ["ir_declarado"],
      should_request_confirmation: false,
      min_confidence: 0.78
    }
  },
  {
    id: "ir_declarado_resposta_dubia",
    title: "IR declarado — resposta dúbia",
    input: {
      conversation_id: "fx-gate-ir-003",
      current_stage: "ir_declarado",
      message_text: "Ano passado não, mas acho que esse ano eu deveria, meu contador falou.",
      known_slots: { regime_trabalho: "autonomo", renda_formal: 3000 },
      pending_slots: ["ir_declarado"],
      required_slots: ["ir_declarado"],
      recent_messages: [
        { role: "assistant", content: "Você declara imposto de renda?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.35
    }
  },

  // ── autonomo_compor_renda ────────────────────────────────────────────────
  {
    id: "autonomo_compor_renda_aceita",
    title: "Autônomo sem IR aceita composição de renda",
    input: {
      conversation_id: "fx-gate-acr-001",
      current_stage: "autonomo_compor_renda",
      message_text: "Sim, minha esposa trabalha de CLT e pode compor comigo.",
      known_slots: { regime_trabalho: "autonomo", ir_declarado: "nao", renda_formal: 2200 },
      pending_slots: ["composicao"],
      required_slots: ["composicao"],
      recent_messages: [
        { role: "assistant", content: "Como autônomo sem IR, uma opção é compor renda com alguém. Tem alguém que possa compor com você?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: ["composicao"],
      should_request_confirmation: false,
      min_confidence: 0.58
    }
  },
  {
    id: "autonomo_compor_renda_resiste",
    title: "Autônomo sem IR resiste à composição — fala deve orientar sem parecer robótica",
    input: {
      conversation_id: "fx-gate-acr-002",
      current_stage: "autonomo_compor_renda",
      message_text: "Não quero envolver ninguém, prefiro seguir sozinho.",
      known_slots: { regime_trabalho: "autonomo", ir_declarado: "nao", renda_formal: 2200 },
      pending_slots: ["composicao"],
      required_slots: ["composicao"],
      recent_messages: [
        { role: "assistant", content: "Como autônomo sem IR, uma opção é compor renda com alguém. Tem alguém que possa compor com você?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.58
    }
  },

  // ── regularizacao_restricao ──────────────────────────────────────────────
  {
    id: "regularizacao_restricao_em_andamento",
    title: "Cliente diz que está regularizando restrição",
    input: {
      conversation_id: "fx-gate-rr-001",
      current_stage: "regularizacao_restricao",
      message_text: "Já estou negociando com o banco, deve sair semana que vem.",
      known_slots: { restricao: "sim" },
      pending_slots: ["regularizacao_restricao"],
      required_slots: ["regularizacao_restricao"],
      recent_messages: [
        { role: "assistant", content: "Identificamos uma restrição no seu nome. Você já está regularizando?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: ["regularizacao_restricao"],
      should_request_confirmation: false,
      min_confidence: 0.58
    }
  },
  {
    id: "regularizacao_restricao_nao_regularizou",
    title: "Cliente diz que ainda não regularizou restrição",
    input: {
      conversation_id: "fx-gate-rr-002",
      current_stage: "regularizacao_restricao",
      message_text: "Não, ainda não comecei a resolver isso.",
      known_slots: { restricao: "sim" },
      pending_slots: ["regularizacao_restricao"],
      required_slots: ["regularizacao_restricao"],
      recent_messages: [
        { role: "assistant", content: "Identificamos uma restrição no seu nome. Você já está regularizando?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: ["regularizacao_restricao"],
      should_request_confirmation: false,
      min_confidence: 0.58
    }
  },
  {
    id: "regularizacao_restricao_pergunta_seguir",
    title: "Cliente pergunta se mesmo assim consegue seguir com restrição",
    input: {
      conversation_id: "fx-gate-rr-003",
      current_stage: "regularizacao_restricao",
      message_text: "Mas mesmo com essa restrição eu consigo seguir no programa?",
      known_slots: { restricao: "sim" },
      pending_slots: ["regularizacao_restricao"],
      required_slots: ["regularizacao_restricao"],
      recent_messages: [
        { role: "assistant", content: "Identificamos uma restrição no seu nome. Você já está regularizando?" }
      ],
      normative_context: []
    },
    expected: {
      required_slots: [],
      should_request_confirmation: false,
      min_confidence: 0.5
    }
  }
]);
