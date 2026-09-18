# Research: Live TV com catálogo real e reprodução AVPlay

**Slug**: `003-live-tv-avplay` | **Fase 0** | **Data**: 2026-09-16

Incertezas técnicas genuínas desta feature. Decisões aqui alimentam as
`Decisões Invariantes` do `plan.md`. Nada nesta página foi verificado na TV —
a porta V1 da ADR-006 é justamente o que esta feature vai executar.

---

## R0-1. Alvo de build para o engine da TV

**Decisão**: tornar `build.target` e `build.cssTarget` explícitos em
`tv-web/vite.config.ts`, mirando o engine de referência da ADR-006
(Tizen 8.0 / Chromium 108), antes de empacotar para a TV.

**Justificativa**: o `vite.config.ts` atual não define nenhum dos dois, então
vale o padrão do Vite — que mira navegadores modernos e pode emitir sintaxe
que o Chromium 108 não entende. A ADR-006 §2 já exige isso em texto:
"`build.target` e `build.cssTarget` devem ser explícitos; transpilar sintaxe
não adiciona automaticamente APIs ausentes". Até agora nenhuma feature
precisou rodar código real na TV, então a lacuna não doeu. Esta precisa.

Um erro de sintaxe no bundle se manifesta como tela preta, que é
indistinguível de "o AVPlay não funcionou" — exatamente o resultado que esta
feature existe para medir. Resolver antes protege a validade do teste.

**Alternativas consideradas**:

- *Deixar como está e ver se roda*: rejeitada porque contamina o resultado da
  porta V1. Se falhar, não saberemos se o problema é o player ou o bundle.
- *Transpilar para um alvo bem mais antigo (ex.: ES2015)*: rejeitada por
  inflar o bundle sem necessidade comprovada; o alvo declarado da ADR é
  Chromium 108, não "qualquer TV".

**Pendência**: a versão exata do Vite instalada (8.x) pode nomear os alvos de
forma diferente do que a ADR assumiu. Confirmar o valor aceito na
documentação da versão real antes de fixar.

---

## R0-2. Como o AVPlay desenha o vídeo

**Decisão**: tratar o AVPlay como um **plano de vídeo de hardware que fica
atrás da camada web**, não como um elemento do DOM. A região onde o vídeo
aparece precisa ser declarada por coordenadas (`setDisplayRect`) no espaço
1920×1080 do aplicativo, e a área correspondente da página precisa ser
transparente para o vídeo ser visto.

**Justificativa**: é a diferença conceitual mais cara entre o adaptador
`<video>` de desenvolvimento e o adaptador AVPlay. Um `<video>` é um nó que
respeita layout CSS, empilhamento e `overflow`. O AVPlay não — ele não é
posicionado por CSS, e um fundo opaco na página o esconde por completo,
produzindo áudio sem imagem. Modelar isso no contrato do `PlayerService`
desde o início evita descobrir na TV que a abstração vazou.

Consequência de design: o `PlayerService` precisa expor algo como "ocupe esta
região" e o adaptador `<video>` simplesmente ignora/aproxima, enquanto o
adaptador AVPlay traduz para coordenadas.

**Alternativas consideradas**:

- *Assumir que o AVPlay se comporta como `<video>` e ajustar depois*:
  rejeitada porque a correção depois obrigaria a mudar a interface do
  `PlayerService`, que é justamente o artefato que esta feature entrega para
  as próximas.

**Pendência (a confirmar na TV / na referência oficial)**: os nomes exatos e
a assinatura dos métodos (`open`, `setListener`, `setDisplayRect`,
`prepareAsync`, `play`, `stop`, `close`), quais estados aceitam cada chamada,
e como a transparência é obtida no pacote Tizen. **Não assumir como
verificado** — a spec aceita que a feature termine registrando
incompatibilidade como evidência.

---

## R0-3. Máquina de estados e o caminho de erro

**Decisão**: o `PlayerService` expõe uma máquina de estados própria e
pequena — `idle` → `preparing` → `buffering` → `playing` → `error`/`closed` —
e **não** vaza os estados nativos do motor (`NONE`/`IDLE`/`READY`/`PLAYING`/
`PAUSED`) para as telas. Erros chegam por callback, nunca por exceção
síncrona de uma chamada de comando.

**Justificativa**: a ADR-006 §4.1 e o guia Samsung 12 §1 alertam que
operações do AVPlay têm estados permitidos e respostas assíncronas —
`prepareAsync` sinaliza sucesso **antes** da reprodução começar. Uma tela que
leia o estado nativo acabaria reimplementando essa tradução em cada lugar. Os
cinco estados acima são os que a spec exige distinguir (FR-007) e bastam para
esta fatia.

A regra "carregando não encobre falha" (constitution, Progresso e Capacidades
São Reais) exige que `buffering` e `error` sejam estados distintos, nunca um
spinner eterno.

**Alternativas consideradas**:

- *Expor o estado nativo e deixar a tela interpretar*: rejeitada por espalhar
  conhecimento do motor pelas telas, contrariando a ADR-001 §2.
- *Já modelar o contrato completo de capacidades por motor* (item 5 do
  backlog): rejeitada por escopo — esta fatia não tem controles, então não há
  botão para habilitar/desabilitar por capacidade ainda.

---

## R0-4. Onde a TV obtém a URL de reprodução

**Decisão**: um endpoint dedicado por item de catálogo, consultado **no
momento do play** — não um campo novo em `CatalogItemOut`. Contrato em
`contracts/playback-api.md`.

**Justificativa**: a ADR-004 §7 é explícita nos dois sentidos. Proíbe
devolver URL/credencial "em respostas comuns do catálogo", e permite que
"Direct Play ... exija fornecer à TV informações de reprodução sensíveis em
tempo de execução". Um endpoint separado satisfaz as duas metades: a listagem
segue sem segredo, e a TV recebe o necessário só quando vai usar.

Efeito colateral desejável: a listagem pode ser cacheada com folga no futuro
(item 4 do backlog) sem arrastar credencial junto.

**Alternativas consideradas**:

- *Acrescentar `playback_url` ao `CatalogItemOut`*: rejeitada — colocaria a
  credencial em toda listagem de catálogo, violando a ADR-004 §7 diretamente,
  e a espalharia pelo cache do TanStack Query.
- *Backend fazer proxy do stream*: rejeitada por contrariar Direct Play
  (ADR-001 §2 e constitution, Restrições do Projeto). Mudar isso exigiria ADR
  nova.

---

## R0-5. Player como camada, não como tela do roteador

**Decisão**: a reprodução em tela cheia é uma **camada sobreposta dentro da
tela de Live TV**, não um novo caso no `switch` de `App.tsx`.

**Justificativa**: o `App.tsx` guarda histórico de telas (`NavState.history`)
mas **não** guarda estado de foco. Se o player fosse uma tela, a `LiveScreen`
desmontaria, perdendo `groupIdx`/`channelIdx`, e o FR-009 (restaurar o foco
no canal de origem) exigiria carregar estado de foco no histórico de
navegação — mudança estrutural que pertence ao item 15 do backlog, não a esta
fatia.

Como camada, o estado da lista simplesmente sobrevive porque nada desmonta. E
o comportamento fica alinhado com o princípio "RETURN fecha primeiro a camada
aberta" (constitution; guia Samsung 03), com precedente no repositório: o
`ConfirmDialog` já usa `useRemoteNav({ modal: true })` para interceptar a
tecla antes da tela de baixo.

**Alternativas consideradas**:

- *Player como tela do roteador*: rejeitada pelo custo de foco acima.
- *Guardar foco no `NavState`*: rejeitada como prematura — resolve um problema
  que esta fatia não tem, e o desenho certo disso é o gerenciador central de
  escopos do item 15.

---

## R0-6. Teto temporário de canais por grupo

**Decisão**: teto aplicado **no cliente**, ao montar a lista de um grupo, com
o valor numa constante nomeada e um aviso visível quando cortar. Valor
inicial proposto: 500.

**Justificativa**: o teto é uma salvaguarda de renderização (evitar milhares
de nós no DOM sem virtualização), não uma regra de negócio nem uma
característica da API. Mantê-lo no cliente significa que ele desaparece com
uma linha quando a virtualização (item 7 do backlog) entrar, sem precisar
mexer no backend nem versionar contrato.

500 é um chute deliberado: grande o bastante para um grupo real típico caber
inteiro, pequeno o bastante para não travar o engine da TV. É para ser
ajustado com medição, não defendido.

**Alternativas consideradas**:

- *Paginar no backend*: rejeitada por criar contrato de paginação que seria
  descartado assim que a virtualização chegasse. (O `CatalogItemListResponse`
  já tem um campo `next_cursor` que hoje é sempre `null` — paginação de
  verdade é decisão do item 7, não desta fatia.)
- *Sem teto*: rejeitada pelo risco de um grupo gigante travar a TV e mascarar
  a causa real de uma falha, justamente no teste que esta feature existe para
  fazer.
