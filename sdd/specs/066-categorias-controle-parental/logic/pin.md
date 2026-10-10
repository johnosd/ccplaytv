# Lógica — PIN parental, proteção de telas e recuperação

Módulo: `tv-web/src/lib/parental/pin.ts` (stub). Componente: `tv-web/src/components/PinPrompt.tsx` (stub).
Contratos: `pin.categorias-controle-parental.contract.test.ts` (1), `PinPrompt.categorias-controle-parental.contract.test.tsx` (1).

## 1. Guardar o PIN

- Um registro só (`parentalPin`, id `'pin'`): `{ salt, hash, algorithm: 'sha256', createdAt }`.
- `salt` = 16 bytes aleatórios (`crypto.getRandomValues`), em hex. `hash` = SHA-256 de `salt + ':' + pin`, em hex.
- Hash por `crypto.subtle.digest` quando existir; **senão**, SHA-256 em JS puro no mesmo módulo
  (`lib/parental/sha256.ts`, ~50 linhas, testado contra os vetores do FIPS 180-2 e contra o `subtle`
  do Node). Motivo: `crypto.subtle` exige contexto seguro; a origem do app na TV é `file://` e não foi
  verificada (R-002). Nunca falhar o PIN por falta de `subtle`.
- Não é cofre: com 10 mil combinações, o hash só cumpre "não ler o PIN de volta em texto" (FR-012).
  Ninguém deve tratar isso como proteção contra quem tem acesso ao IndexedDB.
- Nada do PIN em log, `console`, mensagem de erro, `aria-label`, `title` ou atributo `value` de input.

## 2. Verificar

`verifyPin(pin)`: lê o registro, recalcula com o `salt`, compara as strings hex. Sem registro → `false`.
Sem limite de tentativas nem espera (decisão do usuário, FR-016).

## 3. `PinPrompt`

- Dentro de `Modal` (`components/Modal.tsx`), `ariaLabel = title`.
- 4 casas que mostram só preenchida/vazia (ponto), nunca o dígito. Sem `<input>` com o valor.
- Dígitos por teclado: ouvinte de `keydown` em `document` para `event.key` `'0'`–`'9'` (o `Modal`
  deixa passar tecla não mapeada — `useRemoteNav` só intercepta setas/OK/Voltar). Na TV, as teclas
  numéricas só chegam se registradas: `registerDigitKeys()` (T031) chamada de dentro de
  `registerMediaKeys()` em `lib/tizenMediaKeys.ts` — **não** acrescentar linha em `App.tsx`.
- Teclado na tela: grade 3×4 (`1 2 3 / 4 5 6 / 7 8 9 / Apagar 0 OK`... a 4ª linha pode ser
  `Apagar 0 Cancelar`), navegável por setas; o foco inicial é o `5` (centro) e tem `tv-focus`.
  "Esqueci o PIN" abaixo, quando `onForgot` vier.
- Na 4ª casa preenchida: chama `onSubmit(pin)` uma vez (ignorar teclas até a promessa voltar).
  `false` → limpa as casas, mostra "PIN incorreto" (região `aria-live`), foco volta ao teclado.
  `true` → não faz nada (quem chama desmonta).
- RETURN (`onBack` do `Modal`) → `onCancel`.

## 4. Onde o PIN é pedido (FR-017)

| Ponto | Como |
| --- | --- |
| Entrar numa categoria bloqueada (Live, Filmes, Séries) | estado de conteúdo `LockedCategoryState` (`components/`), que abre o `PinPrompt` ao montar; certo → `unlockWithPin` já desbloqueou e o reset das consultas mostra o conteúdo |
| Entrar na aba Categorias & parental | a aba mostra só "Digite o PIN para gerenciar" + botão; certo libera a aba até sair dela (estado local da aba) |
| Adicionar lista / editar lista | `withParentalGate` em `navigation/routeModules.ts` envolvendo o `lazyRoute` de `AddSourceScreen`: com PIN, mostra o `PinPrompt` antes da tela; cancelar chama o `onBack` da rota. **Zero linhas em `App.tsx` e em `AddSourceScreen.tsx`** (ambos no teto) |
| Remover lista | `features/sources/DeleteSourceModal.tsx` (único modal de remoção, usado por Perfis e Configurações): com PIN, "Remover" pede o PIN antes de chamar `onConfirm` |
| Trocar PIN / desligar controle | dentro da aba já liberada: pedem o PIN atual de novo |

## 5. Recuperação (FR-027..FR-030)

`recoverPinWithSource(input)` compara, **só no IndexedDB**:

- `{ username, password }` contra cada fonte `provider_credentials`: igualdade exata de
  `providerUsername` e `providerPassword` (aparar espaços nas pontas dos dois lados).
- `{ url }` contra cada fonte com `m3uUrl`: igualdade exata depois de aparar espaços.
- Nenhuma requisição de rede, nenhum log. Devolve só `boolean` — a tela nunca sabe qual campo errou.

Fluxo da tela: "Esqueci o PIN" → escolher "Lista Xtream (usuário e senha)" ou "Lista M3U (endereço)"
→ campos com o IME do V14 §37 (padrão de `features/import` para senha: mascarada) → certo →
"Criar novo PIN" (2×) → `changePin`. Bloqueios e escondidas ficam.
