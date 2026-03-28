import { createHash } from "node:crypto";

export type EnovaDocRow = {
  wa_id: string | null;
  tipo: string | null;
  participante: string | null;
  created_at: string | null;
  url: string | null;
  document_url?: string | null;
  download_url?: string | null;
  media_url?: string | null;
  link?: string | null;
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

const URL_FIELDS = ["url", "document_url", "download_url", "media_url", "link"] as const;

function normalizeUrl(row: EnovaDocRow): string {
  for (const field of URL_FIELDS) {
    const candidate = String(row[field] || "").trim();
    if (candidate) return candidate;
  }
  return "";
}

function normalizeMimeType(row: EnovaDocRow): string | null {
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
      file_name: null,
      size_bytes: null,
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
        file_name: null,
        size_bytes: null,
        previewable: isPreviewable(normalizedMimeType),
      },
      sourceUrl: normalizedUrl,
    };
  }

  return null;
}

type CanonicalStateRow = {
  pacote_documentos_anexados_json?: unknown;
  envio_docs_historico_json?: unknown;
};

function normalizeCanonicalRow(waId: string, value: unknown): EnovaDocRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const mediaRef =
    row.media_ref && typeof row.media_ref === "object"
      ? (row.media_ref as Record<string, unknown>)
      : {};
  const associado =
    row.associado && typeof row.associado === "object"
      ? (row.associado as Record<string, unknown>)
      : {};
  const matchedChecklistItem =
    row.matched_checklist_item && typeof row.matched_checklist_item === "object"
      ? (row.matched_checklist_item as Record<string, unknown>)
      : {};
  const url = String(
    row.url ||
      row.document_url ||
      row.download_url ||
      row.media_url ||
      row.link ||
      mediaRef.url ||
      mediaRef.link ||
      mediaRef.document_url ||
      mediaRef.download_url ||
      mediaRef.media_url ||
      "",
  ).trim();
  if (!url) return null;

  const createdAtRaw = row.created_at || row.at || row.uploaded_at || row.timestamp || null;
  const createdAt = createdAtRaw === null || createdAtRaw === undefined ? null : String(createdAtRaw);
  const documentUrl = row.document_url || mediaRef.document_url;
  const downloadUrl = row.download_url || mediaRef.download_url;
  const mediaUrl = row.media_url || mediaRef.media_url;
  const linkUrl = row.link || mediaRef.link;

  return {
    wa_id: waId,
    tipo: String(
      row.tipo ||
        row.document_type ||
        row.tipo_documento ||
        associado.tipo ||
        matchedChecklistItem.tipo ||
        "documento",
    ).trim() || "documento",
    participante:
      String(
        row.participante ||
          row.owner ||
          associado.participante ||
          matchedChecklistItem.participante ||
          "",
      ).trim() || null,
    created_at: createdAt,
    url,
    document_url: documentUrl ? String(documentUrl) : null,
    download_url: downloadUrl ? String(downloadUrl) : null,
    media_url: mediaUrl ? String(mediaUrl) : null,
    link: linkUrl ? String(linkUrl) : null,
  };
}

function parseCanonicalRows(waId: string, source: unknown): EnovaDocRow[] {
  if (!Array.isArray(source)) return [];
  const rows: EnovaDocRow[] = [];
  for (const value of source) {
    const normalized = normalizeCanonicalRow(waId, value);
    if (normalized) rows.push(normalized);
  }
  return rows;
}

export function resolveRowsFromCanonicalState(
  waId: string,
  stateRow: CanonicalStateRow | null | undefined,
): EnovaDocRow[] {
  const pacoteRows = parseCanonicalRows(waId, stateRow?.pacote_documentos_anexados_json);
  const historicoRows = parseCanonicalRows(waId, stateRow?.envio_docs_historico_json);
  const merged = [...pacoteRows, ...historicoRows];
  const deduped: EnovaDocRow[] = [];
  const seen = new Set<string>();

  for (const row of merged) {
    const normalizedUrl = normalizeUrl(row);
    const key = [
      normalizedUrl,
      String(row.tipo || "").trim().toLowerCase(),
      String(row.participante || "").trim().toLowerCase(),
      String(row.created_at || "").trim(),
    ].join("|");
    if (!normalizedUrl || seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}
