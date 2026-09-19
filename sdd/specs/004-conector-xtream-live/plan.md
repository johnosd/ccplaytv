# Implementation Plan: Conector Xtream JSON para canais ao vivo

**Slug**: `004-conector-xtream-live` | **Date**: 2026-09-18 | **Spec**: `sdd/specs/004-conector-xtream-live/spec.md`

## Summary

Substituir o atalho atual — montar `get.php?...&type=m3u_plus` e reusar o
parser M3U para fontes de provedor — por um conector próprio que fale o
protocolo JSON do painel, preservando identificador e categorias que o
provedor já declara. Corrige o desvio da ADR-006 §4.3 e da ADR-004 §3, e é a
fundação sem a qual Filmes e Séries reais (itens 9 e 10 do backlog) só teriam
adivinhação sobre texto de M3U.

A abordagem tem cinco peças: (1) um `ProviderConnector` que fala
`player_api.php` e produz o **mesmo** `ClassifiedEntry` que o parser M3U
produz, para o `importer` não saber qual protocolo falou; (2) **publicação em
duas fases** usando as colunas `published` e `import_job_id` que já existem —
itens novos entram despublicados e um flip transacional os torna visíveis
enquanto remove os do job anterior; (3) um irmão JSON do `fetch_text_ssrf_safe`,
para nenhuma requisição nova escapar da política de rede; (4) campos novos na
`Source` (formatos permitidos, modo de importação, marca de migração) com
migração Alembic; (5) uma decisão de frescor no backend, consultada quando a
TV abre uma fonte.

## Technical Context

**Language/Version**: Python 3.13 (backend, `requires-python = ">=3.13"`);
TypeScript ~6.0 + React 19 no frontend, tocado apenas na borda.

**Primary Dependencies**: FastAPI, SQLAlchemy 2 (async), Pydantic, Alembic,
psycopg 3, httpx — todas já presentes. **Nenhuma dependência nova.** O
protocolo do painel é HTTP + JSON; não há SDK a adotar.

**Storage**: PostgreSQL. Esta feature **exige migração Alembic** (colunas
novas em `sources`), ao contrário da 003 — hoje existe uma única migração,
`0d784ce0fa89_create_sources_import_jobs_catalog_items.py`.

**Testing**: `pytest` + `pytest-asyncio` (`asyncio_mode = auto`) com
`httpx.ASGITransport` contra o app real — exige Postgres de pé. O conector
novo é testável sem rede com respostas JSON fixas. `vitest` no frontend.
`ruff` e `oxlint` como linters — o `ruff check .` passou a fechar verde em
18/09/2026.

**Target Platform**: backend local (Windows, `uv`), consumido pela TV Samsung
QN50Q60DAGXZD na LAN. O trabalho pesado desta feature é **todo do backend**;
a TV só dispara e acompanha.

**Performance Goals**: sem meta formal. A restrição operacional real é a
fonte de teste com **311.367 entradas** (feature 001): a troca de publicação
não pode bloquear a leitura do catálogo, e a remoção do catálogo anterior não
pode virar uma transação única de centenas de milhares de linhas.

**Constraints**:
- Preservar IDs e categorias do provedor; não converter API estruturada em
  M3U para reusar parser (ADR-004 §3; ADR-006 §4.3).
- **Não testar portas ou caminhos arbitrários** para contornar acesso
  (ADR-004 §3) — a detecção de compatibilidade é uma tentativa contra a base
  normalizada, nunca varredura.
- Numa atualização, conservar a versão anterior utilizável enquanto a nova é
  preparada; falha ou cancelamento não apaga a anterior (ADR-004 §6).
- Senha e URL completa do provedor são segredo: nunca em log, erro, tela ou
  resposta comum de catálogo (ADR-004 §7).
- Se o provedor só oferecer HTTP, a limitação é apresentada — não se força
  HTTPS nem se desativa validação TLS (ADR-004 §8).

**Scale/Scope**: uma fonte real de 311k entradas e 50 fontes no banco de
desenvolvimento, boa parte criada pela própria suíte de testes (ver R-007).

## Decisões Invariantes

- **D-001 — Dois conectores, uma saída.** `M3USourceConnector` e
  `ProviderConnector` produzem o mesmo `ClassifiedEntry`; o `importer` não
  sabe qual protocolo respondeu. Nenhuma resposta estruturada é convertida em
  M3U. (ADR-006 §4.3; ADR-004 §3)
- **D-002 — Publicação em duas fases.** Itens novos são gravados com
  `published=False` e o `import_job_id` do job corrente. Só ao concluir, uma
  transação publica os novos e remove os dos jobs anteriores daquela fonte.
  É o que cumpre "conservar a versão anterior utilizável enquanto a nova é
  preparada" (ADR-004 §6) e o que tornará possível, quando favoritos e
  histórico existirem, "reconciliar o estado do usuário antes de expor o
  catálogo novo" (constitution, Identidade de Reprodução). **Também corrige o
  R-001**: hoje a importação publica direto e nunca remove o anterior.
- **D-003 — Nenhuma saída de rede fora da política.** Toda chamada ao painel
  passa pelo mesmo guardião de `ssrf_guard.py` (validação por hop, limites de
  bytes/tempo/redirecionamento, User-Agent de player). O conector **não**
  instancia `httpx.AsyncClient` por conta própria. (FR-015)
- **D-004 — A política de frescor mora no backend.** A TV informa "abri esta
  fonte" e o backend decide: migrar, atualizar por idade, ou não fazer nada.
  A TV não carrega prazo, nem compara datas, nem decide disparar importação.
- **D-005 — Compatibilidade se descobre tentando, não varrendo.** Uma
  tentativa contra a base normalizada decide se o painel fala o protocolo. Não
  há varredura de portas nem de caminhos alternativos. (ADR-004 §3)
- **D-006 — O formato de reprodução é decidido na importação.** Os formatos
  permitidos são gravados na `Source` e a preferência (TS) é resolvida ali; a
  URL de reprodução continua sendo construída no backend, no endpoint que a
  003 criou. A TV nunca monta URL. (FR-008, FR-009)
- **D-007 — Só canais.** `get_live_categories` e `get_live_streams`. VOD e
  séries não entram — nem "de graça porque a resposta já veio".
- **D-008 — Fonte em modo limitado é um estado normal, não um erro.** Ela
  sincroniza, aparece na lista e reproduz; a diferença é não ter identidade
  nem categorias do provedor. (FR-010, FR-011)

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

Uma linha por princípio real da constitution v1.1.0.

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | Credencial de provedor não é conta do app; nada novo pede identidade (ADR-004 §1). |
| Segredos Fora dos Clientes e dos Logs | **Atenção** | OK com fronteira explícita | O conector novo multiplica os pontos de saída que manipulam senha: status de conta, categorias, canais, montagem de URL de reprodução. Fronteira: D-003 (toda saída pela política existente), FR-018, e a regra já vigente de nunca interpolar `str(exc)` de httpx — que embute a URL com senha. Ver R-005. |
| Categorias da Fonte São Preservadas | OK | OK | É o objetivo da feature: FR-007 troca categoria inferida de M3U por categoria declarada pelo provedor, preservando nome e ordem. Nenhuma taxonomia externa entra. |
| IA e Classificação Nunca Inventam Dados | OK | OK | Nada de IA. Canal sem identificador do provedor permanece acessível sem identidade forjada (edge case); formato ausente é registrado, não assumido (FR-008). |
| Comandos Locais Independem de Rede, Backend ou IA | OK | OK | Foco, Voltar e reprodução em curso seguem locais. A atualização por idade roda em segundo plano e **não** bloqueia a abertura da lista (FR-020, SC-008). |
| Trailers e Metadados Não Alteram o Estado Principal | OK (N/A) | OK (N/A) | Sem trailers nem metadados externos nesta feature. |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | OK | OK | A ação explícita de ressincronizar já existe na Home e continua alcançável (FR-021); a indicação de modo limitado é informação, não exige interação nova. |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | OK | OK reforçado | O protocolo JSON elimina a ambiguidade na raiz: canal vem declarado como canal, não inferido de extensão de URL. O caminho M3U de fallback mantém as proteções que já tem. |
| Foco Visível e Sem Becos Sem Saída | OK | OK | Nenhuma superfície nova. O estado "atualizando em segundo plano" não pode virar tela bloqueante (FR-020). |
| Voltar Restaura Foco e Posição | **Atenção** | OK | O princípio exige reconciliar foco **pelo identificador do item, não pelo índice**, após atualizar o catálogo — e esta feature introduz atualização que acontece **enquanto o usuário navega**. Endereçado por FR-022 e SC-012. Ver R-006. |
| Identidade de Reprodução Não Depende da URL | **Atenção** | OK com fronteira explícita | O princípio exige que "uma reimportação/resync reconcilie o estado do usuário por chave estável **antes de expor o catálogo novo**". Favoritos e histórico ainda não existem, então não há estado a reconciliar hoje; o que a feature precisa garantir é **não fechar essa porta**: FR-006 grava a identidade estável do provedor, e D-002 cria exatamente o ponto de costura ("preparar, reconciliar, então expor") onde a reconciliação vai entrar nos itens 12 e 13. Ver R-002. |
| Progresso e Capacidades São Reais, Nunca Prometidos | OK | OK | O pipeline de importação já usa etapas e contadores reais. FR-005 exige distinguir conta expirada de credencial inválida — é o caso literal do princípio: "carregando" não pode encobrir autenticação inválida. |
| Documentação do Repositório É Canônica | OK | OK | A feature existe para eliminar um desvio documentado (ADR-006 §4.3). O item 1 do backlog já está marcado como parcialmente coberto por ela. |

**Resultado**: nenhuma violação não justificável. Os três pontos de "Atenção"
são resolvidos por decisão de design — D-003 para segredos, FR-022 para foco,
D-002 para a costura de reconciliação futura — e não por exceção. O
`## Complexity Tracking` fica vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/004-conector-xtream-live/
├── spec.md                      # Saída do sdd-specify
├── plan.md                      # Este arquivo
├── contracts/
│   └── provider-protocol.md     # Fase 1 — o que consumimos do painel e o que gravamos
├── quickstart.md                # Fase 1 — verificação manual
└── tasks.md                     # Saída do sdd-plan
```

### Source Code (repository root)

Estrutura real encontrada — backend e frontend separados, mais o projeto de
empacotamento Tizen:

```text
api/                                   # Backend Python/FastAPI
├── main.py                            # app, CORS, event loop do Windows
├── alembic/versions/                  # ← nova migração (colunas em sources)
├── app/
│   ├── models/
│   │   ├── source.py                  # ← alterado (formatos, modo, migração)
│   │   └── catalog_item.py            # ← alterado (id do provedor, categoria)
│   ├── routers/
│   │   ├── sources.py                 # ← alterado (abertura de fonte)
│   │   └── catalog_items.py           # reprodução (feature 003) — usa o formato gravado
│   ├── schemas/source.py              # ← alterado
│   └── services/
│       ├── importer.py                # ← alterado (duas fases, conector por tipo)
│       ├── provider_connector.py      # ← reescrito (player_api.php)
│       ├── m3u_parser.py              # intocado
│       ├── classifier.py              # intocado (D-007)
│       └── ssrf_guard.py              # ← alterado (irmão JSON, mesma política)
└── tests/                             # pytest + httpx.ASGITransport

tv-web/                                # Frontend React/TS/Vite
└── src/features/
    ├── home/HomeScreen.tsx            # ← alterado (indicação de modo limitado)
    └── import/importApi.ts            # ← alterado (avisar abertura de fonte)

CCPlayTv/                              # Projeto Tizen (.wgt) — não tocado aqui
```

**Structure Decision**: mantida a separação existente. O peso é do backend: o
conector, a publicação em duas fases e a política de frescor. O frontend muda
só na borda — sinalizar modo limitado na Home e avisar o backend que uma
fonte foi aberta (D-004). O `classifier.py` e o `m3u_parser.py` ficam
intocados: o caminho M3U continua exatamente como está, porque ele é o
fallback (FR-010) e regressão ali quebraria fontes que funcionam hoje.

## Complexity Tracking

> Preencher SOMENTE se o Constitution Check tiver violações que precisam ser justificadas

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| (nenhuma) | | |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Esta feature é majoritariamente backend, e quase tudo dela é testável sem
rede: as respostas do painel são JSON, então o conector se testa com payloads
fixos. O que **não** se testa sem o provedor real é se aquele painel fala o
protocolo — e é justamente por isso que o caminho de modo limitado (US3) tem
de ser verificável de forma independente.

- **Unitário (backend, pytest)**: normalização de endereço nas formas comuns
  e com subpath, incluindo recusa de credencial embutida; resolução de estado
  de conta nas três respostas (ativa, expirada, inválida) e com a primeira
  consulta falhando; escolha de formato a partir dos permitidos, com TS
  preferido e com ausência de formato; mapeamento de categorias e canais para
  a saída normalizada, preservando ordem.
- **Contrato/integração (backend, pytest)**: abertura de fonte não migrada
  dispara job; abertura de fonte migrada e fresca **não** dispara nada;
  abertura de fonte migrada e velha dispara; duas aberturas seguidas não criam
  dois jobs; job concluído substitui o catálogo (contagem não dobra); job que
  falha preserva o catálogo anterior e não avança a marca de sincronização.
- **Regressão explícita do R-001**: um teste que importa duas vezes a mesma
  fonte e afirma que a contagem de itens **não** cresce. É a prova de que o
  bug de duplicação morreu.
- **Componente (frontend, vitest)**: a Home mostra a indicação de modo
  limitado quando a fonte vem marcada assim, e não a mostra no caso normal.
- **Manual**: `quickstart.md` — a única forma de saber se o painel do usuário
  fala o protocolo, e a verificação de que a reprodução na TV não regrediu
  (SC-006).

Comandos-base:

```powershell
# Backend (exige Postgres de pé)
cd api
uv run alembic upgrade head
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
| Modelo e migração (Fase 1) | **Concluído.** `ProviderImportMode`, formatos/modo/marca de migração em `Source`, identificador e categoria do provedor em `CatalogItem`. Migração `307ba52e3904` aplicada sobre o banco real (72 fontes, 321.758 itens) sem exigir reimportação. |
| Publicação em duas fases / política de rede (Fase 2) | **Concluído. R-001 corrigido e provado com teste de regressão contra o Postgres real.** `_persist_entry` grava `published=False`; sucesso publica o job corrente e remove os anteriores da mesma fonte numa transação; falha/cancelamento descartam o que o job não publicou. `fetch_json_ssrf_safe` em `ssrf_guard.py`, delegando ao guardião de texto. |
| Conector Xtream JSON (Fase 3) | **Concluído.** `provider_connector.acquire()` fala o protocolo, preserva categoria/identificador do provedor, deriva formato de reprodução do permitido pela conta, e cai no fallback M3U quando o painel não responde. 70 testes de backend passando. |
| Estado de conta (Fase 4) | **Concluído.** Credencial recusada/expirada marca `connection_state=ERROR`; falha genérica não degrada o estado. 92 testes passando. |
| Modo limitado (Fase 5) | **Concluído.** `provider_import_mode` exposto na API; Home mostra selo discreto "Modo limitado". Detecção confirmada em exatamente 4 requisições, sem varredura. 94 backend + 59 frontend passando. |
| Migração única e atualização por idade (Fase 6) | **Concluído.** `POST /sources/{id}/open` decide migrar/atualizar/nada no backend (D-004); `App.tsx` dispara e acompanha, invalidando o catálogo ao concluir. `LiveScreen` reescrito para derivar foco por identidade a cada render — nunca mais índice desalinhado após troca de catálogo. 100 backend + 62 frontend passando. |
| Polish (Fase 7) | **Concluído.** T038-T040 (auditoria de segredos, selo tokenizado, docs atualizadas) + T041 (verificação manual completa na TV física, 2026-09-18: Cenários A/D/E verificados ponta a ponta, B/C não observados por falta de infraestrutura de teste — ver `tasks.md`) + T042/T043 (dois bugs achados durante T041 e corrigidos: índices ausentes em `catalog_items`, e limpeza da publicação em duas fases não escopada por `kind`). **Feature 004 com todas as tasks concluídas** — pronta para `sdd-converge`. |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | **A importação nunca remove o catálogo anterior — resync duplica tudo.** Verificado no banco em 18/09/2026: fontes com 2 jobs têm exatamente o dobro de itens de fontes equivalentes com 1 job. `_publish_in_batches` só insere, e grava `published=True` direto. | **Alto e já existente em produção**: o botão "Ressincronizar lista" da Home duplica o catálogo hoje. Numa fonte de 311k, produz 622k linhas. E a atualização por idade (FR-020) transformaria isso em crescimento automático a cada 24 h. | **Resolvido (2026-09-18, T007)**: publicação em duas fases implementada e provada com teste de regressão (T004) contra o Postgres real — resync deixou de dobrar a contagem. |
| R-002 | **Reconciliação de estado do usuário no resync.** A constitution exige reconciliar por chave estável antes de expor o catálogo novo; a feature substitui o catálogo inteiro. | Nenhum hoje — favoritos e histórico não existem. Alto no dia em que existirem, se a costura não estiver pronta. | **Resolvido (fronteira mantida, 2026-09-18):** FR-006 grava a identidade estável, e D-002 cria o ponto onde a reconciliação vai entrar ("preparar → reconciliar → expor"). Convergência não achou nenhum caminho de código que exponha catálogo sem essa costura. Registrado nos itens 12, 13 e 25 do backlog como pré-requisito herdado. |
| R-003 | **O guardião de rede atual só devolve texto.** `fetch_text_ssrf_safe` faz streaming e decodifica; o conector precisa de JSON com a mesma política. | Médio: a saída fácil é instanciar um `httpx.AsyncClient` no conector, o que contorna validação por hop, limites e User-Agent sem ninguém perceber. | **Resolvido (2026-09-18, T008)**: `fetch_json_ssrf_safe` delega a `fetch_text_ssrf_safe` — reusa `validate_url` e a config do cliente por construção, não por disciplina. 3 testes cobrindo corpo válido, corpo não-JSON e host bloqueado. |
| R-004 | **Importação roda em `BackgroundTasks`, no processo do FastAPI.** Uma reimportação de 311k entradas disputa o mesmo processo que serve a TV. | Médio: com atualização automática por idade, isso deixa de ser eventual e passa a ser rotina. | **Resolvido nesta fatia (aceito, 2026-09-18):** o worker durável continua sendo o item 21 do backlog — não é desta feature. Mitigação local (uma importação por fonte por vez, FR-017) confirmada em código. No T041, o usuário navegou e reproduziu um canal **com um resync real de 2266 itens rodando em segundo plano**, sem lentidão perceptível relatada — não é benchmark formal, mas é a única evidência disponível e não aponta problema. |
| R-005 | **Mais pontos de saída manipulando senha.** O conector novo fala com o painel em várias consultas, e monta a URL de reprodução. | Alto se vazar: é a credencial do provedor do usuário. | **Resolvido, com uma lacuna aceita (2026-09-18):** D-003 + FR-018 confirmados em código (nenhum `httpx.AsyncClient` avulso; nenhuma interpolação real de `str(exc)` de exceção httpx). Ciclo de **sucesso** verificado ao vivo na TV (cadastro da fonte "Vip" com credencial real — nenhum segredo em tela, resposta ou log). Ciclo de **falha** (senha errada) não foi exercitado ao vivo nesta rodada — mesma lacuna aceita do achado C-01 da convergência, coberta só por `test_provider_connector.py`/`test_sources_api.py`. |
| R-006 | **O catálogo troca embaixo de quem está navegando.** A atualização por idade conclui enquanto o usuário percorre a lista. | Médio: lista saltando ou foco perdido viola "Voltar Restaura Foco e Posição", que exige reconciliação por identificador. | **Resolvido (2026-09-18, T037)**: contra a previsão original, a reconciliação **é** testável em jsdom — `LiveScreen` deriva `groupIdx`/`channelIdx` da identidade focada a cada render, e o teste força uma troca de catálogo via re-render genuíno (ver R-009). A verificação manual na TV continua valendo como confirmação final, mas deixou de ser a única evidência. |
| R-009 | **`rerender()` do Testing Library pode ser um no-op silencioso.** Reusar a mesma referência de elemento JSX entre `render()` e `rerender()` faz o React aplicar bailout por identidade referencial na subárvore inteira — o componente nunca re-executa, e um teste que só reafirma o estado anterior "passa" sem testar nada. Descoberto ao escrever T037: duas implementações diferentes de `LiveScreen` davam o mesmo resultado (incorreto), o que apontava pro teste, não pro componente. | Alto para confiança de teste: um teste-armadilha desse tipo pode mascarar regressão futura indefinidamente. | **Resolvido:** construir um elemento JSX **novo** a cada chamada de `rerender`, nunca reusar a referência guardada do primeiro `render()` — aplicado em `LiveScreen.test.tsx`, confirmado pelos 3 testes de reconciliação passando de verdade. Registrado em Cuidados para Retomada para não se repetir em testes futuros que simulem revalidação de dados. |
| R-007 | **A suíte de backend grava no mesmo banco de desenvolvimento.** Descoberto na convergência da 003: parte das 50 fontes da Home veio de execuções de `pytest`. | Baixo para a feature, médio para a leitura de qualquer verificação manual: o que se vê na tela pode ser resíduo de teste. | **Resolvido (2026-09-18):** mitigação (aviso no `quickstart.md`) se manteve suficiente durante o T041 — a fonte real ("Lista Real") foi identificada corretamente pelo nome apesar do ruído. O volume real era maior que o estimado (~415 fontes de teste, não 50); removidas do banco de desenvolvimento a pedido do usuário durante a própria sessão de verificação. |
| R-008 | **O painel do provedor pode simplesmente não falar o protocolo JSON.** | Médio: a US1 e a US2 não seriam verificáveis com a fonte real disponível. | **Resolvido — risco não se materializou (2026-09-18):** o painel real falou JSON (`provider_import_mode: xtream_api` confirmado em duas fontes), então o caminho principal (US1/US2 parcial) foi o que se verificou. Efeito colateral aceito: o caminho de modo limitado (US3) não foi exercitado por infraestrutura real no T041, só por teste automatizado — exatamente a troca que este risco previa. |
| R-010 | **`catalog_items` não tinha índice em `source_id`, `import_job_id` nem `parent_id` — só a chave primária.** Descoberto no T041: apagar uma fonte de teste (`DELETE /sources/{id}`) travou ~30 min porque o Postgres varre a tabela inteira (300k+ linhas) por linha apagada, checando a FK auto-referenciada `parent_id` sem índice de apoio. O mesmo bloqueou a limpeza da publicação em duas fases desta própria feature (D-002) — dois `DELETE` concorrentes na mesma tabela ficaram presos em lock de transactionid um no outro. | **Alto, pré-existente desde a feature 001** (não é código desta feature), mas só se manifestou em escala real de produção (a nota em Cuidados para Retomada dizia "testado com 321k+ itens sem problema" — era verdade pra um teste que não incluía o padrão de FK auto-referenciada em volume real; ver correção na mesma seção). | **Resolvido (2026-09-18, T042)**: migração `afccacac27b5` adiciona os três índices; `CatalogItem.source_id`/`import_job_id`/`parent_id` ganharam `index=True` no modelo. Resync da fonte real (2266 canais, catálogo anterior de 321k+ itens a substituir) passou a completar em segundos. |
| R-011 | **A limpeza da publicação em duas fases (`_publish_in_batches`) apagava o catálogo inteiro da fonte, não só o que o job novo publicou.** Descoberto no T041: migrar "Lista Real" pro conector novo (que só fala canal ao vivo nesta fatia) apagou silenciosamente os 29.722 filmes / 10.229 séries / 278.356 episódios que o caminho M3U antigo já tinha importado pra ela — sem nenhuma linha da spec autorizando essa perda. | Alto para integridade de dado (ainda que hoje sem efeito visível: Filmes/Séries seguem lendo `mockCatalog.ts`, não este catálogo). Teria virado perda real e silenciosa assim que os itens 9/10 do backlog passassem a ler estes dados. | **Resolvido (2026-09-18, T043)**: a limpeza passou a ter `.where(kind == CHANNEL)` quando `provider_import_mode == XTREAM_API`; o caminho M3U (que fala todos os tipos) continua substituindo o catálogo inteiro, mantendo a correção do R-001. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-18 | Fase 1 (Setup) | Campos novos em `Source`/`CatalogItem` e migração `307ba52e3904` gerada e aplicada sobre o banco real (72 fontes, 321.758 itens), sem exigir reimportação. `ruff` limpo nos arquivos tocados. | Nenhuma. |
| 2026-09-18 | Fase 2 (Foundational) | Publicação em duas fases em `importer.py` (D-002) — corrige o R-001, provado com teste de regressão contra o Postgres real. `fetch_json_ssrf_safe` em `ssrf_guard.py` (D-003), delegando ao guardião de texto. 53 testes de backend passando (47 + 6 novos). | Nenhuma. |
| 2026-09-18 | Fase 3 (US1) | `provider_connector.py` reescrito: protocolo JSON com fallback M3U, categoria/identificador do provedor preservados, formato de reprodução derivado do permitido pela conta. 70 testes passando. **Achado e corrigido na mesma task**: 5 testes pré-existentes tinham o alvo do monkeypatch errado (a arquitetura mudou onde a chamada de rede acontece) — 2 quebravam de verdade, 3 "passavam" sem testar o que diziam. Corrigidos; um deles motivou distinguir erro HTTP de falha de rede na resolução de status de conta. | Nenhuma. |

| 2026-09-18 | Fase 4 (US2) | `connection_state=ERROR` passou a refletir credencial recusada/expirada (FR-016), sem degradar o estado em falhas genéricas de rede — antecipando o cuidado que FR-023 vai exigir da atualização por idade. 92 testes passando. | Nenhuma. |

| 2026-09-18 | Fase 5 (US3) | `provider_import_mode` exposto em `SourceOut`; Home com selo "Modo limitado" reusando a linguagem visual de `.live-item-badge`. Detecção confirmada em exatamente 4 requisições (3 tentativas + fallback), sem varredura (D-005). 94 backend + 59 frontend passando. | Nenhuma. |
| 2026-09-18 | Fase 6 (US4/US5) | `maybe_refresh_on_open()` + `POST /sources/{id}/open` (D-004): migração única, atualização por idade (24h), guarda de job ativo, resync explícito preservado. `App.tsx` dispara e acompanha; `LiveScreen` reescrito pra derivar foco por identidade a cada render — corrige o R-006 e, no caminho, expôs o R-009 (armadilha de `rerender()` com elemento reusado mascarando teste). 100 backend + 62 frontend passando. | Nenhuma. |
| 2026-09-18 | Fase 7 (Polish) — T038-T040 | Auditoria de segredos confirmada por busca, não só leitura (nenhum `httpx.AsyncClient` fora de `ssrf_guard.py`; todo `str(exc)` é de exceção própria). Selo da Home revisado (cor/fonte/borda tokenizados; geometria do pill igual à de `.live-item-badge`, por design). `CLAUDE.md` e `.planning/backlog.md` atualizados com o estado real: get.php deixou de ser o caminho único, VOD/séries seguem como próxima fatia. `npm run build` limpo (86 módulos). | **T041 é o único item restante da feature inteira** — validação manual com a TV, que só o usuário pode conduzir. |
| 2026-09-18 | Fase 7 (Polish) — T041-T043 | Verificação manual completa na TV física (QN50Q60DAGXZD): Cenário A verificado duas vezes (fonte migrada + fonte cadastrada do zero pelo controle remoto, credenciais reais), D e E verificados com evidência real de banco e de tela; B/C não observados por falta de conta expirada/inválida e de painel não-JSON reais. Dois bugs achados durante a verificação, ambos dentro do escopo desta feature (T042, T043 — ver R-010/R-011): índices ausentes em `catalog_items` causando travamento de dezenas de minutos num `DELETE` em escala real, e a limpeza da publicação em duas fases apagando VOD/série que o job novo nunca produziu. Ambos corrigidos e reverificados (100 backend + 64 frontend passando). Um terceiro bug, **fora do escopo desta feature** (herdado da 001), bloqueava o cadastro de fonte pelo controle remoto — tratado à parte via `sdd-bugfix` (`sdd/bugs/enter-controle-remoto-nao-ativa-botoes/`, `verified`), não como task desta feature. Efeito colateral do trabalho: ~415 fontes de teste acumuladas (R-007) removidas do banco de desenvolvimento a pedido do usuário. | Nenhuma — feature com todas as tasks concluídas. |

**PRÓXIMO**: `sdd-converge` na feature — todas as tasks de `tasks.md` estão
concluídas, incluindo T041-T043.

## Arquivos Principais

- `api/app/services/provider_connector.py` — reescrito por completo.
- `api/app/services/classifier.py` — `ClassifiedEntry.provider_stream_id`/
  `provider_category_id`, `url` agora opcional.
- `api/app/services/importer.py` — publicação em duas fases + wiring do
  conector novo (`_acquire`, `run_import_job`, `_persist_entry`).
- `api/app/services/ssrf_guard.py` — `fetch_json_ssrf_safe`.
- `api/tests/test_provider_connector.py` — novo, cobertura unitária do
  conector (T010-T012).
- `api/tests/test_sources_api.py` — regressão do R-001 (T004-T006) +
  integração ponta a ponta do protocolo JSON + 5 testes de provedor
  corrigidos + estado de conta e modo limitado (T019/T020/T023/T024).
- `api/tests/test_ssrf_guard.py` — cobertura do irmão JSON (T009).
- `api/app/schemas/source.py` / `api/app/routers/sources.py` —
  `provider_import_mode` exposto na API.
- `tv-web/src/features/home/HomeScreen.tsx` + `screens.css` — selo de modo
  limitado.
- `api/app/services/importer.py` — `maybe_refresh_on_open`, `STALE_AFTER`.
- `api/app/routers/sources.py` + `api/app/schemas/source.py` — endpoint
  `POST /sources/{id}/open`.
- `tv-web/src/App.tsx` — dispara e acompanha a atualização em segundo plano.
- `tv-web/src/features/live/LiveScreen.tsx` — foco derivado por identidade.
- `tv-web/src/features/live/LiveScreen.test.tsx` — reconciliação (T037) +
  correção do helper de `rerender` (R-009).
- `api/app/models/catalog_item.py` — `index=True` em `source_id`,
  `import_job_id`, `parent_id` (T042/R-010).
- `api/alembic/versions/afccacac27b5_*.py` — migração dos três índices.
- `api/app/services/importer.py` — limpeza da publicação em duas fases
  escopada por `kind` quando `provider_import_mode == XTREAM_API` (T043/R-011).
- `tv-web/src/lib/useRemoteNav.ts` — fix fora do escopo desta feature (ver
  `sdd/bugs/enter-controle-remoto-nao-ativa-botoes/`), necessário para o
  T041 conseguir cadastrar fonte pelo controle remoto.

## Cuidados para Retomada

- **`alembic revision --autogenerate` gera imports em estilo antigo**
  (`from typing import Sequence, Union`), diferente da migração existente no
  repo (`from collections.abc import Sequence`, `str | Sequence[str] |
  None`). Ajustar manualmente antes do `ruff check` para não gerar diff de
  estilo gratuito.
- O engine do Alembic é síncrono (`psycopg[binary]`); nenhum ajuste de event
  loop do Windows é necessário ali — só em scripts próprios que usam
  `create_async_engine` fora do FastAPI (mesmo cuidado do event loop do
  Windows já vale para qualquer script solto, como visto ao consultar o
  banco diretamente).
- **A remoção do catálogo anterior não precisou de lotização**, ao contrário
  do que o plano cogitava. `DELETE`/`UPDATE` via Core (`sqlalchemy.delete`/
  `update`) são DML de conjunto — não carregam linha por linha em memória
  Python, diferente de `session.add()` num laço ORM. O mesmo padrão que
  `delete_source` já usava nesta tabela. Testado contra o banco real com
  321k+ itens sem problema.
  **Atualização (T041, 2026-09-18):** essa nota estava incompleta — "sem
  problema" valia pra volume, mas não pra FK auto-referenciada sem índice
  de apoio. Um DML de conjunto ainda paga, por linha apagada/atualizada,
  o custo de checar toda FK que aponta pra ela; sem índice em
  `parent_id`/`source_id`/`import_job_id`, cada checagem é um seq scan da
  tabela inteira. Em 321k+ linhas reais isso travou dezenas de minutos
  (ver R-010) — só não apareceu antes porque nenhum teste automatizado
  chega perto dessa escala. Índice nas colunas de FK não é opcional a
  partir de um certo volume, mesmo com DML de conjunto.
- Ao testar "importação em andamento" (T005), não há como pausar de verdade
  o `BackgroundTasks` do FastAPI via `httpx.ASGITransport` — ele roda antes
  do `await client.post(...)` retornar, no mesmo loop. O padrão que
  funciona (já usado em `test_cancel_running_job` do `test_import_jobs_api.py`)
  é chamar as funções de `importer.py` diretamente (`create_resync_job`,
  `_persist_entry`) via `get_session_factory()`, sem passar pelo HTTP.
- **`monkeypatch.setattr(modulo_errado, "funcao", fake)` falha em silêncio.**
  Com `from x import y`, cada módulo que faz esse import tem sua PRÓPRIA
  cópia do nome — corrigir num módulo não afeta o outro. Ao mover a chamada
  de rede de `importer.py` para `provider_connector.py` nesta feature, 5
  testes que corrigiam `importer_module.fetch_text_ssrf_safe` pararam de
  fazer efeito: 2 quebraram (dependiam de rede/DNS real), 3 continuaram
  "verdes" sem executar o `fake_fetch` nenhuma vez. Regra prática: sempre
  que uma função importada por `from` muda de "quem a chama de fato",
  procurar todo `monkeypatch.setattr` daquele nome e conferir se ainda mira
  o módulo certo — um teste verde não é prova de que o mock foi usado.
- **Erro HTTP ≠ falha de rede, na resolução de status de conta.** Um 401/403
  do painel significa que o endpoint existe e respondeu recusando —
  provavelmente credencial errada, não "protocolo ausente". Tratar os dois
  como a mesma coisa faria `_resolve_account_status` desperdiçar o fallback
  M3U (que falharia de novo, com a mesma credencial) e, pior, arriscaria
  vazar a senha embutida na URL por um caminho a mais antes de conatar isso.
  A distinção (`httpx.HTTPStatusError` guardado à parte de
  `httpx.TransportError`/`SSRFValidationError`) resolve os dois problemas de
  uma vez.
- **`rerender()` do Testing Library com o mesmo elemento JSX é um no-op
  silencioso** (R-009). Reusar a referência guardada do primeiro `render()`
  faz o React aplicar bailout por identidade referencial — o componente
  nunca re-executa, e um teste que só reafirma o estado anterior passa sem
  testar nada. Sempre construir um elemento novo a cada `rerender` quando o
  teste simula uma revalidação de dados (mock de hook mudando entre
  renders). Sinal de alerta: se DUAS implementações diferentes do
  componente sob teste produzem o MESMO resultado (incorreto), suspeite do
  teste antes do componente.
- **`ImportJob` criado direto por `create_source_and_job`/`create_resync_job`
  em teste, sem passar pelo router, fica `QUEUED` para sempre** — o
  `BackgroundTask` que rodaria `run_import_job` nunca é agendado. Isso conta
  como "importação em andamento" para o guard de `maybe_refresh_on_open`
  (FR-017), o que é correto em produção mas engana um teste que queira
  simular "fonte antiga, nunca migrada": marque o job inicial como terminal
  manualmente (`job.status = ImportJobStatus.FAILED`) antes de testar o
  comportamento de abertura.
- **Datas capturadas antes de uma mutação não servem de referência "antes"
  da mutação seguinte.** Ao testar que uma falha não avança
  `last_successful_sync_at`, capture o valor **depois** de envelhecê-lo
  manualmente (o valor que a atualização por idade encontrou), não o valor
  original da primeira importação — senão a asserção compara contra o
  timestamp errado.
- **Tabela sem índice em coluna de FK trava silenciosamente sob DML de
  conjunto, sem log de erro** (R-010) — só aparece como uma query "ativa"
  há muito tempo em `pg_stat_activity`, nunca como exceção. Diagnóstico:
  `SELECT pid, state, wait_event_type, wait_event, now() - query_start,
  query FROM pg_stat_activity WHERE datname = '<db>'` — `state = 'active'`
  sem `wait_event` é a query genuinamente lenta (o índice que falta);
  `wait_event_type = 'Lock'` são as vítimas esperando a primeira liberar.
  `pg_terminate_backend(pid)` na travada faz rollback seguro (nenhum dado
  publicado é perdido) e libera as outras. Windows não tem `psql`
  instalado neste ambiente — usar `app.db.make_engine()` direto num
  script `uv run python -c "..."` com
  `asyncio.run(main(), loop_factory=lambda: asyncio.SelectorEventLoop(...))`
  (o `ProactorEventLoop` padrão do Windows não roda `psycopg` em modo
  async).
- **`kind` em `catalog_items` é armazenado em maiúsculas** (`'CHANNEL'`,
  não `'channel'`) — uma consulta SQL direta contra o banco (fora do ORM)
  precisa do valor exato do enum, não do `.value` Python minúsculo que a
  API expõe.

## Resultado Final

Convergência executada em 2026-09-18, sem achados que exigissem uma nova
fase de execução. As 55 tasks de `tasks.md` (Fases 1-7, incluindo T041-T043
anexadas durante a própria verificação) mapeiam 1:1 para código real:

- **Os dois conectores com saída comum (D-001)** existem e são
  intercambiáveis do ponto de vista do `importer` — confirmado lendo
  `_acquire()`, que só decide pelo `SourceType`, nunca pelo protocolo.
- **Publicação em duas fases (D-002)** funciona e foi reforçada durante a
  própria convergência: a limpeza que ela faz ao final passou a respeitar
  o `kind` que cada conector de fato produz (T043/R-011), depois de um
  achado real na TV física mostrar que ela apagava dado que não devia.
- **Política de rede única (D-003)**, **frescor decidido no backend
  (D-004)**, **compatibilidade por tentativa, não varredura (D-005)**,
  **formato decidido na importação (D-006)**, **só canais nesta fatia
  (D-007)** e **modo limitado como estado normal (D-008)** — todas
  confirmadas em código, sem desvio.
- **SC-001 a SC-003, SC-005 a SC-012**: confirmadas por evidência direta
  (código + observação ao vivo na TV física, QN50Q60DAGXZD) nesta sessão,
  com duas fontes de provedor reais — uma migrada do caminho antigo, outra
  cadastrada do zero pelo controle remoto com usuário/senha/DNS reais.
- **SC-004**: confirmada só parcialmente — o estado de conta ativa foi
  observado ao vivo; credencial inválida e assinatura expirada continuam
  cobertas apenas por teste automatizado (achado C-01 da convergência,
  aceito como limitação documentada em vez de bloquear o fechamento —
  ver R-005).

**Desvios acumulados em relação ao plano original**: nenhuma mudança de
arquitetura. Dois ajustes técnicos, ambos descobertos na própria
verificação manual e já registrados como R-010/R-011 e tasks T042/T043:
índices ausentes em `catalog_items` (bug de escala pré-existente da
feature 001, exposto pela primeira vez pelo volume real desta feature) e
a limpeza da publicação em duas fases precisando respeitar o `kind` que
cada conector produz (consequência direta de D-007 — "só canais" — que a
primeira versão do D-002 não tinha antecipado).

**Trabalho fora do escopo desta feature, mas necessário para verificá-la**:
o bugfix `enter-controle-remoto-nao-ativa-botoes` (`sdd/bugs/`), que
corrigiu um defeito herdado da feature 001 em `useRemoteNav.ts` que
impedia o cadastro de fonte pelo controle remoto físico. Tratado por
`sdd-bugfix` própria, fora de `tasks.md` desta feature.

**O que fica para a próxima fatia** (já fora de escopo aqui, por decisão
da spec): VOD e séries pelo mesmo protocolo — itens 9 e 10 do backlog.
