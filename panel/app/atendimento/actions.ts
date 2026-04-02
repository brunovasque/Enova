"use server";

import { listAttendanceLeads } from "../api/atendimento/_shared";

export async function fetchAttendanceLeadsAction(
  limit = 200,
): Promise<{ ok: boolean; leads?: Record<string, unknown>[]; error?: string }> {
  const missingEnvs = (["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const).filter(
    (k) => !process.env[k],
  );
  if (missingEnvs.length > 0) {
    return { ok: false, error: `missing env: ${missingEnvs.join(", ")}` };
  }

  try {
    const leads = await listAttendanceLeads(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string,
      { limit },
    );
    return { ok: true, leads };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "internal error" };
  }
}
