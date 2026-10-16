# Modelo de dados: Rádio global

Tudo da Rádio fica **fora** do banco do catálogo (`ccplaytv`) e fora do backup de uso (ADR-018 §5, ADR-017). Remover
ou trocar de lista não toca em nada daqui.

## 1. Banco próprio `ccplay-radio` (Dexie, `lib/radio/radioDb.ts`)

Um banco separado (D-004): o catálogo não ganha versão nova, `lib/radio` não importa `lib/catalog`, e nenhuma migração
do catálogo pode afetar a Rádio (nem o contrário). `fake-indexeddb` já cobre os testes (`src/setupTests.ts`).

```ts
db.version(1).stores({
  favorites: 'id, favoritedAt',
  directoryCache: 'key',
})
```

## 2. `favorites` — `RadioFavorite` (`lib/radio/radioFavorites.ts`)

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | string | `radio-browser:<uuid>` — chave primária. Nunca a URL. |
| `uuid` | string | `stationuuid` do diretório; é o que vai em `stationsByUuid`. |
| `name` | string | Retrato no momento de favoritar; atualizado quando a estação toca a partir de Favoritos. |
| `artUrl` | string? | Idem. |
| `countryCode` | string | ISO alfa-2 ou `''`. |
| `lastStreamUrl` | string? | Só fallback quando o diretório não responde (`logic/radio-tela.md` §5.2). Nunca chave, nunca exibido. |
| `favoritedAt` | number | `Date.now()` ao favoritar; ordena `★ Favoritos` (mais recente primeiro). |

API pública: `listRadioFavorites()`, `isRadioFavorite(id)`, `toggleRadioFavorite(station)` → `boolean` (novo estado),
`refreshRadioFavorite(station)` (atualiza o retrato, sem mudar `favoritedAt`).

## 3. `directoryCache` (`lib/radio/radioCache.ts`)

| `key` | Conteúdo | Validade (fresco) |
| --- | --- | --- |
| `countries` | `{ key, fetchedAt, countries: RadioCountry[] }` | 7 dias |
| `stations:world` | `{ key, fetchedAt, stations: RadioStation[] }` | 6 horas |
| `stations:country:XX` | idem | 6 horas |

Vencido não é apagado: ainda serve como "pode estar desatualizado" quando a rede falha (FR-024). Sem limite de
entradas no MVP: ~230 países × 100 estações é o teto teórico, mas só se grava país visitado. A URL de stream gravada no
cache não é segredo (ADR-018) e nunca é exibida.

## 4. Fora do banco

| Onde | Chave | O quê |
| --- | --- | --- |
| `localStorage` | `ccplaytv:radio-last-country` | Código do último país em que a pessoa entrou (FR-011). **Fora** de `BACKUP_SETTING_KEYS`. |
| memória de módulo | `radioSessionMemory.ts` | Última entrada e estação focada por entrada, só na sessão (FR-003). |

## 5. Tipos de domínio

`lib/radio/radioTypes.ts`: `RadioCountry`, `RadioStation`, `RadioEntryKey`, `radioStationId()`. Já existem (stub do
plan), com os campos definitivos.
