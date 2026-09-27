# Lógica: composição de foco topbar ↔ conteúdo

Feature 023. D-004 do `plan.md`. ADR-009 (foco é estado + classe
`.tv-focus`, sem biblioteca de foco) e ADR-011 §3 ("topbar e conteúdo são
escopos compostos").

## Mecanismo: escopos ativos/inativos, o mesmo padrão do `Modal`

Cada escopo (`TopBar`, conteúdo do Início = `ListHomeScreen`) chama o
próprio `useRemoteNav`, **sempre** (regra dos hooks), mas só repassa
handlers quando está ativo:

```ts
useRemoteNav(active ? { onDirection, onSelect, onBack } : {})
```

Quem decide qual escopo está ativo é o `HomeScreen` (Início), com um único
estado `zone: 'topbar' | 'content'`. Nenhum escopo muda o `zone` do outro
diretamente. Cada um só avisa a borda:

- `ListHomeScreen` recebe `onExitUp()`. Chamado quando a pessoa aperta UP
  na linha mais alta do conteúdo (Continuar assistindo, se existir; senão os
  atalhos). O `HomeScreen` troca para `zone = 'topbar'` com o item
  `'home'` em foco (FR-015: entra no destino atual).
- `TopBar` recebe `onExitDown()`. O `HomeScreen` volta para
  `zone = 'content'`. O conteúdo **não perdeu** o próprio foco interno
  (estado dele não foi desmontado), então o foco volta ao mesmo item de
  onde saiu, sem nenhum código extra.

### Por que não dá tecla dupla

Os dois escopos escutam `keydown` em `document`, na fase de bubble. Quando
o conteúdo chama `onExitUp()` durante o UP, o `setState` do `HomeScreen` só
re-renderiza **depois** do despacho do evento. O listener da `TopBar`
recebe o mesmo UP com os handlers ainda inativos (o `handlersRef` só é
atualizado num `useEffect` pós-render) e não faz nada. Um teste unitário do
`HomeScreen` deve provar isso: UP no topo do conteúdo leva à topbar **sem**
mover o foco dentro dela, e DOWN na topbar leva ao conteúdo **sem** mover o
foco dentro dele.

**Não** tente resolver isso com `modal: true` nos escopos: a captura com
`stopImmediatePropagation` é exclusiva de modais, e um `Modal` aberto por
cima (saída) precisa continuar vencendo os dois.

## RETURN

- Com um `Modal` aberto (saída, confirmação de exclusão): o `Modal`
  intercepta na captura e só ele fecha (FR-027).
- Início, qualquer escopo ativo: `onBack` → o `HomeScreen` abre o modal de
  saída. RETURN na topbar **não** "desce ao conteúdo". A ADR-011 manda
  Início → sair, e duas regras diferentes para a mesma tecla na mesma tela
  confundem.

## TopBar: ordem e navegação

Itens focáveis, em ordem: `home`, `live`, `movies`, `series`, `profile`,
`search`, `settings`. Logo e relógio não são focáveis.

- LEFT/RIGHT: linear, com `clamp` (sem dar a volta), igual às demais trilhas
  do app.
- OK:
  - `home` → nada, já está no Início;
  - `live`/`movies`/`series` → `onNavigate(dest)`;
  - `profile` → `onOpenProfiles()`;
  - `search`/`settings` → anúncio "Em breve — …" via `useAnnounce` +
    `getComingSoon(id)`, sem navegar (FR-018).
- `active` (destino atual = Início) ≠ `focused`. O `home` tem marcação de
  "ativo" permanente (sublinhado/realce de texto), e a receita de foco
  (`.tv-focus`) só quando focado (FR-014).

## Restauração ao voltar ao Início (FR-029)

O `HomeScreen` recebe `initialFocus?: HomeFocus` (vindo do `AppScreen`
`home{focus}` que o redutor desempilhou):

- `topbar` → começa em `zone='topbar'` no item.
- `shortcuts` → `zone='content'`, `ListHomeScreen` com o atalho focado.
- `continue` → `zone='content'`, `ListHomeScreen` na linha "Continuar
  assistindo" com o item **daquele id**. Id ausente → atalho "TV ao vivo".

Ao abrir um destino, o `HomeScreen` monta o `from: {name:'home', focus}` a
partir do que foi escolhido (qual atalho, qual item da topbar, qual id de
"Continuar assistindo") e despacha `open`. Não precisa espelhar o foco a
cada movimento, só no momento de sair.

## Tela de perfis

Um só escopo (nenhuma topbar nela). O foco é por estado, com duas linhas,
igual ao `HomeScreen` antigo:

- `row: 'cards'`: `col` percorre as listas + "Adicionar lista";
- `row: 'actions'`: `col` percorre Ressincronizar/Editar/Excluir do cartão
  `activeCardIdx`.

O que não pode se perder da versão antiga, porque os comentários dela
explicam bugs reais já corrigidos:

- descer para as ações **sempre** começa em Ressincronizar (col 0), nunca
  herda o índice do cartão;
- subir das ações restaura o cartão de onde desceu (`activeCardIdx`);
- o limite das ações alcança a última (Excluir).

Novos nesta feature:

- **Exclusão com confirmação**: OK em Excluir abre
  `Modal(ariaLabel="Excluir a lista <nome>?")` com `Cancelar` (foco
  inicial) e `Excluir`. O `Modal` é casca: o foco entre os dois botões é
  estado do `ProfilesScreen` (`confirmCol`), passado como `focused` aos
  `Button`s. Cancelar e RETURN fecham, e o foco continua em Excluir.
- **Foco inicial** (FR-004): o índice de `initialFocusSourceId` em
  `sources`. Se não achar, 0 se houver listas, senão o cartão "Adicionar
  lista". Recalcula quando a lista de fontes chega (`isLoading` →
  dados), **uma vez**, sem brigar com o movimento da pessoa depois.
- **Depois de excluir** (FR-011): foco no cartão vizinho, que é o mesmo
  índice clampado à nova lista, ou em "Adicionar lista".
- **Erro de leitura** (FR-008): `ErrorState` com `code="STO-01"`, ação
  "Tentar de novo" (`refetch`), `focusedActionIndex=0`, e OK chama
  `refetch`.
- **Carregando** (FR-042, constitution "todo estado… inclusive carregando"):
  cartões `Skeleton` no lugar das listas **mais o cartão real "Adicionar
  lista", focado e ativável**. Adicionar lista é válido em qualquer estado.
  Quando as listas chegam, o foco inicial de FR-004 é aplicado **só se a
  pessoa ainda não moveu o foco**. Se ela já deu OK em "Adicionar lista",
  o onboarding abre normalmente.
