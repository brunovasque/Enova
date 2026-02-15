# FUNIL_GATES_AUDIT_V1

## Escopo e método (READ-ONLY)
- Escopo analisado: **Worker-only** (`Enova worker.js`), sem tocar Panel/Workflows.
- Fontes cruzadas:
  - `schema/FUNIL_GRAPH_V1.md`
  - `schema/AUDIT_WORKER_V1.md`
  - `Enova worker.js` (switch principal de `stage`)
- Objetivo: mapear todos os **interruptores/gates** (regex/normalização/decisão), anti-mudo e lacunas.

---

## 1) Lista completa de stages (ordem real no Worker) + interruptores

> Ordem extraída do `switch(stage)` em `Enova worker.js`.

### 1. `inicio`
- **Input esperado:** saudação (`oi|olá|bom dia...`), reset/reinício (`reset|começar do zero...`) ou texto livre.
- **Resposta da Enova:** mensagem de abertura + pergunta se já sabe como funciona.
- **Transição:**
  - iniciar/reset → `inicio_programa`
  - retomada (com `fase_conversa` anterior) → `inicio_decisao`
  - saudação/fallback → `inicio_programa`
- **Atualiza estado:** reset total via `resetTotal` (quando reinício explícito).
- **Attempts:** não há contador.

### 2. `inicio_decisao`
- **Input esperado:** `1|continuar...` ou `2|começar|reset...`.
- **Resposta da Enova:** menu “continuar / começar do zero”.
- **Transição:**
  - opção 1 → `inicio_programa`
  - opção 2 → reset + `inicio_programa`
  - inválido → permanece em `inicio_decisao`
- **Atualiza estado:** reset total quando opção 2.
- **Attempts:** não há contador.

### 3. `inicio_programa`
- **Input esperado:** yes/no semântico sobre “já sabe como funciona”.
- **Resposta da Enova:** explicação curta (se “não”) e pedido de nome.
- **Transição:**
  - sim/já sei → `inicio_nome`
  - não/quero explicar → `inicio_nome` (com texto explicativo antes)
  - inválido → repete `inicio_programa`
- **Atualiza estado:** não grava campo de negócio.
- **Attempts:** não há contador.

### 4. `inicio_nome`
- **Input esperado:** nome (com limpeza de prefixos “meu nome é”, “sou”).
- **Resposta da Enova:** confirmação de nome + pergunta de nacionalidade.
- **Transição:**
  - nome válido → `inicio_nacionalidade` (ou `estado_civil` quando já havia nacionalidade em memória)
  - inválido → permanece em `inicio_nome`
- **Atualiza estado:** `nome`, `primeiro_nome`.
- **Attempts:** não há contador.

### 5. `inicio_nacionalidade`
- **Input esperado:** brasileiro/brasileira ou estrangeiro/estrangeira.
- **Resposta da Enova:** bifurca para fluxo BR ou RNM.
- **Transição:**
  - brasileiro → `estado_civil`
  - estrangeiro → `inicio_rnm`
  - inválido → permanece
- **Atualiza estado:** `nacionalidade`, `fase_conversa`.
- **Attempts:** não há contador.

### 6. `inicio_rnm`
- **Input esperado:** `sim` / `não` (regex estrita para variantes curtas).
- **Resposta da Enova:** confirmação de RNM.
- **Transição:**
  - não possui RNM → `fim_ineligivel`
  - possui RNM → `inicio_rnm_validade`
  - inválido → permanece
- **Atualiza estado:** `rnm_status`, `funil_status`, `fase_conversa`.
- **Attempts:** não há contador.

### 7. `inicio_rnm_validade`
- **Input esperado:** `valido|válido|com validade|definida` ou `indeterminado`.
- **Resposta da Enova:** valida elegibilidade de estrangeiro.
- **Transição:**
  - validade definida → `fim_ineligivel`
  - indeterminado → `estado_civil`
  - inválido → permanece
- **Atualiza estado:** `rnm_validade`, `funil_status`, `fase_conversa`.
- **Attempts:** não há contador.

### 8. `estado_civil`
- **Input esperado:** solteiro/casado/união estável/separado/divorciado/viúvo.
- **Resposta da Enova:** pergunta de composição conforme categoria.
- **Transição:**
  - solteiro → `somar_renda_solteiro`
  - casado → `confirmar_casamento`
  - união estável → `financiamento_conjunto`
  - separado/divorciado → `verificar_averbacao`
  - viúvo → `verificar_inventario`
  - inválido → permanece
- **Atualiza estado:** `estado_civil`, e em alguns ramos `solteiro_sozinho`, `financiamento_conjunto`, `somar_renda`.
- **Attempts:** não há contador.

### 9. `confirmar_casamento`
- **Input esperado:** `civil/no papel` vs `união estável/moramos juntos`.
- **Resposta da Enova:** define se compra conjunta e segue coleta de renda.
- **Transição:**
  - civil/no papel → `financiamento_conjunto`
  - união estável → `regime_trabalho`
  - inválido → permanece
- **Atualiza estado:** `casamento_formal`, `financiamento_conjunto`.
- **Attempts:** não há contador.

### 10. `financiamento_conjunto`
- **Input esperado:** sim/juntos, não/só eu, ou talvez/só se precisar.
- **Resposta da Enova:** direciona para regime titular.
- **Transição:**
  - qualquer resposta reconhecida acima → `regime_trabalho` (ajustando flags)
  - inválido → permanece
- **Atualiza estado:** `financiamento_conjunto`, `somar_renda`.
- **Attempts:** não há contador.

### 11. `parceiro_tem_renda`
- **Input esperado:** sim/não semântico sobre renda do parceiro.
- **Resposta da Enova:** pergunta regime titular/parceiro conforme caso.
- **Transição:**
  - sim → `regime_trabalho_parceiro`
  - não → `regime_trabalho`
  - inválido → permanece
- **Atualiza estado:** `parceiro_tem_renda`, `somar_renda`.
- **Attempts:** não há contador.

### 12. `somar_renda_solteiro`
- **Input esperado:** “só eu”, parceiro(a), familiar.
- **Resposta da Enova:** explica próximo passo de composição.
- **Transição:**
  - só eu → `regime_trabalho`
  - parceiro → `parceiro_tem_renda`
  - familiar → `somar_renda_familiar`
  - inválido → permanece
- **Atualiza estado:** `somar_renda`, `financiamento_conjunto`, `renda_familiar` (campo transitório removido antes do write final em outro helper).
- **Attempts:** não há contador.

### 13. `somar_renda_familiar`
- **Input esperado:** identificação do familiar (mãe/pai/avó/tio/irmão/primo...).
- **Resposta da Enova:** pede regime/renda do familiar.
- **Transição:**
  - avó/avô → `confirmar_avo_familiar`
  - outros familiares reconhecidos → `regime_trabalho_parceiro_familiar`
  - inválido → permanece
- **Atualiza estado:** `familiar_tipo`.
- **Attempts:** não há contador.

### 14. `confirmar_avo_familiar`
- **Input esperado:** benefício rural/urbano/assistencial ou “não sei”.
- **Resposta da Enova:** qualifica tipo de benefício de avó/avô.
- **Transição:**
  - reconhecido → `regime_trabalho_parceiro_familiar`
  - inválido → permanece
- **Atualiza estado:** `avo_beneficio`.
- **Attempts:** não há contador.

### 15. `renda_familiar_valor`
- **Input esperado:** valor numérico (moeda livre, extração de dígitos).
- **Resposta da Enova:** confirma renda e segue elegibilidade.
- **Transição:**
  - valor válido → `ctps_36`
  - inválido → permanece
- **Atualiza estado:** `renda_parceiro`, `somar_renda`, `financiamento_conjunto`, `renda_total_para_fluxo`.
- **Attempts:** não há contador.

### 16. `inicio_multi_renda_pergunta`
- **Input esperado:** `sim` / `não`.
- **Resposta da Enova:** ativa coleta de rendas adicionais ou segue.
- **Transição:**
  - sim → `inicio_multi_renda_coletar`
  - não → `dependente`
  - inválido → permanece
- **Atualiza estado:** `multi_renda_flag`, `fase_conversa`.
- **Attempts:** não há contador.

### 17. `inicio_multi_renda_coletar`
- **Input esperado:** descrição + valor de renda extra (parse de número).
- **Resposta da Enova:** acumula lista e pergunta se há mais.
- **Transição:**
  - válido → `inicio_multi_renda_pergunta`
  - inválido → permanece
- **Atualiza estado:** `multi_renda_lista`, `ultima_renda_bruta_informada`, `qtd_rendas_informadas`.
- **Attempts:** não há contador.

### 18. `regime_trabalho`
- **Input esperado:** `clt|autônomo|servidor|aposentado` (sem pilar de pensionista aqui).
- **Resposta da Enova:** pergunta renda mensal.
- **Transição:**
  - reconhecido → `renda`
  - inválido → permanece
- **Atualiza estado:** `regime`.
- **Attempts:** não há contador.

### 19A. `inicio_multi_regime_pergunta` (primeira definição)
- **Input esperado:** sim/não.
- **Resposta da Enova:** coleta outro regime ou segue para `renda_bruta`.
- **Transição:** sim → `inicio_multi_regime_coletar`; não → `renda_bruta`; inválido → permanece.
- **Atualiza estado:** `fase_conversa` (no ramo sim).
- **Attempts:** não há contador.

### 19B. `inicio_multi_regime_pergunta` (segunda definição, sobrescreve anterior no switch)
- **Input esperado:** sim/não.
- **Resposta da Enova:** coleta outro regime ou segue para `inicio_multi_renda_pergunta`.
- **Transição:** sim → `inicio_multi_regime_coletar`; não → `inicio_multi_renda_pergunta`; inválido → permanece.
- **Atualiza estado:** `fase_conversa` (no ramo sim).
- **Attempts:** não há contador.

### 20A. `inicio_multi_regime_coletar` (primeira definição)
- **Input esperado:** regime em lista aberta (`clt|informal|autônomo|servidor|aposentado|bicos`).
- **Resposta da Enova:** confirma e pergunta se há mais regimes.
- **Transição:** válido → `inicio_multi_regime_pergunta`; inválido → permanece.
- **Atualiza estado:** `multi_regime_lista`, `ultima_regime_informado`, `qtd_regimes_informados`.
- **Attempts:** não há contador.

### 20B. `inicio_multi_regime_coletar` (segunda definição, sobrescreve anterior)
- **Input esperado:** regex mais fechada (`clt|autônomo|mei|servidor|aposentado|pensionista`).
- **Resposta da Enova:** salva e segue renda extra.
- **Transição:** válido → `inicio_multi_renda_pergunta`; inválido → permanece.
- **Atualiza estado:** `multi_regimes`.
- **Attempts:** não há contador.

### 21. `regime_trabalho_parceiro`
- **Input esperado:** clt/autônomo/servidor.
- **Resposta da Enova:** pergunta renda do parceiro.
- **Transição:** reconhecido → `renda_parceiro`; inválido → permanece.
- **Atualiza estado:** `regime_trabalho_parceiro`.
- **Attempts:** não há contador.

### 22. `renda`
- **Input esperado:** valor numérico bruto mensal.
- **Resposta da Enova:** confirma valor e decide se vai pedir renda extra/IR/parceiro.
- **Transição:** principal para `possui_renda_extra`, com variações para `renda_parceiro`.
- **Atualiza estado:** `renda`, `renda_total_para_fluxo`.
- **Attempts:** não há contador.

### 23. `renda_parceiro`
- **Input esperado:** valor numérico do parceiro.
- **Resposta da Enova:** confirma e segue para IR/CTPS conforme composição.
- **Transição:** `ir_declarado` (com alguns ramos para `ctps_36`), inválido permanece.
- **Atualiza estado:** `renda_parceiro`, `renda_total_para_fluxo`.
- **Attempts:** não há contador.

### 24. `renda_parceiro_familiar`
- **Input esperado:** valor numérico da renda familiar.
- **Resposta da Enova:** confirma composição e vai para IR.
- **Transição:** válido → `ir_declarado`; inválido → permanece.
- **Atualiza estado:** `renda_parceiro`, `renda_total_para_fluxo`, `somar_renda`, `financiamento_conjunto`.
- **Attempts:** não há contador.

### 25. `renda_mista_detalhe`
- **Input esperado:** dois valores (formal + informal) ou formato parseável.
- **Resposta da Enova:** soma rendas e segue.
- **Transição:** válido → `ir_declarado`; inválido → permanece.
- **Atualiza estado:** `renda_formal`, `renda_informal`, `renda_total_para_fluxo`, `renda_mista`.
- **Attempts:** não há contador.

### 26. `possui_renda_extra`
- **Input esperado:** sim/não semântico sobre renda extra.
- **Resposta da Enova:** decide se abre detalhe de renda mista.
- **Transição:** sim → `renda_mista_detalhe`; não → `ir_declarado`; inválido permanece.
- **Atualiza estado:** não há `upsert` dedicado no gate.
- **Attempts:** não há contador.

### 27. `interpretar_composicao`
- **Input esperado:** parceiro/familiar/sozinho.
- **Resposta da Enova:** direciona para regime de quem compõe.
- **Transição:** parceiro → `regime_trabalho_parceiro`; familiar → `regime_trabalho_parceiro_familiar`; solo → `ir_declarado`; inválido permanece.
- **Atualiza estado:** sem `upsert` dedicado neste gate.
- **Attempts:** não há contador.

### 28. `quem_pode_somar`
- **Input esperado:** parceiro/familiar/sozinho.
- **Resposta da Enova:** decisão final de composição.
- **Transição:** parceiro → `regime_trabalho_parceiro`; familiar → `regime_trabalho_parceiro_familiar`; solo → `ir_declarado`; inválido permanece.
- **Atualiza estado:** sem `upsert` dedicado.
- **Attempts:** não há contador.

### 29. `sugerir_composicao_mista`
- **Input esperado:** escolher parceiro ou familiar.
- **Resposta da Enova:** escolha assistida de composição.
- **Transição:** parceiro → `regime_trabalho_parceiro`; familiar → `regime_trabalho_parceiro_familiar`; inválido permanece.
- **Atualiza estado:** sem `upsert` dedicado.
- **Attempts:** não há contador.

### 30. `ir_declarado`
- **Input esperado:** `1|sim|s|declaro...` ou `2|não|n|nunca declarei...`.
- **Resposta da Enova:** bifurca para CTPS (se declara) ou comprovação autônoma.
- **Transição:**
  - declara IR → `ctps_36` (ou pede renda faltante em `renda`/`renda_parceiro`)
  - não declara IR → `autonomo_compor_renda`
  - inválido → permanece
- **Atualiza estado:** `ir_declarado`, `ir_declarado_por`.
- **Attempts:** não há contador.

### 31. `autonomo_compor_renda`
- **Input esperado:** sim/não semântico sobre comprovação da renda autônoma.
- **Resposta da Enova:** segue para renda ou composição alternativa.
- **Transição:** sim → `renda`; não → `interpretar_composicao`; inválido permanece.
- **Atualiza estado:** `autonomo_comprova`.
- **Attempts:** não há contador.

### 32. `ctps_36`
- **Input esperado:** sim/não/não sei.
- **Resposta da Enova:** pergunta dependente ou restrição.
- **Transição:** sim/não → `dependente` (se não soma renda) ou `restricao` (se soma); não sei/inválido → permanece.
- **Atualiza estado:** `ctps_36`.
- **Attempts:** não há contador.

### 33. `ctps_36_parceiro`
- **Input esperado:** sim/não/não sei.
- **Resposta da Enova:** segue para dependente/restrição conforme composição.
- **Transição:** sim/não → `dependente` ou `restricao`; não sei/inválido → permanece.
- **Atualiza estado:** `ctps_36_parceiro` (+ cálculos: `renda_*`, `faixa_renda_programa` em parte do fluxo).
- **Attempts:** não há contador.

### 34. `dependente`
- **Input esperado:** sim/não/não sei sobre dependente menor de 18.
- **Resposta da Enova:** segue para restrição.
- **Transição:** reconhecido → `restricao`; inválido → permanece.
- **Atualiza estado:** `dependentes_qtd`.
- **Attempts:** não há contador.

### 35. `restricao`
- **Input esperado:** sim/não/não sei para restrição de CPF.
- **Resposta da Enova:** encaminha para regularização ou envio de docs.
- **Transição:** sim → `regularizacao_restricao`; não → `envio_docs`; não sei/inválido → permanece.
- **Atualiza estado:** `restricao`.
- **Attempts:** não há contador.

### 36. `regularizacao_restricao`
- **Input esperado:** sim/não/talvez para processo de regularização.
- **Resposta da Enova:** orienta caminho e segue para docs.
- **Transição:** reconhecido → `envio_docs`; inválido → permanece.
- **Atualiza estado:** `regularizacao_restricao`.
- **Attempts:** não há contador.

### 37. `envio_docs`
- **Input esperado:** sim/ok para envio de lista; não/agora não.
- **Resposta da Enova:** envia checklist de documentos ou mantém aguardando.
- **Transição:** permanece em `envio_docs` (estado de coleta documental).
- **Atualiza estado:** `docs_lista_enviada`, `_incoming_media` (quando mídia).
- **Attempts:** não há contador.

### 38. `agendamento_visita`
- **Input esperado:** aceitação sim/não + captura de horário/dia.
- **Resposta da Enova:** confirma agendamento e finalização.
- **Transição:**
  - com dados válidos de agenda → `finalizacao` (texto do step)
  - invalidação/adiamento → permanece
- **Atualiza estado:** `visita_confirmada`, `visita_dia_hora`.
- **Attempts:** não há contador.

### 39. `finalizacao_processo`
- **Input esperado:** sim/não para envio ao correspondente.
- **Resposta da Enova:** confirma envio e muda para espera.
- **Transição:** sim → `aguardando_retorno_correspondente`; não ou inválido → permanece.
- **Atualiza estado:** `processo_enviado_correspondente`, `dossie_resumo`.
- **Attempts:** não há contador.

### 40. `aguardando_retorno_correspondente`
- **Input esperado:** retorno textual com status aprovado/reprovado + nome; também reset/saudação.
- **Resposta da Enova:** confirma aguardando, agenda visita (aprovado), ou explica reprovação.
- **Transição:**
  - reset → `inicio_programa` (com reset)
  - aprovado + match nome → `agendamento_visita`
  - reprovado + match → permanece aguardando
  - sem match/status inválido → permanece
- **Atualiza estado:** `processo_aprovado`, `processo_reprovado`.
- **Attempts:** não há contador.

---

## 2) Checklist ANTI-MUDO por stage

Legenda:
- **Fallback?**: existe branch explícito para input inválido.
- **Mensagem clara + re-pergunta?**: fallback realmente pergunta de novo.
- **Log inválido?**: grava telemetria específica quando inválido (não apenas enter_stage).

| Stage | Fallback? | Mensagem + re-pergunta? | Log inválido? |
|---|---|---|---|
| inicio | SIM | SIM | SIM |
| inicio_decisao | SIM | SIM | **NÃO** |
| inicio_programa | SIM | SIM | **NÃO** |
| inicio_nome | SIM | SIM | **NÃO** |
| inicio_nacionalidade | SIM | SIM | **NÃO** |
| inicio_rnm | SIM | SIM | **NÃO** |
| inicio_rnm_validade | SIM | SIM | **NÃO** |
| estado_civil | SIM | SIM | SIM |
| confirmar_casamento | SIM | SIM | SIM |
| financiamento_conjunto | SIM | SIM | SIM |
| parceiro_tem_renda | SIM | SIM | SIM |
| somar_renda_solteiro | SIM | SIM | SIM |
| somar_renda_familiar | SIM | SIM | SIM |
| confirmar_avo_familiar | SIM | SIM | SIM |
| renda_familiar_valor | SIM | SIM | **NÃO** |
| inicio_multi_renda_pergunta | SIM | SIM | **NÃO** |
| inicio_multi_renda_coletar | SIM | SIM | **NÃO** |
| regime_trabalho | SIM | SIM | SIM |
| inicio_multi_regime_pergunta (ambas) | SIM | SIM | **NÃO** |
| inicio_multi_regime_coletar (ambas) | SIM | SIM | **NÃO** |
| regime_trabalho_parceiro | SIM | SIM | SIM |
| renda | SIM | SIM | **NÃO** |
| renda_parceiro | SIM | SIM | **NÃO** |
| renda_parceiro_familiar | SIM | SIM | **NÃO** |
| renda_mista_detalhe | SIM | SIM | **NÃO** |
| possui_renda_extra | SIM | SIM | SIM |
| interpretar_composicao | SIM | SIM | SIM |
| quem_pode_somar | SIM | SIM | SIM |
| sugerir_composicao_mista | SIM | SIM | SIM |
| ir_declarado | SIM | SIM | **NÃO** |
| autonomo_compor_renda | SIM | SIM | SIM |
| ctps_36 | SIM | SIM | SIM |
| ctps_36_parceiro | SIM | SIM | SIM |
| dependente | SIM | SIM | SIM |
| restricao | SIM | SIM | SIM |
| regularizacao_restricao | SIM | SIM | SIM |
| envio_docs | parcial (aceite/não aceite/documento) | SIM | **NÃO** |
| agendamento_visita | SIM | SIM | **NÃO** |
| finalizacao_processo | SIM | SIM | **NÃO** |
| aguardando_retorno_correspondente | SIM | SIM | SIM |

**Resumo anti-mudo:** hoje há fallback textual em quase todos os gates, porém **não existe padrão global** de incremento de attempts e parte relevante dos estágios **não registra evento explícito de inválido**.

---

## 3) GATES/INTERRUPTORES DESLIGADOS (previstos vs implementação)

1. **Stages referenciados mas sem `case` no switch (não alcançáveis internamente):**
   - `verificar_averbacao`
   - `verificar_inventario`
   - `regime_trabalho_parceiro_familiar`
   - `fim_ineligivel`
   - `renda_bruta`
   - `finalizacao` (há `finalizacao_processo`, mas existe transição para `finalizacao`)

2. **Duplicidade de `case` no mesmo switch (primeiro bloco fica efetivamente morto):**
   - `inicio_multi_regime_pergunta` (duas implementações)
   - `inicio_multi_regime_coletar` (duas implementações)

3. **Divergência entre contrato/grafo e comportamento atual:**
   - Grafo descreve continuidade por estágios “intermediários legais” (averbação/inventário), porém Worker atual direciona para nomes de stages sem implementação local.
   - Em `agendamento_visita`, transição retorna `finalizacao`, mas stage implementado no switch é `finalizacao_processo`.

4. **Ausência de mecanismo homogêneo de tentativas (`attempts`)**
   - Nenhum gate incrementa tentativas no estado de forma padronizada.
   - Não existe bloqueio/reencaminhamento por excesso de inválidos.

---

## 4) REGEX FRÁGEIS + exemplos que quebram + normalização mínima proposta

## Casos reais frágeis observados
- Yes/No curto fora do padrão estrito:
  - “sim.” (com pontuação) em gates com `^sim$` pode falhar sem normalização adequada por stage.
  - “s”, “ss”, “claro”, “pode ser”, “uhum” nem sempre reconhecidos.
  - “nao” sem acento é aceito em vários pontos, mas há regex com precedência frágil (`^nao|não$`) que pode casar parcialmente inesperado.
- Entradas ambíguas:
  - “não sei”, “talvez”, “acho que sim” não são tratadas de forma consistente em todos os gates.
- Ruído multimodal:
  - áudio/transcrição parcial, emoji único (`👍`, `😂`), texto lixo (“asdf”), mensagem vazia.
- Números:
  - formatos tipo `1.200,50`, `R$ 1200`, `mil e duzentos` têm tratamento desigual entre stages de renda.

## Normalização mínima (sem refatorar arquitetura)
1. **Pré-normalização global** para texto de decisão:
   - trim + lower + remoção de pontuação terminal + normalização de acento.
2. **Helpers mínimos reaproveitáveis**:
   - `normalizeYesNo(text)` aceitando `sim/s/sim./claro/ok/uhum` e `não/nao/n/não./negativo`.
   - `isEmptyOrNoise(text)` para vazio/emoji/lixo curto.
3. **Fallback padrão por gate**:
   - mensagem “não entendi” + repetir pergunta + gravar evento inválido + incrementar attempts em estado.
4. **Regex com agrupamento correto**:
   - trocar padrões frágeis (`^nao|não$`) por `^(nao|não)$`.

---

## Diagnóstico objetivo para Fase 2
- O funil **não está totalmente mudo** (há fallback textual em grande parte), porém é **inconsistente**: falta telemetria de inválido em muitos gates e falta padrão único de attempts.
- Há **rotas quebradas/desligadas** por transição para stages sem implementação no switch.
- Há **duplicidade de cases** que torna parte do código morta e aumenta divergência de comportamento.
- O patch mínimo recomendado (fase 2) é padronizar anti-mudo global por helper, sem refatorar arquitetura e sem renomear colunas.
