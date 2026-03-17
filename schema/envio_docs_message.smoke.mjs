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

{
  const stSoloClt = { regime_trabalho: "clt" };
  const itensSoloClt = generateChecklistForDocs(stSoloClt);
  const messages = buildEnvioDocsListaMensagens(itensSoloClt);
  assertSharedExpectations(messages);
  assert.equal(messages[0].includes("último holerite"), true);
  assert.equal(messages[1].includes("Vamos começar pelos seus documentos"), true);
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
  assert.equal(messages[0].includes("último holerite"), true);
  assert.equal(messages[1].includes("pessoa que vai entrar com você no processo"), true);
}

{
  const stAutonomoIr = { regime_trabalho: "autonomo", autonomo_ir: true };
  const itensAutonomoIr = generateChecklistForDocs(stAutonomoIr);
  const messages = buildEnvioDocsListaMensagens(itensAutonomoIr);
  assertSharedExpectations(messages);
  assert.equal(messages[0].includes("declaração e recibo do IR"), true);
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
  assert.equal(messages[0].includes("extrato bancário dos últimos 3 meses"), true);
  assert.equal(messages[1].includes("terceira pessoa que vai entrar com vocês no processo"), true);
}

console.log("envio_docs_message.smoke: ok");
