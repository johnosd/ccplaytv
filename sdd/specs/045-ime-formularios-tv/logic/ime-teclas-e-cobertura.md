# Lógica — teclas do IME, cobertura do campo e "Mostrar" da senha

Feature 045, US2/US3/US4/US5. **Aviso de honestidade**: o que o IME real da Samsung entrega à página
(Next, Done, Cancel, RETURN com o teclado aberto) **não foi medido** — só há o texto do guia
(`docs/guia-praticas-app-tv/05_entrada_de_texto.md`: "Next avança, Done conclui") e a memória de que
`keyCode` 65376 = Done e 65385 = Cancel. Tudo aqui é desenhado para **mudar numa tabela só** quando a
passada na TV (T002) medir de verdade. Veja R-001/R-002 no `plan.md`.

## 1. Tabela de teclas do IME — `lib/imeKeys.ts` (T003)

```ts
export const IME_KEYCODES = { done: [65376], cancel: [65385], next: [] as number[] }   // next: a medir (R-001)
export type ImeKey = 'done' | 'cancel' | 'next'
export function imeKeyOf(event: { keyCode?: number }): ImeKey | null   // pura; só keyCode (key vem 'Unidentified')
```

Regra que não pode mudar: **`Enter` NUNCA é tomado de um campo.** Na TV, OK num campo focado é o que
abre/fecha o teclado do sistema (comentários em `useRemoteNav.ts` `EDITABLE_PASSTHROUGH_KEYS` e em
`AddSourceScreen`). Interceptá-lo impediria abrir o teclado. Isso estreita o "Done (ou Enter)" do FR-014
(R-011): só o `keyCode` de Done do IME conclui o campo; o contrato C5 trava os dois lados.

## 2. Encadeamento — `lib/useImeChain.ts` (T013)

```ts
useImeChain(containerRef, primaryRef)   // um listener `keydown` no contêiner da tela
```

- Só age quando `event.target` é um `input.text-field-input` dentro do contêiner e `imeKeyOf` ≠ null.
- `done` ou `next`: `preventDefault()` + `stopPropagation()` e foca **o próximo `input.text-field-input` em
  ordem de documento**; se não houver próximo → `primaryRef.current?.focus()` (a ação principal). Nunca
  `click()`, nunca submete (FR-014).
  - `done` num campo **do meio** avança como `next` (D-004) — a pessoa terminou de digitar aquele campo.
- `cancel`: `stopPropagation()` e nada mais (não é RETURN — `10009` — e não pode sair da tela). O teclado
  fecha sozinho pelo sistema.
- O contêiner é o `<section>` da tela. O listener é **nativo**, no contêiner (borbulha antes de
  `document`), para que `useRemoteNav`/`useTvKeyNav` (ambos em `document`) não vejam a tecla tratada.
- `TextField` ganha `enterKeyHint?: 'next' | 'done'` (atributo `enterkeyhint`, suportado pelo Chromium alvo);
  as telas passam `next` nos campos que têm um seguinte e `done` no último.
- Não existe encadeamento por foco programático "mantendo o teclado aberto": `input.focus()` não abre o IME
  na TV; se o IME mantém o teclado aberto ao trocar de campo é comportamento do sistema (R-001).

## 3. Cobertura do campo — `lib/focus/revealInTopHalf.ts` (T015)

Critério (FR-016, SC-005): o retângulo do **bloco do campo** (`.text-field`: rótulo + campo + dica + erro)
inteiro na **metade superior** do contêiner rolável, depois de cada foco.

```ts
// pura — testável sem DOM
export function topHalfScrollDelta(block: Rect, container: Rect): number
//   alvo: block.bottom <= container.top + container.height / 2  e  block.top >= container.top
//   se já atende → 0
//   senão → block.top - (container.top + container.height * 0.1)   (ancora o bloco a ~10% do topo)
export function revealInTopHalf(block: HTMLElement): void
//   acha o ancestral rolável mais próximo (overflow-y auto|scroll), calcula o delta e faz scrollTop += delta/escala
//   escala = rect.height / clientHeight  (o palco 1920×1080 pode estar escalado — `lib/stage.ts`)
//   chamada num requestAnimationFrame depois do `focus` (o layout já assentou)
```

- Chamada por `TextField` em `onFocus` (todo campo, inclusive a busca — FR-023 e Assumption da spec).
- **Espaço para rolar**: um campo no fim do conteúdo não consegue subir à metade de cima sem folga
  embaixo. As telas de formulário ganham uma folga de **metade da altura do palco** no fim da área
  rolável (`.form-scroll-room::after`, altura = `calc(var(--stage-height, 1080px) / 2)` — conferir o token
  existente em `index.css`/`lib/stage.ts`) — só nas telas de formulário, não globalmente.
- `.screen.epg-settings` e `.screen.tmdb-key` hoje **não rolam** (`.screen` não tem `overflow`); passam a ter
  `overflow-y: auto` + `.no-scrollbar` (padrão da 028). Cuidado: `overflow` recorta o anel de foco — ver o
  achado da 036 em `settings.css:27` (usar folga lateral/`padding` como lá).
- Ao fechar o teclado e o foco ir ao botão de ação (US3-AC3): o botão também chama `revealInTopHalf`?
  **Não** — o critério é do campo; o botão só precisa estar visível: usar `scrollIntoView({block:'nearest'})`
  no foco programático da ação.

## 4. "Mostrar/Ocultar" — dentro de `TextField` (T018)

```ts
<TextField ... purpose="password" revealable revealNoun="senha" />   // ou revealNoun="chave"
```

- Estado `revealed` é `useState` do **próprio** `TextField` → desmontar a tela (sair por qualquer caminho)
  zera (FR-020). Nunca `localStorage`, nunca prop de tela.
- O `<input>` troca `type` entre `password` e `text`; o **mesmo** elemento (sem remontar) para não perder
  foco/cursor.
- O botão fica **logo depois do `<input>` no DOM** (ordem de foco, FR-019), `type="button"`,
  `aria-pressed={revealed}`, nome acessível "Mostrar senha" / "Ocultar senha" (`revealNoun`), texto visível
  "Mostrar"/"Ocultar" (o estado não depende só de cor — FR-021) e `className` `button-secondary`.
- Se o campo não for `purpose="password"`, `revealable` é ignorado.
- **Nenhum** anúncio, banner, `aria-*` ou log inclui o valor do campo (FR-022). O anúncio do estado é o
  próprio `aria-pressed` — não usar `useAnnounce` com o valor.
- `TmdbKeyScreen` deixa de ter o seu botão `Mostrar chave`/`Ocultar chave` e usa `revealable
  revealNoun="chave"`; o campo continua começando sempre vazio.

## 5. Fiação por tela (T014/T020)

| Tela | `useImeChain` | `primaryRef` | `enterKeyHint` |
| --- | --- | --- | --- |
| `AddSourceScreen` | sim | botão "Conectar e sincronizar"/"Salvar alterações" | `next` em Nome/Servidor/Usuário (e Nome em M3U); `done` em Senha/URL M3U |
| `TmdbKeyScreen` | sim | "Salvar e testar" | `done` |
| `EpgSettingsScreen` | sim | "Salvar endereço" | `done` |

`Button` ganha `buttonRef?: Ref<HTMLButtonElement>` (aditivo) para que as telas foquem a ação principal.
