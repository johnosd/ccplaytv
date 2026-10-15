# Consultas externas: feature 065

## Prazo por requisição

tmdbGet preserva os quatro argumentos atuais; adicionar opções opcionais de signal/contexto no fim. Usar um AbortController próprio e timer de 10.000 ms **antes** de chamar fetch. A operação inclui response.json(). Corrida com promise de deadline encerra até se fetch/json injetado ignorar signal; abortar o controller e remover timer/listeners em finally. Falha vira TmdbError('offline'), mensagem fixa. Cancelamento obsoleto não atualiza a integração como offline por conta de outro contexto.

No enriquecimento Xtream, limitar somente chamadas fetchVodInfo/fetchSeriesDetail feitas por titleMetadata. Não aplicar deadline global ao conector de importação, categoria, EPG ou playback; preservar AbortError sem sondagem no-cors após aborto. O prazo inclui qualquer probe pertencente à tentativa de detalhe.

## Leases e identidade

sharedAttempt.ts mantém uma tentativa por (instância do banco, fonte/generation quando aplicável, stableId ou consulta, idioma, revisão opaca da integração). Não usar apenas database.name: duas instâncias distintas podem coexistir em testes. Chave BYOK/URL nunca entra na query key ou mensagem.

Cada consumidor adquire lease; signal/unmount libera só sua lease. Enquanto houver lease ativa, a tentativa continua; a última liberação cancela o transporte. Finalmente remover a tentativa usando comparação de identidade para não apagar uma sucessora. Testar uma saída durante dois consumidores e remoção/troca da chave antes de resposta.

Antes de persistir, reler contexto/revisão; se mudou, descartar. A proteção abrange discoveryCache, titleMetadata e integração, não apenas setState da tela. propagar signal de hooks/queryFn; não iniciar chamadas por foco.

## Descoberta completa e pausa

fetchPool conserva TIP_PAGES=8, PAGE_BATCH=4, parâmetros, ordem/deduplicação e regras da 057:

1. Validar revisão/pausa antes da página 1.
2. Antes de cada lote, validar contexto e pausa novamente.
3. Aguardar o lote já iniciado; qualquer rejeição invalida a tentativa inteira. 429 tem prioridade para pausa, mesmo com outros sucessos.
4. Não iniciar lote seguinte após falha; não publicar títulos parciais.
5. Publicar cache só após todas as páginas e última validação do contexto. Erro usa fallback anterior (stale=true) ou unavailable sem cache.
6. Sucesso não remove pausedUntil futura. Mutação de estado em transação compara revisão da credencial.

Retry-After: inteiro não negativo em segundos ou data HTTP válida futura; zero/data já vencida não gera pausa infinita. Fallback mantém RATE_LIMIT_PAUSE_MS atual de 10 minutos, acima do mínimo de 60 s. Emenda 2026-10-09: nenhuma pausa passa de MAX_PAUSE_MS (1 h) — Retry-After maior é limitado e pausa gravada além do horizonte (relógio adiantado) é ignorada; durante a pausa, "Testar" informa limite de uso sem chamar o serviço. Não converter erro de limite em credencial recusada. Respeitar pausa entre consumidores de descoberta, detalhes e demais chamadas TMDB abrangidas, sem novos retries automáticos.

## Interfaces e cobertura

Manter retornos DiscoveryResult, TitleMetadataView e categorias públicas de falha. Opções de teste/leases são aditivas; stubs não ligados ao produto não devem ser usados como fallback silencioso.

Contratos da 065: timeout/corpo/erro sem segredo e 429 com cache prévio + sucesso concorrente. Complementares: 401/404/5xx/JSON inválido, Retry-After nos dois formatos, sem cache, idioma/chave trocados, leases e cancelamento. Casos de integração não usam rede real.
