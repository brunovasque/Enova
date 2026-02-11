import { NextResponse } from "next/server";

type ConversationsResponse = {
  ok: boolean;
  conversations: Conversation[];
  error?: string;
};

type EnovaStateRow = {
  wa_id: string | null;
  nome: string | null;
  last_incoming_text: string | null;
  last_user_msg: string | null;
  last_bot_msg: string | null;
  last_incoming_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  fase_conversa: string | null;
  funil_status: string | null;
  atendimento_manual: boolean | null;
};

type EnovaLogRow = {
  wa_id: string | null;
  tag: string | null;
  meta_text: string | null;
  details: unknown;
  created_at: string | null;
};

type Conversation = {
  id: string;
  wa_id: string;
  nome: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  fase_conversa: string | null;
  funil_status: string | null;
  atendimento_manual: boolean;
};

const REQUIRED_ENVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const;

const jsonResponse = (body: ConversationsResponse, status: number) =>
  NextResponse.json<ConversationsResponse>(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });

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

export async function GET() {
  const missingEnvs = REQUIRED_ENVS.filter((envName) => !process.env[envName]);

  if (missingEnvs.length > 0) {
    return jsonResponse(
      {
        ok: false,
        conversations: [],
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
        "/rest/v1/enova_state?select=*&order=updated_at.desc&limit=200",
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
          conversations: [],
          error: `supabase query failed (${response.status})`,
        },
        502,
      );
    }

    const rows = (await response.json()) as EnovaStateRow[];
    const waIds = Array.isArray(rows)
      ? rows
          .map((row) => row.wa_id)
          .filter((waId): waId is string => typeof waId === "string" && waId.length > 0)
      : [];

    const latestByWaId = new Map<string, { text: string | null; createdAt: string | null }>();

    if (waIds.length > 0) {
      const logsEndpoint = new URL("/rest/v1/enova_log", supabaseUrl);
      const escapedWaIds = waIds.map((waId) => `"${waId.replace(/\"/g, '\\\"')}"`).join(",");

      logsEndpoint.searchParams.set("select", "wa_id,tag,meta_text,details,created_at");
      logsEndpoint.searchParams.set("wa_id", `in.(${escapedWaIds})`);
      logsEndpoint.searchParams.set("tag", "in.(meta_minimal,DECISION_OUTPUT,SEND_OK)");
      logsEndpoint.searchParams.set("order", "created_at.desc");
      logsEndpoint.searchParams.set("limit", "3000");

      const logsResponse = await fetch(logsEndpoint, {
        method: "GET",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      });

      if (logsResponse.ok) {
        const logRows = (await logsResponse.json()) as EnovaLogRow[];

        if (Array.isArray(logRows)) {
          for (const logRow of logRows) {
            if (!logRow.wa_id || latestByWaId.has(logRow.wa_id)) {
              continue;
            }

            let text: string | null = null;

            if (logRow.tag === "meta_minimal") {
              text = logRow.meta_text ?? null;
            } else if (logRow.tag === "DECISION_OUTPUT" || logRow.tag === "SEND_OK") {
              text = parseOutgoingText(logRow.details);
            }

            latestByWaId.set(logRow.wa_id, {
              text,
              createdAt: logRow.created_at ?? null,
            });
          }
        }
      }
    }

    const conversations = Array.isArray(rows)
      ? rows
          .filter((row) => typeof row?.wa_id === "string" && row.wa_id.length > 0)
          .map((row) => {
            const waId = row.wa_id as string;
            const latestLog = latestByWaId.get(waId);

            return {
              id: waId,
              wa_id: waId,
              nome: row.nome ?? null,
              last_message_text:
                latestLog?.text ?? row.last_incoming_text ?? row.last_user_msg ?? row.last_bot_msg ?? null,
              last_message_at:
                latestLog?.createdAt ?? row.last_incoming_at ?? row.updated_at ?? row.created_at ?? null,
              updated_at: row.updated_at ?? null,
              created_at: row.created_at ?? null,
              fase_conversa: row.fase_conversa ?? null,
              funil_status: row.funil_status ?? null,
              atendimento_manual: Boolean(row.atendimento_manual),
            };
          })
      : [];

    return jsonResponse(
      {
        ok: true,
        conversations,
      },
      200,
    );
  } catch {
    return jsonResponse(
      {
        ok: false,
        conversations: [],
        error: "failed to load conversations",
      },
      500,
    );
  }
}
