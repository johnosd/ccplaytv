# Implementation Plan: Nota, gênero e fundo vindos da listagem Xtream

**Slug**: `055-campos-da-listagem-xtream` | **Date**: 2026-10-03 | **Spec**: `sdd/specs/055-campos-da-listagem-xtream/spec.md`

**Origem**: `sdd/assessments/aproveitar-campos-lista-xtream-hoje-descartados/` (veredito `go`, escopo reduzido).

## Summary

A listagem Xtream (`get_vod_streams`, `get_series`) já entrega `rating` (filmes e séries) e, nas séries, `genre` e
`backdrop_path`; a importação os descarta. Esta feature os captura na mesma passada da importação (zero requisição
nova), guarda-os no registro do título (e portanto no bloco da categoria, feature 039) e os exibe: selo ★ no card,
nota com origem "Provedor" no destaque e no detalhe, e — nas séries — gênero e fundo no destaque. Nota inválida
(ausente, 0, não numérica, fora de 0–10) é "sem nota" e não aparece. Nada novo é perguntado ao provedor ou ao TMDB.

Abordagem técnica: três campos opcionais de valor (sem índice, sem bump do Dexie) em `CatalogRecord`, normalizados
em `classifier.ts`, mapeados em `xtreamConnector.ts`, copiados pelos dois gravadores (`categoryLoader.toItemRecord`,
`importPipeline.toStoredRecord`), incluídos na assinatura do bloco **só quando existem**, expostos por
`catalogApi.itemOut` e consumidos por um componente de apresentação `RatingBadge`. Detalhes em
`logic/campos-da-listagem.md`.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 (`tv-web/`), Vite, alvo `chrome108` (piso seguro; TV medida em Chromium 120).

**Primary Dependencies**: Dexie (IndexedDB), `@tanstack/react-query`, `@tanstack/react-virtual`; i18n próprio (`lib/i18n`). Nenhuma dependência nova.

**Storage**: IndexedDB via Dexie — campos de valor em `CatalogRecord`/`BlockItem`; **sem novo índice e sem bump de versão** (mesmo padrão de `iconUrl`/`year`). Medido no painel real: ≈279 KB (nota dos filmes) e ≈1 MB (nota+gênero+fundo das séries) serializados.

**Testing**: Vitest (projetos `dom` para `*.test.tsx`, `node` para `*.test.ts`); E2E Playwright (`npm run test:e2e`, `tv-web/e2e/run.mjs`).

**Target Platform**: Samsung Tizen 9 (Chromium 120, origin `file://`); dev em navegador.

**Performance Goals**: importar e entrar numa categoria grande sem aumento perceptível (< 10%, SC-004); acréscimo de armazenamento < 1,5 MB na lista real (SC-003).

**Constraints**: client-first (ADR-008); nenhuma requisição extra ao provedor ou ao TMDB (FR-013); selo não focável (FR-009); só tokens do V14, sem cor/raio/espaçamento fixos; nenhum arquivo novo emitido pelo build (nada a listar em `tizen_web_project.yaml`).

**Scale/Scope**: ≈43 mil filmes, ≈9,7 mil séries por lista real; ~20 arquivos de código tocados, 0 novos além de `RatingBadge`.

## Decisões Invariantes

- **D-001** Campos: `providerRating?: number` (0 < n ≤ 10, uma casa), `providerGenres?: string`, `providerBackdropUrl?: string` em `CatalogRecord` (+ `ClassifiedEntry`). Nomes com prefixo `provider` porque a origem importa (rótulo "Provedor", futura nota TMDB). Na API de telas: `provider_rating`, `provider_genres`, `provider_backdrop_url` (`CatalogItemOut`, opcionais, `null` = ausente).
- **D-002** A chave só existe no objeto quando há valor (nunca `undefined` explícito) em `mapVodEntry`/`mapSeriesEntry`/`toItemRecord`/`toStoredRecord` — 43 mil itens não ganham chaves vazias (padrão da 044).
- **D-003** `providerRating` vale para filme e série; `providerGenres` e `providerBackdropUrl` **só para série**. Filme não os lê da listagem.
- **D-004** Normalização única em `classifier.ts` (`normalizeProviderRating`, `normalizeProviderGenres`, `firstBackdropUrl`). Vírgula decimal é inválida (o painel manda ponto). `rating_5based` nunca é lido.
- **D-005** Os três campos entram em `itemsSignature` **somente quando algum existe no item**, depois dos campos da 044; sem isso uma lista já importada nunca gravaria a nota (assinatura idêntica ⇒ `writeBlockWithin` não regrava).
- **D-006** Sem migração forçada, sem mudança em `freshness.ts` e sem reimportação: os campos chegam no refresh normal da categoria (24 h) e no prefetch. Lista antiga sem os campos funciona exatamente como antes.
- **D-007** Precedência: a listagem é o valor imediato do card e do destaque; o detalhe segue lendo `useTitleMetadata` (provedor `get_*_info` → TMDB) e **não é alterado** para gênero/fundo. A única novidade do detalhe é a linha de nota.
- **D-008** Apresentação num único componente `components/RatingBadge.tsx` (card: `★ 7,4`; `showSource`: `★ 7,4 Provedor`). Sem `tabindex`, sem `button`. O texto de origem nunca diz IMDb/TMDB. Rótulo no i18n (`components.ts`, chave `rating.provider`, pt/en/es), sem área nova.
- **D-009** Posição no card: canto superior esquerdo de `.poster-box` (a estrela de favorito ocupa o superior direito; o selo "Assistido", o inferior esquerdo). Cards `wide` do "Continue assistindo", Início, Busca e Favoritos **ficam fora**.
- **D-010** Fundo do destaque de série: `provider_backdrop_url ?? icon_url`; filme continua com `icon_url`.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.* (constituição v1.7.0, 13 princípios)

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | Nenhuma conta; só dados da listagem já baixada. |
| Segredos Fora dos Clientes e dos Logs | OK | OK | URL de fundo é conteúdo de exibição (como `iconUrl`), só o hash entra na assinatura; nenhuma credencial ou URL em log/erro (FR-015). Nenhum segredo novo. |
| Categorias da Fonte São Preservadas | OK | OK | `providerGenres` é texto de exibição no destaque; nunca cria/renomeia categoria nem filtra (FR-010, D-003). |
| IA e Classificação Nunca Inventam Dados | OK | OK | Nota só quando o provedor declara um valor válido; 0/inválido ⇒ nada (nem "sem nota"); rótulo "Provedor" nunca como IMDb/TMDB (FR-014). |
| Comandos Locais Independem de Rede, Backend ou IA | N/A | N/A | Não toca comandos de voz. |
| Trailers e Metadados Não Alteram o Estado Principal da Obra | OK | OK | Só leitura de campos; nenhuma ação marca assistido/favorito/progresso. |
| Toda Ação Essencial Tem Caminho por Controle Remoto | OK | OK | Nenhuma ação nova; o selo é só informação. |
| Lista de Catálogo Nunca É Manifesto de Streaming | N/A | N/A | Não toca reprodução. |
| Foco Visível e Sem Becos Sem Saída | OK | OK | Selo não focável (FR-009, contrato); nenhum estado novo (vazio/erro/carregando continuam com o foco de antes). Focar não consulta nada (FR-013). |
| Voltar Restaura Foco e Posição | OK | OK | Sem mudança de navegação; ids por item continuam os do bloco. |
| Identidade de Reprodução Não Depende da URL | OK | OK | Nada de resume/favorito/histórico muda; campos não entram na identidade (`identityKey` intacto). |
| Progresso e Capacidades São Reais, Nunca Prometidos | OK | OK | Sem percentuais inventados; cobertura parcial (lista antiga até o refresh) é o estado normal do catálogo e o selo simplesmente não aparece. |
| Documentação do Repositório É Canônica | OK | OK | `plan.md`/`tasks.md`/backlog atualizados pelos scripts; sem parágrafo de status em `CLAUDE.md`. |

Nenhuma violação.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/055-campos-da-listagem-xtream/
├── spec.md
├── plan.md                  # Este arquivo
├── tasks.md
├── quickstart.md
├── handoff.md
├── contract-tests.lock      # 5 testes travados
└── logic/
    └── campos-da-listagem.md
```

(`research.md`, `data-model.md` e `contracts/` não se aplicam: sem incerteza técnica aberta, sem entidade nova além de três campos documentados em `logic/` §3, sem API nova.)

### Source Code (repository root)

```text
tv-web/                                   # React 19 + TypeScript + Vite (único projeto tocado)
├── src/
│   ├── lib/catalog/
│   │   ├── classifier.ts                 # ClassifiedEntry + normalizeProviderRating/Genres, firstBackdropUrl (stubs prontos)
│   │   ├── xtreamConnector.ts            # mapVodEntry / mapSeriesEntry
│   │   ├── db.ts                         # CatalogRecord: providerRating/Genres/BackdropUrl (JÁ adicionado)
│   │   ├── categoryLoader.ts             # toItemRecord()
│   │   ├── importPipeline.ts             # toStoredRecord()
│   │   └── categoryBlocks.ts             # itemsSignature (campos novos, só quando existem)
│   ├── features/catalog/catalogApi.ts    # CatalogItemOut + itemOut()
│   ├── components/
│   │   ├── RatingBadge.tsx               # stub pronto → implementar
│   │   └── ContentCard.tsx               # sem mudança (usa a prop badge já existente)
│   ├── features/vod/
│   │   ├── VodCategoryScreen.tsx         # selo no card da grade
│   │   ├── VodShowcaseScreen.tsx         # selo nas fileiras portrait + hero (nota, gênero, fundo)
│   │   └── VodHeroArt.tsx                # (sem mudança; recebe a URL certa de quem chama)
│   ├── features/movies/MovieDetailScreen.tsx
│   ├── features/series/SeriesDetailScreen.tsx
│   ├── lib/i18n/messages/components.ts   # 'rating.provider' pt/en/es
│   └── styles/shared.css                 # .poster-box .rating-badge (+ hero/detalhe)
└── e2e/
    ├── campos-da-listagem.mjs            # NOVO — roteiro com painel falso
    └── run.mjs                           # registrar na SUITE
```

**Structure Decision**: monorepo existente; só `tv-web/` é tocado. `api/`, `CCPlayTv/` e `tizen-app/` ficam fora (nenhum arquivo emitido novo ⇒ nada a listar em `tizen_web_project.yaml`; `findUnlistedFiles` não muda).

## Complexity Tracking

Nenhuma violação a justificar.

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (em `tv-web/`):

```powershell
npx tsc -b
npm run lint
npx vitest run src/lib/catalog src/features/catalog src/features/vod src/features/movies src/features/series src/components
npm run test
npm run test:e2e -- --only campos-da-listagem,capa-real,carrosseis-filmes-series,vitrine-filmes-series,catalogo-em-blocos
npm run build:tizen     # garante que nenhum arquivo novo precise entrar em tizen_web_project.yaml
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock` (5 testes, orçamento máximo):
`tv-web/src/lib/catalog/vodMetadata.campos-da-listagem.contract.test.ts` (3) e
`tv-web/src/components/RatingBadge.campos-da-listagem.contract.test.tsx` (2).

Comando: `npx vitest run src/lib/catalog/vodMetadata.campos-da-listagem.contract.test.ts src/components/RatingBadge.campos-da-listagem.contract.test.tsx`
Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 055-campos-da-listagem-xtream`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| filme: nota válida vira número 0–10 com uma casa; inválidos viram ausência | FR-001, FR-003, US1/AC3, Constitution: IA e Classificação Nunca Inventam Dados | Fase 2 | `expected undefined to be 9.2` |
| série: nota, gênero e 1ª URL de fundo válida; filme não ganha gênero nem fundo | FR-002, FR-010, US2/AC1-AC2 | Fase 2 | `expected undefined to be 8` |
| assinatura do bloco: item sem os campos gera a mesma; campos novos a mudam | FR-011, FR-012, US3/AC1-AC2 | Fase 2 | `expected '1:f92a5471' not to be '1:f92a5471'` |
| RatingBadge card: "★ 7,4", sem origem, nada focável | FR-004, FR-005, FR-009, US1/AC1+AC4, Constitution: Foco Visível | Fase 3 | `Error: not implemented` |
| RatingBadge hero/detalhe: com "Provedor"; inválido não renderiza | FR-003, FR-004, FR-006, FR-014, US1/AC2-AC3, Constitution: IA e Classificação Nunca Inventam Dados | Fase 3 | `Error: not implemented` |

Verificado em 2026-10-03: `tsc -b` limpo, os 5 contratos vermelhos pelos motivos acima (asserção ou `not implemented`, nenhum erro de import/tipo) e a suíte de `src/lib/catalog` + `src/components` com 842 testes verdes além deles.

Stubs criados pelo plan (ponto de partida do execute, não travados): `tv-web/src/lib/catalog/classifier.ts` (3 normalizadores com `not implemented`), `tv-web/src/components/RatingBadge.tsx`. Já definitivos (só tipos): campos novos em `CatalogRecord` (`db.ts`) e em `ClassifiedEntry` (`classifier.ts`).

Fora dos contratos, a cobrir com testes comuns do executor: `toItemRecord`/`toStoredRecord` copiam os campos só quando existem; `itemOut` mapeia para `provider_*` (e `null`); hero de série usa o fundo da listagem e cai no `icon_url`; sem selo para nota 0/inválida; detalhe com nota; lista antiga sem os campos continua renderizando; E2E de ponta a ponta (painel falso).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 (Setup) | Concluída: `tsc -b` limpo; suíte completa 2534 verdes / 5 vermelhos (os 5 contratos desta feature); trava íntegra. |
| Fase 2 (dados) | Concluída: campos capturados, gravados (só quando existem), na assinatura do bloco e em `CatalogItemOut`; contratos 1–3 verdes. |
| Fase 3 (US1 — nota na tela) | Concluída: `RatingBadge` no card (grade e fileiras), nota com "Provedor" no destaque e nos detalhes. |
| Fase 4 (US2) | Concluída: gênero e fundo da listagem no destaque de série. |
| Fase 5 (US3) | Concluída em teste (regravação de lista antiga). |
| Fase 6 (Polish) | T024, T025, T027, T028 concluídas; **T026 (quickstart visual) aberta**. Contratos 5/5; vitest 2560 verdes; E2E 34/34. SC-003 atendido; SC-004 parcial e **aceito pelo usuário** (R-009). |
| Linha de base SC-003/SC-004 (A-02) | Capturada com a lista real, antes de qualquer código: Filmes entrada p50 1398 ms, Séries p50 1131 ms, armazenamento ≈ 9,92 MB (9,70–10,10) com 2 categorias de Filmes + 2 de Séries abertas. Comando para o "depois": `node e2e/carga-listas-real.mjs 3 2`. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Assinatura do bloco sem os campos novos faria uma lista já importada nunca gravar a nota (bloco "idêntico"). | Alto — feature silenciosamente inerte em listas existentes. | Resolvido: contrato "assinatura do bloco" travado + teste de regravação de lista antiga (`categoryLoader.campos-da-listagem.test.ts`). (original: D-005 + contrato "assinatura do bloco" travado; teste de regravação no US3.) |
| R-002 | Cobertura de listas antigas depende do refresh normal (24 h, `freshness.ts`) e do prefetch; o tempo até cobrir uma lista inteira não é garantido. | Médio — selo aparece aos poucos. | Resolvido: confirmado em teste que o refresh normal (categoria vencida, > 24 h) regrava o bloco; o prazo até cobrir a lista inteira segue sendo o do refresh/prefetch, como assumido na spec. (original: Assumido na spec (Assumptions); sem migração forçada (D-006). Registrar no quickstart como esperado.) |
| R-003 | Peso em IndexedDB/tempo de gravar blocos de ≈43 mil filmes (feature 039). Estimativa serializada ≈279 KB + ≈1 MB. | Médio — SC-003/SC-004. | Resolvido: medido com a lista real: +0,2 MB no que foi aberto, estimativa < 1,5 MB para a lista toda; tempo conforme R-009. (original: Medir no quickstart com a lista real (`navigator.storage.estimate()` antes/depois e tempo de entrada na categoria); campos só quando existem (D-002).) |
| R-004 | Nota do painel de origem desconhecida (mediana 0,10 de diferença do TMDB em 29 filmes — indício, não prova). | Médio — apresentar como fato. | Resolvido: rótulo "Provedor" no destaque e no detalhe; 0/inválido nunca aparece; nunca IMDb/TMDB (contrato e testes de tela). (original: Rótulo "Provedor" onde há espaço; nunca IMDb/TMDB; 0/inválido some (FR-003/FR-014).) |
| R-005 | Selo no canto superior esquerdo pode colidir visualmente com `fav-star`/`watched-badge` ou cortar em card pequeno a 1920×1080 escalado. | Médio — layout. | Resolvido: selo em canto próprio (superior esquerdo) e conferido na TV de referência pelo usuário em 2026-10-03 ("tudo certo"). (original: D-009 (cantos distintos); verificar com os 3 estados juntos em browser e na TV; só tokens.) |
| R-006 | Fundo (`backdrop_path`) é 16:9 e a arte do destaque foi pensada para a capa vertical (feature 050). | Baixo/médio — recorte feio. | Resolvido: `object-fit: cover` em `.vod-hero-art img` e fundo 16:9 conferido na TV pelo usuário em 2026-10-03. (original: `VodHeroArt` já é uma camada com `object-fit`; conferir CSS `.vod-hero-art img` e validar visualmente na Fase 4.) |
| R-007 | Testes antigos constroem `CatalogItemOut`/`CatalogRecord` à mão. | Baixo | Resolvido: campos novos são opcionais; nenhum teste antigo foi alterado (só acrescidos). (original: Campos novos são opcionais (`?:`); nenhum teste existente deve mudar.) |
| R-008 | O painel pode devolver `backdrop_path` como lista, string ou lixo (`"0"`, lista de vazios). | Baixo | Resolvido: `firstBackdropUrl` tolera lista, string e lixo; contrato cobre os três. (original: `firstBackdropUrl` tolera os três; contrato cobre lista, string e inválidos.) |
| R-009 | SC-004 só em parte: na categoria grande de Filmes (11.187 itens) o primeiro quadro subiu ≈ +8%, o tempo de parede ≈ +18% (ruído alto, n pequeno) e a gravação do bloco ≈ +30 ms; Séries +3 a +6%. | Baixo — custo percebido pequeno. | **Decisão do usuário (2026-10-03): aceitar** o custo medido; sem otimização da gravação nesta feature. Reabrir só se a passada na TV física mostrar lentidão perceptível na entrada de categorias grandes. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-03 | Fase 1 (Setup) | Linha de base de testes: 381 arquivos / 2539 testes, só os 5 contratos falham. `carga-listas-real.mjs` consertado (vitrine 052/053) e linha de base de tempo/armazenamento medida com a lista real. | — |
| 2026-10-03 | Fase 2 (dados) | T002–T009: normalizadores, mapeamento Xtream, gravadores, assinatura do bloco, `CatalogItemOut`; 74 arquivos / 552 testes verdes, contratos 1–3 verdes, vizinhos 025/039/044 verdes. | — |
| 2026-10-03 | Fases 3–5 (US1–US3) | RatingBadge, i18n, CSS, telas (grade, fileiras, destaque, detalhes), gênero/fundo no destaque de série; testes de tela e de regravação. | — |
| 2026-10-03 | Fase 6 (Polish) | E2E `campos-da-listagem` (34/34 na suíte), build/guard Tizen ok, item 68 anotado, medições com a lista real (SC-003 ok; SC-004 parcial). | T026 |

**PRÓXIMO**: T026 (quickstart no navegador com verificação visual); depois `sdd-converge`. SC-004 aceito (R-009).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/lib/catalog/classifier.ts`, `xtreamConnector.ts`, `categoryLoader.ts`, `importPipeline.ts`, `categoryBlocks.ts`, `features/catalog/catalogApi.ts` (Fase 2).
- Contratos: `vodMetadata.campos-da-listagem.contract.test.ts`, `RatingBadge.campos-da-listagem.contract.test.tsx`.

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- **Edição de arquivos com Python no Windows**: abrir com `open(p, encoding='utf-8')` converte CRLF em LF e um CR solto vira quebra de linha — em `xtreamConnector.ts` (CRLF + 1 CR solto, tratado por Git como `-text`) isso fez o `git diff` mostrar o arquivo inteiro mudado. Edite em binário (`'rb'`/`'wb'`) ou com a ferramenta Edit; confira com `git diff --stat` que o diff ficou do tamanho da mudança.
- O foco entra numa fileira de Filmes/Séries em um card qualquer (não necessariamente o primeiro): roteiros E2E devem andar com ← → até o título esperado, não presumir a posição.
- Medição com Playwright deixa processos `chrome.exe` do Playwright; **nunca** use `taskkill /IM chrome.exe` (fecha também o Chrome do usuário) — pare só o PID do `node` do script.
- `e2e/carga-listas-real.mjs` agora mede só Filmes e Séries (a Live TV mudou na 048). Não rode a medição com o código da feature já alterado se quiser a linha de base: ela já foi tirada (ver Estado Atual).
- O ruído da medição de tempo é grande (Filmes: p50 1398 ms, máx 2034 ms): compare p50 com p50, não máximos. SC-004 (< 10%) só vale para o p50.

## Resultado Final

**Convergida em 2026-10-03.** A listagem Xtream agora alimenta o catálogo com `rating` (filmes e séries) e, nas séries, `genre` e a primeira URL de `backdrop_path`, sem nenhuma requisição nova ao provedor ou ao TMDB.

**O que foi construído**
- Dados: `normalizeProviderRating` / `normalizeProviderGenres` / `firstBackdropUrl` em `classifier.ts`; `mapVodEntry` (só nota) e `mapSeriesEntry` (nota, gênero, fundo) criam a chave só quando há valor; `toItemRecord` (categoryLoader) e `toStoredRecord` (importPipeline) copiam; `itemsSignature` inclui os campos, só quando existem, depois dos da 044; `CatalogItemOut` expõe `provider_rating/genres/backdrop_url`. Sem bump do Dexie.
- Telas: `RatingBadge` (`★ 7,4`; com `showSource`, `★ 7,4 Provedor`), chave i18n `rating.provider` (pt/en/es), CSS em `shared.css` só com tokens; selo na grade (`VodCategoryScreen`) e nas fileiras `portrait` (`VodShowcaseScreen`), nota com origem no destaque e nos detalhes de filme e série; gênero e fundo da listagem no destaque de série.
- Testes: 5 contratos travados (verdes), 21 testes novos (2539 → 2560 verdes), E2E `campos-da-listagem` (34/34 na suíte); medições com a lista real; passada na TV de referência feita pelo usuário.

**Desvios em relação ao plano original**
- A linha de base de tempo/armazenamento exigiu consertar `e2e/carga-listas-real.mjs` (estava defasado desde as features 048/052; Canais saiu da medição). Não previsto, registrado na Fase 1.
- **SC-004 só em parte e aceito pelo usuário (R-009)**: categoria de 11 mil filmes, primeiro quadro ≈ +8%, tempo de parede ≈ +18% (ruído alto, n pequeno), gravação ≈ +30 ms; Séries +3 a +6%. Sem otimização.
- **FR-005/SC-001**: o texto da spec diz "cards de filme e série"; a implementação (D-009, no plano) cobre a grade e as fileiras `portrait` de Filmes/Séries, e deixa de fora o card `wide` do "Continue assistindo", o Início, a Busca e os Favoritos. O texto da spec não foi reescrito (o converge não reescreve o corpo); vale ler FR-005/SC-001 com D-009.
- **FR-016** (M3U que aponta para painel Xtream confirmado) não tem teste direto; é coberto por construção, pois usa o mesmo `mapSeriesEntry`/`toItemRecord`.
- A verificação na TV é a observação do usuário ("tudo certo"), sem detalhe por item; o roteiro do quickstart não foi executado separadamente no navegador (a cobertura de navegador é o E2E).

**Armadilha de processo** (também em Cuidados para Retomada): editar arquivos CRLF com Python em modo texto reescreve os finais de linha e um CR solto — o `xtreamConnector.ts` precisou ser refeito em binário.

