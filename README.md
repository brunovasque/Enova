# Enova

# BINDINGS

## Secrets (Cloudflare Worker)
- `CLOUDFLARE_ACCOUNT_ID` (GitHub Actions secret)
- `CLOUDFLARE_API_TOKEN` (GitHub Actions secret)
- `WHATS_TOKEN`
- `SUPABASE_SERVICE_ROLE`

## Vars (Worker)
- `META_API_VERSION`
- `PHONE_NUMBER_ID`
- `META_VERIFY_TOKEN`
- `SUPABASE_URL`
- `ENOVA_DELAY_MS`
- `TELEMETRIA_LEVEL`

- # CRON

## Produção (PROD)
- Agendamento: `0 12 * * *`
- Objetivo: follow-up base fria.

## Teste (TEST)
- Cron desligado.

## Dependência técnica
- O cron depende do handler `scheduled()` já existente no worker.
- O `scheduled()` atual apenas loga execução e chama `runColdFollowupBatch()` em modo stub, sem impactar o `fetch()`.
- A ativação/desativação de cron será feita pela Cloudflare UI (não via `wrangler.toml`).

# SMOKE TESTS

## GET webhook verification (curl)
```bash
curl -i "https://<worker-url>/webhook/meta?hub.mode=subscribe&hub.verify_token=<META_VERIFY_TOKEN>&hub.challenge=123"
```

## POST webhook (curl)
```bash
curl -i -X POST "https://<worker-url>/webhook/meta" \
  -H "Content-Type: application/json" \
  -d '{"entry":[]}'
```

## PowerShell
```powershell
Invoke-WebRequest -Method GET "https://<worker-url>/webhook/meta?hub.mode=subscribe&hub.verify_token=<META_VERIFY_TOKEN>&hub.challenge=123"

Invoke-WebRequest -Method POST "https://<worker-url>/webhook/meta" -ContentType "application/json" -Body '{"entry":[]}'

## Tabelas relevantes no Supabase para funcionamento do Painel
2.1 enova_state – estado atual da conversa (CANÔNICO)

Colunas relevantes (simplificado):

wa_id (text) – identificador WhatsApp.

updated_at (timestamptz) – última atualização de estado.

last_user_msg (text, hoje quase sempre NULL).

last_bot_msg (text) – última saída do bot que aparece na lista.

fase_conversa (text) – passo atual do funil.

funil_status (text / null).

Consultas executadas:

select wa_id, updated_at, last_user_msg, last_bot_msg, fase_conversa, funil_status
from enova_state
order by updated_at desc
limit 20;


Resultados importantes:

Para o número 554185260518:

updated_at = 2026-02-11 ... (HOJE).

last_bot_msg = 'Você declara **Imposto de Renda**?'.

fase_conversa = 'ir_declarado'.

Conclusão:

enova_state está vivo e atualizado.

A lista de conversas do painel usa essa tabela como fonte — e está correta.

2.2 chat_history e chat_history_whatsapp – antigos e abandonados

chat_history_whatsapp

Estrutura (pelos information_schema.columns):

id (uuid)

phone (text)

message (text)

source (text)

created_at (timestamptz)

Consultas:

select count(*) as total, max(created_at) as last_at
from chat_history_whatsapp;
-- total = 1, last_at = 2025-10-02 ...

select id, phone, message, source, created_at
from chat_history_whatsapp
order by created_at desc
limit 20;


Resultado:

Apenas 1 linha, com:

phone = '554185260518'

message = 'Oi'

created_at = 2025-10-02 02:36:31.81+00

chat_history

select count(*) as total, max(created_at) as last_at
from chat_history;
-- total = 57, last_at = 2025-10-03 00:11:08.569+00


Conclusão:

Ambas as tabelas são histórico legado (2025-10).

Não existe nenhum registro recente (últimos 7 dias = 0 linhas).

Se a rota /api/messages estiver tentando usar essas tabelas, a consequência é thread vazia (exatamente o que vimos no painel).

2.3 enova_telemetry – telemetria antiga
select count(*) as total, max(created_at) as last_at
from enova_telemetry;
-- total = 1, last_at = 2025-11-20 ...

select wa_id, message, created_at
from enova_telemetry
where wa_id = '554185260518';
-- no rows


No código do worker, a função telemetry() está explicitly marcada como:

Apenas console.log("TELEMETRIA-SAFE", ...).

Sem sbFetch, ou seja: não grava nada no banco na versão atual.

Conclusão:

enova_telemetry não é (e não deve ser) histórico de chat.

A tabela está praticamente morta; a telemetria atual é só console.

2.4 enova_log e enova_logs – logs de fluxo

enova_logs

select count(*) as total, max(created_at) as last_at
from enova_logs;
-- total = 0, last_at = NULL


Não está em uso.

enova_log

select count(*) as total, max(created_at) as last_at
from enova_log;
-- total ≈ 495, last_at = 2026-02-09 23:37:48.253496+00

select *
from enova_log
order by created_at desc
limit 50;


Campos relevantes (simplificado):

id (bigint)

wa_id (text)

tag (text)

details (jsonb / text)

created_at (timestamptz)

stage (text)

user_text (text)

meta_type (text)

meta_text (text)

meta_message_id (text)

meta_status (text)

Consultas focadas:

select tag, meta_type, meta_text, user_text, details, created_at
from enova_log
where wa_id = '554185260518'
order by created_at desc
limit 100;


Resultados chave:

Linhas recentes (09/02/2026) para wa_id = 554185260518 e 16315551181:

tag	meta_type	meta_text	details	created_at
meta_minimal	text	"this is a text message"	NULL	2026-02-09 22:15:30...
meta_minimal	text	"oi"	NULL	2026-02-09 22:39:19...
meta_minimal	text	"oi 123"	NULL	2026-02-09 23:37:48...
SEND_OK	NULL	NULL	JSON	2025-10-25 ...
DECISION_*	etc	...	JSON	2025-10-30 ...

Interpretação:

tag = meta_minimal + meta_type = text + meta_text → mensagem recebida do usuário (entrada).

tag = SEND_OK / DECISION_OUTPUT / STATE_TRANSITION / IGNORED_STATUS etc → eventos de saída e de máquina de estados, com conteúdo em details (JSON).

Ponto importante de datas:

enova_log.last_at = 2026-02-09.

enova_state.updated_at está em 2026-02-11.

Ou seja:

Até 09/02 – entrada de mensagens era registrada em enova_log com meta_minimal.

Depois de um patch recente – o estado continua sendo atualizado, mas novas mensagens pararam de entrar no enova_log.
