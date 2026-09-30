# Lógica — aba Integrações & BYOK e dock da Home (feature 032, US2)

## 1. `IntegrationsPanel.tsx` (Configurações › Integrações & BYOK)

Foco por estado (padrão `AccessibilityPanel`, ADR-009). Linhas:

```
0  Card TMDB — ações em linha:
     not_configured → [Configurar]
     demais         → [Testar] [Editar] [Remover]
1  Card "Assistente de IA"     (soft-disabled, id 'dock-ai')
2  Card "Clima"                (soft-disabled, id 'dock-weather')
3  Card "Teste de velocidade"  (soft-disabled, id 'dock-speedtest')
```

- ↑/↓ entre linhas; ←/→ entre ações da linha 0; ← na coluna 0 volta às
  abas; ↑ na linha 0 vai à topbar (mesmo padrão das outras abas).
- Card TMDB mostra: "TMDB", descrição ("Sinopses, imagens e detalhes de
  filmes e séries que a sua lista não traz."), estado (`logic/chave-tmdb.md`
  §7), chave mascarada quando houver, "Última verificação" (data), as
  capacidades usadas nesta feature ("Metadata", "Imagens"), e a
  **atribuição**: "Este produto usa a API do TMDB, mas não é endossado nem
  certificado pelo TMDB." (texto exigido pelos termos; logo opcional se
  couber em asset local — nunca CDN).
- **Configurar/Editar** → navega para `TmdbKeyScreen` (abaixo).
- **Testar** → `testTmdbKey()`, toast com o resultado; estado re-lido.
- **Remover** → `Modal` de confirmação ("Cancelar" padrão, como
  `DeleteSourceModal`); confirmado → `removeTmdbKey()`, toast.
- Cards soft-disabled: OK anuncia `Em breve — {message}` (`getComingSoon`).
  Mocks **reusados** (`dock-ai`, `dock-weather`, `dock-speedtest`) — nenhum
  id novo. `settings-integrations` é **removido** de `comingSoon.ts`.

## 2. `TmdbKeyScreen.tsx` (tela própria, foco DOM real)

Molde de `EpgSettingsScreen` (`useTvKeyNav` + `TextField` + IME real):
rótulo permanente "Chave da API do TMDB (v3) ou token de leitura (v4)",
campo **sempre vazio** ao abrir (nunca pré-preenchido com a chave), tipo
senha com "Mostrar" temporário, botões "Salvar e testar" e "Cancelar".
Um texto de ajuda: "Crie em themoviedb.org › Configurações › API."

`Salvar e testar` → `saveTmdbKey`; `ok` → volta a Configurações com foco
restaurado em `{zone:'panel', tab:'integrations'}`; falha → mensagem
inline por motivo, foco fica no campo, chave digitada **não** é logada.
Sem submissão duplicada (botão ignora OK enquanto pendente).

Navegação: `appNav.ts` ganha `{ name: 'tmdb-key' }` (igual a
`epg-settings`) e ação para abri-la de Configurações; RETURN volta a
Configurações com o mesmo foco de origem.

## 3. Dock da Home

`DOCK_ICONS[0]` (`dock-tmdb`) deixa de ser mock:
- sem `is-soft-disabled`/`aria-disabled`; `aria-label` =
  "TMDB — {estado}" (`logic/chave-tmdb.md` §7); marcador visual de estado
  (ponto verde/âmbar/vermelho por token; nunca só cor — o texto do
  `aria-label` e um `title` visível no foco).
- OK → `onOpenIntegrations(from)`; `App` despacha Configurações com
  `restore: { zone: 'panel', tab: 'integrations' }`.
- `dock-tmdb` é **removido** de `comingSoon.ts`. Os outros três ícones
  continuam mock.

Estado vem de `useTmdbStatus()` (React Query `['tmdb-status']`, lê só o
IndexedDB — nunca rede, seguro no foco). Invalidado ao salvar/testar/
remover e quando `ensureTitleMetadata` muda `state` (a tela de detalhe
invalida `['tmdb-status']` ao receber a metadata).
