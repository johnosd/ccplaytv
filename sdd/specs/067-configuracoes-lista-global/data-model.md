# Data Model — feature 067

Só o PIN parental muda de forma. Tudo o mais (preferências de categoria,
histórico, EPG, fontes) já é por lista e não muda.

## IndexedDB (Dexie) — versão 21

Declarada em `tv-web/src/lib/catalog/dbSchema.ts` (`registerLateCatalogSchemas`),
nunca em `db.ts` (teto de linhas).

| Tabela | Índices | Mudança |
| --- | --- | --- |
| `parentalPins` | `sourceId` (chave primária) | **nova** |
| `parentalPin` | `id` | mantida declarada; esvaziada pela migração; nada mais escreve nela |
| `categoryPreferences` | `[sourceId+kind+matchKey], sourceId` | sem mudança |

`.upgrade(tx => migrateLegacyPin(tx))` na v21 (`logic/pin-por-lista.md` §4).

### `ParentalListPinRecord` (`parentalPins`)

| Campo | Tipo | Nota |
| --- | --- | --- |
| `sourceId` | `string` | chave; uma lista tem 0 ou 1 registro |
| `salt` | `string` | hex, 16 bytes aleatórios |
| `hash` | `string` | hex de `SHA-256(`${salt}:${pin}`)` — o mesmo esquema da 066 |
| `algorithm` | `'sha256'` | |
| `createdAt` | `number` | ms |

Ciclo de vida: criado ao ligar o controle **daquela lista** (ou pela
migração); trocado por "Trocar PIN"/recuperação; apagado ao desligar o
controle daquela lista ou ao excluir a lista (`deleteSource`, FR-025).

## `localStorage`

| Chave | Valor | Nota |
| --- | --- | --- |
| `ccplay.parental.pinSources` | JSON `string[]` de `sourceId` com PIN | espelho síncrono; só ids |
| `ccplay.parental.pinActive` | — | **removida** (substituída pela de cima) |

## Navegação (estado em memória, `navigation/appNav.ts`)

- `AppScreen` + `{ name: 'list-settings'; sourceId: string; restore?: ListSettingsFocus }`.
- `AppNavAction` + `{ type: 'list-settings-deleted'; sourceId: string; ... }`
  (`logic/navegacao-lista.md` §4).
- `SettingsFocus` (`features/settings/tabs/settingsTab.ts`): `zone: 'sources'`
  com `action: 'configure'`; `SettingsTab` sem `parental`/`privacy`.
