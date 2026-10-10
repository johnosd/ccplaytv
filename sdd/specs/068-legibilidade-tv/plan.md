# Implementation Plan: Legibilidade para TV — letra maior no app e TV ao vivo em coluna única

**Slug**: `068-legibilidade-tv` | **Date**: 2026-10-10 | **Spec**: `sdd/specs/068-legibilidade-tv/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Subir a escala tipográfica do app inteiro um degrau (mínimo 16→20, padrão 20→24, texto grande 24→28, seção 28→32, título 40→48; destaque 64) pelos tokens `--fs-*` que já são o único botão de escala (`styles/font-scale.css` + `index.css`), trocar os poucos `font:` com px fixo por tokens, e acompanhar a letra maior onde há altura fixa em CSS ou em JS (listas virtualizadas, paginação), guiado por uma auditoria E2E que mede tamanho mínimo e texto vazando em todas as telas. Na TV ao vivo, tirar a topbar e o bloco de título e mostrar uma coluna só — trilha **ou** canais — reaproveitando o modelo de duas camadas que a Live já tem (OK entra, RETURN volta à categoria por identidade, RETURN volta ao Início). A escala nova alinha o app à ADR-007 §7, que já pedia 40–48/28–32/24–28.

## Technical Context

**Language/Version**: TypeScript 5 + React 19 (Vite 8, build `chrome108`), CSS com tokens do Design System V14

**Primary Dependencies**: `@tanstack/react-virtual` (listas virtualizadas com altura estimada), `useRemoteNav` próprio (ADR-009), catálogo i18n próprio (pt/en/es)

**Storage**: N/A (nenhum dado novo)

**Testing**: Vitest (`dom`/jsdom e `node`); E2E Playwright `tv-web/e2e/*.mjs` (`npm run test:e2e`) — inclusive um roteiro novo de auditoria de legibilidade

**Target Platform**: Samsung Tizen TV (Chromium 120, palco 1920×1080 escalado), validação final de longe na TV física (gate)

**Performance Goals**: sem regressão de rolagem/zapping; a rolagem do nome no foco é uma animação por vez, em `transform` (ADR-007 §8)

**Constraints**: tokens, nunca valor literal novo (CLAUDE.md, ADR-007 §1); contratos travados de várias features consultam classes da Live — as três colunas ficam no DOM; tetos de linhas (`LiveScreen.tsx` 349/349, `liveColumns.tsx` 510/511); textos em pt/en/es

**Scale/Scope**: ~262 usos de `--fs-*` em `tv-web/src/styles/*.css` e `index.css`; ~10 telas principais

## Decisões Invariantes

- **D-001** — A escala muda **nos tokens**, em `index.css` (base) e `styles/font-scale.css` (efetivo), com `--font-scale: 1`: display 64, h1 48, h2 32, body-lg 28, body 24, caption 20 (`logic/escala-e-auditoria.md` §1). Não usar a escala uniforme (`--font-scale` ≠ 1): os degraus não são proporcionais.
- **D-002** — Nenhuma declaração de fonte com px literal abaixo de 20; os `font:` com px fixo viram o token do papel (`logic/escala-e-auditoria.md` §2).
- **D-003** — Metadados auxiliares (programa "Agora", ano, duração, gênero) usam `--fs-body` (24); `--fs-caption` (20) só para micro (contagens, horários, selos) — ADR-007 §7 pede 24–28 para metadado.
- **D-004** — Ícones e capas mantêm o tamanho (FR-006); só caixas que contêm texto crescem.
- **D-005** — Nome longo: reticências fora de foco; rolagem horizontal só no item focado, sem mudar a altura da linha; com "Reduzir movimento", sem animação (`logic/escala-e-auditoria.md` §4).
- **D-006** — `LIVE_ITEM_ROW_HEIGHT` = **108** (linha de canal 96 px + 12 de espaço); o contrato da 049 é emendado para `PAGE = 5` (`contract-amendments/`).
- **D-007** — TV ao vivo: as três colunas continuam no DOM; `.live-body[data-live-view]` diz qual lista aparece e o CSS esconde a outra; as regras de teclado não mudam (`logic/live-coluna-unica.md` §1–§2).
- **D-008** — O `App` deixa de passar `shell` à Live; a prop `shell` continua no tipo (contrato da 024). A Live usa `AppShell` com `topBar={null}` e as mesmas dicas (precedente da grade de Filmes/Séries).
- **D-009** — "Gerenciar categorias" sem topbar via `onManageCategories` (stub), com o mesmo destino de antes (tela da lista ativa, aba Categorias).
- **D-010** — A contagem de canais vai para o cabeçalho da lista de canais com a chave existente `live.channelCount`; sem chave nova.
- **D-011** — Contrato travado emendado só pelo texto de `contract-amendments/`, aplicado verbatim na Fase 1, e a trava da 049 regravada com os 3 arquivos dela.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | N/A | N/A | — |
| Segredos Fora dos Clientes e dos Logs | N/A | N/A | Só visual; o roteiro de auditoria usa lista fictícia. |
| Categorias da Fonte São Preservadas | OK | OK | Nomes e ordem intactos; nome longo só rola no foco, nunca é reescrito. |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | — |
| Comandos Locais Independem de Rede | OK | OK | — |
| Trailers e Metadados Não Alteram o Estado Principal | N/A | N/A | — |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | Atenção | OK | Sem topbar na Live, a saída é RETURN → Início (spec); "Gerenciar categorias" preservado por D-009 (contrato #4). |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | Atenção | OK | Caixas crescem com o texto e o anel de foco fica inteiro (FR-004, auditoria); coluna escondida nunca tem foco (o modelo de colunas não muda). |
| Voltar Restaura Foco e Posição | Atenção | OK | RETURN dos canais volta à categoria por identidade (contrato #3); a paginação muda de tamanho mas segue a mesma regra (049 emendado). |
| Identidade de Reprodução Não Depende da URL | N/A | N/A | — |
| Progresso e Capacidades São Reais | N/A | N/A | — |
| Documentação do Repositório É Canônica | Atenção | OK | Spec V14 §6 recebe nota de emenda alinhando à ADR-007 §7 (Polish); `CLAUDE.md` com uma linha sobre a escala. |

Sem violação não justificável. A escala nova **cumpre** a ADR-007 §7 (antes o código estava abaixo dela); não há ADR a emendar.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/068-legibilidade-tv/
├── spec.md
├── plan.md
├── logic/
│   ├── escala-e-auditoria.md     # tokens, literais, alturas em JS, nomes longos, auditoria E2E
│   └── live-coluna-unica.md      # data-live-view, sem shell, AppShell sem topbar, Gerenciar, tetos
├── contract-amendments/          # contrato da 049 emendado (PAGE = 5)
├── quickstart.md
├── tasks.md
├── handoff.md
└── contract-tests.lock
```

### Source Code (repository root)

```text
tv-web/src/
├── index.css                         # tokens base --fs-* (+ font: literal 18px na raiz)
├── styles/
│   ├── font-scale.css                # tokens efetivos --fs-* (o "botão" de escala)
│   ├── tokens.test.ts                # confere os tokens base (atualizar)
│   ├── escala.legibilidade-tv.contract.test.ts   # contrato 068 (#1, #2)
│   ├── player.css, shared.css        # font: com px fixo (15/16/18/20/28/34)
│   ├── live.css                      # linha de canal, trilha, coluna única
│   └── vod.css, home.css, settings.css, components.css, …
├── App.tsx                           # case 'live': sem shell, com onManageCategories
├── features/live/
│   ├── LiveScreen.tsx                # sem .live-header; data-live-view; AppShell sem topbar (teto 349)
│   ├── liveColumns.tsx               # cabeçalho da lista de canais com a contagem (teto 511)
│   ├── liveTrail.ts                  # LIVE_ITEM_ROW_HEIGHT 84 → 108
│   ├── useLiveKeyboard.ts            # sem mudança de regra
│   ├── guide/EpgGuide.tsx            # GUIDE_ROW_HEIGHT (medir)
│   └── LiveScreen.legibilidade-tv.contract.test.tsx  # contrato 068 (#3, #4)
├── features/series/SeriesDetailScreen.tsx   # EPISODE_ROW_HEIGHT (medir)
├── features/search/SearchScreen.tsx, features/person/PersonScreen.tsx   # CARD_HEIGHT (medir)
├── features/home/homeRowFormats.ts   # formatos da Início (medir)
├── lib/focus/paging.ts               # TRAIL_ROW_PITCH_FALLBACK (acompanhar)
└── lib/i18n/messages/*.ts            # sem chave nova prevista
tv-web/e2e/legibilidade-tv.mjs        # NOVO: auditoria de tamanho mínimo e texto vazando
docs/design/design-system/CCPlayTV_Design_System_Spec_v14_Spectrum.md   # §6: nota de emenda
```

**Structure Decision**: frontend único `tv-web/src/`. A escala é CSS central (tokens); a US2 mexe só na apresentação da Live (`features/live/`) e no `App.tsx`.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Emendar um contrato travado da 049 (`LiveScreen.navegacao-por-pagina`, `PAGE` 7 → 5 e um passo a mais) | A linha de canal precisa crescer para caber a letra maior; a paginação é derivada da altura | Manter 84 px: o nome a 28 px + programa a 24 px + grupo a 20 px não cabe (medido em 2026-10-10); o usuário autorizou emendar os contratos de altura |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (em `tv-web/`):

```bash
npx tsc -b
npm run lint
npx vitest run <arquivo-ou-pasta>
npm run test
npm run build
npm run build:tizen
npm run dev                         # outro terminal, antes do E2E
npm run test:e2e -- --only <nomes>  # durante as fases
npm run test:e2e                    # gate final
node e2e/legibilidade-tv.mjs        # auditoria de legibilidade
```

Travas (raiz, PowerShell): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 068-legibilidade-tv` e `-Slug 049-navegacao-por-pagina`.

### Testes de Contrato

Arquivos travados em `contract-tests.lock` (4/5):

- `tv-web/src/styles/escala.legibilidade-tv.contract.test.ts` (2)
- `tv-web/src/features/live/LiveScreen.legibilidade-tv.contract.test.tsx` (2)

Comando (em `tv-web/`):

```bash
npx vitest run src/styles/escala.legibilidade-tv.contract.test.ts src/features/live/LiveScreen.legibilidade-tv.contract.test.tsx
```

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `os tokens de texto valem 64/48/32/28/24/20 px, na base e na escala efetiva` | FR-001, US1/AC1 | Fase 2 | `AssertionError` (`--fs-h1` base 40 ≠ 48) |
| `nenhum font-size/font com tamanho literal abaixo de 20 px` | FR-002, SC-001 | Fase 2 | `AssertionError` (lista de linhas em `player.css`, `shared.css`, `index.css`) |
| `sem topbar nem título; coluna única: categorias → OK → canais (com "N canais") → RETURN → mesma categoria → RETURN → Início` | US2/AC1..AC4, FR-008..FR-011, Constitution: Voltar Restaura Foco | Fase 3 | `AssertionError` (`.live-header` existe) |
| `sem topbar, o vazio "todas escondidas" mantém "Gerenciar categorias" focado e o OK chega a onManageCategories` | FR-013, D-010 da 067, Constitution: Toda Ação Essencial por Controle | Fase 3 | botão "Gerenciar categorias" não encontrado |

Confirmado em 2026-10-10: os 4 falham por asserção; `npx tsc -b` limpo; `npm run lint` ok; `npx vitest run src/features/live src/styles` → só os 4 vermelhos (301 verdes).

**Contrato emendado de outra feature** (D-011, aplicar na Fase 1): `tv-web/src/features/live/LiveScreen.navegacao-por-pagina.contract.test.tsx` (049) — `PAGE = 5 // floor(640 / 108)` e um passo a mais até a última página. Texto exato em `contract-amendments/`; **conferido em 2026-10-10**: com `LIVE_ITEM_ROW_HEIGHT = 108` passa 3/3 (rodado numa cópia temporária, código restaurado para 84).

Stubs criados pelo plan (não travados): prop `onManageCategories?: () => void` em `tv-web/src/features/live/LiveScreen.tsx` (ainda sem efeito; a linha do `shell` virou comentário em linha para caber no teto).

Fora dos contratos: nomes longos no foco (CSS/animação) e "nada vaza" vão para o E2E `legibilidade-tv.mjs`; a leitura de longe é o gate na TV (quickstart).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 — emenda 049 + linha de base | Concluída: contrato da 049 emendado e travado (5/5); auditoria de base 22 telas → 163 textos < 20 px, 0 vazando |
| Fase 2 — US1 escala | Concluída: tokens novos, literais trocados, alturas ajustadas, `MarqueeText`; auditoria 66 telas pt/en/es → 0 achados; 14 E2E fora da Live verdes |
| Fase 3 — US2 Live | Concluída: Live sem topbar/título, lista única e gestão da lista ativa; 224 testes da Live, 5 do App e 8 E2E verdes |
| Fase 4 — Polish | Parcial: documentação, capturas/quickstart, lint e builds aprovados; auditoria renovada 69 telas sem achados. T035 concluída e pacote instalado na TV em 2026-10-10. T032 e aprovação visual global SC-005 continuam abertos |
| Ajuste de categorias VOD (T035) | Somente lateral: 576 px expandida, iniciais/∞ e linhas como a Live; recolhimento automático de 96 px preservado. Concluído: 185 testes em 43 arquivos, lint e build:tizen verdes; travas 052/053 íntegras. Auditoria renovada 69 telas sem achados; carrosséis verdes e vitrine revalidada após ler só o rótulo, sem incluir o tile decorativo. Capturas expandida/recolhida inspecionadas. Gate geral T032 segue aberto |
| Gates completos | Vitest completo anterior ao ajuste 3187/3187 (533 arquivos); após T035, VOD 185/185 (43 arquivos), lint e build:tizen verdes, travas 068/052/053 íntegras (049 já conferida). Nova suíte completa: 44/46 em 1075 s; vitrine corrigida e revalidada depois, falha inicial MPEG-TS permanece. Instalação/lançamento confirmados pelo CLI; leitura de longe aguarda usuário |
| Contratos | 068 escala 2/2 verdes na Fase 2, Live 2/2 verdes nesta retomada; 049 emendado 3/3 verde; travas 068 e 049 íntegras |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | A linha de canal maior quebra o contrato travado da 049 (`PAGE = floor(640/84) = 7`) | Alto — suíte vermelha | Decisão do usuário (entrevista da spec, "emendar os contratos"): aplicar `contract-amendments/` na Fase 1 e regravar a trava da 049 com os 3 arquivos (`paging…`, `LiveScreen…`, `VodCategoryScreen…`). |
| R-002 | Texto maior vaza ou é cortado em caixas de altura fixa espalhadas pelo CSS (cards, abas, chips, linhas, teclado na tela, modais) | Alto — legibilidade pior que antes em algumas telas | Auditoria `e2e/legibilidade-tv.mjs` (`logic/escala-e-auditoria.md` §5) rodada desde o começo da Fase 2 e repetida até zerar; capturas antes/depois. |
| R-003 | Constantes de altura em JS (listas virtualizadas, paginação) dessincronizadas do CSS | Médio — rolagem/paginação erradas | Tabela de `logic/escala-e-auditoria.md` §3; E2E de paginação/memória de foco no gate. |
| R-004 | Tetos de linhas: `LiveScreen.tsx` 349/349, `liveColumns.tsx` 510/511 | Médio — lint reprova | Tirar o `.live-header` e o `shell` libera linhas; compensar no próprio arquivo; subir teto só como último recurso, com justificativa. |
| R-005 | Rolagem do nome no foco (marquee) pesar no hardware da TV | Médio | Uma animação por vez, em `transform`, só no foco, depois de ~1 s; desligada com "Reduzir movimento" (ADR-007 §8). |
| R-006 | Menos itens por tela (fileiras, paginação) mudam números de testes não travados e roteiros E2E (ex.: `HOME_CHANNELS_VISIBLE`, contagens por página) | Médio | Ajustar os testes não travados mantendo a intenção; E2E listados em `logic/live-coluna-unica.md` §5 e os da Início/Filmes. |
| R-007 | A Spec V14 §6 diz "16 px é o mínimo" — contradiz a escala nova | Baixo | Resolvido: nota de emenda em §6 registra a escala 64/48/32/28/24/20, mínimo 20 e padrão 24, com precedência sobre os valores antigos de §6 e §2.1; alinhada à ADR-007 §7. |
| R-008 | Inglês/espanhol mais longos que português | Baixo | A auditoria roda nos 3 idiomas. |
| R-009 | A auditoria acusava "texto vazando" em nomes com reticências: o `Range` devolve também as linhas escondidas por `line-clamp`, e a caixa do glifo (ascendente + descendente) passa da linha de 1.2 | Baixo — falso positivo | Decisão (Fase 2): ignorar linha inteira fora do recorte de um ancestral com `overflow` e dar folga de 20% da altura do glifo; linha cortada pela metade continua achado. Conferido nas capturas. |
| R-010 | Linha de episódio (título 28 + meta 24 + sinopse de 3 linhas de 24 + progresso) passa dos 196px e as linhas virtualizadas se sobrepõem | Médio | Resolvido: sinopse em 2 linhas e `EPISODE_ROW_HEIGHT` 220 (Fase 2). |
| R-011 | Roteiro `performance-navegacao` (065) usa `browser.newContext()` sem locale; o helper procura Lista M3U em português, mas o Chromium padrão abre en-US e mostra M3U list | Médio — impede gate E2E antes de medir navegação | Resolvido no roteiro: usuário autorizou em 2026-10-10; aplicado `locale: 'pt-BR'` apenas no contexto do teste, revalidado com sucesso (45,3 s). Gate completo ainda depende de R-012 e nova suíte. |
| R-012 | `player-dev-mpegts` não confirmou início em 15 s; demais verificações do roteiro passaram | Médio — gate E2E aberto | Repetiu na nova suíte completa (161,2 s de roteiro; início não confirmado em 15 s), além da reprodução em série anterior. Dez trocas, encerramento e reconexão verdes. Causa indeterminada; nenhum timeout afrouxado nem player alterado. Usuário restringiu o ajuste às categorias e pediu instalação na TV: instalada para validação visual, sem declarar T032/Fase 4 concluídos. |
| R-013 | Interpretação intermediária de aplicar categorias → lista de títulos em Filmes/Séries | Resolvido — usuário esclareceu que só a lista de categorias muda | Resolvido: em 2026-10-10 o usuário restringiu o pedido ao visual da lateral. Preservar pôsteres/fileiras, grade, navegação e recolhimento automático; proposta `contract-amendments/vod-lista-titulos.md` descartada, sem emendar contratos nem regravar travas. T035 cobre apenas largura expandida, linhas e iniciais da lateral. Instalação na TV solicitada após o ajuste. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-10 | Fase 1 | Emenda da 049 aplicada e travada; R-068 no plan da 049; roteiro `e2e/legibilidade-tv.mjs` + fixture criados e no `SUITE`; base em `evidencias/antes/` (22 imagens + `auditoria.txt`) | Contrato 049 da Live vermelho até a T010 |
| 2026-10-10 | Fase 2 (US1) | Escala 64/48/32/28/24/20 nos tokens; 36 literais e 33 rótulos/metadados por papel; linha de canal 96/108; `MarqueeText` (canal, trilha, episódio, canal favorito) e título inteiro no card focado; guia, busca/pessoa (410), episódio (220), trilha das Configurações (384/480). Auditoria 0 achados em pt/en/es; `npm run test` 3184 verdes + 2 contratos da US2; 14 E2E verdes | E2E da Live depois da Fase 3; chrome do player em reprodução só no quickstart/TV |
| 2026-10-10 | Fase 3 (US2) | Retomada em T026: ajustes E2E existentes revisados e validados (8/8); novo teste de integração em `App.test.tsx` verifica Live sem topbar, gestão da lista ativa em Categorias e retorno Live → Início. Live 224/224, App 5/5, travas 068/049 íntegras, lint e `npx tsc -b` sem erros | Fase 4: gates completos, quickstart e aprovação de longe na TV (SC-005) |
| 2026-10-10 | Fase 4 (parcial) | Emenda V14 e regra permanente; 23 capturas, auditoria/quickstart em 69 telas pt/en/es sem achados; Vitest 3187/3187 (533 arquivos), lint e builds verdes. Primeira suíte E2E 44/46; locale corrigido com autorização. Revalidação em série 2/3: navegação e SELECT em gestão verdes, falha inicial do player reproduzida | Decisão sobre investigar/corrigir R-012; repetir suíte completa antes da TV; SC-005 pendente |
| 2026-10-10 | Fase 4 — T035 (parcial) | Usuário esclareceu: só a lista de categorias de Filmes/Séries muda. Pôsteres/fileiras, grade e navegação preservados. Lateral de 576 px expandida com iniciais e linhas da Live; faixa recolhida de 96 px mantida. VOD 185/185, lint e build:tizen verdes; travas 052/053 íntegras, nenhum contrato emendado | E2E completo em andamento; instalação na TV solicitada após ajuste; aprovação visual pendente |
| 2026-10-10 | Fase 4 — T035 + TV | Ajuste só da lateral concluído: VOD 185/185, auditoria 69 telas sem achados, lint/build:tizen verdes, carrosséis verdes e vitrine revalidada após corrigir seletor do rótulo. Suíte completa 44/46 em 1075 s: falha MPEG-TS mantida aberta; falha da vitrine resolvida na revalidação. Instalado e lançado na QN50Q60DAGXZD (192.168.0.2), mesmo certificado, sem desinstalação; CLI e applist confirmados em `evidencias/fase4-vod-deploy-tv.txt` | Retorno visual do usuário; T032/R-012 e SC-005 globais pendentes |
| 2026-10-10 | T035 — aprovação na TV | Usuário confirmou: "Categorias e recolhimento aprovados", em resposta à pergunta sobre leitura de longe e recolher/expandir a lateral de Filmes/Séries na TV física. Ajuste visual aprovado; nenhum código alterado nesta confirmação | T032/R-012 e aprovação global das demais telas do SC-005 permanecem pendentes |

**PRÓXIMO**: T032 — falha inicial MPEG-TS ainda aberta (R-012). Categorias e recolhimento de Filmes/Séries aprovados pelo usuário na TV; SC-005 global exige aprovação das demais telas, sem inferi-la desta confirmação.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/features/vod/VodShowcaseScreen.tsx` e `tv-web/src/styles/vod.css` (somente a lateral de categorias nesta etapa)
- `tv-web/src/App.tsx` e `App.test.tsx` (Live sem topbar e gestão da lista ativa)
- `tv-web/src/features/live/LiveScreen.tsx`, `liveColumns.tsx` e `tv-web/src/styles/live.css` (coluna única)
- `tv-web/e2e/legibilidade-tv.mjs`, `configuracoes-lista-global.mjs` e `performance-navegacao.mjs` (auditoria, quickstart e desvios revalidados)
- `tv-web/e2e/player-dev-mpegts.mjs` (falha reproduzida, causa pendente)
- `docs/design/design-system/CCPlayTV_Design_System_Spec_v14_Spectrum.md`, `CLAUDE.md`, `quickstart.md` e `evidencias/` (Fase 4)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- A auditoria troca o idioma pelo `localStorage` (`ccplaytv:app-language`) e abre as abas de Configurações por **clique** (o painel só troca ao entrar; seta na trilha não troca). Player é medido só dentro de `[role="dialog"]`.
- Rodar a auditoria com Bash (`node e2e/legibilidade-tv.mjs --langs pt --relatorio`); `--relatorio` não falha, sem ele sai 1 com achado.
- Vários CSS daqui são CRLF: troca de várias linhas por PowerShell `.Replace` com `` `n `` falha calada — use o Edit ou Node com o `\r\n` detectado. E no Bash, texto com crases dentro de `node -e "…"` vira substituição de comando.
- O nome de canal/categoria/episódio fica num `.marquee-inner` dentro do elemento antigo: `textContent` não muda, mas `getByText(…, { selector: '.x' })` precisa de `'.x .marquee-inner'`.
