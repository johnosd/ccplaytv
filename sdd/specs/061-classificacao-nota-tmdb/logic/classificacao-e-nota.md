# Classificação indicativa e nota TMDB — regras (feature 061)

Regras que o executor NÃO decide sozinho. Código puro em `tv-web/src/lib/metadata/contentRating.ts` (stub criado pelo
`sdd-plan`); apresentação em `tv-web/src/components/ContentRatingBadge.tsx` e `TmdbRatingBadge.tsx`.

## §1 De onde vem o dado (FR-001, FR-002)

- **Mesma chamada de detalhe** que a 032/033/035 já faz em `tmdbLookup.ts` (`detailParams.append_to_response`):
  - filme: `credits,videos,recommendations,similar,release_dates`
  - série: `aggregate_credits,videos,recommendations,similar,content_ratings`
- Os dois caminhos de `lookupTmdb` (id do provedor e busca → id) usam o MESMO `detailParams`; as chamadas de reserva de
  sinopse (`toMatched`, só `language`) NÃO mudam e não pedem classificação.
- `mapTmdbDetail` grava, só no lado TMDB de `TitleFields`:
  - `certifications: certificationsFromTmdb(kind, detail)` — **sempre presente** (`{}` quando nenhum país serve). A
    presença da chave é o que distingue um registro da 061 de um anterior (§5). Nunca remova a chave por estar vazia.
  - `tmdbRating: tmdbRatingFromTmdb(detail)` — ausente quando `vote_average`/`vote_count` não forem números finitos.
- O provedor (Xtream) NÃO é fonte destes dois campos nesta feature (nem `age`, nem `mpaa_rating`): "provedor vence"
  não se aplica; a origem é sempre TMDB.

## §2 Validação por país (FR-006, FR-007) — conjuntos medidos em 2026-10-06

Valores aceitos (comparação exata, depois de `trim()`; qualquer outro valor = país ausente):

| País | Filme (`release_dates`) | Série (`content_ratings`) |
| --- | --- | --- |
| BR | `L`, `10`, `12`, `14`, `16`, `18` | `L`, `10`, `12`, `14`, `16`, `18` |
| US | `G`, `PG`, `PG-13`, `R`, `NC-17` | `TV-Y`, `TV-Y7`, `TV-G`, `TV-PG`, `TV-14`, `TV-MA` |
| ES | `A`, `7`, `12`, `16`, `18` | `TP`, `7`, `12`, `13`, `16`, `18` |

- `NR` (EUA, "não classificado"), vazio e qualquer coisa fora da tabela são descartados — nunca um texto cru.
- **Filme**: um país tem várias datas de lançamento, algumas com `certification` vazia. Escolha a primeira certificação
  VÁLIDA na ordem de tipo `3` (cinema) → `2` (cinema limitado) → `4` (digital) → `5` (físico) → `6` (TV) → `1` (estreia);
  dentro do mesmo tipo, a ordem da resposta. Tipo desconhecido entra por último.
- **Série**: `content_ratings.results[]` tem um `rating` por país.
- Países fora de BR/US/ES são ignorados. Resposta sem a chave, com `results` que não é array ou com itens malformados:
  `{}`, nunca exceção.

Origem medida: sonda de 2026-10-06 com 50 filmes e 50 séries populares (`plan.md`, R-001). `13` aparece em séries da
Espanha; `NR` aparece nos EUA (descartado).

## §3 Apresentação (FR-004, FR-005, FR-008, FR-009, FR-016, FR-017)

`CERTIFICATION_COUNTRY = { pt: 'BR', en: 'US', es: 'ES' }`. `certificationFor(certs, language)` devolve
`{ country, value }` só do país do idioma, ou `null` — nunca reserva de outro país.

**`ContentRatingBadge({ certifications })`** lê o idioma por `useT()` (re-renderiza na troca, sem consulta):

- Sem valor do país do idioma → `null` (nada no DOM).
- Um `<span>` não focável (sem `tabindex`, sem botão) com o valor como texto visível e `aria-label` com o significado:
  - pt (Brasil): `"Classificação indicativa: 14 anos"`; `L` → `"Classificação indicativa: livre"`.
  - en (EUA): `"Content rating: R"`. es (Espanha): `"Calificación por edades: 16"`.
  - Chaves novas em `messages/components.ts` (pt/en/es): `rating.content.aria` (`… {value}`), `rating.content.years`
    (`{n} anos`/`{n} years`/`{n} años`), `rating.content.free` (`livre`/`all ages`/`todos los públicos`). O valor da
    classificação nunca é traduzido.
- Brasil: classe por valor (`content-rating-badge--br-14` etc.) com fundo e tinta de **tokens novos** em
  `tv-web/src/index.css` (`--rating-br-l`, `--rating-br-l-ink`, … `--rating-br-18`, `--rating-br-18-ink`), valores do
  protótipo (`hbClassInd`): L `#1FA54B`/`#fff`; 10 `#1E88E5`/`#fff`; 12 `#F2C200`/`#111`; 14 `#EF7D00`/`#fff`;
  16 `#E53935`/`#fff`; 18 `#111`/`#fff`. EUA e Espanha: selo neutro com tokens existentes (`--bg-elevated`,
  `--text-primary`, borda `--bg-hover`). Nenhuma cor literal fora de `index.css`.

**`TmdbRatingBadge({ rating })`**:

- `tmdbRatingToShow(rating)` → `null` com média ≤ 0, votos < `TMDB_MIN_VOTES` (50) ou sem dado → componente devolve `null`.
- Texto visível exatamente `TMDB 7,8`: a palavra `TMDB` (marca, não traduzida), um espaço, a média com **uma casa** e o
  separador do idioma (`Intl.NumberFormat` com `APP_LANGUAGE_LOCALE`, como o `RatingBadge`). O `textContent` do selo
  precisa conter `"TMDB 7,8"` contínuo (o contrato procura essa sequência).
- Nunca reaproveitar o `RatingBadge` da 055: o contrato travado dele exige que ele nunca diga TMDB.

**Ordem na linha de metadata (FR-009/FR-011, protótipo `hbMeta`)**: ano · duração (ou temporadas) · `★ 7,4 Provedor` ·
classificação · `TMDB 7,8`. Cada um só se existir; a nota do provedor e a do TMDB nunca se substituem.

## §4 Mínimo de votos (FR-008, D-004)

`TMDB_MIN_VOTES = 50`. `tmdbRatingToShow` = `average` se `average > 0 && votes >= 50`, senão `null`. A média é
mostrada com uma casa; o arredondamento é só de exibição (o valor guardado não muda).

## §5 Registro anterior à 061 (FR-014, SC-001)

Em `titleMetadata.ts`, mesmo molde de `tmdbLacksVideos`/`tmdbLacks035`:

```ts
/** `matched` gravado antes da 061 não tem a chave `certifications` — repete-se uma vez (FR-014). */
function tmdbLacks061(tmdb: TmdbResultRecord | undefined): boolean {
  return tmdb?.status === 'matched' && tmdb.fields.certifications === undefined
}
// em enrichFromTmdb:
const lacksNewFields = tmdbLacksVideos(cached?.tmdb) || tmdbLacks035(cached?.tmdb) || tmdbLacks061(cached?.tmdb)
```

- Só `matched` repete: `no_match`/`dead_id` não têm classificação a buscar.
- Repete UMA vez porque o registro novo sempre traz `certifications` (mesmo `{}`) — §1.
- Só acontece dentro de `ensureTitleMetadata`, que só roda ao ABRIR o detalhe ou o billboard (`useTitleMetadata`), nunca
  em `useCachedTitleView` (card expandido) nem em lote.

## §6 Onde aparece e de onde lê (FR-010–FR-013)

| Lugar | Classificação | Nota TMDB |
| --- | --- | --- |
| Hero do detalhe do filme (`MovieDetailScreen`, `meta` do `DetailHero`) | `metadata.certifications` | `metadata.tmdbRating` |
| Hero do detalhe da série (`SeriesDetailScreen`) | idem | idem |
| Billboard do Início (`HomeContent`, `.home-hero-meta`) | `heroMetadata.certifications` | `heroMetadata.tmdbRating` |
| Card expandido do Início (`HomeCardExpanded`) | `useCachedTitleView(item).certifications` (só cache) | `view.tmdbRating` ?? nota do Top 10/Dica (§7) |
| Pôsteres não expandidos, grades, vitrine de Filmes/Séries | — | — |

`mergeTitleMetadata` copia `certifications` e `tmdbRating` do lado TMDB para a visão **só com `tmdb.status === 'matched'`**
(como `similar`/`castPeople`), sem regra "provedor vence".

## §7 Nota do Top 10 e da Dica no card expandido (FR-002, US3/AC2)

- `DiscoveryTitle` já guarda `voteAverage`/`voteCount` (feature 057) no cache da descoberta — nenhuma consulta nova.
- Em `useDiscoveryRow` (`catalogApi.ts`), ao lado do mapa `images` da 060, monte `ratings: Map<itemId, TmdbRating>`
  (`{ average: voteAverage, votes: voteCount }`) para cada título cruzado; exponha como `DiscoveryRowResult.ratings?`
  (opcional, como `images`, porque mocks antigos não o devolvem).
- `HomeContent` junta os `ratings` do Top 10 e da Dica (filmes e séries) num mapa e passa `tmdbRating` ao
  `HomeTitleCard` → `HomeCardExpanded`. Precedência: a nota do cache de metadata do título (`view.tmdbRating`), senão a da
  descoberta. O mínimo de votos vale igual (é o mesmo `TmdbRatingBadge`).
- A classificação do card expandido só vem do cache de metadata — a descoberta não a traz.
