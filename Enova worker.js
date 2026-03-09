console.log("DEBUG-INIT-1: Worker carregou até o topo do arquivo");

const ENOVA_BUILD = "enova-meta-debug-stamp-2026-02-11";

function getSimulationContext(env) {
  return env && env.__enovaSimulationCtx ? env.__enovaSimulationCtx : null;
}

// =============================================================
// 🧱 A1 — step() + sendMessage() + logger()
// =============================================================
console.log("DEBUG-INIT-2: Passou da seção A1 e o Worker continua carregando");

// =============================================================
// 🧱 A6 — STEP com TELEMETRIA TOTAL (blindagem máxima)
// =============================================================
async function step(env, st, messages, nextStage) {

  const simCtx = getSimulationContext(env);
  const isSim = Boolean(simCtx?.active);

  // Converte sempre para array
    const rawArr = Array.isArray(messages) ? messages : [messages];
  const cognitivePrefix = String(st?.__cognitive_reply_prefix || "").trim();

  const arr = cognitivePrefix
    ? [cognitivePrefix, ...rawArr].filter(Boolean)
    : rawArr.filter(Boolean);

  // limpa prefixo transitório para não vazar para próximas respostas
  st.__cognitive_reply_prefix = null;

  // 🔥 AQUI: aplica modo humano (somente se ativo)
  const msgs = modoHumanoRender(st, arr);

  if (isSim) {
    simCtx.messageLog = Array.isArray(simCtx.messageLog) ? simCtx.messageLog : [];
    simCtx.messageLog.push({
      wa_id: st?.wa_id || null,
      stage_before: st?.fase_conversa || "inicio",
      stage_after: nextStage || st?.fase_conversa || null,
      messages: msgs
    });
  }

  try {
    // ============================================================
    // 🛰 TELEMETRIA — Saída / transição de estágio (geral)
    // ============================================================
    await telemetry(env, {
      wa_id: st.wa_id,
      event: "funnel_output",
      stage: st.fase_conversa || "inicio",
      next_stage: nextStage || null,
      severity: "info",
      message: "Saída do step() — transição de fase",
      details: {
        messages_out: msgs,
        stage_before: st.fase_conversa,
        stage_after: nextStage,
        last_user_text: st.last_user_text || null,
        array_len: msgs.length,
        first_msg: msgs[0],
        last_msg: msgs[msgs.length - 1]
      }
    });

    // ============================================================
    // 🛰 TELEMETRIA — LEAVE_STAGE (funil interno)
    // ============================================================
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "leave_stage",
      from_stage: st.fase_conversa || "inicio",
      to_stage: nextStage,
      user_text: st.last_user_text || null,
      severity: "info",
      message: "Transição de estágio detectada (LEAVE_STAGE)"
    });

    // ============================================================
    // Atualiza estado do funil
    // ============================================================
    if (nextStage) {

      // 🔍 LOG PARA DEBUGAR SE A FASE ESTÁ SENDO ATUALIZADA
      console.log("UPDATE_FASE:", {
        wa_id: st.wa_id,
        before: st.fase_conversa,
        after: nextStage
      });

      // ✅ SIMULAÇÃO: atualiza o state em memória (sem IO real)
      if (isSim) {
        st.fase_conversa = nextStage;
        st.last_bot_msg = msgs[msgs.length - 1] || null;

        await upsertState(env, st.wa_id, {
          fase_conversa: nextStage,
          last_bot_msg: msgs[msgs.length - 1] || null
        });
      } else {
        // Atualiza estado no Supabase (somente no fluxo real)
        await upsertState(env, st.wa_id, {
          fase_conversa: nextStage,
          last_bot_msg: msgs[msgs.length - 1] || null,
          updated_at: new Date().toISOString()
        });
      }
    }

    // ============================================================
    // Envia mensagens uma a uma (delay humano real)
    // ============================================================
    for (const msg of msgs) {
      await logger(env, {
        tag: "DECISION_OUTPUT",
        wa_id: st.wa_id,
        meta_type: "text",
        meta_text: msg,
        details: {
          stage: st.fase_conversa || null,
          next_stage: nextStage || null
        }
      });

      if (!isSim) {
        await sendMessage(env, st.wa_id, msg);
      }

      // Telemetria por mensagem enviada (modo verbose)
      if (env.TELEMETRIA_LEVEL === "verbose") {
        await telemetry(env, {
          wa_id: st.wa_id,
          event: "msg_enviada",
          stage: st.fase_conversa,
          severity: "debug",
          message: `Mensagem enviada: "${msg}"`,
          details: { msg }
        });
      }

      await new Promise((r) =>
        setTimeout(r, Number(env.ENOVA_DELAY_MS) || 1200)
      );
    }

    if (isSim) {
      return {
        ok: true,
        simulated: true,
        stage_after: nextStage || st.fase_conversa || null,
        messages: msgs
      };
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    // ============================================================
    // 🛑 TELEMETRIA — ERRO CRÍTICO NO STEP
    // ============================================================
    await telemetry(env, {
      wa_id: st.wa_id,
      event: "step_critical_error",
      stage: st.fase_conversa || "inicio",
      next_stage: nextStage || null,
      severity: "critical",
      message: "ERRO CRÍTICO no step()",
      details: {
        error: err.stack || String(err),
        messages_out: arr,
        last_user_text: st.last_user_text,
        nextStage
      }
    });

    console.error("Erro no step():", err);

    // ============================================================
    // 🔥 FAILSAFE ABSOLUTO — Funil nunca morre
    // ============================================================
    return new Response(
      JSON.stringify({
        messages: [
          "Opa, deu uma travadinha aqui 😅",
          "Pode repetir pra mim rapidinho? Só pra garantir que seguimos certinho."
        ],
        nextStage: st.fase_conversa
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}

// =============================================================
// 🧱 A7 — sendMessage() com blindagem total + telemetria META
// =============================================================
async function sendMessage(env, wa_id, text, options = {}) {
  const simCtx = getSimulationContext(env);
  if (simCtx?.suppressExternalSend) {
    const preview = {
      messaging_product: "whatsapp",
      to: wa_id,
      type: "text",
      text: { body: text }
    };

    simCtx.sendPreview = preview;
    simCtx.wouldSend = true;

    if (options.returnMeta) {
      return {
        ok: true,
        meta_status: 200,
        message_id: "dry_run_suppressed",
        suppressed: true,
        send_payload_preview: preview
      };
    }

    return true;
  }

  const url = `https://graph.facebook.com/${env.META_API_VERSION}/${env.PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to: wa_id,
    type: "text",
    text: { body: text }
  };

  let res;

  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WHATS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    // FALHA DE REDE / DNS / WHATSAPP FORA
    await telemetry(env, {
      wa_id,
      event: "meta_network_error",
      stage: "sendMessage",
      severity: "critical",
      message: "Falha de rede ao enviar mensagem ao WhatsApp",
      details: {
        url,
        payload,
        error: err.stack || String(err),
        hint: "Possível queda da Meta / Cloudflare DNS / Proxy"
      }
    });

    await logger(env, {
      tag: "SEND_FAIL",
      wa_id,
      details: {
        stage: "sendMessage",
        error: err?.message || String(err),
        payload_enviado: payload
      }
    });

    console.error("Erro sendMessage (network):", err);
    if (options.returnMeta) {
      return {
        ok: false,
        meta_status: null,
        message_id: null
      };
    }
    return false;
  }

  if (!res.ok) {
    const textErr = await res.text();

    // ERRO HTTP — TOKEN, PHONE ID, 429, 400, JSON INVÁLIDO, ETC
    await telemetry(env, {
      wa_id,
      event: "meta_http_error",
      stage: "sendMessage",
      severity: res.status === 429 ? "warning" : "error",
      message: "Erro HTTP na API Meta WhatsApp",
      details: {
        url,
        payload,
        status: res.status,
        response: textErr,
        hint: mapMetaError(res.status)
      }
    });

    await logger(env, {
      tag: "SEND_FAIL",
      wa_id,
      details: {
        stage: "sendMessage",
        status: res.status,
        provider_response: textErr,
        payload_enviado: payload
      }
    });

    console.error("Erro sendMessage (HTTP):", res.status, textErr);
    if (options.returnMeta) {
      return {
        ok: false,
        meta_status: res.status,
        message_id: null
      };
    }
    return false;
  }

  // SUCESSO — salvar envio
  await telemetry(env, {
    wa_id,
    event: "meta_send_success",
    stage: "sendMessage",
    severity: "info",
    message: "Mensagem enviada com sucesso",
    details: {
      payload,
      status: res.status
    }
  });

  let providerResponse = null;
  let providerMessageId = null;

  try {
    const rawBody = await res.text();
    if (rawBody) {
      try {
        providerResponse = JSON.parse(rawBody);
      } catch {
        providerResponse = rawBody;
      }
    }

    if (providerResponse && typeof providerResponse === "object") {
      const firstMessage = Array.isArray(providerResponse.messages)
        ? providerResponse.messages[0]
        : null;

      providerMessageId = firstMessage?.id || null;
    }
  } catch (parseErr) {
    providerResponse = {
      parse_error: parseErr?.message || String(parseErr)
    };
  }

  await logger(env, {
    tag: "SEND_OK",
    wa_id,
    details: {
      stage: "sendMessage",
      status: res.status,
      payload_enviado: payload,
      provider_response: providerResponse,
      provider_message_id: providerMessageId
    }
  });

  if (options.returnMeta) {
    return {
      ok: true,
      meta_status: res.status,
      message_id: providerMessageId
    };
  }

  return true;
}

// =============================================================
// 🧱 A7.1 — MAPEAR ERROS META
// =============================================================
function mapMetaError(code) {
  switch (code) {
    case 400:
      return "Formato inválido / Phone ID errado / body malformado";
    case 401:
      return "Token inválido / expirado";
    case 403:
      return "Número sem permissão / mensagem bloqueada";
    case 404:
      return "Phone Number ID não encontrado";
    case 409:
      return "Conflito interno Meta (tente novamente)";
    case 413:
      return "Mensagem muito grande";
    case 422:
      return "Campo obrigatório ausente";
    case 429:
      return "Rate-limit atingido (muitas mensagens)";
    case 500:
      return "Erro interno WhatsApp";
    case 503:
      return "WhatsApp temporariamente indisponível";
    default:
      return "Erro desconhecido na API Meta";
  }
}

/**
 * logger — grava logs no enova_log via proxy Vercel
 */
async function logger(env, data) {
  try {
    await sbFetch(env, "/rest/v1/enova_log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // NÃO inventa coluna "ts" aqui. Deixa o banco cuidar do created_at.
      body: JSON.stringify(data),
    });
  } catch (e) {
    console.error("Erro logger:", e);
  }
}

// =============================================================
// 🧱 A2 — supabaseProxyFetch + getState + upsertState (versão FINAL)
// =============================================================

// sbFetch agora apenas encaminha para o supabaseProxyFetch,
// mantendo assinatura e compatibilidade com o Worker inteiro.
async function sbFetch(env, path, options = {}, context = {}) {
  return await supabaseProxyFetch(env, {
    path,
    method: options.method || "GET",
    query: options.query || null,
    body: options.body || null,
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE}`
    }
  });
}

// =============================================================
// Lê o estado do funil (GET correto via Proxy V2)
// =============================================================
async function getState(env, wa_id) {
  const simCtx = getSimulationContext(env);
  if (simCtx?.active && simCtx.stateByWaId && simCtx.stateByWaId[wa_id]) {
    return simCtx.stateByWaId[wa_id];
  }

  const result = await sbFetch(
    env,
    "/rest/v1/enova_state",
    {
      method: "GET",
      query: {
        select: "*",
        wa_id: `eq.${encodeURIComponent(wa_id)}`
      }
    },
    { wa_id, stage: "get_state" }
  );

  if (Array.isArray(result)) {
    return result[0] || null;
  }

  if (result && Array.isArray(result.data)) {
    return result.data[0] || null;
  }

  console.error("getState: formato inesperado de resposta Supabase:", result);
  return null;
}

// =============================================================
// Atualiza ou cria estado do funil (UPSERT manual, sem 409)
// =============================================================
async function upsertState(env, wa_id, payload) {
  const simCtx = getSimulationContext(env);

  // Sempre atualizamos o updated_at no Worker
  const patch = {
    ...payload,
    updated_at: new Date().toISOString()
  };

  if (simCtx?.active) {
    simCtx.writeLog = Array.isArray(simCtx.writeLog) ? simCtx.writeLog : [];
    simCtx.writeLog.push({ wa_id, patch });
    simCtx.writesByWaId = simCtx.writesByWaId || {};
    simCtx.writesByWaId[wa_id] = { ...(simCtx.writesByWaId[wa_id] || {}), ...patch };

    const current = simCtx.stateByWaId?.[wa_id] || { wa_id };
    const merged = { ...current, ...patch, wa_id };

    if (simCtx.stateByWaId) {
      simCtx.stateByWaId[wa_id] = merged;
    }

    if (simCtx.dryRun) {
      return merged;
    }
  }

  // Sanitize: não escrever coluna que não existe no Supabase

  try {
    // 1) Verifica se já existe registro para esse wa_id
    const existing = await getState(env, wa_id);

    // ---------------------------------------------------------
    // CASO 1: não existe ainda → tenta INSERT
    // ---------------------------------------------------------
    if (!existing) {
      const rowInsert = { wa_id, ...patch };

      try {
        const insertResult = await supabaseInsert(env, "enova_state", rowInsert);

        if (Array.isArray(insertResult)) {
          return insertResult[0] || null;
        }
        if (insertResult && Array.isArray(insertResult.data)) {
          return insertResult.data[0] || null;
        }
        return insertResult || null;
      } catch (err) {
        // Se bater 409 aqui, significa que alguém inseriu
        // na frente – então convertemos em UPDATE e segue a vida
        if (err.status === 409) {
          const updateResult = await supabaseUpdate(
            env,
            "enova_state",
            { wa_id },
            patch
          );

          if (Array.isArray(updateResult)) {
            return updateResult[0] || null;
          }
          if (updateResult && Array.isArray(updateResult.data)) {
            return updateResult.data[0] || null;
          }
          return updateResult || null;
        }

        console.error(
          `upsertState: erro no INSERT para wa_id=${wa_id}`,
          err
        );
        throw err;
      }
    }

    // ---------------------------------------------------------
    // CASO 2: já existe registro → UPDATE direto
    // ---------------------------------------------------------
    const updateResult = await supabaseUpdate(
      env,
      "enova_state",
      { wa_id },
      patch
    );

    if (Array.isArray(updateResult)) {
      return updateResult[0] || null;
    }
    if (updateResult && Array.isArray(updateResult.data)) {
      return updateResult.data[0] || null;
    }
    return updateResult || null;
  } catch (err) {
    console.error(
      `upsertState: erro geral para wa_id=${wa_id}`,
      err
    );
    throw err;
  }
}

// =============================================================
// 🔧 Helper de normalização de texto (para regex e reset global)
// =============================================================
function normalizeText(text) {
  let s = String(text || "");

  // Corrige mojibake comum de UTF-8 vindo quebrado (ex.: "nÃ£o")
  if (/[ÃÂ]/.test(s)) {
    try {
      s = decodeURIComponent(escape(s));
    } catch (_) {
      // se falhar, segue com o texto original
    }
  }

  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")        // remove acentos
    .replace(/[\u2000-\u206F]/g, " ")       // símbolos de controle
    .replace(/[^a-z0-9\s]/gi, " ")          // limpa emoji/pontuação pesada
    .replace(/\s+/g, " ")
    .trim();
}

// ✅ VERSÃO SEGURA DO isYes
function isYes(text) {
  const nt = normalizeText(text);
  if (!nt) return false;

  // respostas bem curtas: só EXATO
  const exact = new Set(["sim", "s", "ss", "ok"]);

  // frases que podem usar includes
  const phrases = [
  "declaro sim",
  "sim declaro",
  "eu declaro",
  "faco imposto",
  "faço imposto",
  "declaro imposto",
  "tenho imposto de renda",
  "tenho ir",
  "possuo ir"
];

  if (exact.has(nt)) return true;

  if (phrases.some((term) => nt.includes(normalizeText(term)))) return true;

  if (/\bdeclaro\b/.test(nt) && !/\bnao declaro\b/.test(nt)) return true;

  return false;
}

function isNo(text) {
  const nt = normalizeText(text);
  if (!nt) return false;

  // respostas curtas: só EXATO
  const exact = new Set(["nao", "n", "nn", "negativo"]);

  // frases: pode usar includes
  const phrases = [
    "nunca",
    "jamais",
    "ainda nao",
    "agora nao",
    "talvez depois",
    "nao declaro",
    "não declaro",
    "eu nao declaro",
    "eu não declaro",
    "nao faco imposto",
    "não faço imposto",
    "nao tenho imposto de renda",
    "não tenho imposto de renda",
    "sem imposto",
    "nunca declarei"
  ];

  if (exact.has(nt)) return true;

  if (phrases.some((term) => nt.includes(normalizeText(term)))) return true;

  return false;
}

function parseMoneyBR(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const nt = normalizeText(raw);
  const rawLower = raw.toLowerCase();

  const kMatch = rawLower.match(/(\d+(?:[\.,]\d+)?)\s*k\b/);
  if (kMatch) {
    const base = Number(kMatch[1].replace(".", "").replace(",", "."));
    return Number.isFinite(base) ? Math.round(base * 1000) : null;
  }

  const clean = raw.replace(/r\$|\s/gi, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(clean)) {
    const asNumber = Number(clean.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (/^\d+(,\d+)?$/.test(clean)) {
    const asNumber = Number(clean.replace(",", "."));
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (/^\d+(\.\d+)?$/.test(clean)) {
    const asNumber = Number(clean);
    return Number.isFinite(asNumber) ? asNumber : null;
  }

  const digits = nt.replace(/[^\d]/g, "");
  if (!digits) return null;
  const fallback = Number(digits);
  return Number.isFinite(fallback) ? fallback : null;
}

function parseEstadoCivil(text) {
  const nt = normalizeText(text);
  if (!nt) return null;
  if (/(solteir|sozinha|sozinho)/.test(nt)) return "solteiro";
  if (/(casad|casamento civil|casad[oa] no civil|casad[oa] no papel|no papel)/.test(nt)) return "casado";
  if (/(uniao estavel|uniao|estavel|juntad|moro junto|moramos junto|morar junto|vivemos juntos|amasiad|companheir|marido e mulher)/.test(nt)) return "uniao_estavel";
  if (/(separad|separei)/.test(nt)) return "separado";
  if (/(divorciad)/.test(nt)) return "divorciado";
  if (/(viuv)/.test(nt)) return "viuvo";
  return null;
}

function parseRegimeTrabalho(text) {
  const nt = normalizeText(text);
  if (!nt) return null;
  if (/(mei|microempreendedor|micro empreendedor|mei caminhoneiro)/.test(nt)) return "autonomo";
  if (/(clt|carteira assinada|registrad|registro em carteira|carteira registrada|de carteira)/.test(nt)) return "clt";
  if (/(autonom|informal|por conta|freela|freelancer|uber|ifood|liberal|bico|diarista|comissionad)/.test(nt)) return "autonomo";
  if (/(servidor|funcionario publico|publico|concursad|estatutari|municipal|estadual|federal|prefeitura)/.test(nt)) return "servidor";
  if (/(aposentad)/.test(nt)) return "aposentadoria";
  if (/(desempregad)/.test(nt)) return "desempregado";
  if (/(estudant)/.test(nt)) return "estudante";
  return null;
}

function hasRestricaoIndicador(text) {
  const nt = normalizeText(text);
  if (!nt) return false;
  return /(negativad|nome sujo|cpf sujo|spc|serasa|restricao|protesto|divida em atraso|pendencia no cpf)/.test(nt);
}

function parseComposicaoRenda(text) {
  const nt = normalizeText(text);
  if (!nt) return null;
  if (/(minha esposa|meu marido|companheira|companheiro|namorada|namorado|parceir|espos|marid)/.test(nt)) {
    return "parceiro";
  }
  if (/(pai|mae|irmao|irma|filho|filha|familiar|familia)/.test(nt)) {
    return "familiar";
  }
  return null;
}

function parseP3Tipo(text) {
  const nt = normalizeText(text);
  if (!nt) return null;
  if (/\bpai\b|meu pai/.test(nt)) return "pai";
  if (/\bmae\b|minha mae/.test(nt)) return "mae";
  if (/irmao|irma/.test(nt)) return "irmao";
  if (/namorad/.test(nt)) return /namorada/.test(nt) ? "namorada" : "namorado";
  if (/sogr/.test(nt)) return /sogra/.test(nt) ? "sogra" : "sogro";
  if (/familiar|familia|outro/.test(nt)) return "familiar";
  return null;
}

const COGNITIVE_V1_ALLOWED_STAGES = new Set([
  "estado_civil",
  "quem_pode_somar",
  "interpretar_composicao",
  "renda",
  "ir_declarado"
]);

const COGNITIVE_V1_CONFIDENCE_MIN = 0.66;

const COGNITIVE_PLAYBOOK_V1 = {
  style_rules: [
    "Tom acolhedor + profissional/firme + consultivo/didático.",
    "Responder parcialmente dúvidas fora de hora e trazer de volta ao trilho.",
    "Variar linguagem de forma natural, sem roboticidade."
  ],
  hard_limits: [
    "Nunca prometer aprovação.",
    "Nunca antecipar valor/parcela/entrada/resultado sem análise.",
    "Sempre usar a palavra imóvel (não induzir casa).",
    "Reforçar que aprovação depende da análise de perfil e avaliação bancária.",
    "Simulação detalhada e escolha do imóvel só após aprovação, no plantão."
  ],
  intents_by_stage: {
    estado_civil: ["estado_civil_hibrido", "duvida_composicao", "duvida_imovel_pre_analise", "objecao"],
    quem_pode_somar: ["composicao_familiar", "composicao_parceiro", "duvida_conjuge", "objecao"],
    interpretar_composicao: ["composicao_familiar", "composicao_parceiro", "sozinho", "objecao"],
    renda: ["renda_hibrida", "autonomo_ir", "duvida_valor_sem_analise", "objecao"],
    ir_declarado: ["ir_sim", "ir_nao", "autonomo_ir", "objecao"]
  },
  entities_supported: [
    "estado_civil",
    "composicao_tipo",
    "familiar_tipo",
    "familiar_casado_civil",
    "regime_trabalho",
    "ir_possible",
    "duvida_imovel_antes_analise"
  ]
};

function getOpenAIConfig(env) {
  const envMode = String(env.ENV_MODE || env.ENOVA_ENV || "").toLowerCase();
  const apiKey = envMode === "prod" ? env.OPENAI_API_KEY_PROD : env.OPENAI_API_KEY_TEST;
  const model = String(env.OFFTRACK_AI_MODEL || "gpt-4.1-mini");
  return { apiKey, model };
}

async function callOpenAIJson(env, { system, user, temperature = 0 }) {
  const { apiKey, model } = getOpenAIConfig(env);
  if (!apiKey) return null;

  let resp;
  try {
    resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });
  } catch {
    return null;
  }

  if (!resp?.ok) return null;

  let data = null;
  try {
    data = await resp.json();
  } catch {
    return null;
  }

  const content = data?.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function hasClearStageAnswer(stage, text) {
  if (stage === "estado_civil") return Boolean(parseEstadoCivil(text));
  if (stage === "renda") {
    const money = parseMoneyBR(text);
    return Number.isFinite(money) && money > 300;
  }
  if (stage === "ir_declarado") return isYes(text) || isNo(text);
  if (stage === "quem_pode_somar" || stage === "interpretar_composicao") {
    const nt = normalizeText(text);
    if (!nt) return false;
    const composicao = parseComposicaoRenda(text);
    const sozinho = /(so\s*(a\s*)?minha|so\s*eu|sozinh|ninguem|sem ninguem)/i.test(nt);
    return Boolean(composicao || sozinho);
  }
  return false;
}

function shouldTriggerCognitiveAssist(stage, text) {
  if (!COGNITIVE_V1_ALLOWED_STAGES.has(stage)) return false;
  const nt = normalizeText(text);
  if (!nt) return false;

  const hasQuestion = /\?/.test(String(text || ""));
  const hasConnector = /\b(mas|porem|porém|so que|só que|ao mesmo tempo)\b/i.test(nt);
  const offtrackHints = /\b(imovel|casa|apartamento|bairro|regiao|entrada|parcela|fgts|valor|preco)\b/i.test(nt);
  const fearHints = /\b(medo|receio|reprovad|enganad|vergonha|nao quero passar|não quero passar)\b/i.test(nt);

  return hasQuestion || hasConnector || offtrackHints || fearHints;
}

function sanitizeCognitiveReply(replyText) {
  let text = String(replyText || "").trim();
  if (!text) return "Perfeito, te explico isso com calma. E pra seguir com segurança, me confirma a informação desta etapa, por favor.";
  text = text.replace(/\bcasa\b/gi, "imóvel");
  return text;
}

function isStageSignalCompatible(stage, safeStageSignal) {
  if (!safeStageSignal) return false;
  const map = {
    estado_civil: ["estado_civil"],
    quem_pode_somar: ["composicao"],
    interpretar_composicao: ["composicao"],
    renda: ["renda", "regime", "ir_possible"],
    ir_declarado: ["ir"]
  };
  const allowed = map[stage] || [];
  return allowed.some((prefix) => String(safeStageSignal).startsWith(prefix));
}

function extractCompatibleStageAnswerFromCognitive(stage, cognitiveOutput) {
  const c = cognitiveOutput || {};
  const entities = c.entities && typeof c.entities === "object" ? c.entities : {};
  const stageSignals = c.stage_signals && typeof c.stage_signals === "object" ? c.stage_signals : {};
  const safe = String(c.safe_stage_signal || "").toLowerCase();

  if (stage === "estado_civil") {
    const fromEntity = normalizeText(entities.estado_civil || "");
    if (fromEntity && ["solteiro", "casado", "uniao_estavel", "separado", "divorciado", "viuvo"].includes(fromEntity)) {
      return fromEntity.replace("_", " ");
    }
    const fromSignal = normalizeText(stageSignals.estado_civil || "");
    if (fromSignal && ["solteiro", "casado", "uniao_estavel", "separado", "divorciado", "viuvo"].includes(fromSignal)) {
      return fromSignal.replace("_", " ");
    }
    const safeMatch = safe.match(/^estado_civil:(.+)$/);
    if (safeMatch?.[1]) return safeMatch[1].replace(/_/g, " ");
    return null;
  }

  if (stage === "quem_pode_somar" || stage === "interpretar_composicao") {
    const comp = normalizeText(entities.composicao_tipo || stageSignals.composicao || "");
    if (comp === "parceiro") return "parceiro";
    if (comp === "familiar") return "familiar";
    if (comp === "sozinho") return "sozinho";

    const safeMatch = safe.match(/^composicao:(.+)$/);
    if (safeMatch?.[1]) {
      const v = normalizeText(safeMatch[1]);
      if (["parceiro", "familiar", "sozinho"].includes(v)) return v;
    }
    return null;
  }

  if (stage === "ir_declarado") {
    const ir = normalizeText(String(entities.ir_declarado ?? stageSignals.ir_declarado ?? ""));
    if (ir === "sim" || ir === "true") return "sim";
    if (ir === "nao" || ir === "false") return "nao";
    const safeMatch = safe.match(/^ir:(.+)$/);
    if (safeMatch?.[1]) {
      const v = normalizeText(safeMatch[1]);
      if (v === "sim" || v === "true") return "sim";
      if (v === "nao" || v === "false") return "nao";
    }
    return null;
  }

  return null;
}

function buildCognitiveFallback(stage) {
  return {
    reply_text: "Entendo sua dúvida. Pra te orientar com segurança, eu preciso fechar esta etapa primeiro e aí te explico o próximo passo com base no seu perfil.",
    intent: "fallback_contextual",
    entities: {},
    stage_signals: {},
    still_needs_original_answer: true,
    answered_customer_question: true,
    safe_stage_signal: null,
    suggested_stage: stage,
    confidence: 0,
    reason: "no_llm_or_parse"
  };
}

async function cognitiveAssistV1(env, { stage, text, stateSnapshot }) {
  const base = buildCognitiveFallback(stage);

  const system = [
    "Você é a camada cognitiva v1 da ENOVA e deve responder APENAS JSON válido.",
    "Objetivo: acolher, orientar sem prometer, e trazer o cliente de volta ao stage atual.",
    "NUNCA decidir funil sozinho; suggested_stage e stage_signals são apenas sugestão.",
    "Use linguagem natural em pt-BR, tom acolhedor + firme + consultivo.",
    "Regras duras: sem promessa de aprovação; sem antecipar valor/parcela/entrada/resultado; falar imóvel; aprovação depende de análise de perfil + avaliação bancária; escolha/simulação de imóvel apenas após aprovação no plantão.",
    "Se responder dúvida mas faltar resposta objetiva do stage, marque still_needs_original_answer=true.",
    "Contrato de saída obrigatório: reply_text, intent, entities, stage_signals, still_needs_original_answer, answered_customer_question, safe_stage_signal, suggested_stage, confidence, reason."
  ].join(" ");

  const user = JSON.stringify({
    stage,
    customer_text: String(text || ""),
    playbook_v1: COGNITIVE_PLAYBOOK_V1,
    known_state: {
      estado_civil: stateSnapshot?.estado_civil || null,
      somar_renda: stateSnapshot?.somar_renda ?? null,
      renda: stateSnapshot?.renda || null,
      renda_parceiro: stateSnapshot?.renda_parceiro || null,
      regime: stateSnapshot?.regime || null
    }
  });

  const parsed = await callOpenAIJson(env, { system, user, temperature: 0.2 });
  if (!parsed || typeof parsed !== "object") return base;

  const confidence = Number(parsed.confidence ?? 0);
  const output = {
    reply_text: sanitizeCognitiveReply(parsed.reply_text),
    intent: String(parsed.intent || "fallback_contextual"),
    entities: parsed.entities && typeof parsed.entities === "object" ? parsed.entities : {},
    stage_signals: parsed.stage_signals && typeof parsed.stage_signals === "object" ? parsed.stage_signals : {},
    still_needs_original_answer: Boolean(parsed.still_needs_original_answer),
    answered_customer_question: Boolean(parsed.answered_customer_question),
    safe_stage_signal: parsed.safe_stage_signal ? String(parsed.safe_stage_signal) : null,
    suggested_stage: parsed.suggested_stage ? String(parsed.suggested_stage) : stage,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    reason: String(parsed.reason || "cognitive_v1")
  };

  if (!output.reply_text) output.reply_text = base.reply_text;
  return output;
}

// =============================================================
// 🧠 OFFTRACK GUARD — IA simples (classifica pergunta fora do trilho)
//  - Só decide: OFFTRACK ou ONTRACK
//  - Se OFFTRACK, dá um label (FGTS, PRECO, REGIAO, COMPOR_RENDA, CASA, OUTRO)
//  - NÃO muda fase. Só orienta responder padrão.
// =============================================================
function shouldConsiderOfftrack(text) {
  const nt = normalizeText(text || "");
  if (!nt) return false;

  // Heurística barata: só chama IA quando parece pergunta/assunto paralelo
  if (nt.includes("?")) return true;

  return (
    /\b(fgts|valor|preco|parcela|entrada|onde|bairro|regiao|cidade|casa|namorad|espos|marid|restric|spc|serasa|negativ|sem registro|sem clt|nao tenho registro)\b/.test(nt)
  );
}

async function offtrackGuard(env, { wa_id, stage, text }) {
  // Desligável por env (segurança)
  const enabled = String(env.OFFTRACK_AI_ENABLED || "true").toLowerCase() !== "false";
  if (!enabled) return { offtrack: false };

  if (!shouldConsiderOfftrack(text)) return { offtrack: false };

  // Se não tiver key, não faz nada (não quebra atendimento)
  // Se não tiver key, não faz nada (não quebra atendimento)
const { apiKey } = getOpenAIConfig(env);

if (!apiKey) return { offtrack: false };
  const labels = ["ONTRACK", "FGTS", "PRECO", "REGIAO", "COMPOR_RENDA", "CASA", "RESTRICAO", "OUTRO"];

  const system =
    "Você é um roteador. Sua única tarefa é dizer se a mensagem do cliente é uma PERGUNTA FORA DO TRILHO (OFFTRACK) " +
    "ou uma RESPOSTA DIRETA à pergunta atual (ONTRACK). " +
    "Você NÃO pode inventar etapas, NÃO pode orientar financiamento, NÃO pode responder conteúdo. " +
    "Responda APENAS JSON válido.";

  const user =
    JSON.stringify({
      stage_atual: stage,
      texto_cliente: String(text || ""),
      labels_validos: labels
    });

  const parsed = await callOpenAIJson(env, { system, user, temperature: 0 });
  if (!parsed) return { offtrack: false };

  const labelRaw = String(parsed?.label || parsed?.result || "").toUpperCase().trim();
  const confidence = Number(parsed?.confidence ?? 0);

  const label = labels.includes(labelRaw) ? labelRaw : "OUTRO";
  const offtrack = label !== "ONTRACK";

  return { offtrack, label, confidence: Number.isFinite(confidence) ? confidence : null };
}

function getP3TipoLabel(tipo) {
  const t = normalizeText(tipo || "");
  if (t === "pai") return "seu pai";
  if (t === "mae") return "sua mãe";
  if (t === "irmao") return "seu irmão/sua irmã";
  if (t === "namorada") return "sua namorada";
  if (t === "namorado") return "seu namorado";
  if (t === "sogra") return "sua sogra";
  if (t === "sogro") return "seu sogro";
  return "esse familiar";
}

function isModoFamiliar(st) {
  return st?.composicao_pessoa === "familiar" || st?.familiar_tipo != null;
}

function appendOwned(list, payload, owner) {
  const base = Array.isArray(list) ? list : [];
  return [...base, { owner, ...payload }];
}

function buildSimulationFlags(st, userText) {
  const normalized = normalizeText(userText || "");
  return {
    mei_detected: /\bmei\b/.test(normalized),
    aposentado_detected: /aposentad/.test(normalized),
    composicao_detected: Boolean(parseComposicaoRenda(userText || "")),
    renda_value: parseMoneyBR(userText || ""),
    estado_civil: st?.estado_civil || null,
    regime_trabalho: st?.regime_trabalho || null,
    somar_renda: st?.somar_renda ?? null,
    financiamento_conjunto: st?.financiamento_conjunto ?? null,
    renda: st?.renda ?? null,
    renda_parceiro: st?.renda_parceiro ?? null,
    ctps_36: st?.ctps_36 ?? null,
    restricao: st?.restricao ?? null,
    dependente: st?.dependente ?? null
  };
}

// =============================================================
// 🧱 A3 — TELEMETRIA ENOVA (MODO SAFE COM DETALHES)
//  - Não escreve no Supabase
//  - Loga detalhes resumidos no console para debug
// =============================================================
async function telemetry(env, payload) {
  try {
    const level = (env.TELEMETRIA_LEVEL || "basic").toLowerCase();

    if (level === "off") return;

    const severity = payload.severity || "info";
    const event = payload.event || "unknown";

    const isInfo = severity === "info";
    const force = payload.force === true;
    if (level === "basic" && isInfo && !force) {
      return;
    }

    // Monta um preview seguro dos detalhes (erro do runFunnel etc.)
    let detailsPreview = null;
    if (payload.details) {
      try {
        detailsPreview = JSON.stringify(payload.details);
        if (detailsPreview.length > 800) {
          detailsPreview =
            detailsPreview.slice(0, 800) + "...(details truncado)";
        }
      } catch {
        detailsPreview = "[details não serializáveis]";
      }
    }

    const safePayload = {
      wa_id: payload.wa_id || null,
      event,
      stage: payload.stage || null,
      next_stage: payload.next_stage || null,
      severity,
      message: payload.message || null,
      details: detailsPreview
    };

    console.log("TELEMETRIA-SAFE:", JSON.stringify(safePayload));
    // 🔇 Nada de sbFetch aqui – telemetria 100% sem Supabase.
  } catch (e) {
    console.error("Erro telemetria-safe:", e);
  }
}

// =============================================================
// 🧱 A3.F — FUNNEL TELEMETRY (atalho para o funil)
// =============================================================
async function funnelTelemetry(env, payload) {
  // Garante campos mínimos
  const base = {
    event: payload.event || "funnel_event",
    stage: payload.stage || null,
    funil_status: payload.funil_status || null,
    severity: payload.severity || "info"
  };

  // Usa a mesma infra de telemetria principal
  return telemetry(env, { ...payload, ...base });
}

// =============================================================
// 🧱 A8 — VALIDATION ENGINE (variáveis de ambiente Cloudflare)
// =============================================================
const REQUIRED_ENV_VARS = [
  "VERCEL_PROXY_URL",
  "SUPABASE_SERVICE_ROLE",
  "META_API_VERSION",
  "PHONE_NUMBER_ID",
  "WHATS_TOKEN",
  "META_VERIFY_TOKEN"
  // ENOVA_DELAY_MS é nice-to-have, não crítica
];

function checkEnvMissing(env) {
  const missing = [];

  for (const key of REQUIRED_ENV_VARS) {
    if (!env[key] || String(env[key]).trim() === "") {
      missing.push(key);
    }
  }

  return missing;
}

/**
 * validateEnv(env)
 *  - Não quebra o Worker
 *  - Registra em telemetria se tiver qualquer variável faltando
 */
async function validateEnv(env) {
  const missing = checkEnvMissing(env);

  if (missing.length === 0) {
    return { ok: true, missing: [] };
  }

  // Telemetria crítica: variáveis de ambiente faltando
  try {
    await telemetry(env, {
      wa_id: null,
      event: "env_missing",
      stage: "bootstrap",
      severity: "critical",
      message: "Variáveis de ambiente ausentes ou vazias",
      details: {
        missing_vars: missing
      }
    });
  } catch (e) {
    console.error("Erro telemetria env_missing:", e);
  }

  // NÃO lançamos erro aqui — apenas avisamos.
  // A decisão de abortar ou não a requisição será feita no router.
  return { ok: false, missing };
}

// =============================================================
// 🔌 Módulo interno — Supabase via Proxy Vercel
// =============================================================
// Usa: env.VERCEL_PROXY_URL + /api/supabase-proxy/...
// NÃO expõe SERVICE_ROLE no Worker, tudo passa pelo Vercel.

async function supabaseProxyFetch(env, {
  path,       // exemplo: "/rest/v1/enova_state"
  method = "GET",
  query = null,   // objeto { select: "*", wa_id: "554..." }
  body = null,
  headers = {},
  signal
}) {
  if (!env.VERCEL_PROXY_URL) {
    throw new Error("VERCEL_PROXY_URL não configurada no Worker");
  }

  // Base do proxy (sem barra no final)
  let base = env.VERCEL_PROXY_URL;
  base = base.replace(/\/+$/, ""); // remove barras extras

  // Garante que o path começa com "/"
  if (!path.startsWith("/")) {
    path = "/" + path;
  }

  // NOVO FORMATO — obrigatório para o Proxy V2
// Agora usamos sempre query ?path=/rest/v1/tabela&select=*...
let url = base + "/api/supabase-proxy";

// query é obrigatório, então garantimos que existe
const usp = new URLSearchParams();

// path obrigatório — agora ENCODED para impedir truncamento no Vercel
usp.append("path", path);

// acrescenta demais parâmetros (select, filtros…)
if (query && typeof query === "object") {
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    usp.append(key, String(value));
  }
}

// URL final, sempre assim:
// https://proxy.../api/supabase-proxy?path=/rest/v1/enova_state&select=*&wa_id=eq.xxx
url += "?" + usp.toString();


  const finalHeaders = { ...headers };
  let finalBody = body;

  // Se body for objeto, envia como JSON
  if (
    body &&
    typeof body === "object" &&
    !(body instanceof ArrayBuffer) &&
    !(body instanceof Uint8Array)
  ) {
    if (!finalHeaders["Content-Type"]) {
      finalHeaders["Content-Type"] = "application/json";
    }
    finalBody = JSON.stringify(body);
  }

  // GET/HEAD não mandam body
  const sendBody =
    method === "GET" || method === "HEAD" ? undefined : finalBody;

      // ========== DEBUG (CONTROLADO) — SUPABASE PROXY ==========
  // ✅ Ative apenas no TEST (env var SB_PROXY_DEBUG="true")
  const SB_DEBUG_ON = String(env.SB_PROXY_DEBUG || "").toLowerCase() === "true";

  if (SB_DEBUG_ON) {
    try {
      // Redact de secrets
      const safeHeaders = { ...finalHeaders };
      if (safeHeaders.Authorization) safeHeaders.Authorization = "REDACTED";
      if (safeHeaders.apikey) safeHeaders.apikey = "REDACTED";
      if (safeHeaders["x-enova-admin-key"]) safeHeaders["x-enova-admin-key"] = "REDACTED";

      console.log("DEBUG-SBREQUEST:", JSON.stringify({
        url,
        method,
        headers: safeHeaders,
        bodyPreview: typeof finalBody === "string"
          ? finalBody.slice(0, 200)
          : (finalBody ? "[non-string-body]" : null),
      }));
    } catch (err) {
      console.log("DEBUG-SBREQUEST-ERROR:", String(err));
    }

    // ⚠️ Proxy-echo é caro (fetch extra). Deixe OFF por padrão.
    const SB_ECHO_ON = String(env.SB_PROXY_ECHO || "").toLowerCase() === "true";
    if (SB_ECHO_ON) {
      try {
        const safeHeaders = { ...finalHeaders };
        if (safeHeaders.Authorization) safeHeaders.Authorization = "REDACTED";
        if (safeHeaders.apikey) safeHeaders.apikey = "REDACTED";

        const echo = await fetch(base + "/api/supabase-proxy-debug", {
          method,
          headers: safeHeaders
        });

        const echoJson = await echo.json();

        console.log("DEBUG-PROXY-ECHO:", JSON.stringify({
          sentHeaders: safeHeaders,
          proxyReceivedHeaders: echoJson?.received_headers || null
        }));
      } catch (err) {
        console.log("DEBUG-PROXY-ECHO-ERROR:", String(err));
      }
    }
  }
  // ========== FIM DEBUG ==========
// ========== FIM DO DEBUG TEMPORÁRIO ==========

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: sendBody,
      signal
    });
  } catch (err) {
    console.error("supabaseProxyFetch: erro de rede/fetch", err);
    throw err;
  }

  const text = await res.text();
  let data = null;

  // Tenta parsear JSON; se não der, devolve texto cru
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    console.error("supabaseProxyFetch: erro HTTP", res.status, data);
    const error = new Error("Supabase proxy HTTP error");
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

// -------------------------------------------------------------
// Helpers de alto nível
// -------------------------------------------------------------
// SELECT
async function supabaseSelect(env, table, {
  columns = "*",
  filter = {},   // ex: { wa_id: "554..." }
  single = false
} = {}) {
  const query = { select: columns, ...filter };
  if (single) {
    query.limit = 1;
  }
  return supabaseProxyFetch(env, {
    path: `/rest/v1/${table}`,
    method: "GET",
    query
  });
}

// UPSERT (merge-duplicates)
async function supabaseUpsert(env, table, rows) {
  const payload = Array.isArray(rows) ? rows : [rows];

  // 🔧 Para enova_state usamos a UNIQUE "enova_state_wa_id_key"
  //    -> on_conflict=wa_id (mesmo nome da coluna na tabela)
  const query = {};
  if (table === "enova_state") {
    query.on_conflict = "wa_id";
  }

  return supabaseProxyFetch(env, {
    path: `/rest/v1/${table}`,
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
      Accept: "application/json"
    },
    query,
    body: payload
  });
}

// INSERT simples
async function supabaseInsert(env, table, rows) {
  const payload = Array.isArray(rows) ? rows : [rows];

  return supabaseProxyFetch(env, {
    path: `/rest/v1/${table}`,
    method: "POST",
    headers: {
      Accept: "application/json"
    },
    body: payload
  });
}

// UPDATE com filtro na query (cuidado com where!)
async function supabaseUpdate(env, table, filter, patch) {
  const query = {};
  for (const [key, value] of Object.entries(filter || {})) {
    if (value === undefined || value === null) continue;
    // Supabase usa sintaxe col=eq.valor
    query[`${key}`] = `eq.${value}`;
  }

  return supabaseProxyFetch(env, {
    path: `/rest/v1/${table}`,
    method: "PATCH",
    headers: {
      Accept: "application/json"
    },
    query,
    body: patch
  });
}

// =============================================================
// 🧱 A3.1 — Reset TOTAL (blindado e compatível com tabela atual)
// =============================================================
async function resetTotal(env, wa_id) {

  // 1) Apaga completamente o estado anterior via Proxy V2
  await supabaseProxyFetch(env, {
    path: "/rest/v1/enova_state",
    method: "DELETE",
    query: {
      wa_id: `eq.${wa_id}`
    },
    headers: {
      Accept: "application/json"
    }
  });

  // 2) Recria estado 100% limpo e compatível com enova_state atual
  await upsertState(env, wa_id, {
    // Base
    fase_conversa: "inicio",
    funil_status: null,
    updated_at: new Date().toISOString(),

    // Logs / rastreio (colunas válidas)
    last_user_text: null,
    last_processed_text: null,
    last_message_id: null,
    last_bot_msg: null,

    // Identificação
    nome: null,
    nome_parceiro: null,
    nome_parceiro_normalizado: null,

    // Trilho principal
    estado_civil: null,
    somar_renda: null,
    financiamento_conjunto: null,
    composicao_pessoa: null,
    solteiro_sozinho: null,
    casamento_civil: null,
    coletas_casal: null,

    // ✅ Trilho familiar/P3 (zera tudo do P3)
    familiar_tipo: null,
    p3_required: null,
    p3_done: null,
    p3_regime_trabalho: null,
    p3_renda_mensal: null,
    p3_restricao: null,
    p3_regularizacao_intencao: null,

    // Regimes / renda (colunas válidas do schema)
    regime: null,
    regime_parceiro: null,
    regime_misto: null,
    parceiro_tem_renda: null,
    modo_renda: null,

    renda: null,
    renda_titular: null,
    renda_parceiro: null,
    renda_total_para_fluxo: null,
    renda_bruta: null,
    renda_bruta_temp: null,
    renda_extra: null,
    renda_formal: null,
    renda_informal: null,
    renda_mista: null,

    // IR / formalização
    ir_declarado: null,
    ir_parceiro: null,
    ir_declarado_parceiro: null,

    // CTPS
    ctps_36: null,
    ctps_36_parceiro: null,
    p3_ctps_36: null,
    ctps_parceiro: null,

    // Elegibilidade
    dependente: null,
    tem_dependente: null,
    restricao: null,
    regularizacao: null,
    regularizacao_restricao: null,
    restricao_attempts: null,

    // Nacionalidade / RNM (colunas válidas)
    nacionalidade: null,
    estrangeiro_flag: null,
    tem_rnm: null,
    rnm_tipo: null,
    rnm_validade: null,

    // Multi-renda / multi-regime (colunas válidas)
    multi_renda_flag: null,
    multi_renda_lista: null,
    multi_regime_flag: null,
    multi_regime_lista: null,
    ultima_renda_bruta_informada: null,
    qtd_rendas_informadas: null,
    qtd_regimes_informados: null,
    ultima_regime_informado: null,

    // Docs / pré-análise (evita sujeira de trilho anterior)
    docs_status: null,
    docs_faltantes: null,
    docs_completos: null,
    docs_validacao_atualizada: null,
    fase_docs: null,
    ultima_interacao_docs: null,
    docs_status_geral: null,
    docs_itens_pendentes: null,
    docs_itens_recebidos: null,
    docs_lista_enviada: null,
    docs_status_completo: null,
    docs_status_parcial: null,
    docs_status_texto: null,

    processo_pre_analise: null,
    processo_pre_analise_status: null,
    retorno_correspondente_bruto: null,
    retorno_correspondente_status: null,
    retorno_correspondente_motivo: null,
    dossie_resumo: null,
    processo_enviado_correspondente: null,
    aguardando_retorno_correspondente: null,

    // Participantes (zera composição antiga)
    p1_tipo: null,
    p2_tipo: null,
    p3_tipo: null,
    p1_maior_idade: null,
    p2_maior_idade: null,
    p3_maior_idade: null
  });

  return;
}

function createSimulationState(wa_id, startStage) {
  return {
    wa_id,
    fase_conversa: startStage || "inicio",
    funil_status: null,
    updated_at: new Date().toISOString(),

    // Logs / rastreio
    last_user_text: null,
    last_processed_text: null,
    last_message_id: null,
    last_bot_msg: null,

    // Identificação
    nome: null,
    nome_parceiro: null,
    nome_parceiro_normalizado: null,

    // Trilho principal
    estado_civil: null,
    somar_renda: null,
    financiamento_conjunto: null,
    composicao_pessoa: null,
    solteiro_sozinho: null,
    casamento_civil: null,
    coletas_casal: null,

    // ✅ Trilho familiar/P3 (espelho do reset real)
    familiar_tipo: null,
    p3_required: null,
    p3_done: null,
    p3_regime_trabalho: null,
    p3_renda_mensal: null,
    p3_restricao: null,
    p3_regularizacao_intencao: null,

    // Regimes / renda
    regime: null,
    regime_parceiro: null,
    regime_misto: null,
    parceiro_tem_renda: null,
    modo_renda: null,

    renda: null,
    renda_titular: null,
    renda_parceiro: null,
    renda_total_para_fluxo: null,
    renda_bruta: null,
    renda_bruta_temp: null,
    renda_extra: null,
    renda_formal: null,
    renda_informal: null,
    renda_mista: null,

    // IR / formalização
    ir_declarado: null,
    ir_parceiro: null,
    ir_declarado_parceiro: null,

    // CTPS
    ctps_36: null,
    ctps_36_parceiro: null,
    p3_ctps_36: null,
    ctps_parceiro: null,

    // Elegibilidade
    dependente: null,
    tem_dependente: null,
    restricao: null,
    regularizacao: null,
    regularizacao_restricao: null,
    restricao_attempts: null,

    // Nacionalidade / RNM
    nacionalidade: null,
    estrangeiro_flag: null,
    tem_rnm: null,
    rnm_tipo: null,
    rnm_validade: null,

    // Multi-renda / multi-regime
    multi_renda_flag: null,
    multi_renda_lista: null,
    multi_regime_flag: null,
    multi_regime_lista: null,
    ultima_renda_bruta_informada: null,
    qtd_rendas_informadas: null,
    qtd_regimes_informados: null,
    ultima_regime_informado: null,

    // Docs / pré-análise (espelho do reset real)
    docs_status: null,
    docs_faltantes: null,
    docs_completos: null,
    docs_validacao_atualizada: null,
    fase_docs: null,
    ultima_interacao_docs: null,
    docs_status_geral: null,
    docs_itens_pendentes: null,
    docs_itens_recebidos: null,
    docs_lista_enviada: null,
    docs_status_completo: null,
    docs_status_parcial: null,
    docs_status_texto: null,

    processo_pre_analise: null,
    processo_pre_analise_status: null,
    retorno_correspondente_bruto: null,
    retorno_correspondente_status: null,
    retorno_correspondente_motivo: null,
    dossie_resumo: null,
    processo_enviado_correspondente: null,
    aguardando_retorno_correspondente: null,

    // Participantes (zera composição antiga)
    p1_tipo: null,
    p2_tipo: null,
    p3_tipo: null,
    p1_maior_idade: null,
    p2_maior_idade: null,
    p3_maior_idade: null
  };
}

async function simulateFunnel(env, { wa_id, startStage, script, dryRun }) {
  const previousCtx = env.__enovaSimulationCtx;
  const stateByWaId = {};

  stateByWaId[wa_id] = createSimulationState(wa_id, startStage || "inicio");

  env.__enovaSimulationCtx = {
    active: true,
    dryRun: dryRun !== false,
    stateByWaId,
    messageLog: [],
    writeLog: [],
    writesByWaId: {},
    suppressExternalSend: true,
    wouldSend: false,
    sendPreview: null
  };

  const steps = [];
  let currentState = stateByWaId[wa_id];

  try {
    for (const userTextRaw of script) {
      const userText = String(userTextRaw || "");
      const stageBefore = currentState?.fase_conversa || "inicio";
      const normalized = normalizeText(userText);

      let runResult = null;
      let stepError = null;

      try {
        runResult = await runFunnel(env, currentState, userText);
      } catch (err) {
        stepError = err;
      }

      currentState = env.__enovaSimulationCtx?.stateByWaId?.[wa_id] || currentState;

      let replyText = null;
      let stageAfter = currentState?.fase_conversa || stageBefore;

      if (runResult && typeof runResult === "object" && Array.isArray(runResult.messages)) {
        replyText = runResult.messages.join("\n");
        if (runResult.stage_after) {
          stageAfter = runResult.stage_after;
        }
      } else if (runResult instanceof Response) {
        try {
          const cloned = runResult.clone();
          const parsed = await cloned.json();
          if (Array.isArray(parsed?.messages)) {
            replyText = parsed.messages.join("\n");
          }
          if (parsed?.nextStage) {
            stageAfter = parsed.nextStage;
          }
        } catch {
          replyText = null;
        }
      }

      steps.push({
        stage_before: stageBefore,
        user_text: userText,
        normalized_text: normalized || null,
        matched_gate: null,
        decision: null,
        stage_after: stageAfter,
        reply_text: replyText,
        flags: buildSimulationFlags(currentState, userText),
        errors: stepError
          ? {
              name: stepError?.name || "Error",
              message: stepError?.message || String(stepError)
            }
          : null
      });

      if (stepError) {
        break;
      }
    }

    return {
      ok: true,
      wa_id,
      start_stage: startStage || "inicio",
      end_stage: currentState?.fase_conversa || startStage || "inicio",
      dry_run: dryRun !== false,
      steps
    };
  } catch (err) {
    return {
      ok: false,
      wa_id,
      start_stage: startStage || "inicio",
      end_stage: currentState?.fase_conversa || startStage || "inicio",
      dry_run: dryRun !== false,
      steps,
      errors: {
        name: err?.name || "Error",
        message: err?.message || String(err)
      }
    };
  } finally {
    env.__enovaSimulationCtx = previousCtx;
  }
}


const ENOVA_V1_VALID_STAGES = Object.freeze([
  "inicio","inicio_decisao","inicio_programa","inicio_nome","inicio_nacionalidade","inicio_rnm","inicio_rnm_validade","estado_civil","confirmar_casamento","financiamento_conjunto","parceiro_tem_renda","somar_renda_solteiro","somar_renda_familiar","pais_casados_civil_pergunta","confirmar_avo_familiar","renda_familiar_valor","inicio_multi_renda_pergunta","inicio_multi_renda_coletar","inicio_multi_regime_familiar_pergunta","inicio_multi_regime_familiar_loop","inicio_multi_renda_familiar_pergunta","inicio_multi_renda_familiar_loop","inicio_multi_regime_pergunta_parceiro","inicio_multi_regime_coletar_parceiro","inicio_multi_renda_pergunta_parceiro","inicio_multi_renda_coletar_parceiro","regime_trabalho","autonomo_ir_pergunta","autonomo_sem_ir_ir_este_ano","autonomo_sem_ir_caminho","autonomo_sem_ir_entrada","fim_inelegivel","fim_ineligivel","verificar_averbacao","verificar_inventario","p3_tipo_pergunta","regime_trabalho_parceiro_familiar","finalizacao","regime_trabalho_parceiro_familiar_p3","renda_parceiro_familiar_p3","inicio_multi_regime_p3_pergunta","inicio_multi_regime_p3_loop","inicio_multi_renda_p3_pergunta","inicio_multi_renda_p3_loop","ctps_36_parceiro_p3","restricao_parceiro_p3","regularizacao_restricao_p3","inicio_multi_regime_pergunta","inicio_multi_regime_coletar","regime_trabalho_parceiro","renda","renda_parceiro","renda_parceiro_familiar","renda_mista_detalhe","possui_renda_extra","interpretar_composicao","quem_pode_somar","sugerir_composicao_mista","ir_declarado","autonomo_compor_renda","ctps_36","ctps_36_parceiro","dependente","restricao","restricao_parceiro","regularizacao_restricao_parceiro","regularizacao_restricao","envio_docs","agendamento_visita","finalizacao_processo","aguardando_retorno_correspondente"
]);

const ENOVA_V1_BANNED_ALIASES = Object.freeze([
  "envio_docs",
  "regularizacao_restricao(_parceiro)",
  "regularizacao_restricao_parceiro|regularizacao_restricao"
]);

function enovaV1FixturePatch(id) {
  switch (id) {
    case "fx_base_topo_v1":
      return {
        ultima_interacao: new Date().toISOString()
      };

    case "fx_composicao_v1":
      return {
        financiamento_conjunto: true,
        somar_renda: true,
        composicao_pessoa: "casal"
      };

    case "fx_restricao_parceiro_v1":
      return {
        financiamento_conjunto: true,
        somar_renda: true,
        composicao_pessoa: "casal",
        restricao_parceiro: false,
        renda_total_para_fluxo: 7200,
        regime_trabalho: "clt"
      };

    case "fx_renda_v1":
      return {
        renda_total_para_fluxo: 6500,
        renda_bruta: 6500,
        regime_trabalho: "clt"
      };

    case "fx_parceiro_v1":
      return {
        financiamento_conjunto: true,
        somar_renda: true,
        composicao_pessoa: "casal",
        parceiro_tem_renda: true,
        renda: 4200,
        renda_total_para_fluxo: 4200,
        regime_trabalho: "clt"
      };

    case "fx_familiar_v1":
      return {
        somar_renda: true,
        composicao_pessoa: "familiar",
        familiar_tipo: "pai",
        renda: 4200,
        renda_total_para_fluxo: 4200,
        regime_trabalho: "clt"
      };

    case "fx_familiar_p3_v1":
      return {
        somar_renda: true,
        composicao_pessoa: "familiar",
        familiar_tipo: "pai",
        p3_required: true,
        p3_done: false,
        renda: 4200,
        renda_total_para_fluxo: 4200,
        regime_trabalho: "clt"
      };

   case "fx_gate_renda_solo_v1":
      return {
        somar_renda: false,
        financiamento_conjunto: false,
        parceiro_tem_renda: false,
        regime_trabalho: "clt",
        renda_total_para_fluxo: 0
      };

    case "fx_gate_renda_parceiro_v1":
      return {
        somar_renda: true,
        financiamento_conjunto: true,
        composicao_pessoa: "casal",
        parceiro_tem_renda: true,
        regime_trabalho: "clt",
        regime_trabalho_parceiro: "clt",
        renda_total_para_fluxo: 4200
      };

    case "fx_gate_ir_autonomo_v1":
      return {
        somar_renda: false,
        financiamento_conjunto: false,
        parceiro_tem_renda: false,
        regime_trabalho: "autonomo",
        renda_total_para_fluxo: 3200
      };

    case "fx_gate_ir_parceiro_v1":
      return {
        somar_renda: true,
        financiamento_conjunto: true,
        composicao_pessoa: "casal",
        parceiro_tem_renda: true,
        regime_trabalho: "clt",
        regime_trabalho_parceiro: "autonomo",
        renda_total_para_fluxo: 6200
      };

    case "fx_gate_quem_somar_v1":
      return {
        somar_renda: true,
        financiamento_conjunto: false,
        composicao_pessoa: null,
        regime_trabalho: "autonomo",
        renda_total_para_fluxo: 1800
      };

    case "fx_gate_ctps_solo_v1":
      return {
        somar_renda: false,
        financiamento_conjunto: false,
        parceiro_tem_renda: false,
        renda_total_para_fluxo: 3200,
        regime_trabalho: "clt"
      };

    case "fx_gate_ctps_solo_alta_v1":
      return {
        somar_renda: false,
        financiamento_conjunto: false,
        parceiro_tem_renda: false,
        renda_total_para_fluxo: 5200,
        regime_trabalho: "clt"
      };

    case "fx_gate_ctps_conjunto_v1":
      return {
        somar_renda: true,
        financiamento_conjunto: true,
        composicao_pessoa: "casal",
        parceiro_tem_renda: true,
        renda_total_para_fluxo: 6500,
        regime_trabalho: "clt",
        regime_trabalho_parceiro: "clt"
      };

    case "fx_gate_dependente_v1":
      return {
        somar_renda: false,
        financiamento_conjunto: false,
        parceiro_tem_renda: false,
        renda_total_para_fluxo: 3200,
        regime_trabalho: "clt"
      };

    case "fx_contexto_extra_v1":
      return {
        somar_renda: true,
        financiamento_conjunto: false,
        composicao_pessoa: null,
        renda: 1800,
        renda_total_para_fluxo: 1800,
        regime_trabalho: "clt"
      };

    case "fx_contexto_mista_v1":
      return {
        somar_renda: false,
        financiamento_conjunto: false,
        renda: 1800,
        renda_total_para_fluxo: 1800,
        regime_trabalho: "clt",
        renda_mista: false
      };

    case "fx_autonomo_sem_ir_v1":
      return {
        somar_renda: false,
        financiamento_conjunto: false,
        parceiro_tem_renda: false,
        regime_trabalho: "autonomo",
        renda_total_para_fluxo: 2200
      };

    case "fx_p3_v1":
      return {
        p3_required: true,
        p3_done: false,
        familiar_tipo: "pai",
        composicao_pessoa: "familiar"
      };

    case "fx_restricao_v1":
      return {
        restricao: true,
        valor_restricao_aproximado: 500,
        renda_total_para_fluxo: 7200
      };

    case "fx_docs_text_v1":
      return {
        fase_conversa: "envio_docs",
        docs_faltantes: ["rg", "cpf"],
        docs_status_geral: "pendente",
        docs_lista_enviada: true
      };

    case "fx_docs_media_v1":
      return {
        fase_conversa: "envio_docs",
        docs_faltantes: ["comprovante_renda"],
        docs_status_geral: "parcial",
        docs_itens_recebidos: ["rg", "cpf"]
      };

    default:
      return null;
  }
}

function enovaBuildReplayTextEvent(wa_id, text) {
  return {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: { messages: [{ from: wa_id, id: `wamid.${Date.now()}`, timestamp: String(Math.floor(Date.now()/1000)), type: "text", text: { body: text } }], contacts: [{ wa_id }], metadata: { phone_number_id: "test" } } }] }]
  };
}

async function enovaExecuteScenarioMode(env, ctx, scenario) {
  const wa_id = `canon_${scenario.id}`;
  const startStage = scenario.start_stage;
  const fixturePatch = enovaV1FixturePatch(scenario.fixture);

  if (!fixturePatch) return { ok: false, error: "fixture_not_found" };

  if (scenario.mode === "simulate-funnel") {
    return await simulateFunnel(env, { wa_id, startStage, script: scenario.script || [scenario.input || ""], dryRun: true });
  }

  const previousCtx = env.__enovaSimulationCtx;
  env.__enovaSimulationCtx = {
    active: true,
    dryRun: true,
    stateByWaId: {},
    messageLog: [],
    writeLog: [],
    writesByWaId: {},
    suppressExternalSend: true,
    wouldSend: false,
    sendPreview: null
  };

  try {
    const base = createSimulationState(wa_id, startStage);
    env.__enovaSimulationCtx.stateByWaId[wa_id] = { ...base, ...fixturePatch, fase_conversa: startStage, wa_id };

    if (scenario.mode === "simulate-from-state") {
      const st = env.__enovaSimulationCtx.stateByWaId[wa_id];
      const runResult = await runFunnel(env, st, scenario.input || "");
      const after = env.__enovaSimulationCtx.stateByWaId[wa_id]?.fase_conversa || st.fase_conversa;
      return {
        ok: true,
        stage_after: after,
        run_result: runResult,
        writes: env.__enovaSimulationCtx.writesByWaId[wa_id] || null,
        trace: env.__enovaSimulationCtx.messageLog || []
      };
    }

    if (scenario.mode === "replay-webhook") {
      const event = scenario.webhook_event || enovaBuildReplayTextEvent(wa_id, scenario.input || "ok");
      const req = new Request("https://enova.local/webhook/meta", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event) });
      const resp = await handleMetaWebhook(req, env, ctx);
      return {
        ok: resp?.ok !== false,
        stage_after: env.__enovaSimulationCtx.stateByWaId[wa_id]?.fase_conversa || startStage,
        writes: env.__enovaSimulationCtx.writesByWaId[wa_id] || null,
        trace: env.__enovaSimulationCtx.messageLog || []
      };
    }

    return { ok: false, error: "mode_not_implemented" };
  } finally {
    env.__enovaSimulationCtx = previousCtx;
  }
}

function enovaClassifyFailure(reason) {
  if (reason.includes("stage_invalido")) return "FAIL_STAGE_INVALIDO";
  if (reason.includes("alias_banido")) return "FAIL_ALIAS_BANIDO";
  if (reason.includes("modo_invalido")) return "FAIL_MODO_INVALIDO";
  if (reason.includes("fixture")) return "FAIL_FIXTURE";
  if (reason.includes("cenario_malformado")) return "FAIL_CENARIO_MALFORMADO";
  if (reason.includes("expected")) return "FAIL_EXPECTED";
  return "FAIL_FUNIL";
}

function enovaV1Scenarios(modeOverride = null) {
  const common = [
    { id: "topo_inicio", grupo: "topo", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "inicio", input: "oi", expected: { type: "multiple", in: ["inicio_programa","inicio_decisao"] } },
    { id: "topo_inicio_programa", grupo: "topo", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "inicio_programa", input: "sim", expected: { type: "multiple", in: ["inicio_nome","inicio_programa"] } },
    { id: "topo_inicio_nome", grupo: "topo", mode: "simulate-from-state", allowed_modes: ["simulate-from-state"], fixture: "fx_base_topo_v1", start_stage: "inicio_nome", input: "João Teste", expected: { type: "single", equals: "inicio_nacionalidade" }, assert_state_write: ["nome"] },
    { id: "topo_inicio_nacionalidade", grupo: "topo", mode: "simulate-from-state", allowed_modes: ["simulate-from-state"], fixture: "fx_base_topo_v1", start_stage: "inicio_nacionalidade", input: "sou estrangeiro", expected: { type: "single", equals: "inicio_rnm" } },
    { id: "topo_inicio_rnm", grupo: "topo", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "inicio_rnm", input: "sim", expected: { type: "single", equals: "inicio_rnm_validade" } },
    { id: "topo_inicio_rnm_validade", grupo: "topo", mode: "simulate-from-state", allowed_modes: ["simulate-from-state"], fixture: "fx_base_topo_v1", start_stage: "inicio_rnm_validade", input: "12/2030", expected: { type: "multiple", in: ["estado_civil","inicio_rnm_validade"] } },

    { id: "civil_estado_civil_solteiro", grupo: "civil", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "estado_civil", input: "solteiro", expected: { type: "single", equals: "somar_renda_solteiro" } },
    { id: "civil_estado_civil_casado", grupo: "civil", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "estado_civil", input: "casado", expected: { type: "single", equals: "confirmar_casamento" } },
    { id: "civil_estado_civil_uniao_estavel", grupo: "civil", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "estado_civil", input: "moro junto, união estável", expected: { type: "single", equals: "financiamento_conjunto" } },
    { id: "civil_estado_civil_divorciado", grupo: "civil", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "estado_civil", input: "divorciado", expected: { type: "single", equals: "verificar_averbacao" } },
    { id: "civil_estado_civil_viuvo", grupo: "civil", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "estado_civil", input: "viúvo", expected: { type: "single", equals: "verificar_inventario" } },
    { id: "civil_estado_civil_fallback", grupo: "civil", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "estado_civil", input: "não entendi", expected: { type: "single", equals: "estado_civil" }, assert_stayed: true },

    { id: "civil_confirmar_casamento_civil", grupo: "civil", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_composicao_v1", start_stage: "confirmar_casamento", input: "sim", expected: { type: "single", equals: "regime_trabalho" } },
    { id: "civil_confirmar_casamento_uniao", grupo: "civil", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_composicao_v1", start_stage: "confirmar_casamento", input: "não", expected: { type: "single", equals: "financiamento_conjunto" } },
    { id: "civil_confirmar_casamento_fallback", grupo: "civil", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_composicao_v1", start_stage: "confirmar_casamento", input: "talvez", expected: { type: "single", equals: "confirmar_casamento" }, assert_stayed: true },

    { id: "civil_financiamento_conjunto_juntos", grupo: "civil", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_composicao_v1", start_stage: "financiamento_conjunto", input: "vamos comprar juntos", expected: { type: "single", equals: "regime_trabalho" } },
    { id: "civil_financiamento_conjunto_somente_titular", grupo: "civil", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_composicao_v1", start_stage: "financiamento_conjunto", input: "só eu", expected: { type: "single", equals: "regime_trabalho" } },
    { id: "civil_financiamento_conjunto_se_precisar", grupo: "civil", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_composicao_v1", start_stage: "financiamento_conjunto", input: "se precisar", expected: { type: "single", equals: "regime_trabalho" } },
    { id: "civil_financiamento_conjunto_fallback", grupo: "civil", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_composicao_v1", start_stage: "financiamento_conjunto", input: "talvez", expected: { type: "single", equals: "financiamento_conjunto" }, assert_stayed: true },
    { id: "composicao_solo_sem_composicao", grupo: "composicao", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "somar_renda_solteiro", input: "só minha renda", expected: { type: "single", equals: "regime_trabalho" } },
    { id: "composicao_solo_parceiro", grupo: "composicao", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "somar_renda_solteiro", input: "quero somar com minha esposa", expected: { type: "single", equals: "regime_trabalho_parceiro" } },
    { id: "composicao_solo_familiar_pai", grupo: "composicao", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "somar_renda_solteiro", input: "quero somar com meu pai", expected: { type: "single", equals: "pais_casados_civil_pergunta" } },
    { id: "composicao_solo_familiar_generico", grupo: "composicao", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "somar_renda_solteiro", input: "quero somar com um familiar", expected: { type: "single", equals: "somar_renda_familiar" } },
    { id: "composicao_solo_fallback", grupo: "composicao", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "somar_renda_solteiro", input: "talvez depois", expected: { type: "single", equals: "somar_renda_solteiro" }, assert_stayed: true },

    { id: "composicao_familiar_pai", grupo: "composicao", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_composicao_v1", start_stage: "somar_renda_familiar", input: "meu pai", expected: { type: "single", equals: "pais_casados_civil_pergunta" } },
    { id: "composicao_familiar_avo", grupo: "composicao", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_composicao_v1", start_stage: "somar_renda_familiar", input: "minha avó", expected: { type: "single", equals: "confirmar_avo_familiar" } },
    { id: "composicao_familiar_irmao", grupo: "composicao", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_composicao_v1", start_stage: "somar_renda_familiar", input: "meu irmão", expected: { type: "single", equals: "regime_trabalho_parceiro_familiar" } },
    { id: "composicao_familiar_fallback", grupo: "composicao", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_composicao_v1", start_stage: "somar_renda_familiar", input: "não sei ainda", expected: { type: "single", equals: "somar_renda_familiar" }, assert_stayed: true },

    { id: "composicao_pais_casados_sim", grupo: "composicao", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_p3_v1", start_stage: "pais_casados_civil_pergunta", input: "sim", expected: { type: "single", equals: "regime_trabalho_parceiro_familiar" } },
    { id: "composicao_pais_casados_nao", grupo: "composicao", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_p3_v1", start_stage: "pais_casados_civil_pergunta", input: "não", expected: { type: "single", equals: "regime_trabalho_parceiro_familiar" } },
    { id: "composicao_pais_casados_fallback", grupo: "composicao", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_p3_v1", start_stage: "pais_casados_civil_pergunta", input: "talvez", expected: { type: "single", equals: "pais_casados_civil_pergunta" }, assert_stayed: true },

    { id: "composicao_avo_beneficio_rural", grupo: "composicao", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_p3_v1", start_stage: "confirmar_avo_familiar", input: "aposentadoria rural", expected: { type: "single", equals: "regime_trabalho_parceiro_familiar" } },
    { id: "composicao_avo_nao_sabe", grupo: "composicao", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_p3_v1", start_stage: "confirmar_avo_familiar", input: "não sei informar", expected: { type: "single", equals: "regime_trabalho_parceiro_familiar" } },
    { id: "composicao_avo_fallback", grupo: "composicao", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_p3_v1", start_stage: "confirmar_avo_familiar", input: "banana", expected: { type: "single", equals: "confirmar_avo_familiar" }, assert_stayed: true },
    { id: "renda_regime_clt", grupo: "renda_ir", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "regime_trabalho", input: "clt", expected: { type: "single", equals: "inicio_multi_regime_pergunta" } },
    { id: "renda_regime_servidor", grupo: "renda_ir", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "regime_trabalho", input: "servidor", expected: { type: "single", equals: "inicio_multi_regime_pergunta" } },
    { id: "renda_regime_aposentado", grupo: "renda_ir", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "regime_trabalho", input: "aposentado", expected: { type: "single", equals: "inicio_multi_regime_pergunta" } },
    { id: "renda_regime_autonomo", grupo: "renda_ir", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "regime_trabalho", input: "autônomo", expected: { type: "single", equals: "autonomo_ir_pergunta" } },
    { id: "renda_regime_fallback", grupo: "renda_ir", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "regime_trabalho", input: "talvez", expected: { type: "single", equals: "regime_trabalho" }, assert_stayed: true },

    { id: "renda_autonomo_ir_sim", grupo: "renda_ir", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "autonomo_ir_pergunta", input: "sim", expected: { type: "single", equals: "renda" } },
    { id: "renda_autonomo_ir_nao", grupo: "renda_ir", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "autonomo_ir_pergunta", input: "não", expected: { type: "single", equals: "autonomo_sem_ir_ir_este_ano" } },
    { id: "renda_autonomo_ir_fallback", grupo: "renda_ir", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "autonomo_ir_pergunta", input: "não sei", expected: { type: "single", equals: "autonomo_ir_pergunta" }, assert_stayed: true },

    { id: "renda_autonomo_sem_ir_ano_sim", grupo: "renda_ir", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "autonomo_sem_ir_ir_este_ano", input: "sim", expected: { type: "single", equals: "renda" } },
    { id: "renda_autonomo_sem_ir_ano_nao", grupo: "renda_ir", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "autonomo_sem_ir_ir_este_ano", input: "não", expected: { type: "single", equals: "autonomo_sem_ir_caminho" } },
    { id: "renda_autonomo_sem_ir_ano_fallback", grupo: "renda_ir", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_base_topo_v1", start_stage: "autonomo_sem_ir_ir_este_ano", input: "talvez", expected: { type: "single", equals: "autonomo_sem_ir_ir_este_ano" }, assert_stayed: true },

    { id: "multi_regime_pergunta_sim", grupo: "multi", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_renda_v1", start_stage: "inicio_multi_regime_pergunta", input: "sim", expected: { type: "single", equals: "inicio_multi_regime_coletar" } },
    { id: "multi_regime_pergunta_nao", grupo: "multi", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_renda_v1", start_stage: "inicio_multi_regime_pergunta", input: "não", expected: { type: "single", equals: "renda" } },
    { id: "multi_regime_pergunta_fallback", grupo: "multi", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_renda_v1", start_stage: "inicio_multi_regime_pergunta", input: "talvez", expected: { type: "single", equals: "inicio_multi_regime_pergunta" }, assert_stayed: true },

    { id: "multi_regime_coletar_valido", grupo: "multi", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_renda_v1", start_stage: "inicio_multi_regime_coletar", input: "autônomo", expected: { type: "single", equals: "inicio_multi_regime_pergunta" } },
    { id: "multi_regime_coletar_invalido", grupo: "multi", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_renda_v1", start_stage: "inicio_multi_regime_coletar", input: "banana", expected: { type: "single", equals: "inicio_multi_regime_coletar" }, assert_stayed: true },

    { id: "multi_renda_pergunta_sim", grupo: "multi", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_renda_v1", start_stage: "inicio_multi_renda_pergunta", input: "sim", expected: { type: "single", equals: "inicio_multi_renda_coletar" } },
    { id: "multi_renda_pergunta_nao", grupo: "multi", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_renda_v1", start_stage: "inicio_multi_renda_pergunta", input: "não", expected: { type: "single", equals: "ctps_36" } },
    { id: "multi_renda_pergunta_fallback", grupo: "multi", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_renda_v1", start_stage: "inicio_multi_renda_pergunta", input: "não sei", expected: { type: "single", equals: "inicio_multi_renda_pergunta" }, assert_stayed: true },

    { id: "multi_renda_coletar_valido", grupo: "multi", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_renda_v1", start_stage: "inicio_multi_renda_coletar", input: "1200", expected: { type: "single", equals: "inicio_multi_renda_pergunta" } },
    { id: "multi_renda_coletar_invalido", grupo: "multi", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_renda_v1", start_stage: "inicio_multi_renda_coletar", input: "quase nada", expected: { type: "single", equals: "inicio_multi_renda_coletar" }, assert_stayed: true },
    { id: "parceiro_tem_renda_sim", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "parceiro_tem_renda", input: "sim", expected: { type: "single", equals: "regime_trabalho_parceiro" } },
    { id: "parceiro_tem_renda_nao_com_titular_ok", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "parceiro_tem_renda", input: "não", expected: { type: "single", equals: "ctps_36" } },
    { id: "parceiro_tem_renda_fallback", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "parceiro_tem_renda", input: "talvez", expected: { type: "single", equals: "parceiro_tem_renda" }, assert_stayed: true },

    { id: "parceiro_regime_clt", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "regime_trabalho_parceiro", input: "clt", expected: { type: "single", equals: "inicio_multi_regime_pergunta_parceiro" } },
    { id: "parceiro_regime_autonomo", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "regime_trabalho_parceiro", input: "autônomo", expected: { type: "single", equals: "inicio_multi_regime_pergunta_parceiro" } },
    { id: "parceiro_regime_servidor", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "regime_trabalho_parceiro", input: "servidor", expected: { type: "single", equals: "inicio_multi_regime_pergunta_parceiro" } },
    { id: "parceiro_regime_aposentado", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "regime_trabalho_parceiro", input: "aposentado", expected: { type: "single", equals: "inicio_multi_regime_pergunta_parceiro" } },
    { id: "parceiro_regime_fallback", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "regime_trabalho_parceiro", input: "banana", expected: { type: "single", equals: "regime_trabalho_parceiro" }, assert_stayed: true },

    { id: "parceiro_multi_regime_pergunta_sim", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "inicio_multi_regime_pergunta_parceiro", input: "sim", expected: { type: "single", equals: "inicio_multi_regime_coletar_parceiro" } },
    { id: "parceiro_multi_regime_pergunta_nao", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "inicio_multi_regime_pergunta_parceiro", input: "não", expected: { type: "multiple", in: ["renda_parceiro","ctps_36","regime_trabalho"] } },
    { id: "parceiro_multi_regime_pergunta_fallback", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "inicio_multi_regime_pergunta_parceiro", input: "talvez", expected: { type: "single", equals: "inicio_multi_regime_pergunta_parceiro" }, assert_stayed: true },

    { id: "parceiro_multi_regime_coletar_valido", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "inicio_multi_regime_coletar_parceiro", input: "autônomo", expected: { type: "single", equals: "inicio_multi_regime_pergunta_parceiro" } },
    { id: "parceiro_multi_regime_coletar_invalido", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "inicio_multi_regime_coletar_parceiro", input: "batata", expected: { type: "single", equals: "inicio_multi_regime_coletar_parceiro" }, assert_stayed: true },

    { id: "parceiro_renda_valida", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "renda_parceiro", input: "2500", expected: { type: "single", equals: "inicio_multi_renda_pergunta_parceiro" } },
    { id: "parceiro_renda_invalida", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "renda_parceiro", input: "mais ou menos", expected: { type: "single", equals: "renda_parceiro" }, assert_stayed: true },

    { id: "parceiro_multi_renda_pergunta_sim", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "inicio_multi_renda_pergunta_parceiro", input: "sim", expected: { type: "single", equals: "inicio_multi_renda_coletar_parceiro" } },
    { id: "parceiro_multi_renda_pergunta_nao", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "inicio_multi_renda_pergunta_parceiro", input: "não", expected: { type: "multiple", in: ["ir_declarado","regime_trabalho","ctps_36"] } },
    { id: "parceiro_multi_renda_pergunta_fallback", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "inicio_multi_renda_pergunta_parceiro", input: "não sei", expected: { type: "single", equals: "inicio_multi_renda_pergunta_parceiro" }, assert_stayed: true },

    { id: "parceiro_multi_renda_coletar_valido", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "inicio_multi_renda_coletar_parceiro", input: "1200", expected: { type: "single", equals: "inicio_multi_renda_pergunta_parceiro" } },
    { id: "parceiro_multi_renda_coletar_invalido", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "inicio_multi_renda_coletar_parceiro", input: "quase nada", expected: { type: "single", equals: "inicio_multi_renda_coletar_parceiro" }, assert_stayed: true },

    { id: "parceiro_ctps_36_sim", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "ctps_36_parceiro", input: "sim", expected: { type: "multiple", in: ["restricao_parceiro","restricao"] } },
    { id: "parceiro_ctps_36_nao", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "ctps_36_parceiro", input: "não", expected: { type: "multiple", in: ["restricao_parceiro","restricao"] } },
    { id: "parceiro_ctps_36_fallback", grupo: "parceiro", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_parceiro_v1", start_stage: "ctps_36_parceiro", input: "banana", expected: { type: "single", equals: "ctps_36_parceiro" }, assert_stayed: true },
    
    { id: "familiar_regime_clt", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "regime_trabalho_parceiro_familiar", input: "clt", expected: { type: "multiple", in: ["inicio_multi_regime_familiar_pergunta","renda_parceiro_familiar"] } },
    { id: "familiar_regime_autonomo", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "regime_trabalho_parceiro_familiar", input: "autônomo", expected: { type: "multiple", in: ["inicio_multi_regime_familiar_pergunta","renda_parceiro_familiar"] } },
    { id: "familiar_regime_servidor", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "regime_trabalho_parceiro_familiar", input: "servidor", expected: { type: "multiple", in: ["inicio_multi_regime_familiar_pergunta","renda_parceiro_familiar"] } },
    { id: "familiar_regime_aposentado", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "regime_trabalho_parceiro_familiar", input: "aposentado", expected: { type: "multiple", in: ["inicio_multi_regime_familiar_pergunta","renda_parceiro_familiar"] } },
    { id: "familiar_regime_fallback", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "regime_trabalho_parceiro_familiar", input: "banana", expected: { type: "single", equals: "regime_trabalho_parceiro_familiar" }, assert_stayed: true },

    { id: "familiar_multi_regime_pergunta_sim", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "inicio_multi_regime_familiar_pergunta", input: "sim", expected: { type: "single", equals: "inicio_multi_regime_familiar_loop" } },
    { id: "familiar_multi_regime_pergunta_nao", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "inicio_multi_regime_familiar_pergunta", input: "não", expected: { type: "single", equals: "renda_parceiro_familiar" } },
    { id: "familiar_multi_regime_pergunta_fallback", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "inicio_multi_regime_familiar_pergunta", input: "talvez", expected: { type: "single", equals: "inicio_multi_regime_familiar_pergunta" }, assert_stayed: true },

    { id: "familiar_multi_regime_loop_valido", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "inicio_multi_regime_familiar_loop", input: "autônomo", expected: { type: "single", equals: "inicio_multi_regime_familiar_pergunta" } },
    { id: "familiar_multi_regime_loop_invalido", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "inicio_multi_regime_familiar_loop", input: "batata", expected: { type: "single", equals: "inicio_multi_regime_familiar_loop" }, assert_stayed: true },

    { id: "familiar_renda_valida", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "renda_parceiro_familiar", input: "2500", expected: { type: "single", equals: "inicio_multi_renda_familiar_pergunta" } },
    { id: "familiar_renda_invalida", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "renda_parceiro_familiar", input: "mais ou menos", expected: { type: "single", equals: "renda_parceiro_familiar" }, assert_stayed: true },

    { id: "familiar_multi_renda_pergunta_sim", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "inicio_multi_renda_familiar_pergunta", input: "sim", expected: { type: "single", equals: "inicio_multi_renda_familiar_loop" } },
    { id: "familiar_multi_renda_pergunta_nao", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "inicio_multi_renda_familiar_pergunta", input: "não", expected: { type: "single", equals: "ctps_36_parceiro" } },
    { id: "familiar_multi_renda_pergunta_fallback", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "inicio_multi_renda_familiar_pergunta", input: "não sei", expected: { type: "single", equals: "inicio_multi_renda_familiar_pergunta" }, assert_stayed: true },

    { id: "familiar_multi_renda_loop_valido", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "inicio_multi_renda_familiar_loop", input: "1200", expected: { type: "single", equals: "inicio_multi_renda_familiar_pergunta" } },
    { id: "familiar_multi_renda_loop_invalido", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "inicio_multi_renda_familiar_loop", input: "quase nada", expected: { type: "single", equals: "inicio_multi_renda_familiar_loop" }, assert_stayed: true },

    { id: "familiar_ctps_36_sim", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "ctps_36_parceiro", input: "sim", expected: { type: "multiple", in: ["restricao_parceiro","p3_tipo_pergunta"] } },
    { id: "familiar_ctps_36_nao", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "ctps_36_parceiro", input: "não", expected: { type: "multiple", in: ["restricao_parceiro","p3_tipo_pergunta"] } },
    { id: "familiar_ctps_36_fallback", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_v1", start_stage: "ctps_36_parceiro", input: "banana", expected: { type: "single", equals: "ctps_36_parceiro" }, assert_stayed: true },

    { id: "p3_tipo_pai", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "p3_tipo_pergunta", input: "pai", expected: { type: "single", equals: "regime_trabalho_parceiro_familiar_p3" } },
    { id: "p3_tipo_mae", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "p3_tipo_pergunta", input: "mãe", expected: { type: "single", equals: "regime_trabalho_parceiro_familiar_p3" } },
    { id: "p3_tipo_irmao", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "p3_tipo_pergunta", input: "irmão", expected: { type: "single", equals: "regime_trabalho_parceiro_familiar_p3" } },
    { id: "p3_tipo_fallback", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "p3_tipo_pergunta", input: "talvez", expected: { type: "single", equals: "p3_tipo_pergunta" }, assert_stayed: true },

    { id: "p3_regime_clt", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "regime_trabalho_parceiro_familiar_p3", input: "clt", expected: { type: "multiple", in: ["inicio_multi_regime_p3_pergunta","renda_parceiro_familiar_p3"] } },
    { id: "p3_regime_autonomo", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "regime_trabalho_parceiro_familiar_p3", input: "autônomo", expected: { type: "multiple", in: ["inicio_multi_regime_p3_pergunta","renda_parceiro_familiar_p3"] } },
    { id: "p3_regime_servidor", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "regime_trabalho_parceiro_familiar_p3", input: "servidor", expected: { type: "multiple", in: ["inicio_multi_regime_p3_pergunta","renda_parceiro_familiar_p3"] } },
    { id: "p3_regime_aposentado", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "regime_trabalho_parceiro_familiar_p3", input: "aposentado", expected: { type: "multiple", in: ["inicio_multi_regime_p3_pergunta","renda_parceiro_familiar_p3"] } },
    { id: "p3_regime_fallback", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "regime_trabalho_parceiro_familiar_p3", input: "banana", expected: { type: "single", equals: "regime_trabalho_parceiro_familiar_p3" }, assert_stayed: true },

    { id: "p3_multi_regime_pergunta_sim", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "inicio_multi_regime_p3_pergunta", input: "sim", expected: { type: "single", equals: "inicio_multi_regime_p3_loop" } },
    { id: "p3_multi_regime_pergunta_nao", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "inicio_multi_regime_p3_pergunta", input: "não", expected: { type: "single", equals: "renda_parceiro_familiar_p3" } },
    { id: "p3_multi_regime_pergunta_fallback", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "inicio_multi_regime_p3_pergunta", input: "não sei", expected: { type: "single", equals: "inicio_multi_regime_p3_pergunta" }, assert_stayed: true },

    { id: "p3_multi_regime_loop_valido", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "inicio_multi_regime_p3_loop", input: "autônomo", expected: { type: "single", equals: "inicio_multi_regime_p3_pergunta" } },
    { id: "p3_multi_regime_loop_invalido", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "inicio_multi_regime_p3_loop", input: "batata", expected: { type: "single", equals: "inicio_multi_regime_p3_loop" }, assert_stayed: true },

    { id: "p3_renda_valida", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "renda_parceiro_familiar_p3", input: "2500", expected: { type: "single", equals: "inicio_multi_renda_p3_pergunta" } },
    { id: "p3_renda_invalida", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "renda_parceiro_familiar_p3", input: "mais ou menos", expected: { type: "single", equals: "renda_parceiro_familiar_p3" }, assert_stayed: true },

    { id: "p3_multi_renda_pergunta_sim", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "inicio_multi_renda_p3_pergunta", input: "sim", expected: { type: "single", equals: "inicio_multi_renda_p3_loop" } },
    { id: "p3_multi_renda_pergunta_nao", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "inicio_multi_renda_p3_pergunta", input: "não", expected: { type: "single", equals: "ctps_36_parceiro_p3" } },
    { id: "p3_multi_renda_pergunta_fallback", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "inicio_multi_renda_p3_pergunta", input: "talvez", expected: { type: "single", equals: "inicio_multi_renda_p3_pergunta" }, assert_stayed: true },

    { id: "p3_multi_renda_loop_valido", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "inicio_multi_renda_p3_loop", input: "1200", expected: { type: "single", equals: "inicio_multi_renda_p3_pergunta" } },
    { id: "p3_multi_renda_loop_invalido", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "inicio_multi_renda_p3_loop", input: "quase nada", expected: { type: "single", equals: "inicio_multi_renda_p3_loop" }, assert_stayed: true },

    { id: "p3_ctps_36_sim", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "ctps_36_parceiro_p3", input: "sim", expected: { type: "single", equals: "restricao_parceiro_p3" } },
    { id: "p3_ctps_36_nao", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "ctps_36_parceiro_p3", input: "não", expected: { type: "single", equals: "restricao_parceiro_p3" } },
    { id: "p3_ctps_36_fallback", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "ctps_36_parceiro_p3", input: "banana", expected: { type: "single", equals: "ctps_36_parceiro_p3" }, assert_stayed: true },

    { id: "p3_restricao_sim", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "restricao_parceiro_p3", input: "sim", expected: { type: "single", equals: "regularizacao_restricao_p3" } },
    { id: "p3_restricao_nao", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "restricao_parceiro_p3", input: "não", expected: { type: "single", equals: "regime_trabalho" } },
    { id: "p3_restricao_fallback", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "restricao_parceiro_p3", input: "banana", expected: { type: "single", equals: "restricao_parceiro_p3" }, assert_stayed: true },

    { id: "p3_regularizacao_sim", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "regularizacao_restricao_p3", input: "sim", expected: { type: "multiple", in: ["regime_trabalho","envio_docs"] } },
    { id: "p3_regularizacao_nao", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "regularizacao_restricao_p3", input: "não", expected: { type: "multiple", in: ["regime_trabalho","envio_docs","regularizacao_restricao_p3"] } },
    { id: "p3_regularizacao_fallback", grupo: "familiar_p3", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_familiar_p3_v1", start_stage: "regularizacao_restricao_p3", input: "banana", expected: { type: "single", equals: "regularizacao_restricao_p3" }, assert_stayed: true },

        { id: "gates_renda_solo_valida", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_renda_solo_v1", start_stage: "renda", input: "3500", expected: { type: "multiple", in: ["inicio_multi_renda_pergunta","quem_pode_somar"] } },
    { id: "gates_renda_parceiro_valida", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_renda_parceiro_v1", start_stage: "renda", input: "3500", expected: { type: "multiple", in: ["renda_parceiro","quem_pode_somar","inicio_multi_renda_pergunta"] } },
    { id: "gates_renda_invalida", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_renda_solo_v1", start_stage: "renda", input: "mais ou menos", expected: { type: "single", equals: "renda" }, assert_stayed: true },

    { id: "gates_ir_declarado_autonomo_sim", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_ir_autonomo_v1", start_stage: "ir_declarado", input: "sim", expected: { type: "multiple", in: ["renda","ctps_36"] } },
    { id: "gates_ir_declarado_autonomo_nao", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_ir_autonomo_v1", start_stage: "ir_declarado", input: "não", expected: { type: "multiple", in: ["autonomo_compor_renda","renda","ctps_36"] } },
    { id: "gates_ir_declarado_parceiro_sim", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_ir_parceiro_v1", start_stage: "ir_declarado", input: "sim", expected: { type: "multiple", in: ["renda_parceiro","ctps_36","renda"] } },
    { id: "gates_ir_declarado_parceiro_nao", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_ir_parceiro_v1", start_stage: "ir_declarado", input: "não", expected: { type: "multiple", in: ["autonomo_compor_renda","renda_parceiro","ctps_36"] } },
    { id: "gates_ir_declarado_fallback", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_ir_autonomo_v1", start_stage: "ir_declarado", input: "talvez", expected: { type: "single", equals: "ir_declarado" }, assert_stayed: true },

    { id: "gates_autonomo_compor_renda_sim", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_ir_autonomo_v1", start_stage: "autonomo_compor_renda", input: "sim", expected: { type: "multiple", in: ["interpretar_composicao","renda"] } },
    { id: "gates_autonomo_compor_renda_nao", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_ir_autonomo_v1", start_stage: "autonomo_compor_renda", input: "não", expected: { type: "multiple", in: ["renda","interpretar_composicao"] } },
    { id: "gates_autonomo_compor_renda_fallback", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_ir_autonomo_v1", start_stage: "autonomo_compor_renda", input: "não sei", expected: { type: "single", equals: "autonomo_compor_renda" }, assert_stayed: true },

    { id: "gates_quem_pode_somar_parceiro", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_quem_somar_v1", start_stage: "quem_pode_somar", input: "minha esposa", expected: { type: "single", equals: "regime_trabalho_parceiro" } },
    { id: "gates_quem_pode_somar_pai", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_quem_somar_v1", start_stage: "quem_pode_somar", input: "meu pai", expected: { type: "single", equals: "pais_casados_civil_pergunta" } },
    { id: "gates_quem_pode_somar_familiar_generico", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_quem_somar_v1", start_stage: "quem_pode_somar", input: "minha irmã", expected: { type: "multiple", in: ["regime_trabalho_parceiro_familiar","somar_renda_familiar"] } },
    { id: "gates_quem_pode_somar_ninguem", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_quem_somar_v1", start_stage: "quem_pode_somar", input: "não tenho ninguém", expected: { type: "single", equals: "fim_ineligivel" } },
    { id: "gates_quem_pode_somar_fallback", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_quem_somar_v1", start_stage: "quem_pode_somar", input: "talvez", expected: { type: "single", equals: "quem_pode_somar" }, assert_stayed: true },

    { id: "gates_ctps_36_solo_baixa_sim", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_ctps_solo_v1", start_stage: "ctps_36", input: "sim", expected: { type: "multiple", in: ["dependente","restricao"] } },
    { id: "gates_ctps_36_solo_baixa_nao", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_ctps_solo_v1", start_stage: "ctps_36", input: "não", expected: { type: "multiple", in: ["dependente","restricao"] } },
    { id: "gates_ctps_36_solo_alta_sim", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_ctps_solo_alta_v1", start_stage: "ctps_36", input: "sim", expected: { type: "single", equals: "restricao" } },
    { id: "gates_ctps_36_conjunto_sim", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_ctps_conjunto_v1", start_stage: "ctps_36", input: "sim", expected: { type: "multiple", in: ["ctps_36_parceiro","restricao","dependente"] } },
    { id: "gates_ctps_36_fallback", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_ctps_solo_v1", start_stage: "ctps_36", input: "banana", expected: { type: "single", equals: "ctps_36" }, assert_stayed: true },

    { id: "gates_dependente_sim", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_dependente_v1", start_stage: "dependente", input: "sim", expected: { type: "single", equals: "restricao" } },
    { id: "gates_dependente_nao", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_dependente_v1", start_stage: "dependente", input: "não", expected: { type: "single", equals: "restricao" } },
    { id: "gates_dependente_fallback", grupo: "gates_finais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_gate_dependente_v1", start_stage: "dependente", input: "não sei", expected: { type: "single", equals: "dependente" }, assert_stayed: true },
    
    { id: "contexto_interpretar_composicao_parceiro", grupo: "contexto_extra", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_contexto_extra_v1", start_stage: "interpretar_composicao", input: "com meu parceiro", expected: { type: "single", equals: "regime_trabalho_parceiro" } },
    { id: "contexto_interpretar_composicao_familiar", grupo: "contexto_extra", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_contexto_extra_v1", start_stage: "interpretar_composicao", input: "com minha mãe", expected: { type: "single", equals: "somar_renda_familiar" } },
    { id: "contexto_interpretar_composicao_sozinho", grupo: "contexto_extra", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_contexto_extra_v1", start_stage: "interpretar_composicao", input: "só eu mesmo", expected: { type: "single", equals: "ir_declarado" } },
    { id: "contexto_interpretar_composicao_fallback", grupo: "contexto_extra", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_contexto_extra_v1", start_stage: "interpretar_composicao", input: "talvez", expected: { type: "single", equals: "interpretar_composicao" }, assert_stayed: true },

    { id: "contexto_possui_renda_extra_sim", grupo: "contexto_extra", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_contexto_mista_v1", start_stage: "possui_renda_extra", input: "sim, faço uber", expected: { type: "single", equals: "renda_mista_detalhe" } },
    { id: "contexto_possui_renda_extra_nao", grupo: "contexto_extra", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_contexto_mista_v1", start_stage: "possui_renda_extra", input: "não", expected: { type: "single", equals: "ir_declarado" } },
    { id: "contexto_possui_renda_extra_fallback", grupo: "contexto_extra", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_contexto_mista_v1", start_stage: "possui_renda_extra", input: "não sei", expected: { type: "single", equals: "possui_renda_extra" }, assert_stayed: true },

    { id: "contexto_renda_mista_valida", grupo: "contexto_extra", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_contexto_mista_v1", start_stage: "renda_mista_detalhe", input: "2000 clt + 1200 uber", expected: { type: "single", equals: "ir_declarado" } },
    { id: "contexto_renda_mista_invalida", grupo: "contexto_extra", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_contexto_mista_v1", start_stage: "renda_mista_detalhe", input: "mais ou menos", expected: { type: "single", equals: "renda_mista_detalhe" }, assert_stayed: true },

    { id: "contexto_sugerir_composicao_mista_parceiro", grupo: "contexto_extra", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_contexto_mista_v1", start_stage: "sugerir_composicao_mista", input: "com meu parceiro", expected: { type: "single", equals: "regime_trabalho_parceiro" } },
    { id: "contexto_sugerir_composicao_mista_familiar", grupo: "contexto_extra", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_contexto_mista_v1", start_stage: "sugerir_composicao_mista", input: "com minha mãe", expected: { type: "single", equals: "regime_trabalho_parceiro_familiar" } },
    { id: "contexto_sugerir_composicao_mista_fallback", grupo: "contexto_extra", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_contexto_mista_v1", start_stage: "sugerir_composicao_mista", input: "talvez", expected: { type: "single", equals: "sugerir_composicao_mista" }, assert_stayed: true },

    { id: "contexto_autonomo_sem_ir_caminho_parceiro", grupo: "contexto_extra", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_autonomo_sem_ir_v1", start_stage: "autonomo_sem_ir_caminho", input: "com meu parceiro", expected: { type: "single", equals: "regime_trabalho_parceiro" } },
    { id: "contexto_autonomo_sem_ir_caminho_familiar", grupo: "contexto_extra", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_autonomo_sem_ir_v1", start_stage: "autonomo_sem_ir_caminho", input: "com minha mãe", expected: { type: "single", equals: "somar_renda_familiar" } },
    { id: "contexto_autonomo_sem_ir_caminho_ninguem", grupo: "contexto_extra", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_autonomo_sem_ir_v1", start_stage: "autonomo_sem_ir_caminho", input: "não", expected: { type: "single", equals: "autonomo_sem_ir_entrada" } },
    { id: "contexto_autonomo_sem_ir_caminho_fallback", grupo: "contexto_extra", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_autonomo_sem_ir_v1", start_stage: "autonomo_sem_ir_caminho", input: "talvez", expected: { type: "single", equals: "autonomo_sem_ir_caminho" }, assert_stayed: true },

    { id: "contexto_autonomo_sem_ir_entrada_sim", grupo: "contexto_extra", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_autonomo_sem_ir_v1", start_stage: "autonomo_sem_ir_entrada", input: "sim", expected: { type: "single", equals: "renda" } },
    { id: "contexto_autonomo_sem_ir_entrada_nao", grupo: "contexto_extra", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_autonomo_sem_ir_v1", start_stage: "autonomo_sem_ir_entrada", input: "não", expected: { type: "single", equals: "fim_inelegivel" } },
    { id: "contexto_autonomo_sem_ir_entrada_fallback", grupo: "contexto_extra", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_autonomo_sem_ir_v1", start_stage: "autonomo_sem_ir_entrada", input: "talvez", expected: { type: "single", equals: "autonomo_sem_ir_entrada" }, assert_stayed: true },
    
    { id: "docs_textual_stay", grupo: "docs", mode: "simulate-from-state", allowed_modes: ["simulate-from-state"], fixture: "fx_docs_text_v1", start_stage: "envio_docs", input: "ainda não tenho todos", expected: { type: "single", equals: "envio_docs" }, assert_stayed: true },
   
    { id: "docs_media_pendente", grupo: "docs", mode: "replay-webhook", allowed_modes: ["replay-webhook"], fixture: "fx_docs_media_v1", start_stage: "envio_docs", input: "segue", expected: { type: "multiple", in: ["envio_docs","finalizacao"] } },
    { id: "docs_media_completa", grupo: "docs", mode: "simulate-funnel", allowed_modes: ["simulate-funnel"], fixture: "fx_docs_media_v1", start_stage: "envio_docs", script: ["enviei tudo"], expected: { type: "multiple", in: ["envio_docs","finalizacao"] } },
    { id: "regressao_docs_envio_docs", grupo: "regressao", mode: "simulate-from-state", allowed_modes: ["simulate-from-state"], fixture: "fx_restricao_v1", start_stage: "regularizacao_restricao", input: "sim", expected: { type: "single", equals: "envio_docs" } },
    { id: "stage_alias_docs_banido", grupo: "docs", mode: "simulate-from-state", allowed_modes: ["simulate-from-state"], fixture: "fx_docs_text_v1", start_stage: "docs", input: "oi", expected: { type: "single", equals: "envio_docs" } },

    { id: "restricao_solo", grupo: "restricao", mode: "simulate-from-state", allowed_modes: ["simulate-from-state"], fixture: "fx_restricao_v1", start_stage: "restricao", input: "sim", expected: { type: "single", equals: "regularizacao_restricao" } },
    { id: "restricao_parceiro", grupo: "restricao", mode: "simulate-from-state", allowed_modes: ["simulate-from-state","simulate-funnel"], fixture: "fx_restricao_parceiro_v1", start_stage: "restricao_parceiro", input: "não", expected: { type: "multiple", in: ["regularizacao_restricao_parceiro","envio_docs","restricao_parceiro_p3"] } },
    { id: "restricao_p3", grupo: "restricao", mode: "simulate-from-state", allowed_modes: ["simulate-from-state"], fixture: "fx_p3_v1", start_stage: "restricao_parceiro_p3", input: "sim", expected: { type: "single", equals: "regularizacao_restricao_p3" } },

    { id: "terminal_finalizacao_processo", grupo: "terminais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state"], fixture: "fx_renda_v1", start_stage: "finalizacao", input: "ok", expected: { type: "single", equals: "finalizacao_processo" } },
    { id: "terminal_fim_inelegivel_redirect", grupo: "terminais", mode: "simulate-from-state", allowed_modes: ["simulate-from-state"], fixture: "fx_base_topo_v1", start_stage: "fim_inelegivel", input: "ok", expected: { type: "context", in: ["fim_ineligivel","fim_inelegivel"], terminal_canonical: "fim_ineligivel" } },
    { id: "terminal_aguardando_retorno_replay", grupo: "terminais", mode: "replay-webhook", allowed_modes: ["replay-webhook"], fixture: "fx_base_topo_v1", start_stage: "aguardando_retorno_correspondente", input: "oi", expected: { type: "multiple", in: ["aguardando_retorno_correspondente","finalizacao_processo"] } },

    { id: "modo_contextual_invalido", grupo: "contrato", mode: "simulate-from-state", allowed_modes: ["replay-webhook"], fixture: "fx_docs_media_v1", start_stage: "envio_docs", input: "arquivo", expected: { type: "multiple", in: ["envio_docs","finalizacao"] } }
  ];

  return modeOverride
    ? common.map((s) => ({ ...s, mode: modeOverride }))
    : common;
}

async function runEnovaCanonicalSuiteV1(env, ctx, options = {}) {
  const startedAt = Date.now();
  const scenarios = enovaV1Scenarios(options.mode_override);
  const validStages = new Set(ENOVA_V1_VALID_STAGES);
  const bannedAliases = new Set(ENOVA_V1_BANNED_ALIASES);
  const items = scenarios.filter((s) => (!options.scenario_id || s.id === options.scenario_id) && (!options.group || s.grupo === options.group));

  const results = [];

  if (options.list === true) {
  return {
    ok: true,
    suite: "enova_worker_canonical_v1",
    scenarios: scenarios.map((s) => ({
      scenario_id: s.id,
      grupo: s.grupo,
      mode: s.mode,
      start_stage: s.start_stage,
      fixture: s.fixture
    })),
    ts: new Date().toISOString()
  };
}

  for (const s of items) {
    const result = {
      scenario_id: s.id,
      grupo: s.grupo,
      modo: s.mode,
      fixture: s.fixture,
      stage_inicial: s.start_stage,
      input: s.input || s.script || null,
      expected_type: s.expected?.type || "single",
      stage_retornado: null,
      writes_relevantes: null,
      status: "PASS",
      classification: "PASS",
      motivo: "ok",
      evidencias: []
    };

    if (!s.id || !s.fixture || !s.start_stage) {
      result.status = "FAIL";
      result.classification = "FAIL_CENARIO_MALFORMADO";
      result.motivo = "cenario_malformado:campos_obrigatorios";
      results.push(result);
      continue;
    }

    if (bannedAliases.has(s.start_stage) || s.start_stage === "docs") {
      result.status = "FAIL";
      result.classification = "FAIL_STAGE_INVALIDO";
      result.motivo = "stage_invalido:alias_banido";
      results.push(result);
      continue;
    }

    if (!validStages.has(s.start_stage)) {
      result.status = "FAIL";
      result.classification = "FAIL_STAGE_INVALIDO";
      result.motivo = "stage_invalido:fora_catalogo";
      results.push(result);
      continue;
    }

    if (!Array.isArray(s.allowed_modes) || !s.allowed_modes.includes(s.mode)) {
      result.status = "FAIL";
      result.classification = "FAIL_MODO_INVALIDO";
      result.motivo = "modo_invalido:nao_permitido_no_cenario";
      results.push(result);
      continue;
    }

    if (!enovaV1FixturePatch(s.fixture)) {
      result.status = "FAIL";
      result.classification = "FAIL_FIXTURE";
      result.motivo = "fixture_not_found";
      results.push(result);
      continue;
    }

    let execResult;
    try {
      execResult = await enovaExecuteScenarioMode(env, ctx, s);
    } catch (err) {
      result.status = "FAIL";
      result.classification = "FAIL_FUNIL";
      result.motivo = `funil_exception:${err?.message || String(err)}`;
      results.push(result);
      continue;
    }

   if (!execResult?.ok) {
  result.status = "FAIL";
  result.classification = enovaClassifyFailure(execResult?.error || "funil_exec_error");
  result.motivo = execResult?.error || "funil_exec_error";
  results.push(result);
  continue;
}

const stageReturnedRaw =
  execResult?.end_stage ||
  execResult?.stage_after ||
  execResult?.steps?.[execResult.steps.length - 1]?.stage_after ||
  null;

const writes = execResult?.writes || null;
const phaseAfter = writes?.fase_conversa || null;

// Canonicalização operacional da suíte:
// - docs nunca é stage canônico de teste
// - se o retorno bruto ou a fase gravada vier como docs, comparar como envio_docs
const stageReturnedCanonical =
  stageReturnedRaw === "docs" || phaseAfter === "docs"
    ? "envio_docs"
    : stageReturnedRaw;

result.stage_before = s.start_stage;
result.stage_after = phaseAfter || stageReturnedRaw || null;
result.stage_retornado = stageReturnedRaw;
result.stage_retornado_canonico = stageReturnedCanonical;
result.writes_relevantes = writes;
result.expected_raw =
  s.expected?.equals ??
  s.expected?.in ??
  s.expected?.terminal_canonical ??
  null;

// docs continua banido como stage inicial inválido,
// mas retorno canonicalizado para envio_docs é válido na suíte.
const stageReturnedIsBannedAlias =
  stageReturnedCanonical &&
  bannedAliases.has(stageReturnedCanonical) &&
  stageReturnedCanonical !== "envio_docs";

if (stageReturnedIsBannedAlias) {
  result.status = "FAIL";
  result.classification = "FAIL_ALIAS_BANIDO";
  result.motivo = `alias_banido:stage_retorno:${stageReturnedCanonical}`;
  results.push(result);
  continue;
}

if (s.assert_stayed && stageReturnedCanonical !== s.start_stage) {
  result.status = "FAIL";
  result.classification = "FAIL_EXPECTED";
  result.motivo = "expected_stayed_in_stage";
  results.push(result);
  continue;
}

if (Array.isArray(s.assert_state_write) && s.assert_state_write.length) {
  const missing = s.assert_state_write.filter((k) => typeof writes?.[k] === "undefined");
  if (missing.length) {
    result.status = "FAIL";
    result.classification = "FAIL_FIXTURE";
    result.motivo = `fixture_missing_write:${missing.join(",")}`;
    results.push(result);
    continue;
  }
}

const expected = s.expected || {};

if (expected.type === "single" && stageReturnedCanonical !== expected.equals) {
  result.status = "FAIL";
  result.classification = "FAIL_EXPECTED";
  result.motivo = `expected_single:${expected.equals}|got:${stageReturnedCanonical}`;
  results.push(result);
  continue;
}

if (
  (expected.type === "multiple" || expected.type === "context") &&
  Array.isArray(expected.in) &&
  !expected.in.includes(stageReturnedCanonical)
) {
  result.status = "FAIL";
  result.classification = "FAIL_EXPECTED";
  result.motivo = `expected_in:${expected.in.join(",")}|got:${stageReturnedCanonical}`;
  results.push(result);
  continue;
}

if (expected.terminal_canonical) {
  if (
    stageReturnedRaw === "fim_inelegivel" &&
    writes?.fase_conversa === expected.terminal_canonical
  ) {
    result.evidencias.push("terminal_redirect_detected");
  } else if (stageReturnedCanonical !== expected.terminal_canonical) {
    result.status = "FAIL";
    result.classification = "FAIL_EXPECTED";
    result.motivo = `expected_terminal_canonical:${expected.terminal_canonical}|got:${stageReturnedCanonical}`;
    results.push(result);
    continue;
  }
}

    if (Array.isArray(execResult?.trace) && execResult.trace.length) {
      result.evidencias.push("trace_present");
    }

    results.push(result);
  }

  const summary = {
    total: results.length,
    pass: results.filter((r) => r.classification === "PASS").length,
    fail_funil: results.filter((r) => r.classification === "FAIL_FUNIL").length,
    fail_teste: results.filter((r) => r.classification === "FAIL_EXPECTED" || r.classification === "FAIL_CENARIO_MALFORMADO").length,
    fail_fixture: results.filter((r) => r.classification === "FAIL_FIXTURE").length,
    fail_stage_invalido: results.filter((r) => r.classification === "FAIL_STAGE_INVALIDO").length,
    fail_alias: results.filter((r) => r.classification === "FAIL_ALIAS_BANIDO").length,
    fail_modo: results.filter((r) => r.classification === "FAIL_MODO_INVALIDO").length,
    duracao_ms: Date.now() - startedAt
  };

  return { ok: true, suite: "enova_worker_canonical_v1", summary, results };
}

function pickParser(type) {
  const t = String(type || "").trim().toLowerCase();

  // yesno: isYes/isNo -> intent
  if (t === "yesno") {
    return (text) => ({
      intent: isYes(text) ? "YES" : isNo(text) ? "NO" : "UNKNOWN"
    });
  }

  // restricao: hasRestricaoIndicador + isYes/isNo -> {hasRestricao, intent}
  if (t === "restricao") {
  return (text) => {
    const nt = normalizeText(text);

    const negacao =
      /\b(nao|não)\b/.test(nt) &&
      /\b(tenho|tem|possuo|estou)\b/.test(nt) &&
      /\b(restricao|spc|serasa|negativad|nome sujo|cpf sujo|pendencia|protesto|divida)\b/.test(nt);

    const semRestricao =
      /\bsem\b/.test(nt) &&
      /\b(restricao|spc|serasa|negativad|nome sujo|cpf sujo|pendencia|protesto|divida)\b/.test(nt);

    const has = (hasRestricaoIndicador(text) === true) && !(negacao || semRestricao);

    return {
      hasRestricao: has,
      intent: isYes(text) ? "YES" : isNo(text) ? "NO" : "UNKNOWN"
    };
  };
}

  // existentes
  if (t === "composicao") return (text) => parseComposicaoRenda(text);
  if (t === "estado_civil") return (text) => parseEstadoCivil(text);
  if (t === "regime") return (text) => parseRegimeTrabalho(text);
  if (t === "renda") return (text) => parseMoneyBR(text);

  // multi_*: só se existir no worker (não criar parser novo)
  if (t === "multi_regime" && typeof parseMultiRegime === "function") return (text) => parseMultiRegime(text);
  if (t === "multi_renda" && typeof parseMultiRenda === "function") return (text) => parseMultiRenda(text);

  return null;
}

function extractWaIdFromWebhookEvent(event) {
  const msgWa = event?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
  const statusWa = event?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]?.recipient_id;
  return String(msgWa || statusWa || "").trim() || null;
}

// =============================================================
// 🧱 A4 — Router do Worker (GET/POST META) — VERSÃO BLINDADA
// =============================================================

console.log("DEBUG-INIT-3: Prestes a entrar no export default router");

export default {
  async fetch(request, env, ctx) {

    console.log("DEBUG-INIT-4: Entrou no fetch() principal");
    
    const url = new URL(request.url);
    const pathname = url.pathname;

    // DEBUG: prova de versão do código que está no Git
    if (pathname === "/__build") {
      return new Response("BUILD=GIT_FULL_9K", { status: 200 });
    }

    // ---------------------------------------------
    // A8.2 — Validation Engine antes de QUALQUER coisa
    // ---------------------------------------------
    // ✅ Regra: rotas /__admin__/... devem continuar acessíveis (com admin-key)
    // mesmo se o worker estiver "misconfigured", para diagnóstico e replay dry-run.
    const isAdminPathEarly =
      pathname.startsWith("/__admin__/") ||
      pathname.startsWith("/__admin_prod__/");
    const reqKeyEarly = request.headers.get("x-enova-admin-key");
    const envKeyEarly = env.ENOVA_ADMIN_KEY;
    const isAdminAuthorizedEarly = Boolean(reqKeyEarly && envKeyEarly && reqKeyEarly === envKeyEarly);

    if (!(isAdminPathEarly && isAdminAuthorizedEarly)) {
      try {
        const validation = await validateEnv(env);

        if (!validation?.ok) {
          await telemetry(env, {
            wa_id: null,
            event: "worker_validation_fail",
            stage: "bootstrap",
            severity: "critical",
            message: "Falha na validação inicial do Worker",
            details: validation || {}
          });

          return new Response(
            JSON.stringify({
              ok: false,
              error: "Worker misconfigured",
              details: validation || {}
            }),
            {
              status: 500,
              headers: { "content-type": "application/json" }
            }
          );
        }
      } catch (err) {
        // Se até a validação quebrar, loga e responde 500
        await telemetry(env, {
          wa_id: null,
          event: "worker_validation_exception",
          stage: "bootstrap",
          severity: "critical",
          message: "Exceção ao rodar validationEngine",
          details: {
            name: err?.name || "Error",
            message: err?.message || String(err),
            stack: err?.stack || null
          }
        });

        return new Response(
          JSON.stringify({
            ok: false,
            error: "Worker misconfigured",
            details: {
              name: err?.name || "Error",
              message: err?.message || String(err)
            }
          }),
          {
            status: 500,
            headers: { "content-type": "application/json" }
          }
        );
      }
    }

    function adminJson(status, body) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" }
      });
    }

    function isAdminAuthorized() {
      const reqKey = request.headers.get("x-enova-admin-key");
      const envKey = env.ENOVA_ADMIN_KEY;
      return Boolean(reqKey && envKey && reqKey === envKey);
    }

    // ---------------------------------------------
// 🔐 Admin canônico — deve vir antes de /webhook/meta e fallback
// ---------------------------------------------
const envMode = String(env.ENV_MODE || env.ENOVA_ENV || "").toLowerCase();
const isAdminPath = pathname.startsWith("/__admin__/");

if (isAdminPath && envMode !== "test") {
  return adminJson(403, {
    ok: false,
    error: "forbidden_test_only",
    build: ENOVA_BUILD,
    ts: new Date().toISOString()
  });
}

// ---------------------------------------------
// 🔐 Admin PROD (controlado) — dry-run via PS
// ---------------------------------------------
const isAdminProdPath = pathname.startsWith("/__admin_prod__/");

if (isAdminProdPath) {
  const allowProdAdmin = String(env.ALLOW_ADMIN_PROD || "").toLowerCase() === "true";
  if (!allowProdAdmin) {
    return adminJson(403, {
      ok: false,
      error: "forbidden_prod_admin_disabled",
      build: ENOVA_BUILD,
      ts: new Date().toISOString()
    });
  }

  if (!isAdminAuthorized()) {
    return adminJson(401, {
      ok: false,
      error: "unauthorized",
      build: ENOVA_BUILD,
      ts: new Date().toISOString()
    });
  }
}
    
    if (request.method === "GET" && pathname === "/__admin__/health") {
      if (!isAdminAuthorized()) {
        return adminJson(401, {
          ok: false,
          error: "unauthorized",
          build: ENOVA_BUILD,
          ts: new Date().toISOString()
        });
      }

      return adminJson(200, {
        ok: true,
        build: ENOVA_BUILD,
        ts: new Date().toISOString()
      });
    }

    if (request.method === "POST" && pathname === "/__admin__/run-canonical-suite-v1") {
      if (!isAdminAuthorized()) {
        return adminJson(401, {
          ok: false,
          error: "unauthorized",
          build: ENOVA_BUILD,
          ts: new Date().toISOString()
        });
      }

      let payload;
      try {
        payload = await request.json();
      } catch {
        payload = {};
      }

      const result = await runEnovaCanonicalSuiteV1(env, ctx, {
  list: payload?.list === true,
  scenario_id: payload?.scenario_id ? String(payload.scenario_id) : null,
  group: payload?.group ? String(payload.group) : null,
  mode_override: payload?.mode_override ? String(payload.mode_override) : null
});

      return adminJson(200, {
        ...result,
        build: ENOVA_BUILD,
        ts: new Date().toISOString()
      });
    }

    if (request.method === "POST" && pathname === "/__admin__/send") {
      if (!isAdminAuthorized()) {
        return adminJson(401, {
          ok: false,
          error: "unauthorized",
          build: ENOVA_BUILD,
          ts: new Date().toISOString()
        });
      }

      let payload;
      try {
        payload = await request.json();
      } catch {
        return adminJson(400, {
          ok: false,
          error: "invalid_json",
          build: ENOVA_BUILD,
          ts: new Date().toISOString()
        });
      }

      const wa_id = String(payload?.wa_id || "").trim();
      const text = String(payload?.text || "").trim();

      if (!wa_id || !text) {
        return adminJson(400, {
          ok: false,
          error: "invalid_payload",
          details: "wa_id e text são obrigatórios",
          build: ENOVA_BUILD,
          ts: new Date().toISOString()
        });
      }

      const sendResult = await sendMessage(env, wa_id, text, { returnMeta: true });

      if (!sendResult?.ok) {
        return adminJson(502, {
          ok: false,
          meta_status: sendResult?.meta_status ?? null,
          message_id: null,
          build: ENOVA_BUILD,
          ts: new Date().toISOString()
        });
      }

      return adminJson(200, {
        ok: true,
        meta_status: sendResult.meta_status,
        message_id: sendResult.message_id ?? null,
        build: ENOVA_BUILD,
        ts: new Date().toISOString()
      });
    }

    if (request.method === "POST" && pathname === "/__admin_prod__/simulate-funnel") {
  // auth + allow já garantidos pelo gate isAdminProdPath

  let payload;
  try {
    payload = await request.json();
  } catch {
    return adminJson(400, {
      ok: false,
      error: "invalid_json",
      build: ENOVA_BUILD,
      ts: new Date().toISOString()
    });
  }

  const wa_id = String(payload?.wa_id || "").trim();
  const startStage = String(payload?.start_stage || "inicio").trim() || "inicio";
  const script = Array.isArray(payload?.script) ? payload.script : [];

  // ✅ PROD-ADMIN: dry-run SEMPRE (ignora payload.dry_run)
  const dryRun = true;

  if (!wa_id || !script.length || !script.every((s) => typeof s === "string")) {
    return adminJson(400, {
      ok: false,
      error: "invalid_payload",
      details: "wa_id e script(string[]) são obrigatórios",
      build: ENOVA_BUILD,
      ts: new Date().toISOString()
    });
  }

  const result = await simulateFunnel(env, {
    wa_id,
    startStage,
    script,
    dryRun
  });

  return adminJson(result.ok ? 200 : 500, result);
}

    if (request.method === "POST" && pathname === "/__admin__/simulate-funnel") {
     
      if (!isAdminAuthorized()) {
        return adminJson(401, {
          ok: false,
          error: "unauthorized",
          build: ENOVA_BUILD,
          ts: new Date().toISOString()
        });
      }

      let payload;
      try {
        payload = await request.json();
      } catch {
        return adminJson(400, {
          ok: false,
          error: "invalid_json",
          build: ENOVA_BUILD,
          ts: new Date().toISOString()
        });
      }

      const wa_id = String(payload?.wa_id || "").trim();
      const startStage = String(payload?.start_stage || "inicio").trim() || "inicio";
      const script = Array.isArray(payload?.script) ? payload.script : [];
      const dryRun = payload?.dry_run !== false;

      if (!wa_id || !script.length || !script.every((s) => typeof s === "string")) {
        return adminJson(400, {
          ok: false,
          error: "invalid_payload",
          details: "wa_id e script(string[]) são obrigatórios",
          build: ENOVA_BUILD,
          ts: new Date().toISOString()
        });
      }

      const result = await simulateFunnel(env, {
        wa_id,
        startStage,
        script,
        dryRun
      });

      return adminJson(result.ok ? 200 : 500, result);
    }

    if (request.method === "POST" && pathname === "/__admin__/simulate-from-state") {
      if (!isAdminAuthorized()) {
        return adminJson(401, {
          ok: false,
          error: "unauthorized",
          build: ENOVA_BUILD,
          ts: new Date().toISOString()
        });
      }

      let payload;
      try {
        payload = await request.json();
      } catch {
        return adminJson(400, {
          ok: false,
          error: "invalid_json",
          build: ENOVA_BUILD,
          ts: new Date().toISOString()
        });
      }

      const wa_id = String(payload?.wa_id || "").trim();
      const forcedStage = String(payload?.stage || "").trim();
      const text = String(payload?.text || "");
      const stOverrides = payload?.st_overrides && typeof payload.st_overrides === "object" ? payload.st_overrides : {};
      const dryRun = payload?.dry_run !== false;
      const maxSteps = Math.max(1, Math.min(3, Number(payload?.max_steps) || 1));

      if (!wa_id || !forcedStage) {
        return adminJson(400, {
          ok: false,
          error: "invalid_payload",
          details: "wa_id e stage são obrigatórios",
          build: ENOVA_BUILD,
          ts: new Date().toISOString()
        });
      }

      await telemetry(env, {
        wa_id,
        event: "admin_simulate_from_state",
        stage: forcedStage,
        severity: "info",
        message: "Admin simulate-from-state acionado",
        details: { dryRun, maxSteps }
      });

      const current = (await getState(env, wa_id)) || { wa_id, fase_conversa: forcedStage };
      const seeded = { ...current, ...stOverrides, wa_id, fase_conversa: forcedStage };
      const previousCtx = env.__enovaSimulationCtx;
      env.__enovaSimulationCtx = {
        active: true,
        dryRun,
        stateByWaId: { [wa_id]: seeded },
        messageLog: [],
        writeLog: [],
        writesByWaId: {},
        suppressExternalSend: true,
        wouldSend: false,
        sendPreview: null
      };

      let runErr = null;
      for (let i = 0; i < maxSteps; i++) {
        try {
          const stNow = env.__enovaSimulationCtx?.stateByWaId?.[wa_id] || seeded;
          await runFunnel(env, stNow, text);
        } catch (err) {
          runErr = err;
          break;
        }
      }

      const finalState = env.__enovaSimulationCtx?.stateByWaId?.[wa_id] || seeded;
      const lastReply = env.__enovaSimulationCtx?.messageLog?.[env.__enovaSimulationCtx.messageLog.length - 1]?.messages || null;
      const writes = env.__enovaSimulationCtx?.writesByWaId?.[wa_id] || null;
      env.__enovaSimulationCtx = previousCtx;

      return adminJson(runErr ? 500 : 200, {
        ok: !runErr,
        wa_id,
        stage_before: forcedStage,
        stage_after: finalState?.fase_conversa || forcedStage,
        writes,
        reply_text: Array.isArray(lastReply) ? lastReply.join("\n") : null,
        telemetry: runErr ? { error: runErr?.message || String(runErr) } : null,
        dry_run: dryRun,
        max_steps: maxSteps,
        build: ENOVA_BUILD,
        ts: new Date().toISOString()
      });
    }

    if (request.method === "POST" && pathname === "/__admin_prod__/test-parsers") {
  // auth + allow já garantidos pelo gate isAdminProdPath

  let payload;
  try {
    payload = await request.json();
  } catch {
    return adminJson(400, {
      ok: false,
      error: "invalid_json",
      build: ENOVA_BUILD,
      ts: new Date().toISOString()
    });
  }

  const cases = Array.isArray(payload?.cases) ? payload.cases : [];

  await telemetry(env, {
    wa_id: null,
    event: "admin_prod_test_parsers",
    stage: "admin_prod",
    severity: "info",
    message: "Admin PROD test-parsers acionado",
    details: { cases: cases.length }
  });

  const results = cases.map((c) => {
    const name = String(c?.name || "").trim();
    const type = String(c?.type || "").trim();
    const text = String(c?.text || "");
    const parser = pickParser(type);

    if (!parser) {
      const tt = String(type || "").trim().toLowerCase();
      let missing = tt;
      if (tt === "multi_regime") missing = "parseMultiRegime";
      if (tt === "multi_renda") missing = "parseMultiRenda";

      return { name, type, text, parsed: null, matched: [], notes: `parser_missing:${missing}` };
    }

    const parsedRaw = parser(text);
    const parsed = parsedRaw == null ? null : parsedRaw;
    return { name, type, text, parsed, matched: [], notes: "ok" };
  });

  return adminJson(200, {
    ok: true,
    results,
    build: ENOVA_BUILD,
    ts: new Date().toISOString()
  });
}

    if (request.method === "POST" && pathname === "/__admin__/test-parsers") {
      if (!isAdminAuthorized()) {
        return adminJson(401, {
          ok: false,
          error: "unauthorized",
          build: ENOVA_BUILD,
          ts: new Date().toISOString()
        });
      }

      let payload;
      try {
        payload = await request.json();
      } catch {
        return adminJson(400, {
          ok: false,
          error: "invalid_json",
          build: ENOVA_BUILD,
          ts: new Date().toISOString()
        });
      }

      const cases = Array.isArray(payload?.cases) ? payload.cases : [];
      await telemetry(env, {
        wa_id: null,
        event: "admin_test_parsers",
        stage: "admin",
        severity: "info",
        message: "Admin test-parsers acionado",
        details: { cases: cases.length }
      });

      const results = cases.map((c) => {
        const name = String(c?.name || "").trim();
        const type = String(c?.type || "").trim();
        const text = String(c?.text || "");
        const parser = pickParser(type);

        if (!parser) {
  const tt = String(type || "").trim().toLowerCase();
  let missing = tt;

  if (tt === "multi_regime") missing = "parseMultiRegime";
  if (tt === "multi_renda") missing = "parseMultiRenda";

  return {
    name,
    type,
    text,
    parsed: null,
    matched: [],
    notes: `parser_missing:${missing}`
  };
}

        const parsedRaw = parser(text);
        const parsed = parsedRaw == null ? null : parsedRaw;
        const matched = [];
        if (type === "composicao" && parsed) matched.push(String(parsed));
        if (type === "restricao" && parsed?.hasRestricao === true) matched.push("restricao_indicador");
        if (type === "estado_civil" && parsed) matched.push(String(parsed));
        if (type === "regime" && parsed) matched.push(String(parsed));
        if (type === "renda" && parsed != null) matched.push("money_br");

        return {
          name,
          type,
          text,
          parsed: parsed && typeof parsed === "object" ? parsed : parsed == null ? null : { value: parsed },
          matched,
          notes: "ok"
        };
      });

      return adminJson(200, {
        ok: true,
        results,
        build: ENOVA_BUILD,
        ts: new Date().toISOString()
      });
    }

    if (request.method === "POST" && pathname === "/__admin__/replay-webhook") {
      if (!isAdminAuthorized()) {
        return adminJson(401, {
          ok: false,
          error: "unauthorized",
          build: ENOVA_BUILD,
          ts: new Date().toISOString()
        });
      }

      let payload;
      try {
        payload = await request.json();
      } catch {
        return adminJson(400, {
          ok: false,
          error: "invalid_json",
          build: ENOVA_BUILD,
          ts: new Date().toISOString()
        });
      }

      const event = payload?.event;
      const dryRun = payload?.dry_run !== false;
      if (!event || typeof event !== "object") {
        return adminJson(400, {
          ok: false,
          error: "invalid_payload",
          details: "event é obrigatório",
          build: ENOVA_BUILD,
          ts: new Date().toISOString()
        });
      }

      const wa_id = extractWaIdFromWebhookEvent(event);
      const stageBefore = wa_id ? ((await getState(env, wa_id))?.fase_conversa || "inicio") : null;
      const previousCtx = env.__enovaSimulationCtx;
      env.__enovaSimulationCtx = {
        active: true,
        dryRun,
        stateByWaId: {},
        messageLog: [],
        writeLog: [],
        writesByWaId: {},
        suppressExternalSend: true, // ✅ replay sempre safe: NUNCA envia Whats real
        wouldSend: false,
        sendPreview: null
      };

      await telemetry(env, {
        wa_id,
        event: "admin_replay_webhook",
        stage: stageBefore || "inicio",
        severity: "info",
        message: "Admin replay-webhook acionado",
        details: { dryRun }
      });

      const replayReq = new Request("https://enova.local/webhook/meta", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(event)
      });

      let replayResp;
      try {
        replayResp = await handleMetaWebhook(replayReq, env, ctx);
      } catch (err) {
        env.__enovaSimulationCtx = previousCtx;
        return adminJson(500, {
          ok: false,
          error: "replay_failed",
          details: err?.message || String(err),
          build: ENOVA_BUILD,
          ts: new Date().toISOString()
        });
      }

      const finalState = wa_id ? env.__enovaSimulationCtx?.stateByWaId?.[wa_id] : null;
      const stageAfter = finalState?.fase_conversa || stageBefore;
      const writes = wa_id ? (env.__enovaSimulationCtx?.writesByWaId?.[wa_id] || null) : null;
      const lastReply = env.__enovaSimulationCtx?.messageLog?.[env.__enovaSimulationCtx.messageLog.length - 1]?.messages || null;
      const wouldSend = false; // ✅ replay nunca envia
      const sendPayloadPreview = env.__enovaSimulationCtx?.sendPreview || null;
      env.__enovaSimulationCtx = previousCtx;

      return adminJson(200, {
        ok: replayResp?.ok !== false,
        wa_id,
        stage_before: stageBefore,
        stage_after: stageAfter,
        writes,
        reply_text: Array.isArray(lastReply) ? lastReply.join("\n") : null,
        would_send: wouldSend,
        send_payload_preview: sendPayloadPreview,
        dry_run: dryRun,
        build: ENOVA_BUILD,
        ts: new Date().toISOString()
      });
    }

    // ---------------------------------------------
    // 🔄 GET /webhook/meta — verificação do webhook
    // ---------------------------------------------
    if (request.method === "GET" && pathname === "/webhook/meta") {
      const hubMode = url.searchParams.get("hub.mode");
      const hubToken = url.searchParams.get("hub.verify_token");
      const hubChallenge = url.searchParams.get("hub.challenge");

      // Opcional: confira env.META_VERIFY_TOKEN
      const validToken = env.META_VERIFY_TOKEN;

      const ok =
        hubMode === "subscribe" &&
        hubToken &&
        validToken &&
        hubToken === validToken;

      await telemetry(env, {
        wa_id: null,
        event: "webhook_verify",
        stage: "meta_handshake",
        severity: ok ? "info" : "warning",
        message: ok
          ? "Verificação de webhook META aceita"
          : "Verificação de webhook META recusada",
        details: {
          hubMode,
          hubTokenProvided: Boolean(hubToken),
          hubChallengePresent: Boolean(hubChallenge)
        }
      });

      if (!ok) {
        return new Response("Forbidden", { status: 403 });
      }

      return new Response(hubChallenge || "", { status: 200 });
    }

    // ---------------------------------------------
    // 📩 POST META (produção) + POST raiz (PowerShell)
    // ---------------------------------------------
  if (
  request.method === "POST" &&
  (pathname === "/webhook/meta" || pathname === "/")
) {
  return handleMetaWebhook(request, env, ctx);
}

    // ---------------------------------------------
    // Qualquer outra rota
    // ---------------------------------------------
    return new Response("OK", { status: 200 });
  },

  async scheduled(event, env, ctx) {
    console.log("CRON: production 0 12 * * * - iniciando follow-up base fria");
    await runColdFollowupBatch(env, ctx);
  }
};

async function runColdFollowupBatch(env, ctx) {
  console.log("CRON: runColdFollowupBatch() stub executado sem impacto no fetch");
}

// =============================================================
// 🧱 A4.1 — Handler principal do webhook META (POST)
// =============================================================
async function handleMetaWebhook(request, env, ctx) {

  console.log("DEBUG-1: ENTROU NO handleMetaWebhook");

  function isDebugOn(v) {
    const s = String(v || "").trim().toLowerCase();
    return s === "1" || s === "true" || s === "on" || s === "yes";
  }

  const debugOn = isDebugOn(env.DEBUG_META_WEBHOOK);
  const cfRay = request.headers.get("cf-ray") || null;

  function metaWebhookResponse(status, body) {
    const headers = {
      "X-Enova-Build": ENOVA_BUILD,
      "X-Enova-Debug": debugOn ? "1" : "0"
    };

    if (!debugOn) {
      return new Response("EVENT_RECEIVED", { status, headers });
    }

    return new Response(
      JSON.stringify({
        ok: status >= 200 && status < 300,
        status,
        build: ENOVA_BUILD,
        debugOn,
        cfRay,
        ...(body || {})
      }),
      {
        status,
        headers: {
          ...headers,
          "Content-Type": "application/json"
        }
      }
    );
  }

  let rawBody = null;
  let body = null;

  // 1) Lê o body cru (para telemetria em caso de erro)
try {
  rawBody = await request.text();
  console.log("DEBUG-2: LEU rawBody");

// ============================================================
// 0.5) CAPTURA O RAWBODY PARA DEBUG (PS e META)
// ============================================================
try {
  await telemetry(env, {
    wa_id: null,
    event: "payload_ps_raw",
    stage: "meta_raw",
    severity: "debug",
    message: "PAYLOAD RECEBIDO (PS ou META) — PREVIEW",
    details: {
      rawBodyPreview:
        rawBody && rawBody.length > 500
          ? rawBody.slice(0, 500) + "...(truncado)"
          : rawBody || null
    }
  });

} catch (err) {
  console.error("TELEMETRIA-RAW-ERROR:", err);
}

// ============================================================
// DEBUG — CAPTURA O PAYLOAD COMPLETO (PS ou META real)
// ============================================================
try {
  await telemetry(env, {
    wa_id: null,
    event: "payload_ps_raw_full",
    stage: "meta_raw",
    severity: "debug",
    message: "PAYLOAD COMPLETO (PS ou META)",
    details: {
      rawBodyPreview:
        rawBody && rawBody.length > 2000
          ? rawBody.slice(0, 2000) + "...(truncado)"
          : rawBody || null
    }
  });
} catch (err) {
  console.error("TELEMETRIA-RAW-FULL-ERROR:", err);
}

} catch (err) {
  await telemetry(env, {
    wa_id: null,
    event: "webhook_body_read_error",
    stage: "meta_raw",
    severity: "error",
    message: "Falha ao ler body do webhook META",
    details: {
      name: err?.name || "Error",
      message: err?.message || String(err),
      stack: err?.stack || null
    }
  });

  // Meta só precisa de 200 para não ficar reenviando por erro de infra
  return metaWebhookResponse(200, {
    reason: "webhook_body_read_error"
  });
}

  // 2) Tenta fazer parse do JSON
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
    console.log("DEBUG-3: PARSEOU JSON");
  } catch (err) {
    await telemetry(env, {
      wa_id: null,
      event: "webhook_parse_error",
      stage: "meta_raw",
      severity: "error",
      message: "JSON inválido recebido da META",
      details: {
        error: err?.message || String(err),
        rawBodyPreview:
          rawBody && rawBody.length > 500
            ? rawBody.slice(0, 500) + "...(truncado)"
            : rawBody || null
      }
    });

    return metaWebhookResponse(200, {
      reason: "webhook_parse_error"
    });
  }

  // 3) Loga recebimento bruto
  console.log("DEBUG-4: ANTES DA TELEMETRIA webhook_received");

  await telemetry(env, {
    wa_id: null,
    event: "webhook_received",
    stage: "meta_raw",
    severity: "info",
    message: "Webhook META recebido com sucesso",
    details: {
      hasEntry: Array.isArray(body.entry),
      entryCount: Array.isArray(body.entry) ? body.entry.length : 0
    }
  });

  // 4) Valida estrutura básica META (entry -> changes -> value)
  const entry = body?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  if (!entry || !change || !value) {
    await telemetry(env, {
      wa_id: null,
      event: "webhook_invalid_structure",
      stage: "meta_structure",
      severity: "warning",
      message: "Estrutura do webhook META diferente do esperado",
      details: {
        hasEntry: Boolean(entry),
        hasChange: Boolean(change),
        hasValue: Boolean(value),
        bodyPreview: JSON.stringify(body).slice(0, 500)
      }
    });

    return metaWebhookResponse(200, {
      reason: "webhook_invalid_structure"
    });
  }

  const metadata = value.metadata || {};
  const messages = value.messages || [];
  const statuses = value.statuses || [];
  const contacts = value.contacts || [];

  // 5) Telemetria de “quadro geral” do evento
  await telemetry(env, {
    wa_id: null,
    event: "webhook_payload_overview",
    stage: "meta_structure",
    severity: "info",
    message: "Resumo da estrutura do webhook META",
    details: {
      phone_number_id: metadata.phone_number_id || null,
      messagesCount: messages.length,
      statusesCount: statuses.length,
      contactsCount: contacts.length
    }
  });

// ============================================================
// 6) STATUS NÃO PODE MAIS BLOQUEAR O FLUXO
// ============================================================
// IMPORTANTE: A META pode enviar "statuses" (delivered/read) ANTES da mensagem real.
//             Se retornarmos aqui, matamos o funil e nada mais processa.
if (!messages.length && statuses.length) {

  await telemetry(env, {
    wa_id: statuses?.[0]?.recipient_id || null,
    event: "meta_status_event",
    stage: "meta_status",
    severity: "info",
    message: "STATUS recebido (delivered/read). Não bloqueando fluxo.",
    details: {
      statusesPreview: statuses.slice(0, 3),
      note: "Aguardando possível mensagem real na mesma entrega ou próxima."
    }
  });

  // ❗ ANTES: return EVENT_RECEIVED → ERRADO (bloqueava tudo)
  // ❗ AGORA: NÃO retorna — deixa o fluxo seguir para o bloco seguinte.
  //          Se realmente não houver mensagem, o BLOCO 7 decide.
}

  // 7) Caso não tenha mensagem nem status (META mudou algo?)
  if (!messages.length && !statuses.length) {
    await telemetry(env, {
      wa_id: null,
      event: "webhook_no_messages",
      stage: "meta_structure",
      severity: "warning",
      message:
        "Webhook META sem messages e sem statuses — possível mudança de estrutura",
      details: {
        valuePreview: JSON.stringify(value).slice(0, 500)
      }
    });

    return metaWebhookResponse(200, {
      reason: "webhook_no_messages"
    });
}

// 8.0) GUARDRAIL ABSOLUTO — impedir crash quando não há messages
if (!messages || messages.length === 0) {
  await telemetry(env, {
    wa_id: statuses?.[0]?.recipient_id || null,
    event: "meta_no_message_after_status_patch",
    stage: "meta_message_guard",
    severity: "warning",
    message:
      "Evento da META sem messages processáveis após análise de status. Guardrail ativado.",
    details: {
      statusesPreview: statuses?.slice(0, 3) || [],
      hasMessagesArray: Array.isArray(value?.messages) || false
    }
  });

  return metaWebhookResponse(200, {
    reason: "meta_no_message_after_status_patch"
  });
}

// 8) Pega a primeira mensagem (padrão da Meta)
const msg = messages[0];
const type = msg.type;
const messageId = msg.id;
const waId =
  msg.from ||
  (contacts[0] && (contacts[0].wa_id || contacts[0].waId)) ||
  null;

// =============================================================
// 📝 Log mínimo da Meta (PRODUÇÃO) — seguro e leve
// =============================================================
try {
  const metaType = msg?.type || null;
  const metaText = msg?.text?.body || null;
  const metaMessageId = messageId || null;
  const type = metaType; // garante type definido p/ filtros e extração

  // captura status event (read, delivered, etc.)
  const metaStatus =
    body?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]?.status || null;

  await telemetry(env, {
    wa_id: waId || null,
    event: "meta_minimal",
    stage: "meta_message",
    severity: "debug",
    message: "Log mínimo da Meta",
    details: {
      tag: "meta_minimal",
      meta_type: metaType,
      meta_text: metaText,
      meta_message_id: metaMessageId,
      meta_status: metaStatus
    }
  });

  await logger(env, {
    tag: "meta_minimal",
    wa_id: waId || null,
    meta_type: metaType,
    meta_text: metaText,
    meta_message_id: metaMessageId,
    meta_status: metaStatus
  });
} catch (err) {
  console.log("ERRO AO SALVAR LOG MINIMAL DA META:", err);
}

// ============================================================
// 🔒 HARD FILTER – Só filtra quando realmente existe msg
// ============================================================
if (msg && type !== "text" && type !== "interactive") {
  await telemetry(env, {
    wa_id: waId,
    event: "ignored_non_text_payload",
    stage: "meta_message_filter",
    severity: "info",
    message: `Ignorando payload não textual (type=${type})`,
    details: {
      messageId,
      type,
      rawMsgPreview: JSON.stringify(msg).slice(0, 200)
    }
  });

  return metaWebhookResponse(200, {
  reason: "ignored_non_text_payload",
  type
});
}

// Chave para futura deduplicação real
const dedupKey = (messageId ? `mid:${messageId}` : null);

// ============================================================
// 💠 ANTI-DUPLICAÇÃO META (janela de 10s, só em memória)
// ✅ Só dedupa se tiver messageId (wamid)
// ============================================================
if (dedupKey) {
  try {
    const now = Date.now();
    const DEDUP_WINDOW_MS = 10000; // 10 segundos

    const CACHE_KEY = "__enova_meta_dedup_cache";
    const cache =
      (globalThis[CACHE_KEY] = globalThis[CACHE_KEY] || new Map());

    const lastTs = cache.get(dedupKey);

    if (lastTs && now - lastTs < DEDUP_WINDOW_MS) {
      await telemetry(env, {
        wa_id: waId,
        event: "meta_duplicate_webhook_suppressed",
        stage: "meta_message",
        severity: "warning",
        message: "Webhook META duplicado suprimido (janela 10s)",
        details: {
          dedupKey,
          lastTs,
          now,
          deltaMs: now - lastTs
        }
      });

      return metaWebhookResponse(200, {
        reason: "meta_duplicate_webhook_suppressed"
      });
    }

    // registra o evento atual no cache
    cache.set(dedupKey, now);
  } catch (err) {
    console.error("DEDUP-META-ERROR:", err);
    // se der qualquer erro aqui, NÃO quebramos o fluxo
  }
}
// ============================================================

await telemetry(env, {
  wa_id: waId,
  event: "webhook_message_received",
  stage: "meta_message",
  severity: "info",
  message: `Mensagem recebida da META (tipo=${type || "desconhecido"})`,
  details: {
    dedupKey,
    messageId,
    type,
    phone_number_id: metadata.phone_number_id || null
  }
});

// 9) Extração do texto do cliente (para o funil)
let userText = null;

  if (type === "text") {
    userText = msg.text?.body || "";
  } else if (type === "interactive") {
    const interactive = msg.interactive || {};

    if (interactive.type === "button") {
      userText =
        interactive.button_reply?.title ||
        interactive.button_reply?.id ||
        "";
    } else if (interactive.type === "list_reply") {
      userText =
        interactive.list_reply?.title ||
        interactive.list_reply?.id ||
        "";
    }
  } else if (
    type === "image" ||
    type === "audio" ||
    type === "video" ||
    type === "document"
  ) {
    // TELEMETRIA COMPLETA DE MÍDIA
    await funnelTelemetry(env, {
      wa_id: waId,
      event: "media_received",
      stage: "meta_message",
      severity: "info",
      message: `Mídia recebida (tipo=${type})`,
      details: {
        type,
        mime_type: msg[type]?.mime_type || null,
        media_id: msg[type]?.id || null,
        sha256: msg[type]?.sha256 || null,
        caption: msg.caption || null,
        from: waId
      }
    });

    return await handleMediaEnvelope(env, waId, msg, type);
  }

  if (!userText) {
    await telemetry(env, {
      wa_id: waId,
      event: "webhook_no_text",
      stage: "meta_message",
      severity: "info",
      message:
        "Mensagem recebida sem texto utilizável para o funil (provavelmente reação ou tipo não tratado)",
      details: {
        type,
        msgPreview: JSON.stringify(msg).slice(0, 400)
      }
    });

    return metaWebhookResponse(200, {
      reason: "webhook_no_text",
      type
    });
  }

  // 10) Entrada no funil (já com telemetria da A3/A6)
  try {

    // ============================================================
    // 1) Carrega estado REAL antes de chamar funil
    //    usando getState / upsertState oficiais (A2)
    // ============================================================
    let st = await getState(env, waId);

    if (!st) {
      await upsertState(env, waId, {
        fase_conversa: "inicio",
        funil_status: null,
        nome: null
      });

      st = await getState(env, waId);
    }

    // ============================================================
    // TELEMETRIA DE ENTRADA — AGORA COM STAGE REAL
    // ============================================================
    await telemetry(env, {
      wa_id: waId,
      event: "incoming_message",
      stage: st?.fase_conversa || "inicio",
      severity: "info",
      message: "Mensagem de texto encaminhada para o funil",
      details: {
        textPreview:
          userText.length > 120
            ? userText.slice(0, 120) + "...(truncado)"
            : userText,
        dedupKey
      }
    });

    console.log(
      "FUNIL-CALL: antes do runFunnel",
      JSON.stringify({
        wa_id: st?.wa_id || waId,
        fase_conversa: st?.fase_conversa || "inicio"
      })
    );

// ============================================================
// 🧠 OFFTRACK GUARD (IA apertador de botão) — NÃO MUDA FASE
// ============================================================
try {
  const guard = await offtrackGuard(env, {
    wa_id: waId,
    stage: st?.fase_conversa || "inicio",
    text: userText
  });

  if (guard?.offtrack === true) {
    await telemetry(env, {
      wa_id: waId,
      event: "offtrack_signal",
      stage: st?.fase_conversa || "inicio",
      severity: "info",
      message: "Cliente perguntou fora do trilho — guard respondeu padrão e manteve fase",
      details: {
        label: guard.label || null,
        confidence: guard.confidence ?? null,
        textPreview: userText.length > 120 ? userText.slice(0, 120) + "...(truncado)" : userText
      }
    });

    // Resposta padrão (sem inventar nada / sem pular etapa)
    const msg =
      "Certo. Vou analisar seu perfil primeiro e, no final, tiro todas suas dúvidas, combinado?\n" +
      "Pra eu seguir aqui, me responde só a pergunta anterior direitinho. 🙏";

    await sendMessage(env, waId, msg);
    return metaWebhookResponse(200, { reason: "offtrack_guard", type });
  }
} catch (e) {
  // Guard nunca pode derrubar o funil
  console.error("OFFTRACK-GUARD-ERROR:", e);
}

    // ============================================================
    // 2) CHAMADA CORRETA DO FUNIL
    // ============================================================
    await runFunnel(env, st, userText);

    console.log("FUNIL-CALL: depois do runFunnel");

    return metaWebhookResponse(200, {
      reason: "runFunnel_ok",
      type
    });
  } catch (err) {
    const safeDetails = {
      dedupKey,
      wa_id: waId,
      stageDetectado: err?.stage || "inicio",
      name: err?.name || "Error",
      message: err?.message || String(err),
      stack: err?.stack || null
    };

    console.error("RUNFUNNEL-ERROR:", JSON.stringify(safeDetails));

    await telemetry(env, {
      wa_id: waId,
      event: "runFunnel_error",
      stage: safeDetails.stageDetectado,
      severity: "critical",
      message: "Erro ao processar mensagem no funil",
      details: safeDetails
    });

    // Mesmo com erro, devolve 200 para a META não reenviar
    return metaWebhookResponse(200, {
      reason: "runFunnel_error",
      type
    });
  }
} // <-- FECHA o handleMetaWebhook CERTINHO

// =============================================================
// 🤖❤️ MODO HUMANO (VERSÃO 1.0 — Tom Vasques)
// =============================================================
function modoHumanoRender(st, arr) {
  try {
    // Se não estiver ativado, retorna mensagens normais
    if (!st.modo_humano) return arr;

    // Segurança: nunca aplicar modo humano em mensagens vazias
    if (!arr || arr.length === 0) return arr;

    // 🔥 Freio: modo humano só pode aplicar em UMA rodada
    st.modo_humano = false;

    // Templates do Tom Vasques (equilibrado)
    const templates = [
      (msg) => `Show, ${st.primeiro_nome || ""}! ${ajustaTexto(msg)}`,
      (msg) => `Perfeito, ${st.primeiro_nome || ""}. ${ajustaTexto(msg)}`,
      (msg) => `Tranquilo, ${st.primeiro_nome || ""}. ${ajustaTexto(msg)}`,
      (msg) => `Vamos avançar certinho aqui, ${st.primeiro_nome || ""}. ${ajustaTexto(msg)}`
    ];

    // Seleciona template (aleatório leve, mas controlado)
    const pick = templates[Math.floor(Math.random() * templates.length)];

    // Aplica template em cada mensagem sem quebrar array
    const rendered = arr.map((msg) => pick(msg));

    return rendered;
  } catch (err) {
    console.error("Erro no modoHumanoRender:", err);
    return arr; // fallback seguro
  }
}

// =============================================================
// 🔧 Normalização de texto para modo humano
// =============================================================
function ajustaTexto(msg) {
  if (!msg) return msg;

  // Remove emojis redundantes e repetições exageradas
  let t = msg.replace(/😂|🤣|kkk|KKK/g, "").trim();

  // Evita frases muito curtas
  if (t.length < 3) t = `sobre aquilo que te comentei… ${t}`;

  // Evita letras maiúsculas excessivas
  if (t === t.toUpperCase()) t = t.charAt(0) + t.slice(1).toLowerCase();

  return t;
}

// =============================================================
// 🧱 BLOCO 7 — RECONHECIMENTO DE IMAGEM / ÁUDIO / VÍDEO (envio_docs)
// (versão legacy simplificada – sem mexer no resto do funil)
// =============================================================
async function handleMediaDocuments(env, st, msg) {
  try {
    // 1️⃣ Tipo da mensagem
    const type = msg?.type || null;

    // Se não for mídia, não fazemos nada aqui
    if (!["image", "audio", "video", "document"].includes(type)) {
      return null;
    }

    // 2️⃣ Telemetria básica da mídia recebida
    await telemetry(env, {
      wa_id: st?.wa_id || null,
      event: "media_received_legacy",
      stage: st?.fase_conversa || "envio_docs",
      severity: "info",
      message: `Mídia recebida no handleMediaDocuments (tipo=${type || "desconhecido"})`,
      details: {
        type,
        mime_type: msg[type]?.mime_type || null,
        media_id: msg[type]?.id || null,
        sha256: msg[type]?.sha256 || null,
        caption: msg?.caption || null,
        rawPreview: JSON.stringify(msg).slice(0, 400)
      }
    });

    // 3️⃣ Resposta padrão – deixa a análise seguir normal
    return {
      ok: true,
      message: [
        "Recebi seus documentos/mídia por aqui 👌",
        "Vou considerar isso na análise e, se eu precisar de algo a mais, te aviso por aqui."
      ],
      // Mantém o cliente na mesma fase ou em envio_docs
      nextStage: st?.fase_conversa || "envio_docs"
    };

  } catch (err) {
    // 4️⃣ Telemetria de erro – mas sem matar o fluxo
    await telemetry(env, {
      wa_id: st?.wa_id || null,
      event: "media_handler_error",
      stage: st?.fase_conversa || "envio_docs",
      severity: "error",
      message: "Erro no handleMediaDocuments (bloco legacy)",
      details: {
        error: err?.stack || String(err)
      }
    });

    // Resposta failsafe para o cliente
    return {
      ok: false,
      message: [
        "Tentei ler esse arquivo mas deu uma travadinha aqui 😅",
        "Se puder, me reenvia o documento ou manda uma foto mais nítida?"
      ],
      keepStage: st?.fase_conversa || "envio_docs"
    };
  }
}

// ======================================================================
// 🧱 BLOCO 8 — CLASSIFICADOR IA (DOCUMENTOS)
// ======================================================================

/**
 * classifyDocumentAI(fileType, textContent)
 *
 * Recebe:
 *    fileType → image | pdf
 *    textContent → texto do OCR (se houver)
 *
 * Retorna:
 *    { categoria: "...", participante: "p1" | "p2" | "indefinido" }
 *
 * Obs:
 *  Isso aqui é UM MODELO. Você vai alterar mais tarde.
 *  Mas já deixa plugado para o Worker funcionar.
 */
async function classifyDocumentAI(env, fileType, textContent) {

  const lower = (textContent || "").toLowerCase();

  // --------------------------------------------
  // IDENTIDADE / CPF / CNH
  // --------------------------------------------
  if (
    lower.includes("cpf") ||
    lower.includes("carteira nacional de habilitação") ||
    lower.includes("número do registro") ||
    lower.includes("rg") ||
    lower.includes("registro geral")
  ) {
    return { categoria: "documento_identidade", participante: "indefinido" };
  }

  // --------------------------------------------
  // CERTIDÃO DE CASAMENTO
  // --------------------------------------------
  if (lower.includes("certidão de casamento") || lower.includes("matrimônio")) {
    return { categoria: "certidao_casamento", participante: "indefinido" };
  }

  // --------------------------------------------
  // HOLERITE / CONTRACHEQUE
  // --------------------------------------------
  if (
    lower.includes("holerite") ||
    lower.includes("contracheque") ||
    lower.includes("provento") ||
    lower.includes("vencimentos")
  ) {
    return { categoria: "holerite", participante: "indefinido" };
  }

  // --------------------------------------------
  // EXTRATOS BANCÁRIOS
  // --------------------------------------------
  if (
    lower.includes("saldo") ||
    lower.includes("pagamento") ||
    lower.includes("depósito") ||
    lower.includes("movimentação") ||
    lower.includes("extrato") ||
    lower.includes("agência")
  ) {
    return { categoria: "extrato_bancario", participante: "indefinido" };
  }

  // --------------------------------------------
  // APOSENTADORIA
  // --------------------------------------------
  if (
    lower.includes("inss") ||
    lower.includes("benefício") ||
    lower.includes("aposent")
  ) {
    return { categoria: "comprovante_aposentadoria", participante: "indefinido" };
  }

  // --------------------------------------------
  // PENSÃO
  // --------------------------------------------
  if (
    lower.includes("pensão") ||
    lower.includes("pagadora") ||
    lower.includes("pensionista")
  ) {
    return { categoria: "comprovante_pensao", participante: "indefinido" };
  }

  // --------------------------------------------
  // COMPROVANTE DE RESIDÊNCIA
  // --------------------------------------------
  if (
    lower.includes("endereço") ||
    lower.includes("numero da instalação") ||
    lower.includes("consumo") ||
    lower.includes("fatura") ||
    lower.includes("energia") ||
    lower.includes("água") ||
    lower.includes("saneamento")
  ) {
    return { categoria: "comprovante_residencia", participante: "indefinido" };
  }

  // --------------------------------------------
  // CARTEIRA DE TRABALHO (CTPS)
  // --------------------------------------------
  if (
    lower.includes("carteira de trabalho") ||
    lower.includes("ctps") ||
    lower.includes("página")
  ) {
    return { categoria: "ctps", participante: "indefinido" };
  }

  // --------------------------------------------
  // CASO NÃO RECONHEÇA
  // --------------------------------------------
  return { categoria: "documento_indefinido", participante: "indefinido" };
}

// ======================================================================
// 🧱 BLOCO 9 — SEPARADOR DE PARTICIPANTES (P1 / P2)
// ======================================================================

/**
 * assignDocumentToParticipant(st, categoria, textContent)
 *
 * Retorna:
 *    "p1" | "p2" | "indefinido"
 *
 * Baseado em:
 *    - estado civil / composição
 *    - casamento / união estável
 *    - nomes encontrados no OCR
 *    - presença de múltiplos rostos
 *    - regras internas da Caixa
 *
 * OBS: Este bloco é uma primeira versão. Depois refinaremos com IA Vision.
 */
async function assignDocumentToParticipant(env, st, categoria, textContent) {

  const txt = (textContent || "").toLowerCase();

  // ----------------------------------------------------------
  // CASO: PERFIL É SOLO
  // Sempre P1, sem discussão
  // ----------------------------------------------------------
  if (!st.somar_renda && !st.financiamento_conjunto) {
    return "p1";
  }

  // ----------------------------------------------------------
  // CASO: EXISTEM DOIS PARTICIPANTES
  // Agora tentamos descobrir quem é quem.
  // ----------------------------------------------------------

  // Procuramos nome do titular (p1)
  if (st.nome && txt.includes(st.nome.toLowerCase())) {
    return "p1";
  }

  // Procuramos nome do parceiro/familiar (p2)
  if (st.nome_parceiro && txt.includes(st.nome_parceiro.toLowerCase())) {
    return "p2";
  }

  // ----------------------------------------------------------
  // Heurística por tipo de documento
  // ----------------------------------------------------------

  // Certidão de casamento → contém dados dos dois
  if (categoria === "certidao_casamento") {
    return "indefinido"; // ambos
  }

  // Holerite → fortíssimo indicativo de participante
  if (categoria === "holerite") {
    // se P1 é CLT, tende a ser dele
    if (st.regime_trabalho === "clt") return "p1";
    // se P2 é CLT, tende a ser dele
    if (st.regime_trabalho_parceiro === "clt") return "p2";
  }

  // Extrato bancário → similar
  if (categoria === "extrato_bancario") {
    if (st.regime_trabalho === "autonomo") return "p1";
    if (st.regime_trabalho_parceiro === "autonomo") return "p2";
  }

  // CTPS → geralmente titular primeiro
  if (categoria === "ctps") {
    if (st.regime_trabalho === "clt") return "p1";
    if (st.regime_trabalho_parceiro === "clt") return "p2";
  }

  // Comprovante de residência — pode ser de qualquer um
  if (categoria === "comprovante_residencia") {
    return "indefinido";
  }

  // Identidade → tenta achar pelas fotos (na próxima versão com IA Vision)
  // Por enquanto: indefinido até aplicar comparação facial
  if (categoria === "documento_identidade") {
    return "indefinido";
  }

  // ----------------------------------------------------------
  // CASO GERAL: ainda não sabemos
  // ----------------------------------------------------------
  return "indefinido";
}

// ======================================================================
// 🧱 BLOCO 10 — ANÁLISE DE QUALIDADE E LEGIBILIDADE DE DOCUMENTOS
// ======================================================================

/**
 * analyzeDocumentQuality(fileType, ocrText, metadata)
 *
 * Retorna:
 *   {
 *     legivel: true|false,
 *     motivos: [ "borrado", "escuro", "cortado", ... ],
 *     qualidade: "boa" | "aceitavel" | "ruim"
 *   }
 *
 * IMPORTANTE:
 *  Isso é uma versão simplificada SEM IA de visão ainda.
 *  Depois iremos plugar IA Vision para análise real.
 */
async function analyzeDocumentQuality(env, fileType, ocrText, metadata = {}) {

  const txt = (ocrText || "").toLowerCase();
  const motivos = [];

  // --------------------------------------------------------
  // HEURÍSTICAS DE LEGIBILIDADE BASEADAS NO OCR
  // --------------------------------------------------------

  // 1 — OCR totalmente vazio → documento ilegível / muito borrado
  if (!txt || txt.trim().length < 15) {
    motivos.push("conteúdo muito reduzido ou ilegível");
  }

  // 2 — Texto com muitos caracteres quebrados → indicativo de borrado
  const caracteresRuins = (txt.match(/[^a-z0-9\s\.,\/\-]/gi) || []).length;
  if (caracteresRuins > 50) {
    motivos.push("texto muito distorcido (possível borrado)");
  }

  // 3 — Palavras de falha comum em OCR (ruídos)
  if (txt.includes("l|l|l") || txt.includes("| | |") || txt.includes("|||||")) {
    motivos.push("OCR muito ruidoso");
  }

  // --------------------------------------------------------
  // METADADOS DA IMAGEM
  // --------------------------------------------------------
  if (metadata.blur === true) motivos.push("imagem borrada");
  if (metadata.dark === true) motivos.push("imagem muito escura");
  if (metadata.cropped === true) motivos.push("imagem cortada");
  if (metadata.glare === true) motivos.push("reflexo forte na foto");
  if (metadata.rotation === true) motivos.push("documento torto / invertido");

  // --------------------------------------------------------
  // AVALIAÇÃO FINAL
  // --------------------------------------------------------
  let qualidade = "boa";
  if (motivos.length >= 1) qualidade = "aceitavel";
  if (motivos.length >= 2) qualidade = "ruim";

  const legivel = qualidade !== "ruim";

  return {
    legivel,
    motivos,
    qualidade
  };
}

// ======================================================================
// 🧱 BLOCO 11 — CHECKLIST DE DOCUMENTOS EXIGIDOS (CEF REAL)
// ======================================================================

/**
 * getRequiredDocuments(st)
 *
 * Retorna a lista de documentos obrigatórios e opcionais,
 * totalmente baseada no perfil real do cliente (P1 + P2).
 *
 * Output:
 * {
 *   p1: { obrigatorios: [...], opcionais: [...] },
 *   p2: { obrigatorios: [...], opcionais: [...] },
 *   gerais: [...],
 *   explicacao: "texto amigável usado pelo bot"
 * }
 */
function getRequiredDocuments(st) {

  // ======================================================
  // P1 — TITULAR SEMPRE EXISTE
  // ======================================================
  const p1 = {
    obrigatorios: ["identidade_cpf", "ctps_completa"],
    opcionais: []
  };

  // TIPOS DE TRABALHO DO P1
  switch (st.regime_trabalho) {
    case "clt":
      p1.obrigatorios.push("holerites");
      break;

    case "autonomo":
      if (st.ir_declarado) {
        p1.obrigatorios.push("declaracao_ir");
      } else {
        p1.obrigatorios.push("extratos_bancarios");
      }
      break;

    case "servidor":
      p1.obrigatorios.push("contracheque_servidor");
      break;

    case "aposentado":
      p1.obrigatorios.push("comprovante_aposentadoria");
      break;

    case "pensionista":
      p1.obrigatorios.push("comprovante_pensao");
      break;
  }

  // ======================================================
  // P2 — SÓ EXISTE SE SOMAR RENDA / CASAL
  // ======================================================
  let p2 = null;

  if (st.financiamento_conjunto || st.somar_renda) {
    p2 = {
      obrigatorios: ["identidade_cpf", "ctps_completa"],
      opcionais: []
    };

    switch (st.regime_trabalho_parceiro) {
      case "clt":
        p2.obrigatorios.push("holerites");
        break;

      case "autonomo":
        if (st.ir_declarado_parceiro) {
          p2.obrigatorios.push("declaracao_ir");
        } else {
          p2.obrigatorios.push("extratos_bancarios");
        }
        break;

      case "servidor":
        p2.obrigatorios.push("contracheque_servidor");
        break;

      case "aposentado":
        p2.obrigatorios.push("comprovante_aposentadoria");
        break;

      case "pensionista":
        p2.obrigatorios.push("comprovante_pensao");
        break;
    }
  }

  // ======================================================
  // REGRAS GERAIS (INDEPENDENTE DE P1/P2)
  // ======================================================
  const gerais = ["comprovante_residencia"];

  // Casamento civil exige certidão
  if (st.estado_civil === "casado") {
    gerais.push("certidao_casamento");
  }

  // União estável apenas se declarada no processo
  if (st.estado_civil === "uniao_estavel") {
    gerais.push("decl_ou_cert_uniao_estavel"); // pode evoluir depois
  }

  // ======================================================
  // TEXTO DE EXPLICAÇÃO AMIGÁVEL
  // ======================================================
  const explicacao = `
Para a Caixa montar sua análise, preciso dos documentos abaixo 👇

• Documento de identidade (RG/CNH)
• CPF (se não estiver na CNH)
• Carteira de trabalho completa (digital serve)
• Comprovante de renda
• Comprovante de residência atualizado
${st.estado_civil === "casado" ? "• Certidão de casamento" : ""}
${st.financiamento_conjunto || st.somar_renda ? "• Documentos do segundo participante" : ""}
  `.trim();

  return { p1, p2, gerais, explicacao };
}

// ======================================================================
// 🧱 BLOCO 12 — BASE DO ANALISADOR DE DOCUMENTOS (OCR + ÁUDIO)
// ======================================================================

/**
 * extractTextFromImage(file, env)
 * placeholder de OCR — substituir depois pelo Cloudflare Vision
 */
async function extractTextFromImage(file, env) {
  return file.ocrText || "";
}

/**
 * transcribeAudio(file, env)
 * placeholder — substituir pelo Whisper depois
 */
async function transcribeAudio(file, env) {
  return file.transcript || "";
}

/**
 * classifyDocumentType(txt)
 * identifica tipo do documento baseado no texto
 */
function classifyDocumentType(txt) {
  txt = (txt || "").toLowerCase();

  if (/(carteira de trabalho|ctps|pis|pasep|assinatura contrato)/i.test(txt))
    return "ctps_completa";

  if (/(holerite|salario|adicional|comissao|contracheque)/i.test(txt))
    return "holerites";

  if (/(imposto de renda|ajuste anual|irp|modelo completo|declaracao ir)/i.test(txt))
    return "declaracao_ir";

  if (/(extrato|movimenta.c|extratos)/i.test(txt))
    return "extratos_bancarios";

  if (/(resid.ncia|comprovante de luz|copel|sanepar|.gua|internet)/i.test(txt))
    return "comprovante_residencia";

  if (/(casamento|certid.a[oã])/i.test(txt))
    return "certidao_casamento";

  if (/(pens.o|pensionista)/i.test(txt))
    return "comprovante_pensao";

  if (/(aposentadoria|aposentado)/i.test(txt))
    return "comprovante_aposentadoria";

  if (/(rg|registro geral|cpf|carteira nacional de habilita.c.o|cnh)/i.test(txt))
    return "identidade_cpf";

  return "desconhecido";
}

/**
 * decideParticipantForDocument(st, docType)
 * Decide se o documento é do P1 ou P2
 */
function decideParticipantForDocument(st, docType) {

  // Se é cliente solo → sempre P1
  if (!st.financiamento_conjunto && !st.somar_renda) {
    return "p1";
  }

  // Se é documento típico do parceiro
  if (st.nome_parceiro_normalizado && st.nome_parceiro_normalizado !== "") {
    return "p2";
  }

  // fallback
  return "p1";
}

/**
 * validateDocumentQuality(docType, text)
 * Valida se o documento está legível
 */
function validateDocumentQuality(docType, txt) {
  if (!txt || txt.length < 20) {
    return {
      valido: false,
      refazer: true,
      motivo: "Documento muito apagado ou ilegível"
    };
  }
  return { valido: true, refazer: false, motivo: null };
}

/**
 * saveDocumentForParticipant(env, st, pX, docType, url)
 * Salva documento no Supabase (tabela enova_docs)
 */
async function saveDocumentForParticipant(env, st, participant, docType, url) {

  await fetch(`${env.SUPABASE_URL}/rest/v1/enova_docs`, {
    method: "POST",
    headers: {
      "apikey": env.SUPABASE_KEY,
      "Authorization": `Bearer ${env.SUPABASE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      wa_id: st.wa_id,
      participante: participant,
      tipo: docType,
      url: url,
      created_at: new Date().toISOString()
    })
  });
}

/**
 * updateDocsStatus(env, st)
 * Atualiza pendências de documentos
 * (placeholder, implementamos depois)
 */
async function updateDocsStatus(env, st) {
  return true;
}


// ======================================================================
// 🔥 BLOCO 13 — PROCESSAMENTO COMPLETO DE DOCUMENTOS
// ======================================================================

async function processIncomingDocument(env, st, file) {
  try {

    // ===========================
    // 13.1 — OCR / ÁUDIO
    // ===========================
    let extracted = "";

    const contentType = file.contentType || "";

    if (contentType.includes("image/") || contentType.includes("pdf") || contentType.includes("video/")) {
      extracted = await extractTextFromImage(file, env);
    }

    if (contentType.includes("audio/")) {
      extracted = await transcribeAudio(file, env);
    }

    // Fallback: texto puro
    if (!extracted && file.text) {
      extracted = file.text.toLowerCase();
    }

    if (!extracted || extracted.trim() === "") {
      return {
        ok: false,
        reason: "ocr_vazio",
        message: [
          "A imagem ficou bem difícil de ler 😅",
          "Pode tentar tirar outra foto mais nítida pra mim?"
        ]
      };
    }

    // ===========================
    // 13.2 — Detectar tipo
    // ===========================
    const docType = classifyDocumentType(extracted);

    if (docType === "desconhecido") {
      return {
        ok: false,
        reason: "tipo_desconhecido",
        message: [
          "Não consegui identificar qual documento é esse 🤔",
          "Consegue me mandar outra foto ou me dizer qual documento é?"
        ]
      };
    }

    // ===========================
    // 13.3 — Dono (P1 ou P2)
    // ===========================
    const participant = decideParticipantForDocument(st, docType);

    // ===========================
    // 13.4 — Validar qualidade
    // ===========================
    const val = validateDocumentQuality(docType, extracted);

    if (!val.valido) {
      return {
        ok: false,
        reason: "ilegivel",
        message: [
          "Parece que esse documento ficou meio difícil de ler 😕",
          "Pode tentar tirar outra foto com mais luz?"
        ]
      };
    }

    // ===========================
    // 13.5 — Salvar
    // ===========================
    await saveDocumentForParticipant(env, st, participant, docType, file.url);

    // ===========================
    // 13.6 — Atualizar pendências
    // ===========================
    await updateDocsStatus(env, st);

    // ===========================
    // 13.7 — Resposta final
    // ===========================
    return {
      ok: true,
      reason: "doc_ok",
      docType,
      participant,
      message: [
        "Perfeito! 👏",
        `Já registrei seu **${docType.replace("_", " ")}** aqui.`,
        "Pode enviar o próximo 😉"
      ]
    };

  } catch (e) {
    console.error("ERRO NO BLOCO 13:", e);
    return {
      ok: false,
      reason: "erro_geral",
      message: [
        "Aconteceu algo inesperado 😅",
        "Pode tentar mandar o documento de novo?"
      ]
    };
  }
}

// ======================================================================
// 🧱 BLOCO 14 — CAPTURA & ENCAMINHAMENTO DE DOCUMENTOS (HÍBRIDO)
// ======================================================================

/**
 * handleIncomingMedia(env, st, media)
 *
 * RECEBE:
 *  - media: objeto vindo do WhatsApp (image, audio, pdf)
 *  - st: estado do cliente
 *
 * FLUXO:
 *  1. baixa o arquivo
 *  2. detecta tipo (foto, pdf, audio)
 *  3. envia para "processIncomingDocument" (OCR + classificador)
 *  4. salva em Supabase
 *  5. retorna mensagem humanizada
 */
async function handleIncomingMedia(env, st, media) {

  // ================================
  // 1 — BAIXAR ARQUIVO DO WHATSAPP
  // ================================
  const mediaUrl = `https://graph.facebook.com/v20.0/${media.id}`;
  const mediaResp = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${env.WHATS_TOKEN}` }
  });

  const arrayBuffer = await mediaResp.arrayBuffer();
  const contentType = mediaResp.headers.get("Content-Type") || "";

  const file = {
    buffer: arrayBuffer,
    url: mediaUrl,
    contentType
  };

  // ==================================================
  // 2 — PROCESSAR O DOCUMENTO (OCR + CLASSIFICAÇÃO)
  // ==================================================
  const resultado = await processIncomingDocumentV2(env, st, file);

  // ==================================================
  // 3 — RESPOSTAS HUMANIZADAS
  // ==================================================
  if (!resultado.ok) {
    return step(env, st, resultado.message, "envio_docs");
  }

  // Resposta positiva
  return step(
    env,
    st,
    [
      "Perfeito! 👏",
      `Recebi aqui seu **${resultado.docType.replace(/_/g, " ")}**.`,
      "Já registrei certinho no seu processo.",
      "Pode enviar o próximo 😉"
    ],
    "envio_docs"
  );
}

// ======================================================================
// 🧱 BLOCO 15 — ANALISADOR DOCUMENTAL AVANÇADO (V2 DEFINITIVO)
// ======================================================================
//
// processIncomingDocumentV2(env, st, file)
//
// RESPONSÁVEL POR:
//  - rodar OCR inteligente
//  - classificar documento com regras do MCMV/CEF
//  - decidir participante (p1/p2)
//  - validar completude (legível? inteiro?)
//  - reconhecer se é documento obrigatório
//  - marcar pendências no Supabase
//  - salvar documento com segurança
//
// ======================================================================

async function processIncomingDocumentV2(env, st, file) {
  try {

    // ======================================================
    // 1 — OCR (Imagem/PDF) ou Transcrição (Áudio)
    // ======================================================
    const extractedText = await extractContentSmart(env, file);

    if (!extractedText || extractedText.trim().length < 10) {
      return {
        ok: false,
        reason: "ocr_falho",
        message: [
          "A imagem ficou um pouquinho difícil de ler 😅",
          "Tenta tirar outra foto com mais luz, sem reflexo.",
        ]
      };
    }

    // ======================================================
    // 2 — Classificar tipo documental
    // ======================================================
    const docType = detectDocumentTypeAdvanced(extractedText);

    if (docType === "desconhecido") {
      return {
        ok: false,
        reason: "tipo_desconhecido",
        message: [
          "Não consegui identificar exatamente qual documento é 🤔",
          "Pode me mandar outra foto ou dizer qual documento é?"
        ]
      };
    }

    // ======================================================
    // 3 — Decidir participante (p1 ou p2)
    // ======================================================
    const participant = detectParticipant(st, extractedText);

    if (!participant) {
      return {
        ok: false,
        reason: "participante_indefinido",
        message: [
          "Esse documento está legível 👍",
          "Só preciso que você me confirme: é **seu** ou da **pessoa que vai somar renda**?"
        ]
      };
    }

    // ======================================================
    // 4 — Validação básica (legibilidade + consistência)
    // ======================================================
    const valid = validateDocumentReadable(docType, extractedText);

    // ======================================================
    // 5 — Salvar no Supabase (enova_docs)
// ======================================================
    await saveDocumentToSupabase(env, st.wa_id, {
      participante: participant,
      tipo: docType,
      url: file.url,
      valido: valid.valido,
      precisa_refazer: valid.refazer,
      motivo: valid.motivo || null,
      ocr_text: extractedText,
      created_at: new Date().toISOString()
    });

    // ======================================================
    // 6 — Atualizar pendências automaticamente
    // ======================================================
    await updateDocumentPendingList(env, st, docType, participant, valid);

    // ======================================================
    // 7 — RETORNO FINAL
    // ======================================================
    if (!valid.valido) {
      return {
        ok: false,
        participant,
        docType,
        readable: false,
        reason: "documento_ilegivel",
        message: [
          "Documento recebido, mas não ficou legível o suficiente.",
          `Identifiquei como **${docType.replace(/_/g, " ")}** (${participant.toUpperCase()}).`,
          "Me envie uma foto mais nítida para eu validar corretamente 🙏",
        ]
      };
    }

    return {
      ok: true,
      participant,
      docType,
      readable: valid.valido,
      message: [
        "Documento recebido e conferido 👏",
        `Identifiquei como **${docType.replace(/_/g, " ")}** (${participant.toUpperCase()}).`,
        "Tudo certo com ele!",
      ]
    };

  } catch (err) {
    console.error("ERRO NO BLOCO 15:", err);
    return {
      ok: false,
      reason: "erro_geral",
      message: [
        "Aconteceu algo inesperado aqui 😅",
        "Tenta enviar novamente pra mim, por favor."
      ]
    };
  }
}

// ======================================================================
// 🔧 FUNÇÃO A — OCR inteligente
// ======================================================================
async function extractContentSmart(env, file) {
  const type = file.contentType || "";

  // imagem ou pdf → OCR
  if (type.includes("image") || type.includes("pdf")) {
    return await extractTextFromImage(file, env);
  }

  // áudio → transcrição
  if (type.includes("audio")) {
    return await transcribeAudio(file, env);
  }

  return "";
}

// ======================================================================
// 🔧 FUNÇÃO B — Classificação documental avançada
// ======================================================================
function detectDocumentTypeAdvanced(txt) {
  txt = txt.toLowerCase();

  const rules = [
    { type: "ctps_completa", match: /(ctps|carteira de trabalho|contrato|pis|pasep)/ },
    { type: "holerite", match: /(holerite|contracheque|vencimentos)/ },
    { type: "extratos_bancarios", match: /(extrato|movimentação|saldo)/ },
    { type: "declaracao_ir", match: /(imposto de renda|ajuste anual)/ },
    { type: "comprovante_residencia", match: /(copel|sanepar|água|internet|conta)/ },
    { type: "certidao_casamento", match: /(certidão|casamento)/ },
    { type: "identidade_cpf", match: /(rg|cpf|cnh|habilitação)/ },
    { type: "comprovante_pensao", match: /(pensão|pensionista)/ },
    { type: "comprovante_aposentadoria", match: /(aposentado|aposentadoria)/ }
  ];

  for (const rule of rules) {
    if (rule.match.test(txt)) return rule.type;
  }

  return "desconhecido";
}

// ======================================================================
// 🔧 FUNÇÃO C — Detectar P1 / P2
// ======================================================================
function detectParticipant(st, txt) {

  // se é solo → sempre P1
  if (!st.financiamento_conjunto && !st.somar_renda) return "p1";

  const txtLower = txt.toLowerCase();

  // indicações claras de P2
  if (/cônjuge|conjuge|espos|companheir|marid|mulher/.test(txtLower)) return "p2";

  // match direto no nome do parceiro
  if (st.nome_parceiro && txtLower.includes(st.nome_parceiro.toLowerCase())) {
    return "p2";
  }

  // fallback → perguntar em outra etapa
  return null;
}

// ======================================================================
// 🔧 FUNÇÃO D — Validação de legibilidade
// ======================================================================
function validateDocumentReadable(docType, txt) {
  if (!txt || txt.length < 20) {
    return {
      valido: false,
      refazer: true,
      motivo: "Documento ilegível ou incompleto"
    };
  }

  return {
    valido: true,
    refazer: false,
    motivo: null
  };
}

// ======================================================================
// 🔧 FUNÇÃO E — SALVAR NO SUPABASE
// ======================================================================
async function saveDocumentToSupabase(env, wa_id, data) {
  const participante = data?.participante || data?.participant || null;
  const payload = { ...data, participante };
  delete payload.participant;

  await fetch(`${env.SUPABASE_URL}/rest/v1/enova_docs`, {
    method: "POST",
    headers: {
      "apikey": env.SUPABASE_KEY,
      "Authorization": `Bearer ${env.SUPABASE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ wa_id, ...payload })
  });
}

// ======================================================================
// 🔧 FUNÇÃO F — Atualizar lista de pendências
// ======================================================================
async function updateDocumentPendingList(env, st, docType, participant, valid) {

  // Recalcula pendências com base na tabela real enova_docs
  // e persiste status canônico em enova_docs_status.
  const status = await updateDocsStatusV2(env, st);

  if (!valid.valido) {
    await logger(env, {
      wa_id: st?.wa_id || null,
      event: "docs_documento_invalido",
      severity: "warning",
      details: {
        participante: participant,
        doc_tipo: docType,
        motivo: valid.motivo || "pendente",
        docs_completos: status?.completo === true
      }
    });
  }

  return true;
}

// ======================================================================
// 🧱 BLOCO 16 — CHECKLIST AUTOMÁTICO DE DOCUMENTOS (CEF / MCMV)
// ======================================================================
//
// generateChecklist(st)
//
// RETORNA um array com os documentos obrigatórios do cliente
// baseado em:
//   - estado civil
//   - composição de renda (p1/p2)
//   - CLT / autônomo / servidor / aposentado
//   - IR declarado ou não
//   - renda mista
//   - dependentes
//   - casamento civil / união estável
//
// ======================================================================

function generateChecklist(st) {
  const checklist = [];

  // ======================================================
  // 🔹 Documentos obrigatórios para TODOS
  // ======================================================
  checklist.push(
    { tipo: "identidade_cpf", participante: "p1" },
    { tipo: "comprovante_residencia", participante: "p1" }
  );

  // ======================================================
  // 🔹 Casados no civil → certidão é obrigatória
  // ======================================================
  if (st.estado_civil === "casado" && st.casamento_formal === "civil_papel") {
    checklist.push({
      tipo: "certidao_casamento",
      participante: "p1"
    });
  }

  // ======================================================
  // 🔹 Configurar participante 2 (somando renda)
  // ======================================================
  const hasP2 = st.financiamento_conjunto || st.somar_renda;

  if (hasP2) {
    // identidade + residência (mesmo que repetida, sistema ignora duplicados)
    checklist.push(
      { tipo: "identidade_cpf", participante: "p2" },
      { tipo: "comprovante_residencia", participante: "p2" }
    );

    // união estável → declaração precisa ir depois
    if (st.estado_civil === "uniao_estavel") {
      checklist.push({
        tipo: "declaracao_uniao_estavel",
        participante: "p1"
      });
    }
  }

  // ======================================================
  // 🔹 TRABALHADOR CLT (titular)
  // ======================================================
  if (st.regime_trabalho === "clt") {
    // regra CEF:
    // se há variação de salário → 3 holerites
    // se salário fixo → 1 holerite basta
    if (st.renda_variavel === true) {
      checklist.push({ tipo: "holerite_3_meses", participante: "p1" });
    } else {
      checklist.push({ tipo: "holerite_1_mes", participante: "p1" });
    }

    // carteira de trabalho é obrigatória
    checklist.push({ tipo: "ctps_completa", participante: "p1" });
  }

  // ======================================================
  // 🔹 TRABALHADOR CLT (parceiro)
  // ======================================================
  if (st.regime_trabalho_parceiro === "clt") {
    if (st.p2_renda_variavel === true) {
      checklist.push({ tipo: "holerite_3_meses", participante: "p2" });
    } else {
      checklist.push({ tipo: "holerite_1_mes", participante: "p2" });
    }
    checklist.push({ tipo: "ctps_completa", participante: "p2" });
  }

  // ======================================================
  // 🔹 AUTÔNOMO (titular)
  // ======================================================
  if (st.regime_trabalho === "autonomo") {

    // Se declarou IR → IR serve como comprovante
    if (st.ir_declarado === true) {
      checklist.push({ tipo: "declaracao_ir", participante: "p1" });
    } 
    
    // Se NÃO declarou IR → extratos bancários obrigatórios
    else {
      checklist.push({ tipo: "extratos_bancarios", participante: "p1" });
    }
  }

  // ======================================================
  // 🔹 AUTÔNOMO (parceiro)
  // ======================================================
  if (st.regime_trabalho_parceiro === "autonomo") {

    if (st.ir_declarado_p2 === true) {
      checklist.push({ tipo: "declaracao_ir", participante: "p2" });
    } else {
      checklist.push({ tipo: "extratos_bancarios", participante: "p2" });
    }
  }

  // ======================================================
  // 🔹 RENDA MISTA (CLT + autônomo)
  // ======================================================
  if (st.renda_mista === true) {
    // regra CEF: precisa dos dois lados
    checklist.push(
      { tipo: "holerite_3_meses", participante: "p1" },
      { tipo: "extratos_bancarios", participante: "p1" }
    );
  }

  // ======================================================
  // 🔹 SERVIDOR PÚBLICO
  // ======================================================
  if (st.regime_trabalho === "servidor") {
    // geralmente contracheque único basta
    checklist.push({
      tipo: "holerite_1_mes",
      participante: "p1"
    });
  }

  // ======================================================
  // 🔹 APOSENTADO / PENSIONISTA
  // ======================================================
  if (st.regime_trabalho === "aposentado") {
    checklist.push({
      tipo: "comprovante_aposentadoria",
      participante: "p1"
    });
  }

  if (st.regime_trabalho === "pensionista") {
    checklist.push({
      tipo: "comprovante_pensao",
      participante: "p1"
    });
  }

  // ======================================================
  // 🔹 DEPENDENTES
  // ======================================================
  if (st.dependente === true) {
    checklist.push({
      tipo: "certidao_nascimento_dependente",
      participante: "p1"
    });
  }

  // ======================================================
  // 🔚 RETORNO FINAL — sem duplicações
  // ======================================================
  return dedupeChecklist(checklist);
}

// Remove duplicações (P1/P2)
function dedupeChecklist(list) {
  const set = new Set();
  const finalList = [];

  for (const item of list) {
    const key = `${item.tipo}_${item.participante}`;
    if (!set.has(key)) {
      set.add(key);
      finalList.push(item);
    }
  }

  return finalList;
}

function dossieIsYes(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  return isYes(String(value));
}

function dossieToMoney(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = parseMoneyBR(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dossieRendaVariavel(st, participanteId) {
  if (participanteId === "p1") return dossieIsYes(st.renda_variavel);
  if (participanteId === "p2") return dossieIsYes(st.p2_renda_variavel || st.renda_variavel_parceiro);
  return dossieIsYes(st.p3_renda_variavel || st.renda_variavel_p3);
}

function buildDocumentDossierFromState(st) {
  const hasP2 = Boolean(st.financiamento_conjunto || st.somar_renda);
  const hasP3 = Boolean(
    st.p3_required ||
    st.regime_trabalho_parceiro_familiar_p3 ||
    st.renda_parceiro_familiar_p3
  );

  const participantes = [
    {
      id: "p1",
      role: "titular",
      regime_trabalho: st.regime_trabalho || null,
      renda: dossieToMoney(st.renda),
      restricao: dossieIsYes(st.restricao),
      regularizacao_restricao: dossieIsYes(st.regularizacao_restricao)
    }
  ];

  if (hasP2) {
    participantes.push({
      id: "p2",
      role: "parceiro_familiar",
      regime_trabalho: st.regime_trabalho_parceiro || st.regime_trabalho_parceiro_familiar || null,
      renda: dossieToMoney(st.renda_parceiro || st.renda_parceiro_familiar),
      restricao: dossieIsYes(st.restricao_parceiro),
      regularizacao_restricao: dossieIsYes(st.regularizacao_restricao_parceiro)
    });
  }

  if (hasP3) {
    participantes.push({
      id: "p3",
      role: "familiar_p3",
      regime_trabalho: st.regime_trabalho_parceiro_familiar_p3 || null,
      renda: dossieToMoney(st.renda_parceiro_familiar_p3),
      restricao: dossieIsYes(st.restricao_parceiro_p3),
      regularizacao_restricao: dossieIsYes(st.regularizacao_restricao_p3)
    });
  }

  const docsObrigatorios = participantes.flatMap((p) => ([
    { participante: p.id, tipo: "rg", obrigatorio: true },
    { participante: p.id, tipo: "cpf", obrigatorio: true },
    { participante: p.id, tipo: "comprovante_residencia", obrigatorio: true },
    { participante: p.id, tipo: "comprovante_renda", obrigatorio: true }
  ]));

  const docsCondicionais = [];
  if (st.estado_civil === "casado") {
    docsCondicionais.push({ participante: "p1", tipo: "certidao_casamento", regra: "casado_civil" });
  }

  for (const p of participantes) {
    if (p.regime_trabalho === "clt") {
      const rendaVariavel = dossieRendaVariavel(st, p.id);
      docsCondicionais.push({
        participante: p.id,
        tipo: rendaVariavel ? "holerites_ultimos_3" : "holerite_ultimo",
        regra: rendaVariavel ? "clt_variavel" : "clt_fixa"
      });
    }
    if (p.regime_trabalho === "autonomo") {
      const irDeclarado =
        p.id === "p1"
          ? dossieIsYes(st.autonomo_ir_pergunta || st.ir_declarado)
          : p.id === "p2"
            ? dossieIsYes(st.ir_declarado_parceiro || st.ir_declarado_p2)
            : dossieIsYes(st.ir_declarado_p3);
      if (irDeclarado) {
        docsCondicionais.push(
          { participante: p.id, tipo: "declaracao_ir", regra: "autonomo_com_ir" },
          { participante: p.id, tipo: "recibo_ir", regra: "autonomo_com_ir" }
        );
      } else {
        docsCondicionais.push({ participante: p.id, tipo: "extratos_bancarios_3_meses", regra: "autonomo_sem_ir" });
      }
    }
  }

  const docsRecomendados = [];
  const observacoesCliente = [];
  const observacoesCorrespondente = [];
  if (dossieIsYes(st.ctps_36)) {
    docsRecomendados.push({ participante: "p1", tipo: "ctps_completa", recomendacao: "estrategica" });
    observacoesCliente.push("CTPS completa é recomendada para melhorar taxa de juros e perfil de financiamento.");
    observacoesCorrespondente.push("CTPS completa recomendada (não obrigatória) para potencial ganho de taxa e alçada.");
  }

  const rendaTotalFormal = participantes
    .filter((p) => ["clt", "servidor", "aposentado", "pensionista"].includes(String(p.regime_trabalho || "")))
    .reduce((acc, p) => acc + (p.renda || 0), 0);
  const rendaTotalInformal = participantes
    .filter((p) => String(p.regime_trabalho || "") === "autonomo")
    .reduce((acc, p) => acc + (p.renda || 0), 0);

  const restricoesAtivas = participantes.filter((p) => p.restricao);
  const pendencias = [...docsObrigatorios, ...docsCondicionais].map((item) => ({
    ...item,
    status: "pendente"
  }));

  const envioDocsItens = [
    ...docsObrigatorios.map((d) => ({ ...d, bucket: "obrigatorio", status: "pendente" })),
    ...docsCondicionais.map((d) => ({ ...d, bucket: "condicional", status: "pendente" })),
    ...docsRecomendados.map((d) => ({ ...d, bucket: "recomendado", status: "recomendado" }))
  ];

  return {
    dossie_status: "pronto",
    dossie_aptidao_programa: restricoesAtivas.some((p) => !p.regularizacao_restricao) ? "pendente_regularizacao" : "apto",
    dossie_motivo_status: "dossie_montado_automaticamente_na_entrada_envio_docs",
    dossie_tipo_processo: participantes.length > 1 ? "composicao_renda" : "individual",
    dossie_qtd_participantes: participantes.length,
    dossie_renda_total_formal: rendaTotalFormal,
    dossie_renda_total_informal: rendaTotalInformal,
    dossie_restricao_resumo: restricoesAtivas.length
      ? `Restrição em ${restricoesAtivas.map((p) => p.id).join(", ")}`
      : "Sem restrição ativa",
    dossie_risco_documental: docsCondicionais.length > 2 ? "medio" : "baixo",
    dossie_resumo_humano: `Dossiê com ${participantes.length} participante(s), ${docsObrigatorios.length} docs obrigatórios e ${docsCondicionais.length} condicionais.`,
    dossie_participantes_json: participantes,
    dossie_pendencias_json: pendencias,
    dossie_docs_obrigatorios_json: docsObrigatorios,
    dossie_docs_condicionais_json: docsCondicionais,
    dossie_docs_recomendados_json: docsRecomendados,
    dossie_observacoes_cliente_json: observacoesCliente,
    dossie_observacoes_correspondente_json: observacoesCorrespondente,
    envio_docs_itens_json: envioDocsItens,
    envio_docs_total_itens: envioDocsItens.length,
    envio_docs_total_pendentes: envioDocsItens.filter((i) => i.status === "pendente").length
  };
}

async function persistDocumentDossier(env, st, dossier) {
  if (!dossier) return;
  await upsertState(env, st.wa_id, dossier);
  Object.assign(st, dossier);
}

// =============================================================
// 🧱 C17 — HELPERS: LABEL BONITO / CHECKLIST / STATUS
// =============================================================

// 17.1 — Nomes bonitos para o CRM
function prettyDocLabel(type) {
  const map = {
    identidade_cpf: "Identidade / CPF / CNH",
    ctps_completa: "Carteira de Trabalho Completa",
    holerites: "Holerites",
    declaracao_ir: "Declaração de IR",
    extratos_bancarios: "Extratos Bancários",
    comprovante_residencia: "Comprovante de Residência",
    certidao_casamento: "Certidão de Casamento",
    comprovante_pensao: "Comprovante de Pensão",
    comprovante_aposentadoria: "Comprovante de Aposentadoria",
    certidao_nascimento_dependente: "Certidão de Nascimento do Dependente",
    desconhecido: "Documento Desconhecido"
  };

  return map[type] || type;
}

// 17.2 — Gera checklist dinâmico p/ P1 e P2
function generateChecklistForDocs(st) {
  const checklist = [];

  // Documentos obrigatórios P1
  checklist.push({ tipo: "identidade_cpf", participante: "p1" });
  checklist.push({ tipo: "comprovante_residencia", participante: "p1" });
  checklist.push({ tipo: "ctps_completa", participante: "p1" });

  if (st.regime_trabalho === "clt") {
    checklist.push({ tipo: "holerites", participante: "p1" });
  }

  if (st.regime_trabalho === "autonomo") {
    if (st.ir_declarado) {
      checklist.push({ tipo: "declaracao_ir", participante: "p1" });
    } else {
      checklist.push({ tipo: "extratos_bancarios", participante: "p1" });
    }
  }

  // Casamento civil → certidão
  if (st.casamento_formal === "civil_papel") {
    checklist.push({ tipo: "certidao_casamento", participante: "p1" });
  }

  // Dependente
  if (st.dependente === true) {
    checklist.push({
      tipo: "certidao_nascimento_dependente",
      participante: "p1"
    });
  }

  // Documentos P2 caso somar renda
  if (st.financiamento_conjunto || st.somar_renda) {
    checklist.push({ tipo: "identidade_cpf", participante: "p2" });
    checklist.push({ tipo: "comprovante_residencia", participante: "p2" });
    checklist.push({ tipo: "ctps_completa", participante: "p2" });

    if (st.regime_trabalho_parceiro === "clt") {
      checklist.push({ tipo: "holerites", participante: "p2" });
    }

    if (st.regime_trabalho_parceiro === "autonomo") {
      if (st.ir_declarado_parceiro) {
        checklist.push({ tipo: "declaracao_ir", participante: "p2" });
      } else {
        checklist.push({ tipo: "extratos_bancarios", participante: "p2" });
      }
    }
  }

  return dedupeChecklist(checklist);
}

// 17.3 — Salva o status no Supabase
async function saveDocumentStatus(env, st, status) {
  await sbFetch(env, "/rest/v1/enova_docs_status", {
    method: "POST",
    body: JSON.stringify({
      wa_id: st.wa_id,
      status_json: status,
      updated_at: new Date().toISOString()
    })
  });
}

// ======================================================================
// 🧱 BLOCO 18 — ORQUESTRADOR DE DOCUMENTOS (PENDÊNCIAS + AVANÇO)
// ======================================================================

/**
 * updateDocsStatusV2(env, st)
 *
 * NOVA VERSÃO — segura e sem conflitos
 *
 * O que faz:
 *  - consulta todos os docs enviados no Supabase (enova_docs)
 *  - gera checklist atualizado (Bloco 16)
 *  - compara docs recebidos vs docs necessários (P1 e P2)
 *  - cria lista de pendências
 *  - se tudo entregue → retorna { completo: true }
 *    se faltar → retorna { completo: false, pendentes: [...] }
 */
async function updateDocsStatusV2(env, st) {

  // ================================
  // 1 — BUSCA DOCUMENTOS RECEBIDOS
  // ================================
  const { data: docsRecebidos } = await sbFetch(env, "/rest/v1/enova_docs", {
    method: "GET",
    query: {
      wa_id: `eq.${st.wa_id}`,
      select: "*"
    }
  });

  const recebidos = docsRecebidos || [];

  // ================================
  // 2 — CHECKLIST (docs necessários)
  // ================================
  const checklist = await gerarChecklistDocumentos(st);

  // ================================
  // 3 — COMPARAR (pendências)
  // ================================
  const pendencias = [];

  for (const item of checklist) {
    const achou = recebidos.some(
      d => d.tipo === item.tipo && (d.participante || d.participant) === item.participante
    );
    if (!achou) pendencias.push(item);
  }

  // ================================
  // 4 — ATUALIZA STATUS NO SUPABASE
  // ================================
  await upsertState(env, st.wa_id, {
    docs_pendentes: pendencias.length,
    docs_completos: pendencias.length === 0
  });

  // ================================
  // 5 — RETORNO FINAL
  // ================================
  return {
    completo: pendencias.length === 0,
    pendentes: pendencias
  };
}


// ====== FUNÇÃO: MENSAGEM BONITA DAS PENDÊNCIAS ======
function mensagemPendenciasHumanizada(list) {
  if (!list || list.length === 0)
    return ["Tudo certo! Nenhuma pendência 🎉"];

  const linhas = ["Ainda preciso destes docs pra finalizar 👇"];

  for (const item of list) {
    const tipo = labelTipoDocumento(item.tipo);
    const dono = item.participante === "p1" ? "seu" : "do parceiro(a)";
    linhas.push(`• ${tipo} (${dono})`);
  }

  return linhas;
}

// ======================================================================
// 🧱 BLOCO 19 — ROTEADOR DE MÍDIA PARA DOCUMENTOS (FINAL MASTER)
// ======================================================================

/**
 * handleDocumentUpload(env, st, msg)
 *
 * - Detecta tipo de mídia recebida (image, audio, document, etc.)
 * - Baixa arquivo do WhatsApp
 * - Processa via OCR / Whisper (processIncomingDocumentV2)
 * - Atualiza pendências usando updateDocsStatusV2
 * - Retorna mensagem humanizada e segue no fluxo envio_docs
 */
async function handleDocumentUpload(env, st, msg) {
  try {
    // ==========================================================
    // 1 — DETECTAR TIPO DE ARQUIVO VINDO DO WHATSAPP
    // ==========================================================
    const mediaObject =
      msg.image || msg.audio || msg.document || msg.video || null;

    if (!mediaObject) {
      return {
        ok: false,
        message: [
          "Não consegui identificar o arquivo 😕",
          "Pode tentar enviar novamente?"
        ],
        keepStage: "envio_docs"
      };
    }

    const mediaId = mediaObject.id;
    const fileType = msg.type || "desconhecido";

    // ==========================================================
    // 2 — BAIXAR MÍDIA DO WHATSAPP
    // ==========================================================
    const mediaUrl = `https://graph.facebook.com/v20.0/${mediaId}`;
    const mediaResp = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${env.WHATS_TOKEN}` }
    });

    const arrayBuffer = await mediaResp.arrayBuffer();
    const contentType = mediaResp.headers.get("Content-Type") || "";

    const file = {
      buffer: arrayBuffer,
      url: mediaUrl,
      contentType
    };

    // ==========================================================
    // 3 — PROCESSAR DOCUMENTO (recai no Bloco 13 / V2)
    // ==========================================================
    const result = await processIncomingDocumentV2(env, st, file);

    if (!result.ok) {
      return {
        ok: false,
        message: result.message,
        keepStage: "envio_docs"
      };
    }

    // ==========================================================
    // 4 — ATUALIZAR PENDÊNCIAS (Bloco 18)
    // ==========================================================
    const status = await updateDocsStatusV2(env, st);

    // ==========================================================
    // 5 — MENSAGEM DE CONFIRMAÇÃO
    // ==========================================================
    const linhas = [
      "Documento recebido e registrado 👌",
      `Tipo: **${labelTipoDocumento(result.docType)}**`,
    ];

    // Se ainda há pendências
    if (!status.completo) {
      linhas.push("");
      linhas.push(...mensagemPendenciasHumanizada(status.pendentes));
      return {
        ok: true,
        message: linhas,
        keepStage: "envio_docs"
      };
    }

    // Se completou tudo
    linhas.push("");
    linhas.push("🚀 Perfeito! Todos documentos recebidos.");
    linhas.push("Agora posso avançar para a próxima etapa.");

    return {
      ok: true,
      message: linhas,
      nextStage: "agendamento_visita"
    };

  } catch (err) {
    console.error("Erro handleDocumentUpload:", err);

    return {
      ok: false,
      message: [
        "Opa… deu algum errinho aqui 😅",
        "Tenta me enviar o documento de novo, por favor?"
      ],
      keepStage: "envio_docs"
    };
  }
}

// =============================================================
// 🧩 FUNÇÃO — GERAR DOSSIÊ COMPLETO DO CLIENTE
// =============================================================
function gerarDossieCompleto(st) {

  return `
📌 *Dossiê do Cliente*

👤 Titular: ${st.nome || "não informado"}
📍 Estado Civil: ${st.estado_civil || "não informado"}

💰 Renda Titular: ${st.renda || "não informado"}
💰 Renda Parceiro: ${st.renda_parceiro || "não informado"}
🧮 Soma de Renda: ${st.somar_renda ? "Sim" : "Não"}

📄 CTPS Titular ≥ 36 meses: ${st.ctps_36 === true ? "Sim" : "Não"}
📄 CTPS Parceiro ≥ 36 meses: ${st.ctps_36_parceiro === true ? "Sim" : "Não"}

👶 Dependente: ${st.dependente === true ? "Sim" : "Não"}

🚨 Restrição: ${st.restricao || "não informado"}

📂 Status Documentos: ${st.docs_status_geral || "pendente"}

ID: ${st.wa_id}
  `.trim();
}

// =========================================================
// 🧱 FUNÇÃO — ENVIAR PROCESSO AO CORRESPONDENTE (D3)
// =========================================================
async function enviarParaCorrespondente(env, st, dossie) {
  // 1 — Log de rastreabilidade (fica salvo no enova_log)
  try {
    await logger(env, {
      wa_id: st.wa_id,
      tipo: "envio_correspondente",
      dossie,
      msg: "Processo enviado ao correspondente (D3)"
    });
  } catch (e) {
    console.error("Erro ao logar envio ao correspondente:", e);
  }

  // 2 — Monta texto bonitão pro correspondente (estilo print que você mandou)
  const nomeCliente = st.nome || "NÃO INFORMADO";
  const estadoCivil = st.estado_civil || "NÃO INFORMADO";

  const rendaTitular  = st.renda ? `Renda Titular: R$ ${st.renda}` : "Renda Titular: não informada";
  const rendaParc    = st.renda_parceiro ? `Renda Parceiro: R$ ${st.renda_parceiro}` : "Renda Parceiro: não informado";
  const somaRendaTxt = st.somar_renda ? "Sim" : "Não";

  const ctpsTitular  = st.ctps_36 === true ? "Sim" : (st.ctps_36 === false ? "Não" : "Não informado");
  const ctpsParc     = st.ctps_36_parceiro === true ? "Sim" : (st.ctps_36_parceiro === false ? "Não" : "Não informado");

  let restricaoTxt;
  if (st.restricao === true) restricaoTxt = "Sim (cliente informou restrição)";
  else if (st.restricao === false) restricaoTxt = "Não";
  else if (st.restricao === "incerto") restricaoTxt = "Incerto (cliente não soube confirmar)";
  else restricaoTxt = "Não informado";

  const dependenteTxt = st.dependente === true ? "Sim" : (st.dependente === false ? "Não" : "Não informado");

  const statusDocs = st.docs_status_geral || "pendente";

  const mensagemCorrespondente = [
    "Olá! Por favor, analisar este perfil para Minha Casa Minha Vida 🙏",
    "",
    `👤 Cliente: ${nomeCliente}`,
    `💍 Estado civil: ${estadoCivil}`,
    `🤝 Soma renda com alguém? ${somaRendaTxt}`,
    "",
    `💰 ${rendaTitular}`,
    `💰 ${rendaParc}`,
    "",
    `📘 CTPS Titular ≥ 36 meses: ${ctpsTitular}`,
    `📘 CTPS Parceiro ≥ 36 meses: ${ctpsParc}`,
    "",
    `👶 Dependente menor de 18: ${dependenteTxt}`,
    `🚨 Restrição em CPF: ${restricaoTxt}`,
    "",
    `📂 Status documentos: ${statusDocs}`,
    "",
    "Resumo IA:",
    dossie,
    "",
    "Assim que tiver a pré-análise, me retorne por favor com:",
    "- CRÉDITO APROVADO ou CRÉDITO REPROVADO",
    "- Observações / condições principais 🙏"
  ].join("\n");

  // 3 — Envia mensagem via WhatsApp Cloud API para o grupo / número do correspondente
  const to = env.CORRESPONDENTE_TO; 
  // 👉 configure no Cloudflare:
  // CORRESPONDENTE_TO = número do grupo ou telefone do correspondente (ex: 5541999999999)

  if (!to) {
    console.warn("CORRESPONDENTE_TO não configurado no ambiente. Não foi possível enviar ao correspondente.");
    return false;
  }

  try {
    await sendWhatsToCorrespondente(env, to, mensagemCorrespondente);
  } catch (err) {
    console.error("Erro ao enviar mensagem ao correspondente:", err);
    return false;
  }

  return true;
}

// =========================================================
// 🔧 Helper — enviar mensagem de texto pro correspondente
// =========================================================
async function sendWhatsToCorrespondente(env, to, body) {
  const simCtx = getSimulationContext(env);
  if (simCtx?.suppressExternalSend) {
    simCtx.sendPreview = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body }
    };
    simCtx.wouldSend = true;
    return true;
  }

  const url = `https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.WHATS_TOKEN}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Erro WhatsApp correspondente:", errText);
    throw new Error("WhatsApp correspondente fail");
  }
}

// ======================================================================
// 🧱 D4 — RETORNO DO CORRESPONDENTE (interpretação + aviso ao cliente)
// ======================================================================

// Quebra o texto do correspondente em blocos (cada cliente)
function parseCorrespondenteBlocks(rawText) {
  if (!rawText) return [];

  // separa por linhas vazias
  const blocks = rawText.split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);

  return blocks.map(block => {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);

    // 1) tenta achar linha com "Pré-cadastro"
    let nome = null;
    for (let i = 0; i < lines.length - 1; i++) {
      if (/pr[eé]-?cadastro/i.test(lines[i])) {
        nome = lines[i + 1];
        break;
      }
    }

    // fallback: se não achou, tenta pegar a primeira linha "tipo nome"
    if (!nome && lines.length >= 2) {
      // se a segunda linha não tiver "status", provavelmente é o nome
      if (!/status/i.test(lines[1])) {
        nome = lines[1];
      }
    }

    // 2) detecta status
    const joined = lines.join(" ").toLowerCase();
    let status = "indefinido";

    if (/aprovad/.test(joined)) status = "aprovado";
    else if (/reprovad/.test(joined)) status = "reprovado";
    else if (/pend[eê]nci/.test(joined)) status = "pendente";

    // 3) tenta extrair uma linha de motivo
    let motivo =
      lines.find(l =>
        /pend[eê]ncia|motivo|detalhe|vincula[cç][aã]o|ag[eê]ncia/i.test(l)
      ) || null;

    return {
      raw: block,
      nome: (nome || "").trim(),
      status,
      motivo
    };
  });
}

// Busca o cliente no enova_state pelo nome aproximado
async function findClientByName(env, nome) {
  if (!nome) return null;

  // ILIKE com wildcard nos dois lados
  const filtro = `*${nome}*`;

  const { data } = await sbFetch(env, "/rest/v1/enova_state", {
    method: "GET",
    query: {
      nome: `ilike.${filtro}`,
      select: "wa_id,nome,fase_conversa,funil_status",
      order: "updated_at.desc",
      limit: 1
    }
  });

  if (!data || !data.length) return null;

  return data[0]; // pega o mais recente
}

// Handler principal chamado pelo webhook quando a msg vem do correspondente
async function handleCorrespondenteRetorno(env, msg) {
  const rawText = msg.text?.body || "";
  const blocks = parseCorrespondenteBlocks(rawText);

  if (!blocks.length) {
    console.log("Retorno correspondente sem blocos identificáveis");
    return;
  }

  // log geral
  await logger(env, {
    tipo: "retorno_correspondente_raw",
    wa_id: msg.from,
    texto: rawText
  });

  for (const bloco of blocks) {
    const { nome, status, motivo, raw } = bloco;

    // tenta localizar cliente pelo nome
    const cliente = await findClientByName(env, nome);
    if (!cliente || !cliente.wa_id) {
      await logger(env, {
        tipo: "retorno_correspondente_sem_match",
        nome_detectado: nome,
        status_detectado: status,
        bloco: raw
      });
      continue; // não achou ninguém, pula
    }

    const wa_id_cliente = cliente.wa_id;
    let stCliente = await getState(env, wa_id_cliente);
    if (!stCliente) {
      // fallback: cria estado mínimo
      await upsertState(env, wa_id_cliente, {
        fase_conversa: "inicio",
        funil_status: null,
        nome: cliente.nome || null
      });
      stCliente = await getState(env, wa_id_cliente);
    }

    // decide próxima fase e mensagens
    let proximaFase = "finalizacao";
    let mensagens = [];

    if (status === "aprovado") {
      proximaFase = "agendamento_visita";
      mensagens = [
        "Boa notícia! 🎉",
        "O correspondente bancário analisou seu cadastro e **aprovou o crédito na pré-análise**.",
        "Agora vamos só alinhar a melhor data/horário pra sua visita aqui no plantão 😉"
      ];
    } else if (status === "reprovado") {
      proximaFase = "finalizacao";
      mensagens = [
        "Te agradeço por ter enviado toda a documentação certinho, de verdade 🙏",
        "O correspondente bancário analisou seu cadastro e, por enquanto, o crédito saiu **reprovado**.",
        motivo ? `Motivo informado: ${motivo}` : "Eles apontaram pendências internas no cadastro.",
        "Se você quiser, posso te orientar nos próximos passos pra organizar isso e deixar o caminho pronto pra uma nova tentativa."
      ];
    } else if (status === "pendente") {
      proximaFase = "envio_docs";
      mensagens = [
        "O correspondente bancário analisou seu cadastro e identificou **pendências** pra liberar a aprovação. 📝",
        motivo ? `Resumo que eles passaram: ${motivo}` : "Eles pediram um ajuste / complemento nos documentos.",
        "Me manda aqui qualquer dúvida ou documento adicional que eles pediram que eu já te ajudo a organizar certinho."
      ];
    } else {
      // status indefinido — só avisa de forma genérica
      proximaFase = stCliente.fase_conversa || "envio_docs";
      mensagens = [
        "Recebi um retorno do correspondente sobre o seu processo 😉",
        "Eles mandaram algumas informações internas e estou acompanhando daqui.",
        "Se você quiser, já posso te atualizar e te orientar nos próximos passos."
      ];
    }

    // Atualiza funil_status apenas com rótulos simples
    let funil_status = stCliente.funil_status || null;
    if (status === "aprovado") funil_status = "aprovado_correspondente";
    if (status === "reprovado") funil_status = "reprovado_correspondente";
    if (status === "pendente") funil_status = "pendente_correspondente";

    await upsertState(env, wa_id_cliente, {
      funil_status,
      retorno_correspondente_bruto: raw,
      retorno_correspondente_status: status,
      retorno_correspondente_motivo: motivo || null
    });

    // recarrega estado atualizado
    stCliente = await getState(env, wa_id_cliente);

    // envia mensagem pro cliente e move o funil
    await step(env, stCliente, mensagens, proximaFase);

    // log de sucesso
    await logger(env, {
      tipo: "retorno_correspondente_processado",
      wa_id_cliente,
      nome_cliente: stCliente.nome || nome,
      status,
      proximaFase
    });
  } // fecha o for de blocks

} // fecha handleCorrespondenteRetorno   <--- ADICIONE ESTA LINHA

// ======================================================================
// 🧱 D5 — CÉREBRO DO FUNIL (runFunnel) — VERSÃO BLINDADA
// ======================================================================
async function runFunnel(env, st, userText) {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada do runFunnel
  // ============================================================
  await telemetry(env, {
    wa_id: st.wa_id,
    type: "funnel_enter",
    stage: st.fase_conversa || "inicio",
    userText,
    nextStage: null,
    message: "Entrada no runFunnel",
    severity: "info",
    details: {
      raw: userText,
      stage_before: st.fase_conversa || "inicio"
    }
  });

  const stage = st.fase_conversa || "inicio";
  let t = (userText || "").trim().toLowerCase();

  // ============================================================
  // 🧷 OFFTRACK DETERMINÍSTICO (YES/NO stages)
  // Se a fase atual espera SIM/NÃO e o texto não é SIM/NÃO → OFFTRACK (sem IA)
  // ============================================================
  const yesNoStages = new Set([
    "dependente",
    "restricao",
    "confirmar_casamento",
    "regularizacao_restricao",
    "ctps_36",
    "ctps_36_parceiro",
    "restricao_parceiro",
    "restricao_familiar",
    "restricao_p3"
  ]);

  if (yesNoStages.has(stage)) {
    const txt = (userText || "").trim();
    const ehSim = isYes(txt);
    const ehNao = isNo(txt);
    const ehTalvez = /\b(talvez|nao\s+sei|não\s+sei|depende|acho\s+que)\b/i.test(txt);
    const ehNaoExplicito = /^n[aã]o\b/i.test(txt);

    // não é resposta direta esperada → trava e pede responder a pergunta anterior
    if (!ehSim && !ehNao && !ehTalvez && !ehNaoExplicito) {
      return step(
        env,
        st,
        [
          "Certo. Vou analisar seu perfil primeiro e, no final, tiro todas suas dúvidas, combinado?",
          "Pra eu seguir aqui, me responde só a pergunta anterior direitinho. 🙏"
        ],
        stage
      );
    }
  }

    // ============================================================
  // 🧠 COGNITIVE ASSIST V1 (SOCORRO CONTROLADO)
  // - Somente nos stages permitidos
  // - Mantém soberania do funil mecânico
  // - Em baixa confiança ou ambiguidade: responde e mantém stage
  // ============================================================
  try {
    if (shouldTriggerCognitiveAssist(stage, userText)) {
      const clearAnswer = hasClearStageAnswer(stage, userText);
      const cognitive = await cognitiveAssistV1(env, {
        stage,
        text: userText,
        stateSnapshot: st
      });

      const compatibleSignal = isStageSignalCompatible(stage, cognitive.safe_stage_signal);
      const lowConfidence = Number(cognitive.confidence || 0) < COGNITIVE_V1_CONFIDENCE_MIN;
      const stillNeedsOriginal =
        cognitive.still_needs_original_answer === true && !clearAnswer;

      await telemetry(env, {
        wa_id: st.wa_id,
        event: "cognitive_v1_signal",
        stage,
        severity: "info",
        message: "Cognitive v1 acionado",
        details: {
          intent: cognitive.intent || null,
          confidence: cognitive.confidence ?? null,
          still_needs_original_answer: cognitive.still_needs_original_answer,
          answered_customer_question: cognitive.answered_customer_question,
          suggested_stage: cognitive.suggested_stage || null,
          safe_stage_signal: cognitive.safe_stage_signal || null,
          signal_compatible: compatibleSignal,
          clear_answer_detected_by_parser: clearAnswer,
          still_needs_original_effective: stillNeedsOriginal
        }
      });

      const cognitiveReply = !lowConfidence
        ? sanitizeCognitiveReply(cognitive.reply_text)
        : "";

      const hasUsefulCognitiveReply =
        Boolean(cognitiveReply) &&
        (
          cognitive.answered_customer_question === true ||
          Boolean(cognitive.intent) ||
          Boolean(cognitive.safe_stage_signal)
        );

      if (hasUsefulCognitiveReply) {
        st.__cognitive_reply_prefix = cognitiveReply;
      } else {
        st.__cognitive_reply_prefix = null;
      }

      st.__cognitive_stage_answer = null;
    }
  } catch (e) {
    console.error("COGNITIVE_V1_RUNFUNNEL_ERROR:", e);
  }

  // ============================================================
  // 🧠 OFFTRACK GUARD — IA apertador (SIM + REAL) — NÃO MUDA FASE
  //  Importante: precisa retornar via step() para o simulate capturar reply_text
  // ============================================================
  try {
    const guard = await offtrackGuard(env, {
      wa_id: st.wa_id,
      stage,
      text: userText
    });

    if (guard?.offtrack === true) {
      await telemetry(env, {
        wa_id: st.wa_id,
        event: "offtrack_signal",
        stage,
        severity: "info",
        message: "Pergunta fora do trilho — mantendo fase",
        details: {
          label: guard.label || null,
          confidence: guard.confidence ?? null,
          raw: userText
        }
      });

      return step(
        env,
        st,
        [
          "Certo. Vou analisar seu perfil primeiro e, no final, tiro todas suas dúvidas, combinado?",
          "Pra eu seguir aqui, me responde só a pergunta anterior direitinho. 🙏"
        ],
        stage // mantém a mesma fase (não pula etapa)
      );
    }
  } catch (e) {
    console.error("OFFTRACK_GUARD_RUNFUNNEL_ERROR:", e);
  }
  
  // ============================================================
  // 🛰 ENTER_STAGE
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_stage",
    stage,
    severity: "info",
    message: "Cliente entrou no estágio",
    details: {
      userText,
      raw: userText,
      last_user_text: st.last_user_text || null,
      funil_status: st.funil_status || null,
      estado_civil: st.estado_civil || null,
      renda: st.renda || null,
      renda_parceiro: st.renda_parceiro || null,
      renda_total_para_fluxo: st.renda_total_para_fluxo || null
    }
  });

  // ============================================================
  // 🛑 BLOCO D — ANTI-LOOP / ANTI-DUPLICAÇÃO
  // ============================================================

  // 1) Webhook duplicado (mesmo texto que já foi processado)
  // ✅ NÃO BLOQUEIA O CLIENTE: repetição de "sim/não" é normal.
  // Deduplicação real do webhook já acontece no handleMetaWebhook pelo messageId (wamid).
  const prevProcessedStage = String(st.last_processed_stage || "");
  const currStage = String(stage || "");
  const sameStageProcessed = prevProcessedStage === currStage;

  if (sameStageProcessed && st.last_processed_text && st.last_processed_text === userText) {
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "duplicate_user_text_ignored",
      stage,
      severity: "info",
      message: "Texto repetido na mesma fase — NÃO bloqueado (cliente pode repetir resposta)",
      details: {
        last_processed_text: st.last_processed_text,
        current_text: userText,
        last_processed_stage: prevProcessedStage,
        current_stage: currStage
      }
    });

    // segue o fluxo normal (não retorna)
  }

// ============================================================
// 🔄 RESET GLOBAL — funciona em QUALQUER FASE
// ============================================================
const nt = normalizeText(userText || "");

const isReset =
  nt === "reset" ||
  /\b(resetar|reset|recomecar|recomeçar|zerar tudo|comecar do zero|começar do zero|comecar tudo de novo|começar tudo de novo)\b/.test(nt);

if (isReset) {
  await resetTotal(env, st.wa_id);

  // 🔥 CORREÇÃO ABSOLUTA: recarrega estado limpo
  const novoSt = await getState(env, st.wa_id);

    await upsertState(env, st.wa_id, {
    fase_conversa: "inicio_programa",
    last_user_text: null,
    last_processed_text: null,
    last_message_id: null,
    updated_at: new Date().toISOString()
  });

  novoSt.fase_conversa = "inicio_programa";
  novoSt.last_user_text = null;
  novoSt.last_processed_text = null;
  novoSt.last_message_id = null;

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "reset_global",
    stage,
    next_stage: "inicio_programa",
    severity: "info",
    message: "Reset global solicitado pelo usuário",
    details: {
      previous_stage: stage,
      normalized_text: nt,
      last_user_text: userText
    }
  });

  return step(
    env,
    novoSt,
    [
      "Perfeito, limpamos tudo aqui pra você 👌",
      "Eu sou a Enova 😊, assistente do programa Minha Casa Minha Vida.",
      "Você já sabe como funciona o programa ou prefere que eu explique rapidinho antes?",
      "Me responde com *sim* (já sei) ou *não* (quero que explique)."
    ],
    "inicio_programa"
  );
}

// 2) Loop por repetição do cliente (comparar com a ÚLTIMA msg do cliente)
// ✅ REGRA NOVA: NÃO bloquear o cliente. Repetição é válida (principalmente sim/não).
// Mantemos só telemetria para diagnóstico.
const nt_blockd = normalizeText(userText || "");
const prev_nt_blockd = normalizeText(st.last_user_text || "");
const prev_stage_user_blockd = String(st.last_user_stage || "");

const isGreeting_blockd = /^(oi|ola|olá|bom dia|boa tarde|boa noite)\b/i.test(nt_blockd);
const isResetCmd_blockd = /^(reset|reiniciar|recomecar|recomeçar|do zero|nova analise|nova análise)\b/i.test(nt_blockd);

const allowRepeatInStage_blockd = (
  stage === "somar_renda_familiar"
);

// ✅ só detecta repetição se for na MESMA fase
const sameStageRepeat_blockd = (prev_stage_user_blockd === String(stage || ""));

if (
  sameStageRepeat_blockd &&
  !allowRepeatInStage_blockd &&
  !isGreeting_blockd &&
  !isResetCmd_blockd &&
  prev_nt_blockd &&
  prev_nt_blockd === nt_blockd
) {
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "user_repeat_detected_no_block",
    stage,
    severity: "info",
    message: "Cliente repetiu a mensagem na mesma fase — permitido (sem bloqueio).",
    details: {
      prev_stage_user: prev_stage_user_blockd,
      current_stage: String(stage || ""),
      normalized_text: nt_blockd
    }
  });

  // ❌ NÃO retornar step() aqui.
  // Deixa o switch(stage) processar normalmente.
}

// 3) Registrar mensagem atual como última do cliente + última processada
await upsertState(env, st.wa_id, {
  last_user_text: userText,
  last_user_stage: String(stage || ""),
  last_processed_text: userText,
  last_processed_stage: String(stage || ""),
  updated_at: new Date().toISOString()
});
st.last_user_text = userText;
st.last_user_stage = String(stage || "");
st.last_processed_text = userText;
st.last_processed_stage = String(stage || "");

// ============================================================
// 🧩 INTERCEPTADOR GLOBAL DE SAUDAÇÃO — EM TODAS AS FASES
// ============================================================
const nt_global = normalizeText(userText || "");

// saudacoes comuns
const isGreeting_global =
  /\b(oi+|ola|olá|opa|eae|eai|fala|bom dia|boa tarde|boa noite)\b/.test(nt_global);

if (isGreeting_global && stage !== "inicio" && stage !== "inicio_programa") {
  const faseReal = st.fase_conversa || "inicio_programa";

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "global_greeting_detected",
    stage,
    next_stage: faseReal,
    severity: "info",
    message: "Saudação detectada — retomando exatamente da fase registrada",
    details: {
      userText,
      previous_stage: stage,
      fase_registrada: st.fase_conversa || null,
      last_user_text: st.last_user_text || null
    }
  });

  return step(
    env,
    st,
    [
      "Oi! 😊 Tudo bem?",
      "Podemos continuar exatamente de onde paramos."
    ],
    faseReal
  );
}

  // ⚠️ P3 NÃO pode ter detector global: isso dispara falso positivo (ex.: "incluir minha renda da taxa").
// P3 só deve abrir no pós-P2 (gate dedicado) ou por pedido explícito tratado no ponto correto do funil.
const querIncluirP3Global = false;

if (querIncluirP3Global) {
  return step(
    env,
    st,
    ["Quem você quer incluir? (pai, mãe, irmão/irmã, namorada/namorado, sogro/sogra, outro familiar)"],
    "p3_tipo_pergunta"
  );
}

// ============================================================
  // A PARTIR DAQUI COMEÇA O SWITCH(stage)
  // ============================================================
  switch (stage) {


// --------------------------------------------------
// 🧩 C1 — INÍCIO / RETOMADA
// --------------------------------------------------
case "inicio": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "inicio"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: inicio",
    details: {
      last_user_text: st.last_user_text || null,
      funil_status: st.funil_status || null,
      estado_civil: st.estado_civil || null,
      renda_total: st.renda_total_para_fluxo || null
    }
  });

  // 🔧 Normaliza texto para interpretar saudação / reset / etc.
  const nt = normalizeText(userText || "");

  // 🧼 Comando de reset / começar do zero
  const isResetCmd =
    nt === "reset" ||
    /\b(resetar|reset|comecar do zero|começar do zero|zerar tudo|começar tudo de novo|comecar tudo de novo)\b/.test(nt);

  // 👋 Saudações “da vida real”
  const saudacao = /(oi+|ola|opa|fala|eai|bom dia|boa tarde|boa noite)/.test(nt);

  // 🟢 Comandos de iniciar do zero / nova análise
  const iniciar =
    isResetCmd ||
    /\b(começar|comecar|nova analise|nova análise|nova simulacao|nova simulação|iniciar|do zero)\b/.test(nt);

  // ============================================================
  // (1) Começar do zero — reset explícito ou frases de início
  // ============================================================
  if (iniciar) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "inicio_programa",
      severity: "info",
      message: "Saindo da fase: inicio → inicio_programa (iniciar do zero / reset)",
      details: { userText }
    });

    // 🧨 ZERA estado no Supabase
    await resetTotal(env, st.wa_id);

    // 🔥 CORREÇÃO: recarrega estado LIMPINHO
    const novoSt = await getState(env, st.wa_id);

    // Inicia o programa corretamente
    return step(
      env,
      novoSt,
      [
        "Perfeito, limpamos tudo aqui pra você 👌",
        "Eu sou a Enova 😊, assistente do programa Minha Casa Minha Vida.",
        "Você já sabe como funciona o programa ou prefere que eu explique rapidinho antes?",
        "Me responde com *sim* (já sei) ou *não* (quero que explique)."
      ],
      "inicio_programa"
    );
  }

  // ============================================================
  // (2) Retomada — se já estava em outra fase antes
  // CORREÇÃO: impedir retomada indevida após reset / saudação
  // ============================================================
  if (
    st.fase_conversa &&
    st.fase_conversa !== "inicio" &&
    !iniciar &&
    !saudacao
  ) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "inicio_decisao",
      severity: "info",
      message: "Saindo da fase: inicio → inicio_decisao (retomada)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Oi! 👋",
        "Quer continuar de onde paramos ou prefere começar tudo do zero?",
        "Digite:\n1 — Continuar\n2 — Começar do zero"
      ],
      "inicio_decisao"
    );
  }

  // ============================================================
  // (3) Saudação normal
  // ============================================================
  if (saudacao) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "inicio_programa",
      severity: "info",
      message: "Saindo da fase: inicio → inicio_programa (saudação)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Oi! Tudo bem? 😊",
        "Eu sou a Enova, assistente do programa Minha Casa Minha Vida.",
        "Você já sabe como funciona o programa ou prefere que eu explique rapidinho antes?",
        "Me responde com *sim* (já sei) ou *não* (quero que explique)."
      ],
      "inicio_programa"
    );
  }

  // ============================================================
  // (4) Fallback — qualquer outra mensagem
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "inicio_programa",
    severity: "info",
    message: "Saindo da fase: inicio → inicio_programa (fallback/default)",
    details: { userText }
  });

  return step(
    env,
    st,
    [
      "Perfeito 👌",
      "Vamos começar certinho.",
      "Eu sou a Enova, assistente do programa Minha Casa Minha Vida.",
      "Você já sabe como funciona o programa ou prefere que eu explique rapidinho antes?",
      "Responde com *sim* (já sei) ou *não* (quero que explique)."
    ],
    "inicio_programa"
  );
}

// --------------------------------------------------
// 🧩 C1.0 — INÍCIO_DECISAO (cliente escolhe continuar ou recomeçar)
// --------------------------------------------------
case "inicio_decisao": {

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: inicio_decisao",
    details: {
      last_user_text: st.last_user_text || null,
      funil_status: st.funil_status || null
    }
  });

  const nt = normalizeText(userText || st.last_user_text || "");

  const opcao1 = /^(1|continuar|seguir|andar|prosseguir)$/i.test(nt);
  const opcao2 = /^(2|começar|comecar|do zero|reiniciar|reset)$/i.test(nt);

  // ❌ Cliente mandou algo nada a ver → pede novamente
  if (!opcao1 && !opcao2) {
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "inicio_decisao",
      severity: "info",
      message: "inicio_decisao: resposta inválida",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Só pra confirmar certinho… 😉",
        "Digite:\n1 — Continuar de onde paramos\n2 — Começar tudo do zero"
      ],
      "inicio_decisao"
    );
  }

  // 🟢 OPÇÃO 1 — Continuar
  if (opcao1) {
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: st.fase_conversa || "inicio_programa",
      severity: "info",
      message: "inicio_decisao: cliente escolheu continuar",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Perfeito! Vamos continuar de onde paramos 👍",
      ],
      st.fase_conversa || "inicio_programa"
    );
  }

  // 🔄 OPÇÃO 2 — Reset total
await funnelTelemetry(env, {
  wa_id: st.wa_id,
  event: "exit_stage",
  stage,
  next_stage: "inicio_programa",
  severity: "info",
  message: "inicio_decisao: cliente pediu reset",
  details: { userText }
});

await resetTotal(env, st.wa_id);

// 🔥 CORREÇÃO ABSOLUTA: recarrega estado limpo
const novoSt = await getState(env, st.wa_id);

return step(
  env,
  novoSt,
  [
    "Prontinho! Limpamos tudo e vamos começar do zero 👌",
    "Eu sou a Enova 😊, assistente do programa Minha Casa Minha Vida.",
    "Você já sabe como funciona o programa ou prefere que eu explique rapidinho antes?",
    "Me responde com *sim* (já sei) ou *não* (quero que explique)."
  ],
  "inicio_programa"
);
}

// --------------------------------------------------
// 🧩 C1.1 — INÍCIO_PROGRAMA (explica MCMV rápido)
// --------------------------------------------------
case "inicio_programa": {

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: inicio_programa",
    details: {
      last_user_text: st.last_user_text || null,
      funil_status: st.funil_status || null
    }
  });

  const nt = normalizeText(userText || st.last_user_text || "");
  // Exemplos cobertos: "já sei como funciona", "pode explicar rapidinho", "não entendi direito"

  // 🟢 DETECÇÃO DE "SIM"
  const sim = isYes(nt) ||
    nt.includes("ja sei") ||
    nt.includes("já sei") ||
    nt.includes("sei sim") ||
    nt.includes("tô ligado") ||
    nt.includes("to ligado") ||
    nt.includes("conheco") ||
    nt.includes("conheço") ||
    nt.includes("já conheço") ||
    nt.includes("ja conheco");

  // 🔴 DETECÇÃO DE "NÃO" — expandida para respostas educadas
  const nao =
    isNo(nt) ||
    nt.includes("nao sei") ||
    nt.includes("não sei") ||
    nt.includes("nao conheco") ||
    nt.includes("não conheço") ||
    nt.includes("não entendi") ||
    nt.includes("nao entendi") ||
    nt.includes("explica") ||
    nt.includes("me explica") ||
    nt.includes("pode explicar") ||
    nt.includes("como funciona") ||
    nt.includes("quero saber") ||
    nt.includes("quero que explique") ||
    nt.includes("manda de outro jeito") ||
    nt.includes("manda de outro jeitinho") ||
    nt.includes("explica de outro jeito") ||
    nt.includes("explica melhor") ||
    nt.includes("me ajuda a entender") ||
    nt.includes("não entendi direito");

  // 🔁 Resposta ambígua → NÃO repetir igual (nova mensagem)
  if (!sim && !nao) {
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "inicio_programa",
      severity: "info",
      message: "Resposta ambígua em inicio_programa — permanecendo",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Acho que posso ter entendido errado 🤔",
        "Só confirma pra mim rapidinho:",
        "Você *já sabe como funciona* o programa Minha Casa Minha Vida, ou prefere que eu te explique de forma bem simples?",
        "Responde com *sim* (já sei) ou *não* (quero que explique)."
      ],
      "inicio_programa"
    );
  }

  // ❌ NÃO conhece → explica
  if (nao) {
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "inicio_nome",
      severity: "info",
      message: "inicio_programa: cliente pediu explicação",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Perfeito, te explico rapidinho 😊",
        "O Minha Casa Minha Vida é o programa do governo que ajuda na entrada e reduz a parcela do financiamento, conforme a renda e a faixa de cada família.",
        "Eu vou analisar seu perfil e te mostrar exatamente quanto de subsídio você pode ter e como ficam as condições.",
        "Pra começarmos, qual o seu *nome completo*?"
      ],
      "inicio_nome"
    );
  }

  // ✅ JÁ CONHECE
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "inicio_nome",
    severity: "info",
    message: "inicio_programa: cliente já conhece o programa",
    details: { userText }
  });

  return step(
    env,
    st,
    [
      "Ótimo, então vamos direto ao ponto 😉",
      "Vou analisar sua situação pra ver quanto de subsídio você pode ter e como ficariam as condições.",
      "Pra começar, qual o seu *nome completo*?"
    ],
    "inicio_nome"
  );
}

// --------------------------------------------------
// 🧩 C1.2 — INICIO_NOME (pega e salva o nome)
// --------------------------------------------------
case "inicio_nome": {
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: inicio_nome",
    details: {
      last_user_text: st.last_user_text || null,
      funil_status: st.funil_status || null
    }
  });

  // Exemplos cobertos: "meu nome é Ana Maria", "sou João Pedro", "aqui é Carla Souza"
  // Texto bruto digitado pelo cliente
  let rawNome = (userText || "").trim();

  // Remove prefixos tipo "meu nome é", "sou o", etc.
  if (/^(meu nome e|meu nome é|me chamo|me chama|sou|sou o|sou a|aqui e|aqui é)/i.test(rawNome)) {
    rawNome = rawNome
      .replace(/^(meu nome e|meu nome é|me chamo|me chama|sou|sou o|sou a|aqui e|aqui é)\s*/i, "")
      .trim();
  }

  // Limpa aspas e pontuação forte nas pontas
  rawNome = rawNome.replace(/^[\"'\-–—\s]+|[\"'\-–—\s]+$/g, "").trim();

  // Se ainda ficou vazio ou muito curto, pede de novo
  if (!rawNome || rawNome.length < 2) {
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "inicio_nome",
      severity: "info",
      message: "inicio_nome: nome vazio ou muito curto",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Opa, acho que não peguei certinho seu nome completo 😅",
        "Me manda de novo, por favor, com *nome e sobrenome* (ex: Ana Silva)."
      ],
      "inicio_nome"
    );
  }

  // Quebra em palavras e faz validação simples
  const partes = rawNome.split(/\s+/).filter(p => p.length >= 2);

  // Se tiver muita coisa, provavelmente é frase e não nome
  if (partes.length < 1 || partes.length > 6) {
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "inicio_nome",
      severity: "info",
      message: "inicio_nome: resposta não parece um nome válido",
      details: { userText, rawNome, partes }
    });

    return step(
      env,
      st,
      [
        "Só pra ficar certinho aqui no sistema 😅",
        "Me manda seu *nome completo*, tipo: *Ana Silva*."
      ],
      "inicio_nome"
    );
  }

  const nomeCompleto = rawNome;
  const primeiroNome = partes[0];

  // 🔐 Salva o nome no Supabase (coluna `nome`)
  await upsertState(env, st.wa_id, {
    nome: nomeCompleto
    // se um dia criarmos coluna `primeiro_nome`, dá pra adicionar aqui também
    // primeiro_nome: primeiroNome
  });

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "inicio_nacionalidade",
    severity: "info",
    message: "inicio_nome: nome salvo e avançando para inicio_nacionalidade",
    details: {
      nome: nomeCompleto,
      primeiro_nome: primeiroNome
    }
  });

  return step(
    env,
    st,
    [
      `Ótimo, ${primeiroNome} 👌`,
      "Agora me diz: você é *brasileiro(a)* ou *estrangeiro(a)*?"
    ],
    "inicio_nacionalidade"
  );
}

// --------------------------------------------------
// 🧩 C2 — INÍCIO_NACIONALIDADE
// --------------------------------------------------
case "inicio_nacionalidade": {

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Fase: inicio_nacionalidade",
    details: { last_user_text: st.last_user_text }
  });

  const nt = normalizeText(userText || "");
  // Exemplos cobertos: "sou brasileira", "nasci no brasil", "sou estrangeiro"

  // -------------------------------------------
  // 🇧🇷 BRASILEIRO
  // -------------------------------------------
  if (/^(brasileiro|brasileiro mesmo|brasileira|brasileira mesmo|daqui mesmo|sou daqui mesmo|sou brasileiro|sou brasileiro mesmo|sou brasileira mesmo|sou brasileira|nascido no brasil|nascida no brasil|nasci no brasil)$/i.test(nt)) {

    await upsertState(env, st.wa_id, {
      nacionalidade: "brasileiro",
      fase_conversa: "estado_civil"
    });

    // 🔥 Atualiza estado em memória
    st.nacionalidade = "brasileiro";
    st.fase_conversa = "estado_civil";

    return step(
      env,
      st,
      [
        "Perfeito! 🇧🇷",
        "Vamos seguir… Qual é o seu estado civil?"
      ],
      "estado_civil"
    );
  }

  // -------------------------------------------
  // 🌎 ESTRANGEIRO
  // -------------------------------------------
  if (/^(estrangeiro|estrangeira|sou estrangeiro|sou estrangeira|gringo|nao sou brasileiro|não sou brasileiro)$/i.test(nt)) {

    await upsertState(env, st.wa_id, {
      nacionalidade: "estrangeiro",
      fase_conversa: "inicio_rnm"
    });

    // 🔥 Atualiza estado em memória
    st.nacionalidade = "estrangeiro";
    st.fase_conversa = "inicio_rnm";

    return step(
      env,
      st,
      [
        "Obrigado! 😊",
        "Você possui *RNM — Registro Nacional Migratório*?",
        "Responda: *sim* ou *não*."
      ],
      "inicio_rnm"
    );
  }

  // -------------------------------------------
  // ❓ Fallback
  // -------------------------------------------
  return step(
    env,
    st,
    [
      "Perdão 😅, não consegui entender.",
      "Você é *brasileiro* ou *estrangeiro*?"
    ],
    "inicio_nacionalidade"
  );
}

// --------------------------------------------------
// 🧩 C3 — INÍCIO_RNM (somente estrangeiro)
// --------------------------------------------------
case "inicio_rnm": {

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Fase: inicio_rnm",
    details: { last_user_text: st.last_user_text }
  });

  const nt = normalizeText(userText || "");

  // -------------------------------------------
  // ❌ 1) NÃO POSSUI RNM → ineligível
  // -------------------------------------------
  if (isNo(nt) || /^(nao|não|nao possuo|não possuo)$/i.test(nt)) {

    await upsertState(env, st.wa_id, {
      rnm_status: "não possui",
      funil_status: "ineligivel",
      fase_conversa: "fim_ineligivel"
    });

    // 🔥 Atualiza estado em memória
    st.rnm_status = "não possui";
    st.funil_status = "ineligivel";
    st.fase_conversa = "fim_ineligivel";

    return step(
      env,
      st,
      [
        "Entendi! 👀",
        "Para financiar pelo Minha Casa Minha Vida é obrigatório ter o *RNM com prazo de validade por tempo indeterminado*.",
        "Quando você tiver o RNM, posso te ajudar a fazer tudo certinho! 😊"
      ],
      "fim_ineligivel"
    );
  }

  // -------------------------------------------
  // ✅ 2) POSSUI RNM → perguntar tipo de validade
  // -------------------------------------------
  if (isYes(nt) || /^sim$/i.test(nt) || /\bsim\b/i.test(nt) || /\b(tenho|possuo|tenho sim|possuo sim)\b/i.test(nt)) {

    await upsertState(env, st.wa_id, {
      rnm_status: "possui",
      fase_conversa: "inicio_rnm_validade"
    });

    // 🔥 Atualiza estado em memória
    st.rnm_status = "possui";
    st.fase_conversa = "inicio_rnm_validade";

    return step(
      env,
      st,
      [
        "Perfeito! 🙌",
        "Seu RNM é *com validade* ou *indeterminado*?",
        "Responda: *valido* ou *indeterminado*."
      ],
      "inicio_rnm_validade"
    );
  }

  // -------------------------------------------
  // ❓ Fallback
  // -------------------------------------------
  return step(
    env,
    st,
    [
      "Só preciso confirmar 🙂",
      "Você possui *RNM*? Responda *sim* ou *não*."
    ],
    "inicio_rnm"
  );
}

// --------------------------------------------------
// 🧩 C4 — INÍCIO_RNM_VALIDADE
// --------------------------------------------------
case "inicio_rnm_validade": {

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Fase: inicio_rnm_validade",
    details: { last_user_text: st.last_user_text }
  });

  const nt = normalizeText(userText || "");

  // -------------------------------------------
  // ❌ RNM COM VALIDADE DEFINIDA → INELEGÍVEL
  // -------------------------------------------
  if (/^(valido|válido|com validade|definida)$/i.test(nt)) {

    await upsertState(env, st.wa_id, {
      rnm_validade: "definida",
      funil_status: "ineligivel",
      fase_conversa: "fim_ineligivel"
    });

    // 🔥 Atualiza estado em memória
    st.rnm_validade = "definida";
    st.funil_status = "ineligivel";
    st.fase_conversa = "fim_ineligivel";

    return step(
      env,
      st,
      [
        "Obrigado! 👌",
        "Com *RNM de validade definida*, infelizmente você não se enquadra no Minha Casa Minha Vida atualmente.",
        "Quando mudar para *indeterminado*, posso te ajudar imediatamente! 😊"
      ],
      "fim_ineligivel"
    );
  }

  // -------------------------------------------
  // ✅ RNM INDETERMINADO → CONTINUA O FLUXO
  // -------------------------------------------
  if (/\bindeterminado\b/i.test(nt)) {

    await upsertState(env, st.wa_id, {
      rnm_validade: "indeterminado",
      fase_conversa: "estado_civil"
    });

    // 🔥 Atualiza memória
    st.rnm_validade = "indeterminado";
    st.fase_conversa = "estado_civil";

    return step(
      env,
      st,
      [
        "Ótimo! Vamos seguir então 😊",
        "Qual é o seu estado civil?"
      ],
      "estado_civil"
    );
  }

  // -------------------------------------------
  // ❓ Fallback
  // -------------------------------------------
  return step(
    env,
    st,
    [
      "Só preciso confirmar rapidinho 🙂",
      "Seu RNM possui prazo de validade com data definida ou por prazo *indeterminado* de validade?",
      "Responda apenas: 👉 *com validade* ou *indeterminado*"
    ],
    "inicio_rnm_validade"
  );
}

// --------------------------------------------------
// 🧩 C5 — ESTADO CIVIL
// --------------------------------------------------
case "estado_civil": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "estado_civil"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: estado_civil",
    details: {
      last_user_text: st.last_user_text || null,
      funil_status: st.funil_status || null,
      renda_total: st.renda_total_para_fluxo || null,
      estado_civil_atual: st.estado_civil || null
    }
  });

  const estadoCivil = parseEstadoCivil(t);
  // Exemplos cobertos: "casada no civil", "moro junto", "sou divorciado", "viúva"
  const solteiro = estadoCivil === "solteiro";
  const casado = estadoCivil === "casado";
  const uniao = estadoCivil === "uniao_estavel";
  const separado = estadoCivil === "separado";
  const divorciado = estadoCivil === "divorciado";
  const viuvo = estadoCivil === "viuvo";

  // --------- SOLTEIRO ---------
  if (solteiro) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "somar_renda_solteiro",
      severity: "info",
      message: "Saindo da fase: estado_civil → somar_renda_solteiro (solteiro)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, {
      estado_civil: "solteiro",
      solteiro_sozinho: true,
      financiamento_conjunto: false,
      somar_renda: false
    });

    return step(
      env,
      st,
      [
        "Perfeito 👌",
        "E sobre renda… você pretende usar **só sua renda**, ou quer considerar **parceiro(a)** ou **familiar**?"
      ],
      "somar_renda_solteiro"
    );
  }

  // --------- CASADO ---------
  if (casado) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "confirmar_casamento",
      severity: "info",
      message: "Saindo da fase: estado_civil → confirmar_casamento (casado)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, {
      estado_civil: "casado",
      solteiro_sozinho: false
    });

    return step(
      env,
      st,
      [
        "Entendi! 👍",
        "Seu casamento é **civil no papel** ou vocês vivem como **união estável**?"
      ],
      "confirmar_casamento"
    );
  }

  // --------- UNIÃO ESTÁVEL ---------
  if (uniao) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "financiamento_conjunto",
      severity: "info",
      message: "Saindo da fase: estado_civil → financiamento_conjunto (união estável)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, {
      estado_civil: "uniao_estavel"
    });

    return step(
      env,
      st,
      [
        "Perfeito! ✍️",
        "Vocês querem **comprar juntos**, só você, ou **apenas se precisar**?"
      ],
      "financiamento_conjunto"
    );
  }

  // --------- SEPARADO ---------
  if (separado) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "verificar_averbacao",
      severity: "info",
      message: "Saindo da fase: estado_civil → verificar_averbacao (separado)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, {
      estado_civil: "separado"
    });

    return step(
      env,
      st,
      [
        "Entendi 👍",
        "Sua separação está **averbada no documento** (RG/Certidão)?"
      ],
      "verificar_averbacao"
    );
  }

  // --------- DIVORCIADO ---------
  if (divorciado) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "verificar_averbacao",
      severity: "info",
      message: "Saindo da fase: estado_civil → verificar_averbacao (divorciado)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, {
      estado_civil: "divorciado"
    });

    return step(
      env,
      st,
      [
        "Perfeito 👌",
        "Seu divórcio está **averbado no documento**?"
      ],
      "verificar_averbacao"
    );
  }

  // --------- VIÚVO ---------
  if (viuvo) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "verificar_inventario",
      severity: "info",
      message: "Saindo da fase: estado_civil → verificar_inventario (viúvo)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, {
      estado_civil: "viuvo"
    });

    return step(
      env,
      st,
      [
        "Entendi, sinto muito pela sua perda 💛",
        "Pra eu montar certinho sua lista de documentos: você já tem a *certidão de óbito* do(a) ex-cônjuge e a *certidão de casamento* já *averbada com o óbito*?"
      ],
      "verificar_inventario"
    );
  }

  // --------- NÃO ENTENDIDO ---------

  // 🟩 EXIT_STAGE (fallback permanece na mesma fase)
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "estado_civil",
    severity: "info",
    message: "Saindo da fase: estado_civil → estado_civil (fallback)",
    details: { userText }
  });

  return step(
    env,
    st,
    [
      "Acho que não entendi certinho 🤔",
      "Me diga seu *estado civil*: solteiro(a), casado(a), união estável, separado(a), divorciado(a) ou viúvo(a)?"
    ],
    "estado_civil"
  );
}

// --------------------------------------------------
// 🧩 C6 — CONFIRMAR CASAMENTO (civil ou união estável)
// --------------------------------------------------
case "confirmar_casamento": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "confirmar_casamento"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: confirmar_casamento",
    details: {
      last_user_text: st.last_user_text || null,
      estado_civil: st.estado_civil || null,
      funil_status: st.funil_status || null
    }
  });

  const estadoCivilDetectado = parseEstadoCivil(t);
  // Exemplos cobertos: "casada no papel", "casamento civil", "união estável", "moro junto"

  const tBase = t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const respostaAmbigua =
  /\b(nao\s+sei|n\s*sei|talvez)\b/i.test(tBase) ||
  /\b(n.o\s+sei)\b/i.test(tBase); // cobre "n?o sei" com caractere quebrado

  // ✅ Aceita texto livre + sim/não curto
  const respondeuSim = isYes(t); // "sim" => confirma civil no papel
  const respondeuNao = !respostaAmbigua && isNo(t);  // "não" => trata como união estável

  const civil =
    respondeuSim ||
    /(civil|no papel|casamento civil|casad[ao] no papel|civil no papel|casad[ao] no civil|papel passado)/i.test(t);

  const uniao_estavel =
    respondeuNao ||
    estadoCivilDetectado === "uniao_estavel" ||
    /(uni[aã]o est[áa]vel|estavel|vivemos juntos|moramos juntos|moro junto|junt[oa]s?)/i.test(t);

  // ===== CASAMENTO CIVIL NO PAPEL =====
  if (civil) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho",
      severity: "info",
      message: "Saindo da fase: confirmar_casamento → regime_trabalho (civil no papel confirmado)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, {
      casamento_formal: "civil_papel",
      financiamento_conjunto: true,
      somar_renda: true
    });

    return step(
      env,
      st,
      [
        "Perfeito! 📄",
        "Então seguimos com vocês **juntos no financiamento**.",
        "Mesmo que só um tenha renda, o processo continua em conjunto e a documentação final será dos dois.",
        "Agora me fale seu **tipo de trabalho** (CLT, autônomo(a) ou servidor(a))."
      ],
      "regime_trabalho"
    );
  }

  // ===== UNIÃO ESTÁVEL (sem papel) =====
  if (uniao_estavel) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "financiamento_conjunto",
      severity: "info",
      message: "Saindo da fase: confirmar_casamento → financiamento_conjunto (união estável)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, {
      casamento_formal: "uniao_estavel",
      estado_civil: "uniao_estavel"
    });

    return step(
      env,
      st,
      [
        "Perfeito! ✍️",
        "Nesse caso, vocês pretendem **comprar juntos**, só você, ou **apenas se precisar**?"
      ],
      "financiamento_conjunto"
    );
  }

  // ===== NÃO ENTENDIDO =====

  // 🟩 EXIT_STAGE (fallback na mesma fase)
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "confirmar_casamento",
    severity: "info",
    message: "Saindo da fase: confirmar_casamento → confirmar_casamento (fallback)",
    details: { userText }
  });

  return step(
    env,
    st,
    [
      "Me confirma rapidinho 😊",
      "É **casamento civil no papel** ou **união estável**?",
      "Se preferir, pode responder só: **sim** (civil) ou **não** (união estável)."
    ],
    "confirmar_casamento"
  );
}
      
// --------------------------------------------------
// 🧩 C7 — FINANCIAMENTO CONJUNTO (casado / união estável)
// --------------------------------------------------
case "financiamento_conjunto": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "financiamento_conjunto"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: financiamento_conjunto",
    details: {
      last_user_text: st.last_user_text || null,
      estado_civil: st.estado_civil || null,
      funil_status: st.funil_status || null,
      financiamento_conjunto: st.financiamento_conjunto || null
    }
  });

  // Exemplos cobertos: "vamos comprar juntos", "só eu", "apenas se faltar renda"
  const somente_se_precisar = /(se precisar|s[oó] se precisar|apenas se precisar|se faltar a gente soma|s[oó] se faltar)/i.test(t);
  const nao = !somente_se_precisar && (isNo(t) || /(n[aã]o|s[oó] eu|apenas eu|somente eu|sozinh[oa])/i.test(t));
  const sim = !somente_se_precisar && !nao && (isYes(t) || /(sim|isso|claro|vamos juntos|comprar juntos|juntos|somar renda com (minha|meu)|com minha esposa|com meu marido)/i.test(t));

  // =================== JUNTOS ===================
  if (sim) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho",
      severity: "info",
      message: "Saindo da fase: financiamento_conjunto → regime_trabalho (juntos)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, {
      financiamento_conjunto: true,
      somar_renda: true
    });

    return step(
      env,
      st,
      [
        "Perfeito! 👏",
        "Então vamos considerar a renda de vocês dois.",
        "Primeiro, me fala sobre **você**: trabalha com carteira assinada (CLT), é autônomo(a) ou servidor(a)?"
      ],
      "regime_trabalho"
    );
  }

  // =================== SÓ O TITULAR ===================
  if (nao) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho",
      severity: "info",
      message: "Saindo da fase: financiamento_conjunto → regime_trabalho (só o titular)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, {
      financiamento_conjunto: false,
      somar_renda: false
    });

    return step(
      env,
      st,
      [
        "Perfeito 👍",
        "Então seguimos só com a sua renda.",
        "Qual é o seu **tipo de trabalho**? CLT, autônomo(a) ou servidor(a)?"
      ],
      "regime_trabalho"
    );
  }

  // =================== APENAS SE PRECISAR ===================
  if (somente_se_precisar) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho",
      severity: "info",
      message: "Saindo da fase: financiamento_conjunto → regime_trabalho (se precisar)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, {
      financiamento_conjunto: "se_precisar"
    });

    return step(
      env,
      st,
      [
        "Sem problema! 😊",
        "Vamos começar analisando **só a sua renda**.",
        "Qual é o seu **tipo de trabalho**? CLT, autônomo(a) ou servidor(a)?"
      ],
      "regime_trabalho"
    );
  }

  // =================== NÃO ENTENDIDO ===================

  // 🟩 EXIT_STAGE (permanece na mesma fase)
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "financiamento_conjunto",
    severity: "info",
    message: "Saindo da fase: financiamento_conjunto → financiamento_conjunto (fallback)",
    details: { userText }
  });

  return step(
    env,
    st,
    [
      "Só pra confirmar 😊",
      "Vocês querem **comprar juntos**, só você, ou **apenas se precisar**?"
    ],
    "financiamento_conjunto"
  );
}

// =========================================================
// C8 — PARCEIRO TEM RENDA
// =========================================================
case "parceiro_tem_renda": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "parceiro_tem_renda"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: parceiro_tem_renda",
    details: {
      last_user_text: st.last_user_text || null,
      funil_status: st.funil_status || null,
      estado_civil: st.estado_civil || null,
      somar_renda: st.somar_renda || null
    }
  });

  // Exemplos cobertos: "ele trabalha", "não tem renda", "só eu trabalho"
  const tParceiroBase = String(t || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const nao =
  isNo(t) ||
  /\b(nao|nao tem|sem renda|desempregad[oa]|do lar|nao trabalha|s[oó]\s+eu\s+trabalho|apenas eu trabalho|so eu trabalho)\b/i.test(tParceiroBase) ||
  /\b(ele|ela)\s+(nao\s+trabalha|nao\s+tem\s+renda|esta\s+desempregad[oa])\b/i.test(tParceiroBase);

const sim =
  !nao && (
    isYes(t) ||
    /\b(sim|tem sim|possui|possui renda|ganha|trabalha|tem renda)\b/i.test(tParceiroBase) ||
    /\b(ele|ela)\s+(trabalha|tem renda|ganha)\b/i.test(tParceiroBase) ||
    /\b(ele|ela)\s+e\s+(clt|autonom[oa]|servidor[oa]?|mei|registrad[oa])\b/i.test(tParceiroBase) ||
    /\b(clt|autonom[oa]|servidor[oa]?|mei)\b/i.test(tParceiroBase)
  );

  // -----------------------------
  // PARCEIRO TEM RENDA
  // -----------------------------
  if (sim) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho_parceiro",
      severity: "info",
      message: "Saindo da fase: parceiro_tem_renda → regime_trabalho_parceiro (parceiro tem renda)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, {
      parceiro_tem_renda: true,
      somar_renda: true
    });

    return step(
      env,
      st,
      [
        "Perfeito! 👍",
        "Então vamos incluir a renda dele(a).",
        "Me diga qual é o **tipo de trabalho** do parceiro(a): CLT, autônomo(a) ou servidor(a)?"
      ],
      "regime_trabalho_parceiro"
    );
  }

  // -----------------------------
  // PARCEIRO NÃO TEM RENDA
  // -----------------------------
  if (nao) {

  const titularTemDadosBasicos = Boolean((st.regime || st.regime_trabalho) && Number(st.renda || 0) > 0);
  const nextStage = titularTemDadosBasicos ? "ctps_36" : "regime_trabalho";

  // 🟩 EXIT_STAGE
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: nextStage,
    severity: "info",
    message: "Saindo da fase: parceiro_tem_renda (parceiro sem renda, fluxo conjunto mantido)",
    details: {
      userText,
      titular_tem_dados_basicos: titularTemDadosBasicos,
      financiamento_conjunto_mantido: true
    }
  });

  await upsertState(env, st.wa_id, {
    parceiro_tem_renda: false,
    somar_renda: true,
    financiamento_conjunto: true
  });

  if (titularTemDadosBasicos) {
    return step(
      env,
      st,
      [
        "Perfeito, entendi 👍",
        "Sem problema — no financiamento em conjunto pode seguir mesmo se só um dos dois tiver renda.",
        "Vou seguir com a renda de quem trabalha, e no final a documentação continua dos dois, combinado?",
        "Agora me confirma:",
        "Você tem **36 meses de carteira assinada (CTPS)** nos últimos 3 anos?"
      ],
      "ctps_36"
    );
  }

  return step(
    env,
    st,
    [
      "Perfeito, entendi 👍",
      "Sem problema — no financiamento em conjunto pode seguir mesmo se só um dos dois tiver renda.",
      "Me diga o seu **tipo de trabalho**: CLT, autônomo(a) ou servidor(a)?"
    ],
    "regime_trabalho"
  );
}

  // -----------------------------
  // NÃO ENTENDIDO
  // -----------------------------

  // 🟩 EXIT_STAGE (permanece na mesma fase)
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "parceiro_tem_renda",
    severity: "info",
    message: "Saindo da fase: parceiro_tem_renda → parceiro_tem_renda (fallback)",
    details: { userText }
  });

  return step(
    env,
    st,
    [
      "Só pra eu entender certinho 😊",
      "Seu parceiro(a) **tem renda** ou **não tem renda**?"
    ],
    "parceiro_tem_renda"
  );
}

case "somar_renda_solteiro": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "somar_renda_solteiro"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: somar_renda_solteiro",
    details: {
      last_user_text: st.last_user_text || null,
      funil_status: st.funil_status || null,
      estado_civil: st.estado_civil || null,
      renda_total: st.renda_total_para_fluxo || null
    }
  });

  const t = userText.trim();

  // Exemplos cobertos: "só eu", "somar com meu marido", "somar com minha mãe"

  // Versão simplificada (sem acento/ruído) para regex mais robusto
  const tBase = t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const sozinho =
  /\b(so|somente|apenas)\s+(minha\s+renda|minha|eu)\b/i.test(tBase) ||
  /\b(sozinha|sozinho)\b/i.test(tBase) ||
  /\b(quero\s+seguir\s+)?so\s+com\s+(a\s+)?minha\s+renda\b/i.test(tBase) ||
  /\bso\s+a\s+minha\b/i.test(tBase) ||
  /\bso\s+minha\b/i.test(tBase) ||
  /\bs[oó]\s+com\s+a?\s*minha\b/i.test(t) ||
  /\bs[oó]\s+eu\b/i.test(t) ||
  /\bapenas\s+eu\b/i.test(tBase) ||
  isNo(tBase);
  
  const parceiro =
    /quero\s+somar\s+renda\s*$/i.test(tBase) ||
    /(parceiro|parceira|conjuge|marido|esposa|esposo|meu namorado|minha namorada)/i.test(tBase) ||
    /(somar com meu parceiro|somar com minha parceira|somar com meu conjuge)/i.test(tBase);

  const tBaseClean = tBase.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  const familiar =
  /\b(familiar|familia)\b/i.test(tBaseClean) ||

  // parentesco direto (mesmo se o termo vier sozinho)
  /\b(pai|mae|irma|irmao|tio|tia|avo|avoh|vo|vovo)\b/i.test(tBaseClean) ||

  // intenção de composição com alguém da família (robusto contra ruído no meio)
  /\bcom\s+(meu|minha)\b/i.test(tBaseClean) &&
  !/\b(namorad|parceir|conjuge|espos[oa])\b/i.test(tBaseClean);

  // -----------------------------
  // QUER FICAR SÓ COM A PRÓPRIA RENDA
  // -----------------------------
  if (sozinho) {

    // Renda total já calculada para o fluxo (solo)
    const rendaTotalRaw =
      st.renda_total_para_fluxo != null ? st.renda_total_para_fluxo : null;
    let rendaTotal = 0;

    if (typeof rendaTotalRaw === "number") {
      rendaTotal = rendaTotalRaw;
    } else if (typeof rendaTotalRaw === "string") {
      const cleaned = rendaTotalRaw
        .replace(/[^\d,.,,]/g, "")
        .replace(",", ".");
      const parsed = parseFloat(cleaned);
      if (!Number.isNaN(parsed)) {
        rendaTotal = parsed;
      }
    }

    // 🔥 Gatilho de inelegibilidade: renda baixa sozinho (≤ 2.380) sem composição
    if (rendaTotal > 0 && rendaTotal <= 2380) {
      await upsertState(env, st.wa_id, {
        somar_renda: false,
        financiamento_conjunto: false,
        renda_familiar: false,
        motivo_ineligivel: "renda_baixa_sem_composicao",
        funil_status: "ineligivel"
      });

      await funnelTelemetry(env, {
        wa_id: st.wa_id,
        event: "exit_stage",
        stage,
        next_stage: "fim_ineligivel",
        severity: "warning",
        message:
          "Saindo da fase: somar_renda_solteiro → fim_ineligivel (renda baixa sem composição)",
        details: {
          userText,
          userText_normalized: t,
          renda_total_para_fluxo: rendaTotalRaw,
          renda_total_normalizada: rendaTotal
        }
      });

      return step(
        env,
        st,
        [
          "Entendi 👍",
          "Pela renda que você me informou, sozinho(a) hoje não fecha aprovação dentro do Minha Casa Minha Vida.",
          "Vou te explicar certinho o que isso significa e como você pode resolver, se quiser."
        ],
        "fim_ineligivel"
      );
    }

    // Fluxo original: renda acima de 2.380 ou valor não definido
    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho",
      severity: "info",
      message:
        "Saindo da fase: somar_renda_solteiro → regime_trabalho (solo)",
      details: { userText, userText_normalized: t }
    });

    await upsertState(env, st.wa_id, {
      somar_renda: false,
      financiamento_conjunto: false,
      renda_familiar: false
    });

    return step(
      env,
      st,
      [
        "Perfeito 👌",
        "Então seguimos só com a sua renda.",
        "Qual é o seu **tipo de trabalho**? CLT, autônomo(a) ou servidor(a)?"
      ],
      "regime_trabalho"
    );
  }

  // -----------------------------
  // QUER SOMAR COM PARCEIRO(A)
  // -----------------------------
  if (parceiro) {

  // Personaliza o termo exibido conforme o texto do cliente
  const parceiroLabel =
    /\bminha\s+namorada\b/i.test(tBaseClean) ? "sua namorada" :
    /\bmeu\s+namorado\b/i.test(tBaseClean) ? "seu namorado" :
    /\bminha\s+esposa\b/i.test(tBaseClean) ? "sua esposa" :
    /\bmeu\s+marido\b/i.test(tBaseClean) ? "seu marido" :
    /\bminha\s+parceira\b/i.test(tBaseClean) ? "sua parceira" :
    /\bmeu\s+parceiro\b/i.test(tBaseClean) ? "seu parceiro" :
    "seu parceiro(a)";

  // 🟩 EXIT_STAGE
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "regime_trabalho_parceiro",
    severity: "info",
    message:
      "Saindo da fase: somar_renda_solteiro → regime_trabalho_parceiro (parceiro)",
    details: { userText, userText_normalized: t }
  });

  await upsertState(env, st.wa_id, {
    somar_renda: true,
    financiamento_conjunto: true,
    renda_familiar: false
  });

  return step(
    env,
    st,
    [
      "Perfeito! 🙌",
      `Vamos incluir a renda de ${parceiroLabel}.`,
      `${parceiroLabel.charAt(0).toUpperCase() + parceiroLabel.slice(1)} é CLT, autônomo(a) ou servidor(a)?`
    ],
    "regime_trabalho_parceiro"
  );
}
  
  // -----------------------------
  // QUER SOMAR COM FAMILIAR
  // -----------------------------
    if (familiar) {

    const base = String(t || userText || "").toLowerCase();

    const famMae = /\b(mae|minha mae)\b/.test(base);
    const famPai = /\b(pai|meu pai)\b/.test(base);

    if (famMae || famPai) {
      const familiarTipo = famMae ? "mae" : "pai";

      // 🟩 EXIT_STAGE
      await funnelTelemetry(env, {
        wa_id: st.wa_id,
        event: "exit_stage",
        stage,
        next_stage: "pais_casados_civil_pergunta",
        severity: "info",
        message:
          "Saindo da fase: somar_renda_solteiro → pais_casados_civil_pergunta (familiar_tipo detectado)",
        details: { userText, userText_normalized: t, familiar_tipo: familiarTipo }
      });

      await upsertState(env, st.wa_id, {
        somar_renda: true,
        financiamento_conjunto: false,
        renda_familiar: true,
        familiar_tipo: familiarTipo,
        p3_required: false,
        p3_done: false,
        p3_tipo: null
      });

      return step(
        env,
        st,
        [
          "Show! 👍",
          "Seus pais são casados no civil atualmente? (sim/não)"
        ],
        "pais_casados_civil_pergunta"
      );
    }

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "somar_renda_familiar",
      severity: "info",
      message:
        "Saindo da fase: somar_renda_solteiro → somar_renda_familiar (familiar - sem tipo detectado)",
      details: { userText, userText_normalized: t }
    });

    await upsertState(env, st.wa_id, {
      somar_renda: true,
      financiamento_conjunto: false,
      renda_familiar: true
    });

    return step(
      env,
      st,
      [
        "Show! 👍",
        "Qual familiar deseja considerar? Pai, mãe, irmão(ã), avô(ó), tio(a)…?"
      ],
      "somar_renda_familiar"
    );
  }

  // -----------------------------
  // NÃO ENTENDIDO
  // -----------------------------

  // 🟩 EXIT_STAGE
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "somar_renda_solteiro",
    severity: "info",
    message:
      "Saindo da fase: somar_renda_solteiro → somar_renda_solteiro (fallback)",
    details: { userText, userText_normalized: t }
  });

  return step(
    env,
    st,
    [
      "Só pra eu entender certinho 😊",
      "Você pretende usar **só sua renda**, somar com **parceiro(a)**, ou somar com **familiar**?"
    ],
    "somar_renda_solteiro"
  );
}
      
// =========================================================
// C10 — SOMAR RENDA FAMILIAR
// =========================================================
case "somar_renda_familiar": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "somar_renda_familiar"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: somar_renda_familiar",
    details: {
      last_user_text: st.last_user_text || null,
      funil_status: st.funil_status || null,
      renda_familiar: st.renda_familiar || null
    }
  });

// --------------------------------------------------
// NORMALIZAÇÃO LOCAL (robusta para acento/encoding)
// --------------------------------------------------
// prioridade: texto atual da mensagem -> fallbacks de estado
const rawInput =
  String(
    userText ??
    st?.last_user_text ??
    st?.user_text ??
    ""
  );

const txtBase = rawInput.toLowerCase().trim();

// Remove acentos e normaliza caracteres estranhos
const txt = txtBase
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^\w\s]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

// DEBUG TEMPORÁRIO (remover depois)
await funnelTelemetry(env, {
  wa_id: st.wa_id,
  event: "debug",
  stage,
  severity: "info",
  message: "DEBUG somar_renda_familiar input",
  details: {
    rawInput,
    txtBase,
    txt
  }
});

  // --------------------------------------------------
  // MATCHES (com variações comuns)
  // --------------------------------------------------
  const mae = /\b(mae|minha mae)\b/i.test(txt);
  const pai = /\b(pai|meu pai)\b/i.test(txt);
  const avo = /\b(avo|avos|vo|vos|vovo|vovos)\b/i.test(txt);
  const tio = /\b(tio|tia)\b/i.test(txt);
  const irmao = /\b(irmao|irmaos|irma|minha irma|meu irmao)\b/i.test(txt);
  const primo = /\b(primo|prima)\b/i.test(txt);
  const qualquer = /\b(familia|familiar|qualquer)\b/i.test(txt);

  // --------------------------------------------------
  // MÃE
  // --------------------------------------------------
  if (mae) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "pais_casados_civil_pergunta",
      severity: "info",
      message: "Saindo da fase: somar_renda_familiar → pais_casados_civil_pergunta (mae)",
      details: { userText, txt }
    });

    await upsertState(env, st.wa_id, { familiar_tipo: "mae", p3_required: false, p3_done: false, p3_tipo: null });

    return step(
      env,
      st,
      [
        "Seus pais são casados no civil atualmente? (sim/não)"
      ],
      "pais_casados_civil_pergunta"
    );
  }

  // --------------------------------------------------
  // PAI
  // --------------------------------------------------
  if (pai) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "pais_casados_civil_pergunta",
      severity: "info",
      message: "Saindo da fase: somar_renda_familiar → pais_casados_civil_pergunta (pai)",
      details: { userText, txt }
    });

    await upsertState(env, st.wa_id, { familiar_tipo: "pai", p3_required: false, p3_done: false, p3_tipo: null });

    return step(
      env,
      st,
      [
        "Seus pais são casados no civil atualmente? (sim/não)"
      ],
      "pais_casados_civil_pergunta"
    );
  }

  // --------------------------------------------------
  // AVÔ / AVÓ
  // --------------------------------------------------
  if (avo) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "confirmar_avo_familiar",
      severity: "info",
      message: "Saindo da fase: somar_renda_familiar → confirmar_avo_familiar (avo/avo)",
      details: { userText, txt }
    });

    await upsertState(env, st.wa_id, { familiar_tipo: "avo" });

    return step(
      env,
      st,
      [
        "Entendi! 👌",
        "Só me confirma uma coisinha…",
        "**Seu avô/avó recebe aposentadoria rural, urbana ou outro tipo de benefício?**"
      ],
      "confirmar_avo_familiar"
    );
  }

  // --------------------------------------------------
  // TIO / TIA
  // --------------------------------------------------
  if (tio) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho_parceiro_familiar",
      severity: "info",
      message: "Saindo da fase: somar_renda_familiar → regime_trabalho_parceiro_familiar (tio/tia)",
      details: { userText, txt }
    });

    await upsertState(env, st.wa_id, { familiar_tipo: "tio" });

    return step(
      env,
      st,
      [
        "Certo! 👍",
        "Seu tio(a) trabalha com **carteira assinada**, é **autônomo(a)** ou **servidor(a)**?"
      ],
      "regime_trabalho_parceiro_familiar"
    );
  }

  // --------------------------------------------------
  // IRMÃO / IRMÃ
  // --------------------------------------------------
  if (irmao) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho_parceiro_familiar",
      severity: "info",
      message: "Saindo da fase: somar_renda_familiar → regime_trabalho_parceiro_familiar (irmao/irma)",
      details: { userText, txt }
    });

    await upsertState(env, st.wa_id, { familiar_tipo: "irmao" });

    return step(
      env,
      st,
      [
        "Perfeito! 👌",
        "Seu irmão(ã) é **CLT**, **autônomo(a)** ou **servidor(a)**?"
      ],
      "regime_trabalho_parceiro_familiar"
    );
  }

  // --------------------------------------------------
  // PRIMO / PRIMA
  // --------------------------------------------------
  if (primo) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho_parceiro_familiar",
      severity: "info",
      message: "Saindo da fase: somar_renda_familiar → regime_trabalho_parceiro_familiar (primo/prima)",
      details: { userText, txt }
    });

    await upsertState(env, st.wa_id, { familiar_tipo: "primo" });

    return step(
      env,
      st,
      [
        "Entendi 👍",
        "Seu primo(a) é **CLT**, **autônomo(a)** ou **servidor(a)**?"
      ],
      "regime_trabalho_parceiro_familiar"
    );
  }

  // --------------------------------------------------
  // QUALQUER FAMILIAR / NÃO ESPECIFICADO
  // --------------------------------------------------
  if (qualquer) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho_parceiro_familiar",
      severity: "info",
      message: "Saindo da fase: somar_renda_familiar → regime_trabalho_parceiro_familiar (familiar generico)",
      details: { userText, txt }
    });

    await upsertState(env, st.wa_id, { familiar_tipo: "nao_especificado" });

    return step(
      env,
      st,
      [
        "Sem problema 😊",
        "Esse familiar é **CLT**, **autônomo(a)** ou **servidor(a)**?"
      ],
      "regime_trabalho_parceiro_familiar"
    );
  }

  // --------------------------------------------------
  // NÃO ENTENDIDO
  // --------------------------------------------------

  // 🟩 EXIT_STAGE (permanece na mesma fase)
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "somar_renda_familiar",
    severity: "info",
    message: "Saindo da fase: somar_renda_familiar → somar_renda_familiar (fallback)",
    details: { userText, txt }
  });

  return step(
    env,
    st,
    [
      "Perfeito, só me diga qual familiar você quer considerar:",
      "**Pai, mãe, irmão(ã), avô(ó), tio(a), primo(a)**…"
    ],
    "somar_renda_familiar"
  );
}

// =========================================================
// C10B — PAIS CASADOS NO CIVIL?
// =========================================================
case "pais_casados_civil_pergunta": {
  const nt = normalizeText(userText || "").trim();
  const sim = isYes(nt) || /^sim$/i.test(nt);
  const nao = isNo(nt) || /^n[aã]o(\s+(sei|tenho))?$/i.test(nt);

  if (!sim && !nao) {
    return step(
      env,
      st,
      [
        "Só pra confirmar 😊",
        "Seus pais são casados no civil atualmente? (sim/não)"
      ],
      "pais_casados_civil_pergunta"
    );
  }

  const fam = normalizeText(st.familiar_tipo || "");
  if (sim) {
    const p3TipoDefinido = fam === "mae" ? "pai" : "mae";
    st.p3_required = true;
    st.p3_done = false;
    st.p3_tipo = p3TipoDefinido;
    await upsertState(env, st.wa_id, {
      p3_required: true,
      p3_done: false,
      p3_tipo: p3TipoDefinido
    });
  } else {
    st.p3_required = false;
    st.p3_done = false;
    await upsertState(env, st.wa_id, {
      p3_required: false,
      p3_done: false
    });
  }

  return step(
    env,
    st,
    [
      "Perfeito 👌",
      fam === "mae"
        ? "Sua mãe trabalha com **carteira assinada**, é **autônoma** ou **servidora**?"
        : "Seu pai trabalha com **carteira assinada**, é **autônomo** ou **servidor**?"
    ],
    "regime_trabalho_parceiro_familiar"
  );
}

// =========================================================
// C11 — CONFIRMAR AVO FAMILIAR
// =========================================================
case "confirmar_avo_familiar": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "confirmar_avo_familiar"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: confirmar_avo_familiar",
    details: {
      last_user_text: st.last_user_text || null,
      familiar_tipo: st.familiar_tipo || null,
      funil_status: st.funil_status || null
    }
  });

  const rural = /(rural|aposentadoria rural|atividade rural)/i.test(t);
  const urbana = /(urbana|aposentadoria urbana|inss urbano|inss)/i.test(t);
  const outros = /(bpc|loas|pensi[aã]o|aux[ií]lio|benef[ií]cio)/i.test(t);
  const nao_sabe = /(n[aã]o sei|nao sei|não lembro|não tenho certeza|talvez)/i.test(t);

  // --------------------------------------------------
  // APOSENTADORIA RURAL
  // --------------------------------------------------
  if (rural) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho_parceiro_familiar",
      severity: "info",
      message: "Saindo da fase: confirmar_avo_familiar → regime_trabalho_parceiro_familiar (benefício rural)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, {
      avo_beneficio: "rural"
    });

    return step(
      env,
      st,
      [
        "Perfeito 👌",
        "Então vamos considerar a renda da aposentadoria rural.",
        "Agora me fala: esse familiar é **CLT**, **autônomo(a)** ou **servidor(a)**? Ou só recebe o benefício?"
      ],
      "regime_trabalho_parceiro_familiar"
    );
  }

  // --------------------------------------------------
  // APOSENTADORIA URBANA
  // --------------------------------------------------
  if (urbana) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho_parceiro_familiar",
      severity: "info",
      message: "Saindo da fase: confirmar_avo_familiar → regime_trabalho_parceiro_familiar (benefício urbano)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, {
      avo_beneficio: "urbana"
    });

    return step(
      env,
      st,
      [
        "Perfeito! 👍",
        "Então vamos considerar a aposentadoria urbana.",
        "E sobre atividade atual… esse familiar trabalha (CLT/autônomo/servidor) ou só recebe o benefício?"
      ],
      "regime_trabalho_parceiro_familiar"
    );
  }

  // --------------------------------------------------
  // OUTROS BENEFÍCIOS (BPC/LOAS/PENSÃO/AUXÍLIO)
  // --------------------------------------------------
  if (outros) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho_parceiro_familiar",
      severity: "info",
      message: "Saindo da fase: confirmar_avo_familiar → regime_trabalho_parceiro_familiar (outro benefício)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, {
      avo_beneficio: "outro_beneficio"
    });

    return step(
      env,
      st,
      [
        "Entendi 👌",
        "Vamos considerar o benefício informado.",
        "Esse familiar exerce alguma atividade além do benefício?"
      ],
      "regime_trabalho_parceiro_familiar"
    );
  }

  // --------------------------------------------------
  // NÃO SABE INFORMAR
  // --------------------------------------------------
  if (nao_sabe) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho_parceiro_familiar",
      severity: "info",
      message: "Saindo da fase: confirmar_avo_familiar → regime_trabalho_parceiro_familiar (não sabe)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, {
      avo_beneficio: "nao_sabe"
    });

    return step(
      env,
      st,
      [
        "Sem problema 😊",
        "Se souber depois, só me avisar!",
        "Agora me diga: esse familiar é **CLT**, **autônomo(a)** ou **servidor(a)**?"
      ],
      "regime_trabalho_parceiro_familiar"
    );
  }

  // --------------------------------------------------
  // NÃO ENTENDIDO
  // --------------------------------------------------

  // 🟩 EXIT_STAGE (permanece na mesma fase)
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "confirmar_avo_familiar",
    severity: "info",
    message: "Saindo da fase: confirmar_avo_familiar → confirmar_avo_familiar (fallback)",
    details: { userText }
  });

  return step(
    env,
    st,
    [
      "Consegue me confirmar qual é o tipo de benefício **do seu avô/avó**?",
      "Pode ser: rural, urbana, pensão, BPC/LOAS ou outro benefício 👍"
    ],
    "confirmar_avo_familiar"
  );
}

// =========================================================
// C12 — RENDA FAMILIAR VALOR
// =========================================================

case "renda_familiar_valor": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "renda_familiar_valor"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: renda_familiar_valor",
    details: {
      last_user_text: st.last_user_text || null,
      renda_titular: st.renda_titular || null,
      renda_parceiro: st.renda_parceiro || null,
      renda_total: st.renda_total_para_fluxo || null
    }
  });

  // Extrai número da renda
  const valor = Number(
    t.replace(/[^0-9]/g, "")
  );

  // --------------------------------------------------
  // VALOR INVÁLIDO
  // --------------------------------------------------
  if (!valor || valor < 200) {

    // 🟩 EXIT_STAGE → permanece na mesma fase
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "renda_familiar_valor",
      severity: "info",
      message: "Valor inválido informado → permanência na fase renda_familiar_valor",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Acho que não entendi certinho o valor 🤔",
        "Qual é a **renda mensal** dessa pessoa que vai somar com você?"
      ],
      "renda_familiar_valor"
    );
  }

  // --------------------------------------------------
  // SALVA RENDA DO FAMILIAR
  // --------------------------------------------------
  await upsertState(env, st.wa_id, {
    renda_parceiro: valor,
    somar_renda: true,
    financiamento_conjunto: true
  });

  // Soma renda total (titular + familiar) com fallback defensivo
  const rendaTitular = Number(st.renda || st.renda_titular || st.renda_total_para_fluxo || 0);
  const rendaTotal = rendaTitular + valor;

  await upsertState(env, st.wa_id, {
    renda_total_para_fluxo: rendaTotal
  });

  // 🟩 EXIT_STAGE → próxima fase: ctps_36_parceiro (trilho familiar unificado)
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "ctps_36_parceiro",
    severity: "info",
    message: "Saindo da fase: renda_familiar_valor → ctps_36_parceiro",
    details: { userText, rendaTitular, renda_parceiro: valor, rendaTotal }
  });

  return step(
    env,
    st,
    [
      "Perfeito! 👌",
      `Então a renda somada ficou em **R$ ${rendaTotal.toLocaleString("pt-BR")}**.`,
      "Agora me diga: essa pessoa que está somando renda com você tem **36 meses de carteira assinada (CTPS)** nos últimos 3 anos?"
    ],
    "ctps_36_parceiro"
  );
}

// --------------------------------------------------
// 🧩 C13 — INÍCIO_MULTI_RENDA_PERGUNTA
// --------------------------------------------------
case "inicio_multi_renda_pergunta": {

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Fase: inicio_multi_renda_pergunta",
    details: { last_user_text: st.last_user_text }
  });

  const nt = normalizeText(userText || "");
  // Exemplos cobertos: "sim, tenho bicos", "não tenho renda extra"

  // -------------------------------------------
  // ❌ NÃO — não possui outra renda
  // -------------------------------------------
  if (isNo(nt) || /^(nao|não)$/i.test(nt) || /(nao tenho renda extra|não tenho renda extra|s[oó] essa renda)/i.test(nt)) {

    await upsertState(env, st.wa_id, {
      multi_renda_flag: false,
      fase_conversa: "ctps_36"
    });

    st.multi_renda_flag = false;
    st.fase_conversa = "ctps_36";

    return step(
      env,
      st,
      [
        "Perfeito 👌",
        "Agora me confirma uma coisa importante:",
        "Somando todos os seus empregos registrados na carteira de trabalho, você tem *36 meses ou mais de carteira assinada* (considerando todos os períodos)?",
        "Responda *sim*, *não* ou não sei."
      ],
      "ctps_36"
    );
  }

  // -------------------------------------------
  // 👍 SIM — possui outra renda
  // -------------------------------------------
  if (isYes(nt) || /^sim$/i.test(nt) || /(tenho renda extra|tenho outra renda|fa[cç]o bico|freela|extra)/i.test(nt)) {

    await upsertState(env, st.wa_id, {
      multi_renda_flag: true,
      fase_conversa: "inicio_multi_renda_coletar"
    });

    // 🔥 Atualiza memória
    st.multi_renda_flag = true;
    st.fase_conversa = "inicio_multi_renda_coletar";

    return step(
      env,
      st,
      [
        "Perfeito! 👍",
        "Me diga qual é a *outra renda* e o *valor BRUTO*.",
        "Exemplo: *Bico — 1200*"
      ],
      "inicio_multi_renda_coletar"
    );
  }

  // -------------------------------------------
  // ❓ Fallback
  // -------------------------------------------
  return step(
    env,
    st,
    [
      "Só pra confirmar 🙂",
      "Você possui *mais alguma renda* além dessa?",
      "Responda *sim* ou *não*."
    ],
    "inicio_multi_renda_pergunta"
  );
}
      
// --------------------------------------------------
// 🧩 C14 — INÍCIO_MULTI_RENDA_COLETAR (loop)
// --------------------------------------------------
case "inicio_multi_renda_coletar": {

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Fase: inicio_multi_renda_coletar",
    details: { last_user_text: st.last_user_text }
  });

  const txt = String(userText || "").trim();

  // 1) Formato completo: "tipo - valor"
  // 2) Formato curto: "1200,00" (assume renda extra genérica)
  const matchCompleto = txt.match(/(.+?)\s*[-–—]\s*(r\$\s*)?([\d\.,kK]+)/i);
  const matchSomenteValor = txt.match(/^(r\$\s*)?([\d\.,kK]+)$/i);

  let tipo = "";
  let valorNumerico = 0;

  if (matchCompleto) {
    tipo = normalizeText(matchCompleto[1].trim());
    valorNumerico = parseMoneyBR(matchCompleto[3]) || 0;
  } else if (matchSomenteValor) {
    tipo = "renda extra";
    valorNumerico = parseMoneyBR(matchSomenteValor[2]) || 0;
  } else {
    return step(
      env,
      st,
      [
        "Não consegui entender certinho 😅",
        "Envie no formato: *tipo — valor*",
        "Exemplo: *Bico — 1000*"
      ],
      "inicio_multi_renda_coletar"
    );
  }

  if (!valorNumerico || valorNumerico <= 0) {
    return step(
      env,
      st,
      [
        "Não consegui identificar o valor da renda extra 😅",
        "Pode me enviar novamente?",
        "Exemplo: *Bico — 1000* ou só *1000*"
      ],
      "inicio_multi_renda_coletar"
    );
  }

  // -------------------------------
  // Atualiza lista local (JSON)
  // -------------------------------
  let lista = Array.isArray(st.multi_renda_lista) ? st.multi_renda_lista : [];
  lista.push({
    owner: "titular",
    tipo,
    valor: valorNumerico,
    ts: Date.now()
  });

  // -------------------------------
  // Upsert no banco
  // -------------------------------
  await upsertState(env, st.wa_id, {
    multi_renda_lista: lista,
    ultima_renda_bruta_informada: valorNumerico,
    qtd_rendas_informadas: lista.length
  });

  // -------------------------------
  // Atualiza memória
  // -------------------------------
  st.multi_renda_lista = lista;
  st.ultima_renda_bruta_informada = valorNumerico;
  st.qtd_rendas_informadas = lista.length;

  return step(
    env,
    st,
    [
      "Ótimo! 👌",
      "Quer adicionar *mais alguma renda*?",
      "Responda: *sim* ou *não*."
    ],
    "inicio_multi_renda_pergunta"
  );
}



// --------------------------------------------------
// 🧩 C14F - INÍCIO_MULTI_REGIME_FAMILIAR_PERGUNTA
// --------------------------------------------------
case "inicio_multi_regime_familiar_pergunta": {
  const nt = normalizeText(userText || "");
  const famLabel = st.familiar_tipo === "pai" ? "seu pai" : st.familiar_tipo === "mae" ? "sua mãe" : "seu familiar";
  const negativoFlex =
    isNo(nt) ||
    /\bnao\s+sei\b/i.test(nt) ||
    /\bn[aã]o\s+sei\b/i.test(String(userText || ""));

  if (isYes(nt)) {
  return step(env, st, ["Perfeito! 👍", `Me diga qual é o outro regime de trabalho de ${famLabel}.`], "inicio_multi_regime_familiar_loop");
}

if (
  negativoFlex ||
  /^(nao|não)$/i.test(String(userText || "").trim()) ||
  /^(nao|não)$/i.test(nt)
) {
  return step(env, st, ["Certo! 😊", `Agora me diga o valor da renda mensal de ${famLabel}.`], "renda_parceiro_familiar");
}

  return step(env, st, ["Só para confirmar 😊", `${famLabel} tem mais algum regime de trabalho além desse?`, "Responda sim ou não."], "inicio_multi_regime_familiar_pergunta");
}

// --------------------------------------------------
// 🧩 C14F2 - INÍCIO_MULTI_REGIME_FAMILIAR_LOOP
// --------------------------------------------------
case "inicio_multi_regime_familiar_loop": {
  const nt = normalizeText(userText || "");
  const regimeMulti = parseRegimeTrabalho(nt);
  const famLabel = st.familiar_tipo === "pai" ? "seu pai" : st.familiar_tipo === "mae" ? "sua mãe" : "seu familiar";

  if (!regimeMulti || regimeMulti === "desempregado" || regimeMulti === "estudante") {
    return step(env, st, ["Acho que não entendi certinho 😅", `Me diga apenas o regime de ${famLabel}, como CLT, autônomo ou servidor.`], "inicio_multi_regime_familiar_loop");
  }

  const regimeFinal = regimeMulti === "aposentadoria" ? "aposentado" : regimeMulti;
  await upsertState(env, st.wa_id, {
    multi_regime_lista: appendOwned(st.multi_regime_lista, { regime: regimeFinal, ts: Date.now() }, "familiar")
  });

  return step(env, st, ["Ótimo! 👍", `${famLabel} tem mais algum emprego/regime?`, "Responda sim ou não."], "inicio_multi_regime_familiar_pergunta");
}

// --------------------------------------------------
// 🧩 C14F3 - INÍCIO_MULTI_RENDA_FAMILIAR_PERGUNTA
// --------------------------------------------------
case "inicio_multi_renda_familiar_pergunta": {
  const nt = normalizeText(userText || "");
  const famLabel = st.familiar_tipo === "pai" ? "seu pai" : st.familiar_tipo === "mae" ? "sua mãe" : "seu familiar";

  if (isYes(nt)) {
    await upsertState(env, st.wa_id, { multi_renda_flag: true });
    return step(env, st, ["Perfeito! 👍", `Me diga a outra renda de ${famLabel} e o valor bruto.`, "Exemplo: Bico - 1200"], "inicio_multi_renda_familiar_loop");
  }

  if (isNo(nt)) {
    await upsertState(env, st.wa_id, { multi_renda_flag: false });
    return step(env, st, ["Perfeito 👌", `Agora me confirma: ${famLabel} tem 36 meses ou mais de CTPS nos últimos 3 anos?`], "ctps_36_parceiro");
  }

  return step(env, st, ["Só pra confirmar 🙂", `${famLabel} possui mais alguma renda além dessa?`, "Responda sim ou não."], "inicio_multi_renda_familiar_pergunta");
}

// --------------------------------------------------
// 🧩 C14F4 - INÍCIO_MULTI_RENDA_FAMILIAR_LOOP
// --------------------------------------------------
case "inicio_multi_renda_familiar_loop": {
  const txt = String(userText || "").trim();
  const matchCompleto = txt.match(/(.+?)\s*[-–—]\s*(r\$\s*)?([\d\.,kK]+)/i);
  const matchSomenteValor = txt.match(/^(r\$\s*)?([\d\.,kK]+)$/i);
  let tipo = "";
  let valorNumerico = 0;

  if (matchCompleto) {
    tipo = normalizeText(matchCompleto[1].trim());
    valorNumerico = parseMoneyBR(matchCompleto[3]) || 0;
  } else if (matchSomenteValor) {
    tipo = "renda extra";
    valorNumerico = parseMoneyBR(matchSomenteValor[2]) || 0;
  } else {
    return step(env, st, ["Não consegui entender certinho 😅", "Envie no formato: tipo - valor", "Exemplo: Bico - 1000"], "inicio_multi_renda_familiar_loop");
  }

  if (!valorNumerico || valorNumerico <= 0) {
    return step(env, st, ["Não consegui identificar o valor 😅", "Pode me enviar novamente?"], "inicio_multi_renda_familiar_loop");
  }

  await upsertState(env, st.wa_id, {
    multi_renda_lista: appendOwned(st.multi_renda_lista, { tipo, valor: valorNumerico, ts: Date.now() }, "familiar")
  });

  return step(env, st, ["Ótimo! 👌", "Quer adicionar mais alguma renda desse familiar?", "Responda sim ou não."], "inicio_multi_renda_familiar_pergunta");
}

// --------------------------------------------------
// 🧩 C20B - INICIO_MULTI_REGIME_PERGUNTA_PARCEIRO
// --------------------------------------------------
case "inicio_multi_regime_pergunta_parceiro": {

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Fase: inicio_multi_regime_pergunta_parceiro",
    details: { last_user_text: st.last_user_text }
  });

  const nt = normalizeText(userText || "");

  // SIM → coletar outro regime do parceiro
  if (isYes(nt) || /^sim$/i.test(nt) || /(tenho outro|mais de um trabalho|mais um emprego|outro trampo)/i.test(nt)) {
    await upsertState(env, st.wa_id, {
      fase_conversa: "inicio_multi_regime_coletar_parceiro"
    });

    return step(
      env,
      st,
      [
        "Perfeito! 👍",
        "Me diga qual é o *outro regime de trabalho* do parceiro(a).",
        "Exemplos: *CLT*, *Autônomo*, *Servidor*, *MEI*, *Aposentado*…"
      ],
      "inicio_multi_regime_coletar_parceiro"
    );
  }

  // NÃO → segue para renda do parceiro
  if (isNo(nt) || /^(nao|não)$/i.test(nt) || /(s[oó] esse|apenas esse|somente esse)/i.test(nt)) {
    return step(
      env,
      st,
      [
        "Certo! 😊",
        "Então me diga: qual é a **renda mensal** do parceiro(a)? (valor bruto)"
      ],
      "renda_parceiro"
    );
  }

  return step(
    env,
    st,
    [
      "Só para confirmar 😊",
      "O parceiro(a) tem *mais algum regime de trabalho* além desse?",
      "Responda *sim* ou *não*."
    ],
    "inicio_multi_regime_pergunta_parceiro"
  );
}

// --------------------------------------------------
// 🧩 C20C - INICIO_MULTI_REGIME_COLETAR_PARCEIRO
// --------------------------------------------------
case "inicio_multi_regime_coletar_parceiro": {

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Fase: inicio_multi_regime_coletar_parceiro",
    details: { last_user_text: st.last_user_text }
  });

  const nt = normalizeText(userText || "");
  const regimeMulti = parseRegimeTrabalho(nt);

  if (!regimeMulti || regimeMulti === "desempregado" || regimeMulti === "estudante") {
    return step(
      env,
      st,
      [
        "Acho que não entendi certinho 😅",
        "Me diga apenas o regime do parceiro(a), por exemplo:",
        "👉 *CLT*\n👉 *Autônomo*\n👉 *Servidor*\n👉 *MEI*\n👉 *Aposentado*"
      ],
      "inicio_multi_regime_coletar_parceiro"
    );
  }

  let regimesParceiro = Array.isArray(st.multi_regime_lista_parceiro) ? st.multi_regime_lista_parceiro : [];
  regimesParceiro.push(regimeMulti === "aposentadoria" ? "aposentado" : regimeMulti);

  await upsertState(env, st.wa_id, {
    multi_regime_lista_parceiro: regimesParceiro
  });

  return step(
    env,
    st,
    [
      "Ótimo! 👍",
      "O parceiro(a) tem *mais algum emprego/regime de trabalho* além desse?",
      "Responda *sim* ou *não*."
    ],
    "inicio_multi_regime_pergunta_parceiro"
  );
}

// --------------------------------------------------
// 🧩 C20D - INICIO_MULTI_RENDA_PERGUNTA_PARCEIRO
// --------------------------------------------------
case "inicio_multi_renda_pergunta_parceiro": {

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Fase: inicio_multi_renda_pergunta_parceiro",
    details: { last_user_text: st.last_user_text }
  });

  const nt = normalizeText(userText || "");

  // -------------------------------------------
  // NÃO — parceiro não possui outra renda
  // -------------------------------------------
  if (isNo(nt) || /^(nao|não)$/i.test(nt) || /(nao tenho renda extra|não tenho renda extra|s[oó] essa renda)/i.test(nt)) {

    await upsertState(env, st.wa_id, {
      multi_renda_flag_parceiro: false
    });

    const rendaTitular = Number(st.renda || 0);
    const rendaParceiroBase = Number(st.renda_parceiro || 0);
    const listaParceiro = Array.isArray(st.multi_renda_lista_parceiro) ? st.multi_renda_lista_parceiro : [];
    const rendaExtraParceiro = listaParceiro.reduce((acc, item) => acc + Number(item?.valor || 0), 0);
    const rendaTotal = rendaTitular + rendaParceiroBase + rendaExtraParceiro;

    await upsertState(env, st.wa_id, {
      renda_total_para_fluxo: rendaTotal
    });

    // Parceiro autônomo → perguntar IR
    if (st.regime_trabalho_parceiro === "autonomo" || st.regime_parceiro === "AUTONOMO") {
      await funnelTelemetry(env, {
        wa_id: st.wa_id,
        event: "exit_stage",
        stage,
        next_stage: "ir_declarado",
        severity: "info",
        message: "Saindo de inicio_multi_renda_pergunta_parceiro → ir_declarado",
        details: {
          renda_titular: rendaTitular,
          renda_parceiro: rendaParceiroBase,
          renda_extra_parceiro: rendaExtraParceiro,
          renda_total: rendaTotal
        }
      });

      return step(
        env,
        st,
        [
          "Perfeito! 👌",
          `A renda somada ficou em **R$ ${rendaTotal.toLocaleString("pt-BR")}**.`,
          "O parceiro(a) **declara Imposto de Renda**?"
        ],
        "ir_declarado"
      );
    }

    // Ainda faltam dados do titular → volta pro trilho do titular
    const titularSemRegime = !st.regime && !st.regime_trabalho;
    const titularSemRenda = !Number(st.renda || 0);

    if (titularSemRegime || titularSemRenda) {
      await funnelTelemetry(env, {
        wa_id: st.wa_id,
        event: "exit_stage",
        stage,
        next_stage: "regime_trabalho",
        severity: "info",
        message: "Saindo de inicio_multi_renda_pergunta_parceiro → regime_trabalho (faltam dados do titular)",
        details: {
          renda_titular: rendaTitular,
          renda_parceiro: rendaParceiroBase,
          renda_extra_parceiro: rendaExtraParceiro,
          renda_total: rendaTotal
        }
      });

      return step(
        env,
        st,
        [
          "Perfeito! 👍",
          `Já anotei as rendas do parceiro(a) e a renda somada parcial ficou em **R$ ${rendaTotal.toLocaleString("pt-BR")}**.`,
          "Agora preciso registrar seus dados primeiro, pra seguir certinho:",
          "Qual é o seu **tipo de trabalho**? CLT, autônomo(a) ou servidor(a)?"
        ],
        "regime_trabalho"
      );
    }

    // Titular já preenchido → segue CTPS
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "ctps_36",
      severity: "info",
      message: "Saindo de inicio_multi_renda_pergunta_parceiro → ctps_36",
      details: {
        renda_titular: rendaTitular,
        renda_parceiro: rendaParceiroBase,
        renda_extra_parceiro: rendaExtraParceiro,
        renda_total: rendaTotal
      }
    });

    return step(
      env,
      st,
      [
        "Ótimo! 👍",
        `A renda somada ficou em **R$ ${rendaTotal.toLocaleString("pt-BR")}**.`,
        "Agora me diga:",
        "Você tem **36 meses de carteira assinada (CTPS)** nos últimos 3 anos?"
      ],
      "ctps_36"
    );
  }

  // -------------------------------------------
  // SIM — parceiro possui outra renda
  // -------------------------------------------
  if (isYes(nt) || /^sim$/i.test(nt) || /(tenho renda extra|tenho outra renda|fa[cç]o bico|freela|extra)/i.test(nt)) {
    await upsertState(env, st.wa_id, {
      multi_renda_flag_parceiro: true
    });

    return step(
      env,
      st,
      [
        "Perfeito! 👍",
        "Me diga qual é a *outra renda do parceiro(a)* e o *valor BRUTO*.",
        "Exemplo: *Bico — 1200*"
      ],
      "inicio_multi_renda_coletar_parceiro"
    );
  }

  return step(
    env,
    st,
    [
      "Só pra confirmar 🙂",
      "O parceiro(a) possui *mais alguma renda* além dessa?",
      "Responda *sim* ou *não*."
    ],
    "inicio_multi_renda_pergunta_parceiro"
  );
}

// --------------------------------------------------
// 🧩 C20E - INICIO_MULTI_RENDA_COLETAR_PARCEIRO
// --------------------------------------------------
case "inicio_multi_renda_coletar_parceiro": {

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Fase: inicio_multi_renda_coletar_parceiro",
    details: { last_user_text: st.last_user_text }
  });

  const txt = String(userText || "").trim();

  const matchCompleto = txt.match(/^\s*([^\d]+?)\s*(?:[-–—]|:|\s+|\ba\b|\bà\b)\s*(r\$\s*)?([\d\.,kK]+)\s*$/i);
  const matchSomenteValor = txt.match(/^(r\$\s*)?([\d\.,kK]+)$/i);

  let tipo = "";
  let valorNumerico = 0;

  if (matchCompleto) {
    tipo = normalizeText(matchCompleto[1].trim());
    valorNumerico = parseMoneyBR(matchCompleto[3]) || 0;
  } else if (matchSomenteValor) {
    tipo = "renda extra parceiro";
    valorNumerico = parseMoneyBR(matchSomenteValor[2]) || 0;
  } else {
    return step(
      env,
      st,
      [
        "Não consegui entender certinho 😅",
        "Envie no formato: *tipo — valor*",
        "Exemplo: *Bico — 1000*"
      ],
      "inicio_multi_renda_coletar_parceiro"
    );
  }

  if (!valorNumerico || valorNumerico <= 0) {
    return step(
      env,
      st,
      [
        "Não consegui identificar o valor da renda extra 😅",
        "Pode me enviar novamente?",
        "Exemplo: *Bico — 1000* ou só *1000*"
      ],
      "inicio_multi_renda_coletar_parceiro"
    );
  }

  let lista = Array.isArray(st.multi_renda_lista_parceiro) ? st.multi_renda_lista_parceiro : [];
  lista.push({
    tipo,
    valor: valorNumerico,
    ts: Date.now()
  });

  await upsertState(env, st.wa_id, {
    multi_renda_lista_parceiro: lista,
    ultima_renda_bruta_informada_parceiro: valorNumerico,
    qtd_rendas_informadas_parceiro: lista.length
  });

  st.multi_renda_lista_parceiro = lista;
  st.ultima_renda_bruta_informada_parceiro = valorNumerico;
  st.qtd_rendas_informadas_parceiro = lista.length;

  return step(
    env,
    st,
    [
      "Ótimo! 👌",
      "O parceiro(a) tem *mais alguma renda*?",
      "Responda: *sim* ou *não*."
    ],
    "inicio_multi_renda_pergunta_parceiro"
  );
}

// =========================================================
// C15 — REGIME DE TRABALHO
// =========================================================

case "regime_trabalho": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "regime_trabalho"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: regime_trabalho",
    details: {
      last_user_text: st.last_user_text || null,
      funil_status: st.funil_status || null,
      estado_civil: st.estado_civil || null,
      somar_renda: st.somar_renda || null,
      financiamento_conjunto: st.financiamento_conjunto || null
    }
  });

  const regimeDetectado = parseRegimeTrabalho(t);
  // Exemplos cobertos: "registro em carteira", "faço freela", "sou servidor estatutário"
  const clt = regimeDetectado === "clt";
  const aut = regimeDetectado === "autonomo";
  const serv = regimeDetectado === "servidor";
  const aposentado = regimeDetectado === "aposentadoria";

  // ------------------------------------------------------
  // TITULAR É CLT
  // ------------------------------------------------------
  if (clt) {
    await upsertState(env, st.wa_id, {
      regime: "clt"
    });

    // EXIT_STAGE → vai para pergunta de multi regime
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "inicio_multi_regime_pergunta",
      severity: "info",
      message: "Saindo da fase regime_trabalho → inicio_multi_regime_pergunta (CLT)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Perfeito. Você tem mais algum emprego ou faz algum bico além desse?",
        "Responda *sim* ou *não*."
      ],
      "inicio_multi_regime_pergunta"
    );
  }

  // ------------------------------------------------------
  // TITULAR É AUTÔNOMO
  // ------------------------------------------------------
  if (aut) {
    await upsertState(env, st.wa_id, {
      regime: "autonomo"
    });

    // EXIT_STAGE → pergunta de IR para autônomo
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "autonomo_ir_pergunta",
      severity: "info",
      message: "Saindo da fase regime_trabalho → autonomo_ir_pergunta (AUTONOMO)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Perfeito. 👍",
        "Você declara Imposto de Renda (IR)? (sim/não)"
      ],
      "autonomo_ir_pergunta"
    );
  }

  // ------------------------------------------------------
  // TITULAR É SERVIDOR
  // ------------------------------------------------------
  if (serv) {
    await upsertState(env, st.wa_id, {
      regime: "servidor"
    });

    // EXIT_STAGE → vai para pergunta de multi regime
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "inicio_multi_regime_pergunta",
      severity: "info",
      message: "Saindo da fase regime_trabalho → inicio_multi_regime_pergunta (SERVIDOR)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Perfeito. Você tem mais algum emprego ou faz algum bico além desse?",
        "Responda *sim* ou *não*."
      ],
      "inicio_multi_regime_pergunta"
    );
  }

  // ------------------------------------------------------
  // TITULAR É APOSENTADO
  // ------------------------------------------------------
  if (aposentado) {
    await upsertState(env, st.wa_id, {
      regime: "aposentadoria"
    });

    // EXIT_STAGE → vai para pergunta de multi regime
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "inicio_multi_regime_pergunta",
      severity: "info",
      message: "Saindo da fase regime_trabalho → inicio_multi_regime_pergunta (APOSENTADO)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Perfeito. Você tem mais algum emprego ou faz algum bico além desse?",
        "Responda *sim* ou *não*."
      ],
      "inicio_multi_regime_pergunta"
    );
  }

  // ------------------------------------------------------
  // NÃO ENTENDIDO
  // ------------------------------------------------------
  
  // EXIT_STAGE → continua na mesma fase
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "regime_trabalho",
    severity: "info",
    message: "Resposta não compreendida → permanece na fase regime_trabalho",
    details: { userText }
  });

  return step(
    env,
    st,
    [
      "Só pra confirmar 😊",
      "Você trabalha com **CLT**, é **autônomo(a)**, **servidor(a)** ou **aposentado(a)**?"
    ],
    "regime_trabalho"
  );
}

case "autonomo_ir_pergunta": {
 const nao = /^(n[aã]o|nao)$/i.test(String(t || "").trim());
  const sim = /\b(sim|yes)\b/i.test(t);

  if (nao) {
    await upsertState(env, st.wa_id, { autonomo_ir: false });

    const estadoCivil = String(st.estado_civil || "").toLowerCase();
    const casadoCivil = estadoCivil === "casado_civil" || st.casado_civil === true;
    const financiamentoConjunto = st.financiamento_conjunto === true;
    const somarRendaTxt = String(st.somar_renda || "").toLowerCase();
    const somarRendaComParceiroOuFamiliar =
      st.somar_renda === true || /(parceiro|familiar)/i.test(somarRendaTxt);
    const ehConjunto = casadoCivil || financiamentoConjunto || somarRendaComParceiroOuFamiliar;

    if (ehConjunto) {
      return step(
        env,
        st,
        [
          "Perfeito.",
          "Agora me diga qual é a sua **renda mensal média** com esse trabalho como autônomo."
        ],
        "renda"
      );
    }

    return step(
      env,
      st,
      [
        "Entendi.",
        "Normalmente, quem recebe acima de ~R$ 2.380 por mês entra na faixa de obrigatoriedade de declaração.",
        "Você pretende declarar IR este ano? (sim/não)"
      ],
      "autonomo_sem_ir_ir_este_ano"
    );
  }

  if (sim) {
    await upsertState(env, st.wa_id, { autonomo_ir: true });
    return step(
      env,
      st,
      [
        "Perfeito! 👍",
        "Agora me diga qual é a sua **renda mensal média** com esse trabalho como autônomo."
      ],
      "renda"
    );
  }

  return step(
    env,
    st,
    ["Você declara Imposto de Renda (IR)? (sim/não)"],
    "autonomo_ir_pergunta"
  );
}

case "autonomo_sem_ir_ir_este_ano": {
  const sim = /\b(sim|pretendo|vou|declarar)\b/i.test(t);
  const nao = /\b(n[aã]o|nao|não)\b/i.test(t);

  if (sim) {
    return step(
      env,
      st,
      [
        "Perfeito.",
        "Na visita, o atendimento te ajuda com a declaração de IR.",
        "Agora me diga qual é a sua **renda mensal média** com esse trabalho como autônomo."
      ],
      "renda"
    );
  }

  if (nao) {
    return step(
      env,
      st,
      [
        "Sem problemas.",
        "Você vai compor renda com alguém? (parceiro/familiar/ninguém)"
      ],
      "autonomo_sem_ir_caminho"
    );
  }

  return step(
    env,
    st,
    [
      "Normalmente, quem recebe acima de ~R$ 2.380 por mês entra na faixa de obrigatoriedade de declaração.",
      "Você pretende declarar IR este ano? (sim/não)"
    ],
    "autonomo_sem_ir_ir_este_ano"
  );
}

case "autonomo_sem_ir_caminho": {
  // FASE 1 — decidir composição (parceiro/familiar/ninguém)
  const parceiro = /\b(parceir\w*|c[oô]njuge|espos\w*|marid\w*|namorad\w*)\b/i.test(t);
  const familiar = /\b(familiar|pai|m[aã]e|mae|irm[aã]o|irma|av[oó]|tia|tio|primo|prima)\b/i.test(t);
  const ninguem = /\b(ningu[eé]m|sozinh|s[oó]\s*eu|apenas eu|somente eu)\b/i.test(t);

  // “não” aqui significa “não vou compor” => tratar como “ninguém”
  const nao = /^(n[aã]o|nao)$/i.test(String(t || "").trim());

  if (parceiro) {
    return step(
      env,
      st,
      [
        "Perfeito! 👏",
        "Vamos considerar renda com parceiro(a).",
        "Ele(a) trabalha com **CLT, autônomo(a) ou servidor(a)?**"
      ],
      "regime_trabalho_parceiro"
    );
  }

  if (familiar) {
    return step(
      env,
      st,
      [
        "Show! 👏",
        "Vamos compor renda com familiar.",
        "Qual familiar você quer usar? (pai, mãe, irmão, irmã, tio, tia, avô, avó...)"
      ],
      "somar_renda_familiar"
    );
  }

  if (ninguem || nao) {
    // SAÍDA GARANTIDA: vai para a fase de entrada (sem depender de last_bot_msg)
    return step(env, st, ["Você tem entrada? (sim/não)"], "autonomo_sem_ir_entrada");
  }

  // fallback (pergunta de novo, mas sem loop de entrada)
  return step(
    env,
    st,
    ["Você vai compor renda com alguém? (parceiro/familiar/ninguém)"],
    "autonomo_sem_ir_caminho"
  );
}

case "autonomo_sem_ir_entrada": {
  // FASE 2 — decidir entrada (sim/não)
  const sim = /\b(sim|yes)\b/i.test(t) || /\b(tenho entrada|com entrada|entrada sim)\b/i.test(t);
  const nao = /\b(n[aã]o|nao)\b/i.test(t) || /\b(sem entrada|nao tenho entrada|não tenho entrada|entrada n[aã]o)\b/i.test(t);

  if (sim) {
    return step(
      env,
      st,
      [
        "Perfeito.",
        "Agora me diga qual é a sua **renda mensal média** com esse trabalho como autônomo."
      ],
      "renda"
    );
  }

  if (nao) {
    return step(
      env,
      st,
      [
        "Entendi.",
        "Neste momento, sem composição de renda e sem entrada, não consigo seguir com a simulação."
      ],
      "fim_inelegivel"
    );
  }

  return step(env, st, ["Você tem entrada? (sim/não)"], "autonomo_sem_ir_entrada");
}

case "fim_inelegivel": {
  return step(env, st, ["Tudo bem."], "fim_ineligivel");
}

// =========================================================
// 🧩 C16 — FIM_INELIGIVEL (fallback seguro para stage referenciado)
// =========================================================
case "fim_ineligivel": {

  // Motivo específico gravado em fases anteriores (quando existir)
  const motivoRaw =
    st.motivo_ineligivel != null
      ? String(st.motivo_ineligivel).trim()
      : "";
  const motivo = motivoRaw || null;

  // Campos já usados hoje pelos fluxos de RNM
  const rnmStatus = st.rnm_status || null;       // "possui" | "não possui" | null
  const rnmValidade = st.rnm_validade || null;   // "definida" | "indeterminado" | null

  // Tenta pegar o primeiro nome do cliente
  const primeiroNome =
    (st.primeiro_nome && String(st.primeiro_nome).trim().split(/\s+/)[0]) ||
    ((st.nome || "").trim().split(/\s+/)[0] || "");

  const saudacaoNome = primeiroNome ? `${primeiroNome}, ` : "";

  let mensagens;

  // ------------------------------------------------------
  // 1) IDADE FORA DA FAIXA (definida em fases de docs)
  // ------------------------------------------------------
  if (motivo === "idade_inferior_18") {
    mensagens = [
      `${saudacaoNome}pelas regras do Minha Casa Minha Vida, só consigo seguir com quem tem 18 anos ou mais.`,
      "Quando você completar 18 anos, posso refazer toda a análise pra você sem problema nenhum. 😊"
    ];
  }

  else if (motivo === "idade_acima_67") {
    mensagens = [
      `${saudacaoNome}pelas regras atuais do Minha Casa Minha Vida, a Caixa limita a idade máxima na hora de financiar.`,
      "Pela sua data de nascimento, hoje não consigo seguir pelo programa, mas posso te orientar sobre outras possibilidades se você quiser."
    ];
  }

  // ------------------------------------------------------
  // 2) APENAS BENEFÍCIOS SOCIAIS (LOAS/BPC/AUXÍLIO etc.)
  // ------------------------------------------------------
  else if (motivo === "somente_beneficios_sociais") {
    mensagens = [
      `${saudacaoNome}pelo que você me passou, hoje sua renda vem só de benefício social (tipo LOAS, BPC ou auxílio).`,
      "A Caixa não considera esse tipo de benefício sozinho como renda pra aprovar pelo Minha Casa Minha Vida.",
      "Se em algum momento você tiver uma renda registrada (CLT, autônomo, servidor etc.) ou alguém pra compor renda com você, eu consigo reavaliar seu cenário."
    ];
  }

  // ------------------------------------------------------
  // 3) RENDA BAIXA SOZINHO (≤ 2.380 sem composição)
  // ------------------------------------------------------
  else if (motivo === "renda_baixa_sem_composicao") {
    mensagens = [
      `${saudacaoNome}pela renda que você me informou, sozinho(a) hoje não fecha aprovação viavel dentro do Minha Casa Minha Vida.`,
      "Se em algum momento você conseguir aumentar seu perfil de renda ou somar renda com cônjuge, familiar ou alguém de confiança, me chama aqui que eu refaço todo o estudo pra você, do zero. 👍"
    ];
  }

  // ------------------------------------------------------
  // 4) RESTRIÇÃO ALTA SEM REGULARIZAÇÃO
  // ------------------------------------------------------
  else if (motivo === "restricao_sem_regularizacao") {
    mensagens = [
      `${saudacaoNome}como hoje você está com uma restrição acima de R$ 1.000 e sem previsão de regularizar.`,
      "Nessa situação a Caixa não libera financiamento pelo Minha Casa Minha Vida.",
      "Se você decidir negociar e regularizar essa restrição, eu consigo voltar aqui, revisar tudo e montar o plano certinho com você."
    ];
  }

  // ------------------------------------------------------
  // 5) RNM — ESTRANGEIRO SEM RNM (fluxo atual)
  // ------------------------------------------------------
  else if (rnmStatus === "não possui") {
    mensagens = [
      `${saudacaoNome}pra Caixa aprovar financiamento de estrangeiro pelo Minha Casa Minha Vida é obrigatório já ter o RNM emitido e o documento tem que ter prazo de validade por tempo indeterminado. 😉`,
      "Como hoje você ainda não tem o RNM, a Caixa não deixa eu seguir com a análise pelo programa.",
      "Assim que você tiver o RNM em mãos, me chama aqui que eu reviso tudo desde o início com você, combinado?"
    ];
  }

  // ------------------------------------------------------
  // 6) RNM — COM VALIDADE DEFINIDA (não indeterminado)
  // ------------------------------------------------------
  else if (rnmValidade === "definida") {
    mensagens = [
      "Pra Caixa aprovar estrangeiro pelo Minha Casa Minha Vida, o RNM precisa ser por prazo indeterminado (sem data de vencimento).",
      "Como o seu RNM ainda está com validade definida, a Caixa não enquadra no programa.",
      "Quando você atualizar o RNM pra prazo indeterminado, me chama aqui que eu refaço toda a análise com você, do zero. 😊"
    ];
  }

  // ------------------------------------------------------
  // 7) FALLBACK GENÉRICO (motivo não mapeado)
  // ------------------------------------------------------
  else {
    mensagens = [
      `${saudacaoNome}pelo que eu vi aqui, hoje seu cenário não encaixa nas regras do Minha Casa Minha Vida.`,
      "Se algo mudar (documentos, renda ou situação cadastral), me chama aqui que eu reviso tudo desde o início com você, sem problema nenhum. 👍"
    ];
  }

  await logger(env, {
    tag: "UNKNOWN_STAGE_REFERENCED",
    wa_id: st.wa_id,
    details: {
      stage: "fim_ineligivel",
      from_stage: st.fase_conversa || null,
      motivo_ineligivel: motivo,
      rnm_status: rnmStatus,
      rnm_validade: rnmValidade
    }
  });

  return step(
    env,
    st,
    mensagens,
    "inicio_programa"
  );
}
      
// =========================================================
// 🧩 C17 — VERIFICAR_AVERBACAO (fallback seguro para stage referenciado)
// =========================================================
case "verificar_averbacao": {

  await logger(env, {
    tag: "UNKNOWN_STAGE_REFERENCED",
    wa_id: st.wa_id,
    details: { stage: "verificar_averbacao", from_stage: st.fase_conversa || null }
  });

  return step(
    env,
    st,
    [
      "Obrigado por confirmar!",
      "Agora vamos seguir com a análise de renda para continuar sua simulação."
    ],
    "somar_renda_solteiro"
  );
}

// =========================================================
// 🧩 C18 — VERIFICAR_INVENTARIO (fallback seguro para stage referenciado)
// =========================================================
case "verificar_inventario": {

  await logger(env, {
    tag: "UNKNOWN_STAGE_REFERENCED",
    wa_id: st.wa_id,
    details: { stage: "verificar_inventario", from_stage: st.fase_conversa || null }
  });

  return step(
    env,
    st,
    [
      "Show, obrigado por me avisar 🙌",
      "Isso não te impede de seguir na análise, é só pra eu deixar sua lista de documentos redondinha. Vamos seguir pra parte de renda."
    ],
    "somar_renda_solteiro"
  );
}

// =========================================================
// 🧩 C19 — REGIME_TRABALHO_PARCEIRO_FAMILIAR
// =========================================================
case "p3_tipo_pergunta": {
  const tipo = parseP3Tipo(userText || "");
  if (!tipo) {
    return step(
      env,
      st,
      [
        "Quem você quer incluir? (pai, mãe, irmão/irmã, namorada/namorado, sogro/sogra, outro familiar)"
      ],
      "p3_tipo_pergunta"
    );
  }

  st.p3_tipo = tipo;
  st.p3_required = true;
  st.p3_done = false;
  await upsertState(env, st.wa_id, {
    p3_tipo: tipo,
    p3_required: true,
    p3_done: false
  });

  return step(
    env,
    st,
    [
      "Perfeito!",
      `Agora me diga o regime de trabalho de ${getP3TipoLabel(tipo)}.`
    ],
    "regime_trabalho_parceiro_familiar_p3"
  );
}

// =========================================================
// 🧩 C19P3 — REGIME DE TRABALHO DO P3
// =========================================================
case "regime_trabalho_parceiro_familiar": {

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: regime_trabalho_parceiro_familiar",
    details: {
      last_user_text: st.last_user_text || null,
      soma_com_familiar: st.somar_renda === "familiar"
    }
  });

  const nt = normalizeText(userText || "");
  const parceiroAutonomoSemIr = /autonom/.test(nt) && /\b(sem|nao)\b/.test(nt) && /\bir\b/.test(nt);
  let regimeCanonico = parseRegimeTrabalho(nt);
  
  // ✅ fallback explícito: aceita "clt"/"carteira" como CLT (evita loop no regime_trabalho)
if (!regimeCanonico) {
  if (/\bclt\b/i.test(userText || "") || /(carteira\s*assinada|carteira)/i.test(userText || "")) {
    regimeCanonico = "clt";
  }
}
  const valido = Boolean(regimeCanonico) && regimeCanonico !== "desempregado" && regimeCanonico !== "estudante";

  if (parceiroAutonomoSemIr) {
    st.composicao_autonomo_sem_ir = true;
  }

  if (!valido) {
    return step(
      env,
      st,
      [
        "Só pra confirmar 😊",
        "Qual é o regime de trabalho desse familiar?",
        "Pode responder com: CLT, autônomo, servidor, aposentado, pensionista ou informal."
      ],
      "regime_trabalho_parceiro_familiar"
    );
  }

  const regimeFinal = regimeCanonico === "aposentadoria" ? "aposentado" : regimeCanonico;
  const multiRegimes = appendOwned(st.multi_regime_lista, { regime: regimeFinal, ts: Date.now() }, "familiar");

  await upsertState(env, st.wa_id, {
    regime_trabalho_parceiro_familiar: regimeFinal,
    multi_regime_lista: multiRegimes
  });

  if (parceiroAutonomoSemIr) {
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "flag_memoria",
      stage,
      severity: "info",
      message: "Composição com parceiro familiar autônomo sem IR sinalizada",
      details: { composicao_autonomo_sem_ir: true }
    });
  }

  return step(
    env,
    st,
    [
      "Perfeito!",
      `Seu ${st.familiar_tipo === "pai" ? "pai" : st.familiar_tipo === "mae" ? "mãe" : "familiar"} tem mais algum regime de trabalho além desse?`
    ],
    "inicio_multi_regime_familiar_pergunta"
  );
}

// =========================================================
// 🧩 C20 — FINALIZACAO (fallback seguro para stage referenciado)
// =========================================================
case "finalizacao": {

  await logger(env, {
    tag: "UNKNOWN_STAGE_REFERENCED",
    wa_id: st.wa_id,
    details: { stage: "finalizacao", from_stage: st.fase_conversa || null }
  });

  return step(
    env,
    st,
    [
      "Perfeito!",
      "Vou concluir essa etapa e te guiar no próximo passo."
    ],
    "finalizacao_processo"
  );
}

// =========================================================
// 🧩 C23P3 — REGIME DO P3
// =========================================================
case "regime_trabalho_parceiro_familiar_p3": {
  const nt = normalizeText(userText || "");
  const regimeCanonicoP3 = parseRegimeTrabalho(nt);
  const valido = Boolean(regimeCanonicoP3) && regimeCanonicoP3 !== "desempregado" && regimeCanonicoP3 !== "estudante";
  const p3Label = st.familiar_tipo === "pai" ? "cônjuge do seu pai" : st.familiar_tipo === "mae" ? "cônjuge da sua mãe" : "cônjuge do seu familiar";

  if (!valido) {
    return step(env, st, ["Qual é o regime de trabalho do(a) " + p3Label + "?"], "regime_trabalho_parceiro_familiar_p3");
  }

  const regimeFinal = regimeCanonicoP3 === "aposentadoria" ? "aposentado" : regimeCanonicoP3;
  await upsertState(env, st.wa_id, {
    p3_regime_trabalho: regimeFinal,
    multi_regime_lista: appendOwned(st.multi_regime_lista, { regime: regimeFinal, ts: Date.now() }, "p3")
  });
  return step(env, st, ["Perfeito!", `O(a) ${p3Label} tem mais algum regime de trabalho?`], "inicio_multi_regime_p3_pergunta");
}

case "renda_parceiro_familiar_p3": {
  const valor = parseMoneyBR(userText || "");
  const p3Label = st.familiar_tipo === "pai" ? "cônjuge do seu pai" : st.familiar_tipo === "mae" ? "cônjuge da sua mãe" : "cônjuge do seu familiar";
  if (!valor || valor < 200) {
    return step(env, st, ["Conseguiu confirmar o valor certinho?"], "renda_parceiro_familiar_p3");
  }

  await upsertState(env, st.wa_id, {
    p3_renda_mensal: valor,
    multi_renda_lista: appendOwned(st.multi_renda_lista, { tipo: "renda base", valor, ts: Date.now() }, "p3")
  });

  return step(env, st, ["Perfeito!", `O(a) ${p3Label} possui mais alguma renda além dessa?`], "inicio_multi_renda_p3_pergunta");
}


case "inicio_multi_regime_p3_pergunta": {
  const nt = normalizeText(userText || "");
  const p3Label = st.familiar_tipo === "pai" ? "cônjuge do seu pai" : st.familiar_tipo === "mae" ? "cônjuge da sua mãe" : "cônjuge do seu familiar";
  if (isYes(nt)) {
    return step(env, st, ["Perfeito! 👍", `Me diga o outro regime de trabalho do(a) ${p3Label}.`], "inicio_multi_regime_p3_loop");
  }
  if (isNo(nt)) {
    return step(env, st, ["Certo! 😊", `Agora me diga o valor da renda mensal do(a) ${p3Label}.`], "renda_parceiro_familiar_p3");
  }
  return step(env, st, ["Só para confirmar 😊", `O(a) ${p3Label} tem mais algum regime de trabalho?`, "Responda sim ou não."], "inicio_multi_regime_p3_pergunta");
}

case "inicio_multi_regime_p3_loop": {
  const nt = normalizeText(userText || "");
  const regimeMulti = parseRegimeTrabalho(nt);
  if (!regimeMulti || regimeMulti === "desempregado" || regimeMulti === "estudante") {
    return step(env, st, ["Acho que não entendi certinho 😅", "Me diga apenas o regime, como CLT, autônomo ou servidor."], "inicio_multi_regime_p3_loop");
  }
  const regimeFinal = regimeMulti === "aposentadoria" ? "aposentado" : regimeMulti;
  await upsertState(env, st.wa_id, {
    multi_regime_lista: appendOwned(st.multi_regime_lista, { regime: regimeFinal, ts: Date.now() }, "p3")
  });
  return step(env, st, ["Ótimo! 👍", "Tem mais algum regime de trabalho?", "Responda sim ou não."], "inicio_multi_regime_p3_pergunta");
}

case "inicio_multi_renda_p3_pergunta": {
  const nt = normalizeText(userText || "");
  if (isYes(nt)) {
    return step(env, st, ["Perfeito! 👍", "Me diga a outra renda e o valor bruto.", "Exemplo: Bico - 1200"], "inicio_multi_renda_p3_loop");
  }
  if (isNo(nt)) {
    return step(env, st, ["Perfeito 👌", "Agora me diga: esse cônjuge tem 36 meses de carteira assinada (CTPS) nos últimos 3 anos? (sim/não)"], "ctps_36_parceiro_p3");
  }
  return step(env, st, ["Só pra confirmar 🙂", "Esse cônjuge possui mais alguma renda além dessa?", "Responda sim ou não."], "inicio_multi_renda_p3_pergunta");
}

case "inicio_multi_renda_p3_loop": {
  const txt = String(userText || "").trim();
  const matchCompleto = txt.match(/(.+?)\s*[-–—]\s*(r\$\s*)?([\d\.,kK]+)/i);
  const matchSomenteValor = txt.match(/^(r\$\s*)?([\d\.,kK]+)$/i);
  let tipo = "";
  let valorNumerico = 0;
  if (matchCompleto) {
    tipo = normalizeText(matchCompleto[1].trim());
    valorNumerico = parseMoneyBR(matchCompleto[3]) || 0;
  } else if (matchSomenteValor) {
    tipo = "renda extra";
    valorNumerico = parseMoneyBR(matchSomenteValor[2]) || 0;
  } else {
    return step(env, st, ["Não consegui entender certinho 😅", "Envie no formato: tipo - valor", "Exemplo: Bico - 1000"], "inicio_multi_renda_p3_loop");
  }
  if (!valorNumerico || valorNumerico <= 0) {
    return step(env, st, ["Não consegui identificar o valor 😅", "Pode me enviar novamente?"], "inicio_multi_renda_p3_loop");
  }
  await upsertState(env, st.wa_id, {
    multi_renda_lista: appendOwned(st.multi_renda_lista, { tipo, valor: valorNumerico, ts: Date.now() }, "p3")
  });
  return step(env, st, ["Ótimo! 👌", "Quer adicionar mais alguma renda?", "Responda sim ou não."], "inicio_multi_renda_p3_pergunta");
}

case "ctps_36_parceiro_p3": {
  const tNorm = normalizeText(userText || "");
  const p3Label = getP3TipoLabel(st.p3_tipo);

  // ✅ GATE: se já existe 36m em alguém, não pergunta CTPS do P3
  if (st.ctps_36 === true || st.ctps_36_parceiro === true) {
    await upsertState(env, st.wa_id, { p3_ctps_36: null });
    return step(
      env,
      st,
      [
        "Perfeito! 👌",
        `Agora preciso confirmar o CPF do(a) ${p3Label}:`,
        "Tem alguma restrição?"
      ],
      "restricao_parceiro_p3"
    );
  }

  const nao_sei = /(nao sei|não sei|talvez|acho|nao lembro)/i.test(tNorm);
  const sim =
    !nao_sei &&
    (/(^|\s)sim(\s|$)/i.test(tNorm) ||
      /(tem sim|possui|possuo|completo|completa|mais de 36|3 anos ou mais)/i.test(tNorm));
  const nao =
    !nao_sei &&
    !sim &&
    (/(^|\s)nao(\s|$)/i.test(tNorm) ||
      /(menos de\s*36|menos de\s*3 anos)/i.test(tNorm));

  if (!sim && !nao && !nao_sei) {
    return step(
      env,
      st,
      [`Só pra confirmar: o cônjuge do(a) ${st.familiar_tipo === "pai" ? "seu pai" : st.familiar_tipo === "mae" ? "sua mãe" : "seu familiar"} tem 36 meses ou mais de carteira assinada (CTPS) nos últimos 3 anos? (sim/não)`],
      "ctps_36_parceiro_p3"
    );
  }

  await upsertState(env, st.wa_id, { p3_ctps_36: sim ? true : (nao ? false : null) });

  return step(
    env,
    st,
    [
      `Agora preciso confirmar o CPF do(a) ${p3Label}:`,
      "Tem alguma restrição?"
    ],
    "restricao_parceiro_p3"
  );
}

case "restricao_parceiro_p3": {
  const temNaoTenho = /\b(n[aã]o|nao)\s+tenho\b/i.test(t);
  const temTermoRestricao = hasRestricaoIndicador(t);
  const sim =
    !temNaoTenho && (
      isYes(t) ||
      /^\s*tem\s*$/i.test(t) ||
      (!isNo(t) && temTermoRestricao) ||
      /(sou negativad[oa]|estou negativad[oa]|negativad[oa]|serasa|spc)/i.test(t)
    );
  const incerto = /(nao sei|não sei|talvez|acho|pode ser|não lembro|nao lembro)/i.test(t);
  const nao =
    !incerto && (
      isNo(t) ||
      temNaoTenho ||
      /(cpf limpo|sem restri[cç][aã]o|nome limpo)/i.test(t)
    );

  // label correto do P3 (cônjuge do pai/mãe)
  const p3Label =
    st.familiar_tipo === "pai"
      ? "sua mãe"
      : st.familiar_tipo === "mae"
        ? "seu pai"
        : "o cônjuge desse familiar";

  if (sim) {
    await upsertState(env, st.wa_id, { p3_restricao: true });
    return step(env, st,
      [
        "Entendi 👍",
        `Você tem possibilidade ou intenção de regularizar essa restrição do(a) ${p3Label}?`,
        "Responda *sim* ou *não*."
      ],
      "regularizacao_restricao_p3"
    );
  }

  if (nao || incerto) {
    await upsertState(env, st.wa_id, { p3_restricao: nao ? false : null, p3_done: true });

    return step(env, st,
      [
        "Perfeito! 👌",
        "Agora vamos continuar com você.",
        "Qual é o seu regime de trabalho?"
      ],
      "regime_trabalho"
    );
  }

  return step(env, st,
    [
      `Só pra confirmar rapidinho 😊`,
      `${p3Label} tem alguma *restrição* no CPF? (Serasa, SPC)`,
      "Responda *sim*, *não* ou *não sei*."
    ],
    "restricao_parceiro_p3"
  );
}

case "regularizacao_restricao_p3": {
  const sim = isYes(t) || /(sim|ja estou|estou resolvendo|pagando|negociando|acordo|parcelando|renegociando|ja quitei|ja paguei)/i.test(t);
  const nao = isNo(t) || /(ainda nao|não mexi|nao mexi|não fiz nada|nao fiz nada|vou negociar depois)/i.test(t);
  const talvez = /(talvez|acho|nao sei|não sei|pode ser)/i.test(t);

  if (sim || nao || talvez) {
    st.p3_done = true;

    await upsertState(env, st.wa_id, {
      p3_regularizacao_intencao: sim ? true : (nao ? false : null),
      p3_done: true
    });

    // ✅ GATE: se o titular já estiver "fechado", ir direto pra DOCS
    const titularFechado =
      (st.restricao === true || st.restricao === false || st.restricao === "incerto") &&
      (st.renda_total_para_fluxo != null);

    if (titularFechado) {
      return step(env, st,
        [
          "Ótimo! 👏",
          "Como o seu cadastro principal já está fechado, já vamos pra etapa de documentos 😊"
        ],
        "envio_docs"
      );
    }

    return step(env, st,
      [
        "Ótimo! 👏",
        "Agora seguimos com você.",
        "Qual é o seu regime de trabalho?"
      ],
      "regime_trabalho"
    );
  }

  return step(env, st, ["Você tem possibilidade ou intenção de regularizar essa restrição?"], "regularizacao_restricao_p3");
}

// --------------------------------------------------
// 🧩 C18 - INICIO_MULTI_REGIME_PERGUNTA
// --------------------------------------------------
case "inicio_multi_regime_pergunta": {

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Fase: inicio_multi_regime_pergunta",
    details: { last_user_text: st.last_user_text }
  });

  const nt = normalizeText(userText);
  // Exemplos cobertos: "sim, tenho outro trampo", "não, só esse"

  // SIM → ir coletar o segundo regime
  if (isYes(nt) || /^sim$/i.test(nt) || /(tenho outro|mais de um trabalho|mais um emprego|outro trampo)/i.test(nt)) {

    await upsertState(env, st.wa_id, {
      fase_conversa: "inicio_multi_regime_coletar"
    });

    return step(
      env,
      st,
      [
        "Perfeito! 👍",
        "Me diga qual é o *outro regime de trabalho*.",
        "Exemplos: *CLT*, *Autônomo*, *Servidor*, *MEI*, *Aposentado*…"
      ],
      "inicio_multi_regime_coletar"
    );
  }

  // NÃO → segue para renda
  if (isNo(nt) || /^(nao|não)$/i.test(nt) || /(s[oó] esse|apenas esse|somente esse)/i.test(nt)) {

    return step(
      env,
      st,
      [
        "Certo! 😊",
        "Então me diga: qual é a sua **renda total mensal**? (valor bruto)"
      ],
      "renda"
    );
  }

  // fallback
  return step(
    env,
    st,
    [
      "Só para confirmar 😊",
      "Você tem *mais algum regime de trabalho* além desse?",
      "Responda *sim* ou *não*."
    ],
    "inicio_multi_regime_pergunta"
  );
}

// --------------------------------------------------
// 🧩 C19 - INICIO_MULTI_REGIME_COLETAR
// --------------------------------------------------
case "inicio_multi_regime_coletar": {

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Fase: inicio_multi_regime_coletar",
    details: { last_user_text: st.last_user_text }
  });

  const nt = normalizeText(userText);
  // Exemplos cobertos: "CLT", "MEI", "autônomo"

  // valida um regime simples
  const regimeMulti = parseRegimeTrabalho(nt);
  if (!regimeMulti || regimeMulti === "desempregado" || regimeMulti === "estudante") {

    return step(
      env,
      st,
      [
        "Acho que não entendi certinho 😅",
        "Me diga apenas o regime, por exemplo:",
        "👉 *CLT*\n👉 *Autônomo*\n👉 *Servidor*\n👉 *MEI*\n👉 *Aposentado*"
      ],
      "inicio_multi_regime_coletar"
    );
  }

  // salva no array multi_regimes
  let regimes = st.multi_regimes || [];
  regimes.push(regimeMulti === "aposentadoria" ? "aposentado" : regimeMulti);

  await upsertState(env, st.wa_id, {
    multi_regimes: regimes
  });

  // após registrar o regime, volta para a pergunta de multi regime
  return step(
    env,
    st,
    [
      "Ótimo! 👍",
      "Você tem *mais algum emprego/regime de trabalho* além desse?",
      "Responda *sim* ou *não*."
    ],
    "inicio_multi_regime_pergunta"
  );
}

// =========================================================
// 🧩 C20 — REGIME DE TRABALHO DO PARCEIRO(A)
// =========================================================
case "regime_trabalho_parceiro": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "regime_trabalho_parceiro"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: regime_trabalho_parceiro",
    details: {
      last_user_text: st.last_user_text || null,
      parceiro_tem_renda: st.parceiro_tem_renda || null,
      somar_renda: st.somar_renda || null
    }
  });

  const regimeParceiro = parseRegimeTrabalho(t);
  // Exemplos cobertos: "parceiro é CLT", "ela faz bico", "ele é concursado"
  const clt      = regimeParceiro === "clt";
  const auto     = regimeParceiro === "autonomo";
  const servidor = regimeParceiro === "servidor";
  const aposentadoria = regimeParceiro === "aposentadoria";

  // -----------------------------
  // CLT
  // -----------------------------
  if (clt) {
    await upsertState(env, st.wa_id, {
      regime_trabalho_parceiro: "clt"
    });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "inicio_multi_regime_pergunta_parceiro",
      severity: "info",
      message: "Saindo da fase regime_trabalho_parceiro → inicio_multi_regime_pergunta_parceiro (CLT)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Perfeito! 👍",
        "Só pra eu montar certinho o perfil do parceiro(a):",
        "Ele(a) tem *mais algum regime de trabalho* além desse?",
        "Responda *sim* ou *não*."
      ],
      "inicio_multi_regime_pergunta_parceiro"
    );
  }

  // -----------------------------
  // AUTÔNOMO
  // -----------------------------
  if (auto) {
    await upsertState(env, st.wa_id, {
      regime_trabalho_parceiro: "autonomo"
    });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "inicio_multi_regime_pergunta_parceiro",
      severity: "info",
      message: "Saindo da fase regime_trabalho_parceiro → inicio_multi_regime_pergunta_parceiro (AUTÔNOMO)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Entendi! 😊",
        "Autônomo(a) também entra no programa, sem problema.",
        "Só pra eu montar certinho o perfil do parceiro(a):",
        "Ele(a) tem *mais algum regime de trabalho* além desse?",
        "Responda *sim* ou *não*."
      ],
      "inicio_multi_regime_pergunta_parceiro"
    );
  }

  // -----------------------------
  // SERVIDOR PÚBLICO
  // -----------------------------
  if (servidor) {
    await upsertState(env, st.wa_id, {
      regime_trabalho_parceiro: "servidor"
    });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "inicio_multi_regime_pergunta_parceiro",
      severity: "info",
      message: "Saindo da fase regime_trabalho_parceiro → inicio_multi_regime_pergunta_parceiro (SERVIDOR)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Ótimo! 👌",
        "Servidor(a) público costuma ter análise rápida.",
        "Só pra eu montar certinho o perfil do parceiro(a):",
        "Ele(a) tem *mais algum regime de trabalho* além desse?",
        "Responda *sim* ou *não*."
      ],
      "inicio_multi_regime_pergunta_parceiro"
    );
  }

  // -----------------------------
  // APOSENTADORIA
  // -----------------------------
  if (aposentadoria) {
    await upsertState(env, st.wa_id, {
      regime_trabalho_parceiro: "aposentadoria"
    });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "inicio_multi_regime_pergunta_parceiro",
      severity: "info",
      message: "Saindo da fase regime_trabalho_parceiro → inicio_multi_regime_pergunta_parceiro (APOSENTADORIA)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Perfeito! 👍",
        "Só pra eu montar certinho o perfil do parceiro(a):",
        "Ele(a) tem *mais algum regime de trabalho* além desse?",
        "Responda *sim* ou *não*."
      ],
      "inicio_multi_regime_pergunta_parceiro"
    );
  }

  // -----------------------------
  // NÃO ENTENDIDO
  // -----------------------------

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "regime_trabalho_parceiro",
    severity: "info",
    message: "Entrada não compreendida → permanece na fase regime_trabalho_parceiro",
    details: { userText }
  });

  return step(
    env,
    st,
    [
      "Só pra confirmar 😊",
      "O parceiro(a) trabalha como **CLT**, **autônomo(a)** ou **servidor(a)**?"
    ],
    "regime_trabalho_parceiro"
  );
}

// =========================================================
// 🧩 C21 — RENDA (TITULAR)
// =========================================================
case "renda": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "renda"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: renda",
    details: {
      last_user_text: st.last_user_text || null,
      somar_renda: st.somar_renda || null,
      parceiro_tem_renda: st.parceiro_tem_renda || null
    }
  });

  // Exemplos cobertos: "2500", "2.500", "2,5k", "r$ 2.500"
  const valor = parseMoneyBR(t); // captura número digitado

  // -----------------------------------
  // VALOR VÁLIDO
  // -----------------------------------
  if (!isNaN(valor) && valor > 300) {

    await upsertState(env, st.wa_id, {
      renda: valor,
      renda_total_para_fluxo: valor
    });

    const somarRendaSozinho = st.somar_renda === false || st.somar_renda === "sozinho";
    const rendaParceiroJaInformada = Number(st.renda_parceiro || 0) > 0;
    const exigirComposicao = somarRendaSozinho && valor < 3000;

// Se já existe regime/renda do parceiro, não pode perguntar "tem renda?" de novo
const parceiroJaInformado = !!(
  st.parceiro_tem_renda === true ||
  st.regime_trabalho_parceiro ||
  st.renda_parceiro
);

// 🟩 EXIT → próxima fase é renda_parceiro OU quem_pode_somar OU possui_renda_extra
const precisaConfirmarRendaParceiro =
  !!st.somar_renda &&
  !rendaParceiroJaInformada &&
  st.parceiro_tem_renda !== true &&
  st.parceiro_tem_renda !== false;

    const nextStage = precisaConfirmarRendaParceiro
  ? "parceiro_tem_renda"
  : (st.somar_renda && st.parceiro_tem_renda && !rendaParceiroJaInformada)
  ? "renda_parceiro"
  : (exigirComposicao ? "quem_pode_somar" : "inicio_multi_renda_pergunta");

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: nextStage,
      severity: "info",
      message: "Saindo da fase renda",
      details: {
        renda_titular: valor,
        somar_renda: st.somar_renda || null,
        parceiro_tem_renda: st.parceiro_tem_renda || null,
        precisa_confirmar_renda_parceiro: precisaConfirmarRendaParceiro,
        exigir_composicao: exigirComposicao
      }
    });

    if (precisaConfirmarRendaParceiro) {
      return step(
        env,
        st,
        [
          "Perfeito! 👍",
          "Pra seguir certinho no financiamento em conjunto:",
          "Seu parceiro(a) **tem renda** ou **não tem renda** no momento?"
        ],
        "parceiro_tem_renda"
      );
    }

    // Se tinha parceiro com renda → pergunta renda dele(a)
    if (st.somar_renda && st.parceiro_tem_renda && !rendaParceiroJaInformada) {
      return step(
        env,
        st,
        [
          "Perfeito! 👍",
          "Agora me diga a **renda mensal** do parceiro(a)."
        ],
        "renda_parceiro"
      );
    }

    // Se escolheu seguir sozinho(a), mas renda titular ficou abaixo de 3k
    if (exigirComposicao) {
      return step(
        env,
        st,
        [
          "Entendi 👍",
          "Para essa renda, preciso considerar composição para continuar a análise.",
          "Com quem você pode somar renda? Parceiro(a), familiar ou ninguém?"
        ],
        "quem_pode_somar"
      );
    }

    // Se é só o titular
    return step(
      env,
      st,
      [
        "Show! 👌",
        "Você possui **alguma fonte de renda a mais**, fora essa renda?"
      ],
      "inicio_multi_renda_pergunta"
    );
  }

  // -----------------------------------
  // NÃO ENTENDIDO / NÃO NUMÉRICO
  // -----------------------------------

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "renda",
    severity: "info",
    message: "Valor inválido informado → permanece na fase renda",
    details: { userText }
  });

  return step(
    env,
    st,
    [
      "Só pra confirmar certinho 😊",
      "Qual é sua **renda mensal aproximada**, em reais?"
    ],
    "renda"
  );
}

// =========================================================
// 🧩 C22 — RENDA DO PARCEIRO(A)
// =========================================================
case "renda_parceiro": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "renda_parceiro"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: renda_parceiro",
    details: {
      last_user_text: st.last_user_text || null,
      regime_parceiro: st.regime_trabalho_parceiro || null,
      renda_titular: st.renda || st.renda_total_para_fluxo || null
    }
  });

  const valor = parseMoneyBR(t);

  // -----------------------------------
  // VALOR INVÁLIDO
  // -----------------------------------
  if (!valor || isNaN(valor) || valor < 200) {
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "renda_parceiro",
      severity: "info",
      message: "Valor inválido informado → permanece em renda_parceiro",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Acho que não entendi certinho 🤔",
        "Qual é a **renda mensal** do parceiro(a)?"
      ],
      "renda_parceiro"
    );
  }

  // -----------------------------------
  // SALVA RENDA BASE DO PARCEIRO
  // -----------------------------------
  await upsertState(env, st.wa_id, {
    renda_parceiro: valor,
    parceiro_tem_renda: true,
    somar_renda: true
  });

  // Renda parcial (titular + base parceiro)
  const rendaTitular = Number(st.renda || st.renda_total_para_fluxo || 0);
  const rendaTotalParcial = rendaTitular + valor;

  await upsertState(env, st.wa_id, {
    renda_total_para_fluxo: rendaTotalParcial
  });

  // -----------------------------------
  // NOVO: perguntar multi-renda do parceiro ANTES de seguir
  // -----------------------------------
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "inicio_multi_renda_pergunta_parceiro",
    severity: "info",
    message: "Saindo de renda_parceiro → inicio_multi_renda_pergunta_parceiro",
    details: {
      renda_parceiro: valor,
      renda_titular: rendaTitular,
      renda_total_parcial: rendaTotalParcial
    }
  });

  return step(
    env,
    st,
    [
      "Perfeito! 👍",
      `Já anotei a renda principal do parceiro(a): **R$ ${valor.toLocaleString("pt-BR")}**.`,
      "Ele(a) possui *mais alguma renda* além dessa?",
      "Responda *sim* ou *não*."
    ],
    "inicio_multi_renda_pergunta_parceiro"
  );
} // <-- FECHAR o case "renda_parceiro" aqui

// =========================================================
// 🧩 C23 — RENDA DO FAMILIAR QUE COMPÕE
// =========================================================
case "renda_parceiro_familiar": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "renda_parceiro_familiar"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_stage",
    stage,
    severity: "info",
    message: "Entrou na fase renda_parceiro_familiar",
    details: { last_user_text: st.last_user_text }
  });

  const modoFamiliar = isModoFamiliar(st);
  const valor = parseMoneyBR(userText);

  if (!valor || valor <= 0) {
    return step(
      env,
      st,
      [
        "Entendi 👍",
        "Me diga o valor aproximado da renda dessa pessoa (somente número).",
        "Ex: 2500"
      ],
      "renda_parceiro_familiar"
    );
  }

  if (modoFamiliar) {
    await upsertState(env, st.wa_id, {
      renda_parceiro: valor,
      multi_renda_lista: appendOwned(st.multi_renda_lista, { tipo: "renda base", valor, ts: Date.now() }, "familiar")
    });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "inicio_multi_renda_familiar_pergunta",
      severity: "info",
      message: "Saindo da fase renda_parceiro_familiar (modo familiar) → inicio_multi_renda_familiar_pergunta",
      details: { renda_familiar: valor }
    });

    return step(env, st, ["Perfeito! 👌", "Esse familiar possui mais alguma renda além dessa?"], "inicio_multi_renda_familiar_pergunta");
  }

  // Soma com renda do titular (fluxo composição legado fora do modo_familiar)
  const rendaTitular = Number(st.renda_total_para_fluxo || st.renda || 0);
  const rendaTotal = rendaTitular + valor;

  await upsertState(env, st.wa_id, {
    renda_parceiro: valor,
    renda_total_para_fluxo: rendaTotal,
    somar_renda: true,
    financiamento_conjunto: true
  });

  const p3Required = st.p3_required === true;
  const p3Done = st.p3_done === true;
  const nextStage = (p3Required && !p3Done) ? "regime_trabalho_parceiro_familiar_p3" : "ctps_36_parceiro";

  return step(env, st, ["Perfeito! 👌", "Ótimo! Renda registrada ✅"], nextStage);
}

// =========================================================
// 🧩 C24 — RENDA MISTA DETALHE (ex: 2000 CLT + 1200 Uber)
// =========================================================
case "renda_mista_detalhe": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "renda_mista_detalhe"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: renda_mista_detalhe",
    details: {
      last_user_text: st.last_user_text || null,
      regime_titular: st.regime || null,
      renda_total_atual: st.renda_total_para_fluxo || null
    }
  });

  // Extrai múltiplos números (ex: 2000 e 1200)
  const numeros = t.match(/\d+/g);

  // ============================================================
  // NÚMEROS INSUFICIENTES / FORMATO ERRADO
  // ============================================================
  if (!numeros || numeros.length < 2) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "renda_mista_detalhe",
      severity: "warning",
      message: "Formato inválido de renda mista — retornando para mesma fase",
      details: {
        userText: t,
        numeros_detectados: numeros || null
      }
    });

    return step(
      env,
      st,
      [
        "Pode me detalhar certinho? 🤔",
        "Exemplo: *2000 CLT + 1200 Uber*"
      ],
      "renda_mista_detalhe"
    );
  }

  // ============================================================
  // NÚMEROS VÁLIDOS
  // ============================================================
  const valores = numeros.map(n => parseFloat(n));
  const total = valores.reduce((a, b) => a + b, 0);

  await upsertState(env, st.wa_id, {
    renda_formal: valores[0],
    renda_informal: valores[1],
    renda_total_para_fluxo: total,
    renda_mista: true
  });

  // ============================================================
  // EXIT → Próxima fase: ir_declarado
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "ir_declarado",
    severity: "info",
    message: "Saindo da fase renda_mista_detalhe → ir_declarado",
    details: {
      renda_formal: valores[0],
      renda_informal: valores[1],
      renda_total: total
    }
  });

  return step(
    env,
    st,
    [
      "Show! 👏",
      `Sua renda combinada ficou aproximadamente *R$ ${total}*.`,
      "Você declara **Imposto de Renda**?"
    ],
    "ir_declarado"
  );
}

// =========================================================
// 🧩 C25 — POSSUI RENDA EXTRA? (CLT abaixo do mínimo)
// =========================================================
case "possui_renda_extra": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "possui_renda_extra"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: possui_renda_extra",
    details: {
      renda_titular: st.renda || null,
      regime: st.regime || null,
      renda_total_atual: st.renda_total_para_fluxo || null
    }
  });

  const sim = /(sim|tenho|faço|faco|uber|ifood|extra|bico)/i.test(t);
  const nao = /^(nao|não|n\s?tem|nenhuma|zero)$/i.test(String(t || "").trim());

  // ============================================================
  // SIM — possui renda extra → vai para renda_mista_detalhe
  // ============================================================
  if (sim) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "renda_mista_detalhe",
      severity: "info",
      message: "Saindo de possui_renda_extra → renda_mista_detalhe (resposta: SIM)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Perfeito! 👏",
        "Me diga então quanto você faz por mês nessa renda extra.",
        "Exemplo: *1200 Uber*"
      ],
      "renda_mista_detalhe"
    );
  }

  // ============================================================
  // NÃO — segue para IR declarado
  // ============================================================
  if (nao) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "ir_declarado",
      severity: "info",
      message: "Saindo de possui_renda_extra → ir_declarado (resposta: NÃO)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Entendi! 👍",
        "Mesmo assim vou seguir com sua análise.",
        "Você declara **Imposto de Renda**?"
      ],
      "ir_declarado"
    );
  }

  // ============================================================
  // NÃO ENTENDIDO — permanece na mesma fase
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "possui_renda_extra",
    severity: "warning",
    message: "Resposta ambígua → permanecendo na fase possui_renda_extra",
    details: { userText }
  });

  return step(
    env,
    st,
    [
      "Só pra confirmar 😊",
      "Você tem **alguma renda extra** além do trabalho principal?"
    ],
    "possui_renda_extra"
  );
}

// =========================================================
// 🧩 C26 — INTERPRETAR COMPOSIÇÃO (quando renda não fecha)
// =========================================================
case "interpretar_composicao": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "interpretar_composicao"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: interpretar_composicao",
    details: {
      renda_total: st.renda_total_para_fluxo || null,
      regime: st.regime || null,
      somar_renda: st.somar_renda || null
    }
  });

  const composicaoSignal = parseComposicaoRenda(t);
  const parceiro = composicaoSignal === "parceiro" || /(parceir|namorad|espos|marid|mulher|boy|girl)/i.test(t);
  const familia  = composicaoSignal === "familiar" || /(pai|m[aã]e|mae|irm[aã]|av[oó]|tia|tio|primo|prima|famil)/i.test(t);
  const sozinho  = /(s[oó]\s*(a\s*)?minha(\s+renda)?|s[oó]\s*eu|apenas eu|somente eu|solo|sozinh|nao tenho ninguem|não tenho ningu[eé]m|ninguem para somar|ningu[eé]m pra somar|sem ningu[eé]m)/i.test(t);

  // ============================================================
  // OPÇÃO 1 — COMPOR COM PARCEIRO(A)
  // ============================================================
  if (parceiro) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho_parceiro",
      severity: "info",
      message: "Composição escolhida: parceiro(a)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Perfeito! 👏",
        "Vamos considerar renda com parceiro(a).",
        "Ele(a) trabalha com **CLT, autônomo(a) ou servidor(a)?**"
      ],
      "regime_trabalho_parceiro"
    );
  }

  // ============================================================
  // OPÇÃO 2 — COMPOR COM FAMILIAR
  // ============================================================
  if (familia) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "somar_renda_familiar",
      severity: "info",
      message: "Composição escolhida: familiar",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Show! 👏",
        "Vamos compor renda com familiar.",
        "Qual familiar você quer usar? (pai, mãe, irmão, irmã, tio, tia, avô, avó...)"
      ],
      "somar_renda_familiar"
    );
  }

  // ============================================================
  // OPÇÃO 3 — SEGUIR SOZINHO(A)
  // ============================================================
  if (sozinho) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "ir_declarado",
      severity: "info",
      message: "Composição escolhida: seguir sozinho(a)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Entendi! 👍",
        "Então seguimos só com a sua renda.",
        "Você declara **Imposto de Renda**?"
      ],
      "ir_declarado"
    );
  }

  // ============================================================
  // NÃO ENTENDIDO — permanece na mesma fase
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "interpretar_composicao",
    severity: "warning",
    message: "Resposta não identificada → permanecendo em interpretar_composicao",
    details: { userText }
  });

  return step(
    env,
    st,
    [
      "Pra gente seguir certinho 😊",
      "Você pretende usar renda de *parceiro(a)*, *familiar*, ou seguir *sozinho(a)*?"
    ],
    "interpretar_composicao"
  );
}

// =========================================================
// 🧩 C27 — QUEM PODE SOMAR RENDA?
// =========================================================
case "quem_pode_somar": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "quem_pode_somar"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: quem_pode_somar",
    details: {
      renda_total: st.renda_total_para_fluxo || null,
      somar_renda: st.somar_renda || null,
      regime: st.regime || null
    }
  });

  const tRaw = String(userText || "").trim();
  st.__cognitive_stage_answer = null;

  // Normalização de mojibake / caracteres quebrados (PowerShell/console)
  const t = tRaw
    .replace(/Ã¡/g, "á")
    .replace(/Ã /g, "à")
    .replace(/Ã¢/g, "â")
    .replace(/Ã£/g, "ã")
    .replace(/Ã©/g, "é")
    .replace(/Ãª/g, "ê")
    .replace(/Ã­/g, "í")
    .replace(/Ã´/g, "ô")
    .replace(/Ãµ/g, "õ")
    .replace(/Ãº/g, "ú")
    .replace(/Ã§/g, "ç")
    .replace(/Ã³/g, "ó")
    .replace(/ï¿½/g, "")
    .replace(/¿½/g, "");

  const tBase = t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const tLower = t.toLowerCase();

  const composicaoSignal = parseComposicaoRenda(t);

  // IMPORTANTE: dependente/filho NÃO é composição de renda
  const mencionouDependente =
    /(filho|filha|filhos|filhas|dependente|dependentes|crianca|criancas|bebe|bebes)/i.test(tBase);

  const sozinho =
    /(so\s*(a\s*)?minha(\s+renda)?|so\s*eu|apenas eu|somente eu|solo|sozinh|nao tenho ninguem|ninguem(\s*(para|pra)\s*somar)?|sem ninguem)/i.test(tBase);

  const parceiro =
    composicaoSignal === "parceiro" ||
    /(parceir|namorad|espos|marid|mulher|boy|girl)/i.test(tBase);

  // 🔧 REFORÇO PESADO — familiar (mãe/pai etc.)
  const familia =
    composicaoSignal === "familiar" ||
    /\b(meu\s+pai|minha\s+mae|minha\s+m[aã]e|minha\s+familia|minha\s+família|minha\s+avo|minha\s+av[oó]|meu\s+avo|meus\s+pais)\b/i.test(tLower) ||
    /(pai|m[aã]e|irma|irm[aã]o|av[oó]|v[oó]|tia|tio|primo|prima|famil)/i.test(tLower);

  // ============================================================
  // GUARD — MENCIONOU FILHOS/DEPENDENTES (não compõe renda)
  // ============================================================
  if (mencionouDependente) {
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "quem_pode_somar",
      severity: "info",
      message: "Usuário mencionou dependentes (não compõe renda) → repete orientação",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Perfeito, entendi 👍",
        "Filhos/dependentes ajudam no perfil, mas **não entram para somar renda** no financiamento.",
        "Pra seguir aqui, me diga: você vai somar com **parceiro(a)**, com **familiar** (pai/mãe/irmão), ou vai seguir **só com sua renda**?"
      ],
      "quem_pode_somar"
    );
  }

  // ============================================================
  // OPÇÃO — SEGUIR SOZINHO(A)
  // ============================================================
  if (sozinho) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "fim_ineligivel",
      severity: "info",
      message: "Composição escolhida: só o titular",
      details: { userText }
    });

    await upsertState(env, st.wa_id, {
      somar_renda: false,
      financiamento_conjunto: false,
      motivo_ineligivel: "renda_baixa_sem_composicao",
      funil_status: "ineligivel"
    });

    return step(
      env,
      st,
      [
        "Entendi! 👍",
        "Sem alguém para compor renda, com esse valor não consigo seguir no fluxo de aprovação agora.",
        "Vou te explicar certinho o que isso significa e como você pode resolver, se quiser."
      ],
      "fim_ineligivel"
    );
  }

  // ============================================================
  // OPÇÃO — PARCEIRO(A)
  // ============================================================
  if (parceiro) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho_parceiro",
      severity: "info",
      message: "Composição escolhida: parceiro(a)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Perfeito! 👏",
        "Vamos considerar renda com parceiro(a).",
        "Ele(a) trabalha com **CLT, autônomo(a) ou servidor(a)?**"
      ],
      "regime_trabalho_parceiro"
    );
  }

    // ============================================================
  // OPÇÃO — FAMILIAR
  // ============================================================
  if (familia) {

    // Extrai familiar específico, se o texto já veio com "minha mãe", "meu pai" etc.
    const fam =
      /\b(mae|minha\s+mae|minha\s+m[aã]e)\b/i.test(tBase) ? "mae" :
      /\b(pai|meu\s+pai)\b/i.test(tBase) ? "pai" :
      /\b(irmao|meu\s+irmao|irma|minha\s+irma)\b/i.test(tBase) ? "irmao" :
      /\b(tio|tia)\b/i.test(tBase) ? "tio" :
      /\b(avo|avos|vo|vos|vovo|vovos)\b/i.test(tBase) ? "avo" :
      /\b(primo|prima)\b/i.test(tBase) ? "primo" :
      null;

    // Se já identificou qual familiar é, pula a pergunta redundante
    if (fam) {

      // Define label "seu/sua" (simples e direto)
      const famLabel =
        fam === "mae" ? "sua mãe" :
        fam === "pai" ? "seu pai" :
        fam === "irmao" ? "seu irmão(ã)" :
        fam === "tio" ? "seu tio(a)" :
        fam === "avo" ? "seu avô/avó" :
        fam === "primo" ? "seu primo(a)" :
        "esse familiar";

      // Se for mãe/pai, entra no gate do casamento civil (P3)
      const nextStage = (fam === "mae" || fam === "pai")
        ? "pais_casados_civil_pergunta"
        : "regime_trabalho_parceiro_familiar";

      await funnelTelemetry(env, {
        wa_id: st.wa_id,
        event: "exit_stage",
        stage,
        next_stage: nextStage,
        severity: "info",
        message: `Composição escolhida: familiar (${fam})`,
        details: { userText, fam }
      });

      // Mantém padrão de state do familiar
      // (mesmo padrão que você já faz no somar_renda_familiar)
      if (fam === "mae" || fam === "pai") {
        await upsertState(env, st.wa_id, {
          familiar_tipo: fam,
          p3_required: false,
          p3_done: false,
          p3_tipo: null
        });

        return step(
          env,
          st,
          [
            "Show! 👌",
            `Beleza, vamos considerar ${famLabel}.`,
            "Seus pais são casados no civil atualmente? (sim/não)"
          ],
          "pais_casados_civil_pergunta"
        );
      }

      await upsertState(env, st.wa_id, { familiar_tipo: fam });

      return step(
        env,
        st,
        [
          "Show! 👌",
          `Beleza, vamos considerar ${famLabel}.`,
          `${famLabel.charAt(0).toUpperCase() + famLabel.slice(1)} trabalha com **carteira assinada**, é **autônomo(a)** ou **servidor(a)**?`
        ],
        "regime_trabalho_parceiro_familiar"
      );
    }

    // Se NÃO identificou qual familiar, mantém o fluxo atual perguntando
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "somar_renda_familiar",
      severity: "info",
      message: "Composição escolhida: familiar (genérico)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Show! 👌",
        "Vamos compor renda com familiar.",
        "Qual familiar você quer usar? (pai, mãe, irmão, irmã, tio, tia, avô, avó...)"
      ],
      "somar_renda_familiar"
    );
  }

  // ============================================================
  // NÃO ENTENDIDO — permanece na fase
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "quem_pode_somar",
    severity: "warning",
    message: "Resposta ambígua → permanecendo em quem_pode_somar",
    details: { userText }
  });

  return step(
    env,
    st,
    [
      "De quem você pretende usar renda para somar? 😊",
      "Parceiro(a)? Familiar? Ou só você mesmo?"
    ],
    "quem_pode_somar"
  );
}
      
// =========================================================
// 🧩 C28 — SUGERIR COMPOSIÇÃO PARA RENDA MISTA BAIXA
// =========================================================
case "sugerir_composicao_mista": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "sugerir_composicao_mista"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: sugerir_composicao_mista",
    details: {
      renda_titular: st.renda || null,
      renda_total: st.renda_total_para_fluxo || null,
      renda_mista: st.renda_mista || null
    }
  });

  const parceiro = /(parceir|namorad|espos|marid|mulher|boy|girl)/i.test(t);
  const familia  = /(pai|m[aã]e|mae|irma|irm[aã]|av[oó]|tia|tio|primo|prima|famil)/i.test(t);

  // ============================================================
  // OPÇÃO — PARCEIRO(A)
  // ============================================================
  if (parceiro) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho_parceiro",
      severity: "info",
      message: "Usuário escolheu compor com parceiro(a)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Boa! 👏",
        "Vamos considerar renda com parceiro(a).",
        "Ele(a) trabalha com **CLT, autônomo(a) ou servidor(a)?**"
      ],
      "regime_trabalho_parceiro"
    );
  }

  // ============================================================
  // OPÇÃO — FAMILIAR
  // ============================================================
  if (familia) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho_parceiro_familiar",
      severity: "info",
      message: "Usuário escolheu compor com familiar",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Perfeito! 👌",
        "Vamos usar renda de familiar.",
        "Qual o **tipo de trabalho** dessa pessoa?"
      ],
      "regime_trabalho_parceiro_familiar"
    );
  }

  // ============================================================
  // NÃO ENTENDIDO — permanece na fase
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "sugerir_composicao_mista",
    severity: "warning",
    message: "Resposta não identificada → permanece em sugerir_composicao_mista",
    details: { userText }
  });

  return step(
    env,
    st,
    [
      "Show! 😄",
      "Com essa renda mista, a melhor forma de conseguir aprovação é somando com alguém.",
      "Quer usar renda de *parceiro(a)* ou de *familiar*?"
    ],
    "sugerir_composicao_mista"
  );
}

// =========================================================
// 🧩 C29 — IR DECLARADO (titular ou parceiro autônomo)
// =========================================================
case "ir_declarado": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "ir_declarado"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: ir_declarado",
    details: {
      regime_titular: st.regime || null,
      regime_parceiro: st.regime_parceiro || st.regime_trabalho_parceiro || null,
      renda_titular: st.renda || st.renda_titular || null,
      renda_parceiro: st.renda_parceiro || null
    }
  });

  const regimeParceiro = st.regime_parceiro || st.regime_trabalho_parceiro || null;

  const yes = isYes(t);
  const no = isNo(t);

  // ============================================================
  // RESPOSTA CONFUSA
  // ============================================================
  if (!yes && !no) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "ir_declarado",
      severity: "warning",
      message: "Resposta ambígua sobre IR — permanecendo na fase",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Só pra confirmar 😊",
        "Você (ou o parceiro[a]) **declara Imposto de Renda atualmente?**",
        "Pode responder com *sim* ou *não*."
      ],
      "ir_declarado"
    );
  }

  // Normalização autônomos
  const isAutTitular  = st.regime === "AUTONOMO" || st.regime === "autonomo";
  const isAutParceiro = regimeParceiro === "AUTONOMO" || regimeParceiro === "autonomo";

  const rendaTitular  = Number(st.renda || st.renda_titular || 0);
  const rendaParceiro = Number(st.renda_parceiro || 0);

  // ============================================================
  // DECLARA IR
  // ============================================================
  if (yes) {

    await upsertState(env, st.wa_id, {
      ir_declarado: true,
      ir_declarado_por: isAutParceiro ? "parceiro" : "titular"
    });

    // Próxima fase padrão
    let nextStage = "ctps_36";

    // Autônomo titular sem renda → pedir renda
    if (isAutTitular && !rendaTitular) nextStage = "renda";

    // Autônomo parceiro sem renda → pedir renda
    if (isAutParceiro && !rendaParceiro) nextStage = "renda_parceiro";

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: nextStage,
      severity: "info",
      message: "Declara IR — direcionando próxima fase",
      details: {
        isAutTitular,
        isAutParceiro,
        rendaTitular,
        rendaParceiro
      }
    });

    // 🔹 Autônomo titular sem renda informada → pedir renda
    if (isAutTitular && !rendaTitular) {
      return step(
        env,
        st,
        [
          "Perfeito! 👌",
          "Então me diz qual é a sua **renda mensal média**, considerando os últimos 12 meses."
        ],
        "renda"
      );
    }

    // 🔹 Autônomo parceiro sem renda informada → pedir renda
    if (isAutParceiro && !rendaParceiro) {
      return step(
        env,
        st,
        [
          "Show! 👌",
          "Agora me fala a **renda mensal** do parceiro(a), uma média do que ele(a) vem recebendo."
        ],
        "renda_parceiro"
      );
    }

    // 🔹 Já possui rendas → seguir para CTPS
    return step(
      env,
      st,
      [
        "Perfeito, isso ajuda bastante na análise. 👌",
        "Agora me fala:",
        "Você tem **36 meses de carteira assinada (CTPS)** nos últimos 3 anos?"
      ],
      "ctps_36"
    );
  }

  // ============================================================
  // NÃO DECLARA IR
  // ============================================================
  await upsertState(env, st.wa_id, {
    ir_declarado: false,
    ir_declarado_por: isAutParceiro ? "parceiro" : "titular"
  });

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "autonomo_compor_renda",
    severity: "info",
    message: "Não declara IR — seguindo para comprovação de renda autônoma",
    details: { userText }
  });

  return step(
    env,
    st,
    [
      "Tranquilo, dá pra analisar mesmo sem IR. 😉",
      "Só vou te fazer umas perguntinhas pra entender melhor como conseguimos **comprovar essa renda autônoma**."
    ],
    "autonomo_compor_renda"
  );
}

// =========================================================
// 🧩 C30 — AUTÔNOMO COMPOR RENDA
// =========================================================
case "autonomo_compor_renda": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "autonomo_compor_renda"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: autonomo_compor_renda",
    details: {
      regime: st.regime || null,
      renda_titular: st.renda || null,
      renda_total: st.renda_total_para_fluxo || null,
      somar_renda: st.somar_renda || null,
      veio_do_ir: st.ir_declarado === false ? "nao_declara" : "sim_declara"
    }
  });

  const sim =
    /(sim|pode|consigo|consigo sim|tenho|comprovo|declaro|faço|faco|faço declaração|emit[oó] nota|emito nota|rpa|recibo)/i.test(t);

  const nao =
    /^(n[aã]o|não consigo|nao consigo|não tenho|nao tenho|sem comprovante|nao declaro|não declaro)$/i.test(String(t || "").trim());

  // ============================================================
  // AUTÔNOMO CONSEGUE COMPROVAR
  // ============================================================
  if (sim) {

    await upsertState(env, st.wa_id, {
      autonomo_comprova: true
    });

    // Saída desta fase
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "renda",
      severity: "info",
      message: "Autônomo consegue comprovar renda — seguir para renda",
      details: { userText }
    });

    // 🚨 Correção cirúrgica:
    // se já existe renda_total_para_fluxo, NÃO sobrescrever depois.
    return step(
      env,
      st,
      [
        "Ótimo! 👏",
        "Então conseguimos usar sua renda como autônomo(a).",
        "Me diga o valor aproximado que você ganha por mês (média dos últimos meses)."
      ],
      "renda"
    );
  }

  // ============================================================
  // AUTÔNOMO NÃO CONSEGUE COMPROVAR
  // ============================================================
  if (nao) {

    await upsertState(env, st.wa_id, {
      autonomo_comprova: false
    });

    // EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "interpretar_composicao",
      severity: "info",
      message: "Autônomo NÃO consegue comprovar — direcionando p/ interpretar_composicao",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Tranquilo, isso é super comum! 👍",
        "Quando o cliente é autônomo e **não consegue comprovar**, existem alternativas.",
        "Você pretende somar renda com **parceiro(a)**, **familiar**, ou prefere seguir **sozinho(a)**?"
      ],
      "interpretar_composicao"
    );
  }

  // ============================================================
  // NÃO ENTENDIDO
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "autonomo_compor_renda",
    severity: "warning",
    message: "Resposta ambígua sobre comprovação de renda — permanecendo na fase",
    details: { userText }
  });

  return step(
    env,
    st,
    [
      "Só pra confirmar 👍",
      "Você consegue **comprovar sua renda** de autônomo(a) (recibos, notas, extratos ou declaração)?"
    ],
    "autonomo_compor_renda"
  );
}

// =========================================================
// 🧩 C31 — CTPS 36 MESES (Titular)
// =========================================================
case "ctps_36": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "ctps_36"
  // ============================================================
  // ✅ GATE: se já tem 36 em qualquer um, não pergunta de novo
if (st.ctps_36_parceiro === true || st.p3_ctps_36 === true) {
  await upsertState(env, st.wa_id, { ctps_36: null }); // opcional: não precisa forçar true aqui
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "restricao",
    severity: "info",
    message: "CTPS titular pulado: já confirmado 36m em outro participante",
    details: { ctps_36_parceiro: st.ctps_36_parceiro ?? null, p3_ctps_36: st.p3_ctps_36 ?? null }
  });

  return step(
    env,
    st,
    [
      "Perfeito! 👏",
      "Agora só preciso confirmar:",
      "Você está com **alguma restrição no CPF**?"
    ],
    "restricao"
  );
}

  // Texto bruto + normalizado (centralizado no helper global)
const t = String(userText || "").trim();
const tNorm = normalizeText(t);

  // Token simples (evita depender de \b em casos chatos)
  const hasWord = (w) => new RegExp(`(^|\\s)${w}(\\s|$)`, "i").test(tNorm);

  // Negação explícita sobre 36 meses
  const temNegacao36 =
    /(nao)\s+(tenho|possuo|completei|completo|completa|tem|possui)/i.test(tNorm) ||
    /(menos de\s*36)/i.test(tNorm) ||
    /(menos de\s*3 anos)/i.test(tNorm) ||
    /(nao\s+tem\s+36)/i.test(tNorm);

  // "não sei"
  const nao_sei =
    /(nao sei|nao lembro|talvez|acho)/i.test(tNorm);

  // "sim" / positivo
  const sim =
    !temNegacao36 &&
    !nao_sei &&
    (
      hasWord("sim") ||
      /(tenho|possuo|possui|completo|completa)/i.test(tNorm) ||
      /(mais de\s*36|acima de\s*36)/i.test(tNorm) ||
      /(mais de\s*3 anos|3 anos ou mais)/i.test(tNorm) ||
      /(desde\s*20\d{2})/i.test(tNorm)
    );

  // "não" (inclui "nao" simples e frases comuns)
  const nao =
    !nao_sei &&
    !sim &&
    (
      temNegacao36 ||
      hasWord("nao") ||
      tNorm === "n" ||
      /(nao tem|nao possui|nao completo|nao completei)/i.test(tNorm) ||
      /(menos de\s*36|menos de\s*3 anos)/i.test(tNorm)
    );

  const ehFinanciamentoConjunto = (
  st.financiamento_conjunto === true ||
  st.somar_renda === true
);

  const rendaTotalFluxoNum = Number(st.renda_total_para_fluxo || st.renda || 0);

  await funnelTelemetry(env, {
  wa_id: st.wa_id,
  event: "ctps_36_debug_gate",
  stage,
  severity: "warning",
  message: "DEBUG ctps_36 gate decision",
  details: {
    userText_raw: String(userText || ""),
    userText_norm: tNorm,
    sim,
    nao,
    nao_sei,
    renda: st.renda ?? null,
    renda_total_para_fluxo: st.renda_total_para_fluxo ?? null,
    rendaTotalFluxoNum,
    financiamento_conjunto: st.financiamento_conjunto ?? null,
    parceiro_tem_renda: st.parceiro_tem_renda ?? null,
    somar_renda: st.somar_renda ?? null,
    somar_renda_familiar: st.somar_renda_familiar ?? null,
    regime_trabalho: st.regime_trabalho ?? st.regime ?? null,
    regime_trabalho_parceiro: st.regime_trabalho_parceiro ?? null
  }
});
  
  const devePerguntarDependenteSolo = !ehFinanciamentoConjunto && rendaTotalFluxoNum > 0 && rendaTotalFluxoNum < 4000;

  // ============================================================
  // SIM — Possui 36 meses
  // ============================================================
  if (sim) {

    await upsertState(env, st.wa_id, { ctps_36: true });

    const nextStage = ehFinanciamentoConjunto
      ? "restricao"
      : (devePerguntarDependenteSolo ? "dependente" : "restricao");

    if (ehFinanciamentoConjunto) {
      await upsertState(env, st.wa_id, {
        dependente: true,
        tem_dependente: true,
        dependentes_qtd: 1,
        fator_social: true
      });
    }

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: nextStage,
      severity: "info",
      message: "CTPS >=36 verificado",
      details: {
        somar_renda: st.somar_renda,
        financiamento_conjunto: st.financiamento_conjunto || null,
        renda_total_para_fluxo: st.renda_total_para_fluxo || null
      }
    });

    if (nextStage === "dependente") {
      return step(
        env,
        st,
        [
          "Perfeito! 👏",
          "Agora me diga uma coisinha:",
          "Você tem **dependente menor de 18 anos**?"
        ],
        "dependente"
      );
    }

    return step(
      env,
      st,
      [
        "Perfeito! 👏",
        "Agora só preciso confirmar:",
        "Você está com **alguma restrição no CPF**?"
      ],
      "restricao"
    );
  }

  // ============================================================
  // NÃO SABE INFORMAR
  // ============================================================
  if (nao_sei) {

  const ehFinanciamentoConjunto = (
  st.financiamento_conjunto === true ||
  st.somar_renda === true
);

    const rendaTotalFluxoNum2 = Number(st.renda_total_para_fluxo || st.renda || 0);
    const devePerguntarDependenteSolo2 = !ehFinanciamentoConjunto && rendaTotalFluxoNum2 > 0 && rendaTotalFluxoNum2 < 4000;

    const nextStage = ehFinanciamentoConjunto
      ? "ctps_36_parceiro"
      : (devePerguntarDependenteSolo2 ? "dependente" : "restricao");

    await upsertState(env, st.wa_id, { ctps_36: null });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: nextStage,
      severity: "warning",
      message: "Cliente não sabe CTPS — seguindo sem travar"
    });

    if (nextStage === "ctps_36_parceiro") {
      return step(
        env,
        st,
        [
          "Sem problema! 😊",
          "Mesmo sem saber certinho agora, dá pra seguir.",
          "O parceiro(a) tem **36 meses ou mais** de carteira assinada somando todos os registros?" 
        ],
        "ctps_36_parceiro"
      );
    }

    if (nextStage === "dependente") {
      return step(
        env,
        st,
        [
          "Sem problema! 😊",
          "Isso não impede de seguir.",
          "Agora me diga:",
          "Você tem **dependente menor de 18 anos**?"
        ],
        "dependente"
      );
    }

    return step(
      env,
      st,
      [
        "Sem problema! 😊",
        "Isso não impede a análise.",
        "Agora só preciso confirmar:",
        "Você está com **alguma restrição no CPF**?"
      ],
      "restricao"
    );
  }

  // ============================================================
  // NÃO — Não possui 36 meses
  // ============================================================
  if (nao) {

    await upsertState(env, st.wa_id, { ctps_36: false });

  const ehFinanciamentoConjunto = (
  st.financiamento_conjunto === true ||
  st.somar_renda === true
);

    const rendaTotalFluxoNum2 = Number(st.renda_total_para_fluxo || st.renda || 0);
    const devePerguntarDependenteSolo2 = !ehFinanciamentoConjunto && rendaTotalFluxoNum2 > 0 && rendaTotalFluxoNum2 < 4000;

    const nextStage = ehFinanciamentoConjunto
      ? "ctps_36_parceiro"
      : (devePerguntarDependenteSolo2 ? "dependente" : "restricao");

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: nextStage,
      severity: "info",
      message: "CTPS <36 verificado",
      details: {
        somar_renda: st.somar_renda,
        financiamento_conjunto: st.financiamento_conjunto || null,
        renda_total_para_fluxo: st.renda_total_para_fluxo || null
      }
    });

    if (nextStage === "dependente") {
      return step(
        env,
        st,
        [
          "Tranquilo, isso acontece bastante! 👍",
          "Isso não te impede de seguir, tá?",
          "Agora me diga:",
          "Você tem **dependente menor de 18 anos**?"
        ],
        "dependente"
      );
    }

    if (nextStage === "ctps_36_parceiro") {
      return step(
        env,
        st,
        [
          "Perfeito, obrigado por confirmar! 👍",
          "Agora me diga:",
          "O parceiro(a) tem **36 meses ou mais** de carteira assinada somando todos os registros"
        ],
        "ctps_36_parceiro"
      );
    }

    return step(
      env,
      st,
      [
        "Perfeito, obrigado por confirmar! 👍",
        "Agora só preciso confirmar:",
        "Você está com **alguma restrição no CPF**?"
      ],
      "restricao"
    );
  }

  // ============================================================
  // NÃO ENTENDIDO
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "ctps_36",
    severity: "warning",
    message: "Resposta não reconhecida — permanência na fase"
  });

  return step(
    env,
    st,
    [
      "Só pra confirmar certinho 😊",
      "Somando todos os seus empregos registrados na carteira de trabalho, você tem *36 meses ou mais de carteira assinada* (considerando todos os períodos)?"
    ],
    "ctps_36"
  );
}
      
// =========================================================
// 🧩 C32 — CTPS 36 MESES (PARCEIRO)
// =========================================================
case "ctps_36_parceiro": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "ctps_36_parceiro"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: ctps_36_parceiro",
    details: {
      somar_renda: st.somar_renda || null,
      regime_parceiro: st.regime_trabalho_parceiro || null,
      renda_parceiro: st.renda_parceiro || null
    }
  });

  const t = String(userText || "").trim();
  const tNorm = normalizeText(t);

  // ✅ GATE: se já tem 36m em qualquer outro (titular ou P3), não pergunta parceiro
  if (st.ctps_36 === true || st.p3_ctps_36 === true) {
    await upsertState(env, st.wa_id, { ctps_36_parceiro: null });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: isModoFamiliar(st) ? "restricao_parceiro" : "restricao",
      severity: "info",
      message: "CTPS parceiro pulado: já confirmado 36m em outro participante",
      details: { ctps_36: st.ctps_36 ?? null, p3_ctps_36: st.p3_ctps_36 ?? null }
    });

    return step(
      env,
      st,
      [
        "Perfeito! 👏",
        "Agora vou confirmar primeiro o **seu CPF**: tem alguma restrição?"
      ],
      isModoFamiliar(st) ? "restricao_parceiro" : "restricao"
    );
  }

  const ehFinanciamentoConjunto = (
    st.financiamento_conjunto === true ||
    st.somar_renda === true
  );

  const temNegacao36Parceiro =
    /(nao)\s+(tem|tenho|possui|possuo|completei|completo|completa)/i.test(tNorm) ||
    /(menos de\s*36)/i.test(tNorm) ||
    /(menos de\s*3 anos)/i.test(tNorm);

  const nao_sei =
    /(nao sei|talvez|acho|nao lembro)/i.test(tNorm);

  const sim =
    !temNegacao36Parceiro &&
    !nao_sei &&
    (
      /(^|\s)sim(\s|$)/i.test(tNorm) ||
      /(tem sim|possui|possuo|completo|completa|mais de 36|acima de 36|mais de 3 anos|3 anos ou mais|desde 20\d{2})/i.test(tNorm)
    );

  const nao =
    !nao_sei &&
    !sim &&
    (
      temNegacao36Parceiro ||
      /(^|\s)nao(\s|$)/i.test(tNorm)
    );

  const nextStageInformativo = "restricao";

  if (sim) {

    await upsertState(env, st.wa_id, { ctps_36_parceiro: true });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: nextStageInformativo,
      severity: "info",
      message: "Parceiro possui 36+ meses de CTPS — seguindo para restrição",
      details: {
        somar_renda: st.somar_renda,
        financiamento_conjunto: st.financiamento_conjunto || null,
        ehFinanciamentoConjunto
      }
    });

    await upsertState(env, st.wa_id, {
      dependente: true,
      tem_dependente: true,
      dependentes_qtd: 1,
      fator_social: true
    });

    return step(
      env,
      st,
      [
        "Perfeito! 👏",
        "Agora vamos só confirmar uma coisinha rápida:",
        "Você está com **alguma restrição no CPF**, como negativação?"
      ],
      isModoFamiliar(st) ? "restricao_parceiro" : "restricao"
    );
  }

  if (nao_sei) {
    await upsertState(env, st.wa_id, { ctps_36_parceiro: null });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: nextStageInformativo,
      severity: "warning",
      message: "Parceiro não sabe informar CTPS — seguindo para restrição",
      details: {
        somar_renda: st.somar_renda,
        financiamento_conjunto: st.financiamento_conjunto || null,
        ehFinanciamentoConjunto
      }
    });

    return step(
      env,
      st,
      [
        "Sem problema! 😊",
        "Mesmo sem ter o tempo certinho de carteira, isso não impede a análise.",
        "Agora vou confirmar primeiro o **seu CPF**: possui alguma restrição?"
      ],
      isModoFamiliar(st) ? "restricao_parceiro" : "restricao"
    );
  }

  if (nao) {

    await upsertState(env, st.wa_id, { ctps_36_parceiro: false });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: nextStageInformativo,
      severity: "info",
      message: "Parceiro NÃO tem 36 meses de CTPS — seguindo para restrição",
      details: {
        somar_renda: st.somar_renda,
        financiamento_conjunto: st.financiamento_conjunto || null,
        ehFinanciamentoConjunto
      }
    });

    await upsertState(env, st.wa_id, {
      dependente: true,
      tem_dependente: true,
      dependentes_qtd: 1,
      fator_social: true
    });

    return step(
      env,
      st,
      [
        "Sem problema! 👍",
        "Agora só mais uma coisinha:",
        "Você possui **alguma restrição no CPF**?"
      ],
      isModoFamiliar(st) ? "restricao_parceiro" : "restricao"
    );
  }

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "ctps_36_parceiro",
    severity: "warning",
    message: "Resposta não reconhecida — permanência na fase"
  });

  return step(
    env,
    st,
    [
      "Só pra confirmar certinho 😊",
      "O parceiro(a) tem **36 meses ou mais** de carteira assinada somando todos os registros?"
    ],
    "ctps_36_parceiro"
  );
}
      
// =============================================================
// 🔢 C33 - Cálculo global de renda do cliente + parceiro
// =============================================================

async function garantirRendaTotalCalculada(env, st) {
  // Se já foi calculada antes, não refaz
  if (st.renda_total_para_fluxo != null) {
    return;
  }

  // ⚠️ Ajuste os nomes dos campos abaixo se forem diferentes no seu estado
  const rendaBaseCliente = Number(st.renda_bruta || st.renda_base || 0);
  const rendaBaseParceiro = Number(st.renda_parceiro_bruta || st.renda_parceiro || 0);

  const multiRendasCliente = Array.isArray(st.multi_rendas) ? st.multi_rendas : [];
  const multiRendasParceiro = Array.isArray(st.multi_rendas_parceiro)
    ? st.multi_rendas_parceiro
    : [];

  const regimeCliente = (st.regime_trabalho || st.tipo_trabalho || "").toLowerCase();
  const regimeParceiro = (st.regime_trabalho_parceiro || st.tipo_trabalho_parceiro || "").toLowerCase();

  // 🧮 Calcula renda efetiva de cada pessoa com as regras que combinamos
  const rendaClienteCalculada = calcularRendaPessoa({
    base: rendaBaseCliente,
    multiRendas: multiRendasCliente,
    regime: regimeCliente
  });

  const rendaParceiroCalculada = calcularRendaPessoa({
    base: rendaBaseParceiro,
    multiRendas: multiRendasParceiro,
    regime: regimeParceiro
  });

  const rendaTotal = rendaClienteCalculada + rendaParceiroCalculada;

  const { faixaPrograma } = calcularFaixaRenda(rendaTotal);

  // Salva no estado
  await upsertState(env, st.wa_id, {
    renda_individual_calculada: rendaClienteCalculada || null,
    renda_parceiro_calculada: rendaParceiroCalculada || null,
    renda_total_composicao: rendaTotal || null,
    renda_total_para_fluxo: rendaTotal || null,
    faixa_renda_programa: faixaPrograma || null
  });

  // Atualiza objeto em memória também
  st.renda_individual_calculada = rendaClienteCalculada || null;
  st.renda_parceiro_calculada = rendaParceiroCalculada || null;
  st.renda_total_composicao = rendaTotal || null;
  st.renda_total_para_fluxo = rendaTotal || null;
  st.faixa_renda_programa = faixaPrograma || null;

  // Telemetria de apoio
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "renda_total_calculada",
    stage: st.fase_conversa || "desconhecido",
    severity: "info",
    message: "Renda total calculada para fluxo do MCMV",
    details: {
      rendaBaseCliente,
      rendaBaseParceiro,
      multiRendasClienteQtd: multiRendasCliente.length,
      multiRendasParceiroQtd: multiRendasParceiro.length,
      rendaClienteCalculada,
      rendaParceiroCalculada,
      rendaTotal,
      faixaPrograma
    }
  });
}

/**
 * Calcula a renda efetiva de UMA pessoa, aplicando:
 * - CLT + CLT extra → sempre soma
 * - CLT + bico (informal):
 *    - se CLT > 2550 → IGNORA informal para faixa
 *    - se CLT ≤ 2550 → soma informal (renda mista)
 * - outros regimes → soma tudo
 */
function calcularRendaPessoa({ base, multiRendas, regime }) {
  const baseNum = Number(base || 0);
  if (!multiRendas || !multiRendas.length) {
    return baseNum;
  }

  let totalFormalExtra = 0;   // ex: outro CLT
  let totalInformal = 0;      // ex: bico, freela, extra

  for (const item of multiRendas) {
    if (!item) continue;
    const tipo = (item.tipo || item.t || "").toString();
    const valor = Number(item.valor || item.v || 0);
    if (!valor || valor <= 0) continue;

    const classe = classificarTipoRendaExtra(tipo);

    if (classe === "formal") {
      totalFormalExtra += valor;
    } else {
      totalInformal += valor;
    }
  }

  // Regra específica para CLT
  if (regime.includes("clt")) {
    const rendaCLT = baseNum + totalFormalExtra;

    // Regra dos 2550 para renda mista
    if (baseNum > 2550) {
      // CLT já acima de 2550 → ignora bico para faixa
      return rendaCLT;
    } else {
      // CLT até 2550 → soma informal (mista)
      return rendaCLT + totalInformal;
    }
  }

  // Outros regimes (autônomo, servidor, aposentado, etc.) → soma tudo
  return baseNum + totalFormalExtra + totalInformal;
}

/**
 * Classifica o texto do tipo de renda em "formal" ou "informal".
 * Isso depende de como você escreve o "tipo" na coleta:
 * - "CLT", "registrado", "carteira assinada" → formal
 * - "bico", "freela", "extra", "autônomo", etc. → informal
 */
function classificarTipoRendaExtra(tipo) {
  const nt = normalizeText ? normalizeText(tipo || "") : (tipo || "").toLowerCase();

  if (
    /\b(clt|registrad|carteira assinad|empresa|contratad)\b/.test(nt)
  ) {
    return "formal";
  }

  // Por padrão, considera como informal / bico
  return "informal";
}

/**
 * Converte a renda total em faixa do programa (apenas para uso interno).
 * Armazena só F1/F2/F3/F4 no banco.
 */
function calcularFaixaRenda(total) {
  const renda = Number(total || 0);
  if (renda <= 0) {
    return { faixaPrograma: null };
  }

  let faixaPrograma = null;

  if (renda <= 2160) {
    faixaPrograma = "F1";
  } else if (renda <= 2850) {
    faixaPrograma = "F1";
  } else if (renda <= 4700) {
    faixaPrograma = "F2";
  } else if (renda <= 8600) {
    faixaPrograma = "F3";
  } else if (renda <= 12000) {
    faixaPrograma = "F4";
  } else {
    faixaPrograma = "FORA_MCMV";
  }

  return { faixaPrograma };
}

// =========================================================
// 🧩 C33 — DEPENDENTE (solo pergunta / composição pula)
// =========================================================
case "dependente": {

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: dependente",
    details: {
      financiamento_conjunto: st.financiamento_conjunto || null,
      somar_renda: st.somar_renda || null
    }
  });

  const rendaSoloParaRegra = Number(st.renda_total_para_fluxo || st.renda || 0);

  // --------------------------------------------
  // 1 — PULAR DEPENDENTES SE FOR COMPOSIÇÃO
  // --------------------------------------------
  if (st.financiamento_conjunto === true || st.somar_renda === true) {

    await upsertState(env, st.wa_id, {
      // Regra CEF: em financiamento conjunto, considerar pelo menos 1 dependente
      dependente: true,
      tem_dependente: true,
      dependentes_qtd: 1,
      fator_social: true
    });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "restricao",
      severity: "info",
      message: "Dependente pulado (fluxo conjunto ou composição ativada)"
    });

    return step(
      env,
      st,
      [
        "Perfeito! ✔️",
        "Agora me diz uma coisa importante:",
        "Tem alguma **restrição no CPF**? (Serasa, SPC, negativado)"
      ],
      "restricao"
    );
  }

  // --------------------------------------------
  // 1.1 — SOLO COM RENDA >= 4000 (NÃO PERGUNTA DEPENDENTE)
  // --------------------------------------------
  if (rendaSoloParaRegra >= 4000) {
    await upsertState(env, st.wa_id, {
      dependente: false,
      tem_dependente: false,
      dependentes_qtd: 0,
      fator_social: false
    });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "restricao",
      severity: "info",
      message: "Dependente pulado (solo com renda >= 4000)",
      details: {
        renda_solo_para_regra: rendaSoloParaRegra
      }
    });

    return step(
      env,
      st,
      [
        "Perfeito! ✔️",
        "Agora me diz uma coisa importante:",
        "Tem alguma **restrição no CPF**? (Serasa, SPC, negativado)"
      ],
      "restricao"
    );
  }

  // --------------------------------------------
  // 2 — PERGUNTA PARA SOLO
  // --------------------------------------------
  // Exemplos cobertos: "tenho 2 filhos", "tenho uma filha", "não tenho dependentes"
  const txt = (userText || "").toLowerCase();

  const sim =
    isYes(txt) || /(sim|tenho|filho|filha|filhos|crian[cç]a|menor|dependente|dependentes)/i.test(txt);

  const nao =
    isNo(txt) || /^(nao|não|nao tenho|não tenho|sem dependente|sem dependentes|só eu|somente eu|nenhum filho)$/i.test(String(txt || "").trim());

  const talvez =
    /(não sei|nao sei|talvez|acho|não lembro|nao lembro)/i.test(txt);

  // --------------------------------------------
  // SIM → possui dependente
  // --------------------------------------------
  if (sim) {

    await upsertState(env, st.wa_id, {
      dependente: true,
      tem_dependente: true,
      dependentes_qtd: 1,
      fator_social: true
    });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "restricao",
      severity: "info",
      message: "Dependente confirmado (solo)"
    });

    return step(
      env,
      st,
      [
        "Perfeito! 👌",
        "Agora me confirma:",
        "Tem alguma **restrição no CPF**? Serasa ou SPC?"
      ],
      "restricao"
    );
  }

  // --------------------------------------------
  // NÃO → sem dependente
  // --------------------------------------------
  if (nao) {

    await upsertState(env, st.wa_id, {
      dependente: false,
      tem_dependente: false,
      dependentes_qtd: 0,
      fator_social: false
    });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "restricao",
      severity: "info",
      message: "Sem dependente (solo)"
    });

    return step(
      env,
      st,
      [
        "Ótimo! 👍",
        "Agora me diz:",
        "Tem alguma **restrição no CPF**?"
      ],
      "restricao"
    );
  }

  // --------------------------------------------
  // TALVEZ
  // --------------------------------------------
  if (talvez) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "dependente",
      severity: "warning",
      message: "Dependente incerto — mantendo fase"
    });

    return step(
      env,
      st,
      [
        "Sem problema 😊",
        "Dependente é apenas **menor de 18 anos** ou alguém que dependa totalmente de você.",
        "Você diria que tem dependente ou não?"
      ],
      "dependente"
    );
  }

  // --------------------------------------------
  // NÃO ENTENDIDO
  // --------------------------------------------
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "dependente",
    severity: "warning",
    message: "Resposta não reconhecida — mantendo fase"
  });

  return step(
    env,
    st,
    [
      "Só pra confirmar 😊",
      "Você tem **dependente menor de 18 anos**?"
    ],
    "dependente"
  );
}

// =========================================================
// 🧩 C34 — RESTRIÇÃO (Serasa, SPC, pendências)
// =========================================================
case "restricao": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "restricao"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: restricao",
    details: {
      renda_total: st.renda_total_para_fluxo || null,
      financiamento_conjunto: st.financiamento_conjunto || null,
      somar_renda: st.somar_renda || null
    }
  });
  
  // Exemplos cobertos: "nome sujo", "negativado no serasa", "cpf limpo", "não sei"
  const temNaoTenho = /\b(n[aã]o|nao)\s+tenho\b/i.test(t);
  const temTermoRestricao = hasRestricaoIndicador(t);

  const sim =
    !temNaoTenho && (
      isYes(t) ||
      /^\s*tem\s*$/i.test(t) ||
      (!isNo(t) && temTermoRestricao) ||
      /(sou negativad[oa]|estou negativad[oa]|negativad[oa]|serasa|spc)/i.test(t) ||
      /\b(tenho|tem)\s+(restri[cç][aã]o|nome sujo|cpf sujo|d[ií]vida|divida|protesto)\b/i.test(t)
    );

  const incerto =
    /(nao sei|não sei|talvez|acho|pode ser|não lembro|nao lembro)/i.test(t);

  const nao =
    !incerto && (
      isNo(t) ||
      temNaoTenho ||
      /(tudo certo|cpf limpo|sem restri[cç][aã]o|sem divida|sem d[ií]vida|nome limpo)/i.test(t)
    );

  const ehFluxoConjunto =
  st.financiamento_conjunto === true ||
  st.somar_renda === true;

const titularJaRespondeuRestricao =
  st.restricao === true ||
  st.restricao === false ||
  st.restricao === "incerto";

// 2ª pergunta é do parceiro quando titular já tem restrição registrada
// e o parceiro ainda não foi registrado.
const segundaPerguntaParceiro =
  ehFluxoConjunto &&
  titularJaRespondeuRestricao &&
  (st.restricao_parceiro === null || typeof st.restricao_parceiro === "undefined");

  // 🔤 Label da "2ª pessoa" da restrição (casal x familiar/P3)
const pessoa2Label =
  st.financiamento_conjunto === true
    ? "parceiro(a)"
    : (st.familiar_tipo === "pai"
        ? "sua mãe"
        : st.familiar_tipo === "mae"
          ? "seu pai"
          : "cônjuge desse familiar");

// ✅ MODO FAMILIAR: não repetir restrição do familiar/P3 se já foram coletadas
const modoFamiliar =
  (st.composicao_pessoa === "familiar") || (st.familiar_tipo !== null && typeof st.familiar_tipo !== "undefined");

if (modoFamiliar) {
  const familiarJa = (st.restricao_parceiro !== null && typeof st.restricao_parceiro !== "undefined");
  const p3Precisa = (st.p3_required === true);
  const p3Ja = (st.p3_restricao !== null && typeof st.p3_restricao !== "undefined");

  // Se já tenho restrição do familiar e (se precisar) do P3, finaliza
  if (familiarJa && (!p3Precisa || p3Ja)) {
    return step(env, st,
      [
        "Perfeito! 👌",
        "Fechado. Vou te passar a lista de *documentos* pra gente dar sequência:",
        "",
        "📌 Você prefere:",
        "1) Enviar por aqui no WhatsApp",
        "2) Enviar pelo site",
        "3) Agendar uma visita presencial (decorado + simulação no plantão)"
      ],
      "envio_docs"
    );
  }
}

  // -----------------------------------------------------
  // CPF COM RESTRIÇÃO
  // -----------------------------------------------------
  if (sim) {

  // 2ª resposta (parceiro) no fluxo conjunto
  if (segundaPerguntaParceiro) {
    try {
      await upsertState(env, st.wa_id, { restricao_parceiro: true });
    } catch (_) {}

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "restricao",
      severity: "warning",
      message: "Parceiro confirmou restrição no CPF (checkpoint em restricao)"
    });

    const ambosComRestricao = st.restricao === true;

return step(env, st,
  [
    "Entendi 👍",
    "Só pra eu te orientar certinho:",
    ambosComRestricao
      ? "Vocês têm **possibilidade ou intenção de regularizar** essas restrições?"
      : "Quem está com restrição tem **possibilidade ou intenção de regularizar** essa restrição?",
    "Responda *sim* ou *não*."
  ],
  "regularizacao_restricao"
);
}

  // 1ª resposta (titular)
  await upsertState(env, st.wa_id, { restricao: true });

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "restricao",
    severity: "warning",
    message: "Titular confirmou restrição no CPF",
    details: { ehFluxoConjunto }
  });

  if (ehFluxoConjunto) {
    return step(env, st,
      [
        "Perfeito 👍",
        `Agora preciso confirmar o CPF de ${pessoa2Label}:`,
        `Ele(a) tem alguma **restrição** no CPF? (Serasa, SPC)`,
        "Responda *sim*, *não* ou *não sei*."
      ],
      "restricao_parceiro"
    );
  }

  return step(env, st,
  [
    "Obrigado por avisar! 🙏",
    "Só pra eu te orientar certinho:",
    "Você tem **possibilidade ou intenção de regularizar** essa restrição?",
    "Responda *sim* ou *não*."
  ],
  "regularizacao_restricao"
);
}

  // -----------------------------------------------------
  // CPF LIMPO
  // -----------------------------------------------------
  if (nao) {

  // 2ª resposta (parceiro) no fluxo conjunto
  if (segundaPerguntaParceiro) {
    try {
      await upsertState(env, st.wa_id, { restricao_parceiro: false });
    } catch (_) {}

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "restricao",
      severity: "info",
      message: "Parceiro confirmou CPF limpo (checkpoint em restricao)"
    });

    if (st.restricao === true) {
  return step(env, st,
    [
      "Perfeito! 👌",
      `Anotei que ${pessoa2Label} está sem restrição no CPF.`,
      "Só pra eu te orientar certinho:",
      "Você tem **possibilidade ou intenção de regularizar** essa restrição?",
      "Responda *sim* ou *não*."
    ],
    "regularizacao_restricao"
  );
}

if (st.p3_required && st.p3_done !== true) {
  return step(env, st,
    [
    "Perfeito! 👌",
    "Antes de seguir, preciso coletar os dados da terceira pessoa da composição."
  ],
    "regime_trabalho_parceiro_familiar_p3"
  );
}

return step(env, st,
  [
  "Perfeito! 👌",
  "Fechado. Vou te passar a lista de *documentos* pra gente dar sequência:",
  "",
  "📌 Você prefere:",
  "1) Enviar por aqui no WhatsApp",
  "2) Enviar pelo site",
  "3) Agendar uma visita presencial (decorado + simulação no plantão)"
],
  "envio_docs"
);
  }

  // 1ª resposta (titular)
  await upsertState(env, st.wa_id, { restricao: false });

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "restricao",
    severity: "info",
    message: "CPF limpo confirmado",
    details: { ehFluxoConjunto }
  });

  if (ehFluxoConjunto) {
    return step(env, st,
      [
        "Perfeito! 👌",
        `Agora preciso confirmar o CPF de ${pessoa2Label}:`,
        `Ele(a) tem alguma **restrição** no CPF? (Serasa, SPC)`,
        "Responda *sim*, *não* ou *não sei*."
      ],
      "restricao_parceiro"
    );
  }

  if (st.p3_required && st.p3_done !== true) {
  return step(env, st,
    [
    "Perfeito! 👌",
    "Antes de seguir, preciso coletar os dados da terceira pessoa da composição."
  ],
    "regime_trabalho_parceiro_familiar_p3"
  );
}

return step(env, st,
  [
  "Perfeito! 👌",
  "Fechado. Vou te passar a lista de *documentos* pra gente dar sequência:",
  "",
  "📌 Você prefere:",
  "1) Enviar por aqui no WhatsApp",
  "2) Enviar pelo site",
  "3) Agendar uma visita presencial (decorado + simulação no plantão)"
],
  "envio_docs"
);
}

  // -----------------------------------------------------
// CPF INCERTO / NÃO LEMBRA
// -----------------------------------------------------
if (incerto) {

  // 2ª resposta (parceiro) no fluxo conjunto
  if (segundaPerguntaParceiro) {
    try {
      await upsertState(env, st.wa_id, { restricao_parceiro: "incerto" });
    } catch (_) {}

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "restricao",
      severity: "warning",
      message: "Parceiro não soube informar restrição (checkpoint em restricao)"
    });

    return step(env, st,
      [
  "Perfeito! 👌",
  "Fechado. Vou te passar a lista de *documentos* pra gente dar sequência:",
  "",
  "📌 Você prefere:",
  "1) Enviar por aqui no WhatsApp",
  "2) Enviar pelo site",
  "3) Agendar uma visita presencial (decorado + simulação no plantão)"
],
      "envio_docs"
    );
  }

  // 1ª resposta (titular)
  await upsertState(env, st.wa_id, { restricao: "incerto" });

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "restricao",
    severity: "warning",
    message: "Cliente não sabe se tem restrição",
    details: { ehFluxoConjunto }
  });

  if (ehFluxoConjunto) {
    return step(env, st,
      [
        "Tranquilo, isso é bem comum 😊",
        `Agora preciso confirmar o CPF de ${pessoa2Label}:`,
        `Ele(a) tem alguma **restrição** no CPF? (Serasa, SPC)`,
        "Responda *sim*, *não* ou *não sei*."
      ],
      "restricao_parceiro"
    );
  }

  return step(env, st,
    [
  "Perfeito! 👌",
  "Fechado. Vou te passar a lista de *documentos* pra gente dar sequência:",
  "",
  "📌 Você prefere:",
  "1) Enviar por aqui no WhatsApp",
  "2) Enviar pelo site",
  "3) Agendar uma visita presencial (decorado + simulação no plantão)"
],
    "envio_docs"
  );
}

  // -----------------------------------------------------
  // NÃO ENTENDIDO
  // -----------------------------------------------------

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "restricao",
    severity: "warning",
    message: "Resposta não reconhecida — repetindo pergunta"
  });

  return step(env, st,
    [
      "Só pra confirmar rapidinho 😊",
      "Tem alguma **restrição** no CPF? (Serasa, SPC)",
      "Responda *sim*, *não* ou *não sei*."
    ],
    "restricao"
  );
}

// =========================================================
// 🧩 C34B — RESTRIÇÃO NO CPF (PARCEIRO)
// =========================================================
case "restricao_parceiro": {

  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: restricao_parceiro",
    details: {
      restricao_titular: st.restricao ?? null
    }
  });

  const temNaoTenho = /\b(n[aã]o|nao)\s+tenho\b/i.test(t);
  const temTermoRestricao = hasRestricaoIndicador(t);

  const sim =
    !temNaoTenho && (
      isYes(t) ||
      /^\s*tem\s*$/i.test(t) ||
      (!isNo(t) && temTermoRestricao) ||
      /(sou negativad[oa]|estou negativad[oa]|negativad[oa]|serasa|spc)/i.test(t) ||
      /\b(tenho|tem)\s+(restri[cç][aã]o|nome sujo|cpf sujo|d[ií]vida|divida|protesto)\b/i.test(t)
    );

  const incerto =
    /(nao sei|não sei|talvez|acho|pode ser|não lembro|nao lembro)/i.test(t);

  const nao =
    !incerto && (
      isNo(t) ||
      temNaoTenho ||
      /(tudo certo|cpf limpo|sem restri[cç][aã]o|sem divida|sem d[ií]vida|nome limpo)/i.test(t)
    );

  if (isModoFamiliar(st)) {
    if (!sim && !nao && !incerto) {
      return step(env, st,
        [
          "Só pra confirmar rapidinho 😊",
          "Esse familiar tem alguma restrição no CPF? (Serasa, SPC)",
          "Responda sim, não ou não sei."
        ],
        "restricao_parceiro"
      );
    }

    await upsertState(env, st.wa_id, {
      restricao_parceiro: sim ? true : (nao ? false : null)
    });

    const nextStage = (st.p3_required === true && st.p3_done !== true)
      ? "regime_trabalho_parceiro_familiar_p3"
      : "regime_trabalho";

    const nextMsg = nextStage === "regime_trabalho_parceiro_familiar_p3"
      ? ["Perfeito! 👌", "Agora vamos seguir com o cônjuge desse familiar.", "Qual é o regime de trabalho dele(a)?"]
      : ["Perfeito! 👌", "Agora seguimos com você.", "Qual é o seu regime de trabalho?"];

    return step(env, st, nextMsg, nextStage);
  }

  // Consolida titular + parceiro no campo restricao (sem criar coluna nova)
  const restricaoTitular = st.restricao; // true | false | "incerto" | null
  let restricaoFinal = restricaoTitular;

  if (sim) {
    restricaoFinal = true;
  } else if (nao) {
    if (restricaoTitular === true) restricaoFinal = true;
    else if (restricaoTitular === "incerto") restricaoFinal = "incerto";
    else restricaoFinal = false;
  } else if (incerto) {
    if (restricaoTitular === true) restricaoFinal = true;
    else restricaoFinal = "incerto";
  }

  // ---------------------------------
  // PARCEIRO COM RESTRIÇÃO
  // ---------------------------------
  if (sim) {
    await upsertState(env, st.wa_id, {
      restricao: restricaoFinal
    });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "restricao",
      severity: "warning",
      message: "Parceiro com restrição confirmado (consolidado em restricao)"
    });

    // ✅ Se existe P3, confirmar restrição do P3 antes de seguir
if (st.p3_required === true && (st.p3_restricao === null || typeof st.p3_restricao === "undefined")) {
  const p3Label =
    st.familiar_tipo === "pai"
      ? "sua mãe"
      : st.familiar_tipo === "mae"
        ? "seu pai"
        : "o cônjuge desse familiar";

  return step(env, st,
    [
      `Agora preciso confirmar o CPF de ${p3Label}:`,
      "Ele(a) tem alguma *restrição* no CPF? (Serasa, SPC)",
      "Responda *sim*, *não* ou *não sei*."
    ],
    "restricao_parceiro_p3"
  );
}

    return step(env, st,
  [
    "Entendi 👍",
    "Só pra eu te orientar certinho:",
    "Você tem **possibilidade ou intenção de regularizar** essa restrição?",
    "Responda *sim*, *não* ou *não sei*."
  ],
  "regularizacao_restricao_parceiro"
);
  }

  // ---------------------------------
  // PARCEIRO SEM RESTRIÇÃO
  // ---------------------------------
  if (nao) {
    await upsertState(env, st.wa_id, {
      restricao: restricaoFinal
    });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "restricao",
      severity: "info",
      message: "Parceiro sem restrição confirmado (consolidado em restricao)"
    });

    // ✅ Se existe P3, confirmar restrição do P3 antes de seguir
if (st.p3_required === true && (st.p3_restricao === null || typeof st.p3_restricao === "undefined")) {
  const p3Label =
    st.familiar_tipo === "pai"
      ? "sua mãe"
      : st.familiar_tipo === "mae"
        ? "seu pai"
        : "o cônjuge desse familiar";

  return step(env, st,
    [
      `Agora preciso confirmar o CPF de ${p3Label}:`,
      "Ele(a) tem alguma *restrição* no CPF? (Serasa, SPC)",
      "Responda *sim*, *não* ou *não sei*."
    ],
    "restricao_parceiro_p3"
  );
}

    return step(env, st,
  [
  "Perfeito! 👌",
  "Fechado. Vou te passar a lista de *documentos* pra gente dar sequência:",
  "",
  "📌 Você prefere:",
  "1) Enviar por aqui no WhatsApp",
  "2) Enviar pelo site",
  "3) Agendar uma visita presencial (decorado + simulação no plantão)"
],
  "envio_docs"
);
  }

  // ---------------------------------
  // PARCEIRO INCERTO
  // ---------------------------------
  if (incerto) {
    await upsertState(env, st.wa_id, {
      restricao: restricaoFinal
    });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "restricao",
      severity: "warning",
      message: "Restrição do parceiro incerta (consolidado em restricao)"
    });

    // ✅ Se existe P3, confirmar restrição do P3 antes de seguir
if (st.p3_required === true && (st.p3_restricao === null || typeof st.p3_restricao === "undefined")) {
  const p3Label =
    st.familiar_tipo === "pai"
      ? "sua mãe"
      : st.familiar_tipo === "mae"
        ? "seu pai"
        : "o cônjuge desse familiar";

  return step(env, st,
    [
      `Agora preciso confirmar o CPF de ${p3Label}:`,
      "Ele(a) tem alguma *restrição* no CPF? (Serasa, SPC)",
      "Responda *sim*, *não* ou *não sei*."
    ],
    "restricao_parceiro_p3"
  );
}

    return step(env, st,
  [
  "Perfeito! 👌",
  "Fechado. Vou te passar a lista de *documentos* pra gente dar sequência:",
  "",
  "📌 Você prefere:",
  "1) Enviar por aqui no WhatsApp",
  "2) Enviar pelo site",
  "3) Agendar uma visita presencial (decorado + simulação no plantão)"
],
  "envio_docs"
);
  }

  // ---------------------------------
  // NÃO ENTENDIDO
  // ---------------------------------
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "restricao_parceiro",
    severity: "warning",
    message: "Resposta do parceiro não reconhecida — repetindo pergunta"
  });

  return step(env, st,
    [
      "Só pra confirmar rapidinho 😊",
      "O parceiro(a) tem alguma **restrição** no CPF? (Serasa, SPC)",
      "Responda *sim*, *não* ou *não sei*."
    ],
    "restricao_parceiro"
  );
}      

// =========================================================
// 🧩 C35 — REGULARIZAÇÃO DA RESTRIÇÃO
// =========================================================
case "regularizacao_restricao_parceiro":
case "regularizacao_restricao": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "regularizacao_restricao"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: regularizacao_restricao",
    details: {
      restricao: st.restricao || null
    }
  });

  const isParceiro = (stage === "regularizacao_restricao_parceiro");

  // 🔢 Valor aproximado da restrição (se existir em memória)
  const valorRestricaoRaw =
    (st.valor_restricao != null ? st.valor_restricao : null) ??
    (st.valor_restricao_aproximado != null ? st.valor_restricao_aproximado : null);

  let valorRestricao = 0;
  if (typeof valorRestricaoRaw === "number") {
    valorRestricao = valorRestricaoRaw;
  } else if (typeof valorRestricaoRaw === "string") {
    const cleaned = valorRestricaoRaw
      .replace(/[^\d,.,,]/g, "")
      .replace(",", ".");
    const parsed = parseFloat(cleaned);
    if (!Number.isNaN(parsed)) {
      valorRestricao = parsed;
    }
  }

  // -----------------------------------------------------
  // ✅ Interpreta "valor" (ex: 1500) sem quebrar o stage
  // -----------------------------------------------------
  const parseValorRestricaoFromText = (txt) => {
    if (!txt) return 0;
    // pega algo tipo "1500", "1.500", "1500,00", "R$ 1500"
    const m = String(txt).match(/(\d[\d\.\,]*)/);
    if (!m) return 0;
    const raw = m[1].replace(/\./g, "").replace(",", ".");
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : 0;
  };

  // Exemplos cobertos: "já tô negociando", "estou pagando acordo", "ainda não fiz nada", "já quitei"
  const sim = isYes(t) || /(sim|já estou|ja estou|estou vendo|to vendo|estou resolvendo|tô resolvendo|pagando|negociando|acordo|parcelando|renegociando|ja quitei|já quitei|ja paguei|já paguei)/i.test(t);
  const nao = isNo(t) || /(n[aã]o|não estou|nao estou|ainda não|ainda nao|não mexi|nao mexi|não fiz nada|nao fiz nada|pretendo negociar|vou negociar depois)/i.test(t);
  const talvez = /(talvez|acho|nao sei|não sei|pode ser)/i.test(t);

  // Se não veio sim/não/talvez, tenta capturar VALOR e repetir a pergunta no mesmo stage
  if (!sim && !nao && !talvez) {
    const v = parseValorRestricaoFromText(userText);

    if (v > 0) {
      await upsertState(env, st.wa_id, {
        // ✅ Sem criar colunas novas: usa o mesmo campo para habilitar o gate >1000
        // (se no futuro você quiser separar titular/parceiro, aí sim criamos *_parceiro)
        valor_restricao_aproximado: v
      });

      await funnelTelemetry(env, {
        wa_id: st.wa_id,
        event: "exit_stage",
        stage,
        next_stage: stage,
        severity: "info",
        message: "Capturado valor de restrição — repetindo pergunta de regularização no mesmo stage",
        details: { userText, valorRestricaoCapturado: v }
      });

      return step(env, st,
        [
          "Fechado 👍",
          `Só pra eu te orientar certo: você tem **possibilidade ou intenção de regularizar** essa restrição?`,
          "Responda *sim*, *não* ou *não sei*."
        ],
        stage
      );
    }
  }

  // ============================================================
  // ✅ GATE ÚNICO — antes de QUALQUER "envio_docs"
  // ============================================================
  const gateAntesEnvioDocs = () => {
    const parceiroSemRestricao =
      (st.restricao_parceiro === null || typeof st.restricao_parceiro === "undefined");

    const p3SemRestricao =
      (st.p3_required === true) &&
      (st.p3_restricao === null || typeof st.p3_restricao === "undefined");

    // (b) Casal (P2): se é conjunto e não coletou restrição do parceiro, volta
    if (st.financiamento_conjunto === true && parceiroSemRestricao) {
      return step(env, st,
        [
          "Antes de eu te mandar os documentos, preciso só confirmar uma coisa 😊",
          "O parceiro(a) tem alguma *restrição* no CPF? (Serasa, SPC)",
          "Responda *sim*, *não* ou *não sei*."
        ],
        "restricao_parceiro"
      );
    }

    // (a) Familiar (P3): se ainda falta restrição do parceiro do titular (quando aplicável), volta
    if (st.p3_required === true && parceiroSemRestricao) {
      return step(env, st,
        [
          "Antes de eu te mandar os documentos, preciso só confirmar uma coisa 😊",
          "O parceiro(a) tem alguma *restrição* no CPF? (Serasa, SPC)",
          "Responda *sim*, *não* ou *não sei*."
        ],
        "restricao_parceiro"
      );
    }

    // (a) Familiar (P3): se falta restrição do P3, vai pra restricao_parceiro_p3
    if (p3SemRestricao) {
      const p3Label =
        st.familiar_tipo === "pai"
          ? "sua mãe"
          : st.familiar_tipo === "mae"
            ? "seu pai"
            : "o cônjuge desse familiar";

      return step(env, st,
        [
          `Agora preciso confirmar o CPF de ${p3Label}:`,
          "Ele(a) tem alguma *restrição* no CPF? (Serasa, SPC)",
          "Responda *sim*, *não* ou *não sei*."
        ],
        "restricao_parceiro_p3"
      );
    }

    return null; // passou no gate
  };

  // -----------------------------------------------------
  // JÁ ESTÁ REGULARIZANDO
  // -----------------------------------------------------
  if (sim) {

    await upsertState(env, st.wa_id, {
      regularizacao_restricao: "em_andamento"
    });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "envio_docs",
      severity: "info",
      message: "Cliente está regularizando a restrição",
      details: { userText }
    });

    if (st.p3_required && st.p3_done !== true) {
      return step(env, st,
        [
          "Ótimo! 👏",
          "Antes de seguir, preciso coletar os dados da terceira pessoa da composição."
        ],
        "regime_trabalho_parceiro_familiar_p3"
      );
    }

    if (stage === "regularizacao_restricao_parceiro" && st.restricao !== true) {
      const gateRes2 = gateAntesEnvioDocs();
      if (gateRes2) return gateRes2;
      return step(env, st,
        [
          "Ótimo! 👏",
          "Fechado. Vou te passar a lista de **documentos** pra darmos sequência.",
          "",
          "📌 Você prefere:",
          "1) Enviar por aqui no WhatsApp",
          "2) Enviar pelo site",
          "3) Agendar uma visita presencial (decorado + simulação no plantão)"
        ],
        "envio_docs"
      );
    }

    const gateRes = gateAntesEnvioDocs();
    if (gateRes) return gateRes;

    return step(env, st,
      [
        "Ótimo! 👏",
        "Quando a restrição sair do sistema, o banco libera o financiamento. E isso não impede de irmos para a próxima fase 😉",
        "Enquanto isso, já posso te adiantar a lista de **documentos** pra darmos sequencia. Quer que eu te envie?"
      ],
      "envio_docs"
    );
  }

  // -----------------------------------------------------
  // NÃO ESTÁ REGULARIZANDO (AINDA)
  // -----------------------------------------------------
  if (nao) {

    await upsertState(env, st.wa_id, {
      regularizacao_restricao: "nao_iniciado"
    });

    // 🔥 Gatilho de inelegibilidade: restrição alta (> 1000) sem regularizar
    if (valorRestricao > 1000) {

      await upsertState(env, st.wa_id, {
        motivo_ineligivel: "restricao_sem_regularizacao",
        funil_status: "ineligivel"
      });

      await funnelTelemetry(env, {
        wa_id: st.wa_id,
        event: "exit_stage",
        stage,
        next_stage: "fim_ineligivel",
        severity: "warning",
        message: "Cliente NÃO está regularizando restrição alta (> 1000) — encaminhando para fim_ineligivel",
        details: {
          userText,
          valorRestricao,
          isParceiro
        }
      });

      return step(env, st,
        [
          "Entendi 😊",
          "Com uma restrição acima de R$ 1.000 e sem previsão de regularização, a Caixa não libera financiamento pelo Minha Casa Minha Vida.",
          "Vou te explicar certinho o que isso significa e como você pode resolver, se quiser."
        ],
        "fim_ineligivel"
      );
    }

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "envio_docs",
      severity: "warning",
      message: "Cliente NÃO está regularizando a restrição",
      details: { userText, valorRestricao, isParceiro }
    });

    if (st.p3_required && st.p3_done !== true) {
      return step(env, st,
        [
          "Tranquilo, isso é bem comum 😊",
          "Antes de seguir, preciso coletar os dados da terceira pessoa da composição."
        ],
        "regime_trabalho_parceiro_familiar_p3"
      );
    }

    const gateRes = gateAntesEnvioDocs();
    if (gateRes) return gateRes;

    return step(env, st,
      [
        "Tranquilo, isso é bem comum 😊",
        "Pra Caixa liberar o financiamento, o CPF precisa estar sem restrição.",
        "Mas não precisa se preocupar: te mostro o caminho mais fácil pra resolver isso pelo app da Serasa ou banco.",
        "Posso te enviar a **instrução rápida** e já te adiantar a lista de documentos?"
      ],
      "envio_docs"
    );
  }

  // -----------------------------------------------------
  // TALVEZ / INCERTO
  // -----------------------------------------------------
  if (talvez) {

    await upsertState(env, st.wa_id, {
      regularizacao_restricao: "incerto"
    });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "envio_docs",
      severity: "warning",
      message: "Cliente incerto sobre regularização",
      details: { userText, isParceiro }
    });

    const gateRes = gateAntesEnvioDocs();
    if (gateRes) return gateRes;

    return step(env, st,
      [
        "Sem problema 😊",
        "Vemos isso diretamente com o banco na nossa próxima fase, que é a análise com o banco.",
        "Posso te passar a lista de **documentos básicos** que o banco pede pra validar seu cadastro e analisar se libera financiamento ou não?"
      ],
      "envio_docs"
    );
  }

  // -----------------------------------------------------
  // NÃO ENTENDIDO
  // -----------------------------------------------------
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: stage, // ✅ volta pro mesmo stage (titular/parceiro)
    severity: "warning",
    message: "Resposta não reconhecida — repetindo pergunta",
    details: { userText, isParceiro }
  });

  return step(env, st,
    [
      "Conseguiu me confirmar certinho? 😊",
      "Você tem **possibilidade ou intenção de regularizar** essa restrição?",
      "Responda *sim*, *não* ou *não sei*."
    ],
    stage // ✅ não cai no titular quando é parceiro
  );
}

// =========================================================
// 🧩 C36 — ENVIO DE DOCUMENTOS (NOVA VERSÃO DEFINITIVA)
// =========================================================
case "envio_docs": {

  if (st.dossie_status !== "pronto") {
    try {
      const dossier = buildDocumentDossierFromState(st);
      await persistDocumentDossier(env, st, dossier);
    } catch (err) {
      await funnelTelemetry(env, {
        wa_id: st.wa_id,
        event: "dossie_build_error",
        stage,
        severity: "warning",
        message: "Falha ao montar dossiê na entrada de envio_docs",
        details: { error: err?.message || String(err) }
      });
    }
  }

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "envio_docs"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: envio_docs",
    details: {
      docs_lista_enviada: st.docs_lista_enviada || false,
      incoming_media: !!st._incoming_media
    }
  });

  // =====================================================
  // 1 — SE CHEGOU ALGUMA MÍDIA → handleDocumentUpload
  // =====================================================
  if (st._incoming_media) {

    const midia = st._incoming_media;
    await upsertState(env, st.wa_id, { _incoming_media: null });

    const resposta = await handleDocumentUpload(env, st, midia);

    // Telemetria de entrada de mídia
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "document_media_received",
      stage,
      severity: resposta.ok ? "info" : "warning",
      message: resposta.ok ? "Mídia processada" : "Falha ao processar mídia",
      details: {
        keepStage: resposta.keepStage,
        nextStage: resposta.nextStage
      }
    });

    // resposta negativa (erro OCR, ilegível etc.)
    if (!resposta.ok) {
      return step(env, st, resposta.message, resposta.keepStage || "envio_docs");
    }

    // resposta positiva mas sem avanço
    if (!resposta.nextStage) {
      return step(env, st, resposta.message, resposta.keepStage || "envio_docs");
    }

    // resposta positiva com avanço
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: resposta.nextStage,
      severity: "info",
      message: "Saindo de envio_docs após mídia"
    });

    return step(env, st, resposta.message, resposta.nextStage);
  }

  // =====================================================
  // 2 — TEXTO DO CLIENTE (quando não enviou mídia)
  // =====================================================
  const pronto = isYes(t) || /(sim|ok|pode mandar|manda|pode enviar|vamos|blz|beleza)/i.test(t);
  const negar  = isNo(t) || /(nao|não agora|depois|mais tarde|agora nao)/i.test(t);

  // =====================================================
  // CLIENTE ACEITOU RECEBER A LISTA
  // =====================================================
  if (pronto && !st.docs_lista_enviada) {

    await upsertState(env, st.wa_id, { docs_lista_enviada: true });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "envio_docs",
      severity: "info",
      message: "Cliente aceitou receber lista de documentos"
    });

    return step(env, st, [
      "Show! 👏",
      "A lista é bem simples, olha só:",
      "",
      "📄 **Documentos do titular:**",
      "- RG ou CNH",
      "- CPF (se não tiver na CNH)",
      "- Comprovante de residência (atual)",
      "- Comprovante de renda (de acordo com o perfil)",
      "",
      "📄 **Se somar renda com alguém:**",
      "Mesmos documentos da outra pessoa 🙌",
      "",
      "Assim que tiver tudo em mãos, pode enviar por aqui mesmo.",
      "Pode mandar uma foto de cada documento 😉"
    ], "envio_docs");
  }

  // =====================================================
  // CLIENTE NÃO QUER AGORA
  // =====================================================
  if (negar) {
    await upsertState(env, st.wa_id, { docs_lista_enviada: false });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "envio_docs",
      severity: "info",
      message: "Cliente adiou envio da lista de documentos"
    });

    return step(env, st, [
      "Sem problema 😊",
      "Fico no aguardo. Quando quiser, é só me chamar aqui!"
    ], "envio_docs");
  }

  // =====================================================
  // PRIMEIRA VEZ NA FASE
  // =====================================================
  if (!st.docs_lista_enviada) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "prompt_first_time",
      stage,
      severity: "info",
      message: "Primeira vez no envio_docs"
    });

    return step(env, st, [
      "Perfeito! 👌",
      "Agora preciso ver sua documentação pra montar sua análise.",
      "Quer que eu te envie a **lista dos documentos necessários**?"
    ], "envio_docs");
  }

  // =====================================================
  // CLIENTE MANDOU TEXTO MAS SEM MÍDIA
  // =====================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "text_without_media",
    stage,
    severity: "info",
    message: "Cliente enviou texto sem mídia na fase envio_docs"
  });

  return step(env, st, [
    "Pode me enviar os documentos por aqui mesmo 😊",
    "Foto, PDF ou áudio que explique algo… tudo bem!"
  ], "envio_docs");
}

// =========================================================
// 🧩 C37 — AGENDAMENTO DA VISITA
// =========================================================
case "agendamento_visita": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "agendamento_visita"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: agendamento_visita",
    details: {
      visita_confirmada: st.visita_confirmada || null,
      visita_dia_hora: st.visita_dia_hora || null
    }
  });

  const confirmar = isYes(t) || /(sim|pode marcar|pode agendar|vamos sim|quero sim|ok|blz|beleza)/i.test(t);
  const negar = isNo(t) || /(n[aã]o|depois|mais tarde|agora n[aã]o|ainda n[aã]o)/i.test(t);

  // -----------------------------------------------------
  // CLIENTE CONFIRMA QUE QUER AGENDAR
  // -----------------------------------------------------
  if (confirmar) {

    await upsertState(env, st.wa_id, {
      visita_confirmada: true
    });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "agendamento_visita",
      severity: "info",
      message: "Cliente confirmou que deseja agendar"
    });

    return step(env, st,
      [
        "Perfeito! 👏",
        "Me diga qual **dia** e **horário** ficam melhor pra você ir até o plantão:",
        "",
        "📍 *Av. Paraná, 2474 – Boa Vista (em frente ao terminal)*"
      ],
      "agendamento_visita"
    );
  }

  // -----------------------------------------------------
  // CLIENTE NEGA / ADIA
  // -----------------------------------------------------
  if (negar) {

    await upsertState(env, st.wa_id, {
      visita_confirmada: false
    });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "agendamento_visita",
      severity: "info",
      message: "Cliente adiou/negou agendamento"
    });

    return step(env, st,
      [
        "Sem problema 😊",
        "Quando quiser agendar, me chama aqui rapidinho!",
        "Eu garanto uma horinha boa pra você ser atendido(a) sem fila."
      ],
      "agendamento_visita"
    );
  }

  // -----------------------------------------------------
  // CLIENTE INFORMOU HORÁRIO (por texto)
  // -----------------------------------------------------
  const horarioInformado =
    /\b(\d{1,2}:\d{2})\b/.test(t) ||
    /(manha|manhã|tarde|noite)/i.test(t) ||
    /(hoje|amanhã|amanha|sábado|sabado|domingo|segunda|terça|terca|quarta|quinta|sexta)/i.test(t);

  if (horarioInformado) {

    await upsertState(env, st.wa_id, {
      visita_confirmada: true,
      visita_dia_hora: t
    });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "finalizacao",
      severity: "info",
      message: "Cliente informou dia/horário da visita"
    });

    return step(env, st,
      [
        "Ótimo! 🙌",
        "Vou deixar registrado aqui:",
        `📅 *${userText.trim()}*`,
        "",
        "No dia, é só avisar seu nome na recepção que já te chamam 😉",
        "Qualquer coisa me chama aqui!"
      ],
      "finalizacao"
    );
  }

  // -----------------------------------------------------
  // NÃO ENTENDIDO
  // -----------------------------------------------------
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "agendamento_visita",
    severity: "info",
    message: "Pergunta adicional — cliente não deixou claro o horário"
  });

  return step(env, st,
    [
      "Show! 👌",
      "Queremos te atender da melhor forma.",
      "Você prefere **manhã**, **tarde** ou um **horário específico**?"
    ],
    "agendamento_visita"
  );
}

// =========================================================
// 🧩 D1 — FINALIZAÇÃO DO PROCESSO (envio ao correspondente)
// =========================================================
case "finalizacao_processo": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "finalizacao_processo"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: finalizacao_processo",
    details: {
      nome: st.nome || null,
      estado_civil: st.estado_civil || null,
      somar_renda: st.somar_renda ?? null,
      renda: st.renda || null,
      renda_parceiro: st.renda_parceiro || null,
      ctps_36: st.ctps_36 ?? null,
      ctps_36_parceiro: st.ctps_36_parceiro ?? null,
      dependente: st.dependente ?? null,
      restricao: st.restricao ?? null,
      processo_enviado_correspondente: st.processo_enviado_correspondente ?? null
    }
  });

  const confirmar = isYes(t) || /(sim|pode enviar|pode mandar|envia|manda|quero|vamos)/i.test(t);
  const negar = isNo(t) || /(nao|não|depois|agora nao|mais tarde)/i.test(t);

  // ------------------------------------------------------
  // CLIENTE CONFIRMA ENVIO AO CORRESPONDENTE
  // ------------------------------------------------------
  if (confirmar) {

    // monta dossiê simples (versão 1 — depois evoluímos)
    const dossie = `
Cliente: ${st.nome || "não informado"}
Estado Civil: ${st.estado_civil || "não informado"}
Soma de Renda: ${st.somar_renda ? "Sim" : "Não"}
Renda Titular: ${st.renda || "não informado"}
Renda Parceiro: ${st.renda_parceiro || "não informado"}
CTPS Titular ≥ 36 meses: ${st.ctps_36 === true ? "Sim" : "Não"}
CTPS Parceiro ≥ 36 meses: ${st.ctps_36_parceiro === true ? "Sim" : "Não"}
Dependente: ${st.dependente === true ? "Sim" : "Não"}
Restrição: ${st.restricao || "não informado"}
`.trim();

    // salva o dossiê no estado
    await upsertState(env, st.wa_id, {
      dossie_resumo: dossie,
      processo_enviado_correspondente: true
    });

    // envia para o correspondente (placeholder — evolui no bloco D3)
    await enviarParaCorrespondente(env, st, dossie);

    // TELEMETRIA — saída da fase com envio confirmado
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "aguardando_retorno_correspondente",
      severity: "info",
      message: "Processo enviado ao correspondente",
      details: {
        processo_enviado_correspondente: true
      }
    });

    // resposta para o cliente
    return step(
      env,
      st,
      [
        "Perfeito! 👏",
        "Acabei de enviar seu processo ao correspondente bancário.",
        "Assim que eles retornarem com a pré-análise, eu te aviso aqui mesmo 😊"
      ],
      "aguardando_retorno_correspondente"
    );
  }

  // ------------------------------------------------------
  // CLIENTE NÃO QUER ENVIAR AGORA
  // ------------------------------------------------------
  if (negar) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "finalizacao_processo",
      severity: "info",
      message: "Cliente optou por não enviar o processo agora"
    });

    return step(
      env,
      st,
      [
        "Sem problema 😊",
        "Quando quiser que eu envie seu processo ao correspondente, é só me pedir aqui."
      ],
      "finalizacao_processo"
    );
  }

  // ------------------------------------------------------
  // PRIMEIRA VEZ NA FASE / QUALQUER OUTRO TEXTO
  // ------------------------------------------------------
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "finalizacao_processo",
    severity: "info",
    message: "Pergunta inicial sobre envio ao correspondente"
  });

  return step(
    env,
    st,
    [
      "Ótimo, fiz toda a conferência e está tudo certo com seus documentos ✨",
      "Quer que eu envie agora seu processo ao correspondente bancário para análise?"
    ],
    "finalizacao_processo"
  );

} // 🔥 FECHA O CASE "finalizacao_processo"

// =========================================================
// 🧩 D2 — AGUARDANDO RETORNO DO CORRESPONDENTE
// =========================================================
case "aguardando_retorno_correspondente": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "aguardando_retorno_correspondente"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: aguardando_retorno_correspondente",
    details: {
      nome: st.nome || null,
      processo_enviado_correspondente: st.processo_enviado_correspondente ?? null
    }
  });

  const txt = (userText || "").trim();

  // ✅ Anti-loop: se o usuário mandar "oi" (ou reset) enquanto está aguardando status,
  // volta pro início em vez de ficar pedindo *status* infinitamente.
  const nt = normalizeText(txt);

  const isResetCmd = /^(reset|reiniciar|recomecar|recomeçar|do zero|nova analise|nova análise)\b/i.test(nt);
  const saudacao   = /^(oi|ola|olá|bom dia|boa tarde|boa noite)\b/i.test(nt);

  if (isResetCmd || saudacao) {
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "inicio_programa",
      severity: "info",
      message: "Anti-loop: saudacao/reset em aguardando_retorno_correspondente → inicio_programa"
    });

    return step(
      env,
      st,
      [
        "Oi! Tudo bem? 😊",
        "Vamos começar do início rapidinho:",
        "Você já sabe como funciona o Minha Casa Minha Vida ou prefere que eu explique?",
        "Responde com *sim* (já sei) ou *não* (quero que explique)."
      ],
      "inicio_programa"
    );
  }

  // ======================================================
  // 1 — Extrair possíveis nomes e status via regex
  // ======================================================

  const aprovado   = /(aprovado|cr[eé]dito aprovado|liberado)/i.test(txt);
  const reprovado  = /(reprovado|cr[eé]dito reprovado|negado|n[oã]o aprovado)/i.test(txt);

  let nomeExtraido = null;

  const linhas = txt.split("\n").map(l => l.trim());
  for (let i = 0; i < linhas.length; i++) {
    if (/pré[- ]?cadastro/i.test(linhas[i])) {
      if (linhas[i+1]) nomeExtraido = linhas[i+1].trim();
    }
  }

  if (!nomeExtraido) {
    const matchNome = txt.match(/[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{2,}(?: [A-ZÁÉÍÓÚÂÊÔÃÕÇ]{2,})+/);
    if (matchNome) nomeExtraido = matchNome[0];
  }

  const nomeCliente = (st.nome || "").toLowerCase();
  const nomeParceiro = (st.nome_parceiro_normalizado || "").toLowerCase();
  const nomeExtra = (nomeExtraido || "").toLowerCase();

  function parecido(a, b) {
    if (!a || !b) return false;
    const min = Math.min(a.length, b.length);
    let iguais = 0;
    for (let i = 0; i < min; i++) {
      if (a[i] === b[i]) iguais++;
    }
    const score = iguais / min;
    return score >= 0.6;
  }

  const matchP1 = parecido(nomeExtra, nomeCliente);
  const matchP2 = parecido(nomeExtra, nomeParceiro);

  const pareceRetornoCorrespondente =
    aprovado || reprovado || /pré[- ]?cadastro/i.test(txt);

  if (!pareceRetornoCorrespondente) {

    // 🛰 TELEMETRIA — saída mantendo fase
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "aguardando_retorno_correspondente",
      severity: "info",
      message: "Mensagem ignorada enquanto aguarda retorno do correspondente"
    });

    return step(env, st,
      [
        "Estou acompanhando aqui 👀",
        "Assim que o correspondente retornar com a análise, te aviso!"
      ],
      "aguardando_retorno_correspondente"
    );
  }

  // ======================================================
  // 3 — Validar match do cliente
  // ======================================================
  if (!matchP1 && !matchP2) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "aguardando_retorno_correspondente",
      severity: "warning",
      message: "Retorno do correspondente não compatível com nome do cliente",
      details: { nomeExtra }
    });

    return step(env, st,
      [
        "Recebi uma análise aqui, mas não tenho certeza se é do seu processo 🤔",
        "Pode confirmar pra mim o nome que está no retorno do correspondente?"
      ],
      "aguardando_retorno_correspondente"
    );
  }

  // ======================================================
  // 4 — APROVADO
  // ======================================================
  if (aprovado) {

    await upsertState(env, st.wa_id, {
      processo_aprovado: true,
      processo_reprovado: false
    });

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "agendamento_visita",
      severity: "success",
      message: "Processo aprovado pelo correspondente"
    });

    return step(env, st,
      [
        "Ótima notícia! 🎉",
        "O correspondente bancário acabou de **aprovar** sua pré-análise! 🙌",
        "",
        "Agora sim podemos **confirmar seu agendamento** certinho.",
        "Qual horário você prefere para a visita? Manhã, tarde ou horário específico?"
      ],
      "agendamento_visita"
    );
  }

  // ======================================================
  // 5 — REPROVADO
  // ======================================================
  if (reprovado) {

    await upsertState(env, st.wa_id, {
      processo_aprovado: false,
      processo_reprovado: true
    });

    let motivo = null;
    const m = txt.match(/(pend[eê]ncia|motivo|raz[aã]o|detalhe).*?:\s*(.*)/i);
    if (m) motivo = m[2];

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "aguardando_retorno_correspondente",
      severity: "error",
      message: "Processo reprovado pelo correspondente",
      details: { motivo }
    });

    return step(env, st,
      [
        "Recebi o retorno do correspondente… 😕",
        "Infelizmente **a análise não foi aprovada**.",
        motivo ? `Motivo informado: *${motivo.trim()}*.` : "",
        "",
        "Se quiser, posso te orientar o que fazer para **corrigir isso** e tentar novamente! 💙"
      ],
      "aguardando_retorno_correspondente"
    );
  }

  // ======================================================
  // Fallback
  // ======================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "aguardando_retorno_correspondente",
    severity: "info",
    message: "Fallback — status não identificado"
  });

  return step(env, st,
    [
      "Recebi uma mensagem do correspondente, mas preciso confirmar algo…",
      "Pode me mandar novamente o trecho onde aparece o *status*?"
    ],
    "aguardando_retorno_correspondente"
  );
}


// =========================================================
// 🧩 DEFAULT — FAILSAFE
// =========================================================
default:
  return step(env, st, [
    "Opa, não consegui entender exatamente o que você quis dizer 🤔",
    "Pode me repetir de outro jeitinho, por favor?"
  ], stage);

} // 🔥 fecha o switch(stage)

// =========================================================
// 🧱 FIM DA FUNÇÃO runFunnel
// =========================================================
} // fecha async function runFunnel
