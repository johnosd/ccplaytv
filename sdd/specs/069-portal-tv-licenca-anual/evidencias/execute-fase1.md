# Execute 069 — fase 1 (2026-10-11)

Modo contínuo autorizado. T001 normativa já concluída; T002 operação e T051 preparação de infraestrutura concluídas. Nada provisionado, nenhuma cobrança habilitada. Demais itens requerem seus gates, sem marcar por preparação parcial.

## Verificações realizadas

- `check-prerequisites.ps1 -Stage execute -Slug 069-portal-tv-licenca-anual -Json`: PASS.
- `check-contract-tests.ps1 -Slug 069-portal-tv-licenca-anual -Json`: PASS, cinco contratos íntegros, sem edição.
- `api/.venv/Scripts/ruff.exe check api/app/portal api/portal_main.py api/tests/portal`: PASS após implementação inicial e após sanitização BLE001 justificada na fronteira HTTP.
- `api/.venv/Scripts/python.exe -m pytest api/tests/portal -q -p no:cacheprovider`: 7/7 na execução com client Firestore/sanitização; revalidação final aprovada.
- `uv --cache-dir .cache/uv lock --check --offline --project api`: PASS, 69 pacotes.
- `npm.cmd exec -- tsc -b` em tv-web: PASS.
- `npm.cmd exec -- vitest run src/lib/portal/platformProbe.test.ts`: 2/2; timeout de encerramento Vite8.3.0 persiste, portanto não declarar runner resolvido.
- `node --check infra/portal/dev/platform-probe-server.mjs` e parsing de 12 JSON da infra: PASS. Docker/manifests não aplicados; IAM/OIDC/backup reais não provados.
- Portal `npm ci --ignore-scripts --cache ../.cache/npm`: PASS após encerrar processos concorrentes. Primeira instalação npm teve erro interno edgesOut; alternativa legacy-peer-deps gerou lock que passou no ci padrão. Uma tentativa de ci concorrente com testes foi interrompida por arquivo nativo aberto, reparada por encerramento/reinstalação. Não é falha do produto.
- Portal Vitest8.3.0: 1/1, com timeout de encerramento. Vite8.3.1 testado no novo portal, mas não resolveu; revertido para 8.3.0, A005 continua aberta. Build do portal aprovado.

## Falha que exige decisão — player de desenvolvimento

`npm.cmd run test:e2e` em tv-web, dev ativo, encontrou falha em `player-dev-mpegts`: primeiro canal .ts não chegou a tocar em 15050 ms (limite15000). As 10 trocas, no máximo uma conexão/um video, fechamento, erro de codec, reconexão e ausência de reload/URL em console passaram. A suíte completa terminou 45/46 (1075 s); repetição isolada também falhou (15040 ms no primeiro play), demais cenários passaram. Não aumentar timeout.

Esse cenário é do player existente; nenhuma integração de licença/portal foi ligada a playback. Sonda só é acionada em build opt-in, ausente no dev normal. Causa raiz e eventual intermitência ainda precisam investigação isolada. Passo6 do sdd-execute exige decisão antes de corrigir fora do escopo, inclusive em modo contínuo. Usuário autorizou investigar e corrigir agora; desvio T053/R-014 registrado. Não atualizar TV nem avançar fundação enquanto gate pendente.

## Plataforma e ambiente

SDB detectou QN50Q60DAGXZD conectada, platform_version9.0. Isso não prova execução da sonda. Reinstalação somente laboratório autorizado; preservar dados da TV atual. Usuário ainda criará o projeto Google Cloud; há somente a TV atual e todos os dados devem ser preservados. Reinstalação não autorizada. Evidência específica em plataforma.md.

## Investigação T053

Sonda temporária no E2E: primeiro vídeo MSE/blob, readyState=1, networkState=2, paused=false, currentTime=0.023, buffer=[0.023,30.023], sem canplay/playing. Avanço manual de 10 ms para dentro do buffer não resolveu em 3 segundos. Correção experimental correspondente removida; causa ainda em investigação, não declarar resolvido. Nenhum contrato editado.

Pausa/play permaneceu pendente e não retomou. Busca diagnóstica de 1 s dentro do buffer resultou em readyState=4/currentTime=1.022999/5 frames, mas o predicado original só verifica >0.5 s; não basta para provar relógio avançando após seek. Testando reset da seleção nativa antes do anexo MSE, sem saltar conteúdo.


T004 concluída: `npm.cmd run lint` portal exit 0; E2E `node node_modules/@playwright/test/cli.js test --workers=1 --reporter=line --global-timeout=60000` com servidor já iniciado: 1/1 (43,9 s). Plugin webServer removido da configuração; README exige npm run dev em outro terminal, como suíte TV. Verificação Chromium separada confirmou estado/foco, sem equivaler a plataforma física.

Correção única via STATISTICS_INFO também foi ineficaz: tentou currentTime=0.123 em 1,8 s, porém seeking/readyState=1 persistiram até o fim do stream. liveBufferLatencyChasing da biblioteca também não passou no orçamento. Ambas as tentativas foram removidas. Instrumentação temporária seguirá no protocolo Media do Chromium; nenhuma alteração experimental ficou em produção. E2E permanente foi fortalecido para exigir avanço medido de 250 ms, além de readyState/posição, sem aumentar timeout.

Comparação T053: Chrome instalado, mesmo roteiro/predicado fortalecido/orçamento, primeiro play em 7655 ms; Chromium já exercitado em harness separado reproduziu no app (readyState4, currentTime6.62, 104 quadros). No Chromium frio, CDP ficou kStarting após kSeek0.023, sem decoder iniciado. Ajuste final proposto é só no E2E: Chrome primeiro, Chromium alternativo, registrar navegador/versão. Nenhuma tentativa de manipular buffer ficou no adaptador/demux. Regressões completas ainda pendentes.


Novo bloqueio fora do escopo: `npm.cmd run lint` TV acusa architecture max-lines userStateRepository.ts 366 > 362. Arquivo já estava modificado antes da 069. Sem falha funcional demonstrada; não afrouxar baseline nem desfazer alterações externas. Decisão solicitada ao usuário conforme passo 6. Build e suíte completa já iniciados seguem para coleta de evidência, sem avanço de fase/TV.

`npm.cmd run build` TV aprovado: TypeScript, Vite 452 módulos e check-no-demux-in-build PASS. O comando combinado terminou exit0 por causa do build final, mas o lint anterior falhou no gate de arquitetura R-015; não tratar exit agregado como lint aprovado. Auditoria git confirmou que devDemux.ts/devDemux.test.ts/htmlVideoAdapter.ts não têm alterações finais desta investigação; somente o roteiro E2E mudou. Contratos 047 (4 casos) e 069 (5 casos) íntegros.

Revisão estática T003: allowlist de destino da sonda deve ancorar IPv4 LAN e rejeitar sufixos DNS (exemplo fictício 192.168.exemplo.test passa no regex atual). Nenhuma requisição foi feita. Corrigir dentro de T003 antes de compilar diagnóstico, junto do tratamento de URL inválida; risco restrito a env de diagnóstico configurado pelo mantenedor, relatório não contém DUID/digest.

### Checkpoint final T053 — 2026-10-11

- Suíte TV completa: **47/47 PASS**, 1062 s, jobs 3; player-dev-mpegts 138,3 s e portal-plataforma 43,8 s.
- T053 concluída: prioridade ao Chrome instalado e verificação de avanço real do relógio; orçamento inicial de 15 s preservado, sem mudanças no adaptador de vídeo.
- Build TV aprovado; lint continua bloqueado pelo gate preexistente R-015 (366/362 linhas). Proposta de extração pura aguarda decisão do usuário.
- Prova física T003 não executada; nenhum dado da TV alterado. Execução: 5/62 itens concluídos.

### R-015 / T054 — autorização e validação

Usuário autorizou em 2026-10-11 a extração mínima de isInHistory para historyPolicy.ts. Import/reexport compatíveis; alteração preexistente de favoritos preservada, sem schema ou baseline alterados. Gate conta 356 linhas (limite 362).

- `npm.cmd run lint`: PASS, incluindo arquitetura; avisos preexistentes mantidos.
- `npm.cmd run build`: PASS, TypeScript e check-no-demux incluídos.
- `npm.cmd run test -- src/lib/catalog/userStateRepository.test.ts src/lib/catalog/userStateRepository.historico.contract.test.ts src/lib/catalog/historyRemoval.test.ts src/lib/catalog/historyRemoval.limpar-historico.contract.test.ts src/lib/portal/platformProbe.test.ts`: 5 arquivos, 47/47 PASS. Aviso de encerramento Vite A005 permanece aberto; exit 0.
- Travas 036 e 069: PASS, arquivos de contrato intactos.
- Sonda T003: validação de URL do coletor restringe host local, recusa domínio com prefixo 192.168., credenciais/query/fragmento e URL inválida; teste adicional aprovado.
- Primeira invocação de npm/npx foi recusada pela política PowerShell; repetição com npm.cmd executou normalmente.

E2E afetados finais: `npm.cmd run test:e2e -- --only historico-continuar-assistindo,limpar-historico,portal-plataforma --jobs 2` — 3/3 PASS em 93 s (49,2 s / 52,0 s / 44,1 s). T054 concluída; 6/63 itens.

T003: build opt-in da sonda (`VITE_CCPLAY_PLATFORM_PROBE=1`, coletor LAN explícito) e `npm.cmd run build:tizen` aprovados, assets sincronizados. Instalação assinada de diagnóstico em andamento; isso ainda não comprova execução na TV.

T003: atualização assinada instalada e lançada na TV pelo skill tizen-tv, mesmo author, sem desinstalar. Relatório físico ainda ausente; confirmação visual/dados solicitada ao usuário. Não avançar à fase 2 sem prova do gate.

### T003 — prova real parcial via inspetor

Usuário confirmou reabertura com listas/favoritos preservados. SDB debug lançou app e encaminhou porta 41407→localhost:9229. Relatório real sanitizado coletado por Runtime.evaluate: DUID estável, ES256 (64 bytes)/tamper, AES-GCM/AAD tamper e persistência PASS em file://. Nenhum identificador bruto/digest/catálogo lido. Coletor HTTP sem entrega foi encerrado; nenhum firewall alterado. Standby/retorno solicitado ao usuário, baseline de lifecycle em memória do app. T003 continua aberta até esta medição; 6/63 itens concluídos.
