# Lógica: foco da Live sob a topbar, colunas e preview

Feature 024 — FR-001..FR-004, FR-014..FR-018, FR-022. Reaproveita o
mecanismo da feature 023 (`sdd/specs/023-shell-navegacao-entrada-ds-v14/
logic/foco-shell.md`) sem mudá-lo. Contrato travado:
`LiveScreen.live-tv-ds-v14.contract.test.tsx`.

## 1. Onde mora o shell

Dentro da própria `LiveScreen`, pela prop opcional `shell` (D-002). Motivos:

- O player abre dentro da `LiveScreen` (`playing`). Com ele aberto, a tela
  não renderiza nada além do `PlayerLayer` e do `Toast`, e por isso a topbar
  some sozinha (FR-004), sem coordenação com `App.tsx`.
- A trilha sabe quando o foco está em "★ Favoritos" (índice 0), que é o
  único ponto de saída para a topbar.
- Sem `shell`, a tela funciona sozinha como hoje. É assim que o contrato
  travado da feature 018 e os testes de comportamento existentes a montam.

Com `shell`, a árvore é:

```tsx
<AppShell topBar={<TopBar currentItem="live" … />} hints={LIVE_HINTS}>
  <div className="screen live-screen">…cabeçalho + 3 colunas…</div>
</AppShell>
```

Sem `shell`: só o `<div className="screen live-screen">`.

Todos os estados de topo (carregando categorias, erro, lista sem canais)
também vão dentro da moldura quando há `shell`, para a topbar continuar
alcançável.

## 2. Estado de foco

```ts
zone: 'topbar' | 'content'            // só existe de fato com `shell`
topbarItem: TopbarItem                // começa em 'live'
col: 0 | 1 | 2                        // 0 trilha, 1 canais, 2 preview (NOVO)
previewAction: 0 | 1 | 2              // Assistir, Favoritar/Favorito, Guia completo
```

`col` passa de `0 | 1` para `0 | 1 | 2`. Todo código atual que testa
`col === 1` continua valendo para a coluna de canais. O canal "de origem"
do preview é o mesmo `focusedIdentity.channelId`: com `col === 2` ele não
muda, e por isso ← volta exatamente ao mesmo canal sem nenhum estado extra.

### Escopos ativos

Igual à 023: cada escopo chama `useRemoteNav` sempre, mas só com handlers
quando ativo.

- `TopBar`: `active = shell && zone === 'topbar'`. Ativa, ela registra na
  captura e é dona da tecla (`modal: active`, já implementado).
- `LiveScreen`: com `zone === 'topbar'`, passa `{}` ao seu `useRemoteNav`.
  Com o player aberto, já ignora tudo (`if (playing) return`, inalterado).

## 3. Tabela de teclas (fora do zapping)

| Onde | Tecla | Efeito |
|---|---|---|
| trilha, índice 0 (★ Favoritos), com `shell` | ↑ | `zone = 'topbar'`, `topbarItem = 'live'` |
| trilha, índice 0, sem `shell` | ↑ | nada (clamp, como hoje) |
| trilha | ↑/↓ | move na trilha (inalterado) |
| trilha | → / OK | entra na entrada focada (inalterado) |
| trilha | RETURN | `onBack()` → Início (inalterado) |
| canais, no ícone/campo de busca | todas | inalterado (feature 018) |
| canais, num canal | → | `col = 2`, `previewAction = 0` — só se há canal focado e fora do zapping |
| canais | ← | `col = 0` (inalterado) |
| canais | OK | abre o player (inalterado) |
| canais | segurar OK / amarela | favorita (inalterado) |
| preview | ↑/↓ | `previewAction` com clamp (ações empilhadas na vertical, D-005) |
| preview | ← ou RETURN | `col = 1`, mesmo canal |
| preview | → | nada |
| preview | OK em Assistir | mesmo caminho de OK no canal (`handleTrailSelect` com o canal ativo) |
| preview | OK em Favoritar/Favorito | `toggleFocusedFavorite()` — mesmo caminho dos gestos |
| preview | OK em Guia completo | toast "Em breve — {mensagem do registro}" |
| preview | segurar OK / amarela | nada (`onLongSelect`/`onFavoriteKey` só existem com `col === 1`) |
| topbar | ↓ | `zone = 'content'` — o estado do conteúdo não mudou, o foco volta ao mesmo item |
| topbar | ←/→ | move na topbar (TopBar, inalterado) |
| topbar | OK em Início | `shell.onGoHome()` |
| topbar | OK em TV ao vivo | nada (já está nela) |
| topbar | OK em Filmes/Séries | `shell.onSwitchTop(destino)` |
| topbar | OK na lista ativa | `shell.onOpenProfiles()` |
| topbar | RETURN | `onBack()` → Início (FR-003; mesma regra da trilha) |

Entrar em outra categoria, em Favoritos ou em "Todos" zera `col` para 1 e
`previewAction` para 0. Quando o canal focado some (revalidação,
desfavoritar dentro de "★ Favoritos"), a regra atual de foco por identidade
continua valendo. Se não sobrar canal nenhum com `col === 2`, a tela volta
para `col = 1` e aparece o estado vazio, nunca um preview sem canal e com
foco.

## 4. Preview

- `col === 0`, ou nenhuma entrada aberta, ou entrada sem canais: orientação
  neutra ("Entre numa categoria para ver os canais" / "Escolha um canal"),
  **sem nenhum `<button>`** (FR-018, verificado pelo contrato).
- Com canal: logo (`PosterArt` variante logo), nome, número
  (`channelNumberOf`, se houver), grupo (`groupLabel(original_group)`),
  slot "Agora" vazio, e as três ações. O foco visual (`.tv-focus`) só
  aparece numa ação quando `col === 2`.
- O preview **nunca** dispara leitura, reprodução ou consulta ao mudar de
  canal. Só troca o que está desenhado (FR-013).
- Canal sem fonte de reprodução: "Assistir" com `is-soft-disabled`, focável;
  OK mostra o toast de hoje (FR-019).

## 5. Zapping

`renderColumns({ withPreview })`: a tela passa `true`; o `topLayer` do
zapping passa `false` (FR-022). No zapping:

- → num canal não vai para o preview (não existe). Mantém o comportamento
  atual de `handleTrailDirection('right')`.
- A topbar não existe: o zapping mora dentro do `PlayerLayer`, que só é
  renderizado sem a moldura.
- ↑ em "★ Favoritos" não sobe para lugar nenhum (o `onExitUp` só é passado
  fora do zapping).

## 6. O que não mudar

- A ordem dos `setState` e a regra "o conteúdo nunca muda a `zone` da
  topbar e vice-versa; cada um só avisa a borda".
- `modal: active` da `TopBar`. É o que impede a tecla dupla no Chromium
  (feature 023). Não trocar por `modal` no conteúdo.
