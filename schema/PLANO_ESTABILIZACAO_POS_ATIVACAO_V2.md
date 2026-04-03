# PLANO DE ESTABILIZAÇÃO PÓS-ATIVAÇÃO — COGNITIVE_V2_MODE=on EM PROD

**Data de ativação:** 2026-04-03  
**Status:** ATIVO  
**Modo anterior:** shadow  
**Modo atual:** on  
**Rollback:** `COGNITIVE_V2_MODE = "shadow"` ou `"off"` em `wrangler.toml [vars]` → deploy → instantâneo

---

## 1. Princípio operacional

O V2 agora responde no real como motor cognitivo primário.  
O mecânico continua soberano em stage, gates, nextStage e persistência.  
Qualquer ajuste seguinte é **calibração pontual da camada cognitiva**, não redesign do funil.

---

## 2. O que monitorar nos primeiros dias

| Indicador | Onde | Ação se anômalo |
|---|---|---|
| Taxa de fallback heurístico (reason=cognitive_v2_heuristic) | Telemetria cognitive_v1_signal | Se > 80%, investigar LLM |
| Confidence média | Telemetria cognitive_v1_signal | Se < 0.4 média, avaliar prompts |
| Erros V2 (COGNITIVE_V2_ADAPTER_ERROR) | Console logs | Se recorrente, rollback para shadow |
| Reply vazio (reply_text_length=0) | Telemetria v2_shadow / cognitive_v1_signal | Se > 10%, rollback |
| Reclamação de qualidade pelo cliente | Feedback direto | Rollback imediato + análise |
| Latência percebida | Observability Cloudflare | Se p95 > 2x baseline, rollback |

---

## 3. Ajustes permitidos sem novo diagnóstico

Conforme `COGNITIVE_MIGRATION_CONTRACT.md` §7:
- ajuste de threshold de confidence
- ajuste de heurística leve
- ajuste de `still_needs_original_answer`
- ajuste de `answered_customer_question`
- alias extra de `entities`
- prioridade de construção de `safe_stage_signal`

---

## 4. O que NÃO fazer

- NÃO reabrir o mecânico sem quebra comprovada
- NÃO transformar esta fase em laboratório de logs
- NÃO expandir cobertura de stages sem contrato
- NÃO alterar gates, nextStage, step(), persistência
- NÃO fazer refatoração ampla
- NÃO remover legado V1 ainda

---

## 5. Critérios para desligamento futuro do legado V1

O legado V1 só pode ser removido quando:
1. V2 estiver estável em PROD por pelo menos 2 semanas
2. Nenhum rollback tenha sido necessário
3. Feedback de qualidade positivo confirmado
4. Taxa de fallback heurístico estabilizada
5. Decisão explícita documentada

---

## 6. Rollback operacional

### Rollback para shadow (monitoramento sem impacto):
```toml
# wrangler.toml [vars]
COGNITIVE_V2_MODE = "shadow"
```
Deploy → V1 volta a responder, V2 continua em paralelo para telemetria.

### Rollback total (legado puro):
```toml
# wrangler.toml [vars]
COGNITIVE_V2_MODE = "off"
```
Deploy → V2 completamente inerte, V1 puro.

### Rollback via Cloudflare Dashboard:
Alterar env var `COGNITIVE_V2_MODE` diretamente no dashboard → efeito no próximo request.

---

## 7. Histórico de ações

| Data | Ação | Modo | Resultado |
|---|---|---|---|
| 2026-04-03 | Ativação V2 on em PROD | shadow → on | ✅ Ativado |
