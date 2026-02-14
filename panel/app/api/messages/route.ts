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
  message_text?: string | null;
  text?: string | null;
  details: unknown;
  created_at: string | null;
};

type EnovaMessageRow = {
  id?: string | number | null;
  wa_id: string | null;
  direction: string | null;
  source: string | null;
  text?: string | null;
  message_text?: string | null;
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

function normalizeTextValue(row: { text?: string | null; message_text?: string | null; meta_text?: string | null }) {
  return row.text ?? row.message_text ?? row.meta_text ?? null;
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

    const candidate = record.reply ?? record.bot_text ?? record.answer ?? record.text ?? record.message_text ?? payloadText;

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
      { ok: false, wa_id: waId, messages: [], error: `missing env: ${missingEnvs.join(", ")}` },
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

    // 1) TENTA TABELA NOVA (enova_logs)
    const modernEndpoint = new URL("/rest/v1/enova_logs", supabaseUrl);
    modernEndpoint.searchParams.set("select", "id,wa_id,direction,source,text,message_text,created_at");
    modernEndpoint.searchParams.set("wa_id", `eq.${waId}`);
    modernEndpoint.searchParams.set("order", "created_at.asc");
    modernEndpoint.searchParams.set("limit", String(limit));

    const modernResponse = await fetch(modernEndpoint, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (modernResponse.ok) {
      const modernRows = (await modernResponse.json()) as EnovaMessageRow[];

      if (Array.isArray(modernRows)) {
        for (const row of modernRows) {
          const direction: "in" | "out" = row.direction === "out" ? "out" : "in";
          const text = normalizeText(normalizeTextValue(row));

          // evita "out" vazio virar "(sem texto)" na UI
          if (direction === "out" && !text) continue;

          pushUnique({
            id: row.id !== undefined && row.id !== null ? String(row.id) : null,
            wa_id: row.wa_id ?? waId,
            direction,
            text,
            source: row.source ?? null,
            created_at: row.created_at ?? null,
          });
        }
      }
    }

    // 2) FALLBACK LEGADO (enova_log)
    const legacyEndpoint = new URL("/rest/v1/enova_log", supabaseUrl);
    legacyEndpoint.searchParams.set(
      "select",
      "id,wa_id,tag,meta_type,meta_text,text,message_text,details,created_at",
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

    if (!legacyResponse.ok && messages.length === 0) {
      return jsonResponse(
        { ok: false, wa_id: waId, messages: [], error: "failed to load messages" },
        500,
      );
    }

    if (legacyResponse.ok) {
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
            // ESSENCIAL pro envio manual aparecer (usa meta_text)
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
            const outText =
              parseOutgoingText(row.details) ??
              normalizeText(normalizeTextValue(row));

            // evita cair em "(sem texto)"
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
    }

    return jsonResponse({ ok: true, wa_id: waId, messages, error: null }, 200);
  } catch {
    return jsonResponse({ ok: false, wa_id: waId, messages: [], error: "internal error" }, 500);
  }
}
