import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

const REQUIRED_ENVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE", "ENOVA_ADMIN_KEY"] as const;
const URL_FIELDS = ["url", "document_url", "download_url", "media_url", "link"] as const;
const MAX_DIAGNOSTIC_ROWS = 500;
const MAX_ERROR_MESSAGE_LENGTH = 160;
const UNKNOWN_COLUMN_CODES = new Set(["42703", "PGRST204"]);

type UrlField = (typeof URL_FIELDS)[number];

type DiagnosticRow = {
  index: number;
  wa_id: string | null;
  exact_wa_id_match: boolean;
  filled: Record<UrlField, boolean | null>;
};

type DiagnosticResponse = {
  ok: boolean;
  wa_id: string | null;
  row_count: number;
  exact_wa_id_match_all: boolean;
  column_availability: Record<UrlField, boolean>;
  filled_counts: Record<UrlField, number | null>;
  rows: DiagnosticRow[];
  error: string | null;
};

function jsonResponse(body: DiagnosticResponse, status: number) {
  return NextResponse.json<DiagnosticResponse>(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function columnExists(
  supabaseUrl: string,
  serviceRoleKey: string,
  waId: string,
  column: UrlField,
): Promise<boolean> {
  const endpoint = new URL("/rest/v1/enova_docs", supabaseUrl);
  endpoint.searchParams.set("select", column);
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

  if (response.ok) {
    return true;
  }

  let parsedBody: unknown = null;
  try {
    parsedBody = await response.json();
  } catch {
    parsedBody = null;
  }
  const errorCode =
    typeof parsedBody === "object" &&
    parsedBody !== null &&
    "code" in parsedBody &&
    typeof (parsedBody as { code?: unknown }).code === "string"
      ? (parsedBody as { code: string }).code
      : "";
  if (response.status === 400 && UNKNOWN_COLUMN_CODES.has(errorCode)) {
    return false;
  }

  throw new Error(`failed to probe column ${column} (${response.status})`);
}

function isFilled(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : false;
}

function hasValidAdminKey(receivedAdminKey: string, adminKey: string): boolean {
  const receivedBuffer = Buffer.from(receivedAdminKey);
  const expectedBuffer = Buffer.from(adminKey);
  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function GET(request: Request) {
  const missingEnvs = REQUIRED_ENVS.filter((envName) => !process.env[envName]);
  if (missingEnvs.length > 0) {
    return jsonResponse(
      {
        ok: false,
        wa_id: null,
        row_count: 0,
        exact_wa_id_match_all: false,
        column_availability: {
          url: false,
          document_url: false,
          download_url: false,
          media_url: false,
          link: false,
        },
        filled_counts: {
          url: null,
          document_url: null,
          download_url: null,
          media_url: null,
          link: null,
        },
        rows: [],
        error: `missing env: ${missingEnvs.join(", ")}`,
      },
      500,
    );
  }

  const adminKey = process.env.ENOVA_ADMIN_KEY as string;
  const receivedAdminKey = request.headers.get("x-enova-admin-key") || "";
  if (!receivedAdminKey) {
    return jsonResponse(
      {
        ok: false,
        wa_id: null,
        row_count: 0,
        exact_wa_id_match_all: false,
        column_availability: {
          url: false,
          document_url: false,
          download_url: false,
          media_url: false,
          link: false,
        },
        filled_counts: {
          url: null,
          document_url: null,
          download_url: null,
          media_url: null,
          link: null,
        },
        rows: [],
        error: "missing x-enova-admin-key",
      },
      401,
    );
  }
  if (!hasValidAdminKey(receivedAdminKey, adminKey)) {
    return jsonResponse(
      {
        ok: false,
        wa_id: null,
        row_count: 0,
        exact_wa_id_match_all: false,
        column_availability: {
          url: false,
          document_url: false,
          download_url: false,
          media_url: false,
          link: false,
        },
        filled_counts: {
          url: null,
          document_url: null,
          download_url: null,
          media_url: null,
          link: null,
        },
        rows: [],
        error: "invalid x-enova-admin-key",
      },
      403,
    );
  }

  const { searchParams } = new URL(request.url);
  const waId = (searchParams.get("wa_id") || "").trim();
  if (!waId) {
    return jsonResponse(
      {
        ok: false,
        wa_id: null,
        row_count: 0,
        exact_wa_id_match_all: false,
        column_availability: {
          url: false,
          document_url: false,
          download_url: false,
          media_url: false,
          link: false,
        },
        filled_counts: {
          url: null,
          document_url: null,
          download_url: null,
          media_url: null,
          link: null,
        },
        rows: [],
        error: "wa_id obrigatório",
      },
      400,
    );
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE as string;

    const availabilityEntries = await Promise.all(
      URL_FIELDS.map(async (field) => [field, await columnExists(supabaseUrl, serviceRoleKey, waId, field)]),
    );
    const columnAvailability = Object.fromEntries(availabilityEntries) as Record<UrlField, boolean>;

    const selectableFields = URL_FIELDS.filter((field) => columnAvailability[field]);
    const endpoint = new URL("/rest/v1/enova_docs", supabaseUrl);
    endpoint.searchParams.set("select", ["wa_id", "created_at", ...selectableFields].join(","));
    endpoint.searchParams.set("wa_id", `eq.${waId}`);
    endpoint.searchParams.set("order", "created_at.asc");
    endpoint.searchParams.set("limit", String(MAX_DIAGNOSTIC_ROWS));

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
      return jsonResponse(
        {
          ok: false,
          wa_id: waId,
          row_count: 0,
          exact_wa_id_match_all: false,
          column_availability: columnAvailability,
          filled_counts: {
            url: null,
            document_url: null,
            download_url: null,
            media_url: null,
            link: null,
          },
          rows: [],
          error: `failed to load diagnostics (${response.status}) ${body.slice(0, MAX_ERROR_MESSAGE_LENGTH)}`,
        },
        500,
      );
    }

    const rowsRaw = (await response.json()) as Array<Record<string, unknown>>;
    const rows: DiagnosticRow[] = rowsRaw.map((row, index) => {
      const rowWaId = row.wa_id === null || row.wa_id === undefined ? null : String(row.wa_id);
      const exactWaIdMatch = (rowWaId ?? "").trim() === waId;
      const filled = Object.fromEntries(
        URL_FIELDS.map((field) => [
          field,
          columnAvailability[field] ? isFilled(row[field]) : null,
        ]),
      ) as Record<UrlField, boolean | null>;

      return {
        index,
        wa_id: rowWaId,
        exact_wa_id_match: exactWaIdMatch,
        filled,
      };
    });

    const filledCounts = Object.fromEntries(
      URL_FIELDS.map((field) => {
        if (!columnAvailability[field]) return [field, null];
        const count = rows.reduce(
          (acc, row) => acc + (row.filled[field] === true ? 1 : 0),
          0,
        );
        return [field, count];
      }),
    ) as Record<UrlField, number | null>;

    return jsonResponse(
      {
        ok: true,
        wa_id: waId,
        row_count: rows.length,
        exact_wa_id_match_all: rows.every((row) => row.exact_wa_id_match),
        column_availability: columnAvailability,
        filled_counts: filledCounts,
        rows,
        error: null,
      },
      200,
    );
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message : "unknown error";
    console.error("case-files diagnostic internal error:", safeMessage);
    return jsonResponse(
      {
        ok: false,
        wa_id: null,
        row_count: 0,
        exact_wa_id_match_all: false,
        column_availability: {
          url: false,
          document_url: false,
          download_url: false,
          media_url: false,
          link: false,
        },
        filled_counts: {
          url: null,
          document_url: null,
          download_url: null,
          media_url: null,
          link: null,
        },
        rows: [],
        error: "internal error",
      },
      500,
    );
  }
}
