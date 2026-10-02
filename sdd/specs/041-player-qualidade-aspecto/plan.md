# Implementation Plan: Qualidade, aspecto e preferências do player (sem velocidade)

**Slug**: `041-player-qualidade-aspecto` | **Spec**: [spec.md](spec.md)

## Summary

Torna reais os controles "Aspecto" e "Qualidade" do chrome do player (feature
027, hoje mocks "Em breve"), remove "Velocidade" de vez, e cria a aba real
"Player & reprodução" em Configurações com quatro preferências do aparelho
(aspecto, qualidade Auto/Máxima/Econômica, idioma de áudio, legenda).

Abordagem: estender o mesmo modelo da feature 029 — métodos **opcionais** no
`PlayerAdapter` (`getAspectModes`/`setAspectMode`/`getQualities`/
`selectQuality`), ausência = controle soft disabled com o motivo; painéis como
estado do `PlayerLayer` (não `Modal`); uma escolha da sequência
(`ViewChoice`) ao lado da `TrackChoice` da 029, semeadas pelas preferências do
aparelho (`localStorage`) a cada reprodução nova e nunca gravadas de volta pelo
player. O mapeamento real no AVPlay (modos de exibição, variantes e como
trocá-las) só se prova na TV: a Fase 1 é um spike lá, e a passada final na TV é
gate obrigatório.

## Technical Context

**Language/Version**: TypeScript 5 + React 19 (Vite 8, alvo `chrome108`).
**Primary Dependencies**: `@tanstack/react-query` (Configurações), Dexie (não
tocado), `useRemoteNav` (ADR-009), `webapis.avplay` (Tizen).
**Storage**: `localStorage` (`ccplaytv:player-preferences`, `data-model.md`).
Sem mudança no Dexie.
**Testing**: Vitest + Testing Library (jsdom); Playwright E2E (`tv-web/e2e/
*.mjs`, Chromium), com `webapis.avplay` falso injetado (padrão da 029).
**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9.0 / Chromium 120, origin
`file://`); `<video>` só em desenvolvimento.
**Project Type**: app web de TV (`tv-web/`) empacotado em `CCPlayTv/`.
**Performance Goals**: SC-002 — trocar o aspecto reflete em ≤ 1 s na TV. Ler o
motor (faixas/qualidades) nunca a cada render — só em pontos discretos (§2.4
da lógica).
**Constraints**: AVPlay singleton e plano de hardware (painéis desenham por
cima, vídeo atrás); `PlayerLayer` captura o teclado (painel ≠ `Modal`);
contratos travados de 027/029 (tipos `TrackChoice`, rótulos, ordem da linha);
regras da 040 para o `PlayerLayer` dividido.
**Scale/Scope**: ~15 arquivos de produção, 1 aba nova, 1 E2E novo.
**NEEDS CLARIFICATION**: o comportamento real do AVPlay (R-001/R-002) —
resolvido pelo spike da Fase 1, não por suposição.

## Decisões Invariantes

- **D-001 — Velocidade sai de vez**: sem controle, sem mock "Em breve", sem id
  `speed` em `ChromeControlId`, sem entrada em `comingSoon.ts`. Desvio do DS
  §27.6 permitido pela ADR-011 (decisão de produto acima do DS).
- **D-002 — Capacidade = método opcional**: o que o painel oferece vem só do
  motor (modos) ou do stream (variantes). Sem o método, sem modo ou com uma
  variante só → soft disabled com o motivo no nome acessível + toast; nunca
  painel vazio, nunca opção inventada.
- **D-003 — `ViewChoice` é separada de `TrackChoice`**: o tipo `TrackChoice`
  não muda (contrato travado da 029 o importa; `SeriesDetailScreen` o guarda).
  Props novas `initialViewChoice`/`onViewChoiceChange`, mesmo papel das de
  faixas.
- **D-004 — Reaplicar sempre na primeira entrada em `playing`**:
  `reapplyViewChoice` logo após `reapplyTrackChoice`, aplicando o aspecto
  inclusive `fit` (o AVPlay pode manter o modo entre sessões). Qualidade só é
  aplicada quando a regra escolhe uma variante (`null` = não chama). Silenciosa
  na falha, nunca conta como escolha da pessoa.
- **D-005 — O player nunca grava preferência**: lê uma vez por montagem e
  semeia as duas escolhas; trocar no player só muda a sequência (FR-012,
  SC-003). Só a aba grava.
- **D-006 — Preferências do aparelho em `localStorage`**, chave
  `ccplaytv:player-preferences`, validação campo a campo, nunca lança
  (`data-model.md`). Não dependem da lista ativa.
- **D-007 — Ids de variante são por sessão**: o que atravessa a sequência é a
  altura (`{ height }`) ou a regra (`auto`/`max`/`min`). `selectQuality(null)`
  = Auto.
- **D-008 — Painéis são estado do `PlayerLayer`** (como a 029): `PanelState`
  ganha `aspect`/`quality`; um componente genérico `PlayerChoicePanel`.
  Respeitar `logic/divisao.md` §1 da 040 (refs no `PlayerLayer`, sem contexto,
  ordem dos efeitos, um `useRemoteNav`).
- **D-009 — Aba pelo registro (item 63)**: `PlayerTab` substitui `PlayerSoonTab`
  em `settingsTabs.ts`; a `SettingsScreen` não muda. Seletor de cada linha =
  `Modal` (feature 022). Nome acessível das linhas: `"<rótulo>: <valor>"`.
- **D-010 — Linha de controles**: VOD `[ep. anterior] ⏪ ▶⏸ ⏩ [próximo ep.]
  Áudio Qualidade Aspecto Info`; Live `Guia Áudio Qualidade Aspecto Info`.
  Mensagens/rótulos novos como constantes em `components/player/
  playerMessages.ts`.

## Constitution Check

| Princípio | Pré-Design | Pós-Design |
| --- | --- | --- |
| Sem Conta Obrigatória | ✅ Nada de conta; preferências locais | ✅ |
| Segredos Fora dos Clientes e dos Logs | ✅ Painéis só mostram modo/resolução; erro do motor nunca repassado | ✅ Adaptador continua sem repassar o erro bruto (padrão `toPlayerError`); preferências não têm URL |
| Categorias da Fonte São Preservadas | ✅ Não toca categorias | ✅ |
| IA e Classificação Nunca Inventam Dados | ✅ Sem IA; nenhuma resolução/modo inventado | ✅ `distinctQualities` só filtra/ordena o que o motor deu |
| Comandos Locais Independem de Rede, Backend ou IA | ✅ Tudo local | ✅ |
| Trailers e Metadados Não Alteram o Estado Principal | ✅ N/A | ✅ |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | ✅ Painéis por ↑/↓/OK/RETURN; aba por D-pad | ✅ Seletor da aba por `Modal`; nada exige mouse |
| Uma Lista de Catálogo Nunca É Manifesto de Streaming | ✅ Variantes vêm do motor sobre o stream já aberto, não da lista | ✅ |
| Foco Visível e Sem Becos Sem Saída | ✅ Soft disabled explica (toast), painel sempre com foco, RETURN devolve ao botão | ✅ Contratos C1/C4/C5 cobrem foco e SELECT |
| Voltar Restaura Foco e Posição | ✅ Fechar painel → botão de origem; seletor → linha | ✅ |
| Identidade de Reprodução Não Depende da URL | ✅ Escolha por altura/modo, nunca por URL ou id de variante | ✅ D-007 |
| Progresso e Capacidades São Reais, Nunca Prometidos | ✅ Opções = capacidade real do motor/stream; spike na TV antes de declarar | ✅ D-002; SC-005 é gate |
| Documentação do Repositório É Canônica | ✅ CLAUDE.md, backlog, 027 R-012 | ✅ Tasks do Polish |
| Restrição: Design system V14 / tokens | ✅ Reusa CSS de painel da 029 e linhas das Configurações | ✅ Sem cor/espaço novo hardcoded |
| Restrição: Validação em hardware real (exceção de gate por feature) | ✅ Gate obrigatório declarado na spec | ✅ Fase 1 (spike) + passada final |

Sem violação — `Complexity Tracking` vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/041-player-qualidade-aspecto/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── logic/aspecto-qualidade.md
├── quickstart.md
├── tasks.md
├── contract-tests.lock
└── handoff.md
```

### Source Code (repository root)

```text
tv-web/src/
├── lib/player/
│   ├── viewChoice.ts                 # NOVO (stub): AspectMode, QualityOption, ViewChoice, pick*/distinct*/label
│   ├── playerPreferences.ts          # NOVO (stub): preferências do aparelho (localStorage)
│   ├── PlayerService.ts              # adaptador: 4 métodos opcionais (tipos já no stub); sessão: aspectModes/setAspectMode/getQualities/selectQuality
│   ├── avplayAdapter.ts              # mapeamento real conforme o spike (R-001/R-002)
│   ├── htmlVideoAdapter.ts           # aspecto por object-fit (dev)
│   └── tracks.ts                     # exportar LANGUAGE_OPTIONS
├── lib/comingSoon.ts                 # sai player-quality/speed/aspect e settings-player
├── components/
│   ├── PlayerLayer.tsx               # lê preferências na montagem; refs novos; props initialViewChoice/onViewChoiceChange
│   ├── player/playerLayerTypes.ts    # props (stub) + PanelState aspect/quality
│   ├── player/usePlayerPanels.ts     # painéis aspect/quality, viewChoiceRef, reapplyViewChoice
│   ├── player/usePlayerSession.ts    # chama reapplyViewChoice junto de reapplyTrackChoice
│   ├── player/usePlayerChrome.ts     # controlsFor passa aspect/quality
│   ├── player/usePlayerKeyboard.ts   # SELECT em quality/aspect via activatePanelControl
│   ├── player/playerMessages.ts      # mensagens novas
│   ├── chromeControls.ts             # sem speed; aspect/quality reais/indisponíveis
│   ├── PlayerChrome.tsx              # sem ícone de speed
│   ├── playerViewPanels.ts           # NOVO: modelo puro dos painéis (linhas, foco, reconciliação)
│   └── PlayerChoicePanel.tsx         # NOVO: painel genérico (radiogroup)
├── features/series/SeriesDetailScreen.tsx   # viewChoiceRef ao lado de trackChoiceRef
└── features/settings/
    ├── tabs/PlayerTab.tsx            # NOVO
    ├── PlayerPreferencesPanel.tsx    # NOVO
    ├── tabs/settingsTabs.ts          # player → PlayerTab
    ├── tabs/SimpleTabs.tsx           # sai PlayerSoonTab
    └── ComingSoonPanel.tsx           # sai a entrada player
tv-web/e2e/
├── qualidade-aspecto.mjs             # NOVO (entra em test:e2e)
├── player-chrome.mjs                 # ajustar: sem Velocidade, Qualidade/Aspecto
├── audio-legendas-info.mjs           # ajustar comentário/contagem da linha
└── home-busca-configuracoes.mjs      # ajustar a aba Player
```

**Structure Decision**: tudo em `tv-web/` (app client-first, ADR-008); nada em
`api/`. Segue a divisão do `PlayerLayer` feita na 040.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (a passada na TV é
gate desta feature).

Comandos-base (de `tv-web/`, salvo indicação):

```powershell
npx vitest run <arquivo>               # o mais estreito primeiro
npm run test
npx tsc -b --noEmit
npm run lint
npm run build:tizen
node e2e/qualidade-aspecto.mjs         # com npm run dev rodando
npm run test:e2e
# da raiz:
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 041-player-qualidade-aspecto
.\.planning\scripts\powershell\deploy-tv.ps1
```

Unitários novos (fora da trava): `viewChoice.test.ts` (distinct/pick/label,
empates, alturas inválidas), `playerPreferences.test.ts` (campo inválido,
armazenamento bloqueado/cheio, merge), sessão (`PlayerService.test.ts`:
aspectModes ∩, setAspectMode fora da lista, selectQuality/selectedQualityId,
fechada), `chromeControls.test.ts` (linhas sem speed, três estados de
qualidade), `playerViewPanels.test.ts`, adaptadores (`avplayAdapter`,
`htmlVideoAdapter`), `PlayerTab`/`PlayerPreferencesPanel` (todas as linhas,
RETURN no seletor, idiomas), FR-013 (preferência de legenda/áudio ausente no
conteúdo → nada selecionado, sem toast).

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/components/PlayerLayer.qualidade-aspecto.contract.test.tsx` (4),
`tv-web/src/features/settings/SettingsScreen.player-reproducao.contract.test.tsx` (1).

Comando (de `tv-web/`):
`npx vitest run src/components/PlayerLayer.qualidade-aspecto.contract.test.tsx src/features/settings/SettingsScreen.player-reproducao.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| C1 filme: "Aspecto" abre o painel só com os modos do motor… | US1/AC1-2, FR-001/002/015 | Fase 3 | `Unable to find … button "Aspecto"` |
| C2 canal: escolha de aspecto atravessa o zapping, não altera a preferência… | US1/AC3-5, US3/AC2-4, FR-003/012, SC-003 | Fase 3 | `Error: not implemented` (`writePlayerPreferences`) |
| C3 filme: preferência "Máxima" aplica a maior resolução… | US2/AC1-2, US3/AC2, FR-005/014, SC-001 | Fase 4 | `Error: not implemented` |
| C4 stream de qualidade única: soft disabled; sem "Velocidade"… | US2/AC3, US4, FR-006/009/016, SC-004; Constitution: Foco Visível | Fase 4 | `expect(element).not.toBeInTheDocument()` (ainda há "Velocidade") |
| C5 sem lista ativa: valores de fábrica; "Preencher" grava… | US3/AC1-5, FR-010/011/015/016 | Fase 5 | `Unable to find … button "Aspecto padrão: Ajustar"` |

**Contrato de outra feature emendado nesta etapa** (aprovado pelo usuário,
2026-10-01; R-012 do `plan.md` da 027, trava da 027 regravada): o 1º teste de
`tv-web/src/components/PlayerLayer.player-chrome.contract.test.tsx` agora exige
"Qualidade — indisponível"/"Aspecto — indisponível" (motor falso sem as APIs),
nenhum "Velocidade", 4 passos de ▶⏸ até "Aspecto" e o toast "Este aparelho não
permite ajustar o aspecto." — **vermelho até a Fase 3** (`Unable to find …
"Qualidade — indisponível"`). Os outros 4 testes da 027 seguem verdes. O
contrato da 029 (`PlayerLayer.audio-legendas-info.contract.test.tsx`) não foi
tocado: o comentário da linha 315 ainda cita "Velocidade", mas os 6 passos
seguem chegando em "Info do stream" (para no fim da linha) — não editar.

Stubs criados pelo plan (ponto de partida do execute, não travados):
`tv-web/src/lib/player/viewChoice.ts`, `tv-web/src/lib/player/playerPreferences.ts`,
os 4 métodos opcionais em `PlayerAdapter` (`PlayerService.ts`, só tipos) e as
props `initialViewChoice`/`onViewChoiceChange` (`playerLayerTypes.ts`, ainda
não lidas).

## Estado Atual

| Área | Estado |
| --- | --- |
| Fase 1 — spike na TV | **Concluída para o aspecto** (4 modos provados na TV, 01/10/2026); qualidade só no caso "uma disponível" |
| Fases 2–5 (fundação, aspecto, qualidade, aba) | **Concluídas** em código, testes e E2E |
| Fase 6 — Polish | **Concluída**: `e2e/qualidade-aspecto.mjs` (30 verificações), E2E vizinhos ajustados, docs; `test:e2e` com 22 scripts verdes |
| Aspecto no AVPlay | Real e provado na TV (`setDisplayMethod` + `setDisplayRect`; Zoom por retângulo 10% maior) |
| Qualidade no AVPlay | `getQualities` visto na TV (qualidade única); **troca de variante e Auto depois de forçar não provados** (R-009), com falha segura |
| Aba "Player & reprodução" | Real (`PlayerTab`), sem lista ativa; **ainda não vista na TV** |
| Contratos | 5/5 da 041, 5/5 da 027, 5/5 da 029 verdes; 24 travas íntegras; suíte 2113/2118 (5 = contratos da 034, base anterior) |
| Passada na TV física (Fase 7, gate obrigatório) | **Aberta** — build final (sem sonda) instalado na TV em 01/10/2026 |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Nomes e efeito reais dos modos de exibição do AVPlay (`setDisplayMethod`, `setDisplayRect` para Original, `setVideoRoi` para Zoom) e se o modo persiste entre sessões — só a TV prova (`research.md` R0-1) | Modo anunciado que não muda a imagem (viola SC-005) | Resolvido: spike de 2026-10-01 provou os 4 modos na TV (Zoom por retângulo maior, o `setVideoRoi` é recusado) — ver `research.md` R0-1. Plano original: Fase 1 (spike na TV) antes de implementar o adaptador; só modos provados entram em `getAspectModes()`. Se a TV estiver inacessível, parar e perguntar ao usuário (não implementar por suposição) |
| R-002 | Troca de qualidade no AVPlay pode exigir `ADAPTIVE_INFO` antes do `prepare` → reabrir por dentro do adaptador (`research.md` R0-2) | Engasgo na troca; posição perdida em VOD; corrida com callbacks da sessão antiga | Reabertura interna guardando a posição e emitindo `buffering`→`playing`; callbacks de um `open` superado descartados por um contador de geração no adaptador. Se nem isso funcionar, parar e decidir com o usuário (plano C: reabrir pelo `PlayerLayer`) |
| R-003 | Muitos streams IPTV (MPEG-TS) anunciam uma variante só | "Qualidade" quase sempre "só uma disponível" | Resolvido: aceito pela spec (US2 é P2, comportamento honesto); a passada na TV precisa de um HLS multi-variante para provar o caminho real |
| R-004 | Contrato travado da 027 emendado (1º teste) — vermelho até a Fase 3 | Suíte vermelha no meio da execução | Resolvido: esperado e registrado (R-012 da 027); a Fase 3 fecha só com ele verde |
| R-005 | Testes/E2E não travados que fixam o chrome antigo: `chromeControls.test.ts`, `PlayerLayer.test.tsx` (contagem de botões do VOD, achado na Fase 2), `PlayerChrome.test.tsx`, `comingSoon.test.ts`, `SettingsPanels.test.tsx`, `SettingsScreen.test.tsx` (usa a aba Player como mock "Em breve" — trocar para "Perfis & parental"), `e2e/player-chrome.mjs`, `e2e/audio-legendas-info.mjs`, `e2e/home-busca-configuracoes.mjs` | Vermelho por mudança intencional | Resolvido: ajustar só onde o comportamento mudou por FR desta spec (tasks dedicadas); nunca afrouxar asserção não relacionada |
| R-006 | Aplicar o aspecto só em `playing` pode mostrar a imagem no modo errado por um instante | Piscada perceptível na TV | Spike mede; se perceptível, reaplicar dentro do adaptador mais cedo sem mudar a assinatura de `open()` (`logic` §1.3) |
| R-007 | `localStorage` bloqueado/cheio na TV | Preferência não persiste | Resolvido: padrões de fábrica, sem erro (mesmo tratamento de `motionPreference`); coberto por unitário |
| R-009 | Troca de variante no AVPlay (`setSelectTrack('VIDEO')`) e retorno a Auto **não provados na TV**: o catálogo do usuário separa HD/4K em itens distintos, sem stream multi-variante (2026-10-01). Provado: `getTotalTrackInfo` devolve a entrada VIDEO e o botão mostra "só uma disponível" | Troca pode ser recusada pela TV; Auto depois de forçar uma variante é recusado | Decisão do usuário: implementar com falha segura (`false` → aviso, segue na anterior); Auto só aceito sem variante forçada. Gate da Fase 7: provar com um HLS multi-variante se existir; senão registrar "não executado" |
| R-008 | Passada na TV física é **gate obrigatório** (decisão do usuário, spec) | Feature não converge sem ela | Resolvido: Fase 7; cenários em `quickstart.md`; quem viu cada item fica registrado |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-01 | Fase 2 (Foundational + US4) | T004–T017: modelo puro, preferências, superfície da sessão, `chromeControls` sem `speed`, mocks removidos, mensagens, modelo/componente dos painéis, testes. `PlayerLayer.test.tsx` 8→7 botões. | Fase 1 (spike na TV) em aberto; bloqueia o adaptador AVPlay |
| 2026-10-01 | Fase 1 (aspecto) + Fase 3 (US1) | Sonda do AVPlay (`avplayProbe.ts`, só com `VITE_CCPLAY_AVPLAY_PROBE=1`) instalada na TV; 4 modos provados; `PlayerLayer` com painéis de aspecto **e** qualidade, reaplicação, preferências; adaptadores AVPlay/`<video>` de aspecto; `SeriesDetailScreen` | Qualidade no AVPlay ainda sem prova (só no build da sonda); persistência do modo entre sessões e piscada (R-006) não medidas |

| 2026-10-01 | Fase 4 (US2) + Fase 5 (US3) | Qualidade no AVPlay (`getQualities`/`selectQuality`, falha segura, R-009); sonda removida; aba **Player & reprodução** real (`PlayerTab`), mocks `settings-player`/`PlayerSoonTab` removidos; testes. Suíte: 2113/2118 (5 = contratos da 034, base) | Troca de variante e a aba não vistas na TV; falta Polish (E2E, quickstart, docs) e a Fase 7 |

**PRÓXIMO**: Fase 7 (T044) — passada na TV física com o usuário: aba Player & reprodução, Zoom/aspecto em filme e canal, volta à preferência no filme seguinte, qualidade única, preferências de áudio/legenda, ausência de "Velocidade"; HLS multi-variante só se existir. Depois, `sdd-converge`

## Arquivos Principais

- `tv-web/src/lib/player/viewChoice.ts`, `playerPreferences.ts`, `PlayerService.ts`, `tracks.ts` (`LANGUAGE_OPTIONS`)
- `tv-web/src/components/chromeControls.ts`, `PlayerChrome.tsx`, `playerViewPanels.ts`, `PlayerChoicePanel.tsx`, `player/playerMessages.ts`
- `tv-web/src/lib/comingSoon.ts`
- Próximos: `PlayerLayer.tsx` + `player/usePlayerPanels.ts`/`usePlayerSession.ts`/`usePlayerChrome.ts`/`playerLayerTypes.ts`; `htmlVideoAdapter.ts`; `SeriesDetailScreen.tsx`

## Cuidados para Retomada

- Sem a TV, **não** implementar o mapeamento AVPlay (T022/T029) por suposição: parar e perguntar. Dá para andar nas tasks sem AVPlay antes.
- Até a Fase 3 fechar, `usePlayerChrome` ainda não passa `features.aspect`/`quality`: o chrome mostra "Qualidade — indisponível"/"Aspecto — indisponível" mesmo com motor capaz. Esperado.
- `PlayerLayer.test.tsx` fixava 8 botões no VOD; agora 7. Se aparecer teste novo contando botões do chrome, é a mesma causa.
- `settings-player` continua em `comingSoon.ts` até a T034 (Fase 5).
- PowerShell: não nomear função `R` (alias de `Invoke-History`) ao editar docs por script.

## Resultado Final

**Convergida (2026-10-01).** O que foi construído, contra a spec:

- **Aspecto (US1, P1)**: painel real em filme, episódio e canal (`PlayerChoicePanel`, estado do `PlayerLayer`, não `Modal`); só os modos que o motor declara. No AVPlay, os 4 modos foram **provados na QN50Q60DAGXZD** (spike de 01/10/2026): `setDisplayMethod` + `setDisplayRect`; o `setVideoRoi` é recusado, então o **Zoom é um retângulo 10% maior que a região** (desvio do mapeamento candidato de `research.md` R0-1, que previa ROI). `<video>` por `object-fit`.
- **Qualidade (US2, P2)**: painel com Auto + só as resoluções anunciadas; "só uma disponível"/"indisponível" soft disabled com o motivo. Lê as entradas `VIDEO` de `getTotalTrackInfo` (qualidade única vista na TV). A troca usa `setSelectTrack(\'VIDEO\', i)` com falha segura, **não provada na TV** (R-009), e "Auto" depois de forçar uma variante é recusado com aviso — o retorno ao adaptativo exigiria reabrir o stream (R-002), também sem prova.
- **Preferências (US3, P2)**: aba real `PlayerTab` (3ª aba, sem lista ativa), `localStorage` `ccplaytv:player-preferences`; o player lê uma vez por montagem e nunca grava (D-005); uma montagem nova parte da preferência — conferido no navegador (E2E) e na TV pelo usuário.
- **Sem Velocidade (US4, P3)**: fora de `ChromeControlId`, de `PlayerChrome` e de `comingSoon.ts`; `settings-player`, `player-quality`, `player-aspect` e `player-speed` também saíram.

**Desvios do plano original**: (1) o Zoom (acima); (2) o spike foi feito com um build de sonda (`VITE_CCPLAY_AVPLAY_PROBE`), porque o controle do usuário não tem teclado numérico — os botões do player foram ativados no build da sonda, o que antecipou o painel e a reaplicação de **qualidade** (T026–T028) para dentro da Fase 3; a sonda foi removida (T040); (3) a decisão R-009 do usuário de implementar a qualidade sem prova; (4) a emenda do 1º teste da 027 (R-012 da 027, aprovada) — o contrato da 029 não precisou de emenda e a frase da spec foi corrigida (A-01); (5) `PlayerLayer.test.tsx` entrou na lista de testes ajustados (8→7 botões no chrome do VOD).

**Verificação**: 15/15 contratos (5 da 041, 5 da 027, 5 da 029) e 24 travas íntegras; `npx vitest run` 2113/2118 (as 5 são os contratos da 034, vermelho de base anterior à 041); `tsc` limpo; `npm run test:e2e` com 22 scripts verdes, incluindo `e2e/qualidade-aspecto.mjs` (30 verificações); passada na TV (gate obrigatório) confirmada pelo usuário nos 7 itens do quickstart.

**Em aberto, registrado** (não bloqueia a convergência): R-009/R-002 (troca de variante e Auto no AVPlay — precisam de um HLS multi-variante), R-006 (piscada ao aplicar só em `playing` — sem relato). A cobertura do edge case "Guia/zapping abertos sobre o vídeo" é por leitura da ordem de teclado (LOW). Achados desta convergência: F-01 (MEDIUM, = R-009) e F-02 (LOW).


## Passada física na TV — 2026-10-02

Passada feita na TV QN50Q60DAGXZD (backlog item 58), com o build de 02/10/2026. Resultado relatado pelo usuário: roteiro aprovado, sem pendência aberta por esta verificação. Os riscos de hardware desta feature (`R-xxx` marcados como "só se prova na TV") ficam encerrados por decisão do usuário. Registro honesto: o resultado vem do relato do usuário, sem números medidos nem capturas.

**Ressalva (041):** o R-009 (troca de variante) foi encerrado por relato do usuário; não houve HLS multi-variante dedicado nos registros.
