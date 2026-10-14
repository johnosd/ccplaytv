# Modelo de dados — Teste de conexão na TV

Os tipos públicos estão em `tv-web/src/lib/network/speedTest.ts` e `speedTestRepository.ts`. Não há API de servidor nova: `contracts/` não é necessário; o transporte externo é documentado em `research.md` e `logic/medicao.md`.

## Resultado

| Campo | Regra |
|---|---|
| `version` | Literal `1`, versão de formato/método |
| `measuredAt` | Timestamp civil em ms, ao encerrar; relógio do aparelho não validado externamente |
| `destination` | Literal `cloudflare`; nome legível na UI, sem URL de fonte |
| `downloadMbps`, `latencyMs` | Número finito positivo ou `null` |
| `jitterMs` | Número finito não negativo ou `null`; zero medido é válido |
| `status` | `complete` com três métricas válidas; `partial` com pelo menos uma |
| `reason` | `completed`, `time_limit`, `byte_limit`, `measurement_error` |
| `durationMs` | Duração real finita e não negativa |
| `requestedBytes` | Inteiro, soma reservada antes das requisições; máximo 100.000.000 |
| `receivedBytes` | Inteiro, total realmente consumido, inclusive respostas interrompidas |
| `latencySamples`, `downloadSamples` | Quantidades de amostras válidas |

Não persistir arrays de amostras, exceções, headers, catálogo, chaves, URLs ou identificação de lista. Não aceitar NaN/Infinity/negativos ou resultado sem métrica válida. `null` não vira zero na apresentação. Validar coerência de versão, destino, status e métricas antes de ler/gravar; não renderizar registro corrompido.

## Singleton IndexedDB

Acrescentar `networkDiagnostics: 'id'` em Dexie **v17**, mantendo versões anteriores. Registro `NetworkDiagnosticRecord = SpeedTestResult & { id: 'last' }`. Confirmar concorrência de migrações antes da implementação. O registro não depende da exclusão/troca de fonte ou remoção de chave TMDB.

`readLastSpeedTestResult({ database? })` retorna resultado validado, sem `id`, ou `null`. `saveLastSpeedTestResult(outcome, { database? })` retorna `written`, `ignored` ou `unavailable`; apenas outcome completo/parcial válido substitui `last`. Cancelamento, falha total e zero métricas preservam o anterior. `clearLastSpeedTestResult({ database? })` remove o singleton; apagar dados do app/origem também o remove.

O parâmetro opcional `database` isola testes com `CatalogDb`; produção usa `db`. Falha de gravação mantém resultado atual em memória, mostra aviso e deixa o dock lendo somente o último resultado realmente salvo. Falha de leitura rejeita a promessa sem expor a exceção original; o controlador trata como armazenamento indisponível, oferece saída e não consulta rede para reconstruir dados.

## Estado transitório

`SpeedTestOutcome`: `completed` com resultado, `cancelled` sem resultado ou `failed` com código fechado. Parcial por limite/erro também usa `completed`, pois há medição persistível; a UI diferencia por `status`/`reason`.

Controlador local tem fases `ready`, `running`, `result`, `error`, `blocked`. Cada execução recebe id monotônico, controller e promessa de encerramento. Só o id ativo publica progresso/outcome e tenta guardar. Encerramento invalida callbacks antes de aguardar limpeza. O serviço também garante uma execução global. Não retomar/repetir automaticamente.
