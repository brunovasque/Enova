/**
 * knowledge-lookup.js — Helper canônico de lookup da Knowledge Base Factual
 *
 * Etapa 4 da reorganização cognitiva.
 * Expõe funções puras para recuperar itens da knowledge base pelo identificador canônico.
 *
 * Uso:
 *   import { getKnowledgeBaseItem, listKnowledgeBaseIds } from "./knowledge-lookup.js";
 *
 *   const item = getKnowledgeBaseItem("elegibilidade_basica");
 *   // => { id, titulo, conteudo } | null
 *
 *   const ids = listKnowledgeBaseIds();
 *   // => ["elegibilidade_basica", "composicao_renda", ...]
 */

import { KNOWLEDGE_BASE } from "./knowledge-base.js";

/** @type {Map<string, import("./knowledge-base.js").KBItem>} */
const _index = new Map(KNOWLEDGE_BASE.map((item) => [item.id, item]));

/**
 * Retorna o item factual canônico para o identificador fornecido.
 * Retorna `null` se o identificador não existir na knowledge base.
 *
 * @param {string} itemId
 * @returns {import("./knowledge-base.js").KBItem | null}
 */
export function getKnowledgeBaseItem(itemId) {
  if (typeof itemId !== "string" || !itemId) return null;
  return _index.get(itemId) ?? null;
}

/**
 * Retorna todos os identificadores canônicos disponíveis na knowledge base.
 *
 * @returns {string[]}
 */
export function listKnowledgeBaseIds() {
  return Array.from(_index.keys());
}
