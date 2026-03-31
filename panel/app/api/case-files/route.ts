import { NextResponse } from "next/server";
import { mergeCaseFileRows, normalizeCaseFiles, resolveRowsFromCanonicalState, type EnovaDocRow } from "./_shared";

type CaseFilesResponse = {
  ok: boolean;
  wa_id: string | null;
  files: ReturnType<typeof normalizeCaseFiles>;
  error: string | null;
};

const REQUIRED_ENVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const;

const jsonResponse = (body: CaseFilesResponse, status: number) =>
  NextResponse.json<CaseFilesResponse>(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const waId = (searchParams.get("wa_id") || "").trim();

  if (!waId) {
    return jsonResponse({ ok: false, wa_id: null, files: [], error: "wa_id obrigatório" }, 400);
  }

  const missingEnvs = REQUIRED_ENVS.filter((envName) => !process.env[envName]);
  if (missingEnvs.length > 0) {
    return jsonResponse(
      {
        ok: false,
        wa_id: waId,
        files: [],
        error: `missing env: ${missingEnvs.join(", ")}`,
      },
      500,
    );
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE as string;

    const endpoint = new URL("/rest/v1/enova_docs", supabaseUrl);
    endpoint.searchParams.set("select", "wa_id,tipo,participante,created_at,url,media_id");
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
      return jsonResponse(
        {
          ok: false,
          wa_id: waId,
          files: [],
          error: `failed to load files (${response.status}) ${body.slice(0, 120)}`,
        },
        500,
      );
    }

    const rows = (await response.json()) as EnovaDocRow[];
    const primaryRows = Array.isArray(rows) ? rows : [];
    let canonicalRows: EnovaDocRow[] = [];

    const fallbackEndpoint = new URL("/rest/v1/enova_state", supabaseUrl);
    fallbackEndpoint.searchParams.set("select", "pacote_documentos_anexados_json,envio_docs_historico_json");
    fallbackEndpoint.searchParams.set("wa_id", `eq.${waId}`);
    fallbackEndpoint.searchParams.set("order", "updated_at.desc");
    fallbackEndpoint.searchParams.set("limit", "1");

    const fallbackResponse = await fetch(fallbackEndpoint, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    });

    if (fallbackResponse.ok) {
      const fallbackRows = (await fallbackResponse.json()) as Array<{
        pacote_documentos_anexados_json?: unknown;
        envio_docs_historico_json?: unknown;
      }>;
      canonicalRows = resolveRowsFromCanonicalState(waId, fallbackRows?.[0] || null);
    }

    const sourceRows = mergeCaseFileRows(primaryRows, canonicalRows);
    const files = normalizeCaseFiles(waId, sourceRows);

    return jsonResponse({ ok: true, wa_id: waId, files, error: null }, 200);
  } catch (error) {
    console.error("case-files list internal error", error);
    return jsonResponse({ ok: false, wa_id: waId, files: [], error: "internal error" }, 500);
  }
}
