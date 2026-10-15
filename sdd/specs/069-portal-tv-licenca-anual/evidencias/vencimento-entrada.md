# Vencimento verificado na entrada da lista

Data: 2026-10-11. Decisão explícita do usuário: permitir uso até sair da lista; bloquear apenas a próxima entrada.

## Implementação

A guarda local em `allowListEntry` é chamada ao selecionar uma lista, concluir importação/verificação do provedor e retornar do seletor. Não faz HTTP. A navegação existente delimita a sessão; não se persiste admissão para uma nova execução do app. Vencimento durante uma sessão não encerra player/trailer nem impede navegação, novos plays ou retomada. Ao voltar ao seletor ou fechar o app, a próxima entrada exige licença vigente. Configuração/renovação e dados locais permanecem acessíveis. Revogação/estorno confirmados conservam encerramento controlado.

Constitution 1.9.0, spec, plano, lógica, modelo de dados, infraestrutura, quickstart, operação, README e status alinhados. ADR-013 emendado por nota histórica. Nenhum contrato congelado foi alterado.

## Validação desta revisão

- Vitest direcionado: 26/26 PASS, 6 arquivos, 7.99s. Comando: `npx.cmd vitest run src/App.licensing.test.tsx src/components/player/licensing.test.tsx src/lib/licensing/licenseRuntime.test.ts src/lib/player/playbackGuard.test.ts src/lib/portal/portal-tv-licenca-anual.contract.test.ts src/features/portal/usePortalIntegration.test.tsx`. Inclui entrada inicial, RETURN, verificação do provedor, reinício, renovação, foco por ID, offline local e sessão/trailer após expiração. A005 voltou a emitir aviso de encerramento após 10s; não resolvido.
- E2E `node e2e/run.mjs --only licenca-anual --jobs 1`: 1/1 PASS, 78.2s, build comercial em Vite isolado/serviços fictícios. Expiração mantém reprodução; saída salva retomada; outro play dentro da lista continua; RETURN/seleção no seletor são recusados, fonte preservada.
- `npx.cmd tsc -b`, `npm.cmd run lint` (inclui arquitetura) e `npm.cmd run build`: PASS. Build 485 módulos/539ms; guarda de ausência do demuxer de desenvolvimento PASS.

- Suíte completa `npm.cmd run test -- --pool=threads --maxWorkers=4 --reporter=json --outputFile=../.cache/069-list-entry-unit-results.json`: 3301/3301 PASS, 563 arquivos, aproximadamente271.06s; processo encerrou com código0 sem aviso nesta rodada. O aviso na rodada direcionada mantém A005 aberto.
- E2E relacionados `node e2e/run.mjs --only configuracoes-lista-global,portal-configuracao,trailers --jobs 3`: 3/3 PASS em115s (57.0s/114.6s/71.6s).
- `check-contract-tests.ps1 -Slug <slug> -Json`: locks032/034/037/047/054/067/069 íntegros. C1–C5 executados na rodada direcionada26/26 e na suíte completa. Nenhum contrato/trava alterado nesta revisão.
- `update-feature-status.ps1 -Slug 069-portal-tv-licenca-anual -Json`: Em Execução,50/63 itens.

## Limites

Não houve instalação, limpeza de dados ou teste desta regra na TV física. Nenhuma compra Mercado Pago, implantação ou medição de custo real. O gate global E2E continua pendente pela falha `teste-conexao-tv` já adiada pelo usuário. Os resultados históricos anteriores à decisão comprovam a regra anterior; esta revisão não fecha T036/T039/T041/T043/T045/T046/T047/T052.
