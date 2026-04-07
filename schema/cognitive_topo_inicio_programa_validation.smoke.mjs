import assert from "node:assert/strict";
import fs from "node:fs";

const workerSrc = fs.readFileSync(new URL("../Enova worker.js", import.meta.url), "utf8");

function test(name, fn) {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  fail - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log("cognitive_topo_inicio_programa_validation.smoke.mjs");

test("first_after_reset uses strict semantic validator", () => {
  assert.match(workerSrc, /"inicio_programa:first_after_reset"[\s\S]*?validate:\s*\(reply\)\s*=>\s*validateInicioProgramaChoiceSpeech\(reply,\s*\{\s*requirePresentation:\s*true\s*\}\)/);
});

test("greeting_reentrada uses strict semantic validator", () => {
  assert.match(workerSrc, /"inicio_programa:greeting_reentrada"[\s\S]*?validate:\s*\(reply\)\s*=>\s*validateInicioProgramaChoiceSpeech\(reply,\s*\{\s*requirePresentation:\s*true\s*\}\)/);
});

test("ambiguous reprompt uses topo choice validator", () => {
  assert.match(workerSrc, /"inicio_programa:ambiguous"[\s\S]*?validate:\s*\(reply\)\s*=>\s*validateInicioProgramaChoiceSpeech\(reply\)/);
});

test("fallback opening contains Enova, MCMV, ja-conhece and explanation choice", () => {
  const firstResetBlock = workerSrc.match(/"inicio_programa:first_after_reset"[\s\S]*?validate:/)?.[0] || "";
  assert.match(firstResetBlock, /Enova/);
  assert.match(firstResetBlock, /Minha Casa Minha Vida/);
  assert.match(firstResetBlock, /já conhece/);
  assert.match(firstResetBlock, /quer que eu te explique/);
});

test("topo validator blocks future collection vocabulary", () => {
  const validatorRegion = workerSrc.match(/const TOPO_INICIO_PROGRAMA_FORBIDDEN_COLLECTION_RE[\s\S]*?function validateInicioProgramaChoiceSpeech/)?.[0] || "";
  for (const term of ["estado civil", "nome completo", "nacionalidade", "renda", "clt", "documentos"]) {
    assert.ok(validatorRegion.includes(term), `missing forbidden term: ${term}`);
  }
});

test("inicio_programa parser and nextStage remain intact", () => {
  assert.match(workerSrc, /const sim = isYes\(nt\)/);
  assert.match(workerSrc, /const nao =\s*[\s\S]*?isNo\(nt\)/);
  assert.match(workerSrc, /next_stage:\s*"inicio_nome"/);
  assert.match(workerSrc, /next_stage:\s*"inicio_programa"/);
});

test("manual mode render hook remains untouched in step", () => {
  assert.match(workerSrc, /const msgs = modoHumanoRender\(st, arr\)/);
});

if (process.exitCode) {
  throw new Error("cognitive_topo_inicio_programa_validation.smoke failed");
}

console.log("cognitive_topo_inicio_programa_validation.smoke: ok");
