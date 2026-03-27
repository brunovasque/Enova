import { createHash } from "node:crypto";

export type EnovaDocRow = {
  wa_id: string | null;
  tipo?: string | null;
  participante?: string | null;
  status?: string | null;
  created_at?: string | null;
  url?: string | null;
  document_url?: string | null;
  download_url?: string | null;
  media_url?: string | null;
  link?: string | null;
  mime_type?: string | null;
  mimetype?: string | null;
  file_name?: string | null;
  filename?: string | null;
  size?: number | string | null;
  file_size?: number | string | null;
  bytes?: number | string | null;
  tamanho?: number | string | null;
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

function normalizeUrl(row: EnovaDocRow): string {
  return String(
    row.url || row.document_url || row.download_url || row.media_url || row.link || "",
  ).trim();
}

function normalizeMimeType(row: EnovaDocRow): string | null {
  const explicit = String(row.mime_type || row.mimetype || "")
    .trim()
    .toLowerCase();
  if (explicit) return explicit;

  const fileName = String(row.file_name || row.filename || "")
    .trim()
    .toLowerCase();
  const url = normalizeUrl(row).toLowerCase();
  const probe = `${fileName} ${url}`;
  if (probe.includes(".pdf")) return "application/pdf";
  if (probe.match(/\.(png)\b/)) return "image/png";
  if (probe.match(/\.(jpe?g)\b/)) return "image/jpeg";
  if (probe.match(/\.(webp)\b/)) return "image/webp";
  if (probe.match(/\.(gif)\b/)) return "image/gif";
  return null;
}

function normalizeSizeBytes(row: EnovaDocRow): number | null {
  const candidates = [row.size, row.file_size, row.bytes, row.tamanho];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return Math.floor(parsed);
      }
    }
  }
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
    row.file_name || row.filename || "",
    normalizedMimeType || "",
    normalizedUrl,
    String(index),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

export function normalizeCaseFiles(waId: string, rows: EnovaDocRow[]): CaseFileItem[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row, index) => {
      const normalizedUrl = normalizeUrl(row);
      const status = String(row.status || "")
        .trim()
        .toLowerCase();
      if (!normalizedUrl || status === "pendente") {
        return null;
      }

      const normalizedMimeType = normalizeMimeType(row);
      return {
        file_id: buildStableFileId(waId, row, normalizedUrl, normalizedMimeType, index),
        wa_id: waId,
        tipo: String(row.tipo || "documento").trim().toLowerCase(),
        participante: String(row.participante || "").trim().toLowerCase() || null,
        created_at: row.created_at || null,
        mime_type: normalizedMimeType,
        file_name: String(row.file_name || row.filename || "").trim() || null,
        size_bytes: normalizeSizeBytes(row),
        previewable: isPreviewable(normalizedMimeType),
      } satisfies CaseFileItem;
    })
    .filter((item): item is CaseFileItem => Boolean(item));
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

    const status = String(row.status || "")
      .trim()
      .toLowerCase();
    if (status === "pendente") continue;

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
        file_name: String(row.file_name || row.filename || "").trim() || null,
        size_bytes: normalizeSizeBytes(row),
        previewable: isPreviewable(normalizedMimeType),
      },
      sourceUrl: normalizedUrl,
    };
  }

  return null;
}
