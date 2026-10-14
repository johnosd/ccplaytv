# Lógica — Configurações da lista e navegação (feature 067, US1/US2)

## 1. Rota

`AppScreen` ganha (`navigation/appNav.ts`):

```ts
| { name: 'list-settings'; sourceId: string; restore?: ListSettingsFocus }
```

- Guarda só o **id** da lista; a tela lê a `SourceOut` atual de `useSources`
  (voltar de Editar já traz o nome novo). Lista que não existe mais (apagada
  por outro caminho) → estado vazio com "Voltar" focado (FR-011), nunca tela
  em branco.
- Aberta com `open` — a origem fica no topo da pilha, com o foco dela:
  - **perfis**: `from: { name: 'profiles', mode, focusSourceId: source.id }`
    (mesmo padrão de `SourceAccessRoute`, `App.tsx` ~l.167);
  - **Configurações › Fontes IPTV**: `from: { name: 'settings', restore:
    { zone: 'sources', sourceId, action: 'configure' }, standalone }`;
  - **Live/Filmes/Séries, "Gerenciar" do vazio "todas escondidas"**
    (`onOpenSettings('parental')`, R-011 da 066): abre `list-settings` da
    **lista ativa** com `restore: { tab: 'parental' }`, `from` = a tela atual
    (antes abria Configurações na aba `parental`, que deixa de existir).
- RETURN na base = `back` (FR-008). Sem topbar: `goToTopbar` é no-op.

## 2. Foco dentro da tela

Mesmo modelo de zonas de `SettingsScreen` (`tabs` / `panel`, sem `topbar`) e
mesmo padrão de registro + handle (`SettingsTabHandle`), com um registro
próprio `LIST_SETTINGS_TABS` na ordem `account`, `epg`, `parental`,
`history`.

- `initialFocus` ausente → zona `tabs`, aba `account` focada (contrato).
- `initialFocus` presente → zona `panel`, aba `initialFocus.tab`, foco na
  `action` dela (contrato: `{ tab: 'epg', action: 'open-epg' }` foca
  "Configurar EPG").
- Toda saída entrega `{ tab, action }` (contrato: Editar →
  `{ tab: 'account', action: 'edit' }`; EPG → `{ tab: 'epg', action:
  'open-epg' }`); o App guarda isso em `from: { name: 'list-settings',
  sourceId, restore }`.
- Ações da aba Conta & lista na ordem **Editar · Ressincronizar · Excluir**
  (a mesma da linha antiga de Fontes IPTV); ← na primeira volta às abas.

## 3. Abas

| Aba | Conteúdo | De onde vem |
| --- | --- | --- |
| `account` | nome, tipo, "Lista ativa" se for, estado de sincronização, conta Xtream, contagens, Modo limitado; Editar/Ressincronizar/Excluir | componentes de informação de `SourcesPanel.tsx` (extrair um `SourceInfo` reaproveitado pela linha de Fontes IPTV e por esta aba) + a lógica de ações de `tabs/SourcesTab.tsx` |
| `epg` | estado do EPG (`formatEpgStatus` + `useEpgSyncing`) e o botão "Configurar EPG" | `SourceEpgStatus` de `SourcesPanel.tsx` |
| `parental` | o que `tabs/ParentalTab.tsx` faz hoje, para `source.id` | `tabs/ParentalTab.tsx` adaptado (prop de lista, nunca `activeSourceId`) |
| `history` | o que `tabs/PrivacyTab.tsx` faz hoje, para `source.id` | `tabs/PrivacyTab.tsx` adaptado |

**Armadilha principal**: as abas antigas leem `activeSourceId`. Na tela da
lista o alvo é **sempre** a lista da tela (contrato: limpar histórico de
Quarto com Sala ativa). Troque a prop, não passe `activeSourceId = sourceId`
"para reaproveitar": a marca "Lista ativa" da aba Conta precisa do
`activeSourceId` verdadeiro.

## 4. Excluir pela tela da lista (FR-010)

1. Confirmação = `DeleteSourceModal` (pede o PIN **desta lista** se ela tem).
2. Antes de apagar, calcular a vizinha na ordem de `useSources`:
   `seguinte ?? anterior ?? null` (`null` = "Adicionar lista").
3. Sucesso → `onSourceDeleted(id, nextFocusId)`. O App despacha uma ação nova
   e pura do redutor:

```ts
| { type: 'list-settings-deleted'; sourceId: string; nextFocusId: string | null }
```

```
se state.activeSource?.id === sourceId: return profilesAsBase()   // fluxo atual de lista removida
desempilha (screen = topo da pilha)
se screen é 'profiles':  focusSourceId = nextFocusId ?? ADD_LIST_FOCUS_ID
se screen é 'settings':  restore = nextFocusId ? { zone: 'sources', sourceId: nextFocusId, action: 'configure' }
                                               : { zone: 'sources-add' }
```

`ADD_LIST_FOCUS_ID` é exportado por `ProfilesScreen.tsx`; `appNav.ts` não pode
importar a tela — receba o valor como parte da ação ou duplique a sentinela
com um comentário apontando a origem (preferir: o App resolve e manda
`focusSourceId` pronto; o redutor só aplica).

## 5. Configurações globais (US2)

- `SETTINGS_TABS` fica: `integrations`, `sources`, `player`,
  `accessibility`, `about` (FR-015) — os índices das 4 primeiras não mudam
  (contratos travados 032/054 navegam por índice).
- `SettingsTab` perde `parental` e `privacy`; `SettingsFocus` de `sources`
  passa a `action: 'configure'`.
- Linha de Fontes IPTV: informações + **um** botão "Configurar" →
  `navigation.onConfigureSource(source, { zone: 'sources', sourceId,
  action: 'configure' })`. ←/→ não saem do botão (só ← na coluna 0 volta às
  abas). "Adicionar lista" continua.
- Aviso de escopo: texto visível no topo do painel/tela ("Estas
  configurações valem para todas as listas."), nos dois modos (com e sem
  topbar).
- `SettingsScreenProps` **mantém** `onEditSource`, `onResyncStarted`,
  `onSourceDeleted` (os contratos travados 032/054 os passam) — podem ficar
  sem uso; `onConfigureSource` continua opcional.

## 6. Tela de perfis (FR-012)

`ACTION_KEYS` ganha `settings.sources.configure` no **fim**; `runAction`
chama `onConfigureSource(source)` (prop nova, **opcional** — o contrato
travado da 037 monta `ProfilesScreenProps` sem ela). O contrato da 023
(↓ abre em Ressincronizar, →→ = Excluir) continua valendo.
