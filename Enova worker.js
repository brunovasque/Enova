console.log("DEBUG-INIT-1: Worker carregou até o topo do arquivo");

const ENOVA_BUILD = "enova-meta-debug-stamp-2026-02-11";

function getSimulationContext(env) {
  return env && env.__enovaSimulationCtx ? env.__enovaSimulationCtx : null;
}

const WRITES_CANONICOS = {
  docs: [
    "fase_docs",
    "funil_opcao_docs",
    "canal_envio_docs",
    "status_docs",
    "docs_status",
    "docs_status_texto",
    "docs_lista_enviada",
    "docs_pendentes",
    "docs_itens_recebidos",
    "docs_completos",
    "docs_status_geral",
    "docs_validacao_atualizada",
    "ultima_interacao_docs",
    "processo_enviado_correspondente",
    "aguardando_retorno_correspondente",
    "dossie_resumo",
    "retorno_correspondente_bruto",
    "retorno_correspondente_status",
    "retorno_correspondente_motivo",
    "_incoming_media",
    "fase_conversa",
    "funil_status",
    "intro_etapa",
    "controle"
  ],
  agendamento: [
    "agendamento_id",
    "visita_confirmada",
    "visita_dia_hora",
    "fase_conversa",
    "funil_status",
    "intro_etapa",
    "controle"
  ]
};

const STAGE_WRITES_BLOCK = {
  envio_docs: "docs",
  docs_opcao: "docs",
  docs_nao_enviou: "docs",
  docs_enviou_correspondente: "docs",
  agendamento_visita: "agendamento"
};

function resolveWritesBlock(stageId) {
  return STAGE_WRITES_BLOCK[String(stageId || "")] || null;
}

function filterPatchAllowKeys(patch, writesBlock) {
  if (!patch || typeof patch !== "object") return {};

  const allowedByBlock = WRITES_CANONICOS[writesBlock];
  if (!Array.isArray(allowedByBlock)) {
    return { ...patch };
  }

  const allowed = new Set([...allowedByBlock, "updated_at"]);
  const filtered = {};

  for (const [key, value] of Object.entries(patch)) {
    if (allowed.has(key)) {
      filtered[key] = value;
    }
  }

  return filtered;
}

function filterToExistingColumns(patch) {
  if (!patch || typeof patch !== "object") return {};

  const filtered = { ...patch };
  if ("renda_familiar" in filtered) {
    delete filtered.renda_familiar;
  }

  return filtered;
}

function buildCanonicalPatchScenarios() {
  const scenarios = [
    {
      scenario: "agendamento_visita",
      writes_block: "agendamento",
      raw_patch: {
        fase_conversa: "agendamento_visita",
        visita_confirmada: true,
        visita_dia_hora: "amanhã 10:30"
      },
      expected_keys: ["visita_confirmada", "visita_dia_hora"]
    },
    {
      scenario: "docs_envio",
      writes_block: "docs",
      raw_patch: {
        fase_conversa: "envio_docs",
        _incoming_media: { type: "image" },
        docs_pendentes: 2
      },
      expected_keys: ["_incoming_media", "docs_pendentes"]
    }
  ];

  return scenarios.map((item) => {
    const withTimestamp = {
      ...item.raw_patch,
      updated_at: "2026-01-01T00:00:00.000Z"
    };
    const allowFiltered = filterPatchAllowKeys(withTimestamp, item.writes_block);
    const finalPatch = filterToExistingColumns(allowFiltered);

    return {
      scenario: item.scenario,
      writes_block: item.writes_block,
      final_patch: finalPatch,
      expected_keys: item.expected_keys,
      expected_keys_present: item.expected_keys.every((key) => key in finalPatch),
      removed_keys: Object.keys(withTimestamp).filter((key) => !(key in finalPatch))
    };
  });
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
  const arr = Array.isArray(messages) ? messages : [messages];

  // 🔥 AQUI: aplica modo humano (somente se ativo)
  const msgs = modoHumanoRender(st, arr);

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
    
      // Atualiza estado no Supabase
      await upsertState(env, st.wa_id, {
        fase_conversa: nextStage,
        last_bot_msg: msgs[msgs.length - 1] || null,
        updated_at: new Date().toISOString()
      });

      if (isSim) {
        st.fase_conversa = nextStage;
        st.last_bot_msg = msgs[msgs.length - 1] || null;
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

  const basePatch = {
    ...payload,
    updated_at: new Date().toISOString()
  };

  try {
    // 1) Verifica se já existe registro para esse wa_id
    const existing = await getState(env, wa_id);
    const stageCandidate =
      payload?.fase_conversa ||
      simCtx?.stateByWaId?.[wa_id]?.fase_conversa ||
      existing?.fase_conversa ||
      null;
    const writesBlock = resolveWritesBlock(stageCandidate);
    const patch = filterToExistingColumns(filterPatchAllowKeys(basePatch, writesBlock));

    if (simCtx?.active) {
      if (Array.isArray(simCtx.patchAudit)) {
        simCtx.patchAudit.push({
          wa_id,
          stage: stageCandidate,
          writes_block: writesBlock,
          raw_payload: payload,
          pre_supabase_patch: patch
        });
      }

      const current = simCtx.stateByWaId?.[wa_id] || { wa_id };
      const merged = { ...current, ...patch, wa_id };

      if (simCtx.stateByWaId) {
        simCtx.stateByWaId[wa_id] = merged;
      }

      if (simCtx.dryRun) {
        return merged;
      }
    }

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
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")        // remove acentos
    .replace(/[\u2000-\u206F]/g, " ")       // símbolos de controle
    .replace(/[^a-z0-9\s]/gi, " ")          // limpa emoji/pontuação pesada
    .replace(/\s+/g, " ")
    .trim();
}

function isYes(text) {
  const nt = normalizeText(text);
  if (!nt) return false;
  const yesTerms = [
    "sim", "s", "ss", "claro", "pode", "ok", "beleza", "com certeza",
    "uhum", "isso", "quero", "vamo", "vamos", "bora"
  ];
  return yesTerms.some((term) => nt === term || nt.includes(term));
}

function isNo(text) {
  const nt = normalizeText(text);
  if (!nt) return false;
  const noTerms = [
    "nao", "n", "nn", "negativo", "nunca", "jamais", "ainda nao", "agora nao", "talvez depois"
  ];
  return noTerms.some((term) => nt === term || nt.includes(term));
}

function parseMoneyBR(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const nt = normalizeText(raw);

  const kMatch = nt.match(/(\d+(?:[\.,]\d+)?)\s*k\b/);
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
  if (/(solteir)/.test(nt)) return "solteiro";
  if (/(casad)/.test(nt)) return "casado";
  if (/(uniao|estavel|juntad|moro junto|moramos junto|amasiad|companheir)/.test(nt)) return "uniao_estavel";
  if (/(separad|separei)/.test(nt)) return "separado";
  if (/(divorciad)/.test(nt)) return "divorciado";
  if (/(viuv)/.test(nt)) return "viuvo";
  return null;
}

function parseRegimeTrabalho(text) {
  const nt = normalizeText(text);
  if (!nt) return null;
  if (/(mei)/.test(nt)) return "autonomo";
  if (/(clt|carteira assinada|registrad)/.test(nt)) return "clt";
  if (/(autonom|informal|por conta|freela|uber|ifood|liberal|bico)/.test(nt)) return "autonomo";
  if (/(servidor|funcionario publico|publico|concursad|municipal|estadual|federal|prefeitura)/.test(nt)) return "servidor";
  if (/(aposentad)/.test(nt)) return "aposentadoria";
  if (/(desempregad)/.test(nt)) return "desempregado";
  if (/(estudant)/.test(nt)) return "estudante";
  return null;
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

    // ========== DEBUG TEMPORÁRIO: HEADERS SUPABASE ==========
try {
  console.log("DEBUG-SBREQUEST:", JSON.stringify({
    url,
    method,
    headers: finalHeaders,
    bodyPreview: typeof finalBody === "string"
      ? finalBody.slice(0, 200)
      : finalBody,
  }));
} catch (err) {
  console.log("DEBUG-SBREQUEST-ERROR:", err);
}
// ========== FIM DO DEBUG TEMPORÁRIO ==========

// ========== DEBUG TEMP PROXY-ECHO ==========
try {
  const echo = await fetch(env.VERCEL_PROXY_URL + "/api/supabase-proxy-debug", {
    method,
    headers: finalHeaders
  });

  const echoJson = await echo.json();

  console.log("DEBUG-PROXY-ECHO:", JSON.stringify({
    sentHeaders: finalHeaders,
    proxyReceivedHeaders: echoJson.received_headers
  }));
} catch (err) {
  console.log("DEBUG-PROXY-ECHO-ERROR:", String(err));
}
// ========== FIM DEBUG ==========

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

  // 2) Recria estado 100% limpo e CONSISTENTE com tabela atual
  await upsertState(env, wa_id, {
    // Fase inicial do funil
    fase_conversa: "inicio",
    funil_status: null,

    // Logs e rastreamento
    last_user_text: null,
    last_processed_text: null,
    last_bot_msg: null,
    last_message_id: null,

    // Campos clássicos
    nome: null,
    estado_civil: null,
    somar_renda: null,
    financiamento_conjunto: null,
    renda: null,
    renda_parceiro: null,
    renda_total_para_fluxo: null,
    dependente: null,
    restricao: null,

    // CTPS
    ctps_36: null,
    ctps_36_parceiro: null,

    // Novos campos da fase inicial (compatível com sua tabela)
    nacionalidade: null,
    rnm_status: null,
    rnm_validade: null,

    // Multi-renda / multi-regime
    multi_rendas: null,
    multi_rendas_parceiro: null,
    multi_regimes: null,
    multi_regimes_parceiro: null,

    // Rendas calculadas (suportam cálculo global)
    renda_individual_calculada: null,
    renda_parceiro_calculada: null,
    renda_total_composicao: null,
    faixa_renda_programa: null,

    // Atualização
    updated_at: new Date().toISOString()
  });

  return;
}

function createSimulationState(wa_id, startStage) {
  return {
    wa_id,
    fase_conversa: startStage || "inicio",
    funil_status: null,
    last_user_text: null,
    last_processed_text: null,
    last_bot_msg: null,
    nome: null,
    estado_civil: null,
    regime_trabalho: null,
    somar_renda: null,
    financiamento_conjunto: null,
    renda: null,
    renda_parceiro: null,
    renda_total_para_fluxo: null,
    dependente: null,
    restricao: null,
    ctps_36: null,
    updated_at: new Date().toISOString()
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
    patchAudit: []
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
      steps,
      patch_audit: env.__enovaSimulationCtx?.patchAudit || [],
      canonical_patch_scenarios: buildCanonicalPatchScenarios()
    };
  } catch (err) {
    return {
      ok: false,
      wa_id,
      start_stage: startStage || "inicio",
      end_stage: currentState?.fase_conversa || startStage || "inicio",
      dry_run: dryRun !== false,
      steps,
      patch_audit: env.__enovaSimulationCtx?.patchAudit || [],
      canonical_patch_scenarios: buildCanonicalPatchScenarios(),
      errors: {
        name: err?.name || "Error",
        message: err?.message || String(err)
      }
    };
  } finally {
    env.__enovaSimulationCtx = previousCtx;
  }
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
          error: "Worker validation exception"
        }),
        {
          status: 500,
          headers: { "content-type": "application/json" }
        }
      );
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
  const dedupKey = `${metadata.phone_number_id || "no_phone"}:${
    messageId || "no_message_id"
  }`;

  // ============================================================
  // 💠 ANTI-DUPLICAÇÃO META (janela de 10s, só em memória)
  // ============================================================
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
  const t = (userText || "").trim().toLowerCase();

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

  // ============================================================
  // 🛑 BLOCO D — ANTI-LOOP / ANTI-DUPLICAÇÃO
  // ============================================================

  // 1) Webhook duplicado (mesmo texto que já foi processado)
if (st.last_processed_text && st.last_processed_text === userText) {
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "duplicate_webhook",
    stage,
    severity: "warning",
    message: "Webhook duplicado detectado — processamento BLOQUEADO",
    details: {
      last_processed_text: st.last_processed_text,
      current_text: userText
    }
  });

  // corte: não reprocessa nem responde de novo
  return new Response("OK_DUPLICATE", { status: 200 });
}

// 2) Loop por repetição do cliente (comparar com a ÚLTIMA msg do cliente)
const nt_blockd = normalizeText(userText || "");
const prev_nt_blockd = normalizeText(st.last_user_text || "");

const isGreeting_blockd = /^(oi|ola|olá|bom dia|boa tarde|boa noite)\b/i.test(nt_blockd);
const isResetCmd_blockd = /^(reset|reiniciar|recomecar|recomeçar|do zero|nova analise|nova análise)\b/i.test(nt_blockd);

if (!isGreeting_blockd && !isResetCmd_blockd && prev_nt_blockd && prev_nt_blockd === nt_blockd) {
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "loop_message_detected",
    stage,
    severity: "warning",
    message: "Cliente enviou a mesma mensagem repetida — bloqueio de loop"
  });

  return step(env, st, [
    "Acho que essa mensagem veio igual à anterior 🤔",
    "Pode me mandar de outro jeitinho? Só pra eu garantir que entendi certinho."
  ], stage);
}

// 3) Registrar mensagem atual como última do cliente + última processada
await upsertState(env, st.wa_id, {
  last_user_text: userText,
  last_processed_text: userText,
  updated_at: new Date().toISOString()
});
st.last_user_text = userText;
st.last_processed_text = userText;

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

  // Texto bruto digitado pelo cliente
  let rawNome = (userText || "").trim();

  // Remove prefixos tipo "meu nome é", "sou o", etc.
  if (/^(meu nome e|meu nome é|sou|sou o|sou a|aqui e|aqui é)/i.test(rawNome)) {
    rawNome = rawNome
      .replace(/^(meu nome e|meu nome é|sou|sou o|sou a|aqui e|aqui é)\s*/i, "")
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
  if (partes.length < 2 || partes.length > 6) {
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
        "Me manda seu *nome completo*, tipo: *Bruno Vasques*."
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
    next_stage: "estado_civil",
    severity: "info",
    message: "inicio_nome: nome salvo e avançando para estado_civil",
    details: {
      nome: nomeCompleto,
      primeiro_nome: primeiroNome
    }
  });

  return step(
    env,
    st,
    [
      `Perfeito, ${primeiroNome}! 😉`,
      "Agora só pra eu te direcionar certinho...",
      "Me diga seu *estado civil* atual: solteiro(a), casado(a), união estável, separado(a), divorciado(a) ou viúvo(a)?"
    ],
    "estado_civil"
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

  // -------------------------------------------
  // 🇧🇷 BRASILEIRO
  // -------------------------------------------
  if (/^(brasileiro|brasileiro mesmo|brasileira|brasileira mesmo|daqui mesmo|sou daqui mesmo|sou brasileiro|sou brasileiro mesmo|sou brasileira mesmo|sou brasileira)$/i.test(nt)) {

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
  if (/^(estrangeiro|estrangeira|sou estrangeiro|sou estrangeira)$/i.test(nt)) {

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
        "Para financiar pelo Minha Casa Minha Vida é obrigatório ter o *RNM válido*.",
        "Quando você tiver o RNM, posso te ajudar a fazer tudo certinho! 😊"
      ],
      "fim_ineligivel"
    );
  }

  // -------------------------------------------
  // ✅ 2) POSSUI RNM → perguntar tipo de validade
  // -------------------------------------------
  if (isYes(nt) || /^sim$/i.test(nt)) {

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
  if (/^indeterminado$/i.test(nt)) {

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
      "Seu RNM é *válido* (com validade definida) ou *indeterminado*?",
      "Responda apenas: 👉 *válido* ou *indeterminado*"
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
        "Sinto muito pela perda 🙏",
        "Você sabe me dizer se o **inventário** já está resolvido?"
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
  const civil =
    /(civil|no papel|casamento civil|casad[ao] no papel)/i.test(t);

  const uniao_estavel =
    estadoCivilDetectado === "uniao_estavel" ||
    /(uni[aã]o est[áa]vel|estavel|vivemos juntos|moramos juntos)/i.test(t);

  // ===== CASAMENTO CIVIL NO PAPEL =====
  if (civil) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho",
      severity: "info",
      message: "Saindo da fase: confirmar_casamento → regime_trabalho (civil no papel)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, {
      casamento_formal: "civil_papel",
      financiamento_conjunto: true
    });

    return step(
      env,
      st,
      [
        "Perfeito! 📄",
        "Então seguimos com vocês **juntos no financiamento**.",
        "Agora me fale sobre seu **tipo de trabalho** (CLT, autônomo, servidor)."
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
      casamento_formal: "uniao_estavel"
    });

    return step(
      env,
      st,
      [
        "Perfeito! ✍️",
        "Vocês pretendem **comprar juntos**, só você, ou **apenas se precisar**?"
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
      "Conseguiu confirmar pra mim certinho? 😊",
      "O casamento é **civil no papel**, ou vocês vivem como **união estável**?"
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

  const sim = isYes(t) || /(sim|isso|claro|vamos juntos|comprar juntos|juntos)/i.test(t);
  const nao = isNo(t) || /(n[aã]o|s[oó] eu|apenas eu|só eu|somente eu)/i.test(t);
  const somente_se_precisar = /(se precisar|talvez|depende|s[oó] se precisar)/i.test(t);

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

  const sim = isYes(t) || /(sim|tem sim|possui|possui renda|ganha|trabalha)/i.test(t);
  const nao = isNo(t) || /(n[aã]o|nao tem|não tem|sem renda|não trabalha|nao trabalha)/i.test(t);

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

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho",
      severity: "info",
      message: "Saindo da fase: parceiro_tem_renda → regime_trabalho (parceiro sem renda)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, {
      parceiro_tem_renda: false,
      somar_renda: false
    });

    return step(
      env,
      st,
      [
        "Tranquilo! 😊",
        "Então seguimos só com a sua renda.",
        "Qual é o seu **tipo de trabalho**? CLT, autônomo(a) ou servidor(a)?"
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

// =========================================================
// C9 — SOMAR RENDA (SOLTEIRO)
// =========================================================
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

  const sozinho = /(s[oó]\s*(a\s*)?minha(\s+renda)?|s[oó]\s*eu|apenas\s+eu|somente\s+eu|s[oó]\s+com\s+(a\s*)?minha(\s+renda)?)/i.test(t);
  const composicaoSignal = parseComposicaoRenda(t);
  const parceiro = composicaoSignal === "parceiro" || /(parceir|namorad|companheir|meu boy|minha girl|minha esposa|minha mulher|meu marido)/i.test(t);
  const familiar = composicaoSignal === "familiar" || /(m[aã]e|pai|irm[aã]o|irm[aã]|tia|tio|primo|prima|av[oó]|sobrinh|fam[ií]li|parent)/i.test(t);

  // -----------------------------
  // SOLO — APENAS A RENDA DO TITULAR
  // -----------------------------
  if (sozinho) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho",
      severity: "info",
      message: "Saindo da fase: somar_renda_solteiro → regime_trabalho (solo)",
      details: { userText }
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

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "parceiro_tem_renda",
      severity: "info",
      message: "Saindo da fase: somar_renda_solteiro → parceiro_tem_renda (parceiro)",
      details: { userText }
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
        "Perfeito! 👏",
        "Seu parceiro(a) **tem renda própria** ou não tem?"
      ],
      "parceiro_tem_renda"
    );
  }

  // -----------------------------
  // QUER SOMAR COM FAMILIAR
  // -----------------------------
  if (familiar) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "somar_renda_familiar",
      severity: "info",
      message: "Saindo da fase: somar_renda_solteiro → somar_renda_familiar (familiar)",
      details: { userText }
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

  // 🟩 EXIT_STAGE (permanece na mesma fase)
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "somar_renda_solteiro",
    severity: "info",
    message: "Saindo da fase: somar_renda_solteiro → somar_renda_solteiro (fallback)",
    details: { userText }
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

  const mae = /(m[aã]e|minha m[aã]e)/i.test(t);
  const pai = /(pai|meu pai)/i.test(t);
  const avo = /(av[oó]|v[oó]|vov[oó]|vov[oó]s)/i.test(t);
  const tio = /(tio|tia)/i.test(t);
  const irmao = /(irm[aã]o|irm[aã]os|irm[aã]|minha irm[aã]|meu irm[aã]o)/i.test(t);
  const primo = /(primo|prima)/i.test(t);
  const qualquer = /(fam[ií]lia|qualquer|não sei|nao sei)/i.test(t);

  // --------------------------------------------------
  // MÃE
  // --------------------------------------------------
  if (mae) {

    // 🟩 EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho_parceiro_familiar",
      severity: "info",
      message: "Saindo da fase: somar_renda_familiar → regime_trabalho_parceiro_familiar (mãe)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, { familiar_tipo: "mae" });

    return step(
      env,
      st,
      [
        "Perfeito 👌",
        "Sua mãe trabalha com **carteira assinada**, é **autônoma** ou **servidora**?"
      ],
      "regime_trabalho_parceiro_familiar"
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
      next_stage: "regime_trabalho_parceiro_familiar",
      severity: "info",
      message: "Saindo da fase: somar_renda_familiar → regime_trabalho_parceiro_familiar (pai)",
      details: { userText }
    });

    await upsertState(env, st.wa_id, { familiar_tipo: "pai" });

    return step(
      env,
      st,
      [
        "Ótimo! 👍",
        "Seu pai trabalha com **carteira assinada**, é **autônomo** ou **servidor**?"
      ],
      "regime_trabalho_parceiro_familiar"
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
      message: "Saindo da fase: somar_renda_familiar → confirmar_avo_familiar (avô/avó)",
      details: { userText }
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
      details: { userText }
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
      message: "Saindo da fase: somar_renda_familiar → regime_trabalho_parceiro_familiar (irmão/irmã)",
      details: { userText }
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
      details: { userText }
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
      message: "Saindo da fase: somar_renda_familiar → regime_trabalho_parceiro_familiar (familiar genérico)",
      details: { userText }
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
    details: { userText }
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

  // Soma renda total (titular + familiar)
  const rendaTitular = Number(st.renda_titular || 0);
  const rendaTotal = rendaTitular + valor;

  await upsertState(env, st.wa_id, {
    renda_total_para_fluxo: rendaTotal
  });

  // 🟩 EXIT_STAGE → próxima fase: ctps_36
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "ctps_36",
    severity: "info",
    message: "Saindo da fase: renda_familiar_valor → ctps_36",
    details: { userText, rendaTitular, renda_parceiro: valor, rendaTotal }
  });

  return step(
    env,
    st,
    [
      "Perfeito! 👌",
      `Então a renda somada ficou em **R$ ${rendaTotal.toLocaleString("pt-BR")}**.`,
      "Agora vamos analisar seu histórico de trabalho.",
      "Você tem **36 meses de carteira assinada (CTPS)** nos últimos 3 anos?"
    ],
    "ctps_36"
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

  // -------------------------------------------
  // 👍 SIM — possui outra renda
  // -------------------------------------------
  if (isYes(nt) || /^sim$/i.test(nt)) {

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
  // ❌ NÃO — não possui outra renda
  // -------------------------------------------
  if (isNo(nt) || /^(nao|não)$/i.test(nt)) {

    await upsertState(env, st.wa_id, {
      multi_renda_flag: false,
      fase_conversa: "dependente"
    });

    st.multi_renda_flag = false;
    st.fase_conversa = "dependente";

    return step(
      env,
      st,
      ["Certo! Vamos continuar então 😊"],
      "dependente"
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

  const txt = userText || "";

  // Regex robusta pega:
  // Bico — 1200
  // Bico - 1.200
  // autonomo–800
  const match = txt.match(/(.+?)\s*[-–]\s*([\d\.,]+)/);

  if (!match) {
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

  const tipo = normalizeText(match[1].trim());
  const valorNumerico = Number(match[2].replace(/\./g, "").replace(",", ".")) || 0;

  // -------------------------------
  // Atualiza lista local (JSON)
  // -------------------------------
  let lista = Array.isArray(st.multi_renda_lista) ? st.multi_renda_lista : [];
  lista.push({
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

    // EXIT_STAGE → vai para renda
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "renda",
      severity: "info",
      message: "Saindo da fase regime_trabalho → renda (CLT)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Perfeito! 📄",
        "E qual é a sua **renda total mensal** (valor bruto que recebe no holerite)?"
      ],
      "renda"
    );
  }

  // ------------------------------------------------------
  // TITULAR É AUTÔNOMO
  // ------------------------------------------------------
  if (aut) {
    await upsertState(env, st.wa_id, {
      regime: "autonomo"
    });

    // EXIT_STAGE → vai para renda
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "renda",
      severity: "info",
      message: "Saindo da fase regime_trabalho → renda (AUTONOMO)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Certo! 👍",
        "E qual é a sua **renda mensal aproximada**, somando tudo?"
      ],
      "renda"
    );
  }

  // ------------------------------------------------------
  // TITULAR É SERVIDOR
  // ------------------------------------------------------
  if (serv) {
    await upsertState(env, st.wa_id, {
      regime: "servidor"
    });

    // EXIT_STAGE → vai para renda
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "renda",
      severity: "info",
      message: "Saindo da fase regime_trabalho → renda (SERVIDOR)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Perfeito! 👌",
        "E qual é a sua **renda total mensal**?"
      ],
      "renda"
    );
  }

  // ------------------------------------------------------
  // TITULAR É APOSENTADO
  // ------------------------------------------------------
  if (aposentado) {
    await upsertState(env, st.wa_id, {
      regime: "aposentadoria"
    });

    // EXIT_STAGE → vai para renda
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "renda",
      severity: "info",
      message: "Saindo da fase regime_trabalho → renda (APOSENTADO)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Entendi! 👍",
        "E qual é o valor que você **recebe de aposentadoria** por mês?"
      ],
      "renda"
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

// =========================================================
// 🧩 C16 — FIM_INELIGIVEL (fallback seguro para stage referenciado)
// =========================================================
case "fim_ineligivel": {

  await logger(env, {
    tag: "UNKNOWN_STAGE_REFERENCED",
    wa_id: st.wa_id,
    details: { stage: "fim_ineligivel", from_stage: st.fase_conversa || null }
  });

  return step(
    env,
    st,
    [
      "Entendi!",
      "Se quiser, a gente pode revisar tudo desde o início quando você estiver pronto(a)."
    ],
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
      "Perfeito, obrigado por confirmar.",
      "Vamos seguir para a parte de renda e continuar sua análise."
    ],
    "somar_renda_solteiro"
  );
}

// =========================================================
// 🧩 C19 — REGIME_TRABALHO_PARCEIRO_FAMILIAR
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
  const valido = /(clt|autonomo|autônomo|servidor|publico|público|aposentado|pensionista|informal|bico|bicos)/i.test(nt);

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

  await upsertState(env, st.wa_id, {
    regime_trabalho_parceiro_familiar: nt
  });

  return step(
    env,
    st,
    [
      "Perfeito!",
      "Agora me diga o valor da renda mensal dessa pessoa."
    ],
    "renda_parceiro_familiar"
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

  // SIM → ir coletar o segundo regime
  if (isYes(nt) || /^sim$/i.test(nt)) {

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

  // NÃO → segue direto para a renda extra
  if (isNo(nt) || /^(nao|não)$/i.test(nt)) {

    return step(
      env,
      st,
      [
        "Certo! 😊",
        "Agora me diga: você possui *mais alguma renda além dessa*?",
        "Responda *sim* ou *não*."
      ],
      "inicio_multi_renda_pergunta"
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

  // após registrar o regime, pergunta se há renda extra
  return step(
    env,
    st,
    [
      "Ótimo! 👍",
      "Agora me diga: você possui *mais alguma renda além dessa*?",
      "Responda *sim* ou *não*."
    ],
    "inicio_multi_renda_pergunta"
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

    // EXIT
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "renda_parceiro",
      severity: "info",
      message: "Saindo da fase regime_trabalho_parceiro → renda_parceiro (CLT)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Perfeito! 👍",
        "E quanto ele(a) ganha por mês, em média?"
      ],
      "renda_parceiro"
    );
  }

  // -----------------------------
  // AUTÔNOMO
  // -----------------------------
  if (auto) {
    await upsertState(env, st.wa_id, {
      regime_trabalho_parceiro: "autonomo"
    });

    // EXIT
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "renda_parceiro",
      severity: "info",
      message: "Saindo da fase regime_trabalho_parceiro → renda_parceiro (AUTÔNOMO)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Entendi! 😊",
        "Autônomo(a) também entra no programa, sem problema.",
        "Me diga qual é a **renda mensal média** dele(a)?"
      ],
      "renda_parceiro"
    );
  }

  // -----------------------------
  // SERVIDOR PÚBLICO
  // -----------------------------
  if (servidor) {
    await upsertState(env, st.wa_id, {
      regime_trabalho_parceiro: "servidor"
    });

    // EXIT
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "renda_parceiro",
      severity: "info",
      message: "Saindo da fase regime_trabalho_parceiro → renda_parceiro (SERVIDOR)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Ótimo! 👌",
        "Servidor(a) público costuma ter análise rápida.",
        "Qual é o salário mensal dele(a)?"
      ],
      "renda_parceiro"
    );
  }

  // -----------------------------
  // APOSENTADORIA
  // -----------------------------
  if (aposentadoria) {
    await upsertState(env, st.wa_id, {
      regime_trabalho_parceiro: "aposentadoria"
    });

    // EXIT
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "renda_parceiro",
      severity: "info",
      message: "Saindo da fase regime_trabalho_parceiro → renda_parceiro (APOSENTADORIA)",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Perfeito! 👍",
        "E quanto ele(a) recebe por mês de aposentadoria, em média?"
      ],
      "renda_parceiro"
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

  const valor = parseMoneyBR(t); // captura número digitado

  // -----------------------------------
  // VALOR VÁLIDO
  // -----------------------------------
  if (!isNaN(valor) && valor > 300) {

    await upsertState(env, st.wa_id, {
      renda: valor,
      renda_total_para_fluxo: valor
    });

    // 🟩 EXIT → próxima fase é renda_parceiro OU possui_renda_extra
    const nextStage = (st.somar_renda && st.parceiro_tem_renda)
      ? "renda_parceiro"
      : "possui_renda_extra";

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
        parceiro_tem_renda: st.parceiro_tem_renda || null
      }
    });

    // Se tinha parceiro com renda → pergunta renda dele(a)
    if (st.somar_renda && st.parceiro_tem_renda) {
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

    // Se é só o titular
    return step(
      env,
      st,
      [
        "Show! 👌",
        "Você possui **renda extra**, como comissão, bicos, horas extras ou premiações?"
      ],
      "possui_renda_extra"
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

  // Captura número da renda
  const valor = parseMoneyBR(t);

  // -----------------------------------
  // VALOR INVÁLIDO
  // -----------------------------------
  if (!valor || isNaN(valor) || valor < 200) {

    // 🔻 EXIT mantendo a fase
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
  // SALVA RENDA DO PARCEIRO
  // -----------------------------------
  await upsertState(env, st.wa_id, {
    renda_parceiro: valor
  });

  // -----------------------------------
  // ATUALIZA RENDA TOTAL
  // -----------------------------------
  const rendaTitular = Number(st.renda || st.renda_total_para_fluxo || 0);
  const rendaTotal = rendaTitular + valor;

  await upsertState(env, st.wa_id, {
    renda_total_para_fluxo: rendaTotal
  });

  // -----------------------------------
  // SE AUTÔNOMO → PERGUNTAR IR
  // -----------------------------------
  if (st.regime_trabalho_parceiro === "autonomo" || st.regime_parceiro === "AUTONOMO") {

    // 🟩 EXIT desta fase indo para ir_declarado
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "ir_declarado",
      severity: "info",
      message: "Saindo de renda_parceiro → ir_declarado",
      details: {
        renda_parceiro: valor,
        renda_titular: rendaTitular,
        renda_total: rendaTotal
      }
    });

    return step(
      env,
      st,
      [
        "Perfeito! 👌",
        "O parceiro(a) **declara Imposto de Renda**?"
      ],
      "ir_declarado"
    );
  }

  // -----------------------------------
  // NÃO AUTÔNOMO → segue para CTPS
  // -----------------------------------

  // 🟩 EXIT indo para ctps_36
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "ctps_36",
    severity: "info",
    message: "Saindo de renda_parceiro → ctps_36",
    details: {
      renda_parceiro: valor,
      renda_titular: rendaTitular,
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

// =========================================================
// 🧩 C23 — RENDA DO FAMILIAR QUE COMPÕE
// =========================================================
case "renda_parceiro_familiar": {

  // ============================================================
  // 🛰 TELEMETRIA — Entrada na fase "renda_parceiro_familiar"
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: renda_parceiro_familiar",
    details: {
      familiar_tipo: st.familiar_tipo || null,
      renda_titular: st.renda_titular || null,
      renda_total_atual: st.renda_total_para_fluxo || null
    }
  });

  const valor = parseMoneyBR(t);

  // ============================================================
  // VALOR INVÁLIDO
  // ============================================================
  if (!valor || valor < 200) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "renda_parceiro_familiar",
      severity: "warning",
      message: "Valor inválido → permanecendo em renda_parceiro_familiar",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Conseguiu confirmar pra mim o valor certinho? 🤔",
        "Me diga aproximadamente quanto o(a) familiar ganha por mês."
      ],
      "renda_parceiro_familiar"
    );
  }

  // ============================================================
  // VALOR VÁLIDO — SALVAR NO BANCO
  // ============================================================
  const rendaTitular = Number(st.renda_titular || 0);
  const rendaTotal = rendaTitular + valor;

  await upsertState(env, st.wa_id, {
    renda_parceiro: valor,
    renda_total_para_fluxo: rendaTotal,
    somar_renda: true,
    financiamento_conjunto: true
  });

  // ============================================================
  // EXIT → próxima fase = ir_declarado
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "ir_declarado",
    severity: "info",
    message: "Saindo da fase renda_parceiro_familiar → ir_declarado",
    details: {
      renda_familiar: valor,
      renda_titular: rendaTitular,
      renda_total: rendaTotal
    }
  });

  return step(
    env,
    st,
    [
      "Perfeito! 👌",
      "Agora vou seguir com a análise completa!",
      "Você declara **Imposto de Renda**?"
    ],
    "ir_declarado"
  );
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
  const nao = /(nao|não|n\s?tem|nenhuma|zero)/i.test(t);

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
  const sozinho  = /(s[oó]\s*(a\s*)?minha(\s+renda)?|s[oó]\s*eu|apenas eu|somente eu|solo|sozinh)/i.test(t);

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
      next_stage: "regime_trabalho_parceiro_familiar",
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
        "Qual o **tipo de trabalho** dessa pessoa?"
      ],
      "regime_trabalho_parceiro_familiar"
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

  const composicaoSignal = parseComposicaoRenda(t);
  const parceiro = composicaoSignal === "parceiro" || /(parceir|namorad|espos|marid|mulher|boy|girl)/i.test(t);
  const familia  = composicaoSignal === "familiar" || /(pai|m[aã]e|mae|irm[aã]|av[oó]|tia|tio|primo|prima|famil)/i.test(t);
  const sozinho  = /(s[oó]\s*(a\s*)?minha(\s+renda)?|s[oó]\s*eu|apenas eu|somente eu|solo|sozinh)/i.test(t);

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

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regime_trabalho_parceiro_familiar",
      severity: "info",
      message: "Composição escolhida: familiar",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Show! 👌",
        "Vamos compor renda com familiar.",
        "Qual o **tipo de trabalho** dessa pessoa?"
      ],
      "regime_trabalho_parceiro_familiar"
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
      next_stage: "ir_declarado",
      severity: "info",
      message: "Composição escolhida: só o titular",
      details: { userText }
    });

    return step(
      env,
      st,
      [
        "Entendi! 👍",
        "Seguimos só com a sua renda então.",
        "Você declara **Imposto de Renda**?"
      ],
      "ir_declarado"
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

  const yes =
    /^(1|sim|s|declaro|declara)$/i.test(t) ||
    /(fa[çc]o imposto|fa[çc]o ir|imposto de renda)/i.test(t);

  const no =
    /^(2|nao|não|n)$/i.test(t) ||
    /(n[aã]o declaro|sem imposto|nunca declarei)/i.test(t);

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
    /(n[aã]o|não consigo|nao consigo|não tenho|nao tenho|sem comprovante|nao declaro|não declaro)/i.test(t);

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
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "enter_phase",
    stage,
    severity: "info",
    message: "Entrando na fase: ctps_36",
    details: {
      somar_renda: st.somar_renda || null,
      renda_total: st.renda_total_para_fluxo || null,
      regime: st.regime || null
    }
  });

  const sim = /(sim|tenho|possuo|completo|mais de 36|acima de 36)/i.test(t);
  const nao = /(n[aã]o|não tenho|menos de 36|nao possuo)/i.test(t);
  const nao_sei = /(nao sei|não sei|não lembro|talvez|acho)/i.test(t);

  // ============================================================
  // SIM — Possui 36 meses
  // ============================================================
  if (sim) {

    await upsertState(env, st.wa_id, { ctps_36: true });

    // 🔥 Lógica canônica:
    // Se soma renda → pular dependente e seguir para restrição
    // Se não soma renda → perguntar dependente
    const nextStage = st.somar_renda ? "restricao" : "dependente";

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: nextStage,
      severity: "info",
      message: "CTPS >=36 verificado",
      details: { somar_renda: st.somar_renda }
    });

    // 🌟 SOLO: perguntar dependente
    if (!st.somar_renda) {
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

    // 🌟 SOMANDO RENDA: pular dependente
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
  // NÃO — Não possui 36 meses
  // ============================================================
  if (nao) {

    await upsertState(env, st.wa_id, { ctps_36: false });

    const nextStage = st.somar_renda ? "restricao" : "dependente";

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: nextStage,
      severity: "info",
      message: "CTPS <36 verificado",
      details: { somar_renda: st.somar_renda }
    });

    // 🌟 SOLO: perguntar dependente
    if (!st.somar_renda) {
      return step(
        env,
        st,
        [
          "Tranquilo, isso acontece bastante! 👍",
          "Agora me diga:",
          "Você tem **dependente menor de 18 anos**?"
        ],
        "dependente"
      );
    }

    // 🌟 SOMANDO RENDA: pular dependente
    return step(
      env,
      st,
      [
        "Tranquilo! 👍",
        "Agora preciso confirmar:",
        "Você está com **alguma restrição no CPF** como negativação?"
      ],
      "restricao"
    );
  }

  // ============================================================
  // NÃO SABE INFORMAR
  // ============================================================
  if (nao_sei) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "ctps_36",
      severity: "warning",
      message: "Cliente não sabe CTPS — permanecendo"
    });

    return step(
      env,
      st,
      [
        "Sem problema! 😊",
        "É só somar o tempo dos últimos empregos.",
        "Diria que chega **próximo** ou **bem distante** dos 36 meses?"
      ],
      "ctps_36"
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
    message: "Resposta não compreendida"
  });

  return step(
    env,
    st,
    [
      "Consegue me confirmar certinho? 😊",
      "Você possui **36 meses de carteira assinada** nos últimos 3 anos?"
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

  const sim = /(sim|tem sim|possui|possu[ií] carteira|completo|completa|mais de 36|acima de 36)/i.test(t);
  const nao = /(n[aã]o|não tem|nao tem|menos de 36|nao possui|não possui|não completa)/i.test(t);
  const nao_sei = /(não sei|nao sei|talvez|acho|não lembro|nao lembro)/i.test(t);

  const somar = st.somar_renda === true;

  // ============================================================
  // PARCEIRO TEM 36+ MESES DE CARTEIRA
  // ============================================================
  if (sim) {

    await upsertState(env, st.wa_id, { ctps_36_parceiro: true });

    // EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: (!somar ? "restricao" : "dependente"),
      severity: "info",
      message: "Parceiro possui 36+ meses de CTPS — redirecionando",
      details: { somar_renda: somar }
    });

    if (!somar) {
      return step(env, st,
        [
          "Perfeito! 👏",
          "Agora vamos só confirmar uma coisinha rápida:",
          "Você está com **alguma restrição no CPF**, como negativação?"
        ],
        "restricao"
      );
    }

    return step(env, st,
      [
        "Ótimo! 👏",
        "Agora só preciso confirmar uma coisa:",
        "Vocês têm **dependente menor de 18 anos**?"
      ],
      "dependente"
    );
  }

  // ============================================================
  // PARCEIRO NÃO TEM 36 MESES
  // ============================================================
  if (nao) {

    await upsertState(env, st.wa_id, { ctps_36_parceiro: false });

    // EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: (!somar ? "restricao" : "dependente"),
      severity: "info",
      message: "Parceiro NÃO tem 36 meses de CTPS — redirecionando",
      details: { somar_renda: somar }
    });

    if (!somar) {
      return step(env, st,
        [
          "Sem problema! 👍",
          "Agora só mais uma coisinha:",
          "Você está com **alguma restrição no CPF**, como negativação?"
        ],
        "restricao"
      );
    }

    return step(env, st,
      [
        "Sem problema! 👍",
        "Mesmo sem completar os 36 meses, ainda dá pra analisar normalmente.",
        "Vocês têm **dependente menor de 18 anos**?"
      ],
      "dependente"
    );
  }

  // ============================================================
  // PARCEIRO NÃO SABE / INCERTO
  // ============================================================
  if (nao_sei) {

    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "ctps_36_parceiro",
      severity: "warning",
      message: "Parceiro não sabe informar CTPS — permanência na fase"
    });

    return step(env, st,
      [
        "Sem pressa 😊",
        "Normalmente é só somar o tempo de carteira assinada dos últimos empregos.",
        "Diria que está **próximo** ou **bem distante** dos 36 meses?"
      ],
      "ctps_36_parceiro"
    );
  }

  // ============================================================
  // NÃO ENTENDIDO
  // ============================================================
  await funnelTelemetry(env, {
    wa_id: st.wa_id,
    event: "exit_stage",
    stage,
    next_stage: "ctps_36_parceiro",
    severity: "warning",
    message: "Resposta não reconhecida — permanência na fase"
  });

  return step(env, st,
    [
      "Só pra confirmar certinho 😊",
      "O parceiro(a) tem **36 meses ou mais** de carteira assinada somando os últimos empregos?"
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

  // --------------------------------------------
  // 1 — PULAR DEPENDENTES SE FOR COMPOSIÇÃO
  // --------------------------------------------
  if (st.financiamento_conjunto === true || st.somar_renda === true) {

    await upsertState(env, st.wa_id, {
      dependentes_qtd: 0
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
  // 2 — PERGUNTA PARA SOLO
  // --------------------------------------------
  const txt = (userText || "").toLowerCase();

  const sim =
    isYes(txt) || /(sim|tenho|filho|filha|crian[cç]a|menor|dependente)/i.test(txt);

  const nao =
    isNo(txt) || /(nao|não|nao tenho|não tenho|sem dependente|só eu|somente eu)/i.test(txt);

  const talvez =
    /(não sei|nao sei|talvez|acho|não lembro|nao lembro)/i.test(txt);

  // --------------------------------------------
  // SIM → possui dependente
  // --------------------------------------------
  if (sim) {

    await upsertState(env, st.wa_id, { dependentes_qtd: 1 });

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

    await upsertState(env, st.wa_id, { dependentes_qtd: 0 });

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

  const sim = isYes(t) || /(sim|tenho|tem sim|sou negativado|estou negativado|negativad|serasa|spc)/i.test(t);
  const nao = isNo(t) || /(n[aã]o|não tenho|nao tenho|tudo certo|cpf limpo|sem restri[cç][aã]o)/i.test(t);
  const incerto = /(nao sei|não sei|talvez|acho|pode ser|não lembro|nao lembro)/i.test(t);

  // -----------------------------------------------------
  // CPF COM RESTRIÇÃO
  // -----------------------------------------------------
  if (sim) {
    await upsertState(env, st.wa_id, {
      restricao: true
    });

    // EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regularizacao_restricao",
      severity: "warning",
      message: "Cliente confirmou restrição no CPF"
    });

    return step(env, st,
      [
        "Obrigado por avisar! 🙏",
        "Com **restrição ativa**, a Caixa exige que o CPF esteja limpo para analisar.",
        "Mas relaxa, vou te orientar certinho.",
        "Você sabe se já está fazendo alguma **regularização**?"
      ],
      "regularizacao_restricao"
    );
  }

  // -----------------------------------------------------
  // CPF LIMPO
  // -----------------------------------------------------
  if (nao) {
    await upsertState(env, st.wa_id, {
      restricao: false
    });

    // EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "envio_docs",
      severity: "info",
      message: "CPF limpo confirmado"
    });

    return step(env, st,
      [
        "Perfeito! 👌",
        "Isso ajuda bastante na análise.",
        "Agora vamos pra parte final: preciso de alguns **documentos simples** pra montar sua ficha. Posso te passar a lista?"
      ],
      "envio_docs"
    );
  }

  // -----------------------------------------------------
  // CPF INCERTO / NÃO LEMBRA
  // -----------------------------------------------------
  if (incerto) {
    await upsertState(env, st.wa_id, {
      restricao: "incerto"
    });

    // EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "regularizacao_restricao",
      severity: "warning",
      message: "Cliente não sabe se tem restrição"
    });

    return step(env, st,
      [
        "Tranquilo, isso é bem comum 😊",
        "Normalmente você recebe SMS ou e-mail quando tem restrição.",
        "Se quiser, posso te ajudar a verificar isso grátis pelo app da Serasa.",
        "Mas antes: você **acha** que pode ter algo pendente?"
      ],
      "regularizacao_restricao"
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
      "Tem alguma **restrição** no CPF? (Serasa, SPC)"
    ],
    "restricao"
  );
}

// =========================================================
// 🧩 C35 — REGULARIZAÇÃO DA RESTRIÇÃO
// =========================================================
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

  const sim = isYes(t) || /(sim|já estou|ja estou|estou vendo|to vendo|estou resolvendo|tô resolvendo|pagando|negociando)/i.test(t);
  const nao = isNo(t) || /(n[aã]o|não estou|nao estou|ainda não|ainda nao|não mexi|nao mexi)/i.test(t);
  const talvez = /(talvez|acho|nao sei|não sei|pode ser)/i.test(t);

  // -----------------------------------------------------
  // JÁ ESTÁ REGULARIZANDO
  // -----------------------------------------------------
  if (sim) {

    await upsertState(env, st.wa_id, {
      regularizacao_restricao: "em_andamento"
    });

    // EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "envio_docs",
      severity: "info",
      message: "Cliente está regularizando a restrição",
      details: { userText }
    });

    return step(env, st,
      [
        "Ótimo! 👏",
        "Quando a restrição sai do sistema, consigo seguir sua análise normalmente.",
        "Enquanto isso, já posso te adiantar a lista de **documentos** pra você ir separando. Quer que eu te envie?"
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

    // EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "envio_docs",
      severity: "warning",
      message: "Cliente NÃO está regularizando a restrição",
      details: { userText }
    });

    return step(env, st,
      [
        "Tranquilo, isso é bem comum 😊",
        "Pra Caixa analisar, o CPF precisa estar limpo.",
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

    // EXIT_STAGE
    await funnelTelemetry(env, {
      wa_id: st.wa_id,
      event: "exit_stage",
      stage,
      next_stage: "envio_docs",
      severity: "warning",
      message: "Cliente incerto sobre regularização",
      details: { userText }
    });

    return step(env, st,
      [
        "Sem problema 😊",
        "Se quiser, te ensino a consultar grátis no app da Serasa.",
        "Mas independente disso, já posso te passar a lista de **documentos básicos** pra deixar tudo pronto?"
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
    next_stage: "regularizacao_restricao",
    severity: "warning",
    message: "Resposta não reconhecida — repetindo pergunta",
    details: { userText }
  });

  return step(env, st,
    [
      "Conseguiu me confirmar certinho? 😊",
      "Você está **regularizando** a restrição ou ainda não?"
    ],
    "regularizacao_restricao"
  );
}

// =========================================================
// 🧩 C36 — ENVIO DE DOCUMENTOS (NOVA VERSÃO DEFINITIVA)
// =========================================================
case "envio_docs": {

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
