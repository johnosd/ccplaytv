# Assessment Decision: Gravação da carga por seção mais rápida na TV

- **Slug**: gravacao-carga-secao-tv
- **Decidido**: 2026-10-19
- **Problem**: ./problem.md
- **Veredito**: go

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | O usuário percebe a demora, e a carga da seção leva 21–33 s na TV. |
| Força da evidência | strong | Tempo dividido na TV com as funções reais, em 4 medições: o orçamento é 48–61 % da carga; a soma das etapas acompanha a carga real. |
| Valor vs. custo de inação | strong | Tirar o grosso do orçamento derruba ~11–18 s da seção de filmes, e o mesmo vale para séries e canais. Sem isso, o custo cresce com categorias e listas. |
| Viabilidade / apetite | adequate | A mudança fica no `makeRoomFor`/`catalogLedger` e na área de preparo, com testes da 082 e da 039. O risco é a garantia de teto com gravações concorrentes, que precisa de regra no spec. |
| Fit estratégico | strong | É a experiência de abrir uma lista grande, o caso central do app, e segue a 082/038/039. |

## Abordagens Candidatas

### A. Livro-razão por carga, atualizado pelo delta (+ preparo enxuto)

- A carga por seção calcula o livro-razão uma vez e, a cada categoria, só soma ou subtrai os bytes dela. `makeRoomFor`
  continua sendo chamado (regra da 082), mas com o estado em mãos. Uma gravação concorrente (versão do livro-razão, ou
  o mesmo portão de gravação) força recalcular.
- Preparo: não usar a área de preparo quando a seção cabe com folga na memória do Worker, e limpar o preparo de uma vez
  no fim em vez de categoria por categoria.
- **Recomendada**: sim. Ataca 48–61 % do tempo com mudança localizada e mantém a regra.

### B. Um orçamento só para a seção inteira

- Antes de gravar, `makeRoomFor` com a soma estimada das 35 categorias, uma única vez.
- **Recomendada**: não sozinha. Exige estimar os bytes antes de comprimir, e uma recusa no meio fica pior de tratar.
  Pode complementar A.

### C. Livro-razão mantido em memória por todo o app

- Cache global invalidado por cada gravador.
- **Recomendada**: não. Espalha o risco de defasagem por todos os gravadores (catálogo, guia, metadados).

## Veredito

`go`: problema validado pelo usuário e por medição forte na TV, com a causa localizada no código. Todos os critérios
centrais estão em `adequate` ou acima.

### Se go — Handoff

- **Problema**: na TV, a carga da seção de filmes da lista real (43 510 itens, 35 categorias) leva 21–33 s. O orçamento
  da 082 (`makeRoomFor` → `catalogLedger` + `releaseCandidates`), refeito a cada categoria, custa 10,7–18,0 s. A área de
  preparo custa 2,7–5,0 s. Evidência: `./evidencias/etapas-gravacao-tv-2026-10-19.md`.
- **Abordagem recomendada**: A, livro-razão uma vez por carga, atualizado pelo delta, com regra para gravação
  concorrente, e preparo enxuto.
- **Escopo** (decisão do usuário: orçamento + preparo): entram `storageBudget.ts`/`storageLedger.ts` no caminho da carga
  por seção e a área de preparo em `sectionLoader.ts`/`repository/staging.ts`. Ficam de fora a compressão e o formato da
  082, a leitura de rede, o portão `waitUntilAllowed`, a ordem da pré-carga e o caso `unchanged`.
- **Métricas de sucesso** (meta do usuário): carga real da seção de filmes **≤ 10 s na TV** e orçamento ≤ 1 s no total,
  em ≥ 2 medições com a sonda `etapasSecao`. Teto da 082 respeitado com uma gravação concorrente. Os mesmos itens
  gravados.
- **Perguntas em aberto para o `sdd-specify`**:
  - Como detectar a gravação concorrente que invalida o livro-razão da carga (versão, contador ou portão)?
  - Abaixo de quantos itens a seção dispensa o preparo, considerando o pico de memória do Worker (FR-013 da 039)?
  - Vale aplicar o mesmo ao carregador por categoria (`categoryLoader`) e à importação M3U, que também chamam
    `makeRoomFor` por categoria?
  - A variação entre rodadas (22 → 33 s) merece investigação própria (IndexedDB da TV depois de uma carga grande
    apagada)?
