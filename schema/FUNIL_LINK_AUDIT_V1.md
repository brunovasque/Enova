# FUNIL_LINK_AUDIT_V1

WORKFLOW_ACK: ok

Escopo: auditoria DOC-only de linkagem 1:1 entre o funil canônico (`schema/FUNIL_MINIMO_CANONICO_V1.md`), o grafo mapeado (`schema/FUNIL_GRAPH_V1.md`) e o runtime real (`Enova worker.js`).

## 1) MATRIZ DE FASES (ordem do FUNIL_MINIMO_CANONICO_V1)

| fase_canonica | existe_no_worker | stage_id_no_worker | existe_no_graph | entradas aceitas (palavras/regex) | writes/flags (set) | reads/flags (branch) | next_stage_reais | EVIDÊNCIA NO WORKER |
|---|---|---|---|---|---|---|---|---|
| 1. Início | sim | `inicio` | sim | `reset|resetar|começar do zero`; saudação `oi|ola|bom dia...`; fallback | reset total (`resetTotal`) e `fase_conversa` via `step(...,"inicio_programa")` | lê `st.fase_conversa`, `userText` normalizado (`nt`), `isResetCmd`, `saudacao` | `inicio_programa`, `inicio_decisao` | `case "inicio"`; detecção reset/saudação e retornos para `inicio_programa`/`inicio_decisao`. |
| 2. Nome | sim | `inicio_nome` | sim | limpeza de prefixo (`meu nome é|sou...`), validação de tamanho e nº de tokens | `nome` | lê `rawNome`, `partes` para validar | `inicio_nome` (fallback), `estado_civil` | `case "inicio_nome"`; `upsertState(...,{ nome })`; `next_stage: "estado_civil"`. |
| 3. Estrangeiro? | sim (mas órfã no fluxo principal) | `inicio_nacionalidade` (+`inicio_rnm`, `inicio_rnm_validade`) | sim | nacionalidade: `brasileiro|brasileira...` ou `estrangeiro|estrangeira`; RNM `sim|não`; validade `valido|indeterminado` | `nacionalidade`, `rnm_status`, `rnm_validade`, `funil_status`, `fase_conversa` | lê `nt` normalizado e regex de nacionalidade/RNM/validade | `estado_civil`, `inicio_rnm`, `inicio_rnm_validade`, `fim_ineligivel` | `case "inicio_nacionalidade"`, `case "inicio_rnm"`, `case "inicio_rnm_validade"`. OBS: não há transição ativa para `inicio_nacionalidade` a partir de `inicio_nome`. |
| 4. Estado civil | sim | `estado_civil` (+`confirmar_casamento`, `financiamento_conjunto`) | sim | parse de estado civil (`solteiro|casado|união estável|separado|divorciado|viúvo`) | `estado_civil`, `solteiro_sozinho`, `financiamento_conjunto`, `somar_renda`, `casamento_formal` | lê `estadoCivil` parseado | `somar_renda_solteiro`, `confirmar_casamento`, `financiamento_conjunto`, `verificar_averbacao`, `verificar_inventario` | `case "estado_civil"` + ramos `confirmar_casamento` e `financiamento_conjunto`. |
| 5. Regime de trabalho (multi ou não) | sim | `regime_trabalho` (+`inicio_multi_regime_pergunta`, `inicio_multi_regime_coletar`) | sim | `CLT`, `autônomo`, `servidor`, `aposentado`; multi-regime via sim/não + novo regime | `regime`; em multi-regime grava `fase_conversa`/listas auxiliares | lê `parseRegimeTrabalho(t)` e respostas sim/não em multi-regime | `renda`, `regime_trabalho` (fallback), `inicio_multi_regime_coletar` | `case "regime_trabalho"` e blocos `inicio_multi_regime_*`. |
| 6. Renda (única / multi / mista) | sim | `renda`, `renda_parceiro`, `possui_renda_extra`, `renda_mista_detalhe`, `inicio_multi_renda_pergunta`, `inicio_multi_renda_coletar` | sim | parsing numérico (`parseMoneyBR`, `\d+`); renda extra `sim|não|uber|bico` | `renda`, `renda_parceiro`, `renda_total_para_fluxo`, `renda_formal`, `renda_informal`, `renda_mista` | lê `st.somar_renda`, `st.parceiro_tem_renda`, presença de 2 números em renda mista | `renda_parceiro`, `possui_renda_extra`, `renda_mista_detalhe`, `ir_declarado`, `dependente` (via multi renda) | `case "renda"`, `"renda_parceiro"`, `"possui_renda_extra"`, `"renda_mista_detalhe"`, `"inicio_multi_renda_*"`. |
| 7. Composição de renda + amarras | sim | `somar_renda_solteiro`, `somar_renda_familiar`, `parceiro_tem_renda`, `interpretar_composicao`, `quem_pode_somar`, `sugerir_composicao_mista`, `regime_trabalho_parceiro_familiar` | sim | termos de composição (`só eu`, `parceiro`, `familiar`, parentesco) | `somar_renda`, `financiamento_conjunto`, `renda_familiar`, `parceiro_tem_renda`, `regime_trabalho_parceiro_familiar` | lê `st.somar_renda`, `st.financiamento_conjunto`, classificação semântica do texto | `regime_trabalho`, `regime_trabalho_parceiro`, `regime_trabalho_parceiro_familiar`, `ir_declarado` | blocos de composição (`somar_renda_*`, `parceiro_tem_renda`, `interpretar_composicao`, `quem_pode_somar`, `sugerir_composicao_mista`). |
| 8. Dependente | sim | `dependente` | sim | `sim|filho|dependente`; `não|sem dependente`; `não sei|talvez` | `dependentes_qtd` (0/1) | lê `st.financiamento_conjunto` e `st.somar_renda` para pular etapa | `restricao`, `dependente` (fallback) | `case "dependente"`: pulo automático quando composição/conjunto. |
| 9. 36 meses | sim | `ctps_36`, `ctps_36_parceiro` | sim | `sim|não|não sei` (titular e parceiro) | `ctps_36`, `ctps_36_parceiro` | lê `st.somar_renda` para decidir `restricao` vs `dependente` | `restricao`, `dependente`, mesma fase (fallback) | `case "ctps_36"` e `case "ctps_36_parceiro"`. |
| 10. Restrição | sim | `restricao` (+`regularizacao_restricao`) | sim | `sim|negativado|serasa|spc`; `não|cpf limpo`; `não sei` | `restricao`, `regularizacao_restricao` | lê classificação `sim/nao/incerto` e depois `sim/nao/talvez` em regularização | `regularizacao_restricao`, `envio_docs`, mesma fase | `case "restricao"` e `case "regularizacao_restricao"`. |
| 11. DOCs | sim | `envio_docs` | sim | aceite da lista (`sim|ok|manda`), recusa (`não agora|depois`), upload mídia | `docs_lista_enviada`; estado de docs via helper (`docs_pendentes`, `docs_completos` em fluxo auxiliar) | lê `st._incoming_media`, `st.docs_lista_enviada`, resultado `handleDocumentUpload` | `envio_docs` (loop), `agendamento_visita` (quando docs completos no helper) | `case "envio_docs"` + `handleDocumentUpload` retorna `nextStage: "agendamento_visita"` ao completar docs. |
| 12. Não quis enviar DOCs | nao (não existe stage dedicado) | MISSING (ramo interno em `envio_docs`) | nao (como fase dedicada) | `negar = isNo(t) || /(nao|não agora|depois|mais tarde|agora nao)/` | `docs_lista_enviada: false` | lê `negar` | `envio_docs` (permanece) | Dentro de `case "envio_docs"`, ramo `if (negar) { ... next_stage: "envio_docs" }`. |
| 13. Enviou DOCs | nao (não existe stage dedicado) | MISSING (evento interno em `envio_docs`/helper) | nao (como fase dedicada) | envio de mídia (`st._incoming_media`) e sucesso OCR/status | sem flag única "enviou_docs"; helper atualiza status e pode avançar | lê `resposta.ok`, `resposta.nextStage` de `handleDocumentUpload` | `envio_docs` ou `agendamento_visita` | `envio_docs` chama `handleDocumentUpload`; no helper, docs completos -> `nextStage: "agendamento_visita"`. |
| 14. Aprovou financiamento | sim (como evento/ramo, não stage homônimo) | MISSING stage dedicado; ramo em `aguardando_retorno_correspondente` | parcial (grafo mapeia em stage de espera) | regex `aprovado|crédito aprovado|liberado` | `processo_aprovado: true`, `processo_reprovado: false` | lê texto de retorno correspondente e match de nome | `agendamento_visita` | `case "aguardando_retorno_correspondente"` ramo `if (aprovado)` com `next_stage: "agendamento_visita"`. |

### Observações estruturais da matriz
- A fase canônica **Estrangeiro?** existe em runtime, mas está **desacoplada do fluxo principal** atual: `inicio_nome` avança direto para `estado_civil` e não para `inicio_nacionalidade`.
- As fases canônicas 12, 13 e 14 existem no runtime como **ramos/eventos**, não como stages com nome 1:1.

---

## 2) QUEBRAS / BURACOS

### 2.1 Todos os *none* encontrados
- Busca por stages/identificadores contendo `none`: **nenhum encontrado** no `Enova worker.js`.
- Evidência de busca: não há ocorrência textual de `_none`/`none` em identificadores de stage.

### 2.2 Stages sem saída / sem transição
- **Sem saída (terminal sem `next_stage`)**: não identificado no switch principal; os cases auditados retornam `step(..., next_stage)`.
- **Sem transição de entrada (órfão funcional)**:
  - `inicio_nacionalidade`: existe `case`, mas não há referência de entrada (`next_stage: "inicio_nacionalidade"` / `fase_conversa: "inicio_nacionalidade"`) em outros ramos do worker.

### 2.3 Divergências (FUNIL_GRAPH_V1 diz X, worker faz Y)
1. **RNM validade invertido no grafo**
   - Graph: “válido → estado_civil; indeterminado → fim_ineligivel”.
   - Worker: `valido` seta `funil_status: "ineligivel"` e vai para `fim_ineligivel`; `indeterminado` vai para `estado_civil`.
2. **Fim ineligível não é terminal no runtime**
   - Graph descreve `fim_ineligivel` como terminal/manual.
   - Worker faz fallback para `inicio_programa`.
3. **Nacionalidade fora da trilha principal atual**
   - Graph posiciona nacionalidade após nome.
   - Worker real: `inicio_programa -> inicio_nome -> estado_civil`; `inicio_nacionalidade` está implementado, mas sem entrada ativa.
4. **Docs completos avançam para visita (não para “enviou docs” como stage)**
   - Canônico tem fase explícita “Enviou DOCs”.
   - Worker usa evento interno de helper e avança direto para `agendamento_visita`.

---

## 3) INVENTÁRIO DE INTERRUPTORES

| interruptor / flag / coluna | onde é SETADO (anchor) | onde é LIDO (anchor) | fases/transições dependentes |
|---|---|---|---|
| `somar_renda` | `estado_civil` (solteiro=false/true), `financiamento_conjunto` (true/false), composição (`somar_renda_solteiro` etc.) | `renda` (decide `renda_parceiro` vs `possui_renda_extra`), `ctps_36`, `ctps_36_parceiro`, `dependente` | composição de renda, pulo de dependente, rota CTPS/restrição |
| `financiamento_conjunto` | `estado_civil`, `confirmar_casamento`, `financiamento_conjunto`, `somar_renda_solteiro` | `dependente` (pular quando true), decisões de fluxo conjugal | ativa fluxo em conjunto e altera ordem de perguntas |
| `parceiro_tem_renda` | `parceiro_tem_renda` | `renda` (`st.somar_renda && st.parceiro_tem_renda`) | define coleta de `renda_parceiro` |
| `regime` (titular) | `regime_trabalho` | `ir_declarado` (`isAutTitular`) e rotas subsequentes | obrigação de IR/comprovação p/ autônomo |
| `regime_trabalho_parceiro` / `regime_parceiro` | `regime_trabalho_parceiro` | `ir_declarado` (`isAutParceiro`) | decide se parceiro autônomo cai em coleta adicional |
| `ir_declarado` + `ir_declarado_por` | `ir_declarado` | `autonomo_compor_renda` (`veio_do_ir`) | bifurcação para comprovação autônoma |
| `autonomo_comprova` | `autonomo_compor_renda` | fluxo subsequente por transição (`renda` ou `interpretar_composicao`) | mantém autônomo no fluxo normal ou força composição |
| `ctps_36` | `ctps_36` | mesmo case (decisão nextStage por `somar_renda`) | `dependente` vs `restricao` |
| `ctps_36_parceiro` | `ctps_36_parceiro` | mesmo case (decisão nextStage) | fechamento da trilha conjunta |
| `dependentes_qtd` | `dependente` | consumo indireto no dossiê/telemetria | priorização e continuidade para restrição |
| `restricao` | `restricao` | `regularizacao_restricao`, dossiê/fase final | entra em regularização ou docs direto |
| `regularizacao_restricao` | `regularizacao_restricao` | controle de mensagem e continuidade | sempre retorna para `envio_docs` com contextos diferentes |
| `docs_lista_enviada` | `envio_docs` | `envio_docs` (primeira vez, reenvio lista) | loop até mídia/continuidade |
| `docs_status_geral` (helper docs) | `updateDocsStatusV2` (chamado em `handleDocumentUpload`) | `handleDocumentUpload` / dossiê | quando completo, avanço `agendamento_visita` |
| `rnm_status` / `rnm_validade` / `nacionalidade` | `inicio_nacionalidade`, `inicio_rnm`, `inicio_rnm_validade` | lidos no próprio bloco de nacionalidade/RNM | elegibilidade de estrangeiro |
| `processo_enviado_correspondente` | `finalizacao_processo` | `aguardando_retorno_correspondente` (contexto), telemetria | marca envio ao correspondente |
| `processo_aprovado` / `processo_reprovado` | `aguardando_retorno_correspondente` | ramos de retorno correspondente | aprovado leva para `agendamento_visita` |

## Apêndice — âncoras rápidas usadas na auditoria
- Switch principal do funil: `switch(stage)`.
- Stages canônicos/relacionados verificados: `inicio`, `inicio_programa`, `inicio_nome`, `inicio_nacionalidade`, `inicio_rnm`, `inicio_rnm_validade`, `estado_civil`, `confirmar_casamento`, `financiamento_conjunto`, `regime_trabalho`, `renda`, `possui_renda_extra`, `renda_mista_detalhe`, `ir_declarado`, `autonomo_compor_renda`, `ctps_36`, `ctps_36_parceiro`, `dependente`, `restricao`, `regularizacao_restricao`, `envio_docs`, `agendamento_visita`, `finalizacao_processo`, `aguardando_retorno_correspondente`, `fim_ineligivel`.
