# FUNIL_GRAPH_V1

> Fonte analisada: `Enova worker.js` (não foi encontrado arquivo `nv-enova.js.js` neste repositório; mapeamento feito para o worker atual com o funil ativo).

## Gates globais (antes do switch de stages)
- **Reset global**: `reset|resetar|recomeçar|zerar tudo|começar do zero` → chama `resetTotal`, recarrega estado e força `next_stage=inicio_programa`.
- **Bloqueio de duplicidade**: se `last_processed_text === userText`, bloqueia processamento.
- **Anti-loop**: se usuário repetir exatamente a última mensagem (normalizada), responde aviso e mantém stage.
- **Persistência técnica global**: grava `last_user_text`, `last_processed_text`, `updated_at`.
- **Interceptador global de saudação**: em qualquer stage (exceto `inicio`/`inicio_programa`), saudação retoma a fase registrada.

## Grafo por stage

### 1) `inicio`
- **Pergunta enviada**: retomada/início + “continuar de onde parou ou começar do zero?”.
- **Regex/aceite**: saudação (`oi|olá|bom dia...`) e reset (`reset|recomeçar...`).
- **Colunas gravadas**: sem gravação específica de negócio neste bloco (além dos campos técnicos globais).
- **next_stage**: `inicio_decisao`.
- **gates**: detecção de retomada por `st.fase_conversa` e reset local.

### 2) `inicio_decisao`
- **Pergunta enviada**: “já sabe como funciona ou quer explicação?”.
- **Regex/aceite**: `^(1|continuar|seguir...)$` / `^(2|começar|reiniciar|reset...)$`.
- **Colunas gravadas**: sem gravação dedicada.
- **next_stage**: mantém `inicio_decisao` quando inválido; segue fluxo para `inicio_programa`.
- **gates**: validação estrita de opção 1/2.

### 3) `inicio_programa`
- **Pergunta enviada**: explicação breve do programa + pedido de nome completo.
- **Regex/aceite**: sem regex crítica neste bloco.
- **Colunas gravadas**: sem gravação dedicada.
- **next_stage**: `inicio_nome`.
- **gates**: não há gate especial além de progressão natural.

### 4) `inicio_nome`
- **Pergunta enviada**: solicita nome completo.
- **Regex/aceite**: normalização de prefixos (`meu nome é|sou...`) e limpeza de ruído.
- **Colunas gravadas**: `nome`.
- **next_stage**: segue para coleta de nacionalidade (`inicio_nacionalidade` no fluxo).
- **gates**: valida nome mínimo após sanitização.

### 5) `inicio_nacionalidade`
- **Pergunta enviada**: “você é brasileiro ou estrangeiro?”.
- **Regex/aceite**: `brasileiro|brasileira...` e `estrangeiro|estrangeira...`.
- **Colunas gravadas**: `nacionalidade`, `fase_conversa`.
- **next_stage**: brasileiro → `estado_civil`; estrangeiro → `inicio_rnm`; inválido → mantém.
- **gates**: bifurcação obrigatória por nacionalidade.

### 6) `inicio_rnm`
- **Pergunta enviada**: “você possui RNM?”.
- **Regex/aceite**: `sim` / `não` (inclui variações).
- **Colunas gravadas**: `rnm_status`, `funil_status`, `fase_conversa`.
- **next_stage**: `sim` → `inicio_rnm_validade`; `não` → `fim_ineligivel`; inválido → mantém.
- **gates**: elegibilidade documental mínima para estrangeiro.

### 7) `inicio_rnm_validade`
- **Pergunta enviada**: “RNM válido ou indeterminado?”.
- **Regex/aceite**: `válido|com validade` / `indeterminado`.
- **Colunas gravadas**: `rnm_validade`, `funil_status`, `fase_conversa`.
- **next_stage**: válido → `estado_civil`; indeterminado → `fim_ineligivel`.
- **gates**: bloqueio de elegibilidade por RNM indeterminado.

### 8) `estado_civil`
- **Pergunta enviada**: estado civil + composição de renda conforme resposta.
- **Regex/aceite**: `solteiro|casado|união estável|separado|divorciado|viúvo`.
- **Colunas gravadas**: `estado_civil`, `solteiro_sozinho`, `financiamento_conjunto`, `somar_renda` (dependendo do ramo).
- **next_stage**: `confirmar_casamento` / `financiamento_conjunto` / verificações legais intermediárias.
- **gates**: roteamento por estado civil e pendências documentais (averbação/inventário).

### 9) `confirmar_casamento`
- **Pergunta enviada**: “casamento civil no papel ou união estável?”.
- **Regex/aceite**: `civil|no papel` vs `união estável|moramos juntos`.
- **Colunas gravadas**: `casamento_formal`, `financiamento_conjunto`.
- **next_stage**: `financiamento_conjunto` (ou mantém se ambíguo).
- **gates**: exige definição formal da composição conjugal.

### 10) `financiamento_conjunto`
- **Pergunta enviada**: comprar junto, só titular, ou só se precisar.
- **Regex/aceite**: `sim|juntos`, `não|só eu`, `talvez|depende`.
- **Colunas gravadas**: `financiamento_conjunto`, `somar_renda`.
- **next_stage**: ramos para regime/renda do titular e/ou parceiro.
- **gates**: decisão de composição principal do financiamento.

### 11) `parceiro_tem_renda`
- **Pergunta enviada**: parceiro tem renda?
- **Regex/aceite**: `sim|possui renda` / `não|sem renda`.
- **Colunas gravadas**: `parceiro_tem_renda`, `somar_renda`.
- **next_stage**: define continuidade para regime do parceiro ou fluxo sem renda do parceiro.
- **gates**: habilita/desabilita trilha de renda do parceiro.

### 12) `somar_renda_solteiro`
- **Pergunta enviada**: somar com parceiro, familiar ou seguir sozinho.
- **Regex/aceite**: padrões de “só eu”, parceiro, familiar.
- **Colunas gravadas**: `somar_renda`, `financiamento_conjunto`, `renda_familiar`.
- **next_stage**: regime titular / regime parceiro / composição familiar.
- **gates**: classificação semântica da composição de renda.

### 13) `somar_renda_familiar`
- **Pergunta enviada**: qual familiar e regime dele.
- **Regex/aceite**: familiar (`mãe|pai|avó|tio|irmão...`) + categorias de regime.
- **Colunas gravadas**: campos de composição familiar (sem upsert único estático; varia por ramo).
- **next_stage**: `confirmar_avo_familiar` ou `regime_trabalho_parceiro_familiar`.
- **gates**: identificação do familiar e tipo de renda elegível.

### 14) `confirmar_avo_familiar`
- **Pergunta enviada**: benefício rural/urbano/outro e se há atividade adicional.
- **Regex/aceite**: `rural|urbana|inss|bpc|loas|benefício|não sei`.
- **Colunas gravadas**: `avo_beneficio`.
- **next_stage**: `regime_trabalho_parceiro_familiar` ou mantém.
- **gates**: qualificação de benefício de avô/avó para compor renda.

### 15) `renda_familiar_valor`
- **Pergunta enviada**: valor mensal do familiar.
- **Regex/aceite**: extração numérica (sanitização com `/[^0-9]/g`).
- **Colunas gravadas**: `renda_parceiro`, `somar_renda`, `financiamento_conjunto`, `renda_total_para_fluxo`.
- **next_stage**: avança para etapas de validação trabalhista/risco.
- **gates**: valor numérico mínimo válido.

### 16) `inicio_multi_renda_pergunta`
- **Pergunta enviada**: “tem outra renda além desta?”.
- **Regex/aceite**: `sim` / `não`.
- **Colunas gravadas**: `multi_renda_flag`, `fase_conversa`.
- **next_stage**: `inicio_multi_renda_coletar` ou pulo para etapa seguinte de elegibilidade.
- **gates**: ativa modo de múltiplas rendas.

### 17) `inicio_multi_renda_coletar`
- **Pergunta enviada**: pede tipo+valor da renda adicional e pergunta se há mais.
- **Regex/aceite**: parser `descricao - valor` e variações numéricas.
- **Colunas gravadas**: `multi_renda_lista`, `ultima_renda_bruta_informada`, `qtd_rendas_informadas`.
- **next_stage**: mantém para novas coletas ou retorna para fechamento da etapa.
- **gates**: formato mínimo da entrada para acumular na lista.

### 18) `regime_trabalho`
- **Pergunta enviada**: tipo de trabalho do titular + renda mensal.
- **Regex/aceite**: `clt|autônomo|servidor|aposentado|pensionista`.
- **Colunas gravadas**: `regime`.
- **next_stage**: `renda`.
- **gates**: classificação de regime obrigatória para regras seguintes.

### 19) `inicio_multi_regime_pergunta`
- **Pergunta enviada**: existe outro regime de trabalho?
- **Regex/aceite**: `sim` / `não`.
- **Colunas gravadas**: `fase_conversa` (troca de subetapa).
- **next_stage**: `inicio_multi_regime_coletar` ou prossegue.
- **gates**: habilita coleta de múltiplos regimes.

### 20) `inicio_multi_regime_coletar`
- **Pergunta enviada**: informar outro regime; pergunta se há mais.
- **Regex/aceite**: categorias de regime (`clt|autônomo|servidor...`).
- **Colunas gravadas**: lista/contadores de regime (via upserts de multi-regime no bloco).
- **next_stage**: mantém até finalizar ou segue para cálculo de renda.
- **gates**: limita avanço enquanto não houver regime válido.

### 21) `regime_trabalho_parceiro`
- **Pergunta enviada**: regime do parceiro + renda dele.
- **Regex/aceite**: `clt|autônomo|servidor`.
- **Colunas gravadas**: `regime_parceiro`/campos correlatos do parceiro no fluxo.
- **next_stage**: coleta de renda do parceiro.
- **gates**: exige regime válido antes de renda.

### 22) `renda`
- **Pergunta enviada**: renda mensal do titular; pergunta sobre renda extra.
- **Regex/aceite**: parsing numérico (`/[^\d]/g`) e validação de faixa.
- **Colunas gravadas**: `renda`, `renda_total_para_fluxo`.
- **next_stage**: `possui_renda_extra` ou mantém.
- **gates**: rejeita entrada não numérica.

### 23) `renda_parceiro`
- **Pergunta enviada**: renda mensal do parceiro e, depois, IR/CTPS conforme ramo.
- **Regex/aceite**: parsing numérico.
- **Colunas gravadas**: `renda_parceiro`, `renda_total_para_fluxo`.
- **next_stage**: etapas de IR/CTPS/composição.
- **gates**: valor mínimo válido para seguir.

### 24) `renda_parceiro_familiar`
- **Pergunta enviada**: confirmar valor de renda da pessoa da composição.
- **Regex/aceite**: dígitos (`/\D+/g`) e confirmação.
- **Colunas gravadas**: `renda_parceiro`, `renda_total_para_fluxo`, `somar_renda`, `financiamento_conjunto`.
- **next_stage**: `ir_declarado`.
- **gates**: cálculo consolidado antes de IR.

### 25) `renda_mista_detalhe`
- **Pergunta enviada**: detalhar renda formal + informal.
- **Regex/aceite**: extração de dois números.
- **Colunas gravadas**: `renda_formal`, `renda_informal`, `renda_total_para_fluxo`, `renda_mista`.
- **next_stage**: `ir_declarado` ou mantém.
- **gates**: exige dois componentes para fechar renda mista.

### 26) `possui_renda_extra`
- **Pergunta enviada**: tem renda extra?
- **Regex/aceite**: `sim|extra|bico|uber` / `não|nenhuma`.
- **Colunas gravadas**: sem upsert dedicado neste case (roteamento direto).
- **next_stage**: `renda_mista_detalhe` ou `ir_declarado`.
- **gates**: bifurca entre renda simples e composição mista.

### 27) `interpretar_composicao`
- **Pergunta enviada**: parceiro, familiar ou sozinho.
- **Regex/aceite**: padrões semânticos de parceiro/familiar/solo.
- **Colunas gravadas**: sem gravação dedicada.
- **next_stage**: `regime_trabalho_parceiro_familiar` ou `ir_declarado`.
- **gates**: desambiguação textual da composição.

### 28) `quem_pode_somar`
- **Pergunta enviada**: de quem será a composição.
- **Regex/aceite**: mesmos grupos semânticos de composição.
- **Colunas gravadas**: sem gravação dedicada.
- **next_stage**: `regime_trabalho_parceiro_familiar` ou `ir_declarado`.
- **gates**: gate de decisão de composição final.

### 29) `sugerir_composicao_mista`
- **Pergunta enviada**: sugerir parceiro vs familiar.
- **Regex/aceite**: entidade parceira/familiar.
- **Colunas gravadas**: sem gravação dedicada.
- **next_stage**: `regime_trabalho_parceiro_familiar`.
- **gates**: fallback assistido para escolha de composição.

### 30) `ir_declarado`
- **Pergunta enviada**: declara Imposto de Renda?
- **Regex/aceite**: `sim|declaro` vs `não|nunca declarei` + frases equivalentes.
- **Colunas gravadas**: `ir_declarado`, `ir_declarado_por`.
- **next_stage**: `ctps_36` ou `autonomo_compor_renda` ou retorno para `renda` (dependendo do regime).
- **gates**: obrigatoriedade por regime/autônomo.

### 31) `autonomo_compor_renda`
- **Pergunta enviada**: consegue comprovar renda autônoma?
- **Regex/aceite**: comprovável (`recibo|nota|extrato|declaro`) vs não comprovável.
- **Colunas gravadas**: `autonomo_comprova`.
- **next_stage**: segue para composição/renda/ctps conforme ramo.
- **gates**: elegibilidade de autônomo depende de comprovação.

### 32) `ctps_36`
- **Pergunta enviada**: tem 36 meses de CTPS nos últimos 3 anos?
- **Regex/aceite**: `sim` / `não` / `não sei`.
- **Colunas gravadas**: atualiza campos de cálculo/faixa no fluxo (sem chave única fixa em todos os ramos).
- **next_stage**: `restricao` ou `dependente` (composição define rota).
- **gates**: gate de histórico laboral para regra de crédito.

### 33) `ctps_36_parceiro`
- **Pergunta enviada**: CTPS do parceiro e roteamento para restrição/dependente.
- **Regex/aceite**: `sim` / `não` / `não sei`.
- **Colunas gravadas**: `renda_individual_calculada`, `renda_parceiro_calculada`, `renda_total_composicao`, `renda_total_para_fluxo`, `faixa_renda_programa` (em ramos com cálculo completo).
- **next_stage**: `restricao`, `dependente` ou mantém.
- **gates**: cálculo de faixa final antes da triagem de CPF.

### 34) `dependente`
- **Pergunta enviada**: possui dependente menor de 18?
- **Regex/aceite**: `sim|filho|dependente` / `não|sem dependente` / `não sei`.
- **Colunas gravadas**: `dependentes_qtd` (quando informado).
- **next_stage**: `restricao` (na maioria dos ramos).
- **gates**: benefício social/fator de priorização.

### 35) `restricao`
- **Pergunta enviada**: existe restrição de CPF?
- **Regex/aceite**: `sim|negativado|serasa|spc` / `não|cpf limpo` / `não sei`.
- **Colunas gravadas**: `restricao`.
- **next_stage**: `regularizacao_restricao` (se sim/incerto) ou `envio_docs` (se não).
- **gates**: gate de risco cadastral.

### 36) `regularizacao_restricao`
- **Pergunta enviada**: já está regularizando?
- **Regex/aceite**: `sim|resolvendo|negociando` / `não` / `talvez`.
- **Colunas gravadas**: `regularizacao_restricao`.
- **next_stage**: `envio_docs` (todos os ramos, com mensagens diferentes) ou mantém.
- **gates**: sinalização de tratativa da restrição.

### 37) `envio_docs`
- **Pergunta enviada**: autorização para envio da lista de documentos.
- **Regex/aceite**: `sim|ok|manda` / `não agora|depois`.
- **Colunas gravadas**: atualização via helper de docs e flags de progresso de documentos.
- **next_stage**: permanece em `envio_docs` até conclusão/retorno do helper.
- **gates**: depende do parser/handler de documentos (`processarEnvioDocs`).

### 38) `agendamento_visita`
- **Pergunta enviada**: dia e horário da visita (manhã/tarde/horário).
- **Regex/aceite**: aceite (`sim|agendar`), recusa (`não|depois`), horário (`\d{1,2}:\d{2}`), período (`manhã|tarde|noite`).
- **Colunas gravadas**: `visita_confirmada`, `visita_dia_hora`.
- **next_stage**: mantém em agendamento; em confirmação fechada sinaliza finalização.
- **gates**: só avança com slot minimamente definido.

### 39) `finalizacao_processo`
- **Pergunta enviada**: confirmar envio do processo ao correspondente.
- **Regex/aceite**: `sim|envia|manda` / `não|depois`.
- **Colunas gravadas**: `dossie_resumo`, `processo_enviado_correspondente`.
- **next_stage**: `aguardando_retorno_correspondente` ou mantém.
- **gates**: envio só ocorre após consentimento explícito.

### 40) `aguardando_retorno_correspondente`
- **Pergunta enviada**: mensagens de espera e confirmação de retorno.
- **Regex/aceite**: reset/saudação global, `aprovado|liberado`, `reprovado|negado`, `pré-cadastro`.
- **Colunas gravadas**: `processo_aprovado`, `processo_reprovado`.
- **next_stage**: aprovado → `agendamento_visita`; demais → mantém aguardando.
- **gates**: só muda de fase com sinal textual confiável do correspondente.

### 41) `regime_trabalho_parceiro_familiar` *(stage referenciado no grafo)*
- **Pergunta enviada**: tipo de trabalho do componente extra da composição (parceiro/familiar).
- **Regex/aceite**: padrões de regime `clt|autônomo|servidor|aposentado|pensionista`.
- **Colunas gravadas**: campos de regime da pessoa composta (`regime_parceiro` e derivados, conforme ramo).
- **next_stage**: etapas de renda composta (`renda_parceiro_familiar`, `ir_declarado` ou `ctps_36_parceiro`, conforme contexto).
- **gates**: valida regime antes de renda/IR.

### 42) `fim_ineligivel` *(stage de saída referenciado)*
- **Pergunta enviada**: mensagem de inelegibilidade (RNM ausente/indeterminado).
- **Regex/aceite**: não aplicável (terminal informativo).
- **Colunas gravadas**: `funil_status` e `fase_conversa` em branches que chegam aqui.
- **next_stage**: terminal/manual.
- **gates**: bloqueio por regra de elegibilidade documental.

---

## Observações de mapeamento
- O switch possui `42` ocorrências de `case`, com duplicatas de blocos internos para `inicio_multi_regime_pergunta` e `inicio_multi_regime_coletar`; o grafo acima foi deduplicado por stage funcional.
- O stage `finalizacao` aparece como destino textual em um ramo de `agendamento_visita`, enquanto o case implementado é `finalizacao_processo`; documentação preserva os nomes exatamente como aparecem no código.
