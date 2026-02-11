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
    const conversations = Array.isArray(rows)
      ? rows
          .filter((row) => typeof row?.wa_id === "string" && row.wa_id.length > 0)
          .map((row) => ({
            id: row.wa_id as string,
            wa_id: row.wa_id as string,
            nome: row.nome ?? null,
            last_message_text:
              row.last_incoming_text ?? row.last_user_msg ?? row.last_bot_msg ?? null,
            last_message_at: row.last_incoming_at ?? row.updated_at ?? row.created_at ?? null,
            updated_at: row.updated_at ?? null,
            created_at: row.created_at ?? null,
            fase_conversa: row.fase_conversa ?? null,
            funil_status: row.funil_status ?? null,
            atendimento_manual: Boolean(row.atendimento_manual),
          }))
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
