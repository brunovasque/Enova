import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

function buildEnv() {
  return {
    ENV_MODE: "test",
    ENOVA_ADMIN_KEY: "adm-key",
    VERCEL_PROXY_URL: "https://proxy.example.com",
    SUPABASE_SERVICE_ROLE: "service-role",
    META_API_VERSION: "v20.0",
    PHONE_NUMBER_ID: "123456",
    WHATS_TOKEN: "token",
    META_VERIFY_TOKEN: "verify"
  };
}

const fixtureIds = ["autonomo_sem_ir", "casado_civil", "resposta_ambigua"];

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
  assert.equal(data?.response?.should_advance_stage, false);
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
  assert.equal(data?.response?.slots_detected?.estado_civil?.value, "solteiro");
  assert.equal(data?.response?.slots_detected?.regime_trabalho?.value, "autonomo");
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
  assert.ok(data.fixtures.length >= 10);
}

console.log("cognitive_read_only_admin.smoke: ok");
