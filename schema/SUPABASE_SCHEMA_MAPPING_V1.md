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
| enova_docs_pendencias | sim | write | não | ERRADO | remover referência ou substituir por tabela válida existente |

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
- Colunas **não encontradas** em `schema/enova_state.columns.txt`: `rnm_status`, `multi_rendas`, `multi_rendas_parceiro`, `multi_regimes`, `multi_regimes_parceiro`, `renda_individual_calculada`, `renda_parceiro_calculada`, `renda_total_composicao`, `faixa_renda_programa`, `docs_pendentes`.
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
- Verificação de existência no Supabase (tabela): **não existe** em `schema/public_tables.txt`.
- Conclusão: referência inválida confirmada.

## Erros confirmados

- `enova_docs_pendencias` é referenciada no Worker, porém **não consta** na lista de tabelas públicas do Supabase no repositório.
- Em `enova_state`, há colunas usadas pelo runtime que **não aparecem** no inventário `schema/enova_state.columns.txt` (ex.: `docs_pendentes`, `rnm_status`, `multi_rendas`).

## Riscos

- Escritas para tabela inexistente (`enova_docs_pendencias`) podem gerar falha silenciosa/erro HTTP e quebrar rastreio de pendências de documentos.
- Escritas de colunas inexistentes em `enova_state` podem resultar em erro 400/404 na API PostgREST ou perda de atualização de estado.
- Uso de `fetch` direto misturado com helper proxy (`sbFetch`) aumenta risco de divergência de headers/padrão de autenticação.

## Plano de Patch mínimo (não implementar)

- Substituir/remover a referência a `enova_docs_pendencias` por tabela válida já existente no Supabase.
- Padronizar os pontos de `fetch` direto em `/rest/v1/enova_docs` para `sbFetch`/helpers já existentes.
- Criar checklist de alinhamento de colunas `enova_state` usadas pelo Worker vs schema real (adicionar colunas faltantes **ou** remover uso no runtime).
- Adicionar export versionado de colunas para `enova_docs`, `enova_docs_status` e `enova_log` em `schema/` para auditorias futuras.
