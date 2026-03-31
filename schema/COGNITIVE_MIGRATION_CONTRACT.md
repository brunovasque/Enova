# COGNITIVE MIGRATION CONTRACT — ENOVA

**Status:** Canônico  
**Escopo:** Regras permanentes para qualquer tarefa ligada à migração do cognitivo no worker principal da Enova.  
**Objetivo:** Permitir evolução do cognitivo sem perder previsibilidade, soberania do trilho mecânico e segurança operacional.

---

## 1. Objetivo canônico

Migrar a base isolada do cognitivo para dentro do worker principal da Enova de forma controlada, previsível e reversível, sem quebrar gates, `nextStage`, regras de negócio, persistência estrutural ou comportamento mecânico já validado.

---

## 2. Decisões canônicas já fechadas

1. A base isolada do cognitivo é a **fonte canônica de evolução**.
2. O motor cognitivo já existente dentro do worker principal é **legado transitório**.
3. A migração será por **substituição controlada**, e **não** por fusão híbrida.
4. O ponto de entrada canônico da migração é o bloco de cognitive assist dentro de **`runFunnel()`**.
5. A ativação deve ser controlada por **feature flag** com os modos:
   - `off`
   - `shadow`
   - `on`
6. O legado só poderá ser desativado depois de:
   - smoke tests aprovados,
   - shadow validado,
   - comportamento real estável,
   - rollback pronto.

---

## 3. Princípios imutáveis

### 3.1 Mecânico soberano
O mecânico continua sendo o dono de:
- stage atual,
- regra de avanço,
- `nextStage`,
- validação final,
- persistência estrutural,
- gates,
- decisões de negócio.

### 3.2 Cognitivo como casca conversacional
O cognitivo pode cuidar de:
- como perguntar,
- como responder dúvidas,
- como acolher objeções,
- como interpretar resposta aberta,
- como extrair sinal provável,
- como reformular a próxima pergunta.

O cognitivo **não** substitui o trilho.  
Ele substitui a **casca conversacional do trilho**.

### 3.3 Nenhum output cognitivo avança stage sozinho
Todo output cognitivo é apenas:
- sugestão,
- interpretação,
- enriquecimento,
- resposta conversacional.

A decisão final continua no mecânico.

### 3.4 Nada de frankstein
É proibido:
- fortalecer o legado escondido como base principal,
- misturar V1 e V2 sem contrato claro,
- abrir fusão híbrida bagunçada,
- criar nova rota cognitiva fora da arquitetura canônica.

---

## 4. Contrato funcional entre worker e cognitivo

O worker informa ao cognitivo, no mínimo:
- `stage atual`
- objetivo daquele stage
- contexto/sinais já conhecidos
- texto do usuário

O cognitivo devolve, no máximo:
- `reply_text`
- `detected_answer`
- `confidence`
- `needs_confirmation`
- `safe_stage_signal`
- sinais auxiliares compatíveis com o contrato do worker

O mecânico:
- valida,
- decide,
- persiste,
- avança ou mantém stage.

---

## 5. Modos oficiais de operação

### `off`
- legado atual permanece ativo;
- V2 fica inerte;
- comportamento real não muda.

### `shadow`
- V1 continua respondendo;
- V2 roda em paralelo apenas para telemetria e comparação;
- V2 não responde ao usuário final.

### `on`
- V2 vira motor primário do cognitive assist;
- ativação só após critérios de shadow cumpridos.

---

## 6. Regra de rollout

A ordem oficial é:

`merge -> shadow test -> análise -> on test -> shadow prod -> análise -> on prod -> remoção futura do legado`

### Regra dura
- merge **não** significa ativar;
- test valida **plumbing**, não comportamento real;
- comportamento real só é validado com tráfego real;
- ninguém pula shadow;
- ninguém liga `on` em prod sem cumprir os critérios documentados.

---

## 7. O que pode mudar sem novo diagnóstico

São aceitos como **calibração**:
- ajuste de threshold de confidence,
- ajuste de heurística leve,
- ajuste de `still_needs_original_answer`,
- ajuste de `answered_customer_question`,
- alias extra de `entities`,
- prioridade de construção de `safe_stage_signal`.

Esses ajustes só são aceitáveis se:
- preservarem o contrato atual,
- não mexerem no trilho,
- não alterarem path `off`,
- não alterarem regra de negócio.

---

## 8. O que exige novo diagnóstico obrigatório

Exige novo diagnóstico antes de qualquer patch:
- mudar o contrato do adapter,
- mudar o branching em `runFunnel()`,
- mudar o consumo de `__cognitive_reply_prefix`,
- expandir os stages do cognitivo,
- tocar no path V1/off,
- alterar o papel do mecânico,
- permitir avanço de stage por output cognitivo,
- qualquer mudança fora do ponto de entrada canônico.

---

## 9. Fluxo obrigatório em toda tarefa de cognitivo

Toda tarefa ligada ao cognitivo deve seguir esta ordem:

1. diagnóstico
2. decisão
3. documentação
4. implementação
5. validação
6. atualização do handoff/planejamento

É proibido pular direto para implementação sem plano fechado.

---

## 10. Leitura obrigatória antes de qualquer nova tarefa de cognitivo

Para qualquer nova aba, tarefa, PR ou análise ligada ao cognitivo, ler obrigatoriamente:

- `schema/COGNITIVE_MIGRATION_CONTRACT.md`
- `schema/DECISAO_PRE_IMPLEMENTACAO_COGNITIVO_V2.md`
- `schema/ADENDO_FINAL_COBERTURA_SEGURANCA_COGNITIVO_V2.md`

Se a tarefa for continuação da migração cognitiva, atualizar obrigatoriamente ao final:
- este contrato, se mudar regra canônica;
- o planejamento/handoff, se houver avanço operacional;
- a decisão/adendo, se houver novo gate fechado.

---

## 11. Regra de atualização documental

### Atualizar este contrato quando:
- mudar uma regra canônica,
- mudar arquitetura,
- mudar gate,
- mudar protocolo de ativação,
- mudar critério de segurança.

### Atualizar o planejamento/handoff quando:
- uma etapa for concluída,
- uma validação for feita,
- um bloqueio novo for descoberto,
- uma tarefa alterar o estado real do projeto.

---

## 12. Resumo executivo

A regra permanente da Enova para migração cognitiva é:

- V2 isolado = base oficial
- V1 do worker = legado transitório
- mecânico soberano
- cognitivo como casca conversacional
- substituição controlada
- rollout por `off/shadow/on`
- rollback sempre pronto
- nada de fusão híbrida
- nada de implementação sem diagnóstico fechado
