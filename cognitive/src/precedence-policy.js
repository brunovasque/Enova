/**
 * precedence-policy.js — Etapa 7: Precedence & Priority Policy
 *
 * Defines an explicit, predictable precedence for the cognitive layer:
 *
 *   1. Stage context (guidance local) — message clearly about the current
 *      stage task → skip global layer, let local guidance handle.
 *   2. Objection — emotional/resistance signal dominant → objection handler
 *      takes priority over FAQ.
 *   3. FAQ — clear informational question → FAQ first (default behaviour).
 *   4. KB — factual enrichment when neither FAQ nor objection is the best fit.
 *   5. Reanchor — always flagged on global-layer responses (applied by caller).
 *   6. Final Speech Contract — always applied last (handled by Etapa 6).
 *
 * This module is pure, stateless and read-only.  It does NOT touch the
 * mechanical layer, gates or stored data.
 *
 * Active blocks: topo · docs · visita  (Etapa 7 scope).
 */

import { getCanonicalFAQ } from "./faq-lookup.js";
import { getCanonicalObjection } from "./objections-lookup.js";
import { getKnowledgeBaseItem } from "./knowledge-lookup.js";

// ── Precedence labels ───────────────────────────────────────────────────────

export const PRECEDENCE = Object.freeze({
  STAGE_CONTEXT: "stage_context",
  OBJECTION_PRIORITY: "objection_priority",
  FAQ_DEFAULT: "faq_default",
});

// ── Objection emotional signals ─────────────────────────────────────────────
// Strong emotional words that indicate resistance, fear or hesitation.
// When detected, objection handling takes priority over FAQ.

export const OBJECTION_EMOTIONAL_SIGNALS =
  /\b(medo|receio|tenho medo|n[aã]o confio|golpe|fraude|insegur[oa]?|desconfi[oa]?|n[aã]o quero|vou pensar|prefiro n[aã]o|sem tempo|corrido|n[aã]o consigo|piramide|pirâmide|medo.*mandar|medo.*enviar)\b/i;

// ── Stage-context signals per active phase ──────────────────────────────────
// Messages that clearly cooperate with the stage's own task.
// When these dominate, guidance local should handle — global layer is skipped.

export const TOPO_STAGE_CONTEXT =
  /\b(vamos|bora|seguir|rapidinho|come[cç]emos|continuar|prosseguir|pode perguntar|manda a pergunta|j[aá] pode|t[oô] pronto|me pergunta|manda ver|pode come[cç]ar|depois seguimos|vamos l[aá]|pode come[cç]ar|vamos nessa)\b/i;

export const DOCS_STAGE_CONTEXT =
  /\b(vou mandar|mandando|envio agora|j[aá] enviei|j[aá] mandei|enviando|mando agora|toma|segue|vou enviar|mando j[aá]|aqui [oó]|olha aqui|enviado|mandei|pronto.*enviei|feito)\b/i;

export const VISITA_STAGE_CONTEXT =
  /\b(agendar|marcar|confirmar|confirmo|vou sim|quero ir|posso ir|dispon[ií]vel|vamos marcar|pode marcar|marca pra|agenda pra|combinar|combino|fechado|t[oô] dentro|vou l[aá])\b/i;

// Mapping for phase ↔ pattern lookup
const STAGE_CONTEXT_BY_PHASE = Object.freeze({
  topo: TOPO_STAGE_CONTEXT,
  docs: DOCS_STAGE_CONTEXT,
  visita: VISITA_STAGE_CONTEXT,
});

// ── Public helpers ──────────────────────────────────────────────────────────

/**
 * Returns true when the message is clearly about the current stage's task
 * (cooperating, confirming, proceeding) — meaning global layers should NOT
 * intercept.
 *
 * @param {string} normalizedMessage
 * @param {"topo"|"docs"|"visita"} phase
 * @returns {boolean}
 */
export function isStageContextMessage(normalizedMessage, phase) {
  if (!normalizedMessage || !phase) return false;
  const pattern = STAGE_CONTEXT_BY_PHASE[phase];
  if (!pattern) return false;
  return pattern.test(normalizedMessage);
}

/**
 * Returns true when the message carries a dominant emotional / objection
 * signal.  When this fires, objection handling takes priority over FAQ.
 *
 * @param {string} normalizedMessage
 * @returns {boolean}
 */
export function hasObjectionSignal(normalizedMessage) {
  if (!normalizedMessage) return false;
  return OBJECTION_EMOTIONAL_SIGNALS.test(normalizedMessage);
}

/**
 * Precedence-aware resolver for the global cognitive layer.
 *
 *  Priority 1 — Stage context detected → returns null (guidance local handles)
 *  Priority 2 — Emotional/objection signal → Objection → FAQ → KB
 *  Priority 3 — Default → FAQ → Objection → KB  (original Etapa 5 behaviour)
 *
 * The `needsReanchor` flag is always true for any global-layer response so
 * that the caller can wrap with reanchor to bring the user back to the stage.
 *
 * @param {string} normalizedMessage
 * @param {readonly {pattern:RegExp, faqId?:string|null, objectionId?:string|null, kbId?:string|null}[]} layerMap
 * @param {"topo"|"docs"|"visita"} phase
 * @returns {{ reply:string, source:string, needsReanchor:boolean, precedence:string }|null}
 */
export function resolveWithPrecedence(normalizedMessage, layerMap, phase) {
  if (!normalizedMessage) return null;

  // ── Priority 1: Stage context → guidance local handles ──────────────────
  if (isStageContextMessage(normalizedMessage, phase)) return null;

  const objectionFirst = hasObjectionSignal(normalizedMessage);

  for (const entry of layerMap) {
    if (!entry.pattern.test(normalizedMessage)) continue;

    if (objectionFirst) {
      // ── Priority 2: Objection → FAQ → KB ────────────────────────────────
      if (entry.objectionId) {
        const obj = getCanonicalObjection(entry.objectionId);
        if (obj) {
          return {
            reply: obj.resposta_canonica,
            source: `objection:${entry.objectionId}`,
            needsReanchor: true,
            precedence: PRECEDENCE.OBJECTION_PRIORITY,
          };
        }
      }
      if (entry.faqId) {
        const faq = getCanonicalFAQ(entry.faqId);
        if (faq) {
          return {
            reply: faq.resposta,
            source: `faq:${entry.faqId}`,
            needsReanchor: true,
            precedence: PRECEDENCE.OBJECTION_PRIORITY,
          };
        }
      }
      if (entry.kbId) {
        const kb = getKnowledgeBaseItem(entry.kbId);
        if (kb) {
          return {
            reply: kb.conteudo,
            source: `kb:${entry.kbId}`,
            needsReanchor: true,
            precedence: PRECEDENCE.OBJECTION_PRIORITY,
          };
        }
      }
    } else {
      // ── Priority 3: FAQ → Objection → KB (default) ─────────────────────
      if (entry.faqId) {
        const faq = getCanonicalFAQ(entry.faqId);
        if (faq) {
          return {
            reply: faq.resposta,
            source: `faq:${entry.faqId}`,
            needsReanchor: true,
            precedence: PRECEDENCE.FAQ_DEFAULT,
          };
        }
      }
      if (entry.objectionId) {
        const obj = getCanonicalObjection(entry.objectionId);
        if (obj) {
          return {
            reply: obj.resposta_canonica,
            source: `objection:${entry.objectionId}`,
            needsReanchor: true,
            precedence: PRECEDENCE.FAQ_DEFAULT,
          };
        }
      }
      if (entry.kbId) {
        const kb = getKnowledgeBaseItem(entry.kbId);
        if (kb) {
          return {
            reply: kb.conteudo,
            source: `kb:${entry.kbId}`,
            needsReanchor: true,
            precedence: PRECEDENCE.FAQ_DEFAULT,
          };
        }
      }
    }
  }

  return null;
}
