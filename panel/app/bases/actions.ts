"use server";

import { upsertPrefillMeta, PrefillUpdatePayload } from "../api/prefill/_shared";

export async function savePrefillOnLeadCreateAction(
  payload: PrefillUpdatePayload,
): Promise<{ ok: boolean; error?: string }> {
  const missingEnvs = (["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const).filter(
    (k) => !process.env[k],
  );
  if (missingEnvs.length > 0) {
    return { ok: false, error: `missing env: ${missingEnvs.join(", ")}` };
  }

  try {
    await upsertPrefillMeta(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string,
      payload,
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "internal error" };
  }
}
