/**
 * hybrid_telemetry_sintomas_fix.smoke.mjs
 *
 * Smoke tests for the surgical fix of hybrid telemetry symptom signals.
 * Validates:
 *   A. funnel.stage.symptoms aparece com contexto real (não morto)
 *   B. did_reask pode acender quando o cenário exigir
 *   C. did_stage_stick pode acender quando o cenário exigir
 *   D. blocked_valid_signal e caused_loop ficam visíveis
 *   E. wa_id deixa de sair null quando lead_id/conversation_id disponíveis
 *   F. registerWaitUntil exportado e funcional
 *   G. queryStageSymptoms agrega sinais do bloco arbitration
 *   H. parser/gate/nextStage continuam intocados
 *   I. comportamento do worker continua intacto (fire-and-forget)
 */

import { strict as assert } from "node:assert";

const hooksPath = new URL("../telemetry/hybrid-telemetry-worker-hooks.js", import.meta.url).href;
const persistPath = new URL("../telemetry/hybrid-telemetry-persistence.js", import.meta.url).href;

const hooks = await import(hooksPath);
const persist = await import(persistPath);

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Section A — funnel.stage.symptoms com contexto real
// ═══════════════════════════════════════════════════════════════════
console.log("\n📦 Section A — funnel.stage.symptoms com contexto real");

await testAsync("A1: emitStageSymptomsHook com cognitiveSignal real acende blocked_valid_signal", async () => {
  let captured = null;
  const fakeEmitter = async (event) => { captured = event; };
  hooks.registerPersistentEmitter(fakeEmitter);

  await hooks.emitStageSymptomsHook({
    st: { wa_id: "test-a1", fase_conversa: "nome" },
    stageBefore: "nome",
    stageAfter: "nome",     // não avançou
    reaskTriggered: false,
    stageLocked: false,
    cognitiveSignal: "advance",
    cognitiveConfidence: 0.85,
    mechanicalAction: "stay",
    overrideSuspected: false,
    stateDiff: null
  });

  assert.ok(captured, "event deve ser emitido");
  assert.equal(captured.event_name, "funnel.stage.symptoms");
  assert.ok(captured._stage_symptoms, "_stage_symptoms presente");
  assert.equal(captured._stage_symptoms.blocked_valid_signal, true, "blocked_valid_signal deve acender com sinal cognitivo real sem avanço");
  assert.equal(captured._stage_symptoms.plausible_answer_without_advance, true, "plausible_answer_without_advance deve acender");
  hooks.registerPersistentEmitter(null);
});

await testAsync("A2: emitStageSymptomsHook com cognitiveSignal null mantém blocked_valid_signal=false", async () => {
  let captured = null;
  const fakeEmitter = async (event) => { captured = event; };
  hooks.registerPersistentEmitter(fakeEmitter);

  await hooks.emitStageSymptomsHook({
    st: { wa_id: "test-a2", fase_conversa: "nome" },
    stageBefore: "nome",
    stageAfter: "nome",
    reaskTriggered: false,
    stageLocked: false,
    cognitiveSignal: null,      // payload morto — antigo comportamento
    cognitiveConfidence: null,
    mechanicalAction: "stay",
    overrideSuspected: false,
    stateDiff: null
  });

  assert.ok(captured, "event deve ser emitido");
  assert.equal(captured._stage_symptoms.blocked_valid_signal, false, "blocked_valid_signal=false sem sinal cognitivo");
  assert.equal(captured._stage_symptoms.plausible_answer_without_advance, false);
  hooks.registerPersistentEmitter(null);
});

await testAsync("A3: funnel.stage.symptoms emitido sempre (não só quando sintomas acendem)", async () => {
  let emitted = false;
  hooks.registerPersistentEmitter(async () => { emitted = true; });

  await hooks.emitStageSymptomsHook({
    st: { wa_id: "a3", fase_conversa: "cpf" },
    stageBefore: "cpf",
    stageAfter: "renda",
    reaskTriggered: false,
    stageLocked: false,
    cognitiveSignal: null,
    cognitiveConfidence: null,
    mechanicalAction: "stage_advance",
    overrideSuspected: false,
    stateDiff: null
  });

  assert.equal(emitted, true, "evento sempre emitido");
  hooks.registerPersistentEmitter(null);
});

// ═══════════════════════════════════════════════════════════════════
// Section B — did_reask pode acender
// ═══════════════════════════════════════════════════════════════════
console.log("\n📦 Section B — did_reask pode acender quando cenário exigir");

await testAsync("B1: did_reask acende quando reaskTriggered=true", async () => {
  let captured = null;
  hooks.registerPersistentEmitter(async (e) => { captured = e; });

  await hooks.emitStageSymptomsHook({
    st: { wa_id: "b1" },
    stageBefore: "nome",
    stageAfter: "nome",
    reaskTriggered: true,
    stageLocked: false,
    cognitiveSignal: null,
    cognitiveConfidence: null,
    mechanicalAction: "reask",
    overrideSuspected: false,
    stateDiff: null
  });

  assert.equal(captured._stage_symptoms.did_reask, true, "did_reask deve ser true");
  hooks.registerPersistentEmitter(null);
});

await testAsync("B2: did_reask=false quando reaskTriggered=false", async () => {
  let captured = null;
  hooks.registerPersistentEmitter(async (e) => { captured = e; });

  await hooks.emitStageSymptomsHook({
    st: { wa_id: "b2" },
    stageBefore: "nome",
    stageAfter: "nome",
    reaskTriggered: false,
    stageLocked: false,
    cognitiveSignal: null,
    cognitiveConfidence: null,
    mechanicalAction: "stay",
    overrideSuspected: false,
    stateDiff: null
  });

  assert.equal(captured._stage_symptoms.did_reask, false);
  hooks.registerPersistentEmitter(null);
});

// ═══════════════════════════════════════════════════════════════════
// Section C — did_stage_stick pode acender
// ═══════════════════════════════════════════════════════════════════
console.log("\n📦 Section C — did_stage_stick pode acender quando cenário exigir");

await testAsync("C1: did_stage_stick acende quando stageLocked=true e stage não avançou", async () => {
  let captured = null;
  hooks.registerPersistentEmitter(async (e) => { captured = e; });

  await hooks.emitStageSymptomsHook({
    st: { wa_id: "c1" },
    stageBefore: "renda",
    stageAfter: "renda",
    reaskTriggered: false,
    stageLocked: true,
    cognitiveSignal: null,
    cognitiveConfidence: null,
    mechanicalAction: "lock",
    overrideSuspected: false,
    stateDiff: null
  });

  assert.equal(captured._stage_symptoms.did_stage_stick, true, "did_stage_stick deve ser true");
  hooks.registerPersistentEmitter(null);
});

await testAsync("C2: did_stage_stick=false quando stage avançou", async () => {
  let captured = null;
  hooks.registerPersistentEmitter(async (e) => { captured = e; });

  await hooks.emitStageSymptomsHook({
    st: { wa_id: "c2" },
    stageBefore: "renda",
    stageAfter: "fgts",
    reaskTriggered: false,
    stageLocked: false,
    cognitiveSignal: null,
    cognitiveConfidence: null,
    mechanicalAction: "stage_advance",
    overrideSuspected: false,
    stateDiff: null
  });

  assert.equal(captured._stage_symptoms.did_stage_stick, false);
  assert.equal(captured._stage_symptoms.did_stage_advance, true);
  hooks.registerPersistentEmitter(null);
});

// ═══════════════════════════════════════════════════════════════════
// Section D — blocked_valid_signal e caused_loop
// ═══════════════════════════════════════════════════════════════════
console.log("\n📦 Section D — blocked_valid_signal e caused_loop visíveis");

await testAsync("D1: caused_loop acende quando reask + blocked_valid_signal", async () => {
  let captured = null;
  hooks.registerPersistentEmitter(async (e) => { captured = e; });

  await hooks.emitStageSymptomsHook({
    st: { wa_id: "d1" },
    stageBefore: "nome",
    stageAfter: "nome",
    reaskTriggered: true,
    stageLocked: false,
    cognitiveSignal: "advance",
    cognitiveConfidence: 0.9,
    mechanicalAction: "reask",
    overrideSuspected: false,
    stateDiff: null
  });

  // did_reask=true, blocked_valid_signal=true (cogSignal presente, !advance, !reask — wait: did_reask=true means !did_reask is false)
  // Let's verify: blocked_valid_signal = hasPlausibleSignal && !did_stage_advance && !did_reask
  // did_reask=true → blocked_valid_signal=false
  // caused_loop = did_reask && (did_stage_repeat || override_suspected_sym || blocked_valid_signal)
  // did_stage_repeat: stageAfter===stageBefore && !reask && !locked → false (reask=true)
  // So caused_loop depends on override_suspected_sym
  // override_suspected_sym = Boolean(overrideSuspected) || (hasPlausibleSignal && !advance && Boolean(mechanicalAction))
  // = false || (true && true && true) = true
  // caused_loop = true && (false || true || false) = true
  assert.equal(captured._stage_symptoms.did_reask, true);
  assert.equal(captured._stage_symptoms.caused_loop, true, "caused_loop deve acender via override_suspected quando reask+cogSignal");
  hooks.registerPersistentEmitter(null);
});

await testAsync("D2: blocked_valid_signal acende com sinal cognitivo forte sem avanço sem reask", async () => {
  let captured = null;
  hooks.registerPersistentEmitter(async (e) => { captured = e; });

  await hooks.emitStageSymptomsHook({
    st: { wa_id: "d2" },
    stageBefore: "nome",
    stageAfter: "nome",
    reaskTriggered: false,
    stageLocked: false,
    cognitiveSignal: "advance",
    cognitiveConfidence: 0.75,
    mechanicalAction: "stay",
    overrideSuspected: false,
    stateDiff: null
  });

  // blocked_valid_signal = hasPlausibleSignal && !advance && !did_reask
  // = (0.75>=0.5 && "advance") && !(advance) && !false = true && true && true
  assert.equal(captured._stage_symptoms.blocked_valid_signal, true);
  hooks.registerPersistentEmitter(null);
});

// ═══════════════════════════════════════════════════════════════════
// Section E — wa_id não sai null quando lead_id disponível
// ═══════════════════════════════════════════════════════════════════
console.log("\n📦 Section E — wa_id estabilizado via fallback");

await testAsync("E1: Hook 7 usa lead_id quando wa_id=null", async () => {
  let captured = null;
  hooks.registerPersistentEmitter(async (e) => { captured = e; });

  await hooks.emitStageSymptomsHook({
    st: { wa_id: null, lead_id: "lead-123", fase_conversa: "nome" },
    stageBefore: "nome",
    stageAfter: "nome",
    reaskTriggered: false,
    stageLocked: false,
    cognitiveSignal: null,
    cognitiveConfidence: null,
    mechanicalAction: "stay",
    overrideSuspected: false,
    stateDiff: null
  });

  assert.equal(captured.lead_id, "lead-123", "lead_id deve aparecer no evento");
  assert.equal(captured.conversation_id, "lead-123", "conversation_id deve usar lead_id como fallback");
  hooks.registerPersistentEmitter(null);
});

await testAsync("E2: Hook 7 usa conversation_id quando wa_id e lead_id=null", async () => {
  let captured = null;
  hooks.registerPersistentEmitter(async (e) => { captured = e; });

  await hooks.emitStageSymptomsHook({
    st: { wa_id: null, lead_id: null, conversation_id: "conv-456", fase_conversa: "cpf" },
    stageBefore: "cpf",
    stageAfter: "cpf",
    reaskTriggered: false,
    stageLocked: false,
    cognitiveSignal: null,
    cognitiveConfidence: null,
    mechanicalAction: "stay",
    overrideSuspected: false,
    stateDiff: null
  });

  assert.equal(captured.lead_id, "conv-456", "deve usar conversation_id como último fallback");
  hooks.registerPersistentEmitter(null);
});

await testAsync("E3: wa_id real tem precedência sobre lead_id", async () => {
  let captured = null;
  hooks.registerPersistentEmitter(async (e) => { captured = e; });

  await hooks.emitStageSymptomsHook({
    st: { wa_id: "wa-real", lead_id: "lead-xyz", fase_conversa: "renda" },
    stageBefore: "renda",
    stageAfter: "renda",
    reaskTriggered: false,
    stageLocked: false,
    cognitiveSignal: null,
    cognitiveConfidence: null,
    mechanicalAction: "stay",
    overrideSuspected: false,
    stateDiff: null
  });

  assert.equal(captured.lead_id, "wa-real", "wa_id tem precedência");
  hooks.registerPersistentEmitter(null);
});

await testAsync("E4: Hook 4 (emitMechanicalDecisionTelemetry) usa lead_id como fallback", async () => {
  let captured = null;
  hooks.registerPersistentEmitter(async (e) => { captured = e; });

  await hooks.emitMechanicalDecisionTelemetry({
    st: { wa_id: null, lead_id: "mech-lead", fase_conversa: "nome" },
    stageBefore: "nome",
    stageAfter: "nome",
    parserUsed: "test",
    parserResult: null,
    mechanicalAction: "stay",
    validationResult: null,
    reaskTriggered: false,
    stageLocked: false,
    stateDiff: null
  });

  assert.equal(captured.lead_id, "mech-lead", "Hook 4 deve usar lead_id como fallback");
  hooks.registerPersistentEmitter(null);
});

// ═══════════════════════════════════════════════════════════════════
// Section F — registerWaitUntil exportado e funcional
// ═══════════════════════════════════════════════════════════════════
console.log("\n📦 Section F — registerWaitUntil exportado e funcional");

test("F1: registerWaitUntil é exportado do módulo hooks", () => {
  assert.equal(typeof hooks.registerWaitUntil, "function", "registerWaitUntil deve ser função exportada");
});

test("F2: registerWaitUntil aceita null sem jogar exceção", () => {
  hooks.registerWaitUntil(null);
  // Se chegou aqui, não jogou exceção
  hooks.registerWaitUntil(null); // reset
});

await testAsync("F3: registerWaitUntil com função válida — emitStageSymptomsHook não quebra", async () => {
  let waitUntilCalled = false;
  const fakeWaitUntil = (p) => {
    waitUntilCalled = true;
    // Consume the promise safely
    if (p && typeof p.catch === "function") p.catch(() => {});
  };

  hooks.registerWaitUntil(fakeWaitUntil);
  hooks.registerPersistentEmitter(async () => {});

  await hooks.emitStageSymptomsHook({
    st: { wa_id: "f3" },
    stageBefore: "nome",
    stageAfter: "nome",
    reaskTriggered: false,
    stageLocked: false,
    cognitiveSignal: "advance",
    cognitiveConfidence: 0.8,
    mechanicalAction: "stay",
    overrideSuspected: false,
    stateDiff: null
  });

  assert.equal(waitUntilCalled, true, "waitUntil deve ter sido chamado para Hook 7");
  hooks.registerWaitUntil(null);
  hooks.registerPersistentEmitter(null);
});

await testAsync("F4: registerWaitUntil com função inválida não quebra o hook", async () => {
  hooks.registerWaitUntil("not-a-function");

  // Deve ser seguro mesmo com registrado inválido
  await hooks.emitStageSymptomsHook({
    st: { wa_id: "f4" },
    stageBefore: "inicio",
    stageAfter: "inicio",
    reaskTriggered: false,
    stageLocked: false,
    cognitiveSignal: null,
    cognitiveConfidence: null,
    mechanicalAction: "stay",
    overrideSuspected: false,
    stateDiff: null
  });

  hooks.registerWaitUntil(null);
});

// ═══════════════════════════════════════════════════════════════════
// Section G — queryStageSymptoms agrega sinais do bloco arbitration
// ═══════════════════════════════════════════════════════════════════
console.log("\n📦 Section G — queryStageSymptoms agrega sinais do bloco arbitration");

// Mock sbFetch que retorna eventos com blocked_valid_signal só no bloco arbitration
function makeMockSbFetch(rows) {
  return async (_env, _path, _opts) => rows;
}

const mockArbitrationOnlyEvent = {
  wa_id: "arb-lead",
  details: JSON.stringify({
    event_name: "funnel.arbitration.conflict",
    stage_before: "nome",
    stage_after: "nome",
    lead_id: "arb-lead",
    conversation_id: "arb-lead",
    arbitration: {
      blocked_valid_signal: true,
      caused_loop: false
    },
    stage_symptoms: null  // não tem stage_symptoms — só no arbitration
  }),
  created_at: "2026-04-08T10:00:00Z"
};

const mockCausedLoopOnlyEvent = {
  wa_id: "loop-lead",
  details: JSON.stringify({
    event_name: "funnel.arbitration.override",
    stage_before: "renda",
    stage_after: "renda",
    lead_id: "loop-lead",
    arbitration: {
      blocked_valid_signal: false,
      caused_loop: true
    },
    stage_symptoms: null
  }),
  created_at: "2026-04-08T10:01:00Z"
};

const mockNoSymptomEvent = {
  wa_id: "no-symptom",
  details: JSON.stringify({
    event_name: "funnel.stage.symptoms",
    stage_before: "cpf",
    stage_after: "renda",
    lead_id: "no-symptom",
    arbitration: {
      blocked_valid_signal: false,
      caused_loop: false
    },
    stage_symptoms: {
      did_stage_advance: true,
      did_reask: false,
      blocked_valid_signal: false,
      caused_loop: false
    }
  }),
  created_at: "2026-04-08T10:02:00Z"
};

await testAsync("G1: queryStageSymptoms inclui evento com blocked_valid_signal só no bloco arbitration", async () => {
  const mockFetch = makeMockSbFetch([mockArbitrationOnlyEvent]);
  const result = await persist.queryStageSymptoms(mockFetch, {}, { limit: 10 });

  assert.equal(result.ok, true);
  assert.equal(result.events.length, 1, "deve incluir o evento com blocked_valid_signal no arbitration");
});

await testAsync("G2: queryStageSymptoms inclui evento com caused_loop só no bloco arbitration", async () => {
  const mockFetch = makeMockSbFetch([mockCausedLoopOnlyEvent]);
  const result = await persist.queryStageSymptoms(mockFetch, {}, { limit: 10 });

  assert.equal(result.ok, true);
  assert.equal(result.events.length, 1, "deve incluir o evento com caused_loop no arbitration");
});

await testAsync("G3: queryStageSymptoms NÃO inclui evento sem nenhum sintoma", async () => {
  const mockFetch = makeMockSbFetch([mockNoSymptomEvent]);
  const result = await persist.queryStageSymptoms(mockFetch, {}, { limit: 10 });

  assert.equal(result.ok, true);
  assert.equal(result.events.length, 0, "evento sem sintomas não deve aparecer");
});

await testAsync("G4: filtro por symptom=blocked_valid_signal inclui arbitration.blocked_valid_signal", async () => {
  const mockFetch = makeMockSbFetch([mockArbitrationOnlyEvent, mockNoSymptomEvent]);
  const result = await persist.queryStageSymptoms(mockFetch, {}, { symptom: "blocked_valid_signal", limit: 10 });

  assert.equal(result.ok, true);
  assert.equal(result.events.length, 1, "apenas o evento com blocked_valid_signal deve aparecer");
});

await testAsync("G5: filtro por symptom=caused_loop inclui arbitration.caused_loop", async () => {
  const mockFetch = makeMockSbFetch([mockCausedLoopOnlyEvent, mockNoSymptomEvent]);
  const result = await persist.queryStageSymptoms(mockFetch, {}, { symptom: "caused_loop", limit: 10 });

  assert.equal(result.ok, true);
  assert.equal(result.events.length, 1, "apenas o evento com caused_loop deve aparecer");
});

await testAsync("G6: eventos com sintomas em stage_symptoms ainda são incluídos (backward compat)", async () => {
  const stageSymptomEvent = {
    wa_id: "stage-sym",
    details: JSON.stringify({
      event_name: "funnel.stage.symptoms",
      stage_before: "nome",
      stage_after: "nome",
      lead_id: "stage-sym",
      stage_symptoms: { did_reask: true },
      arbitration: { blocked_valid_signal: false, caused_loop: false }
    }),
    created_at: "2026-04-08T10:03:00Z"
  };
  const mockFetch = makeMockSbFetch([stageSymptomEvent]);
  const result = await persist.queryStageSymptoms(mockFetch, {}, { limit: 10 });

  assert.equal(result.ok, true);
  assert.equal(result.events.length, 1, "eventos stage_symptoms existentes ainda incluídos");
});

// ═══════════════════════════════════════════════════════════════════
// Section H — parser/gate/nextStage continuam intocados
// ═══════════════════════════════════════════════════════════════════
console.log("\n📦 Section H — parser/gate/nextStage intocados");

test("H1: módulo hooks não exporta função parser", () => {
  const exportNames = Object.keys(hooks);
  const parserNames = exportNames.filter(n => n.toLowerCase().includes("parser") || n.toLowerCase().includes("gate"));
  assert.equal(parserNames.length, 0, `nenhum parser/gate exportado, encontrado: ${parserNames.join(", ")}`);
});

test("H2: módulo hooks não exporta nextStage", () => {
  assert.equal(typeof hooks.nextStage, "undefined", "nextStage não exportado");
});

test("H3: módulo persistence não exporta parser ou nextStage", () => {
  const persKeys = Object.keys(persist);
  const parserOrStage = persKeys.filter(n => n.toLowerCase().includes("parser") || n === "nextStage" || n.toLowerCase().includes("gate"));
  assert.equal(parserOrStage.length, 0, `nenhum parser/gate/nextStage em persistence: ${parserOrStage.join(", ")}`);
});

// ═══════════════════════════════════════════════════════════════════
// Section I — worker continua intacto (fire-and-forget)
// ═══════════════════════════════════════════════════════════════════
console.log("\n📦 Section I — comportamento worker intacto");

await testAsync("I1: emitStageSymptomsHook com persistentEmitter que joga exceção não quebra", async () => {
  hooks.registerPersistentEmitter(async () => { throw new Error("persistence down"); });
  // Deve completar sem exceção
  await hooks.emitStageSymptomsHook({
    st: { wa_id: "i1" },
    stageBefore: "nome",
    stageAfter: "nome",
    reaskTriggered: false,
    stageLocked: false,
    cognitiveSignal: "advance",
    cognitiveConfidence: 0.9,
    mechanicalAction: "stay",
    overrideSuspected: false,
    stateDiff: null
  });
  hooks.registerPersistentEmitter(null);
});

await testAsync("I2: emitStageSymptomsHook com waitUntil que joga exceção não quebra", async () => {
  hooks.registerWaitUntil(() => { throw new Error("waitUntil exploded"); });
  hooks.registerPersistentEmitter(async () => {});

  await hooks.emitStageSymptomsHook({
    st: { wa_id: "i2" },
    stageBefore: "renda",
    stageAfter: "renda",
    reaskTriggered: false,
    stageLocked: false,
    cognitiveSignal: "advance",
    cognitiveConfidence: 0.7,
    mechanicalAction: "stay",
    overrideSuspected: false,
    stateDiff: null
  });

  hooks.registerWaitUntil(null);
  hooks.registerPersistentEmitter(null);
});

await testAsync("I3: emitStageSymptomsHook com st=null não joga exceção", async () => {
  await hooks.emitStageSymptomsHook({
    st: null,
    stageBefore: "nome",
    stageAfter: "nome",
    reaskTriggered: false,
    stageLocked: false,
    cognitiveSignal: null,
    cognitiveConfidence: null,
    mechanicalAction: "stay",
    overrideSuspected: false,
    stateDiff: null
  });
});

await testAsync("I4: emitStageSymptomsHook sem parâmetros não joga exceção", async () => {
  await hooks.emitStageSymptomsHook();
});

// ═══════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════
console.log("\n════════════════════════════════════════════════════════════");
console.log(`📊 hybrid_telemetry_sintomas_fix.smoke.mjs — Results`);
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
if (failures.length > 0) {
  console.log("\n  Failures:");
  for (const f of failures) {
    console.log(`    ❌ ${f.name}: ${f.error}`);
  }
}
console.log("════════════════════════════════════════════════════════════");
if (failed > 0) process.exit(1);
