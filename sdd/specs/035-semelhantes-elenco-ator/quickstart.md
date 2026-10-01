# Quickstart — 035 Semelhantes, fotos do elenco e página de ator

## Pré-requisitos

- `tv-web/` com dependências instaladas; `npm run dev` rodando (porta 5173)
  para os scripts E2E.
- Uma chave TMDB para os cenários com TMDB real: `CCPLAY_PROBE_TMDB_KEY` no
  `.env` da raiz (nunca impressa; os scripts `-real` imprimem só contagens).
- Lista real com credenciais `CCPLAY_PROBE_*` no `.env` (mesma regra).

## Checagens automatizadas

```powershell
cd tv-web
npx vitest run src/lib/metadata/localTitleMatch.semelhantes.contract.test.ts src/lib/metadata/titleMetadata.semelhantes.contract.test.ts src/lib/metadata/tmdbPeople.semelhantes.contract.test.ts src/features/movies/MovieDetailScreen.semelhantes.contract.test.tsx
cd ..; .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 035-semelhantes-elenco-ator
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 032-metadata-tmdb-integracoes
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 033-trailers-filmes-series
cd tv-web
npx tsc -b; npm run lint; npm run test; npm run build:tizen
node e2e/semelhantes-elenco-ator.mjs      # com npm run dev rodando
npm run test:e2e
```

## Cenários ponta a ponta (navegador, `e2e/semelhantes-elenco-ator.mjs`, TMDB falso)

1. **Semelhantes com chave** — abrir um filme casado, aba Semelhantes:
   encontrados primeiro, chip "Não encontrado na sua lista" nos demais,
   "Procurado em X de Y categorias de filmes". OK num encontrado abre o
   detalhe; RETURN volta à aba e ao cartão.
2. **Resumo** — OK num não encontrado: modal com pôster, ano, sinopse, sem
   assistir; RETURN fecha e o foco fica no cartão.
3. **Sem chave** — aba mostra "Configurar TMDB"; OK abre Configurações ›
   Integrações & BYOK; RETURN volta ao detalhe na aba Semelhantes.
4. **Sem casamento / sem semelhantes / TMDB fora (500)** — mensagem própria,
   foco na aba (SC-004, 5 de 5 com o erro da página de ator).
5. **Elenco com foto** — pessoas com foto/nome/personagem; uma sem foto mostra
   marcador neutro; título sem casamento mostra o texto da 032.
6. **Página de ator** — OK numa pessoa: foto, nome, rails "Na sua lista" e
   "Fora da sua lista", cobertura; OK num encontrado abre o detalhe; RETURN
   volta ao ator no mesmo título; RETURN volta ao detalhe na aba Elenco e na
   mesma pessoa. Com o TMDB falso respondendo 500: "Tentar de novo"/"Voltar".
7. **SC-001/SC-005 (contagem de requisições)** — contar requisições ao
   TMDB falso e ao painel falso: abrir o detalhe faz exatamente as da
   032/033 (uma ao detalhe do TMDB); entrar na aba Semelhantes, percorrer
   cartões, pessoas e abas faz **zero** a mais; só o OK numa pessoa faz uma
   (`/person/{id}`), e reabrir a mesma pessoa faz zero.
8. **SC-003** — 10 sequências detalhe → semelhante → detalhe → ator →
   detalhe; 4 RETURN cada, conferindo aba e foco no detalhe de origem.
9. **Remover a chave** com um detalhe aberto → reabrir: aba "Configurar
   TMDB", Elenco em texto, página de ator indisponível.

## Medição com a lista real (`e2e/semelhantes-real.mjs`, fora do `test:e2e`)

- **SC-002**: ≥ 50 títulos da lista real com a chave TMDB; para cada cartão
  "encontrado", conferir que o registro local aberto tem o mesmo `tmdbId`
  (identidade guardada) ou o mesmo título comparável + ano ±1 do cartão.
  Esperado: 0 casamentos errados. Imprime só contagens.
- Tempo da resolução local (R-003) numa fonte com várias categorias abertas:
  imprimir p50/p95 em ms.

## Pre-acceptance (constitution)

- [ ] Nenhuma chave/URL com chave em tela, `aria-*`, log, erro (FR-022) —
  grep de `console.` nos arquivos novos = 0.
- [ ] Todo estado novo com elemento focável e ativável por OK.
- [ ] `findUnnamedControls` sem achados no painel de Semelhantes, no de
  Elenco com foto, no resumo e na página de ator.
- [ ] Atribuição "Dados: TMDB" visível onde há dado do TMDB (FR-023).
- [ ] `tizen_web_project.yaml` sem arquivo emitido faltando (`build:tizen`).

## TV física (recomendado, não é gate)

Fotos/pôsteres do `image.tmdb.org` carregando no WebView; fluidez dos rails
com 20 cartões; tempo da resolução local numa lista grande; RETURN em cadeia
longa.
