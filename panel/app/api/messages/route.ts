import { NextResponse } from "next/server";

type Message = {
  id: string | null;
  wa_id: string;
  direction: "in" | "out";
  text: string | null;
  source: string | null;
  created_at: string | null;
};

type MessagesResponse = {
  ok: boolean;
  wa_id: string;
  messages: Message[];
  error: string | null;
};

type ChatHistoryRow = {
  id?: string | number | null;
  phone: string | null;
  message: string | null;
  source: string | null;
  created_at: string | null;
};

const REQUIRED_ENVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const;

const jsonResponse = (body: MessagesResponse, status: number) =>
  NextResponse.json<MessagesResponse>(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });

function inferDirection(source: string | null): "in" | "out" {
  const normalized = source?.toLowerCase().trim();

  if (!normalized) {
    return "in";
  }

  if (normalized.includes("enova") || normalized.includes("bot") || normalized.includes("assistant")) {
    return "out";
  }

  return "in";
}

function parseLimit(rawLimit: string | null): number {
  if (!rawLimit) {
    return 200;
  }

  const parsed = Number.parseInt(rawLimit, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 200;
  }

  return Math.min(parsed, 500);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const waId = searchParams.get("wa_id")?.trim() ?? "";
  const limit = parseLimit(searchParams.get("limit"));

  if (!waId) {
    return jsonResponse(
      {
        ok: false,
        wa_id: "",
        messages: [],
        error: "wa_id is required",
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
        messages: [],
        error: `missing env: ${missingEnvs.join(", ")}`,
      },
      500,
    );
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE as string;

    const response = await fetch(
      new URL(
        `/rest/v1/chat_history_whatsapp?select=id,phone,message,source,created_at&phone=eq.${encodeURIComponent(waId)}&order=created_at.asc&limit=${limit}`,
        supabaseUrl,
      ),
      {
        method: "GET",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return jsonResponse(
        {
          ok: false,
          wa_id: waId,
          messages: [],
          error: `supabase query failed (${response.status})`,
        },
        502,
      );
    }

    const rows = (await response.json()) as ChatHistoryRow[];

    const messages = Array.isArray(rows)
      ? rows.map((row) => ({
          id: row.id !== undefined && row.id !== null ? String(row.id) : null,
          wa_id: row.phone ?? waId,
          direction: inferDirection(row.source ?? null),
          text: row.message ?? null,
          source: row.source ?? null,
          created_at: row.created_at ?? null,
        }))
      : [];

    return jsonResponse(
      {
        ok: true,
        wa_id: waId,
        messages,
        error: null,
      },
      200,
    );
  } catch {
    return jsonResponse(
      {
        ok: false,
        wa_id: waId,
        messages: [],
        error: "internal error",
      },
      500,
    );
  }
}
