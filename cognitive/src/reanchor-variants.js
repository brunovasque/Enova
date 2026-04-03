/**
 * reanchor-variants.js — Catálogo Canônico Global de Variantes de Reancoragem da Enova
 *
 * Etapa 3 da reorganização cognitiva.
 * Catálogo estático, puro, sem dependência de banco ou runtime.
 * Pronto para consumo pelo helper de reancoragem e por qualquer builder nas etapas seguintes.
 *
 * Regras de todas as variantes:
 *  - tom da Enova: direto, humano, sem bajulamento
 *  - usa "imóvel", não "casa"
 *  - não promete aprovação
 *  - curta e natural
 *  - cada fase tem pelo menos 3 variantes de ponte/reancoragem
 */

/**
 * @typedef {'topo' | 'meio' | 'gates_finais' | 'operacional'} ReanchorPhase
 */

/**
 * Variantes de bridge/reancoragem por fase do funil.
 * Cada frase puxa o cliente de volta ao stage atual de forma natural.
 *
 * @type {Readonly<Record<ReanchorPhase, Readonly<string[]>>>}
 */
export const REANCHOR_VARIANTS = Object.freeze({
  topo: Object.freeze([
    "Já já eu te explico melhor, mas pra eu te orientar certo preciso fechar essa informação primeiro.",
    "Entendido. Pra eu conseguir te ajudar da forma certa, só me confirma isso aqui antes.",
    "Boa pergunta — e vou te responder assim que a gente fechar esse ponto aqui.",
    "Deixa eu te ajudar direito: só preciso dessa resposta pra seguir com você."
  ]),

  meio: Object.freeze([
    "Pra eu não te direcionar errado, só preciso confirmar esse ponto antes de responder.",
    "Me responde isso aqui e já te falo o que você quer saber, combinado?",
    "Vou te responder isso sim — me ajuda a fechar esse dado primeiro.",
    "Só preciso dessa confirmação aqui pra te dar uma orientação precisa."
  ]),

  gates_finais: Object.freeze([
    "Pra te dar uma resposta segura nessa etapa, preciso que a gente feche isso primeiro.",
    "Esse ponto é importante agora — me confirma aqui e logo te esclareço o resto.",
    "Entendido. Assim que a gente fechar isso aqui, eu já te respondo sobre o que perguntou.",
    "Me ajuda com essa confirmação que a gente já resolve o que você quer saber."
  ]),

  operacional: Object.freeze([
    "Pra gente avançar sem travar seu processo, só preciso fechar essa etapa com você.",
    "Me ajuda a concluir esse passo aqui e a gente já segue.",
    "Quase lá — só precisamos resolver isso aqui pra eu conseguir te orientar melhor.",
    "Fechando isso aqui, a gente continua sem travar."
  ])
});

/**
 * Frase fixa de reancoragem final — puxa o cliente de volta ao stage.
 * Usada como encerramento após a bridge phrase.
 *
 * @type {string}
 */
export const REANCHOR_PULL_BACK =
  "Me responde só a pergunta anterior, tá? 🙏";
