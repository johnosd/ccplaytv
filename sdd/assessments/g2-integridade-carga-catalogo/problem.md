# Assessment Problem: G2 — Integridade da carga e do catálogo

- **Slug**: g2-integridade-carga-catalogo
- **Criado**: 2026-10-06
- **Explora**: ./explora.md

## Problem Statement

O pacote supõe que o catálogo no aparelho perde integridade em cinco pontos: importação duplicada da mesma lista, itens sem tipo invisíveis, estado do usuário perdido após resync, busca global lenta em listas enormes e falta de política quando o espaço acaba. Nenhum desses pontos foi observado pelo usuário nem medido com a lista real.

## Usuários / Partes Afetadas

- Pessoa com lista Xtream (o caso real do usuário) — não é afetada por 26 nem por 24; 36, 66 e 51 nunca apareceram para ela.
- Pessoa com lista M3U avulsa de URLs fora do padrão — seria afetada pelo 26 (itens descartados), hoje só com aviso e contagem. ASSUMPTION: não há usuário conhecido nessa situação.
- Pessoa com lista de ~300 mil itens ou TV com pouca quota — seria afetada por 66 e 51. ASSUMPTION: nenhum caso conhecido.

## Goals

- Decidir, item a item, se há dor real que justifique uma spec agora.
- Não construir defesa para um problema que nunca aconteceu.

## Non-Goals

- Busca global: o usuário não a quer; a busca por Filmes e por Séries é o modelo desejado.
- Refatoração do `catalogRepository.ts` (item 49a-2, pacote G5).
- Benchmark de importação (item 35, pacote G5), que é quem forneceria a medição para reabrir o 51.

## Success Metrics

- Para reabrir qualquer item, uma destas evidências: reprodução de importação duplicada (36); uma lista M3U real com o aviso de entradas descartadas que o usuário queira ver (26); perda de favorito, progresso ou histórico após resync (24); o aviso "A lista não coube inteira no aparelho" numa lista real ou a quota da TV medida (51).

## Cost of Inaction

Baixo. A dedup por fonte já existe, a chave estável já protege o estado do usuário, a lista real coube inteira no aparelho e o descarte de M3U já é declarado com aviso e contagem. Não fazer nada mantém o comportamento atual, que não gerou nenhuma queixa.
