# Handoff — 059-detalhe-cinema-filme-serie

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. React 19 + TS + Vite 8 em `tv-web/`, alvo Tizen 9 / `chrome108` (não remover de `vite.config.ts`).
- Próximo comando: `/sdd-execute 059-detalhe-cinema-filme-serie`. Backlog: **Planejada** (0/48 itens, contando o Checklist de Release).
- Substitui a `051-detalhe-filme-paridade-v14` (nunca executada; marcada "Substituída pela 059"). **Não executar a 051.**
- Mudou em disco nesta sessão e precisa ser relido antes de editar: `docs/design/design-system/CCPlayTV_Tizen_Ultimate_Prototype_v13_2.html` (`details()` novo — é a referência visual), a seção "Detalhe de filme e de série" da Spec V14, e o contrato emendado `tv-web/src/features/movies/MovieDetailScreen.semelhantes.contract.test.tsx`.

## O que a feature entrega

- **US1 (P1)** — hero "Cinema" no detalhe do filme: backdrop em tela cheia → cor da capa → gradiente neutro; capa 400×600 com brilho; categoria em chip próprio antes dos gêneros; primária com barra + "faltam X" só com posição E duração reais; demais ações em ícones redondos com rótulo só no foco.
- **US2 (P2)** — o mesmo hero na série; a barra é a **do episódio** da primária. A série **não** ganha Reiniciar nem Marcar assistido.
- **US3 (P3)** — abas renovadas: Detalhes em cartões, Elenco com foto redonda maior, Semelhantes em **duas linhas** ("Na sua lista" / "Não encontrados na sua lista") com navegação 2D. **Sem selo visível** nos cartões (decisão do usuário).
- Decisões que contrariam o óbvio: as **telas continuam donas do foco** (componentes novos são só apresentação); os **rótulos das ações não mudam** (inclusive "↺ Reiniciar" com o glifo); o **contrato da 035 foi emendado** com autorização do usuário; a **TV física é gate**.

## Leitura obrigatória, em ordem

1. `spec.md` — escopo, FR-001..FR-025, SC-001..SC-008, Clarifications de 2026-10-05.
2. `plan.md` — D-001..D-012, Complexity Tracking (emenda da 035), riscos R-001..R-008, comandos.
3. `logic/hero-cinema.md` — árvore do hero, fundo, marcação da primária e dos ícones (nó de texto direto!), chips, rolagem.
4. `logic/semelhantes-duas-linhas.md` — seções, `sr-only`, `panelRows` + `movePanelFocus`.
5. `logic/cor-da-capa.md` — `useCoverColor` e a regra `dominantColorFromPixels`.
6. `tasks.md` — T001..T037 + Checklist de Release.
7. `quickstart.md` — 13 cenários + roteiro da TV.
8. `.planning/memory/constitution.md` — foco, voltar, progresso real, segredos, "Validação em hardware real" (exceção usada aqui).

## Testes de contrato

Travados em `sdd/specs/059-detalhe-cinema-filme-serie/contract-tests.lock` (5/5):

| Arquivo | Casos | Fase |
| --- | --- | --- |
| `tv-web/src/features/vod/detailProgress.detalhe-cinema.contract.test.ts` | 1 | 2 |
| `tv-web/src/lib/color/coverColor.detalhe-cinema.contract.test.ts` | 1 | 2 |
| `tv-web/src/features/movies/MovieDetailScreen.detalhe-cinema.contract.test.tsx` | 2 (hero → Fase 3; Semelhantes → Fase 5) | 3 e 5 |
| `tv-web/src/features/series/SeriesDetailScreen.detalhe-cinema.contract.test.tsx` | 1 | 4 |

Mais o contrato **emendado** da 035 (`MovieDetailScreen.semelhantes.contract.test.tsx`, retravado 5/5 em `sdd/specs/035-semelhantes-elenco-ator/contract-tests.lock`): o 1º caso fica vermelho até a Fase 5.

Rodar (de `tv-web/`):

```powershell
npx vitest run src/features/vod/detailProgress.detalhe-cinema.contract.test.ts src/lib/color/coverColor.detalhe-cinema.contract.test.ts src/features/movies/MovieDetailScreen.detalhe-cinema.contract.test.tsx src/features/series/SeriesDetailScreen.detalhe-cinema.contract.test.tsx src/features/movies/MovieDetailScreen.semelhantes.contract.test.tsx
```

Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 059-detalhe-cinema-filme-serie` e o mesmo para `035-semelhantes-elenco-ator`, `032-metadata-tmdb-integracoes` (exige "▶ Assistir" focado e "Ver mais") e `033-trailers-filmes-series` (exige "Trailer…"/"Trailer — indisponível"/"▶ Trailer" como texto do elemento focado, Trailer no índice 2 sem retomada).

Vermelho confirmado em 2026-10-05: 6 falhas pelo motivo certo (2× `not implemented`, 4× asserção), 326 testes da área verdes, `tsc -b` limpo.

## Stubs criados

- `tv-web/src/features/vod/detailProgress.ts` — tipo `PrimaryProgress` final; `primaryProgress` lança `not implemented` (T003).
- `tv-web/src/lib/color/coverColor.ts` — `dominantColorFromPixels` lança `not implemented` (T004).

## Armadilhas já mapeadas

- **Rótulo = nó de texto direto do elemento focável** (`logic/hero-cinema.md` §3–§4): o `getByText` do Testing Library só lê os filhos de texto diretos. Rótulo dentro de `<span>` filho quebra 032/033/059 (o `className` lido seria o do span).
- **Nada de estilo no `.screen`**: `player.css` esconde só os filhos do `.screen` quando o vídeo aparece; cor/fundo no próprio `.screen` pinta sobre o vídeo (FR-025).
- **`vod-detail-action` em todas as ações** e as classes de D-010: os E2E existentes usam essas classes.
- **E2E comparam o `textContent` inteiro da primária** (R-001): com "faltam X" dentro, trocar igualdade por `startsWith` (T031). Linhas: `filmes-series-ds-v14.mjs:356/367`, `catalogo-em-blocos.mjs:307/312`, `home-busca-configuracoes.mjs:225`, `historico-continuar-assistindo.mjs:198/269`, `limpar-historico.mjs:217/228`, `trailers.mjs:230-270/455`.
- **`semelhantes-elenco-ator.mjs:305`** conta `getByText('Não encontrado na sua lista') === 2` — continua valendo porque o texto fica em `sr-only` (D-007); **não** remova esse texto.
- **`PersonScreen` usa `.similar-chip` e `NOT_FOUND_KEY`**: não apagar a regra CSS nem a constante.
- **A série troca `ContentCard` por `PosterArt` no hero** (R-006): conferir testes/E2E que procuram `.content-card` ali.
- **Duração do episódio**, não a da metadata da série (`durationPerEpisode`), na barra da série (D-004).
- **`useCoverColor` nunca loga a URL** (pode ter credencial). No jsdom o `onload` não dispara: não precisa mockar canvas nos testes de tela.
- **`vod.css`**: só acrescentar bloco ao fim; T002/T010/T025/T026 mexem no mesmo arquivo — em sequência.
- **Títulos das linhas de Semelhantes são `h3` com o nome exato** ("Na sua lista", "Não encontrados na sua lista") — o contrato procura `role=heading` por nome, sem "(n)".
- Testes não travados que vão precisar de ajuste (R-007): `MovieDetailScreen.test.tsx`, `.metadata.test.tsx`, `.elenco.test.tsx`, `.limpar-historico.test.tsx`, `SeriesDetailScreen*.test.tsx`, `SimilarPanel.test.tsx`. Ajustar o mínimo, citando a 059.
- E2E: `localhost:5173` fixo; parcial com `node e2e/run.mjs --only <nome> --jobs 1`.
- Não acrescentar parágrafo de status ao `CLAUDE.md`.

## Pendências do Analyze

- A-001 e A-002 (MEDIUM) **resolvidos** em 2026-10-05: origem em todo cartão da aba Detalhes ("Dados: TMDB"/"Dados: fonte", D-006 + `logic/hero-cinema.md` §7, T025/T029a, chave `detail.origin.source`); SC-007 medido no E2E com e sem CORS na capa (T030) e na TV (T036).
- **A-003 (LOW)** — Os rótulos reaproveitam o glifo ("↺ Reiniciar", "☰ Semelhantes") ao lado de um ícone desenhado, o que fica redundante. Recomendação: aceitar (os textos são presos por contratos); se incomodar na TV, esconder só o glifo via CSS seria inviável (o glifo faz parte do nó de texto), então mudar exigiria emendar contratos — levar ao usuário.
- **A-004 (LOW)** — FR-021 (focar não consulta) e o edge case "título longo em 2 linhas" não têm teste dedicado; cobertos por design (D-001, T010) e pelo E2E/TV.

## Gate de pronto

- Contratos da 059 (5/5) e da 035 emendada verdes; travas 059/035/032/033 íntegras.
- De `tv-web/`: `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e` completo com `npm run dev` na 5173 (inclui o novo `detalhe-cinema.mjs`).
- `quickstart.md` executado no navegador.
- **Passada na TV física = gate** (D-012, SC-008). Fechar sem ela só com decisão explícita do usuário, registrada em Riscos e Decisões.
- Docs no Polish: `plan.md` (Estado Atual, Execution Notes, PRÓXIMO, Arquivos Principais), `update-feature-status.ps1 -Slug 059-detalhe-cinema-filme-serie -Status Implementada`; `CLAUDE.md` não muda.
