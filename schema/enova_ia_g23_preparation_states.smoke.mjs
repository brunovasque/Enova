// ============================================================
// Smoke tests — enova-ia-preparation (G2.3)
//
// Valida a máquina de estados canônica de preparação da ação assistida.
// Executa o módulo REAL de panel/app/lib/enova-ia-preparation.ts.
// Requer: node --experimental-strip-types (Node v22.6+)
//
// Cobre:
//   1. Exportações esperadas existem
//   2. Todos os 4 estados canônicos definidos
//   3. Mapa de ações válidas por estado
//   4. Transições canônicas: draft → review_ready → approved_for_manual_execution
//   5. Descarte de qualquer estado intermediário
//   6. Transições inválidas retornam null (guardrails)
//   7. Estados terminais não aceitam ações
//   8. Textos de apoio comunicam "nenhuma execução"
//   9. Estado inicial canônico = "draft"
//  10. Função pura (sem side effect, sem mutação)
// ============================================================

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prepPath = resolve(__dirname, "../panel/app/lib/enova-ia-preparation.ts");

// ── Importar o módulo REAL ────────────────────────────────────────────────

const {
  PREPARATION_STATUS_LABEL,
  PREPARATION_STATUS_SUPPORT_TEXT,
  PREPARATION_VALID_ACTIONS,
  PREPARATION_INITIAL_STATUS,
  transitionPreparationStatus,
} = await import(prepPath);

// ── Helpers ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${e.message}`);
    failed++;
  }
}

// ── Testes ────────────────────────────────────────────────────────────────

console.log("\n── Módulo: exportações esperadas ───────────────────────────────");

test("PREPARATION_STATUS_LABEL exportado", () => {
  assert.ok(PREPARATION_STATUS_LABEL, "deve existir");
  assert.equal(typeof PREPARATION_STATUS_LABEL, "object");
});

test("PREPARATION_STATUS_SUPPORT_TEXT exportado", () => {
  assert.ok(PREPARATION_STATUS_SUPPORT_TEXT, "deve existir");
  assert.equal(typeof PREPARATION_STATUS_SUPPORT_TEXT, "object");
});

test("PREPARATION_VALID_ACTIONS exportado", () => {
  assert.ok(PREPARATION_VALID_ACTIONS, "deve existir");
  assert.equal(typeof PREPARATION_VALID_ACTIONS, "object");
});

test("PREPARATION_INITIAL_STATUS exportado como 'draft'", () => {
  assert.equal(PREPARATION_INITIAL_STATUS, "draft");
});

test("transitionPreparationStatus exportado como função", () => {
  assert.equal(typeof transitionPreparationStatus, "function");
});

console.log("\n── Estados canônicos: 4 estados definidos ──────────────────────");

const EXPECTED_STATES = [
  "draft",
  "review_ready",
  "approved_for_manual_execution",
  "discarded",
];

for (const state of EXPECTED_STATES) {
  test(`PREPARATION_STATUS_LABEL tem estado '${state}'`, () => {
    assert.ok(state in PREPARATION_STATUS_LABEL, `estado '${state}' deve existir`);
    assert.ok(
      typeof PREPARATION_STATUS_LABEL[state] === "string" &&
      PREPARATION_STATUS_LABEL[state].length > 0,
      `label de '${state}' deve ser string não-vazia`,
    );
  });

  test(`PREPARATION_STATUS_SUPPORT_TEXT tem estado '${state}'`, () => {
    assert.ok(state in PREPARATION_STATUS_SUPPORT_TEXT);
    assert.ok(
      typeof PREPARATION_STATUS_SUPPORT_TEXT[state] === "string" &&
      PREPARATION_STATUS_SUPPORT_TEXT[state].length > 0,
      `support text de '${state}' deve ser string não-vazia`,
    );
  });

  test(`PREPARATION_VALID_ACTIONS tem estado '${state}'`, () => {
    assert.ok(state in PREPARATION_VALID_ACTIONS);
    assert.ok(Array.isArray(PREPARATION_VALID_ACTIONS[state]));
  });
}

console.log("\n── Mapa de ações válidas por estado ────────────────────────────");

test("draft permite 'revisar'", () => {
  assert.ok(PREPARATION_VALID_ACTIONS["draft"].includes("revisar"));
});

test("draft permite 'descartar'", () => {
  assert.ok(PREPARATION_VALID_ACTIONS["draft"].includes("descartar"));
});

test("draft NÃO permite 'aprovar' (sem revisão prévia)", () => {
  assert.ok(!PREPARATION_VALID_ACTIONS["draft"].includes("aprovar"));
});

test("review_ready permite 'aprovar'", () => {
  assert.ok(PREPARATION_VALID_ACTIONS["review_ready"].includes("aprovar"));
});

test("review_ready permite 'descartar'", () => {
  assert.ok(PREPARATION_VALID_ACTIONS["review_ready"].includes("descartar"));
});

test("review_ready NÃO permite 'revisar' novamente", () => {
  assert.ok(!PREPARATION_VALID_ACTIONS["review_ready"].includes("revisar"));
});

test("approved_for_manual_execution aceita marcar_pre_execucao (G2.5 adicionou pré-execução)", () => {
  // G2.5: approved_for_manual_execution → marcar_pre_execucao → pre_execution_ready
  assert.equal(
    PREPARATION_VALID_ACTIONS["approved_for_manual_execution"].includes("marcar_pre_execucao"),
    true,
  );
});

test("discarded não tem ações disponíveis", () => {
  assert.equal(PREPARATION_VALID_ACTIONS["discarded"].length, 0);
});

console.log("\n── Transições canônicas (fluxo principal) ──────────────────────");

test("draft → revisar → review_ready", () => {
  assert.equal(transitionPreparationStatus("draft", "revisar"), "review_ready");
});

test("draft → descartar → discarded", () => {
  assert.equal(transitionPreparationStatus("draft", "descartar"), "discarded");
});

test("review_ready → aprovar → approved_for_manual_execution", () => {
  assert.equal(
    transitionPreparationStatus("review_ready", "aprovar"),
    "approved_for_manual_execution",
  );
});

test("review_ready → descartar → discarded", () => {
  assert.equal(transitionPreparationStatus("review_ready", "descartar"), "discarded");
});

console.log("\n── Transições inválidas retornam null (guardrails) ─────────────");

test("draft → aprovar → null (deve revisar antes)", () => {
  assert.equal(transitionPreparationStatus("draft", "aprovar"), null);
});

test("review_ready → revisar → null (já está em review_ready)", () => {
  assert.equal(transitionPreparationStatus("review_ready", "revisar"), null);
});

test("approved_for_manual_execution → revisar → null", () => {
  assert.equal(transitionPreparationStatus("approved_for_manual_execution", "revisar"), null);
});

test("approved_for_manual_execution → aprovar → null", () => {
  assert.equal(transitionPreparationStatus("approved_for_manual_execution", "aprovar"), null);
});

test("approved_for_manual_execution → descartar → null", () => {
  assert.equal(transitionPreparationStatus("approved_for_manual_execution", "descartar"), null);
});

test("discarded → revisar → null", () => {
  assert.equal(transitionPreparationStatus("discarded", "revisar"), null);
});

test("discarded → aprovar → null", () => {
  assert.equal(transitionPreparationStatus("discarded", "aprovar"), null);
});

test("discarded → descartar → null", () => {
  assert.equal(transitionPreparationStatus("discarded", "descartar"), null);
});

console.log("\n── Textos de apoio: semântica explícita ────────────────────────");

test("'approved_for_manual_execution' support text indica 'nenhuma ação foi executada'", () => {
  const txt = PREPARATION_STATUS_SUPPORT_TEXT["approved_for_manual_execution"].toLowerCase();
  assert.ok(
    txt.includes("nenhuma") || txt.includes("não foi executada") || txt.includes("nao foi"),
    `deve indicar que nenhuma execução ocorreu: "${txt}"`,
  );
});

test("'approved_for_manual_execution' support text indica execução manual (não automática)", () => {
  const txt = PREPARATION_STATUS_SUPPORT_TEXT["approved_for_manual_execution"].toLowerCase();
  assert.ok(txt.includes("manual"), `deve mencionar 'manual': "${txt}"`);
});

test("'approved_for_manual_execution' label não diz 'executado' (não implica execução)", () => {
  const label = PREPARATION_STATUS_LABEL["approved_for_manual_execution"].toLowerCase();
  assert.ok(
    !label.includes("executado") && !label.includes("executada"),
    `label não deve sugerir que foi executado: "${label}"`,
  );
});

test("'draft' support text indica estado inicial/rascunho", () => {
  const txt = PREPARATION_STATUS_SUPPORT_TEXT["draft"].toLowerCase();
  assert.ok(
    txt.includes("aguardando") || txt.includes("rascunho") || txt.includes("inicial"),
    `deve indicar estado inicial: "${txt}"`,
  );
});

test("'review_ready' support text indica preparação para aprovação", () => {
  const txt = PREPARATION_STATUS_SUPPORT_TEXT["review_ready"].toLowerCase();
  assert.ok(
    txt.includes("aprovação") || txt.includes("aprovacao"),
    `deve indicar que está pronto para aprovação: "${txt}"`,
  );
});

console.log("\n── Função pura: sem side effect ────────────────────────────────");

test("transitionPreparationStatus não muta o estado de entrada", () => {
  const input = "draft";
  const snapshot = input;
  transitionPreparationStatus(input, "revisar");
  assert.equal(input, snapshot, "string primitiva não pode ser mutada");
});

test("múltiplas chamadas com mesmos argumentos retornam mesmo resultado (determinístico)", () => {
  const r1 = transitionPreparationStatus("draft", "revisar");
  const r2 = transitionPreparationStatus("draft", "revisar");
  assert.equal(r1, r2);
});

// ── Resultado final ───────────────────────────────────────────────────────

console.log(`\n─────────────────────────────────────────────────────────────────`);
console.log(`  Resultado: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
console.log("  Todos os smoke tests passaram ✅\n");
