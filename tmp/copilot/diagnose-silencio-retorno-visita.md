# Diagnóstico read-only — silêncio no retorno ao cliente após APROVADO

Esta branch existe apenas para abrir a PR de diagnóstico read-only do incidente pós-PR #290.

Não implementar patch nesta branch sem diagnóstico fechado primeiro.

Contexto resumido:
- retorno do correspondente com case_ref + STATUS: APROVADO voltou a ser reconhecido;
- logs indicam dispatch_target=visita e next_stage=agendamento_visita;
- sintoma observado: silêncio no retorno ao cliente.
