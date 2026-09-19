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

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | **Interpretar centenas de milhares de entradas pode travar a interface ou estourar a memória da TV.** Nunca foi medido nesse aparelho; é a incerteza que a ADR-008 registrou em aberto. | **Alto e decisivo**: se acontecer, a feature inteira não se sustenta, e o princípio "Foco Visível e Sem Becos Sem Saída" é violado na prática (controle travado). | D-002 (fluxo, nunca materializar tudo) + D-003 (fora da thread de interface) como design; US1 mede antes de qualquer descarte; FR-022 interrompe o trabalho se reprovar. |
| R-002 | **Um Web Worker vira arquivo novo no build, e o pacote Tizen tem lista explícita de arquivos** (`tizen_web_project.yaml`, chave `files:`). Arquivo ausente do `.wgt` falha **só na TV** — passa no navegador e no teste. | Médio, mas traiçoeiro: o sintoma aparece tarde e não se parece com a causa. | Task explícita para acrescentar o arquivo do Worker à lista e **verificar no aparelho**, não só no build. Se o empacotamento do Worker se mostrar problemático, o invólucro troca para Worker embutido no bundle — D-003 isola essa troca da lógica. |
| R-003 | **A cota de armazenamento do IndexedDB nessa TV é desconhecida.** A ADR-002 §1 já avisava que quota e falha de escrita precisam ser considerados. | Médio hoje (só canais, volume pequeno), alto quando VOD/séries entrarem. | FR-018 exige preservar o que era utilizável e declarar que não coube; teste de integração simula rejeição de escrita; a medição real da cota entra no `quickstart.md` como observação registrada, não como suposição. |
| R-004 | **Credencial do provedor passa a residir no aparelho.** Reversão consciente da leitura estrita de um princípio da constitution. | Alto se vazar: é a credencial do serviço pago da pessoa. | Autorizada pela ADR-008 e pela exceção da constitution v1.2.0. Fronteira desta feature: D-005 (isolada do catálogo), FR-009 (nunca reexibida/registrada/exportada) e uma verificação de ciclo de sucesso **e** de falha no `quickstart.md`. |
| R-005 | **Nem todo provedor aceita conexão direta do navegador.** O teste real confirmou um; não há base para generalizar. | Médio: uma pessoa com provedor restritivo fica sem caminho se o app não explicar. | US5 trata a detecção e a explicação. O contorno (backend auto-hospedado) não é construído aqui — FR-021 apenas garante que ele continua existindo. |
| R-006 | **Portar o parser M3U é reimplementar, não traduzir**: o backend usa a biblioteca `ipytv`, que não tem equivalente adotado em JavaScript. | Médio: risco de regressão silenciosa em casos de borda que a biblioteca já tratava (BOM, aspas, atributos exóticos). | `research.md` R2 decide por implementação própria e enumera os casos de borda que viram teste unitário obrigatório, derivados do que `m3u_parser.py` e seus testes já cobrem. |
| R-007 | **Duas implementações de importação coexistindo** (ver Complexity Tracking). | Médio e permanente: divergência de comportamento entre os dois caminhos com o tempo. | Congelamento explícito (D-007): o caminho Python não recebe mudança de comportamento. Se um dia precisar evoluir, isso reabre a decisão da ADR-008. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |

**PRÓXIMO**: —

## Arquivos Principais

- (nenhum ainda)

## Cuidados para Retomada

- (nenhum ainda)
