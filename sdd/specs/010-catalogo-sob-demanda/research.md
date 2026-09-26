# Fase 0 — Pesquisa

## R0-1. O painel aceita filtrar por `category_id`?

**Status**: **resolvido em 23/09/2026 — o painel filtra, nas três seções.**

**Por que era incerto**: a única referência de terceiros que o repositório
tem (`docs/iptvnator/06-carga-listas-url-xtream.md`, seção 3) descreve o
cliente maduro chamando `getLiveStreams` / `getVodStreams` /
`getSeriesStreams` **inteiros** e filtrando por categoria no próprio
cliente. Ele não demonstrava o filtro no servidor. A ADR-004 §3 já
registrava que a compatibilidade Xtream é "proposta sujeita à confirmação
do protocolo real", e `contracts/provider-protocol.md` (feature 004)
repetia que tudo ali é "o que vamos tentar", não o que está garantido.

**Medição**: sonda descartável (`tv-web/scripts/probe-category.mjs`, T001)
rodada contra o painel real do usuário em 23/09/2026, comparando a
contagem de itens devolvida com e sem `&category_id=<id>`, para uma
categoria de exemplo de cada seção. Nenhuma URL, credencial ou trecho de
resposta foi impresso ou registrado — só contagens e tamanhos em bytes:

| Seção | Sem `category_id` | Com `category_id` | Redução |
| --- | --- | --- | --- |
| Canais ao vivo (`get_live_streams`) | 2.266 itens / 764.331 bytes | 34 itens / 11.382 bytes | 98,5% |
| Filmes (`get_vod_streams`) | 31.304 itens / 12.396.507 bytes | 103 itens / 41.028 bytes | 99,7% |
| Séries (`get_series`) | 9.637 itens / 9.689.639 bytes | 1.746 itens / 1.564.830 bytes | 81,9% |

A proporção varia por seção (a categoria de séries sondada era bem mais
populosa que a de canais ou filmes), mas a redução é real e consistente
com filtro no servidor — não é artefato de paginação nem coincidência de
tamanho.

**Decisão**: o design segue o caminho principal descrito em `plan.md` e
`data-model.md` — categoria como entidade, itens obtidos por
`category_id` sob demanda. **Nenhuma das alternativas abaixo é adotada.**
Elas continuam registradas porque a sonda foi feita contra **uma**
categoria de cada seção; se, durante a Fase 2/3, alguma categoria
específica do painel real se revelar sem filtro efetivo (D-007 continua
valendo para esse caso pontual), este documento é o primeiro lugar a
atualizar.

**Alternativas consideradas, caso a resposta seja "não filtra"**:

| Alternativa | O que muda | Por que não é a escolha padrão |
| --- | --- | --- |
| Baixar a seção inteira e **gravar só a categoria aberta** | A rede continua cara, mas a gravação — o gargalo medido — cai para o tamanho de uma categoria | Rebaixa a mesma resposta gigante a cada categoria nova; só faz sentido com a resposta mantida viva na sessão |
| Baixar a seção inteira uma vez por sessão, manter no Worker, gravar por categoria sob demanda | Uma requisição por seção por sessão; gravação incremental | Mantém centenas de MB vivos na memória da TV — é exatamente o pico que a D-002 da feature 005 evita |
| Gravar tudo, mas em segundo plano depois de liberar a interface | A pessoa entra na lista rápido; a gravação continua atrás | Não reduz o trabalho total, e a TV fica lenta enquanto isso. Adia o sintoma |
| Manter o comportamento atual e atacar só a velocidade de escrita | Sem mudança de contrato | Não foi medido quanto dá para ganhar; 311k linhas continuam sendo 311k linhas |

**Regra travada**: se a sonda disser que o painel não filtra, **não seguir
com nenhuma das alternativas sem reabrir o design** (D-007 em `plan.md`).
Escolher em silêncio uma que muda o perfil de memória seria desfazer, sem
registro, a decisão que a feature 005 tomou por medição.

## R0-2. Onde mora o prazo de validade de uma categoria

**Decisão**: um instante de obtenção por categoria, comparado contra o
mesmo `STALE_AFTER_MS` (24 h) que `freshness.ts` já usa para a fonte.

**Justificativa**: já existe a regra de idade da fonte (FR-020 da feature
005) e ela é testada com instante injetado. Um segundo prazo, com outro
valor e outro mecanismo, criaria duas noções de "velho" no mesmo
aplicativo sem nenhuma medição que justifique a diferença.

**Alternativas consideradas**: prazo por tipo de seção (canais mudam mais
que filmes) — plausível, mas é afinação sem dado; fica para quando houver
medição. Sem prazo, só invalidação manual — contraria FR-020, que existe
justamente para o catálogo não apodrecer em silêncio.

## R0-3. Como a geração convive com preenchimento incremental

**Decisão**: a geração continua sendo o único ponto de troca atômica e
passa a valer para **a estrutura**. Os itens obtidos sob demanda nascem
carimbados com a geração vigente; publicar uma geração nova descarta os
itens da anterior junto com a estrutura dela (FR-010).

**Justificativa**: é o que a pessoa escolheu na clarificação, e preserva o
invariante da feature 005 (D-004) sem inventar um segundo mecanismo de
versionamento por categoria. O custo — ressincronizar joga fora o que foi
baixado navegando — está registrado na spec e em R-006.

**Alternativa considerada e rejeitada**: reconciliar por `category_id`,
mantendo os itens das categorias que sobrevivem. Mais amigável, mas exige
um segundo eixo de validade (a categoria sobreviveu, mas o conteúdo dela
mudou?) e foi explicitamente recusada na clarificação.

## R0-4. A ADR-002 precisa de emenda?

**Decisão**: sim, e é uma task desta feature — não uma nota de rodapé.

**Justificativa**: a ADR-002 §"cobertura" já prevê cobertura parcial
declarada na interface, então esta feature **opera dentro** dela. Mas a
ADR foi escrita imaginando "parte do catálogo não coube"; aqui a cobertura
parcial vira o **estado normal de operação**, não a exceção. Deixar isso
implícito faria a próxima sessão ler a ADR-002 e entender o oposto do que
o aplicativo faz. A emenda entra como nota `**Atualização (feature
010):**`, sem reescrever a decisão original.
