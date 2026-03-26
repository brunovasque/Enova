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
  }
]);
