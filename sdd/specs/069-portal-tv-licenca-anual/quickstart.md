# Quickstart de validação — 069

Plano revisado em 2026-10-11. Fluxos de configuração, recuperação e licença implementados e validados localmente; homologação real e venda continuam bloqueadas. Consulte evidencias/validacao.md para resultados e falhas abertas. Fixtures fictícias somente, sem ler `.env` real ou `docs/m3u/dados.md`. Nunca desinstalar TV do usuário.

## 1. Pré-condições

T001 formalizada na constitution 1.8.0, atualizada para 1.9.0 pela decisão de vencimento na entrada; T003 mede identidade/ES256/tempo/persistência no alvo. E2E antecede hardware. Mantenedor opera backup/restore; recuperação de licença é pelo site, sem atendimento. T045 publica termos/retenção, verifica conta Mercado Pago e oferta R$35/12 meses/uma TV antes da venda.

## 2. Baseline disponível hoje

Na raiz:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .planning/scripts/powershell/check-prerequisites.ps1 -Stage plan -Slug 069-portal-tv-licenca-anual -Json
powershell -NoProfile -ExecutionPolicy Bypass -File .planning/scripts/powershell/check-contract-tests.ps1 -Slug 069-portal-tv-licenca-anual -Json
```

Em `tv-web/`:

```powershell
npm.cmd exec -- vitest run src/lib/portal/portal-tv-licenca-anual.contract.test.ts
npm.cmd exec -- vitest run src/lib/catalog/sourceRepository.test.ts src/lib/catalog/importPipeline.test.ts
```

Baseline de planejamento: cinco falhas por not implemented, registradas em evidencias/planejamento.md. Estado implementado: C1–C5 verdes e trava069 preservada. A emenda mínima da aba global067 foi autorizada pelo usuário e registrada em R-016; não autoriza outras alterações de contrato.

## 3. Ambiente local e integrações futuras

1. Firestore Emulator isolado, projeto de teste explícito, testes recusam produção/emulator ausente. Em api: `uv sync --locked`, `uv run python portal_main.py` (porta 3001). Sem PostgreSQL/Alembic do fallback.
2. Batch local: `uv run python -m app.portal.worker --once` (T009), sem loop permanente. Journal fake local; testes de journal real somente homologação explícita com credencial ADC.
3. Em portal-web: `npm.cmd ci`, `npm.cmd run dev` (5174, proxy /portal/v1→3001). Em tv-web: `npm.cmd run dev` (5173). Só origem pública do serviço no cliente, nunca chave privada VITE_*.
4. Homologação real dedicada: API+portal HTTPS mesma origem, jobs privados/OIDC, Firestore e bucket journal privados, ADC sem chave JSON; segredos fora de comandos/logs/imagem. Testes precisam opt-in explícito para recursos reais, prefixo isolado e limpeza limitada ao fixture criado.

## 4. Gates automatizados após implementação

TV: `npm.cmd exec -- tsc -b`, `npm.cmd run lint`, `npm.cmd run test`, `npm.cmd run build`; com dev ativo `npm.cmd run test:e2e`. Somente após os gates, empacotar e validar hardware, com assets listados/chrome108. O pacote pessoal `build:tizen` preserva o uso atual; distribuição comercial exige `build:tizen:commercial`, origem HTTPS e chaves públicas de confiança em VITE_LICENSE_PUBLIC_KEYS (nunca privadas), conforme docs/portal/operacao.md. API: `uv run ruff check .`, `uv run pytest tests/portal`, `uv run pytest`. Portal: `npm.cmd run lint`, `npm.cmd run test`, `npm.cmd run build`, `npm.cmd run test:e2e` (servidor portal iniciado em outro terminal). Verificar locks afetados 032/034/037/054/067 com check-contract-tests.ps1, além de 069.

## 5. Cenários reprodutíveis

| Cenário | Ação | Resultado esperado |
| --- | --- | --- |
| QR/manual | Convite válido/expirado/replay, key inválida, outra TV, revoke | Apenas destino autorizado; sessão finita, key fora de URL, CSRF/rate limit/nullOrigin testados. |
| Fontes | Criar/editar Xtream e M3U URL com EPG/campos já suportados | Recebido/aplicado/import separado, categorias/identidade/estado compatível preservados; nenhum upload/fetch IPTV no servidor. |
| Offline/conflito | Enviar create/update offline, voltar antes/depois de 7 dias, repetir ACK, editar local concorrente | Aplicar uma vez ou expirar/conflitar; versão corrente guardada não some, reenvio explícito novo comando. |
| Permanente | ACK→restart→reabrir→campo secreto vazio→substituir→reenviar | Segredo cifrado permanece, browser nunca lê configuração guardada; nonce/AAD/versão novos, destino/revisão validados. |
| Exclusão TV online | Remover local e sincronizar | Tombstone/outbox atômicos; portal remove segredo/cancela pendências, licença/outras listas intactas. |
| Exclusão TV offline | Desconectar, remover, reiniciar, enfileirar comando antigo no serviço, reconectar | Outbox enviada primeiro, comando antigo não recria fonte; portal distingue pending/confirmed, sem segredos restantes ativos. |
| Exclusão portal offline | Remover no site, manter TV offline >7 dias, voltar | Delete ainda pendente, sem ciphertext nem create/update antigos; confirmação local se uso ativo, ACK final. |
| Falha journal | Crash antes/depois de append e antes de finalize, retry/digest divergente | Sem ACK falso; fence/outbox preservados, completion idempotente, objeto não sobrescrito. |
| Restore antigo | Backup→excluir fonte/revogar→restore isolado→replay journal | Fonte/segredo não ressuscitam; sessões antigas inválidas, ledger conciliado sem meses duplicados. |
| Recuperação pelo site | Exibir código por ação explícita, guardar/fotografar fixture; reinstalar apenas lab; confirmar mesma TV no site | Código inválido/usado/outra TV/expirado/brute force recusados; um vencedor concorrente; perda de resposta/ACK retomável conforme logic §7, novo código e acessos antigos inválidos, trial/validade preservados. Sem código/acesso anterior informar impossibilidade; sem catálogo prometido. |
| Compra | Fake e pagamento de teste separados; Pix/cartão, pendente/recusa/duplicação/retorno tardio/estorno | Oferta exatamente BRL 3500, manual/12 meses/uma TV; lookup concede uma vez, redirect não concede, pendente não recompra sozinho. |
| Tempo/licença | Trial 7 dias, clamp/renovação, rollback/restart, entrada offline, vencer dentro da lista/player, sair/reentrar por escolha/RETURN/importação | Licença vigente permite entrada offline; vencimento mantém sessão até sair/fechar. Próxima entrada vencida é recusada, dados preservados. Revogação recebida encerra controladamente; limite do relógio registrado. |
| Lifecycle | Tela rápida→sair→suspend→restart/reconnect | Imediato/10 s só tela aberta, normal 24 h persistido, retry limitado, agente único, foco/player não fazem rede. |
| UX | pt/en/es, teclado/touch, setas/SELECT/RETURN em loading/vazio/erro/bloqueio | Ação focável/RETURN restaurado, foco nunca dispara compra/import/play; DS V14/067/068 preservados. |

## 6. Operação e segurança

Inspecionar DOM/aria/requests/responses/logs/Pydantic/proxy/CI com marcadores fictícios, sem imprimir ambiente real. A exibição explícita de código/device key é exceção restrita, não vazamento permitido em telas comuns. Dump e backup contêm somente ciphertext autorizado/metadados, nunca chaves. Testar rotação/cópia protegida das chaves separadas; acesso a configuração/revisões Cloud Run é privilegiado.

Provar API pública recusa tick inclusive com sessão, Scheduler OIDC real invoca privado, SPA não captura API/internal/webhook. Firestore real valida claims/leases/retries/índices/ADC, bucket valida create-only, crash/retry não perde delete nem duplica grant. Emulator sozinho não prova IAM.

Backup diário 7 dias; detectar último sucesso >24 h e falha simulada. Restore nova base, journal 30 dias íntegro, chaves recuperadas separadas, reconcile e manutenção antes de abrir tráfego. Registrar snapshotTime/última alteração recuperada/RPO/RTO, responsáveis e passos de reversão. Não afirmar objetivo de 24 h se backup falhou.

## 7. Medição e aceite físico

>=100 alterações e >=100 ativações, amostras frias/quentes/rede registradas, p50/p95 e tamanho da amostra. Metas recebimento 30 s/licença 60 s só tela rápida, importação separada. Carga 10–50 TVs e margem simulada 100; medir polling/documentos/índices/retries/logs/builds/imagens/egress/backup/journal/restore/câmbio/impostos. Referência R$35/mês, alertar previsão/excedente sem desligar serviço; não prometer custo zero.

Após E2E, validar TV física com tizen-tv preservando dados/assinatura: QR legível→pagamento de teste→ativação, expiração/reativação/offline/foco/controle real. Reinstalação/recovery somente laboratório autorizado. Separar aprovado/reprovado/não testado, fake/sandbox/infra real/browser/hardware. Venda bloqueada enquanto T001/T003/T039/T043/T045/T046/T052 não aprovados. Documentação atualizada em T044/T047 por evidência, não por previsão.

## Sonda de plataforma T003 (execução)

Após E2E, build opt-in VITE_CCPLAY_PLATFORM_PROBE=1. Opcionalmente VITE_CCPLAY_PLATFORM_PROBE_REPORT=http://IP_PC:8769/platform-probe; coletor infra/portal/dev/platform-probe-server.mjs exige PROBE_HOST/PROBE_DEVICE_ADDRESS explícitos para LAN. Nunca enviar DUID/digest/segredos; schema estrito. Atualizar TV preservando dados, medir reabertura/suspend separadamente e registrar em evidencias/plataforma.md. Reinstalação somente aparelho de laboratório. Voltar ao build normal ao concluir; não distribuir build de diagnóstico.

T003 (2026-10-11): sonda real file:// via SDB/CDP aprovou DUID estável, ES256 assinatura 64 bytes/tamper, AES-GCM/AAD tamper e persistência. Usuário confirmou abertura/reabertura/standby com dados preservados. No standby observado, wall/monotonic avançaram igualmente 33.468 ms e zero visibilitychange; T009/T035 não devem depender somente desse evento. Desligamento completo/adulteração/reinstalação não comprovados. Evidência: evidencias/plataforma.md.

## Firestore Emulator validado localmente

Componente SDK `cloud-firestore-emulator` 1.22.0 e JRE25 portátil em .cache/java25. Iniciar em terminal próprio, raiz do repositório:

```powershell
$env:CLOUDSDK_PYTHON = Join-Path (Get-Location) "api/.venv/Scripts/python.exe"
$env:PATH = (Join-Path (Get-Location) ".cache/java25/jdk-25.0.4.1+1-jre/bin") + ";" + $env:PATH
gcloud.cmd emulators firestore start --host-port=127.0.0.1:8085 --database-mode=firestore-native --edition=standard --project=demo-ccplaytv-portal --quiet
```

Em outro terminal, api/: `$env:PORTAL_TEST_FIRESTORE="1"`; `.venv/Scripts/python.exe -m pytest tests/portal -q -o cache_dir=../.cache/pytest-portal`. Fixture só usa loopback/demo explícitos e limpa apenas documentos fictícios criados pelo teste. Sem o opt-in, testes de integração são skip, nunca prova de concorrência. Emulator não prova IAM/índices/custo de produção.
