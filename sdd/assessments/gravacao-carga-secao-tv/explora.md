# Assessment Explora: Gravação da carga por seção mais rápida na TV

- **Slug**: gravacao-carga-secao-tv
- **Criado**: 2026-10-19
- **Origem**: ideia do backlog ("[Feature] Gravação da carga por seção mais rápida na TV", vinda do assessment
  `leitura-rede-fluxo-tv`)

## Ideia Bruta

A carga da seção de filmes da lista real leva ~21 s na TV, e só ~3,5 s é baixar e interpretar. A ideia é descobrir onde
estão os ~17 s restantes e atacar a etapa maior.

## Evidência a Favor

- **Sintoma percebido pelo usuário**: demora na carga da lista (contagens "carregando", categorias sem itens por um
  tempo). Resposta ao assessment `leitura-rede-fluxo-tv`, 2026-10-19.
- **Tempo dividido na TV com as funções reais** (`./evidencias/etapas-gravacao-tv-2026-10-19.md`, 4 medições):
  - o orçamento `makeRoomFor`, chamado uma vez por categoria (35×), custa **10,7–18,0 s**, 48–61 % da carga;
  - a área de preparo (descarregar, reler, limpar) custa 2,7–5,0 s;
  - comprimir custa ~3,3 s; ler e interpretar, 3,8–5,1 s;
  - a transação custa só ~0,65 s.
- **A causa está no código**: `makeRoomFor` (`lib/catalog/storageBudget.ts:112`) chama `catalogLedger`
  (`storageLedger.ts:48`), que relê a tabela `categories` inteira, `catalogReadManifests`, `sources` e as chaves de
  `categoryBlocks`, e faz contagens por fonte. Depois chama `releaseCandidates`. Tudo isso a cada categoria gravada,
  embora entre uma categoria e a seguinte da mesma carga só mude a categoria recém-gravada.
- **A estimativa do navegador não é o problema**: 35 chamadas de `navigator.storage.estimate()` custam 17–19 ms.
- **Precedente**: a regra da 082 ("todo gravador novo chama `makeRoomFor`") não exige que o livro-razão seja recalculado
  do zero em cada chamada.

## Evidência Contra

- **Pode mudar a garantia da 082**: o orçamento recalculado a cada categoria é o que impede o banco de passar do teto.
  Um livro-razão guardado de uma chamada para outra pode ficar defasado se outra gravação acontecer no meio (carga de
  categoria aberta pela pessoa, guia, outra lista). Esse risco precisa de regra explícita.
- **A primeira carga é o pior caso**: na renovação com os mesmos itens, `prepareBlockWrite` devolve `unchanged` e nem
  chama o orçamento. O ganho vale para lista nova, atualização com novidades e pré-carga de categorias nunca abertas.
- **A sonda não tem o portão `waitUntilAllowed`** nem outras gravações concorrentes. No app real, a carga pode demorar
  mais por esperar a pessoa navegar, e isso não é desperdício.
- **Variação entre rodadas** (22 → 33 s numa mesma instalação), sem causa conhecida.

## Perguntas em Aberto

- Calcular o livro-razão uma vez por carga e atualizar só o delta de cada categoria preserva o teto da 082 com
  gravações concorrentes?
- A área de preparo é necessária quando a seção cabe na memória do Worker? Ela existe para o caso de 300 mil filmes
  (feature 039, FR-013).
