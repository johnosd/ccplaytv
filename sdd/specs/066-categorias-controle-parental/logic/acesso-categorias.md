# Lógica — acesso às categorias (escondida, bloqueada, desbloqueio)

Módulo: `tv-web/src/lib/catalog/categoryAccess.ts` (stub criado pelo `sdd-plan`).
Contrato: `categoryAccess.categorias-controle-parental.contract.test.ts` (3 testes).

## 1. Estado efetivo de uma categoria

Entradas, por categoria `c` da **geração ativa** de uma lista `s`:

- `pref` = preferência salva para `(s, c.kind, matchKey(c))`, ou nada. `matchKey` é **exatamente**
  `categoryMatchKey(c.providerCategoryId, c.name)` de `structureDiff.ts` — a mesma identidade que a
  atualização da lista (feature 038) usa para manter categorias. Nunca o id local (`categories.id`),
  que muda numa geração nova.
- `pinAtivo` = existe PIN (controle parental ligado).
- `sessao` = id da lista desbloqueada nesta sessão, ou nada (só memória).

```
hidden(c)      = pref?.hidden === true
lockedSalvo(c) = pinAtivo && (
                   pref?.locked === true
                   || (pref?.locked === undefined && pref?.declinedSuggestion !== true && isAdultCategoryName(c.name))
                 )
locked(c)      = lockedSalvo(c) && sessao !== s          // o que a trilha mostra (cadeado)
excluded(c)    = hidden(c) || locked(c)                  // o que as leituras deixam de fora
```

Consequências que o contrato prova e que um executor erraria:

- **Sem PIN, nada é bloqueado** — nem `pref.locked === true` antigo (FR-019 apaga os `locked` ao desligar,
  mas a regra também não confia nisso).
- **Nome adulto sem decisão = bloqueada** quando o PIN existe. É assim que uma categoria nova trazida por
  uma atualização "chega bloqueada" (FR-025) **sem nenhum gancho na importação**: a regra é calculada na
  leitura. Não mexa em `importPipeline`/`structureRefresh` para isso.
- `pref.locked === false` explícito vence o nome adulto (a pessoa liberou na gestão).
- `declinedSuggestion === true` impede o bloqueio automático por nome (FR-024).
- Escondida e bloqueada: some (escondida prevalece nas leituras); a gestão mostra os dois estados.

## 2. Ligar o controle parental (atômico)

`enableParentalControl(pin, decisions)` grava PIN **e** decisões numa transação só. A tela de gestão
monta `decisions` a partir da sugestão (§4): cada categoria de nome adulto vira
`{ locked: true }` (aceita) ou `{ locked: false, declinedSuggestion: true }` (desmarcada), mais a
categoria que a pessoa estava bloqueando quando o PIN foi pedido (FR-010). Cancelar o fluxo antes de
confirmar **não grava nada** — senão a regra do §1 bloquearia as adultas sem confirmação (FR-022).

`disableParentalControl()` apaga o PIN e zera `locked` de todas as preferências de todas as listas;
`hidden` e `declinedSuggestion` ficam (FR-019). Também chama `relockSession()`.

## 3. Onde filtrar — leitores de `lib/catalog`

Filtrar **na leitura, depois de qualquer memo** (`blockMemo`, `readProjectionMemo`, `WeakMap` de
`catalogSearch`): esses caches guardam dado bruto e continuam válidos. Nunca grave dado filtrado num
cache de `lib`.

| Leitor | Arquivo | O que muda |
| --- | --- | --- |
| Trilhas de categorias | `catalogApi.ts` (`useCategoryList` e mais 3 chamadas de `listCategories`) | trocar por `listVisibleCategories` — **mesma quantidade de linhas** (teto do arquivo) |
| Busca local/global, Top 10/Dica, Semelhantes, página de ator | `catalogSearch.ts:121`, `metadata/localTitleMatch.ts:116` | `listCategories` → `listVisibleCategories`; os registros vêm de `listAllOfKind` (abaixo) |
| "Todos", busca, títulos locais | `repository/kindReads.ts` (`listAllOfKind`, `readKindCursorPage`, `readKindPage`, `kindSortFields`) | pular blocos/linhas de categoria excluída |
| Fileiras derivadas (Início, vitrines: recentes, bem avaliados, porque você assistiu) | `catalogDerivedRows.ts` (`iterateKindChunks`) | pular categorias excluídas antes de ler o bloco |
| Favoritos, histórico, continuar assistindo | `repository/stableIds.ts` (`resolveStableIdsIn`) | resolver só em blocos/linhas de categoria não excluída; se o item só existe em excluída → não resolvido |
| Detalhe/semelhança de série | `repository/series.ts` (`findSeriesRecord`, `findSeriesManyIn`) | idem |
| Uma categoria (conteúdo, janela) e um item por id | `repository/categoryReads.ts` (`listChannels`, `getActiveCategoryBlock`, `getChannel`), `repository/categoryWindow.ts` | categoria/registro excluído → vazio/`undefined`. Defesa em profundidade: a tela já não pede, mas um cache velho ou um id guardado (continuar assistindo, zapping) não pode abrir conteúdo bloqueado (FR-020) |

**Ficam sem filtro** (de propósito): `listCategories` cru (pré-carga, carga por seção, bancada),
`countChannels`/contagens da lista em Fontes IPTV (premissa da spec), conversão de blocos, limpeza de
gerações, `structureRefresh`.

**Pré-carga** (`prefetch/index.ts`, `loadCategories`): pular categorias **escondidas** (não gastar
rede/disco com o que a pessoa não vê); continuar carregando as **bloqueadas** (o desbloqueio abre na
hora).

**Item em mais de uma categoria**: cada ocorrência é um registro próprio com o seu `categoryId`; filtrar
por registro já faz o item continuar visível pela categoria livre. Na resolução por identidade
(`resolveStableIdsIn`), procurar só nos blocos não excluídos — se houver ocorrência livre, ela resolve.

**Episódios**: não têm categoria própria; herdam a da série. `resolveContinueEntries` resolve o
episódio a partir da série — garanta que uma série em categoria excluída faça o episódio não resolver.

**Registro sem `categoryId`** (linha do formato antigo): use `kind`+`groupOrder` → categoria da geração
ativa (`groupOrder` = `categories.order`). `getCategoryAccess` monta esse mapa uma vez por chamada.

## 4. Sugestão "adulta" (FR-023)

`isAdultCategoryName(name)`: normalizar (minúsculas, sem acento — `normalizeForSearch` de
`catalogSearch.ts` já faz isso) e procurar, como **palavra** ou prefixo de palavra:

`xxx`, `adult`/`adults`/`adulto(s)`/`adulta(s)` (palavra inteira — **não** "adulteração"), `porn` (porn, porno, pornô),
`erotic`/`erotica`/`erotico` (erótico já normalizado), `+18`, `18+`.

Regex de referência sobre o texto normalizado:
`/(^|[^a-z0-9])(xxx|adults?|adult[oa]s?|porn\w*|erotic[oa]?s?)([^a-z0-9]|$)|(^|[^0-9])(\+18|18\+)([^0-9]|$)|\[\s*18\s*\]/`.
Lista fixa, sem dado externo, sem IA. Falso positivo conhecido e aceito: "Adult Swim".

## 5. Sessão, rebloqueio e invalidação

- `unlockWithPin(s, pin)`: `verifyPin`; certo → `sessao = s`, notifica; errado → `false`, nada muda.
- `relockSession()`: `sessao = nada`, notifica (sem efeito se já estava bloqueado — não notificar à toa).
- Gatilhos de rebloqueio (hook `useCategoryAccessLifecycle(activeSourceId)` em
  `features/catalog/categoryAccessApi.ts`, montado uma vez em `App.tsx`):
  1. `document.visibilityState === 'hidden'`;
  2. mudança de `activeSourceId` (inclusive voltar para a mesma lista depois de outra);
  3. fechar o app (memória some sozinha).
- Toda notificação de `subscribeCategoryAccess` faz o hook **`resetQueries`** (não `invalidate`) das
  consultas de catálogo: `['categories']`, `['category-content']`, `['category-window']` (se existir),
  `['catalog-search-index']`, `['catalog-items']`, `['catalog-item']`, favoritos/histórico/continuar,
  vitrines e Início. `invalidate` mantém o dado velho na tela até a releitura — depois de rebloquear,
  itens bloqueados continuariam visíveis por um instante. O executor deve listar as chaves reais
  (`grep "queryKey: \['" catalogApi.ts`) em vez de confiar nesta lista.
- `setCategoryPreference`, `enableParentalControl`, `changePin`, `disableParentalControl` também notificam.
