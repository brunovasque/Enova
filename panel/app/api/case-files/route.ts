import { NextResponse } from "next/server";
import { normalizeCaseFiles, type EnovaDocRow } from "./_shared";

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
    endpoint.searchParams.set(
      "select",
      "wa_id,tipo,participante,status,created_at,url,document_url,download_url,media_url,link,mime_type,mimetype,file_name,filename,size,file_size,bytes,tamanho",
    );
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
    const files = normalizeCaseFiles(waId, rows);
    return jsonResponse({ ok: true, wa_id: waId, files, error: null }, 200);
  } catch (error) {
    console.error("case-files list internal error", error);
    return jsonResponse({ ok: false, wa_id: waId, files: [], error: "internal error" }, 500);
  }
}
