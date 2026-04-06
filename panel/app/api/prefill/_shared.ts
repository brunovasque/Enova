// ============================================================
// Prefill API — panel/app/api/prefill/_shared.ts
// Escopo: leitura e escrita de enova_prefill_meta
// REGRA: dados aqui são pré-dados admin, não confirmados pelo cliente
// ============================================================

export type PrefillStatus =
  | "empty"
  | "prefilled_pending_confirmation"
  | "confirmed"
  | "divergent";

export type PrefillField = {
  prefill: string | number | boolean | null;
  source: string | null;
  status: PrefillStatus;
};

export type PrefillMetaRow = {
  wa_id: string;
  nome_prefill: string | null;
  nome_source: string | null;
  nome_status: PrefillStatus;
  nacionalidade_prefill: string | null;
  nacionalidade_source: string | null;
  nacionalidade_status: PrefillStatus;
  estado_civil_prefill: string | null;
  estado_civil_source: string | null;
  estado_civil_status: PrefillStatus;
  regime_trabalho_prefill: string | null;
  regime_trabalho_source: string | null;
  regime_trabalho_status: PrefillStatus;
  renda_prefill: number | null;
  renda_source: string | null;
  renda_status: PrefillStatus;
  meses_36_prefill: boolean | null;
  meses_36_source: string | null;
  meses_36_status: PrefillStatus;
  dependentes_prefill: number | null;
  dependentes_source: string | null;
  dependentes_status: PrefillStatus;
  valor_entrada_prefill: number | null;
  valor_entrada_source: string | null;
  valor_entrada_status: PrefillStatus;
  restricao_prefill: boolean | null;
  restricao_source: string | null;
  restricao_status: PrefillStatus;
  origem_lead: string | null;
  observacoes_admin: string | null;
  campaign_platform: string | null;
  campaign_name: string | null;
  campaign_adset: string | null;
  campaign_ad: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PrefillUpdatePayload = {
  wa_id: string;
  nome_prefill?: string | null;
  nome_source?: string | null;
  nome_status?: PrefillStatus;
  nacionalidade_prefill?: string | null;
  nacionalidade_source?: string | null;
  nacionalidade_status?: PrefillStatus;
  estado_civil_prefill?: string | null;
  estado_civil_source?: string | null;
  estado_civil_status?: PrefillStatus;
  regime_trabalho_prefill?: string | null;
  regime_trabalho_source?: string | null;
  regime_trabalho_status?: PrefillStatus;
  renda_prefill?: number | null;
  renda_source?: string | null;
  renda_status?: PrefillStatus;
  meses_36_prefill?: boolean | null;
  meses_36_source?: string | null;
  meses_36_status?: PrefillStatus;
  dependentes_prefill?: number | null;
  dependentes_source?: string | null;
  dependentes_status?: PrefillStatus;
  valor_entrada_prefill?: number | null;
  valor_entrada_source?: string | null;
  valor_entrada_status?: PrefillStatus;
  restricao_prefill?: boolean | null;
  restricao_source?: string | null;
  restricao_status?: PrefillStatus;
  origem_lead?: string | null;
  observacoes_admin?: string | null;
  campaign_platform?: string | null;
  campaign_name?: string | null;
  campaign_adset?: string | null;
  campaign_ad?: string | null;
  updated_by?: string | null;
};

export const VALID_PREFILL_STATUSES: PrefillStatus[] = [
  "empty",
  "prefilled_pending_confirmation",
  "confirmed",
  "divergent",
];

function isValidStatus(v: unknown): v is PrefillStatus {
  return typeof v === "string" && (VALID_PREFILL_STATUSES as string[]).includes(v);
}

function buildHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}

// ── Read prefill data for a wa_id ──────────────────────────────
export async function getPrefillMeta(
  supabaseUrl: string,
  serviceRoleKey: string,
  wa_id: string,
): Promise<PrefillMetaRow | null> {
  const endpoint = new URL("/rest/v1/enova_prefill_meta", supabaseUrl);
  endpoint.searchParams.set("select", "*");
  endpoint.searchParams.set("wa_id", `eq.${wa_id}`);
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: buildHeaders(serviceRoleKey),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`PREFILL_READ_FAILED:${response.status}`);
  }

  const rows = await readJson<PrefillMetaRow[]>(response);
  return rows?.[0] ?? null;
}

// ── Upsert (create or update) prefill data ──────────────────────
export async function upsertPrefillMeta(
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: PrefillUpdatePayload,
): Promise<PrefillMetaRow | null> {
  const { wa_id } = payload;
  if (!wa_id || typeof wa_id !== "string" || !wa_id.trim()) {
    throw new Error("PREFILL_UPSERT_MISSING_WA_ID");
  }

  // Build the row — only include fields present in payload
  const row: Record<string, unknown> = {
    wa_id: wa_id.trim(),
    updated_at: new Date().toISOString(),
  };

  // Text fields
  const textFields = [
    "nome_prefill", "nome_source",
    "nacionalidade_prefill", "nacionalidade_source",
    "estado_civil_prefill", "estado_civil_source",
    "regime_trabalho_prefill", "regime_trabalho_source",
    "renda_source",
    "meses_36_source",
    "dependentes_source",
    "valor_entrada_source",
    "restricao_source",
    "origem_lead",
    "observacoes_admin",
    "campaign_platform",
    "campaign_name",
    "campaign_adset",
    "campaign_ad",
    "updated_by",
  ] as const;

  for (const field of textFields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      const v = (payload as Record<string, unknown>)[field];
      row[field] = typeof v === "string" && v.trim() ? v.trim() : null;
    }
  }

  // Numeric fields
  const numericFields = ["renda_prefill", "dependentes_prefill", "valor_entrada_prefill"] as const;
  for (const field of numericFields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      const v = (payload as Record<string, unknown>)[field];
      row[field] = v === null || v === undefined ? null : Number(v);
    }
  }

  // Boolean fields — must be parsed explicitly; Boolean("false") === true
  const boolFields = ["meses_36_prefill", "restricao_prefill"] as const;
  for (const field of boolFields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      const v = (payload as Record<string, unknown>)[field];
      if (v === true || v === "true") {
        row[field] = true;
      } else if (v === false || v === "false") {
        row[field] = false;
      } else {
        row[field] = null;
      }
    }
  }

  // Status fields — validate against allowed values
  const statusFields = [
    "nome_status", "nacionalidade_status", "estado_civil_status",
    "regime_trabalho_status", "renda_status", "meses_36_status",
    "dependentes_status", "valor_entrada_status", "restricao_status",
  ] as const;
  for (const field of statusFields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      const v = (payload as Record<string, unknown>)[field];
      row[field] = isValidStatus(v) ? v : "prefilled_pending_confirmation";
    }
  }

  const endpoint = new URL("/rest/v1/enova_prefill_meta", supabaseUrl);

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: {
      ...buildHeaders(serviceRoleKey),
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(row),
    cache: "no-store",
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`PREFILL_UPSERT_FAILED:${response.status}:${errText}`);
  }

  const rows = await readJson<PrefillMetaRow[]>(response);
  return rows?.[0] ?? null;
}
