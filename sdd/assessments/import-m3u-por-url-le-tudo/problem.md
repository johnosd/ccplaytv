# Assessment Problem: Import M3U por URL lê tudo, precisa virar estrutura-primeiro

- **Slug**: import-m3u-por-url-le-tudo
- **Criado**: 2026-09-24
- **Explora**: ./explora.md

## Problem Statement

Adicionar uma fonte por URL M3U (ou uma fonte de provedor que caiu no
fallback "Modo limitado", `legacy_m3u`) faz a importação classificar e
gravar em IndexedDB **todo item de todo canal/filme/série antes de
considerar a fonte pronta para uso** — ao contrário de uma fonte de
provedor no protocolo Xtream JSON, que desde a feature 010 grava só a
estrutura (categorias) e busca os itens de uma categoria só quando a
pessoa entra nela. Numa lista grande, isso faz a pessoa esperar olhando a
tela de progresso antes de poder navegar em qualquer coisa — o usuário
relatou uma espera longa em teste no navegador (duração exata não
medida) — mesmo que só queira abrir uma categoria pequena.

## Usuários / Partes Afetadas

- **Quem adiciona uma fonte por URL M3U com catálogo grande** — sente a
  espera diretamente: tela de progresso presa até o fim da gravação
  completa, sem poder navegar em nada entretanto.
- **Quem está no "Modo limitado" de provedor** (`legacy_m3u`, painel que
  não fala o protocolo Xtream JSON) — mesmo problema, mesmo caminho de
  código (`consumeM3u`), mesma espera.
- **Indiretamente, quem faz ressincronização de uma fonte já grande** —
  ASSUMPTION (não verificado no código de frescor para M3U): toda
  ressincronização (idade > 24h ou manual) repete a importação completa
  (geração nova, publicação atômica), então a espera se repetiria a cada
  resync.

## Goals

- A importação por URL M3U (e o fallback `legacy_m3u`) baixa o arquivo,
  **guarda-o no aparelho**, extrai dele **só a estrutura** — as
  categorias de canais, filmes e séries, na ordem em que apareceram — e
  conclui sem gravar item nenhum.
- Os itens de uma categoria são lidos **do arquivo guardado** (sem novo
  download) quando a pessoa entra nela, e ficam em cache a partir daí —
  do mesmo jeito que já funciona hoje para fonte de provedor
  (`categoryLoader.ts`, `fetchMode: 'on_demand'`).
- Os dois caminhos que reusam `consumeM3u` (`m3u_url` e `legacy_m3u`)
  recebem o mesmo comportamento — sem duas regras divergentes para o
  mesmo formato de arquivo.
- O tempo de importação passa a ser só download + varredura das
  categorias + uma gravação do arquivo — sem classificação completa nem
  gravação item a item. **Não** fica constante: descobrir as categorias
  de um M3U exige percorrer o arquivo inteiro (a categoria vem em cada
  entrada), então o tempo continua proporcional ao tamanho do arquivo.

## Non-Goals

- **Não** inventa um protocolo de rede por categoria para M3U — não
  existe no formato.
- **Não** promete importação em tempo constante — impossível para M3U
  (ver Goals).
- **Não** cobre a fonte local por arquivo `.m3u` do backlog (item 22,
  ainda não construída) — quando ela existir, herda o que for decidido
  aqui, mas não faz parte deste escopo porque ainda não existe fonte
  desse tipo no app.
- **Não** muda o comportamento de fonte de provedor no protocolo Xtream
  JSON — já está estrutura-primeiro desde a feature 010.
- **Não** resolve busca global nem uma tela de "Não classificados" — nenhuma
  das duas existe hoje (gaps já registrados no backlog, item 20); não é
  este ajuste que as adiciona.

## Success Metrics

- Numa fonte M3U grande (mesmo patamar já medido: 312.936 entradas,
  16 s na TV física, feature 005), a importação conclui em tempo
  **mensuravelmente menor** que o caminho integral atual, medido com a
  mesma lista antes e depois — nenhum registro de item gravado durante a
  importação.
- Entrar numa categoria não gera requisição de rede (lê do arquivo
  guardado); voltar a uma categoria já lida não relê o arquivo (cache).
- Entrar numa categoria ainda não obtida mostra os mesmos estados já
  contratados pela feature 010 para provedor (carregando; erro com
  "Tentar de novo" focável) — sem introduzir um terceiro comportamento
  para M3U.
- Nenhuma regressão nos testes automatizados hoje verdes que cobrem
  `consumeM3u`/`importPipeline.ts`/`m3uSeriesGrouping.ts` (o agrupamento de
  série sintética da feature 012 depende do parse do M3U e precisa
  continuar funcionando, mesmo que o parse deixe de gravar tudo de uma vez).

## Cost of Inaction

Toda fonte M3U grande continua obrigando a pessoa a esperar com a tela de
progresso presa antes de poder navegar em qualquer categoria — inclusive
numa categoria pequena que ela queria abrir primeiro. E o app mantém duas
garantias diferentes para o mesmo problema: fonte de provedor no
protocolo Xtream JSON já é estrutura-primeiro (feature 010), fonte M3U
não. Não há dado sobre qual dos dois caminhos é mais usado nas fontes
reais — o único cenário M3U da verificação na TV física (010, cenário G)
nem foi rodado por falta de fonte disponível.
