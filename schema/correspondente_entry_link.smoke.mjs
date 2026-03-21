import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;
const { buildCorrespondenteGroupAlert } = workerModule;

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

// 2) GET antes da assunção: bloqueia acesso e orienta assunção no grupo.
{
  const env = buildEnvWithState();
  const req = new Request("https://worker.local/correspondente/entrada?pre=000001", { method: "GET" });
  const res = await worker.fetch(req, env, {});
  const body = await res.text();
  assert.equal(res.status, 403);
  assert.equal(body.includes("A assunção ocorre na mensagem de distribuição do grupo"), true);
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
              id: "wamid.assumir.case.ref.reprovado",
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
              id: "wamid.retorno.case.ref.reprovado",
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

console.log("correspondente_entry_link.smoke: ok");
