# Assessment Decision: Rádio global por país

- **Slug**: radio-global-por-pais
- **Decidido**: 2026-10-15 (2ª passada; a 1ª, no mesmo dia, deu `needs-clarification`, veja "Histórico")
- **Problem**: ./problem.md
- **Veredito**: go

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | adequate | "Ouvir rádio na TV sem trocar de app" é um uso real e claro. Nenhum usuário externo confirmou que sente falta disso. |
| Força da evidência | adequate | **Técnica: forte.** CORS `*` verificado com `Origin: null`; `/json/countries` com ~230 países e contagens; spike na TV física com **10/10 estações BR tocando com som** (explora.md). A API diz "You may use it in free and non free software". **Demanda: fraca e reconhecida.** Só o interesse do dono do produto, que a aceitou explicitamente como aposta de produto em 2026-10-15. A nota fica em `adequate` porque essa aposta foi declarada, não porque a demanda tenha sido comprovada. |
| Valor vs. custo de inação | adequate | O custo de inação é baixo. O valor é uma aposta declarada do dono do produto (diferencial e uso da TV como rádio), sem medição possível hoje (o app não tem analytics). Aceito conscientemente; não é evidência de mercado. |
| Viabilidade / apetite | adequate | O bloqueio da 1ª passada caiu: o AVPlay toca as estações reais (10/10) e a API responde da TV. Esforço médio aceito pelo dono do produto: caminho de reprodução fora do catálogo, tela nova, tela "tocando agora", favoritos em tabela própria, i18n pt/en/es, foco e E2E, ADR. Restam riscos menores e não bloqueantes: codecs fora do topo (Opus/Vorbis), outros países, tempo até o áudio e rede ruim. Ficam como critério do spec e da passada `tizen-tv`. |
| Fit estratégico | adequate | Encaixa no client-first (ADR-008), sem segredo e sem backend. Exige dois registros antes ou junto do specify: (1) **item novo na topbar**, emendando a ADR-011, aceito pelo dono; (2) **primeiro diretório de conteúdo de terceiro**, com ADR novo. |

## Abordagens Candidatas

### A. Tela "Rádio" própria com sessão de player direta

- Conector `lib/radio/` para o Radio Browser, no padrão do `tmdbConnector.ts`: ponto único de rede, erro de categoria fixa, sem log de URL. Cobre descoberta de espelho com ordem aleatória e nova tentativa, países com contagem, estações por país (`hidebroken`, `clickcount`) e o POST `/json/url` a cada clique. Tela com trilha de países e grade virtualizada de estações. Reprodução por `createPlayerSession` com tela "tocando agora", sem o chrome de vídeo. Favoritos em tabela própria com chave `radio-browser:<stationuuid>`. Cache em IndexedDB de países e da última lista por país (ADR-002).
- **Recomendada**: sim. Não polui o catálogo nem a regra de lista ativa única. O player continua sem saber a origem da URL, e o spike provou exatamente esse caminho (AVPlay direto com a URL do diretório).

### B. Estações como pseudo-fonte no catálogo

- Gravar as estações como uma "lista" sintética e reaproveitar Live TV e `PlayerLayer` inteiros.
- **Recomendada**: não. Briga com a lista ativa única (ADR-011 §3), com contagens/prefetch/parental e com o backup (ADR-017).

### C. Só as rádios da própria lista (`radio="true"`, feature 044)

- **Recomendada**: não como resposta ao pedido, porque não é "global por país". Fica como etapa futura.

## Veredito

**go.** O problema é válido e a evidência técnica é forte: CORS verificado e
10/10 na TV física, com som ouvido pelo usuário. O ponto `unknown` crítico da 1ª
passada foi resolvido. A demanda fraca não foi varrida para baixo do tapete: ela
continua fraca como evidência de mercado, e o `go` se apoia na **aposta de produto
declarada pelo dono** (2026-10-15), incluindo o esforço médio e a emenda da
topbar. Se a feature não for usada, não haverá dado para perceber, e esse risco
também foi aceito.

### Riscos aceitos pelo usuário

- **Demanda não comprovada / sem analytics**: aposta de produto do dono.
- **Termos de uso**: assumido como permitido. A API diz "You may use it in free and non free software", mas não nomeia uma licença de dados. Registrar no ADR.
- **Exigências da API**: "speaking http agent string" (o Chromium da TV pode não deixar definir `User-Agent`; não verificado); "Never use a direct link to a single new server"; `/json/url` a cada clique.
- **Serviço comunitário sem SLA**: espelhos somem; a UI precisa de estado de erro focável e de cache.

### Se go — Handoff

- **Problema**: quem usa o ccplayTv não consegue ouvir rádio pela TV sem trocar de app.
- **Abordagem recomendada**: A, com tela própria, conector Radio Browser direto da TV (como o Tuner do Open-Media-Explorer, sem dial nem frequência) e sessão de player direta com tela "tocando agora".
- **Escopo sugerido**:
  - Entra: com lista ativa, **item novo na topbar** "Rádio"; trilha com **todos os países** do diretório, ordenados por `stationcount`; **estações mais populares** e não quebradas do país; OK toca e RETURN para, com foco restaurado por id; estados carregando/vazio/erro focáveis; tela "tocando agora" com nome, país e favicon (sem dado inventado); **favoritos de estações** com chave `radio-browser:<stationuuid>`, nunca a URL; cache local de países/estações; i18n pt/en/es (nome de estação e país do diretório não são traduzidos, como o texto do provedor); entrada em `legibilidade-tv`.
  - Não entra: dial/frequência/"girar toca"; rádio sem lista ativa; segundo plano; rádios `radio="true"` da lista; busca por nome; filtros de gênero/idioma; histórico; ICY "tocando agora"; iptv-org; backend/proxy.
- **Métricas de sucesso**: ≥ 8/10 estações populares do BR com som na TV física (spike: 10/10, a repetir na feature real); fluxo país → estação → tocar → RETURN → outra estação só com D-pad, com foco restaurado por id.
- **Perguntas em aberto pro sdd-specify**:
  - Posição do item "Rádio" na topbar e o que mostrar enquanto toca (tela cheia "tocando agora" ou mini-barra na própria tela de rádio).
  - Filtrar codecs que o AVPlay não toca (Opus/Vorbis?) ou mostrar erro acionável por estação.
  - País inicial: o país da TV/idioma, o último usado ou o mais popular?
  - Quantas estações por país (paginar além do topo?) e o TTL do cache.
  - Favoritos de estação entram no backup de uso da ADR-017?
  - Comportamento ao abrir canal/filme com rádio tocando (AVPlay singleton: parar a rádio).
- **Antes ou junto do `sdd-specify`**: `sdd-adr` para o diretório de terceiro (host, dados enviados = só código de país e uuid, exigências da API, cache, risco de termos) e a emenda da topbar da ADR-011.

## Histórico

- **1ª passada (2026-10-15), `needs-clarification`**: viabilidade `unknown` (áudio no AVPlay nunca validado) e demanda/valor `weak`. Perguntas bloqueantes: (1) o AVPlay toca as estações? (2) o dono aceita como aposta de produto? Respostas no mesmo dia: (1) spike na TV física, 10/10 com som; (2) sim, aceito.
