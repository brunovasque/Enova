/**
 * faq-lookup.js — Helper canônico de lookup de FAQ global
 *
 * Etapa 1 da reorganização cognitiva.
 * Expõe uma função pura para recuperar uma entrada do catálogo de FAQ
 * pelo seu identificador canônico.
 *
 * Uso:
 *   import { getCanonicalFAQ } from "./faq-lookup.js";
 *   const faq = getCanonicalFAQ("restricao_impede");
 *   // => { id, pergunta_tipica, resposta } | null
 */

import { FAQ_CATALOG } from "./faq-canonico.js";

/** @type {Map<string, import("./faq-canonico.js").FAQEntry>} */
const _index = new Map(FAQ_CATALOG.map((entry) => [entry.id, entry]));

/**
 * Retorna a entrada canônica de FAQ para o identificador fornecido.
 * Retorna `null` se o identificador não existir no catálogo.
 *
 * @param {string} faqId
 * @returns {import("./faq-canonico.js").FAQEntry | null}
 */
export function getCanonicalFAQ(faqId) {
  if (typeof faqId !== "string" || !faqId) return null;
  return _index.get(faqId) ?? null;
}

/**
 * Retorna todos os identificadores canônicos disponíveis no catálogo.
 *
 * @returns {string[]}
 */
export function listCanonicalFAQIds() {
  return Array.from(_index.keys());
}
