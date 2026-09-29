# Lógica — tela "EPG da lista" (Configurações › Fontes IPTV › EPG)

Arquivo novo: `tv-web/src/features/settings/EpgSettingsScreen.tsx`. Aberta
como tela própria pelo redutor de navegação (`navigation/appNav.ts`), no
mesmo molde de `edit-source` (feature 026): `dispatch({ type: 'open',
screen: { name: 'epg-settings', sourceId }, from: { name: 'settings',
restore: { zone: 'sources', sourceId, action: 'epg' }, standalone } })`.
RETURN = `dispatch({ type: 'back' })` → Configurações com foco no botão
"EPG" da mesma lista (FR-022), sem código novo de restauração.

Por que tela e não `Modal`: o campo de URL abre o IME real da TV; a tela
de edição de lista já prova esse caminho no aparelho (features 023/026). Um
`Modal` só aparece aqui para confirmar "Desativar EPG" (FR-021).

## Layout (tokens V14, sem valor literal)

```text
EPG da lista <nome>
[status]  EPG vinculado · atualizado 29/09 14:02      (ou: Sincronizando EPG / EPG não configurado /
                                                        EPG desativado / erro: <motivo> · EPG-02)
Origem:   Do painel da lista | Declarado pela lista | Informado por você (host)

1  [ Endereço XMLTV (opcional)            ]   TextField purpose="url", hint permanente
2  Deslocamento de horário   ‹  +1 h  ›        ←/→ ajusta, −12…+12
3  [ Sincronizar agora ]  (ou [ Tentar novamente ] quando state === 'error')
4  [ Desativar EPG ]      (ou [ Ativar EPG ] quando desativado)
```

Linhas focáveis por estado (FR-022 — nunca zero):

| Estado | Linhas |
| --- | --- |
| desativado | 4 ("Ativar EPG") |
| demais | 1, 2, 3, 4 (3 fica `loading`/soft enquanto sincroniza, ainda focável) |

## Teclas

- ↑/↓ entre linhas; ← na linha 2 diminui, → aumenta (clamp −12…+12); cada
  mudança grava `epgOffsetHours` na hora e invalida `['epg']` — sem sync.
- OK na linha 1: `inputRef.focus()` (abre o IME). Enter/Done no campo:
  validar (`new URL`, protocolo `http:`/`https:`, sem espaços) → inválido:
  `TextField.error` "Endereço inválido. Use um endereço começando com
  http:// ou https://", foco fica no campo (FR-018); válido: grava
  `epgManualUrl`, `blur()`, `requestEpgSync`. Campo vazio + Enter = limpar
  manual (volta ao detectado) + sync.
- O campo **nunca é pré-preenchido** com endereço detectado/manual (FR-017):
  começa vazio; a origem aparece só como texto descritivo com o host.
- OK na linha 3: `requestEpgSync` (ignorado se já sincronizando).
- OK na linha 4 (ativo): abre `Modal` "Desativar o EPG desta lista?" —
  "Cancelar" (índice 0, padrão) / "Desativar"; confirmar →
  `setEpgEnabled(false)` (apaga programação, FR-021). Inativo: "Ativar EPG" →
  `setEpgEnabled(true)` + `requestEpgSync`, sem confirmação.
- RETURN: com IME aberto, o próprio `useRemoteNav` deixa o campo tratar
  (guarda de alvo editável); fora dele, sai da tela.

## Mensagens de erro (§45, FR-019) — `epgErrorMessage(kind)`

| kind | Texto | Código |
| --- | --- | --- |
| `network` | Não foi possível baixar a programação. Verifique a conexão ou o endereço. | EPG-02 |
| `refused` | O servidor recusou o acesso à programação. | EPG-02 |
| `not_xmltv` | O endereço não devolveu uma programação no formato XMLTV. | EPG-02 |
| `unreadable` | O arquivo de programação veio incompleto ou ilegível. | EPG-02 |
| `storage_full` | Sem espaço no aparelho para guardar a programação. | EPG-02 |

Ação primária única: "Tentar novamente" (linha 3).

## Linha da fonte em Configurações (FR-015)

`SourcesPanel` ganha um texto de estado ao lado de `formatStatus`:
`formatEpgStatus(source.epg, syncing)` → "EPG vinculado" / "Sincronizando
EPG" / "EPG não configurado" / "EPG desativado" / "Erro no EPG · EPG-02".
O botão "EPG" (coluna 3) deixa de ser toast "Em breve" e chama
`onOpenEpg(source, from)`.
