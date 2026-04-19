/**
 * reanchor-helper.js — Helper canônico de reancoragem global da Enova
 *
 * Etapa 3 da reorganização cognitiva.
 * Expõe funções puras para construir mensagens de reancoragem por fase do funil.
 *
 * Sem dependência de banco ou runtime externo.
 * Pronto para consumo pelo offtrack guard e por qualquer builder nas etapas seguintes.
 *
 * Uso:
 *   import { buildReanchor, getReanchorVariants } from "./reanchor-helper.js";
 *
 *   const result = buildReanchor({ currentStage: "renda_trabalho" });
 *   // => { text: "...", lines: [...] }
 *
 *   const result = buildReanchor({
 *     partialReply: "Entendido.",
 *     currentStage: "ctps_36",
 *     phase: "gates_finais"
 *   });
 *   // => { text: "...", lines: [...] }
 */

import { REANCHOR_VARIANTS, REANCHOR_PULL_BACK } from "./reanchor-variants.js";

// ── Stage-to-phase mapping (espelha as sets canônicas do funil) ───────────────

const _GATES_FINAIS_STAGES = new Set([
  "ir_declarado",
  "autonomo_compor_renda",
  "ctps_36",
  "ctps_36_parceiro",
  "ctps_36_parceiro_p3",
  "dependente",
  "restricao",
  "restricao_parceiro",
  "restricao_parceiro_p3",
  "regularizacao_restricao",
  "regularizacao_restricao_parceiro",
  "regularizacao_restricao_p3"
]);

const _OPERACIONAL_STAGES = new Set([
  "envio_docs",
  "aguardando_retorno_correspondente",
  "agendamento_visita",
  "finalizacao_processo"
]);

const _TOPO_STAGES = new Set([
  "inicio",
  "inicio_decisao",
  "inicio_programa",
  "inicio_nome",
  "inicio_nacionalidade",
  "inicio_rnm",
  "inicio_rnm_validade"
]);

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Deriva a fase do funil a partir do nome do stage atual.
 * Retorna 'topo' como default para stages não mapeados explicitamente.
 *
 * @param {string | null | undefined} stage
 * @returns {'topo' | 'meio' | 'gates_finais' | 'operacional'}
 */
export function stageToPhase(stage) {
  if (!stage || typeof stage !== "string") return "topo";
  if (_OPERACIONAL_STAGES.has(stage)) return "operacional";
  if (_GATES_FINAIS_STAGES.has(stage)) return "gates_finais";
  if (_TOPO_STAGES.has(stage)) return "topo";
  return "meio";
}

/**
 * Retorna o array de variantes de reancoragem para a fase informada.
 * Se a fase for inválida ou não reconhecida, retorna as variantes de 'topo'.
 *
 * @param {'topo' | 'meio' | 'gates_finais' | 'operacional'} phase
 * @returns {readonly string[]}
 */
export function getReanchorVariants(phase) {
  return REANCHOR_VARIANTS[phase] ?? REANCHOR_VARIANTS.topo;
}

/**
 * Constrói a mensagem de reancoragem canônica.
 *
 * Estrutura de saída:
 *   Linha 1 — [partialReply + " "] + bridge phrase (variante da fase)
 *   Linha 2 — REANCHOR_PULL_BACK (frase fixa de retorno ao stage)
 *
 * @param {{
 *   partialReply?: string,
 *   currentStage?: string,
 *   phase?: 'topo' | 'meio' | 'gates_finais' | 'operacional',
 *   variantIndex?: number
 * }} [options]
 * @returns {{ text: string, lines: string[] }}
 *   - `text`  — mensagem completa em string única (para sendMessage direto)
 *   - `lines` — array de strings (para uso como multi-message no funil)
 */
export function buildReanchor({ partialReply, currentStage, phase, variantIndex } = {}) {
  // Deriva fase: aceita phase explícito ou calcula pelo stage
  const resolvedPhase =
    phase && REANCHOR_VARIANTS[phase] ? phase : stageToPhase(currentStage);

  const variants = getReanchorVariants(resolvedPhase);

  // Seleciona variante: determinístico se variantIndex fornecido, aleatório se não
  const idx =
    typeof variantIndex === "number"
      ? Math.max(0, Math.min(variantIndex, variants.length - 1))
      : Math.floor(Math.random() * variants.length);

  const bridge = variants[idx];
  const pullBack = REANCHOR_PULL_BACK;

  if (partialReply && typeof partialReply === "string" && partialReply.trim().length > 0) {
    const line1 = `${partialReply.trim()} ${bridge}`;
    const lines = [line1, pullBack];
    return { text: lines.join("\n"), lines };
  }

  const lines = [bridge, pullBack];
  return { text: lines.join("\n"), lines };
}
