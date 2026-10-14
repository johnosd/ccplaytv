# Execução US1 — gestão remota de listas

## Entrada da fase

Trava069 íntegra. O comando via npx.cmd com regex contendo pipe foi interpretado pelo wrapper cmd e não executou os testes; repetição direta `node.exe node_modules/vitest/vitest.mjs run src/lib/portal/portal-tv-licenca-anual.contract.test.ts -t 'US1|FR-005|FR-013-014'` reproduziu **4/4 vermelhos esperados** (15,18s): C1–C3 not implemented: applyRemoteMutation; C4 not implemented: toPortalSourceView. C5 fora do filtro, sem alterar teste/lock. A005 encerramento permanece.

Primeira rodada T011: `node.exe node_modules/vitest/vitest.mjs run src/lib/catalog/sourceRepository.test.ts src/lib/catalog/sourceRevisions.test.ts`: **25/25 PASS, 15,40s**. Fonte remota com ID explícito, revisão de create/update, remoção transacional/tombstone/outbox sem credenciais, import pendente cancelado, rollback total se outbox falha, licença/outra fonte preservadas. Extraída sourceDeletion.ts para conservar fachada sourceRepository dentro de404/409linhas. Edições locais de EPG em verificação adicional. T011 ainda aberta até essa rodada/type/lint.

T011 concluída: rodada ampliada sourceRepository/sourceRevisions/epgRepository **39/39 PASS, 15,41s**; `npx.cmd tsc -b` e `npm.cmd run lint` PASS. EPG manual/offset/enabled participa da revisão transacional; fonte/credenciais preservadas. Baseline não alterado.

## T012/T014/T015 — núcleo local em verificação final

Contratos C1–C4 **4/4 PASS, 15,27s**, C5 fora do filtro; teste/lock intactos. Regressão inicial importPipeline40/40 PASS,16,14s; testes adicionais reserva/outbox/configuração11/11 PASS,15,41s. Rodada após guardas finais: `node.exe node_modules/vitest/vitest.mjs run src/lib/catalog/importPipeline src/lib/catalog/importReservation.test.ts src/lib/catalog/sourceRepository.test.ts src/lib/catalog/sourceRevisions.test.ts src/lib/epg/epgRepository.test.ts src/lib/portal/remoteConfiguration.test.ts src/lib/portal/remoteImportOutbox.test.ts src/lib/portal/portal-tv-licenca-anual.contract.test.ts -t '^(?!US3/AC7)'`: **110/110 PASS em13arquivos,17,11s**, C5 excluído pelo filtro, A005 permanece.

Reserva de import por fonte é transacional em main/Worker; remote op/revisão/runId ligados antes da rede; floor monotônico sem varrer histórico, preservado por alterações locais. Publicação/revalidação da revisão/markSynced/runcompleted são um commit: crash não publica catálogo sem registro terminal, edição/remove não publica conteúdo obsoleto. Outbox tem lease, reconcilia runId/heartbeat após restart, detecta completed sem novo download e cancela handle após edição/delete commitado. Teste de rollback e crash commit/import passou; efeito externo não é prometido exatamente uma vez sob qualquer crash.

Aplicação remota tem destino/CAS/tombstone/digest/recibo/outbox no mesmo commit, import fora dele; conflito mantém credencial/catálogo e digest divergente retorna conflict sem overwrite. Confirmação ativa é revalidada após modal. EPG/vazio/clearFields opcionais e HTTP(S) validados; snapshot literal de5campos, revisões/import/capturedAt separados, nenhum URL/DNS/segredo/campo futuro. Fonte normal e código/licença permanecem locais; integração App/API/telas/E2E ainda pendentes.

Checkpoint T012/T014/T015 concluídas: `npm.cmd run build` (tsc/Vite/no-demux) e `npm.cmd run lint` PASS; Worker `importRunner.test.ts` 1/1 PASS (15,24s); trava069 PASS. Lint mantém os tetos e 21 avisos não bloqueantes, incluindo regex de controle validada; A005 em T041. T013 iniciou novos modelos/counter/serviço backend, ainda não validado.

## T013/T019 — API concluída localmente

Em api, com emulator127.0.0.1:8085 e PORTAL_TEST_FIRESTORE=1: `.venv/Scripts/python.exe -m pytest tests/portal -q -o cache_dir=../.cache/pytest-portal`: **71/71 PASS,66,23s**; `.venv/Scripts/ruff.exe check app/portal tests/portal`: PASS. Trava069 e git diff --check PASS. Baseline63 passou antes de8 casos novos. Primeira rodada1PASS/4FAIL reproduziu async_generator em extend; corrigida para compreensão assíncrona e repetida6/6PASS, depois suíte completa71/71.

Corrente/versão imutável/counter5/claim/operação em CAS; vazio preserva e clearFields sobrevive a edições posteriores. ACK/cancel/expiry liberam contador/ref uma vez e conservam corrente. Replay consulta claim antes do merge. Pull prioriza20 deletes, depois até5 create/update, valida epochs/fence/versão antes e depois do decrypt, lease60s e entrega pelo menos uma vez. Delete continua após rotação; aguardando confirmação não é aplicado. Metadados paginados99+device/cursor explícito. Snapshot estrito/monotônico; ausência não exclui/ACK.

8 casos novos: permanência/replay/cancel/allowlist; limite concorrente5/7+expiry; delete/counter/replay; snapshotCAS/cross-device; IDs antigos/ACK inválido/epoch; HTTP Origin/CSRF/pull429/ACK/snapshot segredo422; exclusão entre decrypt e CAS bloqueia payload+pedido simultâneo converge; paginação/clearFields persistente. Testes existentes journal indisponível/crash/>7dias/exclusão offline continuam verdes. Índice action+state adicionado.

Sem consultas IPTV, Cloud ou instalação TV. T016–T018/T020–T021 abertas; agente ainda fora do App e TV no pacote anterior à v22.

## T020 e bloqueio de T017

Regressões TV ampliadas: comando anterior do núcleo + importRunner/portalAgent e os3arquivos congelados067, filtro `^(?!US3/AC7)`: **121PASS/18arquivos,32,04s**, apenas C5 fora do filtro, sem edição/skip novo. Inclui reserva/pipeline/fallback/geração, crash/import/outbox/CAS/EPG e5contratos067. Travas032/034/037/054/067/069 PASS. T020 concluída.

T017 exige nova aba global Portal & licença. `tv-web/src/features/settings/SettingsScreen.configuracoes-lista-global.contract.test.tsx` exige exatamente5rótulos em expect(labels).toEqual(...), sem a sexta aba. Conflito identificado antes de alterar TV/teste, gate5b do sdd-execute: usuário consultado para emenda mínima, adicionando aba ao final e preservando demais verificações/posições. Nenhum teste congelado ou lock alterado. Proposta aguarda decisão explícita.

T016 portal UI em validação: cliente same-origin/CSRF/paginação/sanitização, QR consumido uma vez após remoção do fragmento, forms Xtream/M3U URL/EPG, input privado mascarado/vazio preserva, retry mesmoID/corpo, status separados, delete com dialog/teclado/foco. Build TypeScript/Vite PASS; rodada unit4/4PASS com A005 e lint aprovado antes dos últimos ajustes, rodada final/E2E em execução. Fontes locais/pt/en/es/tokensSpectrum consultados. Fixtures E2E não comprovam integração real TV/Cloud.

R-016 resolvido por autorização explícita do usuário: acrescentar Portal & licença como sexta aba global, somente no final da expectativa labels do contrato067. Demais asserts/navegação/escopo preservados; trava067 será regravada pelo script oficial, nenhuma outra trava será regravada.

### Continuidade após autorização da emenda 067

- Contrato 067: esperado passou de cinco para seis abas, apenas acrescentando Portal & licença ao final, com autorização explícita do usuário. Red esperado 1/1 antes do registro; lock 067 regravado pelo script oficial.
- Registro da nova aba: TypeScript corrigido para erasableSyntaxOnly, traduções portal.close/confirm pt/en/es e área portal registrada no teste não congelado de catálogos. Checagem tsc PASS e regressão i18n/067/054 20/20 PASS (20,29s).
- Conexão/perfis: 48/48 PASS (25,63s); nonce antes da rede, single-flight, ACK perdido sem recadastro, rotação por prova privada após 401, QR PNG local/prazo, atalho SELECT/RETURN.
- Painel/perfis: 47/47 PASS (20,39s); chave só após confirmação, RETURN oculta, cancelamento não revoga, pagehide invalida QR inclusive resposta atrasada.
- API autenticação/QR: 6/6 PASS (8,11s), PNG decodificado localmente; ordenação de imports Ruff corrigida e rechecagem pendente.
- Portal E2E: primeira tentativa 5 falhas por servidor 5174 desligado; após ligar, 4/5 PASS e falha real no foco inicial do diálogo. Corrigido com ref.focus após showModal; repetição em andamento, sem alterar testes/timeouts.

- T016 concluída: portal build/lint PASS e E2E 5/5 PASS (1,5min) após correção de foco do diálogo; unit4/4 PASS. Fixtures HTTP isoladas, sem prova de nuvem/TV/pagamento.
- Agente/adaptador T018 em execução: 19/19 testes estreitos PASS (19,20s), incluindo ACK perdido, prioridade de delete offline, cancelamento/edição concorrente e revogação durante confirmação. Homologação browser integrada pendente.

- T018 concluída localmente: agente único no App com modo rápido por referência de tela, observação de identidade/epoch, flush de delete antes de pull, esquema/destino/epoch/prazo validados, epoch revalidado no commit Dexie, confirmação global CANCEL/RETURN/abort sem efeito, encerramento da rota do player antes de confirmar commit e invalidação Query pós-commit. 12/12 testes de hook/painel/conexão/identidade PASS (18,57s); portas/núcleo19/19, perfis/portas/núcleo57/57 e tsc PASS. E2E App1/1 PASS (114,6s) com serviço/provedor fictícios; repetição após layout e regressão067 em andamento.
- Layout inicial deixava ações abaixo do QR; ajustado para duas colunas. Captura contém PNG fictício branco (não prova leitura física do QR). Baseline arquitetural preservado; fonte393→419/421 linhas após extração de helper puro, sem novos imports entre features.

- T021 concluída localmente: `node.exe e2e/run.mjs --only portal-configuracao,configuracoes-lista-global --jobs 2`: 2/2 PASS (114s; portal113,6s/06757,9s). Portal `npm.cmd run test:e2e`:5/5 PASS. Roteiro App usa Vite próprio5175/configuração DEV e serviços fictícios; cria/reapresenta/conflita/remove nos dois sentidos/offline sem recriar, snapshot sem segredo. Roteiro067 preserva seus cenários e acrescenta somente expectativa da sexta aba. Inicialmente fixture sem locale abriu em inglês; fixado pt-BR, repetição aprovada.

### Fechamento local US1

`node.exe node_modules/vitest/vitest.mjs run src/features/settings src/features/profiles src/features/portal`:193/193 PASS/38arquivos (61,38s). Contratos069 filtrando US1/FR005/FR013014:4/4 PASS (15,45s), C5 filtrado, nenhum teste congelado alterado. Travas069/067 PASS. TypeScript/lint/build PASS, sem demuxer. A005 close timed out10000ms reapareceu no processo dos contratos e permanece aberto em T041, sem aumento de prazo ou força de saída.
