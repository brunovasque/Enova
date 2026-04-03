/**
 * faq-canonico.js — Catálogo Canônico Global de FAQ da Enova
 *
 * Etapa 1 da reorganização cognitiva.
 * Este módulo é estático, puro e sem dependência de banco ou runtime.
 * Pronto para consumo por qualquer builder nas etapas seguintes.
 *
 * Regras de todas as respostas:
 *  - tom da Enova: direto, acolhedor, sem promessas de aprovação
 *  - usa "imóvel", não "casa"
 *  - não contradiz o funil mecânico
 *  - curta e natural, pronta para reutilização
 */

/** @typedef {{ id: string, pergunta_tipica: string, resposta: string }} FAQEntry */

/** @type {Readonly<FAQEntry[]>} */
export const FAQ_CATALOG = Object.freeze([
  {
    id: "valor_sem_analise",
    pergunta_tipica: "quanto vou poder financiar?",
    resposta:
      "O valor que você pode financiar depende da sua renda e do perfil de crédito, que a gente avalia durante o processo. Ainda não dá pra cravar um número antes da análise, mas a nossa consultoria existe justamente pra mapear isso com você."
  },
  {
    id: "seguranca_docs",
    pergunta_tipica: "é seguro mandar documentos por aqui?",
    resposta:
      "Sim, é seguro. Os documentos ficam em ambiente protegido e são usados exclusivamente para a análise do financiamento. Nada é compartilhado sem a sua autorização."
  },
  {
    id: "fgts_uso",
    pergunta_tipica: "posso usar FGTS?",
    resposta:
      "Em muitos casos sim — o FGTS pode ser usado como parte da entrada ou para amortizar o financiamento. As regras dependem do programa e do banco, e a gente verifica isso durante o processo."
  },
  {
    id: "entrada_minima",
    pergunta_tipica: "qual a entrada mínima?",
    resposta:
      "A entrada mínima varia conforme o programa e o banco. Em programas habitacionais subsidiados ela pode ser bem reduzida. A gente calcula o valor exato depois de entender o seu perfil."
  },
  {
    id: "prazo_processo",
    pergunta_tipica: "quanto tempo demora?",
    resposta:
      "O prazo depende de cada etapa: análise de crédito, escolha do imóvel, vistoria e contrato. No geral, do início à assinatura leva algumas semanas. A gente acompanha cada passo com você."
  },
  {
    id: "simulacao_plantao",
    pergunta_tipica: "já dá pra simular?",
    resposta:
      "Simulação precisa dos dados do seu perfil primeiro — renda, entrada e o tipo de imóvel que você busca. Com essas informações em mãos, a gente consegue trazer números reais pra você."
  },
  {
    id: "imovel_escolha",
    pergunta_tipica: "já posso escolher o imóvel?",
    resposta:
      "O imóvel pode ser escolhido em paralelo, mas a compra só avança após a aprovação do crédito. Assim você não corre o risco de fechar algo antes de ter a viabilidade confirmada."
  },
  {
    id: "aprovacao_garantia",
    pergunta_tipica: "vou ser aprovado?",
    resposta:
      "Não temos como garantir aprovação antes de ver o seu perfil completo — isso é responsabilidade do banco. O que a gente faz é preparar o dossiê da melhor forma possível para aumentar as suas chances."
  },
  {
    id: "restricao_impede",
    pergunta_tipica: "restrição impede tudo?",
    resposta:
      "Nem sempre. Depende do tipo, do valor e de como está hoje. Em alguns casos é possível seguir mesmo com restrição, e em outros precisamos resolver antes. Vamos entender a sua situação no processo."
  },
  {
    id: "composicao_obrigatoria",
    pergunta_tipica: "preciso compor renda?",
    resposta:
      "Não necessariamente. A composição de renda é uma opção quando a renda individual não é suficiente para o imóvel desejado. A gente avalia se faz sentido ou não no seu caso."
  }
]);
