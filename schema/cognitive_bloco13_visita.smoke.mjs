import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

const adminKey = "smoke-admin-key";
const waCaso = "5541999998888";

function buildEnv() {
  return {
    ENV_MODE: "test",
    COGNITIVE_V2_MODE: "on",
    ENOVA_ADMIN_KEY: adminKey,
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
          nome: "MARIA TESTE",
          pre_cadastro_numero: "999001",
          fase_conversa: "agendamento_visita",
          opening_used: true,
          visita_agendamento_status: "convite",
          visita_convite_status: "pendente",
          visita_origem: "aprovado",
          visita_confirmada: false,
          updated_at: "2026-04-01T00:00:00.000Z"
        }
      }
    }
  };
}

async function simulateFromState(env, stage, text, stOverrides = {}) {
  const req = new Request("https://enova.local/__admin__/simulate-from-state", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-enova-admin-key": adminKey
    },
    body: JSON.stringify({
      wa_id: waCaso,
      stage,
      text,
      dry_run: true,
      max_steps: 1,
      st_overrides: stOverrides
    })
  });
  const resp = await worker.fetch(req, env, { waitUntil() {} });
  assert.equal(resp.status, 200);
  const data = await resp.json();
  assert.equal(data.ok, true);
  return data;
}

let passed = 0;

// ─── agendamento_visita ──────────────────────────────────────

// 1) Convite pendente (aprovado) — fala cognitiva sem "Prefiro ver depois"
{
  const env = buildEnv();
  const data = await simulateFromState(env, "agendamento_visita", "talvez", {
    visita_agendamento_status: "convite",
    visita_origem: "aprovado"
  });
  assert.equal(data.stage_after, "agendamento_visita");
  assert.ok(/aprovado|plant[aã]o|Boa Vista|agenda/i.test(data.reply_text), "convite should mention approval or plantão");
  assert.ok(!/Prefiro ver depois/i.test(data.reply_text), "cognitive reply must NOT show 'Prefiro ver depois'");
  passed++;
}

// 2) Convite pendente (trava_documental) — deve mencionar docs mínimos
{
  const env = buildEnv();
  const data = await simulateFromState(env, "agendamento_visita", "talvez", {
    visita_agendamento_status: "convite",
    visita_origem: "trava_documental"
  });
  assert.ok(/documento|comprovante|renda|resid[eê]ncia/i.test(data.reply_text), "trava_documental convite should mention docs to bring");
  passed++;
}

// 3) Convite pendente (recusa_online) — deve mencionar docs mínimos
{
  const env = buildEnv();
  const data = await simulateFromState(env, "agendamento_visita", "talvez", {
    visita_agendamento_status: "convite",
    visita_origem: "recusa_online"
  });
  assert.ok(/documento|comprovante|renda|resid[eê]ncia/i.test(data.reply_text), "recusa_online convite should mention docs to bring");
  passed++;
}

// 4) Convite aceito → mostra datas fechadas
{
  const env = buildEnv();
  const data = await simulateFromState(env, "agendamento_visita", "sim", {
    visita_agendamento_status: "convite",
    visita_origem: "aprovado"
  });
  assert.equal(data.writes.visita_agendamento_status, "data", "should transition to data");
  passed++;
}

// 5) Convite adiado — persuasão firme
{
  const env = buildEnv();
  const data = await simulateFromState(env, "agendamento_visita", "depois", {
    visita_agendamento_status: "convite",
    visita_origem: "aprovado"
  });
  assert.ok(/vale|garanti|r[aá]pido|preench/i.test(data.reply_text), "adiado should push back firmly");
  assert.equal(data.writes.visita_agendamento_status, "convite", "status stays convite");
  passed++;
}

// 6) Domingo bloqueado
{
  const env = buildEnv();
  const data = await simulateFromState(env, "agendamento_visita", "domingo", {
    visita_agendamento_status: "data",
    visita_convite_status: "aceito",
    visita_origem: "aprovado"
  });
  assert.ok(/domingo.*atendimento|n[aã]o temos/i.test(data.reply_text), "should block domingo");
  passed++;
}

// 7) Data válida → mostra horários oficiais
{
  const env = buildEnv();
  const data = await simulateFromState(env, "agendamento_visita", "1", {
    visita_agendamento_status: "data",
    visita_convite_status: "aceito",
    visita_origem: "aprovado"
  });
  assert.equal(data.writes.visita_agendamento_status, "horario", "should transition to horario");
  assert.ok(/hor[aá]rio|10:00|14:30|17:00|19:30/i.test(data.reply_text), "should show official slots");
  passed++;
}

// 8) Data inválida → re-mostra opções fechadas
{
  const env = buildEnv();
  const data = await simulateFromState(env, "agendamento_visita", "semana que vem", {
    visita_agendamento_status: "data",
    visita_convite_status: "aceito",
    visita_origem: "aprovado"
  });
  assert.ok(/1\)|2\)|3\)|opç[oõ]es|fechada/i.test(data.reply_text), "should re-show date options");
  passed++;
}

// 9) Horário válido → confirma visita com endereço Boa Vista
{
  const env = buildEnv();
  const data = await simulateFromState(env, "agendamento_visita", "2", {
    visita_agendamento_status: "horario",
    visita_convite_status: "aceito",
    visita_data_escolhida: "2026-04-07",
    visita_origem: "aprovado",
    visita_primeiro_slot_disponivel_em: "2026-04-07T13:00:00.000Z"
  });
  assert.equal(data.stage_after, "visita_confirmada", "should advance to visita_confirmada");
  assert.equal(data.writes.visita_agendamento_status, "confirmada");
  assert.equal(data.writes.visita_confirmada, true);
  assert.ok(/confirmada|Boa Vista|Paran[aá]|2474/i.test(data.reply_text), "should include confirmation + address");
  passed++;
}

// 10) Horário fora da grade → redireciona para slots oficiais
{
  const env = buildEnv();
  const data = await simulateFromState(env, "agendamento_visita", "8:00", {
    visita_agendamento_status: "horario",
    visita_convite_status: "aceito",
    visita_data_escolhida: "2026-04-07",
    visita_origem: "aprovado",
    visita_primeiro_slot_disponivel_em: "2026-04-07T13:00:00.000Z"
  });
  assert.ok(/oficial|10:00|14:30|17:00|19:30/i.test(data.reply_text), "should redirect to official slots");
  passed++;
}

// 11) "Já fui ao plantão" no convite — persuasão máxima
{
  const env = buildEnv();
  const data = await simulateFromState(env, "agendamento_visita", "já fui lá no plantão", {
    visita_agendamento_status: "convite",
    visita_origem: "aprovado"
  });
  assert.ok(/nem sempre|mesmas|corretor|perfil|favor|vale a pena/i.test(data.reply_text), "'já fui' should get persuasive response");
  assert.equal(data.stage_after, "agendamento_visita", "stage stays agendamento_visita");
  passed++;
}

// 12) aprovado_condicionado tratado como aprovado na condução
{
  const env = buildEnv();
  const data = await simulateFromState(env, "agendamento_visita", "talvez", {
    visita_agendamento_status: "convite",
    visita_origem: "aprovado_condicionado"
  });
  assert.ok(/aprovado|plant[aã]o|agenda/i.test(data.reply_text), "aprovado_condicionado should invite to visit");
  passed++;
}

// ─── visita_confirmada ──────────────────────────────────────

// 13) Realizada
{
  const env = buildEnv();
  const data = await simulateFromState(env, "visita_confirmada", "fiz a visita", {
    visita_agendamento_status: "confirmada",
    visita_confirmada: true,
    visita_dia_hora: "seg 07/04 10:00"
  });
  assert.equal(data.writes.visita_resultado_status, "realizada");
  assert.ok(/realizada/i.test(data.reply_text));
  passed++;
}

// 14) No-show + oferta de reagendamento
{
  const env = buildEnv();
  const data = await simulateFromState(env, "visita_confirmada", "não fui", {
    visita_agendamento_status: "confirmada",
    visita_confirmada: true,
    visita_dia_hora: "seg 07/04 10:00"
  });
  assert.equal(data.writes.visita_resultado_status, "no_show");
  assert.ok(/comparecimento|remarca|data/i.test(data.reply_text));
  passed++;
}

// 15) Reagendamento → volta para agendamento_visita
{
  const env = buildEnv();
  const data = await simulateFromState(env, "visita_confirmada", "quero reagendar", {
    visita_agendamento_status: "confirmada",
    visita_confirmada: true,
    visita_dia_hora: "seg 07/04 10:00"
  });
  assert.equal(data.stage_after, "agendamento_visita");
  assert.equal(data.writes.visita_agendamento_status, "convite");
  assert.equal(data.writes.visita_confirmada, false);
  passed++;
}

// 16) Cancelamento
{
  const env = buildEnv();
  const data = await simulateFromState(env, "visita_confirmada", "quero cancelar", {
    visita_agendamento_status: "confirmada",
    visita_confirmada: true,
    visita_dia_hora: "seg 07/04 10:00"
  });
  assert.equal(data.writes.visita_resultado_status, "cancelada");
  assert.equal(data.writes.visita_confirmada, false);
  assert.ok(/cancelada/i.test(data.reply_text));
  passed++;
}

// 17) Endereço Boa Vista correto
{
  const env = buildEnv();
  const data = await simulateFromState(env, "visita_confirmada", "onde fica o plantão?", {
    visita_agendamento_status: "confirmada",
    visita_confirmada: true,
    visita_dia_hora: "seg 07/04 10:00"
  });
  assert.ok(/Paran[aá].*2474|Boa Vista|terminal/i.test(data.reply_text), "should return correct address");
  passed++;
}

// 18) Detalhes da visita
{
  const env = buildEnv();
  const data = await simulateFromState(env, "visita_confirmada", "quero relembrar", {
    visita_agendamento_status: "confirmada",
    visita_confirmada: true,
    visita_dia_hora: "seg 07/04 10:00"
  });
  assert.ok(/seg 07\/04 10:00/i.test(data.reply_text), "should show visit details");
  assert.ok(/Boa Vista|Paran[aá]/i.test(data.reply_text), "should include address");
  passed++;
}

// 19) "Já fui ao plantão" no pós-confirmação
{
  const env = buildEnv();
  const data = await simulateFromState(env, "visita_confirmada", "já fui no plantão", {
    visita_agendamento_status: "confirmada",
    visita_confirmada: true,
    visita_dia_hora: "seg 07/04 10:00"
  });
  assert.ok(/nem sempre|mesmas|corretor|perfil|favor|vale a pena/i.test(data.reply_text), "'já fui' in confirmada should get persuasive response");
  passed++;
}

// 20) Fallback genérico → opções de ação
{
  const env = buildEnv();
  const data = await simulateFromState(env, "visita_confirmada", "e agora?", {
    visita_agendamento_status: "confirmada",
    visita_confirmada: true,
    visita_dia_hora: "seg 07/04 10:00"
  });
  assert.ok(/confirmada|Reagendar|Cancelar|endere[çc]o|detalhe/i.test(data.reply_text), "fallback should present action options");
  passed++;
}

// ─── Integridade mecânica (regressão) ────────────────────────

// 21) nextStage permanece dentro do bloco 13
{
  const env = buildEnv();
  const data = await simulateFromState(env, "agendamento_visita", "sim", {
    visita_agendamento_status: "convite",
    visita_origem: "aprovado"
  });
  assert.ok(
    data.stage_after === "agendamento_visita" || data.stage_after === "visita_confirmada",
    "nextStage must stay within bloco 13"
  );
  passed++;
}

// 22) Sábado permitido
{
  const env = buildEnv();
  const data = await simulateFromState(env, "agendamento_visita", "sábado", {
    visita_agendamento_status: "data",
    visita_convite_status: "aceito",
    visita_origem: "aprovado"
  });
  assert.ok(!/n[aã]o temos atendimento/i.test(data.reply_text), "sábado should not be blocked");
  passed++;
}

// 23) +24h rule → visita_primeiro_slot_disponivel_em persistido
{
  const env = buildEnv();
  const data = await simulateFromState(env, "agendamento_visita", "sim", {
    visita_agendamento_status: "convite",
    visita_origem: "aprovado"
  });
  assert.ok(data.writes.visita_primeiro_slot_disponivel_em, "+24h slot ref should be persisted");
  const slotDate = new Date(data.writes.visita_primeiro_slot_disponivel_em);
  assert.ok(slotDate.getTime() > Date.now() + 23 * 3600 * 1000, "first slot should be >23h in the future");
  passed++;
}

// 24) Slot real persistido na confirmação
{
  const env = buildEnv();
  const data = await simulateFromState(env, "agendamento_visita", "1", {
    visita_agendamento_status: "horario",
    visita_convite_status: "aceito",
    visita_data_escolhida: "2026-04-07",
    visita_origem: "aprovado",
    visita_primeiro_slot_disponivel_em: "2026-04-07T13:00:00.000Z"
  });
  assert.ok(data.writes.visita_dia_hora, "visita_dia_hora must be persisted (slot real)");
  assert.ok(data.writes.visita_slot_escolhido, "visita_slot_escolhido must be persisted");
  assert.equal(data.writes.visita_confirmada, true);
  assert.ok(data.writes.visita_confirmada_em, "visita_confirmada_em must be set");
  passed++;
}

// 25) visita_confirmada stays in stage after all actions
{
  const env = buildEnv();
  const data = await simulateFromState(env, "visita_confirmada", "onde fica?", {
    visita_agendamento_status: "confirmada",
    visita_confirmada: true,
    visita_dia_hora: "seg 07/04 10:00"
  });
  assert.equal(data.stage_after, "visita_confirmada", "endereço keeps stage");
  passed++;
}

// 26) Confirmação com trava_documental inclui docs
{
  const env = buildEnv();
  const data = await simulateFromState(env, "agendamento_visita", "1", {
    visita_agendamento_status: "horario",
    visita_convite_status: "aceito",
    visita_data_escolhida: "2026-04-07",
    visita_origem: "trava_documental",
    visita_primeiro_slot_disponivel_em: "2026-04-07T13:00:00.000Z"
  });
  assert.ok(/documento|comprovante|renda/i.test(data.reply_text), "confirmation with trava_documental should remind about docs");
  passed++;
}

// 27) Sem "Posso te mostrar?" no convite cognitivo
{
  const env = buildEnv();
  const data = await simulateFromState(env, "agendamento_visita", "talvez", {
    visita_agendamento_status: "convite",
    visita_origem: "aprovado"
  });
  assert.ok(!/Posso te mostrar/i.test(data.reply_text), "cognitive reply must NOT say 'Posso te mostrar'");
  passed++;
}

console.log(`✅ cognitive_bloco13_visita.smoke.mjs — ${passed} tests passed`);
