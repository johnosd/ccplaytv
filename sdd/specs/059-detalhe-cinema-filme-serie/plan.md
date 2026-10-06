# Implementation Plan: Detalhe de filme e de série no layout Cinema do Design System

**Slug**: `059-detalhe-cinema-filme-serie` | **Date**: 2026-10-05 | **Spec**: `sdd/specs/059-detalhe-cinema-filme-serie/spec.md`

## Summary

O detalhe de filme e o de série ganham o hero "Cinema" aprovado (variação A): fundo de backdrop em tela cheia, ou a cor da capa, ou gradiente neutro; capa 400×600 com brilho; chip da categoria da lista separado dos gêneros; ação primária com barra de progresso e "faltam X" só com dados reais; ações secundárias em botões de ícone com o rótulo visível no foco. Abaixo, as mesmas abas de hoje, com Detalhes em cartões, Elenco com foto maior e Semelhantes em **duas linhas** ("Na sua lista" / "Não encontrados na sua lista").

Abordagem: um componente de apresentação compartilhado (`DetailHero` + `DetailActions` + `DetailChips`) usado pelas duas telas, que **continuam donas** da máquina de foco (`row`/`actionFocus`/`activeTab`/`panelFocusKey`). Três regras puras novas — `primaryProgress`, `dominantColorFromPixels` e `movePanelFocus` — mais um hook (`useCoverColor`). O CSS novo vai num bloco ao fim de `vod.css`. Nenhum dado, consulta ou estado do usuário novo. O contrato travado da 035 foi emendado com autorização do usuário (D-009).

## Technical Context

**Language/Version**: TypeScript ~5 + React 19, Vite 8 (alvo `chrome108` — não remover de `vite.config.ts`)

**Primary Dependencies**: nenhuma nova. Reusa `DetailBackdrop`, `SynopsisBlock`, `CastPeoplePanel`, `PersonPhoto`, `OriginTag`, `MetadataFacts` (`features/vod/DetailMetadata.tsx`), `SimilarPanel`, `PosterArt`, `RatingBadge`, `Tabs`, `useRemoteNav`/`clamp`, `isResumable`, `formatDurationMinutes`, `groupLabelDisplay`, catálogo de idioma (`lib/i18n`)

**Storage**: N/A — lê `userStates` (progresso/assistido/favorito/histórico), metadata (032/055) e episódios como hoje; o cache da cor da capa é só memória do módulo

**Testing**: vitest (projeto `dom` para `*.test.tsx`, `node` para `*.test.ts`), fake-indexeddb via `db`, E2E Playwright (`tv-web/e2e/run.mjs`), passada na TV física (gate)

**Target Platform**: Samsung QN50Q60DAGXZD — Tizen 9 / Chromium 120, origin `file://`, palco 1920×1080

**Performance Goals**: abrir o detalhe sem regressão perceptível (SC-007); um `<img>` de backdrop, nenhum `filter: blur`, canvas 16×16 uma vez por capa por sessão

**Constraints**: tokens V14 para cor/raio/espaçamento/fonte/tempo (FR-022); fundo nunca no `.screen` (plano de hardware do player, FR-025); URL de imagem nunca em log/erro (FR-024); toda string nova em pt/en/es (FR-023)

**Scale/Scope**: 2 telas (`MovieDetailScreen`, `SeriesDetailScreen`), 1 painel (`SimilarPanel`), 3 componentes novos de apresentação, 3 regras puras, 1 hook, 1 bloco de CSS, chaves novas em `messages/detail.ts`

## Decisões Invariantes

- **D-001** As telas continuam donas da navegação: `DetailHero`/`DetailActions`/`DetailChips` são só apresentação, sem `useRemoteNav` nem estado de foco. Um `useRemoteNav` por componente (regra da 040).
- **D-002** Os rótulos das ações são os textos atuais do catálogo, sem mudança, e ficam como **nó de texto direto** do elemento focável que carrega `tv-focus`/`is-soft-disabled`/`aria-disabled` (contratos 032/033 e testes existentes leem `getByText(label).className`). Ícone em `span` `aria-hidden`.
- **D-003** Ordem e condições das ações = `buildActions` de hoje em cada tela (FR-009). A primária é sempre o índice 0 e o foco inicial.
- **D-004** Barra e "faltam" só via `primaryProgress` (`logic/hero-cinema.md` §3). Série: posição e duração **do episódio** da primária, nunca a duração por episódio da metadata.
- **D-005** Fundo: backdrop → `--detail-ambient` (cor da capa) → gradiente neutro de token. Ambiente, backdrop e vinheta são filhos do `.vod-detail-hero`, nunca estilo no `.screen`.
- **D-006** A categoria sai da linha de metadata e vira o 1º item da lista "Categoria e gêneros" (`ul[aria-label]`); a origem dos gêneros (`OriginTag`) fica fora da lista. **Origem dos dados, em dois níveis** (resolve A-001, 2026-10-05): no hero vale a regra da 032 — só o que veio do TMDB é marcado (FR-005, "como hoje"); **nos cartões da aba Detalhes, todo fato com fonte identificável leva a origem**, "Dados: TMDB" ou "Dados: fonte" (FR-012, como no protótipo e na Spec V14). Fatos derivados do estado do usuário (Progresso) não levam selo. Regra exata em `logic/hero-cinema.md` §7.
- **D-007** Semelhantes: duas `section` com `h3` ("Na sua lista" / "Não encontrados na sua lista"), cartões sem selo visível, texto "Não encontrado na sua lista" em `sr-only` nos não encontrados. Mantém `.similar-row`, `.similar-card`, `data-similar-key`, cobertura e estados (`logic/semelhantes-duas-linhas.md`).
- **D-008** Foco do painel por grade (`panelRows: string[][]` + `movePanelFocus`): ←/→ param na ponta, ↓/↑ trocam de linha mantendo a coluna, ↑ na 1ª linha volta à aba ativa. Mesma regra da `PersonScreen`.
- **D-009** **Emenda autorizada do contrato da 035** (2026-10-05): em `MovieDetailScreen.semelhantes.contract.test.tsx`, a tecla que leva do encontrado ao não encontrado passou de → para ↓ — nada mais. Retravado (5/5) e registrado como R-013 no `plan.md` da 035. Fica vermelho até a Fase 5.
- **D-010** Classes usadas por E2E e testes existentes permanecem: `vod-detail`, `vod-detail-hero`, `vod-detail-title`, `vod-detail-synopsis`, `vod-detail-origin`, `vod-detail-action` (em TODAS as ações), `cast-people-row`, `cast-person`, `data-person-key`, `similar-row`.
- **D-011** Sem topbar no detalhe (como desde a 025). Sem prévia de mídia no foco. Nada inventado (relevância, 4K/5.1, classificação).
- **D-012** A TV física é **gate** desta feature (SC-008, decisão do usuário), pela exceção da constitution em "Validação em hardware real": legibilidade, peso do backdrop + brilho + cor da capa e fluidez de rolagem não são provados pelo navegador de dev. Fechar sem a passada exige decisão explícita do usuário, com o risco registrado aqui.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | Sem mudança |
| Segredos Fora dos Clientes e dos Logs | OK | OK | `useCoverColor` nunca loga/lança a URL da capa (FR-024, `logic/cor-da-capa.md` §1.6); chave TMDB não é tocada |
| Categorias da Fonte São Preservadas | OK | OK | Categoria vira chip próprio e nunca é substituída por gênero externo (D-006, FR-004) |
| IA e Classificação Nunca Inventam Dados | OK | OK | D-011; campos ausentes não aparecem |
| Comandos Locais Independem de Rede, Backend ou IA | OK | OK | Ações locais inalteradas; a cor da capa é opcional e nunca bloqueia |
| Trailers e Metadados Não Alteram o Estado Principal da Obra | OK | OK | Só apresentação |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | OK | OK | Todas as ações seguem na fileira; Semelhantes navegável em 2D (D-008) |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | OK | OK | Sem mudança |
| Foco Visível e Sem Becos Sem Saída | OK | OK | Rótulo e anel no foco; 1ª linha vazia é frase não focável e ↓ cai na 2ª; estados sem cartão mantêm o foco na aba (FR-015/FR-020). Focar não consulta nada (a cor da capa roda ao abrir, não ao focar) |
| Voltar Restaura Foco e Posição | OK | OK | Restauração por `focusKey` em qualquer linha (D-008); ↑ das abas volta à última ação focada (o `actionFocus` persiste) |
| Identidade de Reprodução Não Depende da URL | OK | OK | Progresso lido por `stableId`, como hoje |
| Progresso e Capacidades São Reais, Nunca Prometidos | OK | OK | `primaryProgress` exige posição E duração reais (D-004, contrato) |
| Documentação do Repositório É Canônica | OK | OK | Spec V14 e protótipo já atualizados; 051 marcada como substituída; emenda da 035 registrada |

**Restrição "Validação em hardware real"**: elevada a gate por D-012, dentro da exceção prevista.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/059-detalhe-cinema-filme-serie/
├── spec.md
├── plan.md
├── logic/
│   ├── hero-cinema.md               # estrutura do hero, fundo, primária com progresso, ícones, chips, rolagem
│   ├── semelhantes-duas-linhas.md   # linhas, sr-only, grade de foco do painel
│   └── cor-da-capa.md               # hook useCoverColor + regra dominantColorFromPixels
├── quickstart.md
├── tasks.md
├── contract-tests.lock
└── handoff.md
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── features/
│   │   ├── movies/
│   │   │   ├── MovieDetailScreen.tsx                         # usa DetailHero; panelRows; scrollTop nas linhas de cima
│   │   │   ├── MovieDetailScreen.detalhe-cinema.contract.test.tsx   # CONTRATO 059 (2)
│   │   │   └── MovieDetailScreen.semelhantes.contract.test.tsx      # CONTRATO 035 emendado (D-009)
│   │   ├── series/
│   │   │   ├── SeriesDetailScreen.tsx                        # usa DetailHero (PosterArt no lugar de ContentCard); panelRows
│   │   │   └── SeriesDetailScreen.detalhe-cinema.contract.test.tsx  # CONTRATO 059 (1)
│   │   └── vod/
│   │       ├── DetailHero.tsx            # NOVO — hero (ambiente, backdrop, vinheta, capa, info)
│   │       ├── DetailActions.tsx         # NOVO — DetailPrimaryAction + DetailIconAction (+ ícones SVG)
│   │       ├── DetailChips.tsx           # NOVO — ul "Categoria e gêneros"
│   │       ├── detailProgress.ts         # STUB → primaryProgress
│   │       ├── detailProgress.detalhe-cinema.contract.test.ts       # CONTRATO 059 (1)
│   │       ├── detailPanelGrid.ts        # NOVO — movePanelFocus
│   │       ├── useCoverColor.ts          # NOVO — hook da cor da capa
│   │       ├── SimilarPanel.tsx          # duas seções, sr-only
│   │       └── DetailMetadata.tsx        # MetadataFacts/CastPeoplePanel: só classes, se preciso
│   ├── lib/
│   │   ├── color/coverColor.ts           # STUB → dominantColorFromPixels
│   │   ├── color/coverColor.detalhe-cinema.contract.test.ts         # CONTRATO 059 (1)
│   │   └── i18n/messages/detail.ts       # chaves novas pt/en/es
│   └── styles/vod.css                    # bloco novo ao fim ("Detalhe Cinema, feature 059")
└── e2e/
    ├── detalhe-cinema.mjs                # NOVO roteiro com capturas
    └── (filmes-series-ds-v14, home-busca-configuracoes, catalogo-em-blocos, historico-continuar-assistindo, trailers, limpar-historico, semelhantes-elenco-ator)  # conferir/ajustar
```

**Structure Decision**: frontend único em `tv-web/`; nada em `api/` nem em `CCPlayTv/` além do build normal. Componentes novos ao lado dos que já servem os dois detalhes (`features/vod/`); a regra de cor fica em `lib/color/` por não ter relação com VOD.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Edição de um contrato travado de outra feature (035) | O design aprovado separa Semelhantes em duas linhas; no contrato antigo, → ia do encontrado ao não encontrado na mesma linha | "→ no fim da linha pula para a outra" (navegação estranha na TV) e "uma trilha com divisória" (não é o design aprovado) foram oferecidas; o usuário escolheu emendar (2026-10-05). Mudança mínima, retravada e registrada (D-009) |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (TV física — **gate**, D-012).

Comandos-base (de `tv-web/`):

```powershell
npx vitest run src/features/movies src/features/series src/features/vod src/features/person src/lib/color
npx tsc -b
npm run lint
npm run build
npm run test:e2e                          # com `npm run dev` na 5173
node e2e/run.mjs --only detalhe-cinema --jobs 1
```

Integridade das travas (da raiz do repo):

```powershell
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 059-detalhe-cinema-filme-serie
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 035-semelhantes-elenco-ator
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 032-metadata-tmdb-integracoes
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 033-trailers-filmes-series
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock` (5/5):
`tv-web/src/features/vod/detailProgress.detalhe-cinema.contract.test.ts`,
`tv-web/src/lib/color/coverColor.detalhe-cinema.contract.test.ts`,
`tv-web/src/features/movies/MovieDetailScreen.detalhe-cinema.contract.test.tsx`,
`tv-web/src/features/series/SeriesDetailScreen.detalhe-cinema.contract.test.tsx`

Comando (de `tv-web/`):

```powershell
npx vitest run src/features/vod/detailProgress.detalhe-cinema.contract.test.ts src/lib/color/coverColor.detalhe-cinema.contract.test.ts src/features/movies/MovieDetailScreen.detalhe-cinema.contract.test.tsx src/features/series/SeriesDetailScreen.detalhe-cinema.contract.test.tsx src/features/movies/MovieDetailScreen.semelhantes.contract.test.tsx
```

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `primaryProgress` — só há progresso com posição válida E duração… | FR-007, SC-003; Constitution: Progresso Real | Fase 2 | `Error: not implemented` |
| `dominantColorFromPixels` — ignora transparente, preto e branco… | FR-002, SC-001 | Fase 2 | `Error: not implemented` |
| Movie — retomada com duração conhecida: primária com barra… | US1/AC3–AC6; FR-004/006/007/008/009 | Fase 3 | `Unable to find … role "progressbar"` |
| Series — episódio em andamento com duração conhecida… | US2/AC1+AC3; FR-007/008/009 | Fase 4 | `Unable to find … role "progressbar"` |
| Movie — Semelhantes em duas linhas tituladas… | US3/AC4–AC6; FR-014/015/016; Constitution: Foco Sem Becos | Fase 5 | `Unable to find … role "heading" and name "Na sua lista"` |
| (035, emendado) encontrado abre o detalhe… não encontrado por ↓ | D-009; 035 US1 | Fase 5 | `Unable to find … role "dialog"` (↓ ainda não troca de linha) |

Confirmado em 2026-10-05: os 6 vermelhos acima, pelo motivo certo; o 2º teste da 035 continua verde; o resto da área (326 testes) verde; `tsc -b` limpo.

Stubs criados pelo plan (ponto de partida do execute, não travados): `tv-web/src/features/vod/detailProgress.ts` (`primaryProgress` lança `not implemented`), `tv-web/src/lib/color/coverColor.ts` (`dominantColorFromPixels` lança `not implemented`).

Testes adicionais (escritos no execute, não travados): `detailPanelGrid.test.ts`, `useCoverColor.test.ts` (cache, `null` sem URL, erro sem expor a URL), `DetailActions.test.tsx` (nó de texto direto + classes), atualização dos testes existentes que esperavam a categoria na linha de metadata, o `ContentCard` no hero da série ou o selo visível em Semelhantes.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup (Fase 1) | Concluída — chaves novas em pt/en/es (`detail.ts`) e bloco CSS da 059 aberto ao fim de `vod.css` |
| Fundação (Fase 2) | Concluída — regras puras (contratos 2/2 verdes), `useCoverColor`, `movePanelFocus`, `DetailHero`/`DetailActions`/`DetailChips` e CSS do hero prontos, ainda não ligados às telas |
| US1 (filme) | Concluída — `MovieDetailScreen` no hero Cinema; contrato do hero verde; 032/033 verdes; Semelhantes do filme ainda na linha única (Fase 5) |
| US2 (série) | Concluída — `SeriesDetailScreen` no hero Cinema; contrato da série verde; 105/105 testes da série |
| US3 (abas) | Concluída — Semelhantes em duas linhas com grade de foco, Detalhes em cartões com origem, Elenco maior |
| Contratos | 059 5/5 e 035 5/5 verdes; 032 e 033 verdes; todas as travas íntegras |
| Polish (Fase 6) | Quase concluída — E2E novo (`detalhe-cinema.mjs`, na SUITE), E2E antigos ajustados, segredos ok, unit 2767/2767, lint/build/build:tizen ok, E2E completo 39/39, quickstart via E2E. **Passada na TV física (T036, gate D-012) declarada pelo usuário como realizada com sucesso em 2026-10-06; docs fechados (T037); status `Implementada`** |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | (Resolvido: só `semelhantes-elenco-ator` e `metadata-tmdb` precisaram de ajuste; os roteiros com `textContent` da primária seguiram verdes porque seus títulos não têm duração) E2E comparam o `textContent` inteiro de `.vod-detail-action` (`filmes-series-ds-v14.mjs:367`, `catalogo-em-blocos.mjs:307/312`, `home-busca-configuracoes.mjs:225`, `historico-continuar-assistindo.mjs`, `limpar-historico.mjs`, `trailers.mjs`). Com "faltam X" dentro da primária, igualdade quebra | E2E vermelhos | Trocar igualdade por `startsWith`/`includes` só onde a primária pode ter progresso; ícones mantêm o `textContent` = rótulo (T040) |
| R-002 | Contrato emendado da 035 fica vermelho entre o plan e a Fase 5 | Suíte vermelha no meio do execute | Resolvido: verde na Fase 5 (2026-10-05), sem editar o teste |
| R-003 | Capas do provedor quase nunca mandam CORS: a cor vai cair no neutro na maioria dos títulos sem backdrop | Efeito visual menor que o do protótipo | Resolvido: (convergência de 2026-10-06) fallback neutro e `isSafeCoverUrl` confirmados no código; a medição de quantas capas reais dão cor **não foi feita** (a passada na TV foi declarada com sucesso pelo usuário, sem números) |
| R-004 | `filter`/sombra grande com a cor da capa pode pesar na TV | Rolagem travando | Resolvido: (convergência de 2026-10-06) sem `blur`/`filter` no bloco CSS da 059, brilho por `box-shadow` único; sem medição de fluidez na TV (passada declarada com sucesso pelo usuário) |
| R-005 | Hero mais alto pode empurrar as abas para fora da 1ª tela, conforme o tamanho do título/sinopse | FR-011 violado | Resolvido: (convergência de 2026-10-06) altura fixa `--detail-hero-height`, título em 2 linhas e sinopse em 3; o E2E `detalhe-cinema` mede a posição das abas |
| R-006 | `SeriesDetailScreen` troca `ContentCard` por `PosterArt` no hero | Teste/E2E que procuram `.content-card` no hero | Conferir `SeriesDetailScreen*.test.tsx` e E2E de série; ajustar seletores não travados |
| R-007 | Muitos testes existentes procuram a categoria na linha de metadata ou o selo visível de Semelhantes | Testes vermelhos fora do contrato | Atualizar esses testes (não são travados) no mesmo commit da mudança, citando a 059 |
| R-009 | Selo de assistido sobre a capa: o protótipo mostra "✓ Assistido"; aqui ficou só o glifo ✓ (`aria-hidden`), porque o texto já está na linha de metadata e duplicá-lo faria `getByText('✓ Assistido')` achar dois elementos e a leitura repetir | Desvio visual pequeno do protótipo | Decidido na Fase 2; Resolvido: a passada na TV (T036), declarada com sucesso em 2026-10-06, não gerou pedido de mudança |
| R-008 | TV física é gate (D-012) | Feature não fecha sem a passada | Resolvido: (convergência de 2026-10-06) passada na TV declarada com sucesso pelo usuário em 2026-10-06 (SC-008), sem números medidos |
| R-010 | Achado no E2E (T030): ler a cor pede a capa em modo CORS e, com CORS recusado, o PRÓPRIO navegador escreve a URL no console — conflito com FR-024 | Possível URL com credencial no console | Resolvido: decisão do usuário (2026-10-05) — só capa "sem risco" (`isSafeCoverUrl`: http(s), sem usuário/senha, sem query, fora do domínio dos painéis via `usePanelHosts`); FR-024 emendado na spec; o E2E prova que a capa do painel com token nunca é pedida |
| R-011 | Mudanças feitas em paralelo, fora desta sessão, sobre a 059 (vistas em 2026-10-05 e mantidas): `SeriesDetailScreen` rola a página até o episódio focado (bug `foco-some-ao-descer-na-lista`, teste `SeriesDetailScreen.foco-episodios.test.tsx`), `scroll-padding-block` em `.vod-detail`, e `vod-detail--movie` sobe as abas do filme para a faixa livre sob a capa | Divergência entre o que esta sessão escreveu e o disco | Resolvido: (convergência de 2026-10-06) tratadas como estado atual; `tsc -b` limpo e suíte da área (68 arquivos, 385 testes) verde com elas |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-05 | Fase 1 (Setup) | T001 (7 chaves × 3 idiomas, incl. `detail.origin.source` da resolução de A-001; plural de temporadas como `seasonsOne`/`seasons`) e T002 (custom properties `--detail-*` no bloco novo). `tsc -b` limpo, `vitest src/lib/i18n` 18/18 | — |
| 2026-10-05 | Fase 2 (Fundação) | T003–T013: regras puras, hook da cor, grade do painel, componentes do hero e CSS. Contratos 2/2, testes de apoio 12/12, tsc limpo | Ligar às telas (Fase 3) |
| 2026-10-05 | Fase 3 (US1 — filme) | T014–T017: hero ligado ao filme, rolagem ao topo, 5 testes de apoio; nenhum teste antigo quebrou | Revisão visual fica para T030 |
| 2026-10-05 | Fase 4 (US2 — série) | T018–T021: hero na série com a barra do episódio, rolagem ao topo, 3 testes de apoio; nenhum teste antigo quebrou | Revisão visual fica para T030 |
| 2026-10-05 | Fase 5 (US3 — abas) | T022–T029a: Semelhantes em duas linhas + grade de foco nas duas telas, origem em cada cartão de Detalhes, Elenco maior; contratos 059 5/5 e 035 5/5 verdes; área 358/358 | E2E e TV (Fase 6) |
| 2026-10-05 | Fase 6 (Polish) | T030–T035: `e2e/detalhe-cinema.mjs` (36 verificações, SC-007 medido: 28–93 ms), achado R-010 (CORS × FR-024) resolvido com `isSafeCoverUrl`/`usePanelHosts` por decisão do usuário; `semelhantes-elenco-ator` e `metadata-tmdb` ajustados; unit 2767/2767; E2E completo 39/39; build:tizen ok | Passada na TV física (T036, gate) |
| 2026-10-06 | Fase 6 (fechamento) | T036 (passada na TV física, gate D-012, declarada com sucesso pelo usuário, sem números) e T037 (docs: Spec V14 "Detalhe de filme e de série" conferida contra o implementado, sem divergência; protótipo `details()` segue como referência visual; `CLAUDE.md` intocado); status `Implementada` | — |

**PRÓXIMO**: nenhum — feature `Implementada` em 2026-10-06 (gate D-012 fechado por relato do usuário, sem medição; ver "Passada física na TV — 2026-10-06"). Para convergir, rodar `sdd-converge 059-detalhe-cinema-filme-serie`.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/e2e/detalhe-cinema.mjs` — roteiro da 059 (capturas em `test-results/detalhe-cinema/`)
- `tv-web/src/lib/color/coverColor.ts` (`isSafeCoverUrl`), `tv-web/src/features/vod/usePanelHosts.ts` — regra da capa sem risco (R-010)
- `sdd/specs/059-detalhe-cinema-filme-serie/quickstart.md` — roteiro da TV

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- No PowerShell 5.1, `git commit -m` com aspas duplas na mensagem quebra os argumentos: usar `git commit -F <arquivo>`.
- No E2E, capa no mesmo host do painel (`127.0.0.1`) nunca tem a cor lida (R-010): capas "públicas" das fixtures usam `localhost`.

## Passada física na TV — 2026-10-06

Passada feita na TV QN50Q60DAGXZD, declarada pelo usuário em 06/10/2026 como **realizada com sucesso**. Registro honesto: o resultado vem do relato do usuário, sem números medidos nem capturas; não há medição para citar. Os riscos de hardware desta feature (marcados como "só se prova na TV") ficam encerrados por decisão do usuário.

Fecha o gate D-012 (SC-008). R-003 (capas sem CORS) e R-004 (peso de `box-shadow`) ficam sem medição de capas com cor nem de fluidez. T037 (docs e status `Implementada`) foi fechada no mesmo dia.

## Resultado Final

Convergida em 2026-10-06 sem achado acionável (`sdd-converge`).

**O que foi construído.** Detalhe de filme e de série no layout "Cinema": backdrop em tela cheia com vinheta e cor ambiente da capa (`useCoverColor`, só de capa "sem risco" — `isSafeCoverUrl`, R-010), capa grande (400 × 600 no palco), chips com a categoria da lista separada dos gêneros, sinopse, ação primária com barra e "faltam X" só com posição e duração reais (`primaryProgress`; na série, as do próprio episódio) e ações secundárias em ícones redondos com rótulo no foco. Abaixo do hero ficam as abas com Detalhes em cartões com origem, Elenco com foto redonda e Semelhantes em duas linhas, com foco por grade (`detailPanelGrid`, `movePanelFocus`). A 051 ficou "Substituída pela 059".

**Verificação da convergência.** Trava de contrato íntegra (5/5); contratos 059 e o da 035 emendado verdes; `tsc -b` limpo; suíte da área (movies, series, vod, person, lib/color, lib/i18n) com 68 arquivos e 385 testes verdes; `oxlint` só com avisos da linha de base. O E2E não foi reexecutado na convergência (último registro: 39/39 com o `detalhe-cinema`).

**Desvios em relação ao plano original.**
- FR-024 foi emendado durante a execução (R-010): a cor só é lida de capa sem risco, porque o navegador escreve a URL no console quando o servidor recusa CORS.
- O selo de assistido sobre a capa ficou só o glifo ✓ (R-009); o texto está na linha de metadata.
- Mudanças feitas em paralelo e mantidas (R-011): rolagem da página até o episódio focado na série, `scroll-padding-block` em `.vod-detail` e as abas do filme subindo para a faixa livre sob a capa (`vod-detail--movie`).
- Depois do plano, o ajuste ad-hoc de 2026-10-06 (backlog, `## Melhorias Ad-hoc`) pôs título, sinopse e dados do episódio ao lado da capa na lista de episódios da série; a spec segue satisfeita.

**Honestidade sobre o gate.** SC-008 (passada na TV física) foi fechado por declaração do usuário em 2026-10-06, sem números nem capturas; R-003 (quantas capas reais dão cor) e R-004 (fluidez com o brilho) ficaram sem medição.

