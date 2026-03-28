import { createHash } from "node:crypto";

export type EnovaDocRow = {
  wa_id: string | null;
  tipo: string | null;
  participante: string | null;
  created_at: string | null;
  url: string | null;
  mime_type?: string | null;
  file_name?: string | null;
  size_bytes?: number | null;
};

export type CaseFileItem = {
  file_id: string;
  wa_id: string;
  tipo: string;
  participante: string | null;
  created_at: string | null;
  mime_type: string | null;
  file_name: string | null;
  size_bytes: number | null;
  previewable: boolean;
};

// Campos de URL observados nas estruturas reais usadas pelo fluxo documental
// (`pacote_documentos_anexados_json` e `envio_docs_historico_json.media_ref`).
const URL_FIELDS = ["url", "document_url", "download_url", "media_url", "link"] as const;

type LooseObject = Record<string, unknown>;

type EnovaStateFallbackRow = {
  pacote_documentos_anexados_json?: unknown;
  envio_docs_historico_json?: unknown;
};

function normalizeUrl(row: EnovaDocRow): string {
  return String(row.url || "").trim();
}

function normalizeMimeType(row: EnovaDocRow): string | null {
  const directMime = String(row.mime_type || "").trim().toLowerCase();
  if (directMime) return directMime;
  const url = normalizeUrl(row).toLowerCase();
  if (url.includes(".pdf")) return "application/pdf";
  if (url.match(/\.(png)\b/)) return "image/png";
  if (url.match(/\.(jpe?g)\b/)) return "image/jpeg";
  if (url.match(/\.(webp)\b/)) return "image/webp";
  if (url.match(/\.(gif)\b/)) return "image/gif";
  return null;
}

function isPreviewable(mimeType: string | null): boolean {
  if (!mimeType) return false;
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

function buildStableFileId(
  waId: string,
  row: EnovaDocRow,
  normalizedUrl: string,
  normalizedMimeType: string | null,
  index: number,
): string {
  const raw = [
    waId,
    row.created_at || "",
    row.tipo || "",
    row.participante || "",
    normalizedMimeType || "",
    normalizedUrl,
    String(index),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

function toObject(value: unknown): LooseObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseObject)
    : null;
}

function parseArrayLike(value: unknown): LooseObject[] {
  if (Array.isArray(value)) {
    return value.map(toObject).filter((item): item is LooseObject => Boolean(item));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return parseArrayLike(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

function readStringFromFields(source: LooseObject | null, fields: readonly string[]): string | null {
  if (!source) return null;
  for (const field of fields) {
    const value = source[field];
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (normalized) return normalized;
  }
  return null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function buildDedupKey(row: EnovaDocRow): string {
  const compositeId = [row.tipo || "", row.participante || "", row.created_at || "", row.url || ""].join("|");
  return createHash("sha256").update(compositeId).digest("hex").slice(0, 24);
}

function buildDocSignature(row: EnovaDocRow): string {
  return [row.tipo || "", row.participante || "", row.url || ""].join("|").toLowerCase();
}

function normalizeStateAttachmentRows(waId: string, stateRows: LooseObject[]): EnovaDocRow[] {
  return stateRows
    .map((row): EnovaDocRow | null => {
      const url = readStringFromFields(row, URL_FIELDS);
      if (!url) return null;
      return {
        wa_id: waId,
        tipo: readStringFromFields(row, ["tipo"]) || "documento",
        participante: readStringFromFields(row, ["participante"]),
        created_at: readStringFromFields(row, ["created_at", "at"]),
        url,
        mime_type: readStringFromFields(row, ["mime_type", "mimetype"]),
        file_name: readStringFromFields(row, ["file_name", "filename"]),
        size_bytes: readNumber(row.size_bytes ?? row.file_size),
      };
    })
    .filter((item): item is EnovaDocRow => Boolean(item));
}

function normalizeHistoryUploadRows(waId: string, historyRows: LooseObject[]): EnovaDocRow[] {
  return historyRows
    .map((row): EnovaDocRow | null => {
      const origem = String(row.origem || "").trim().toLowerCase();
      if (origem !== "upload") return null;

      const mediaRef = toObject(row.media_ref);
      const associado = toObject(row.associado);
      const matchedChecklist = toObject(row.matched_checklist_item);

      const url = readStringFromFields(mediaRef, URL_FIELDS) || readStringFromFields(row, URL_FIELDS);
      if (!url) return null;

      return {
        wa_id: waId,
        tipo:
          readStringFromFields(associado, ["tipo"]) ||
          readStringFromFields(matchedChecklist, ["tipo"]) ||
          readStringFromFields(row, ["detected_doc_type"]) ||
          "documento",
        participante:
          readStringFromFields(associado, ["participante"]) ||
          readStringFromFields(matchedChecklist, ["participante"]),
        created_at: readStringFromFields(row, ["at", "created_at"]),
        url,
        mime_type:
          readStringFromFields(mediaRef, ["mime_type", "mimetype"]) ||
          readStringFromFields(row, ["mime_type", "mimetype"]),
        file_name:
          readStringFromFields(mediaRef, ["file_name", "filename"]) ||
          readStringFromFields(row, ["file_name", "filename"]),
        size_bytes: readNumber(mediaRef?.size_bytes ?? mediaRef?.file_size ?? row.size_bytes),
      };
    })
    .filter((item): item is EnovaDocRow => Boolean(item));
}

function dedupeAndSortRows(rows: EnovaDocRow[]): EnovaDocRow[] {
  const deduped = new Map<string, EnovaDocRow>();
  rows.forEach((row) => {
    const key = buildDedupKey(row);
    if (!deduped.has(key)) deduped.set(key, row);
  });

  return Array.from(deduped.values()).sort((left, right) => {
    const leftDate = String(left.created_at || "");
    const rightDate = String(right.created_at || "");
    return leftDate.localeCompare(rightDate);
  });
}

async function fetchEnovaDocsRows(
  supabaseUrl: string,
  serviceRoleKey: string,
  waId: string,
): Promise<EnovaDocRow[]> {
  const endpoint = new URL("/rest/v1/enova_docs", supabaseUrl);
  endpoint.searchParams.set("select", "wa_id,tipo,participante,created_at,url,mime_type,file_name,size_bytes");
  endpoint.searchParams.set("wa_id", `eq.${waId}`);
  endpoint.searchParams.set("order", "created_at.asc");
  endpoint.searchParams.set("limit", "200");

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`failed to load files (${response.status}) ${body.slice(0, 120)}`);
  }

  const rows = (await response.json()) as EnovaDocRow[];
  return Array.isArray(rows) ? rows : [];
}

async function fetchFallbackStateRows(
  supabaseUrl: string,
  serviceRoleKey: string,
  waId: string,
): Promise<EnovaDocRow[]> {
  const endpoint = new URL("/rest/v1/enova_state", supabaseUrl);
  endpoint.searchParams.set("select", "wa_id,pacote_documentos_anexados_json,envio_docs_historico_json");
  endpoint.searchParams.set("wa_id", `eq.${waId}`);
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const rows = (await response.json()) as EnovaStateFallbackRow[];
  const stateRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!stateRow) return [];

  const pacoteRows = parseArrayLike(stateRow.pacote_documentos_anexados_json);
  const historicoRows = parseArrayLike(stateRow.envio_docs_historico_json);
  const normalizedPacote = normalizeStateAttachmentRows(waId, pacoteRows);
  const normalizedHistorico = normalizeHistoryUploadRows(waId, historicoRows);
  // Histórico de upload é a fonte mais granular/recente para mídia real; quando houver
  // colisão por assinatura, priorizamos histórico e removemos duplicata do pacote.
  const signaturesFromHistory = new Set(normalizedHistorico.map(buildDocSignature));
  const filteredPacote = normalizedPacote.filter((row) => !signaturesFromHistory.has(buildDocSignature(row)));

  return dedupeAndSortRows([...normalizedHistorico, ...filteredPacote]);
}

function hasAnyUrlRows(rows: EnovaDocRow[]): boolean {
  for (const row of rows) {
    if (typeof row?.url === "string" && row.url.trim().length > 0) {
      return true;
    }
  }
  return false;
}

export async function fetchCaseFileRows(
  supabaseUrl: string,
  serviceRoleKey: string,
  waId: string,
): Promise<EnovaDocRow[]> {
  const primaryRows = await fetchEnovaDocsRows(supabaseUrl, serviceRoleKey, waId);
  if (hasAnyUrlRows(primaryRows)) {
    return primaryRows;
  }

  const fallbackRows = await fetchFallbackStateRows(supabaseUrl, serviceRoleKey, waId);
  if (fallbackRows.length > 0) {
    return fallbackRows;
  }

  return primaryRows;
}

export function normalizeCaseFiles(waId: string, rows: EnovaDocRow[]): CaseFileItem[] {
  if (!Array.isArray(rows)) return [];
  const items: CaseFileItem[] = [];
  rows.forEach((row, index) => {
    const normalizedUrl = normalizeUrl(row);
    if (!normalizedUrl) {
      return;
    }

    const normalizedMimeType = normalizeMimeType(row);
    items.push({
      file_id: buildStableFileId(waId, row, normalizedUrl, normalizedMimeType, index),
      wa_id: waId,
      tipo: String(row.tipo || "documento").trim().toLowerCase(),
      participante: String(row.participante || "").trim().toLowerCase() || null,
      created_at: row.created_at || null,
      mime_type: normalizedMimeType,
      file_name: row.file_name || null,
      size_bytes: typeof row.size_bytes === "number" ? row.size_bytes : null,
      previewable: isPreviewable(normalizedMimeType),
    });
  });
  return items;
}

export function resolveCaseFileById(
  waId: string,
  fileId: string,
  rows: EnovaDocRow[],
): { item: CaseFileItem; sourceUrl: string } | null {
  if (!Array.isArray(rows) || !waId || !fileId) return null;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const normalizedUrl = normalizeUrl(row);
    if (!normalizedUrl) continue;

    const normalizedMimeType = normalizeMimeType(row);
    const candidateId = buildStableFileId(waId, row, normalizedUrl, normalizedMimeType, index);
    if (candidateId !== fileId) continue;

    return {
      item: {
        file_id: candidateId,
        wa_id: waId,
        tipo: String(row.tipo || "documento").trim().toLowerCase(),
        participante: String(row.participante || "").trim().toLowerCase() || null,
        created_at: row.created_at || null,
        mime_type: normalizedMimeType,
        file_name: row.file_name || null,
        size_bytes: typeof row.size_bytes === "number" ? row.size_bytes : null,
        previewable: isPreviewable(normalizedMimeType),
      },
      sourceUrl: normalizedUrl,
    };
  }

  return null;
}
