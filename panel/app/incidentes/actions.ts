"use server";

import { listIncidents } from "../api/incidentes/_shared";

export async function fetchIncidentsAction(
  limit = 200,
): Promise<{ ok: boolean; incidents?: Record<string, unknown>[]; error?: string }> {
  const missingEnvs = (["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const).filter(
    (k) => !process.env[k],
  );
  if (missingEnvs.length > 0) {
    return { ok: false, error: `missing env: ${missingEnvs.join(", ")}` };
  }

  try {
    const incidents = await listIncidents(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string,
      { limit },
    );
    return { ok: true, incidents };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "internal error" };
  }
}
