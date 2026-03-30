export const LEAD_POOLS = ["COLD_POOL", "WARM_POOL", "HOT_POOL"] as const;
export const LEAD_TEMPS = ["COLD", "WARM", "HOT"] as const;

export type LeadPool = (typeof LEAD_POOLS)[number];
export type LeadTemp = (typeof LEAD_TEMPS)[number];

export type CrmLeadMetaRow = {
  wa_id: string;
  lead_pool: LeadPool;
  lead_temp: LeadTemp;
  lead_source: string | null;
  tags: string[];
  obs_curta: string | null;
  import_ref: string | null;
  auto_outreach_enabled: boolean;
  is_paused: boolean;
  created_at: string | null;
  updated_at: string | null;
};

type LeadMetaInput = {
  wa_id?: unknown;
  lead_pool?: unknown;
  lead_temp?: unknown;
  lead_source?: unknown;
  tags?: unknown;
  obs_curta?: unknown;
  import_ref?: unknown;
  auto_outreach_enabled?: unknown;
  is_paused?: unknown;
};

type NormalizeLeadMetaOptions = {
  defaultLeadPool?: LeadPool;
  defaultLeadTemp?: LeadTemp;
  defaultLeadSource?: string;
  defaultImportRef?: string | null;
  defaultAutoOutreachEnabled?: boolean;
  defaultPaused?: boolean;
};

export type WarmupSelectionOptions = {
  lead_pool?: LeadPool | null;
  lead_temp?: LeadTemp | null;
  limit?: number;
};

export function defaultLeadTempForPool(leadPool: LeadPool): LeadTemp {
  if (leadPool === "WARM_POOL") return "WARM";
  if (leadPool === "HOT_POOL") return "HOT";
  return "COLD";
}

export function isLeadPool(value: unknown): value is LeadPool {
  return typeof value === "string" && LEAD_POOLS.includes(value as LeadPool);
}

export function isLeadTemp(value: unknown): value is LeadTemp {
  return typeof value === "string" && LEAD_TEMPS.includes(value as LeadTemp);
}

export function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeTags(value: unknown): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const unique = new Set<string>();
  for (const entry of rawValues) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    unique.add(trimmed);
  }

  return Array.from(unique);
}

export function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeLeadMetaInput(
  input: LeadMetaInput,
  options: NormalizeLeadMetaOptions = {},
): Omit<CrmLeadMetaRow, "created_at"> {
  const waId = normalizeOptionalText(input.wa_id);
  if (!waId) {
    throw new Error("wa_id é obrigatório");
  }

  const leadPoolRaw = input.lead_pool ?? options.defaultLeadPool;
  if (!isLeadPool(leadPoolRaw)) {
    throw new Error("lead_pool inválido");
  }

  const leadTempRaw = input.lead_temp ?? options.defaultLeadTemp ?? defaultLeadTempForPool(leadPoolRaw);
  if (!isLeadTemp(leadTempRaw)) {
    throw new Error("lead_temp inválido");
  }

  return {
    wa_id: waId,
    lead_pool: leadPoolRaw,
    lead_temp: leadTempRaw,
    lead_source: normalizeOptionalText(input.lead_source) ?? normalizeOptionalText(options.defaultLeadSource) ?? null,
    tags: normalizeTags(input.tags),
    obs_curta: normalizeOptionalText(input.obs_curta),
    import_ref: normalizeOptionalText(input.import_ref) ?? normalizeOptionalText(options.defaultImportRef) ?? null,
    auto_outreach_enabled: normalizeBoolean(
      input.auto_outreach_enabled,
      options.defaultAutoOutreachEnabled ?? false,
    ),
    is_paused: normalizeBoolean(input.is_paused, options.defaultPaused ?? false),
    updated_at: new Date().toISOString(),
  };
}

export function clampWarmupLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(50, Math.trunc(parsed)));
}

export function buildWarmupSelection(
  rows: CrmLeadMetaRow[],
  options: WarmupSelectionOptions = {},
): CrmLeadMetaRow[] {
  const limit = clampWarmupLimit(options.limit);
  const filtered = rows.filter((row) => {
    if (!row.auto_outreach_enabled || row.is_paused) {
      return false;
    }
    if (options.lead_pool && row.lead_pool !== options.lead_pool) {
      return false;
    }
    if (options.lead_temp && row.lead_temp !== options.lead_temp) {
      return false;
    }
    return true;
  });

  return filtered
    .slice()
    .sort((left, right) => {
      const leftTs = left.updated_at ? new Date(left.updated_at).getTime() : Number.POSITIVE_INFINITY;
      const rightTs = right.updated_at ? new Date(right.updated_at).getTime() : Number.POSITIVE_INFINITY;
      if (leftTs !== rightTs) {
        return leftTs - rightTs;
      }
      return left.wa_id.localeCompare(right.wa_id);
    })
    .slice(0, limit);
}

export function assessCallNowEligibility(
  row: CrmLeadMetaRow | null,
): { ok: true } | { ok: false; reason: string } {
  if (!row) {
    return { ok: false, reason: "LEAD_NOT_FOUND" };
  }
  if (!isLeadPool(row.lead_pool) || !isLeadTemp(row.lead_temp)) {
    return { ok: false, reason: "INVALID_LEAD_META" };
  }
  if (row.is_paused) {
    return { ok: false, reason: "LEAD_PAUSED" };
  }
  return { ok: true };
}
