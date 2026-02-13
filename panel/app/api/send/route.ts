import { NextResponse } from "next/server";

type SendBody = {
  wa_id?: string;
  text?: string;
};

type SendResponse = {
  ok: boolean;
  wa_id: string | null;
  error?: string;
};

const REQUIRED_ENVS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE",
  "WORKER_BASE_URL",
  "ENOVA_ADMIN_KEY",
] as const;

const jsonResponse = (body: SendResponse, status: number) =>
  NextResponse.json<SendResponse>(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });

export async function POST(request: Request) {
  let body: SendBody;

  try {
    body = (await request.json()) as SendBody;
  } catch {
    return jsonResponse(
      {
        ok: false,
        wa_id: null,
        error: "JSON inválido",
      },
      400,
    );
  }

  const waId = body.wa_id?.trim() ?? "";
  const text = body.text?.trim() ?? "";

  if (!waId || !text) {
    return jsonResponse(
      {
        ok: false,
        wa_id: waId || null,
        error: "wa_id e text são obrigatórios",
      },
      400,
    );
  }

  const missingEnvs = REQUIRED_ENVS.filter((envName) => !process.env[envName]);

  if (missingEnvs.length > 0) {
    return jsonResponse(
      {
        ok: false,
        wa_id: waId,
        error: `MISSING_ENV: ${missingEnvs.join(", ")}`,
      },
      500,
    );
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE as string;
    const workerBaseUrlRaw = process.env.WORKER_BASE_URL as string;
    const workerBaseUrl = workerBaseUrlRaw.replace(/\/+$/, "");
    const adminKey = process.env.ENOVA_ADMIN_KEY as string;

    const stateEndpoint = new URL("/rest/v1/enova_state", supabaseUrl);
    stateEndpoint.searchParams.set("select", "wa_id,atendimento_manual");
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
      return jsonResponse(
        {
          ok: false,
          wa_id: waId,
          error: `supabase state failed (${stateResponse.status})`,
        },
        502,
      );
    }

    const stateRows = (await stateResponse.json()) as Array<{
      wa_id?: string | null;
      atendimento_manual?: boolean | null;
    }>;

    const state = Array.isArray(stateRows) ? stateRows[0] : undefined;

    if (!state?.wa_id) {
      return jsonResponse(
        {
          ok: false,
          wa_id: waId,
          error: "conversa não encontrada",
        },
        404,
      );
    }

    if (!state.atendimento_manual) {
      return jsonResponse(
        {
          ok: false,
          wa_id: waId,
          error: "modo humano deve estar ON para envio manual",
        },
        403,
      );
    }

    const workerUrl = new URL("/__admin__/send", workerBaseUrl);

    const workerResponse = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-enova-admin-key": adminKey,
      },
      body: JSON.stringify({
        wa_id: waId,
        text,
      }),
      cache: "no-store",
    });

    if (!workerResponse.ok) {
      return jsonResponse(
        {
          ok: false,
          wa_id: waId,
          error: `worker send failed (${workerResponse.status})`,
        },
        502,
      );
    }

    return jsonResponse(
      {
        ok: true,
        wa_id: waId,
      },
      200,
    );
  } catch {
    return jsonResponse(
      {
        ok: false,
        wa_id: waId,
        error: "failed to send message",
      },
      500,
    );
  }
}
