# Quickstart — verificação da feature 061 (classificação indicativa e nota TMDB)

## Pré-requisitos

- `tv-web/`: `npm install` feito; `npm run dev` na 5173 para o E2E e a verificação no navegador.
- Chave TMDB conectada (Configurações › Integrações & BYOK). Para dado real: lista e chave do `.env` da raiz
  (`CCPLAY_PROBE_*`, nunca expostas).

## Checagens automatizadas (de `tv-web/`)

```powershell
npx vitest run src/lib/metadata/contentRating.classificacao-nota-tmdb.contract.test.ts src/components/ContentRatingBadge.classificacao-nota-tmdb.contract.test.tsx src/lib/metadata/titleMetadata.classificacao-nota-tmdb.contract.test.ts src/features/movies/MovieDetailScreen.classificacao-nota-tmdb.contract.test.tsx
npx tsc -b
npm run lint
npm run test
npm run build
node e2e/run.mjs        # com npm run dev rodando
```

Travas (da raiz): `check-contract-tests.ps1 -Slug` para `061-classificacao-nota-tmdb`, `055-campos-da-listagem-xtream`,
`035-semelhantes-elenco-ator`, `033-trailers-filmes-series`, `032-metadata-tmdb-integracoes`,
`059-detalhe-cinema-filme-serie`, `060-home-vitrine-expandida`, `057-top10-dica-tmdb`.

## Cenários (navegador)

1. **Detalhe do filme** (US1/AC1): abrir um filme casado no TMDB, idioma pt → na linha de metadata, depois de
   `★ x,x Provedor`, o selo da classificação brasileira nas cores oficiais e `TMDB x,x`.
2. **Sem classificação do país** (US1/AC2): título sem classificação brasileira → nenhum selo (nem EUA, nem Espanha).
3. **Poucos votos** (US1/AC3): título com menos de 50 votos no TMDB → sem `TMDB`, a nota do provedor continua.
4. **Troca de idioma** (US1/AC4, SC-005): Configurações → idioma en → reabrir o mesmo detalhe → selo dos EUA (neutro);
   es → Espanha ou nada.
5. **Sem chave TMDB** (US1/AC5): remover a chave → detalhe igual ao de antes da feature.
6. **Registro antigo** (US1/AC6, SC-001): título aberto antes da feature → na primeira abertura, uma chamada `/3/movie/…`
   (ou `/3/tv/…`) com `release_dates`/`content_ratings` no `append_to_response`; na segunda, nenhuma.
7. **Série** (FR-010): detalhe de série casada → selo pela classificação de conteúdo da série.
8. **Billboard** (US2): Início com título em andamento casado → metadata do billboard com os dois, na ordem
   ano · duração · ★ Provedor · classificação · TMDB; boas-vindas → nenhum.
9. **Card expandido** (US3): focar cards do Início com metadata guardada → os dois; card do Top 10/Dica → nota TMDB
   mesmo sem metadata guardada; card sem nada guardado → nenhum; DevTools › Network: focar não faz requisição.
10. **Pôsteres** (FR-013): pôsteres não expandidos, grades e vitrine de Filmes/Séries sem selo novo.

## TV física (recomendação, não gate)

Legibilidade das cores oficiais sobre backdrops claros e escuros no hero e no billboard; corte dos selos com título longo.

## Checklist cross-cutting (constitution)

- [X] Focar não consulta nada (cenário 9).
- [X] Nenhum país de reserva; nenhum valor fora da escala (cenários 2 e 4).
- [X] Nota do provedor e do TMDB lado a lado, cada uma com a sua origem.
- [X] Nenhuma chave TMDB no DOM nem no console.
- [X] Selos não focáveis; nenhum estado sem elemento focável.
- [X] `npm run test:e2e` verde (`node e2e/run.mjs`, mesmo runner).

## Execução — 2026-10-06

`node e2e/run.mjs --only classificacao-nota-tmdb --jobs 1`: verde em Chromium 1920×1080, com TMDB simulado e fonte
isolada. Cenários 1–10 verificados: filme, ausência de país, 49 votos, pt/en/es, ausência de chave, renovação única,
série com episódio, billboard/boas-vindas, cache/Top 10/Dica no expandido e pôsteres sem novos selos. RETURN restaura
o card e SELECT reabre sem reconsulta. A releitura de idioma existente da 054 continua; classificação/nota ficam
visíveis pelo placeholder local de T036, sem carregar sinopse de outro idioma.

Capturas revisadas: `tv-web/test-results/classificacao-nota-tmdb/01-detalhe-titulo-longo.png` e `02-card-expandido.png`.
Título longo não sobrepõe ações; no card o TMDB pode ocupar a linha seguinte, sem cortar a sinopse ou a dica OK.

Primeira suíte geral: 40/41 scripts verdes, falha de paginação Live TV corrigida no desvio T037 autorizado pelo usuário.
Após T037: 40/41 em 417 s, paginação e 061 verdes; novo erro “Maximum update depth exceeded” em `memoria-foco-key-repeat`,
durante zapping. O reteste verde não foi usado como resolução: T038 reproduziu o erro com 100 eventos de scroll,
capturou a pilha e corrigiu os flushes síncronos do virtualizador Live (`useFlushSync: false`). Regressão incluída
no roteiro padrão; hook compartilhado intacto. **Suíte final: 41/41 em 405 s, sem retries**, com a versão corrigida.
TV física não executada (recomendação, não gate).

### SC-006 real — autorizado e executado

`node e2e/classificacao-nota-tmdb-real.mjs`: dez títulos distintos da lista real com id TMDB declarado pelo provedor,
em Chromium isolado a 1920×1080. Três respostas têm classificação BR válida e **3/3 selos** aparecem corretamente
no detalhe após renovação do registro antigo (**100%**). Nos outros sete não aparece classificação de outro país.
Dez segundas aberturas sem nova consulta de detalhe. Nenhuma nota da amostra atingiu o mínimo de votos; a regra de
nota elegível está coberta pelo roteiro simulado e pelos contratos. Nenhuma chave no DOM ou console.

Capturas reais: temporário do sistema, pasta `ccplay-classificacao-061-real`, fora do repositório. Saída do roteiro
contém somente contagens/índices, nunca nomes da lista, títulos, URLs privadas, usuário, senha ou chave.
O roteiro fica fora da SUITE e exige autorização de uso dos serviços/credenciais reais.

O polling dos dois roteiros 061 usa `expect.poll` com `page.evaluate` aguardado para leituras assíncronas do IndexedDB;
`waitForFunction` com função assíncrona aceitava a Promise antes do resultado e foi removido nesses pontos.
