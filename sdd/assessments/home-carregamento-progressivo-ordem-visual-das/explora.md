# Assessment Explora: Home — carregamento progressivo e ordem visual das fileiras

- **Slug**: home-carregamento-progressivo-ordem-visual-das
- **Criado**: 2026-10-16
- **Origem**: texto colado (relato do usuário/dono do produto)

## Ideia Bruta

Ao abrir uma lista, a pessoa entra na Home e vê placeholders por algum tempo.
O hero, “Continuar assistindo” e outras fileiras aparecem depois, às vezes em
ordem diferente da ordem visual esperada. A percepção desejada é que a Home
seja construída de cima para baixo, com o conteúdo prioritário pronto antes
das fileiras inferiores.

## Evidência a Favor

- **Relato em primeira pessoa**: o usuário observa espera após a entrada na
  lista, hero incompleto e fileiras que chegam fora de ordem. Isso é evidência
  direta da experiência percebida, mas ainda não é uma medição de tempo.
- **O código permite montagem fora de ordem**: `HomeContent.tsx` executa
  `useHomeHero`, `useContinueCards`, `useMyListContent`,
  `useFavoritesContent` e dois `useRecentlyAdded` como consultas independentes.
  `rowKeys` é derivado dos dados já resolvidos; uma fileira sem dados “não
  existe” até sua própria consulta terminar (`HomeContent.tsx`,
  `homeRows.ts`).
- **Há atraso deliberado para as fileiras adicionadas**: `useDeferred` usa
  `HOME_DEFERRED_MS = 600` antes de consultar “Filmes adicionados” e “Séries
  adicionadas” (`HomeContent.tsx`, `homeRowFormats.ts`).
- **O hero também depende de leituras separadas**: o item pode resolver antes
  de metadados e imagens, porque `useHomeHero`, `useTitleMetadata` e
  `useHomeImages` têm ciclos distintos.
- **Precedente no próprio produto**: o registro de 2026-10-09 em
  `.planning/backlog.md` documenta a mesma percepção em Filmes/Séries (“fileiras
  pulando”), com a decisão de aguardar um conjunto de dados e desenhar as
  fileiras juntas. O efeito foi aprovado pelo usuário na TV, mas a causa e o
  critério da Home ainda precisam ser medidos separadamente.

## Evidência Contra

- A implementação atual já mantém a ordem declarada em `HOME_ROW_ORDER`; o
  problema relatado pode ser apenas a entrada tardia de fileiras, e não uma
  ordenação incorreta.
- Os placeholders de poster são uma camada de fallback de imagem e podem ser
  confundidos com dados ainda não carregados. A exploração não prova que todos
  os placeholders vistos na TV vêm da mesma causa.
- Testes unitários e E2E da Home usam fixtures locais e não estabelecem tempo
  de carregamento na TV Samsung com uma lista real; browser rápido não é
  evidência de desempenho no aparelho.
- A Home precisa manter pelo menos um controle focável enquanto carrega, e
  uma espera global mal calibrada pode piorar a primeira interação. Isso limita
  qualquer solução que simplesmente bloqueie toda a tela até a consulta mais
  lenta.

## Perguntas em Aberto

- Qual é o p50/p95, na TV de referência, entre entrar na lista e: billboard
  utilizável, hero com backdrop, primeira fileira visível e Home estável?
- Em quantos casos a primeira fileira esperada não é `Canais favoritos` ou
  “Continuar assistindo” porque seus dados ainda não chegaram?
- O usuário prefere aguardar uma janela curta para compor a Home ou ver o
  billboard imediatamente com fileiras entrando por etapas, desde que a ordem
  visual não pule?
