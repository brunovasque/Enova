import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

const adminKey = "telemetry-admin-key";
const waId = "5541991112222";

function buildEnv() {
  return {
    ENV_MODE: "test",
    ENOVA_ADMIN_KEY: adminKey,
    VERCEL_PROXY_URL: "https://proxy.example.com",
    SUPABASE_SERVICE_ROLE: "service-role",
    META_API_VERSION: "v20.0",
    PHONE_NUMBER_ID: "123456",
    WHATS_TOKEN: "token",
    META_VERIFY_TOKEN: "verify",
    __enovaSimulationCtx: {
      active: true,
      dryRun: true,
      suppressExternalSend: true,
      wouldSend: false,
      sendPreview: null,
      messageLog: [],
      writeLog: [],
      writesByWaId: {},
      stateByWaId: {
        [waId]: buildSimState("inicio")
      }
    }
  };
}

function buildSimState(stage, stOverrides = {}) {
  return {
    wa_id: waId,
    nome: "CLIENTE TELEMETRIA",
    fase_conversa: stage,
    updated_at: "2026-03-18T00:00:00.000Z",
    ...stOverrides
  };
}

async function simulateFromState(env, stage, text, stOverrides) {
  const req = new Request("https://enova.local/__admin__/simulate-from-state", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-enova-admin-key": adminKey
    },
    body: JSON.stringify({
      wa_id: waId,
      stage,
      text,
      dry_run: true,
      max_steps: 1,
      st_overrides: buildSimState(stage, stOverrides)
    })
  });
  const resp = await worker.fetch(req, env, { waitUntil() {} });
  assert.equal(resp.status, 200);
  const data = await resp.json();
  assert.equal(data.ok, true);
  return data;
}

async function captureCognitiveTelemetry(run) {
  const originalConsoleLog = console.log;
  const captured = [];

  console.log = (...args) => {
    for (const arg of args) {
      if (typeof arg !== "string" || !arg.includes("\"type\":\"cognitive_telemetry\"")) continue;
      try {
        captured.push(JSON.parse(arg));
      } catch {}
    }
    return originalConsoleLog(...args);
  };

  try {
    const result = await run();
    return { result, captured };
  } finally {
    console.log = originalConsoleLog;
  }
}

function createOpenAIMock() {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options = {}) => {
    if (String(url) !== "https://api.openai.com/v1/chat/completions") {
      return originalFetch(url, options);
    }

    const body = JSON.parse(options.body || "{}");
    const systemPrompt = body?.messages?.find((entry) => entry.role === "system")?.content || "";
    const payload = {
      choices: [
        {
          message: {
            content: JSON.stringify(
              systemPrompt.includes("Você é um roteador")
                ? {
                    label: "PRECO",
                    confidence: 0.91
                  }
                : {
                    reply_text: "Posso te orientar sobre isso, mas antes me confirma sua renda média mensal.",
                    intent: "duvida_imovel_pre_analise",
                    entities: {
                      renda: 2500
                    },
                    stage_signals: {
                      renda: "informada"
                    },
                    still_needs_original_answer: true,
                    answered_customer_question: true,
                    safe_stage_signal: "renda:informada",
                    suggested_stage: "renda",
                    confidence: 0.93,
                    reason: "cognitive_v1"
                  }
            )
          }
        }
      ]
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  return () => {
    globalThis.fetch = originalFetch;
  };
}

function findTelemetry(captured, point) {
  return captured.find((entry) => entry?.point === point) || null;
}

// 1) Fluxo normal: stage avança e advanced_stage=true.
{
  const env = buildEnv();
  const { result, captured } = await captureCognitiveTelemetry(() =>
    simulateFromState(env, "agendamento_visita", "2", {
      processo_enviado_correspondente: true,
      retorno_correspondente_status: "aprovado",
      visita_origem: "aprovado",
      visita_convite_status: "aceito",
      visita_agendamento_status: "horario",
      visita_data_escolhida: "2026-03-14",
      visita_primeiro_slot_disponivel_em: "2026-03-14T18:30:00.000Z"
    })
  );

  const finalLog = findTelemetry(captured, "before_return_response");
  assert.equal(result.stage_after, "visita_confirmada");
  assert.ok(finalLog, "must capture before_return_response telemetry");
  assert.equal(finalLog.stage, "agendamento_visita");
  assert.equal(finalLog.advanced_stage, true);
}

// 2) Fluxo offtrack: não avança e used_heuristic=true.
{
  const env = {
    ...buildEnv(),
    OPENAI_API_KEY_TEST: "test-openai-key"
  };
  const restoreFetch = createOpenAIMock();

  try {
    const { result, captured } = await captureCognitiveTelemetry(() =>
      simulateFromState(env, "visita_confirmada", "qual o valor da parcela?", {
        processo_enviado_correspondente: true,
        retorno_correspondente_status: "aprovado",
        visita_origem: "aprovado",
        visita_agendamento_status: "confirmada",
        visita_confirmada: true,
        visita_dia_hora: "sábado, 14/03 às 14:30",
        visita_slot_escolhido: "14:30",
        visita_data_escolhida: "2026-03-14"
      })
    );

    const decisionLog = findTelemetry(captured, "decision_heuristic_vs_llm");
    const finalLog = findTelemetry(captured, "before_return_response");
    assert.equal(result.stage_after, "visita_confirmada");
    assert.ok(decisionLog, "must capture heuristic decision telemetry");
    assert.equal(decisionLog.used_heuristic, true);
    assert.equal(decisionLog.offtrack_detected, true);
    assert.ok(finalLog, "must capture final offtrack telemetry");
    assert.equal(finalLog.advanced_stage, false);
  } finally {
    restoreFetch();
  }
}

// 3) Fluxo LLM: used_llm=true.
{
  const env = {
    ...buildEnv(),
    OPENAI_API_KEY_TEST: "test-openai-key"
  };
  const restoreFetch = createOpenAIMock();

  try {
    const { captured } = await captureCognitiveTelemetry(() =>
      simulateFromState(env, "renda", "Sou autônomo, ganho 2500, mas tenho receio de informar errado.", {
        estado_civil: "solteiro",
        regime: "autonomo"
      })
    );

    const decisionLog = findTelemetry(captured, "decision_heuristic_vs_llm");
    const assembledLog = findTelemetry(captured, "after_response_assembled");
    assert.ok(decisionLog, "must capture llm decision telemetry");
    assert.equal(decisionLog.used_llm, true);
    assert.equal(decisionLog.slot_detected, "renda");
    assert.ok(assembledLog, "must capture assembled telemetry");
  } finally {
    restoreFetch();
  }
}

console.log("cognitive_telemetry.smoke: ok");
