# Foco, olho e diálogos — Portal & licença (075)

Delimita o "como" que um executor erraria. Fonte: D-001..D-008 do `plan.md`.

## 1. Ações por id

```ts
type PortalActionId = 'retry' | 'eye' | 'purchase' | 'refresh' | 'more'

function portalActions(s: { pairingFailed: boolean; commercial: boolean }): PortalActionId[] {
  return [
    ...(s.pairingFailed ? ['retry'] as const : []),
    'eye',
    ...(s.commercial ? ['purchase', 'refresh'] as const : []),
    'more',
  ]
}

function initialAction(actions: PortalActionId[], s: { commercial: boolean; licenseState?: 'trial' | 'active' | 'revoked' }) {
  const wanted = s.commercial ? (s.licenseState === 'active' ? 'refresh' : 'purchase') : 'eye'
  return actions.includes(wanted) ? wanted : actions[0]
}
```

- A aba guarda `focusedId: PortalActionId`, **nunca um índice**. Quando o conjunto muda (licença virou ativa, falha resolvida), se `focusedId` sumiu, cai em `initialAction`.
- `commercial` = `commercialBuild` lido **na renderização** (R-004).
- `soft-disabled` continua focável (padrão `Button softDisabled`): `eye` sem device, `purchase`/`refresh` sem conexão, itens do menu indisponíveis.

## 2. Teclas na aba (`PortalLicenseTab`, via `SettingsTabHandle`)

| Tecla | Efeito |
| --- | --- |
| `onEnter` | `focusedId = initialAction(...)` |
| ↑ | id anterior na lista; no primeiro → `goToTopbar()` |
| ↓ | próximo id (para no último) |
| ← | de `refresh` → `purchase`; nos demais → `exitToTabs()` |
| → | de `purchase` → `refresh`; nos demais nada |
| SELECT | `panel.activate(focusedId)` |

Com um diálogo aberto (menu/confirmação), o `Modal` captura as teclas; a aba não reage (padrão já usado: `focused={... && !dialog}`).

## 3. Olho (cartão Licença)

```ts
const [revealedVersion, setRevealedVersion] = useState<number>()
const revealed = device != null && revealedVersion === device.recoveryCodeVersion
toggle = () => setRevealedVersion(revealed ? undefined : device.recoveryCodeVersion)
// visibilitychange (hidden) e pagehide → setRevealedVersion(undefined)
```

- Regenerar o código (nova versão) oculta sem código extra.
- Desmontar a aba zera o estado (sair da aba).
- Texto mascarado constante; o código real só entra no DOM quando `revealed`.
- `<Button>` com texto `t(revealed ? 'portal.hideCode' : 'portal.showCode')` e `aria-pressed={revealed}`.

## 4. Diálogos (um por vez)

```
more ──SELECT──▶ menu [rotate, recover, unlink]
  menu: ↑/↓ movem, SELECT escolhe, RETURN fecha → foco em 'more'
  rotate ─▶ fecha menu, abre PortalConfirmDialog (Cancelar em foco)
            confirmar ─▶ connection.rotate('revoke'); sucesso → status "changed"; foco 'more'
  recover ─▶ fecha menu; connection.recovery() → convite no cartão Acessar o portal (D-008)
  unlink ─▶ fecha menu, abre PortalConfirmDialog → fluxo 072 (refreshPortal('backup') se online, resetPortalAgent, unlinkPortal)
  cancelar/RETURN em qualquer confirmação → foco 'more'
```

- O menu usa `Modal` com `Button`s (um por item) — o contrato lista os itens por `getAllByRole('button')` dentro do diálogo, na ordem acima.
- A confirmação da rotação usa como rótulo do botão de confirmar o mesmo texto do item ("Gerar nova chave e código").
- Recuperar continua sem confirmação (comportamento atual) e respeita a recuperação pendente da 069.

## 5. Segundo plano

| Evento | Código | Convite de recuperação | QR fixo / chave |
| --- | --- | --- | --- |
| `visibilitychange` hidden | oculta | descarta | **mantém** |
| `pagehide` | oculta | descarta | **mantém** |
| sair da aba | oculta (desmonta) | descarta (desmonta) | — |
