import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const openaiMockModule = await import(new URL("./cognitive_openai_mock.mjs", import.meta.url).href);
const worker = workerModule.default;
const { createMockOpenAIFetch } = openaiMockModule;

function assertCleanPortugueseText(value, label) {
  const text = String(value || "");
  assert.equal(text, text.normalize("NFC"), `${label} must keep NFC-composed accents`);
  assert.doesNotMatch(text, /Ã[¡-ÿ]|Â[^\sa-zA-Z0-9]|�/, `${label} must not contain mojibake or replacement chars`);
}

function buildEnv() {
  return {
    ENV_MODE: "test",
    ENOVA_ADMIN_KEY: "adm-key",
    OPENAI_API_KEY_PROD: "test-openai-key",
    COGNITIVE_AI_MODEL: "gpt-4.1-mini",
    __COGNITIVE_OPENAI_FETCH: createMockOpenAIFetch(),
    VERCEL_PROXY_URL: "https://proxy.example.com",
    SUPABASE_SERVICE_ROLE: "service-role",
    META_API_VERSION: "v20.0",
    PHONE_NUMBER_ID: "123456",
    WHATS_TOKEN: "token",
    META_VERIFY_TOKEN: "verify"
  };
}

const fixtureIds = [
  "autonomo_sem_ir",
  "casado_civil",
  "composicao_familiar",
  "fora_fluxo_duvida",
  "resposta_ambigua",
  "docs_clt_objecao_duvida",
  "docs_autonomo_site_depois",
  "correspondente_sem_retorno_ansioso",
  "correspondente_aprovado_insiste_detalhes",
  "visita_remarcar_sem_promessa",
  "visita_resistencia_por_que"
];

for (const fixtureId of fixtureIds) {
  const env = buildEnv();
  const req = new Request("https://worker.local/__admin__/cognitive-test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-enova-admin-key": "adm-key"
    },
    body: JSON.stringify({ fixture_id: fixtureId })
  });

  const res = await worker.fetch(req, env, {});
  const data = await res.json();

  assert.equal(res.status, 200, `unexpected status for ${fixtureId}`);
  assert.equal(data?.ok, true, `engine failed for ${fixtureId}`);
  assert.equal(data?.fixture_id, fixtureId);
  assert.equal(data?.engine?.llm_attempted, true, `admin route must attempt openai for ${fixtureId}`);
  assert.equal(data?.engine?.llm_used, true, `admin route must exercise openai path for ${fixtureId}`);
  assert.equal(data?.engine?.llm_error, null, `admin route must not expose llm error for ${fixtureId}`);
  assert.equal(data?.engine?.fallback_used, false, `admin route must not fallback for ${fixtureId}`);
  assert.equal(typeof data?.llm_raw_response, "string", `admin route must expose llm_raw_response for ${fixtureId}`);
  assert.ok(data?.llm_raw_response?.trim(), `admin route llm_raw_response must not be empty for ${fixtureId}`);
  assert.ok(data?.llm_parsed_response && typeof data?.llm_parsed_response === "object", `admin route must expose llm_parsed_response for ${fixtureId}`);
  assert.equal(data?.response?.should_advance_stage, false);
  assert.notEqual(String(data?.response?.reply_text || "").trim(), "", `${fixtureId} reply_text must not be empty`);
  assertCleanPortugueseText(data?.response?.reply_text, `${fixtureId} admin reply_text`);
  if (["autonomo_sem_ir", "casado_civil", "composicao_familiar"].includes(fixtureId)) {
    assert.ok(Object.keys(data?.response?.slots_detected || {}).length > 0, `${fixtureId} slots_detected must not be empty`);
  }
  const replyNormalized = String(data?.response?.reply_text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (fixtureId === "docs_clt_objecao_duvida") {
    assert.match(replyNormalized, /pelo seu perfil/);
    assert.match(replyNormalized, /holerite/);
  }
  if (fixtureId === "docs_autonomo_site_depois") {
    assert.match(replyNormalized, /extratos bancarios recentes/);
    assert.match(replyNormalized, /nao confirmado/);
  }
  if (fixtureId === "correspondente_aprovado_insiste_detalhes") {
    assert.match(replyNormalized, /nao tenho acesso ao sistema de aprovacao/);
    assert.match(replyNormalized, /corretor vasques no plantao/);
    assert.doesNotMatch(replyNormalized, /r\$\s*\d|valor aprovado de|credito liberado de|taxa de juros de/);
  }
  if (fixtureId === "visita_resistencia_por_que") {
    assert.match(replyNormalized, /sem criar expectativa errada/);
    assert.match(replyNormalized, /agenda oficial do plantao/);
  }
  assert.equal(data?.side_effect_audit?.official_write_count, 0);
  assert.equal(data?.side_effect_audit?.would_send_meta, false);
  assert.equal(data?.side_effect_audit?.send_preview, null);
}

{
  const env = buildEnv();
  const req = new Request("https://worker.local/__admin__/cognitive-test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-enova-admin-key": "adm-key"
    },
    body: JSON.stringify({
      request: {
        conversation_id: "direct-001",
        current_stage: "renda",
        message_text: "Sou solteiro, autônomo, ganho 3200 e não declaro IR.",
        pending_slots: ["estado_civil", "regime_trabalho", "renda", "ir_declarado"]
      }
    })
  });

  const res = await worker.fetch(req, env, {});
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data?.ok, true);
  assert.equal(data?.engine?.llm_attempted, true);
  assert.equal(data?.engine?.llm_used, true);
  assert.equal(data?.engine?.llm_error, null);
  assert.equal(data?.engine?.fallback_used, false);
  assert.equal(typeof data?.llm_raw_response, "string");
  assert.ok(data?.llm_raw_response?.trim());
  assert.ok(data?.llm_parsed_response && typeof data?.llm_parsed_response === "object");
  assert.equal(data?.response?.slots_detected?.estado_civil?.value, "solteiro");
  assert.equal(data?.response?.slots_detected?.regime_trabalho?.value, "autonomo");
  assert.equal(data?.response?.slots_detected?.renda?.value, 3200);
  assert.equal(data?.response?.slots_detected?.ir_declarado?.value, "nao");
  assert.equal(data?.side_effect_audit?.official_write_count, 0);
  assert.equal(data?.side_effect_audit?.would_send_meta, false);
}

{
  const env = buildEnv();
  const req = new Request("https://worker.local/__admin__/cognitive-test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-enova-admin-key": "adm-key"
    },
    body: JSON.stringify({ list_fixtures: true })
  });

  const res = await worker.fetch(req, env, {});
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data?.ok, true);
  assert.ok(Array.isArray(data?.fixtures));
  assert.ok(data.fixtures.length >= 16);
}

console.log("cognitive_read_only_admin.smoke: ok");
