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
  wa_id: string | null;
  messages: Message[];
  error: string | null;
};

type EnovaLogRow = {
  id?: string | number | null;
  wa_id: string | null;
  tag: string | null;
  meta_type: string | null;
  meta_text: string | null;
  details: unknown;
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

function parseOutgoingText(details: unknown): string | null {
  if (!details) {
    return null;
  }

  try {
    const parsed = typeof details === "string" ? JSON.parse(details) : details;

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const candidate =
      (parsed as Record<string, unknown>).reply ??
      (parsed as Record<string, unknown>).bot_text ??
      (parsed as Record<string, unknown>).answer;

    return typeof candidate === "string" ? candidate : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const waId = searchParams.get("wa_id")?.trim() ?? "";
  const limit = parseLimit(searchParams.get("limit"));

  if (!waId) {
    return jsonResponse(
      {
        ok: false,
        wa_id: null,
        messages: [],
        error: "wa_id obrigatório",
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

    const endpoint = new URL("/rest/v1/enova_log", supabaseUrl);
    endpoint.searchParams.set(
      "select",
      "id,wa_id,tag,meta_type,meta_text,details,created_at",
    );
    endpoint.searchParams.set("wa_id", `eq.${waId}`);
    endpoint.searchParams.set("tag", "in.(meta_minimal,DECISION_OUTPUT,SEND_OK)");
    endpoint.searchParams.set("order", "created_at.asc");
    endpoint.searchParams.set("limit", String(limit));

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return jsonResponse(
        {
          ok: false,
          wa_id: waId,
          messages: [],
          error: "failed to load messages",
        },
        500,
      );
    }

    const rows = (await response.json()) as EnovaLogRow[];

    const messages: Message[] = Array.isArray(rows)
      ? rows.reduce<Message[]>((acc, row) => {
          if (row.tag === "meta_minimal") {
            acc.push({
              id: row.id !== undefined && row.id !== null ? String(row.id) : null,
              wa_id: row.wa_id ?? waId,
              direction: "in",
              text: row.meta_text ?? null,
              source: "user",
              created_at: row.created_at ?? null,
            });

            return acc;
          }

          if (row.tag === "DECISION_OUTPUT" || row.tag === "SEND_OK") {
            acc.push({
              id: row.id !== undefined && row.id !== null ? String(row.id) : null,
              wa_id: row.wa_id ?? waId,
              direction: "out",
              text: parseOutgoingText(row.details),
              source: row.tag,
              created_at: row.created_at ?? null,
            });
          }

          return acc;
        }, [])
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
