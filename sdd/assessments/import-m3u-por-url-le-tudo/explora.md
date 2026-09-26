# Assessment Explora: Import M3U por URL lê tudo, precisa virar estrutura-primeiro

- **Slug**: import-m3u-por-url-le-tudo
- **Criado**: 2026-09-24
- **Origem**: texto colado (usuário, sessão 2026-09-24): "preciso que ajuste a
  inclusão de listar via URL/M3U, fiz um teste e demorou muito para carregar.
  quando incluímos uma lista mesmo que grande ela deve ler apenas as
  categorias de canais, filmes e series, e deixar o resto para quando o
  usuario entrar na lista."

## Ideia Bruta

Uma fonte adicionada por URL M3U (ou pelo fallback "Modo limitado" de
provedor, `legacy_m3u`) hoje importa a lista inteira — todo item de todo
canal/filme/série é classificado e gravado em IndexedDB numa única
passada, antes da importação ser considerada concluída. A ideia é fazer o
mesmo que a feature `010-catalogo-sob-demanda` já fez para fonte de
provedor: gravar só a estrutura (categorias de canais/filmes/séries)
durante a importação, e obter os itens de uma categoria só quando a pessoa
entra nela.

## Evidência a Favor

- **A própria feature 010 já resolveu exatamente este problema para
  provedor**, com o mesmo diagnóstico de causa: "o gargalo é gravação, não
  rede" (`sdd/specs/010-catalogo-sob-demanda/spec.md:305-306`) — **medido
  no caminho de provedor, não no M3U**. O padrão de solução (estrutura
  primeiro, `fetchMode: on_demand` por categoria,
  `tv-web/src/lib/catalog/categoryLoader.ts`) já existe no código e foi
  verificado na TV física.
- **O código de import M3U (`importPipeline.ts:381-482`,
  `consumeM3u`) grava cada item em `storeBatch` durante o próprio parse**
  (loop `for await (const entry of parseM3uLines(...))`), e cria categoria
  com `fetchMode: 'eager'` (`importPipeline.ts:433`) — ou seja, hoje M3U
  nunca passa pelo caminho `on_demand` que `categoryLoader.ts` já sabe
  atender. A infraestrutura de categoria sob demanda já existe; M3U só não
  a usa.
- **Medição anterior (feature 005/010, TV física QN50Q60DAGXZD)**: M3U de
  312.936 entradas levou 16 s para concluir a importação inteira —
  considerado aceitável na época, mas isso já é o caminho "rápido" de
  referência; o usuário relata um teste recente sensivelmente mais lento,
  em ambiente de desenvolvimento (navegador), sem tamanho nem tempo
  exatos. ASSUMPTION: a lista testada é maior, ou o custo de gravação
  cresceu desde a medição (o schema Dexie passou de v5 a v9) — nenhuma
  das duas hipóteses foi medida.
- ASSUMPTION: não se sabe como o tempo de um import M3U se divide entre
  download, parse/classificação e gravação — as três etapas correm no
  mesmo laço (`importPipeline.ts:445-472`) e o registro da execução não
  as separa.
- Ambos os caminhos de código (`m3u_url` e `legacy_m3u`) reusam a mesma
  função `consumeM3u` — corrigir um sem o outro deixaria uma divergência
  de comportamento sem razão técnica (mesmo formato de arquivo).

## Evidência Contra

- **A decisão de manter M3U eager foi deliberada, não um descuido**: a
  spec 010 registra explicitamente a pergunta e resposta (sessão
  2026-09-23, `sdd/specs/010-catalogo-sob-demanda/spec.md:308-311`): "E a
  fonte por URL M3U, que só sabe entregar a lista inteira em fluxo? → A:
  Continua importando tudo, como hoje. Não existe protocolo por categoria
  num arquivo M3U." Essa resposta tratou "protocolo de categoria" como
  bloqueador total — mas o motivo real do gargalo (gravação em IndexedDB,
  não a rede) sugere que a resposta pode ter sido conservadora demais: dá
  para separar "baixar/parsear o arquivo inteiro" (inevitável — não existe
  como pedir só uma categoria a um servidor HTTP estático) de "gravar todo
  item no IndexedDB antes de concluir" (evitável).
- **Não existe protocolo de rede por categoria para M3U** — ao contrário do
  provedor Xtream (uma chamada por seção), um arquivo M3U só entrega tudo
  em uma resposta HTTP. Qualquer solução estrutura-primeiro para M3U
  precisa resolver como os itens de uma categoria ficam disponíveis depois
  (reprocessar o arquivo já baixado, mantido em algum lugar; ou baixar de
  novo por URL ao entrar na categoria — só viável para `m3u_url`, que tem
  URL estável; `legacy_m3u` também tem URL própria via `legacyM3uUrl()`,
  então isso não bloqueia o escopo combinado). Isso é decisão de design,
  não motivo para matar a ideia, mas eleva o custo de implementação acima
  do que foi a 010 (lá, "sob demanda" caiu de graça porque a API do
  provedor já separava por seção).
- **Contagem por categoria muda de natureza**: hoje `categoryItemCounts`
  só é conhecida no fim do parse completo (`importPipeline.ts:479-481`,
  comentário "o total de cada categoria só se conhece no fim"). Se o parse
  completo deixar de acontecer na importação, a contagem por categoria
  authored no painel (como já existe para provedor via `declaredCount`)
  não existe para M3U — não tem de onde vir sem reprocessar o arquivo
  inteiro pelo menos uma vez.

## Perguntas em Aberto

- ~~Reprocessar via nova requisição por categoria, ou cachear o texto
  baixado?~~ **Respondida pelo usuário (2026-09-24)**: salvar o arquivo
  no aparelho na importação, ler dele só as categorias, e ler os itens de
  uma categoria (a partir do arquivo salvo) só quando a pessoa entrar
  nela, gravando o resultado em cache.
- **Limite físico do formato**: como a categoria (`group-title`) vem em
  cada entrada, descobrir as categorias exige baixar e percorrer o
  arquivo inteiro. O tempo de import continua proporcional ao tamanho do
  arquivo — o que sai do import é a classificação completa e a gravação
  item a item, não o download nem a leitura.
- Uma fonte local por arquivo `.m3u` (backlog, item 22, ainda não
  construído) teria a mesma limitação de "sem URL para reobter" — mas como
  ainda não existe, não é bloqueador desta ideia agora.
