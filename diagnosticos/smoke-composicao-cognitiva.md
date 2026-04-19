# Smoke Test — Composição Cognitiva (Surface Cognitiva)

## Objetivo
Provar que os 7 stages do bloco de composição agora falam cognitivamente,
sem cair em fala bot/default/heurística mecânica.

## Cenários de Teste

### 1. Transição para `estado_civil` (via nacionalidade:brasileiro)
**Input:** "sou brasileiro"
**Stage anterior:** inicio_nacionalidade
**Stage destino:** estado_civil
**Antes:** "Perfeito! 🇧🇷 😊 Vamos seguir… Qual é o seu estado civil?"
**Esperado:** Fala cognitiva via LLM, curta e natural. Fallback: "Agora me fala seu estado civil."
**Prova:** `__speech_arbiter_source === "llm_real"` (quando LLM disponível)

### 2. Estado civil → solteiro → somar_renda_solteiro
**Input:** "solteiro"
**Stage:** estado_civil
**Destino:** somar_renda_solteiro
**Antes:** "Perfeito 👌 E sobre renda… você pretende usar **só sua renda**, ou quer considerar **parceiro(a)** ou **familiar**?"
**Esperado:** Fala cognitiva via LLM. Fallback: "Certo, solteiro(a). Pretende usar só sua renda, somar com parceiro(a), ou com familiar?"
**Prova:** `__speech_arbiter_source === "llm_real"` / `__cognitive_v2_takes_final === true`

### 3. Estado civil → casado → confirmar_casamento
**Input:** "casado"
**Stage:** estado_civil
**Destino:** confirmar_casamento
**Antes:** "Entendi! 👍 Seu casamento é **civil no papel**..."
**Esperado:** Fala cognitiva. Fallback: "Entendi, casado(a). Seu casamento é civil no papel ou é união estável?"
**Prova:** Flags cognitivas preservadas (não limpa antes do step)

### 4. confirmar_casamento → civil → regime_trabalho
**Input:** "sim, no papel"
**Stage:** confirmar_casamento
**Destino:** regime_trabalho
**Antes:** "Perfeito! 📄 Então seguimos com vocês **juntos no financiamento**..."
**Esperado:** Fala cognitiva via getHappyPathSpeech("confirmar_casamento:civil"). Fallback: "Beleza, casamento civil..."
**Prova:** `__speech_arbiter_source === "llm_real"`

### 5. financiamento_conjunto → juntos → regime_trabalho
**Input:** "juntos"
**Stage:** financiamento_conjunto
**Destino:** regime_trabalho
**Antes:** "Perfeito! 👏 Então vamos considerar a renda de vocês dois."
**Esperado:** Fala cognitiva. Fallback: "Beleza, vamos considerar a renda de vocês dois."
**Prova:** Cognitive flags não limpos antes do step

### 6. somar_renda_solteiro → parceiro
**Input:** "quero somar com minha namorada"
**Stage:** somar_renda_solteiro
**Destino:** regime_trabalho_parceiro
**Antes:** "Perfeito! 🙌 Vamos incluir a renda de sua namorada."
**Esperado:** Fala cognitiva com parceiroLabel dinâmico. Fallback usa label do parser.
**Prova:** `__speech_arbiter_source === "llm_real"`

### 7. somar_renda_familiar → mãe → pais_casados_civil_pergunta
**Input:** "minha mãe"
**Stage:** somar_renda_familiar
**Destino:** pais_casados_civil_pergunta
**Antes:** "Seus pais são casados no civil atualmente? (sim/não)"
**Esperado:** Fala cognitiva. Fallback: "Certo! Seus pais são casados no civil atualmente?"
**Prova:** Cognitive flags setados via setHappyPathFlags

### 8. interpretar_composicao → familiar → somar_renda_familiar
**Input:** "quero compor com familiar"
**Stage:** interpretar_composicao
**Destino:** somar_renda_familiar
**Antes:** "Show! 👏 Vamos compor renda com familiar. Qual familiar..."
**Esperado:** Fala cognitiva. Fallback: "Beleza, vamos compor com familiar. Qual familiar?"

### 9. quem_pode_somar → sozinho → fim_ineligivel
**Input:** "só eu"
**Stage:** quem_pode_somar
**Destino:** fim_ineligivel
**Antes:** "Entendi! 👍 Sem alguém para compor renda..."
**Esperado:** Fala cognitiva. Fallback: "Entendi. Sem alguém pra compor renda..."

### 10. Fallback em qualquer stage de composição
**Input:** "bla bla bla" (texto não parseável)
**Stage:** qualquer dos 7
**Destino:** mesmo stage
**Antes:** "Perfeito, só me diga..." / "Pra gente seguir certinho 😊..."
**Esperado:** Fala cognitiva via fallback HAPPY_PATH_SPEECH. Sem "Perfeito!" ou "Pra gente seguir certinho 😊"

## Critérios de Aceite
- [ ] Nenhum dos 7 stages produz fala com "Perfeito!" / "Show!" / "Entendi! 👍"
- [ ] Nenhuma transição usa markdown bold (**texto**) na fala final
- [ ] `__cognitive_reply_prefix` NÃO é limpo antes do step() em happy paths
- [ ] `__speech_arbiter_source` retorna "llm_real" quando LLM responde
- [ ] Fallbacks são naturais, curtos e sem cara de bot
- [ ] Parser/nextStage/gates intactos (zero mudança estrutural)

## Mecanismo Técnico
1. Cada transição chama `getHappyPathSpeech(env, transitionKey, st)`
2. `setHappyPathFlags(st, speech)` configura flags cognitivas
3. `step()` chama `renderCognitiveSpeech()` que vê as flags e usa LLM speech
4. Se LLM falha, o texto mecânico no `step()` serve como fallback extreme
5. Zero mudança em parser, nextStage, gates ou soberania estrutural
