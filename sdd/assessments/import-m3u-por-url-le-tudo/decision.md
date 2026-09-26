# Assessment Decision: Import M3U por URL lê tudo, precisa virar estrutura-primeiro

- **Slug**: import-m3u-por-url-le-tudo
- **Decidido**: 2026-09-24 (revisado no mesmo dia — ver "Revisão")
- **Problem**: ./problem.md
- **Veredito**: go

## Revisão (2026-09-24)

A primeira versão deste documento tinha três erros, corrigidos aqui e em
`problem.md`/`explora.md`:

- Meta de "import em poucos segundos, independente do tamanho da lista" —
  impossível para M3U: descobrir as categorias exige percorrer o arquivo
  inteiro, porque o `group-title` vem em cada entrada.
- "A maioria dos provedores reais cai no caminho M3U" — afirmação sem
  fonte, usada para dar `strong` a "Valor vs. custo de inação". Removida.
- "O gargalo é gravação" foi tratado como fato para M3U; foi medido só no
  caminho de provedor. Citação corrigida.

A abordagem também mudou: o usuário decidiu **guardar o arquivo no
aparelho** em vez de baixá-lo de novo por categoria — o que torna a
solução robusta independentemente de o tempo estar no download ou na
gravação (a divisão entre os dois continua não medida).

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | Relato do usuário + código lido: `consumeM3u` (`importPipeline.ts:381-482`) classifica e grava cada item durante o parse, com categoria sempre `fetchMode: 'eager'`, enquanto o caminho de provedor já é estrutura-primeiro. |
| Força da evidência | adequate | Teste do usuário no navegador, sem tamanho/tempo exatos. Baseline própria: 312.936 entradas em 16 s na TV física (feature 005). Como o tempo se divide entre download/parse/gravação **não foi medido** — a abordagem escolhida não depende dessa resposta. |
| Valor vs. custo de inação | adequate | Elimina a espera pela classificação e gravação de itens que a pessoa talvez nunca abra, e fecha a inconsistência entre os dois tipos de fonte. Sem dado de qual tipo de fonte é mais usado — por isso não `strong`. |
| Viabilidade / apetite | adequate | Reusa `categoryLoader.ts`/`fetchMode: 'on_demand'` e os estados de UI da 010 (verificados na TV física), mais o parser/classificador M3U e o agrupamento de séries da 012. Trabalho novo real: guardar o arquivo bruto por geração (espaço em disco, descarte junto com a geração, FR-018 de espaço cheio) e uma leitura por categoria que ainda percorre o arquivo inteiro na primeira vez. |
| Fit estratégico | strong | Continua a direção da feature 010 e da emenda da ADR-002 (cobertura parcial do catálogo como estado normal). |

## Abordagens Candidatas

### 1. Guardar o arquivo no aparelho, ler categorias na importação, itens sob demanda com cache (escolhida pelo usuário)

- Na importação: baixa o M3U, guarda o conteúdo no aparelho (associado à
  geração), percorre-o extraindo só as categorias de canais/filmes/séries
  e grava essa estrutura com `fetchMode: 'on_demand'`.
- Ao entrar numa categoria: lê o arquivo guardado (sem rede), extrai só as
  entradas daquela categoria, classifica e grava em cache — mesmo
  contrato de "já obtida" da feature 010.
- **Recomendada**: sim — sem novo download por categoria, sem gravação de
  item na importação, e não depende de o servidor suportar nada além de
  um GET simples.

### 2. Baixar a URL de novo a cada categoria, sem guardar o arquivo

- **Recomendada**: não — se o tempo estiver no download (não medido),
  cada categoria aberta custaria quase uma importação inteira. Também
  deixa a navegação dependente de rede para algo que o aparelho já teve.

### 3. Indexar offsets e buscar por `Range` request

- **Recomendada**: não — depende de o painel suportar `Range`, não
  garantido nem verificado.

## Veredito

**go.** Nenhum critério central ficou `weak` ou `unknown`. A única
incógnita (a divisão do tempo entre download e gravação) deixou de ser
bloqueante porque a abordagem escolhida elimina a gravação de itens na
importação e o download repetido ao mesmo tempo.

### Se go — Handoff

- **Problema**: importação por URL M3U (e o fallback `legacy_m3u`) grava
  todo item antes de concluir; fonte de provedor Xtream JSON já é
  estrutura-primeiro desde a feature 010. Detalhe em `./problem.md`.
- **Abordagem**: guardar o arquivo M3U no aparelho na importação; extrair
  só as categorias (canais/filmes/séries, ordem de aparição); ao entrar
  numa categoria, ler os itens dela do arquivo guardado (sem rede) e
  gravar em cache, reusando `categoryLoader.ts`/`fetchMode: 'on_demand'`.
- **Escopo**: entra — `source.type === 'm3u_url'` e `mode === 'legacy_m3u'`
  (mesma função `consumeM3u`). Fora — protocolo de rede novo, fonte por
  arquivo `.m3u` local (backlog item 22, não construída), busca global,
  "Não classificados", mudanças no caminho Xtream JSON.
- **Métricas**: import mensuravelmente mais rápido que o integral com a
  mesma lista (antes/depois), sem gravar item; entrar numa categoria não
  gera requisição; voltar a uma categoria já lida não relê o arquivo;
  estados carregando/erro focáveis idênticos aos da 010; suíte de
  `importPipeline`/`m3uParser`/`m3uSeriesGrouping` verde.
- **Perguntas em aberto pro sdd-specify**:
  - Contagem por categoria: M3U não tem `declaredCount`. A varredura de
    categorias pode contar entradas por grupo sem classificar — mas a
    contagem pós-classificação (descarte de `unclassified`, agrupamento de
    episódios em séries) só se sabe ao ler a categoria. Qual número a UI
    mostra antes?
  - Séries sintéticas (feature 012): episódios `SxxEyy` se agrupam por
    grupo + título-base. A leitura sob demanda de uma categoria de séries
    precisa reconstruir esse agrupamento só com as entradas daquele
    grupo — confirmar que o agrupamento nunca atravessa grupos.
  - Classificação de kind por categoria: hoje o kind (canal/filme/série)
    vem da classificação de cada entrada; uma mesma `group-title` pode
    gerar categorias de kinds diferentes. A varredura de estrutura precisa
    classificar cada entrada para saber em qual seção a categoria aparece
    — isso tem custo, e precisa ser medido.
  - Espaço: o arquivo bruto guardado + itens em cache ocupam mais disco
    que hoje nas categorias visitadas. Comportamento com espaço cheio
    (FR-018 da 005) ao guardar o arquivo.
  - Quando o arquivo guardado é descartado (nova geração, remoção da
    fonte) e o que acontece se ele sumir (ex.: limpeza de storage) antes
    de uma categoria ser lida.
