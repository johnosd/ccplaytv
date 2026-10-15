# Bug Assessment: Foco some ao descer na lista de episódios do detalhe da série

- **Slug**: foco-some-ao-descer-na-lista
- **Criado**: 2026-10-05
- **Origem**: texto colado (relato do usuário na TV, 2026-10-05)
- **Veredito**: valid (reproduzido em Chromium)
- **Severidade**: high

## Report

Relato do usuário em 2026-10-05, olhando o detalhe da série: "hoje o foco também some conforme vamos descendo na lista de episódios". O usuário sugeriu que um carrossel horizontal de episódios talvez funcione melhor, mas decidiu **começar pelo bugfix do foco**; o carrossel fica como decisão posterior e não faz parte deste bug.

## Symptom

Na aba Episódios, a cada ↓ o cartão focado desce 232 px e sai da tela, e o contêiner da tela nunca rola para acompanhá-lo: o foco "some" porque está abaixo da dobra. O esperado é o episódio focado sempre visível (constituição: foco é o estado mais importante).

## Reproduction

Reproduzido num Chromium 1920×1080 com painel Xtream fictício (uma temporada de 14 episódios), script de apoio fora do repositório que usa o fluxo do `e2e/filmes-series-ds-v14.mjs`:

1. Abrir a série pela vitrine → categoria → OK no card (detalhe da série).
2. ↓ ↓ ↓ (ações → abas → temporada → episódios): o 1º episódio fica focado.
3. Medir `getBoundingClientRect()` da `.vod-episode-row.tv-focus` e a rolagem após cada ↓.

Medições (altura da tela = 1080):

| Passo | topo/base da linha focada | `.vod-detail` scrollTop | `.vod-episode-list` scrollTop |
| --- | --- | --- | --- |
| entrada | 1010 / 1260 | 0 | 0 |
| ↓ 1 | 1242 / 1492 (fora) | 0 | 0 |
| ↓ 4 | 1938 / 2188 (fora) | 0 | 0 |
| ↓ 8 | 2866 / 3116 (fora) | 0 | 0 |

Também: `.vod-episode-list` tem `clientHeight` 3248 e `scrollHeight` 3266 (ou seja, **não rola**: tem o tamanho do conteúdo, 14 × 232), e `.vod-detail` tem `scrollHeight` 4258 contra 1080 de altura.

[NEEDS CLARIFICATION: a reprodução não foi feita na TV física; o relato do usuário veio de lá e é coerente com a medição, mas a rolagem nativa do Tizen (Chromium 120) não foi observada.]

## Suspected Code Paths

- `tv-web/src/features/series/SeriesDetailScreen.tsx:408-429` — `useVirtualizer` com `getScrollElement: () => episodeListRef.current` e `useVirtualFocusSync({ ..., scrollToIndex: episodeVirtualizer.scrollToIndex })`: rola só a lista interna, que não tem overflow.
- `tv-web/src/features/series/SeriesDetailScreen.tsx:876-918` — `.vod-episode-list` / `.vod-episode-list-inner` (altura = `getTotalSize()`) dentro de `.vod-detail-panel`, abaixo do hero.
- `tv-web/src/styles/vod.css:1113-1118` — `.vod-episode-list { flex: 1; min-height: 0; overflow: auto }`: só limita a altura se algum ancestral tiver altura limitada; `.vod-detail-panel` (`flex: 1; min-height: 0`) está dentro de `.vod-detail` (`overflow: auto`, coluna flex), cujo conteúdo cresce e rola em vez de limitar o painel.
- `tv-web/src/styles/vod.css:1359-1375` — hero Cinema com `--detail-hero-height: 860px` (feature 059): empurra abas, temporada e lista para a faixa de 860 px em diante, deixando < 220 px visíveis na tela.
- `tv-web/src/lib/focus/useVirtualFocusSync.ts` — chama `scrollToIndex(focusedIndex, { align: 'auto' })` só no virtualizador; não rola ancestrais.

## Root Cause Hypothesis

Antes da 059 a lista de episódios ocupava o resto da tela e era ela mesma a área de rolagem, então `scrollToIndex` bastava. Com o hero Cinema de 860 px (059), o painel passou a ficar quase todo abaixo da dobra e a lista passou a ser dimensionada pelo próprio conteúdo: não rola mais, e quem rola agora é o `.vod-detail` (contêiner externo), que ninguém move ao mudar o foco. A seleção por `.tv-focus` + estado (ADR-009) não dá foco de DOM, então o navegador também não rola sozinho. Confiança: **high** (medida em 8 passos, com o `scrollTop` externo em 0 o tempo todo).

Efeito colateral encontrado, **fora do escopo** deste bug: como a lista não rola, o virtualizador enxerga uma "janela" do tamanho do conteúdo inteiro e renderiza todas as linhas (overscan irrelevante). Para temporadas com centenas de episódios isso é custo de renderização na TV. Não será mexido aqui; vale registrar.

## Proposed Remediation

**Preferida**: depois que o foco muda, trazer o elemento focado à vista no contêiner que realmente rola. Em `SeriesDetailScreen.tsx`, um `useEffect` em `[row, episodeIdx, activeTab]` que chama `rootRef.current?.querySelector('.tv-focus')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })` (opcional-chaining por causa do jsdom); para as linhas `more`/`actions` volta ao topo (`scrollTo(0, 0)`), para o hero reaparecer inteiro ao subir. Em `vod.css`, `scroll-padding-block: var(--safe-y)` em `.vod-detail` para a linha focada respeitar a zona segura (mesmo padrão de `onboarding.css`). Mudança mínima, no padrão que a tela já usa no modal de temporada (`seasonListRef`).

**Alternativas** (opcional):
- Virtualizar contra o contêiner externo (`getScrollElement = .vod-detail` + `scrollMargin`): resolve também a renderização de temporadas longas, mas mexe no posicionamento das linhas e na memória de foco; é decisão maior, melhor junto da avaliação do carrossel.
- Carrossel horizontal de episódios: decisão de design (spec própria), explicitamente adiada pelo usuário.
- Limitar a altura do painel e deixar a lista rolar internamente: com o hero de 860 px sobram ~70 px de altura, inviável sem mexer no hero.

**Files likely to change**:
- `tv-web/src/features/series/SeriesDetailScreen.tsx`
- `tv-web/src/styles/vod.css`

**Tests to add or update**:
- Teste de componente em `SeriesDetailScreen` (novo arquivo, ex.: `SeriesDetailScreen.foco-episodios.test.tsx`): ao descer na lista, `scrollIntoView` é chamado no episódio focado; ao subir para as ações, o contêiner volta ao topo. jsdom não tem layout, então o teste verifica a chamada, não pixels.
- Roteiro E2E/Playwright (ou ampliação de um existente) com 14 episódios: a linha focada fica dentro de `0..1080` em todos os passos de ↓ e de ↑. Hoje o E2E `filmes-series-ds-v14` só tem 2 episódios, por isso nunca pegou isto.

## Risks & Considerations

- `scrollIntoView` rola o ancestral rolável mais próximo: aqui é o `.vod-detail`. Se a estrutura mudar (ex.: o painel virar contêiner de rolagem), o efeito continua correto, mas o teste precisa acompanhar.
- Rolar ao focar não pode iniciar reprodução nem consulta externa (constituição: focar nunca dispara nada): o efeito só mexe em rolagem.
- Memória de foco ao voltar do player (`restore`): o efeito roda na montagem e deve levar o episódio restaurado à vista; conferir no teste.
- Episódios com sinopse (`vod-episode-synopsis`) têm faixa de altura fixa; não deve haver salto de layout ao rolar.
- O mesmo desenho de página rolável vale para Filmes (resolvido por outro ajuste de CSS hoje); esta correção é só da Série.

## Open Questions

- [NEEDS CLARIFICATION: confirmar na TV física que a rolagem do `.vod-detail` ao focar fica fluida (Tizen/Chromium 120).]
- [NEEDS CLARIFICATION: renderizar todas as linhas em temporadas muito longas (centenas de episódios) é aceitável na TV, ou vira bug próprio / entra na decisão do carrossel?]
