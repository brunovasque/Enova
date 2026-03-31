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
