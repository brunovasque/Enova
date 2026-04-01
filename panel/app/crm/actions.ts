"use server";

import { CrmRequest, listCrmLeads, runCrmAction } from "../api/crm/_shared";

export async function fetchCrmLeadsAction(
  tab?: string,
  limit = 50,
): Promise<{ ok: boolean; leads?: Record<string, unknown>[]; total?: number; error?: string }> {
  const missingEnvs = (["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const).filter(
    (k) => !process.env[k],
  );
  if (missingEnvs.length > 0) {
    return { ok: false, error: `missing env: ${missingEnvs.join(", ")}` };
  }

  try {
    const leads = await listCrmLeads(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string,
      { tab, limit },
    );
    return { ok: true, leads, total: leads.length };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "internal error" };
  }
}

export async function postCrmActionAction(
  payload: CrmRequest,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await runCrmAction(payload);
    return result.body as { ok: boolean; error?: string };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "internal error" };
  }
}
