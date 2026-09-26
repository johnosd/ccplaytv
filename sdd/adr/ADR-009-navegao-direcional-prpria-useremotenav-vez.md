# ADR-009: Navegação direcional própria (`useRemoteNav`) em vez de Norigin Spatial Navigation

## Status

Aceita

**Nota**: esta ADR é **retroativa** — documenta uma decisão que já estava
em vigor na prática, achada e formalizada durante o replanejamento da
feature `009-virtualizacao-foco` em 23/09/2026. Ver ADR-006 §"Foco
direcional" para a recomendação original que esta decisão substitui.

## Data

2026-09-23

## Contexto

A ADR-006 (17/09/2026) recomendou Norigin Spatial Navigation + TanStack
Virtual como base de toda navegação por controle remoto (§"Foco
direcional", Incremento A: "grade com Norigin + Virtual").

Na prática, ao longo das features 002 a 010, toda tela real do aplicativo
(`LiveScreen`, `MoviesScreen`, `SeriesScreen`, `ListHomeScreen`,
`ImportProgressScreen`, `AddSourceScreen`, entre outras) foi construída
sobre um hook próprio, `useRemoteNav` (`tv-web/src/lib/useRemoteNav.ts`),
nunca sobre Norigin. A biblioteca nunca chegou a ser instalada: não consta
em nenhuma versão de `tv-web/package.json`, e uma busca por "norigin" em
todo `tv-web/src` só encontra um comentário residual dentro de um helper
(`virtualFocusHelper.ts`) construído durante a primeira tentativa da
feature 009 — helper esse descartado por ter sido desenhado para o modelo
de foco de Norigin (foco por chave de DOM), que este projeto não usa.

Essa divergência nunca foi formalmente registrada. Foi descoberta ao
replanejar a feature `009-virtualizacao-foco`: o plano original (22/09)
desenhava a integração de virtualização "sincronizada com o measure cycle
do Norigin", e a exploração do código real revelou que não havia Norigin
nenhum para sincronizar — o trabalho da Fase 2 daquela rodada (o helper
citado acima) foi construído sobre uma premissa que nunca existiu neste
repositório, e teve que ser descartado.

Documentação desatualizada sobre uma decisão de arquitetura contamina
sessões futuras (constitution, "Documentação do Repositório É Canônica")
— é exatamente o que aconteceu aqui: uma ADR aceita recomendando uma
biblioteca nunca adotada levou a uma rodada inteira de planejamento e
implementação desperdiçada.

## Decisão

Formalizar `useRemoteNav` como a engine de navegação direcional deste
projeto, substituindo a recomendação de Norigin Spatial Navigation de
ADR-006 §"Foco direcional". O modelo, já em uso e testado em todas as
telas reais:

- **Foco é estado React, nunca `.focus()` de DOM nem uma API de gerência
  de "focus key" de biblioteca externa.** Cada tela guarda o item
  logicamente focado no seu próprio estado (ex.: `focusedIdentity`,
  `focusedMovieId`).
- **Cada tela decide sua própria semântica de "próximo item"** a partir de
  duas funções puras e testáveis, `clamp` e `gridNextIndex`
  (`tv-web/src/lib/useRemoteNav.ts`) — sem uma engine genérica de foco 2D
  a configurar.
- **O item focado é comunicado visualmente por uma classe CSS**
  (`tv-focus`, receita única definida em ADR-007 — contorno, offset, glow,
  `scale(1.06)`), nunca por foco real de DOM. Mover o estado já é
  suficiente para o React re-renderizar com a classe no lugar certo.
- **Reconciliação de identidade** (voltar de um detalhe, revalidação de
  categoria) usa um padrão próprio de "localizar por id"
  (`FocusIdentity`/`locate()`, usado em `LiveScreen`/`MoviesScreen`/
  `SeriesScreen`) — sem depender de nenhuma API de biblioteca externa para
  isso.
- **Teclas são capturadas por um listener de `keydown` no `document`**
  (`useRemoteNav`), com tratamento explícito do `keyCode` 10009 (RETURN da
  Samsung, fora do padrão DOM) e um modo `modal` que intercepta na fase de
  captura para diálogos precisarem tratar a tecla antes da tela por trás.

`@tanstack/react-virtual` **continua** a escolha para virtualização de
listas/grades (essa parte de ADR-006 não muda) — a feature
`009-virtualizacao-foco` a adota, integrada a este modelo de foco (ver
`sdd/specs/009-virtualizacao-foco/plan.md` D-001 e
`logic/virtualizacao-foco.md`).

## Alternativas Consideradas

### Adotar Norigin agora, migrando as telas existentes

- Reescrever a navegação das 5+ telas já em produção para o modelo de
  Norigin (foco por `focusKey`/DOM), alinhando o código à recomendação
  original de ADR-006.
- **Rejeitada:** a navegação atual já foi validada na TV física desde
  17/09/2026 (feature 003, porta V1 da ADR-006) e está coberta por dezenas
  de testes automatizados. Migrar exigiria reescrever tudo isso só para
  conformar com uma recomendação de biblioteca que nunca chegou a ser
  prototipada — risco alto (retrabalho em código que funciona), benefício
  não comprovado (nenhuma limitação real do modelo atual foi identificada
  que Norigin resolveria).

### Deixar ADR-006 como está, sem emendar

- Não formalizar a divergência — tratar como um detalhe de implementação
  sem importância.
- **Rejeitada:** foi exatamente essa lacuna que causou o replanejamento
  perdido da feature 009 — um plano inteiro desenhado contra uma
  dependência inexistente, achado só quando alguém tentou implementar em
  cima dele. Deixar como está garantiria que a próxima feature a tocar
  foco/navegação cometesse o mesmo erro.

## Consequências

### Positivas

- Zero dependência externa para navegação — sem superfície de risco de
  licença, manutenção ou breaking change de uma biblioteca de terceiros.
- Modelo já testado extensivamente: `useRemoteNav`, `FocusIdentity`/
  `locate()` e a receita de foco de ADR-007 têm cobertura de teste em
  todas as telas que os usam hoje.
- Mais simples de integrar com `@tanstack/react-virtual` (feature 009):
  como o foco não depende de um nó de DOM existir para ser "focado", a
  sincronização entre índice focado e janela virtualizada é um único
  `useEffect` reagindo a mudança de índice — não precisa esperar um
  *measure cycle* de engine externa (ver `logic/virtualizacao-foco.md` da
  feature 009).

### Negativas

- Toda funcionalidade de navegação (roving focus 2D, grades, colunas
  independentes, modais, hand-off entre painéis) precisa ser implementada
  e mantida por este projeto — sem se beneficiar de correções, testes ou
  funcionalidades de uma biblioteca mantida por terceiros.
- Padrões de foco 2D mais elaborados (ex.: "conservar a coluna preferida"
  ao mover entre linhas incompletas de uma grade, mencionado no item 6 do
  backlog) precisam ser resolvidos aqui, do zero, em vez de importados
  prontos de uma biblioteca especializada.

### Caminho de Migração / Evolução Futura

Revisitar esta decisão se uma necessidade de navegação genuinamente
complexa se mostrar difícil de expressar com o modelo atual — por exemplo,
várias grades independentes navegáveis na mesma tela, ou navegação livre
2D sem estrutura fixa de colunas. Nesse ponto, avaliar Norigin (ou outra
biblioteca) como um **adicional** ao lado de `useRemoteNav` para aquele
caso específico, não como substituição integral: o custo de migrar as
telas já testadas continuaria alto, e o retorno só se justificaria pelo
ganho na tela nova.

**Atualização (feature `013-favoritos`, 2026-09-24):**
`useRemoteNav` ganhou um segundo modo de OK, opt-in por tela — `onLongSelect`.
Quando uma tela passa esse handler, o pressionamento de OK vira um gesto
decidido por `keydown`+`keyup`+um limiar (`LONG_SELECT_MS`, 800ms): soltar
antes do limiar chama `onSelect` (agora no `keyup`, não mais no `keydown`
para essas telas); segurar além do limiar chama `onLongSelect` uma única
vez. Quando a tela não passa `onLongSelect`, nada muda — o OK continua
agindo no `keydown`, como sempre agiu (modo legado intacto). O algoritmo
tolera `keyup` perdido pela plataforma via um corte de "pressionamento
velho demais para ser auto-repetição" (`STALE_PRESS_MS`, 1000ms) e cancela
qualquer gesto em andamento em `blur`/`visibilitychange`. Detalhe completo
em `sdd/specs/013-favoritos/logic/gesto-ok-longo.md`. Continua verdade que
"foco é estado React" e "mover o foco não aciona nada" — o que mudou é só
quando o OK em si termina de ser processado, não o modelo de foco.

**Atualização (feature `013-favoritos`, pós-verificação em TV física,
2026-09-24):** `useRemoteNav` ganhou um terceiro handler opcional na mesma
linha de `onLongSelect` — `onFavoriteKey` (D-010) —, disparado direto no
`keydown` da tecla amarela do controle (`ColorF2Yellow`), sem limiar, só
com um debounce curto contra auto-repetição de hardware. Motivo: um
controle de teste usado na verificação física não entregou
pressionar/segurar/soltar do jeito que o navegador distingue, inviabilizando
o gesto de segurar nele — a tecla amarela é um segundo caminho independente
para a mesma ação de favoritar, nunca uma substituta. Mesmo padrão de
`onLongSelect`: opt-in por tela, nenhuma tela muda de comportamento sem
passar o handler.

**Atualização (feature `017-busca-local-catalogo`, 2026-09-25):**
`useRemoteNav` ganhou uma guarda de alvo editável (D-005 do plano daquela
feature), incondicional — não é mais um handler opt-in como os três
anteriores. `handleKeyDown`/`handleKeyUp` agora verificam primeiro se
`event.target` é um campo editável (`<input>`/`<textarea>`/
`contentEditable`, `isEditableTarget()`); se for, e a tecla estiver em
`EDITABLE_PASSTHROUGH_KEYS` (Backspace, espaço, Enter, ←, →), o hook
retorna imediatamente sem chamar nenhum handler nem `preventDefault` —
deixa o campo de texto nativo (teclado do sistema da TV) se comportar
normalmente. RETURN e ↑/↓ nunca entram nesse conjunto: continuam sempre
chegando à tela, mesmo com um campo focado, porque "foco é estado React"
(este ADR) precisa continuar valendo — sem essa exceção, o campo de busca
capturaria a navegação inteira da tela enquanto tivesse foco DOM real (a
primeira exceção deliberada ao "nunca `.focus()` de DOM" deste ADR: o campo
de busca é o único elemento do projeto com foco DOM real, porque só o
teclado do sistema da TV sabe escrever nele). Detalhe completo em
`sdd/specs/017-busca-local-catalogo/logic/busca-local.md` §3.
