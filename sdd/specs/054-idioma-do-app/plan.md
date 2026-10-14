# Implementation Plan: Idioma do app

**Slug**: `054-idioma-do-app` | **Date**: 2026-10-03 | **Spec**: `sdd/specs/054-idioma-do-app/spec.md`

## Summary

Uma preferência única de idioma do aparelho (pt/en/es), lida de `localStorage`, detectada pelo idioma da TV quando nada foi escolhido, e consumida por três
frentes: (1) a interface, via um catálogo de textos próprio e leve (`tv-web/src/lib/i18n/`) com `I18nProvider` + `useT()`, migrando as telas por área;
(2) os metadados do TMDB, que passam a pedir `language=` ao idioma do app, a registrar em que idioma foram obtidos e a rebuscar **só ao abrir o detalhe**
(cadeia de sinopse: idioma do app → inglês → original); (3) o trailer, cujo ajuste de ranking por idioma com fallback (idioma preferido → inglês → qualquer)
**já está no working tree** (feito em 2026-10-03, ainda sem commit) e aqui só troca a fonte do idioma da preferência de trailers para a preferência global.
Formatos (`Intl`) acompanham o idioma. Texto do provedor nunca é traduzido. Detalhes do "como": `logic/idioma-do-app.md`.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 / Vite 8 (build `chrome108`)

**Primary Dependencies**: nenhuma nova — catálogo e `t()` próprios (D-001); `Intl.*` do Chromium

**Storage**: `localStorage` (`ccplaytv:app-language`); IndexedDB/Dexie só ganha campos opcionais não indexados (`language` em resultado TMDB e em pessoa) — sem nova versão de schema

**Testing**: vitest (`dom` jsdom `*.test.tsx`, `node` `*.test.ts`), E2E Playwright (`tv-web/e2e/`, runner `e2e/run.mjs`)

**Target Platform**: Samsung QN50Q60DAGXZD — Tizen 9 / Chromium 120, origem `file://`

**Performance Goals**: troca de idioma refletida em ≤ 1 s (SC-002); sem remontar a árvore

**Constraints**: foco/rolagem preservados na troca; zero consulta TMDB por foco; chave BYOK só ao TMDB; nenhum arquivo novo emitido pelo build (catálogos entram no `index.js`), então `tizen_web_project.yaml` não muda

**Scale/Scope**: ~264 arquivos não-teste, 83 `.tsx` com texto em português; 3 idiomas; centenas de chaves; migração por área em fases independentes

## Decisões Invariantes

- **D-001** i18n próprio e mínimo (sem biblioteca): `lib/i18n/` com `languages.ts`, `appLanguage.ts` (store + resolução), `messages/{pt,en,es}.ts`, `t`, `I18nProvider`/`useT`. Motivo: runtime pequeno, offline, `chrome108`, sem custo de dependência.
- **D-002** `pt` é o catálogo-base e o fallback; `en`/`es` são `Record<MessageKey,string>` com as mesmas chaves e `{marcadores}` (contrato FR-004/SC-001).
- **D-003** Idioma padrão de teste = `pt`: nenhum teste existente muda de texto; testes de en/es são novos.
- **D-004** Reatividade por contexto (`useSyncExternalStore` no provedor); todo componente com texto próprio chama `useT()`; helpers puros recebem `t`/`language` por parâmetro; **nunca** `key={language}` na raiz.
- **D-005** Preferência no aparelho (`ccplaytv:app-language`); resolução: gravado > legado `preferredLanguage` de `ccplaytv:player-preferences` > `navigator.languages` suportado > `pt`; resolver não grava.
- **D-006** TMDB: `language=` = `APP_LANGUAGE_LOCALE` (`pt-BR`, `en-US`, `es-ES`); marcador `language?` no resultado `matched` e na pessoa (ausente = `pt`); rebusca só em `ensureTitleMetadata`/`loadPersonCredits`; falha nunca apaga o guardado, uma tentativa por abertura; `no_match`/`dead_id` não são invalidados.
- **D-007** Sinopse: idioma do app → `en-US` → idioma original; `synopsisLanguage` quando ≠ idioma do app; provedor continua vencendo.
- **D-008** Trailer: regra da 033 mantida (trailer>teaser → oficial → idioma; R-012); idioma = preferido do app > `en` > resto; `include_video_language` = `pt,en,<app>,null`. A linha "Idioma preferido (trailers)" e o campo `preferredLanguage` de `PlayerPreferences` saem; o valor gravado migra (D-005).
- **D-009** Linha "Idioma" na aba Acessibilidade & sistema, **índice 1** (após "Reduzir movimento"); `ACCESSIBILITY_ROW_COUNT` = 5; seletor = `Modal` + `radiogroup` compartilhado com `PlayerTab`.
- **D-010** Áudio/legenda do player permanecem independentes (FR-013); só os NOMES de idioma exibidos nos seletores acompanham o idioma do app.
- **D-011** `Intl`/`toLocale*` de exibição usam `APP_LANGUAGE_LOCALE`; ordenação/iniciais de conteúdo do provedor (`vodSort`, `catalogSearch`, `initials`) ficam como estão.
- **D-012** Mocks "Em breve" (`lib/comingSoon.ts`) também passam pelo catálogo; continuam soft-disabled, sem dado inventado.
- **D-013** `document.documentElement.lang` acompanha o idioma.
- **D-014** Idioma do aparelho/TV por `navigator.languages`; nenhuma API Tizen nova (R-001 a validar na TV).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | Preferência local; nada de login. |
| Segredos Fora dos Clientes e dos Logs | OK | OK | Chave BYOK só ao TMDB; mensagens traduzidas nunca interpolam URL/credencial (`logic` §3); idioma é só parâmetro `language=`. |
| Categorias da Fonte São Preservadas | OK | OK | Nada do provedor é traduzido nem substituído; gêneros do TMDB seguem aditivos. |
| IA e Classificação Nunca Inventam Dados | OK | OK | Sinopse fora do idioma é **marcada** ("em inglês"); nunca traduzida por nós nem inventada; trailer em outro idioma identificado no rótulo. |
| Comandos Locais Independem de Rede | OK | OK | Trocar idioma é local e imediato; só a rebusca de metadados usa rede, e nunca bloqueia. |
| Trailers e Metadados Não Alteram o Estado | OK | OK | Rebuscar/abrir não marca assistido, progresso nem favorito. |
| Toda Ação Tem Caminho por Controle Remoto | OK | OK | Seletor por setas/OK/RETURN (D-009). |
| Lista de Catálogo ≠ Manifesto de Streaming | N/A | N/A | Importador intocado. |
| Foco Visível e Sem Becos Sem Saída | OK | OK (risco R-003) | Foco por estado mantido na troca; textos longos en/es validados na TV (SC-006). Rebusca só ao abrir detalhe, nunca ao focar. |
| Voltar Restaura Foco e Posição | OK | OK | Sem remontagem por idioma (D-004). |
| Identidade de Reprodução Não Depende da URL | N/A | N/A | Idioma não entra em chave de retomada/favorito/histórico. |
| Progresso e Capacidades São Reais | OK | OK | Textos de estado parcial/indeterminado traduzidos sem alterar o que dizem. |
| Documentação É Canônica | OK | OK | spec/plan/backlog atualizados; `CLAUDE.md` só se surgir regra permanente. |

Restrições: Tizen 9/Chromium 120 e piso `chrome108` (nenhuma API nova); client-first (nenhum backend); DS V14 (tokens, sem cor/tamanho literal — textos longos tratados com CSS existente).

## Project Structure

### Documentation (this feature)

```text
sdd/specs/054-idioma-do-app/
├── spec.md
├── plan.md               # Este arquivo
├── tasks.md
├── quickstart.md
├── handoff.md
├── contract-tests.lock
└── logic/idioma-do-app.md
```

(Sem `research.md`: sem incerteza técnica aberta que bloqueie; sem `data-model.md`: só 2 campos opcionais, descritos em `logic` §4; sem `contracts/`: nenhuma API exposta.)

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── lib/
│   │   ├── i18n/                      # NOVO: languages.ts, appLanguage.ts, translate.ts, I18nProvider.tsx, messages/{pt,en,es}.ts
│   │   ├── metadata/                  # titleMetadata.ts, tmdbLookup.ts, tmdbMapping.ts, tmdbPeople.ts, types.ts
│   │   ├── trailer/trailerCandidates.ts
│   │   ├── player/playerPreferences.ts, tracks.ts
│   │   ├── catalog/db.ts              # campo opcional `language` (resultado TMDB e pessoa)
│   │   ├── comingSoon.ts, epg/formatEpgTime.ts, catalog/sourceAccount.ts
│   ├── components/                    # Button/EmptyState/ErrorState/Modal/PlayerChrome/PlayerLayer + player/*
│   ├── features/                      # settings, shell, home, live, movies, series, vod, search, favorites, history, sources, import, profiles, person, splash
│   └── main.tsx                       # <I18nProvider>
├── e2e/idioma-do-app.mjs              # NOVO (+ registro em e2e/run.mjs)
```

**Structure Decision**: tudo em `tv-web/` (frontend). `api/` e `CCPlayTv/` não mudam (nenhum arquivo emitido novo).

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| (nenhuma) | | |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (TV).
Cada fase de migração de área: `tsc` (completude dos catálogos) + testes da área (default pt continua verde) + um teste novo por área trocando para en/es e conferindo textos-chave.

Comandos-base (em `tv-web/`):

```powershell
npx tsc -b
npm run lint
npx vitest run <arquivos>
npm run test
npm run test:e2e -- --only idioma-do-app
npm run build:tizen
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock` (5 testes):
`tv-web/src/lib/i18n/appLanguage.idioma-do-app.contract.test.ts` (2),
`tv-web/src/lib/metadata/titleMetadata.idioma-do-app.contract.test.ts` (2),
`tv-web/src/features/settings/SettingsScreen.idioma-do-app.contract.test.tsx` (1).

Comando: `npx vitest run src/lib/i18n/appLanguage.idioma-do-app.contract.test.ts src/lib/metadata/titleMetadata.idioma-do-app.contract.test.ts src/features/settings/SettingsScreen.idioma-do-app.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| gravado vence; legado de trailers; idioma da TV; senão pt | FR-011, FR-012, US5, SC-007 | Fase 2 | `Error: not implemented` (`resolveAppLanguage`) |
| en/es com as mesmas chaves e `{marcadores}` do pt | FR-004, SC-001 | Fase 2 (e todas as de área) | `expected [] to deeply equal [...]` (catálogos vazios) |
| escolher English troca a interface, foco fica, persiste | US1 AC1/AC2, FR-001..003 | Fase 3 | `expected 'Voice Guide / anúncios' to contain 'Idioma'` |
| trocar idioma rebusca ao abrir; mesmo idioma não consulta | FR-006, FR-007, SC-003 | Fase 10 | `expected [1] to have a length of 2 but got 1` |
| rebusca que falha mantém o guardado, 1 tentativa por abertura | FR-008 | Fase 10 | `expected [1] to have a length of 2 but got 1` |

Não há contrato para o ranking de trailers (US3): o comportamento já existe e está coberto por `trailerCandidates.test.ts` (teste "idioma preferido vence entre oficiais…"); um contrato verde de partida não prova nada.
Ficam sem contrato (E2E/quickstart/TV): formatos (US4), textos longos (SC-006), idioma da TV real (R-001).

Stubs criados pelo plan (não travados): `tv-web/src/lib/i18n/appLanguage.ts` (corpos `not implemented`), `tv-web/src/lib/i18n/I18nProvider.tsx` (só repassa filhos), `tv-web/src/lib/i18n/messages/{pt,en,es}.ts` (2 chaves em pt; en/es vazios), `MetadataOptions.language?` em `tv-web/src/lib/metadata/types.ts`. `languages.ts` já é real.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 (trailers) | Concluída; commit isolado pendente de decisão do usuário |
| Fase 2 (núcleo i18n) | Concluída: resolução, `translate`, `useT`, provedor, setups pt; 2 contratos verdes |
| Fase 3 (US1 núcleo + Configurações) | Concluída: linha "Idioma", seletor compartilhado, Configurações traduzida; contrato de UI verde (3/5 contratos verdes) |
| Fase 4 (componentes, shell, Início, splash, perfis, erros) | Concluída; 9 áreas no catálogo |
| Fase 5 (Live TV, guia, zapping) | Concluída; 10 áreas no catálogo |
| Fase 6 (Filmes, Séries, vitrine, detalhe, ator) | Concluída; 14 áreas no catálogo |
| Fase 7 (Player, painéis, trailer, faixas) | Concluída; 15 áreas no catálogo; FR-014 testado |
| Fase 8 (Fontes, Importação, Busca, Favoritos, Histórico) | Concluída; área `sources` no catálogo |
| Fase 9 (varredura, E2E de idioma) | Concluída; `e2e/idioma-do-app.mjs` na SUITE; `locale: 'pt-BR'` em todos os E2E |
| Fases 10–11 (TMDB e trailers por idioma) | Concluídas; 5/5 contratos verdes; trava íntegra |
| Fase 12 (formatos) | Concluída; hora do guia sempre 24 h, país no idioma do app |
| Fase 13 (Polish) | Concluída: `tsc` limpo, `lint` sem erros, `npm run test` 379 arquivos / 2534 testes verdes, E2E 33/33, `build:tizen` ok; passada na TV física feita (2026-10-05, relato do usuário) |
| Fase 14 (Convergência) | Concluída: T053, nome acessível da `HintBar` traduzido (en/es); teste novo verde |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | `navigator.languages` pode não refletir o idioma da TV Samsung | US5 degrada para `pt` | Resolvido: validado na TV física em 2026-10-05 (o app abre no idioma da TV). Validar na TV (quickstart); se falhar, avaliar `tizen.systeminfo` (LOCALE) numa emenda; escolha manual sempre disponível |
| R-002 | Superfície enorme (264 arquivos, 83 `.tsx` com texto) — risco de texto esquecido em pt | SC-001 | Resolvido: confirmado pela auditoria do `sdd-converge` de 2026-10-05. Migração por área em fases independentes; E2E em en que varre cada tela atrás de palavras-chave em pt; checklist por área em `tasks.md` |
| R-003 | Textos mais longos em en/es estouram cards/botões/topbar | Foco/legibilidade, SC-006 | Resolvido: o usuário validou na TV física em 2026-10-05 (en/es sem corte). Revisar CSS por área; validar na TV física (gate desta feature) |
| R-004 | Testes antigos que contam linhas de Acessibilidade (`ACCESSIBILITY_ROW_COUNT`) ou de Player (5ª linha) | Falha de suíte ao mover a linha | Resolvido: confirmado pela auditoria do `sdd-converge` de 2026-10-05. Atualizar `SettingsPanels.foco-sem-escala.test.tsx`, `SettingsPanels.test.tsx`, `SettingsScreen.test.tsx`, `PlayerTab.test.tsx`; contratos travados 026/041 não podem ser editados — conferir antes |
| R-005 | `es-ES` vs `es-MX` no TMDB (cobertura varia por região) | Qualidade do texto em es | Resolvido: confirmado pela auditoria do `sdd-converge` de 2026-10-05. Mapa único `APP_LANGUAGE_LOCALE`; trocar é 1 linha; fallback `en-US` cobre lacuna |
| R-006 | Funções puras que hoje devolvem texto (`sourceFormat`, `importSections`, `trailerAction`, erros) precisam receber `t` | Mudança de assinatura em vários chamadores/testes | Resolvido: confirmado pela auditoria do `sdd-converge` de 2026-10-05. Parâmetro `t` com padrão `translate('pt', …)` nos testes antigos para não reescrevê-los |
| R-007 | Trailers já guardados só têm vídeos `pt,en,null` | US3 em títulos antigos | Resolvido: confirmado pela auditoria do `sdd-converge` de 2026-10-05. Resolvido pelo design: trocar idioma rebusca o título ao abrir (D-006) |
| R-009 | `useT()` por `useSyncExternalStore` em vez de contexto (muda `logic` §2 e T005): funciona fora do provedor e dispensa envolver testes; custo = cada consumidor assina o store (listeners em `Set`) | Nenhum funcional; centenas de assinaturas triviais | Resolvido: confirmado pela auditoria do `sdd-converge` de 2026-10-05. `createTranslator` devolve 1 objeto por idioma (identidade estável); provedor só mantém `<html lang>` |
| R-010 | O app detecta o idioma do sistema: jsdom/Node/Chromium do Playwright dizem `en-US`, e os testes existentes (unit e E2E) esperam português | Suíte inteira em inglês sem preferência gravada | Resolvido: confirmado pela auditoria do `sdd-converge` de 2026-10-05. Unit: `setupTests.ts`/`setupTests.node.ts` fixam `navigator` em pt-BR. E2E: `locale: 'pt-BR'` em todo `newContext()` (feito ao rodar o primeiro E2E) |
| R-011 | `plural()` usa `n === 1 ? one : other` nos 3 idiomas (muda `logic` §3, que dizia `Intl.PluralRules`): o CLDR de pt trata 0 como "one" ("0 título") e o app sempre disse "0 títulos" | Nenhum se os 3 idiomas só têm singular/plural | Resolvido: confirmado pela auditoria do `sdd-converge` de 2026-10-05. Documentado em `translate.ts` |
| R-012 | O catálogo foi dividido em áreas (`messages/<area>.ts`, cada uma com pt/en/es lado a lado) em vez de 3 arquivos monolíticos; `defineArea` força en/es a terem as chaves de pt | Nenhum | Resolvido: confirmado pela auditoria do `sdd-converge` de 2026-10-05. `areas.test.ts` garante chaves únicas entre áreas; tela nova = nova área ou chaves na área existente |
| R-013 | Texto do diagnóstico/erro do player é gravado no estado no instante da falha (`diagnosePlayback(…, t)`) e não relido | Trocar o idioma com a tela de erro aberta mantém o texto antigo até a próxima reprodução | Aceito (caso raro; a troca é feita em Configurações, fora do player); reabrir/tentar de novo já sai no idioma novo |
| R-008 | O ajuste de trailers existente (sem commit) mistura-se com esta feature no `git status` | Rastreabilidade | T001 o registra e o isola num commit próprio antes do restante |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-03 | Fase 1 (Setup/trailers) | Ajuste de trailers conferido; suíte da área verde (426 ok; só os 2 contratos da Fase 10 vermelhos, como previsto) | Commit isolado dos arquivos de trailers |
| 2026-10-03 | Fase 2 (Foundational) | Núcleo i18n pronto; useT sem contexto (R-009); setups de teste fixam pt (R-010); suíte completa: só os 3 contratos futuros vermelhos | E2E precisam de `locale: 'pt-BR'` (R-010) |
| 2026-10-03 | Fase 3 (US1 núcleo) | Linha "Idioma" real, `OptionPickerModal`, Configurações inteira em `t()`, catálogo em áreas; 3/5 contratos verdes | Textos de helpers de outras fases (EPG/Fontes/Histórico) seguem em pt até a Fase 8 |
| 2026-10-03 | Fase 4 (US1 shell/Início) | Componentes, shell, Início, splash, perfis e catálogo de erros em `t()`; 611 testes verdes | `describeError` sem `t` nos chamadores das Fases 5–7 |
| 2026-10-03 | Fase 5 (US1 Live) | Live, guia e zapping em `t()`; `liveHints(t)`; rótulo "Sem categoria" traduzido só na exibição | `epgStatus` e `formatEpgTime` em fases posteriores |
| 2026-10-03 | Fase 6 (US1 VOD) | Vitrine, categoria, detalhes, elenco, semelhantes, trailer (botão), ator e countdown em `t()`; aviso de fallback do trailer = idioma só quando ≠ app | `TrailerLayer` e modais de histórico nas Fases 7–8 |
| 2026-10-03 | Fase 7 (US1 Player) | Player inteiro em `t()` (chrome, painéis, erro, diagnóstico, faixas, trailer); trocar idioma não recria o motor | Texto de erro já exibido não muda na hora (R-013) |
| 2026-10-03 | Fase 8 (US1 Fontes/Importação/Busca/Favoritos/Histórico) | Formatadores de fonte, importação, gate de conta, busca, favoritos e remoção de histórico em `t()`; ações do gate por id estável; 854 testes verdes | Datas pt-BR fixas (Fase 12); varredura na Fase 9 |
| 2026-10-03 | Fase 9 (US1 varredura/E2E) | Varredura limpa; `e2e/idioma-do-app.mjs` na SUITE; `locale: 'pt-BR'` em todos os E2E; suíte E2E completa 33/33; abas de Configurações encurtadas em en/es | Dev server velho servia módulo obsoleto: reiniciar antes do gate |
| 2026-10-03 | Fases 10–11 (US2/US3) | TMDB no idioma do app com cadeia da sinopse, rebusca só ao abrir o detalhe/ator, falha preserva o guardado; trailers seguem o idioma global; 5/5 contratos verdes | `countryName` na Fase 12 |
| 2026-10-03 | Fase 12 (US4 formatos) | Hora do guia e nome do país por idioma (guia sempre 24 h); formatos restantes já feitos nas Fases 6–8 | Nenhuma |
| 2026-10-03 | Fase 13 (Polish) | `tsc`, `lint`, `npm run test` (2534), E2E completo (33/33), `build:tizen` verdes; uma linha em `CLAUDE.md` (texto de UI entra pelo catálogo); quickstart cumprido na parte automatizada/E2E | Passada na TV física (R-001, SC-006) e commit do baseline de trailers (R-008) dependem do usuário |
| 2026-10-05 | Fase 13 (TV física) | App reinstalado na TV (`deploy-tv.ps1`); usuário relatou: abre no idioma da TV, troca manual ok, textos en/es sem corte, trailer em espanhol carregou. Fallback de idioma do trailer não observado na TV | Nenhuma; rodar `sdd-converge` |
| 2026-10-05 | Fase 14 (Convergência) | T053: `HintBar` com `aria-label` do catálogo (`shell.hints.aria`); `tsc`, `lint` e 196 testes das áreas tocadas verdes; sem TV, por decisão do usuário | Nenhuma |

**PRÓXIMO**: nenhum — feature convergida; decidir o commit do baseline de trailers (R-008).

## Arquivos Principais

- `tv-web/src/lib/i18n/` (`appLanguage.ts`, `translate.ts`, `I18nProvider.tsx`, `languages.ts`, `messages/<area>.ts` + `pt/en/es.ts`) e `tv-web/src/main.tsx`
- `tv-web/src/lib/metadata/` (`tmdbLookup.ts`, `titleMetadata.ts`, `tmdbPeople.ts`, `tmdbMapping.ts`), `tv-web/src/lib/trailer/trailerCandidates.ts`
- `tv-web/e2e/idioma-do-app.mjs`, `sdd/specs/054-idioma-do-app/logic/idioma-do-app.md`

## Cuidados para Retomada

- Registro da Fase em `tasks.md`: a Fase 1 tem o seu próprio bloco — conferir a qual fase o bloco pertence antes de editar (um replace por texto já gravou o da Fase 1 no da Fase 2 uma vez; corrigido).
- Dev server de longa duração pode servir módulo obsoleto (HMR): se um E2E falhar com `ReferenceError` de algo que o código já importa, reiniciar `npm run dev` antes de investigar (visto na Fase 9: `useT is not defined` em `TextField`).

## Resultado Final

Convergida em 2026-10-05 (duas passadas do `sdd-converge`; a primeira achou C-001, tratado na T053).

**O que foi construído.** O idioma do app (Português, English, Español) vive em `tv-web/src/lib/i18n/`: resolução e persistência (`appLanguage.ts`), `translate`/`plural`, `useT()` e o catálogo dividido em áreas (`messages/<area>.ts`, cada uma com pt/en/es lado a lado e `defineArea` exigindo as mesmas chaves). A linha "Idioma" fica em Configurações › Acessibilidade & sistema, a troca é imediata e preserva foco e reprodução, e o padrão vem de `navigator.languages` (Português se não suportado). O TMDB é consultado no idioma do app com cadeia de fallback (en, depois o original) e rebusca só ao abrir o detalhe ou o ator; os trailers seguem o idioma global e `preferredLanguage` legado é só lido para migração. Formatos de data, hora, duração e país acompanham o idioma. Texto do provedor nunca é traduzido.

**Desvios em relação ao plano original** (registrados nas Execution Notes e em R-009..R-013): `useT()` por `useSyncExternalStore` em vez de contexto; `plural()` com singular/outro nos três idiomas; catálogo em áreas em vez de 3 arquivos monolíticos; hora do guia sempre em 24 h; texto de erro do player gravado no instante da falha (R-013, aceito).

**Verificação.** 5/5 contratos verdes com a trava íntegra; `tsc` limpo; `lint` sem erros; suíte 379 arquivos / 2534 testes na Fase 13 e 196 testes das áreas tocadas na T053; E2E 33/33; `build:tizen` sem pendência. Passada na TV física em 2026-10-05, relatada pelo usuário (abre no idioma da TV, troca manual, textos longos sem corte, trailer em espanhol). Não observado na TV: o rótulo de trailer em fallback de outro idioma (só teste automatizado). A T053 (nome acessível da `HintBar`) foi concluída sem passada na TV, por decisão do usuário.

**Em aberto.** R-008 (baseline de trailers misturado no `git status`) e R-013 (aceito) seguem como registrados.