# MAPA_LEGADO_VIVO_ENOVA1_T0_PR1

## 1) Objetivo do documento
Inventariar o legado vivo real da Enova 1, com evidência auditável de código e testes, separando:
- fluxo ativo hoje;
- estado/stage/gate realmente usado;
- bloco com evidência fraca/inconclusiva;
- bloco com padrão de resíduo/stub/legado morto;
- divergência entre documentação e runtime atual.

Critério deste inventário: sem prova de uso real no código executável atual ou em teste executado neste repositório, classificar como inconclusivo.

## 2) Fontes lidas
- `schema/CODEX_WORKFLOW.md`
- `schema/CANONICO_GATE_PRESERVATION.md`
- `schema/SUPABASE_CHANGE_GUARD.md`
- `schema/COGNITIVE_MIGRATION_CONTRACT.md`
- `schema/DECISAO_PRE_IMPLEMENTACAO_COGNITIVO_V2.md`
- `schema/ADENDO_FINAL_COBERTURA_SEGURANCA_COGNITIVO_V2.md`
- `Enova worker.js`
- `cognitive/src/cognitive-contract.js`
- `schema/FUNIL_CANONICO_V1.md`
- `schema/FUNIL_MINIMO_CANONICO_V1.md`
- `schema/FUNIL_GATES_AUDIT_V1.md`
- `schema/AUDIT_WORKER_V1.md`
- `schema/DIAGNOSTICO_MIGRACAO_COGNITIVO_V1.md`
- `schema/DIAGNOSTICO_V2_SILENCIADO.md`
- `schema/worker_cognitive_separation.smoke.mjs`
- `schema/worker_persisted_signals_consumption.smoke.mjs`
- `schema/cognitive_stage_contract_pr2.smoke.mjs`
- `schema/manual_mode_bypass_worker.smoke.mjs`
- `schema/cognitive_reset_topo_surface.smoke.mjs`

## 3) Fluxos vivos reais
### 3.1 Fluxo de entrada real (produção): webhook texto/interativo
- `POST /webhook/meta` e `POST /` roteiam para `handleMetaWebhook`.
- Dentro de `handleMetaWebhook`, há roteamento pré-funil ativo para:
  - dedupe por `wamid`;
  - bypass de atendimento manual;
  - comandos/retornos de correspondente (`ASSUMIR` + `case_ref`);
  - `offtrackGuard` pré-runFunnel;
  - chamada de `runFunnel`.
- Evidência: `Enova worker.js` linhas 8858-8860, 9052, 9502-9615, 9727-9773, 9876-9899, 10048.

### 3.2 Fluxo de entrada real (produção): webhook de mídia
- Mídia suportada entra por `handleMediaEnvelope`.
- O fluxo persiste metadata de mídia e chama `runFunnel` (com `caption` quando existir).
- Evidência: `Enova worker.js` linhas 8970, 9038, 9696.

### 3.3 Fluxo mecânico central do funil
- `runFunnel` é o trilho principal de decisão de stage.
- O `switch(stage)` efetivo dentro de `runFunnel` contém 73 cases únicos no estado atual.
- Evidência: `Enova worker.js` linhas 24560 e 25584.

### 3.4 Fluxo cognitivo acoplado ao funil (ativo)
- Gate cognitivo: `shouldTriggerCognitiveAssist(stage, text)`.
- Modos ativos por flag: `COGNITIVE_V2_MODE = off|shadow|on` com chamada real para:
  - `cognitiveAssistV1`;
  - `runCognitiveV2WithAdapter`;
  - contrato canônico (`buildCognitiveInput`, `validateSignal`, `adaptLegacyToCanonical`, `unifySurfaceControl`).
- Evidência: `Enova worker.js` linhas 3821, 4828, 4898, 24779-25046.

### 3.5 Fluxo operacional docs/correspondente/visita (ativo)
- `envio_docs` processa mídia via `handleDocumentUpload`, reprocessa checklist e pode avançar dinamicamente.
- `isCorrespondentePacoteReady(st)` influencia saída de `envio_docs` para `finalizacao_processo`.
- `finalizacao_processo` e `aguardando_retorno_correspondente` são trilho vivo com loops e saída para `agendamento_visita`.
- Evidência: `Enova worker.js` linhas 33785-34392, 34007-34031, 35141-35950.

### 3.6 Fluxo admin/simulação (ativo, não-produção)
- Existem fluxos executáveis para simulação e suíte interna (`simulateFunnel`, `enovaV1Scenarios`, `/__admin__/simulate-from-state`).
- Evidência: `Enova worker.js` linhas 5921, 6480, 6549, 6968, 7655.

## 4) Stages/estados vivos reais
### 4.1 Stages vivos no `switch(stage)` atual (73)
- `agendamento_visita`
- `aguardando_retorno_correspondente`
- `autonomo_compor_renda`
- `autonomo_ir_pergunta`
- `autonomo_sem_ir_caminho`
- `autonomo_sem_ir_entrada`
- `autonomo_sem_ir_ir_este_ano`
- `clt_renda_perfil_informativo`
- `confirmar_avo_familiar`
- `confirmar_casamento`
- `ctps_36`
- `ctps_36_parceiro`
- `ctps_36_parceiro_p3`
- `dependente`
- `envio_docs`
- `estado_civil`
- `fim_inelegivel`
- `fim_ineligivel`
- `finalizacao`
- `finalizacao_processo`
- `financiamento_conjunto`
- `inicio`
- `inicio_decisao`
- `inicio_multi_regime_coletar`
- `inicio_multi_regime_coletar_parceiro`
- `inicio_multi_regime_familiar_loop`
- `inicio_multi_regime_familiar_pergunta`
- `inicio_multi_regime_p3_loop`
- `inicio_multi_regime_p3_pergunta`
- `inicio_multi_regime_pergunta`
- `inicio_multi_regime_pergunta_parceiro`
- `inicio_multi_renda_coletar`
- `inicio_multi_renda_coletar_parceiro`
- `inicio_multi_renda_familiar_loop`
- `inicio_multi_renda_familiar_pergunta`
- `inicio_multi_renda_p3_loop`
- `inicio_multi_renda_p3_pergunta`
- `inicio_multi_renda_pergunta`
- `inicio_multi_renda_pergunta_parceiro`
- `inicio_nacionalidade`
- `inicio_nome`
- `inicio_programa`
- `inicio_rnm`
- `inicio_rnm_validade`
- `interpretar_composicao`
- `ir_declarado`
- `p3_tipo_pergunta`
- `pais_casados_civil_pergunta`
- `parceiro_tem_renda`
- `possui_renda_extra`
- `quem_pode_somar`
- `regime_trabalho`
- `regime_trabalho_parceiro`
- `regime_trabalho_parceiro_familiar`
- `regime_trabalho_parceiro_familiar_p3`
- `regularizacao_restricao`
- `regularizacao_restricao_p3`
- `regularizacao_restricao_parceiro`
- `renda`
- `renda_familiar_valor`
- `renda_mista_detalhe`
- `renda_parceiro`
- `renda_parceiro_familiar`
- `renda_parceiro_familiar_p3`
- `restricao`
- `restricao_parceiro`
- `restricao_parceiro_p3`
- `somar_renda_familiar`
- `somar_renda_solteiro`
- `sugerir_composicao_mista`
- `verificar_averbacao`
- `verificar_inventario`
- `visita_confirmada`

### 4.2 Estados pseudo-stage vivos fora do `switch`
- `informativo_*` (14 chaves) estão ativos no gate cognitivo e no roteamento pré-docs, mas não são `case` dedicados no `switch(stage)`.
- Evidência: `Enova worker.js` linhas 3009-3022, 3389-3466, 3794-3814, 4067.

## 5) Gates vivos reais
### 5.1 Gates de entrada/roteamento
- Dedupe de webhook por `messageId` (`wamid`) e janela de processados.
- Bypass de atendimento manual antes de `runFunnel`.
- Desvio de comandos/retornos do correspondente antes do funil principal.
- Evidência: `Enova worker.js` linhas 9502-9615, 9876-9899, 9727-9773.

### 5.2 Gates globais no `runFunnel`
- Reset QA por comando dedicado.
- Reset global com retorno silencioso.
- Interceptador global de saudação (retomada de fase real).
- Evidência: `Enova worker.js` linhas 24583-24626, 24631-24718, 25392-25438.

### 5.3 Gate determinístico sim/não
- `yesNoStages` ativo com trava de offtrack determinística quando entrada não casa com sim/não/talvez.
- Evidência: `Enova worker.js` linhas 24743-24774.

### 5.4 Gate cognitivo ativo
- Ativação por `shouldTriggerCognitiveAssist` + whitelist `COGNITIVE_V1_ALLOWED_STAGES`.
- Validação de sinal por `validateSignal` e threshold de confiança.
- Evidência: `Enova worker.js` linhas 3389, 3821-4069, 24783-24893.

### 5.5 Gates de negócio vivos de trilho
- RNM: `inicio_rnm` (sem RNM -> `fim_ineligivel`), `inicio_rnm_validade`.
- Estado civil/composição: bifurca para composição, averbação, inventário.
- IR/CTPS/restrição: trilho completo com ramos titular/parceiro/P3.
- Restrição alta sem regularização (`valorRestricao > 1000`) -> `fim_ineligivel`.
- Evidência: `Enova worker.js` linhas 26543, 26640, 26740, 31661, 31945, 32274, 32868, 33455-33693.

### 5.6 Gates operacionais docs/correspondente
- `envio_docs` com decisão por mídia/texto, checklist e pacote pronto.
- `aguardando_retorno_correspondente` com gate de status e loop de espera.
- Evidência: `Enova worker.js` linhas 33785-34392, 35141-35950.

## 6) Transições reais e ativas
### 6.1 Resultado consolidado do grafo extraído
- 73 stages únicos no `switch(stage)`.
- 309 transições detectadas por chamadas `step(...)` dentro de `runFunnel`.
- Parte das transições é literal; parte é dinâmica (expressão/variável).

### 6.2 Espinha dorsal observável (literal)
- Topo: `inicio -> inicio_programa|inicio_decisao -> inicio_nome -> inicio_nacionalidade -> inicio_rnm -> inicio_rnm_validade -> estado_civil`.
- Composição/renda: `estado_civil -> (somar_renda_*) -> regime_* -> renda* -> ir_declarado -> ctps_36* -> restricao* -> regularizacao_*`.
- Operacional: `envio_docs -> (envio_docs|agendamento_visita|finalizacao_processo)`.
- Final: `finalizacao_processo -> (finalizacao_processo|aguardando_retorno_correspondente|agendamento_visita)`.
- Pós-final: `aguardando_retorno_correspondente -> (aguardando_retorno_correspondente|agendamento_visita|inicio_programa)`.

### 6.3 Transições dinâmicas relevantes (ativas)
- `inicio_decisao => st.fase_conversa || "inicio_programa"`.
- `ctps_36_parceiro => isModoFamiliar(st) ? "restricao_parceiro" : "restricao"`.
- `envio_docs => resposta.keepStage || "envio_docs"`, `resposta.nextStage`, `nextStageAfterUpload`.
- `restricao_parceiro => nextStage`.
- `parceiro_tem_renda => nextStage`.
- Evidência: extração estática do `runFunnel` + `Enova worker.js` linhas 27338, 32274, 33785-34031, 33214.

## 7) Blocos com evidência fraca ou inconclusiva
1. `finalizacao` como stage de negócio principal: inconclusivo.
- Há `case "finalizacao"` ativo, mas no grafo interno não há entrada literal para ele.
- Pode depender de set externo de `fase_conversa` ou fluxo legado não coberto.

2. Uso real de `/__admin_prod__*` em operação: inconclusivo.
- Rotas existem no código, sem prova neste inventário de uso em tráfego real.

3. Ativação real de `COGNITIVE_V2_MODE=on|shadow` em produção: inconclusivo.
- O branching existe, mas sem telemetria de produção anexada neste inventário.

4. `informativo_*` como `fase_conversa` persistida: inconclusivo.
- Há evidência forte de uso como pseudo-stage/gatilho cognitivo, mas não há `case` dedicado no switch para confirmar ciclo completo como fase canônica principal.

## 8) Blocos que parecem resíduo, stub ou legado morto
1. `handleCorrespondenteRetorno(env, msg)` + `parseCorrespondenteBlocks(rawText)`:
- Sem callsite estático encontrado no worker atual.
- Forte indicação de legado substituído por `handleCorrespondenteReturnByCaseRef`.
- Evidência: definição em `Enova worker.js` linhas 24372, 24444; ausência de chamadas adicionais por varredura.

2. `fim_inelegivel`:
- Stage-ponte/alias ortográfico que redireciona para `fim_ineligivel`.
- Não é trilho final próprio.
- Evidência: `Enova worker.js` linha 29587.

3. Fallbacks explícitos de `UNKNOWN_STAGE_REFERENCED`:
- `verificar_averbacao`, `verificar_inventario`, `finalizacao`, `fim_ineligivel` registram marcador de stage referenciado/desvio.
- Indicam camada de compatibilidade/contorno legado.
- Evidência: `Enova worker.js` linhas 29698, 29723, 29745, 29889.

4. `yesNoStages` com chaves sem `case` correspondente:
- `restricao_familiar`, `restricao_p3` aparecem no gate global sim/não mas não existem como stage do `switch`.
- Evidência: `Enova worker.js` linhas 24743-24752.

5. Bloco `ENOVA_V1_VALID_STAGES`/`ENOVA_V1_BANNED_ALIASES`:
- Evidência de uso principal em suíte/simulação, não no trilho de produção.
- Evidência: `Enova worker.js` linhas 6031-6035, 6969-6970.

## 9) Divergências entre documentação e legado vivo
1. `FUNIL_CANONICO_V1.md` marca `inicio_nacionalidade` como órfão/desligado.
- Runtime atual: `inicio_nome -> inicio_nacionalidade` é transição literal ativa.
- Evidência doc: `schema/FUNIL_CANONICO_V1.md` linha 13.
- Evidência runtime: `Enova worker.js` linhas 26189 e 26390.

2. `FUNIL_GATES_AUDIT_V1.md` afirma stages sem `case` (`verificar_averbacao`, `verificar_inventario`, `finalizacao`).
- Runtime atual: os três `case` existem e estão no switch.
- Evidência doc: `schema/FUNIL_GATES_AUDIT_V1.md` linhas 430-436.
- Evidência runtime: `Enova worker.js` linhas 29720, 29742, 29886.

3. `FUNIL_GATES_AUDIT_V1.md` afirma duplicidade de `case` no switch.
- Runtime atual: 73 `case` únicos (sem duplicidade literal).
- Evidência doc: `schema/FUNIL_GATES_AUDIT_V1.md` linha 438.
- Evidência runtime: extração estática do `switch(stage)` atual.

4. `DIAGNOSTICO_MIGRACAO_COGNITIVO_V1.md` referencia `COGNITIVE_V1_ALLOWED_STAGES` como 5 stages.
- Runtime atual: set contém 76 entradas (inclui topo/composição/renda/restrição/docs/visita/correspondente + `informativo_*`).
- Evidência doc: `schema/DIAGNOSTICO_MIGRACAO_COGNITIVO_V1.md` linha 62.
- Evidência runtime: `Enova worker.js` linha 3389.

5. `DIAGNOSTICO_V2_SILENCIADO.md` descreve `step()` como concatenação fixa `prefix + mecânico`.
- Runtime atual: `step()` delega para `renderCognitiveSpeech`, com caminho de `takes_final` e fallback por mapa.
- Evidência doc: `schema/DIAGNOSTICO_V2_SILENCIADO.md` linha 15.
- Evidência runtime: `Enova worker.js` linhas 208, 4615, 4617, 4652.

## 10) Implicações para a Enova 2
1. Inventário T0.1 precisa considerar 73 stages de `switch(stage)` como trilho vivo real, não apenas o funil mínimo de docs.
2. Fluxos pré-funil (dedupe/manual/correspondente/offtrack) são parte do comportamento vivo e devem entrar no inventário de borda operacional.
3. `informativo_*` deve ser inventariado como pseudo-stage operacional (não como stage canônico do switch), para evitar classificação errada como lixo.
4. `finalizacao`, `verificar_averbacao`, `verificar_inventario`, `fim_inelegivel` devem ser tratados como nós de compatibilidade legada até prova de desuso com telemetria de produção.
5. Artefatos de suíte/admin (`ENOVA_V1_VALID_STAGES`, `ENOVA_V1_BANNED_ALIASES`, `simulateFunnel`) não devem ser confundidos com fluxo produtivo.

## 11) Conclusão objetiva
- O legado vivo real hoje está concentrado em: `handleMetaWebhook/handleMediaEnvelope` + `runFunnel` com 73 stages + gates operacionais ativos (manual, dedupe, correspondente, docs, restrição, visita).
- Existem blocos de compatibilidade legada ativos no código (aliases/fallbacks com `UNKNOWN_STAGE_REFERENCED`) que não podem ser tratados como trilho limpo sem prova adicional.
- Há divergência documental relevante frente ao runtime atual; para inventário T0.1, a fonte primária confiável é o código vivo do `Enova worker.js` e não documentos anteriores sem reconciliação.