import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;
const { buildCorrespondenteDossierPayloadFromState } = workerModule;

const token = "AB12CD34EF56GH78JK90LM12";
const waCaso = "5541999998888";
const correspondenteWa = "5511999999999";

function buildEnvWithState() {
  return {
    ENV_MODE: "test",
    ENOVA_ADMIN_KEY: "adm-key",
    VERCEL_PROXY_URL: "https://proxy.example.com",
    SUPABASE_SERVICE_ROLE: "service-role",
    META_API_VERSION: "v20.0",
    PHONE_NUMBER_ID: "123456",
    WHATS_TOKEN: "token",
    META_VERIFY_TOKEN: "verify",
    CORRESPONDENTE_TO: "5511000000000",
    CORRESPONDENTE_ENTRY_BASE_URL: "https://entrada.enova.local",
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
        [waCaso]: {
          wa_id: waCaso,
          nome: "JOAO TESTE",
          pre_cadastro_numero: "000001",
          fase_conversa: "finalizacao_processo",
          corr_assumir_token: token,
          corr_publicacao_status: "publicado_grupo_pendente_assumir",
          corr_lock_correspondente_wa_id: null,
          corr_lock_assumido_em: null,
          corr_entrega_privada_status: null,
          corr_follow_base_at: null,
          corr_follow_next_at: null,
          processo_enviado_correspondente: false,
          aguardando_retorno_correspondente: false,
          dossie_resumo: "SEGREDO DOSSIE",
          renda: 8900,
          ir_declarado: true,
          restricao: "nao",
          regime_trabalho: "clt",
          updated_at: "2026-03-18T00:00:00.000Z",
          envio_docs_itens_json: [
            { tipo: "ctps_completa", participante: "p1", status: "validado_basico", bucket: "obrigatorio", obrigatorio: false, bloqueante_operacional: false }
          ],
          envio_docs_historico_json: [
            {
              origem: "upload",
              associado: { tipo: "ctps_completa", participante: "p1" },
              media_ref: { url: "https://docs.example.com/ctps-p1.pdf" }
            }
          ],
          controle: {
            etapa1_informativos: {
              informativo_moradia_atual_p1: "Pinheirinho",
              informativo_moradia_p1: "Bairro Alto",
              informativo_trabalho_p1: "Centro",
              visita_reserva_entrada_tem: true,
              visita_fgts_disponivel: false,
              visita_decisor_adicional_visita: true,
              visita_decisor_adicional_nome: "MARIA",
              titular_autonomo_profissao_atividade: "Motorista",
              titular_autonomo_mei_pj_status: "mei",
              titular_autonomo_renda_estabilidade: "variavel",
              titular_curso_superior_status: "cursando"
            },
            etapa2_estrutural: {
              titular_tipo_renda_clt: "variavel",
              inicio_multi_renda_coletar: true,
              inicio_multi_regime_coletar: true,
              reprovacao_categoria_caso: "documental"
            }
          }
        }
      }
    }
  };
}

function buildEnvWithMultiSignalsState() {
  return {
    ENV_MODE: "test",
    ENOVA_ADMIN_KEY: "adm-key",
    VERCEL_PROXY_URL: "https://proxy.example.com",
    SUPABASE_SERVICE_ROLE: "service-role",
    META_API_VERSION: "v20.0",
    PHONE_NUMBER_ID: "123456",
    WHATS_TOKEN: "token",
    META_VERIFY_TOKEN: "verify",
    CORRESPONDENTE_TO: "5511000000000",
    CORRESPONDENTE_ENTRY_BASE_URL: "https://entrada.enova.local",
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
        [waCaso]: {
          wa_id: waCaso,
          nome: "JOAO TESTE",
          pre_cadastro_numero: "000001",
          fase_conversa: "finalizacao_processo",
          corr_assumir_token: token,
          corr_publicacao_status: "publicado_grupo_pendente_assumir",
          dossie_resumo: "SEGREDO DOSSIE",
          renda: 5000,
          regime_trabalho: "clt",
          updated_at: "2026-03-18T00:00:00.000Z",
          dossie_participantes_json: [
            { id: "p1", role: "titular", regime_trabalho: "clt", renda: 5000, restricao: false, regularizacao_restricao: false },
            { id: "p2", role: "parceiro", regime_trabalho: "autonomo", renda: 1200, restricao: false, regularizacao_restricao: false }
          ],
          pacote_renda_resumo_json: {
            total_geral: 6200,
            por_participante: {
              p1: { total_geral: 5000 },
              p2: { total_geral: 1200 }
            }
          },
          envio_docs_itens_json: [
            { tipo: "ctps_completa", participante: "p1", status: "validado_basico", bucket: "obrigatorio", obrigatorio: false, bloqueante_operacional: false }
          ],
          envio_docs_historico_json: [
            {
              origem: "upload",
              associado: { tipo: "ctps_completa", participante: "p1" },
              media_ref: { url: "https://docs.example.com/ctps-p1.pdf" }
            }
          ],
          controle: {
            etapa1_informativos: {
              informativo_moradia_atual_p1: "Pinheirinho",
              informativo_moradia_p1: "Bairro Alto",
              informativo_trabalho_p1: "Centro",
              informativo_parcela_mensal: "R$ 1.300",
              visita_reserva_entrada_tem: true,
              visita_reserva_entrada_valor: "R$ 20 mil",
              visita_fgts_disponivel: true,
              visita_fgts_valor: "R$ 8 mil"
            },
            etapa2_estrutural: {
              inicio_multi_renda_coletar: true,
              inicio_multi_regime_coletar: true
            }
          }
        }
      }
    }
  };
}

// 1) Structured expõe apenas sinais PRÉ-DOCS úteis ao dossiê técnico.
{
  const structured = buildCorrespondenteDossierPayloadFromState({
    nome: "JOAO TESTE",
    renda: 5000,
    dossie_participantes_json: [
      { id: "p1", role: "titular", regime_trabalho: "clt", renda: 5000 }
    ],
    controle: {
      etapa1_informativos: {
        informativo_moradia_atual_p1: "Pinheirinho",
        informativo_moradia_p1: "Bairro Alto",
        informativo_trabalho_p1: "Centro",
        informativo_parcela_mensal: "R$ 1.300",
        visita_reserva_entrada_tem: true,
        visita_reserva_entrada_valor: "R$ 20 mil",
        visita_fgts_disponivel: false,
        visita_fgts_valor: "não informado",
        visita_decisor_adicional_visita: true,
        visita_decisor_adicional_nome: "MARIA",
        titular_autonomo_profissao_atividade: "Motorista",
        titular_autonomo_mei_pj_status: "mei",
        titular_autonomo_renda_estabilidade: "variavel",
        titular_curso_superior_status: "cursando"
      },
      etapa2_estrutural: {
        titular_tipo_renda_clt: "variavel",
        inicio_multi_renda_coletar: true,
        inicio_multi_regime_coletar: true,
        reprovacao_categoria_caso: "documental"
      }
    },
    ir_declarado: true
  });
  const sinais = structured?.sinais_persistidos || {};

  assert.equal(sinais?.moradia_atual?.p1, "Pinheirinho");
  assert.equal(sinais?.moradia?.p1, "Bairro Alto");
  assert.equal(sinais?.trabalho?.p1, "Centro");
  assert.equal(sinais?.parcela_mensal, "R$ 1.300");
  assert.equal(sinais?.visita?.reserva_entrada_tem, true);
  assert.equal(sinais?.visita?.reserva_entrada_valor, "R$ 20 mil");
  assert.equal(sinais?.visita?.fgts_disponivel, false);
  assert.equal(sinais?.visita?.fgts_valor, "não informado");
  assert.equal(sinais?.autonomo?.profissao_atividade, "Motorista");
  assert.equal(sinais?.autonomo?.mei_pj_status, "mei");
  assert.equal(sinais?.autonomo?.renda_estabilidade, "variavel");
  assert.equal(sinais?.autonomo?.ir_declarado, true);
  assert.equal(sinais?.titular?.curso_superior_status, "cursando");
  assert.equal(sinais?.trabalho_clt?.titular_tipo_renda, "variavel");
  assert.equal(sinais?.renda?.multi_renda, true);
  assert.equal(sinais?.renda?.multi_regime, true);
  assert.equal("decisor_adicional_visita" in (sinais?.visita || {}), false);
  assert.equal("decisor_adicional_nome" in (sinais?.visita || {}), false);
  assert.equal("reprovacao" in sinais, false);
}

// 2) A página do correspondente renderiza os sinais técnicos no card existente sem mexer no resumo.
{
  const env = buildEnvWithState();
  const assumirReq = new Request("https://worker.local/correspondente/entrada?pre=000001", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      pre: "000001",
      cw: correspondenteWa
    })
  });
  const assumirRes = await worker.fetch(assumirReq, env, {});
  const html = await assumirRes.text();

  assert.equal(assumirRes.status, 200);
  assert.equal(html.includes("Cliente JOAO TESTE segue em processo sozinho."), true);
  assert.equal(html.includes("Sinais técnicos PRÉ-DOCS"), true);
  assert.equal(html.includes("Moradia atual P1"), true);
  assert.equal(html.includes("Pinheirinho"), true);
  assert.equal(html.includes("Preferência de moradia P1"), true);
  assert.equal(html.includes("Bairro Alto"), true);
  assert.equal(html.includes("Trabalho P1"), true);
  assert.equal(html.includes("Centro"), true);
  assert.equal(html.includes("Reserva para entrada"), true);
  assert.equal(html.includes("FGTS disponível"), true);
  assert.equal(html.includes("FGTS disponível - valor"), false);
  assert.equal(html.includes("Curso superior"), true);
  assert.equal(html.includes("Autônomo - atividade"), true);
  assert.equal(html.includes("Autônomo - MEI/PJ"), true);
  assert.equal(html.includes("Autônomo - estabilidade de renda"), true);
  assert.equal(html.includes("Autônomo - IR declarado"), true);
  assert.equal(html.includes("CLT titular - tipo de renda"), true);
  assert.equal(html.includes("Multi-renda"), true);
  assert.equal(html.includes("Multi-regime"), true);
  assert.equal(html.includes("decisor adicional"), false);
  assert.equal(html.includes("MARIA"), false);
  assert.equal(/>documental</.test(html), false);
}

// 3) O card técnico só expõe valor consolidado/regimes de multi renda e multi regime quando já houver leitura canônica viva.
{
  const env = buildEnvWithMultiSignalsState();
  const assumirReq = new Request("https://worker.local/correspondente/entrada?pre=000001", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      pre: "000001",
      cw: correspondenteWa
    })
  });
  const assumirRes = await worker.fetch(assumirReq, env, {});
  const html = await assumirRes.text();

  assert.equal(assumirRes.status, 200);
  assert.equal(html.includes("Parcela mensal"), true);
  assert.equal(html.includes("R$ 1.300"), true);
  assert.equal(html.includes("Reserva para entrada - valor"), true);
  assert.equal(html.includes("R$ 20 mil"), true);
  assert.equal(html.includes("FGTS disponível - valor"), true);
  assert.equal(html.includes("R$ 8 mil"), true);
  assert.equal(html.includes("Multi-renda"), true);
  assert.equal(html.includes("Multi-renda - valor consolidado"), true);
  assert.equal(html.includes("R$ 1200.00"), true);
  assert.equal(html.includes("Multi-regime"), true);
  assert.equal(html.includes("Multi-regime - regimes consolidados"), true);
  assert.equal(html.includes("clt, autonomo"), true);
}

console.log("correspondente_predocs_signals.smoke: ok");
