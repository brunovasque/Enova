# SUPABASE_SCHEMA_MAPPING_V1

Escopo: **Worker-only / documentação em `schema/`**.

## Resumo por tabela

| tabela | usada_no_worker | tipo | existe_no_supabase | status | ação_sugerida |
|---|---|---|---|---|---|
| agendamentos | não | - | sim | OK | nenhuma |
| assinatura_cef | não | - | sim | OK | nenhuma |
| atendimentos | não | - | sim | OK | nenhuma |
| chat_history | não | - | sim | OK | nenhuma |
| chat_history_whatsapp | não | - | sim | OK | nenhuma |
| chat_logs | não | - | sim | OK | nenhuma |
| clientesnv_old | não | - | sim | OK | nenhuma |
| crm_leads | não | - | sim | OK | nenhuma |
| crm_users | não | - | sim | OK | nenhuma |
| enavia_brain_modules | não | - | sim | OK | nenhuma |
| enova_correspondente_queue | não | - | sim | OK | nenhuma |
| enova_docs | sim | read+write | sim | OK | padronizar `/rest/v1` via `sbFetch` para os pontos de `fetch` direto |
| enova_docs_status | sim | write | sim | OK | manter |
| enova_etapas_log | não | - | sim | OK | nenhuma |
| enova_faq | não | - | sim | OK | nenhuma |
| enova_faqs | não | - | sim | OK | nenhuma |
| enova_incoming_media | não | - | sim | OK | nenhuma |
| enova_kb | não | - | sim | OK | nenhuma |
| enova_kv | não | - | sim | OK | nenhuma |
| enova_log | sim | write | sim | OK | manter |
| enova_logs | não | - | sim | OK | nenhuma |
| enova_prompts | não | - | sim | OK | nenhuma |
| enova_prompts_backup_2025_10_08 | não | - | sim | OK | nenhuma |
| enova_prompts_old_backup | não | - | sim | OK | nenhuma |
| enova_state | sim | read+write | sim | ATENÇÃO | alinhar colunas usadas no runtime com colunas reais da tabela |
| enova_telemetry | não | - | sim | OK | nenhuma |
| faqs_enova_backup | não | - | sim | OK | nenhuma |
| indicacoes | não | - | sim | OK | nenhuma |
| lead_auditoria | não | - | sim | OK | nenhuma |
| leads_frios | não | - | sim | OK | nenhuma |
| leads_funil | não | - | sim | OK | nenhuma |
| leads_unificados | não | - | sim | OK | nenhuma |
| orchestrator_executions | não | - | sim | OK | nenhuma |
| orchestrator_flags | não | - | sim | OK | nenhuma |
| orchestrator_workflows | não | - | sim | OK | nenhuma |
| pre_analises | não | - | sim | OK | nenhuma |
| users_roles | não | - | sim | OK | nenhuma |
| visitas_agendadas | não | - | sim | OK | nenhuma |
| enova_docs_pendencias | sim | write | sim | OK | manter |

## Tabelas usadas no Worker — colunas lidas/escritas

Fontes: `schema/SUPABASE_AUDIT_CALLSITES_V1.md`, `schema/enova_state.columns.txt`, `schema/public_tables.txt` e leitura do `Enova worker.js`.

### 1) `enova_log`

- Uso no Worker: **write** (`logger(...)`).
- Colunas escritas observadas: payload dinâmico (`tipo`, `wa_id`, `texto`, `nome_detectado`, `status_detectado`, `bloco`, etc.).
- Verificação de existência de colunas no repo: **não disponível** (não há inventário de colunas de `enova_log` nas fontes obrigatórias).
- Conclusão: tabela existe; colunas precisam ser validadas no schema SQL/export de colunas para evitar inserts com campos inexistentes.

### 2) `enova_state`

- Uso no Worker: **read+write** (`getState`, `upsertState`, `resetTotal`, `findClientByName`, `updateDocsStatusV2`).
- Colunas lidas observadas (audit/código): `wa_id`, `nome`, `fase_conversa`, `funil_status`, `updated_at`.
- Colunas escritas observadas (audit/código): `updated_at`, `fase_conversa`, `funil_status`, `last_user_text`, `last_processed_text`, `last_bot_msg`, `last_message_id`, `nome`, `estado_civil`, `somar_renda`, `financiamento_conjunto`, `renda`, `renda_parceiro`, `renda_total_para_fluxo`, `dependente`, `restricao`, `ctps_36`, `ctps_36_parceiro`, `nacionalidade`, `docs_completos`.
- Colunas novas de `enova_state` já refletidas em `schema/enova_state.columns.txt`: `visita_confirmada`, `visita_dia_hora`, `_incoming_media`, `docs_pendentes`, `faixa_renda_programa`, `dependentes_qtd`, `rnm_status`, `rnm_validade`, `multi_rendas`, `multi_rendas_parceiro`, `multi_regimes`, `multi_regimes_parceiro`, `autonomo_comprova`, `avo_beneficio`, `casamento_formal`, `ir_declarado_p2`, `modo_humano`, `primeiro_nome`, `processo_aprovado`, `processo_reprovado`, `regime_trabalho`, `regime_trabalho_parceiro`, `regime_trabalho_parceiro_familiar`, `tipo_trabalho`, `tipo_trabalho_parceiro`, `renda_base`, `renda_variavel`, `renda_individual_calculada`, `renda_parceiro_bruta`, `renda_parceiro_calculada`, `renda_total_composicao`, `p2_renda_variavel`, `familiar_tipo`.
- Colunas encontradas em `schema/enova_state.columns.txt` (amostra das usadas): `wa_id`, `updated_at`, `fase_conversa`, `funil_status`, `last_user_text`, `last_processed_text`, `last_bot_msg`, `last_message_id`, `nome`, `estado_civil`, `somar_renda`, `financiamento_conjunto`, `renda`, `renda_parceiro`, `renda_total_para_fluxo`, `dependente`, `restricao`, `ctps_36`, `ctps_36_parceiro`, `nacionalidade`, `docs_completos`.
- Conclusão: existe desalinhamento parcial de colunas entre runtime e schema conhecido do repo.

### 3) `enova_docs_status`

- Uso no Worker: **write** (`saveDocumentStatus`).
- Colunas escritas observadas: `wa_id`, `status_json`, `updated_at`.
- Verificação de existência de colunas no repo: **não disponível** (não há inventário de colunas de `enova_docs_status` nas fontes obrigatórias).
- Conclusão: tabela existe; confirmar colunas antes de depender de escrita em produção.

### 4) `enova_docs`

- Uso no Worker: **read+write** (`saveDocumentForParticipant`, `saveDocumentToSupabase`, `updateDocsStatusV2`).
- Colunas lidas observadas: `tipo`, `participante` (comparação de checklist), além de `select: *`.
- Colunas escritas observadas: `wa_id`, `participante`, `tipo`, `url`, `created_at` (e payload dinâmico em `saveDocumentToSupabase`).
- Verificação de existência de colunas no repo: **não disponível** (não há inventário de colunas de `enova_docs` nas fontes obrigatórias).
- Conclusão: tabela existe; validação fina de colunas depende de export de estrutura da tabela.

### 5) `enova_docs_pendencias`

- Uso no Worker: **write** (`updateDocumentPendingList`).
- Colunas escritas observadas: `wa_id`, `participante`, `doc_tipo`, `motivo`, `created_at`.
- Verificação de existência no Supabase (tabela): **existe** em `schema/public_tables.txt`.
- Conclusão: referência válida e alinhada com o schema público.

## Erros confirmados

- `enova_docs_pendencias` está mapeada e listada nas tabelas públicas do Supabase no repositório.
- As colunas novas de `enova_state` usadas pelo runtime agora constam no inventário `schema/enova_state.columns.txt`.

## Riscos

- Como `enova_docs_pendencias` e as novas colunas de `enova_state` estão mapeadas, reduzimos risco de divergência entre contrato de schema e runtime.
- Uso de `fetch` direto misturado com helper proxy (`sbFetch`) aumenta risco de divergência de headers/padrão de autenticação.

## Plano de Patch mínimo (não implementar)

- Manter atualização contínua de `schema/enova_state.columns.txt` conforme migrações no Supabase.
- Manter `enova_docs_pendencias` em `public_tables` e no inventário de call-sites.
- Adicionar export versionado de colunas para `enova_docs`, `enova_docs_status` e `enova_log` em `schema/` para auditorias futuras.
