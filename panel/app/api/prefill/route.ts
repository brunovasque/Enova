import { NextResponse } from "next/server";
import { getPrefillMeta, upsertPrefillMeta, PrefillUpdatePayload } from "./_shared";

const REQUIRED_ENVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const;

function missingEnvs() {
  return REQUIRED_ENVS.filter((k) => !process.env[k]);
}

export async function GET(request: Request) {
  const missing = missingEnvs();
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: `missing env: ${missing.join(", ")}` },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { searchParams } = new URL(request.url);
  const wa_id = searchParams.get("wa_id");

  if (!wa_id || !wa_id.trim()) {
    return NextResponse.json(
      { ok: false, error: "wa_id obrigatório" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const row = await getPrefillMeta(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string,
      wa_id.trim(),
    );
    return NextResponse.json(
      { ok: true, prefill: row },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "internal error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  const missing = missingEnvs();
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: `missing env: ${missing.join(", ")}` },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  let payload: PrefillUpdatePayload;
  try {
    payload = (await request.json()) as PrefillUpdatePayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!payload.wa_id || !String(payload.wa_id).trim()) {
    return NextResponse.json(
      { ok: false, error: "wa_id obrigatório" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const saved = await upsertPrefillMeta(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string,
      payload,
    );
    return NextResponse.json(
      { ok: true, prefill: saved },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "internal error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
