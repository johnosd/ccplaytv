# Matriz de QA Tizen (feature 028)

## Estados com botão (US2, FR-007/FR-008/FR-009)

Inventário de todo estado de carregando/vazio/erro com botão, por tela — a
ação esperada e o teste que prova SELECT (não só o clique do mouse).
`logic/matriz-qa.md` §1/§2 continua a fonte da matriz completa (§34); esta
seção fecha a Fase 4 antes do resto da matriz (Fase 7).

| Tela | Estado | Ação esperada | Teste | Status |
| --- | --- | --- | --- | --- |
| `ProfilesScreen` | erro de leitura | `refetch` | `ProfilesScreen.test.tsx` — "erro de leitura: SELECT (OK do controle) em 'Tentar de novo' chama refetch" | Já roteava — só faltava o teste por SELECT (só havia um por clique de mouse) |
| `SearchScreen` | sem resultado | foco volta ao campo | `SearchScreen.test.tsx` — "sem resultado: SELECT em 'Editar busca' devolve o foco DOM ao campo" | Já roteava (o mesmo `onSelect` da zona `field` cobre o caso, por construção — `noResults` implica `effectiveRow==='field'`) |
| `SettingsScreen` | aba mock "Em breve" (Integrações/Player/Perfis) | volta à trilha de abas | `SettingsScreen.test.tsx` — "'Voltar às abas' (SELECT) sai do painel mock e volta pra trilha de abas" | Já roteava |
| `LiveScreen` | carregando conteúdo | volta à trilha | `LiveScreen.test.tsx` — "carregando: SELECT em 'Voltar' devolve o foco à trilha" | Já roteava (`contentEmptyNeedsBack`/loading, feature 014) |
| `LiveScreen` | grupo/categoria vazia | volta à trilha | `LiveScreen.test.tsx` — "grupo vazio: SELECT em 'Voltar' devolve o foco à trilha" | Já roteava |
| `LiveScreen` | ★ Favoritos vazio | volta à trilha | `LiveScreen.test.tsx` — "★ Favoritos vazio: SELECT em 'Voltar' devolve o foco à trilha" | Já roteava |
| `LiveScreen` | erro de categorias | `refetch` | teste pré-existente ("mostra erro de carga com 'Tentar de novo' focável") | Já roteava |
| `VodCatalogScreen` (Filmes/Séries) | **carregando conteúdo** | volta à trilha | `VodCatalogScreen.test.tsx` — "carregando: SELECT em 'Voltar' devolve o foco à trilha" | **Achado real, corrigido (T021)**: nenhum ramo do `onSelect` cobria este estado — SELECT caía em `items[itemIdx]` (`undefined`) e não fazia nada, com "Voltar" visivelmente focado |
| `VodCatalogScreen` | **categoria real vazia** (sem falha) | volta à trilha | `VodCatalogScreen.test.tsx` — "categoria vazia (sem falha): SELECT em 'Voltar' devolve o foco à trilha" | **Achado real, corrigido (T021)** — mesma causa |
| `VodCatalogScreen` | **"Todos" vazio** | volta à trilha | `VodCatalogScreen.test.tsx` — "'Todos' vazio: SELECT em 'Voltar' devolve o foco à trilha" | **Achado real, corrigido (T021)** — mesma causa |
| `VodCatalogScreen` | ★ Favoritos vazio | volta à trilha | já coberto (o ramo `enteredFavorites` já existia) | Já roteava |
| `VodCatalogScreen` | ↺ Histórico vazio | volta à trilha | já coberto (o ramo `enteredHistory` já existia) | Já roteava |
| `VodCatalogScreen` | erro de conteúdo | `retryContent` | `VodCatalogScreen.test.tsx` — "erro de conteúdo: SELECT em 'Tentar de novo' chama o refetch" | Já roteava |
| `VodCatalogScreen` | categorias (erro de leitura) | `categoriesQuery.refetch` | já coberto por padrão idêntico ao de `LiveScreen` (mesmo componente `ErrorState`) | Já roteava |
| `MovieDetailScreen` | carregando / não está mais no catálogo | `onBack` | teste pré-existente, feature 011 (R-005) — "o botão 'Voltar' … é ativável por OK do controle" | Já roteava |
| `SeriesDetailScreen` | carregando item / não está mais no catálogo / carregando episódios / falha / sem episódios | `onBack`/`refetch` | testes pré-existentes, feature 011 (R-005), bloco "estados de carregando/erro/vazio" | Já roteava |
| `PlayerLayer` | erro de reprodução | `retry`/`onClose` | testes pré-existentes, feature 011 — "'Tentar de novo' refaz a busca…", "'Voltar' a partir do erro…" | Já roteava |
| `ImportProgressScreen` | falha / carregando / sumida | `onBack`/`retry` | testes pré-existentes (clique de mouse) | Ver nota abaixo — mecanismo diferente, não testável por SELECT simulado em jsdom |

### Nota: `ImportProgressScreen` usa um mecanismo de foco diferente

Ao contrário do resto do app (`useRemoteNav`, estado + classe `.tv-focus`,
ADR-009), `ImportProgressScreen`/onboarding usam `useTvKeyNav`: foco DOM
**real** (`element.focus()`) sobre `<button>` nativos. Nesse desenho, Enter
sobre um botão focado é ativado pelo **próprio navegador** (comportamento
padrão de HTML, não algo que o app precisa rotear) — o `useTvKeyNav` até
comenta isso explicitamente (nunca sintetiza clique num `<button>`, só num
`div[tabindex]`).

Tentei provar isso por teste (`fireEvent.keyDown(button, {key:'Enter'})`) e
descobri que o **jsdom não implementa essa ativação nativa** para
`<button>` — o evento não dispara `onClick`, diferente de qualquer
navegador real (Chromium incluso). Sem `@testing-library/user-event`
(que sintetiza esse comportamento; não instalado, e a feature não adiciona
dependência nova, D-016) não há como provar isto num teste Vitest/jsdom
sem inventar um mecanismo artificial. Fica como **só-na-TV** — já é a
mesma tecla que ativa qualquer botão nativo em qualquer navegador, e a
tela já converge desde a feature 023.

## Conclusão da US2

Todos os 18 estados do inventário respondem a SELECT. **3 achados reais**
(todos em `VodCatalogScreen`, T021, mesma causa: nenhum ramo do `onSelect`
cobria "carregando"/"categoria vazia"/"'Todos' vazio") foram corrigidos.
Os demais 14 já roteavam corretamente — a spec previu certo: "as telas
auditadas já roteiam o OK". `ImportProgressScreen` fica registrada como
só-na-TV por usar um mecanismo de foco diferente do resto do app.

---

## Matriz de QA Tizen §34 (US3, Fase 7)

Telas × critérios de `logic/matriz-qa.md` §1/§2. Legenda de resultado:
`aprovado` · `reprovado-corrigido (Tnnn)` ·
`reprovado-registrado (backlog: <título>)` · `só-na-TV` · `n/a (motivo)`.

### Dimensão Remote

| Tela | Setas alcançam tudo | Select faz o esperado | Return fecha o nível | Sem loop acidental | Foco nunca some | Foco volta ao item anterior |
| --- | --- | --- | --- | --- | --- | --- |
| Splash | n/a (sem foco — tela de trânsito automático) | n/a | n/a | n/a | n/a | n/a |
| Perfis | aprovado — `ProfilesScreen.test.tsx` (navegação por lista) | aprovado — abre lista / "Adicionar lista" / ações | aprovado — `appNav.shell-navegacao.contract.test.tsx` (RETURN sai do app na raiz) | aprovado — clamp nas pontas, mesmo teste | aprovado — `findUnnamedControls`/`.tv-focus` em todo estado (T037) | aprovado — `ProfilesScreen.shell-navegacao.contract.test.tsx` (foco por sourceId, não por índice) |
| Adicionar lista | aprovado — `AddSourceScreen.test.tsx` | aprovado — submissão/campo | aprovado — RETURN volta a Perfis | n/a (formulário linear) | aprovado (T037) | aprovado — volta a Perfis com o card de origem focado |
| Importação | **só-na-TV** — `useTvKeyNav`, ativação nativa de `<button>` não sintetizável em jsdom (R-013) | **só-na-TV** (mesma causa) | aprovado — "Voltar" chama `onBack` (clique, R-005) | n/a | aprovado (T037) | n/a (tela de trânsito, sem retorno a ela) |
| Início (+ modal sair) | aprovado — `HomeContent.test.tsx`/`TopBar.test.tsx` | aprovado — US2 (T016), `ExitModal.test.tsx` | aprovado — `appNav` (RETURN na Início abre o modal sair) | aprovado — clamp na trilha de atalhos e nos rails | aprovado (T038) — linha efetiva cai pro fallback quando o item focado some | aprovado — volta da Busca/detalhe com a seção/scroll restaurados (`CategoryScreenSnapshot`) |
| Busca | aprovado — `SearchScreen.test.tsx` | aprovado — abrir resultado, "Editar busca" (US2) | aprovado — `SearchScreen.test.tsx` "RETURN em camadas" | n/a (campo + rails, sem trilha circular) | aprovado (T039) | aprovado — restauração por id (FR-042) |
| Configurações | aprovado — `SettingsScreen.test.tsx` (abas/painel) | aprovado — Editar/Ressincronizar/"Voltar às abas" (US2) | aprovado — "RETURN na aba ou no painel chama onBack" | aprovado — UP na 1ª aba sobe à topbar (não roda em loop) | aprovado (T039) | aprovado — restaura por `sourceId` |
| Live TV (trilha/lista/★/Todos/zapping) | aprovado — `LiveScreen.test.tsx` (dezenas de casos) | aprovado — US2 + zapping (T027) | aprovado — RETURN sai da lista/zapping/tela | aprovado — clamp nas pontas da trilha e da lista (topo real troca de zona por design, não é loop) | aprovado (T040) | aprovado — volta com a categoria/scroll da sessão anterior |
| Filmes / Séries | aprovado — `VodCatalogScreen.test.tsx` | aprovado — US2 (T021) | aprovado — RETURN sai da grade/busca | aprovado — clamp na trilha e na grade | aprovado (T040) | aprovado — `CategoryScreenSnapshot` (termo de busca, scroll, item) |
| Detalhe de filme | aprovado — `MovieDetailScreen.test.tsx` | aprovado — ações do herói, abas (Tabs) | aprovado — RETURN volta à grade de origem | n/a (hub linear) | aprovado (T041) | aprovado — volta pro item de origem na grade |
| Detalhe de série (+ modal temporada, autoplay) | aprovado — `SeriesDetailScreen.test.tsx` | aprovado — trocar temporada, abrir episódio, contagem do autoplay | aprovado — RETURN fecha o modal antes da tela | aprovado — modal clampa nas pontas da lista de temporadas | aprovado (T041) | aprovado — mesmo mecanismo do detalhe de filme |
| Player (VOD, Live faixa/linha, erro) | aprovado — `PlayerLayer.test.tsx` (linha/barra/canal) | aprovado — US2 + interação de controles (T018) | aprovado — RETURN oculta a linha, depois fecha (D-015) | aprovado — clamp nas pontas da linha de controles | aprovado (T041) | n/a (fecha a tela, não há "voltar pra dentro" do player) |
| Modais (excluir lista, sair) | aprovado — `ProfilesScreen.test.tsx`/`ExitModal.test.tsx` | aprovado — confirmar/cancelar | aprovado — RETURN fecha o modal (D-010, único jeito de sair) | n/a (2 ações) | aprovado — sempre uma ação com `.tv-focus` | aprovado — foco volta ao card/ação que abriu o modal |

### Dimensão Visual

| Tela | Um único foco | Foco não depende de cor | Indicador de overflow | Sem sobreposição em repetição rápida | Textos legíveis | Sem layout shift |
| --- | --- | --- | --- | --- | --- | --- |
| Splash | n/a | n/a | n/a | n/a | aprovado — inspeção, tokens `--fs-*` | n/a (tela de trânsito) |
| Perfis | aprovado — testes de tela (só um `.tv-focus`) | aprovado — `.tv-focus` = contorno+escala (`index.css`, ADR-007), nunca só cor | n/a (lista curta, cabe na tela) | aprovado (TV, 28/09/2026) | aprovado — nenhum token abaixo de `--fs-caption` | aprovado — card com dimensão fixa |
| Adicionar lista | aprovado | aprovado | n/a (formulário curto) | aprovado (TV, 28/09/2026) | aprovado | aprovado |
| Importação | aprovado | aprovado | n/a | aprovado (TV, 28/09/2026) | aprovado | aprovado — barra de progresso com altura fixa |
| Início (+ modal sair) | aprovado | aprovado | aprovado — rails horizontais usam `rail--fade-start/end` (máscara, F-003); "Continuar assistindo" só aparece com item — sem shift de outros blocos | aprovado (TV, 28/09/2026) — segurar ↓ numa lista longa não duplicou nem sobrepôs foco | aprovado | aprovado — `Skeleton` com a mesma caixa do `ContentCard` (R-004 da 022, confirmado na TV) |
| Busca | aprovado | aprovado | aprovado — rails com fade igual ao Início | aprovado (TV, 28/09/2026) | aprovado | aprovado — rails só aparecem com resultado, sem empurrar o campo |
| Configurações | aprovado | aprovado | n/a — conteúdo de cada aba cabe sem cortar (fontes cadastradas é lista curta) | aprovado (TV, 28/09/2026) | aprovado | aprovado |
| Live TV | aprovado | aprovado | aprovado — lista de canais corta o próximo item parcialmente (grid virtualizado, feature 009); trilha de categorias cabe sem cortar | aprovado (TV, 28/09/2026) — lista de canais rolou suave, sem barra nativa; troca de canal rápida | aprovado | aprovado — item de lista com altura fixa (`Rail`/grid) |
| Filmes / Séries | aprovado | aprovado | aprovado — grade corta a próxima linha parcialmente (D-006); trilha lateral com fade | aprovado (TV, 28/09/2026) — segurar ↓ na grade não duplicou/sobrepôs foco; sem barra nativa em nenhuma direção | aprovado | aprovado — `ContentCard`/`Skeleton` mesma caixa (R-004 da 022) — **ressalva de performance, ver Dimensão Performance abaixo (achado real na TV)** |
| Detalhe de filme | aprovado | aprovado | aprovado — **achado real corrigido (T058)**: `.vod-detail` rolava com a barra nativa do navegador, sem nenhum indicador do DS; agora rola sem barra (`.no-scrollbar`), consistente com o resto do app (nenhuma outra tela deste app usa indicador dedicado de rolagem vertical de tela inteira) | aprovado (TV, 28/09/2026) | aprovado | aprovado — hero com altura fixa |
| Detalhe de série (+ modal) | aprovado | aprovado | aprovado — **achados reais corrigidos (T058)**: `.vod-detail` (mesma causa do filme) e `.vod-episode-list` (lista de episódios) rolavam com barra nativa; modal de temporada idem (T058, `.modal-panel`) — ver nota abaixo sobre o modal | aprovado (TV, 28/09/2026) | aprovado | aprovado |
| Player (VOD, Live faixa/linha, erro) | aprovado | aprovado | n/a (timeline é a própria barra de progresso, não uma lista rolável) | aprovado (TV, 28/09/2026) — vídeo sempre visível sob o chrome, sem camada vazando por cima | aprovado | aprovado — chrome com altura fixa, sem empurrar o vídeo |
| Modais (excluir lista, sair) | aprovado | aprovado | n/a (2 linhas de texto + ações, nunca rola) | aprovado (TV, 28/09/2026) | aprovado | aprovado |

**Nota sobre o modal de seleção de temporada**: `.vod-season-modal-list` não tem altura fixa — cresce com o conteúdo, e só o `.modal-panel` (pai) rola se a lista de temporadas for alta o bastante para estourar a tela (raro: exige dezenas de temporadas). Diferente da grade/trilha (onde o corte parcial do próximo item É o indicador do DS, por definição do `logic/matriz-qa.md` §4), uma lista de modal não tem esse mecanismo hoje em nenhuma tela do app — não é uma regressão introduzida por esta feature (o modal já não tinha indicador dedicado antes, só a barra nativa que a T058 removeu). Registrada como **reprovado-registrado** por prudência: `[Bug] Modal de seleção de temporada sem indicador de "mais itens abaixo" quando a lista é alta demais para caber na tela` — comportamento real só em uma série com dezenas de temporadas, nenhuma fixture/produção conhecida do usuário chega perto disso hoje.

### Dimensão Performance

| Tela | Assets locais | Sem GIF | Sem blur pesado | Listas virtualizadas | Imagens no tamanho de uso | Trailer cancela no blur | Hardware real |
| --- | --- | --- | --- | --- | --- | --- | --- |
| App inteiro (assets/GIF/blur são globais) | aprovado — `grep -r "fonts\.googleapis\|fonts\.gstatic\|cdn\.jsdelivr\|cdnjs\.cloudflare" tv-web/src` → 0 ocorrências; fontes locais desde a feature 021 (`src/assets/fonts/`, Fontsource) | aprovado — `grep -r "\.gif" tv-web/src` → 0 ocorrências | aprovado — `grep -r "backdrop-filter\|filter:\s*blur" tv-web/src` → 0 ocorrências | — | — | n/a (ADR-011: sem preview/trailer no foco) | aprovado (TV, 28/09/2026) — navegação geral sem travadinhas perceptíveis |
| Perfis / Adicionar lista / Importação | — | — | — | n/a (listas curtas, não "extensas") | n/a (sem capa — cards de texto/ícone) | — | aprovado (TV, 28/09/2026) |
| Início | — | — | — | aprovado — rails usam `Rail`/`useVirtualizer` (feature 022) | aprovado — `ContentCard`/`PosterArt`, geometria fixa (205×302, D-006 da 022) | — | aprovado (TV, 28/09/2026) |
| Busca | — | — | — | aprovado — resultados em `Rail` | aprovado — mesmo `PosterArt` | — | aprovado (TV, 28/09/2026) |
| Configurações | — | — | — | n/a (lista de fontes cadastradas — não extensa) | n/a | — | aprovado (TV, 28/09/2026) |
| Live TV | — | — | — | aprovado — `useVirtualizer` na lista de canais (`LiveScreen.tsx:422`); trilha de categorias não virtualizada (contagem tipicamente pequena, n/a) | aprovado — logo do canal via `PosterArt` (`variant="logo"`) | — | aprovado (TV, 28/09/2026) |
| Filmes / Séries | — | — | — | aprovado — grade e trilha lateral com `useVirtualizer`/`Rail` | **reprovado — achado retirado do backlog por decisão do usuário (capas de filmes/séries demoram para carregar na TV física, ver R-016)** — geometria correta (205×302), mas o usuário observou ~4s de atraso até a capa aparecer na grade, na TV física; nunca visto em ambiente de desenvolvimento (rede/hardware diferentes) | — | aprovado (TV, 28/09/2026) — exceto o achado de carregamento de capas ao lado |
| Detalhe de filme / série | — | — | — | aprovado — lista de episódios com `useVirtualizer` (`SeriesDetailScreen.tsx`) | aprovado — capa do herói e `PosterArt` dos episódios (usuário não relatou o mesmo atraso aqui — só na grade) | — | aprovado (TV, 28/09/2026) |
| Player | — | — | — | n/a (sem lista) | aprovado — logo do canal via `PosterArt` | — | aprovado (TV, 28/09/2026) |
| Modais | — | — | — | n/a | n/a | — | aprovado (TV, 28/09/2026) |

## Correções feitas (Fase 7)

| Task | Tela | Critério | Arquivo |
| --- | --- | --- | --- |
| T058 | `Modal` (todas as telas que o usam) | Indicador de overflow / barra nativa (FR-006) | `tv-web/src/components/Modal.tsx` |
| T059 | Live TV — lista de canais | Barra nativa (FR-006) | `tv-web/src/features/live/LiveScreen.tsx` |
| T060 | Busca | Barra nativa (FR-006) | `tv-web/src/features/search/SearchScreen.tsx` |
| T061 | Configurações — painel da aba | Barra nativa (FR-006) | `tv-web/src/features/settings/SettingsScreen.tsx` |
| T062 | Detalhe de filme / série | Barra nativa (FR-006) | `tv-web/src/features/movies/MovieDetailScreen.tsx`, `tv-web/src/features/series/SeriesDetailScreen.tsx` |
| T063 | Detalhe de série — lista de episódios | Barra nativa (FR-006) | `tv-web/src/features/series/SeriesDetailScreen.tsx` |

## Registradas no backlog

- `[Bug] Modal de seleção de temporada sem indicador de "mais itens abaixo" quando a lista é alta demais para caber na tela` (origem: feature 028, 2026-09-28)

## Diferenças visuais intencionais

Nenhuma nova — `paridade-limpeza.mjs comparar` rodado depois de T058–T063 confirmou **zero diferença de pixel** em qualquer captura (a barra nativa, quando aparecia, não chegava a existir nas fixtures usadas — conteúdo curto o bastante para caber sem rolar; a correção é preventiva, provada pelos testes unitários de classe `.no-scrollbar`, não pela paridade). Lista continua a mesma de `paridade-limpeza.mjs` (Fases 3/5): hero do Início maior, largura útil maior em Live/Filmes/Séries (padding duplicado removido), contagens de fixture diferentes em Importação/Busca.

## Conclusão da US3

Matriz completa, sem célula vazia fora de `n/a`. **6 achados reais** de
barra de rolagem nativa (todos "pequeno", FR-006 — mesmo padrão já corrigido em
Filmes/Início na Fase 3), corrigidos com `.no-scrollbar` e testados (T058–T063).
**2 achados registrados no backlog**: o modal de temporada sem indicador dedicado em
listas muito longas (comportamento raro, sem caso real conhecido) e o
carregamento lento de capas na grade de Filmes/Séries (achado na passada
física, ver abaixo).
Nenhum achado de Remote — as Fases 3/4/6 já cobriram os mecanismos
compartilhados (`useRemoteNav`, `appNav`, `CategoryScreenSnapshot`) que
sustentam essa dimensão em todas as telas. Assets/GIF/blur confirmados globalmente
por grep (zero ocorrências). Virtualização e dimensionamento de imagem confirmados
por inspeção dos componentes compartilhados (`Rail`, `ContentCard`/`PosterArt`,
`useVirtualizer`).

## Passada na TV física (28/09/2026)

Feita pelo usuário na QN50Q60DAGXZD, com o app instalado pela skill
`tizen-tv` (deploy automatizado, `deploy-tv.ps1`), seguindo um roteiro
cobrindo os itens só-na-TV da matriz (splash, Início, Live TV/zapping,
Filmes/Séries, detalhe, player/chrome, repetição rápida segurando ↓,
navegação geral). Resultado, nas palavras do usuário: "o restante tudinho
funcionou como esperado" — todas as colunas "hardware real" e a linha
"sem sobreposição em repetição rápida" preenchidas como `aprovado (TV,
28/09/2026)` acima, exceto o achado abaixo. **Um achado real**: as capas de
filmes/séries na grade demoram cerca de 4 segundos para carregar — nunca
observado em ambiente de desenvolvimento (rede/hardware diferentes).
Foi registrado no backlog e depois **retirado dele por decisão do usuário**
(28/09/2026) — ver R-016 em `plan.md`. Fica aqui só como resultado
observado na TV.

**Nota sobre R-009**: o gate da TV física havia sido dispensado
explicitamente pelo usuário na sessão anterior (dispositivo inacessível
naquele momento). Nesta sessão o dispositivo ficou acessível e o usuário
executou a passada de fato — a dispensa fica sem efeito prático agora que
o gate foi cumprido, com o único achado real registrado acima.
