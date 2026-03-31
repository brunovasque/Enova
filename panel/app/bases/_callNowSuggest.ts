import type { LeadPool } from "../api/bases/_shared";

/**
 * Returns a suggested WhatsApp opening message for the call_now modal,
 * personalised by lead_pool and optionally by first name.
 *
 * Rules:
 * - COLD_POOL → light re-activation approach
 * - WARM_POOL → follow-up / re-engagement approach
 * - HOT_POOL  → direct action-oriented approach
 * - If nome is provided, address the lead by first name; otherwise use a
 *   generic greeting.
 */
export function suggestCallNowMessage(leadPool: LeadPool, nome: string | null): string {
  const firstName = nome && nome.trim() ? nome.trim().split(/\s+/)[0] : null;
  const hi = firstName ? `Oi, ${firstName}!` : "Oi, tudo bem?";

  switch (leadPool) {
    case "COLD_POOL":
      return `${hi} Passando para ver se você ainda tem interesse no financiamento. Posso te ajudar com alguma simulação?`;

    case "WARM_POOL":
      return `${hi} Queria retomar nossa conversa sobre o financiamento. Já tem algo definido ou precisa de mais informações?`;

    case "HOT_POOL":
      return `${hi} Vamos fechar? Me confirma o seu interesse e a gente já avança nos próximos passos.`;
  }
}

/**
 * Warmup message variations — 3 per pool, with and without first name.
 * Used by suggestWarmupMessage for the assisted warmup flow.
 */
const WARMUP_VARIATIONS: Record<LeadPool, { comNome: string[]; semNome: string[] }> = {
  COLD_POOL: {
    comNome: [
      "Oi, {primeiro_nome}! Tudo bem? Vi seu contato por aqui e quis retomar com você para entender se ainda faz sentido falarmos sobre seu imóvel.",
      "Oi, {primeiro_nome}! Tudo certo? Passando para retomar seu atendimento e ver se ainda vale a pena conversarmos sobre a sua aprovação.",
      "Oi, {primeiro_nome}! Como vai? Estou retomando alguns contatos por aqui e queria entender se você ainda tem interesse em seguir com a análise do seu imóvel.",
    ],
    semNome: [
      "Oi, tudo bem? Vi seu contato por aqui e quis retomar com você para entender se ainda faz sentido falarmos sobre seu imóvel.",
      "Oi, tudo certo? Passando para retomar seu atendimento e ver se ainda vale a pena conversarmos sobre a sua aprovação.",
      "Oi, como vai? Estou retomando alguns contatos por aqui e queria entender se você ainda tem interesse em seguir com a análise do seu imóvel.",
    ],
  },
  WARM_POOL: {
    comNome: [
      "Oi, {primeiro_nome}! Tudo bem? Estou retomando seu atendimento para ver em que ponto você ficou e se já podemos seguir.",
      "Oi, {primeiro_nome}! Tudo certo? Quis retomar sua conversa para entender se você ainda quer avançar com sua análise.",
      "Oi, {primeiro_nome}! Como vai? Passei para continuar seu atendimento e ver se já conseguimos dar sequência no próximo passo.",
    ],
    semNome: [
      "Oi, tudo bem? Estou retomando seu atendimento para ver em que ponto você ficou e se já podemos seguir.",
      "Oi, tudo certo? Quis retomar sua conversa para entender se você ainda quer avançar com sua análise.",
      "Oi, como vai? Passei para continuar seu atendimento e ver se já conseguimos dar sequência no próximo passo.",
    ],
  },
  HOT_POOL: {
    comNome: [
      "Oi, {primeiro_nome}! Tudo bem? Passei para te chamar e ver se já conseguimos avançar agora com sua análise.",
      "Oi, {primeiro_nome}! Tudo certo? Queria aproveitar para dar sequência no seu atendimento e te colocar no próximo passo.",
      "Oi, {primeiro_nome}! Como vai? Se fizer sentido para você, já podemos avançar agora com a sua análise.",
    ],
    semNome: [
      "Oi, tudo bem? Passei para te chamar e ver se já conseguimos avançar agora com sua análise.",
      "Oi, tudo certo? Queria aproveitar para dar sequência no seu atendimento e te colocar no próximo passo.",
      "Oi, como vai? Se fizer sentido para você, já podemos avançar agora com a sua análise.",
    ],
  },
};

/**
 * Returns a warmup message variation for a lead, selected deterministically
 * by `index` (position in the warmup selection list, 0-based).
 *
 * - Uses index % 3 to rotate between the 3 variations.
 * - Substitutes {primeiro_nome} with the lead's first name when available.
 * - Falls back to the no-name variant when nome is absent.
 */
export function suggestWarmupMessage(
  leadPool: LeadPool,
  nome: string | null,
  index: number,
): string {
  const firstName = nome && nome.trim() ? nome.trim().split(/\s+/)[0] : null;
  const slot = Math.abs(index) % 3;
  const variants = WARMUP_VARIATIONS[leadPool];

  if (firstName) {
    return variants.comNome[slot].replace("{primeiro_nome}", firstName);
  }
  return variants.semNome[slot];
}
