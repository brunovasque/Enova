import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;
const { buildCorrespondenteGroupAlert } = workerModule;

const token = "AB12CD34EF56GH78JK90LM12";
const waCaso = "5541999998888";
const correspondenteWa = "5511999999999";
const CORRESPONDENTE_CASE_CONFIRMATION_PROMPT_PREFIX = "Me confirme no formato:";

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
          processo_enviado_correspondente: false,
          aguardando_retorno_correspondente: false,
          dossie_resumo: "SEGREDO DOSSIE",
          renda: 8900,
          restricao: "nao",
          updated_at: "2026-03-18T00:00:00.000Z"
        }
      }
    }
  };
}

// 1) Mensagem de correspondente deve conter link permanente de entrada.
{
  const env = buildEnvWithState();
  const mensagem = buildCorrespondenteGroupAlert(env.__enovaSimulationCtx.stateByWaId[waCaso], token, env);
  assert.equal(mensagem.includes("Pré-cadastro: 000001"), true);
  assert.equal(mensagem.includes("Cliente: JOAO TESTE"), true);
  assert.equal(mensagem.includes("CTA principal"), true);
  assert.equal(mensagem.includes("link de entrada da Enova"), true);
  assert.equal(mensagem.includes("Fallback de compatibilidade: *ASSUMIR 000001* ou *ASSUMIR TOKEN*."), true);
  assert.equal(mensagem.includes("Token de entrada"), false);
  assert.equal(
    mensagem.includes("https://entrada.enova.local/correspondente/entrada?pre=000001"),
    true
  );
}

// 2) GET antes da assunção: entrada oficial exibe capa + ação de assumir.
{
  const env = buildEnvWithState();
  const req = new Request("https://worker.local/correspondente/entrada?pre=000001", { method: "GET" });
  const res = await worker.fetch(req, env, {});
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.equal(html.includes("Capa do caso"), true);
  assert.equal(html.includes("Referência:"), true);
  assert.equal(html.includes("000001"), true);
  assert.equal(html.includes("Assumir caso"), true);
  assert.equal(html.includes("porta oficial de assunção"), true);
}

// 2.1) pre inexistente continua inválido.
{
  const env = buildEnvWithState();
  const req = new Request("https://worker.local/correspondente/entrada?pre=999999", { method: "GET" });
  const res = await worker.fetch(req, env, {});
  const body = await res.text();
  assert.equal(res.status, 404);
  assert.equal(body.includes("Link de entrada inválido."), true);
}

// 2.2) POST na entrada oficial assume caso, persiste lock e libera dossiê para o dono.
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
  const assumirHtml = await assumirRes.text();
  assert.equal(assumirRes.status, 200);
  assert.equal(assumirHtml.includes("Resumo executivo"), true);

  const atualizado = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(atualizado.corr_lock_correspondente_wa_id, correspondenteWa);
  assert.equal(typeof atualizado.corr_lock_assumido_em, "string");
  assert.equal(atualizado.aguardando_retorno_correspondente, true);
  assert.equal(atualizado.processo_enviado_correspondente, true);

  const wrongWaReq = new Request("https://worker.local/correspondente/entrada?pre=000001&cw=5511888888888", { method: "GET" });
  const wrongWaRes = await worker.fetch(wrongWaReq, env, {});
  const wrongWaBody = await wrongWaRes.text();
  assert.equal(wrongWaRes.status, 403);
  assert.equal(wrongWaBody.includes("Este caso já foi assumido por outro correspondente."), true);
}

// 3) Assunção no fluxo externo libera link apenas para o correspondente correto.
{
  const env = buildEnvWithState();
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.link.smoke",
              timestamp: "1773183900",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  const assumirRes = await worker.fetch(assumirReq, env, {});
  assert.equal(assumirRes.status, 200);

  const atualizado = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(atualizado.corr_lock_correspondente_wa_id, correspondenteWa);
  assert.equal(typeof atualizado.corr_lock_assumido_em, "string");
  assert.equal(atualizado.aguardando_retorno_correspondente, true);
  assert.equal(atualizado.processo_enviado_correspondente, true);

  const reopenReq = new Request(`https://worker.local/correspondente/entrada?pre=000001&cw=${correspondenteWa}`, { method: "GET" });
  const reopenRes = await worker.fetch(reopenReq, env, {});
  const reopenHtml = await reopenRes.text();
  assert.equal(reopenRes.status, 200);
  assert.equal(reopenHtml.includes("Resumo executivo"), true);
  assert.equal(reopenHtml.includes("Token/identificador de entrada"), false);
  assert.equal(reopenHtml.includes("Guarde esta referência"), false);

  const wrongWaReq = new Request("https://worker.local/correspondente/entrada?pre=000001&cw=5511888888888", { method: "GET" });
  const wrongWaRes = await worker.fetch(wrongWaReq, env, {});
  const wrongWaBody = await wrongWaRes.text();
  assert.equal(wrongWaRes.status, 403);
  assert.equal(wrongWaBody.includes("Este caso já foi assumido por outro correspondente."), true);
  assert.equal(wrongWaBody.includes("Resumo executivo"), false);

  const sameOwnerPreCadastroReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.pre.cadastro.same.owner",
              timestamp: "1773183902",
              type: "text",
              text: { body: `ASSUMIR PRÉ-CADASTRO ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  const sameOwnerPreCadastroRes = await worker.fetch(sameOwnerPreCadastroReq, env, {});
  assert.equal(sameOwnerPreCadastroRes.status, 200);
  const afterSameOwnerPreCadastro = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(afterSameOwnerPreCadastro.corr_lock_correspondente_wa_id, correspondenteWa);

  const secondAssumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: "5511888888888",
              id: "wamid.assumir.link.smoke.second",
              timestamp: "1773183901",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: "5511888888888" }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  const secondAssumirRes = await worker.fetch(secondAssumirReq, env, {});
  assert.equal(secondAssumirRes.status, 200);
  const afterSecond = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(afterSecond.corr_lock_correspondente_wa_id, correspondenteWa);
}

// 3.1) Admin/master deve abrir caso assumido por outro correspondente.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].corr_lock_correspondente_wa_id = "5511777777777";
  env.__enovaSimulationCtx.stateByWaId[waCaso].processo_enviado_correspondente = true;
  env.__enovaSimulationCtx.stateByWaId[waCaso].corr_publicacao_status = "entregue_privado_aguardando_retorno";
  const req = new Request(`https://worker.local/correspondente/entrada?pre=000001&cw=${correspondenteWa}`, {
    method: "GET",
    headers: { "x-enova-admin-key": "adm-key" }
  });
  const res = await worker.fetch(req, env, {});
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.equal(body.includes("bypass administrativo"), true);
  assert.equal(body.includes("Resumo executivo"), true);
  assert.equal(body.includes("Token/identificador de entrada"), false);
}

// 3.1b) Compatibilidade: link legado com token continua funcionando.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].corr_lock_correspondente_wa_id = correspondenteWa;
  env.__enovaSimulationCtx.stateByWaId[waCaso].processo_enviado_correspondente = true;
  env.__enovaSimulationCtx.stateByWaId[waCaso].corr_publicacao_status = "entregue_privado_aguardando_retorno";
  const req = new Request(`https://worker.local/correspondente/entrada?t=${token}&cw=${correspondenteWa}`, { method: "GET" });
  const res = await worker.fetch(req, env, {});
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.equal(body.includes("Resumo executivo"), true);
  assert.equal(body.includes("Referência:</span> 000001"), true);
}

// 3.2) Assunção canônica no grupo sem token explícito deve funcionar quando há único caso pendente.
{
  const env = buildEnvWithState();
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.sem.token.smoke",
              timestamp: "1773183903",
              type: "text",
              text: { body: "ASSUMIR" }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  const assumirRes = await worker.fetch(assumirReq, env, {});
  assert.equal(assumirRes.status, 200);
  const atualizado = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(atualizado.corr_lock_correspondente_wa_id, correspondenteWa);
  assert.equal(atualizado.processo_enviado_correspondente, true);
}

// 3.3) CTA visual (quick reply) deve assumir via payload controlado pela Enova.
{
  const env = buildEnvWithState();
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.quick.reply.smoke",
              timestamp: "1773183904",
              type: "interactive",
              interactive: {
                type: "button",
                button_reply: {
                  id: `corr_assumir:${token}`,
                  title: "Assumir caso"
                }
              }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  const assumirRes = await worker.fetch(assumirReq, env, {});
  assert.equal(assumirRes.status, 200);
  const atualizado = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(atualizado.corr_lock_correspondente_wa_id, correspondenteWa);
  assert.equal(atualizado.processo_enviado_correspondente, true);
}

// 4) Ponte aprovado -> agendamento_visita não pode regredir.
{
  const env = buildEnvWithState();
  const req = new Request("https://worker.local/__admin__/run-canonical-suite-v1", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-enova-admin-key": "adm-key"
    },
    body: JSON.stringify({
      scenario_id: "terminal_retorno_correspondente_aprovado"
    })
  });
  const res = await worker.fetch(req, env, {});
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data?.ok, true);
  assert.equal(Number(data?.summary?.failed || 0), 0);
}

// 5) Retorno por caseRef "pré-cadastro C0518 aprovado" deve localizar wa_id correto e avançar para visita.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000518";
  env.__enovaSimulationCtx.stateByWaId["5541999990000"] = {
    ...env.__enovaSimulationCtx.stateByWaId[waCaso],
    wa_id: "5541999990000",
    nome: "MARIA TESTE",
    pre_cadastro_numero: "000001",
    corr_assumir_token: "ZX12ZX12",
    corr_lock_correspondente_wa_id: "5511777777777",
    processo_enviado_correspondente: true
  };
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.case.ref.aprovado",
              timestamp: "1773183905",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(assumirReq, env, {});
  const retornoReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.aprovado",
              timestamp: "1773183906",
              type: "text",
              text: { body: "pré-cadastro 000518 aprovado" }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  const retornoRes = await worker.fetch(retornoReq, env, {});
  assert.equal(retornoRes.status, 200);
  const alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(alvo.retorno_correspondente_status, "aprovado");
  assert.equal(alvo.fase_conversa, "agendamento_visita");
  const outro = env.__enovaSimulationCtx.stateByWaId["5541999990000"];
  assert.equal(outro.retorno_correspondente_status || null, null);
}

// 5.1) Retorno por caseRef não pode confundir refs com dígitos sobrepostos.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000518";
  env.__enovaSimulationCtx.stateByWaId["5541999990011"] = {
    ...env.__enovaSimulationCtx.stateByWaId[waCaso],
    wa_id: "5541999990011",
    nome: "OUTRO CLIENTE",
    pre_cadastro_numero: "000051",
    corr_assumir_token: "LM12LM12",
    corr_lock_correspondente_wa_id: "5511666666666",
    processo_enviado_correspondente: true
  };
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.case.ref.overlap",
              timestamp: "1773183906",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(assumirReq, env, {});

  const retornoReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.overlap",
              timestamp: "1773183907",
              type: "text",
              text: { body: "pré-cadastro 000051 aprovado" }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoReq, env, {});
  assert.equal(env.__enovaSimulationCtx.stateByWaId["5541999990011"].retorno_correspondente_status || null, null);
  assert.equal(env.__enovaSimulationCtx.stateByWaId[waCaso].retorno_correspondente_status || null, null);
}

// 6) Retorno por caseRef reprovado deve persistir status e não avançar para visita.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000518";
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.case.ref.reprovado.v2",
              timestamp: "1773183907",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(assumirReq, env, {});
  const retornoReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.reprovado.v2",
              timestamp: "1773183908",
              type: "text",
              text: { body: "000518 reprovado por score" }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoReq, env, {});
  const alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(alvo.retorno_correspondente_status, "reprovado");
  assert.equal(alvo.fase_conversa, "aguardando_retorno_correspondente");
}

// 7) Retorno por caseRef com pendência documental deve persistir e não avançar.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000518";
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.case.ref.pendencia",
              timestamp: "1773183909",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(assumirReq, env, {});
  const retornoReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.pendencia",
              timestamp: "1773183910",
              type: "text",
              text: { body: "C000518 com pendência documental: faltando comprovante de residência" }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoReq, env, {});
  const alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(alvo.retorno_correspondente_status, "pendencia_documental");
  assert.equal(alvo.fase_conversa, "aguardando_retorno_correspondente");
}

// 8) Retorno sem caseRef identificável não avança no escuro.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000518";
  const before = { ...env.__enovaSimulationCtx.stateByWaId[waCaso] };
  const retornoReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: env.CORRESPONDENTE_TO,
              author: correspondenteWa,
              id: "wamid.retorno.sem.case.ref",
              timestamp: "1773183911",
              type: "text",
              text: { body: "pré-cadastro aprovado" }
            }],
            contacts: [{ wa_id: env.CORRESPONDENTE_TO }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoReq, env, {});
  const after = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(after.fase_conversa, before.fase_conversa);
  assert.equal(after.retorno_correspondente_status || null, before.retorno_correspondente_status || null);
  const correspondenteConfirmation = env.__enovaSimulationCtx.sendPreview || null;
  assert.equal(Boolean(correspondenteConfirmation), true);
  assert.equal(correspondenteConfirmation?.to, correspondenteWa);
  assert.equal(
    String(correspondenteConfirmation?.text?.body || "").includes(CORRESPONDENTE_CASE_CONFIRMATION_PROMPT_PREFIX),
    true
  );
}

// 8.1) Retorno textual semi-estruturado deve classificar aprovado.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000518";
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.case.ref.semi.structured",
              timestamp: "1773183912",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(assumirReq, env, {});
  const retornoReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.semi.structured",
              timestamp: "1773183913",
              type: "text",
              text: { body: "Pré-cadastro # 000518\nSTATUS: CRÉDITO APROVADO" }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoReq, env, {});
  const alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(alvo.retorno_correspondente_status, "aprovado");
  assert.equal(alvo.fase_conversa, "agendamento_visita");
}

// 8.2) Retorno com PDF (caption) deve ser processado no fluxo oficial e classificar aprovado.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000518";
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.case.ref.pdf",
              timestamp: "1773183914",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(assumirReq, env, {});

  const retornoPdfReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.pdf",
              timestamp: "1773183915",
              type: "document",
              caption: "Pré-cadastro #000518 / STATUS: CRÉDITO APROVADO",
              document: {
                id: "mid.pdf.aprovado",
                filename: "retorno-000518.pdf",
                mime_type: "application/pdf"
              }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoPdfReq, env, {});
  const alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(alvo.retorno_correspondente_status, "aprovado");
  assert.equal(alvo.fase_conversa, "agendamento_visita");
}

// 8.2.1) Telemetria em document com STATUS deve registrar parse/decisão e handled sem fallback.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000006";
  const originalConsoleLog = console.log;
  const capturedProbe = [];
  console.log = (...args) => {
    const line = args.map((part) => String(part)).join(" ");
    if (line.includes("TELEMETRIA-SAFE:") && line.includes("corr_status_probe_")) {
      capturedProbe.push(line);
    }
    return originalConsoleLog(...args);
  };

  try {
    const assumirReq = new Request("https://worker.local/webhook/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: correspondenteWa,
                id: "wamid.assumir.case.ref.req.telemetry.document",
                timestamp: "1773183914",
                type: "text",
                text: { body: `ASSUMIR ${token}` }
              }],
              contacts: [{ wa_id: correspondenteWa }],
              metadata: { phone_number_id: "test" }
            }
          }]
        }]
      })
    });
    await worker.fetch(assumirReq, env, {});

    const retornoReq = new Request("https://worker.local/webhook/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: correspondenteWa,
                id: "wamid.retorno.case.ref.req.telemetry.document",
                timestamp: "1773183915",
                type: "document",
                caption: "Pré-cadastro #000006\nSTATUS: REPROVADO\nMOTIVO: restrição externa",
                document: {
                  id: "mid.pdf.telemetry.document",
                  filename: "retorno-000006.pdf",
                  mime_type: "application/pdf"
                }
              }],
              contacts: [{ wa_id: correspondenteWa }],
              metadata: { phone_number_id: "test" }
            }
          }]
        }]
      })
    });
    await worker.fetch(retornoReq, env, {});
  } finally {
    console.log = originalConsoleLog;
  }

  const telemetryPrefix = "TELEMETRIA-SAFE: ";
  const parsedEvents = capturedProbe
    .map((line) => {
      const payloadStr = line.includes(telemetryPrefix)
        ? line.slice(line.indexOf(telemetryPrefix) + telemetryPrefix.length)
        : "";
      if (!payloadStr) return null;
      const payload = JSON.parse(payloadStr);
      return {
        event: payload?.event || null,
        details: payload?.details ? JSON.parse(payload.details) : null
      };
    })
    .filter(Boolean);
  const byEvent = Object.fromEntries(parsedEvents.map((item) => [item.event, item.details]));
  assert.equal(byEvent.corr_status_probe_input?.message_type, "document");
  assert.equal(byEvent.corr_status_probe_status_parse?.status_line_found, "sim");
  assert.equal(byEvent.corr_status_probe_decision?.handled, "sim");
  assert.equal(byEvent.corr_status_probe_decision?.fallback_common_flow, "nao");
}

// 8.3) Retorno com imagem (caption) deve ser processado no fluxo oficial e classificar pendência documental.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000518";
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.case.ref.image",
              timestamp: "1773183916",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(assumirReq, env, {});

  const retornoImageReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.image",
              timestamp: "1773183917",
              type: "image",
              caption: "000518 pendência documental: faltando comprovante de residência",
              image: {
                id: "mid.image.pendencia",
                mime_type: "image/jpeg"
              }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoImageReq, env, {});
  const alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(alvo.retorno_correspondente_status, "pendencia_documental");
  assert.equal(alvo.fase_conversa, "aguardando_retorno_correspondente");
}

// 8.4) Retorno ambíguo com caseRef deve marcar revisão manual e não avançar no escuro.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000518";
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.case.ref.ambiguous",
              timestamp: "1773183918",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(assumirReq, env, {});
  const faseAntes = env.__enovaSimulationCtx.stateByWaId[waCaso].fase_conversa;

  const retornoReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.ambiguous",
              timestamp: "1773183919",
              type: "text",
              text: { body: "pré-cadastro 000518 retorno em validação interna sem conclusão final" }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoReq, env, {});
  const after = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(after.fase_conversa, faseAntes);
  assert.equal(after.retorno_correspondente_status, "nao_identificado");
  const rawPayload = JSON.parse(String(after.retorno_correspondente_bruto || "{}"));
  assert.equal(rawPayload.manual_review_required, true);
  assert.equal(rawPayload.case_ref, "000518");
  const correspondenteConfirmation = env.__enovaSimulationCtx.sendPreview || null;
  assert.equal(Boolean(correspondenteConfirmation), true);
  assert.equal(correspondenteConfirmation?.to, correspondenteWa);
  const body = String(correspondenteConfirmation?.text?.body || "");
  assert.equal(body.includes("Me confirme no formato:"), true);
  assert.equal(body.includes("STATUS: APROVADO, REPROVADO ou PENDÊNCIA"), true);
}

// 8.4b) Texto com caseRef sem STATUS claro deve pedir confirmação objetiva ao correspondente.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000006";
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.case.ref.ambiguous.000006",
              timestamp: "1773183919",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(assumirReq, env, {});
  const faseAntes = env.__enovaSimulationCtx.stateByWaId[waCaso].fase_conversa;

  const retornoReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.ambiguous.000006",
              timestamp: "1773183920",
              type: "text",
              text: { body: "Pré-cadastro #000006 recebido, aguardando confirmação interna." }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoReq, env, {});
  const after = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(after.fase_conversa, faseAntes);
  assert.equal(after.retorno_correspondente_status, "nao_identificado");
  const correspondenteConfirmation = env.__enovaSimulationCtx.sendPreview || null;
  assert.equal(Boolean(correspondenteConfirmation), true);
  assert.equal(correspondenteConfirmation?.to, correspondenteWa);
  const body = String(correspondenteConfirmation?.text?.body || "");
  assert.equal(body.includes("Me confirme no formato:"), true);
  assert.equal(body.includes("Pré-cadastro #000006"), true);
  assert.equal(body.includes("STATUS: APROVADO, REPROVADO ou PENDÊNCIA"), true);
}

// 8.5) Logger de retorno por caseRef não pode enviar case_ref como coluna top-level em enova_log.
{
  const originalFetch = globalThis.fetch;
  const capturedLogBodies = [];
  globalThis.fetch = async (input, init = {}) => {
    const rawUrl = typeof input === "string" ? input : input.url;
    const parsed = new URL(rawUrl);
    if (parsed.pathname === "/api/supabase-proxy") {
      const path = parsed.searchParams.get("path") || "";
      if (path === "/rest/v1/enova_log" && init?.body) {
        try {
          capturedLogBodies.push(JSON.parse(String(init.body)));
        } catch {
          // ignora payload não JSON para este smoke
        }
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return originalFetch(input, init);
  };

  try {
    const env = buildEnvWithState();
    env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000518";
    const assumirReq = new Request("https://worker.local/webhook/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: correspondenteWa,
                id: "wamid.assumir.case.ref.log.shape",
                timestamp: "1773183920",
                type: "text",
                text: { body: `ASSUMIR ${token}` }
              }],
              contacts: [{ wa_id: correspondenteWa }],
              metadata: { phone_number_id: "test" }
            }
          }]
        }]
      })
    });
    await worker.fetch(assumirReq, env, {});

    const retornoReq = new Request("https://worker.local/webhook/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: correspondenteWa,
                id: "wamid.retorno.case.ref.log.shape",
                timestamp: "1773183921",
                type: "text",
                text: { body: "pré-cadastro 000518 aprovado" }
              }],
              contacts: [{ wa_id: correspondenteWa }],
              metadata: { phone_number_id: "test" }
            }
          }]
        }]
      })
    });
    await worker.fetch(retornoReq, env, {});

    const processedLog = capturedLogBodies.find((item) => item?.tipo === "retorno_correspondente_case_ref_processado");
    assert.equal(Boolean(processedLog), true);
    assert.equal(Object.prototype.hasOwnProperty.call(processedLog, "case_ref"), false);
    assert.equal(processedLog?.details?.case_ref, "000518");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// 8.6) Mídia/PDF de envio_docs fora do canal do correspondente não pode ser sequestrada pelo retorno por caseRef.
{
  const env = buildEnvWithState();
  const waEnvioDocs = "5541992222333";
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000518";
  env.__enovaSimulationCtx.stateByWaId[waCaso].corr_lock_correspondente_wa_id = correspondenteWa;
  env.__enovaSimulationCtx.stateByWaId[waCaso].processo_enviado_correspondente = true;
  env.__enovaSimulationCtx.stateByWaId[waCaso].fase_conversa = "aguardando_retorno_correspondente";
  env.__enovaSimulationCtx.stateByWaId[waEnvioDocs] = {
    wa_id: waEnvioDocs,
    nome: "CLIENTE ENVIO DOCS",
    fase_conversa: "envio_docs",
    funil_status: "envio_docs",
    envio_docs_status: "pendente",
    checklist_documental: [],
    updated_at: "2026-03-18T00:00:00.000Z"
  };

  const pdfReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: waEnvioDocs,
              id: "wamid.envio.docs.pdf.case.ref",
              timestamp: "1773183922",
              type: "document",
              caption: "pré-cadastro 000518 aprovado + holerite",
              document: {
                id: "mid.envio.docs.pdf",
                filename: "holerite.pdf",
                mime_type: "application/pdf"
              }
            }],
            contacts: [{ wa_id: waEnvioDocs }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(pdfReq, env, {});

  const imageReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: waEnvioDocs,
              id: "wamid.envio.docs.image.case.ref",
              timestamp: "1773183923",
              type: "image",
              caption: "C000518 holerite",
              image: {
                id: "mid.envio.docs.image",
                mime_type: "image/jpeg"
              }
            }],
            contacts: [{ wa_id: waEnvioDocs }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(imageReq, env, {});

  const stEnvioDocs = env.__enovaSimulationCtx.stateByWaId[waEnvioDocs];
  assert.equal(stEnvioDocs?.fase_conversa, "envio_docs");
  assert.equal(env.__enovaSimulationCtx.stateByWaId[waCaso].retorno_correspondente_status || null, null);
}

// 9) Lookup por ?pre deve funcionar também quando o proxy retorna envelope { data: [...] }.
{
  const originalFetch = globalThis.fetch;
  const waId = "5541991111222";
  const correspondenteLock = "5511999999999";
  const caseRef = "000004";
  const stateRow = {
    wa_id: waId,
    nome: "CASO PROXY DATA",
    fase_conversa: "aguardando_retorno_correspondente",
    pre_cadastro_numero: caseRef,
    corr_publicacao_status: "entregue_privado_aguardando_retorno",
    corr_lock_correspondente_wa_id: correspondenteLock,
    processo_enviado_correspondente: true,
    updated_at: "2026-03-20T10:00:00.000Z"
  };
  globalThis.fetch = async (input, init) => {
    const rawUrl = typeof input === "string" ? input : input.url;
    const parsed = new URL(rawUrl);
    if (parsed.pathname !== "/api/supabase-proxy") {
      return originalFetch(input, init);
    }
    const waFilter = parsed.searchParams.get("wa_id") || "";
    const preFilter = parsed.searchParams.get("pre_cadastro_numero") || "";
    const rows = [];
    if (waFilter === `eq.${waId}` || preFilter === `eq.${caseRef}`) {
      rows.push({ ...stateRow });
    }
    return new Response(JSON.stringify({ data: rows }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const env = {
      ENV_MODE: "test",
      ENOVA_ADMIN_KEY: "adm-key",
      VERCEL_PROXY_URL: "https://proxy.example.com",
      SUPABASE_SERVICE_ROLE: "service-role",
      META_API_VERSION: "v20.0",
      PHONE_NUMBER_ID: "123456",
      WHATS_TOKEN: "token",
      META_VERIFY_TOKEN: "verify"
    };
    const req = new Request(`https://worker.local/correspondente/entrada?pre=${caseRef}&cw=${correspondenteLock}`, { method: "GET" });
    const res = await worker.fetch(req, env, {});
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.equal(body.includes("Referência:</span> 000004"), true);
    assert.equal(body.includes("Resumo executivo"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// 10) Retorno textual simples "000006 aprovado" deve funcionar com âncora numérica mínima.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000006";
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.case.ref.simple.000006",
              timestamp: "1773183924",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(assumirReq, env, {});
  const retornoReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.simple.000006",
              timestamp: "1773183925",
              type: "text",
              text: { body: "000006 aprovado" }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoReq, env, {});
  const alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(alvo.retorno_correspondente_status, "aprovado");
  assert.equal(alvo.fase_conversa, "agendamento_visita");
}

// 11) "CREDITO APROVADO" + "POSSUI PENDENCIAS" deve classificar como aprovado_condicionado.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "112972";
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.case.ref.aprovado.condicionada",
              timestamp: "1773183926",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(assumirReq, env, {});
  const retornoReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.aprovado.condicionada",
              timestamp: "1773183927",
              type: "text",
              text: { body: "Pré-cadastro # 112972\nCREDITO APROVADO\nPOSSUI PENDENCIAS" }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoReq, env, {});
  const alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(alvo.retorno_correspondente_status, "aprovado_condicionado");
  assert.equal(alvo.fase_conversa, "agendamento_visita");
}

// 12) "CREDITO REPROVADO" + "restrição externa" deve classificar reprovado.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "112779";
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.case.ref.reprovado",
              timestamp: "1773183928",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(assumirReq, env, {});
  const retornoReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.reprovado",
              timestamp: "1773183929",
              type: "text",
              text: { body: "Pré-cadastro # 112779\nCREDITO REPROVADO\nProponente/grupo familiar possui restrição externa." }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoReq, env, {});
  const alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(alvo.retorno_correspondente_status, "reprovado");
  assert.equal(alvo.fase_conversa, "aguardando_retorno_correspondente");
}

// 13) "POSSUI CADIN" e "COMPROMETIMENTO DE RENDA" devem ficar em pendencia_risco.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "112753";
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.case.ref.risco",
              timestamp: "1773183930",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(assumirReq, env, {});
  const retornoCadinReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.risco.cadin",
              timestamp: "1773183931",
              type: "text",
              text: { body: "Pré-cadastro # 112753\nSTATUS: CRÉDITO APROVADO\nPOSSUI CADIN" }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoCadinReq, env, {});
  let alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(alvo.retorno_correspondente_status, "pendencia_risco");
  assert.equal(alvo.fase_conversa, "aguardando_retorno_correspondente");

  env.__enovaSimulationCtx.stateByWaId[waCaso].retorno_correspondente_status = null;
  const retornoComprometimentoReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.risco.comprometimento",
              timestamp: "1773183932",
              type: "text",
              text: { body: "Pré-cadastro # 112753\nSTATUS: CRÉDITO APROVADO\nPOSSUI COMPROMETIMENTO DE RENDA" }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoComprometimentoReq, env, {});
  alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(alvo.retorno_correspondente_status, "pendencia_risco");
}

// 14) "FICHA - 61109.pdf" + "APROVADO 30%" + pendências deve ancorar no arquivo e classificar aprovado_condicionado.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "061109";
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.case.ref.ficha",
              timestamp: "1773183933",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(assumirReq, env, {});
  const retornoReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.ficha",
              timestamp: "1773183934",
              type: "document",
              caption: "APROVADO 30%\nPendências: IRPF, holerite e CTPS",
              document: {
                id: "mid.pdf.ficha.61109",
                filename: "FICHA - 61109.pdf",
                mime_type: "application/pdf"
              }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoReq, env, {});
  const alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(alvo.retorno_correspondente_status, "aprovado_condicionado");
}

// 15) Probe temporária: retorno real deve evidenciar handler case_ref com handled=true e sem fallback comum.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000006";
  const capturedProbe = [];
  const originalConsoleLog = console.log;
  console.log = (...args) => {
    const line = args.map((x) => String(x)).join(" ");
    if (line.includes("corr_route_probe_")) capturedProbe.push(line);
    originalConsoleLog(...args);
  };
  try {
    const assumirReq = new Request("https://worker.local/webhook/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: correspondenteWa,
                id: "wamid.assumir.case.ref.probe.000006",
                timestamp: "1773183935",
                type: "text",
                text: { body: `ASSUMIR ${token}` }
              }],
              contacts: [{ wa_id: correspondenteWa }],
              metadata: { phone_number_id: "test" }
            }
          }]
        }]
      })
    });
    await worker.fetch(assumirReq, env, {});
    const retornoReq = new Request("https://worker.local/webhook/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: correspondenteWa,
                id: "wamid.retorno.case.ref.probe.000006",
                timestamp: "1773183936",
                type: "text",
                text: { body: "Pré-cadastro # 000006 / STATUS: CRÉDITO APROVADO" }
              }],
              contacts: [{ wa_id: correspondenteWa }],
              metadata: { phone_number_id: "test" }
            }
          }]
        }]
      })
    });
    await worker.fetch(retornoReq, env, {});
  } finally {
    console.log = originalConsoleLog;
  }

  const attemptLine = capturedProbe.find((line) => line.includes("corr_route_probe_case_ref_attempt"));
  assert.equal(Boolean(attemptLine), true);
  const telemetryPrefix = "TELEMETRIA-SAFE: ";
  const payloadStr = attemptLine.includes(telemetryPrefix)
    ? attemptLine.slice(attemptLine.indexOf(telemetryPrefix) + telemetryPrefix.length)
    : "";
  const payload = payloadStr ? JSON.parse(payloadStr) : null;
  const details = payload?.details ? JSON.parse(payload.details) : null;
  assert.equal(Boolean(details), true);
  assert.equal(details.handled, true);
  assert.equal(details.fallback_common_flow, "nao");
}

// 16) Requisitos operacionais: imagem com caption em formato STATUS deve classificar e levar para visita.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000006";
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.case.ref.req.image.aprovado",
              timestamp: "1773183937",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(assumirReq, env, {});
  const retornoReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.req.image.aprovado",
              timestamp: "1773183938",
              type: "image",
              caption: "Pré-cadastro #000006\nSTATUS: CRÉDITO APROVADO",
              image: { id: "mid.image.req.aprovado", mime_type: "image/jpeg" }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoReq, env, {});
  const alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(alvo.retorno_correspondente_status, "aprovado");
  assert.equal(alvo.fase_conversa, "agendamento_visita");
}

// 17) Requisitos operacionais: imagem reprovado + motivo não vai para visita.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000006";
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.case.ref.req.reprovado",
              timestamp: "1773183939",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(assumirReq, env, {});
  const retornoReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.req.reprovado",
              timestamp: "1773183940",
              type: "image",
              caption: "Pré-cadastro #000006\nSTATUS: REPROVADO\nMOTIVO: restrição externa",
              image: { id: "mid.image.req.reprovado", mime_type: "image/jpeg" }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoReq, env, {});
  const alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(alvo.retorno_correspondente_status, "reprovado");
  assert.equal(alvo.fase_conversa, "aguardando_retorno_correspondente");
}

// 18) Requisitos operacionais: imagem pendência + motivo documental não vai para visita.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000006";
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.case.ref.req.pendencia",
              timestamp: "1773183941",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(assumirReq, env, {});
  const retornoReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.req.pendencia",
              timestamp: "1773183942",
              type: "image",
              caption: "Pré-cadastro #000006\nSTATUS: PENDÊNCIA\nMOTIVO: comprovante de renda",
              image: { id: "mid.image.req.pendencia", mime_type: "image/jpeg" }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoReq, env, {});
  const alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(alvo.retorno_correspondente_status, "pendencia_documental");
  assert.equal(alvo.fase_conversa, "aguardando_retorno_correspondente");
}

// 19) Requisitos operacionais: aprovado_condicionado deve seguir para visita.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000006";
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.case.ref.req.aprovado.condicionado",
              timestamp: "1773183943",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(assumirReq, env, {});
  const retornoReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.req.aprovado.condicionado",
              timestamp: "1773183944",
              type: "text",
              text: { body: "Pré-cadastro #000006\nSTATUS: APROVADO 30%\nMOTIVO: aprovado com pendências" }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoReq, env, {});
  const alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(alvo.retorno_correspondente_status, "aprovado_condicionado");
  assert.equal(alvo.fase_conversa, "agendamento_visita");
}

// 20) Requisitos operacionais: STATUS APROVADO (texto puro) deve ir para visita.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000006";
  const assumirReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.assumir.case.ref.req.aprovado.textual",
              timestamp: "1773183945",
              type: "text",
              text: { body: `ASSUMIR ${token}` }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(assumirReq, env, {});
  const retornoReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.req.aprovado.textual",
              timestamp: "1773183946",
              type: "text",
              text: { body: "Pré-cadastro #000006\nSTATUS: APROVADO" }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
  await worker.fetch(retornoReq, env, {});
  const alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(alvo.retorno_correspondente_status, "aprovado");
  assert.equal(alvo.fase_conversa, "agendamento_visita");
}

// 21) Telemetria objetiva do probe de STATUS deve registrar etapas e decisão também no fluxo de imagem.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000006";
  const originalConsoleLog = console.log;
  const capturedProbe = [];
  console.log = (...args) => {
    const line = args.map((part) => String(part)).join(" ");
    if (line.includes("TELEMETRIA-SAFE:") && line.includes("corr_status_probe_")) {
      capturedProbe.push(line);
    }
    return originalConsoleLog(...args);
  };

  try {
    const assumirReq = new Request("https://worker.local/webhook/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: correspondenteWa,
                id: "wamid.assumir.case.ref.req.telemetry",
                timestamp: "1773183947",
                type: "text",
                text: { body: `ASSUMIR ${token}` }
              }],
              contacts: [{ wa_id: correspondenteWa }],
              metadata: { phone_number_id: "test" }
            }
          }]
        }]
      })
    });
    await worker.fetch(assumirReq, env, {});
    const retornoReq = new Request("https://worker.local/webhook/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: correspondenteWa,
                id: "wamid.retorno.case.ref.req.telemetry",
                timestamp: "1773183948",
                type: "image",
                caption: "Pré-cadastro #000006\nSTATUS: REPROVADO\nMOTIVO: restrição externa",
                image: { id: "mid.image.req.telemetry", mime_type: "image/jpeg" }
              }],
              contacts: [{ wa_id: correspondenteWa }],
              metadata: { phone_number_id: "test" }
            }
          }]
        }]
      })
    });
    await worker.fetch(retornoReq, env, {});
  } finally {
    console.log = originalConsoleLog;
  }

  const telemetryPrefix = "TELEMETRIA-SAFE: ";
  const parsedEvents = capturedProbe
    .map((line) => {
      const payloadStr = line.includes(telemetryPrefix)
        ? line.slice(line.indexOf(telemetryPrefix) + telemetryPrefix.length)
        : "";
      if (!payloadStr) return null;
      const payload = JSON.parse(payloadStr);
      return {
        event: payload?.event || null,
        details: payload?.details ? JSON.parse(payload.details) : null
      };
    })
    .filter(Boolean);
  const byEvent = Object.fromEntries(parsedEvents.map((item) => [item.event, item.details]));

  assert.equal(byEvent.corr_status_probe_input?.case_ref_extracted, "000006");
  assert.equal(byEvent.corr_status_probe_input?.message_type, "image");
  assert.equal(byEvent.corr_status_probe_input?.text_source_used, "meta_text");
  assert.equal(byEvent.corr_status_probe_status_parse?.status_line_found, "sim");
  assert.equal(byEvent.corr_status_probe_status_parse?.status_normalized, "reprovado");
  assert.equal(byEvent.corr_status_probe_decision?.handled, "sim");
  assert.equal(byEvent.corr_status_probe_decision?.fallback_common_flow, "nao");
  assert.equal(byEvent.corr_status_probe_client_dispatch?.client_wa_id_found, "sim");
  assert.equal(byEvent.corr_status_probe_client_dispatch?.dispatch_target, "reprovado");
}

// 22) Hotfix textual urgente: caso explícito + status válido deve validar lock do caso antes do fallback comum.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000006";
  const originalConsoleLog = console.log;
  const capturedProbe = [];
  console.log = (...args) => {
    const line = args.map((part) => String(part)).join(" ");
    if (line.includes("TELEMETRIA-SAFE:") && (line.includes("corr_status_probe_") || line.includes("corr_sender_gate_probe") || line.includes("corr_flow_probe_"))) {
      capturedProbe.push(line);
    }
    return originalConsoleLog(...args);
  };

  try {
    const retornoReq = new Request("https://worker.local/webhook/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: "5511888888888",
                id: "wamid.retorno.case.ref.req.hotfix.untrusted.text",
                timestamp: "1773183949",
                type: "text",
                text: { body: "Pré-cadastro #000006\nSTATUS: CRÉDITO APROVADO" }
              }],
              contacts: [{ wa_id: "5511888888888" }],
              metadata: { phone_number_id: "test" }
            }
          }]
        }]
      })
    });
    await worker.fetch(retornoReq, env, {});
  } finally {
    console.log = originalConsoleLog;
  }

  const telemetryPrefix = "TELEMETRIA-SAFE: ";
  const parsedEvents = capturedProbe
    .map((line) => {
      const payloadStr = line.includes(telemetryPrefix)
        ? line.slice(line.indexOf(telemetryPrefix) + telemetryPrefix.length)
        : "";
      if (!payloadStr) return null;
      const payload = JSON.parse(payloadStr);
      return {
        event: payload?.event || null,
        details: payload?.details ? JSON.parse(payload.details) : null
      };
    })
    .filter(Boolean);
  const byEvent = Object.fromEntries(parsedEvents.map((item) => [item.event, item.details]));

  assert.equal(byEvent.corr_status_probe_input?.case_ref_extracted, "000006");
  assert.equal(byEvent.corr_status_probe_input?.message_type, "text");
  assert.equal(byEvent.corr_status_probe_status_parse?.status_line_found, "sim");
  assert.equal(byEvent.corr_status_probe_status_parse?.status_normalized, "aprovado");
  assert.equal(byEvent.corr_status_probe_decision?.status_classificado, "aprovado");
  assert.equal(byEvent.corr_sender_gate_probe?.decision_reason, "case_lock_missing_without_unique_sender_case");
  assert.equal(byEvent.corr_status_probe_decision?.handled, "sim");
  assert.equal(byEvent.corr_status_probe_decision?.fallback_common_flow, "nao");
  assert.equal(byEvent.corr_flow_probe_enter?.entered_correspondente_handler, true);
  assert.equal(byEvent.corr_flow_probe_common_fallback?.fallback_common_flow, "sim");
}

// 23) lock mismatch em case_ref explícito deve bloquear tratamento operacional.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000006";
  env.__enovaSimulationCtx.stateByWaId[waCaso].corr_lock_correspondente_wa_id = "whatsapp:+55 (11) 99999-9999@s.whatsapp.net";
  const originalConsoleLog = console.log;
  const capturedProbe = [];
  console.log = (...args) => {
    const line = args.map((part) => String(part)).join(" ");
    if (line.includes("TELEMETRIA-SAFE:") && (line.includes("corr_status_probe_") || line.includes("corr_sender_gate_probe") || line.includes("corr_flow_probe_"))) {
      capturedProbe.push(line);
    }
    return originalConsoleLog(...args);
  };

  try {
    const retornoReq = new Request("https://worker.local/webhook/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: "5511999999999",
                id: "wamid.retorno.case.ref.req.hotfix.lock.normalized.match",
                timestamp: "1773183949",
                type: "text",
                text: { body: "Pré-cadastro #000006\nSTATUS: APROVADO" }
              }],
              contacts: [{ wa_id: "5511999999999" }],
              metadata: { phone_number_id: "test" }
            }
          }]
        }]
      })
    });
    await worker.fetch(retornoReq, env, {});
  } finally {
    console.log = originalConsoleLog;
  }

  const telemetryPrefix = "TELEMETRIA-SAFE: ";
  const parsedEvents = capturedProbe
    .map((line) => {
      const payloadStr = line.includes(telemetryPrefix)
        ? line.slice(line.indexOf(telemetryPrefix) + telemetryPrefix.length)
        : "";
      if (!payloadStr) return null;
      const payload = JSON.parse(payloadStr);
      return {
        event: payload?.event || null,
        details: payload?.details ? JSON.parse(payload.details) : null
      };
    })
    .filter(Boolean);
  const byEvent = Object.fromEntries(parsedEvents.map((item) => [item.event, item.details]));
  const alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];

  assert.equal(byEvent.corr_sender_gate_probe?.case_ref, "000006");
  assert.equal(byEvent.corr_sender_gate_probe?.from_wa_id_raw, "5511999999999");
  assert.equal(byEvent.corr_sender_gate_probe?.from_wa_id_normalized, "5511999999999");
  assert.equal(byEvent.corr_sender_gate_probe?.lock_wa_id_raw, "whatsapp:+55 (11) 99999-9999@s.whatsapp.net");
  assert.equal(byEvent.corr_sender_gate_probe?.lock_wa_id_normalized, "5511999999999");
  assert.equal(byEvent.corr_sender_gate_probe?.lock_match, "sim");
  assert.equal(byEvent.corr_sender_gate_probe?.decision_reason, "case_lock_match");
  assert.equal(byEvent.corr_status_probe_decision?.handled, "sim");
  assert.equal(byEvent.corr_status_probe_decision?.fallback_common_flow, "nao");
  assert.equal(alvo.retorno_correspondente_status, "aprovado");
  assert.equal(alvo.fase_conversa, "agendamento_visita");
  assert.equal(alvo.corr_lock_correspondente_wa_id, "whatsapp:+55 (11) 99999-9999@s.whatsapp.net");
}

// 24) lock mismatch em case_ref explícito deve bloquear tratamento operacional.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000006";
  env.__enovaSimulationCtx.stateByWaId[waCaso].corr_lock_correspondente_wa_id = correspondenteWa;
  const originalConsoleLog = console.log;
  const capturedProbe = [];
  console.log = (...args) => {
    const line = args.map((part) => String(part)).join(" ");
    if (line.includes("TELEMETRIA-SAFE:") && (line.includes("corr_status_probe_") || line.includes("corr_sender_gate_probe") || line.includes("corr_flow_probe_"))) {
      capturedProbe.push(line);
    }
    return originalConsoleLog(...args);
  };

  try {
    const retornoReq = new Request("https://worker.local/webhook/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: "5511888888888",
                id: "wamid.retorno.case.ref.req.hotfix.lock.mismatch",
                timestamp: "1773183950",
                type: "text",
                text: { body: "Pré-cadastro #000006\nSTATUS: REPROVADO\nMOTIVO: restrição externa" }
              }],
              contacts: [{ wa_id: "5511888888888" }],
              metadata: { phone_number_id: "test" }
            }
          }]
        }]
      })
    });
    await worker.fetch(retornoReq, env, {});
  } finally {
    console.log = originalConsoleLog;
  }

  const telemetryPrefix = "TELEMETRIA-SAFE: ";
  const parsedEvents = capturedProbe
    .map((line) => {
      const payloadStr = line.includes(telemetryPrefix)
        ? line.slice(line.indexOf(telemetryPrefix) + telemetryPrefix.length)
        : "";
      if (!payloadStr) return null;
      const payload = JSON.parse(payloadStr);
      return {
        event: payload?.event || null,
        details: payload?.details ? JSON.parse(payload.details) : null
      };
    })
    .filter(Boolean);
  const byEvent = Object.fromEntries(parsedEvents.map((item) => [item.event, item.details]));

  assert.equal(byEvent.corr_sender_gate_probe?.case_ref, "000006");
  assert.equal(byEvent.corr_sender_gate_probe?.from_wa_id_raw, "5511888888888");
  assert.equal(byEvent.corr_sender_gate_probe?.from_wa_id_normalized, "5511888888888");
  assert.equal(byEvent.corr_sender_gate_probe?.lock_wa_id_raw, "5511999999999");
  assert.equal(byEvent.corr_sender_gate_probe?.lock_wa_id_normalized, "5511999999999");
  assert.equal(byEvent.corr_sender_gate_probe?.used_case_lock, "sim");
  assert.equal(byEvent.corr_sender_gate_probe?.lock_match, "nao");
  assert.equal(byEvent.corr_sender_gate_probe?.decision_reason, "case_lock_mismatch");
  assert.equal(byEvent.corr_status_probe_decision?.handled, "sim");
  assert.equal(byEvent.corr_status_probe_decision?.fallback_common_flow, "nao");
  assert.equal(byEvent.corr_flow_probe_confirm_exit?.case_ref, "000006");
  assert.equal(byEvent.corr_flow_probe_confirm_exit?.handled, true);
  assert.equal(byEvent.corr_flow_probe_confirm_exit?.confirmation_requested, false);
  assert.equal(byEvent.corr_flow_probe_confirm_exit?.stopped_before_common_flow, true);
}

// 25) sem lock salvo + remetente com 1 caso ativo compatível deve passar no fallback seguro.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000006";
  env.__enovaSimulationCtx.stateByWaId[waCaso].corr_lock_correspondente_wa_id = null;
  env.__enovaSimulationCtx.stateByWaId[waCaso].processo_enviado_correspondente = true;
  env.__enovaSimulationCtx.stateByWaId[waCaso].aguardando_retorno_correspondente = true;
  const originalConsoleLog = console.log;
  const capturedProbe = [];
  console.log = (...args) => {
    const line = args.map((part) => String(part)).join(" ");
    if (line.includes("TELEMETRIA-SAFE:") && (line.includes("corr_status_probe_") || line.includes("corr_sender_gate_probe") || line.includes("corr_flow_probe_"))) {
      capturedProbe.push(line);
    }
    return originalConsoleLog(...args);
  };

  try {
    const retornoReq = new Request("https://worker.local/webhook/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: correspondenteWa,
                author: correspondenteWa,
                id: "wamid.retorno.case.ref.req.hotfix.single.fallback",
                timestamp: "1773183951",
                type: "text",
                text: { body: "Pré-cadastro #000006\nSTATUS: APROVADO" }
              }],
              contacts: [{ wa_id: correspondenteWa }],
              metadata: { phone_number_id: "test" }
            }
          }]
        }]
      })
    });
    await worker.fetch(retornoReq, env, {});
  } finally {
    console.log = originalConsoleLog;
  }

  const telemetryPrefix = "TELEMETRIA-SAFE: ";
  const parsedEvents = capturedProbe
    .map((line) => {
      const payloadStr = line.includes(telemetryPrefix)
        ? line.slice(line.indexOf(telemetryPrefix) + telemetryPrefix.length)
        : "";
      if (!payloadStr) return null;
      const payload = JSON.parse(payloadStr);
      return {
        event: payload?.event || null,
        details: payload?.details ? JSON.parse(payload.details) : null
      };
    })
    .filter(Boolean);
  const byEvent = Object.fromEntries(parsedEvents.map((item) => [item.event, item.details]));

  assert.equal(byEvent.corr_sender_gate_probe?.used_case_lock, "nao");
  assert.equal(byEvent.corr_sender_gate_probe?.used_unique_sender_case_fallback, "sim");
  assert.equal(byEvent.corr_status_probe_decision?.handled, "sim");
  assert.equal(byEvent.corr_status_probe_decision?.fallback_common_flow, "nao");
}

// 26) ambiguidade real de mais de um caso ativo para o remetente deve bloquear.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000006";
  env.__enovaSimulationCtx.stateByWaId[waCaso].corr_lock_correspondente_wa_id = null;
  env.__enovaSimulationCtx.stateByWaId[waCaso].processo_enviado_correspondente = true;
  env.__enovaSimulationCtx.stateByWaId[waCaso].aguardando_retorno_correspondente = true;
  env.__enovaSimulationCtx.stateByWaId["5541999997777"] = {
    ...env.__enovaSimulationCtx.stateByWaId[waCaso],
    wa_id: "5541999997777",
    nome: "SEGUNDO CASO",
    pre_cadastro_numero: "000777",
    corr_assumir_token: "YY12YY12",
    corr_lock_correspondente_wa_id: correspondenteWa,
    processo_enviado_correspondente: true,
    aguardando_retorno_correspondente: true
  };
  env.__enovaSimulationCtx.stateByWaId["5541999996666"] = {
    ...env.__enovaSimulationCtx.stateByWaId[waCaso],
    wa_id: "5541999996666",
    nome: "TERCEIRO CASO",
    pre_cadastro_numero: "000666",
    corr_assumir_token: "ZZ12ZZ12",
    corr_lock_correspondente_wa_id: correspondenteWa,
    processo_enviado_correspondente: true,
    aguardando_retorno_correspondente: true
  };
  const originalConsoleLog = console.log;
  const capturedProbe = [];
  console.log = (...args) => {
    const line = args.map((part) => String(part)).join(" ");
    if (line.includes("TELEMETRIA-SAFE:") && (line.includes("corr_status_probe_") || line.includes("corr_sender_gate_probe") || line.includes("corr_flow_probe_"))) {
      capturedProbe.push(line);
    }
    return originalConsoleLog(...args);
  };

  try {
    const retornoReq = new Request("https://worker.local/webhook/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: correspondenteWa,
                author: correspondenteWa,
                id: "wamid.retorno.case.ref.req.hotfix.ambiguous",
                timestamp: "1773183952",
                type: "text",
                text: { body: "Pré-cadastro #000006\nSTATUS: APROVADO" }
              }],
              contacts: [{ wa_id: correspondenteWa }],
              metadata: { phone_number_id: "test" }
            }
          }]
        }]
      })
    });
    await worker.fetch(retornoReq, env, {});
  } finally {
    console.log = originalConsoleLog;
  }

  const telemetryPrefix = "TELEMETRIA-SAFE: ";
  const parsedEvents = capturedProbe
    .map((line) => {
      const payloadStr = line.includes(telemetryPrefix)
        ? line.slice(line.indexOf(telemetryPrefix) + telemetryPrefix.length)
        : "";
      if (!payloadStr) return null;
      const payload = JSON.parse(payloadStr);
      return {
        event: payload?.event || null,
        details: payload?.details ? JSON.parse(payload.details) : null
      };
    })
    .filter(Boolean);
  const byEvent = Object.fromEntries(parsedEvents.map((item) => [item.event, item.details]));

  assert.equal(byEvent.corr_sender_gate_probe?.used_unique_sender_case_fallback, "nao");
  assert.equal(byEvent.corr_sender_gate_probe?.decision_reason, "sender_case_ambiguity");
  assert.equal(byEvent.corr_status_probe_decision?.handled, "sim");
  assert.equal(byEvent.corr_status_probe_decision?.fallback_common_flow, "nao");
  assert.equal(byEvent.corr_flow_probe_confirm_exit?.case_ref, "000006");
  assert.equal(byEvent.corr_flow_probe_confirm_exit?.handled, true);
  assert.equal(byEvent.corr_flow_probe_confirm_exit?.confirmation_requested, true);
  assert.equal(byEvent.corr_flow_probe_confirm_exit?.stopped_before_common_flow, true);
}

// 27) diagnóstico read-only do ciclo completo do wa_id (entrada -> lock save -> lock read -> compare).
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "000518";
  const originalConsoleLog = console.log;
  const capturedProbe = [];
  console.log = (...args) => {
    const line = args.map((part) => String(part)).join(" ");
    if (line.includes("TELEMETRIA-SAFE:") && (line.includes("corr_waid_probe_") || line.includes("corr_sender_gate_probe") || line.includes("corr_status_probe_decision"))) {
      capturedProbe.push(line);
    }
    return originalConsoleLog(...args);
  };

  try {
    const assumirReq = new Request("https://worker.local/webhook/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: "554197780518",
                id: "wamid.assumir.readonly.waid.probe",
                timestamp: "1773183960",
                type: "text",
                text: { body: `ASSUMIR ${token}` }
              }],
              contacts: [{ wa_id: "554197780518" }],
              metadata: { phone_number_id: "test" }
            }
          }]
        }]
      })
    });
    await worker.fetch(assumirReq, env, {});

    const retornoReq = new Request("https://worker.local/webhook/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: "4197780518",
                id: "wamid.retorno.readonly.waid.probe",
                timestamp: "1773183961",
                type: "text",
                text: { body: "Pré-cadastro #000518\nSTATUS: APROVADO" }
              }],
              contacts: [{ wa_id: "4197780518" }],
              metadata: { phone_number_id: "test" }
            }
          }]
        }]
      })
    });
    await worker.fetch(retornoReq, env, {});
  } finally {
    console.log = originalConsoleLog;
  }

  const telemetryPrefix = "TELEMETRIA-SAFE: ";
  const parsedEvents = capturedProbe
    .map((line) => {
      const payloadStr = line.includes(telemetryPrefix)
        ? line.slice(line.indexOf(telemetryPrefix) + telemetryPrefix.length)
        : "";
      if (!payloadStr) return null;
      const payload = JSON.parse(payloadStr);
      return {
        event: payload?.event || null,
        details: payload?.details ? JSON.parse(payload.details) : null
      };
    })
    .filter(Boolean);
  const groupedByEvent = parsedEvents.reduce((acc, item) => {
    if (!acc[item.event]) acc[item.event] = [];
    acc[item.event].push(item.details);
    return acc;
  }, {});
  const lastByEvent = Object.fromEntries(
    Object.entries(groupedByEvent).map(([event, details]) => [event, details[details.length - 1]])
  );
  const firstLockSave = groupedByEvent.corr_waid_probe_lock_save?.[0] || null;

  assert.equal(firstLockSave?.case_ref, "000518");
  assert.equal(firstLockSave?.lock_wa_id_before_save, null);
  assert.equal(firstLockSave?.lock_wa_id_saved, "554197780518");
  assert.equal(firstLockSave?.function_used, "normalizeCorrespondenteWaIdInput");

  assert.equal(lastByEvent.corr_waid_probe_input?.from_wa_id_raw, "4197780518");
  assert.equal(lastByEvent.corr_waid_probe_input?.from_wa_id_normalized, "4197780518");
  assert.equal(lastByEvent.corr_waid_probe_input?.function_used, "normalizeCorrespondenteWaIdInput");

  assert.equal(lastByEvent.corr_waid_probe_lock_read?.case_ref, "000518");
  assert.equal(lastByEvent.corr_waid_probe_lock_read?.lock_wa_id_raw, "554197780518");
  assert.equal(lastByEvent.corr_waid_probe_lock_read?.lock_wa_id_normalized, "554197780518");

  assert.equal(lastByEvent.corr_waid_probe_compare?.case_ref, "000518");
  assert.equal(lastByEvent.corr_waid_probe_compare?.from_wa_id_normalized, "4197780518");
  assert.equal(lastByEvent.corr_waid_probe_compare?.lock_wa_id_normalized, "554197780518");
  assert.equal(lastByEvent.corr_waid_probe_compare?.lock_match, "nao");
  assert.equal(lastByEvent.corr_waid_probe_compare?.decision_reason, "case_lock_mismatch");
  assert.equal(lastByEvent.corr_sender_gate_probe?.decision_reason, "case_lock_mismatch");
  assert.equal(lastByEvent.corr_status_probe_decision?.decision_reason, "corr_return_case_ref_locked_other_sender_mismatch");
}

console.log("correspondente_entry_link.smoke: ok");
