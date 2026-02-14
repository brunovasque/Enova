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
    headers: { "Cache-Control": "no-store" },
  });

function parseLimit(rawLimit: string | null): number {
  if (!rawLimit) return 200;

  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 200;

  return Math.min(parsed, 500);
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}

function parseOutgoingText(details: unknown): string | null {
  if (!details) return null;

  try {
    const parsed = typeof details === "string" ? JSON.parse(details) : details;
    if (!parsed || typeof parsed !== "object") return null;

    const record = parsed as Record<string, unknown>;

    const payload =
      record.payload_enviado && typeof record.payload_enviado === "object"
        ? (record.payload_enviado as Record<string, unknown>)
        : null;

    const payloadText =
      payload?.text && typeof payload.text === "object"
        ? (payload.text as Record<string, unknown>).body
        : null;

    const candidate =
      record.reply ??
      record.bot_text ??
      record.answer ??
      record.text ??
      record.message_text ??
      payloadText;

    if (typeof candidate !== "string") return null;
    return normalizeText(candidate);
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const waId = (searchParams.get("wa_id") ?? "").trim();
  const limit = parseLimit(searchParams.get("limit"));

  if (!waId) {
    return jsonResponse(
      { ok: false, wa_id: null, messages: [], error: "wa_id obrigatório" },
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

    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    };

    const messages: Message[] = [];
    const seen = new Set<string>();

    const pushUnique = (msg: Message) => {
      const key = `${msg.direction}|${msg.created_at ?? ""}|${msg.source ?? ""}|${msg.text ?? ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      messages.push(msg);
    };

    // LEGADO (enova_log) — único canônico aqui (sem colunas inexistentes)
    const legacyEndpoint = new URL("/rest/v1/enova_log", supabaseUrl);
    legacyEndpoint.searchParams.set(
      "select",
      "id,wa_id,tag,meta_type,meta_text,details,created_at",
    );
    legacyEndpoint.searchParams.set("wa_id", `eq.${waId}`);
    legacyEndpoint.searchParams.set("tag", "in.(meta_minimal,DECISION_OUTPUT,SEND_OK)");
    legacyEndpoint.searchParams.set("order", "created_at.asc");
    legacyEndpoint.searchParams.set("limit", String(limit));

    const legacyResponse = await fetch(legacyEndpoint, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!legacyResponse.ok) {
      const legacyText = await legacyResponse.text().catch(() => "");
      return jsonResponse(
        {
          ok: false,
          wa_id: waId,
          messages: [],
          error: `failed to load messages | legacy(enova_log) status=${legacyResponse.status} body=${legacyText.slice(0, 300)}`,
        },
        500,
      );
    }

    const rows = (await legacyResponse.json()) as EnovaLogRow[];

    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (row.tag === "meta_minimal") {
          const inbound = normalizeText(row.meta_text);
          if (!inbound) continue;

          pushUnique({
            id: row.id !== undefined && row.id !== null ? String(row.id) : null,
            wa_id: row.wa_id ?? waId,
            direction: "in",
            text: inbound,
            source: "user",
            created_at: row.created_at ?? null,
          });
          continue;
        }

        if (row.tag === "DECISION_OUTPUT") {
          // ESSENCIAL pro envio manual aparecer (usa meta_text; fallback details)
          const outText = normalizeText(row.meta_text) ?? parseOutgoingText(row.details);
          if (!outText) continue;

          pushUnique({
            id: row.id !== undefined && row.id !== null ? String(row.id) : null,
            wa_id: row.wa_id ?? waId,
            direction: "out",
            text: outText,
            source: "DECISION_OUTPUT",
            created_at: row.created_at ?? null,
          });
          continue;
        }

        if (row.tag === "SEND_OK") {
          // SEND_OK costuma vir como ACK/telemetria; só renderiza se tiver texto válido
          const outText = parseOutgoingText(row.details) ?? normalizeText(row.meta_text);
          if (!outText) continue;

          pushUnique({
            id: row.id !== undefined && row.id !== null ? String(row.id) : null,
            wa_id: row.wa_id ?? waId,
            direction: "out",
            text: outText,
            source: "SEND_OK",
            created_at: row.created_at ?? null,
          });
          continue;
        }
      }
    }

    return jsonResponse({ ok: true, wa_id: waId, messages, error: null }, 200);
  } catch {
    return jsonResponse(
      { ok: false, wa_id: waId, messages: [], error: "internal error" },
      500,
    );
  }
}
