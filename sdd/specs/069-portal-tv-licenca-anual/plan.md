# Implementation Plan: Portal da TV e licença anual

**Slug**: `069-portal-tv-licenca-anual` | **Date**: 2026-10-10 | **Revisão**: 2026-10-11 | **Spec**: [spec.md](spec.md)

## Summary

Portal React sem conta pessoal para configurar Xtream/M3U por URL e comprar licença anual de **R$35 por TV**. FastAPI serve API e portal na mesma origem HTTPS do Cloud Run; Firestore guarda controle, configurações cifradas e pagamentos. Importação, catálogo e Direct Play continuam na TV. Licença assinada vigente permite entrada offline; a sessão aberta continua até sair/fechar, mesmo após vencer; consulta diária recebe alterações. Entrega rápida apenas enquanto QR/configuração/compra estiver aberta.

Replanejamento completo das três stories e dos 33 FR/12 SC, sem implementação ou provisionamento. Preservados T001–T052, os cinco contratos congelados e as cinco seções finais de execução. Pendências de preço nas seções finais corrigidas nesta resolução autorizada pelo usuário: **FR-021 agora fixa 3500 centavos BRL**; T045 valida aplicação desse preço, conta/termos/custos, sem rediscutir o valor. R$10/mês é a referência operacional de infraestrutura; não se confunde com a licença anual.

## Technical Context

| Item | Base real e decisão |
| --- | --- |
| Linguagens | TypeScript `~6.0.2`; Python `>=3.13`. Versões resolvidas pelos lockfiles, sem trocar a stack aceita nas ADRs 001/003/006/013. |
| TV existente | React `^19.2.8`, Vite `^8.3.0`, Dexie `^4.4.6`, TanStack Query `^5.102.8` e Virtual `^3.14.13`; manifestos atuais, não números de versões instaladas garantidos. |
| API existente | FastAPI `>=0.141.1`, HTTPX `>=0.28.1`, pydantic-settings `>=2.15.0`, Uvicorn `>=0.52.4`, uv. Fallback SQL congelado, runtime novo `api/portal_main.py` importa somente `app.portal`. |
| Dependências novas propostas | `google-cloud-firestore`, `google-cloud-storage`, `cryptography` para AES-GCM/ES256; QR local no portal/TV. T004 fixa versões/licenças no lock após prova. Não adicionar biblioteca de foco. |
| Storage | Firestore Standard/Native, ADC por identidade do serviço; configurações permanentemente cifradas, ledger/claims/fila. IndexedDB existente para catálogo e novas revisões/outboxes/licença. Sem acesso Firestore direto de browser/TV. |
| Hospedagem | Google Cloud `us-central1` proposta; API pública + React estático, jobs privados na mesma imagem com Scheduler OIDC/IAM. Request billing/min 0; 1 vCPU/512 MiB/max 2 por serviço como ponto inicial a medir. |
| Segredos | Ambiente privado, chaves separadas por finalidade e versão, cópia protegida externa ao banco. Sem KMS/Secret Manager/chave Google JSON; não colocar valores em Git/imagem/CLI/logs/VITE_*. |
| Backup | Nativo Firestore diário, retenção proposta de 7 dias; journal mínimo independente em Cloud Storage para exclusões/revogações. RPO nominal <=24 h monitorado, RTO medido, restore isolado e manual. |
| Testes | Vitest `^5.0.0`, fake-indexeddb `^6.2.5`, Testing Library, Playwright `^1.63.0`; pytest `>=9.1.1`, Ruff `>=0.16.7`; emulator + homologação real separada. |
| Alvo | Samsung QN50Q60DAGXZD/Tizen 9/Chromium 120 medido; manter build `chrome108`, origem `file://`. Celular/desktop HTTPS para portal. |
| Escala/custo | 10–50 TVs; referência R$10/mês, faturamento habilitado/excedentes aceitos com aviso e serviço ativo. Medir 100 TVs simuladas como margem, sem promessa de capacidade/custo zero. |
| Metas | p95 recebimento <=30 s e licença <=60 s com tela rápida aberta; >=100 amostras de cada incluindo cold start. Importação separada. Normal 24 h persistido, rápido imediato/10 s, backoff máximo 60 s. |

## Decisões Invariantes

- **D-001 — Fronteira:** TV mantém catálogo, importação e reprodução; servidor mantém estado desejado, autorização, fila, pagamento e concessões. Snapshot confirma estado aplicado, nunca cria lista.
- **D-002 — Isolamento:** novo entrypoint/settings/repos Firestore; não importar `api/main.py`, SQLAlchemy/Alembic, routers do catálogo ou iniciar PostgreSQL para o portal.
- **D-003 — Identidade:** deviceId/DUID não autenticam. Bearer TV e device key são distintos; convite aleatório 256 bits/5 min/uso único; sessão 30 min inativa/8 h absoluta; epoch invalida acessos. Recuperação pelo site com código privado e desafio da mesma TV, rotação/revogação, sem novo trial (logic §7). **Atualização (070):** a device key passou a ser numérica de 10 dígitos e a entrada manual usa o ID exibido (`displayId`) + chave; convite segue 256 bits/uso único. Limites e recusa uniforme na D-005 da 070.
- **D-004 — Cifragem/retenção:** AES-256-GCM, nonce novo, AAD deviceId/sourceId/configVersion/keyVersion. Configuração corrente vive enquanto cadastrada; ACK/cancelamento/expiração não a apagam. Browser não lê segredo salvo. Servidor decifra transitoriamente em fluxo autorizado; não é E2E opaco. **Atualização (070):** "Browser não lê segredo salvo" vale para leituras comuns; a rota `values` (sessão `manage` da mesma TV, allowlist, `no-store`) é a única exceção, por constitution 1.10.0.
- **D-005 — Concorrência:** sourceId estável, revisão aplicada distinta da versão desejada; toda mutação local/remota incrementa revisão atomicamente com recibo/outbox. Operações imutáveis, entrega pelo menos uma vez, aplicação idempotente. Callback Firestore sem efeitos externos.
- **D-006 — Escopo de fonte:** somente `provider_credentials` e `m3u_url`, com campos complementares suportados. Sem upload, arquivo/chunks M3U, `m3u_file`, `sourceFiles`, API keys TMDB/OpenAI remotas ou exportação de segredos exclusivos da TV.
- **D-007 — Exclusão domina estado antigo:** remover na TV grava tombstone e outbox no mesmo commit. Sincronização envia exclusões antes de receber comandos. Portal elimina segredo/cancela pendências e mantém intenção até ACK da TV, sem TTL de 7 dias para deletes. sourceId excluído nunca é reutilizado; recriação explícita recebe novo ID.
- **D-008 — Retenções distintas:** create/update expiram em 7 dias, até 5 pendentes/TV; recibos/metadados terminais 30 dias. Tombstones compactos por sourceId vivem enquanto dispositivo estiver cadastrado, sem credenciais. Versões cifradas sem referência são expurgadas; versão corrente permanece. Ledger/claims enquanto device cadastrado, para direitos/conciliação; metadados recovery30dias, desafio/envelope5min/retomada24h. T045 publica política e verifica adequação antes da venda.
- **D-009 — Compra:** Mercado Pago Checkout Pro, Pix/cartão, compra avulsa **BRL 3500**, uma TV/12 meses de calendário; renovação manual. Provider lookup autenticado e claims paymentId/orderId concedem uma vez; redirect não concede. Trial 7 dias UTC, início idempotente.
- **D-010 — Licença local:** JWS ES256, chave pública na TV, issuer/audience/destino/kid/geração/período verificados. Offline vigente permite; rede falha não revoga. Tempo high-watermark/monotonic reduz rollback, mas não atesta tempo durante desligamento adulterado; T003/T035 delimitam antes de cobrar.
- **D-011 — Lifecycle:** agente único no App, 24 h persistido; imediato/10 s só QR/configuração/compra visível. Sair/suspender encerra rápido; reconnect normal só se vencido. Retry normal 1/5/15 min, máximo 3; foco/playback não consultam rede.
- **D-012 — Interface:** DS V14/ADR-011, preferências globais 067 e tipografia 068, `useRemoteNav`, i18n pt/en/es. Compra externa explícita; loading/vazio/erro/bloqueio sempre focáveis. Destruição de lista em uso aguarda confirmação na TV.
- **D-013 — Operação:** API pública recusa tick; serviço jobs privado aceita somente Scheduler OIDC/IAM. Processamento limitado e síncrono à requisição ou CLI `--once`; outbox/leases/checkpoints duráveis, sem loop residente ou BackgroundTasks como fila.
- **D-014 — Restore:** antes de confirmar exclusão/revogação, gravar journal sem segredos em bucket independente do restore Firestore; append idempotente com `ifGenerationMatch=0`, retenção operacional 30 dias, writer sem overwrite/delete. Restore somente de backup <=7 dias, com journal íntegro e chaves recuperadas; revalidar pagamentos, invalidar sessões e aplicar tombstones antes de tráfego.
- **D-015 — Gates:** T001 concluída: constitution1.9.0 formaliza exceções restritas e regra de vencimento na entrada; T003 prova plataforma. Sem cobrança real antes de backup/recuperação, conta comercial, medições, integração real e TV física. Orçamento informa, não desliga. Nenhum serviço/segredo real é criado/lido no planejamento.

- **D-016 — Vencimento na entrada (decisão explícita 2026-10-11):** guarda local na escolha, pós-importação/verificação do provedor e RETURN do seletor. Sessão admitida continua até sair/fechar app; configurações dentro dela não encerram a continuidade. Sem autorização persistida. Revogação confirmada mantém encerramento.

## Constitution Check

Pré e pós-design examinados contra os 13 princípios reais. **Constitution 1.8.0 formalizada em T001.** As ressalvas pré-design registram o conflito anterior; pós-design PASS avalia apenas o desenho, não prova implementação ou aceite de hardware.

| Princípio | Pré-Design | Pós-Design | Evidência/encaminhamento |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | Ressalva anterior | PASS no design | Sem conta pessoal; bloqueio comercial na entrada da lista; sessão admitida continua após vencimento até sair/fechar, abrir/configurar preservados (constitution1.9.0). |
| Segredos Fora dos Clientes e dos Logs | Exceção anterior | PASS no design | Retenção/backup remoto cifrado e convite efêmero formalizados na constitution 1.8.0; allowlist/segredos server-only T008/T015/T038/T042. |
| Categorias da Fonte São Preservadas | PASS | PASS | Parser/importação existentes, T012/T020; sem taxonomia substituta. |
| IA e Classificação Nunca Inventam Dados | PASS | PASS | Sem IA nova; reutilização de classificação/metadados locais. |
| Comandos Locais Independem de Rede, Backend ou IA | Ressalva anterior | PASS no design | Guarda pura local, licença vigente offline; início/compra online explicitados, T029–T035. |
| Trailers e Metadados Não Alteram o Estado Principal da Obra | PASS | PASS | Guarda de entrada da lista sem mutar identidade/histórico por metadado, T031/T035. |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | Exceção anterior | PASS no design | Configuração local preservada; pagamento externo escolhido, T017/T037; fronteira comercial formalizada na constitution1.9.0. |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | PASS | PASS | Só URL/parâmetros remotos; parser/HLS/local T012. |
| Foco Visível e Sem Becos Sem Saída | PASS no design | PASS no design | Loading/empty/error/bloqueio e confirmação, T017/T018/T033/T037; testes ainda pendentes. |
| Voltar Restaura Foco e Posição | PASS no design | PASS no design | Por sourceId estável, T018/T021/T037. |
| Identidade de Reprodução Não Depende da URL | PASS | PASS | sourceId estável; edição preserva estado compatível, T011/T014/T020. |
| Progresso e Capacidades São Reais, Nunca Prometidos | PASS | PASS | applied/importState separados; salvar retomada só quando suportado, T012/T033. |
| Documentação do Repositório É Canônica | PASS | PASS | Plano/tasks rastreiam 33 FR/12 SC; docs vivas e backlog por script T044/T047. |

Restrições adicionais: ADR-008 mantém Direct Play/client-first; ADR-003 mantém FastAPI; ADR-010 não autoriza exportar segredos locais por inferência. ADR-013 emenda arquitetura, sem sobrepor constitution. Manter chrome108/assets listados/hardware-plane, E2E antes de hardware e validação física obrigatória SC-009.

## Project Structure

```text
tv-web/                             # existente
  package.json, vite.config.ts
  src/App.tsx
  src/lib/catalog/                  # dbSchema/sourceRepository/importRunner/importWorker
  src/lib/player/PlayerService.ts
  src/lib/portal/remoteConfiguration.ts                 # stub existente
  src/lib/portal/portal-tv-licenca-anual.contract.test.ts # existente/travado
  src/lib/licensing/playbackAccess.ts                   # stub existente
  src/features/settings/, src/features/profiles/
  e2e/run.mjs
api/                                # existente; fallback isolado
  pyproject.toml, uv.lock, main.py, app/, tests/
CCPlayTv/config.xml                  # existente
tizen_web_project.yaml               # existente
sdd/specs/069-portal-tv-licenca-anual/ # spec, plan, tasks, research, infraestrutura,
                                    # data-model, contracts, logic, quickstart, handoff
portal-web/                         # FUTURO: pacote React/Vite, testes/E2E próprios
api/portal_main.py                   # FUTURO: entrypoint independente
api/app/portal/                     # FUTURO: auth/configurations/operations/payments/
                                    # licensing/crypto/recovery_journal/worker/repos/routes
api/tests/portal/                   # FUTURO: pytest/emulator/integração real
infra/portal/                       # FUTURO: Dockerfile, IAM/Run/Scheduler/índices/backup/journal
```

**Structure Decision:** ampliar a TV pelos repositórios existentes, criar serviço de controle isolado no pacote Python atual e portal separado servido pelo novo entrypoint. Só stubs/contratos existem para 069; caminhos futuros não comprovam implementação. Reler schema livre e alterações externas de 067/068 antes de migrar, sem assumir versão 21 nem reverter trabalho do usuário.

## Complexity Tracking

| Violação/exceção | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Backend controle frente a client-first | TV offline, pagamento e retenção permanente escolhidos | Página estática/LAN não guarda concessão/fila enquanto TV desligada; catálogo continua local. |
| Retenção/backup remoto de credenciais e QR efêmero | Edição/reenvio sem redigitação e QR sem conta | Entrega exclusivamente efêmera conflita com FR-012; T001 limita exceção, sem exportação de dados locais. |
| Bloqueio comercial e checkout externo | Licença paga por TV e Pix/cartão no celular escolhidos | Licença sempre gratuita ou checkout no controle conflitam com pedido; T001 preserva ações locais. |
| Journal externo ao restore | Backup anterior não pode ressuscitar exclusões/revogações | Tombstone no mesmo backup perde eventos recentes; bucket contém só metadados, não lista/M3U/chave. |

## Estratégia de Testes

Unitário → contrato/integração → E2E → hardware/manual. Emulator prova lógica, não IAM/backup/latência; homologação real dedicada prova infraestrutura. Fake e pagamento de teste são evidências distintas; somente TV física prova alvo e caminho QR→pagamento→ativação. Não desinstalar TV do usuário.

Comandos a executar em `tv-web/`:

```powershell
npm.cmd exec -- vitest run src/lib/portal/portal-tv-licenca-anual.contract.test.ts
npm.cmd exec -- vitest run src/lib/catalog/sourceRepository.test.ts src/lib/catalog/importPipeline.test.ts
npm.cmd exec -- tsc -b
npm.cmd run lint
npm.cmd run test
npm.cmd run build
# Em outro terminal: npm.cmd run dev
npm.cmd run test:e2e
# Somente depois dos E2E, para hardware:
npm.cmd run build:tizen
```

Em `api/`, após T004 e emulator ativo: `uv sync --locked`, `uv run ruff check .`, `uv run pytest tests/portal`, `uv run pytest`. Em `portal-web/`, após criação: `npm.cmd ci`, `npm.cmd run lint`, `npm.cmd run test`, `npm.cmd run build`, `npm.cmd run test:e2e`. Scripts novos são entregas de T004, não comandos disponíveis hoje.

### Testes de Contrato

Arquivo preservado: `tv-web/src/lib/portal/portal-tv-licenca-anual.contract.test.ts`; cinco casos de cinco permitidos. Integridade na raiz:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .planning/scripts/powershell/check-contract-tests.ps1 -Slug 069-portal-tv-licenca-anual -Json
```

| Caso/nome identificador | Origem | Fase/task | Vermelho esperado |
| --- | --- | --- | --- |
| C1 `cria lista local e reenvio não duplica nem reimporta` | US1/AC3-4, FR-009-010 | 3/T014 | Error: not implemented: applyRemoteMutation |
| C2 `revisão antiga não sobrescreve edição local` | US1/AC6, FR-010 | 3/T011/T014 | Error: not implemented: applyRemoteMutation |
| C3 `envelope destinado a outra TV` | FR-005 | 3/T014 | Error: not implemented: applyRemoteMutation |
| C4 `segredos ficam fora da projeção remota por allowlist` | FR-013-014, constitution | 3/T015 | Error: not implemented: toPortalSourceView |
| C5 `licença válida funciona offline e vence` | US3/AC7, FR-025-027 | 5/T030 | Error: not implemented: evaluatePlaybackAccess |

Resultados desta revisão são registrados em `evidencias/planejamento.md`. Nenhum contrato/lock/stub alterado ou ligado ao App. Stubs existentes: `remoteConfiguration.ts` (applyRemoteMutation/toPortalSourceView) e `playbackAccess.ts` (decisão pura). Cinco contratos não cobrem toda a spec: T019/T020/T025/T034/T035/T039/T049/T050/T052 incluem testes adicionais de exclusão/recovery/ledger/IAM/backup. E2E não substitui esses testes nem hardware.

## Sequenciamento e prontidão

Setup/gates → fundação → US1 P1 → US2 P2 e US3 P2 → aceite transversal. T001 concluída documentalmente; execução começa pelos itens abertos da fase 1, incluindo prova T003. US3 testável com fontes locais e fake; US2 com registros fictícios, sem compra real. Tasks preservam 52 IDs + 9 gates, T001 concluída e demais abertas. Consulte `tasks.md` para dependências finas, cobertura integral e critérios de fase.

Detalhes vinculantes: data-model.md, contracts/portal-api.md, logic/operacoes-e-licenca.md, infraestrutura.md e quickstart.md. Seções finais atualizadas por pedido explícito de resolver pendências; registros históricos permanecem no Execution Notes.

## Estado Atual

| Área | Estado |
| --- | --- |
| Execução | Em Execução, modo contínuo; fases 1–2, US1 e US2 concluídas localmente; US3 concluída com webhook oficial e E2E comercial validados; T055 corrigida; infraestrutura staging e ACK sintético concluídos; backup diário provisionado; portal E2E 13/13; T036 e T045 concluídas; 56/64 itens concluídos conforme script de status. **Revisão 2026-10-13:** painel em 59/67 antes da Fase 7; a 070 convergida mudou ID/chave/entrada (ver **Invariantes herdadas da 070**) e T059–T063 foram anexadas. |
| Entregas | Configurações permanentes cifradas, exclusão sincronizada e recuperação pelo site; núcleo comercial, assinatura ES256, cache offline, guarda de entrada da lista e área de licença revalidadas pela nova decisão. Oferta R$35/12 meses/uma TV; venda desligada. |
| Revisão local | T038/T040/T042 concluídas; T037/T044 revalidadas: UX, fronteiras HTTP/segredos, manifesto e documentação. API90/90 anterior + marcador HTTP1/1; portal13/13 E2E PASS com servidor explícito. Nova fronteira de vencimento:26/26 testes direcionados e E2E licença1/1 PASS78.2s; sem interrupção da sessão atual. Type/lint/build TV PASS. |
| Gates automatizados | Suíte TV **49/49 E2E PASS em 350s** com `teste-conexao-tv` aprovado. A005 não reproduziu em três repetições isoladas nem na suíte completa. Revisão atual: **3301/3301 testes e 1398/1398 suítes PASS** (563 arquivos, threads4/JSON); direcionados e contratos PASS. Portal E2E13/13, lint/build/unit PASS; build:tizen e sincronização PASS. |
| Plataforma/operação | TV atual preservada; projeto Google Cloud ccplaytv-511322 ativo; Cloud Run público/jobs, IAM/OIDC e Firestore staging validados. Oferta/termos/retenções e budget R$10/mês confirmados; snapshot READY, restore/replay, medições/custos restantes e fluxo comercial físico permanecem pendentes. |
| Contratos | C1–C5 PASS e trava069 íntegra. Emenda mínima067 autorizada; trava067 íntegra. Nenhuma autorização para outros contratos. Travas 070 (5/5) e 037 emendada também são gate desta feature (I-1…I-10). |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Exceções normativas do portal/licença | Resolvido no design | Constitution 1.8.0/T001; implementação continua sujeita à verificação. |
| R-002 | DUID não autentica/recupera | Alto | T003 prova; T007 código privado + desafio da mesma TV, sem reinstalar a TV do usuário. |
| R-003 | Relógio offline sem atestação | Alto | T003/T035 caracterizam e reabrem FR-027 se garantia inviável. |
| R-004 | Oferta/comercial/custos incompletos | Alto | Infra definida Google Cloud; T045 confirmou preço R$35, sandbox/conta, termos/retenções, autoatendimento e budget R$10; custos de carga/restore ainda dependem de T043/T039/T052. |
| R-005 | SourceView contém URLs | Alto | Allowlist, C4/T020/T042, sem revelar campos secretos. **Atualização (070):** a allowlist e C4 continuam para `SourceView`; os valores salvos saem só pela rota `values` (070 D-006). |
| R-006 | M3U arquivo não existe como fonte durável | Alto | Resolvido por escopo: sem arquivo remoto; usar M3U URL/import local existente. |
| R-007 | Mudanças externas da 068/schema | Médio | Reler, não reverter nem assumir versão livre. |
| R-008 | Fragmento QR versus FR-014 | Resolvido no design | Constitution 1.8.0 permite convite efêmero restrito, nunca chave permanente/código em URL; T038/T042 verificam implementação. |
| R-009 | Revogação offline tardia | Médio | Consulta a cada 24 h quando online; funcionamento offline até o vencimento aceito. |
| R-010 | Coldstart/cotas | Alto | T043/T052 incluem amostras frias, não relaxar metas 30 s/60 s, venda condicionada. |
| R-011 | Segredos privados em ambiente sem cofre | Alto | IAM/configurações/revisões privilegiadas, rotação/cópia separada; T008/T039/T052. |
| R-012 | Firestore: concorrência/restore/exclusões | Alto | Claims/transações/retries sem efeitos, T005/T026; T039/T052 reconciliam exclusões/pagamentos. |
| R-013 | R$35 não é teto | Médio | Alertas/previsão, manter serviço, medir consumo total T043/T045. |
| R-014 | Primeiro MSE frio no Chromium headless trava em kStarting | Médio | T053 autorizado: roteiro prioriza Chrome instalado (7,655 s e todos os cenários aprovados) e exige relógio avançar; Chromium permanece alternativa e falha não vira skip. Resolvido no roteiro: suíte completa 47/47 PASS; adaptador intacto. Limitação do Chromium headless frio permanece registrada. |

| R-016 | T017 nova aba global conflita com contrato067 de cinco abas | Bloqueia integração TV | Usuário autorizou explicitamente emenda mínima em 2026-10-11: acrescentar Portal & licença ao final da expectativa067 e regravar somente a trava067; posições e demais asserts preservados. |
| R-015 | Gate de arquitetura preexistente: userStateRepository 366 > 362 linhas | Baixo | Usuário autorizou extração mínima em 2026-10-11 (T054). isInHistory movida para módulo puro com import/reexport; alteração anterior de favoritos preservada. Resolvido: lint/build, 47 testes e 3 E2E afetados aprovados; baseline intacto. |

| R-017 | Usuário mudou fronteira de vencimento após execução local | Médio | Emenda explícita: bloquear apenas próxima entrada; T031/T033/T035/T037/T044 reabertas e revalidadas, constitution1.9.0/spec/logic alinhadas. C5 continua decisão pura de validade, sem alterar trava. Sessão sem limite de duração adicional até saída é consequência aceita. |
| R-019 | Sessão do portal recusava leituras concorrentes (401 espúrio): `now < last_seen_at` fora de ordem | Médio (UX e falso "acesso expirado"; afetaria staging/produção) | Resolvido (T056): tolerância de 30 s + `last_seen_at` monotônico; relógio muito atrás segue recusado; teste vermelho→verde. Achado pela pilha local integrada (`evidencias/pilha-local.md`), que o E2E com servidor falso não podia expor. Publicado no staging em 2026-10-13 (`evidencias/infra.md`). |
| R-018 | Piso de amostras de T043 (≥100) reduzido para 20 por decisão do usuário em 2026-10-13 | Baixo | Registrado em `evidencias/medicoes.md`: com 20 amostras o p95 é o 19º valor, ordem de grandeza e não estatística robusta; nenhuma amostra descartada. Meta de 30 s/60 s e demais itens de T043 (ativações, 10–50 TVs, custo) não são relaxados. |
| R-020 | O trabalho restante da 069 (T039/T043/T046/T052, backup/restore, scripts de manutenção, roteiros) desfazer ou contradizer o que a 070 entregou (ID MAC imutável, chave de 10 dígitos, `values`, tela Adicionar, `network.public`, RETURN em cadeia) | Alto (regressão normativa e de produto) | Seção **Invariantes herdadas da 070** abaixo; T059–T063 em `tasks.md` (Fase 7); gate de não-regressão da 070 obrigatório antes de fechar T047. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-11 | Revisão arquitetural | Entrevista/aceite Cloud Run/Firestore, sem cofres, gestão permanente M3U URL/Xtream; documentos/tasks alinhados, contratos preservados. | T001 compatibiliza constitution; implementar apenas via execute. |
| 2026-10-11 | Resolução de pendências | Constitution 1.8.0/T001 concluída; recuperação pelo site com código guardável substitui atendimento manual; preço/retenções alinhados. | T003/plataforma, implementação/integração/TV e diagnóstico do encerramento Vitest. |
| 2026-10-11 | Execute/fase 1 contínua | T002 concluída; bootstrap FastAPI isolado com 5 testes verdes e Ruff; dependências Python travadas, portal/sonda/infra em validação. | Concluir T003/T004/T051/T048 e provas da fase 1; não avançar fundação sem gate de plataforma. |
| 2026-10-11 | Execute/fase 1 contínua | T002/T051 concluídas: operação e templates Docker/Run/IAM/Scheduler/Firestore/backup/journal; 12 JSON validados e coletor node --check aprovado, sem provisionar. Bootstrap API 7/7 e Ruff; portal em checks, T003 físico pendente. | Concluir T003/T004/T051/T048 e provas da fase 1; não avançar fundação sem gate de plataforma. |
| 2026-10-11 | Execute/fase 1 contínua | Fase 1: operação/infra preparadas; API 7/7 e Ruff, sonda Node 2/2; E2E player-dev-mpegts falhou no primeiro play (15050 ms/limite15000), demais cenários do script passaram. Investigação/registro aguardam decisão. | Aguardar decisão sobre falha E2E fora dos fluxos 069; repetir player-dev-mpegts isolado após suíte, não instalar na TV nem avançar fundação com gate pendente. |
| 2026-10-11 | Desvio autorizado T053 | Player falhou na suíte (45/46) e isolado; usuário autorizou correção. Projeto Google Cloud ainda será criado; somente TV atual, preservar dados. | Diagnóstico do primeiro play antes de T003; sem reinstalação. |
| 2026-10-11 | T004 concluída | Bootstrap isolado/API 7/7; portal build/lint aprovados, unit 1/1 com A005 aberto e E2E 1/1. Runner usa servidor explícito para evitar timeout do plugin webServer. | Prova física T003, condicionada ao gate R-015; nenhuma venda habilitada. |
| 2026-10-11 | T053 concluída | Suíte TV 47/47 PASS (1062 s, jobs 3), player 138,3 s e sonda browser 43,8 s. Chrome priorizado, orçamento original preservado e avanço de relógio exigido; adaptador intacto. Build TV PASS; lint falhou em R-015. Travas 047/069 íntegras. | Decisão sobre R-015 antes de retomar gate e prova física T003. |
| 2026-10-11 | Bloqueio externo de arquitetura | Lint encontrou max-lines em userStateRepository (366/362); arquivo já tinha alterações externas. Usuário perguntado conforme passo 6, nenhum baseline afrouxado. | Decisão sobre esse desvio; suíte completa e build continuam como checks já iniciados. |
| 2026-10-11 | Fase 2 T023 | Journal/fence/expurgo e delete sem expiry concluídos; API 26/26/Ruff PASS. Retry transacional completo com jitter/prazo corrige contenção reproduzida. | T006/T007/T009 e testes; GCS/IAM/restore reais posteriores. |
| 2026-10-11 | Fase 2 T007 parcial | Código128bits/checksum/HMAC e persistência local emissão+ACK implementados; API 39/39 e TV 5/5 PASS. | Completar protocolo servidor/rotas de recuperação e cadastro; tsc/lint/build em validação. |
| 2026-10-11 | Fase 2 T006 parcial | Núcleo auth/rotas QR/manual/sessão, Origin/CSRF/epochs e limites compartilhados implementados; API 35/35 PASS. | Completar cadastro/revoke/rotação com T007, retenção/executor T009; T006/T049 abertas. |
| 2026-10-11 | Fase 2 T006 concluída | Cadastro/auth/revoke, resultado/ACK e rotação write-ahead integrados; API50/50/Ruff, regressõesrestore8/8, TV6/6/tsc/lint/build PASS. | T007 recuperação web por código/desafio, T009 agente/retenção e T049/T050. |

| 2026-10-11 | Fase 2 T007 concluída | Desafio TV/nonce durável, sessão web isolada, confirmação/journal/CAS/entrega só à TV e retomada mesma operação até24h; API59/59/Ruff, TVidentity7/7. | T009 agente/retenção e T049/T050; UI e homologação posteriores. |

| 2026-10-11 | Fase 2 concluída | API63/63/Ruff, agente/transport/hook9/9, identity7/7 e build PASS. Worker retention-global por páginas20/cursor/lease; expiry preserva corrente/delete; journal tardio não recria envelope. | US1 T011–T021; agente ainda não montado no App, integração real posterior; A005 em T041. |

| 2026-10-11 | US1 T011 concluída | Fonte/revisão e delete/tombstone/outbox atômicos; EPG local participa da revisão. 39/39/type/lint PASS; módulos extraídos preservam teto/baseline. | T012/T014/T015 em checks, T013 API/estado e UI/E2E seguintes. |

| 2026-10-11 | US1 núcleo local concluído | T012/T014/T015: 110 testes selecionados + Worker1/1, build/type/lint PASS, C1–C4 verdes, trava íntegra. | T013 API em implementação; UI/E2E e C5 pendentes. |

| 2026-10-11 | US1 API T013/T019 concluídas | Configuração permanente/versões/fila/claims/CAS/counter5/ACK/cancel/expiry/snapshot/pull com fence pós-decrypt. API71/71 (66,23s), Ruff e diff-check PASS; trava íntegra. | T016–T018 UI/integração, T020/T021 regressões/E2E. |

| 2026-10-11 | US1/T017 | Sexta aba autorizada, QR local/expiração, chave/código protegidos, revoke/rotação e atalho por SELECT/RETURN; 48 + 47 + 20 testes locais PASS e tsc PASS. | T016 E2E em repetição após correção de foco; T018/T021 pendentes. |
| 2026-10-11 | US1 UI/integração | Portal T016 E2E5/5; T018 agente/confirmação/ports12+19 testes e T021 E2E App/0672/2. Layout QR/ações em duas colunas validado visualmente com fixture; baseline preservado. | Regressões finais US1 em andamento; US2 seguinte. |

| 2026-10-11 | US1 concluída localmente | UI193/193, C1–C4 4/4/trava íntegra, E2E portal5/5 e App/0672/2; build/type/lint aprovados. | A005 encerramento reapareceu na rodada C1–C4, permanece em T041. US2 seguinte; sem venda. |

| 2026-10-11 | US2/T024 concluída | Recuperação web2/2 e E2E TV1/1 (113,4s); commit/ACK perdido/reload preservam lista e retomam confirmação. API store/recovery14/14/Ruff PASS. | T025 rodada completa API/portal e exclusão pendente sem snapshot; sem reinstalação física. |
| 2026-10-11 | US2/T022 concluída | Corrente cifrada reenviada explicitamente com snapshot fresco/CAS/novo ID; 12/12 API e Ruff PASS. T024 recuperação web/TV em validação, ACK perdido agora retoma confirmação persistida. | T025 HTTP/E2E, C1–C4 e trava; nenhuma homologação real. |

| 2026-10-11 | US2 concluída localmente | API76/76/Ruff; portal build/lint/unit4/4, E2E10/10 (2,2min); TV recovery integrado1/1 e adicionais10/10. Corrente/reenvio/tombstones/recovery/ACK perdido preservados. | US3; A005 em T041, homologação/backup/TV comercial posteriores. |

| 2026-10-11 | US3/T030 concluída | Decisão pura local offline/vencimento; C5 vermelho no stub antes de implementar, C1–C5 + adicionais7/7 PASS (15,54s). T026 transações comerciais10/10/Ruff aprovadas. | T026–T029/T031–T036; sem integração player ou cobrança. |

| 2026-10-11 | US3/T026 concluída | Reserva concorrente reutiliza pedido, preço/destino imutáveis, claim pagamento+grant+geração CAS; calendário29fev/fora de ordem. API10/10 (9,49s), Ruff PASS. | T027 provider/lookup/reconcile; T028 refund/journal/entitlement; T029 em implementação. |

Checkpoint 2026-10-11: T054 concluída após autorização; isInHistory em módulo puro, API/favoritos preservados. Lint/build PASS, testes afetados 47/47 e E2E histórico/limpeza/sonda 3/3 (93 s).




| 2026-10-12 | T041/desvio T055 | Suíte completa repetida após preload imediato da rota SourceAccessRoute: 563/563 arquivos e 3301/3301 testes PASS; lint/build e C1–C5 PASS. | A005 encerramento permanece sem bloqueio reproduzido; T039 snapshot, T043/T045/T052 e gates TV/comerciais continuam. |
| 2026-10-11 | US3/Polish local | T026–T035 integradas; T037/T038/T040/T042/T044 concluídas. Player expira só quando há reprodução; monitor parado nega acesso. Portal13/13 E2E; TV48/49, conexão adiada pelo usuário. | T039/T041/T052 locais e provas reais T036/T043/T045/T046; venda desligada. |

| 2026-10-11 | Emenda aprovada de vencimento | Guarda na entrada da lista, inclusive RETURN/verificação do provedor; sessão admitida continua até sair/fechar app. Constitution1.9.0 e documentos alinhados. 3301/3301 unit,26/26 direcionados, E2E licença1/1 e relacionados3/3, type/lint/build e locks PASS. Nenhum teste congelado alterado. | T039/T041/T052 e gates reais continuam abertos;50/63; TV preservada. |

| 2026-10-12 | US3/T036 concluída | Portal E2E 13/13, TV licença 1/1, contrato C1–C5 5/5 e webhook oficial Mercado Pago HTTP 200; compras sandbox existentes reutilizadas sem nova cobrança. | T039/T041/T043/T045/T046/T052 e gates de release. |

| 2026-10-12 | T041 concluída | A005 não reproduziu em três repetições isoladas; unit 3301/3301, TV E2E 49/49 em 350s, portal E2E13/13, lint/build/build:tizen e contratos PASS. | T039/T043/T046/T052. |
| 2026-10-12 | T045 concluída | Oferta fixada em R$35/12 meses/uma TV; testes API comerciais 11 PASS/12 skips condicionados; Cloud Run público/jobs Ready em staging com Mercado Pago sandbox, live mode falso e checkout desligado; retenções/autoatendimento documentados; budget Cloud Billing R$10/mês com alertas 50/90/100/150 confirmado. | T039 snapshot/restore/RPO/RTO; T043 carga/ativações/custo; T046 TV física; T052 homologação real. |
| 2026-10-12 | T052/T046 continuidade | T052 revalidada sem mutação: smoke público 200/200/401, jobs privado 403, Scheduler OIDC ENABLED, IAM restrito e índice READY; API 49 passed/60 skipped. T046 parou no preflight porque a TV recusou o `sdb` apesar da porta aberta; o `Host PC IP` precisa ser atualizado na TV e ela reiniciada. Nenhum build/instalação/dado foi alterado. | T039 snapshot/restore/RPO/RTO; T043 carga/ativações/custo; T046 validação física após ajuste do Host PC IP. |

| 2026-10-13 | T043 parcial | Alterações medidas no staging: 20/20 `source.update` com ACK da TV simulada, p50 6,6 s/p95 9,4 s/máx 10,0 s, 100% ≤30 s (SC-003). Causa do bloqueio anterior corrigida: pull da TV é 1/10 s por dispositivo e o script fazia polling a 100 ms; script agora respeita o limite. Piso reduzido a 20 por decisão do usuário (R-018). Snapshot de backup READY desde 2026-10-13T03:31Z. | T043 ativações (SC-006)/10–50 TVs/custo; T052 restante e T039 dependem do restore; T046 depende do Host PC IP da TV. |

| 2026-10-13 | Pilha local integrada/T056 | PC (`npm run dev`): emulador Firestore + API real (`infra/portal/dev/local_portal.py`) + portal-web + TV `--mode commercial`. Cenário criação/edição/remoção nos dois sentidos PASS. Defeito real achado e corrigido (401 em leituras concorrentes da sessão, R-019); API 111/111, Ruff PASS. Ativação de teste medida no staging: 15/15 `trial`, total p95 1,05 s (não é paga). Pacote **pessoal** reinstalado na TV; comercial ainda não. | T046 (TV física comercial) após decisão sobre a exclusão local imediata; T043 ativações pagas/carga/custo; T039/T052 restante. |

| 2026-10-13 | T057 + pacote comercial na TV | Exclusão local agora envia a outbox na hora (`flushDeletions` + `publishSnapshot`, sem pull/licença/polling); 5 testes novos, 91/91 relacionados, tsc/lint PASS; cenário integrado 5/5. `build:tizen:commercial` (origem e JWKS públicos do staging) instalado e lançado na TV 192.168.0.2 sem desinstalar. | Validação visual do usuário (roteiro em `evidencias/tv.md`); fix T056 publicado no staging (revisão `ccplaytv-portal-00013-ph4`, 60/60 leituras concorrentes OK); T043/T052/T039. |

PRÓXIMO (revisado em 2026-10-13, após a 070): executar T060 (escopo de backup/restore com `displayIdClaims` e `display_id` imutável), T061 (homologação real das rotas da 070) e T062 (roteiro de TV reconciliado com `070/evidencias/tv.md`); depois T043 (ativações pagas, carga, custo) e T046 (observação do usuário na TV). T063 (gate de não-regressão da 070 e limpeza de registros `generated` do staging, com confirmação) e T047 fecham por último. O roteiro antigo de `evidencias/tv.md` (passos 1–7) foi cumprido em parte em 2026-10-13; o que falta está listado lá. Venda permanece desligada.

## Invariantes herdadas da 070

Acrescentada em 2026-10-13, depois da convergência da `070-entrada-listas-gerenciador`. A 070 mudou comportamentos que partes desta spec ainda descrevem com o texto anterior. **Qualquer task, correção, script, migração ou roteiro da 069 deve preservar o abaixo**; em caso de conflito com texto antigo desta spec, vale a 070 (constitution 1.10.0, ADR-014, ADR-015).

| # | Invariante | Onde está garantida | Como a 069 pode violá-la |
| --- | --- | --- | --- |
| I-1 | ID exibido no formato MAC (`XX:XX:XX:XX:XX:XX`), **imutável** depois de atribuído; sem MAC útil é derivado da identidade, nunca sorteado | `api/app/portal/{display_id,enrollment,access_rotation}.py`, repositório (`immutable_display_id`), `test_pairing.py` | Restore/replay/manutenção/reconcile que regrave, apague ou recrie `display_id`/`displayIdClaims`; seed ou fixture que sorteie ID |
| I-2 | Chave do dispositivo numérica de 10 dígitos, só HMAC no servidor, permanente até `revoke` | `enrollment.py`, `access_rotation.py`, `logic/pareamento.md` (070) | Voltar ao token longo; testes/fixtures/homologação com chave de 43 caracteres; tratar a rotação D-004 da 070 (registro antigo) como bug |
| I-3 | Entrada manual por ID exibido + chave, recusa uniforme `401`, limites por HMAC(ID), por IP e global | `auth.py`, `routes/auth.py`, `test_pairing.py` | Afrouxar ou trocar limites em medições/carga (T043) ou homologação (T052); mensagem que revele se o ID existe |
| I-4 | Valores salvos saem **somente** por `GET /portal/v1/configurations/{sourceId}/values`, sessão `manage` da mesma TV, allowlist, `no-store`, nunca em log | `configuration_delivery.py`, `routes/operations.py`, `test_configuration_values.py` | "Corrigir" a rota por causa de SC-004/R-005 antigos; cache/CDN/proxy na frente; log de corpo em diagnóstico |
| I-5 | Chave sempre visível **só** na tela Adicionar da TV; em outros lugares só por ação explícita (diálogo de Configurações) | `PortalPairingPanel.tsx`, `PortalPrivateDialog.tsx` | Replicar a chave em cards, perfis, avisos, telas de licença ou diagnóstico |
| I-6 | Entrada única "Adicionar lista"; sem canto "Adicionar pelo site" nos perfis; Configurações → "Portal & licença" permanece | `ProfilesScreen.tsx`, `AddSourceScreen.tsx`, `App.tsx`, `e2e/lib/portal.mjs` | Roteiros e E2E da 069 que clicam no canto removido |
| I-7 | RETURN volta em cadeia até a tela de listas (`leave-list`); `ExitModal` só nos perfis | `appNav.ts`, `HomeScreen.tsx` | Telas da licença/bloqueio que abram saída própria ou fechem o app direto |
| I-8 | `CCPlayTv/config.xml` declara `network.public` (leitura do MAC) | `config.xml`, sonda `platformProbe.ts` | Regenerar/limpar `config.xml` ou o manifesto do pacote comercial sem o privilégio |
| I-9 | Formulário de lista com dados visíveis por padrão e olho único; edição mostra valores salvos | `SourceFormFields.tsx`, contrato C2 da 070 | Reintroduzir máscara por padrão ou "em branco preserva" como única opção |
| I-10 | QR carrega só convite efêmero/uso único, nunca ID, chave nem credencial | `PortalPairingPanel.tsx`, contrato C1 da 070 | Colocar chave ou ID no fragmento por conveniência de teste |

**Guarda mecânica**: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 070-entrada-listas-gerenciador` deve passar (5/5) e `npx vitest run` dos quatro arquivos `*.entrada-listas-gerenciador.contract.test.*` deve ficar verde em todo gate desta feature (T063). Um contrato da 070 só muda por emenda aprovada pelo usuário na própria 070.

**Gate de venda herdado da ADR-015**: registros `generated` do staging (a TV de referência tem ID `2A:…`) só saem por operação documentada **antes** da abertura comercial; isso é ação externa e exige confirmação do usuário (T063).

## Arquivos Principais

- tv-web/src/lib/licensing/{licenseRuntime,licenseMonitor,licenseRepository,verifyEntitlement}.ts
- tv-web/src/features/portal/LicenseGate.tsx; components/player/licensing.test.tsx
- api/app/portal/{licensing,payments,restore_journal}.py e tests/portal/
- infra/portal/backup/; docs/portal/operacao.md
- evidencias/{validacao,segredos,execute-fase5}.md

## Cuidados para Retomada

Não usar SQL/S3/Alembic/storage M3U do plano anterior; sem TMDB/OpenAI remoto. Não apagar credenciais depois do ACK; não expor campos ao portal. Cifragem no backend acessa claro transitório, não é E2E opaco. Segredos reais nunca em CLI/logs. Não editar contratos/lock. Faturamento aceito, R$10 com alerta, sem corte automático; restauração operacional manual e recuperação de licença pelo site exigem prova; não confundir os dois fluxos.


T023: callbacks continuam puros; ABORTED em leitura também exige retry da unidade inteira. Não serializar testes concorrentes nem aceitar falha isolada como baseline. Journal mock só teste; confirmação requer append durável antes de expurgo/ACK.

T006: não atualizar recoveryEpoch mantendo hashes antigos e sem fence; repositório recusa para evitar reativação pós-restore. T007 deve isolar sessão de recuperação de sessão normal; convite purpose=recover já é recusado pela troca normal. Nova rodada de emissão mantém mesma operação e prazo24h ancorado, eleva epochs/versão e ACK local deve comparar authEpoch além de operationId.

### Checkpoint comercial local — 2026-10-11

T027/T028/T029 implementadas e verificadas localmente: pagamentos/worker 11/11 PASS, assinatura/cache/relógio/monitor 7/7 PASS e tsc PASS. Provedor real permanece não homologado. T031/T032/T033 em integração, ainda sem aceite: guarda central, build comercial com chaves públicas embutidas, área web de licença e bloqueio focável da TV. Não instalar na TV antes dos gates e E2E.

Checkpoint T031/T033/T035: guarda central por build comercial, trailer protegido antes do iframe, checkpoint final de retomada por saída license e diálogo comprar/RETURN. 29/29 testes direcionados PASS em 18.93s; tsc e arquitetura PASS, baseline intacta (430 arquivos, 146 imports, 37 tetos). T032/T036 concluídas com E2E final; A005 reproduzido também em configuração mínima sem plugins, setup ou watcher: 6 FILEHANDLE e timeout. Não encerrado.

Checkpoint T032/T036: E2E comercial browser/fake 1/1 PASS74.1s, UI web compra/retry/pendente/retorno 3/3 PASS, portal 13/13 e TV licença 1/1 PASS25.9s; compras sandbox existentes aprovadas e webhook oficial HTTP 200. T036 concluída com limitação documentada de não repetir compra. Próximas verificações locais: gates completos, segurança/assets e preparação de backup/restore; sem implantação ou venda.

T039 parcial: `restore_journal.py` valida objeto canônico/digest/destino antes de qualquer replay; dez testes PASS0.14s e Ruff PASS. SHA256 não autentica autor; origem/IAM/imutabilidade, replay idempotente/floors/expurgo e conciliação continuam gates abertos.

Atualização vigente de vencimento: os checkpoints anteriores com guarda por playback/encerramento automático são históricos e foram substituídos pela decisão D-016. Nada muda na checagem diária ou no funcionamento client-first.
### Atualização de continuidade — 2026-10-12

Foi criado `infra/portal/measure-staging.ps1` para medir 100 alterações sintéticas com ACK da TV e p50/p95. A execução não iniciou amostras porque o limitador de enrollment por IP (20/h) já estava consumido pelos smokes; T043 segue pendente. O schedule diário de backup (7 dias) está ativo, mas ainda não há snapshot READY para T039. Suíte local do portal: 42 passed, 59 skipped.

T052 avançou apenas na evidência independente: tick OIDC real HTTP 200 e suíte local do portal 42 passed/59 skipped. T045 permanece preparado em `budget.json`, sem criação administrativa do budget porque a conta atual não tem acesso à Billing Budgets API.

Revalidação local anterior à prova oficial: pagamentos/licenciamento/worker/restore 11 passed/10 skipped; licensing e contratos 17/17 PASS; lock íntegro. T036 foi concluída no checkpoint seguinte; permanecem T039/T041/T043/T045/T046/T052.

### Atualização de compra sandbox — 2026-10-12

A compra de teste com comprador separado foi aprovada em duas modalidades e conciliada pelo Scheduler OIDC; os grants anuais foram persistidos no Firestore. O retry do worker foi corrigido para ignorar checkpoints textuais de erro como cursor de paginação do provider. O webhook segue pendente por retorno 401 de assinatura, então T036 permanece parcial. Checkout de staging desligado após a evidência; T039/T041/T043/T045/T046/T052 continuam os gates de release.

### Continuidade sem snapshot — 2026-10-12

Suítes locais revalidadas: TV 563/563 arquivos e 3301/3301 testes, portal 5/5, API 49/49 com 60 skips externos, lint/build PASS. T052 ganhou testes estáticos de deployment/restore (6/6), sem executar restore. T043 segue bloqueada por rate limit de enrollment; T045 por permissão da Billing Budgets API; A005 e E2E global mantêm T041 aberta. Snapshot/inspect/restore permanecem explicitamente como último passo T039.

### Atualização T036 — assinatura do webhook — 2026-10-12

A rota staging aceitou uma notificação sintética assinada com o segredo atualmente carregado no Cloud Run (`HTTP 200`, `state=received`), confirmando o manifesto HMAC e a configuração do serviço sem expor credenciais. As notificações oficiais observadas do Mercado Pago continuam retornando `401`, e o painel Webhooks apresentou erro 5xx durante a inspeção; portanto T036 permanece parcial até confirmar a mesma aplicação/segredo no provedor e obter uma entrega oficial. Checkout continua desligado.

### Atualização T036 — webhook oficial aceito — 2026-10-12

O painel sandbox do Mercado Pago enviou `payment.updated` para a rota staging e recebeu `200 - OK`. A leitura independente dos logs do Cloud Run confirmou duas requisições `POST` ao webhook com status 200. A assinatura oficial está validada; T036 continua parcial pelos cenários E2E de ativação completa, página fechada/offline, renovação, estorno e preço. Checkout continua desligado.

### Decisão T036 — reutilizar compras sandbox existentes — 2026-10-12

Não será repetida uma compra sandbox. As duas compras já aprovadas comprovam Checkout Pro e concessão anual via reconciliação; o webhook oficial foi aceito separadamente com `200 - OK`. A ausência de uma prova causal de nova concessão exclusivamente pelo webhook fica registrada como limitação aceita, sem habilitar venda.

**Cuidados herdados da 070 (2026-10-13):** a frase "não expor campos ao portal" acima vale para leituras comuns; a rota `values` da 070 é a única exceção. Não restaurar, regravar nem apagar `display_id`/`displayIdClaims` (ADR-015). Não voltar à chave longa. Antes de qualquer gate, rodar as travas e contratos da 070 (tabela **Invariantes herdadas da 070**).