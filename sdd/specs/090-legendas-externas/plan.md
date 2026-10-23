# Implementation Plan: Legendas externas (OpenSubtitles e SubDL)

**Slug**: `090-legendas-externas` | **Date**: 2026-10-22 | **Spec**: `sdd/specs/090-legendas-externas/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

No painel "Áudio e legendas" do player, filmes e episódios ganham "Buscar legenda online": a pessoa busca no idioma
do app (troca entre pt-BR/en/es), escolhe um resultado e a legenda aparece, desenhada pelo **mesmo overlay** da
legenda embutida (feature 029) e agendada pelo **tempo da mídia** num driver do app — não pelo
`setExternalSubtitlePath` do AVPlay. A TV fala com duas operações novas do serviço do portal (bearer da TV), que
guardam a chave padrão do OpenSubtitles só no servidor (ADR-021), exigem licença/teste vigente e limitam o uso por
TV. Desde 2026-10-22 são **dois fornecedores** — OpenSubtitles e SubDL — consultados em paralelo pelo serviço e
mostrados numa lista única, cada resultado com o seu fornecedor; o ZIP do SubDL é aberto no serviço. A escolha e o
arquivo ficam no aparelho por identidade lógica + idioma, com teto próprio, e voltam sozinhos ao retomar. A P3 é o
BYOK dos **dois** fornecedores: chave pessoal cadastrada na aba Integrações, testada no fornecedor e usada direto da
TV para aquele fornecedor (o outro segue pelo serviço); oferecer na loja depende da evidência de aceitação (G-4). Pedido do usuário durante o plano: **nenhuma lentidão** — nada fora
do player, nada no caminho de abrir/tocar/navegar (D-012, `logic/legenda-externa.md` §9).

## Technical Context

**Language/Version**: TypeScript 5 + React 19 (tv-web, Vite 8, alvo `chrome108`); Python 3.13 (api/app/portal, FastAPI).

**Primary Dependencies**: TV: Dexie (IndexedDB), `@tanstack/react-query` (não usado aqui), `CompressionStream` via
`blockCodec.ts`. Serviço: FastAPI, pydantic-settings, `httpx` (já é dependência — `providers/mercadopago.py`),
Firestore (`SharedRateLimiter`). Nenhuma dependência nova.

**Storage**: TV: tabela Dexie nova `externalSubtitles` (`dbSchema.ts` v27). Serviço: só contadores do limitador
existente (`rateLimits`); nada de legenda, termo ou ID guardado no servidor.

**Testing**: vitest (projetos `dom` `*.test.tsx` e `node` `*.test.ts`); pytest com emulador Firestore
(`PORTAL_TEST_FIRESTORE=1`) e `httpx.MockTransport` para o fornecedor; Playwright E2E (`e2e/run.mjs`) com o serviço
simulado por `context.route`; TV física para G-2.

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120, `file://`); dev no navegador com `<video>`.

**Performance Goals**: zero regressão (SC-009): nada fora do player; dentro dele nada até o primeiro `playing`;
leitura local adiada e única por sessão; um timer só durante a reprodução; nenhum re-render por tique de progresso.

**Constraints**: constitution 1.15.0 exige emenda (T001) antes de código que chame o serviço; ratchet de linhas com
`PlayerLayer.tsx` (325), `usePlayerPanels.ts` (367), `usePlayerKeyboard.ts` (406), `usePlayerSession.ts` (592),
`db.ts` (854) e as telas de detalhe **no teto**; contrato travado da 029 (sem a prop nova, nada muda); build base sem
portal esconde a opção (feature 078); limites provisórios (10 downloads/dia, 60 buscas/h por TV) até G-1.

**Scale/Scope**: 1 TV de referência, listas grandes (a feature não lê catálogo além de 3–4 `get` por sessão);
arquivo de legenda típico ~85 KB, teto 1 MiB; memória local ≤ 2 MiB.

## Decisões Invariantes

- **D-001 — O app desenha a legenda externa.** Arquivo → falas (`parseSubtitleFile`) → driver pelo tempo da mídia →
  `SubtitleOverlay` da 029. Não usar `setExternalSubtitlePath`: exige arquivo local com caminho absoluto, privilégio
  de filesystem no `config.xml` e só existe no AVPlay — não daria para provar no `<video>` nem no E2E. Funciona igual
  nos dois motores.
- **D-002 — O arquivo vem pelo serviço** no modo padrão (OpenSubtitles: link; SubDL: ZIP aberto no serviço, com
  limites anti-bomba), não direto do host do fornecedor: evita depender de CORS/redirect do CDN
  na TV (ADR-021 §6) e mantém a chave padrão no servidor. O serviço só normaliza a codificação e corta em 1 MiB; o
  parse é da TV (necessário para a P3 direta, se um dia vier).
- **D-003 — Duas operações, destinos fixos, dois fornecedores em paralelo** (`contracts/servico-legendas.md`): `device/subtitles/search` e
  `device/subtitles/download`, bearer da TV, licença/teste vigente lida **sem gravar** (não chamar `entitlement()`).
- **D-004 — Nenhuma chamada sem SELECT** (FR-002): abrir o diálogo, trocar idioma, escolher resultado, "Tentar de
  novo". Próximo episódio só ganha atalho (memória da sequência em RAM).
- **D-005 — Uma legenda por vez.** Externa ativa ⇒ `selectTextTrack(null)`; escolher embutida/"Desativadas" ⇒
  externa inativa. A externa guardada do item vence a escolha herdada da sequência.
- **D-006 — O atraso da externa é dela, de −10 s a +10 s.** Com a externa ativa, "Sincronização" vira **uma linha
  só** (`delay:external`, `role="slider"`) que ←/→ mudam em 500 ms, grampeada em ±10 000 ms (FR-008, `logic §4.1`).
  Fica no registro do item (`delayMs`), aplicado no driver (overlay com atraso 0) a cada tecla; gravado no aparelho
  só depois de 800 ms sem tecla (uma escrita por ajuste, não por toque — D-012). As opções da 029 (−1000…+1000, com
  negativos soft disabled) continuam **só** para a embutida; `TrackChoice` não muda de forma.
- **D-007 — Identidade lógica, uma legenda por idioma**: memória por `buildStableId` (fonte + tipo + id estável +
  temporada/episódio) **+ idioma**, nunca URL; até três por item, no máximo uma ativa; a mesma obra em outra lista é
  outra memória. Cada idioma obtido vira uma opção "Externa — <idioma>" no grupo Legendas: desativar, reativar e
  alternar entre idiomas já obtidos **não usam rede** (US1/AC8–AC9, pedido do usuário em 2026-10-22).
- **D-008 — Memória com teto próprio**: `externalSubtitles`, 2 MiB, despejo do menos usado **só nesta tabela**,
  texto gzip, `gunzipText` fora de transação; não chama `makeRoomFor` (não é catálogo). Fora do backup 072.
- **D-009 — Opt-in pela prop, padrão de produção pelo runtime**: `externalSubtitles` ausente ⇒
  `defaultExternalSubtitles()` (null sem portal configurado ou no build base); `null` ⇒ desligado. O alvo nasce do
  `itemId` por leitura local — **nenhuma tela muda**.
- **D-010 — Sem crescer arquivo no teto do ratchet**: lógica em arquivos novos (`lib/subtitles/*`,
  `components/player/useExternalSubtitles.ts`, `PlayerSubtitleSearchPanel.tsx`); onde a fiação for inevitável,
  extrair código existente para caber (`logic §8`). Nunca editar `architecture-baseline.json` para cima.
- **D-011 — BYOK dos dois fornecedores é P3 implementada** (decisão do usuário em 2026-10-22, que informou a
  aceitação do OpenSubtitles): chave pessoal por fornecedor na aba Integrações, testada no fornecedor antes de
  guardar, usada direto da TV só para aquele fornecedor; troca para o padrão só por ação explícita ("Usar o padrão do
  ccplayTv"). Oferecer/anunciar na loja depende do G-4 (evidência de cada fornecedor anexada). Exceção (l) da emenda.
- **D-013 — Lista única, identificador opaco.** Resultado = `{ id: 'os:…' | 'sd:…', provider, … }`; a TV nunca vê
  URL de fornecedor (a do SubDL embute a chave). Ordem: OpenSubtitles por downloads, depois SubDL; episódio exato
  antes de pacote de temporada. Um fornecedor fora não derruba o outro (`unavailable`).
- **D-014 — Chaves pessoais numa tabela própria** (`subtitleCredentials`, `dbSchema.ts` v27): não reaproveitar
  `integrations` (tipada `'tmdb'` em `db.ts`, no teto, e lida pelo backup 072). Fora do backup, do portal e da
  exclusão de lista.
- **D-015 — Uma regra de extração, duas implementações.** A escolha do arquivo no ZIP (SRT/WebVTT, episódio por
  `SxxEyy`/`NxNN`, limites 50 entradas/4 MiB) existe no serviço (Python) e na TV (BYOK do SubDL, TS); as duas são
  testadas com as **mesmas** fixtures sintéticas para não divergirem.
- **D-012 — Desempenho é requisito, não otimização** (FR-025, `logic §9`): zero trabalho fora do player e antes do
  primeiro `playing`; leitura local num único passo ocioso por sessão; driver com um timer e sem `setState` por
  tique; medido na TV antes/depois (G-2/SC-009) — regressão acima do ruído reprova.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | Nenhum login; licença/teste é da TV (exceção comercial 069). Sem licença a opção fica soft disabled, o resto do player segue. |
| Segredos Fora dos Clientes e dos Logs | **Violação** | OK após T001 | Chaves padrão (OpenSubtitles e SubDL) só no servidor (D-002/D-003), mas a constitution não autoriza o serviço a intermediar terceiro nem prevê BYOK de legendas — exceções (k) e (l) propostas em `logic/emenda-constitution.md`. A URL do SubDL que embute a chave nunca sai do serviço (D-013). Busca sem dado IPTV (contrato `subtitleTarget`). Complexity Tracking. |
| Categorias da Fonte São Preservadas | OK | OK | Não toca categorias. |
| IA e Classificação Nunca Inventam Dados | OK | OK | Busca por nome é sinalizada ("confira a sincronia"); nenhum resultado é aplicado sem escolha. |
| Comandos Locais Independem de Rede… | **Violação** | OK após T001 | Pausa/seek/foco não esperam o serviço; mas a lista fechada da 071 ("só (d)–(f) e Atualizar falam com o serviço") não inclui a busca — emenda item 2. |
| Trailers e Metadados Não Alteram o Estado Principal | OK | OK | Legenda não marca assistido nem progresso. |
| Toda Ação Essencial Tem Caminho por Controle Remoto | OK | OK | Setas/OK/RETURN; RETURN fecha o diálogo antes do painel. |
| Lista Não É Manifesto de Streaming | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | OK | OK | Carregando/vazio/erro/bloqueado com ação focável (contrato do erro); focar nunca chama serviço (contrato "nenhuma chamada até SELECT"). |
| Voltar Restaura Foco e Posição | OK | OK | RETURN do diálogo volta a `external:search`; aplicar volta a `external:active`; reconciliação por chave. |
| Identidade de Reprodução Não Depende da URL | OK | OK | D-007. |
| Progresso e Capacidades São Reais | OK | OK | "Áudio e legendas" só vira real quando há faixas **ou** alvo resolvido; atraso negativo só onde o driver o aplica de fato. |
| Documentação É Canônica | OK | OK | Polish atualiza CLAUDE.md (versão da constitution, regra curta da 090), ADR-021, `docs/portal/operacao.md` (env nova). |
| Restrição: Direct Play | OK | OK | Nenhum vídeo passa pelo serviço. |
| Restrição: Exceção serviço central (069) | **Violação** | OK após T001 | Emenda item 3. |
| Restrição: Licenças de serviços externos | Atenção | Atenção | Termos/atribuição do OpenSubtitles e do SubDL para app distribuído = G-1 (R-002, R-013); documentação oficial do SubDL não legível por ferramenta (R-017). |
| Restrição: Validação em hardware | Elevada | Elevada | G-2 é gate obrigatório desta feature (exceção permitida: o `<video>` não prova o AVPlay nem o desempenho da TV). |
| Fluxo: testes por task, E2E antes da TV, revisão de segredos | OK | OK | Tasks com vitest/pytest+ruff; E2E `legendas-externas` no Polish; revisão de segredos no Checklist. |

Decisão do usuário (2026-10-22): violações tratadas por emenda, com o texto no plano e aplicação na T001 após
aprovação — antes de qualquer código que chame o serviço.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/090-legendas-externas/
├── spec.md
├── plan.md
├── tasks.md
├── handoff.md
├── data-model.md
├── quickstart.md
├── contract-tests.lock
├── contracts/servico-legendas.md
└── logic/
    ├── emenda-constitution.md
    └── legenda-externa.md
```

### Source Code (repository root)

```text
api/                                   # serviço do portal (Cloud Run + Firestore), Python 3.13
├── app/portal/
│   ├── settings.py                    # + opensubtitles_api_key, limites
│   ├── licensing.py                   # + leitura de acesso sem gravar
│   ├── subtitles.py                   # NOVO: serviço (acesso, limites, junção dos fornecedores, codificação)
│   ├── providers/opensubtitles.py     # NOVO: adaptador OpenSubtitles (httpx)
│   ├── providers/subdl.py             # NOVO: adaptador SubDL (httpx) + extração do ZIP
│   ├── application.py                 # registra o router novo
│   └── routes/subtitles.py            # NOVO: POST /portal/v1/device/subtitles/{search,download}
└── tests/portal/test_subtitles.py     # NOVO

tv-web/src/
├── lib/subtitles/                     # NOVO (lib — sem React)
│   ├── types.ts                       # stub do plan (tipos/portas)
│   ├── subtitleFile.ts                # stub do plan — parse SRT/WebVTT
│   ├── externalCueDriver.ts           # stub do plan — agenda pelo tempo da mídia
│   ├── subtitleTarget.ts              # stub do plan — alvo e pedido de busca
│   ├── subtitleTables.ts              # NOVO — acesso tipado à tabela
│   ├── subtitleStore.ts               # NOVO — memória com teto
│   ├── portalSubtitleService.ts       # NOVO — cliente do serviço
│   ├── sequenceMemory.ts              # NOVO — idioma da sequência (RAM)
│   ├── subtitleSearch.ts              # NOVO — decide serviço × direto por fornecedor e junta (P3)
│   ├── subtitleCredentials.ts         # NOVO — chaves pessoais (P3)
│   ├── directProviders.ts             # NOVO — clientes diretos OpenSubtitles/SubDL (P3)
│   ├── zipReader.ts                   # NOVO — leitor ZIP mínimo (P3, SubDL)
│   └── runtime.ts                     # NOVO — defaultExternalSubtitles()
├── lib/catalog/dbSchema.ts            # + version(27) externalSubtitles
├── lib/catalog/sourceDeletion.ts      # + apagar por sourceId
├── lib/portal/portalClient.ts         # + códigos novos; corpo lido em 429
├── lib/i18n/messages/subtitles.ts     # NOVO (pt/en/es) + registro nas línguas
├── components/
│   ├── playerPanels.ts                # buildTracksPanel(…, external?)
│   ├── PlayerTracksPanel.tsx          # linhas external:*
│   ├── PlayerSubtitleSearchPanel.tsx  # NOVO — diálogo de busca
│   ├── SubtitleOverlay.tsx            # fonte genérica (session | driver)
│   ├── PlayerLayer.tsx                # fiação (no teto: extrair PlayerPanelsView)
│   └── player/
│       ├── playerLayerTypes.ts        # prop externalSubtitles (stub do plan) + PanelState 'subtitleSearch'
│       ├── useExternalSubtitles.ts    # NOVO — busca, aplicar, restaurar, descarte
│       ├── usePlayerPanels.ts         # delega (no teto: extrair panelControls.ts)
│       ├── panelControls.ts           # NOVO — extraído para liberar linhas
│       ├── PlayerPanelsView.tsx       # NOVO — extraído do PlayerLayer
│       └── usePlayerChrome.ts         # tracks real também com a externa
├── features/settings/tabs/SubtitleKeysSection.tsx  # NOVO — chaves pessoais (P3); IntegrationsTab.tsx monta
└── e2e/legendas-externas.mjs          # NOVO (em tv-web/e2e/)
```

**Structure Decision**: monorepo existente — `tv-web/` (app da TV) e `api/app/portal/` (serviço). Lógica pura em
`tv-web/src/lib/subtitles/` (lib não importa UI; `lib/catalog` não importa `lib/subtitles`); estado de UI num hook
novo em `components/player/`; nenhuma tela em `features/` muda (D-009). Serviço segue o padrão de
`routes/integrations.py` + serviço de domínio + provedor `httpx` (como `providers/mercadopago.py`).

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Serviço do portal intermedia um terceiro com chave padrão (Segredos; Restrição 069) | ADR-021 escolheu a chave padrão protegida para a pessoa não precisar de conta/chave; o fornecedor desaconselha pedir chave a cada usuário | Chave no pacote: extraível, viola segredos; BYOK obrigatório: rejeitado pelo usuário (ADR-021) |
| Nova chamada TV → serviço fora da lista da 071 (Comandos Locais) | Buscar/baixar legenda exige rede; é sempre por ação da pessoa | Buscar ao abrir/ao focar: viola "focar não consulta" e gasta cota; direto da TV ao fornecedor: exporia a chave |

Ambas resolvidas pela emenda 1.16.0 (`logic/emenda-constitution.md`), aplicada na T001 após aprovação do usuário.

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base:

```powershell
# tv-web
cd tv-web
npx vitest run <arquivo>          # o mais estreito primeiro
npm run test                      # suíte (dom + node)
npm run lint                      # oxlint + ratchet de arquitetura
npm run build
node e2e/run.mjs --only legendas-externas   # com `npm run dev` rodando

# api (testes do portal precisam do emulador Firestore)
cd api
$env:PORTAL_TEST_FIRESTORE='1'; uv run pytest tests/portal/test_subtitles.py
uv run ruff check .
```

- Unitário (`node`): parse, driver, pedido, store (fake-indexeddb, `new CatalogDb('test-090-…')`), mapeamento de
  erros do cliente.
- Componente (`dom`): `PlayerLayer` com `externalSubtitles` falso; modelo do painel; diálogo.
- Serviço: pytest com `httpx.MockTransport` para o OpenSubtitles (nunca rede real), emulador Firestore para o
  limitador; um teste garante que a chave não aparece em resposta/log (`caplog`).
- E2E: `tv-web/e2e/legendas-externas.mjs` — segundo Vite com `VITE_PORTAL_ORIGIN` de fixture e `context.route` para
  `/devices/enroll` e `/device/subtitles/*` (padrão de `e2e/legibilidade-tv.mjs` ~l.400–440); entra no `SUITE`.
- Manual/TV: `quickstart.md` B e C (G-2, SC-009).

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/components/PlayerLayer.legendas-externas.contract.test.tsx`,
`tv-web/src/lib/subtitles/externalCueDriver.legendas-externas.contract.test.ts`,
`tv-web/src/lib/subtitles/subtitleFile.legendas-externas.contract.test.ts`,
`tv-web/src/lib/subtitles/subtitleTarget.legendas-externas.contract.test.ts`

Comando: `cd tv-web; npx vitest run src/components/PlayerLayer.legendas-externas.contract.test.tsx src/lib/subtitles`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `lê SRT (BOM, CRLF, tags, bloco inválido) e WebVTT …` | FR-011, edge case arquivo inválido | Fase 2 | `Error: not implemented` |
| `segue a posição da mídia: salto apaga antes de mostrar, …` | US1/AC4, SC-004, D-006 | Fase 2 | `Error: not implemented` |
| `usa TMDB do filme ou da série … nunca leva identidade da lista` | FR-005, FR-017, Constitution: Segredos | Fase 2 | `Error: not implemented` |
| `filme: nenhuma chamada até SELECT em "Buscar legenda online"; …` | US1/AC1+AC3, FR-001/002/006/007/008, SC-002 | Fase 3 | `Unable to find role="button" and name "Áudio e legendas"` |
| `falha da busca mostra o erro com "Tentar de novo" focado, …` | FR-015, Constitution: Foco Visível | Fase 3 | `Unable to find role="button" and name "Áudio e legendas"` |

Confirmado em 2026-10-22: 5/5 vermelhos pelos motivos acima; `npx tsc -b` limpo; suíte `src/components/PlayerLayer*`
+ `src/lib/player` sem regressão (só os 2 contratos novos falham).

Stubs criados pelo plan (ponto de partida do execute, não travados): `tv-web/src/lib/subtitles/types.ts`,
`subtitleFile.ts`, `externalCueDriver.ts`, `subtitleTarget.ts`; prop `externalSubtitles` em
`tv-web/src/components/player/playerLayerTypes.ts` (declarada, ainda não lida).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Constitution | 1.16.0 aplicada (G-3 cumprido) |
| Fundação TV e serviço | Prontas (Fase 2); rotas e limitador reais executados no emulador Firestore (T019b, 2026-10-23: 13 passam; suíte `tests/portal` 192 passam) |
| US1, US2, US3 | Prontas em código e testes; BYOK dos dois fornecedores provado na TV (R-022) |
| Polish | T036–T041 feitas (E2E 53/55; a 2ª falha é pré-existente, R-023) |
| TV (T042) | **Parcial**: navegação A × B e reprodução ociosa com e sem legenda dentro do ruído; legenda vista pelo usuário (tempo, acentos, posição). Faltam C2, C5, C6, C7 e a atribuição das tarefas longas da sessão interativa (R-024) |
| Pendente | completar a T042; chave da legenda pelo portal (pedido do usuário, feature nova); `sdd-converge` |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Constitution 1.15.0 não permite a chamada nova nem o papel novo do serviço | Bloqueia código que chame o serviço | Resolvido: emenda 1.16.0 aplicada em 2026-10-22 com aprovação do usuário. Emenda 1.16.0 proposta (`logic/emenda-constitution.md`); T001 aplica após aprovação do usuário. |
| R-002 | Termos, cota e custo do OpenSubtitles para app distribuído não confirmados (G-1) | Oferta padrão em produção | Desenvolvimento com chave de teste; limites provisórios 10/dia e 60/h por TV, configuráveis; produção só depois do G-1 (fora do código). |
| R-003 | Frequência do `oncurrentplaytime` do AVPlay desconhecida | Fala atrasada/adiantada na TV | Driver extrapola entre tiques e reavalia em salto > 1 s; medir no G-2 (C2). |
| R-004 | Arquivos de teto do ratchet (`PlayerLayer`, `usePlayerPanels`) precisam de fiação | `npm run lint` falha | Extrair `PlayerPanelsView.tsx` e `panelControls.ts` (`logic §8`); nunca subir teto. |
| R-005 | Contrato travado da 029 exige "Áudio e legendas — indisponível" sem faixas | Regressão na 029 | Sem a prop (teste da 029 não passa) e sem portal no ambiente de teste, `defaultExternalSubtitles()` = null ⇒ comportamento antigo. Rodar a trava da 029 em toda fase que toca o player. |
| R-006 | Memória de legendas não passa por `makeRoomFor` (082) | Disputa com a reserva de estado da pessoa | Teto fixo de 2 MiB dentro da reserva mínima de 12 MiB; falha de cota = só não grava. Rever se G-2 mostrar pressão. |
| R-007 | `entitlement()` do serviço grava (inicia teste, gira geração) | Efeito colateral numa busca | Método novo só de leitura com a mesma regra de teste (`trial_started_at` nulo ⇒ `created_at + 7 dias`). |
| R-008 | Regressão de desempenho (pedido explícito do usuário) | Lentidão em telas/player | D-012 + `logic §9`; medição antes/depois na TV (quickstart C3–C5); acima do ruído reprova. |
| R-012 | A URL de download que o SubDL devolve embute a chave (`?api_key=`), visto na prova | Vazamento da chave padrão para a TV/log | Adaptador extrai só `<a>-<b>` e descarta a URL; teste do serviço confere que nenhuma resposta/log contém a chave (T019). |
| R-013 | Plano gratuito do SubDL: ~50 downloads/dia **por chave** (fonte secundária, não verificado) | Padrão compartilhado esgota em minutos | G-1 inclui o plano do SubDL (Pro ~US$ 5/mês, ~2 000/dia — fonte secundária); até lá, o SubDL padrão é só desenvolvimento. |
| R-014 | BYOK do OpenSubtitles: o usuário informa aceitação; o fórum oficial (set/2026) desaconselhava pedir chave ao usuário | Oferta na loja sem respaldo | Implementado (D-011); G-4 exige a evidência anexada antes de anunciar. |
| R-015 | Extração de ZIP em duas implementações (serviço e TV) | Divergência ou ZIP malicioso | D-015: mesmas fixtures; limites de entradas/tamanho; só nome-base; nunca disco. |
| R-016 | Download do `link` do OpenSubtitles direto do navegador da TV não provado (CORS) | BYOK do OpenSubtitles sem download | T053 prova na TV/PC antes de declarar pronto; falhando, BYOK do OpenSubtitles volta ao plano. |
| R-017 | Documentação oficial do SubDL bloqueia leitura por ferramenta (403); detalhes vieram da prova e de fontes secundárias | Parâmetro/limite errado | Contrato baseado no que a prova mostrou (`evidencias/subdl-prova-pc.json`); executor confere a doc no navegador antes da T014b. |
| R-018 | O `httpx` registra em INFO a URL de cada requisição, e a API v1 do SubDL leva a chave na query (`api_key=`) | Chave padrão no log do Cloud Run (viola (k)) | Resolvido: `RedactKeyFilter` em `providers/subtitle_http.py` mascara `api_key=` nos loggers `httpx`/`httpcore`; teste `test_no_key_or_url_in_logs`. Se o SubDL aceitar cabeçalho (`X-API-Key`), trocar e manter o filtro. |
| R-019 | Emulador Firestore indisponível nesta máquina (Java 17; exige 21+) | Rotas/licença/limitador reais sem execução | Resolvido (2026-10-23): Temurin JRE 21 instalado sem mexer no PATH (`C:\Program Files\Eclipse Adoptium\jre-21.0.12.101-hotspot`); emulador subido só com `JAVA_HOME` do processo; `test_subtitles_routes.py` + `tests/portal` verdes. Antes: `has_access` também coberto indiretamente pela lógica compartilhada `license_window` (já exercida por `entitlement`). |
| R-022 | T053: no Chromium 153 do PC, do `file://` (origem `null`) o navegador recusa o preflight do OpenSubtitles ("It does not have HTTP ok status") para qualquer pedido com `Api-Key`, e o `POST /download` sem User-Agent próprio dá 403 | Se valesse na TV, o BYOK do OpenSubtitles direto seria inviável | Resolvido: a prova na TV física (sonda, `evidencias/cors-direto-tv-2026-10-23.md`) passou — preflight 200, busca 200 (18 resultados), `POST /download` com `X-User-Agent` 200 + link, arquivo 200 (78 KB). `BYOK_PROVIDERS = ['opensubtitles', 'subdl']`; o cliente do OpenSubtitles manda `X-User-Agent: ccplayTv v1` no lugar do `User-Agent` que o navegador não deixa definir. O ensaio do PC fica como registro (`evidencias/cors-direto-pc.json`): o aparelho decide. |
| R-024 | T042: na sessão manual com a legenda ativa apareceram tarefas longas de 0,75–1,6 s (digitar a chave, buscar, aplicar), **sem atribuição a um passo** (o usuário operou sem roteiro; a janela é de 5 s) | Pode haver um passo interativo da 090 que prende a thread além do esperado — a regra é "nenhuma lentidão" | Aberto. Medido: navegação e reprodução ociosa sem regressão. Para atribuir: build com tempos por passo (parse/apply/gzip/save/troca) — feito e **revertido sem instalar** (o usuário encerrou a medição); refazer com roteiro cronometrado quando houver nova janela de TV. Pior caso conhecido do build A ao sair do player: ~0,8 s. |
| R-023 | `e2e/campos-da-listagem.mjs` falha (timeout esperando a fileira "Avaliados") **também no HEAD limpo `85e2ead`**, sem a 090 | Gate E2E "completo" não fica 100% verde por causa de um bug fora desta feature | Resolvido (2026-10-23, `sdd-bugfix` `e2e-campos-da-listagem-nao-acha-fileira-avaliados`, verified): era uma regressão da 089 (`f8179b8`) — a prévia da categoria não acompanhava a pré-carga; corrigido em `useCategoryPreviewWindow.ts`, sem rodada na TV. Fora do escopo da 090, registrado aqui só por origem. Reportado ao usuário originalmente para decidir entre `sdd-bugfix` e backlog. `teste-conexao-tv` falhava por causa da 090 (contagem de ↓) e foi corrigido. |
| R-020 | O driver só emitia quando a fala mudava: quem se inscrevia depois (overlay re-renderiza após aplicar) perdia a fala vigente — reativar/trocar idioma no meio de uma fala não mostrava nada | Legenda "some" até a próxima fala | Resolvido: `subscribeSubtitles` entrega a fala vigente ao novo ouvinte; coberto pelos testes de alternar/reativar. |
| R-021 | Import estático do runtime de legendas no `PlayerLayer` mudou a divisão de chunks: 10 arquivos fora de `tizen_web_project.yaml` (só falharia na TV) | Pacote quebrado na TV | Resolvido: runtime por `import()` no passo ocioso (reforça D-012), `searchRequest.ts`/`delay.ts` sem dependências; 5 chunks (`runtime`, `storageRelief`, `titleMetadataStore`, `translate`, `viewChoice`) entraram na lista; efeito no carregamento medido na T042. |
| R-009 | Episódio sem série resolvida/sem TMDB: busca por nome erra a obra | Resultado errado | Sinalizado "Busca por nome"; pessoa escolhe; nada aplicado sozinho. |
| R-011 | Guardar uma legenda por idioma (até 3 por item) para alternar pt/en sem novo download — o usuário só aceita se o custo for pequeno | Espaço e tempo de troca | Estimado ~25–35 KB por legenda gzip, total preso ao teto de 2 MiB, só a ativa em RAM (`logic §5.7`). Critério de descarte: > 60 KB por legenda, troca > 100 ms na TV ou efeito no SC-009 → voltar a uma por item. Medir na T016 e T042. |
| R-010 | Ajuste ampliado para ±10 s (pedido do usuário, 2026-10-22): ←/→ hoje são ignorados no painel de faixas, e cada tecla reavalia o driver | Tecla sem efeito; escrita no IndexedDB por toque | ←/→ só agem na linha `delay:external` (o resto do painel continua ignorando); `driver.setDelay` é barato (busca binária + no máximo 2 emissões); gravação adiada 800 ms (`logic §4.1`). Deriva por taxa de quadros fica fora de escopo. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-23 | T042 (TV) | 2 rodadas A (`85e2ead`) × 2 rodadas B na mesma sessão: B dentro/abaixo do A; reprodução ociosa sem tarefas longas, inclusive com legenda ativa (~60 s); `evidencias/depois.md`; pacote normal reinstalado | R-024 (tarefas longas interativas sem atribuição); C2/C5/C6/C7 |
| 2026-10-23 | Fase 6 (Polish, parcial) | E2E `legendas-externas`, legibilidade das legendas, docs, pacote, segredos, 3 833 testes, E2E 53/55 (`campos-da-listagem` pré-existente, R-023); `teste-conexao-tv` ajustado | T042 na TV (autorização por instalação); T019b |
| 2026-10-23 | Fase 5 (US3) | BYOK implementado (credenciais, ZIP, clientes diretos, busca mista, avisos e "Usar o padrão", seção Integrações); 333 arquivos / 1 766 testes; T053 reduziu o BYOK ao SubDL (R-022) | Quickstart B13–B16 vão com o E2E (T036); decisão do usuário sobre o OpenSubtitles |
| 2026-10-23 | Fase 4 (US2) | Restaurar ao retomar (`restore`), atalho no episódio seguinte coberto por teste; `createDelaySaver` extraído; 5/5 contratos; 704 testes da área | Teste instável `progressRecorder.falhas` (não é da 090); quickstart B7/B9/B11 vão com o E2E (T036) |
| 2026-10-22 | Fase 3 (US1) | Player completo para a US1; 5/5 contratos; 1 522 testes; dois defeitos achados e corrigidos (R-020 driver, R-021 chunks Tizen); baseline do ratchet encolhido | Quickstart B no navegador vai com o E2E (T036) |
| 2026-10-22 | Fase 2 (fundação) | TV e serviço prontos; 3/5 contratos verdes; 858 testes TV e 12 do serviço verdes; vazamento da chave do SubDL no log do httpx achado e corrigido (R-018) | T019b: rodar as rotas com emulador (Java 21+) |
| 2026-10-22 | Fase 1 (gates) | Emenda 1.16.0 aplicada com aprovação; CLAUDE.md e ADR-021 atualizados; T002 substituída por referência à 089 (não comparável — sonda media a lista lateral) | T042 passa a medir build A (`85e2ead`) × build B na mesma sessão |
| 2026-10-23 | Fechamento | G-2/SC-009 e quickstart validados pelo usuário; status Convergida | — |

**PRÓXIMO**: decidir (1) ~~`campos-da-listagem` (R-023)~~ feito pelo `sdd-bugfix`, (2) se entra uma feature "chave de legenda pelo portal" (o usuário achou muito difícil digitar na TV), (3) nova janela de TV para fechar a T042 (C2/C5/C6/C7 e R-024, com roteiro cronometrado), (4) ~~T019b~~ feito; depois `sdd-converge`.

## Arquivos Principais

- `tv-web/src/lib/subtitles/` — `subtitleCredentials.ts` (`BYOK_PROVIDERS`), `subtitleSearch.ts`, `directProviders.ts`
  (+ `directHttp.ts`, `openSubtitlesDirect.ts`, `subdlDirect.ts`), `zipReader.ts`, `runtime.ts`
- `tv-web/src/components/player/` — `subtitleSearchModel.ts` (avisos e `useDefault`), `externalSubtitleSearch.ts`
- `tv-web/src/features/settings/` — `SubtitleKeyDialog.tsx`, `useSubtitleKeys.ts`, `subtitleKeysModel.ts`,
  `integrationsModel.ts`, `IntegrationsPanel.tsx`, `tabs/IntegrationsTab.tsx`, `tabs/SubtitleKeysSection.tsx`
- `sdd/specs/090-legendas-externas/evidencias/cors-direto-pc.json`, `CCPlayTv/tizen_web_project.yaml`

## Cuidados para Retomada

- pytest nesta máquina: a pasta temporária padrão dá `PermissionError` no sandbox — rode com
  `--basetemp=<scratchpad>/pytest`. Testes com emulador exigem Java 21+ (aqui só há o 17).
- A versão do banco subiu para 27: testes que fixam `verno` (`pinMigration.upgrade.test.ts`, `portalTables.test.ts`)
  acompanham a versão — atualize junto se outra feature subir de novo.
- O padrão de produção das legendas (`lib/subtitles/runtime.ts`) só pode ser importado por `import()` — um import
  estático no player muda a divisão de chunks e quebra o pacote Tizen (R-021). Rode a guarda `findUnlistedFiles`
  depois de `npm run build` sempre que mexer em imports do player.
- `buildSearchRequest` mora em `searchRequest.ts` (sem dependências) e é reexportada por `subtitleTarget.ts` porque o
  contrato travado a importa de lá — não a mova de volta.
- Chave pessoal de legenda: a chave crua só passa por `subtitleCredentials.ts` → `subtitleSearch.ts` → `fetch`. Nunca em
  estado de tela (`useSubtitleKeys` guarda só a versão mascarada), query key, log ou erro; erro de `fetch` do SubDL embute
  a URL com a chave, por isso `directHttp.call` o troca por `DirectProviderError('offline')`.
- **Não decida o CORS do OpenSubtitles pelo PC**: o Chromium 153 do ensaio recusa o preflight de `file://` e a TV (Chromium 120)
  não. As contagens de ↓ em `SettingsScreen.integrations/speedTest` dependem de quantos fornecedores têm linha de chave
  pessoal (`SUBTITLE_ROW_COUNT`).
- Não há linha de base de desempenho limpa antes da 090 (`evidencias/antes.md`): a T042 precisa medir o build
  `85e2ead` e o build com a feature na mesma sessão — não compare com números da 087/088/089.

## Resultado Final

Fechada a pedido do usuário em 2026-10-23, que declarou ter testado tudo (inclusive na TV física); as tarefas que dependiam dessa validação foram marcadas como "validado pelo usuário" — relato, sem evidência anexada nesta sessão. Os riscos da tabela **não** foram reauditados um a um nesta passada; o que é bug daqui em diante entra como bug. Ressalva: R-024 (atribuição das tarefas longas interativas) não foi feita; `evidencias/depois.md` registra só o que foi medido. A 091 estende esta feature (chave pelo portal).
