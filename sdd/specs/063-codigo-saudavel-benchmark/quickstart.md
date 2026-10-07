# Quickstart: 063-codigo-saudavel-benchmark

## Pré-requisitos

- Em `tv-web/`: `npm install` feito e Chromium do Playwright instalado (o mesmo dos
  E2E).
- Nenhuma fonte real nem `.env`: tudo aqui usa dados fictícios.

## 1. Checagens automatizadas

```powershell
cd tv-web
npx vitest run src/lib/catalog/catalogRepository.codigo-saudavel.contract.test.ts scripts/architecture.codigo-saudavel.contract.test.mjs scripts/bench/fixtures.codigo-saudavel.contract.test.mjs
npx tsc -b
npm run lint          # oxlint + architecture.mjs
npm run test
npm run build         # e conferir que dist/ não tem bench.html nem nada de src/bench
cd ..
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 063-codigo-saudavel-benchmark
```

Repita o `check-contract-tests.ps1` para cada feature listada em `handoff.md` →
"travas de outras features".

## 2. US1: a divisão não mudou nada

1. `git diff --stat` da fase toca só `tv-web/src/lib/catalog/catalogRepository.ts` e
   `tv-web/src/lib/catalog/repository/*`.
2. Com `npm run dev` rodando, `npm run test:e2e` passa.
3. No navegador (`npm run dev`), cadastre a lista fictícia de um E2E (ex.: o painel
   de `e2e/catalogo-em-blocos.mjs`) ou uma lista própria. Abra Live TV, Filmes e
   Séries, entre numa categoria, abra "Todos", favorite um item, toque e volte.
   Tudo deve se comportar como antes.

## 3. US2: a catraca pega o que é novo (SC-004)

Num ramo descartável, faça uma alteração por vez. Para cada uma, `npm run lint`
tem de **falhar** com a linha `architecture: <regra> …` correspondente. Desfaça
antes da próxima.

| Alteração | Regra esperada |
| --- | --- |
| Em `src/features/live/LiveScreen.tsx`, `import { SearchScreen } from '../search/SearchScreen'` | `feature-to-feature` |
| Em `src/lib/catalog/history.ts`, `import { PlayerLayer } from '../../components/PlayerLayer'` | `lib-to-ui` |
| Em `src/components/Stage.tsx`, `import { HomeContent } from '../features/home/HomeContent'` | `components-to-features` |
| Em `src/lib/catalog/freshness.ts`, `import { isPastEnd } from '../player/resumePolicy'` | `catalog-to-player` |
| Criar `src/lib/novo.ts` com 301 linhas | `max-lines` (limite 300) |
| Acrescentar 1 linha a `src/features/catalog/catalogApi.ts` | `max-lines` (teto herdado) |

Depois apague uma linha de um arquivo da lista de teto e rode `npm run lint`: ele
passa, com um aviso de exceção obsoleta. `node scripts/architecture.mjs --prune`
baixa o teto, e `node scripts/architecture.mjs --write-baseline` recusa porque a
lista já existe.

## 4. US3: benchmark

```powershell
cd tv-web
npm run dev                                                          # outro terminal
node scripts/bench/run-import-bench.mjs --sizes 1000,10000          # rápido
npm run bench:import                                                 # completo (1k/10k/100k)
```

No PowerShell, `npm run bench:import -- --sizes …` perde o `--` (o shim do npm é um script):
chame o `node scripts/bench/run-import-bench.mjs …` direto, como acima, ou use o Bash.

Confira:

- um arquivo novo em `tv-web/bench-results/` com 9 combinações (ou as pedidas),
  todas `countsMatch: true`, etapas preenchidas (`classifyMs: null` só no XMLTV)
  e `storage` com número ou `"não informado"`;
- nenhuma URL, hostname ou nome de usuário no arquivo;
- rodar de novo imprime a variação por etapa contra o anterior do mesmo aparelho e
  sai com `0`;
- `npm run test:e2e` não roda o benchmark.

### TV física (opcional, não é gate)

```powershell
npm run dev -- --host
node scripts/bench/run-import-bench.mjs --serve-only --device tv-qn50q60d --sizes 1000,10000
```

Abra na TV a URL que o runner imprimir e espere o "enviado". O arquivo em
`bench-results/` deve ter `device.slug = tv-qn50q60d` e `runtime: 'tv-browser'`.

## 5. Itens transversais da constitution

- Segredos: nenhuma credencial real, `.env` nem URL de painel em fixture, resultado,
  log ou commit.
- Documentação canônica: `CLAUDE.md` → "Commands" cita `npm run lint` com a catraca
  e `npm run bench:import`.
- Nenhuma mudança visível no app. O passo 2.3 basta como verificação manual em
  navegador.
