/**
 * knowledge-base.js — Knowledge Base Factual Canônica da Enova
 *
 * Etapa 4 da reorganização cognitiva.
 * Este módulo é estático, puro e sem dependência de banco ou runtime.
 * Pronto para consumo por FAQ, objection handlers, reancoragem e builders cognitivos
 * nas etapas seguintes.
 *
 * Regras de todos os conteúdos:
 *  - texto limpo, curto, factual e reaproveitável
 *  - não promete aprovação
 *  - não contradiz o funil mecânico
 *  - usa "imóvel", não "casa"
 *  - zero dependência de banco ou serviços externos
 */

/**
 * @typedef {{
 *   id: string,
 *   titulo: string,
 *   conteudo: string
 * }} KBItem
 */

/** @type {Readonly<KBItem[]>} */
export const KNOWLEDGE_BASE = Object.freeze([
  // ── 1. elegibilidade_basica ──────────────────────────────────────────────
  {
    id: "elegibilidade_basica",
    titulo: "Elegibilidade Básica",
    conteudo:
      "Para participar do processo de financiamento imobiliário é necessário ser brasileiro nato ou naturalizado, ou possuir RNM (Registro Nacional Migratório) válido. Residência estável no Brasil também é requisito. Perfis com características específicas passam por análise individual para avaliar as possibilidades dentro das regras dos programas disponíveis."
  },

  // ── 2. composicao_renda ──────────────────────────────────────────────────
  {
    id: "composicao_renda",
    titulo: "Composição de Renda",
    conteudo:
      "A análise pode ser feita com renda individual (solo) ou com composição de renda junto a um cônjuge ou familiar. Casados no civil, em união estável ou em arranjos familiares elegíveis podem compor a renda para aumentar o poder de compra. Cada perfil de composição tem regras próprias dentro dos programas de financiamento imobiliário."
  },

  // ── 3. autonomo_ir ───────────────────────────────────────────────────────
  {
    id: "autonomo_ir",
    titulo: "Autônomo e Declaração de IR",
    conteudo:
      "Autônomos com Imposto de Renda declarado têm o processo facilitado, pois a declaração serve como comprovante formal de renda. Autônomos sem IR declarado podem ainda assim participar, mas precisam apresentar outros documentos que demonstrem renda de forma consistente. MEI e PJ têm regras específicas conforme o banco e o programa — o perfil é avaliado individualmente."
  },

  // ── 4. ctps_36 ───────────────────────────────────────────────────────────
  {
    id: "ctps_36",
    titulo: "CTPS e 36 Meses de Registro",
    conteudo:
      "Ter 36 meses ou mais de registro contínuo em Carteira de Trabalho (CTPS) é um requisito de alguns programas de financiamento imobiliário. Esse critério demonstra estabilidade de vínculo empregatício formal e impacta diretamente a elegibilidade em determinadas linhas de crédito. Perfis com menos tempo de registro são analisados conforme as opções disponíveis no momento."
  },

  // ── 5. restricao_credito ─────────────────────────────────────────────────
  {
    id: "restricao_credito",
    titulo: "Restrição de Crédito",
    conteudo:
      "Ter restrição de crédito não inviabiliza automaticamente o processo. O impacto depende do tipo de restrição, do valor, da data e do banco. Algumas situações permitem avançar com regularização em paralelo; outras precisam ser resolvidas antes de qualquer análise formal. Cada caso é avaliado individualmente sem promessa prévia de resultado."
  },

  // ── 6. docs_por_perfil ───────────────────────────────────────────────────
  {
    id: "docs_por_perfil",
    titulo: "Documentos por Perfil",
    conteudo:
      "A lista de documentos varia conforme o perfil do solicitante. CLT: RG/CPF, comprovante de renda (holerite), extrato do FGTS e comprovante de residência. Autônomo com IR: RG/CPF, declaração de IR completa com recibo, extrato bancário e comprovante de residência. Autônomo sem IR: RG/CPF, extrato bancário dos últimos meses, comprovante de renda alternativo e comprovante de residência. Servidor público: RG/CPF, contracheque, declaração de vínculo e comprovante de residência. Aposentado/Pensionista: RG/CPF, extrato do benefício, comprovante de residência."
  },

  // ── 7. visita_plantao ────────────────────────────────────────────────────
  {
    id: "visita_plantao",
    titulo: "Visita Presencial e Plantão",
    conteudo:
      "A visita ao plantão ou ao imóvel é parte do processo para quem opta por ver o imóvel pessoalmente. Ela complementa a análise de crédito, que ocorre de forma independente. Recomenda-se avançar com a análise antes da visita para chegar com o perfil de crédito já mapeado. A visita presencial é organizada conforme a disponibilidade e o andamento do processo."
  },

  // ── 8. correspondente_fluxo ──────────────────────────────────────────────
  {
    id: "correspondente_fluxo",
    titulo: "Correspondente Bancário e Fluxo",
    conteudo:
      "O correspondente bancário entra no processo após a pré-análise e o envio dos documentos obrigatórios. Ele é responsável pela formalização junto ao banco e só atua quando o perfil básico já foi verificado. A etapa do correspondente não substitui a análise inicial — é uma etapa posterior e sequencial dentro do fluxo de financiamento imobiliário."
  },

  // ── 9. simulacao_aprovacao ───────────────────────────────────────────────
  {
    id: "simulacao_aprovacao",
    titulo: "Simulação e Aprovação",
    conteudo:
      "Simulações detalhadas de valores, parcelas e condições dependem do perfil completo e do banco envolvido. Aprovação só acontece após análise formal dos documentos pelo banco. Nenhuma estimativa prévia equivale a aprovação. Cada banco tem critérios e políticas próprias que influenciam o resultado final."
  },

  // ── 10. fgts_entrada ─────────────────────────────────────────────────────
  {
    id: "fgts_entrada",
    titulo: "FGTS como Entrada",
    conteudo:
      "O FGTS pode ser utilizado como parte da entrada ou para amortização do financiamento imobiliário em muitos casos, conforme as regras do programa e do banco. A elegibilidade para uso do FGTS depende do tempo de contribuição, do vínculo empregatício e das condições do imóvel. O encaixe específico do FGTS é verificado durante a análise formal — não há confirmação automática antes disso."
  }
]);
