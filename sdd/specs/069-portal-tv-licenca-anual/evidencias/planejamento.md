# Evidência do replanejamento — 2026-10-11

Escopo: documentação/planejamento, sem implementação ou provisionamento. Contratos/stubs existentes preservados.

- Pré-requisito `check-prerequisites.ps1 -Stage plan -Slug 069-portal-tv-licenca-anual -Json`: passou.
- Em tv-web, `npm.cmd exec -- vitest run src/lib/portal/portal-tv-licenca-anual.contract.test.ts src/lib/catalog/sourceRepository.test.ts src/lib/catalog/importPipeline.test.ts`: **5 falhas esperadas, 62 testes existentes aprovados**, 3 arquivos, duração reportada 19,80 s.
- Execução isolada obrigatória: `npm.cmd exec -- vitest run src/lib/portal/portal-tv-licenca-anual.contract.test.ts` confirmou os mesmos 5 vermelhos por stubs, 1 arquivo/5 casos, duração reportada 15,32 s.
- C1/C2/C3: `not implemented: applyRemoteMutation`; C4: `not implemented: toPortalSourceView`; C5: `not implemented: evaluatePlaybackAccess`. Sem falha de import/sintaxe nos cinco casos. Exit 1 é esperado antes de sdd-execute.
- Cinco contratos mantidos: hash esperado DDC4B784447A25A3E9BB23B8EC879F062D373481DA31446114B2D74EA4CA6CF6. Lock preservado: 6FAAEEA92290EECA85ABC141C89202FE63DB9C8A0E2EEC44670AE606965D093F. Integridade conferida pelo script de lock após a escrita.
- 52 IDs estáveis + 9 gates de release = 61 checkboxes abertos; cobertura individual de 33 FR e 12 SC em tasks.md. Seções finais do plano preservadas byte a byte no conteúdo UTF-8, salvo newline final normalizado.
- Não rodados nesta revisão: suíte completa/build/E2E/hardware/pagamento real/emulator Google/infra real/backup. Não há aceitação funcional/comercial nem prova de custo/RPO/latência.

Decisões pesquisadas em documentação oficial: restore Firestore em nova base; backup/restore cobrados além da franquia; Cloud Storage com precondição de criação e consistência forte para journal. Fontes e consequências em research.md. Conflitos normativos continuam gate T001, não foram tratados como PASS.

Nota do runner na execução isolada: após reportar os cinco vermelhos esperados, Vitest avisou 'close timed out after 10000ms' e 'Tests closed successfully but something prevents 2 Vite servers from exiting'. O atraso de encerramento já tinha registro histórico; não foi investigado nesta revisão. Não é falha de import/sintaxe e não autoriza inflar timeouts ou alterar contratos.
