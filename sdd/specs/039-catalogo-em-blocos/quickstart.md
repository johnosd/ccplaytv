# Quickstart — 039 Catálogo em blocos

## Checagens automatizadas

```powershell
cd tv-web
npx vitest run src/lib/catalog/categoryBlocks.catalogo-em-blocos.contract.test.ts
cd ..; .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 039-catalogo-em-blocos
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 038-carga-listas-pre-carga
cd tv-web; npx tsc -b; npm run lint; npm run test; npm run build:tizen
npm run test:e2e        # com npm run dev rodando (reiniciado)
node e2e/paridade-limpeza.mjs   # SC-006: nenhuma diferença visual
```

Travas de outras features que leem/gravam itens e **precisam continuar
íntegras e verdes** (semeiam linhas antigas direto em `channels`):
017 (`catalogSearch.contract`), 025 (`history…contract`), 026
(`homeHero…contract`), 032/033/035 (`titleMetadata…contract`,
`localTitleMatch…contract`), 036 (`historyRemoval…`, `VodCatalogScreen…` —
estas duas ainda vermelhas, feature não executada: devem continuar
**compilando**), 038 (as 5).

## Cenários no navegador (painel falso — `e2e/catalogo-em-blocos.mjs`)

1. Lista nova: todas as categorias prontas; nenhum item gravado como linha
   (conferir no IndexedDB: `channels` só com episódios); abrir categoria,
   "Todos", busca, ★ Favoritos, ↺ Histórico, detalhe e tocar.
2. **Migração**: banco criado pelo build anterior (linhas) → abrir com este
   build → conversão em segundo plano; durante ela as categorias abrem;
   depois dela, favoritos/progresso/histórico continuam; `channels` só com
   episódios.
3. **~300 mil itens** (painel falso gerando a seção): carga termina, a página
   não quebra, heap medido (CDP `Performance.getMetrics`) registrado.

## Medição

- `node e2e/carga-listas-real.mjs` e o probe de seção (038) com a lista real,
  CPU 4×: tempo até tudo pronto, abrir a categoria de 11 mil filmes, "Todos"
  de Filmes. Registrar em `plan.md` (R-002).

## Gate na TV física (SC-007 — obrigatório)

| Cenário | Aprovado se |
| --- | --- |
| SC-001 | OK → itens visíveis ≤ 300 ms em 10 categorias prontas, incluindo a de 11 mil filmes |
| SC-002 | ressincronizar e ficar parado: tudo pronto em ≤ 60 s |
| SC-003 | "Todos" de Filmes em ≤ 1 s |
| SC-004 | lista de ~300 mil itens (painel falso na LAN) carrega sem o app fechar |
| SC-005 | atualizar a partir do build anterior: favoritos, retomada, "assistido" e histórico intactos |
| SC-006 | telas iguais às de antes (visual) |
