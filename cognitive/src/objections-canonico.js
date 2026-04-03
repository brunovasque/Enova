/**
 * objections-canonico.js — Catálogo Canônico Global de Objeções da Enova
 *
 * Etapa 2 da reorganização cognitiva.
 * Este módulo é estático, puro e sem dependência de banco ou runtime.
 * Pronto para consumo por qualquer builder nas etapas seguintes.
 *
 * Regras de todas as respostas:
 *  - tom da Enova: acolhedor sem bajular, direto sem prometer aprovação
 *  - usa "imóvel", não "casa"
 *  - não contradiz o funil mecânico
 *  - curta e natural, pronta para reutilização
 *  - cada entrada tem ao menos 2 variantes de tom
 */

/**
 * @typedef {{
 *   id: string,
 *   frase_tipica: string,
 *   resposta_canonica: string,
 *   variantes_tom: string[]
 * }} ObjectionEntry
 */

/** @type {Readonly<ObjectionEntry[]>} */
export const OBJECTIONS_CATALOG = Object.freeze([
  {
    id: "medo_golpe",
    frase_tipica: "tenho medo de golpe, isso é confiável?",
    resposta_canonica:
      "Entendo a preocupação — é totalmente válida. A Enova é uma assessoria de crédito imobiliário regularizada. Nenhum pagamento é solicitado antes da aprovação formal, e todo o processo passa pelo banco. Se tiver dúvida sobre qualquer etapa, pode perguntar sem cerimônia.",
    variantes_tom: [
      "Faz sentido ter esse cuidado. Aqui nada é cobrado antes da aprovação e o processo é conduzido pelo banco. Pode perguntar o que quiser em qualquer momento.",
      "Essa preocupação é legítima. O processo é conduzido pelo banco, sem pagamento antecipado. Estou aqui pra esclarecer qualquer dúvida que aparecer."
    ]
  },
  {
    id: "sem_tempo",
    frase_tipica: "agora não dá, tô sem tempo",
    resposta_canonica:
      "Sem problema. O processo pode ser feito no seu tempo — as etapas não precisam ser todas de uma vez. Quando tiver um momento melhor, é só me avisar e a gente continua de onde parou.",
    variantes_tom: [
      "Tranquilo. Cada etapa pode ser feita separadamente e no seu ritmo. É só me chamar quando estiver mais livre.",
      "Tudo bem. Não precisa resolver tudo agora. Quando tiver um tempinho, a gente retoma de onde ficou."
    ]
  },
  {
    id: "presencial_preferido",
    frase_tipica: "prefiro ir presencialmente, quero no plantão",
    resposta_canonica:
      "Entendo. A visita ao plantão é uma opção válida. Só que o processo de financiamento em si precisa passar pela análise do banco, que acontece independente de onde você escolher o imóvel. Se quiser, podemos avançar com a análise aqui enquanto você busca o imóvel — assim você chega ao plantão já com o crédito mapeado.",
    variantes_tom: [
      "Visitar o plantão faz sentido. E a análise de crédito pode rodar em paralelo, então você chega lá sabendo o que pode de fato. Posso te ajudar com essa parte.",
      "Presencial é uma boa opção pra ver o imóvel. A análise de crédito segue o processo normal independente disso — dá pra trabalhar as duas coisas ao mesmo tempo."
    ]
  },
  {
    id: "vou_pensar",
    frase_tipica: "vou pensar, depois eu vejo",
    resposta_canonica:
      "Claro, sem pressa. Se surgir qualquer dúvida enquanto pensa, pode perguntar aqui. E quando quiser retomar, é só me chamar.",
    variantes_tom: [
      "Fica à vontade pra pensar. Qualquer dúvida que surgir, pode me chamar antes de decidir.",
      "Sem pressa. Quando estiver pronto pra continuar, é só me avisar. Fico por aqui."
    ]
  },
  {
    id: "ja_fiz_em_outro_lugar",
    frase_tipica: "já fiz com outro corretor, já tô vendo em outro lugar",
    resposta_canonica:
      "Sem problema, não tem exclusividade aqui. Se quiser comparar as condições ou tiver dúvida sobre alguma proposta que recebeu, fico à disposição. Às vezes vale a pena ter mais de uma análise rodando.",
    variantes_tom: [
      "Sem exclusividade de lado nenhum. Se quiser comparar ou tiver alguma dúvida sobre o processo que já está, pode me chamar.",
      "Tranquilo. Ter mais de uma frente rodando pode ser vantagem. Se quiser uma segunda análise ou tirar dúvida, é só falar."
    ]
  },
  {
    id: "vergonha_renda",
    frase_tipica: "tenho vergonha de falar da renda",
    resposta_canonica:
      "Não precisa ter vergonha nenhuma. A renda é uma informação técnica do processo — não tem julgamento aqui. Quanto maior a precisão nos dados, melhor a análise. E tudo que você compartilha fica restrito ao processo.",
    variantes_tom: [
      "Fique tranquilo. Renda é dado técnico, não tem avaliação de valor sobre ela. Aqui o que importa é entender o seu perfil real pra buscar a melhor opção.",
      "Sem julgamento. A renda é só uma peça do perfil de crédito. Quanto mais precisa a informação, melhor consigo te ajudar."
    ]
  },
  {
    id: "medo_reprovacao",
    frase_tipica: "tenho medo de ser reprovado",
    resposta_canonica:
      "Esse medo é compreensível. Não dá pra garantir aprovação antes de ver o perfil completo — isso é responsabilidade do banco. O que a gente faz é preparar o dossiê da melhor forma possível e mapear as chances reais antes de avançar. Se houver risco, prefiro te avisar logo.",
    variantes_tom: [
      "Entendo. Não prometo aprovação — ninguém pode. Mas o que faço é mapear o seu perfil com honestidade e preparar tudo da melhor forma antes de submeter.",
      "Esse cuidado faz sentido. Trabalho pra aumentar suas chances, não pra criar expectativa errada. Se o perfil tiver algum ponto crítico, você vai saber antes de tudo."
    ]
  },
  {
    id: "nao_quero_online",
    frase_tipica: "não quero fazer online",
    resposta_canonica:
      "Entendo a resistência. O processo precisa de alguns dados e documentos que podem ser enviados por aqui, mas é feito de forma organizada e segura. Se tiver alguma parte específica que te preocupa, pode me dizer e a gente vê como encaminhar da melhor forma.",
    variantes_tom: [
      "Faz sentido essa preocupação. O processo é seguro e organizado. Se tiver algo específico que te incomoda, pode falar que a gente resolve juntos.",
      "Sem problema em ter essa ressalva. Me fala o que te preocupa mais e eu explico como funciona cada etapa."
    ]
  },
  {
    id: "sem_documentos_agora",
    frase_tipica: "não tô com os documentos agora",
    resposta_canonica:
      "Sem problema. Não precisa ter nada agora — os documentos entram em uma etapa específica do processo. Dá pra avançar com o que temos e você envia quando tiver em mãos.",
    variantes_tom: [
      "Tranquilo. Documentos têm a hora certa no processo. Pode continuar aqui e enviamos quando chegar essa etapa.",
      "Não precisa dos documentos agora. A gente vai chegar nessa parte e você envia quando estiver com eles. Por enquanto, dá pra seguir."
    ]
  },
  {
    id: "duvida_seguranca_dados",
    frase_tipica: "meus dados ficam seguros?",
    resposta_canonica:
      "Sim. Os dados ficam em ambiente seguro e são usados exclusivamente para a análise do financiamento imobiliário. Nada é compartilhado com terceiros sem a sua autorização, e o processo segue as regras do banco.",
    variantes_tom: [
      "Seus dados ficam protegidos e são usados só para a análise de crédito. Nenhum compartilhamento sem sua autorização.",
      "Ambiente seguro, uso restrito ao processo de financiamento. Se quiser saber mais sobre como os dados são tratados, é só perguntar."
    ]
  }
]);
