/**
 * objections-lookup.js — Helper canônico de lookup de Objeções global
 *
 * Etapa 2 da reorganização cognitiva.
 * Expõe funções puras para recuperar entradas do catálogo de objeções
 * pelo identificador canônico.
 *
 * Uso:
 *   import { getCanonicalObjection, listCanonicalObjectionIds } from "./objections-lookup.js";
 *   const obj = getCanonicalObjection("medo_golpe");
 *   // => { id, frase_tipica, resposta_canonica, variantes_tom } | null
 *
 *   import { getCanonicalObjectionVariant } from "./objections-lookup.js";
 *   const variante = getCanonicalObjectionVariant("medo_golpe");
 *   // => string | null  (uma das variantes_tom, selecionada de forma determinística)
 */

import { OBJECTIONS_CATALOG } from "./objections-canonico.js";

/** @type {Map<string, import("./objections-canonico.js").ObjectionEntry>} */
const _index = new Map(OBJECTIONS_CATALOG.map((entry) => [entry.id, entry]));

/**
 * Retorna a entrada canônica de objeção para o identificador fornecido.
 * Retorna `null` se o identificador não existir no catálogo.
 *
 * @param {string} objectionId
 * @returns {import("./objections-canonico.js").ObjectionEntry | null}
 */
export function getCanonicalObjection(objectionId) {
  if (typeof objectionId !== "string" || !objectionId) return null;
  return _index.get(objectionId) ?? null;
}

/**
 * Retorna todos os identificadores canônicos disponíveis no catálogo.
 *
 * @returns {string[]}
 */
export function listCanonicalObjectionIds() {
  return Array.from(_index.keys());
}

/**
 * Retorna uma variante de tom para a objeção identificada.
 * A seleção é determinística: usa o índice `variantIndex` (padrão 0) dentro de `variantes_tom`.
 * Retorna `null` se o identificador não existir ou não houver variantes.
 *
 * @param {string} objectionId
 * @param {number} [variantIndex=0]
 * @returns {string | null}
 */
export function getCanonicalObjectionVariant(objectionId, variantIndex = 0) {
  const entry = getCanonicalObjection(objectionId);
  if (!entry || !Array.isArray(entry.variantes_tom) || entry.variantes_tom.length === 0) return null;
  const idx = Math.max(0, Math.min(variantIndex, entry.variantes_tom.length - 1));
  return entry.variantes_tom[idx] ?? null;
}
