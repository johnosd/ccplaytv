# Bug Fix: Trailer: foco horizontal

- **Slug**: trailer-setas-horizontais-avancam-video-vez
- **Corrigido**: 2026-10-11
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

←/→ selecionam Pausar/Continuar e Minha Lista, respeitando bordas, sem seek. ↑/↓ mantêm compatibilidade anterior. SELECT ativa o botão, RETURN fecha; dica traduzida pt/en/es acompanha a regra atual.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/components/TrailerLayer.tsx` | modified | Correção focada |
| `tv-web/src/components/TrailerLayer.test.tsx` | modified | Regressão reproduzível |
| `tv-web/src/lib/i18n/messages/playerUi.ts` | modified | Dica pt/en/es |
| `tv-web/e2e/trailers.mjs` | modified | Correção focada |

## Tests Added or Updated

Regressão sem Minha Lista; navegação horizontal com Minha Lista e limites; pending impede escrita; SELECT/RETURN; E2E substitui asserções antigas de seek pelas de foco sem alterar vídeo.

## Local Verification

Reprodução antes do patch: 4 falhas / 40 casos (Live: 2; trailer: 2). Após patch, arquivos dos bugs: 42/42 passam. TypeScript -b: exit 0. Oxlint: exit 0, 76 avisos na árvore atual. Suite ampliada, catraca de arquitetura, build e E2E em andamento; resultado final em test.md.

## Deviations from Assessment

Nenhum.

## Follow-ups

Confirmar na TV física com canal real e controle remoto durante trailer de filme. Não houve deploy, commit ou alteração dos dados locais. Ponto de commit sugerido após validação: fix(trailer): navegar entre botoes com setas horizontais.
