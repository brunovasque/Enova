import { NextResponse } from "next/server";

type ManualModeBody = {
  wa_id?: string;
  atendimento_manual?: boolean;
};

type ManualModeResponse = {
  ok: boolean;
  wa_id: string | null;
  atendimento_manual: boolean | null;
  error?: string;
};

const REQUIRED_ENVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const;

const jsonResponse = (body: ManualModeResponse, status: number) =>
  NextResponse.json<ManualModeResponse>(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });

export async function POST(request: Request) {
  let body: ManualModeBody;

  try {
    body = (await request.json()) as ManualModeBody;
  } catch {
    return jsonResponse(
      {
        ok: false,
        wa_id: null,
        atendimento_manual: null,
        error: "JSON inválido",
      },
      400,
    );
  }

  const waId = body.wa_id?.trim() ?? "";

  if (!waId || typeof body.atendimento_manual !== "boolean") {
    return jsonResponse(
      {
        ok: false,
        wa_id: waId || null,
        atendimento_manual: null,
        error: "wa_id e atendimento_manual (boolean) são obrigatórios",
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
        atendimento_manual: null,
        error: `MISSING_ENV: ${missingEnvs.join(", ")}`,
      },
      500,
    );
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE as string;

    const endpoint = new URL("/rest/v1/enova_state", supabaseUrl);
    endpoint.searchParams.set("wa_id", `eq.${waId}`);

    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        atendimento_manual: body.atendimento_manual,
        updated_at: new Date().toISOString(),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return jsonResponse(
        {
          ok: false,
          wa_id: waId,
          atendimento_manual: null,
          error: `supabase update failed (${response.status})`,
        },
        502,
      );
    }

    const rows = (await response.json()) as Array<{
      wa_id?: string | null;
      atendimento_manual?: boolean | null;
    }>;

    const updated = Array.isArray(rows) ? rows[0] : undefined;

    return jsonResponse(
      {
        ok: true,
        wa_id: updated?.wa_id ?? waId,
        atendimento_manual: Boolean(updated?.atendimento_manual),
      },
      200,
    );
  } catch {
    return jsonResponse(
      {
        ok: false,
        wa_id: waId,
        atendimento_manual: null,
        error: "failed to update manual mode",
      },
      500,
    );
  }
}
