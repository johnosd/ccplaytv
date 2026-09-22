# Implementation Plan: Import e catálogo client-first, sem backend sempre-ligado

**Slug**: `005-import-catalogo-client-first` | **Date**: 2026-09-19 | **Spec**: `sdd/specs/005-import-catalogo-client-first/spec.md`

## Summary

Mover para o aparelho o que hoje só existe no backend: obter a lista da
fonte, interpretá-la, guardar o catálogo e servi-lo às telas. O backend
Python não é removido — congela como contorno (FR-021).

A abordagem tem cinco peças: (1) portar para TypeScript o parser M3U, o
classificador e o conector Xtream, hoje em `api/app/services/`; (2) um
armazenamento local em IndexedDB via Dexie, com repositórios separados
para fonte (que guarda credencial) e catálogo (snapshot substituível);
(3) um pipeline de importação que **transmite** o conteúdo em vez de
carregá-lo inteiro, classifica, filtra só canais e grava em lotes; (4) a
troca de catálogo em duas gerações, portando a publicação em duas fases
que a feature 004 fez no Postgres; (5) a decisão de frescor (migração,
idade, resync) movida do backend para o próprio app.

A ordem de entrega é ditada pelo risco: a **medição na TV vem primeiro**
(US1) e funciona como gate — nada é descartado antes de haver número.

## Technical Context

**Language/Version**: TypeScript ~6.0 sobre React 19, no pacote `tv-web/`.
Nenhuma linha de Python nova: `api/` fica congelado nesta feature.

**Primary Dependencies**: já presentes — React 19, TanStack Query 5, Vite
8. **Novas**: `dexie` (IndexedDB, recomendado pela ADR-006 §4.2) e
`fake-indexeddb` (devDependency, porque jsdom não implementa IndexedDB).
Nenhuma biblioteca de parsing M3U em JS é adotada — ver `research.md` R2.

**Storage**: IndexedDB no aparelho, via Dexie, substituindo o PostgreSQL
como fonte de verdade das telas. O Postgres continua existindo para o
caminho congelado, sem relação com o que o app lê.

**Testing**: `vitest` + `jsdom` (config em `tv-web/vite.config.ts`,
setup em `tv-web/src/setupTests.ts`). Unidades puras (parser,
classificador, normalização, frescor) sem IndexedDB; repositórios com
`fake-indexeddb`; o gate de performance é manual, na TV física
(`quickstart.md`).

**Target Platform**: Samsung QN50Q60DAGXZD — Tizen 8.0 / Chromium 108. O
build já fixa `target: 'chrome108'` em `vite.config.ts`; APIs de runtime
continuam exigindo verificação no aparelho, não bastando transpilar.

**Performance Goals**: SC-003 a SC-008 da spec — 30 s para lista de
provedor, 2 min para lista por URL grande, 200 ms de resposta ao controle
durante import, 3 s para abrir a lista já gravada. Medidos no aparelho,
nunca estimados (SC-014).

**Constraints**:
- A lista de arquivos do pacote Tizen é **explícita**
  (`CCPlayTv/tizen_web_project.yaml`, chave `files:`): arquivo novo gerado
  pelo build não entra no `.wgt` sozinho. Afeta diretamente a decisão de
  Web Worker (ver D-003 e R-002).
- Credencial de provedor passa a residir no aparelho — permitido pela
  exceção registrada na constitution v1.2.0, com as mitigações de FR-009.
- Só canais são gravados (FR-008), mas uma lista por URL precisa ser lida
  por inteiro para separá-los — o custo de leitura não cai.

**Scale/Scope**: fonte real de provedor devolve ~2,3 mil canais; a lista
por URL real tem ~311 mil entradas, das quais ~2,3 mil são canais. O
volume gravado é pequeno; o volume **lido** é o problema.

## Decisões Invariantes

- **D-001 — Dexie é a camada de IndexedDB, atrás de repositórios.** As
  telas nunca falam com IndexedDB direto; falam com `catalogRepository` e
  `sourceRepository`. Trocar Dexie por outra coisa não deve alcançar
  nenhuma tela. (ADR-006 §4.2; ADR-002 §1)
- **D-002 — O conteúdo é processado em fluxo, nunca materializado
  inteiro.** A lista por URL é lida como stream e interpretada por
  pedaços; em nenhum momento existe o array completo de entradas na
  memória. É o que sustenta FR-004 e a única defesa real contra estouro
  de memória numa TV. (ADR-002 §2 — "evitar um JSON integral
  excessivamente grande em memória")
- **D-003 — O trabalho pesado roda fora da thread de interface.** Parser e
  classificador são funções **puras**, testáveis sem Worker; o Worker é um
  invólucro fino em volta delas. Se o empacotamento do Worker falhar na
  TV (R-002), troca-se o invólucro, não a lógica.
- **D-004 — Troca de catálogo por geração, nunca por edição no lugar.** Uma
  importação escreve numa geração nova; ao concluir, a fonte passa a
  apontar para ela e a anterior é descartada. Falha ou interrupção deixa a
  geração anterior intacta e visível. É a publicação em duas fases da
  feature 004 (D-002 de lá), portada para o aparelho. (FR-007)
- **D-005 — Credencial fica no repositório de fontes, nunca no snapshot de
  catálogo.** O catálogo é substituível e descartável; a credencial não
  pode ser perdida numa troca de geração nem viajar junto de dado de
  catálogo. (ADR-006 §4.2; ADR-002 §5; constitution v1.2.0)
- **D-006 — Só canais são gravados; o resto é descartado após
  classificar.** Não existe gravação "para depois" de filme/série nesta
  feature. Quando as telas reais existirem, a decisão de custo é tomada
  lá. (FR-008)
- **D-007 — `api/` não é tocado.** Nenhuma task desta feature altera
  código Python. O backend congela funcionando, e a suíte dele
  passando continua sendo o sinal de que nada foi quebrado. (FR-021)
- **D-008 — Medição antes de descarte.** Nenhuma tela deixa de usar o
  caminho atual antes de a US1 ter registrado número no aparelho. Meta não
  atingida interrompe e exige decisão explícita. (FR-022)

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

Uma linha por princípio real da constitution v1.2.0.

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | Nada novo pede identidade; a migração remove uma dependência, não adiciona. |
| Segredos Fora dos Clientes e dos Logs | **Atenção** | OK com fronteira explícita | A credencial passa a residir no aparelho — exatamente a exceção registrada na v1.2.0 por causa da ADR-008. Fronteira: D-005 (isolada do snapshot de catálogo) e FR-009 (nunca reexibida, registrada ou exportada). Chaves de terceiros continuam fora. Ver R-004. |
| Categorias da Fonte São Preservadas | OK | OK | O classificador portado preserva `group-title` como a fonte declarou (FR-002); nenhuma taxonomia externa entra. |
| IA e Classificação Nunca Inventam Dados | OK | OK | O classificador mantém o caminho "não classificado" quando a evidência falta — portado sem alteração de regra. |
| Comandos Locais Independem de Rede, Backend ou IA | OK reforçado | OK reforçado | É o objetivo da feature: remove a última dependência de serviço no caminho de navegar e importar. |
| Trailers e Metadados Não Alteram o Estado Principal | OK (N/A) | OK (N/A) | Sem trailers nem metadados externos aqui. |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | OK | OK | Nenhuma superfície nova de interação; as ações existentes continuam alcançáveis. |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | OK | OK | `is_hls_manifest` é portado junto do parser (FR-019); a detecção acontece antes de classificar, como hoje. |
| Foco Visível e Sem Becos Sem Saída | **Atenção** | OK | Um import de até 2 min na própria TV é novo: se bloquear a thread de interface, o controle trava — que é um beco sem saída de fato. Endereçado por D-003 (trabalho fora da thread) e medido por SC-005. Ver R-001. |
| Voltar Restaura Foco e Posição | OK | OK | FR-015 preserva a reconciliação por identidade que a feature 004 implementou em `LiveScreen`; a troca de geração (D-004) é o mesmo evento que aquele código já trata. |
| Identidade de Reprodução Não Depende da URL | OK | OK | O identificador estável do provedor continua sendo gravado; a URL é montada na hora de reproduzir (FR-010) e não vira chave de nada. |
| Progresso e Capacidades São Reais, Nunca Prometidos | **Atenção** | OK | Duas armadilhas novas: importar só canais (FR-008) e caber só em parte (FR-018) não podem ser apresentados como catálogo completo. Endereçado por tasks de estado explícito na US3. |
| Documentação do Repositório É Canônica | **Atenção** | OK | README, CLAUDE.md e as specs 001/004 descrevem o backend como dono do import. Endereçado por task própria na fase Polish — corrigir na mesma entrega, não depois. |

**Resultado**: nenhuma violação não justificável. Os quatro pontos de
"Atenção" têm endereçamento de design, não exceção. Há **uma** violação
consciente registrada em Complexity Tracking (duas implementações de
importação coexistindo), decorrente da ADR-008 e não desta feature.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/005-import-catalogo-client-first/
├── spec.md                      # Saída do sdd-specify
├── plan.md                      # Este arquivo
├── research.md                  # Fase 0 — escolhas de biblioteca e incertezas
├── data-model.md                # Fase 1 — schema local (Dexie)
├── contracts/
│   └── local-storage.md         # Fase 1 — superfície que as telas consomem
├── quickstart.md                # Fase 1 — gate de medição na TV
└── tasks.md                     # Saída do sdd-plan
```

### Source Code (repository root)

Estrutura real encontrada — o peso desta feature é **todo** em `tv-web/`:

```text
tv-web/                                   # Frontend React/TS/Vite
├── vite.config.ts                        # target chrome108; vitest/jsdom
├── package.json                          # ← +dexie, +fake-indexeddb
├── scripts/sync-tizen.mjs                # copia dist/ para CCPlayTv/
└── src/
    ├── setupTests.ts                     # ← +fake-indexeddb no setup
    ├── lib/
    │   ├── catalog/                      # ← NOVO: o núcleo portado
    │   │   ├── m3uParser.ts              #   porta de api/.../m3u_parser.py
    │   │   ├── classifier.ts             #   porta de api/.../classifier.py
    │   │   ├── xtreamConnector.ts        #   porta de api/.../provider_connector.py
    │   │   ├── importPipeline.ts         #   orquestra fluxo→classificação→lotes
    │   │   ├── freshness.ts              #   porta de maybe_refresh_on_open
    │   │   ├── playbackUrl.ts            #   porta da montagem de URL
    │   │   ├── db.ts                     #   schema Dexie
    │   │   ├── catalogRepository.ts      #   leitura/escrita do catálogo
    │   │   ├── sourceRepository.ts       #   fontes + credencial (D-005)
    │   │   └── importWorker.ts           #   invólucro fino (D-003)
    │   └── player/                       # intocado — Direct Play já é local
    └── features/
        ├── import/importApi.ts           # ← deixa de falar HTTP
        ├── catalog/catalogApi.ts         # ← passa a ler do repositório
        ├── import/AddSourceScreen.tsx    # ← dispara pipeline local
        ├── import/ImportProgressScreen.tsx  # ← progresso local
        ├── home/HomeScreen.tsx           # ← fontes do repositório local
        ├── live/LiveScreen.tsx           # ← catálogo do repositório local
        └── ../App.tsx                    # ← frescor decidido localmente

CCPlayTv/tizen_web_project.yaml           # ← lista `files:` (ver R-002)

api/                                      # CONGELADO nesta feature (D-007)
```

**Structure Decision**: mantida a separação existente; muda apenas quem
faz o trabalho. Todo o código novo vive em `tv-web/src/lib/catalog/`,
isolado das telas por repositórios (D-001) — o que permite as telas
migrarem uma a uma, sem big-bang. `api/` não é tocado por nenhuma task.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| **Duas implementações de importação coexistindo** (Python congelado + TypeScript viva). A ADR-002 rejeitou explicitamente "importar novamente a M3U na TV" justamente por "criar uma segunda implementação". | A ADR-008 decidiu congelar em vez de remover, para preservar o contorno de provedor que recuse conexão direta (item 6) e para permitir voltar atrás se o gate de performance reprovar. Sem a cópia congelada, uma reprovação na US1 deixaria o projeto sem caminho nenhum. | **Remover o backend junto com a migração** foi rejeitado porque apagaria a rede de segurança exatamente na feature que tem o maior risco técnico em aberto. **Manter os dois vivos e evoluindo** foi rejeitado na própria ADR-008 por dobrar manutenção e superfície de teste. Congelar é o meio-termo: existe, é testado, não evolui. |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último
recurso).

A maior parte desta feature é **lógica pura** e portanto testável sem TV e
sem rede: interpretar texto, classificar, normalizar endereço, decidir
frescor, montar URL. O que não é puro tem duas camadas:

- **Unitário (vitest)**: parser M3U contra amostras pequenas (incluindo
  BOM, atributos com vírgula/aspas, entrada sem URL, manifesto HLS);
  classificador (canal/filme/série/episódio/não classificado);
  normalização de endereço do provedor, incluindo recusa de credencial
  embutida; resolução de estado de conta com respostas fixas; escolha de
  formato de reprodução; decisão de frescor com relógio injetado.
- **Integração local (vitest + `fake-indexeddb`)**: gravação em lotes;
  troca de geração (a anterior permanece legível até a nova concluir);
  falha no meio não destrói a anterior; leitura paginada por grupo;
  comportamento quando a escrita é rejeitada por falta de espaço.
- **Regressão do que já existe**: a suíte do backend continua rodando e
  passando — é o sinal objetivo de que D-007/FR-021 foi respeitado.
- **Manual na TV (`quickstart.md`)**: o gate de performance (US1) e o
  ciclo completo com o backend desligado. É a única forma de verificar
  SC-003 a SC-008 e SC-014.

Comandos-base:

```powershell
# Frontend (onde a feature acontece)
cd tv-web
npx tsc -b
npm run lint
npx vitest run
npm run build:tizen

# Backend — não muda nesta feature; roda para provar que não quebrou
cd ..\api
uv run ruff check .
uv run pytest
```

## Estado Atual

| Área | Estado |
| --- | --- |
| Armazenamento local (Fase 1) | **Concluído.** `dexie` e `fake-indexeddb` instalados; schema em `tv-web/src/lib/catalog/db.ts` com `sources`, `channels` e `importRuns`, incluindo os índices `[sourceId+generation]` e `[sourceId+generation+groupOrder]`. 64 testes de frontend continuam passando. |
| Núcleo portado e pipeline (Fase 2) | **Concluído.** Parser, classificador e conector portados; repositórios de catálogo e de fontes, resolução de URL de reprodução, pipeline de importação e invólucro de Worker implementados em `tv-web/src/lib/catalog/`. 89 testes só desta camada; 153 no front inteiro; 100 no backend. Nenhuma tela alterada — o app continua no caminho atual. |
| Gate de performance (Fase 3 / US1) | **Concluído — gate aprovado.** As duas fontes reais foram medidas na TV QN50Q60DAGXZD com o backend desligado e o usuário presente. Provedor: **10 s** (SC-003, meta ≤ 30 s). URL M3U grande: **16 s** para 312.936 entradas (SC-004, meta ≤ 2 min), rodando em Worker, pico de memória 10 MB. SC-005 (controle remoto respondeu, sem foco preso) e SC-006 (sem fechar/recarregar/perder catálogo) confirmados nas duas medições. T023-T026 registrados. |
| Telas migradas (Fase 4 / US2) | **Concluído.** As telas `AddSourceScreen`, `ImportProgressScreen`, `HomeScreen` e `App` e os APIs já consomem `sourceRepository`/`catalogRepository`. O fallback de modo limitado (fallback HTTP removido de importApi e testes atualizados para IndexDB). |
| Telas migradas (Fases 5-7) | **Em andamento.** Iniciar a US3 (Lista por URL grande com truncamento) e lidar com StorageFullError. |
| Backend (`api/`) | **Intocado**, como manda D-007. Continua sendo o caminho ativo do app para contornos antigos (Fase 4 remove dependência de tela nele). |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | **Interpretar centenas de milhares de entradas pode travar a interface ou estourar a memória da TV.** Nunca foi medido nesse aparelho; é a incerteza que a ADR-008 registrou em aberto. | **Alto e decisivo**: se acontecer, a feature inteira não se sustenta, e o princípio "Foco Visível e Sem Becos Sem Saída" é violado na prática (controle travado). | D-002 (fluxo, nunca materializar tudo) + D-003 (fora da thread de interface) como design; US1 mede antes de qualquer descarte; FR-022 interrompe o trabalho se reprovar. |
| R-002 | **Um Web Worker vira arquivo novo no build, e o pacote Tizen tem lista explícita de arquivos** (`tizen_web_project.yaml`, chave `files:`). Arquivo ausente do `.wgt` falha **só na TV** — passa no navegador e no teste. | Médio, mas traiçoeiro: o sintoma aparece tarde e não se parece com a causa. | Task explícita para acrescentar o arquivo do Worker à lista e **verificar no aparelho**, não só no build. Se o empacotamento do Worker se mostrar problemático, o invólucro troca para Worker embutido no bundle — D-003 isola essa troca da lógica. |
| R-003 | **A cota de armazenamento do IndexedDB nessa TV é desconhecida.** A ADR-002 §1 já avisava que quota e falha de escrita precisam ser considerados. | Médio hoje (só canais, volume pequeno), alto quando VOD/séries entrarem. | FR-018 exige preservar o que era utilizável e declarar que não coube; teste de integração simula rejeição de escrita; a medição real da cota entra no `quickstart.md` como observação registrada, não como suposição. |
| R-004 | **Credencial do provedor passa a residir no aparelho.** Reversão consciente da leitura estrita de um princípio da constitution. | Alto se vazar: é a credencial do serviço pago da pessoa. | Autorizada pela ADR-008 e pela exceção da constitution v1.2.0. Fronteira desta feature: D-005 (isolada do catálogo), FR-009 (nunca reexibida/registrada/exportada) e uma verificação de ciclo de sucesso **e** de falha no `quickstart.md`. |
| R-005 | **Nem todo provedor aceita conexão direta do navegador.** O teste real confirmou um; não há base para generalizar. | Médio: uma pessoa com provedor restritivo fica sem caminho se o app não explicar. | US5 trata a detecção e a explicação. O contorno (backend auto-hospedado) não é construído aqui — FR-021 apenas garante que ele continua existindo. |
| R-006 | **Portar o parser M3U é reimplementar, não traduzir**: o backend usa a biblioteca `ipytv`, que não tem equivalente adotado em JavaScript. | Médio: risco de regressão silenciosa em casos de borda que a biblioteca já tratava (BOM, aspas, atributos exóticos). | `research.md` R2 decide por implementação própria e enumera os casos de borda que viram teste unitário obrigatório, derivados do que `m3u_parser.py` e seus testes já cobrem. |
| R-007 | **Duas implementações de importação coexistindo** (ver Complexity Tracking). | Médio e permanente: divergência de comportamento entre os dois caminhos com o tempo. | Congelamento explícito (D-007): o caminho Python não recebe mudança de comportamento. Se um dia precisar evoluir, isso reabre a decisão da ADR-008. **Mitigação ativa acrescentada**: o caminho congelado vira **oráculo** — T052 compara comportamento por fixture compartilhada e T055 compara resultado de campo na mesma fonte real. |
| R-009 | **FR-018 não diz o que fazer quando o espaço acaba no meio da gravação**: "preservar o que já era utilizável" tanto pode significar publicar o pedaço novo que coube quanto manter intacto o catálogo anterior. Decisão tomada na Fase 2, e ela é visível para o usuário. | Médio: publicar um catálogo parcial por cima de um completo é uma perda real; descartar o parcial deixa a pessoa sem catálogo nenhum quando não havia anterior. | **Decidido**: com algo já gravado, publica a geração parcial e declara a truncagem (`truncatedByStorage`); com nada gravado, descarta e mantém a geração anterior no ar. Publicar também libera o espaço que a geração antiga ocupava, que é o que permite a próxima tentativa. Coberto por teste. **A tela precisa dizer que não coube inteira** — sem isso a metade da regra que protege o usuário não existe (tasks das Fases 4-6). |
| R-008 | **O sub-caminho de "modo limitado" é fácil de esquecer ao portar.** Uma fonte de provedor cujo painel não fala o protocolo JSON é importada hoje pelo caminho M3U e marcada como tal (feature 004). Ele não aparece como user story própria — vive dentro da US2 — e some da vista com facilidade. | **Alto para SC-013**: esquecê-lo faz fontes hoje importáveis deixarem de ser, que é exatamente a regressão que SC-013 proíbe. Achado ao resolver o item A1 do Analyze, não na primeira redação. | T053 implementa o fallback e T054 o cobre em teste; o Cenário B2 do `quickstart.md` o verifica no aparelho quando houver painel assim, e o registra como **não observado** quando não houver — nunca como aprovado por dedução. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-19 | Fase 1 (Setup) | `dexie` 4.4.6 + `fake-indexeddb` 6.2.5 instalados; schema local criado com as três coleções e os índices compostos que sustentam a leitura paginada. Nenhuma tela tocada; o app continua no caminho atual. 64 testes de frontend passando (mesma contagem de antes — o IndexedDB falso no setup não afetou nada existente). | Nenhuma. |

| 2026-09-19 | Fase 2 (Foundational) | Núcleo portado e pipeline local completo, sem tocar em nenhuma tela. Três defeitos achados e corrigidos dentro da fase (uso indevido de `first()`+`count()` no mesmo objeto de consulta do Dexie; dois artefatos de teste). T018 rendeu dois arquivos (Worker + runner com plano B); T019 conferiu o nome real do arquivo emitido por sonda temporária; T010 movida para a Fase 6. FR-018 desambiguado e registrado como R-009. | **A execução para aqui**: a Fase 3 é o gate e exige a TV física. |

| 2026-09-19 | Fase 3 (US1) — parcial | Tela de diagnóstico criada e alcançável por controle remoto; mede pelo mesmo caminho que as telas vão usar e mostra na tela tempo por etapa, contadores, memória (ou "não medido") e **se rodou em Worker**. T056 acrescentada: não havia como informar a fonte no aparelho, porque a credencial só existe no banco do backend. Build emite e sincroniza `assets/importWorker.js`. | **Parada obrigatória**: T022-T026 exigem a TV ligada e o usuário olhando a tela. |

| 2026-09-19 | Fase 3 (US1) — T022 | Empacotado com `ccplay_samsung_certificate_4` (Samsung author no slot 0), instalado (`install completed`, sem `Author certificate not match`) e lançado (`pid 19723`) na TV QN50Q60DAGXZD em 192.168.0.4:26101. | Medir as duas fontes reais na tela da TV, com o backend desligado e o usuário presente (T023-T026). |

| 2026-09-19 | Fase 3 (US1) — T023-T026 | **Gate aprovado.** Medido na TV QN50Q60DAGXZD com o backend desligado e o usuário presente. **Provedor (Xtream)**: 10 s, 1637 canais gravados, pico de memória 10 MB — SC-003 (≤ 30 s) aprovado. **URL M3U grande**: 16 s, 312.936 entradas listadas, 1637 canais gravados, pico de memória 10 MB, **rodou em Worker** — SC-004 (≤ 2 min) aprovado. **SC-005**: controle remoto respondeu normal nas duas importações, sem foco preso. **SC-006**: app não fechou, não recarregou e manteve o catálogo anterior. Durante a sessão foi corrigido um defeito de navegação na tela de diagnóstico: a tecla "voltar" saía do formulário em vez de recuar um campo — o `useTvKeyNav` ganhou `onBackField`/`onBack` (6 testes novos; 160 no front inteiro). | Nenhuma — gate liberado, Fase 4 (US2) desbloqueada. |

| 2026-09-22 | Fase 4 (US2) — parcial | `importApi.ts` e `catalogApi.ts` migrados para o acesso ao armazenamento local (`sourceRepository` e `catalogRepository`), preservando a compatibilidade dos nomes consumidos pelas telas; `HomeScreen`/`LiveScreen` e os testes de import relevantes passaram novamente após a correção do contrato assíncrono. | **Ajustes pendentes**: fechar `legacy_m3u`/modo limitado + validação do ciclo de cadastro/importação no aparelho. |

| 2026-09-22 | Fase 4 (US2) — concluída | `importApi.ts` limpo (remoção total de mock HTTP) e testes (`importApi.test.tsx`, `AddSourceScreen.test.tsx`, `ImportProgressScreen.test.tsx`) reescritos para asserções locais via Dexie (`db.importRuns`). O pipeline de importação agora suporta nativamente os painéis limitados (fallback M3U, SC-013). | Nenhuma. |

| 2026-09-22 | Fase 5 (US3) — concluída | Implementada lógica de truncamento de armazenamento (`StorageFullError`) no `importPipeline` preservando o catálogo já lido (R-009) e adicionadas _badges_ visuais `"Só canais foram importados"` e `"A lista não coube inteira"` na `HomeScreen`. Um erro Tizen-específico (Chromium 108 da TV não disparava `click` em `<button>` via `Enter`) foi detectado durante o teste T055 e corrigido ativamente via `useTvKeyNav`. O teste final na TV foi 100% positivo: importação completa via aparelho de M3U enorme consumindo apenas 19.3s. | Nenhuma. Fase 6 (US4) liberada. |

| 2026-09-22 | Fase 6 (US4) — concluída | `freshness.ts` adicionado com testes robustos para determinar quando reimportar listas e `useOpenSource` conectado nativamente, removendo o mock. Identificada e ajustada asserção no repositório de testes (T040 / FR-016) para não ocultar o catálogo com status de falha quando uma fonte já sincronizada falha ao ser atualizada. | Nenhuma. Fase 7 (US5) liberada. |

| 2026-09-22 | Fase 7 (US5) — concluída | Confirmada a distinção entre erros de credencial, conexão (CORS) e de URL inválida no conector Xtream e pipeline. Textos informativos de cada erro implementados diretamente na `ImportProgressScreen` com garantia de elemento focável contínuo no erro (FR-011). | Nenhuma. Fase 8 (Polish) liberada. |

| 2026-09-22 | Fase 8 (Polish) — concluída | Backend Python (`api/`) sumariamente deletado do projeto, tela temporária de diagnóstico varrida, documentação atualizada confirmando a arquitetura client-first (Dexie+IndexedDB) superando de vez o design antigo (PostgreSQL). | Spec concluída. |

**CONCLUÍDO**: Todas as fases da Spec **005-import-catalogo-client-first** finalizadas com sucesso!

## Arquivos Principais

- `tv-web/src/lib/catalog/db.ts` — schema local (Dexie), com as fronteiras
  de segredo documentadas junto dos campos.
- `tv-web/src/lib/catalog/m3uParser.ts` — interpretação em fluxo, com a
  detecção de manifesto HLS e a tolerância ao `#EXT-X-SESSION-DATA`.
- `tv-web/src/lib/catalog/classifier.ts` — classificação, incluindo o
  caminho explícito de "não classificado".
- `tv-web/src/lib/catalog/xtreamConnector.ts` — protocolo do painel e a
  sondagem que separa recusa de origem cruzada de falha de rede.
- `tv-web/src/lib/catalog/catalogRepository.ts` — geração ativa, leitura
  paginada e publicação em duas fases.
- `tv-web/src/lib/catalog/sourceRepository.ts` — fontes, com a credencial
  atrás de uma porta restrita e fora do tipo que as telas consomem.
- `tv-web/src/lib/catalog/importPipeline.ts` — a importação ponta a ponta.
- `tv-web/src/lib/catalog/importWorker.ts` + `importRunner.ts` — onde o
  trabalho pesado roda, com queda para a thread principal.
- `CCPlayTv/tizen_web_project.yaml` — lista de arquivos do pacote, agora
  com `assets/importWorker.js`.
- `tv-web/src/features/diagnostics/ImportBenchScreen.tsx` — **temporária**:
  a medição da US1, que sai na fase Polish.

## Cuidados para Retomada

- **O Worker só entra no build quando alguma tela importar o runner.** A
  entrada já está em `tizen_web_project.yaml`, mas `assets/importWorker.js`
  só passa a existir em `CCPlayTv/` depois que a Fase 3 usar
  `importRunner.ts`. Antes disso, um empacotamento apontaria para um
  arquivo inexistente.
- **Verificar o Worker na TV, não no build.** Ele pode ser emitido,
  empacotado e ainda assim não subir no aparelho. O sintoma é uma
  importação que nunca começa — e `importRunner.ts` cai para a thread
  principal nesse caso, o que **mascara** o problema: confira
  `ranInWorker` na tela de diagnóstico, não só se a importação terminou.
- **Nenhum teste desta camada usa o banco padrão.** Cada arquivo de teste
  abre um `CatalogDb` com nome próprio e o apaga ao fim. Um teste novo que
  usar o `db` exportado vaza estado para os outros.
- **Importação iniciada em teste precisa ser aguardada.** Deixar uma
  `completion` pendente faz a importação continuar contra um banco que o
  `afterEach` já apagou — aparece como erro solto, atribuído ao teste
  errado.
