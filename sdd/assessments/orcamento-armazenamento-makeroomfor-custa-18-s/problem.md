# Assessment Problem: Orçamento de armazenamento custa ~1,8 s por chamada no app real

- **Slug**: orcamento-armazenamento-makeroomfor-custa-18-s
- **Criado**: 2026-10-20
- **Explora**: não rodada (a evidência vem das medições da 085 e da 082, citadas abaixo)

## Problem Statement

Cada chamada de `makeRoomFor` (orçamento de armazenamento da 082) custa ~1,4–1,8 s no app real da TV com a lista real, contra ~29 ms na sonda
com o mesmo código. A carga por seção de filmes leva 10,5–11,7 s na lista real, acima dos 8,8 s da sonda e dos 10 s da meta.

## Usuários / Partes Afetadas

- A pessoa que abre o app, atualiza ou ressincroniza a lista real: a pré-carga demora e disputa o processador da TV enquanto ela navega.
- Qualquer gravador que chama `makeRoomFor` (carga por categoria, entrada numa categoria, séries, guia): todos pagam esse custo por chamada.

## Evidência medida (sem suposição)

| Medição | Orçamento por chamada | Origem |
| --- | --- | --- |
| Sonda, TV, banco novo (35 categorias, 43 510 filmes) | ~29 ms (1 016–1 019 ms em 35 chamadas) | `085/evidencias/tv-sonda-2026-10-20.md` |
| App real, TV, lista real, filmes | 3 665–3 672 ms em 2 chamadas (~1,8 s) | `085/evidencias/tv-app-real-2026-10-20.md` e `app-metricas.jsonl` |
| App real, séries | 1 719 ms em 1 chamada | idem |
| App real, 2ª rodada (blocos iguais, 0 chamadas) | `encodeMs` de filmes 5 328 ms | `082/evidencias/app-metricas-tv-2026-10-20.jsonl` |

O que **não** se sabe: qual parte de `makeRoomFor` pesa no app real. As etapas candidatas são `catalogLedger` (`categories.toArray`, `catalogReadManifests.toArray`,
contagens de guia, episódios e metadados por lista), `readStorageEstimate()` (`navigator.storage.estimate`) e `releaseCandidates`. O banco real tem coisas que o da sonda não tem
(outras listas, episódios, metadados TMDB, guia, estado da pessoa).

## Goals

- Saber, com número do app real, **qual etapa** do orçamento custa ~1,8 s por chamada.
- Reduzir o orçamento por chamada no app real a um custo que não domine a carga (meta de partida: ≤ 200 ms por chamada).
- Manter o teto da 082 e a regra "todo gravador chama `makeRoomFor`" intactos.

## Non-Goals

- Mudar o teto, a reserva ou a política de liberação da 082.
- Reabrir a "conta guardada entre chamadas" (D-001 da 085) **antes** de ter o número por etapa.
- Otimizar leitura da rede ou a compressão (`encodeMs`), que são outras frentes.

## Success Metrics

- Existe medição por etapa de `makeRoomFor` no app real (canal de métricas), em pelo menos 2 chamadas.
- `budgetMs` por chamada no app real ≤ 200 ms (hoje ~1 800 ms), em ≥ 2 cargas da lista real.
- Carga de filmes na lista real ≤ 10 s em todas as rodadas (hoje 10,5–11,7 s), sem regressão em séries e canais.
- Contratos da 082 e da 085 seguem verdes; SC-003 da 082 (teto simulado) segue passando.

## Cost of Inaction

A carga de filmes continua passando de 10 s no app real, e cada gravação ou entrada em categoria paga ~1,8 s de leitura do IndexedDB que não entrega nada novo.
A TV de referência é lenta, então isso compete com a navegação durante a pré-carga. Não é uma falha de correção, é custo de uso: prioridade média.
