# Implementation Plan: Trailers de Filmes e Séries

**Slug**: `033-trailers-filmes-series` | **Date**: 2026-09-29 | **Spec**: `sdd/specs/033-trailers-filmes-series/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

O botão "▶ Trailer" do detalhe de filme e de série deixa de ser mock. A
referência do trailer vem de duas fontes que **já são consultadas ao abrir o
detalhe** pela feature 032, sem requisição nova: o `youtube_trailer` do provedor
Xtream (`get_vod_info.info` / `get_series_info.info`) e, com a chave BYOK, os
`videos` do detalhe do TMDB (`append_to_response=credits,videos`). As duas somam
candidatos, provedor primeiro. Ao OK, uma camada de tela cheia (`TrailerLayer`)
carrega num `<iframe>` a **página-ponte** estática da ADR-012
(`https://johnosd.github.io/ccplaytv/trailer/?v=<id>`), que contém o player
oficial do YouTube — o único jeito que funcionou na TV, porque o app roda em
`file://` e o YouTube exige `Referer` (erro 153, spike de 2026-09-29). O app
continua dono do teclado e conversa com a ponte por `postMessage` validado.
Uma máquina de estados pura (`trailerSession.ts`) decide carregando/tocando/
pausado/erro, a troca única de candidato, o prazo de 15 s e os códigos de erro.

## Technical Context

**Language/Version**: TypeScript 6 / React 19 (`tv-web/`); a página-ponte é HTML +
JS puro, sem build (`bridge/trailer/index.html`).

**Primary Dependencies**: `@tanstack/react-query` (consultas do detalhe), Dexie
(`titleMetadata`, sem versão nova), `useRemoteNav` próprio (ADR-009),
componentes V14 da 022 (`ErrorState`, `Spinner`), YouTube IFrame Player API
(**só dentro da ponte**), GitHub Actions + Pages (publicação da ponte). Nenhuma
dependência npm nova.

**Storage**: IndexedDB — campos novos, não indexados, no registro
`titleMetadata` existente: `provider.trailerVideos`, `tmdb.fields.trailerVideos`,
`providerVersion`. Sem `this.version(13)` (não há índice novo). Sessão de
trailer: só memória.

**Testing**: Vitest + Testing Library + fake-indexeddb (unitário/componente);
Playwright via `node e2e/*.mjs` com `page.route` (E2E, sem rede real); TV física
(gate SC-001/SC-002).

**Target Platform**: Samsung QN50Q60DAGXZD — o spike de 2026-09-29 mediu **Tizen
9.0 / Chromium 120**, origem `file://` (a constitution/CLAUDE.md ainda dizem 8.0/108;
o build continua `chrome108`, que é seguro). Dev: Chromium via `npm run dev`.

**Performance Goals**: vídeo começa em ≤ 15 s após o OK (≥ 9/10 na TV, SC-001);
zero consultas de trailer por foco (SC-004).

**Constraints**: app `file://` não carrega o YouTube direto (ADR-012); sem backend
(ADR-008); termos do YouTube (sem ocultar anúncio/controles, sem extração);
segredo nunca sai (constitution); foco sempre visível e ativável.

**Scale/Scope**: 2 telas (detalhe de filme e de série), 1 camada nova, 1 página
estática, 1 workflow. Cobertura esperada no painel de referência: ~24 % das
séries pelo provedor; filmes quase só via TMDB.

## Decisões Invariantes

- **D-001** — O app NUNCA carrega o player do YouTube diretamente; sempre pela
  página-ponte (ADR-012). Nenhum fallback fora do app (deep link, QR).
- **D-002** — Candidatos = provedor (0–1) + TMDB (0–n), somados, provedor
  primeiro, sem repetir `videoId`, no máximo 5; só os dois primeiros são usados
  (preferido + um reserva). Regra completa em `logic/candidatos-de-trailer.md`.
- **D-003** — Os dados do trailer vêm das MESMAS respostas que a 032 já busca ao
  abrir o detalhe (`get_vod_info`, `get_series_info`, detalhe do TMDB com
  `append_to_response=credits,videos`). Nenhum endpoint novo, nunca por foco.
- **D-004** — TMDB com `include_video_language=pt,en,null`: português, inglês e
  sem idioma. Outros idiomas ficam fora.
- **D-005** — Registro TMDB `matched` sem `trailerVideos` (gravado antes da 033) é
  repedido UMA vez ao abrir o detalhe, mesmo dentro dos 6 meses. `no_match` e
  `dead_id` não são repedidos.
- **D-006** — `PROVIDER_FIELDS_VERSION = 2`: metadata do provedor gravada com
  versão menor conta como vencida mesmo dentro das 24 h (senão um título aberto
  hoje ficaria até um dia sem trailer — inclusive na passada física).
- **D-007** — Protocolo da ponte v1 (`logic/pagina-ponte.md` §3): URL com só `v`;
  app → ponte `toggle`/`stop`/`seek-by`; ponte → app `ready`/`playing`/`paused`/
  `ended`/`seeked`/`error{code}`/`api-failed`. App aceita só origem da ponte **e**
  janela do iframe atual.
- **D-008** — Prazo de 15 s contado do OK, um por abertura (o reserva usa o que
  sobrou); "Tentar de novo" dá prazo novo. Troca de candidato só em 100/101/150/2,
  uma vez. 153 nunca troca (`logic/sessao-de-trailer.md` §4).
- **D-009** — `TrailerLayer` é genérico: não conhece catálogo, estado do usuário
  nem AVPlay; recebe `title`, `candidates`, `onClose`. Fechar não invalida nada.
- **D-010** — Hospedagem: GitHub Pages do repositório público `johnosd/ccplaytv`,
  publicando **só** a pasta `bridge/` por GitHub Actions. Habilitar o Pages e
  publicar em `main` são ações do usuário (externas), nunca automáticas.
- **D-011** — O botão fica sempre no mesmo índice; três estados
  (`Trailer…`/disponível/`Trailer — indisponível`); ordem das outras ações
  intocada (`logic/botao-trailer.md`).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Trailer do provedor funciona sem chave nem conta; TMDB é opcional (BYOK). |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | Só o id público do vídeo vai à ponte (D-007, contrato C4); chave TMDB só ao TMDB (contrato 2 da 032 continua valendo); erro sanitizado com código próprio (`trailerErrorMessage`). A ponte não tem chave. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Não toca categorias. |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Sem candidato = "indisponível"; teaser nunca vira trailer; making-of descartado; id inválido = ausente (contrato C1). TMDB só pelo casamento já validado da 032. |
| Comandos Locais Independem de Rede | ✅ | ✅ | RETURN fecha localmente sem esperar a ponte; OK/←/→ viram mensagem local ao iframe. |
| Trailers e Metadados Não Alteram o Estado Principal da Obra | ✅ | ✅ | `TrailerLayer` não toca `userStateRepository`; `onClose` não invalida estado (D-009, contrato C5). |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | ✅ | ✅ | Abrir/pausar/buscar/fechar por OK/setas/RETURN; RETURN fecha a camada antes do detalhe. |
| Lista de Catálogo ≠ Manifesto | ✅ | ✅ | Não se aplica. |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | Carregando: "Cancelar"; tocando: "⏸ Pausar"; pausado: "▶ Continuar"; erro: ações do `ErrorState` — sempre um `.tv-focus` ativável por OK (FR-023, contrato C4). Foco no botão nunca consulta nada. |
| Voltar Restaura Foco e Posição | ✅ | ✅ | O detalhe fica montado por baixo; o foco volta ao botão Trailer (contrato C5). |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Cache de trailer no `titleMetadata`, chaveado por `stableId` (032). Nada de estado de usuário. |
| Progresso e Capacidades São Reais | ✅ | ✅ | Sem barra de progresso inventada; "Carregando" não encobre erro (prazo de 15 s e códigos). |
| Documentação do Repositório É Canônica | ✅ | ✅ | Polish atualiza `CLAUDE.md`, backlog, ADR-012 (tabela de páginas-ponte → "entregue") e a plataforma medida (Tizen 9/Chromium 120) onde citada. |
| Restrição: Plataforma-alvo | ⚠️ | ⚠️ | O texto diz Tizen 8.0/Chromium 108; o aparelho reportou 9.0/120. Não muda o design (build `chrome108` segue seguro); registrado como R-006 para emenda da constitution/CLAUDE.md pelo usuário. |
| Restrição: Ambiente de execução (client-first) | ⚠️ | ✅ | A ponte é recurso hospedado — permitido pela ADR-012 (emenda da ADR-008), sem lógica de servidor. |
| Restrição: Uso comercial / licenças | ✅ | ✅ | Player oficial, sem ocultar anúncio/branding; sem extração (ADR-006 §8). |
| Restrição: Design system | ✅ | ✅ | Camada com tokens V14 e componentes da 022; nada literal (exceto dentro da ponte, que não é o app). |
| Restrição: Validação em hardware real | ✅ | ✅ | Elevado a gate obrigatório por esta feature (SC-001/SC-002), como a exceção prevê. |
| Fluxo: testes, E2E, revisão de segredos | ✅ | ✅ | Vitest por task, novo `e2e/trailers.mjs` no `test:e2e`, revisão de segredos no Polish. |

Nenhuma violação não justificável. O único ponto fora do texto da constitution
(a página hospedada) já foi decidido formalmente na ADR-012.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/033-trailers-filmes-series/
├── spec.md
├── plan.md                      # este arquivo
├── tasks.md
├── quickstart.md
├── contract-tests.lock
├── handoff.md
└── logic/
    ├── candidatos-de-trailer.md # fontes, ordem, cache (D-002..D-006)
    ├── sessao-de-trailer.md     # máquina de estados + TrailerLayer + teclado
    ├── pagina-ponte.md          # protocolo, conteúdo e publicação da ponte
    └── botao-trailer.md         # estados/rótulos/OK do botão nos detalhes
```

Sem `data-model.md` (os campos novos são três, descritos em
`logic/candidatos-de-trailer.md` §1/§5 e comentados em `db.ts`) e sem
`research.md` (a incerteza técnica foi resolvida pelo spike da avaliação).

### Source Code (repository root)

```text
bridge/                                   # NOVO — publicado no GitHub Pages (só esta pasta)
└── trailer/index.html
.github/workflows/bridge-pages.yml        # NOVO
tv-web/
├── e2e/
│   ├── trailers.mjs                      # NOVO (entra no test:e2e)
│   └── trailers-real.mjs                 # NOVO (fora do test:e2e; .env, só contagens)
├── package.json                          # test:e2e += node e2e/trailers.mjs
└── src/
    ├── components/
    │   ├── TrailerLayer.tsx              # stub → implementar
    │   └── TrailerLayer.trailers.contract.test.tsx   # TRAVADO
    ├── features/
    │   ├── movies/MovieDetailScreen.tsx  # botão real + camada
    │   ├── movies/MovieDetailScreen.trailers.contract.test.tsx  # TRAVADO
    │   ├── series/SeriesDetailScreen.tsx # botão real + camada
    │   └── vod/trailerAction.ts          # NOVO (estado/rótulo do botão, puro)
    ├── lib/
    │   ├── catalog/db.ts                 # TrailerVideoRef, trailerVideos, providerVersion (já no stub)
    │   ├── comingSoon.ts                 # remove 'trailer'
    │   ├── useRemoteNav.ts               # só o comentário de onMediaKey (não é mais só do PlayerLayer)
    │   ├── metadata/
    │   │   ├── providerMetadata.ts       # youtube_trailer → trailerVideos
    │   │   ├── tmdbMapping.ts            # videos → trailerVideos
    │   │   ├── tmdbLookup.ts             # append_to_response=credits,videos + include_video_language
    │   │   ├── titleMetadata.ts          # merge de trailers, lacuna, refetch (D-005/D-006)
    │   │   ├── titleMetadataStore.ts     # PROVIDER_FIELDS_VERSION, providerVersion
    │   │   ├── types.ts                  # TitleMetadataView.trailers (já no stub)
    │   │   └── titleMetadata.trailers.contract.test.ts  # TRAVADO
    │   └── trailer/                      # NOVO
    │       ├── trailerCandidates.ts      # stub → implementar
    │       ├── trailerCandidates.trailers.contract.test.ts  # TRAVADO
    │       ├── trailerSession.ts         # stub → implementar
    │       ├── trailerSession.trailers.contract.test.ts     # TRAVADO
    │       └── bridgeConfig.ts           # URL/origem/protocolo; parseBridgeMessage é stub
    └── styles/player.css                 # estilos da camada (ou trailer.css importado em main.tsx)
```

**Structure Decision**: tudo do app em `tv-web/src`, seguindo as pastas já em
uso: lógica pura em `lib/trailer/` (como `lib/epg/`, `lib/metadata/`), camada
genérica em `components/` (como `PlayerLayer`), fiação nas telas de
`features/movies` e `features/series`, helper compartilhado entre as duas em
`features/vod/` (onde já vivem `DetailMetadata`/`detailMetadataFormat`). A ponte
fica na raiz em `bridge/` — fora de `tv-web/` para nunca entrar no `.wgt` nem no
build Vite.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Recurso hospedado (página-ponte) num app client-first | Único caminho que toca YouTube na TV (`file://` → erro 153) | IFrame direto, deep link e app hospedado testados/rejeitados na ADR-012 |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base:

```powershell
cd tv-web
npx tsc -b
npm run lint
npx vitest run                    # suíte toda (flakes conhecidos: *.favorites.test.tsx, LiveScreen.test.tsx — confirmar isolado)
npm run build:tizen
npm run dev                       # em outro terminal, para E2E
node e2e/trailers.mjs
npm run test:e2e
```

- **Unitário**: `trailerCandidates` (ordem, rótulos, idioma desconhecido),
  `trailerSession` (todas as linhas das tabelas §3/§4), `parseBridgeMessage`,
  `trailerAction` (estados), `providerMetadata`/`tmdbMapping` (campo novo),
  `titleMetadata` (D-005 refetch único, D-006 versão, série adiada).
- **Componente**: `TrailerLayer` (erro com ações, retry remonta iframe, prazo com
  fake timers, seek single-flight, app oculto fecha, onClose uma vez),
  `SeriesDetailScreen` (checking enquanto episódios pendentes).
- **E2E** (`e2e/trailers.mjs`): ponte REAL servida por `page.route` + YT fake
  (`logic/pagina-ponte.md` §7): abrir/fechar com foco, OK pausa, fim fecha,
  fallback 150 → reserva, sem rede, indisponível com dica, grade sem consultas.
- **Manual/TV**: `quickstart.md` — gate SC-001/SC-002.

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/lib/trailer/trailerCandidates.trailers.contract.test.ts`,
`tv-web/src/lib/metadata/titleMetadata.trailers.contract.test.ts`,
`tv-web/src/lib/trailer/trailerSession.trailers.contract.test.ts`,
`tv-web/src/components/TrailerLayer.trailers.contract.test.tsx`,
`tv-web/src/features/movies/MovieDetailScreen.trailers.contract.test.tsx`

Comando (de `tv-web/`):
`npx vitest run src/lib/trailer src/lib/metadata/titleMetadata.trailers.contract.test.ts src/components/TrailerLayer.trailers.contract.test.tsx src/features/movies/MovieDetailScreen.trailers.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| C1 `trailerCandidates` — provedor primeiro e TMDB ordenado… | FR-003/FR-004/FR-007; Constitution "Nunca Inventam Dados" | Fase 2 | `Error: not implemented` |
| C2 `ensureTitleMetadata` — youtube_trailer 1º; videos na mesma chamada… | FR-002/003/004/005, SC-004 | Fase 2 | `AssertionError: expected undefined to deeply equal [...]` |
| C3 `trailerSession` — bloqueado tenta o próximo uma vez… | FR-017/018/019, US3 | Fase 2 | `Error: not implemented` |
| C4 `TrailerLayer` — ponte só com o id; mensagens validadas; OK/fim/RETURN | FR-009/010/011/013/014/023 | Fase 3 | `Error: not implemented` (render do stub) |
| C5 `MovieDetailScreen` — "Trailer…", indisponível com dica, abre e devolve o foco | FR-001/006/008/009/014/016; Constitution "Trailers… Não Alteram o Estado" | Fase 3 | `Unable to find an element with the text: Trailer…` |

Vermelho confirmado em 2026-09-29 (5/5, nenhum por import/tipo). `tsc -b` limpo
com os stubs; suítes de `lib/metadata`, `features/movies`, `features/series`
verdes exceto os 2 contratos novos e os flakes conhecidos
`MoviesScreen.favorites`/`SeriesScreen.favorites` (8/8 isolados).

Stubs criados pelo plan (ponto de partida do execute, não travados):
`tv-web/src/lib/trailer/trailerCandidates.ts`, `tv-web/src/lib/trailer/trailerSession.ts`,
`tv-web/src/lib/trailer/bridgeConfig.ts` (`parseBridgeMessage`),
`tv-web/src/components/TrailerLayer.tsx`; tipos em `tv-web/src/lib/catalog/db.ts`
(`TrailerVideoRef`, `TitleFields.trailerVideos`, `TitleMetadataRecord.providerVersion`)
e `tv-web/src/lib/metadata/types.ts` (`TitleMetadataView.trailers`).

Travas de **outras** features que esta toca: 032 (`titleMetadata.metadata-tmdb`,
`MovieDetailScreen.metadata-tmdb`) — devem continuar verdes; 025
(`vodMetadata.filmes-series-ds-v14`, `MoviesScreen.filmes-series-ds-v14`) e 028
(`accessibleNames`) — rodar no Polish.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 — ponte + workflow | T001–T003 feitas; T004 (publicar Pages) é ação do usuário, pendente |
| Fase 2 — fundação | concluída: candidatos, sessão, `parseBridgeMessage`, captura provedor/TMDB, refetch D-005/D-006 |
| Fases 3–5 — US1/US2/US3 | código e testes de unidade concluídos: `TrailerLayer`, `trailerAction`, botão real em filme e série, reserva automática, seek/teclas de mídia, faixa |
| Fase 6 — Polish | T037–T041 concluídas (E2E 3/3 verde, suíte completa, `test:e2e` 16 scripts, segredos, docs); T042 (gate da TV) aberto e depende da ponte publicada (T004) |
| Ponte publicada (T004) | **sim, em 2026-09-29**: `main` recebeu só o commit da ponte + remoção do `static.yml` genérico (que publicava o repo inteiro); `https://johnosd.github.io/ccplaytv/trailer/?v=…` responde 200 e monta o player oficial; só `bridge/` é servido (raiz, `bridge/trailer/` e `tv-web/` dão 404). Falta o gate da TV (T042) |
| Contratos | 5/5 travados, íntegros e verdes (C1 emendado, R-009) |
| SC-005 (medição real) | provedor: 20 % das séries (12/60) e 13 % dos filmes (8/60) têm `youtube_trailer`; TMDB não medido (sem chave no `.env`) |
| Ponte publicada (T004) | o usuário disse ter publicado o workflow em `main`, mas `https://johnosd.github.io/ccplaytv/trailer/` respondeu 404 em 2026-09-29 — `bridge/` ainda não está versionado/enviado |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | A ponte em **HTTPS público** pode não se comportar como a http da LAN usada no spike (ex.: YouTube tratar `github.io` diferente) | Alto — sem isso a feature não entrega | Resolvido (confirmado na TV em 2026-09-29 (o trailer tocou pela ponte em https).) Primeira verificação da passada física (SC-001). Antes dela, dá para testar a ponte publicada no navegador do PC abrindo `?v=<id>` direto. |
| R-002 | O YouTube (ou o iframe) pode puxar o foco do documento do app na TV, e as teclas pararem de chegar | Alto — RETURN preso | Resolvido (RETURN e as teclas seguiram chegando ao app na TV; `window.focus()` no `ready` funcionou.) Spike mostrou `activeElement=BODY` e teclas no app; o host chama `window.focus()` após carregar e ao receber `ready`. Gate SC-002. |
| R-003 | Publicar a ponte depende de ações externas do usuário (habilitar Pages, merge em `main`) | Médio — bloqueia o gate, não o código | Resolvido (ponte publicada com confirmação do usuário (T004).) Tarefa explícita que pede confirmação; até lá o app mostra erro com "Tentar de novo", nunca trava. |
| R-004 | Leitura de estado velho em tecla rápida (lição da 027 no `PlayerLayer`) | Médio | Resolvido (estado da sessão por ref, coberto por testes (OK repetido, seek, fechamento uma única vez).) Estado da sessão em ref + render forçado, ou `useReducer` com handlers lendo ref; teste de OK repetido. |
| R-005 | Anúncio do YouTube antes do trailer pode passar dos 15 s | Baixo | Resolvido (anúncios passam de 15 s na TV; tratado por R-013 (prazo de 90 s com o player vivo), confirmado no Wardriver.) Prazo conta até `playing`; se o anúncio reportar `playing`, ok; senão vira `TRL-TEMPO` com "Tentar de novo". Medir na TV. |
| R-006 | Constitution/CLAUDE.md dizem Tizen 8.0/Chromium 108; o aparelho reportou 9.0/120 | Baixo (documental) | Resolvido (constitution emendada para 1.6.1 em 2026-09-30, a pedido do usuário; `CLAUDE.md` corrigido no Polish). Polish corrige `CLAUDE.md`; a constitution é emendada só pelo usuário — registrar a sugestão. |
| R-007 | Refetch de TMDB para `matched` antigos (D-005) e provedor versão 1 (D-006) aumentam chamadas na primeira abertura de cada título depois do deploy | Baixo | Resolvido (sem laço: uma vez por título (testes de `titleMetadata.trailers.test.ts`).) Só ao abrir detalhe, uma vez por título; sem laço. |
| R-008 | Autoplay com som pode ser bloqueado em algum firmware | Baixo | Resolvido (o autoplay tocou na TV; sem indício de bloqueio.) A ponte chama `playVideo()` no `onReady`; se não tocar, prazo → erro com "Tentar de novo" (o OK é gesto do usuário na TV). |
| R-009 | Emenda do contrato C1 (aprovada pelo usuário, 2026-09-29): o teste usava `'nao-e-um-id'` como id inválido, mas a string tem 11 caracteres e passa em `/^[A-Za-z0-9_-]{11}$/` — impossível de rejeitar sem tratar o valor do teste de forma especial | Médio — contrato inalcançável por implementação honesta | Resolvido (contrato emendado, trava regravada e íntegra.) Só essa linha mudou (`'nao-e-um-id'` → `'curto'`, 5 caracteres, já usado no mesmo teste como inválido); trava regravada com `-Write`. A regra real de id do YouTube não mudou. |
| R-010 | O herói do Início (`HomeContent`) usava o mesmo mock `trailer` que FR-021 manda remover; removê-lo faria o OK no herói lançar erro | Baixo | Resolvido (`comingSoon.test.ts` e `HomeContent` verdes.) Ganhou o mock próprio `home-trailer` (mesma mensagem, item 32): o herói do Início segue fora do escopo da 033 (spec, "Trailers fora do detalhe"). Desvio pequeno; `comingSoon.test.ts` atualizado. |
| R-011 | **Resolvido (ad-hoc T043, aprovado pelo usuário em 2026-09-29): causa = `ensureCategory` julgava a frescura pelo retrato da categoria que a tela guarda (a lista `useCategoryList` nunca é relida depois de uma obtenção), sem `itemsFetchedAt`; ao voltar do detalhe a categoria parecia "nunca obtida" e o painel era consultado de novo. Agora vale o registro gravado; regressão em `categoryLoader.test.ts`; conferido no navegador (um só `get_vod_streams` e o 2º detalhe abre).** Achado original: no E2E com painel fictício, voltar do detalhe de um filme para a grade refaz o `get_vod_streams` e troca os ids dos canais (ids 1–5 → 6–10); abrir OUTRO filme dali mostra "Este filme não está mais no catálogo". Reproduzido SEM abrir trailer (baseline: detalhe → Escape → grade → 2ª chamada de `get_vod_streams`), portanto anterior à 033. Não verificado contra painel real (o `itemsFetchedAt` fresco deveria impedir o novo fetch) | Possivelmente alto (se ocorrer com painel real) | O E2E da 033 contorna abrindo uma grade nova por filme (`openMovieDetail`, `fresh`). Reportado ao usuário para decidir: corrigir agora ou logar `[Bug]` no backlog. |
| R-012 | Passada na TV (Wardriver): o TMDB lista o dublado de um canal agregador e dois oficiais das distribuidoras; a ordem "português antes de oficial" escolhia o agregador, cheio de anúncios | Médio | Resolvido (ordem oficial>idioma aplicada e testada; C1 regravado.) Emenda aprovada pelo usuário: "tipo, oficial, idioma". C1 emendado (só a ordem esperada) e regravado; spec FR-004, `logic/candidatos-de-trailer.md` e T044. Não elimina anúncios (são do YouTube, ADR-012 §4). |
| R-013 | Passada na TV: dois anúncios seguidos passam de 15 s (anúncio não conta como "tocando") e o app derrubava tudo com TRL-TEMPO | Alto — gate SC-001 | Resolvido (confirmado na TV: dois anúncios e depois o trailer.) `bridge-ready` alarga o prazo para 90 s com o player vivo; faixa avisa dos anúncios; "Cancelar" sempre ativável; spec FR-018 e T045. A decisão de 90 s é estimativa — reavaliar na próxima passada. |
| R-014 | **Aberto, não explicado:** na TV o usuário viu "vídeo sem relação com o filme" depois de anúncios (Wardriver). O código fecha a camada no fim do vídeo e não encadeia outro; o TMDB só lista trailers desse filme. Hipóteses: o próprio anúncio, ou vídeo diferente do pedido | Médio | Reobservar com o build novo. Se repetir, anotar o que aparece (título/canal) e considerar validar `getVideoData().video_id` na ponte contra o id pedido. |
| R-015 | **Passada na TV física, 2026-09-29 (relato do usuário, build com R-012/R-013).** Observado pelo usuário: Wardriver passou por dois anúncios e depois tocou o trailer (R-013 confirmado na TV); "o resto funcionou tudo conforme esperado"; ao terminar o trailer a tela volta ao detalhe do filme; RETURN fechou corretamente. **Não informado, portanto "não testado" até dizerem o contrário:** contagem de SC-001 (≥ 9/10 começando em 15 s, com ou sem anúncio), contagem de SC-002 (10/10 RETURN sem áudio remanescente), teclas Play/Pause e ←/→ no trailer, sair do app com o trailer tocando, filme (AVPlay) seguido do trailer sem áudio duplo, e o "vídeo sem relação" de R-014 (não reapareceu no relato) | Gate T042 | **Gate T042 fechado por DECISÃO EXPLÍCITA do usuário em 2026-09-29** (escolheu "fechar com o que foi visto"): os itens "não testados" acima ficam como risco aceito, não como aprovados. Reabrir se algum aparecer com defeito. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-29 | Fase 1 (parcial) | Ponte `bridge/trailer/index.html` e workflow `bridge-pages.yml` criados; verificados localmente (id válido cria o player, inválido não) | T004: usuário habilitar Pages e publicar |
| 2026-09-29 | Fase 2 | Fundação implementada (C1–C3 verdes, 441 testes); C1 emendado (R-009); 2 fixtures da 032 ajustados | T004: URL da ponte ainda 404 |
| 2026-09-29 | Fases 3–5 | `TrailerLayer` + botão real + reserva + seek/teclas de mídia; C4/C5 verdes; 3 flakes sob paralelismo (isolados passam); SC-005 parcial | TMDB de SC-005 sem chave; ponte ainda não publicada |
| 2026-09-29 | Fase 6 | E2E `trailers.mjs` (ponte real + YT falso) 3/3; `test:e2e` 16 scripts exit 0; vitest 1780/1784 (4 flakes, 106/106 isolados); 17 travas íntegras; docs atualizados | T004 (ponte não publicada, URL 404) e T042 (gate da TV); R-011 aguarda decisão |

| 2026-09-29 | T004 + T043 | Ponte publicada no Pages (`static.yml` removido do `main`, só `bridge/`); R-011 corrigido em `ensureCategory` (ad-hoc T043); suíte 1781/1785 (4 flakes isolados 106/106) e `test:e2e` 16 scripts verdes | T042 (gate da TV) |

**PRÓXIMO**: T042 — passada na TV física com a skill `tizen-tv` (SC-001: ≥ 9/10 trailers começam em 15 s; SC-002: 10/10 RETURN fecha com foco e sem áudio), com o app instalado de um build que use a ponte publicada. Depois `sdd-converge`.

## Arquivos Principais

- `bridge/trailer/index.html`, `.github/workflows/bridge-pages.yml`
- `tv-web/src/lib/trailer/*` (stubs a implementar), `tv-web/src/lib/metadata/*`

## Cuidados para Retomada

- (nenhum ainda)


## Resultado Final

**Convergida em 2026-09-29** (`sdd-converge`): sem achado CRITICAL nem HIGH; os 23 FRs e os 6 SCs
têm evidência no código ou na verificação, com as exceções abaixo, todas aceitas ou registradas.

**O que foi construído.** O botão "▶ Trailer" é real no detalhe de filme e de série (o mock `trailer` saiu
de `comingSoon.ts`). Os candidatos vêm do `youtube_trailer` do provedor e dos `videos` do TMDB, na
mesma chamada de detalhe que a 032 já faz, sem requisição nova e nunca por foco. `TrailerLayer` é uma
camada de tela cheia, genérica, que carrega a página-ponte da ADR-012
(`https://johnosd.github.io/ccplaytv/trailer/`, publicada em 2026-09-29, só `bridge/`) num iframe; só o id
do vídeo vai na URL; app e ponte falam por `postMessage` v1 validado (origem e janela do iframe). A
máquina de estados pura (`trailerSession.ts`) decide carregando/tocando/pausado/erro, o prazo e a
troca única para o reserva. 5/5 contratos verdes e travados; testes de unidade, de componente e
`e2e/trailers.mjs` (ponte real + player do YouTube falso) no `test:e2e`.

**Desvios em relação ao plano original** (todos com R-00X e aprovados quando exigiam decisão):
- **R-009**: contrato C1 emendado — o id inválido de exemplo tinha 11 caracteres.
- **R-010**: o herói do Início ganhou o mock `home-trailer` (fora do escopo da 033).
- **R-011 / T043**: bug pré-existente em `ensureCategory` (frescura pelo retrato da categoria) corrigido
  com aprovação; voltar do detalhe para a grade refazia o `get_vod_streams` e trocava os ids.
- **R-012 / T044**: prioridade do TMDB passou a "tipo, oficial, idioma" (C1 emendado de novo, só a ordem).
- **R-013 / T045**: prazo de 90 s depois do `ready` da ponte (dois anúncios seguidos derrubavam o trailer
  com TRL-TEMPO na TV); a faixa avisa dos anúncios e o vídeo fica à vista.
- **T004**: o `main` tinha um `static.yml` genérico que publicava o repositório inteiro; foi removido
  (com confirmação do usuário) e só o commit da ponte foi ao `main`.
- Dois bugs da `TrailerLayer` achados só pelo E2E: o StrictMode (dev) do remonte de efeito e o `stop` do
  desmonte, que exigiu `useLayoutEffect`.

**Decisões que ficaram diferentes do plano.** D-002 (ordem dos candidatos) e D-008 (prazo de 15 s) foram
emendadas por R-012 e R-013 — a redação original das Decisões Invariantes ficou como estava, e a
spec (FR-004, FR-018) e `logic/` já refletem as emendas.

**Aberto, registrado, sem bloquear a convergência:**
- **R-015**: o gate da TV (T042) foi fechado por decisão explícita do usuário. Confirmado na TV: Wardriver
  com dois anúncios e depois o trailer, fim voltando ao detalhe, RETURN correto. **Não testados:** as
  contagens SC-001 (9/10) e SC-002 (10/10), Play/Pause e ←/→, sair do app com o trailer tocando e
  filme + trailer sem áudio duplo.
- **R-014**: "vídeo sem relação" visto uma vez depois de anúncios, sem explicação; não reapareceu.
- **R-006** (resolvido após a convergência, 2026-09-30): a constitution foi emendada para 1.6.1 pelo usuário (Tizen 9.0 / Chromium 120).
- **SC-005**: só o lado do provedor foi medido (12/60 séries, 8/60 filmes); o do TMDB depende de uma chave no `.env`.
  **Atualização 2026-09-30, com a chave TMDB no `.env` (amostra de 60 títulos, só contagens):** **filmes** — provedor 4/60 (7 %), TMDB 45 dos 59 verificados (76 %), ambos 4, **algum candidato 45/60 (75 %)**, nenhum 15; **séries** — provedor 8/60 (13 %); o TMDB **não foi medido** para séries, porque o script só consulta por `tmdb_id` e a listagem de séries do painel não traz esse id (o app casa série por título + ano; medir isso exigiria replicar a regra de casamento no script). Consequência prática: filmes têm trailer para cerca de 3 em cada 4 títulos com a chave TMDB; para séries só o número do provedor (~13–20 %) é conhecido.
