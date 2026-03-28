import { NextResponse } from "next/server";
import { fetchCaseFileRows, normalizeCaseFiles } from "./_shared";

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

    const rows = await fetchCaseFileRows(supabaseUrl, serviceRoleKey, waId);
    const files = normalizeCaseFiles(waId, rows);
    return jsonResponse({ ok: true, wa_id: waId, files, error: null }, 200);
  } catch (error) {
    console.error("case-files list internal error", error);
    return jsonResponse({ ok: false, wa_id: waId, files: [], error: "internal error" }, 500);
  }
}
