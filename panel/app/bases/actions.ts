"use server";

import { writeClientProfile } from "../api/client-profile/_shared";

export async function savePrefillOnLeadCreateAction(
  payload: {
    wa_id: string;
    nome_prefill?: string | null;
    nacionalidade_prefill?: string | null;
    estado_civil_prefill?: string | null;
    regime_trabalho_prefill?: string | null;
    renda_prefill?: number | null;
    meses_36_prefill?: boolean | null;
    dependentes_prefill?: number | null;
    valor_entrada_prefill?: number | null;
    restricao_prefill?: boolean | null;
    origem_lead?: string | null;
    observacoes_admin?: string | null;
    updated_by?: string | null;
    [key: string]: unknown;
  },
): Promise<{ ok: boolean; error?: string }> {
  const missingEnvs = (["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const).filter(
    (k) => !process.env[k],
  );
  if (missingEnvs.length > 0) {
    return { ok: false, error: `missing env: ${missingEnvs.join(", ")}` };
  }

  try {
    // Map prefill payload → canonical client profile fields
    // source = 'admin_inicial' to identify this as initial lead creation
    await writeClientProfile(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string,
      {
        wa_id: payload.wa_id,
        ...(payload.nome_prefill != null ? { nome: payload.nome_prefill } : {}),
        ...(payload.nacionalidade_prefill != null ? { nacionalidade: payload.nacionalidade_prefill } : {}),
        ...(payload.estado_civil_prefill != null ? { estado_civil: payload.estado_civil_prefill } : {}),
        ...(payload.regime_trabalho_prefill != null ? { regime_trabalho: payload.regime_trabalho_prefill } : {}),
        ...(payload.renda_prefill != null ? { renda: Number(payload.renda_prefill) } : {}),
        ...(payload.meses_36_prefill != null ? { ctps_36: Boolean(payload.meses_36_prefill) } : {}),
        ...(payload.dependentes_prefill != null ? { dependentes_qtd: Number(payload.dependentes_prefill) } : {}),
        ...(payload.valor_entrada_prefill != null ? { entrada_valor: Number(payload.valor_entrada_prefill) } : {}),
        ...(payload.restricao_prefill != null ? { restricao: Boolean(payload.restricao_prefill) } : {}),
        ...(payload.origem_lead != null ? { origem_lead: payload.origem_lead } : {}),
        ...(payload.observacoes_admin != null ? { observacoes_admin: payload.observacoes_admin } : {}),
        updated_by: payload.updated_by ?? "admin_panel",
        source: "admin_inicial",
      },
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "internal error" };
  }
}

