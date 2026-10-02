# Lógica: aspecto, qualidade, sequência e preferências

Referência para o executor. Os contratos travados
(`PlayerLayer.qualidade-aspecto.contract.test.tsx`,
`SettingsScreen.player-reproducao.contract.test.tsx` e o 1º teste emendado de
`PlayerLayer.player-chrome.contract.test.tsx`) fixam nomes e comportamento; este
arquivo fixa o **como**, para não reinventar o que a 029 já resolveu.

Regra geral: o padrão é o da feature 029 (`sdd/specs/029-audio-legendas-info-
player/logic/faixas-e-legendas.md`) — método opcional no adaptador = capacidade;
painel = estado do `PlayerLayer` (nunca `Modal`, a camada já captura o teclado);
escolha da pessoa vive num ref que atravessa a sequência; reaplicação
automática na primeira entrada em `playing`, silenciosa, nunca conta como
escolha da pessoa. E as regras da 040 (`sdd/specs/040-dividir-player-live/
logic/divisao.md` §1): refs nascem no `PlayerLayer`, sem contexto novo, ordem
dos efeitos preservada, um `useRemoteNav` por componente.

## §1 Aspecto

### 1.1 Sessão

`PlayerServiceSession` ganha (todos seguros com a sessão fechada):

```ts
readonly aspectModes: readonly AspectMode[]   // ASPECT_MODES ∩ adapter.getAspectModes?.(), na ordem de ASPECT_MODES; [] sem o método ou se ele lançar. Calculado UMA vez, no construtor.
readonly currentAspect: AspectMode | null     // último modo aceito pelo motor nesta sessão
setAspectMode(mode: AspectMode): boolean      // false: fechada, modo fora de aspectModes, motor recusou/lançou. true grava currentAspect.
```

### 1.2 Que modo aplicar (`pickAspectForChoice`)

`pickAspectForChoice(supported, choice)`: `choice` se `supported` o contém;
senão `'fit'` se contém; senão `null` (não chama o motor). Ex.: preferência
`original` num motor sem `original` → `fit`, sem aviso (mesma filosofia de
FR-013).

### 1.3 Quando aplicar

`reapplyViewChoice(session)` roda no **mesmo ponto** de `reapplyTrackChoice`
(`usePlayerSession`, primeira entrada em `playing`, antes de
`onEnteredPlaying`), logo depois dele. Aplica **sempre**, inclusive `fit`: o
AVPlay é um singleton e o modo pode sobreviver a `close()`/`open()` (R-001). Se
o spike provar que aplicar só em `playing` mostra a imagem errada por um
instante perceptível, o executor pode aplicar mais cedo **dentro do adaptador**
(ex.: guardar o último modo pedido e reaplicá-lo no `prepareAsync`) — nunca
mudando a assinatura de `open()` (os motores falsos dos contratos travados não
a conhecem).

### 1.4 Painel "Aspecto"

- Linhas: `session.aspectModes`, rótulos `ASPECT_LABEL`, chaves `a:<modo>`.
- Marcado: `session.currentAspect ?? pickAspectForChoice(session.aspectModes, 'fit')`.
- Foco ao abrir: a linha marcada (FR-002).
- ↑/↓ movem (sem volta nas pontas), ←/→ não fazem nada, OK aplica, RETURN
  fecha e devolve o foco ao botão de origem (`closePanel`, igual à 029).
- OK: `session.setAspectMode(m)`; `true` → `commitView({ aspect: m })`;
  `false` → toast `ASPECT_SWITCH_FAILED` ("Não foi possível mudar o aspecto."),
  marcação continua refletindo `currentAspect` (o que o motor fez).
- Desenho: diálogo `aria-label="Aspecto"`, `radiogroup` "Aspecto", linhas
  `role="radio"` com `aria-checked` — componente genérico novo
  `PlayerChoicePanel` (mesmo CSS de `PlayerTracksPanel`: `.modal-overlay`,
  `.modal-panel.player-panel.no-scrollbar`, `.player-panel-row`).

## §2 Qualidade

### 2.1 Opções (`distinctQualities`, `qualityLabel`)

- Descarta altura não finita/≤ 0.
- Uma opção por altura: no empate, a de maior `bitrateKbps` (ausente conta
  como 0); empate total → a primeira na ordem do motor.
- Ordena da maior altura para a menor.
- Rótulo: `` `${height}p` `` — nunca "HD"/"Full HD"/"4K" (é o que o stream
  disse, nada mais).

### 2.2 Que variante aplicar (`pickQualityForChoice`)

Sobre `distinctQualities(options)`:

| Escolha | Resultado |
| --- | --- |
| menos de 2 opções | `null` (Auto — o motor já toca a única que há; FR-014) |
| `'auto'` | `null` |
| `'max'` | `id` da maior altura |
| `'min'` | `id` da menor altura |
| `{ height }` | `id` da opção com essa altura; não anunciada → `null` (FR-008) |

Na reaplicação (§1.3): resultado `null` → **não** chama `selectQuality` (o
padrão do motor já é adaptativo; chamar reabriria à toa — R-002). Resultado
`id` → `session.selectQuality(id)`, silencioso na falha.

### 2.3 Sessão

```ts
readonly supportsQuality: boolean             // typeof getQualities === 'function' && typeof selectQuality === 'function'
getQualities(): QualityOption[] | null        // cru do motor (try/catch); fechada → null
readonly selectedQualityId: string | null     // null = Auto; atualizado só quando o motor aceita
selectQuality(id: string | null): boolean
```

### 2.4 Disponibilidade no chrome

O `PlayerLayer` cria um ref compartilhado (ex.: `qualityOptionsRef:
RefObject<QualityOption[]>`, já passado por `distinctQualities`) e o entrega a
`usePlayerChrome` (lê) e `usePlayerPanels` (escreve). Atualizado: na
reaplicação (primeira entrada em `playing`), no SELECT do controle (antes de
decidir) e a cada releitura do painel aberto (`usePanelRefresh`). Nunca a cada
render (ler o motor a cada tick de progresso seria caro na TV).

| Situação | Nome do controle | `availability` | SELECT |
| --- | --- | --- | --- |
| sem `supportsQuality`, ou 0 opções | `Qualidade — indisponível` | `unavailable` | toast `QUALITY_UNAVAILABLE_MESSAGE` ("Este stream não informou qualidades.") |
| 1 opção | `Qualidade — só uma disponível` | `unavailable` | toast `QUALITY_SINGLE_MESSAGE` ("Este stream oferece uma única qualidade.") |
| ≥ 2 opções | `Qualidade` | `real` | abre o painel |

Aspecto, pela sessão (como `supportsTracks`): `aspectModes.length > 0` →
`Aspecto` real; senão `Aspecto — indisponível` + toast
`ASPECT_UNAVAILABLE_MESSAGE` ("Este aparelho não permite ajustar o aspecto.").
`ChromeFeatures` ganha `aspect?: boolean` e `quality?: 'many' | 'single' | 'none'`
(opcionais; ausentes = indisponível, para chamadas antigas continuarem válidas).

### 2.5 Painel "Qualidade"

- Linhas: `Auto` (chave `q:auto`) + uma por opção distinta (`q:<altura>`).
- Marcado: `selectedQualityId === null` → Auto; senão a linha cuja opção tem
  esse id.
- Foco ao abrir: a marcada. Teclas iguais ao §1.4.
- OK: `session.selectQuality(id | null)`; `true` → `commitView({ quality: id ===
  null ? 'auto' : { height } })`; `false` → toast `QUALITY_SWITCH_FAILED` ("Não
  foi possível mudar a qualidade."), reprodução segue na anterior (FR-007).
- Releitura com o painel aberto: relê opções; se a marcada sumiu e não é Auto,
  `session.selectQuality(null)` (cai para Auto — edge case da spec), **sem**
  `commitView` (não foi escolha da pessoa). Foco reconciliado pela chave, nunca
  pelo índice; chave sumida → a marcada.

## §3 Sequência e preferências

- O `PlayerLayer` lê as preferências **uma vez por montagem** (lazy
  `useRef`/`useState` no topo, antes dos outros hooks — nenhum efeito novo).
- Sementes: `choiceRef` (faixas) = `initialTrackChoice ??
  trackChoiceFromPreferences(prefs)`; `viewChoiceRef` = `initialViewChoice ??
  viewChoiceFromPreferences(prefs)`.
- `commitView(patch)`: `viewChoiceRef.current = {...atual, ...patch}` e
  `onViewChoiceChange?.(atual)`. **Nunca** chama `writePlayerPreferences`.
- Troca de `itemId` na mesma montagem herda o ref (zapping, CH±, ↑/↓,
  "Próximo episódio"). `SeriesDetailScreen` guarda um `viewChoiceRef` ao lado do
  `trackChoiceRef` que já existe, zerado nos **mesmos** pontos (linhas ~404,
  ~418, ~466 de hoje) e passado por `initialViewChoice`/`onViewChoiceChange`.
  Live TV e Filmes não passam nada: cada abertura é reprodução nova.
- Preferência mudada com o player aberto não afeta a montagem em andamento
  (contrato C2): a leitura já aconteceu.

## §4 Aba "Player & reprodução"

Substitui `PlayerSoonTab` no registro (`settingsTabs.ts`) por `PlayerTab`
(`features/settings/tabs/PlayerTab.tsx`) + `PlayerPreferencesPanel`
(`features/settings/PlayerPreferencesPanel.tsx`). Some `settings-player` de
`comingSoon.ts` e a entrada `player` de `ComingSoonPanel.tsx` (fica só
`parental`; `ComingSoonTab` passa a aceitar só `'parental'`).

Linhas (nesta ordem), botões com `aria-label="<rótulo>: <valor>"` e classe
`no-scale` (achado de foco cortado nas Configurações, ad-hoc anterior):

| Linha | Rótulo | Valores (seletor) | Valor de fábrica |
| --- | --- | --- | --- |
| 0 | `Aspecto padrão` | Ajustar, Preencher, Original, Zoom | Ajustar |
| 1 | `Qualidade padrão` | Auto, Máxima, Econômica | Auto |
| 2 | `Idioma do áudio` | Padrão do conteúdo + idiomas | Padrão do conteúdo |
| 3 | `Legenda` | Desligada + idiomas | Desligada |

- Idiomas: a lista fixa de `LANGUAGE_NAMES` de `tracks.ts` (exportar como
  `LANGUAGE_OPTIONS: { code; label }[]`, mesma ordem da tabela) — nunca
  `Intl.DisplayNames` (varia entre Chromium da TV e Node).
- A aba oferece os 4 modos de aspecto mesmo sem saber o motor: num motor que
  não aceita o escolhido, a reprodução cai em `fit` (§1.2). Um parágrafo no
  topo diz isso de forma honesta: "Valem para toda reprodução nova neste
  aparelho. No player, a escolha vale só até o fim da sequência."
- Teclas da aba (encaminhadas pela tela, `SettingsTabHandle`): ↑/↓ movem entre
  as 4 linhas (clamp); ↑ na linha 0 → `goToTopbar`; ← → `exitToTabs`; OK abre o
  seletor; `onEnter` volta à linha 0.
- Seletor: `Modal` (feature 022) com `ariaLabel` = rótulo da linha, opções
  `role="radio"` em `radiogroup`, foco inicial na marcada, ↑/↓ clamp, OK grava
  (`writePlayerPreferences`) e fecha com o foco de volta na linha, RETURN fecha
  sem gravar. Só um `.tv-focus` na tela com o seletor aberto (a linha de trás
  não marca foco — mesmo cuidado da aba Privacidade).
- Funciona sem lista ativa (não lê `activeSourceId`).

## §5 Chrome e Velocidade

- `ChromeControlId` perde `'speed'`. VOD: `[episódio anterior] ⏪ ▶⏸ ⏩
  [próximo episódio] Áudio Qualidade Aspecto Info`. Live: `Guia Áudio Qualidade
  Aspecto Info` (inalterado).
- `comingSoon.ts` perde `player-quality`, `player-speed`, `player-aspect` (e,
  na US3, `settings-player`). `getComingSoon('player-speed')` passa a lançar.
- `PlayerChrome.tsx` perde o ícone/rótulo de `speed`; `quality`/`aspect`
  mantêm os ícones de hoje.
- `activatePanelControl` (usePlayerPanels) passa a tratar `quality` e
  `aspect` como trata `tracks`/`info`: real → abre painel; indisponível →
  toast com o motivo, sem painel, `scheduleHide()`.
- `PanelState` ganha `{ kind: 'aspect'; focusKey; originIndex }` e
  `{ kind: 'quality'; focusKey; originIndex }`; `handlePanelDirection`/
  `handlePanelSelect`/`refreshPanel` despacham por `kind`. A prioridade de
  teclado não muda: `topLayer` → painel → erro → chrome (painéis não abrem sob
  guia/zapping, edge case da spec).
