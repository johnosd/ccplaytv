# Evidência automatizada e visual — 062

Data: 2026-10-06. Chromium/Playwright desktop, Stage 1920×1080, origem `http://localhost:5173`; sem backend, fonte ou chave real. Não estabelece rede `file://`, AVPlay, desempenho ou memória na TV.

## Resultado da própria feature

- `node e2e/teste-conexao-tv.mjs`: aprovado. Usa motor real com transporte GET/ReadableStream e relógio controlados; nenhum payload enviado à Cloudflare. Métricas das capturas pertencem à fixture.
- Sucesso com três métricas; parcial após erro, limite de 100.000.000 bytes reservados e timeout de 30 segundos; liberação do stream (contador ativo zero); erros sanitizados/429; cancelamento preserva resultado anterior.
- Sem fonte/chave: foco/abertura não medem. SELECT inicia; Cancelar/RETURN fecha primeiro diálogo, devolve card e scroll; repetição oferece controle focado.
- Persistência após reload; dock leva ao mesmo card por serviço sem abrir/iniciar; RETURN de Configurações retorna ao dock. Resumo/data/destino locais.
- pt/en/es e controles nomeados aprovados. Capturas revisadas: `tv-web/test-results/teste-conexao-tv/{ready-pt,result-pt,dock-pt,ready-en,ready-es}.png`. Texto/ações visíveis e foco Spectrum sem cortes observados.
- Unitários: guarda de mídia, pagehide/desmontagem/resultado tardio, armazenamento indisponível, data corrompida e compromisso/fechamento/gravação cobertos. Após revisão: 38/38 testes da área; contrato lock íntegro.

## Gates do repositório

- `npm run test`: 459 arquivos / 2866 testes verdes antes da revisão final de persistência/data; esta revisão acrescentou um caso e passou em 38 testes da área.
- `npm run lint`, `npx tsc -b --pretty false`, `npm run build`: exit 0; lint específico pós-revisão também exit 0. Build final sem demux; alvo chrome108 preservado; 16 assets no YAML, zero ausentes.
- Locks 026/028/032/060/062 PASS, sem regravação.
- `npm run test:e2e`: 41/42 scripts aprovados em 320s (exit 1); falha externa confirmada em `epg-guia-completo` no foco do primeiro programa da aba Amanhã. `node e2e/epg-guia-completo.mjs` repetiu o mesmo erro (exit 1). Não houve alteração no código de EPG; causa ainda não diagnosticada. Decisão solicitada segundo sdd-execute passo 6.

## O que falta

T022 continua aberto por falha da suíte E2E. T023 não iniciado: nenhuma instalação/medição física ou observação de memória/cancelamento real foi feita. FR-023/SC-007 permanecem pendentes; feature Em Execução.
