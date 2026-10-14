# Evidências — US2 permanência e recuperação

## T022

Em api: `PORTAL_TEST_FIRESTORE=1 .venv/Scripts/python.exe -m pytest tests/portal/test_configuration_store.py tests/portal/test_configurations.py -q -o cache_dir=../.cache/pytest-portal`:12/12 PASS (11,80s); `.venv/Scripts/ruff.exe check app/portal tests/portal`:PASS.

Reenvio explícito exige snapshot da epoch atual recebido há menos de24h, revisão confirmada, corrente cifrada, nenhum tombstone e limite de operações. Novo ID/versão/prazo; campos privados só chegam à TV autorizada. Sem fonte na instalação recuperada, um snapshot fresco permite create explícito; nenhuma ausência dispara reenvio automático. Replay mantém o resultado mesmo após snapshot mudar ou exclusão cancelar a entrega. Reinício de colaborador e veto de tombstone testados. Expiração de create/update não é bloqueada por deletes pendentes na página.

T024/T025 em execução; nenhuma prova de reinstalação na TV pessoal nem homologação de nuvem.

## Recuperação em validação

API QR/recuperação/auth:16/16 PASS (13,13s), Ruff PASS. Portal build/lint e unit4/4 PASS, A005 de encerramento permanece aberto. TV conexão/painel/polling9/9 PASS (17,64s), polling isolado2/2 PASS; tsc/lint anteriores aprovados. Primeira rodada dos novos testes falhou por tokens fixture não canônicos; corrigidos somente fixtures e repetidos. Perda de ACK após commit agora preserva purpose=recovery e retoma confirmação; nenhum recadastro/remoção. E2E/HTTP complementares em andamento, T024/T025 abertas.

T024 concluída: E2E recuperação web2/2 PASS (1min) após corrigir seletor ambíguo; portal geral8/9 (o único desvio era esse seletor, reprodução repetida2/2). E2E TV integrado1/1 PASS (113,4s), incluindo recovery→commit→ACK perdido→reload→ACK e lista preservada. Primeira rodada TV falhou por assumir ADD focado com lista existente; corrigido somente seletor de navegação na fixture e repetido. API store/recovery14/14 PASS (8,91s), Ruff PASS. Travas067/069 íntegras. Nova regressão de exclusão pendente sem fonte entrou na rodada final, T025 aberta.

Rodada completa API: `$env:PORTAL_TEST_FIRESTORE='1'; .venv/Scripts/python.exe -m pytest tests/portal -q -o cache_dir=../.cache/pytest-portal`:76/76 PASS (67,45s), Ruff PASS. Emulator Native/Standard local, sem serviços reais.

Complemento concorrência UI: confirmação/ACK pode ser concluída pelo agente compartilhado enquanto o painel aguarda. Painel observa transição bootstrap→credenciais confirmadas sem falso erro de expiração; regressão painel/conexão/polling10/10 PASS (17,63s), A005 permanece. tsc em conclusão. Portal e TV lint/type aprovados, architecture423arquivos/146imports/37tetos sem afrouxar baseline; diff-check PASS (avisos LF/CRLF somente).

## Fechamento local US2

Portal `npm.cmd run build; npm.cmd run test:e2e`:build PASS, E2E10/10 PASS (2,2min). T025 e checklistUS2 concluídos. API76/76/Ruff, TV recovery/painel/polling10/10, E2E App1/1, travas íntegras. Nuvem/backup real/reinstalação física e pagamento não foram validados nem inferidos. A005 continua aberto para T041.
