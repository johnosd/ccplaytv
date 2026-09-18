# Implementation Plan: Live TV com catálogo real e reprodução AVPlay

**Slug**: `003-live-tv-avplay` | **Date**: 2026-09-16 | **Spec**: `sdd/specs/003-live-tv-avplay/spec.md`

## Summary

Fatia vertical que liga a tela de Live TV ao catálogo realmente importado e
faz um canal tocar na TV através de uma abstração `PlayerService` sobre o
AVPlay.

A abordagem técnica tem quatro peças: (1) um endpoint dedicado
`GET /catalog-items/{id}/playback`, para a URL de reprodução — que carrega
credencial — nunca aparecer em listagem de catálogo; (2) um campo booleano
`playable` na listagem, para a lista sinalizar canal indisponível sem expor
segredo; (3) um `PlayerService` com máquina de estados própria e dois
adaptadores (AVPlay na TV, `<video>` no navegador); (4) o player como camada
sobreposta dentro da `LiveScreen`, não como tela do roteador, para o estado de
foco sobreviver sem mexer no histórico de navegação.

Objetivo secundário e deliberado: executar a porta de validação **V1** da
ADR-006, hoje registrada como "não executado na TV".

## Technical Context

**Language/Version**: Python 3.13 (backend, `requires-python = ">=3.13"`);
TypeScript ~6.0 + React 19 (frontend).

**Primary Dependencies**: backend — FastAPI, SQLAlchemy 2 (async), Pydantic,
Alembic, psycopg 3, httpx. Frontend — Vite 8, TanStack Query 5, sem
bibliotecas de UI. **Nenhuma dependência nova é introduzida por esta
feature.**

**Storage**: PostgreSQL (backend). No cliente, **nada é persistido** — o
estado vive em memória do processo. IndexedDB/Dexie é o item 4 do backlog e
está fora desta feature (ver `## Decisões Invariantes`, D-004).

**Testing**: `pytest` + `pytest-asyncio` (`asyncio_mode = auto`) no backend,
com `httpx.ASGITransport` contra o app real — exige Postgres de pé. `vitest`
+ Testing Library + jsdom no frontend. `oxlint` e `ruff` como linters.

**Target Platform**: Samsung QN50Q60DAGXZD; engine de referência Tizen 8.0 /
Chromium 108 (ADR-006 E1). Navegador de desenvolvimento como ambiente
secundário.

**Performance Goals**: N/A formal nesta fatia. A única meta operacional é não
travar a TV ao montar um grupo grande — endereçada pelo teto de canais
(D-006), não por medição.

**Constraints**:
- Direct Play obrigatório — o backend não faz proxy nem transcodifica
  (ADR-001 §2; constitution, Restrições do Projeto).
- A URL de reprodução pode conter credenciais no caminho (Xtream) e é tratada
  como dado sensível de retenção mínima (ADR-002 §5; ADR-004 §7).
- Interação exclusivamente por setas + OK + Voltar.
- O AVPlay desenha num plano de hardware atrás da camada web, não no DOM
  (`research.md` R0-2).

**Scale/Scope**: a fonte de teste real já importada tem **311.367 entradas**
(registrado na feature 001). O número de canais por grupo é desconhecido e é
exatamente o motivo do teto temporário.

## Decisões Invariantes

- **D-001 — A URL de reprodução nunca entra em listagem de catálogo.** Vem de
  um endpoint dedicado, no momento do play. `GET /catalog-items` ganha apenas
  o booleano `playable`. (ADR-004 §7; `contracts/playback-api.md`)
- **D-002 — A URL de reprodução vive só na memória da sessão de reprodução.**
  Não é persistida, não é logada, não é reusada entre tentativas: "tentar de
  novo" busca de novo pelo `item_id`, para não contornar expiração ou
  revogação. (ADR-002 §5)
- **D-003 — A identidade de reprodução é o `item_id` do catálogo**, nunca a
  URL. (constitution, Identidade de Reprodução Não Depende da URL)
- **D-004 — Esta feature não persiste nada no cliente.** Sem IndexedDB, sem
  `localStorage`. Os canais são buscados do backend a cada abertura da tela.
  O cache offline é o item 4 do backlog, e a colisão entre "cachear
  informação de reprodução" e "retenção mínima de credencial" está registrada
  lá para ser resolvida no planejamento daquele item.
- **D-005 — O player é uma camada dentro da `LiveScreen`, não uma tela do
  `App.tsx`.** É o que faz o foco sobreviver sem carregar estado de foco no
  histórico de navegação. (`research.md` R0-5)
- **D-006 — O teto de canais por grupo é do cliente e temporário.** Constante
  nomeada, aviso visível ao truncar, removida quando a virtualização (item 7)
  entrar. Sem paginação de backend nesta fatia. (`research.md` R0-6)
- **D-007 — As telas não conhecem o motor de reprodução.** Elas falam com o
  `PlayerService` e leem uma máquina de estados própria
  (`idle`/`preparing`/`buffering`/`playing`/`error`/`closed`); os estados
  nativos do AVPlay não vazam. (ADR-001 §2; `research.md` R0-3)
- **D-008 — Só canais.** Filmes e séries continuam em mock nesta feature, e
  o classificador não é alterado.
- **D-009 — Completude é comunicada por omissão.** A tela não exibe contagem
  total nem "fim do catálogo", porque uma importação pode estar em andamento
  e o conjunto publicado ser parcial (RF-006, "distinguir catálogo parcial de
  importação concluída"). Um indicador ativo de "importando agora" exigiria a
  API informar se há job em execução para a fonte, e fica fora desta fatia.
  O aviso de truncamento do FR-014 fala do teto de renderização e precisa ser
  redigido de forma a não se confundir com "isto é tudo que a fonte tem".
- **D-010 — Na camada de reprodução, RETURN é a saída garantida.** Por
  desenho esta fatia não tem controles na tela, então a camada não tem
  elemento focável visível enquanto não há o que decidir. Isso é compatível
  com o princípio "Foco Visível e Sem Becos Sem Saída", cujo objetivo é **não
  prender o controle remoto**, e não exigir um nó focável literal em toda
  superfície: RETURN está sempre ativo na camada (via
  `useRemoteNav({ modal: true })`) e encerra a sessão.

  **Emenda (2026-09-17, decisão do usuário na Fase 7)**: originalmente esta
  decisão cobria só o estado `playing`, e dizia que `preparing` e `buffering`
  seguiriam exigindo elemento focável. A verificação do Cenário B mostrou que
  a implementação nunca fez isso — durante "Preparando…" a camada tem zero
  botões, `document.activeElement` é o `body`, e o único `.tv-focus` da
  página é o canal da lista, escondido atrás da camada opaca. Diante do
  conflito, **a decisão foi estendida em vez de o código ganhar um botão**:
  `preparing` e `buffering` passam a ser cobertos pelo mesmo raciocínio do
  `playing`. O motivo é o mesmo já registrado em `## Complexity Tracking`
  para o `playing` — um botão que existe só para satisfazer a leitura literal
  do princípio seria removido quando os controles do item 11 chegarem, e
  poluiria a espera com um controle que não pertence ao desenho final.
  **`error` continua exigindo elemento focável** (FR-010: "Tentar de novo" e
  "Voltar"), porque aí existe uma decisão real a tomar. Quando os controles
  do item 11 chegarem, esta decisão inteira deixa de ser necessária.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

Uma linha por princípio real da constitution v1.1.0.

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | Nada nesta feature introduz login; o endpoint novo não exige identidade. |
| Segredos Fora dos Clientes e dos Logs | **Atenção** | OK com fronteira explícita | A URL de reprodução **chega à TV** e pode conter credencial. Permitido em texto pela ADR-004 §7 ("Direct Play poderá exigir fornecer à TV informações de reprodução sensíveis em tempo de execução, sem incorporá-las ao pacote"). Fronteira fixada por D-001/D-002 + FR-011 + regra 1 do contrato. Não é violação: não vai para o pacote, nem para variável pública, nem para log, nem para tela. Ver R-001. |
| Categorias da Fonte São Preservadas | OK | OK | FR-002; grupo nulo → "Sem categoria" (ADR-005 §1), sem taxonomia externa. |
| IA e Classificação Nunca Inventam Dados | OK (N/A) | OK (N/A) | A feature não classifica nada (D-008). `container_hint` é `null` quando indeterminado, nunca um palpite. |
| Comandos Locais Independem de Rede, Backend ou IA | OK | OK | O princípio cobre foco, Voltar e controles de "mídia **já em reprodução**". Foco e Voltar permanecem locais. **Iniciar** reprodução depende do backend por desenho (D-001) — fora do escopo do princípio, mas vira restrição real quando o item 4 chegar. Ver R-002. |
| Trailers e Metadados Não Alteram o Estado Principal | OK (N/A) | OK (N/A) | Sem trailers nem metadados nesta feature. |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | OK | OK | FR-013; RETURN fecha a camada do player antes de sair da tela (D-005). |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | OK (N/A) | OK (N/A) | Sem parsing nesta feature. `container_hint` é pista para o player, não reclassificação de catálogo. |
| Foco Visível e Sem Becos Sem Saída | OK | OK com exceção documentada | FR-013 + SC-004; erro de reprodução tem duas ações focáveis (FR-010). **Exceção**: o estado `playing` não tem elemento focável visível, porque esta fatia não tem controles. Não prende o controle remoto — RETURN está sempre ativo e encerra a sessão. Fixado em D-010. |
| Voltar Restaura Foco e Posição | **Atenção** | OK | O `App.tsx` guarda histórico de telas mas **não** de foco. Resolvido por D-005 (player como camada, `LiveScreen` não desmonta) em vez de alterar a navegação. Ver R-003. |
| Identidade de Reprodução Não Depende da URL | OK | OK | D-003; regra 4 do contrato. |
| Progresso e Capacidades São Reais, Nunca Prometidos | OK | OK | Sem controles, logo sem promessa de busca temporal em canal ao vivo. `buffering` e `error` são estados distintos (D-007), então carregamento não encobre falha. |
| Documentação do Repositório É Canônica | OK | OK | A feature não é declarada concluída sem a evidência do Cenário C do `quickstart.md`; resultado negativo é registrado, não omitido. |

**Resultado**: nenhuma violação não justificável. Os dois pontos de
"Atenção" pré-design foram resolvidos por decisão de design (D-001/D-002 e
D-005), não por exceção. Resta **um** desvio literal, do princípio de foco no
estado `playing`, registrado em `## Complexity Tracking` — não escondido
atrás de uma interpretação conveniente do texto do princípio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/003-live-tv-avplay/
├── spec.md                      # Saída do sdd-specify
├── plan.md                      # Este arquivo
├── research.md                  # Fase 0 (6 decisões)
├── quickstart.md                # Fase 1
├── contracts/
│   └── playback-api.md          # Fase 1
└── tasks.md                     # Saída do sdd-plan
```

### Source Code (repository root)

Estrutura real encontrada — backend e frontend separados, mais o projeto de
empacotamento Tizen:

```text
api/                                  # Backend Python/FastAPI
├── main.py                           # app, CORS, event loop do Windows
├── app/
│   ├── db.py
│   ├── models/catalog_item.py        # tem playback_url (não exposto hoje)
│   ├── routers/catalog_items.py      # ← alterado (campo playable + endpoint novo)
│   ├── schemas/catalog_item.py       # ← alterado
│   └── services/                     # importer, classifier, m3u_parser, ssrf_guard
├── alembic/                          # sem migração nesta feature
└── tests/                            # pytest + httpx.ASGITransport

tv-web/                               # Frontend React/TS/Vite
├── vite.config.ts                    # ← alterado (build.target / cssTarget)
└── src/
    ├── App.tsx                       # ← alterado (passar a source para live)
    ├── index.css                     # tokens da ADR-007
    ├── components/                   # ConfirmDialog, Toast
    ├── features/
    │   ├── catalog/
    │   │   ├── mockCatalog.ts        # deixa de alimentar o caminho de canais
    │   │   └── catalogApi.ts         # ← novo (hooks TanStack Query)
    │   ├── live/
    │   │   ├── LiveScreen.tsx        # ← reescrito
    │   │   └── PlayerOverlay.tsx     # ← novo (camada de reprodução)
    │   ├── list-home/ImportProgress/home/movies/series/
    │   └── screens.css               # ← alterado (estados novos)
    └── lib/
        ├── useRemoteNav.ts           # reusado como está
        └── player/                   # ← novo
            ├── PlayerService.ts      # contrato + máquina de estados
            ├── avplayAdapter.ts      # webapis.avplay (padrão de tizenExit.ts)
            └── htmlVideoAdapter.ts   # <video> para desenvolvimento

CCPlayTv/                             # Projeto Tizen (.wgt); recebe o build
```

**Structure Decision**: mantida a separação existente. O backend muda em dois
arquivos (`routers/catalog_items.py`, `schemas/catalog_item.py`) e **não
precisa de migração** — `playback_url` já existe na tabela e `playable` é
derivado. No frontend, o `PlayerService` nasce em `src/lib/player/` (camada
`lib`, sem importar componentes de UI), seguindo a fronteira que o item 51 do
backlog quer formalizar. O acesso a `window.webapis` segue o padrão já
estabelecido por `src/lib/tizenExit.ts`: interface local, optional chaining e
no-op fora da TV.

## Complexity Tracking

> Preencher SOMENTE se o Constitution Check tiver violações que precisam ser justificadas

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| **"Foco Visível e Sem Becos Sem Saída"**, ao pé da letra: a camada do player não tem elemento focável visível nos estados `playing`, `preparing` e `buffering` (os dois últimos incluídos pela emenda de 2026-09-17 a D-010; `error` mantém as duas ações focáveis). | A fatia é fina de propósito e **não** inclui controles na tela (play/pause, saltos, barra) — isso é o item 11 do backlog e o guia Samsung 06. Sem controles, não há o que focar durante a reprodução. O objetivo do princípio, não prender o controle remoto, continua atendido: RETURN está sempre ativo na camada e encerra a sessão (D-010). | *Adicionar um botão "Voltar" flutuante só para ter um nó focável*: rejeitada por poluir o vídeo com um controle que não pertence ao desenho final e que precisaria ser removido quando os controles de verdade chegarem. *Antecipar os controles do item 11*: rejeitada por dobrar a fatia e atrasar a porta V1, que é o propósito da feature. |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Nesta feature o manual **não é último recurso, é o aceite** (SC-001): a porta
V1 só fecha em hardware. Os testes automatizados cobrem tudo o que é possível
sem a TV, para que o teste manual meça o AVPlay e não um bug de lógica.

- **Unitário (frontend, vitest)**: máquina de estados do `PlayerService` com
  um adaptador falso; agrupamento de canais por `original_group` incluindo o
  caso nulo; aplicação do teto e do aviso de truncamento.
- **Contrato/integração (backend, pytest)**: `200` com `url`; `404` para item
  inexistente/não publicado; `409` para item sem `playback_url`; ausência de
  `playback_url`/`url` na resposta de `GET /catalog-items`; presença e valor
  de `playable`.
- **Componente (frontend, vitest + Testing Library)**: foco não dispara
  requisição de reprodução; Enter dispara uma única sessão; Voltar do erro
  restaura o foco; canal indisponível não abre o player; cada estado tem
  elemento focável.
- **E2E (Playwright)**: já existe `tv-web/e2e.mjs` no repositório; não é
  ampliado nesta feature — o ganho marginal sobre os testes de componente não
  paga o custo, e o risco real está no hardware.
- **Manual**: `quickstart.md`, Cenários A, B e C.

Comandos-base:

```powershell
# Backend (exige Postgres de pé)
cd api
uv run ruff check .
uv run pytest

# Frontend
cd tv-web
npx tsc -b
npm run lint
npx vitest run
npm run build
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Alvo de build (Fase 1) | **Concluído.** `chrome108` em `target` e `cssTarget`. |
| Contrato de reprodução na API (Fase 2) | **Concluído.** `playable` na listagem + `GET /catalog-items/{id}/playback` (200/404/409, `no-store`). 7 testes de contrato. |
| `PlayerService` + adaptadores (Fase 2) | **Concluído.** Máquina de estados própria, `avplayAdapter`, `htmlVideoAdapter`, seleção em runtime. 8 testes. |
| Tela de canais com catálogo real (Fase 3) | **Concluído.** `groupChannels` puro + `LiveScreen` sobre o catálogo real, estados de borda, mock removido. 17 testes. |
| Camada de reprodução (Fase 4) | **Verificada em hardware (17/09).** Overlay, sessão única, RETURN encerrando — este último só passou a funcionar na TV depois da correção do `keyCode` 10009. |
| Caminhos de falha (Fase 5) | **Concluído em código; não exercitado na TV.** Erro com duas saídas focáveis, mensagens sanitizadas, `409` à parte. Nenhum canal falhou na rodada de 17/09 (ver T051). |
| Pacote Tizen | **Instalado e rodando na TV.** Assinatura com cadeia Samsung completa (perfil `ccplay_samsung_certificate_4`, com o DUID do aparelho). Procedimento registrado na skill `tizen-tv`. |
| Porta V1 da ADR-006 | **EXECUTADA (17/09/2026), com evidência parcial.** Vídeo e áudio confirmados; firmware e engine observada não são obteníveis nesta TV. ADR-006 §8 emendada. |
| Cenários A e B do quickstart | **Pendentes.** A só foi observado de relance; B não roda desde as duas correções (T049, T050). |
| Gate de lint do backend | **Vermelho por causa alheia** — `api/delete_sources.py` (ver R-008 e T052). Código desta feature passa limpo; 47 testes de backend verdes em 17/09. |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | **URL de reprodução com credencial chega à TV.** Inerente ao Direct Play com fontes Xtream, que embutem usuário e senha no caminho. | Alto se vazar para log, tela ou persistência — é credencial de provedor do usuário. | **Resolvido (2026-09-18, auditoria de convergência)**: D-001 + D-002 — endpoint dedicado, retenção só em memória de sessão, proibição explícita em log (contrato, regra 1) e FR-011. Verificado **na TV** em ciclo de sucesso **e** de falha: a tela de erro não mostrou URL, host nem credencial, e o log do backend registra apenas método e rota. A mitigação vale enquanto a URL não for cacheada — o item 4 do backlog herda a restrição. |
| R-002 | **Iniciar reprodução depende do backend.** Sem backend, a lista pode até vir de cache no futuro, mas o play não começa. | Médio — não afeta esta feature (sem cache), mas condiciona o item 4 do backlog. | **Resolvido (2026-09-18)**: aceito e confirmado em hardware — com a API derrubada de propósito, o play falha com erro focável e mensagem sanitizada, sem travar o app. É o comportamento pretendido, não uma falha. Aceito nesta fatia. A colisão entre ADR-002 §1 ("cache pode guardar informações mínimas de reprodução") e §5 ("retenção mínima de credencial") está registrada no item 4 do backlog para ser decidida lá. |
| R-003 | **`App.tsx` não guarda estado de foco**, só histórico de telas. Um player como tela desmontaria a `LiveScreen` e quebraria o FR-009. | Alto para o FR-009/SC-003. | **Resolvido (2026-09-18)**: confirmado na TV e no navegador — Voltar devolve o foco ao canal de origem, inclusive saindo da tela de erro. D-005: player como camada. O gerenciador central de foco por escopos (item 15 do backlog) resolve o caso geral depois. |
| R-004 | **`vite.config.ts` não define `build.target`/`build.cssTarget`**, contrariando a ADR-006 §2, e esta é a primeira feature que roda código real na TV. Sintaxe não suportada pelo Chromium 108 aparece como tela preta — indistinguível de "o AVPlay falhou". | Alto: contamina o resultado da porta V1, que é o propósito da feature. | **Resolvido (2026-09-16, T001/T002)**: o risco era maior que o estimado — o padrão do Vite 8 é `'baseline-widely-available'`, que equivale a **Chrome 111**, três versões **acima** do alvo real da TV. Fixado `target: 'chrome108'` e `cssTarget: 'chrome108'`. Build, lint e testes verdes. Lembrete registrado: transpilar sintaxe não adiciona APIs de runtime ausentes — a prova final continua sendo o aparelho. |
| R-005 | **Modelo de exibição do AVPlay não verificado**: vídeo em plano de hardware atrás da camada web, exigindo região transparente e coordenadas explícitas. Se a página tiver fundo opaco, o resultado é áudio sem imagem. | Alto — falha silenciosa e fácil de diagnosticar errado. | **Resolvido (2026-09-17)**: o risco se materializou exatamente como previsto — na primeira reprodução em hardware o canal tocou com áudio e sem imagem. `setDisplayRect` já era chamado corretamente; o que faltava era a camada web ceder a área. Corrigido em `sdd/bugs/live-tv-toca-audio-sem-imagem`: a capacidade `rendersOnHardwarePlane` entrou no contrato do `PlayerAdapter` e a camada de reprodução libera `:root` e `.player-overlay` só quando o motor pinta em hardware e a sessão tem vídeo, preservando D-007 (a tela continua sem saber qual motor está ativo). Verificado no aparelho. |
| R-006 | **A fonte de teste pode não ter nenhum canal em formato suportado pelo AVPlay.** A escolha de formato hoje é fixa (`output=m3u8` no `build_m3u_url`), sem consultar `allowed_output_formats`. | Médio — a feature pode terminar sem reprodução bem-sucedida. | **Resolvido (2026-09-18)**: não se materializou — um canal da fonte real reproduziu com vídeo e áudio na TV. Vale para **um** canal de **uma** fonte: não prova compatibilidade geral de contêiner/codec, e o encaminhamento sobre formatos segue de pé. Previsto na spec: resultado negativo é evidência válida da porta V1, não fracasso silencioso. O encaminhamento é o item 1 do backlog (conector Xtream com `allowed_output_formats`). |
| R-007 | **Testes de backend exigem Postgres de pé** (`httpx.ASGITransport` contra o app real, sem override de sessão). | Baixo — já é a realidade do repositório desde a feature 001. | **Resolvido (2026-09-18)**: confirmado como condição de trabalho, não risco pendente. Efeito colateral notado na convergência: a suíte grava fontes no mesmo banco de desenvolvimento, e parte das "listas que nunca carreguei" vistas na Home veio de execuções de teste. Documentado nos pré-requisitos do `quickstart.md`. **Confirmado na prática** na Fase 2: com o container de pé, os 47 testes rodam em ~42 s. |
| R-008 | **`uv run ruff check .` falha por `api/delete_sources.py` (I001)**, arquivo pré-existente e fora do escopo desta feature. Descoberto na Fase 2. | Baixo tecnicamente, médio processualmente: o gate "checagens automatizadas passando" da constitution não fecha verde no backend por motivo alheio à feature. | **Resolvido (2026-09-18, T052)**: seguiu a regra durante toda a execução — não foi corrigido calado, ficou logado como `[Bug]` no backlog e a verificação da feature usou `ruff check` sobre os arquivos tocados. Na Fase 7 o usuário decidiu corrigir: `uv run ruff check --fix delete_sources.py` (ordenação de import), e `uv run ruff check .` passa limpo. Continua aberta no backlog a parte que não é lint: se esse script utilitário — que apaga todas as fontes via API, sem confirmação — deve seguir versionado dentro de `api/`. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-16 | Fase 1 (Setup) | Alvo de build fixado em `chrome108` (`target` + `cssTarget`). Confirmado na documentação da versão instalada (Vite 8.3.0, Rolldown/Oxc, sem esbuild) que o padrão seria Chrome 111 — o risco R-004 era real, não hipotético. Build/lint/testes verdes. | Nenhuma. |
| 2026-09-16 | Fase 2 (Foundational) | Contrato de reprodução na API (`playable`, endpoint dedicado 200/404/409, `no-store`) + `PlayerService` com máquina de estados própria e os dois adaptadores. O item pai de série, que o importer cria sem `playback_url`, virou o caso real de `409`/`playable:false` nos testes — sem precisar forjar dado. 7 testes de contrato + 8 de player, todos de primeira. | R-008: lint do backend vermelho por arquivo fora do escopo. |

| 2026-09-16 | Fases 3–5 (US1, US2, US3) | `groupChannels` puro, `LiveScreen` sobre o catálogo real com todos os estados de borda, `PlayerOverlay` como camada, caminhos de falha sanitizados e `409` tratado à parte. Mock de canais removido. 49 testes de frontend + 47 de backend, tudo verde; build e sync Tizen feitos. | **T043/T045: a porta V1 não foi executada.** |
| 2026-09-17 | Fase 7 (Convergência) — T046/T047/T048 | **Porta V1 executada. Canal da fonte real reproduzindo com vídeo e áudio na QN50Q60DAGXZD.** Evidência: pacote assinado com cadeia Samsung completa (author `Samsung VD Author CA`, distribuidor `VD DEVELOPER Public CA Class`), instalado por `sdb` sobre a rede e lançado por `tizen run`; catálogo real consumido do backend pela LAN, confirmado no log da API por requisição vinda do IP da TV. Sequência: `npm run build:tizen` (com `VITE_API_URL` da LAN) → `tizen build-web -e "Debug/*"` → `tizen package -t wgt -s ccplay_samsung_certificate_4` → `tizen install -t QN50Q60DAGXZD` → `tizen run`. **Dois defeitos só visíveis em hardware** foram encontrados e corrigidos com ciclo completo: `sdd/bugs/tecla-voltar-return-nao-funciona-na` (RETURN chega como `keyCode` 10009; o FR-008 não era satisfeito no aparelho apesar dos testes verdes) e `sdd/bugs/live-tv-toca-audio-sem-imagem` (R-005 materializado: camada web opaca escondendo o plano de hardware do AVPlay). ADR-006 §8 emendada. | **Evidência incompleta**: firmware e `navigator.userAgent` não são obteníveis nesta TV — sem console (`sdb root on` negado, `dlog` vazio, porta 7011 fechada). Contêiner/codec do canal também não registrado. |

| 2026-09-17 | Fase 7 (Convergência) — T050/T053 | Cenário B reexecutado no navegador com dados reais (39 grupos da fonte, 126 canais no primeiro): camada abre em "Preparando…", Voltar durante o preparo fecha sem `<video>` residual, o canal **tocou** (`readyState 4`, sem erro), Enter repetido manteve sessão única (1 overlay, 1 `<video>`), e o Voltar restaurou o foco no canal de origem. Confirmado que o adaptador `<video>` não regrediu: `video-plane-visible` nunca é aplicada e o fundo preto permanece. **SC-006 verificado no navegador** — dois movimentos de foco, zero requisições de `/playback`. Descoberta levada ao usuário como conflito com critério de aceite (camada sem elemento focável em `preparing`/`buffering`): decisão foi emendar D-010 em vez de adicionar botão; ver T053. | T049 e T051 seguem dependendo da TV; T052 é decisão pendente. |

| 2026-09-18 | Fase 7 (Convergência) — T049/T051/T052/T054 | Cenário A rodado na TV com o usuário no controle e **SC-006 medido no log do backend**: 10-15 movimentos de foco, zero requisições de `/playback`. Ciclo de falha exercitado derrubando a API de propósito — erro com duas ações focáveis, mensagem sem credencial, Voltar restaurando o foco: **fecha o SC-005**. T052 decidido pelo usuário: `api/delete_sources.py` corrigido e `ruff check .` passa limpo pela primeira vez. **T054 (ad-hoc, descoberto na TV)**: o vídeo tocava atrás das colunas de grupos e canais — a correção anterior liberou o fundo do overlay e o `:root`, mas não os irmãos dentro de `.screen`; resolvido com `visibility: hidden` sob `video-plane-visible`, e o usuário confirmou tela cheia. Zapping (OK durante a reprodução) foi pedido e registrado no item 11 do backlog, fora do escopo desta fatia. | Nenhuma bloqueante. Ficam declarados: SC-001 com evidência parcial por limite do aparelho, e FR-014/"Sem categoria" não observados porque a fonte não produziu os casos. |

**PRÓXIMO**: **Rodar `sdd-converge` de novo** para reauditar com todas as
tasks fechadas. Se convergir limpo, a feature sai de "Convergência Pendente".
O que ficou pendente é declarado e não bloqueante: evidência parcial do
SC-001 (a TV não expõe firmware nem engine), e dois casos do Cenário A que a
fonte não produziu (aviso de truncamento e grupo "Sem categoria").

**Histórico anterior**: **T049 e T051, com a TV conectada** — rodar o Cenário A do
`quickstart.md` item a item (grupos na ordem da fonte, canal sem URL
sinalizado, truncamento, "Sem categoria", e foco percorrendo a lista sem
disparar requisição — conferindo no log do backend, já que a TV não tem aba
de rede) e exercitar um ciclo de falha para fechar o SC-005 no aparelho.
Depois T050 (Cenário B no navegador, que não roda desde as duas correções) e
T052 (decisão sobre o R-008). A feature **não** pode ser marcada como
Implementada antes disso.

## Resultado Final

*Anexado pelo `sdd-converge` em 2026-09-18, após a feature convergir limpa.*

**O que foi construído**: a fatia vertical prometida, ponta a ponta. O
backend ganhou `playable` derivado na listagem e um endpoint dedicado de
reprodução com `no-store`, mantendo a URL — que pode embutir credencial —
fora de qualquer listagem de catálogo. O frontend ganhou o `PlayerService`
com máquina de estados própria e dois adaptadores, a Live TV lendo o
catálogo real com os grupos declarados pela fonte, e a camada de reprodução
com saída garantida por RETURN. O mock saiu do caminho de canais. Nenhuma
dependência nova entrou.

**O que a validação em hardware mudou no resultado.** Esta é a parte que
nenhum teste automatizado teria produzido. Três defeitos só existiam no
aparelho, e todos passaram despercebidos por uma suíte verde:

1. **RETURN chega como `keyCode` 10009.** O FR-008 não era satisfeito na TV
   apesar de 53 testes passando — o app ficava preso na tela.
   (`sdd/bugs/tecla-voltar-return-nao-funciona-na`)
2. **Fundo opaco escondia o plano de hardware do AVPlay.** O canal tocava
   com áudio e sem imagem. Era o R-005 deste plano, escrito antes de
   qualquer teste, se materializando com precisão.
   (`sdd/bugs/live-tv-toca-audio-sem-imagem`)
3. **As colunas de grupos e canais continuavam pintando sobre o vídeo** —
   irmãs do overlay, fora do alcance da correção anterior. Resolvido no
   T054.

**Desvios em relação ao plano original**, todos registrados e nenhum
silencioso:

- **D-010 foi estendida** (T053): a camada não tem elemento focável também
  em `preparing`/`buffering`, não só em `playing`. A decisão foi do usuário,
  diante do conflito com a letra do FR-013, e está datada na própria D-010,
  no Complexity Tracking e numa sessão nova de Clarifications da spec. O
  estado `error` continua exigindo as duas ações focáveis.
- **O contrato do `PlayerAdapter` cresceu** com a capacidade
  `rendersOnHardwarePlane`, para a UI saber que precisa liberar a área do
  vídeo sem descobrir qual motor está ativo — preservando D-007.
- **O empacotamento mudou de rota**: o caminho previsto era `tz pack` +
  Apps2Samsung. O que funcionou foi assinatura com cadeia Samsung completa
  (author `Samsung VD Author CA` + distribuidor `VD DEVELOPER Public CA
  Class`, com o DUID da TV) e instalação direta por `sdb`. O procedimento
  virou a skill `tizen-tv`.
- **O emulador não serviu**: instalar no `T-samsung-10.0-x86_64` falha com
  `118, -4 Operation not allowed` mesmo com DUID, relógio, cadeia e
  integridade do pacote descartados por evidência. Registrado na skill
  `tizen-emulator` para ninguém repetir o caminho.

**O que fica em aberto, declarado**: a evidência do SC-001 é parcial —
firmware e `navigator.userAgent` não são obteníveis nesta TV, que não expõe
console ao desenvolvedor. O aviso de truncamento (FR-014) e o grupo "Sem
categoria" não foram observados em tela porque a fonte de teste não produziu
esses casos; a lógica dos dois tem teste unitário. E o zapping pedido
durante a verificação foi registrado no item 11 do backlog, não
implementado: a spec já listava "troca rápida de canal" como fora de escopo.

## Arquivos Principais

- `tv-web/vite.config.ts` — alvo de engine da TV (`chrome108`).
- `api/app/routers/catalog_items.py` — `playable` + endpoint de reprodução.
- `api/app/schemas/catalog_item.py` — `CatalogItemOut.playable`, `CatalogItemPlaybackOut`.
- `api/tests/test_catalog_items_api.py` — contrato (inclui "a URL não aparece").
- `tv-web/src/lib/player/PlayerService.ts` — contrato e máquina de estados.
- `tv-web/src/lib/player/avplayAdapter.ts` — motor de produção (não verificado em TV).
- `tv-web/src/lib/player/htmlVideoAdapter.ts` — motor de desenvolvimento.
- `tv-web/src/features/catalog/catalogApi.ts` — canais (Query) e `fetchPlayback` (sob demanda).
- `tv-web/src/features/live/groupChannels.ts` — agrupamento puro + teto.
- `tv-web/src/features/live/LiveScreen.tsx` — tela sobre o catálogo real.
- `tv-web/src/features/live/PlayerOverlay.tsx` — camada de reprodução.
- `tv-web/src/features/screens.css` + `src/index.css` — estados novos, tokens
  e a liberação da área do vídeo (`video-plane-visible`).
- `tv-web/src/App.tsx` — encaminha a fonte ativa para a Live TV.
- `tv-web/src/lib/useRemoteNav.ts` — entrou na lista em 17/09: é o único
  ponto que traduz tecla em intenção de navegação, e passou a reconhecer o
  `keyCode` 10009 do controle Samsung (sem isso, Voltar é inerte na TV).

## Cuidados para Retomada

- **O IP da LAN mudou**: as notas da feature 001 registram `192.168.0.14`, mas
  o Wi-Fi hoje está em **`192.168.0.5`** (DHCP). Conferir com
  `Get-NetIPAddress` antes de cada `build:tizen` — um IP velho no bundle
  produz "Failed to fetch" na TV, que é fácil confundir com falha do backend.
- **Espionar `resolveAdapterFactory` em teste não funciona.**
  `createPlayerSession` chama a função pela ligação interna do módulo, então
  um `vi.spyOn` no export é ignorado e o adaptador `<video>` real acaba sendo
  usado. Injetar pela prop `createAdapter` do `PlayerOverlay` (ou por
  `options.createAdapter` do `PlayerService`).
- O jsdom loga `Not implemented: HTMLMediaElement's load() method` durante os
  testes. É ruído do ambiente, não falha: jsdom escreve no console virtual em
  vez de lançar, então `try/catch` não silencia. Ignorar.
- **Não remover `build.target`/`build.cssTarget` de `tv-web/vite.config.ts`
  achando que é redundante.** O padrão do Vite 8 é
  `'baseline-widely-available'` = **Chrome 111**, acima do Chromium 108 da
  TV-alvo. Sem o alvo explícito, o bundle pode conter sintaxe que a TV não
  executa, e o sintoma é tela preta — facilmente confundido com falha do
  AVPlay.
- O toolchain do Vite 8 aqui é **Rolldown/Oxc**, não esbuild (não há
  `esbuild` em `node_modules`). Receitas de configuração de Vite ≤6 que
  mencionam opções de esbuild não se aplicam diretamente.
- **O ciclo de instalação na TV está documentado na skill `tizen-tv`** — use
  ela em vez de reconstruir o procedimento. O que mais custou descobrir em
  17/09: o pacote precisa de **author Samsung** (`author.p12`, criado pela
  extensão Tizen do VS Code; o Certificate Manager do Tizen Studio não
  concluiu), o DUID da TV precisa estar no certificado, o CLI clássico tem
  que apontar para o `profiles.xml` da extensão via `cli-config`, e
  `tizen uninstall` exige o **id completo** (`8tZqMtwANL.CCPlayTv`).
- **O IP da TV muda sozinho** (DHCP): já foi `192.168.0.15`, hoje é
  `192.168.0.4`. E o campo *Host PC IP* no Developer Mode da TV precisa ter
  o IP atual do PC, com **reinício da TV** depois de salvar — sem isso o
  `sdb connect` falha mesmo com a porta 26101 aberta.
- **A TV não dá console.** `sdb root on` é negado, `dlog` volta vazio e a
  porta 7011 do Web Inspector fica fechada. A evidência disponível é o
  `applist`, o log do backend (requisições vindas do IP da TV) e o olho do
  usuário. Planeje as perguntas de verificação em cima disso — genéricas
  como "funcionou?" não produzem evidência utilizável.
- **Duas requisições de `/playback` por abertura, no navegador de
  desenvolvimento, são esperadas** — `StrictMode` (`tv-web/src/main.tsx`)
  invoca o efeito duas vezes em dev. Só uma sessão sobrevive (verificado em
  17/09: 1 overlay, 1 `<video>` no DOM), o que na prática é evidência de que
  o cleanup está correto. Não vale como bug, e não acontece no build de
  produção que vai para o `.wgt`.
