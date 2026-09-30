# Lógica — Configurações

Feature `026-home-busca-configuracoes-ds-v14`, US2 (FR-021..FR-034).
Contrato travado: `tv-web/src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`.

## 1. Composição

```text
<div class="screen settings-screen">
  [com shell] <AppShell topBar={<TopBar currentItem="settings" …/>}> … </AppShell>
  [sem shell] conteúdo direto, com título "Configurações"  (aberto por "Gerenciar listas", FR-033)
    ├─ coluna de abas (SideCategoryNav, entradas com ícone)  — zona `tabs`
    └─ painel da aba ativa                                    — zona `panel`
  {confirmDelete && <DeleteSourceModal …/>}
</div>
```

Abas, na ordem do DS (FR-022), com id e rótulo exato:

| id | Rótulo | Conteúdo |
| --- | --- | --- |
| `integrations` | Integrações & BYOK | mock (`settings-integrations`) |
| `sources` | **Fontes IPTV** | real — aba **inicial** |
| `player` | Player & reprodução | mock (`settings-player`) |
| `accessibility` | Acessibilidade & sistema | real parcial |
| `parental` | Perfis & parental | mock (`settings-parental`) |
| `about` | Sobre & créditos | real |

## 2. Foco

Estado: `zone: 'topbar' | 'tabs' | 'panel'`, `focusedTab`, `activeTab`, e o
foco interno de cada painel.

- **Abertura**: `zone = 'tabs'`, `focusedTab = activeTab = 'sources'`
  (contrato: botão "Fontes IPTV" com `tv-focus`). `initialFocus` restaura o
  que foi guardado ao sair (§4).
- `tabs`: UP/DOWN movem `focusedTab` (clamp); **o painel não muda ao só
  focar**. OK **ou** RIGHT → `activeTab = focusedTab` e `zone = 'panel'` no
  primeiro elemento do painel. UP na primeira aba → topbar (se houver shell).
- `panel`: LEFT no primeiro elemento de uma linha → volta a `tabs` (na aba
  ativa). UP na primeira linha → topbar (se houver shell), senão nada.
- RETURN (sem modal aberto), em `tabs` ou `panel` → `onBack()`. Com modal →
  só fecha o modal.
- Topbar (com shell): DOWN → volta à zona de onde saiu.

## 3. Painel Fontes IPTV (real)

Linhas: uma por lista, na ordem de `useSources()`, mais uma linha final
"Adicionar lista". Cada linha de lista é `role="group"` com
`aria-label="Lista {display_name}"` e mostra:

- nome (truncado por CSS), tipo (`Xtream` / `M3U` — mesma função de
  `ProfilesScreen`, extraída para `features/sources/sourceFormat.ts`);
- **"Lista ativa"** só na lista `activeSourceId`;
- status de sincronização (`formatStatus`: "Sincronizada em …" /
  "Nunca sincronizada" / "Erro na última sincronização");
- se `provider_import_mode === 'legacy_m3u'`: badge "Modo limitado" +
  `LimitedModeNotice` (movido de `features/list-home/` para `features/sources/`);
- selos existentes da tela de perfis (truncada por espaço, entradas descartadas);
- ações, nesta ordem: **Editar**, **Ressincronizar**, **Excluir**, **EPG**
  (EPG = `ComingSoon` `settings-epg`, soft disabled).

**Nunca** renderizar `provider_dns`, URL, usuário ou senha (FR-024) — nem em
`aria-label`, `title` ou texto oculto.

Navegação no painel: DOWN/UP entre linhas **mantendo a coluna** de ação
(clampada; na linha "Adicionar lista" só há uma coluna); LEFT/RIGHT entre
ações da linha. Entrar no painel pela aba cai na **primeira lista, coluna 0
(Editar)**. Sem listas: cai em "Adicionar lista".

Ações:

- **Editar** → `onEditSource(source, from)`.
- **Ressincronizar** → `useResyncSource().mutate(id, { onSuccess: r => onResyncStarted(r.import_job_id, from) })`;
  ignorar OK enquanto `isPending` (FR-027). Toast "Ressincronizando lista…".
- **Excluir** → abre `DeleteSourceModal` (extraído de `ProfilesScreen`, mesmo
  texto: título `Excluir a lista {nome}?`, "Cancelar" focado no índice 0,
  LEFT/RIGHT alternam, RETURN fecha). Confirmado → `useDeleteSource().mutate(id, …)`;
  sucesso → foco na lista seguinte (mesma coluna) ou anterior, ou "Adicionar
  lista" se não restar nenhuma; `onSourceDeleted(id)`. Ignorar OK em Excluir
  com exclusão pendente.
- **Adicionar lista** → `onAddSource(from)`.

`ProfilesScreen` passa a usar o mesmo `DeleteSourceModal` e `sourceFormat.ts`
sem mudar comportamento (o contrato travado da 023 continua verde).

## 4. `SettingsFocus` (restauração, FR-026)

Tipo já existe no stub (`SettingsFocus`). Ao chamar `onEditSource`/
`onResyncStarted`/`onAddSource`, a tela passa o foco atual; ao voltar
(`restore`), reposiciona **por `sourceId`** (lista sumiu → vizinha, ou
"Adicionar lista").

## 5. Painel Acessibilidade & sistema

Linhas (uma coluna):

1. **Reduzir movimento** — valor "Ligado"/"Desligado". OK →
   `writeReducedMotionPreference(!atual)` + `applyMotionPreference()` — efeito
   imediato e persistido (FR-029). Estado inicial por
   `readReducedMotionPreference()`. Se o sistema já pede movimento reduzido
   (`prefers-reduced-motion`), mostrar a nota "O sistema já está com
   movimento reduzido" — o botão continua controlando só a preferência interna.
2. **Voice Guide / anúncios**, **Alto contraste**, **Aparência das legendas**
   — `ComingSoon` (`a11y-voice-guide`, `a11y-high-contrast`,
   `a11y-subtitles`, item 56).

## 6. Painel Sobre & créditos

- "CCPlayTV" + "Versão {__APP_VERSION__}" (constante de build, `plan.md` D-012).
- Licenças: "Poppins — SIL Open Font License 1.1" e "Inter — SIL Open Font
  License 1.1" (arquivos `OFL-*.txt` em `tv-web/src/assets/fonts/`).
- **Sem** atribuição TMDB enquanto o app não usar TMDB (FR-030).
- Um elemento focável (a linha da versão) para a zona `panel` ter destino.

## 7. Abas mock

`EmptyState` com `title` = rótulo da aba, `description` = "Em breve — {message}"
(`getComingSoon(id)`) e ação focável **"Voltar às abas"** (volta `zone` a
`tabs`). Nenhum valor fictício (chave mascarada, "CONECTADO", PIN…).
