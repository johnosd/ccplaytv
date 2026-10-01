# Quickstart — 038 Carga de listas e pré-carga

## Pré-requisitos

- `tv-web/`: `npm install` feito; `npm run dev` rodando para E2E.
- `.env` na raiz com `CCPLAY_PROBE_*` (lista real) para os roteiros `*-real.mjs`
  — nunca imprimir valores; os roteiros imprimem só números.
- TV de referência (QN50Q60DAGXZD) na rede para o gate SC-008 (`tizen-tv`).

## Checagens automatizadas

```powershell
cd tv-web
npx vitest run src/lib/catalog/prefetch/prefetchOrder.carga-listas.contract.test.ts src/lib/catalog/prefetch/prefetchScheduler.carga-listas.contract.test.ts src/lib/catalog/structureDiff.carga-listas.contract.test.ts src/lib/catalog/catalogRepository.carga-listas.contract.test.ts src/lib/catalog/categoryLoader.carga-listas.contract.test.ts
cd ..; .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 038-carga-listas-pre-carga
cd tv-web; npm run test; npm run lint; npm run build; npm run build:tizen
npm run test:e2e        # com npm run dev rodando; inclui e2e/carga-listas.mjs
```

Travas de outras features que esta toca (todas devem continuar íntegras):
`020`, `027`, `029`, `031` (PlayerLayer), `033` (TrailerLayer), `024`/`030`/
`031`/`018` (LiveScreen), `026` (HomeScreen/homeHero/globalSearch), `036`
(VodCatalogScreen), `034` (importPipeline — ainda vermelha, não executada:
tem de continuar **compilando** e sem ser editada).

## Cenários ponta a ponta (navegador — `e2e/carga-listas.mjs`, painel falso)

1. **Tela de importação por parte**: incluir lista Xtream falsa com 3 seções
   (séries vazia) → linhas Canais/Filmes "Pronto — N categorias", Séries "Não
   disponível nesta lista", Guia "Carregando" → "Pronto"; "Abrir lista" com
   foco; nenhum `%` na tela.
2. **Guia falha**: XMLTV falso responde 500 → Guia "Falhou" com mensagem
   `EPG-02`; "Abrir lista" disponível e com foco.
3. **Pré-carga**: abrir a lista, ficar parado no Início → contador de pedidos
   ao painel sobe uma categoria por vez; linha "Preparando catálogo — N de M";
   entrar numa categoria já pronta → nenhum pedido novo, grade sem
   "carregando"; contagem aparece no trilho.
4. **Cede à navegação**: com pré-carga rodando, apertar setas por 5 s → nenhum
   pedido novo de categoria começa nesse intervalo (instrumentar o servidor
   falso com horário de cada pedido).
5. **Player pausa**: abrir um canal → nenhum pedido novo de categoria enquanto
   tocar; fechar → volta.
6. **Atualização sem esfriar**: com categorias prontas, "Ressincronizar" → ao
   terminar, entrar numa categoria já pronta abre na hora (sem "carregando");
   o painel falso muda um item de nome → a renovação em segundo plano troca o
   nome sem mover o foco; categoria removida no painel falso some do trilho.
7. **M3U guardada**: mesma verificação de (6) com uma lista M3U falsa.
8. **Vencida (> 24 h)**: adiantar o relógio do navegador (`page.clock`) →
   entrar abre na hora e um pedido de renovação acontece depois.

## Medição (FR-012/SC-005) — `e2e/carga-listas-real.mjs` + TV

- PC: 3 categorias por seção × 3 repetições, tempos por fase (ms), sem URL.
- TV: mesmas categorias, instrumentação `ccplaytv:perf` ligada.
- Registrar a tabela em `research.md` R0-1 e `plan.md` R-001.

## Gate na TV física (SC-008 — obrigatório)

| Cenário | Aprovado se |
| --- | --- |
| SC-001 | OK → itens visíveis ≤ 300 ms em 10 categorias pré-carregadas (3 seções) |
| SC-003 | p95 tecla→foco no trilho e na grade com pré-carga rodando dentro de ±20 % da medição com ela parada (segurar ↓ 10 s, as duas situações) |
| SC-004 | nenhum início de categoria com canal/filme tocando por 5 min (log de tempos) |
| SC-005 | primeira entrada fria ≤ 3 s em rede boa, ou excedente atribuído ao painel com números |
| SC-002 | % de categorias prontas após o prazo fixado na Fase 2, lista real, app ocioso |
| SC-006 | depois de "Ressincronizar", 10 categorias que estavam prontas abrem sem "carregando" |

Checklist cross-cutting (constitution): foco visível em todo estado da tela de
importação; nenhuma URL/credencial em log (`sdb dlog` filtrado por `http`);
nenhum percentual; RETURN em cada tela nova/alterada volta sem beco.
