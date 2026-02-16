# FUNIL_V2_MOTOR_SPEC_V1 — Motor de Funil Enova (Canônico)

Escopo: **Worker-only** (arquivo de schema em `schema/`).  
Código de runtime continua no `Enova worker.js`.  
Toda tarefa do Codex que tocar no funil **deve ler este arquivo + `CODEX_WORKFLOW.md` primeiro**.

---

## 1. Objetivo

Padronizar o **motor de funil V2** da Enova dentro do Worker, de forma:

- 100% alinhada ao **FUNIL MÍNIMO CANÔNICO V1**, `FUNIL_GRAPH_V1.md`, `FUNIL_GATES_AUDIT_V1.md` e `FUNIL_LINK_AUDIT_V1.md`.
- 100% compatível com o schema real do Supabase (`enova_state.columns.txt`, `SUPABASE_SCHEMA_MAPPING_V1.md`, `SUPABASE_AUDIT_CALLSITES_V1.md`).
- Extensível: novas fases = novos `StageId` / novos nós no grafo, **sem quebrar** o que já existe.

Nada aqui é patch de código.  
É um **contrato** que o Worker (e o Codex) devem obedecer.

---

## 2. Tipos do Motor

### 2.1. StageId (estado da conversa)

Lista de estados de conversa usados pelo **FUNIL V2**.  
Cada `StageId` representa uma posição única na descida de funil.

```ts


// Fases principais do funil V2
export type StageId =
  // BLOCO 0–3: ENTRADA / NOME / ESTRANGEIRO
  | "inicio"                 // lead entrou, boot do funil
  | "inicio_nome"            // coleta de nome
  | "inicio_estrangeiro"     // estrangeiro? + nacionalidade

  // BLOCO 4: ESTADO CIVIL / COMPOSIÇÃO
  | "estado_civil"

  // BLOCO 5–7: REGIME + RENDA + COMPOSIÇÃO
  | "regime_trabalho"
  | "renda"
  | "composicao_renda"

  // BLOCO 8: DEPENDENTE / FATOR SOCIAL
  | "dependente"

  // BLOCO 9: CTPS 36 MESES
  | "ctps_36"

  // BLOCO 10: RESTRIÇÃO / EMPRÉSTIMOS
  | "restricao"

  // BLOCO 11–13: DOCS + CORRESPONDENTE
  | "docs_opcao"             // escolheu canal / enviar ou não
  | "docs_nao_enviou"        // preferiu levar no plantão
  | "docs_enviou_correspondente" // docs enviados e processo no correspondente

  // BLOCO 14: AGENDAMENTO DE VISITA
  | "agendamento_visita"

  // BLOCO 15–16: ENCERRAMENTO
  | "pos_venda_desligamento" // pós-venda / desligamento CEF
  | "fim_ineligivel";        // encerramento por inelegibilidade
Regra de extensão:
Qualquer fase futura deve ser adicionada aqui como novo StageId, com StageMeta correspondente e nó no grafo do FUNIL_V2.
Nunca reutilizar um StageId existente com outro significado.

2.2. StageGroup
Agrupamento lógico de fases para organização, logs e leitura.

export type StageGroup =
  | "entrada"
  | "estado_civil"
  | "renda"
  | "dependente"
  | "ctps"
  | "restricao"
  | "docs"
  | "agendamento"
  | "encerramento";
2.3. WritesBlockId (blocos canônicos de escrita)
Cada bloco define quais colunas do enova_state podem ser escritas em determinado conjunto de fases.

export type WritesBlockId =
  | "entrada"
  | "estado_civil"
  | "renda"
  | "dependente"
  | "ctps"
  | "restricao"
  | "docs"
  | "agendamento"
  | "encerramento";
2.4. Gates
Metadados de controle de fluxo.

export type StageGates = {
  terminal?: boolean;     // estágio final (não avança para outro)
  branchPoint?: boolean;  // ponto de bifurcação importante (escolhas)
  allowsReentry?: boolean;// pode ser reusado depois (revisita)
};
2.5. StageMeta
Metadados estáticos de cada fase.

export type StageMeta = {
  id: StageId;
  phase_index: number;       // índice 1..16 do funil mínimo (ordem do FUNIL_MINIMO_CANONICO_V1)
  group: StageGroup;
  fasesCanonicas: string[];  // nomes humanos / referência nos docs de FASE_*
  writesBlock: WritesBlockId;// qual bloco de colunas do Supabase pode ser escrito
  gates?: StageGates;
};
2.6. StageSpec (runtime)
Configuração completa de cada stage para o motor.

export type MotorCtx = {
  text: string;        // texto que o cliente enviou
  st: EnovaState;      // snapshot atual do enova_state
};

export type MotorResult = {
  replyKey: string;    // chave para buscar a resposta em FUNIL_COPY_EXTRACT_V2
  patch: Partial<EnovaState>; // patch de colunas (antes do filtro de writes)
  nextStage: StageId | null;  // próximo stage (null = permanece)
};

export type StageSpec = StageMeta & {
  run: (ctx: MotorCtx) => MotorResult;
};
2.7. Engine do motor
Função única que recebe o texto do cliente e o estado atual, roda o stage correto e devolve:

replyKey → texto a ser usado na resposta (via COPY).

nextStage → próxima fase da conversa.

patch → mudanças no enova_state (filtradas depois).

export type FunilMotor = {
  STAGES: Record<StageId, StageSpec>;
  WRITES_CANONICOS: Record<WritesBlockId, (keyof EnovaState)[]>;
  runMotor: (text: string, st: EnovaState) => {
    replyKey: string;
    nextStage: StageId;
    patch: Partial<EnovaState>;
  };
};
3. WRITES_CANONICOS — colunas permitidas por bloco
Regra global
Só as colunas listadas aqui podem ser gravadas no Supabase para o respectivo bloco.

Qualquer chave usada internamente pelo motor que não esteja nesta lista é considerada campo transitório e deve ser removida do patch final antes do upsertState.

A fonte de verdade das colunas é schema/enova_state.columns.txt + SUPABASE_SCHEMA_MAPPING_V1.md.

3.1. Bloco entrada
Usado em: inicio, inicio_nome, inicio_estrangeiro.

Colunas permitidas:

WRITES_CANONICOS.entrada = [
  "fase_conversa",
  "funil_status",
  "intro_etapa",
  "nacionalidade",
  "estrangeiro_flag",
  "tem_rnm",
  "rnm_tipo",
  "rnm_validade",
  "last_user_text",
  "last_message_id",
  "last_processed_text",
];
3.2. Bloco estado_civil
Usado em: estado_civil.

Colunas permitidas:

WRITES_CANONICOS.estado_civil = [
  "estado_civil",
  "casamento_civil",
  "solteiro_sozinho",
  "composicao_pessoa",
  "coletas_casal",
  "financiamento_conjunto",
  "somar_renda",
  "parceiro_tem_renda",
  "nome_parceiro",
  "nome_parceiro_normalizado",
  "fase_conversa",
  "funil_status",
  "intro_etapa",
  "controle",
];
3.3. Bloco renda
Usado em: regime_trabalho, renda, composicao_renda.

Colunas permitidas:

WRITES_CANONICOS.renda = [
  "modo_renda",
  "renda_bruta",
  "renda_liquida",
  "renda_formal",
  "renda_informal",
  "renda_mista",
  "renda_extra",
  "renda_titular",
  "renda_parceiro",
  "renda_total_para_fluxo",
  "multi_renda_flag",
  "multi_renda_lista",
  "multi_regime_flag",
  "multi_regime_lista",
  "qtd_rendas_informadas",
  "ultima_renda_bruta_informada",
  "qtd_regimes_informados",
  "ultima_regime_informado",
  "perfil_financeiro",
  "ir_declarado",
  "ir_parceiro",
  "ir_declarado_parceiro",
  "fase_conversa",
  "funil_status",
  "intro_etapa",
  "controle",
];
3.4. Bloco dependente
Usado em: dependente.

WRITES_CANONICOS.dependente = [
  "fator_social",
  "fase_conversa",
  "funil_status",
  "intro_etapa",
  "controle",
];
3.5. Bloco ctps
Usado em: ctps_36.

WRITES_CANONICOS.ctps = [
  "ctps_36",
  "ctps_36_parceiro",
  "fase_conversa",
  "funil_status",
  "intro_etapa",
  "controle",
];
3.6. Bloco restricao
Usado em: restricao.

WRITES_CANONICOS.restricao = [
  "regularizacao_restricao",
  "fase_conversa",
  "funil_status",
  "intro_etapa",
  "controle",
];
Observação: campos como tem_restricao, tipo_restricao, tem_emprestimo_ou_financiamento, etc., podem existir no motor como campos transitórios (controle de fluxo), mas não são gravados diretamente em enova_state enquanto não houver alinhamento explícito de colunas.

3.7. Bloco docs
Usado em: docs_opcao, docs_nao_enviou, docs_enviou_correspondente.

WRITES_CANONICOS.docs = [
  "fase_docs",
  "funil_opcao_docs",
  "canal_envio_docs",
  "status_docs",
  "docs_status",
  "docs_status_texto",
  "docs_lista_enviada",
  "docs_itens_pendentes",
  "docs_itens_recebidos",
  "docs_completos",
  "docs_status_geral",
  "docs_validacao_atualizada",
  "ultima_interacao_docs",
  "processo_enviado_correspondente",
  "aguardando_retorno_correspondente",
  "dossie_resumo",
  "retorno_correspondente_bruto",
  "retorno_correspondente_status",
  "retorno_correspondente_motivo",
  "fase_conversa",
  "funil_status",
  "intro_etapa",
  "controle",
];
3.8. Bloco agendamento
Usado em: agendamento_visita.

WRITES_CANONICOS.agendamento = [
  "agendamento_id",
  "fase_conversa",
  "funil_status",
  "intro_etapa",
  "controle",
];
3.9. Bloco encerramento
Usado em: pos_venda_desligamento, fim_ineligivel.

WRITES_CANONICOS.encerramento = [
  "fase_conversa",
  "funil_status",
  "intro_etapa",
  "controle",
];
4. Catálogo de Stages (StageMeta)
Mapping canônico entre FUNIL MÍNIMO e os stages do motor.

export const FUNIL_V2_STAGES: Record<StageId, StageMeta> = {
  // 1. Início
  inicio: {
    id: "inicio",
    phase_index: 1,
    group: "entrada",
    fasesCanonicas: ["F0 – Início / boot / lead novo"],
    writesBlock: "entrada",
    gates: { allowsReentry: true },
  },

  // 2. Nome
  inicio_nome: {
    id: "inicio_nome",
    phase_index: 2,
    group: "entrada",
    fasesCanonicas: ["F0 – Coleta de nome"],
    writesBlock: "entrada",
  },

  // 3. Estrangeiro? / Nacionalidade
  inicio_estrangeiro: {
    id: "inicio_estrangeiro",
    phase_index: 3,
    group: "entrada",
    fasesCanonicas: ["F1 – Estrangeiro? / nacionalidade"],
    writesBlock: "entrada",
    gates: { branchPoint: true },
  },

  // 4. Estado civil
  estado_civil: {
    id: "estado_civil",
    phase_index: 4,
    group: "estado_civil",
    fasesCanonicas: ["FASE 2 – Estado civil / composição"],
    writesBlock: "estado_civil",
    gates: { branchPoint: true },
  },

  // 5. Regime de trabalho (multi ou não)
  regime_trabalho: {
    id: "regime_trabalho",
    phase_index: 5,
    group: "renda",
    fasesCanonicas: ["FASE 3 – Regime de trabalho (CLT / autônomo / aposentado)"],
    writesBlock: "renda",
  },

  // 6. Renda (única / multi / mista)
  renda: {
    id: "renda",
    phase_index: 6,
    group: "renda",
    fasesCanonicas: ["FASE 3 – Renda principal (única / multi / mista)"],
    writesBlock: "renda",
    gates: { branchPoint: true },
  },

  // 7. Composição de renda
  composicao_renda: {
    id: "composicao_renda",
    phase_index: 7,
    group: "renda",
    fasesCanonicas: ["FASE 3–7 – Composição de renda / faixa / perfil"],
    writesBlock: "renda",
  },

  // 8. Dependente
  dependente: {
    id: "dependente",
    phase_index: 8,
    group: "dependente",
    fasesCanonicas: ["FASE 4 – Dependentes / fator social"],
    writesBlock: "dependente",
  },

  // 9. 36 meses
  ctps_36: {
    id: "ctps_36",
    phase_index: 9,
    group: "ctps",
    fasesCanonicas: ["FASE 5 – 36 meses de carteira (titular / parceiro)"],
    writesBlock: "ctps",
  },

  // 10. Restrição
  restricao: {
    id: "restricao",
    phase_index: 10,
    group: "restricao",
    fasesCanonicas: ["FASE 6 – Restrição / empréstimos / dívidas relevantes"],
    writesBlock: "restricao",
    gates: { branchPoint: true },
  },

  // 11. DOCs (escolha de canal)
  docs_opcao: {
    id: "docs_opcao",
    phase_index: 11,
    group: "docs",
    fasesCanonicas: ["FASE 7–8 – DOCs (escolha de canal, enviar ou não)"],
    writesBlock: "docs",
    gates: { branchPoint: true },
  },

  // 12. Não quis enviar DOCs (vai levar no plantão)
  docs_nao_enviou: {
    id: "docs_nao_enviou",
    phase_index: 12,
    group: "docs",
    fasesCanonicas: ["FASE 12 – Não quis enviar DOCs (leva no plantão)"],
    writesBlock: "docs",
  },

  // 13. Enviou DOCs (fase Correspondente / pré-análise)
  docs_enviou_correspondente: {
    id: "docs_enviou_correspondente",
    phase_index: 13,
    group: "docs",
    fasesCanonicas: ["FASE 13 – Enviou DOCs / fase Correspondente"],
    writesBlock: "docs",
    gates: { branchPoint: true },
  },

  // 14. Agendamento de visita
  agendamento_visita: {
    id: "agendamento_visita",
    phase_index: 14,
    group: "agendamento",
    fasesCanonicas: ["FASE 14 – Agendamento de visita / plantão"],
    writesBlock: "agendamento",
    gates: { branchPoint: true },
  },

  // 15. Pós-venda / desligamento CEF
  pos_venda_desligamento: {
    id: "pos_venda_desligamento",
    phase_index: 15,
    group: "encerramento",
    fasesCanonicas: ["FASE 13A – Pós-venda / desligamento CEF"],
    writesBlock: "encerramento",
    gates: { terminal: true },
  },

  // 16. Encerramento por inelegibilidade
  fim_ineligivel: {
    id: "fim_ineligivel",
    phase_index: 16,
    group: "encerramento",
    fasesCanonicas: ["ENCERRAMENTO – Inelegível (RNM / renda / restrição)"],
    writesBlock: "encerramento",
    gates: { terminal: true },
  },
};
Regra de manutenção:

Para adicionar nova fase: adicionar novo StageId, novo item em FUNIL_V2_STAGES e atualizar o grafo FUNIL_V2 no código.

writesBlock nunca deve apontar para colunas fora dos blocos definidos em WRITES_CANONICOS.

5. Uso esperado pelo Codex (resumo)
Quando uma tarefa do Codex for mexer no funil dentro do Enova worker.js, o fluxo esperado é:

Diagnóstico (READ-ONLY)

Ler schema/CODEX_WORKFLOW.md.

Ler este arquivo (FUNIL_V2_MOTOR_SPEC_V1.md).

Ler FUNIL_MINIMO_CANONICO_V1.md, FUNIL_GRAPH_V1.md, FUNIL_GATES_AUDIT_V1.md, FUNIL_LINK_AUDIT_V1.md.

Confirmar entendimento de StageId, StageMeta, WRITES_CANONICOS e runMotor.

Implementação do motor

Criar/atualizar um módulo no Worker com:

FUNIL_V2_STAGES (igual ao StageMeta acima).

WRITES_CANONICOS exatamente como definido aqui.

runMotor(text, st) que:

Resolve o StageId atual a partir de st.fase_conversa (default "inicio").

Chama STAGES[stageId].run.

Filtra o patch: mantém apenas as chaves em WRITES_CANONICOS[writesBlock].

Garante que fase_conversa do patch final é sempre o nextStage.

Integração com /webhook/meta

No ponto em que hoje o Worker decide “qual resposta mandar” e “qual fase setar”, substituir pela chamada do runMotor.

Usar replyKey para buscar o texto em FUNIL_COPY_EXTRACT_V2.

Usar o patch filtrado para atualizar enova_state via helper padrão (sbFetch / upsertState).

Testes (simulate-funnel)

Implementar cenário de simulação de funil com múltiplos perfis, sem usar a Meta, garantindo que:

fase_conversa avança de acordo com FUNIL_V2_STAGES.

funil_status é setado corretamente nas fases terminais.

Nenhuma coluna fora de WRITES_CANONICOS é escrita no Supabase.

Este arquivo é o contrato oficial do motor de funil V2 dentro do Worker.
Qualquer alteração futura no funil deve atualizar primeiro este schema, depois o código.
