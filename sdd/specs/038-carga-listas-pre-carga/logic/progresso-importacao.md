# Lógica — Tela de importação por parte

Cobre FR-015 a FR-019 e US3. Código: `lib/catalog/importPipeline.ts`,
`lib/catalog/db.ts` (`ImportRunRecord`), `features/import/importApi.ts`,
`features/import/ImportProgressScreen.tsx` e um módulo puro novo
`features/import/importSections.ts`.

## 1. O que o pipeline passa a registrar

`ImportRunRecord.sections?: Record<'channel' | 'movie' | 'series', SectionRun>`
(campo sem índice, sem subir versão):

```ts
type SectionRunState = 'waiting' | 'loading' | 'ready' | 'failed' | 'unavailable'
interface SectionRun { state: SectionRunState; categories?: number; items?: number }
```

| Caminho | Quando | Registro |
| --- | --- | --- |
| Xtream | criado o run | as três `waiting` |
| Xtream | antes de pedir a lista de categorias da seção | `loading` |
| Xtream | lista lida com N > 0 | `ready`, `categories: N` |
| Xtream | lista lida vazia (N = 0) | `unavailable` — "a lista não tem", nunca "0 categorias" (FR-017) |
| Xtream | seção opcional que o painel não serviu (`ProviderIncompatibleError`) | `failed` (o aviso de hoje, "O provedor não respondeu à lista de filmes", continua) |
| M3U (varredura) | criado o run | as três `loading` |
| M3U | a cada lote gravado | `items` da seção = itens classificados daquele tipo até agora (episódio conta na seção Séries? **não** — Séries conta séries; episódio só entra em `entriesRead`) |
| M3U | fim da varredura | `ready` onde `items > 0`, `unavailable` onde `items` = 0 |
| qualquer | falha da importação inteira | seções `loading`/`waiting` viram `failed` |

`persist()` já é chamado nos pontos certos; `sections` vai junto (é um campo de
`run`). Nada de percentual — não há denominador (FR-016).

## 2. A linha "Guia"

Não é do pipeline: o EPG sincroniza **depois**, em segundo plano
(`importApi.startLocalImport` → `requestEpgSync` ao completar). A tela deriva
a linha de `useSources()` (estado `epg` da fonte) + `useEpgSyncing(sourceId)`
+ o `startedAt` do run, numa função pura `guideRow(...)` em `importSections.ts`:

```
importação ainda não terminou com sucesso              → 'waiting'
epg.state ∈ { not_configured, disabled }               → 'unavailable'
syncing                                                → 'loading'
epg.state === 'linked' && epg.lastSyncAt >= run.startedAt  → 'ready'
epg.state === 'error' && epg.lastErrorAt >= run.startedAt  → 'failed' + epgErrorMessage(errorKind)
senão (sincronização ainda não começou)                → 'loading'
```

`EpgStatus` ganha `lastErrorAt?` (o `SourceRecord.epgLastErrorAt` já existe;
só falta expor). Sem ele, uma falha de uma sincronização antiga apareceria
como falha desta. Mensagem sempre por `epgErrorMessage` (código `EPG-02`),
nunca o erro cru (FR-018).

## 3. Textos (sem percentual)

| Estado | Rótulo | Com contagem |
| --- | --- | --- |
| `waiting` | "Aguardando" | — |
| `loading` | "Carregando" | M3U: "Carregando — 1.234 itens" |
| `ready` | "Pronto" | Xtream: "Pronto — 41 categorias"; M3U: "Pronto — 1.200 itens" |
| `failed` | "Falhou" | motivo (seção: o aviso existente; guia: `epgErrorMessage`) |
| `unavailable` | "Não disponível nesta lista" | — |

Número formatado com separador de milhar pt-BR (`toLocaleString('pt-BR')`).
Estado nunca só por cor (constitution, foco/estado por texto).

## 4. Fim e foco

- **"Abrir lista" aparece e é focável** assim que a importação termina com
  sucesso (estrutura pronta) — a pessoa pode sair antes do guia.
- O **foco vai sozinho** para "Abrir lista" no instante em que a tela fica
  "concluída" = importação com sucesso **e** guia em `ready | failed |
  unavailable` (FR-019). Mesmo mecanismo de hoje (`useEffect` na virada),
  uma vez só.
- Abaixo das linhas, com a tela concluída: "Os itens de cada categoria
  continuam chegando em segundo plano." (texto fixo, sem número).
- Importação que falhou: como hoje (erro categorizado + "Tentar de novo"/
  "Voltar"), as linhas mostram onde parou.
- Caminho da atualização automática (`autoRefreshJob` em `App.tsx`) não abre
  esta tela — nada muda ali; a linha do Início (US6) é quem diz "Atualizando
  catálogo…".
