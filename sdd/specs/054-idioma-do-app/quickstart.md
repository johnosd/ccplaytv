# Quickstart — Idioma do app (feature 054)

## Pré-requisitos

- `npm run dev` em `tv-web/` (E2E em :5173).
- Chave TMDB válida em Integrações (BYOK) e uma lista Xtream de teste (`CCPLAY_PROBE_*` do `.env` da raiz, nunca exibida).

## Checagens automatizadas (em `tv-web/`)

```powershell
npx tsc -b
npm run lint
npx vitest run src/lib/i18n src/lib/metadata src/features/settings src/lib/trailer
npm run test            # suíte inteira (default pt: nenhum teste antigo pode mudar de texto)
npm run test:e2e -- --only idioma-do-app,metadata-tmdb,trailers,home-busca-configuracoes
npm run build:tizen     # os catálogos entram no index.js; nenhum arquivo novo emitido, mas confira findUnlistedFiles
```

Contratos: `npx vitest run src/lib/i18n/appLanguage.idioma-do-app.contract.test.ts src/lib/metadata/titleMetadata.idioma-do-app.contract.test.ts src/features/settings/SettingsScreen.idioma-do-app.contract.test.tsx`
e `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 054-idioma-do-app`.

## Cenário ponta a ponta (navegador/emulador)

1. App sem preferência gravada (`localStorage.clear()`), navegador em `en-US` → abre em English. Em `ja-JP` → Português.
2. Configurações → Acessibilidade & sistema → "Idioma" → Español: textos trocam na hora, foco permanece na linha (US1).
3. Percorrer Início, Live TV, Filmes, Séries, Busca, Favoritos, Histórico, Fontes, Integrações, Player (chrome, painéis de áudio/legenda/qualidade, erro): nenhum texto próprio em português (SC-001). Nomes de canal/categoria/título do provedor **inalterados** (SC-005).
4. Abrir o detalhe de um filme já visto: uma única consulta ao TMDB com `language=es-ES`, sinopse em espanhol; reabrir: nenhuma consulta nova (SC-003). Navegar/focar cards: zero consultas.
5. Título sem sinopse em espanhol: aparece em inglês (ou original) com "em {idioma}" traduzido.
6. Trailer: título com trailers só em `en` e `fr` com idioma = es → o botão oferece o inglês e o rótulo diz "· Inglés" (US3).
7. Datas/horas do guia, duração e países nos formatos/nomes do idioma (US4).
8. Trocar o idioma com um vídeo tocando: a reprodução não reinicia (FR-014); com modal aberto o foco não se perde.
9. Quem tinha "Idioma preferido (trailers)" gravado (`ccplaytv:player-preferences.preferredLanguage`) e nada em `ccplaytv:app-language` abre no idioma antigo (SC-007).

## TV física (SC-006 e R-001) — recomendação forte, gate desta feature

- Idioma da TV Samsung em Español/English → o app abre no idioma certo (`navigator.languages` no aparelho).
- Textos longos (en/es) não cortam botões, topbar, cards nem painéis a 1920×1080; foco continua visível.
- Fluxo da US1 por controle remoto, e um trailer em fallback de idioma.

## Itens cross-cutting da constituição

- Foco: seletor de idioma operável só por setas/OK/RETURN; estados vazio/erro/carregando em en/es com elemento focável.
- Segredos: nenhuma mensagem traduzida interpola URL/credencial/chave.
- Documentação: `README.md`/`CLAUDE.md` só se surgir regra permanente (ex.: "texto novo entra pelo catálogo `lib/i18n`"); status vai no `plan.md`/backlog.
