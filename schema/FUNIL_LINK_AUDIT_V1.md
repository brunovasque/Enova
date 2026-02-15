# FUNIL_LINK_AUDIT_V1

WORKFLOW_ACK: ok

Escopo: DOC-only. Auditoria de linkagem entre:
- `schema/FUNIL_MINIMO_CANONICO_V1.md` (14 fases canônicas)
- `schema/FUNIL_GRAPH_V1.md` (grafo documentado)
- `Enova worker.js` (runtime real)

## MATRIZ 14/14 (1 fase = 1 bloco)

### 1) Início
- fase_canônica: Início
- stage_real_no_worker: `inicio`
- existe_no_worker: sim
- ligado_no_fluxo_principal: sim + prova (`const stage = st.fase_conversa || "inicio";` + `case "inicio": {`)
- entradas aceitas (text patterns/gates): reset (`reset|resetar|recomeçar|começar do zero`), saudação (`oi|ola|bom dia|boa tarde|boa noite`), iniciar (`nova analise|iniciar|do zero`)
- writes/reads (state): reads `st.fase_conversa`, `userText`; write por helper `resetTotal(...)`
- next_stage real: `inicio_programa` (ou `inicio_decisao` em retomada)
- evidência (âncora colável do worker.js: snippet exato):
```js
const stage = st.fase_conversa || "inicio";
...
case "inicio": {
...
return step(..., "inicio_programa");
```
- divergência com FUNIL_GRAPH_V1 (se houver): sem divergência estrutural relevante
- ação futura sugerida: ajustar

### 2) Nome
- fase_canônica: Nome
- stage_real_no_worker: `inicio_nome`
- existe_no_worker: sim
- ligado_no_fluxo_principal: sim + prova (`inicio_programa` envia para `inicio_nome`)
- entradas aceitas (text patterns/gates): limpeza de prefixos (`meu nome é`, `sou`), validação de nome completo
- writes/reads (state): write `nome`; reads `rawNome`, `partes`
- next_stage real: `estado_civil`
- evidência (âncora colável do worker.js: snippet exato):
```js
case "inicio_nome": {
...
await upsertState(env, st.wa_id, { nome: nomeCompleto });
...
next_stage: "estado_civil",
...
"estado_civil"
```
- divergência com FUNIL_GRAPH_V1 (se houver): sem divergência com o graph; divergência é com a fase canônica 3 (nacionalidade não entra aqui)
- ação futura sugerida: ajustar

### 3) Estrangeiro?
- fase_canônica: Estrangeiro?
- stage_real_no_worker: `inicio_nacionalidade` (+ `inicio_rnm`, `inicio_rnm_validade`)
- existe_no_worker: sim
- ligado_no_fluxo_principal: não + prova (`inicio_nome` avança para `estado_civil`, sem `next_stage: "inicio_nacionalidade"`)
- entradas aceitas (text patterns/gates): `brasileiro|brasileira`, `estrangeiro|estrangeira`; em RNM `sim|não`; validade `valido|indeterminado`
- writes/reads (state): writes `nacionalidade`, `rnm_status`, `rnm_validade`, `funil_status`, `fase_conversa`
- next_stage real: `estado_civil` / `inicio_rnm` / `inicio_rnm_validade` / `fim_ineligivel`
- evidência (âncora colável do worker.js: snippet exato):
```js
case "inicio_nome": {
...
return step(..., "estado_civil");
}
...
case "inicio_nacionalidade": {
```
- divergência com FUNIL_GRAPH_V1 (se houver): graph posiciona nacionalidade no fluxo principal após nome; runtime atual não liga essa transição
- ação futura sugerida: ligar

### 4) Estado civil
- fase_canônica: Estado civil
- stage_real_no_worker: `estado_civil`
- existe_no_worker: sim
- ligado_no_fluxo_principal: sim + prova (`inicio_nome -> estado_civil`)
- entradas aceitas (text patterns/gates): parse de `solteiro`, `casado`, `união estável`, `separado`, `divorciado`, `viúvo`
- writes/reads (state): writes `estado_civil`, `financiamento_conjunto`, `somar_renda` (por ramo)
- next_stage real: `confirmar_casamento`, `financiamento_conjunto`, `somar_renda_solteiro`, gates legais
- evidência (âncora colável do worker.js: snippet exato):
```js
case "estado_civil": {
```
- divergência com FUNIL_GRAPH_V1 (se houver): sem
- ação futura sugerida: ajustar

### 5) Regime de trabalho (multi ou não)
- fase_canônica: Regime de trabalho (multi ou não)
- stage_real_no_worker: `regime_trabalho` (+ `inicio_multi_regime_pergunta`, `inicio_multi_regime_coletar`)
- existe_no_worker: sim
- ligado_no_fluxo_principal: sim + prova (`somar_renda_solteiro` envia `next_stage: "regime_trabalho"`)
- entradas aceitas (text patterns/gates): `parseRegimeTrabalho(t)` para CLT/autônomo/servidor/aposentado
- writes/reads (state): write `regime`
- next_stage real: `renda` (ou etapas de multi-regime)
- evidência (âncora colável do worker.js: snippet exato):
```js
case "regime_trabalho": {
const regimeDetectado = parseRegimeTrabalho(t);
...
next_stage: "renda"
```
- divergência com FUNIL_GRAPH_V1 (se houver): sem
- ação futura sugerida: ajustar

### 6) Renda (única / multi / mista)
- fase_canônica: Renda (única / multi / mista)
- stage_real_no_worker: `renda`, `renda_parceiro`, `possui_renda_extra`, `renda_mista_detalhe`, `inicio_multi_renda_*`
- existe_no_worker: sim
- ligado_no_fluxo_principal: sim + prova (`regime_trabalho` envia para `renda`)
- entradas aceitas (text patterns/gates): parsing monetário e padrões `sim|não|bico|uber` para renda extra
- writes/reads (state): writes `renda`, `renda_parceiro`, `renda_total_para_fluxo`, `renda_formal`, `renda_informal`
- next_stage real: `renda_parceiro`, `possui_renda_extra`, `renda_mista_detalhe`, `ir_declarado`
- evidência (âncora colável do worker.js: snippet exato):
```js
case "renda": {
case "renda_parceiro": {
case "renda_mista_detalhe": {
case "possui_renda_extra": {
```
- divergência com FUNIL_GRAPH_V1 (se houver): sem
- ação futura sugerida: ajustar

### 7) Composição de renda (quando/como) + amarras
- fase_canônica: Composição de renda
- stage_real_no_worker: `somar_renda_solteiro`, `parceiro_tem_renda`, `somar_renda_familiar`, `regime_trabalho_parceiro_familiar`
- existe_no_worker: sim
- ligado_no_fluxo_principal: sim + prova (`estado_civil`/`financiamento_conjunto` roteiam para composição)
- entradas aceitas (text patterns/gates): `só eu`, `parceiro`, `familiar` + parentescos
- writes/reads (state): writes `somar_renda`, `financiamento_conjunto`, `renda_familiar`, `parceiro_tem_renda`
- next_stage real: `regime_trabalho`, `parceiro_tem_renda`, `regime_trabalho_parceiro_familiar`
- evidência (âncora colável do worker.js: snippet exato):
```js
case "somar_renda_solteiro": {
...
await upsertState(env, st.wa_id, {
  somar_renda: false,
  financiamento_conjunto: false,
  renda_familiar: false
});
```
- divergência com FUNIL_GRAPH_V1 (se houver): sem
- ação futura sugerida: ajustar

### 8) Dependente
- fase_canônica: Dependente
- stage_real_no_worker: `dependente`
- existe_no_worker: sim
- ligado_no_fluxo_principal: sim + prova (`ctps_36` envia para `dependente` quando não soma renda)
- entradas aceitas (text patterns/gates): `sim|filho|dependente`, `não|sem dependente`, `não sei|talvez`
- writes/reads (state): write `dependentes_qtd`; reads `financiamento_conjunto`, `somar_renda`
- next_stage real: `restricao` (ou mantém `dependente`)
- evidência (âncora colável do worker.js: snippet exato):
```js
case "dependente": {
if (st.financiamento_conjunto === true || st.somar_renda === true) {
  ...
  next_stage: "restricao"
}
```
- divergência com FUNIL_GRAPH_V1 (se houver): sem
- ação futura sugerida: ajustar

### 9) 36 meses
- fase_canônica: 36 meses
- stage_real_no_worker: `ctps_36` e `ctps_36_parceiro`
- existe_no_worker: sim
- ligado_no_fluxo_principal: sim + prova (`ir_declarado` direciona para CTPS)
- entradas aceitas (text patterns/gates): `sim|não|não sei`
- writes/reads (state): write `ctps_36` e `ctps_36_parceiro` (nos respectivos cases)
- next_stage real: `dependente` ou `restricao`
- evidência (âncora colável do worker.js: snippet exato):
```js
case "ctps_36": {
const nextStage = st.somar_renda ? "restricao" : "dependente";
```
- divergência com FUNIL_GRAPH_V1 (se houver): sem
- ação futura sugerida: ajustar

### 10) Restrição
- fase_canônica: Restrição
- stage_real_no_worker: `restricao` (+ `regularizacao_restricao`)
- existe_no_worker: sim
- ligado_no_fluxo_principal: sim + prova (`dependente` envia para `restricao`)
- entradas aceitas (text patterns/gates): `negativado|serasa|spc`, `cpf limpo`, `não sei`
- writes/reads (state): writes `restricao`, `regularizacao_restricao`
- next_stage real: `regularizacao_restricao` ou `envio_docs`
- evidência (âncora colável do worker.js: snippet exato):
```js
case "restricao": {
...
next_stage: "regularizacao_restricao"
```
- divergência com FUNIL_GRAPH_V1 (se houver): sem
- ação futura sugerida: ajustar

### 11) DOCs
- fase_canônica: DOCs
- stage_real_no_worker: `envio_docs`
- existe_no_worker: sim
- ligado_no_fluxo_principal: sim + prova (`regularizacao_restricao` leva para `envio_docs`)
- entradas aceitas (text patterns/gates): aceite de lista (`sim|ok|manda`), adiamento (`não agora|depois`) e envio de mídia
- writes/reads (state): write `docs_lista_enviada`; leitura de `_incoming_media`
- next_stage real: `envio_docs` (loop) e `agendamento_visita` quando helper retorna avanço
- evidência (âncora colável do worker.js: snippet exato):
```js
case "envio_docs": {
if (st._incoming_media) {
  const resposta = await handleDocumentUpload(env, st, midia);
  return step(env, st, resposta.message, resposta.nextStage);
}
```
- divergência com FUNIL_GRAPH_V1 (se houver): sem
- ação futura sugerida: ajustar

### 12) Não quis enviar DOCs
- fase_canônica: Não quis enviar DOCs
- stage_real_no_worker: não existe stage dedicado (ramo interno de `envio_docs`)
- existe_no_worker: não
- ligado_no_fluxo_principal: sim (como ramo) + prova (`if (negar) ... "envio_docs"`)
- entradas aceitas (text patterns/gates): `nao|não agora|depois|mais tarde|agora nao`
- writes/reads (state): write `docs_lista_enviada: false`
- next_stage real: `envio_docs`
- evidência (âncora colável do worker.js: snippet exato):
```js
if (negar) {
  await upsertState(env, st.wa_id, { docs_lista_enviada: false });
  return step(env, st, [...], "envio_docs");
}
```
- divergência com FUNIL_GRAPH_V1 (se houver): graph/canônico tratam como fase explícita; runtime trata como ramo interno
- ação futura sugerida: criar

### 13) Enviou DOCs
- fase_canônica: Enviou DOCs
- stage_real_no_worker: não existe stage dedicado (evento do helper)
- existe_no_worker: não
- ligado_no_fluxo_principal: sim (como evento) + prova (`handleDocumentUpload` retorna `nextStage: "agendamento_visita"`)
- entradas aceitas (text patterns/gates): envio de mídia no `envio_docs`
- writes/reads (state): atualização de pendências por `updateDocsStatusV2`
- next_stage real: `agendamento_visita`
- evidência (âncora colável do worker.js: snippet exato):
```js
const status = await updateDocsStatusV2(env, st);
...
return { ok: true, message: linhas, nextStage: "agendamento_visita" };
```
- divergência com FUNIL_GRAPH_V1 (se houver): canônico tem fase nomeada; runtime usa transição por evento
- ação futura sugerida: criar

### 14) Aprovou financiamento
- fase_canônica: Aprovou financiamento
- stage_real_no_worker: não existe stage dedicado (ramo em `aguardando_retorno_correspondente`)
- existe_no_worker: não
- ligado_no_fluxo_principal: sim (como ramo) + prova (`if (aprovado) ... next_stage: "agendamento_visita"`)
- entradas aceitas (text patterns/gates): `aprovado|crédito aprovado|liberado`
- writes/reads (state): writes `processo_aprovado: true`, `processo_reprovado: false`
- next_stage real: `agendamento_visita`
- evidência (âncora colável do worker.js: snippet exato):
```js
if (aprovado) {
  await upsertState(env, st.wa_id, {
    processo_aprovado: true,
    processo_reprovado: false
  });
  ...
  next_stage: "agendamento_visita"
}
```
- divergência com FUNIL_GRAPH_V1 (se houver): fase canônica explícita, mas runtime resolve como evento
- ação futura sugerida: criar

## DIVERGÊNCIAS / ROOT-CAUSE

### Caso `*_none` no simulador (ex.: `inicio_none`, `inicio_nome` “fantasma”)
Diagnóstico: não há stage `*_none` hardcoded no worker. O admin simulator aceita `start_stage` livre no payload e injeta esse valor diretamente em `fase_conversa`. Se um cliente/admin passar `inicio_none`, o `switch(stage)` cai no `default`, que mantém o mesmo stage inválido (`step(..., stage)`), parecendo que o stage `*_none` “existe”.

Âncoras:
```js
const startStage = String(payload?.start_stage || "inicio").trim() || "inicio";
...
stateByWaId[wa_id] = createSimulationState(wa_id, startStage || "inicio");
...
function createSimulationState(wa_id, startStage) {
  return { ... fase_conversa: startStage || "inicio", ... };
}
...
default:
  return step(env, st, [...], stage);
```

Conclusão operacional: `*_none` é efeito de entrada livre do simulador/fallback de stage inválido, não uma fase real do funil de produção.
