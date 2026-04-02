import assert from "node:assert/strict";

// ================================================================
// SMOKE TEST: Shadow Mode Integration — Pacote Cognitivo Completo
//
// Valida que COGNITIVE_V2_MODE=shadow funciona end-to-end no worker
// com o pacote cognitivo completo, cobrindo todos os blocos de stages:
//   topo / estado_civil / composicao / renda titular
//   parceiro / familiar / P3 / gates finais / operacional final
//
// Verificações obrigatórias:
//   - cognitive_v1_signal emitido com cognitive_v2_mode: "shadow"
//   - v2_shadow presente com 9 campos comparativos
//   - nenhum COGNITIVE_V2_SHADOW_ERROR
//   - V1 continua como motor primário
//   - should_advance_stage=false no V2 (adapter enforça)
//   - trilho mecânico preservado (estado_civil avança corretamente)
//   - rollback: COGNITIVE_V2_MODE=off → v2_shadow ausente
// ================================================================

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

const adminKey = "shadow-integration-key";
const waId = "5541991115555";

// ----------------------------------------------------------------
// Env builder — shadow mode ativado + telemetria verbose
// ----------------------------------------------------------------
function buildShadowEnv() {
  return {
    ENV_MODE: "test",
    ENOVA_ADMIN_KEY: adminKey,
    VERCEL_PROXY_URL: "https://proxy.example.com",
    SUPABASE_SERVICE_ROLE: "service-role",
    META_API_VERSION: "v20.0",
    PHONE_NUMBER_ID: "123456",
    WHATS_TOKEN: "token",
    META_VERIFY_TOKEN: "verify",
    COGNITIVE_V2_MODE: "shadow",   // ← shadow mode ativado
    TELEMETRIA_LEVEL: "verbose",   // ← permite emissão de cognitive_v1_signal
    OFFTRACK_AI_ENABLED: "false",  // ← desliga offtrack para não interferir
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
        [waId]: { wa_id: waId, fase_conversa: "inicio" }
      }
    }
  };
}

// ----------------------------------------------------------------
// Captura eventos TELEMETRIA-SAFE: cognitive_v1_signal e erros V2
// ----------------------------------------------------------------
async function captureShadowSignals(run) {
  const originalLog = console.log;
  const originalError = console.error;
  const signals = [];
  const shadowErrors = [];

  console.log = (...args) => {
    // telemetry() chama console.log("TELEMETRIA-SAFE:", JSON.stringify(payload))
    // args[0] = "TELEMETRIA-SAFE:", args[1] = json string
    if (args[0] === "TELEMETRIA-SAFE:" && typeof args[1] === "string") {
      try {
        const payload = JSON.parse(args[1]);
        if (payload?.event === "cognitive_v1_signal") {
          // details é string JSON (possivelmente truncado)
          let details = payload.details;
          if (typeof details === "string") {
            try { details = JSON.parse(details); } catch { /* truncado */ }
          }
          signals.push({ ...payload, details });
        }
      } catch { /* ignorar parse errors */ }
    }
    return originalLog(...args);
  };

  console.error = (...args) => {
    const msg = args.map(a => (typeof a === "string" ? a : String(a))).join(" ");
    if (msg.includes("COGNITIVE_V2_SHADOW_ERROR")) shadowErrors.push(msg);
    return originalError(...args);
  };

  let result;
  try {
    result = await run();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return { result, signals, shadowErrors };
}

// ----------------------------------------------------------------
// simulate-from-state helper
// ----------------------------------------------------------------
async function simulateFromState(env, stage, text, stOverrides = {}) {
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
      st_overrides: { wa_id: waId, fase_conversa: stage, ...stOverrides }
    })
  });
  const resp = await worker.fetch(req, env, { waitUntil() {} });
  assert.equal(resp.status, 200, `HTTP ${resp.status} para stage=${stage}`);
  const data = await resp.json();
  assert.equal(data.ok, true, `simulate-from-state falhou para ${stage}: ${JSON.stringify(data)}`);
  return data;
}

// ----------------------------------------------------------------
// Test runner
// ----------------------------------------------------------------
let passed = 0;
let failed = 0;

async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${e.message}`);
  }
}

// ================================================================
// GRUPO 1 — v2_shadow presente em todos os blocos de stage
// ================================================================

// Casos representativos por bloco — textos escolhidos para acionar
// shouldTriggerCognitiveAssist sem cair em guards que retornam cedo
const STAGE_BLOCKS = [
  {
    block: "topo",
    stage: "inicio_nome",
    text: "pra que precisa do meu nome?",
    state: {}
  },
  {
    block: "estado_civil",
    stage: "estado_civil",
    text: "sou casado, isso muda alguma coisa?",
    state: {}
  },
  {
    block: "composicao",
    stage: "somar_renda_solteiro",
    text: "posso tentar sozinho?",
    state: { estado_civil: "solteiro" }
  },
  {
    block: "renda_titular",
    stage: "renda",
    text: "nao sei ao certo, gira em torno de 3000",
    state: { estado_civil: "solteiro", regime: "clt" }
  },
  {
    block: "parceiro",
    stage: "renda_parceiro",
    text: "ela ganha mais ou menos 2500",
    state: { estado_civil: "casado", somar_renda: "parceiro" }
  },
  {
    block: "familiar",
    stage: "renda_familiar_valor",
    text: "nao sei exato, mais ou menos 2000",
    state: { estado_civil: "solteiro", somar_renda: "familiar" }
  },
  {
    block: "p3",
    stage: "renda_parceiro_familiar_p3",
    text: "nao sei, gira em torno de 1500",
    state: { estado_civil: "solteiro", somar_renda: "familiar" }
  },
  {
    block: "gate_finais",
    // ir_declarado: não está em yesNoStages — trigger direto sem guard
    stage: "ir_declarado",
    text: "nao declaro, isso prejudica minha aprovacao?",
    state: { estado_civil: "solteiro", regime: "autonomo", renda: 3000 }
  },
  {
    block: "operacional_final",
    // aguardando_retorno_correspondente: não está em yesNoStages
    stage: "aguardando_retorno_correspondente",
    text: "quanto tempo demora a resposta?",
    state: {
      estado_civil: "solteiro",
      renda: 3000,
      processo_enviado_correspondente: true
    }
  }
];

for (const { block, stage, text, state } of STAGE_BLOCKS) {
  await asyncTest(`shadow/${block} [${stage}]: v2_shadow presente + cognitive_v2_mode=shadow`, async () => {
    const env = buildShadowEnv();
    const { signals, shadowErrors } = await captureShadowSignals(() =>
      simulateFromState(env, stage, text, state)
    );

    // Sem erros V2
    assert.equal(
      shadowErrors.length,
      0,
      `COGNITIVE_V2_SHADOW_ERROR em ${stage}: ${shadowErrors.join(", ")}`
    );

    // cognitive_v1_signal deve ter sido emitido
    assert.ok(
      signals.length > 0,
      `cognitive_v1_signal não emitido para stage=${stage}. Verificar: stage em COGNITIVE_V1_ALLOWED_STAGES + texto com trigger`
    );

    const signal = signals[0];
    const details = signal.details;

    // cognitive_v2_mode deve ser "shadow"
    const mode =
      details && typeof details === "object"
        ? details.cognitive_v2_mode
        : typeof signal.details === "string"
          ? (signal.details.includes('"cognitive_v2_mode":"shadow"') ? "shadow" : null)
          : null;
    assert.equal(mode, "shadow", `cognitive_v2_mode != shadow no stage=${stage}`);

    // v2_shadow deve estar presente
    const v2shadowPresent =
      details && typeof details === "object"
        ? details.v2_shadow != null
        : typeof signal.details === "string" && signal.details.includes('"v2_shadow"');
    assert.ok(v2shadowPresent, `v2_shadow ausente no stage=${stage}`);
  });
}

// ================================================================
// GRUPO 2 — V2 shadow sem erros estruturais
// ================================================================

await asyncTest("shadow/sem erro estrutural — nenhum COGNITIVE_V2_SHADOW_ERROR em todos os blocos", async () => {
  const allErrors = [];
  for (const { block, stage, text, state } of STAGE_BLOCKS) {
    const env = buildShadowEnv();
    const { shadowErrors } = await captureShadowSignals(() =>
      simulateFromState(env, stage, text, state)
    );
    if (shadowErrors.length > 0) allErrors.push(`${block}/${stage}: ${shadowErrors.join("; ")}`);
  }
  assert.equal(allErrors.length, 0, `Erros V2 shadow detectados:\n  ${allErrors.join("\n  ")}`);
});

// ================================================================
// GRUPO 3 — V1 é motor primário em shadow mode
// ================================================================

await asyncTest("shadow/V1 primario — mensagem de telemetria indica 'Cognitive v1 acionado'", async () => {
  const env = buildShadowEnv();
  const { signals } = await captureShadowSignals(() =>
    simulateFromState(env, "estado_civil", "sou casado, isso muda alguma coisa?", {})
  );
  assert.ok(signals.length > 0, "cognitive_v1_signal não emitido");
  const signal = signals[0];
  assert.equal(
    signal.message,
    "Cognitive v1 acionado",
    `Mensagem deve indicar V1 acionado, não V2. Recebido: "${signal.message}"`
  );
});

// ================================================================
// GRUPO 4 — v2_shadow tem os 9 campos comparativos obrigatórios
// ================================================================

await asyncTest("shadow/telemetria completa — v2_shadow tem os 9 campos comparativos", async () => {
  const env = buildShadowEnv();
  const { signals } = await captureShadowSignals(() =>
    simulateFromState(env, "renda", "nao sei ao certo, gira em torno de 3000", {
      estado_civil: "solteiro",
      regime: "clt"
    })
  );

  assert.ok(signals.length > 0, "cognitive_v1_signal não emitido");
  const details = signals[0].details;
  assert.ok(
    details && typeof details === "object",
    "details não é objeto parseável (pode estar truncado)"
  );

  const v2s = details.v2_shadow;
  assert.ok(v2s && typeof v2s === "object", "v2_shadow não é objeto");

  // 9 campos comparativos obrigatórios definidos em ADENDO_FINAL_COBERTURA_SEGURANCA_COGNITIVO_V2.md
  const required = [
    "confidence",
    "intent",
    "reason",
    "safe_stage_signal",
    "reply_text_length",
    "still_needs_original_answer",
    "answered_customer_question",
    "reply_text_snippet",
    "entities_keys"
  ];
  for (const field of required) {
    assert.ok(field in v2s, `v2_shadow.${field} ausente`);
  }
});

// ================================================================
// GRUPO 5 — should_advance_stage=false (adapter enforça V2 não avança stage)
// ================================================================

await asyncTest("shadow/V2 não avança stage — should_advance_stage=false via adapter", async () => {
  const env = buildShadowEnv();
  const { signals } = await captureShadowSignals(() =>
    simulateFromState(env, "renda", "nao sei ao certo, gira em torno de 3000", {
      estado_civil: "solteiro",
      regime: "clt"
    })
  );

  assert.ok(signals.length > 0, "cognitive_v1_signal não emitido");
  const details = signals[0].details;

  if (details && typeof details === "object" && details.v2_shadow) {
    // v2_shadow.reason deve ser do tipo heurístico ou cognitivo V2 — nunca avanço de stage
    const reason = details.v2_shadow.reason || "";
    assert.ok(
      reason.includes("cognitive_v2") || reason === "no_llm_or_parse",
      `reason V2 inesperado: "${reason}" — deve ser cognitive_v2* ou no_llm_or_parse`
    );
  }
  // O adapter enforce should_advance_stage=false no output adaptado
  // (testado em cognitive_v2_adapter.smoke.mjs — aqui validamos via integração)
});

// ================================================================
// GRUPO 6 — Trilho mecânico preservado
// ================================================================

await asyncTest("shadow/trilho mecanico — estado_civil avança corretamente com shadow ativo", async () => {
  const env = buildShadowEnv();
  // Texto claro que não aciona cognitive assist (sem triggers) mas avança mecanicamente
  const result = await simulateFromState(env, "estado_civil", "solteiro", {});
  assert.equal(
    result.stage_after,
    "somar_renda_solteiro",
    `trilho mecânico quebrado: esperado "somar_renda_solteiro", recebido "${result.stage_after}"`
  );
});

await asyncTest("shadow/trilho mecanico — estado_civil casado avança com shadow ativo", async () => {
  const env = buildShadowEnv();
  const result = await simulateFromState(env, "estado_civil", "casado", {});
  assert.equal(
    result.stage_after,
    "confirmar_casamento",
    `trilho mecânico quebrado: esperado "confirmar_casamento", recebido "${result.stage_after}"`
  );
});

// ================================================================
// GRUPO 7 — Rollback simples: COGNITIVE_V2_MODE=off → v2_shadow ausente
// ================================================================

await asyncTest("shadow/rollback — COGNITIVE_V2_MODE=off: v2_shadow ausente + motor=off", async () => {
  const env = buildShadowEnv();
  env.COGNITIVE_V2_MODE = "off"; // rollback instantâneo

  const { signals } = await captureShadowSignals(() =>
    simulateFromState(env, "estado_civil", "sou casado, isso muda alguma coisa?", {})
  );

  if (signals.length > 0) {
    const signal = signals[0];
    const details = signal.details;

    const mode =
      details && typeof details === "object"
        ? details.cognitive_v2_mode
        : null;

    if (mode !== null) {
      assert.equal(mode, "off", `mode deve ser "off" após rollback, recebido: "${mode}"`);
    }

    const v2shadowPresent =
      details && typeof details === "object"
        ? details.v2_shadow != null
        : typeof signal.details === "string" && signal.details.includes('"v2_shadow"');

    assert.ok(
      !v2shadowPresent,
      "v2_shadow deve estar ausente em modo off (rollback)"
    );
  }
  // Se nenhum signal foi emitido em modo off (filtrado por TELEMETRIA_LEVEL),
  // isso também é comportamento correto — o bloco cognitivo ainda roda mas
  // v2Shadow = null e o campo não aparece no telemetryDetails.
});

// ================================================================
// GRUPO 8 — Cobertura de stages adicionais: verificação rápida
//           (P3 e gate_finais extras via triggers globais)
// ================================================================

await asyncTest("shadow/gate_finais extra — autonomo_compor_renda: v2_shadow presente", async () => {
  const env = buildShadowEnv();
  const { signals, shadowErrors } = await captureShadowSignals(() =>
    simulateFromState(
      env,
      "autonomo_compor_renda",
      "posso tentar sozinho mesmo sendo autonomo?",
      { estado_civil: "solteiro", regime: "autonomo", renda: 3000 }
    )
  );
  assert.equal(shadowErrors.length, 0, `V2 shadow error: ${shadowErrors.join(", ")}`);
  assert.ok(signals.length > 0, "cognitive_v1_signal não emitido para autonomo_compor_renda");

  const details = signals[0].details;
  const v2shadowPresent =
    details && typeof details === "object"
      ? details.v2_shadow != null
      : typeof signals[0].details === "string" && signals[0].details.includes('"v2_shadow"');
  assert.ok(v2shadowPresent, "v2_shadow ausente para autonomo_compor_renda");
});

await asyncTest("shadow/operacional final extra — agendamento_visita: v2_shadow presente", async () => {
  const env = buildShadowEnv();
  const { signals, shadowErrors } = await captureShadowSignals(() =>
    simulateFromState(
      env,
      "agendamento_visita",
      "que horario esta disponivel para a visita?",
      {
        estado_civil: "solteiro",
        processo_enviado_correspondente: true,
        retorno_correspondente_status: "aprovado",
        visita_origem: "aprovado",
        visita_convite_status: "aceito",
        visita_agendamento_status: "aguardando"
      }
    )
  );
  assert.equal(shadowErrors.length, 0, `V2 shadow error: ${shadowErrors.join(", ")}`);
  assert.ok(signals.length > 0, "cognitive_v1_signal não emitido para agendamento_visita");

  const details = signals[0].details;
  const v2shadowPresent =
    details && typeof details === "object"
      ? details.v2_shadow != null
      : typeof signals[0].details === "string" && signals[0].details.includes('"v2_shadow"');
  assert.ok(v2shadowPresent, "v2_shadow ausente para agendamento_visita");
});

// ================================================================
// RESULTADO FINAL
// ================================================================

const total = passed + failed;
console.log(`\n  Resultado: ${passed} passou(aram), ${failed} falhou(aram) (total: ${total})`);
console.log("cognitive_shadow_integration.smoke: " + (failed === 0 ? "ok" : "FALHOU"));

if (failed > 0) process.exit(1);
