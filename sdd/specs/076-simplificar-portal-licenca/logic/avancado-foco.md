# Visões, foco e textos — Portal & licença com Avançado (076)

Delimita o "como" que um executor erraria. Fonte: D-001..D-009 do `plan.md`. Parte do que a 075 entregou
(`sdd/specs/075-redesenho-portal-licenca/logic/foco-portal.md`): o que não está aqui continua como lá.

## 1. Visões e ações por id

```ts
type PortalView = 'main' | 'advanced'
type MainActionId = 'retry' | 'purchase' | 'refresh' | 'advanced'
type AdvancedActionId = 'eye' | 'rotate' | 'recover' | 'unlink'
type PortalActionId = MainActionId | AdvancedActionId

// Tela principal: [retry?] → purchase* → refresh* → advanced   (* só no build comercial; retry só com falha/desvinculada)
function mainActions(s: { pairingFailed: boolean; commercial: boolean }): MainActionId[]

// FR-004: Comprar (teste/vencida/sem), Atualizar (ativa), Avançado (build não comercial); cai em actions[0] se a desejada não existe
function initialMain(actions: MainActionId[], s: { commercial: boolean; licenseState?: 'trial' | 'active' | 'revoked' }): MainActionId

// Subtela: sempre as quatro, nesta ordem; foco de entrada = 'eye'
const ADVANCED_ACTIONS: AdvancedActionId[] = ['eye', 'rotate', 'recover', 'unlink']

// Mantida da 075: o foco guardado só vale se a ação existe na visão atual
function resolveAction<T>(actions: T[], initial: T, focusedId?: T): T
```

- A aba (`PortalLicenseTab`) guarda `{ view, focusedId }` — **nunca índice**. O painel recebe `view` e `focusedId` por props
  e expõe no handle `{ activate, actions, initial }` **da visão atual** (a aba lê `panel.current` a cada tecla; o handle é
  recriado a cada render).
- `eye` e `unlink`/`rotate` indisponíveis (sem conexão ou sem device) continuam focáveis e **soft-disabled** (`Button softDisabled`);
  o motivo (`portal.advanced.needsPairing`) aparece como linha do próprio item, não só no nome acessível.

## 2. Transições (dono: a aba)

| Evento | Efeito |
| --- | --- |
| `onEnter` | `view='main'`, `focusedId = initialMain(...)` |
| SELECT em `advanced` (ou clique) | `view='advanced'`, `focusedId='eye'` |
| `onBack()` com `view==='advanced'` | `view='main'`, `focusedId='advanced'`, **devolve `true`** |
| `onBack()` com `view==='main'` | devolve `false` (a `SettingsScreen` sai como sempre) |
| ← na subtela | igual a `onBack()` |
| ↑/↓ na subtela | item anterior/seguinte; nas pontas **não faz nada** (a saída é Voltar) |
| ↑ no primeiro da principal | `goToTopbar()`; ← na principal: de `refresh` → `purchase`, nos demais `exitToTabs()`; → de `purchase` → `refresh` |
| SELECT em `rotate`/`unlink` | abre a confirmação (`PortalConfirmDialog`), a subtela continua por baixo |
| Cancelar/RETURN na confirmação | fecha só a confirmação; `view='advanced'`, foco no mesmo item |
| Confirmar `rotate` ou `unlink` | fecha a confirmação, `view='main'`, `focusedId='advanced'`, executa; resultado como mensagem na principal |
| SELECT em `recover` | `view='main'`, `focusedId='advanced'`, `startRecovery()`; o QR temporário substitui o fixo na principal |
| SELECT em `eye` | alterna o código (sem modal, sem prazo) |

Com um diálogo aberto, o `Modal` captura as teclas **inclusive RETURN** (`stopImmediatePropagation` na captura): `onBack` da aba
não é chamado. A `SettingsScreen` só consulta `tabHandle.current?.onBack?.()` com `zone === 'panel'`, antes de `onBack` da tela.

## 3. Olho (agora dentro do Avançado)

Mesma regra da 075 (D-004): `revealed ⇔ shown.version === device.recoveryCodeVersion`; `visibilitychange` oculto e `pagehide` ocultam;
regenerar (nova versão) oculta. **Novo:** o hook ganha `hide()` e o painel o chama quando `view` volta a `'main'` (sair da subtela oculta).
O hook segue no painel (e não na subtela) porque o SELECT chega pelo `activate` do painel; ele mora em `useCodeReveal.ts`.

- Máscara fixa `•••• •••• ••••` só dentro do item Código de recuperação; **nunca** na tela principal (FR-002; o contrato proíbe `••••` ali).
- Rótulo do olho: `portal.showCode` = "Mostrar código de recuperação" / `portal.hideCode` = "Ocultar código de recuperação".

## 4. Estrutura da subtela (contrato de DOM)

```
<section aria-label="Avançado" class="portal-advanced">           // role=region, name "Avançado"
  <h2>Avançado</h2> <p>(intro curta)</p>
  <section class="portal-advanced-item">  <h3>Código de recuperação</h3>  <p>texto</p>  <dl>máscara/código</dl>  <Button eye/> </section>
  <section ...>  <h3>Gerar nova chave e código</h3>  <p>texto</p>  [<p>motivo se indisponível</p>]  <Button/> </section>
  <section ...>  <h3>Recuperar pelo site</h3> ... </section>
  <section ...>  <h3>Desvincular esta TV</h3> ... </section>
</section>
```

- Os quatro `h3` e os quatro botões têm **exatamente** os textos do contrato; a subtela **não** tem botão Voltar nem outros botões.
- O `h3` e o botão de `rotate`/`recover`/`unlink` repetem o mesmo texto (título do item + ação): é intencional.
- Não é `Modal`: sem `role="dialog"`; só as confirmações de `rotate`/`unlink` são diálogos.

## 5. Textos (pt de referência; en/es o executor traduz no mesmo sentido)

Os trechos em **negrito** são fixados pelo contrato (substring exata em pt).

| Chave | pt |
| --- | --- |
| `portal.advanced` | Avançado |
| `portal.advanced.intro` | Ações raras: a maioria das pessoas nunca precisa delas. |
| `portal.codeLabel` | Código de recuperação |
| `portal.showCode` / `portal.hideCode` | Mostrar código de recuperação / Ocultar código de recuperação |
| `portal.advanced.codeText` | É a sua senha de reserva — **não é uma licença comprada**. Guarde fora da TV (papel ou foto no celular): se você formatar a TV ou reinstalar o app, é ele que permite recuperar a sua licença e o seu backup. |
| `portal.advanced.rotateText` | Troca a chave, o QR e o código de recuperação. Use se alguém viu a sua chave ou para desconectar o site: as **sessões abertas no site são encerradas**. Listas, favoritos e licença continuam. |
| `portal.advanced.recoverText` | Use quando esta TV **perdeu o acesso ao portal** (por exemplo, depois de reinstalar o app). Mostra um QR temporário: leia no celular, informe o código de recuperação e confirme o ID. Nada é apagado. |
| `portal.advanced.unlinkText` | Solta o vínculo desta TV com o portal, **sem apagar listas e dados**. Depois, Vincular de novo volta ao mesmo cadastro (mesmo ID), com chave nova. |
| `portal.advanced.needsPairing` | Disponível depois que esta TV for vinculada ao portal. |
| `portal.codeReminder` | **Guarde seu código de recuperação em Avançado.** (frase inteira, com o ponto) |
| `portal.rotateAllHint` (alterada) | A chave, o QR e o código de recuperação mudam e o site é desconectado. Suas listas, favoritos e licença são preservados. |
| `portal.changed` (alterada) | Acesso atualizado. Guarde o novo código de recuperação. |

- Chaves novas ficam numa **área nova** `messages/portalAdvanced.ts` (`portal.ts` já está em 297 de 300 linhas — ratchet).
- Saem de `portal.ts`: `portal.more`, `portal.moreUnavailable`, `portal.codePrivateHint`. Conferir com Grep antes de apagar.
- en: "recovery code"; es: "código de recuperación". Nunca "license code" / "código de licencia" na TV.
