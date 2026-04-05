// ============================================================
// Enova IA — API Route: Chat com OpenAI
// panel/app/api/enova-ia-chat/route.ts
//
// PR G1 — OpenAI Assistido no Chat da ENOVA IA
// Escopo: PANEL-ONLY, server-side, read-only, sem schema novo.
//
// Responsável por:
//   - Receber mensagem + histórico + contexto do cliente
//   - Chamar OpenAI com system prompt + contexto + histórico
//   - Retornar resposta estruturada (EnovaIaOpenAIResponse)
//   - Retornar erro claro para fallback no cliente
//
// Segurança:
//   - OPENAI_API_KEY apenas server-side (nunca exposta ao browser)
//   - Read-only: nenhuma escrita em banco ou side effect
//   - Sem automação: resposta é apenas análise/sugestão
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  buildEnovaIaSystemPrompt,
  buildEnovaIaContext,
  ENOVA_IA_JSON_SCHEMA,
  type EnovaIaOpenAIResponse,
} from "../../lib/enova-ia-openai";
import type { LeituraGlobal } from "../../lib/enova-ia-leitura";
import type { FilaItem } from "../../lib/enova-ia-fila";
import type { ProgramaSugerido } from "../../lib/enova-ia-programas";

export const runtime = "nodejs";

type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

type RequestBody = {
  message: string;
  history: ChatHistoryItem[];
  context: {
    leituraGlobal: LeituraGlobal | null;
    filaInteligente: FilaItem[];
    programasSugeridos: ProgramaSugerido[];
  };
};

export async function POST(req: NextRequest) {
  // ── API Key guard (server-side only) ───────────────────────────────────
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "OPENAI_API_KEY não configurada" },
      { status: 503 },
    );
  }

  // ── Parse body ─────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo da requisição inválido" }, { status: 400 });
  }

  const { message, history = [], context } = body;

  if (!message?.trim()) {
    return NextResponse.json({ ok: false, error: "Mensagem vazia" }, { status: 400 });
  }

  // ── Montar contexto e system prompt ────────────────────────────────────
  const contextText = buildEnovaIaContext(
    context?.leituraGlobal ?? null,
    context?.filaInteligente ?? [],
    context?.programasSugeridos ?? [],
  );
  const systemContent = `${buildEnovaIaSystemPrompt()}\n\n${contextText}`;

  // ── Montar mensagens para o modelo ─────────────────────────────────────
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
    ...history.map((h) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    })),
    { role: "user", content: message },
  ];

  // ── Chamada OpenAI com Structured Outputs ──────────────────────────────
  const client = new OpenAI({ apiKey });

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      response_format: {
        type: "json_schema",
        json_schema: ENOVA_IA_JSON_SCHEMA,
      },
      temperature: 0.4,
      max_tokens: 2048,
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      return NextResponse.json(
        { ok: false, error: "Resposta vazia da OpenAI" },
        { status: 502 },
      );
    }

    const parsed: EnovaIaOpenAIResponse = JSON.parse(rawContent);
    return NextResponse.json({ ok: true, response: parsed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido na chamada OpenAI";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
