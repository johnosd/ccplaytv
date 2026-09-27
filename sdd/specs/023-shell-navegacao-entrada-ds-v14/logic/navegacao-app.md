# Lógica: navegação do app (redutor puro)

Feature 023. D-003 do `plan.md`. Stub em `tv-web/src/navigation/appNav.ts`,
contratos C1/C2 em `appNav.shell-navegacao.contract.test.ts`.

## Por que um redutor puro

Hoje `App.tsx` guarda `{ screen, history }` com `setNav` espalhado em
`goto`/`back`/`goHome`, e cada `Screen` carrega o seu próprio `source`. A
Onda 2 muda as regras de RETURN e acrescenta duas que dependem de estado
global (fonte ativa e "a tela de perfis é base ou troca?"). Espalhar isso
em `setNav` inline no JSX torna as regras impossíveis de testar sem montar
o app inteiro. As regras vivem num redutor puro e o `App` só despacha.

## Estado

```ts
interface AppNavState {
  screen: AppScreen          // tela atual
  history: AppScreen[]       // pilha de RETURN (topo = último)
  activeSource: SourceOut | null
}
```

- `activeSource` sai de dentro de cada `Screen`. Live/Filmes/Séries leem
  `state.activeSource!.id`. Nenhuma dessas telas é alcançável com
  `activeSource === null` (só se chega a elas pelo Início).
- `history` vazio significa "tela base". RETURN numa tela base **não é do
  redutor**: a própria tela decide (Início e perfis-base abrem o modal de
  saída). O redutor devolve o estado sem mudança.

## Ações e regras

| Ação | Resultado |
|---|---|
| `splash-finished` | `screen = profiles{mode:'base'}`, `history = []`. O Splash nunca entra na pilha. O foco inicial vem de `readLastSourceId()`, lido pelo `App` e passado como prop (não fica no estado). |
| `choose-source(s)` | `activeSource = s`, `screen = home`, `history = []`. Vale para escolher na tela de perfis **e** para "Abrir lista" no fim da importação (FR-038). Zera a pilha sempre (FR-032). |
| `open(screen, from?)` | Empilha `from ?? state.screen` e abre `screen`. `from` é como o Início guarda o foco (`home{focus}`) e Filmes/Séries guardam o snapshot (`movies{restore}`). |
| `open-profiles(from?)` | Igual a `open`, com `screen = profiles{mode:'switch', focusSourceId: activeSource.id}`. |
| `back` | `history` vazio → estado igual. Senão, desempilha: `screen = topo`, `history` sem o topo. |
| `source-removed(id)` | Se `id !== activeSource?.id`, nada muda. Se é a ativa: `activeSource = null`, `history = []`, e `screen = profiles{mode:'base'}`. Qualquer tela de perfis aberta vira base (edge case da spec). |
| `import-back(sourceId?)` | `screen = profiles{mode:'base', focusSourceId: sourceId}`, `history = []`, `activeSource = null`. É o "Voltar" da tela de progresso sem abrir a lista (FR-039). |

### Casos que parecem estranhos, mas são intencionais

- **`back` de `live`/`movies`/`series` volta ao Início sem regra especial.**
  O único caminho até eles é o Início (atalho ou topbar), então o topo da
  pilha já é `home{focus}`. Não crie um caso "destino de topo → Início"
  separado. Isso duplicaria a regra e quebraria se um dia houver outro
  caminho.
- **`open-profiles` guarda o Início na pilha**, e é por isso que RETURN nos
  perfis em modo `switch` volta ao Início. Quem decide o que RETURN faz nos
  perfis é o `mode`, que a tela recebe por prop. Em `switch` ela chama
  `onBack` → `back`. Em `base` ela abre o modal de saída.
- **Excluir a lista ativa com os perfis abertos pela topbar** não pode
  deixar o `home` da lista apagada na pilha. Por isso `source-removed`
  zera a pilha e troca o `mode` para `base`.
- **Adicionar/editar lista a partir dos perfis** é `open` normal. Ao
  salvar a edição, `back` volta aos perfis (FR-040). Ao criar, `open(progress)`
  empilha. O fim da importação é `choose-source` ou `import-back`, e os dois
  zeram a pilha: nunca se volta para dentro do formulário já enviado.

## Efeitos colaterais (fora do redutor, no `App`)

O redutor não grava nada nem chama rede. O `App` embrulha o `dispatch`:

```ts
function chooseSource(source: SourceOut) {
  dispatch({ type: 'choose-source', source })
  writeLastSourceId(source.id)             // FR-005
  openSource.mutate(source.id, { ... })     // FR-007: mesmo fogo-e-esquece de hoje
}
```

- O acompanhamento de auto-refresh (`autoRefreshJobId`,
  `reconciledJobRef`) **continua no `App`**, igual a hoje. Ele não depende
  de qual tela está montada.
- `resyncFromCategoryScreen` continua igual e despacha
  `open({name:'progress', jobId})`.
- `onSourceDeleted(id)` (perfis) → `dispatch({type:'source-removed', id})`.
  Se o id apagado era o da última lista usada, **não** apague a chave: o
  `readLastSourceId` de uma lista inexistente já cai no fallback de FR-004.

## HomeFocus

```ts
type HomeFocus =
  | { zone: 'topbar'; item: TopbarItem }
  | { zone: 'shortcuts'; destination: 'live' | 'movies' | 'series' }
  | { zone: 'continue'; itemId: string }
```

"Continuar assistindo" é restaurado por **id**, nunca por índice
(constitution). Se o id não existir mais quando o Início remontar (o item
saiu da lista porque foi concluído), o foco cai no atalho "TV ao vivo", que é
o foco inicial padrão (FR-024).
