import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

const adminKey = "smoke-admin-key";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function buildMissingColumnResponse(column) {
  return jsonResponse({
    message: `Could not find the '${column}' column of 'enova_state' in the schema cache`
  }, 400);
}

function buildEnv() {
  return {
    ENV_MODE: "test",
    OFFTRACK_AI_ENABLED: "false",
    ENOVA_ADMIN_KEY: adminKey,
    VERCEL_PROXY_URL: "https://proxy.example.com",
    SUPABASE_SERVICE_ROLE: "service-role",
    META_API_VERSION: "v20.0",
    PHONE_NUMBER_ID: "123456",
    WHATS_TOKEN: "token",
    META_VERIFY_TOKEN: "verify"
  };
}

function buildSupabaseHarness() {
  const stateByWaId = {};
  const calls = [];
  const originalFetch = globalThis.fetch;

  async function fetchImpl(input, init = {}) {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "proxy.example.com") {
      return originalFetch(input, init);
    }

    const path = url.searchParams.get("path");
    const method = String(init.method || "GET").toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, method, body });

    if (path === "/rest/v1/enova_state" && method === "GET") {
      const waEq = String(url.searchParams.get("wa_id") || "");
      const waId = waEq.startsWith("eq.") ? decodeURIComponent(waEq.slice(3)) : "";
      return jsonResponse(stateByWaId[waId] ? [stateByWaId[waId]] : []);
    }

    if (path === "/rest/v1/enova_state" && method === "PATCH") {
      if (Object.prototype.hasOwnProperty.call(body || {}, "autonomo_ir")) {
        return buildMissingColumnResponse("autonomo_ir");
      }
      const waEq = String(url.searchParams.get("wa_id") || "");
      const waId = waEq.startsWith("eq.") ? decodeURIComponent(waEq.slice(3)) : "";
      const current = stateByWaId[waId] || { wa_id: waId };
      stateByWaId[waId] = { ...current, ...(body || {}), wa_id: waId };
      return jsonResponse([stateByWaId[waId]]);
    }

    if (path === "/rest/v1/enova_state" && method === "POST") {
      const row = Array.isArray(body) ? (body[0] || {}) : (body || {});
      if (Object.prototype.hasOwnProperty.call(row, "autonomo_ir")) {
        return buildMissingColumnResponse("autonomo_ir");
      }
      const waId = String(row.wa_id || "");
      stateByWaId[waId] = { ...row };
      return jsonResponse([stateByWaId[waId]], 201);
    }

    return jsonResponse({ ok: true });
  }

  return { calls, stateByWaId, fetchImpl };
}

async function simulateFromState(env, waId, stage, text, stOverrides = {}, dryRun = false) {
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
      dry_run: dryRun,
      max_steps: 1,
      st_overrides: stOverrides
    })
  });

  const resp = await worker.fetch(req, env, { waitUntil() {} });
  const data = await resp.json();
  assert.equal(resp.status, 200, JSON.stringify(data, null, 2));
  assert.equal(data.ok, true, JSON.stringify(data, null, 2));
  assert.equal(data.telemetry, null);
  return data;
}

async function runAutonomoPath(irAnswerEarly) {
  const env = buildEnv();
  const harness = buildSupabaseHarness();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = harness.fetchImpl;
  try {
    const waId = irAnswerEarly === "sim" ? "5541999400001" : "5541999400002";

    const viaRegime = await simulateFromState(env, waId, "regime_trabalho", "autônomo");
    assert.equal(viaRegime.stage_after, "autonomo_ir_pergunta");

    const perguntaProfissao = await simulateFromState(env, waId, "autonomo_ir_pergunta", irAnswerEarly);
    assert.equal(perguntaProfissao.stage_after, "autonomo_ir_pergunta");
    assert.match(perguntaProfissao.reply_text, /profiss[aã]o|atividade principal/i);
    assert.equal(perguntaProfissao.writes.ir_declarado, irAnswerEarly === "sim");

    const salvaProfissao = await simulateFromState(env, waId, "autonomo_ir_pergunta", "motorista de app");
    assert.equal(salvaProfissao.stage_after, "autonomo_ir_pergunta");
    assert.match(salvaProfissao.reply_text, /pessoa f[ií]sica|mei|pj/i);

    const salvaMei = await simulateFromState(env, waId, "autonomo_ir_pergunta", "mei");
    assert.equal(salvaMei.stage_after, "autonomo_ir_pergunta");
    assert.match(salvaMei.reply_text, /renda costuma ser mais est[aá]vel|varia bastante/i);

    const resolveIr = await simulateFromState(env, waId, "autonomo_ir_pergunta", "varia bastante");
    assert.equal(Object.prototype.hasOwnProperty.call(resolveIr.writes || {}, "autonomo_ir"), false);

    const state = harness.stateByWaId[waId];
    assert.equal(state?.controle?.etapa1_informativos?.titular_autonomo_profissao_atividade, "motorista de app");
    assert.equal(state?.controle?.etapa1_informativos?.titular_autonomo_mei_pj_status, "mei");
    assert.equal(state?.controle?.etapa1_informativos?.titular_autonomo_renda_estabilidade, "variavel");
    assert.equal(state?.ir_declarado, irAnswerEarly === "sim");

    const enovaStateWrites = harness.calls.filter((call) => call.path === "/rest/v1/enova_state" && (call.method === "PATCH" || call.method === "POST"));
    assert.equal(enovaStateWrites.some((call) => Object.prototype.hasOwnProperty.call(call.body || {}, "autonomo_ir")), false);

    return { resolveIr, state };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const { resolveIr } = await runAutonomoPath("sim");
  assert.equal(resolveIr.stage_after, "renda");
  assert.match(resolveIr.reply_text, /renda mensal m[eé]dia/i);
  assert.doesNotMatch(resolveIr.reply_text, /imposto de renda/i);
}

{
  const { resolveIr } = await runAutonomoPath("não");
  assert.equal(resolveIr.stage_after, "autonomo_sem_ir_ir_este_ano");
  assert.match(resolveIr.reply_text, /pretende declarar IR este ano/i);
  assert.doesNotMatch(resolveIr.reply_text, /você declara imposto de renda/i);
}

console.log("autonomo_ir_persistence.smoke: ok");
