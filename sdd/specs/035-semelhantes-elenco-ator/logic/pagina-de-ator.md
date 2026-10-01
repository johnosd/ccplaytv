# Lógica — Elenco com foto e página de ator

Arquivos: `lib/metadata/tmdbPeople.ts` (`loadPersonCredits`, stub),
`tmdbKeyRepository.ts` (`removeTmdbKey`), `lib/catalog/db.ts` (v13
`tmdbPeople`), `features/vod/DetailMetadata.tsx` (elenco com foto),
`features/person/PersonScreen.tsx` (nova). Contrato:
`tmdbPeople.semelhantes.contract.test.ts`.

## 1. Aba Elenco (US3)

- `metadata.castPeople` com pessoas → painel de **pessoas**: `Rail` de
  cartões com foto (`PosterArt`-like; sem foto ou falha → marcador neutro,
  nunca ícone quebrado), nome e personagem (só quando houver). Focáveis
  (fileira `panel`, mesma mecânica de `aba-semelhantes.md` §3); chave de
  foco `person:<personId>`.
- Sem `castPeople` → o `CastPanel` da 032 exatamente como hoje (texto, sem
  foto, sem navegação, foco fica na aba) — FR-015.
- OK numa pessoa → `onOpenPerson({ personId, name }, { tab: 'cast', focusKey })`.
- Nunca mistura provedor e TMDB na mesma lista (D-006).

## 2. `loadPersonCredits(personId, options)` (FR-016)

```text
cred = readTmdbCredential()
  ausente                → { error, 'no_key' }        (sem requisição)
  state 'refused'        → { error, 'refused' }       (sem requisição)
  pausedUntil > now      → { error, 'rate_limited' }  (sem requisição)
cached = tmdbPeople.get(personId); se now − fetchedAt ≤ TMDB_CACHE_MS → ok(cached)
em voo por (database.name, personId) → reaproveita
GET /person/{personId}  { language: 'pt-BR', append_to_response: 'combined_credits' }
  TmdbError refused/offline/rate_limited → markTmdbState(kind) ; { error, kind }   (nada gravado)
  TmdbError not_found                    → { error, 'not_found' }                 (nada gravado)
  ok → mapear, tmdbPeople.put({...,fetchedAt: now}); se state ≠ connected → markTmdbState('connected')
```

- Resultado de erro carrega **só** a categoria — nunca `message`/URL do fetch
  (a URL v3 tem a chave). Sem `console.*`.
- `state` `offline`/`rate_limited` vencido **não** bloqueiam uma nova
  tentativa manual ("Tentar de novo"); só `refused` e a pausa ativa.

## 3. Mapeamento da filmografia

```text
combined_credits.cast:
  media_type 'movie' → kind 'movie' ; 'tv' → 'series' ; outro → descarta
  descarta sem id numérico ou sem título (title|name)
  descarta série com genre_ids ∩ {10763 News, 10764 Reality, 10767 Talk}
  descarta character que seja só a própria pessoa: /^(self|himself|herself|themselves|ele mesmo|ela mesma)$/i
  sem repetir (kind,id) — primeira ocorrência vence
  ordenar: popularity desc (ausente = 0), depois ano desc, depois tmdbId asc
  até FILMOGRAPHY_STORED_MAX (200)
  campos: tmdbId, kind, title, originalTitle?, year?, posterUrl (w342)?, overview?
pessoa: name, photoUrl = profile_path ? w185 : ausente — biografia/nascimento NUNCA lidos
```

"Ordem do TMDB" na página de ator = popularidade que o próprio TMDB informa
(o `combined_credits` não traz ordem significativa) — D-009.

## 4. `removeTmdbKey`

Na mesma transação que já apaga a parte TMDB de `titleMetadata`, faz
`tmdbPeople.clear()` (FR-021). `useRemoveTmdbKey` também remove
`['person-credits']` do cache do react-query (o mesmo motivo do achado da 032:
só invalidar mostrava o dado velho por um instante).

## 5. `PersonScreen`

Props: `personId`, `personName` (cabeçalho imediato, antes de carregar),
`sourceId` (fonte ativa), `restore?: PersonSnapshot`, `onOpenTitle(target,
from: PersonSnapshot)`, `onBack`. Raiz `.screen`, sem topbar.

- Dados: `usePersonCredits(personId)` → `['person-credits', personId]`;
  depois `resolveTmdbTitles(sourceId, credits, ['movie','series'])` →
  `['person-titles', personId, sourceId]`, `staleTime: 0`. Corte em
  `FILMOGRAPHY_SHOWN_MAX` (60) **depois** de ordenar encontrados primeiro.
- Layout: foto (ou marcador neutro) + nome + `Dados: TMDB`; linha de
  cobertura `Procurado em X de Y categorias de filmes e Z de W de séries`;
  `Rail` "Na sua lista (N)" com os encontrados e `Rail` "Fora da sua lista
  (M)" com os não encontrados (cada um com o chip). Rail vazio não aparece.
- Foco: ↑/↓ entre rails, ←/→ dentro; chave `tmdb:<kind>:<id>`; restauração
  por chave (ausente → primeiro item do primeiro rail).
- OK encontrado → `onOpenTitle({kind, itemId}, { focusKey })`; não
  encontrado → o mesmo `TitleSummaryModal`.
- Estados, todos com focável:
  - carregando: `Carregando a filmografia…` + `Voltar`;
  - erro (`offline`/`refused`/`rate_limited`/`not_found`):
    `Não foi possível carregar a filmografia agora.` + `Tentar de novo` +
    `Voltar` (FR-018; `Tentar de novo` só refaz a consulta — nunca em laço);
  - `no_key`: `A chave do TMDB foi removida.` + `Voltar`;
  - vazio: `O TMDB não tem filmes nem séries com esta pessoa.` + `Voltar`.
- RETURN → `onBack` (o detalhe de origem restaura aba Elenco + pessoa).
