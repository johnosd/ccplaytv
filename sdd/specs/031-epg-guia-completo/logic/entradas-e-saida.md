# Lógica — entradas, saída e o encaixe na Live TV e no player

Arquivos: `tv-web/src/features/live/LiveScreen.tsx`, `tv-web/src/components/PlayerLayer.tsx`,
`tv-web/src/components/chromeControls.ts`, `tv-web/src/App.tsx`. Contratos:
`LiveScreen.epg-guia-completo.contract.test.tsx`, `PlayerLayer.epg-guia-completo.contract.test.tsx`.

## 1. Onde o guia mora

Um único componente, `EpgGuide`, com o teclado **encaminhado pelo hospedeiro** (`EpgGuideHandle`).
Dois hospedeiros, um de cada vez:

| Entrada | Hospedeiro | Teclado |
| --- | --- | --- |
| "Guia completo" do preview (parado) | o próprio `LiveScreen`, no lugar do conteúdo (sem topbar — FR-001, tela inteira) | o `useRemoteNav` do `LiveScreen` encaminha (`guideOpen && !playing`) |
| "Guia" do chrome (tocando) | `topLayer` do `PlayerLayer` (a sessão **não** fecha; o guia é opaco por cima — feature 016) | o `PlayerLayer` já redireciona `onDirection/onSelect/onBack` do `topLayer` |

## 2. Estado novo no `LiveScreen`

```ts
const [guide, setGuide] = useState<{ list: GuideListKey; originId: string | null } | null>(null)
const guideRef = useRef<EpgGuideHandle>(null)
const zapKeyRef = useRef<EnteredKey | null>(null)   // lista de onde o canal começou a tocar (par de zapSequenceRef)
```

`zapKeyRef.current = entered` em todo lugar onde `zapSequenceRef.current` é atribuído
(`playActiveChannel`, duas vezes) — para "Guia" no player abrir na **lista de origem** (FR-010).

## 3. Abrir

- **Do preview** (`handleTrailSelect`, coluna 2, ação 2): `openGuide({ list: keyOf(entered), originId: activeChannel.id })`
  e `setCol(1)` — assim, ao voltar, o foco cai na **lista de canais**, no canal de origem (FR-012).
  Remove o `showToast('Em breve — …')`.
- **Do player** (`onGuide` de `PlayerLayer`): `list = zapKeyRef.current` traduzido a `GuideListKey`,
  ou, sem ele, a categoria do canal tocando (mesma regra de `openZapping`: por `original_group`);
  `originId = playing.id`. Fechar o zapping se aberto (nunca dois `topLayer`).
- `keyOf(entered)`: `favorites`/`all` iguais; `category` → `{ kind:'category', id }`.

## 3b. Renderização

- Parado (`!playing`): se `guide`, o `return` do `LiveScreen` é só
  `<div className="screen epg-guide-screen"><EpgGuide … /></div>` + o `Toast` — sem `withShell`.
- Tocando: `topLayer = guide ? { content: <EpgGuide … />, onDirection: d => guideRef.current?.onDirection(d), onSelect: () => guideRef.current?.onSelect(), onBack: () => guideRef.current?.onBack(), onMediaKey: k => … } : zapOpen ? {…zapping…} : null`.
- `onLongSelect`/`onFavoriteKey` **não** são passados no guia (favoritar não é do guia).
- `onEnteredPlaying`: `setZapOpen(false); setGuide(null)` — o guia (aberto do player) só fecha
  quando o canal novo já está tocando (FR-022, sem quadro preto — feature 016).

## 4. Assistir (`onWatch(channel, list, listKey)`)

```text
zapSequenceRef.current = list                       // FR-020: a vizinhança passa a ser a lista do guia
zapKeyRef.current = enteredOf(listKey)
focar o canal na Live TV: setEntered(enteredOf(listKey)); setFocusedIdentity({ trailKey: trailKeyOf(listKey, categories), channelId: channel.id }); setCol(1)
if playing?.id === channel.id → setGuide(null); return      // mesmo canal: só fecha
lastGoodChannelRef.current = playing                        // D-008 da 027: fallback de erro
setPlaying(channel)
if !playing → setGuide(null)                                // parado: o player cobre tudo; RETURN dele cai na lista já focada no canal
// tocando: o guia fica até `onEnteredPlaying`
```

`trailKeyOf`: favorites/all como o `LiveScreen` já usa (`{kind:'favorites'}`/`{kind:'all'}`); categoria →
`{ kind:'category', name: groupLabel(category.name) }`. Se a categoria da lista não estiver em `categories`
(removida): não muda `entered` nem foco — o canal toca do mesmo jeito.

## 5. Sair

`onClose` do guia: `setGuide(null)` **e nada mais** (sessão intacta; estado da Live TV intacto — o foco
"volta" porque nunca saiu). RETURN do **player** depois de assistir pelo guia: `setPlaying(null)` (como hoje)
→ Live TV com o foco no canal escolhido (`setFocusedIdentity` acima, FR-012).

## 6. `PlayerLayer` e o chrome

- `chromeControls` ganha `features.guide?: boolean`; Live: `guide` é
  `{ id:'guide', availability:'real', label:'Guia' }` quando `features.guide`, senão o de hoje
  (`availability:'soon'`, `label:'Guia — em breve'`, **sem** `comingSoonId`, porque o mock `epg-guide` sai do
  registro — FR-011). Nome acessível "Guia — em breve" preservado para o contrato travado da 027.
- `PlayerLayer`: `controlsFor` passa `guide: Boolean(onGuide)`; no OK da linha do Live, antes do toast de
  "Em breve": `if (control.id === 'guide' && control.availability === 'real') { onGuide?.(); return }`;
  `soon` sem `comingSoonId` → `showToast('O guia não está disponível neste player.')`.
- `PlayerLayerTopLayer` ganha `onMediaKey?: (key: string) => boolean`: hoje o `PlayerLayer` ignora teclas de
  mídia com `topLayer` aberto (`if (topLayer || …) return`). Com `topLayer.onMediaKey`, `ChannelUp/Down`
  chegam a ele (→ `guideRef.onPage`); qualquer outra tecla de mídia continua ignorada. `MediaStop` segue
  fechando o player como RETURN.
- Parado, o `LiveScreen` passa `onMediaKey` ao seu `useRemoteNav` (`ChannelUp/Down` → `guideRef.onPage`)
  só enquanto `guide && !playing`.

## 7. `App.tsx`

`onOpenEpgSettings={() => dispatch({ type: 'open', screen: { name: 'epg-settings', source }, from: { name: 'live' } })}`
no `case 'live'` (a fonte ativa já está em escopo). RETURN da tela de EPG volta à Live TV (remontada, sem guia).

## 8. Remoções e ajustes de teste (FR-011)

- `comingSoon.ts`: apagar `epg-guide`; `comingSoon.test.ts`: tirar da lista e da asserção de `backlogItem`.
- `LiveScreen.test.tsx` (≈ linhas 1369–1380): o teste de "Guia completo → Em breve" passa a afirmar que abre o guia.
- `chromeControls.test.ts`: os casos de `epg-guide` passam a cobrir `features.guide`.
- E2E: `live-tv-ds-v14.mjs` (passo "Guia completo mostra Em breve") e `player-chrome.mjs` (linhas ≈ 278–280,
  "Guia — em breve") — atualizar para o novo comportamento (são scripts não travados; a mudança é o próprio FR-011).
