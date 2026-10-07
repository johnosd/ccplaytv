# Tasks: Teste de conexão da TV em Configurações

**Input**: `sdd/specs/062-teste-conexao-tv/` — spec, plan, research, data-model, logic/medicao, quickstart e contract-tests.lock.

**Organization**: fundação → US1/P1 independente → US2/P2 → Polish. `[P]` indica arquivos independentes, sem dependência dentro da fase. Tasks de testes complementares ficam em bloco próprio; os contratos já existem e não podem ser editados.

## Path Conventions

- Frontend ativo: `tv-web/src/`; motor/repositório em `lib/network/`, UI em `features/settings/` e `features/home/`.
- Testes adicionais colocados ao lado dos módulos, fora de `*.contract.test.*`; E2E em `tv-web/e2e/`.
- Documentos/evidência: `sdd/specs/062-teste-conexao-tv/`; status por `.planning/scripts/powershell/update-feature-status.ps1`.
- Não tocar `api/`, projeto legado ou dados reais de provedor.

## Phase 1: Setup

**Objetivo**: confirmar contratos, destino e versão de armazenamento antes de implementar.

### Implementation

- [x] T001 Conferir `tv-web/src/lib/catalog/db.ts` (v17 livre), `CCPlayTv/config.xml` (internet/access existentes), `research.md` e `contract-tests.lock`; validar probe pequeno do destino e registrar mudanças de hipótese em `plan.md`/`research.md`. Não executar teste de 100 MB automaticamente nem tratar probe PC como aceite físico.
- [x] T002 Conferir interfaces dos stubs em `tv-web/src/lib/network/speedTest.ts`, `speedTestRepository.ts` e `tv-web/src/features/settings/SpeedTestDialog.tsx`, integridade das travas 026/028/032/060 e baseline da área pelos comandos do plano. Não regravar contratos para facilitar implementação.

### Testes da Fase

Sem novo teste: baseline e integridade existentes; contratos 062 ainda vermelhos pelo stub.

**Critério de Conclusão**: baseline da área e type-check passam, cinco contratos falham por stubs, travas íntegras e versão/hipóteses confirmadas. Nenhuma migração ou requisição automática por montagem.

**Registro da Fase**:

- Status: Concluída em 2026-10-06; T001/T002 verificadas. Modo pausado.
- Feito: v16 atual/v17 livre, privilégio internet e access externo existentes; probe PC de 1 byte HTTP 200, corpo de 1 byte, ACAO/TAO `*`; interfaces dos três stubs conferidas, sem alterar código de produção ou contratos.
- Contrato: sem contrato a implementar nesta fase. `npx vitest run src/lib/network/speedTest.teste-conexao-tv.contract.test.ts src/lib/network/speedTestRepository.teste-conexao-tv.contract.test.ts src/features/settings/SpeedTestDialog.teste-conexao-tv.contract.test.tsx` → 5/5 vermelhos por `Error: not implemented`, sem falha de import/tipo/sintaxe; trava íntegra. Execução em `tv-web/`.
- Testes executados: em `tv-web/`, `npx vitest run src/features/settings/SettingsScreen.integrations.test.tsx src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx src/features/home/HomeContent.test.tsx src/lib/catalog/prefetch/activityGate.test.ts` → 39/39 verdes; `npx tsc -b --pretty false` → exit 0; `npm run lint` → exit 0, com warnings em arquivos preexistentes, sem erro. Na raiz, `check-contract-tests.ps1 -Slug <slug> -Json` → PASS para 062-teste-conexao-tv, 026-home-busca-configuracoes-ds-v14, 028-limpeza-qa-ds-v14, 032-metadata-tmdb-integracoes e 060-home-vitrine-expandida; uma passada, sem regravar locks.
- Pendências: nenhuma bloqueante de Setup. CORS `file://`, corpos maiores e comportamento físico continuam no gate T023; Fase 2 aguarda confirmação.

## Phase 2: Foundational — motor e singleton

**Objetivo**: fornecer medição limitada/cancelável e armazenamento seguro à US1.

### Contrato da Fase

- C1 — cálculo/GETs sem reporte; C2 — teto/validade; C3 — timeout/cancelamento/mutex; C4 — último resultado.
- Em `tv-web/`: `npx vitest run src/lib/network/speedTest.teste-conexao-tv.contract.test.ts src/lib/network/speedTestRepository.teste-conexao-tv.contract.test.ts`

### Implementation

- [x] T003 Implementar `tv-web/src/lib/network/speedTest.ts`: destino/GET sem credenciais/redirecionamento, stream incremental, orçamento reservado, warmup/sondas/download e cálculos conforme `logic/medicao.md` (FR-005/006/007/008/014/019; SC-003/004/006) → contratos C1/C2.
- [x] T004 Implementar mutex, deadline, signal externo, limpeza e erros fechados no mesmo `speedTest.ts`, sem progresso tardio/reporte/requisições sobrepostas (FR-008/009/010/015; SC-002/003) → contrato C3; seguir `logic/medicao.md`.
- [x] T005 Implementar Dexie v17 em `tv-web/src/lib/catalog/db.ts` e stubs de `speedTestRepository.ts` conforme `data-model.md`: singleton, validação, não sobrescrever inválido, leitura/limpeza e falha de guarda (FR-016/017; SC-005) → contrato C4.

### Testes da Fase

- [x] T006 Escrever `tv-web/src/lib/network/speedTest.test.ts` para 429/offline/erro sanitizado, ausência de stream, corpo truncado/excedente, amostras inválidas/insuficientes e orçamento reservado de resposta interrompida; sem rede real ou timeouts inflados.
- [x] T007 [P] Escrever `tv-web/src/lib/network/speedTestRepository.test.ts` para registro corrompido, quota/leitura indisponível e upgrade de v16 preservando fonte/estado local; usar banco isolado, sem credenciais reais.

**Critério de Conclusão**: comando acima → 4/4 verdes e `check-contract-tests.ps1 -Slug 062-teste-conexao-tv` íntegro; testes adicionais e type-check passam, corpos não são retidos e serviço não requer catálogo/backend.

**Registro da Fase**:

- Status: Concluída em 2026-10-06; modo contínuo.
- Feito: T003–T007; motor limitado/cancelável, mutex, erros sanitizados, singleton v17 e validação/projeção de dados.
- Contrato: em tv-web/, `npx vitest run src/lib/network/speedTest.teste-conexao-tv.contract.test.ts src/lib/network/speedTestRepository.teste-conexao-tv.contract.test.ts` → 4/4 verdes; trava íntegra.
- Testes executados: `npx vitest run src/lib/network/speedTest.teste-conexao-tv.contract.test.ts src/lib/network/speedTestRepository.teste-conexao-tv.contract.test.ts src/lib/network/speedTest.test.ts src/lib/network/speedTestRepository.test.ts src/lib/catalog/db.test.ts` → 21/21; `npx tsc -b --pretty false` e `npx oxlint src/lib/network src/lib/catalog/db.ts` → exit 0. Uma iteração, incluindo erros, quota e upgrade v16.
- Pendências: C5 permanece stub até Fase 3; comprovação física continua em T023.

## Phase 3: User Story 1 — Configurações (P1)

**Objetivo**: medir, cancelar, repetir e consultar o resultado pela TV, mesmo sem lista ou chave.

**Independent Test**: acessar Configurações sem fonte, usar transporte controlado e validar todos os estados; medição física fica no gate final.

### Contrato da Fase

- C5 — abertura sem medir, SELECT inicia, RETURN fecha/captura teclado.
- Em `tv-web/`: `npx vitest run src/features/settings/SpeedTestDialog.teste-conexao-tv.contract.test.tsx`

### Implementation

- [x] T008 [US1] Criar `tv-web/src/features/settings/useSpeedTest.ts`: estado/id, início explícito, guard real de mídia/offline, cancelamento por fechamento/desmontagem/visibilidade/suspensão, callbacks tardios e compromisso de persistência serializado conforme `logic/medicao.md` (FR-003/009/010/011/012/016/017; SC-002/003/005). Não alterar `prefetchScheduler`.
- [x] T009 [US1] Implementar stub `tv-web/src/features/settings/SpeedTestDialog.tsx` usando `Modal`, etapas reais, explicação da rota/limites, métricas/unidades/data/completo/parcial/limite, avisos e saídas focáveis (FR-004/006/008/009/013/014/015/020/021; SC-001/004/006) → contrato C5.
- [x] T010 [US1] Integrar card real em `IntegrationsPanel.tsx`, `integrationsModel.ts` e `tabs/IntegrationsTab.tsx`; ler `initialFocus`, conservar card por id e scroll ao fechar diálogo, manter handle da aba/único teclado na tela, sem fonte/chave (FR-001/003/013/018/022; SC-001/002). Retirar speedtest apenas de `INTEGRATION_SOON_CARDS` nesta fase; registro global permanece até US2.
- [x] T011 [P] [US1] Acrescentar textos pt/en/es em `tv-web/src/lib/i18n/messages/settings.ts` e `home.ts`, inclusive ausência, parcial/limite, data/destino, armazenamento indisponível e rota HTTP sem garantia IPTV (FR-004/006/015/018/020/021; SC-006). Usar `useT`, formatadores locais e helpers recebendo `t`.
- [x] T012 [P] [US1] Estilizar card/dialog em `tv-web/src/styles/settings.css` com tokens existentes, estados Spectrum e foco/disabled/ARIA sem cores/tamanhos literais, preservar Stage (FR-013/014/021; SC-001/006) → contrato C5.

### Testes da Fase

- [x] T013 [US1] Escrever `tv-web/src/features/settings/useSpeedTest.test.tsx`: guard de mídia, abandono/suspensão sem reinício, id tardio, corrida entre fechamento/gravação/repetição e falha de guarda mantendo atual (FR-010/011/012/016/017; SC-002/003/005).
- [x] T014 [US1] Atualizar teste comum `SettingsScreen.integrations.test.tsx` e criar `SettingsScreen.speedTest.test.tsx`: acesso sem fonte/chave, estados erro/insuficiente/bloqueado com SELECT/RETURN, restauração card/scroll e ausência de rede por foco (FR-001/003/009/013/015; SC-001/002). Não alterar contratos antigos.
- [x] T015 [P] [US1] Complementar `SpeedTestDialog.test.tsx` e testes i18n existentes para métricas ausentes versus jitter zero, último teste/data, aviso de guarda e equivalência pt/en/es; verificar nomes acessíveis e nenhuma qualidade inventada (FR-006/018/020/021; SC-004/006).

**Critério de Conclusão**: comando C5 → 1/1 verde, contratos C1–C4 permanecem verdes e lock íntegro; US1 funciona isoladamente sem dock, testes adicionais/type-check passam, RETURN fecha camada sem sair da tela e sem rede automática.

**Registro da Fase**:

- Status: Concluída em 2026-10-06; modo contínuo.
- Feito: T008–T015; controlador, diálogo, card real, textos pt/en/es e CSS Spectrum em `styles/settings.css` (a área foi extraída de screens.css).
- Contrato: `npx vitest run src/features/settings/SpeedTestDialog.teste-conexao-tv.contract.test.tsx` → C5 verde; os cinco contratos executados juntos permanecem verdes, trava íntegra.
- Testes executados: em tv-web/, `npx vitest run src/features/settings/SpeedTestDialog.test.tsx src/features/settings/useSpeedTest.test.tsx src/features/settings/SettingsScreen.speedTest.test.tsx src/features/settings/SpeedTestDialog.teste-conexao-tv.contract.test.tsx src/features/settings/SettingsScreen.integrations.test.tsx src/lib/network/speedTest.teste-conexao-tv.contract.test.ts src/lib/network/speedTestRepository.teste-conexao-tv.contract.test.ts` → 21/21. Teste de fechamento aguardou `act` assíncrono para descarregar efeitos antes do segundo RETURN; a verificação anterior foi intermitente. Tipos/lint da área exit 0.
- Pendências: gate físico T023; dock ainda placeholder até Fase 4. Restauração de scroll será verificada em E2E.

## Phase 4: User Story 2 — atalho e resumo no dock (P2)

**Objetivo**: chegar ao mesmo card e voltar à origem, consultando só o último resultado local.

**Independent Test**: resultado conhecido em IndexedDB; navegar pelo dock sem medir, fechar Configurações e restaurar identidade/posição.

### Implementation

- [x] T016 [US2] Acrescentar `service?: 'speedtest'` ao ramo panel de `tv-web/src/features/settings/tabs/settingsTab.ts`; ajustar encaminhamento em `App.tsx`/props de `HomeContent.tsx` para selecionar card speedtest sem iniciar/abrir dialog, conservando caminho TMDB e `HomeFocus` de origem (FR-002/003/013; SC-001/002). Manter novas props opcionais para fixtures/contratos existentes.
- [x] T017 [US2] Criar `tv-web/src/lib/network/useLastSpeedTest.ts` para Query local compartilhada entre card e `HomeContent.tsx`; invalidar após resultado realmente salvo. Renderizar dock compacto com resumo/data no foco, sem revalidar conexão (FR-017/018; SC-002/005).
- [x] T018 [US2] Retirar somente `dock-speedtest` de `tv-web/src/lib/comingSoon.ts` e seus textos de placeholder em `messages/comingSoon.ts`/`settings.ts` quando ambos os acessos forem reais; atualizar referências/comentários em `HomeContent.tsx`, preservando IA/clima (FR-022).

### Testes da Fase

- [x] T019 [US2] Criar `tv-web/src/features/home/HomeContent.speedTest.test.tsx` e complementar `SettingsScreen.speedTest.test.tsx`: dock→aba/card→dialog→card→dock com id/scroll, resumo local/ausente, troca de lista e zero fetch sem SELECT; manter TMDB (FR-002/003/013/017/018/022; SC-001/002/005).

**Critério de Conclusão**: testes US2 e baseline Home/Configurações verdes, cinco contratos 062 e travas antigas íntegros; mesma superfície, duas camadas de RETURN e nenhum placeholder speedtest residual nos dois acessos.

**Registro da Fase**:

- Status: Concluída em 2026-10-06; modo contínuo.
- Feito: T016–T019; dock real, foco por serviço, consulta local compartilhada/invalidação após guarda, resumo/data e remoção exclusiva do placeholder speedtest.
- Contrato: sem contrato novo nesta fase; cinco contratos 062 e contrato de Configurações 026 → 6/6 verdes; locks 026/028/032/060/062 íntegros.
- Testes executados: `npx vitest run src/features/home/HomeContent.speedTest.test.tsx src/features/home/HomeContent.test.tsx src/features/settings/SettingsScreen.speedTest.test.tsx src/features/settings/SettingsScreen.integrations.test.tsx src/lib/comingSoon.test.ts` → 44/44; `npx vitest run src/lib/network/speedTest.teste-conexao-tv.contract.test.ts src/lib/network/speedTestRepository.teste-conexao-tv.contract.test.ts src/features/settings/SpeedTestDialog.teste-conexao-tv.contract.test.tsx src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx` → 6/6; lint da área exit 0. Chave i18n inválida detectada pelo type-check e corrigida antes dos gates completos.
- Pendências: fluxo App/scroll completo em E2E; gate físico T023.

## Phase 5: Polish & Cross-Cutting Concerns

**Objetivo**: verificar fluxo completo, capacidade física e documentação antes de declarar entrega.

### Implementation

- [x] T020 Revisar alterações de `tv-web/src/lib/network/`, `features/settings/` e `features/home/` por segredos, analytics, arrays grandes/requests residuais; conferir build chrome108, arquivos emitidos em `tizen_web_project.yaml` e placeholders restantes (FR-007/019/020/021/022; SC-003/004/006).
- [x] T021 Rodar lint, `npx tsc -b --pretty false`, suíte Vitest completa e build em `tv-web/`; conferir lock 062 e travas 026/028/032/060. Registrar comandos/resultados em `plan.md`; corrigir regressões sem editar contratos.
- [ ] T022 Executar `npm run test:e2e` contra `npm run dev`, depois roteiro navegador de `quickstart.md`; registrar evidência em `plan.md` antes de solicitar validação Tizen (SC-001–006).
- [ ] T023 Usar `tizen-tv` para app empacotado na TV física após gates automáticos/E2E; executar sucesso real com três métricas, limite, cancelamento/liberação, ciclo de vida, memória, persistência e guard de reprodução. Criar `sdd/specs/062-teste-conexao-tv/validation-tv.md` sem segredos (FR-023; SC-007). Gate pendente impede entrega.
- [ ] T024 Sincronizar `spec.md`, `plan.md`, `tasks.md`, backlog pelo `update-feature-status.ps1` e referências de `docs/status-features.md` quando cabível, usando evidência real; atualizar prose do backlog para Dexie v17/próxima v18 somente após migração implementada. Preparar `sdd-converge`, sem declarar gate físico satisfeito se não foi.

### Testes da Fase

- [x] T025 Escrever `tv-web/e2e/teste-conexao-tv.mjs` e registrar em `tv-web/e2e/run.mjs`: transporte interceptado para sucesso/parcial/erro/cancelamento/limite, persistência/retorno, zero rede por foco, pt/en/es e controles nomeados. Reutilizar padrão dos roteiros existentes; esse teste não prova rede/AVPlay reais. Executar antes de T022.

**Critério de Conclusão**: cinco contratos verdes, locks íntegros, lint/type-check/unit/build/E2E e quickstart passam; evidência física T023 satisfaz FR-023/SC-007, documentação canônica sincronizada.

### Checklist de Release

- [x] Fase 1 confirmada.
- [x] Fase 2 — fundação concluída.
- [x] Fase 3 — US1 independente concluída.
- [x] Fase 4 — US2 concluída.
- [x] Todos os contratos verdes e `check-contract-tests.ps1` íntegro; travas antigas preservadas.
- [ ] Lint/type-check/unit/build/E2E concluídos; frontend e rota CORS validados.
- [ ] `quickstart.md` executado; gate físico com sucesso/limite/cancelamento registrado.
- [x] Sem credenciais, telemetria adicional ou números inventados; idiomas/foco/saída conferidos.
- [ ] Status/documentação sincronizados por scripts; pronto para convergência.

**Registro da Fase**:

- Status: Em execução; pausa obrigatória por falha E2E fora do escopo (sdd-execute passo 6), decisão solicitada.
- Feito: T020/T021/T025 e revisão de segredos, somente GETs/destino público, bytes reservados/stream descartado, sem analytics. chrome108 preservado; 16 arquivos do dist listados no YAML (zero ausentes). Roteiro E2E novo registrado; expectativa antiga de placeholder speedtest no E2E metadata-tmdb atualizada sem tocar contratos.
- Contrato: cinco contratos verdes na suíte completa; locks 026/028/032/060/062 íntegros, sem regravação.
- Testes executados: `npm run test` → 459 arquivos/2866 testes verdes; `npm run lint`, `npx tsc -b --pretty false` e `npm run build` → exit 0, warnings preexistentes de lint/chunk e jsdom sem mídia real. `node e2e/teste-conexao-tv.mjs` → aprovado; uma correção de seletor para a string real Resultado completo/parcial. Capturas pt/en/es/dock/resultado revisadas em 1920×1080: foco/controles legíveis, sem cortes ou qualidade inventada. Revisão posterior corrigiu resumo após fechar durante compromisso de gravação e rejeitou data inválida; `npx vitest run src/features/settings/useSpeedTest.test.tsx src/lib/network/speedTestRepository.test.ts src/lib/network/speedTestRepository.teste-conexao-tv.contract.test.ts` → 8/8, lint/tipos/build exit 0. `npm run test:e2e` completo → 41/42 scripts em 320s (exit 1), somente epg-guia-completo falhou; `node e2e/epg-guia-completo.mjs` repetiu a falha na aba Amanhã (exit 1), sem alteração no código de EPG.
- Pendências: T022/T023/T024; aguardando decisão sobre falha externa do guia Amanhã; sucesso/limite/cancelamento e demais cenários físicos ainda não executados.

## Dependencies & Execution Order

Fase 1 → 2 → 3 → 4 → 5. T003 precede T004; T005 pode ser trabalhada separadamente do motor, mas ambas precedem US1. T011/T012 independem entre si, com verificação integrada após T009/T010. T016 precede T019; T017 integra leitura também no card da US1. T025 precede T022; T021/T022 precedem T023; T023 precede encerramento T024. `[P]` descreve independência de trabalho, sem exigir delegação a agentes.

## Implementation Strategy

Fazer US1 passar isoladamente antes do dock. Não substituir os stubs por implementação dentro de uma nova passada de plan. `sdd-execute` respeita checkpoints e preenche Registro da Fase/Estado Atual/Execution Notes; os blocos estão vazios de propósito. A entrega exige ambas as stories e gate físico.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
