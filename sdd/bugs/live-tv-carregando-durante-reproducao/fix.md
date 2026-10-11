# Bug Fix: Live TV carregando durante reprodução

- **Slug**: live-tv-carregando-durante-reproducao
- **Corrigido**: 2026-10-11
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

AVPlay confirma playing por dois tempos válidos crescentes quando bufferingcomplete não chega. Sucesso de prepareAsync preserva playing recebido anteriormente. Estado local impede callbacks tardios de recuperarem erro/conclusão/fechamento.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/lib/player/avplayAdapter.ts` | modified | Correção focada |
| `tv-web/src/lib/player/avplayAdapter.test.ts` | modified | Regressão reproduzível |
| `tv-web/src/components/PlayerLayer.avplay-loading.test.tsx` | added | Regressão reproduzível |

## Tests Added or Updated

Tempo crescente remove aviso na interface real do PlayerLayer com sessão/adaptador reais e motor simulado; novo buffering; tempo parado/inválido; pausa; erro/fechamento; ordem bufferingcomplete antes do sucesso de prepare.

## Local Verification

Reprodução antes do patch: 4 falhas / 40 casos (Live: 2; trailer: 2). Após patch, arquivos dos bugs: 42/42 passam. TypeScript -b: exit 0. Oxlint: exit 0, 76 avisos na árvore atual. Suite ampliada, catraca de arquitetura, build e E2E em andamento; resultado final em test.md.

## Deviations from Assessment

Nenhum.

## Follow-ups

Confirmar na TV física com canal real e troca de canais/rebuffering. Não houve deploy, commit ou alteração dos dados locais. Ponto de commit sugerido após validação: fix(player): recuperar estado de reproducao do AVPlay.

## Complemento da fase Fix

Catraca max-lines detectou 627 > 593 no adaptador. Retorno à fase Fix: comentários introdutórios de preparação/plano de hardware, capacidades e duração foram resumidos, preservando as regras. Arquivos permanecem dentro do assessment; nenhum teto ou baseline foi alterado. Nova fase Test reroda catraca e regressões.
