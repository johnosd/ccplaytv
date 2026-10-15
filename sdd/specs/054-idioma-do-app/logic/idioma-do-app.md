# Lógica — Idioma do app (feature 054)

Leia antes de mexer em `tv-web/src/lib/i18n/`, em `lib/metadata/` ou em qualquer
tela que mostre texto. Cada seção diz o "como" que o executor errará se improvisar.

## 1. Escolha e resolução do idioma

Armazenamento: `localStorage`, chave `ccplaytv:app-language` (`'pt' | 'en' | 'es'`),
mesmo molde de `motionPreference.ts`/`playerPreferences.ts` (acesso e gravação podem lançar → nunca escapa).

```ts
resolveAppLanguage({ storage?, systemLanguages? }): AppLanguage
  1. valor gravado em APP_LANGUAGE_STORAGE_KEY, se isAppLanguage(valor)        // inválido é ignorado
  2. legado: JSON de 'ccplaytv:player-preferences'.preferredLanguage, se isAppLanguage  // FR-012, só LEITURA
  3. primeiro item de systemLanguages cujo código primário (antes de '-'/'_') é suportado
  4. 'pt'
```

- `systemLanguages` omitido = `navigator.languages` (cai em `[navigator.language]`; em ambiente sem `navigator` = `[]`).
- `readAppLanguage()` resolve **uma vez** e guarda em memória; `writeAppLanguage(l)` grava, atualiza a memória e **avisa os assinantes**
  (`subscribeAppLanguage(listener) → unsubscribe`, para `useSyncExternalStore`). Resolver NÃO grava: a detecção pela TV não vira
  "escolha da pessoa" (se a TV mudar de idioma, o app acompanha até a pessoa escolher).
- O legado nunca é apagado nem reescrito aqui; depois do 1º `writeAppLanguage`, o passo 1 passa a vencer.

## 2. Reatividade na interface (FR-003, FR-014, FR-015)

- `I18nProvider` (em `main.tsx`, por dentro do `Stage`, em volta do `QueryClientProvider`) assina o store e põe `{ language, t }` num contexto.
  Também mantém `document.documentElement.lang` (`pt-BR`/`en`/`es`).
- `useT()` devolve `t`. **Todo componente que renderiza texto próprio chama `useT()`** — é o que o faz re-renderizar na troca.
  Componente memoizado que só recebe strings já traduzidas por um pai também re-renderiza (props mudam).
- Funções puras que hoje devolvem texto (`sourceFormat.ts`, `importSections.ts`, `trailerAction.ts`, `playerPanels`, erros…) **não leem o store**:
  recebem `t` (ou `language`) por parâmetro, e o componente que as chama passa o `t` do `useT()`. Assim continuam puras e testáveis em qualquer idioma.
- **Nunca** remontar a árvore por `key={language}`: perderia foco, rolagem e estado (viola a Constituição "Voltar Restaura Foco" e FR-003/FR-014).
- Troca durante reprodução: só texto muda; `PlayerService` não é tocado.
- `AnnouncerRegion`/`aria-label`: nomes acessíveis também passam por `t`.

## 3. Catálogos e `t()`

- `lib/i18n/messages/pt.ts` é a **base**: define `MessageKey = keyof typeof pt`. `en.ts` e `es.ts` são `Record<MessageKey, string>` (completude checada
  pelo `tsc` e pelo contrato `FR-004/SC-001`: mesmas chaves, mesmos `{marcadores}`, nenhum valor vazio).
- Chave plana `area.elemento[.detalhe]` (`settings.language.label`, `player.error.network`). Reuso só quando o texto é **o mesmo conceito**;
  mesmas palavras com sentidos diferentes = chaves diferentes (o inglês/espanhol pode divergir).
- `t(key, params?)`: troca `{nome}` pelos params (número formatado com `Intl.NumberFormat(APP_LANGUAGE_LOCALE[language])`). Chave ausente no idioma
  atual cai em `pt`; ausente em `pt` devolve a própria chave **só em dev** (o `tsc` impede em prod). Nunca devolve vazio.
- Plural: duas chaves `x.one`/`x.other` e `t.plural('x', n)` escolhe por `Intl.PluralRules(locale).select(n)`; `{n}` entra como param.
- Texto **do provedor** (nomes de canal/categoria, sinopse do provedor, títulos) nunca passa por `t` (FR-005). Rótulos do app que **cercam** esses
  textos passam (ex.: "Sincronizada em {data}").
- O registro de mocks `lib/comingSoon.ts` também vira catálogo (`comingSoon.<id>`); a mensagem "Em breve — …" compõe-se com `t`.
- Erros sanitizados (Constituição "Segredos"): a mensagem traduzida NUNCA interpola URL, credencial ou chave — só o motivo.
- Idioma de **áudio/legenda** do player continua `tracks.ts` (tabela própria, `LANGUAGE_NAMES` em pt) — o NOME dos idiomas no seletor de faixas
  acompanha o idioma do app (T-Player), mas as preferências de áudio/legenda não dependem dele (FR-013).

## 4. Metadados do TMDB por idioma (FR-006..FR-008)

Hoje: `language: 'pt-BR'` fixo em `tmdbLookup.ts` (detalhe + busca) e `tmdbPeople.ts`; cache 6 meses (`TMDB_CACHE_MS`).

**Marcador de idioma no cache**: `TmdbResultRecord` `matched` ganha `language?: AppLanguage` (ausente = `'pt'`, registros anteriores à 054).
`TmdbPersonRecord` ganha o mesmo campo. Sem versão nova do Dexie (campo não indexado).

```ts
// enrichFromTmdb (titleMetadata.ts) — substitui a condição atual de "cache vale"
const lang = options.language ?? readAppLanguage()
const stale = cached.tmdb?.status === 'matched' && (cached.tmdb.language ?? 'pt') !== lang
if (!lacksNewFields && !stale && cached.tmdbFetchedAt !== undefined && now - cached.tmdbFetchedAt <= TMDB_CACHE_MS) return
```

- `no_match` e `dead_id` **não** são invalidados por troca de idioma (idioma não muda o casamento).
- Rebusca = a mesma `lookupTmdb` com `language: lang`. Sucesso → `storeTmdbResult` com `language: lang` e `tmdbFetchedAt = now`.
  **Falha (offline/429/401)**: nada é gravado, o registro antigo continua, `markTmdbState` como hoje, **uma tentativa por abertura** (contrato FR-008).
- Só `ensureTitleMetadata` (abrir o detalhe) e `loadPersonCredits` (OK no ator) rebuscam. Foco/navegação nunca (Constituição "Foco").
- Duas aberturas simultâneas continuam compartilhando uma obtenção (`inFlight`); a chave **inclui o idioma** (`${database.name}|${stableId}|${lang}`).
- Cadeia da sinopse (`toMatched`): `APP_LANGUAGE_LOCALE[lang]` → se vazia e `lang !== 'en'` → `en-US` → se vazia e original ∉ {lang,'en'} → idioma original.
  `synopsisLanguage` (código ISO 639-1) é gravado quando a sinopse NÃO está no idioma do app (generaliza o "≠ pt" de hoje) e a UI diz "em {idioma}"
  traduzido (`OriginTag`/`DetailMetadata`). O passo "original" só roda se `fields.synopsis === undefined` (como hoje).
- Provedor vence (FR-005/032): `mergeTitleMetadata` não muda de regra; só recebe o idioma para o ranking de trailers (§5).
- Gêneros/país/papéis vêm traduzidos pelo próprio TMDB (`language=`); `countryName` usa `Intl.DisplayNames([locale], {type:'region'})`.

## 5. Trailers (US3) — o ajuste já está no working tree

Feito antes desta feature (2026-10-03, ainda sem commit): `PlayerPreferences.preferredLanguage`, `buildTrailerCandidates(provider, tmdb, preferredLanguage)`
(rank: trailer>teaser → oficial → idioma preferido > `en` > resto; **oficial antes do idioma** é a R-012 da 033, mantida), `include_video_language`
com o idioma preferido, linha "Idioma preferido (trailers)" no Player.
Esta feature **muda a fonte**, não a regra: o parâmetro passa a vir de `readAppLanguage()` (via `options.language`); a linha e o campo
`preferredLanguage` de `PlayerPreferences` são removidos (o valor já gravado é migrado por §1.2). `include_video_language` = `pt,en,<lang>,null` sem repetir.
Como a troca de idioma rebusca o título (§4), os vídeos no idioma novo passam a existir sem esperar os 6 meses.
`trailerButtonLabel` mostra o idioma quando ≠ idioma do app (antes: ≠ pt) com o nome traduzido.

## 6. Formatos (US4, FR-010)

`APP_LANGUAGE_LOCALE[language]` substitui todo `'pt-BR'` de **exibição**: `formatEpgTime.ts`, `sourceAccount.ts`, `importSections.ts`, `sourceFormat.ts`,
`MovieDetailScreen.tsx` (data), `IntegrationsPanel.tsx`, `DetailMetadata.tsx` (nome do idioma), `tmdbMapping.ts` (país), `trailerCandidates.ts` (nome do idioma).
Ficam como estão: `initials.ts` e `vodSort.ts`/`catalogSearch.ts` (ordenação/iniciais do conteúdo do provedor; trocar muda a ordem das listas — fora de escopo).
Funções puras recebem `language`/`locale` por parâmetro (§2).

## 7. Idioma da TV (FR-011)

`navigator.languages` do Chromium do Tizen acompanha o idioma da TV (a verificar no aparelho — R-001). Nenhuma API Tizen nova nesta feature.
Se o valor vier errado/vazio, o resultado é `pt` e a pessoa escolhe manualmente (FR-001): degradação aceitável.

## 8. Linha "Idioma" nas Configurações (FR-001)

`AccessibilityPanel`/`AccessibilityTab`: nova linha **índice 1** (entre "Reduzir movimento" e os mocks); `ACCESSIBILITY_ROW_COUNT` = 5, mocks nos índices 2..4.
O seletor é o mesmo `Modal` + `radiogroup` de `PlayerTab` (OK grava e devolve o foco à linha; RETURN fecha sem gravar). Valor mostrado = nome nativo
(`Português`/`English`/`Español`); rótulo da linha traduzido (`Idioma`/`Language`/`Idioma`). Extrair o seletor de `PlayerTab` para um componente
compartilhado antes de usar nos dois lugares é permitido (não duplicar).
