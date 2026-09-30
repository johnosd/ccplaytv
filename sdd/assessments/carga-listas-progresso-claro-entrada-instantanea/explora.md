# Assessment Explora: Carga de listas — progresso claro, entrada instantânea, contagens e atualização

- **Slug**: carga-listas-progresso-claro-entrada-instantanea
- **Criado**: 2026-09-30
- **Origem**: texto colado (relato do usuário/dono do produto)

## Ideia Bruta

Quando a pessoa inclui uma lista (Xtream ou URL), hoje há quatro dores:

1. A tela de carga não mostra exatamente o que está sendo carregado.
2. Live TV, Filmes e Séries demoram: os itens só chegam quando a pessoa entra
   na categoria, sem a sensação de entrada instantânea.
3. A contagem de itens de uma categoria só aparece depois que a pessoa entra
   nela.
4. Preocupação com a atualização da lista (quando e como ela se renova).

## Evidência a Favor

- **Dor 1 é real e verificável no código.** `ImportProgressScreen.tsx` mostra
  um status genérico ("Etapa: Obtendo a estrutura / Lendo categorias /
  Organizando categorias / Publicando estrutura") e dois contadores agregados
  ("Categorias lidas", "Categorias gravadas"). Não diz **qual seção** está em
  curso (canais, filmes, séries), nem EPG, nem quantas categorias de cada tipo
  já existem. Para M3U, "Entradas lidas / Itens gravados" também é agregado.
- **Dor 2 é consequência direta e deliberada da feature 010.** A importação
  de provedor grava só estrutura; os itens de uma categoria só são pedidos ao
  entrar (`categoryLoader.ts`), com pré-busca amortecida de 300 ms quando o
  cursor repousa sobre a categoria (R-013, pedido do próprio usuário na TV em
  23/09/2026). A meta aceita foi SC-002 "≤ 3 s com rede" na primeira entrada —
  ou seja, a espera na primeira entrada é **esperada por design**, não bug.
- **Dor 3 é consequência de uma limitação do protocolo, não do app.**
  `get_live_categories`/`get_vod_categories`/`get_series_categories` não
  trazem contagem (comentário em `xtreamConnector.ts`, `declaredCount`
  sempre `undefined` para Xtream). Para M3U guardada (feature 014) a contagem
  **já é conhecida** na importação e gravada como `declaredCount` — então a
  dor 3 é específica de Xtream (e de M3U confirmada como painel Xtream).
- **Dor 4 tem base real.** A regra de atualização existe mas é invisível:
  `decideOnOpen` dispara `update_by_age` depois de 24 h (`STALE_AFTER_MS`) ao
  abrir a fonte, e cada categoria expira pelo mesmo prazo
  (`isCategoryFresh`). Nada disso é mostrado à pessoa ("atualizada há X",
  "atualizando agora") fora do botão "Ressincronizar".
- **Dados medidos do painel real** (`sdd/specs/010-catalogo-sob-demanda/
  research.md`, 23/09/2026): seção inteira = 2.266 canais / 0,76 MB; 31.304
  filmes / 12,4 MB; 9.637 séries / 9,7 MB. Uma categoria típica = 11 KB–1,5 MB.
  Isso quantifica o custo de qualquer abordagem "carregar tudo antes".
- ASSUMPTION: a sensação de lentidão da dor 2 é mais aguda em Filmes/Séries
  (resposta maior + capas) do que em Live TV — não medido.

## Evidência Contra

- **A feature 010 já rejeitou, por medição na TV física, a carga completa.**
  O gargalo medido foi a **gravação no IndexedDB** (311 mil linhas), não a
  rede; a importação eager congelava a TV. A pesquisa R0-1 registrou e
  descartou explicitamente: "gravar tudo em segundo plano depois de liberar a
  interface — não reduz o trabalho total, e a TV fica lenta enquanto isso.
  Adia o sintoma" e "manter a seção inteira viva no Worker — centenas de MB na
  memória da TV". Há uma **regra travada** (D-007 da 010): não adotar nenhuma
  dessas alternativas sem reabrir o design. Qualquer resposta à dor 2 que
  signifique "baixar/gravar tudo" precisa enfrentar isso de frente.
- **Contagem real para Xtream exige baixar a seção inteira** (12,4 MB de
  filmes, 9,7 MB de séries) — a spec 034 já colocou "total real de itens de
  uma fonte Xtream" como **Fora de Escopo** pelo mesmo motivo. Contar sem
  gravar (baixar, contar por `category_id` no Worker, descartar) evita o
  gargalo de escrita, mas ainda custa rede + parse de JSON grande na TV —
  pico de memória não medido.
- **Sobreposição com trabalho já planejado**: a 034 (Especificada) já cobre
  "Sincronizando"/"Sincronizada em…" na linha e no cartão da fonte — parte da
  dor 4. O item 24 do backlog cobre reconciliação pós-resync (favoritos e
  progresso sobrevivem à atualização); o item 36 cobre single-flight. Uma
  feature nova precisa não duplicar isso.
- **"Instantâneo" é, em parte, percepção.** Com pré-busca amortecida, a
  categoria em que o cursor repousa já costuma estar pronta; a primeira
  entrada fria é o caso ruim. Não há medição atual (pós-025, com capas e grade
  V14) de quanto tempo a primeira entrada leva na TV — a meta de 3 s é da 010,
  antes das capas.

## Perguntas em Aberto

- Qual é o tempo real hoje da primeira entrada numa categoria de Filmes na TV
  (p50/p95)? Sem isso, "demora" não tem linha de base.
- A pessoa aceita que a lista demore mais para ficar "pronta" na importação
  (ex.: minutos em segundo plano) em troca de entrada instantânea depois?
- A contagem por categoria é desejada como número exato, ou "carregada / não
  carregada ainda" já resolveria?
- A preocupação com atualização é sobre **frequência** (24 h é pouco/muito),
  **visibilidade** (não sei quando atualizou) ou **segurança** (perder
  favoritos/progresso)?
