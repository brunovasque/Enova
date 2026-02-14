import { NextResponse } from "next/server";

type SendRequest = {
  wa_id?: string;
  text?: string;
};

type EnovaStateRow = {
  atendimento_manual: boolean | null;
};

const REQUIRED_ENVS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE",
  "WORKER_BASE_URL",
  "ENOVA_ADMIN_KEY",
] as const;

export async function POST(request: Request) {
  const missingEnvs = REQUIRED_ENVS.filter((envName) => !process.env[envName]);

  if (missingEnvs.length > 0) {
    return NextResponse.json(
      { ok: false, error: `missing env: ${missingEnvs.join(", ")}` },
      { status: 500 },
    );
  }

  let payload: SendRequest;

  try {
    payload = (await request.json()) as SendRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const waId = payload.wa_id?.trim() ?? "";
  const text = payload.text?.trim() ?? "";

  if (!waId || !text) {
    return NextResponse.json({ ok: false, error: "wa_id e text são obrigatórios" }, { status: 400 });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE as string;

    const stateEndpoint = new URL("/rest/v1/enova_state", supabaseUrl);
    stateEndpoint.searchParams.set("select", "atendimento_manual");
    stateEndpoint.searchParams.set("wa_id", `eq.${waId}`);
    stateEndpoint.searchParams.set("limit", "1");

    const stateResponse = await fetch(stateEndpoint, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    });

    if (!stateResponse.ok) {
      return NextResponse.json({ ok: false, error: "FAILED_TO_LOAD_STATE" }, { status: 500 });
    }

    const rows = (await stateResponse.json()) as EnovaStateRow[];
    const manualEnabled = Boolean(rows?.[0]?.atendimento_manual);

    if (!manualEnabled) {
      return NextResponse.json({ ok: false, error: "MANUAL_MODE_OFF" }, { status: 403 });
    }

    const workerBaseUrl = process.env.WORKER_BASE_URL as string;
    const adminKey = process.env.ENOVA_ADMIN_KEY as string;
    const workerEndpoint = new URL("/__admin__/send", workerBaseUrl);

    const workerResponse = await fetch(workerEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-enova-admin-key": adminKey,
      },
      body: JSON.stringify({ wa_id: waId, text }),
      cache: "no-store",
    });

    const workerJson = await workerResponse.json();

    return NextResponse.json(workerJson, { status: workerResponse.status });
  } catch {
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
