import { createHash } from "node:crypto";

export type EnovaDocRow = {
  wa_id: string | null;
  tipo: string | null;
  participante: string | null;
  created_at: string | null;
  url: string | null;
  media_id?: string | null;
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
  has_link: boolean;
};

const URL_FIELDS = ["url", "document_url", "download_url", "media_url", "link"] as const;

const META_API_VERSION = "v20.0";

function normalizeUrl(row: EnovaDocRow): string {
  for (const field of URL_FIELDS) {
    const candidate = String(row[field] || "").trim();
    if (candidate) return candidate;
  }
  const mediaId = String(row.media_id || "").trim();
  if (mediaId) {
    return `https://graph.facebook.com/${META_API_VERSION}/${mediaId}`;
  }
  return "";
}

function buildDedupKey(row: EnovaDocRow): string {
  const normalizedUrl = normalizeUrl(row);
  // Use a "\0" prefix as URL placeholder for rows that have no resolvable URL,
  // so that null-URL rows are deduped by tipo+participante+created_at instead
  // of being collapsed with all other null-URL rows under one key.
  const urlPart = normalizedUrl || "\0";
  return [
    urlPart,
    String(row.tipo || "").trim().toLowerCase(),
    String(row.participante || "").trim().toLowerCase(),
    String(row.created_at || "").trim(),
  ].join("|");
}

function dedupeRows(rows: EnovaDocRow[]): EnovaDocRow[] {
  const deduped: EnovaDocRow[] = [];
  const seen = new Set<string>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = buildDedupKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
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
    const hasLink = Boolean(normalizedUrl);

    // mime type is inferred from the URL extension, so it's only meaningful when a URL is available
    const normalizedMimeType = hasLink ? normalizeMimeType(row) : null;
    items.push({
      file_id: buildStableFileId(waId, row, normalizedUrl, normalizedMimeType, index),
      wa_id: waId,
      tipo: String(row.tipo || "documento").trim().toLowerCase(),
      participante: String(row.participante || "").trim().toLowerCase() || null,
      created_at: row.created_at || null,
      mime_type: normalizedMimeType,
      file_name: null,
      size_bytes: null,
      previewable: hasLink && isPreviewable(normalizedMimeType),
      has_link: hasLink,
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
        has_link: true,
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
  return dedupeRows([...pacoteRows, ...historicoRows]);
}

export function mergeCaseFileRows(primaryRows: EnovaDocRow[], canonicalRows: EnovaDocRow[]): EnovaDocRow[] {
  return dedupeRows([...(Array.isArray(primaryRows) ? primaryRows : []), ...(Array.isArray(canonicalRows) ? canonicalRows : [])]);
}
