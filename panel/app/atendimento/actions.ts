"use server";

import { listAttendanceLeads } from "../api/atendimento/_shared";
import { getPrefillMeta, upsertPrefillMeta, PrefillMetaRow, PrefillUpdatePayload } from "../api/prefill/_shared";
import { getClientProfile, writeClientProfile, ClientProfileRow, ClientProfileUpdatePayload } from "../api/client-profile/_shared";

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

export async function fetchPrefillDataAction(
  wa_id: string,
): Promise<{ ok: boolean; prefill?: PrefillMetaRow | null; error?: string }> {
  const missingEnvs = (["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const).filter(
    (k) => !process.env[k],
  );
  if (missingEnvs.length > 0) {
    return { ok: false, error: `missing env: ${missingEnvs.join(", ")}` };
  }

  try {
    const prefill = await getPrefillMeta(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string,
      wa_id,
    );
    return { ok: true, prefill };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "internal error" };
  }
}

export async function savePrefillDataAction(
  payload: PrefillUpdatePayload,
): Promise<{ ok: boolean; prefill?: PrefillMetaRow | null; error?: string }> {
  const missingEnvs = (["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const).filter(
    (k) => !process.env[k],
  );
  if (missingEnvs.length > 0) {
    return { ok: false, error: `missing env: ${missingEnvs.join(", ")}` };
  }

  try {
    const saved = await upsertPrefillMeta(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string,
      payload,
    );
    return { ok: true, prefill: saved };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "internal error" };
  }
}

// ── Novo: ações do perfil canônico do cliente ─────────────────────────

export async function fetchClientProfileAction(
  wa_id: string,
): Promise<{ ok: boolean; profile?: ClientProfileRow | null; error?: string }> {
  const missingEnvs = (["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const).filter(
    (k) => !process.env[k],
  );
  if (missingEnvs.length > 0) {
    return { ok: false, error: `missing env: ${missingEnvs.join(", ")}` };
  }

  try {
    const profile = await getClientProfile(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string,
      wa_id,
    );
    return { ok: true, profile };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "internal error" };
  }
}

export async function saveClientProfileAction(
  payload: ClientProfileUpdatePayload,
): Promise<{ ok: boolean; profile?: ClientProfileRow | null; error?: string }> {
  const missingEnvs = (["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const).filter(
    (k) => !process.env[k],
  );
  if (missingEnvs.length > 0) {
    return { ok: false, error: `missing env: ${missingEnvs.join(", ")}` };
  }

  try {
    const saved = await writeClientProfile(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string,
      payload,
    );
    return { ok: true, profile: saved };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "internal error" };
  }
}

