# Bug Fix: EPG "vinculado, recente" mas guia e "Agora" vazios

- **Slug**: epg-vinculado-recente-mas-guia-vazio
- **Corrigido**: 2026-10-15
- **Assessment**: ./assessment.md
- **Status**: not-applied

## Summary

Nenhum código foi alterado. Depois do Assess, o usuário informou (2026-10-15) que
a TV física está mostrando o EPG normalmente e decidiu encerrar o bug sem aplicar a
remediação proposta.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| — | — | Nada alterado, por decisão do usuário. |

## Tests Added or Updated

- Nenhum.

## Local Verification

- Comandos rodados: nenhum nesta fase (as sondas da lista real rodaram no Assess, ver `assessment.md` › Reproduction).
- Checagens manuais: observação do usuário na TV física — guia e "Agora" aparecem.

## Deviations from Assessment

A remediação preferida do `assessment.md` (zero programas não conta como sucesso;
contagens de programas e canais gravadas e mostradas em Configurações › EPG) **não
foi aplicada**. O motivo é a decisão do usuário: o sintoma não aparece mais na TV.
Não houve evidência nova contra o diagnóstico.

## Follow-ups

- O defeito confirmado no código continua lá: `syncEpg` registra sucesso com
  `programCount: 0`, e `writeEpgPrograms` publica uma geração vazia apagando a
  anterior (`assessment.md` › Suspected Code Paths). Se o guia vazio voltar com
  "vinculado, recente", começar por aqui, reabrindo com evidência nova.
