# Implementation Plan: Dividir PlayerLayer e LiveScreen por responsabilidade

**Slug**: `040-dividir-player-live` | **Date**: 2026-10-01 | **Spec**: `sdd/specs/040-dividir-player-live/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Refator puro (item 49a-1 do backlog): `components/PlayerLayer.tsx` (1 072
linhas) e `features/live/LiveScreen.tsx` (1 401) viram composições de módulos
por responsabilidade — no player, sessão/ciclo de vida, chrome, painéis e
teclado; na Live, trilha/lista, busca, zapping, guia, teclado e desenho. Mesmo
caminho, mesmas exportações, nenhum consumidor muda. A prova é a automação que
já existe (8 arquivos de contrato travados, de 7 features, montam os dois componentes, mais a suíte e
21 roteiros E2E), comparada contra uma **linha de base** medida antes de mover
qualquer linha. Bugs pequenos revelados no caminho são corrigidos por
sub-agentes, um por bug, com teste de regressão (decisão do usuário).

## Technical Context

**Language/Version**: TypeScript 5 / React 19 (`tv-web/`), Vite 8 (build `chrome108`).

**Primary Dependencies**: `@tanstack/react-query`, `@tanstack/react-virtual` (lista de canais), `useRemoteNav` (ADR-009), `PlayerService` + adaptadores (`lib/player/`).

**Storage**: N/A (nenhum dado novo; Dexie continua v15).

**Testing**: Vitest + Testing Library + `fake-indexeddb`; Playwright (`tv-web/e2e/*.mjs`) contra `npm run dev`.

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9.0 / Chromium 120, `file://`).

**Performance Goals**: nenhuma mudança (mesmo bundle, mesmos efeitos).

**Constraints**: §1 de `logic/divisao.md` — refs continuam refs, ordem dos efeitos preservada, um só `useRemoteNav` por componente, funções de render continuam funções, sem contexto React novo, mesmas importações externas (mocks das travas), API pública intacta.

**Scale/Scope**: 2 arquivos → ~14 módulos; ~2 500 linhas movidas; nenhuma linha de comportamento nova (exceto correções da US3).

## Decisões Invariantes

- **D-001 — Refator puro.** Nenhum comportamento, texto, tempo ou estado
  muda, exceto correções de bug registradas (D-007).
- **D-002 — API pública e caminhos intactos.** `components/PlayerLayer.tsx` e
  `features/live/LiveScreen.tsx` ficam, reexportando tudo o que exportam hoje
  (8 contratos travados importam desses caminhos, e o da 026 importa `PlayerLayer` para mocká-lo).
- **D-003 — Regras de movimentação de `logic/divisao.md` §1** (refs, ordem
  dos efeitos, um `useRemoteNav`, render como função, sem contexto, mesmos
  módulos externos, comentários juntos).
- **D-004 — Linha de base antes de mover.** Antes da 1ª movimentação, medir e
  gravar em `sdd/specs/040-dividir-player-live/baseline.md`: totais e lista
  de falhas de `npx vitest run`, contagem de ✓/✗ de `npm run test:e2e`,
  avisos do `oxlint`, arquivos emitidos pelo `build:tizen`. "Nada mudou" =
  bater com ela.
- **D-005 — Testes existentes: só import/mock de caminho** (FR-007);
  contratos travados intocados (FR-006).
- **D-006 — Pastas**: módulos do player em `components/player/` (pasta nova);
  da Live em `features/live/` (ao lado dos que já existem, `guide/` fica).
- **D-007 — Bugs pequenos por sub-agente** (decisão do usuário, §4 da
  lógica): depois de a fase do módulo fechar, um sub-agente por bug, teste de
  regressão primeiro, commit e registro (`R-00X`) separados da movimentação.
- **D-008 — Pré-condição de árvore limpa.** A execução começa com o trabalho
  anterior (item 63 + feature 036) já commitado — o diff da 040 precisa ser só
  dela, para o SC-002 ser verificável e a reversão possível.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Não se aplica. |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | Nenhum log novo; o fluxo de `fetchPlayback`/erro sanitizado só muda de arquivo. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Não se aplica. |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Não se aplica. |
| Comandos Locais Independem de Rede, Backend ou IA | ✅ | ✅ | Não se aplica. |
| Trailers e Metadados Não Alteram o Estado Principal | ✅ | ✅ | Não se aplica. |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | ✅ | ✅ | Teclado continua um registro só (D-003); provado pelas travas 024/027/031 e E2E. |
| Lista de Catálogo ≠ Manifesto | ✅ | ✅ | Não se aplica. |
| Foco Visível e Sem Becos Sem Saída | ⚠️ | ✅ | Pré: mover estado de foco entre módulos pode criar um instante sem foco. Pós: refs/ordem de efeitos preservados (D-003) e as travas de foco (024, 027, 031) seguem como prova. |
| Voltar Restaura Foco e Posição | ✅ | ✅ | `renderColumns`/`withShell` continuam funções (sem fronteira nova que remonte e perca scroll). |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | `computeIdentity`/gravador só mudam de arquivo. |
| Progresso e Capacidades São Reais | ✅ | ✅ | `chromeControls`/capacidades intactos. |
| Documentação É Canônica | ✅ | ✅ | Polish atualiza `CLAUDE.md` (onde vivem player e Live agora) e o item 49a do backlog. |

Nenhuma violação a justificar.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/040-dividir-player-live/
├── spec.md
├── plan.md
├── logic/divisao.md      # regras de movimentação + mapa de módulos + bugs por sub-agente
├── quickstart.md
├── tasks.md
├── baseline.md           # criado pelo sdd-execute na Fase 1 (D-004)
└── handoff.md
```

### Source Code (repository root)

```text
tv-web/src/
├── components/
│   ├── PlayerLayer.tsx              # fica: composição + JSX, reexporta a API pública
│   ├── player/                      # NOVA (D-006)
│   │   ├── playerLayerTypes.ts
│   │   ├── playerMessages.ts
│   │   ├── usePlayerChrome.ts
│   │   ├── usePlayerPanels.ts       # + usePanelRefresh
│   │   ├── usePlayerSession.ts      # + efeitos de plano/reagendar/proteção de tela
│   │   └── usePlayerKeyboard.ts
│   ├── PlayerChrome.tsx, chromeControls.ts, playerPanels.ts,
│   │   PlayerInfoPanel.tsx, PlayerTracksPanel.tsx, SubtitleOverlay.tsx   # já existem, não mudam
│   └── PlayerLayer*.test.tsx        # 10 arquivos (4 travados: 020, 027, 029, 031) — só import, se precisar
├── features/live/
│   ├── LiveScreen.tsx               # fica: composição + JSX de topo
│   ├── liveTrail.ts                 # NOVO
│   ├── useLiveCatalog.ts            # NOVO
│   ├── useLiveSearch.ts             # NOVO
│   ├── useLiveZapping.ts            # NOVO
│   ├── useLiveGuide.ts              # NOVO
│   ├── useLiveKeyboard.ts           # NOVO
│   ├── liveColumns.tsx              # NOVO (funções de render)
│   ├── channelNumber.ts, groupChannels.ts, guide/*   # já existem, não mudam
│   └── LiveScreen*.test.tsx         # 8 arquivos (4 travados: 018, 024, 030, 031) — só import, se precisar
└── (consumidores do PlayerLayer: MovieDetailScreen, SeriesDetailScreen, HomeScreen, App.tsx — não mudam, FR-010)
```

**Structure Decision**: mapa de `logic/divisao.md` §2/§3. Nomes são proposta;
as responsabilidades (FR-003/FR-004) e as regras §1 são travadas.

## Complexity Tracking

Nenhuma violação.

## Estratégia de Testes

Prioridade: a automação **existente** é a prova (unitário + 8 contratos travados de
contrato + E2E), comparada com a linha de base (D-004). Testes novos só para
os bugs da US3 (um de regressão por bug).

Comandos-base (em `tv-web/`):

```powershell
npx vitest run src/components/PlayerLayer*.test.tsx       # área do player
npx vitest run src/features/live                          # área da Live
npx vitest run                                            # suíte inteira (comparar com baseline.md)
npx tsc -b --noEmit
npx oxlint
npm run build:tizen
npm run test:e2e        # com npm run dev recém-iniciado; comparar contagem de ✓ com baseline.md
```

Integridade (na raiz) — as travas que montam os dois componentes:

```powershell
foreach ($s in '018-busca-por-categoria','020-ciclo-vida-player','024-live-tv-ds-v14','026-home-busca-configuracoes-ds-v14','027-player-chrome-ds-v14','029-audio-legendas-info-player','030-epg-dados-agora','031-epg-guia-completo') { .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug $s }
```

Prova de SC-002 (nenhuma asserção mudou), na raiz, depois da movimentação —
só podem aparecer linhas de `import`/`vi.mock`/`} from`:

```powershell
git diff -U0 -- 'tv-web/src/*.test.ts' 'tv-web/src/*.test.tsx' | Select-String '^[+-][^+-]' | Where-Object { $_.Line -notmatch '^[+-]\s*(import\b|vi\.mock\(|\}\s*from\b|$)' }
```

### Testes de Contrato

**Nenhum novo — por decisão.** A definição executável de "pronto" já existe:
8 arquivos de contrato travados de outras features montam `PlayerLayer` e
`LiveScreen` pela interface pública (018, 020, 024, 027, 029, 030, 031 — dois na 031; a 026 importa `PlayerLayer` para mocká-lo),
e esta feature exige que todos continuem verdes **sem edição** (FR-006). Um
contrato novo que provasse a divisão teria de amarrar nomes de arquivo/hook
internos (o que a regra do passo 7.5 proíbe), e um que provasse
comportamento duplicaria as travas existentes. A estrutura (SC-003) é
conferida por lista na convergência, contra `logic/divisao.md` §2/§3.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Linha de base | Pronta — `baseline.md` (suíte 2028/2034, lint 13 avisos, build idêntico, E2E 624 ✓ por roteiro) |
| US1 player | Pronto — `PlayerLayer.tsx` 205 linhas, 6 módulos em `components/player/`; testes, travas e E2E iguais à linha de base; lint com +32 avisos (R-006) |
| US2 Live | Pronto — `LiveScreen.tsx` 350 linhas, 7 módulos; testes, travas e E2E iguais à linha de base |
| US3 bugs | 1 achado corrigido por sub-agente, com teste de regressão (R-008) |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Corrida de closure/ref reintroduzida ao mover handlers do teclado ou o efeito da sessão (classe de bug já vista na 027: 11 testes de zapping pegaram). | Alto — ação errada numa tecla rápida, só com timing real. | §1.1/§1.2 da lógica; as travas 027/024/031 e os testes de zapping de `LiveScreen.test.tsx` como prova; passada na TV recomendada (quickstart). |
| R-002 | Flakes conhecidos sob paralelismo (`*.favorites.test.tsx`, `LiveScreen.test.tsx`) confundidos com regressão, ou o contrário. | Médio — falso alarme ou regressão escondida. | Linha de base (D-004) com a lista de falhas; qualquer falha nova é rodada isolada 3× antes de virar veredito, e registrada como pendência se oscilar (regra do `sdd-execute`). |
| R-003 | Converter `renderColumns`/`withShell` em componente mudaria reconciliação (remontagem, refs de DOM, scroll). | Médio — perda de foco/posição ao voltar. | §1.4: continuam funções. |
| R-004 | Sub-agente corrigindo bug no mesmo arquivo que o principal está movendo. | Médio — conflito/edição perdida. | §4.3: só depois de a fase do módulo fechar; o principal não edita aquele arquivo em paralelo. |
| R-006 | Depois da divisão, `npx oxlint` passou de 13 para 45 avisos: 32 `react(refs): Cannot access refs during render` no novo `PlayerLayer.tsx`. São as **mesmas** leituras de `sessionRef.current`/`panelRef.current`/refs do chrome durante o render que sempre existiram (desenho da 027 — os refs são a fonte da verdade do chrome); a versão do `HEAD` do arquivo, analisada isolada, dá **0** avisos `refs` — o analisador desistia do componente grande e agora o enxerga. Zero erros; nenhum padrão novo de código. | Baixo — ruído de lint, mas a FR-008 pede o lint "no mesmo estado". | Resolvido (2026-10-01): o usuário escolheu **aceitar** — a linha de base do lint passa a 45 avisos (0 erros), sem supressão; o aviso fica visível de propósito para quem mexer nessas leituras deliberadas. Nunca trocar ref por estado para calá-lo (§1.1). |
| R-007 | O mapa de `logic/divisao.md` §3 tinha um módulo por responsabilidade, mas a ordem dos efeitos (§1.2) exigiu granularidade maior na Live: o efeito de foco do campo de busca fica **entre** os da trilha e os da lista, e `playing` (zapping) entra na leitura de EPG da lista. | Baixo — mesmas responsabilidades, mais hooks. | Resolvido: `useLiveCatalog.ts` exporta `useLiveTrail` + `useLiveChannels`; zapping e guia ganharam um hook de **estado** chamado no topo (`useLiveZappingState`, `useLiveGuideState`) e outro de **comportamento** na posição dos efeitos deles. A regra (§1) não mudou. |
| R-008 | Bug pequeno revelado pela divisão (US3): o `<Toast>` da vista principal da Live não recebia `messageKey` — com a região de anúncio (021, D-004), avisos idênticos seguidos não eram reanunciados. Anterior à 040. | Baixo — acessibilidade (leitor de tela). | Resolvido: corrigido por sub-agente (decisão do usuário) com teste de regressão `LiveScreen.toast-repetido.test.tsx`, conferido pelo principal (vermelho com o código antigo, verde com a correção). |
| R-005 | Árvore com trabalho não commitado (item 63 + 036) misturaria diffs. | Médio — SC-002 inverificável. | D-008: T001 confirma a árvore limpa e pede o commit ao usuário se não estiver. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-01 | Fase 1 (linha de base) | Commits do 63/036 e da doc da 040 feitos a pedido do usuário; `baseline.md` gravado (E2E por roteiro: 21/21, 624 ✓); travas íntegras. Módulos do player adiantados sem ligar. | Teste instável da 036 (`SettingsScreen.privacidade`) aguardando decisão do usuário |
| 2026-10-01 | Fase 1 → 2 | Usuário pediu corrigir o teste instável da 036 (só no teste: `IDB_WAIT = { timeout: 5000 }`, commit `83efcac`, fora da 040) e seguir em modo contínuo. SC-002 passa a ser medido a partir de `83efcac`. | — |
| 2026-10-01 | Fase 2 (US1 player) | `PlayerLayer.tsx` 1151 → 205 linhas; 6 módulos em `components/player/`; 294/294 + 402/402 na 1ª tentativa; travas íntegras; E2E do player iguais à linha de base; SC-002 vazio. Lint 13 → 45 avisos (R-006). | R-006 com o usuário |
| 2026-10-01 | Fase 3 (US2 Live) | `LiveScreen.tsx` 1491 → 350 linhas; 7 módulos; 177/177 + 37/37 na 1ª tentativa; travas íntegras; 6 E2E da Live iguais à linha de base; SC-002 vazio. Granularidade ajustada (R-007). Achado: Toast sem `messageKey`. | Fase 4 (sub-agente) |
| 2026-10-01 | Fase 4 + Polish | Toast da Live corrigido por sub-agente (R-008), conferido pelo principal (vermelho no código antigo, verde no novo). Polish: suíte 2030/2035 (só a 034), 23 travas íntegras, SC-002 vazio, consumidores intactos (A1), build com os mesmos 13 arquivos, E2E por roteiro **idêntico** à linha de base (21/21, 624 ✓). Lint 45 avisos (R-006). Docs: `CLAUDE.md` (status + onde vive o player/Live) e backlog. | TV recomendada |

**PRÓXIMO**: `sdd-converge 040-dividir-player-live`. TV física recomendada (R-001).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/components/PlayerLayer.tsx` — composição do player (205 linhas)
- `tv-web/src/components/player/` — sessão, chrome, painéis, teclado, tipos e mensagens
- `tv-web/src/features/live/LiveScreen.tsx` — composição da Live (350 linhas)
- `tv-web/src/features/live/` — `liveTrail.ts`, `useLiveCatalog.ts`, `useLiveSearch.ts`, `useLiveZapping.ts`, `useLiveGuide.ts`, `useLiveKeyboard.ts`, `liveColumns.tsx`, `LiveScreen.toast-repetido.test.tsx`
- `sdd/specs/040-dividir-player-live/baseline.md` — o "antes"

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- **E2E por roteiro**, não encadeado: o `npm run test:e2e` encadeado já parou uma vez por `ERR_CONNECTION_REFUSED` passageiro do dev server. Para comparar com `baseline.md`, rode cada roteiro da lista de `package.json` isoladamente e conte `  ✓`/`✗` do log.
- Script `.ps1` com `✓`/acentos precisa de **UTF-8 com BOM** no PowerShell 5.1 — sem BOM o `Select-String '✓'` conta zero (achado ao medir a linha de base).
- `git commit -F -` com here-string não funciona no PowerShell 5.1 (vira argumento): escreva a mensagem num arquivo e use `git commit -F <arquivo>`.
