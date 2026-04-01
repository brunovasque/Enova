/**
 * Smoke tests — parseEstadoCivil hotfix
 * Branch: copilot/hotfix-parse-estado-civil
 *
 * Verifica os 11 casos identificados como falhos ou limítrofes no smoke
 * executado em TEST após o merge do PR #419.
 *
 * Casos cobertos:
 *  [OK] "moro junto"                          => estado_civil (fallback)
 *  [OK] "moramos juntos"                      => estado_civil (fallback)
 *  [FIX] "moro junto mas não sou casado"      => estado_civil (NÃO confirmar_casamento)
 *  [OK] "moro junto mas não é união estável"  => estado_civil (fallback)
 *  [OK] "moramos juntos mas vou comprar sozinho" => somar_renda_solteiro
 *  [OK] "sou casado no civil"                 => confirmar_casamento
 *  [FIX] "sou união estável"                  => financiamento_conjunto (NÃO estado_civil)
 *  [OK] "moro com ela"                        => estado_civil (fallback)
 *  [OK] "tenho namorada"                      => estado_civil (fallback)
 *  [OK] "tenho situação estável"              => estado_civil (fallback — "estável" isolado ≠ união)
 *  [OK] "trabalho na união sindical"          => estado_civil (fallback — "união" isolada ≠ união estável)
 */

import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

const adminKey = "hotfix-parse-estado-civil-key";
const waId = "5541993334444";

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
        [waId]: {
          wa_id: waId,
          nome: "JOAO TESTE",
          fase_conversa: "estado_civil",
          updated_at: "2026-04-01T00:00:00.000Z"
        }
      }
    }
  };
}

async function simulateFromState(stage, text) {
  const env = buildEnv();
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
      st_overrides: {
        wa_id: waId,
        nome: "JOAO TESTE",
        fase_conversa: stage
      }
    })
  });
  const resp = await worker.fetch(req, env, { waitUntil() {} });
  assert.equal(resp.status, 200, `HTTP status for "${text}"`);
  const data = await resp.json();
  assert.equal(data.ok, true, `data.ok for "${text}"`);
  return data;
}

// ─── 1. "moro junto" => estado_civil (fallback) ─────────────────────────────
{
  const r = await simulateFromState("estado_civil", "moro junto");
  assert.equal(r.stage_after, "estado_civil", "moro junto deve permanecer em estado_civil");
}

// ─── 2. "moramos juntos" => estado_civil (fallback) ──────────────────────────
{
  const r = await simulateFromState("estado_civil", "moramos juntos");
  assert.equal(r.stage_after, "estado_civil", "moramos juntos deve permanecer em estado_civil");
}

// ─── 3. [FIX] "moro junto mas não sou casado" => estado_civil ────────────────
// Negação "não sou casado" NÃO deve acionar confirmar_casamento
{
  const r = await simulateFromState("estado_civil", "moro junto mas não sou casado");
  assert.equal(r.stage_after, "estado_civil",
    "moro junto mas não sou casado: negação guard deve bloquear confirmar_casamento");
}

// ─── 4. "moro junto mas não é união estável" => estado_civil ─────────────────
{
  const r = await simulateFromState("estado_civil", "moro junto mas não é união estável");
  assert.equal(r.stage_after, "estado_civil",
    "moro junto mas não é união estável deve permanecer em estado_civil");
}

// ─── 5. "moramos juntos mas vou comprar sozinho" => somar_renda_solteiro ─────
{
  const r = await simulateFromState("estado_civil", "moramos juntos mas vou comprar sozinho");
  assert.equal(r.stage_after, "somar_renda_solteiro",
    "moramos juntos mas vou comprar sozinho deve ir para somar_renda_solteiro");
}

// ─── 6. "sou casado no civil" => confirmar_casamento ─────────────────────────
{
  const r = await simulateFromState("estado_civil", "sou casado no civil");
  assert.equal(r.stage_after, "confirmar_casamento",
    "sou casado no civil deve ir para confirmar_casamento");
}

// ─── 7. [FIX] "sou união estável" => financiamento_conjunto ──────────────────
// "sou união estável" é um sinal válido — deve avançar para financiamento_conjunto
{
  const r = await simulateFromState("estado_civil", "sou união estável");
  assert.equal(r.stage_after, "financiamento_conjunto",
    "sou união estável deve avançar para financiamento_conjunto");
}

// ─── 8. "moro com ela" => estado_civil (fallback) ────────────────────────────
{
  const r = await simulateFromState("estado_civil", "moro com ela");
  assert.equal(r.stage_after, "estado_civil",
    "moro com ela deve permanecer em estado_civil (coabitação ≠ estado civil)");
}

// ─── 9. "tenho namorada" => estado_civil (fallback) ──────────────────────────
{
  const r = await simulateFromState("estado_civil", "tenho namorada");
  assert.equal(r.stage_after, "estado_civil",
    "tenho namorada deve permanecer em estado_civil");
}

// ─── 10. "tenho situação estável" => estado_civil (fallback) ─────────────────
// "estável" isolado NÃO deve ser confundido com "união estável"
{
  const r = await simulateFromState("estado_civil", "tenho situação estável");
  assert.equal(r.stage_after, "estado_civil",
    "tenho situação estável: 'estável' isolado não deve acionar uniao_estavel");
}

// ─── 11. "trabalho na união sindical" => estado_civil (fallback) ──────────────
// "união" isolada NÃO deve ser confundida com "união estável"
{
  const r = await simulateFromState("estado_civil", "trabalho na união sindical");
  assert.equal(r.stage_after, "estado_civil",
    "trabalho na união sindical: 'união' isolada não deve acionar uniao_estavel");
}

console.log("✅ parse_estado_civil_hotfix.smoke.mjs: 11/11 passed");
