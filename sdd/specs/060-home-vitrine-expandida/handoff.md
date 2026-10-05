# Handoff — 060-home-vitrine-expandida (sdd-plan → sdd-execute)

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. Frontend React 19 + TS + Vite em `tv-web/` (alvo `chrome108`).
- Próximo comando: `/sdd-execute 060-home-vitrine-expandida`. Backlog: **Planejada**, 0/53 tasks.
- Mudaram nesta sessão, fora dos docs da 060 (reler antes de mexer): `docs/design/design-system/CCPlayTV_Tizen_Ultimate_Prototype_v13_2.html` (`home()` = variação B, CSS `.hb*`), seção "Home" da Spec V14, `propostas/home-v15-variacoes.html`; **contratos travados de 052/053/056/057 emendados e retravados** (D-012); stubs listados abaixo; `.planning/backlog.md` (G3: itens 69/32 absorvidos, item 72 novo).

## O que a feature entrega

- **P1 (US1)** Billboard de um título em tela cheia (backdrop/sinopse/"Continuar" com barra real/Trailer **real**) que **recolhe** quando o foco desce; fundo ambiente com a imagem do item focado (250 ms depois de parar); dock no canto do billboard; voltar restaura o card por id **já recolhido e sem animação**.
- **P2 (US2)** Pôster 250×375 com selos (NOVO 7 dias, ★ só com nota, ✓, ♥); card focado **expande** para 667×375 (sem imagem 16:9: pôster + cor da capa); Continuar 16:9 480×270 → 600×338 com barra só com posição **e** duração; Top 10 com numeral.
- **P3 (US3)** "Filmes adicionados" e "Séries adicionadas" (duas fileiras, carga adiada), "Ao vivo agora" (substitui "Canais favoritos", chave `channels` mantida), "Porque você assistiu X" no Início **e** em Filmes/Séries (o slot "Em breve" deixa de existir; sem semente, a fileira some).
- Decisões do usuário que contrariam o óbvio: as fileiras "Dica" **ficam** na Home; classificação indicativa e nota TMDB **ficam fora** (item 72); TV física é **gate**; se a expansão engasgar na TV, expande **sem animar** (FR-028).

## Leitura obrigatória, em ordem

1. `spec.md` — 28 FRs, 9 SCs, ordem das fileiras em FR-018, clarificações da sessão.
2. `plan.md` — D-001..D-018 (decisões travadas), Constitution Check, Riscos R-001..R-011, comandos.
3. `tasks.md` — 6 fases, contratos por fase, critérios de conclusão.
4. `logic/billboard-e-navegacao.md` — estrutura DOM, billboard, linhas de foco, rolagem, fundo, dock.
5. `logic/cards-e-expansao.md` — medidas, props do `Rail`, `HomeTitleCard`, selos, expandido, progresso do Continuar.
6. `logic/fileiras-e-dados.md` — imagem 16:9, `useBecauseYouWatched`, adicionados, Ao vivo, captura de backdrop.
7. `quickstart.md` — cenários 1–13, seção da TV física (gate).
8. `.planning/memory/constitution.md` (v1.7.0).

## Testes de contrato

Travados em `sdd/specs/060-home-vitrine-expandida/contract-tests.lock` (5/5):

| Arquivo | Testes | Fase |
| --- | --- | --- |
| `tv-web/src/lib/catalog/becauseSeed.home-vitrine-expandida.contract.test.ts` | 1 | 2 |
| `tv-web/src/features/home/HomeContent.home-vitrine-expandida.contract.test.tsx` | 3 | 3 |
| `tv-web/src/features/vod/vodShowcaseRows.home-vitrine-expandida.contract.test.ts` | 1 | 5 |

Rodar (de `tv-web/`): `npx vitest run src/features/home/HomeContent.home-vitrine-expandida.contract.test.tsx src/lib/catalog/becauseSeed.home-vitrine-expandida.contract.test.ts src/features/vod/vodShowcaseRows.home-vitrine-expandida.contract.test.ts`

Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 060-home-vitrine-expandida`

**Travas de outras features em jogo**:
- **Emendadas e vermelhas até a Fase 5 (esperado, D-012/R-005)**: 052 (`VodShowcaseScreen.vitrine-filmes-series…`), 053 (`vodShowcaseRows.carrosseis…`, `VodShowcaseScreen.carrosseis…` ×2), 056 (`vodShowcase.bem-avaliados…`), 057 (`VodShowcaseScreen.top10-dica-tmdb…`) — 6 testes, todos só porque o slot ainda existe. Não editar: a Fase 5 os deixa verdes.
- **Devem seguir verdes sem edição**: 026 (`HomeScreen.home-busca-configuracoes-ds-v14…` — nome acessível exato `/^(▶\s*)?Continuar$/`!), 022 (`Rail.biblioteca-componentes…`), 035, 057 (`tmdbDiscovery`, `discoveryRules` — usam `toMatchObject`), 059.

## Stubs criados

- `tv-web/src/lib/catalog/becauseSeed.ts` — tipos `BecauseSeed`/`PickBecauseSeedOptions`/`BecauseSeedKind` definitivos; `pickBecauseSeed` lança `not implemented` (T004).
- `tv-web/src/features/vod/vodShowcaseRows.ts` — `hasBecause?`/`becauseTitle?` no input, **ainda não lidos** (T029).
- `tv-web/src/navigation/appNav.ts` — `HomeFocus.rail` ganhou `added-movies`/`added-series`/`because` (definitivo).
- `tv-web/src/features/home/HomeContent.tsx` — as mesmas chaves em `RowKey`, `false` em `rowExists` (provisório até T033).

## Armadilhas já mapeadas

- **Nome acessível da primária** (contrato 026): o texto do botão é só "▶ Continuar"/"▶ Assistir"; "faltam X" vai num `span aria-hidden` ligado por `aria-describedby`; a barra é `aria-hidden`.
- **Contrato 026 roda o `catalogApi` real** com `useHomeHero` mockado e item `id: 'movie-7'` (não numérico): `useTitleMetadata` do billboard não pode lançar (R-011).
- **`useBecauseYouWatched` mora em `features/catalog/becauseApi.ts`**, não no `catalogApi.ts`: os testes de Filmes/Séries fazem `vi.mock('../catalog/catalogApi', …actual)` e espionam `fetch` — o hook roda de verdade lá e, **sem TMDB conectado, não pode fazer requisição nenhuma** (nem `ensureTitleMetadata`, que chamaria o provedor).
- `stableId` de episódio usa o id **do episódio**, não da série: a semente precisa de `seriesIdOfEpisode` vindo de registros locais de episódio; desconhecido = ignorar (contrato).
- **Contrato 060 da Home**: cards precisam de `data-item-id` na **raiz** e `tv-focus` dentro dela; billboard é `section.home-hero[data-state]`; fundo é `.home-ambient img`. O teste do fundo espiona `fetch` **depois** do carregamento inicial — o billboard pode consultar metadata ao abrir, nunca ao focar.
- **Fundo nunca no `.screen`**: só filhos de `.app-shell` (via `AppShell.backdrop`) somem com o plano de hardware do player (`player.css`).
- **`Rail`**: as props novas são opcionais; sem elas o DOM/medidas atuais não mudam (contrato 022). `estimateSize` só vale na 1ª medição — chame `measure()` ao mudar foco/largura (comentário já existente no `Rail`).
- **Carga de índice**: `useRecentlyAdded` lê o tipo inteiro (bug `tela-principal-filmes-lenta-na-tv`); na Home, habilitar só depois do 1º desenho; manter a `queryKey` `['catalog-search-index', sourceId, kind]`.
- **Sem bump do Dexie**: `backdropUrl` é campo opcional dentro de objetos já gravados; v17 continua livre.
- `ShowcaseRowKind` mantém `'slot'` e a renderização de slot (contrato de foco da 053 usa slots sintéticos).
- Um `useRemoteNav` por componente (regra da 040). Medidas de card só por `homeRowFormats.ts` + variáveis CSS (FR-024).
- Testes não travados que vão quebrar e devem ser atualizados no mesmo passo (R-004): `HomeContent.test.tsx`, `HomeContent.top10-dica.test.tsx`, `comingSoon.test.ts`, `vodShowcaseRows.discovery.test.ts`, `VodShowcaseScreen.carrosseis.test.tsx`, `VodShowcaseScreen.discovery.test.tsx`, `VodShowcaseScreen.test.tsx`, `VodShowcaseScreen.bem-avaliados.test.tsx`; E2E `home-busca-configuracoes`, `top10-dica`, `carrosseis-filmes-series`, `vitrine-filmes-series`, `bem-avaliados`, `epg-dados-agora`.
- E2E: runner paralelo `npm run test:e2e` (`--only`, `--jobs`); `npm run test:e2e:serial` para separar flake de falha real. Credenciais reais só via `CCPLAY_PROBE_*` do `.env` da raiz.

## Pendências do Analyze

| ID | Severidade | Resumo | Recomendação |
| --- | --- | --- | --- |
| A-001 | MEDIUM | R-003: ler a cor da capa no foco baixa a imagem da capa de novo (CORS) — interpretação de "focar não consulta serviço externo" | Confirmar com o usuário na Fase 4; alternativa pronta: gradiente neutro no card (desliga `useCoverColor` só no card) |
| A-002 | MEDIUM | FR-023/SC-006 (todo estado com focável) sem teste automatizado próprio para carregando/sem dado na Home nova | Incluir em T021 um caso "sem dados e carregando: exatamente um `tv-focus`" |
| A-003 | MEDIUM | Spec V14 "Home" e `home()` do protótipo têm ordem de fileiras diferente de FR-018 (sem Dica, uma só "Adicionados") | T044 atualiza a Spec V14 (e o protótipo, se desejado) |
| A-004 | LOW | ✓ de série = "série em dia" (`useSeriesWatchedSummary.upToDate`) é interpretação do "assistido" da spec | Manter; anotar no `plan.md` se o usuário quiser outro critério |
| A-005 | LOW | FR-021 da spec cita "v17 se precisar"; o plano não precisa | Nada a fazer (consistente) |

## Gate de pronto

- Contratos 060 5/5 verdes + travas íntegras de 060, 026, 022, 035, 052, 053, 056, 057, 059.
- `npx vitest run` completo, `npx tsc -b`, `npm run lint`, `npm run build`, `npm run build:tizen`.
- `npm run test:e2e` verde (com `e2e/home-vitrine-expandida.mjs` novo na `SUITE`) — antes da TV.
- `quickstart.md` cenários 1–13.
- Docs no Polish (T044): Spec V14 "Home" (ordem FR-018), backlog `Implementada`, `plan.md` Estado Atual.
- **TV física é gate** (D-015, T043): sem a passada, fechar exige decisão explícita do usuário com risco registrado.
