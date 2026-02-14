import { NextResponse } from "next/server";

type ManualModeRequest = {
  wa_id?: string;
  manual?: boolean;
};

const REQUIRED_ENVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const;

export async function POST(request: Request) {
  const missingEnvs = REQUIRED_ENVS.filter((envName) => !process.env[envName]);

  if (missingEnvs.length > 0) {
    return NextResponse.json(
      { ok: false, error: `missing env: ${missingEnvs.join(", ")}` },
      { status: 500 },
    );
  }

  let payload: ManualModeRequest;

  try {
    payload = (await request.json()) as ManualModeRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const waId = payload.wa_id?.trim() ?? "";

  if (!waId || typeof payload.manual !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "wa_id e manual são obrigatórios" },
      { status: 400 },
    );
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE as string;
    const endpoint = new URL(`/rest/v1/enova_state?wa_id=eq.${encodeURIComponent(waId)}`, supabaseUrl);

    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        atendimento_manual: payload.manual,
        updated_at: new Date().toISOString(),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ ok: false, error: "FAILED_TO_UPDATE" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
