import { createHash } from "node:crypto";

export type EnovaDocRow = {
  wa_id: string | null;
  tipo: string | null;
  participante: string | null;
  created_at: string | null;
  url: string | null;
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
  return String(row.url || "").trim();
}

function normalizeMimeType(row: EnovaDocRow): string | null {
  const url = normalizeUrl(row).toLowerCase();
  const probe = `${url}`;
  if (probe.includes(".pdf")) return "application/pdf";
  if (probe.match(/\.(png)\b/)) return "image/png";
  if (probe.match(/\.(jpe?g)\b/)) return "image/jpeg";
  if (probe.match(/\.(webp)\b/)) return "image/webp";
  if (probe.match(/\.(gif)\b/)) return "image/gif";
  return null;
}

function normalizeSizeBytes(row: EnovaDocRow): number | null {
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
      size_bytes: normalizeSizeBytes(row),
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
        size_bytes: normalizeSizeBytes(row),
        previewable: isPreviewable(normalizedMimeType),
      },
      sourceUrl: normalizedUrl,
    };
  }

  return null;
}
