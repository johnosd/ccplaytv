# Handoff — 069

**Contexto**

ccplayTv, branch `feature/designWave2`; React/TypeScript + Python/FastAPI, Cloud Run/Firestore. Backlog **Planejada, 1/61**. Próximo comando: `/sdd-execute 069-portal-tv-licenca-anual`, pelos itens abertos da fase 1; T001 concluída documentalmente. Reler mudanças preexistentes em RouteBoundary, SeriesDetailScreen, seriesLoader, CCPlayTv e integração 067/068; não revertê-las. Nenhum deploy ou implementação nesta revisão.

**O que a feature entrega**

- P1/US1: QR/manual sem conta pessoal, Xtream/M3U somente URL; remover na TV também remove no portal, inclusive com outbox offline.
- P2/US2: configurações cifradas permanentes após ACK, edição/reenvio sem revelar segredo; recuperação pelo site na mesma TV, com código privado guardável/fotografável.
- P2/US3: sete dias de teste, R$35/12 meses/uma TV, Pix/cartão avulso, renovação manual; offline vigente até vencer, consulta diária.

**Leitura obrigatória, em ordem**

`spec.md` (33 FR/12 SC) → `plan.md` (invariantes/gates) → `tasks.md` (52 IDs/9 gates) → `logic/operacoes-e-licenca.md` (algoritmos) → `data-model.md` (entidades/retenções) → `contracts/portal-api.md` (HTTP) → `quickstart.md` (validação) → `.planning/memory/constitution.md` (normas). Complementar com ADR-013/infraestrutura/research.

**Testes de contrato**

`tv-web/src/lib/portal/portal-tv-licenca-anual.contract.test.ts`: 5/5 preservados/travados. C1 replay, C2 conflito, C3 destino, C4 allowlist na fase 3; C5 licença offline/expiração na fase 5. Em tv-web: `npm.cmd exec -- vitest run src/lib/portal/portal-tv-licenca-anual.contract.test.ts`. Na raiz: `powershell -NoProfile -ExecutionPolicy Bypass -File .planning/scripts/powershell/check-contract-tests.ps1 -Slug 069-portal-tv-licenca-anual -Json`. Conferir também locks 032/034/037/054/067. Nesta revisão: cinco vermelhos por not implemented; 62 testes existentes passaram, hashes íntegros.

**Stubs criados**

Nenhum novo: existentes `tv-web/src/lib/portal/remoteConfiguration.ts` (applyRemoteMutation/toPortalSourceView) e `tv-web/src/lib/licensing/playbackAccess.ts` (evaluatePlaybackAccess). Implementar T014/T015/T030 sem editar contratos.

**Armadilhas já mapeadas**

T010/T023 foram antecipadas à fundação; journal write-ahead bloqueia revoke/recovery/delete reais. Só create/update expiram em sete dias; delete até ACK e tombstone sem segredo persistem. Cloud Storage guarda journal mínimo, nunca M3U/credenciais. Restore exige nova base e replay externo antes de tráfego ([documentação Firestore](https://cloud.google.com/firestore/docs/backups)). Sem KMS/Secret Manager; chaves privadas em ambiente/cópia separada. SourceView contém URLs: usar allowlist. Registro de abas real em settings/tabs/settingsTabs.ts e settingsTab.ts. Build chrome108/file://, schema livre a reler, E2E antes da TV e nunca desinstalar aparelho do usuário. R$35 anual é preço; R$10/mês é referência com aviso, sem corte automático.

**Pendências do Analyze**

- A001 resolvida no design: constitution 1.8.0/T001 formalizada, com exceções restritas; implementação ainda exige verificação.
- A002 HIGH: identidade/ES256/tempo/reinstalação no alvo não comprovados; executar T003/T035 e delimitar garantia antes da cobrança.
- A003 resolvida no planejamento: autoatendimento pelo site substitui canal/SLA manual; retenção em data-model e revisão/publicação dos termos em T045 antes da venda.
- A004 resolvida: seções finais do plano corrigidas para preço anual R$35, normas formalizadas e recuperação pelo site; história preservada.
- A005 LOW: Vitest reportou timeout de encerramento após os vermelhos esperados; reproduzido também com --project node, tratar em T041 antes do aceite, sem inflar timeouts/editar contratos.

**Gate de pronto**

Contratos verdes/locks íntegros; TV tsc/lint/test/build/E2E com dev ativo, API Ruff/pytest, portal lint/test/build/E2E; quickstart, pagamento de teste, IAM/journal/backup/restore/recovery reais e medições. **TV física obrigatória antes de cobrar**, dados preservados. T044/T047 atualizam README/status/docs/backlog com evidência. T001 concluída documentalmente; executar itens abertos da fase 1, sem tratar planejamento como entrega. Ver evidencias/resolucao-pendencias.md.
