
T027/T028: provedor fake e HTTP MockTransport, webhook assinado com lookup autenticado e conciliação durável; 11 testes pagamentos/licenciamento/worker PASS em 8.24s, Ruff PASS. Sem validação Mercado Pago real. T029: 7 testes PASS, primeira checagem tsc apontou tipagem de mock; corrigida e revalidação em andamento.

T029 concluída: 7/7 testes PASS em 16.86s e tsc -b PASS após corrigir a tipagem do mock. A005 encerramento Vitest permanece aberto em T041. Assinatura, destino, floor, rollback, checkpoint e background são locais; integração ao player segue em T031/T033.

T034: suíte API inteira 90/90 PASS em 79.20s e Ruff PASS com Firestore emulator. Não comprova Mercado Pago/Firestore IAM reais. Guarda central + PlayerService + monitor + contratos: 39/39 PASS em 17.16s; primeira integração tsc detectou mode ausente na rota profiles e mock sem nova porta, corrigidos. Arquitetura detectou 3 linhas excedentes em PlayerService: removidas apenas linhas vazias, sem alterar baseline. E2E web licença: 2/3 PASS, primeiro perdeu entrada QR em navegação inicial; reexecução diagnóstica pendente, não aceito como estável.

T033 integração: teste PlayerLayer real identificou que onExit normal reaplicava intervalo periódico e deixava posição 40s ao vencer em 43s. Adicionada razão específica license: checkpoint final elegível, sem inferir conclusão, antes de close; implementação em usePlayerSession respeita teto original e testes congelados não alterados. Revalidação pendente.

T033 correção revalidada: PlayerLayer/gravador/guarda 29/29 PASS em 18.93s. E2E web licença reexecutado: 3/3 PASS em 1.2min, mas falha inicial de entrada QR permanece registrada até passar no conjunto completo. Diagnóstico A005 com hanging-process: 8 FILEHANDLE sem stack, inclusive em teste puro isolado. Nenhuma elevação de timeout/force-exit adicionada.

T032 UI implementada e verificada com fixtures: E2E TV comercial 1/1 PASS em 74.1s cobre trial, QR, ativação com página de compra ausente, reprodução offline, expiração, checkpoint43s e fonte preservada. Primeira falha de vencimento era fixture substituindo Date.now capturado; corrigido offset na função original de teste, sem alterar relógio de produção. T036 ainda parcial: cenários fake criados, pagamento de teste real depende projeto/conta de homologação. Travas 069 e 067 PASS (5 contratos cada).

Portal completo: 13/13 E2E PASS em 2.2min, incluindo os três de licença. Rodada inicial QR perdida permanece no histórico; conjunto final não reproduziu. Build TV PASS485 módulos/603ms e guard sem demux PASS. Manifesto atualizado com SettingsScreen.css; findUnlistedFiles=[] para o build atual. T039 preparo de schedule/restore CLI/dry-run PASS, replay/ensaio real ainda pendentes.

T041 regressão in-scope: pinMigration.upgrade.test.ts (não congelado) ainda exigia verno21 e construía v20 copiando também as tabelas novas069. Fixture agora exclui as seis tabelas v22 e parentalPins, exige upgrade22 e preserva todos os asserts de PIN/bloqueio. Travas067 não alteradas. App.source-access falhou três casos na suíte, mas isolado5/5 PASS; instabilidade de execução permanece aberta.
