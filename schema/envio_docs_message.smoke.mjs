import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const {
  generateChecklistForDocs,
  buildEnvioDocsListaMensagens
} = workerModule;

function markParticipantAsReceived(itens, participante) {
  return (Array.isArray(itens) ? itens : []).map((item) => {
    if (String(item?.participante || "").trim().toLowerCase() !== participante) return item;
    return { ...item, status: "validado_basico", bucket: item?.bucket || "obrigatorio" };
  });
}

function assertSharedExpectations(messages) {
  assert.equal(messages.length, 2);
  const joined = messages.join("\n");
  assert.equal(/\bp1\b|\bp2\b|\bp3\b/i.test(joined), false, "mensagem ao cliente não deve expor identificadores internos de participante");
  assert.equal(joined.includes("Documentos do titular"), false);
  assert.equal(joined.includes("Comprovante de renda (de acordo com o perfil)"), false);
  assert.equal(joined.includes("Mesmos documentos da outra pessoa"), false);
}

function printScenario(nome, messages) {
  console.log(`\n[${nome}]`);
  console.log(messages[0]);
  console.log(messages[1]);
}

{
  const stSoloClt = { regime_trabalho: "clt" };
  const itensSoloClt = generateChecklistForDocs(stSoloClt);
  const messages = buildEnvioDocsListaMensagens(itensSoloClt);
  assertSharedExpectations(messages);
  assert.equal(messages[0].includes("holerite"), true);
  assert.equal(messages[1].includes("Vamos começar pelos seus documentos"), true);
  printScenario("solo CLT", messages);
}

{
  const stConjuntoClt = {
    financiamento_conjunto: true,
    regime_trabalho: "clt",
    regime_trabalho_parceiro: "clt"
  };
  const itensConjuntoClt = generateChecklistForDocs(stConjuntoClt);
  const itensComP1Concluido = markParticipantAsReceived(itensConjuntoClt, "p1");
  const messages = buildEnvioDocsListaMensagens(itensComP1Concluido);
  assertSharedExpectations(messages);
  assert.equal(messages[0].includes("holerite"), true);
  assert.equal(messages[1].includes("pessoa que vai entrar com você no processo"), true);
  printScenario("conjunto CLT + CLT", messages);
}

{
  const stAutonomoIr = { regime_trabalho: "autonomo", autonomo_ir: true };
  const itensAutonomoIr = generateChecklistForDocs(stAutonomoIr);
  itensAutonomoIr.push({ tipo: "extratos_bancarios", participante: "p1", bucket: "obrigatorio", status: "pendente" });
  const messages = buildEnvioDocsListaMensagens(itensAutonomoIr);
  assertSharedExpectations(messages);
  assert.equal(messages[0].includes("declaração de IR com recibo e extratos de movimentação"), true);
  printScenario("autônomo com IR", messages);
}

{
  const stCasamentoCivil = { regime_trabalho: "clt", casamento_formal: "civil_papel" };
  const itensCasamentoCivil = generateChecklistForDocs(stCasamentoCivil);
  const messages = buildEnvioDocsListaMensagens(itensCasamentoCivil);
  assertSharedExpectations(messages);
  assert.equal(messages[0].includes("certidão de casamento"), true);
  printScenario("casamento civil", messages);
}

{
  const stTerceiroParticipante = {
    financiamento_conjunto: true,
    regime_trabalho: "clt",
    regime_trabalho_parceiro: "clt",
    composicao_pessoa: "familiar_p3",
    regime_trabalho_parceiro_familiar_p3: "autonomo"
  };
  const itensTerceiro = generateChecklistForDocs(stTerceiroParticipante);
  const itensComP1Concluido = markParticipantAsReceived(itensTerceiro, "p1");
  const itensComP1P2Concluidos = markParticipantAsReceived(itensComP1Concluido, "p2");
  const messages = buildEnvioDocsListaMensagens(itensComP1P2Concluidos);
  assertSharedExpectations(messages);
  assert.equal(messages[0].includes("extratos de movimentação bancária"), true);
  assert.equal(messages[1].includes("próxima pessoa que também vai entrar no processo"), true);
  printScenario("terceiro participante", messages);
}

console.log("envio_docs_message.smoke: ok");
