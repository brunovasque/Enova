# FUNIL_CANONICO_V1

WORKFLOW_ACK: ok

Objetivo: índice canônico das 14 fases do `schema/FUNIL_MINIMO_CANONICO_V1.md`, com o mapeamento para stage real do runtime (`Enova worker.js`) e status de linkagem no fluxo principal.

## Índice canônico (14 fases)

| # | fase_canônica | stage real no worker | status | alias / observação |
|---|---|---|---|---|
| 1 | Início | `inicio` | **LIGADO** | entrada padrão do `runFunnel` |
| 2 | Nome | `inicio_nome` | **LIGADO** | vem de `inicio_programa` |
| 3 | Estrangeiro? | `inicio_nacionalidade` (`inicio_rnm`/`inicio_rnm_validade`) | **DESLIGADO (órfão)** | implementado, mas fora da trilha principal atual |
| 4 | Estado civil | `estado_civil` | **LIGADO** | recebe usuário logo após `inicio_nome` |
| 5 | Regime de trabalho (multi ou não) | `regime_trabalho` (+ `inicio_multi_regime_*`) | **LIGADO** | parse CLT/autônomo/servidor/aposentado |
| 6 | Renda (única / multi / mista) | `renda` (+ `renda_parceiro`, `possui_renda_extra`, `renda_mista_detalhe`, `inicio_multi_renda_*`) | **LIGADO** | consolidação de renda total para fluxo |
| 7 | Composição de renda + amarras | `somar_renda_solteiro`, `parceiro_tem_renda`, `somar_renda_familiar`, `regime_trabalho_parceiro_familiar` | **LIGADO** | alias: “composição” é um conjunto de stages |
| 8 | Dependente | `dependente` | **LIGADO** | com regra de pulo em composição/conjunto |
| 9 | 36 meses | `ctps_36` (+ `ctps_36_parceiro`) | **LIGADO** | alias: “36 meses” = gate CTPS |
| 10 | Restrição | `restricao` (+ `regularizacao_restricao`) | **LIGADO** | gate CPF/Serasa/SPC |
| 11 | DOCs | `envio_docs` | **LIGADO** | upload + checklist de pendências |
| 12 | Não quis enviar DOCs | **NÃO EXISTE** (ramo interno em `envio_docs`) | **NÃO EXISTE** | sem stage dedicado; apenas permanência em `envio_docs` |
| 13 | Enviou DOCs | **NÃO EXISTE** (evento via helper `handleDocumentUpload`) | **NÃO EXISTE** | quando completa docs, segue para `agendamento_visita` |
| 14 | Aprovou financiamento | **NÃO EXISTE** (evento em `aguardando_retorno_correspondente`) | **NÃO EXISTE** | regex de aprovado leva para `agendamento_visita` |

## Âncoras verificáveis no worker (1 por fase)

1. **Início**
   - Âncora: `case "inicio": {`
2. **Nome**
   - Âncora: `case "inicio_nome": {`
3. **Estrangeiro? (órfã)**
   - Âncora: `case "inicio_nome"` retorna `"estado_civil"` (sem passar por nacionalidade): `next_stage: "estado_civil"`.
4. **Estado civil**
   - Âncora: `case "estado_civil": {`
5. **Regime de trabalho**
   - Âncora: `const regimeDetectado = parseRegimeTrabalho(t);`
6. **Renda**
   - Âncora: `case "renda": {`
7. **Composição de renda**
   - Âncora: `case "somar_renda_solteiro": {`
8. **Dependente**
   - Âncora: `if (st.financiamento_conjunto === true || st.somar_renda === true) { ... next_stage: "restricao" }`
9. **36 meses**
   - Âncora: `case "ctps_36": {`
10. **Restrição**
    - Âncora: `case "restricao": {`
11. **DOCs**
    - Âncora: `case "envio_docs": {`
12. **Não quis enviar DOCs**
    - Âncora: `if (negar) { ... return step(..., "envio_docs"); }` dentro de `case "envio_docs"`.
13. **Enviou DOCs**
    - Âncora: `return { ok: true, ... nextStage: "agendamento_visita" }` em `handleDocumentUpload`.
14. **Aprovou financiamento**
    - Âncora: `if (aprovado) { ... next_stage: "agendamento_visita" ... }` em `case "aguardando_retorno_correspondente"`.
