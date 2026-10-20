# Ensaio do teste `foco083` no PC (T005) — 2026-10-19

**Classificação: diagnóstico.** Chromium no PC (Playwright, origem única `http://127.0.0.1`, viewport 1920×1080). Não aprova
SC-001/SC-002 (D-005): só prova que o teste roda de ponta a ponta e que cada candidata pinta o que deveria.

## O que foi ensaiado

- Teste `foco083` de `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/app2/tests.js`, selecionado como `PROBE_ONLY`.
- Grade 7×20 com capas sintéticas, 3 s por classe, sem rolagem; rolagem 3 s para `f-app` e `f-c1`.

## Resultado

Todas as classes — `f-full`, `f-app`, `f-c1`..`f-c4`, e as duas rolagens — deram **60 fps, pior quadro 17 ms, 0 quadros > 50 ms**.
O PC não distingue as candidatas; quem decide é a TV (Fase 5).

## Conferência visual (`navegador-sonda-candidatas.png`)

| Classe | Estado final do foco | Transição |
| --- | --- | --- |
| `f-app` | contorno 4 px + halo 8 px + brilho 40 px (tokens do app) | `transform`, `box-shadow` |
| `f-c1` | idêntico ao `f-app` | só `transform` |
| `f-c2` | idêntico, pintado num `::after` | só `opacity` |
| `f-c3` | halo no `::after` + brilho por degradê radial no `::before` (mais largo e suave que o desfoque de 40 px) | só `opacity` |
| `f-c4` | contorno + halo, sem brilho | só `transform` |

## Defeito encontrado e corrigido no ensaio

A regra de repouso `.grid.m-f-c2 .card::after` (opacity 0) tinha mais especificidade que `.card.f-c2::after` (opacity 1), e o
brilho de C2/C3 nunca acendia. Corrigido com `.grid.m-f-c2 .card.f-c2::after` e equivalente para C3; reconferido por
`getComputedStyle` e captura.
