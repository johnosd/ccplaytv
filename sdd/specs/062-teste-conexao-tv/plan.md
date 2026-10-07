# Implementation Plan: Teste de conexão da TV em Configurações

**Slug**: `062-teste-conexao-tv` | **Date**: 2026-10-06 | **Spec**: `sdd/specs/062-teste-conexao-tv/spec.md`

## Summary

Entregar diagnóstico manual em Configurações › Integrações & BYOK, com download, latência HTTP e jitter; dock apenas leva ao card e resume o último resultado local. Cliente próprio de fetch para Cloudflare, transferências sequenciais e leitura incremental, limite de 30 segundos/100 MB, cancelamento cooperativo e uma execução global. Guardar singleton no IndexedDB. Nenhum backend, SDK adicional, upload, analytics ou diagnóstico automático de IPTV.

## Technical Context

**Language/Version**: TypeScript ~6.0.2, React ^19.2.8; Vite ^8.3.0, build `chrome108`.

**Primary Dependencies**: Dexie ^4.4.6, TanStack Query ^5.102.8 existente para leitura/atualização local; `Modal`, `useRemoteNav`, `useT`, Stage e tokens do projeto. Fetch/ReadableStream/AbortController nativos. Nenhuma dependência nova.

**Storage**: `CatalogDb` atualmente v16; reservar v17 para `networkDiagnostics: 'id'`, singleton `last` global ao aparelho. Confirmar versão livre no execute; não mudar migrações históricas.

**Testing**: Vitest ^5, projetos node (.ts) e dom (.tsx), fake-indexeddb, Testing Library; Playwright via `e2e/run.mjs`. Contratos novos não precisam de inclusão em `TESTES_TS_COM_DOM`.

**Target Platform**: Samsung QN50Q60DAGXZD, Tizen 9/Chromium 120 observado, origem `file://`; piso de build Chromium 108. Desktop serve desenvolvimento; capacidade só aceita após gate físico.

**Performance Goals**: até 30.000 ms/100.000.000 bytes, uma transferência por vez, descarte incremental de blocos, cancelamento/navegação responsivos. Não manter buffer integral ou prometer largura de banda máxima. Progresso por etapa, tempo e bytes reais, sem percentual.

**Constraints**: client-first/Direct Play, sem segredo na requisição/resultado/log, sem rede por foco/montagem, sem mídia ativa. Cancelar ao ocultar/suspender/sair; não retomar. Destino externo sem SLA assumido. Só resultado com alguma métrica válida substitui singleton.

**Scale/Scope**: um teste e um resultado por aparelho, duas stories; sem relação com tamanho do catálogo, conta ou lista ativa.

**Referências**: constitution 1.7.0 e ADRs 006/007/008/009/010/011. V14 §§5/11/19/20/21.5/38/40/41/45; Lab `services`/`byok`, protótipo `settingsIntegrations`/`speedTestModal`, guias Samsung 03/08. Upload, ping ICMP e classificação ilustrativa do protótipo ficam fora conforme spec/precedência.

## Decisões Invariantes

- D-001: execução somente no diálogo de Configurações, iniciado por SELECT; dock só navega ao card. Abrir/focar/retomar/lê-lo não chama o motor.
- D-002: destino Cloudflare fixo, GET `__down?bytes=N`, credenciais omitidas, cache desabilitado, sem redirecionamento, headers privados ou reporte. Não usar SDK completo; [pesquisa](research.md).
- D-003: orçamento inclui aquecimento/sondas e reserva corpos solicitados antes do fetch, sem devolver reserva de resposta interrompida. Contar bytes recebidos honestamente; não elevar teto. Deadline aborta corpo ativo e serviço aguarda limpeza antes de liberar mutex.
- D-004: cálculos e mínimos de validade são os de [logic/medicao.md](logic/medicao.md); não substituir por percentis do SDK ou números do protótipo. Ausência é `null`, jitter medido pode ser zero.
- D-005: uma execução global, id do controlador protege UI/persistência de eventos tardios; Cancelar/RETURN/saída/suspensão descartam a tentativa. Não reiniciar/repetir automaticamente.
- D-006: manter encerramento de reprodução já causado pela navegação; guard por hold de mídia do gate existente. Não fechar/retomar player por conta própria nem parar/reiniciar scheduler do catálogo. Não garantir exclusividade da rede.
- D-007: Dexie v17, único `last`, sem `sourceId`/histórico. Cancelamento/falha total/zero métricas preservam anterior. Falha de guarda mantém atual em memória e informa indisponibilidade. Limpeza de dados gerais remove a tabela, sem botão genérico novo.
- D-008: `Modal` intercepta teclado; aba conserva identidade `speedtest`/scroll. Extensão opcional `service` no ramo panel de `SettingsFocus` mantém consumidores antigos. Início conserva `HomeFocus` por id.
- D-009: estados iniciais, execução, resultado, erro, limite e impedimento têm ação focável/SELECT; UI Spectrum, i18n pt/en/es e sem diagnóstico de causa/nota/garantia.
- D-010: remover apenas speedtest dos placeholders quando os dois acessos reais forem entregues. FR-023/SC-007 são gate físico obrigatório depois de automatizados/E2E.

## Constitution Check

*Gate pré-design e reavaliação pós-design: sem violações ou exceções novas.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | PASS | PASS | Configurações funciona sem fonte/chave/conta |
| Segredos Fora dos Clientes e dos Logs | PASS | PASS | Transporte fixo sem dados de fonte/BYOK; erros por códigos fechados |
| Categorias da Fonte São Preservadas | PASS | PASS | Diagnóstico não altera catálogo/categorias |
| IA e Classificação Nunca Inventam Dados | PASS | PASS | Métricas somente de amostra válida; sem nota ou causa inferida |
| Comandos Locais Independem de Rede, Backend ou IA | PASS | PASS | Teclado/cancelamento local, sem aguardar serviço para navegar |
| Trailers e Metadados Não Alteram o Estado Principal da Obra | PASS | PASS | Nenhuma escrita em favoritos/histórico/progresso |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | PASS | PASS | SELECT inicia/cancela/repete; RETURN fecha primeiro Modal |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | PASS | PASS | Não toca importador/streams de fonte |
| Foco Visível e Sem Becos Sem Saída | PASS | PASS | Todos os estados com ação focada; C5 e integração adicionais |
| Voltar Restaura Foco e Posição | PASS | PASS | Identidade do card/dock, scroll preservado; testes US1/US2 |
| Identidade de Reprodução Não Depende da URL | PASS | PASS | Não toca identidade/estado de reprodução |
| Progresso e Capacidades São Reais, Nunca Prometidos | PASS | PASS | Etapas reais, métricas ausentes explícitas, sem QoE inventado |
| Documentação do Repositório É Canônica | PASS | PASS | Scripts de status, paths reais e gate físico explícito |

Restrições/fluxo: sem backend obrigatório ou nova biblioteca; chrome108 preservado; todos os recursos emitidos precisam do manifesto Tizen existente. A entrega exige testes automatizados, E2E e TV física conforme spec. O planejamento só cria stubs não ligados ao app.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/062-teste-conexao-tv/
  spec.md
  plan.md
  tasks.md
  research.md
  data-model.md
  logic/medicao.md
  quickstart.md
  contract-tests.lock
  handoff.md
  validation-tv.md          # futuro: evidência do execute
```

### Source Code (repository root)

```text
tv-web/
  src/App.tsx
  src/features/home/HomeContent.tsx
  src/features/settings/
    SettingsScreen.tsx
    IntegrationsPanel.tsx
    integrationsModel.ts
    tabs/IntegrationsTab.tsx
    tabs/settingsTab.ts
    SpeedTestDialog.tsx                    # stub criado
    SpeedTestDialog.teste-conexao-tv.contract.test.tsx
    useSpeedTest.ts                        # novo no execute
  src/lib/network/                         # novo neste planejamento
    speedTest.ts                           # stub criado
    speedTest.teste-conexao-tv.contract.test.ts
    speedTestRepository.ts                 # stub criado
    speedTestRepository.teste-conexao-tv.contract.test.ts
    useLastSpeedTest.ts                    # novo no execute: leitura local
  src/lib/catalog/db.ts
  src/lib/catalog/prefetch/activityGate.ts  # reutilizar, sem alterar contrato
  src/lib/i18n/messages/settings.ts
  src/lib/i18n/messages/home.ts
  src/lib/comingSoon.ts
  src/styles/screens.css
  src/components/Modal.tsx                 # reutilizar
  src/testing/accessibleNames.ts           # helper existente reutilizado
  e2e/run.mjs
  e2e/teste-conexao-tv.mjs                  # novo no execute
CCPlayTv/config.xml                        # internet/access já existentes
tizen_web_project.yaml
```

**Structure Decision**: feature client-first exclusivamente em `tv-web/`. Motor puro e repositório em `src/lib/network/`; controlador/dialog em Configurações. Reutilizar Query para singleton local no card/dock e invalidar após guarda. Não montar uma segunda execução no Início; `api/` e projeto legado `tizen-app/` fora do escopo.

## Complexity Tracking

> Sem violações a justificar.

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (para capacidades que o navegador não prova). Novos contratos são deliberadamente vermelhos; não rodar a suíte inteira para provar ausência de regressão nesta etapa, pois contém esses stubs.

Comandos-base em `tv-web/`:

```powershell
npm run lint
npx tsc -b --pretty false
npm run test
npm run build
npm run dev
# Outro terminal, após servidor disponível:
npm run test:e2e
```

### Testes de Contrato

**5/5 casos**, arquivos dedicados travados em `contract-tests.lock`:

```powershell
# De tv-web/:
npx vitest run src/lib/network/speedTest.teste-conexao-tv.contract.test.ts src/lib/network/speedTestRepository.teste-conexao-tv.contract.test.ts src/features/settings/SpeedTestDialog.teste-conexao-tv.contract.test.tsx
# Da raiz:
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 062-teste-conexao-tv
```

| Teste (prefixo do nome executável) | Origem | Fase | Vermelho confirmado antes do execute |
| --- | --- | --- | --- |
| C1 calcula métricas reais e faz somente GETs | FR-005/019, SC-004/006 | 2 | `Error: not implemented` em runSpeedTest |
| C2 reserva todo payload até 100 MB | FR-007/008, SC-003/004 | 2 | `Error: not implemented` em runSpeedTest |
| C3 aborta o corpo no deadline e no cancelamento | FR-008/009/010, SC-002/003 | 2 | `Error: not implemented` em runSpeedTest |
| C4 persiste apenas o último resultado válido | FR-016/017, SC-005 | 2 | `Error: not implemented` em readLastSpeedTestResult |
| C5 abre sem medir, SELECT inicia e RETURN fecha | US1/AC1/AC3, FR-003/013, SC-001/002 | 3 | `Error: not implemented` em SpeedTestDialog |

Motor: 3 casos no arquivo speedTest; repositório: 1; UI: 1. Fake de transporte fica no próprio contrato travado e consome streams sem rede; não mocka o motor. Repositório usa `CatalogDb`/fake-indexeddb real. UI reutiliza helper acessível do projeto. Stubs criados: os três arquivos públicos acima, sem conexão com produção e sem migração implementada.

Verificação da área existente em `tv-web/`:

```powershell
npx vitest run src/features/settings/SettingsScreen.integrations.test.tsx src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx src/features/home/HomeContent.test.tsx src/lib/catalog/prefetch/activityGate.test.ts
```

Resultado no planejamento: **39/39** em quatro arquivos; `npx tsc -b --pretty false` passou. Contratos das features 026/028/032 e 060 devem permanecer intactos. Não alterar contrato antigo para remover placeholder: revisar primeiro quais arquivos realmente o verificam; o teste comum `SettingsScreen.integrations.test.tsx` pode ser atualizado.

Complementares no execute: falhas sanitizadas/429, corpo incorreto/sem stream, amostra inválida, leitura/gravação indisponível, migração preservando dados, lifecycle/guard/retorno real ao card, corridas de persistência, idiomas e dock. E2E com endpoint interceptado testa fluxo/ausência de rede automática; TV valida medição real, limites, cancelamento e memória.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fases 1–4 | Concluídas: T001–T019; modo contínuo |
| Verificações | US2: 44/44 testes; contratos 062 + Configurações 026 6/6; lint da área exit 0 |
| Contratos | 062/026/028/032/060 íntegros |
| Fase 5 | T020/T021/T025 concluídos; revisão adicional 8/8, tipos/lint/build exit 0; E2E completo 41/42, falha externa reproduzível no guia Amanhã |
| Aceite físico | Não iniciado: E2E pendente e decisão sobre falha do guia Amanhã aguardada |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Endpoint externo sem SLA; CORS file:// e corpos maiores ainda não provados | Capacidade pode falhar na TV | T001/T023; probe PC de 1 byte não é aceite; sem fallback automático |
| R-002 | Aborto/streams/deadline e memória dependem do navegador/event loop | Tráfego residual/teto impreciso | C2/C3, leitura incremental, timer + checks, evidência física T023 |
| R-003 | Dexie v17 pode ser consumida por outra feature | Conflito de migração | Resolvido: implementada em T005; upgrade preservando dados validado em T007 |
| R-004 | Hold de mídia e cargas compartilhadas do catálogo | Concorrência altera diagnóstico | Guard real, não reusar playback como hold fictício; não reiniciar scheduler; T008/T013/T023 |
| R-005 | Gravação atrasada/fechamento/repetição | Último resultado incorreto | Resolvido: compromisso serializado, id ativo; conclusão da escrita após fechamento atualiza consulta local; T008/T013 e C4 |
| R-006 | Termos/estabilidade do destino na distribuição comercial | Uso futuro requer reavaliação | Pesquisa registra ausência de SLA/autorização comercial presumida |
| R-007 | E2E existente epg-guia-completo falha ao focar primeiro programa da aba Amanhã | Gate E2E não satisfeito; fora do escopo de 062 | Reproduzido no runner e isolado, código de EPG não alterado; usuário consultado conforme sdd-execute passo 6; raiz ainda não diagnosticada |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-06 | Fase 1 / Setup | T001/T002 concluídas: v17 livre, config Tizen já permite internet; probe 1 byte 200/ACAO/TAO `*`; baseline 39/39, tipos/lint exit 0, 5 contratos vermelhos por stubs e locks íntegros. Sem alterações em produção. | Confirmar Fase 2/T003; TV continua gate futuro |
| 2026-10-06 | Fase 2 / Foundational | T003–T007: motor e singleton v17, 4/4 contratos e 21/21 testes da área, tipos/lint exit 0, lock íntegro. Usuário autorizou modo contínuo. | Fase 3 / US1; gate físico T023 |
| 2026-10-06 | Fase 3 / US1 | T008–T015; card/dialog/controlador reais, idiomas e CSS settings.css, 21/21 testes incluindo cinco contratos; tipos/lint exit 0. RETURN aguarda efeitos assíncronos no teste. | Dock/resumo US2, E2E e TV |

| 2026-10-06 | Fase 4 / US2 | T016–T019; dock/card por serviço, Query local global e resumo, placeholders speedtest retirados; 44/44 e 6/6 contratos; locks íntegros. | Gates completos/E2E/TV |

| 2026-10-06 | Fase 5 / gates parciais | Suíte completa 459/2866, lint/tipos/build exit 0; E2E 062 aprovado e imagens revisadas. Revisão inline: consulta após compromisso/fechamento e validade de data; E2E antigo atualiza placeholder. | Suíte E2E completa, rerun da revisão, TV |

| 2026-10-06 | Fase 5 / bloqueio E2E | Revisão de persistência/data 8/8, tipos/lint/build exit 0. epg-guia-completo falhou no runner e isolado na aba Amanhã (exit 1), sem alterações em EPG; decisão solicitada. | Decidir correção como desvio ou registro para depois; TV não iniciada |

| 2026-10-06 | Fase 5 / fechamento da rodada | E2E completo 41/42 em 320s, somente epg-guia-completo falhou; 062 aprovado no runner. Área após revisão 38/38, lock íntegro. Capturas de roteiros anteriores regeneradas pelo runner restauradas; evidência 062 preservada. | Aguardar decisão já solicitada sobre EPG; T022/T023/T024 abertos |

**PRÓXIMO**: aguardar decisão do usuário sobre falha fora do escopo em epg-guia-completo (foco Amanhã); não ampliar correção ou instalar na TV antes dessa decisão/gate E2E.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/e2e/teste-conexao-tv.mjs` e `e2e/run.mjs` — fluxo automatizado sem rede real.
- `tv-web/src/lib/network/speedTest.ts` e `speedTestRepository.ts` — motor/singleton v17.
- `tv-web/src/features/settings/useSpeedTest.ts` — cancelamento e compromisso serializado.
- `sdd/specs/062-teste-conexao-tv/quickstart.md` — roteiro restante, TV obrigatória.

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Setup confirmou v17 livre em 2026-10-06; conferir novamente ao começar T005 se houver alterações externas.
- Probe PC continua limitado a 1 byte, sem redirecionamento; resposta 200/CORS permissivo não comprova stream, cancelamento ou CORS `file://` na TV.
- Antes de implementar Foundational, C1–C4 falham por `not implemented`; C5 deve continuar vermelho até a Fase 3. Não tratar esses vermelhos esperados como regressões nem editar a trava.
- Comandos locais requerem execução fora do sandbox neste ambiente porque o helper Windows falha ao aplicar ACLs. Lint retorna exit 0 com warnings preexistentes; nenhum ajuste fora do escopo foi feito.

- PowerShell 5.1 envia pipes como ASCII: usar OutputEncoding UTF8 para scripts Python com prosa; apply_patch evita corrupção.
