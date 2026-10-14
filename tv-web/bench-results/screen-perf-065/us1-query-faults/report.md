# Evidência agregada — T011 (falhas de consultas externas)

- **Runner:** `scripts/bench/run-query-faults.mjs`
- **Teste executado:** `src/lib/metadata/queryFaults.test.ts`
- **Comando:** `node scripts/bench/run-query-faults.mjs`
- **Resultado do runner:** `status: pass`
- **Resultado Vitest:** 1 arquivo, 2 testes aprovados
- **Data da execução:** 2026-10-08

## Casos cobertos

1. **Timeout de corpo:** a chamada rejeita com erro sanitizado classificado como `offline`, o `AbortSignal` da requisição é abortado e a resolução tardia do corpo não gera falha não tratada.
2. **429 intermediário na descoberta:** o resultado fica `unavailable` sem títulos parciais, os lotes posteriores (páginas 6–8) não são chamados e o estado de pausa respeita o `Retry-After` sintético de 120 segundos.

A fixture usa somente dados sintéticos. O relatório não registra URLs, chaves, credenciais, corpos de resposta ou valores de provedores.
