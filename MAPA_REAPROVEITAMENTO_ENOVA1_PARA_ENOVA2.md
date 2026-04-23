# MAPA_REAPROVEITAMENTO_ENOVA1_PARA_ENOVA2

## 1) Objetivo do documento
Consolidar, em modo executivo e documental, o que a Enova 1 tem de reaproveitável para a Enova 2 (LLM-first), separando estritamente:
- cognitivo útil;
- mecânico estrutural útil de apoio;
- mecânico de fala proibido para não contaminar a Enova 2.

## 2) Fontes lidas
- `schema/CODEX_WORKFLOW.md`
- `schema/CANONICO_GATE_PRESERVATION.md`
- `schema/SUPABASE_CHANGE_GUARD.md`
- `schema/COGNITIVE_MIGRATION_CONTRACT.md`
- `schema/DECISAO_PRE_IMPLEMENTACAO_COGNITIVO_V2.md`
- `schema/ADENDO_FINAL_COBERTURA_SEGURANCA_COGNITIVO_V2.md`
- `Enova worker.js` (arquivo equivalente ao `worker.js` citado)
- `cognitive/src/cognitive-contract.js`
- `schema/FUNIL_CANONICO_V1.md`
- `schema/FUNIL_MINIMO_CANONICO_V1.md`
- `schema/FUNIL_GATES_AUDIT_V1.md`
- `schema/DIAGNOSTICO_PRE_IMPLEMENTACAO_COGNITIVO_V2.md`
- `schema/DIAGNOSTICO_MIGRACAO_COGNITIVO_V1.md`
- `schema/DIAGNOSTICO_V2_SILENCIADO.md`
- `schema/VARREDURA_COGNITIVO_ISOLADO_V1.md`
- `schema/AUDIT_WORKER_V1.md`
- `schema/SUPABASE_SCHEMA_MAPPING_V1.md`
- `schema/SUPABASE_AUDIT_CALLSITES_V1.md`
- `schema/CORRESPONDENTE_SCHEMA_CONTRATO_V1.md`
- `schema/cognitive/COGNITIVE_ARCHITECTURE_V1.md`
- `schema/cognitive/COGNITIVE_CONTRACT_V1.md`
- `schema/cognitive/FAQ_CANONICO_ETAPA1.md`
- `schema/cognitive/OBJECTIONS_CANONICO_ETAPA2.md`
- `schema/cognitive/KNOWLEDGE_BASE_ETAPA4.md`
- `schema/worker_cognitive_separation.smoke.mjs`
- `schema/worker_persisted_signals_consumption.smoke.mjs`
- `schema/cognitive_stage_contract_pr2.smoke.mjs`
- `schema/manual_mode_bypass_worker.smoke.mjs`
- `schema/cognitive_reset_topo_surface.smoke.mjs`
- `schema/crm_stage_history.sql`
- `schema/crm_override_log.sql`
- `schema/crm_lead_meta.sql`
- `schema/crm_lead_meta_operacional.sql`
- `schema/crm_lead_meta_archived_columns.sql`
- `schema/crm_leads_v1.sql`
- `schema/enova_attendance_meta.sql`
- `schema/enova_attendance_v1.sql`
- `schema/enova_incidents.sql`
- `schema/enova_incidents_v1.sql`
- `schema/enova_docs_private_storage.sql`
- `schema/deduplicar_leads.sql`
- `schema/bases_panel.smoke.mjs`
- `schema/bases_dedup_guard.smoke.mjs`
- `schema/incident_badges_panel.smoke.mjs`
- `schema/panel_case_files_select_contract.smoke.mjs`
- `schema/panel_case_files_full_listing.smoke.mjs`
- `schema/panel_case_files_merge.smoke.mjs`
- `schema/panel_case_files_open_auth.smoke.mjs`
- `schema/panel_case_files_open_headers.smoke.mjs`
- `schema/panel_case_files_open_fix.smoke.mjs`

## 3) Cognitivo útil para a Enova 2
### A) Conhecimento de negócio reaproveitável (alto valor)
- Base normativa/comercial consolidada: RNM, CTPS 36, composição de renda, autônomo com/sem IR, restrição, docs por perfil, visita, correspondente.
- Catálogos canônicos já organizados: FAQ, objeções e knowledge base factual (conteúdo reutilizável como base semântica, não como script fixo).
- Mapa de lacunas reais (MEI, reprovação de correspondente, doc fora de ordem, pós-visita), útil como backlog cognitivo prioritário.

### B) Conhecimento operacional útil
- Ontologia de slots/estados/dependências (titular, composição, parceiro/p3, docs, correspondente, visita).
- Regras de confirmação e conflitos (dados sensíveis/ambíguos pedem confirmação).
- Sinais persistidos úteis para contexto (moradia, trabalho, FGTS, entrada, composição, resumo de dossiê).

### C) Reaproveitamento com cautela (somente como referência)
- Heurísticas de extração/confiança do motor isolado: aproveitar como benchmark de cobertura, não como limite rígido de fala.

## 4) Mecânico estrutural útil para a Enova 2
### B) Estrutura de apoio que vale preservar
- Trilho canônico de fases/gates/nextStage como guardrail de negócio (não como gerador de fala).
- Contratos de separação de responsabilidade (IA interpreta; estrutura valida/persiste).
- Governança de rollout `off/shadow/on` com rollback imediato por flag.
- Guardas de domínio e schema (evitar drift, reaproveitamento indevido de colunas e persistência paralela).
- Trilhas auditáveis: telemetria de decisão, incidentes, histórico CRM por etapa, log de override.
- Camada operacional de painel/CRM/atendimento (views e tabelas) como infraestrutura de gestão.
- Estrutura documental/case-files (merge de fontes, listagem completa, abertura segura de arquivos, fallback canônico).
- Controles operacionais úteis: bypass por modo manual, deduplicação de leads, reset total consistente de estado.

## 5) Mecânico de fala que NAO deve ir para a Enova 2
### C) Proibido migrar
- Arquitetura de fala por prefixo (`__cognitive_reply_prefix`) acoplada a resposta mecânica do stage.
- Fallbacks textuais estáticos por stage (`_MINIMAL_FALLBACK_SPEECH_MAP`) como fala dominante.
- Reancoragem por templates fixos como resposta padrão em offtrack.
- Scripts rígidos de reprompt (`"Acho que não entendi..."`) como camada principal de conversa.
- Prioridade de parser/regex para dominar superfície de fala em vez da IA.
- Travas de utilidade de fala baseadas em heurística rígida local quando isso reduz naturalidade.
- Qualquer casca que force voz robótica, repetitiva ou de menu.

## 6) Telemetria, CRM/painel, docs, reset, segurança e correspondente
### O que aproveitar
- Telemetria comparativa e estrutural (shadow, separação de responsabilidade, incidentes).
- CRM operacional: `crm_lead_meta`, `crm_stage_history`, `crm_override_log`, views consolidadas.
- Painel de arquivos com contrato estável (coluna canônica `url`, merge de fontes, abertura robusta).
- Atendimento operacional (`enova_attendance_meta`/`enova_attendance_v1`) e badges de incidentes.
- Reset total e controles de segurança operacional (manual mode bypass, dedup guard).
- Correspondente: contratos de estado, trilha de retorno e pacote/dossiê estruturado.

### O que redesenhar
- Telemetria de qualidade semântica de fala (menos foco em comprimento/prefixo e mais em utilidade real da resposta).
- Modelo de decisão de offtrack para ficar LLM-first sem fallback robótico dominante.
- Critérios de qualidade conversacional (humanidade, coerência, continuidade) desacoplados de scripts fixos.
- Correspondente cognitivo para cenários faltantes (reprovação, complemento documental, pós-retorno).

### O que nao levar
- Hardcode de mensagens de stage como motor conversacional.
- Dependência de casca de reprompt mecânico para “parecer seguro”.
- Qualquer regra que faça a IA perder soberania de linguagem.

## 7) Riscos de copiar a Enova 1 sem filtro
- Reintroduzir “bot voice” e reduzir taxa de avanço por rigidez de fala.
- Engessar a Enova 2 em parser-first, contrariando o objetivo LLM-first.
- Herdar acoplamentos de contrato antigo (prefixo + fallback mecânico) e repetir silenciamento de IA.
- Misturar conhecimento valioso com casca mecânica, contaminando a arquitetura nova.
- Aumentar custo de manutenção por duplicidade de camada conversacional (IA + script).

## 8) Conclusao objetiva
- A Enova 1 tem alto valor para Enova 2 em conhecimento de negócio, guardrails, telemetria e infraestrutura operacional.
- A casca mecânica de fala da Enova 1 nao deve ser migrada.
- Reaproveitamento correto: conhecimento + estrutura de controle; descarte conservador de fala roteirizada.

## 9) Proximos blocos da Enova 1 que a Enova 2 deve absorver primeiro
1. Catálogos cognitivos (FAQ, objeções, knowledge base factual) como base semântica.
2. Ontologia de slots/dependências/confirmação e lacunas priorizadas (MEI, reprovação correspondente, doc fora de ordem, pós-visita).
3. Contratos estruturais de segurança: separação IA/estrutura, validação de sinal, domínio de persistência.
4. Observabilidade operacional: shadow comparativo, incidentes, trilha CRM por etapa.
5. Infra de CRM/painel/docs/correspondente/reset (somente estrutura e dados; sem scripts de fala).
