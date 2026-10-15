**Contexto**

`ccplayTv`, branch `feature/designWave2`; React 19/TypeScript/Vite, client-first/Dexie. Próximo comando: `/sdd-execute 062-teste-conexao-tv`. Backlog: **Planejada, 0/34** (25 tarefas + 9 itens de release). Reler as alterações preexistentes em `.planning/backlog.md` e `sdd/assessments/g4-acessibilidade-sistema/` antes de tocá-las.

**O que a feature entrega**

- P1: teste manual em Configurações, download/latência HTTP/jitter, limite 30s/100 MB e somente último resultado válido no aparelho.
- P2: dock abre o mesmo card, com resumo local/data; não inicia teste.

**Leitura obrigatória, em ordem**

Em `sdd/specs/062-teste-conexao-tv/`: `spec.md` (aceite), `plan.md` (decisões/gates), `tasks.md` (cinco fases), `research.md` (destino e limitações), `logic/medicao.md` (cálculos/aborto/corridas), `data-model.md` (singleton), `quickstart.md` (verificação). Depois `.planning/memory/constitution.md`. Não há API de servidor nova nem `contracts/`.

**Testes de contrato**

Em `tv-web/`, três arquivos travados: `src/lib/network/speedTest.teste-conexao-tv.contract.test.ts` (3, fase 2), `src/lib/network/speedTestRepository.teste-conexao-tv.contract.test.ts` (1, fase 2), `src/features/settings/SpeedTestDialog.teste-conexao-tv.contract.test.tsx` (1, fase 3).

```powershell
# Em tv-web/:
npx vitest run src/lib/network/speedTest.teste-conexao-tv.contract.test.ts src/lib/network/speedTestRepository.teste-conexao-tv.contract.test.ts src/features/settings/SpeedTestDialog.teste-conexao-tv.contract.test.tsx
# Na raiz:
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 062-teste-conexao-tv
```

Cinco vermelhos confirmados por `not implemented`; 39 testes existentes da área verdes, type-check/lint dos novos arquivos aprovados. Travas 026/028/032/060 íntegras; preservar especialmente props opcionais de Configurações e caminho TMDB.

**Stubs criados**

- `tv-web/src/lib/network/speedTest.ts`: tipos/constantes e `runSpeedTest`, corpo provisório; T003/T004.
- `tv-web/src/lib/network/speedTestRepository.ts`: tipos e read/save/clear provisórios; T005.
- `tv-web/src/features/settings/SpeedTestDialog.tsx`: props e componente provisório; T009.

Ainda não ligados ao app. Nenhuma migração implementada.

**Armadilhas já mapeadas**

- Confirmar v17 livre antes de T005; singleton sem fonte/histórico, inválido/cancelado não substitui anterior.
- Reservar bytes antes do fetch, inclusive sondas; não devolver reserva abortada. Descartar blocos, aguardar limpeza antes de repetir e proteger compromisso de gravação por id.
- Guard usa hold real do `prefetchGate`; não fechar mídia nem reiniciar scheduler. Cargas compartilhadas podem competir por rede.
- `Modal` captura teclado; foco por estado/id, tokens Spectrum e i18n. T017 cria hook de leitura local compartilhado; foco/montagem nunca medem.
- Remover só speedtest dos placeholders após ambos os acessos; SDK completo da Cloudflare não é a escolha. Probe PC de 1 byte não prova TV.

**Pendências do Analyze**

Nenhuma. Constitution Check pré/pós PASS; 23 FRs e 7 SCs rastreados. Seguir para execução.

**Gate de pronto**

Contratos verdes/locks íntegros; em `tv-web/`: `npm run lint`, `npx tsc -b --pretty false`, `npm run test`, `npm run build`, `npm run test:e2e` com `npm run dev` ativo. Executar quickstart e sincronizar spec/plan/tasks/backlog pelo script em T024. **TV física é gate obrigatório** em T023, depois de E2E: sucesso com três métricas, limite e cancelamento, evidência em `validation-tv.md`. Nenhuma entrega antes dessa evidência.
