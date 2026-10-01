# Research: Live TV no DS V14 (feature 024)

## R1 — O campo `num` de `get_live_streams` serve como número do canal?

**Pergunta**: o painel Xtream devolve, em cada canal de `get_live_streams`,
um campo `num`. Se ele for a posição **global** do canal na ordem do painel,
e continuar o mesmo quando a resposta é filtrada por `category_id` (que é
como a feature 010 lê os canais, uma categoria por vez), ele resolve o
número do canal para provedor sem precisar saber quantos canais têm as
categorias anteriores.

**Por que importa**: para provedor sob demanda, a numeração derivada
(`logic/numero-do-canal.md` §2) só existe quando todas as categorias
anteriores já foram lidas. Sem `num`, a maior parte dos canais de uma fonte
Xtream fica sem número até a pessoa percorrer as categorias.

**Estado**: **refutado** (verificado em 2026-09-27, T001 do `sdd-execute`).
A única fonte já importada no navegador de desenvolvimento era uma fixture
M3U de debug (`stored`, sem provedor por trás — apontava pra um mock local
fora do ar), então a verificação não podia ser feita por ela. O usuário
apontou a credencial de teste real do repositório (`.env`/`.env.example` na
raiz, chaves `CCPLAY_PROBE_*` — nunca `docs/m3u/dados.md`, que não foi
lido). Um script isolado (fora do repositório, no scratchpad da sessão) leu
o `.env`, chamou `get_live_streams` sem filtro e filtrado por duas
categorias que não são a primeira, e comparou por `stream_id` — sem nunca
imprimir DNS/usuário/senha em lugar nenhum, só a comparação numérica.

Resultado: `num` **não é global**. Na resposta sem filtro (2266 canais),
`num` é único e sequencial 1..2266 — ou seja, é só a posição *daquela*
resposta. Filtrando por categoria: a 2ª categoria testada teve 122 canais,
dos quais só 5 bateram com o `num` da resposta sem filtro (117
divergiram); a 3ª categoria teve 79 canais, 0 bateram. `num` é recalculado
por resposta (recomeça a contar dentro do filtro), como o risco original já
antecipava.

**Decisão**: `sourceNumber`/`raw.num` **não é capturado**. O provedor usa só
a regra derivada (`logic/numero-do-canal.md` §2–§3, contagens conhecidas por
categoria). R-001 do `plan.md` fechado com este resultado — não precisa
reabrir sem uma mudança real no protocolo do provedor.

**Alternativas consideradas**: somar contagens só quando conhecidas (é o
fallback); esconder o número do Xtream até o item 25 (rejeitado pelo
usuário); pedir `get_live_streams` inteiro na importação para contar
(rejeitado — desfaz a feature 010, cuja medição mostrou resposta 98,5%
maior).

## R2 — Logo do canal: mesmo tratamento das capas

**Decisão**: reaproveitar `normalizeIconUrl` (feature 015) para `tvg-logo`
de canal e para `stream_icon` de `get_live_streams`. O campo gravado é o
mesmo `iconUrl` de `CatalogRecord`, sem índice e sem bump de versão do
Dexie. A exibição usa `PosterArt` numa variante de logo, com fallback de
iniciais em vez do rótulo "pôster".

**Justificativa**: é o mesmo dado (imagem declarada pela fonte), com os
mesmos riscos (URL inválida, lenta, que falha) já resolvidos pela 015; a
exclusão de canal na 015 era de escopo, não técnica.

**Alternativas**: componente de logo novo, sem `PosterArt` — rejeitado,
duplicaria a lógica de fallback que a 022 (D-007) decidiu centralizar.
