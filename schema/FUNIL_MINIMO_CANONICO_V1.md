# FUNIL MÍNIMO CANÔNICO V1

## Fases (ordem)
1. **Início**
2. **Nome**
3. **Estrangeiro?**
   - Perguntar nacionalidade.
   - Observação obrigatória: se for casado(a) ou tiver parceiro(a), perguntar também a nacionalidade do(a) parceiro(a).
4. **Estado civil**
5. **Regime de trabalho (multi ou não)**
   - Opções: CLT, servidor, autônomo, aposentado.
   - Sem segmentação rural/urbana nesta versão.
6. **Renda (única / multi / mista)**
7. **Composição de renda (quando e como) + amarras de interruptores**
8. **Dependente**
   - Se processo em conjunto, pular esta etapa.
9. **36 meses**
   - Se processo em conjunto e p1 não tiver 36 meses, perguntar p2.
10. **Restrição**
11. **DOCs**
12. **Não quis enviar DOCs**
   - Agenda visita para trazer documentação no plantão.
13. **Enviou DOCs**
   - Segue para fase **Correspondente**.
14. **Aprovou financiamento**
   - Segue para fase **Agendamento de visita**.

## Regras
- **IR obrigatório para autônomo/MEI**: MEI enquadra como autônomo PF; IR PJ não vale para MCMV. Se não declarou IR, sugerir comprovação de renda com outra pessoa.
- Se autônomo não declarou IR, mas o processo **já estiver definido como conjunto** na fase anterior, o fluxo segue normalmente.
- O bloqueio ocorre no caso de **autônomo sozinho**, sem composição de renda e sem IR declarado.
- Para renda **menor que 3000**, sugerir composição de renda.
- **Renda mista**: aplicar limite CEF de **2550** para a parte informal.
  - Exemplo curto: renda formal 2.000 + informal 3.000 ⇒ considerar no máximo 2.550 da parte informal.
- **Idade**: a partir de 43 anos impacta prazo/valor; limite máximo de 67 anos.
- Sem **RNM com validade indeterminada**: não aprova (não se enquadra).

## Gaps atuais vs runtime
Itens abaixo podem ainda não existir no runtime (Worker) e ficam como backlog de implementação:
- Pergunta estruturada de estrangeiro/nacionalidade para titular e parceiro(a).
- Cobertura completa de renda para aposentado dentro do funil mínimo.
- Amarras completas entre DOCs, fase Correspondente e fase Agendamento de visita.
- Regras automáticas de composição por renda < 3000 em todos os caminhos do funil.
- Validação explícita de limite da renda informal (renda mista) com teto CEF 2550.
- Tratamento de 36 meses com fallback de p1 para p2 em processo conjunto.
- Regras de RNM com validade indeterminada aplicadas com bloqueio padronizado em todas as entradas.
