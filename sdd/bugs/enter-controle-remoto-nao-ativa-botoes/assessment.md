# Bug Assessment: Enter do controle remoto não ativa botões em telas de foco DOM nativo

- **Slug**: enter-controle-remoto-nao-ativa-botoes
- **Criado**: 2026-09-18
- **Origem**: relato do usuário durante verificação manual da feature 004 na TV física (QN50Q60DAGXZD)
- **Veredito**: valid
- **Severidade**: high

## Report

"Quando eu clique em em adicionar lista e selecionei o botão endereço,
usuário e senha, não apareceu os campos de usuário, senha e endereço
necessários para fazer o cadastro da lista."

## Symptom

Na tela "Adicionar lista", mover o foco (D-pad) até a aba "Endereço, usuário
e senha" e pressionar OK/Enter no controle físico não troca o modo do
formulário — os campos de endereço/usuário/senha nunca aparecem, e a tela
permanece presa na aba "URL da lista M3U". Esperado: pressionar OK no botão
focado deveria ativá-lo como qualquer outro botão da UI (constitution,
"Toda Ação Essencial Tem Caminho Completo por Controle Remoto").

## Reproduction

1. Abrir "Adicionar lista" na TV física.
2. Mover o foco com o D-pad até o botão da aba "Endereço, usuário e senha".
3. Pressionar OK/Enter no controle remoto.
4. **Observado**: nada acontece — os campos de endereço/usuário/senha não
   aparecem, a aba "URL da lista M3U" continua selecionada.
5. **Esperado**: os campos de endereço, usuário e senha aparecem, como o
   clique de mouse produz em desktop.

## Suspected Code Paths

- `tv-web/src/lib/useRemoteNav.ts:56-77` — handler de `keydown` no
  `document`. Calcula `isSelect = event.key === 'Enter' || event.key === ' '`
  e, na linha 68, chama `event.preventDefault()` **incondicionalmente**
  sempre que `direction || isSelect || isBack` for verdadeiro — antes de
  checar se existe de fato um `onSelect` para consumir o evento. Quando
  `onSelect` não foi passado, `handlersRef.current.onSelect?.()` (linha 75)
  é um no-op silencioso, mas o `preventDefault()` já rodou.
- `tv-web/src/features/import/AddSourceScreen.tsx:15-16` — chama
  `useTvKeyNav(containerRef)` (foco DOM real, roving focus por
  `element.focus()`) e `useRemoteNav({ onBack })`, **sem `onSelect`**. O
  botão da aba, o botão "Adicionar lista" e os `<input>` desta tela dependem
  do comportamento nativo do navegador (Enter num `<button>`/`<input>`
  focado dispara `click`/submit) — não de um `onSelect` customizado.
- `tv-web/src/features/import/ImportProgressScreen.tsx:31-32` — mesmo
  padrão exato (`useTvKeyNav` + `useRemoteNav({ onBack })` sem `onSelect`).
  Os botões "Cancelar", "Tentar novamente" e "Voltar" desta tela sofrem o
  mesmo problema.
- `tv-web/src/lib/useTvKeyNav.ts` — confirmado que só trata
  ArrowUp/Down/Left/Right (roving focus); não implementa nenhum tratamento
  de Enter/Space, então não há nenhum caminho alternativo de ativação nessas
  duas telas além do nativo do navegador.

## Root Cause Hypothesis

**Confiança: high.** `useRemoteNav` foi desenhado para dois padrões de tela
que coexistem no código: (a) telas com "foco gerenciado 2D" (ex.:
`LiveScreen`), onde a indicação de foco é só CSS (classe `.tv-focus`) e toda
ativação passa por um `onSelect` explícito; e (b) telas com "roving DOM
focus" (`AddSourceScreen`, `ImportProgressScreen`), onde `useTvKeyNav` move
o foco real do navegador entre `<button>`/`<input>` e a ativação por Enter
deveria vir do comportamento nativo do HTML. O hook não distingue os dois
casos: ele sempre intercepta e faz `preventDefault()` no Enter, mesmo
quando não há `onSelect` para substituir a ativação nativa que acabou de
suprimir — deixando as duas telas do padrão (b) com todo botão inerte via
teclado/controle. Cliques de mouse não passam pelo listener de `keydown` e
por isso continuam funcionando, o que explica por que isso nunca apareceu
em testes manuais anteriores (feitos em desktop, por mouse) nem nos testes
automatizados existentes (que disparam `click`/`fireEvent.click` direto,
sem passar pelo `keydown`).

## Proposed Remediation

**Preferida**: em `useRemoteNav.ts`, só consumir (e só chamar
`preventDefault()` para) o caso `isSelect` quando `handlersRef.current.
onSelect` estiver de fato definido. Sem `onSelect`, o evento de Enter/Space
deve seguir seu curso normal, permitindo o comportamento nativo do
navegador (ativar o `<button>`/submeter o `<form>` com foco real) — exatamente
o que as duas telas afetadas já esperam. Os casos `direction` e `isBack` não
precisam da mesma guarda: nas duas telas afetadas, `onBack` sempre existe, e
`onDirection` ausente já é um no-op inofensivo porque `useTvKeyNav` já
tratou (e já fez seu próprio `preventDefault`) a tecla de seta antes de
`useRemoteNav` rodar (os dois hooks registram listeners independentes no
`document`, em ordem de montagem).

**Alternativas** (opcional):
- Fazer `AddSourceScreen`/`ImportProgressScreen` passarem um `onSelect`
  explícito que despache um clique sintético no elemento focado
  (`(document.activeElement as HTMLElement)?.click()`). Rejeitada: mais
  código espalhado por tela, e o hook compartilhado é o lugar certo pra essa
  regra — qualquer tela nova que reproduza o mesmo padrão (roving DOM focus
  sem `onSelect`) herda o comportamento correto de graça.

**Files likely to change**:
- `tv-web/src/lib/useRemoteNav.ts`

**Tests to add or update**:
- `tv-web/src/lib/useRemoteNav.test.tsx`: novo teste — sem `onSelect`
  passado, `fireEvent.keyDown(document, { key: 'Enter' })` **não** chama
  `event.preventDefault()` (permite ativação nativa).
- `tv-web/src/lib/useRemoteNav.test.tsx`: teste de regressão — **com**
  `onSelect` passado, Enter continua chamando `onSelect()` e continua
  chamando `preventDefault()` (comportamento das telas de foco gerenciado
  2D, ex. `LiveScreen`, não pode regredir).
- Idealmente um teste de integração em `AddSourceScreen.test.tsx` (verificar
  se esse arquivo já existe) simulando foco real no botão da aba +
  `keydown Enter` e checando que os campos de provedor aparecem — mais fiel
  ao bug relatado do que só o teste do hook isolado.

## Risks & Considerations

- Baixo risco: a mudança restringe quando `preventDefault()`/consumo
  acontece (deixa passar mais casos pro comportamento nativo), não adiciona
  comportamento novo. As 12+ outras telas que já passam `onSelect` (grep
  confirma) mantêm exatamente o comportamento atual.
- Vale conferir se `ConfirmDialog.tsx` e `PlayerOverlay.tsx` (que usam
  `modal: true`) sempre passam `onSelect` — se algum diálogo modal não
  passar, o mesmo problema apareceria lá, mas com `stopImmediatePropagation`
  envolvido, o que teria um efeito colateral adicional (nada consome o
  Enter, mas a tela por trás também fica impedida de reagir). Verificar na
  fase Fix antes de generalizar a garantia.

## Open Questions

- Nenhuma — root cause tem confiança alta e é diretamente observável no
  código, sem precisar de reprodução adicional além do relato já recebido.
