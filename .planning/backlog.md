# Backlog

Painel único de ideias futuras e status de features/bugs geridas pelo
sistema sdd-*. Mantido automaticamente por update-feature-status.ps1 e
update-bug-status.ps1.

## Ideias Futuras

Derivado de `sdd/adr/REQUISITOS-FUNCIONAIS.md` (RF-001 a RF-019),
`sdd/adr/ESPECIFICACAO-TRAILERS.md`, `sdd/adr/ADR-001` a `ADR-006` e da
análise de `docs/iptvnator/`, em 2026-09-15. Sequenciado para chegar a um MVP
funcional (importar → navegar → assistir) antes de enriquecimento, IA e
controle remoto.

### MVP — fundação utilizável (importar, navegar, assistir)

1. **[Convergida: `sdd/specs/001-importacao-fonte-m3u`]** Importação de
   fonte M3U por URL e por credenciais de provedor (DNS/usuário/senha), com
   `ImportJob` acompanhável (etapas, contadores reais, catálogo parcial
   publicável antes do enriquecimento). A evolução do provedor deve usar
   conector Xtream JSON (`player_api.php`) separado do conector M3U, com URL
   normalizada, fallback de status da conta e formatos de reprodução derivados
   de `allowed_output_formats`; não tratar `get.php` como fonte canônica do
   catálogo. (RF-003, RF-005, RF-006; ADR-004 §2/3/5/6; ADR-006 Incremento B;
   `docs/iptvnator/03-apis.md` e `06-carga-listas-url-xtream.md`)
2. Cache local do catálogo na TV (IndexedDB/Dexie) — leitura imediata ao
   abrir, sem esperar timeout do backend; estado de conexão/configuração
   quando não há cache nem backend. (ADR-002; ADR-006 Incremento A)
3. `PlayerService` + AVPlay (Direct Play) — abstração de reprodução isolando
   telas do `webapis.avplay`, com adaptador `<video>` só para desenvolvimento.
   Formalizar o contrato em capacidades/estado/comandos e usar identidade
   lógica de reprodução independente da URL, para preservar retomada e
   preferências após refresh de credenciais ou streams. (ADR-001 §2;
   `docs/iptvnator/02-arquitetura.md`)
4. Canais por grupos da fonte — grid preservando grupos originais, seleção e
   início de reprodução. Foco deve apenas selecionar; Enter deve reproduzir,
   com estados explícitos vazio/preview/reproduzindo, hand-off entre grupo e
   canais e lista virtualizada. (RF-008; ADR-005 §3;
   `docs/iptvnator/07-tela-canais.md`)
5. Filmes por categorias — grid com capa/nome, detalhes, reprodução. Incluir
   fallback de artes, skeleton, empty states distintos, detalhe
   browse/watch e ação contextual Assistir/Retomar/Reiniciar. (RF-010;
   ADR-005 §3; `docs/iptvnator/08-tela-filmes.md`)
6. Séries por categorias com temporadas/episódios — um cartão por série
   identificada, sem duplicar episódio como série. (RF-009; ADR-005 §2/3)
7. Foco direcional e virtualização de grades — Norigin Spatial Navigation +
   TanStack Virtual, base de toda navegação por controle remoto. Manter
   matemática de grade pura e testável, identidade estável, tokens globais de
   seleção/foco e restauração de foco/posição ao voltar de detalhe ou player.
   (ADR-006 §3/4.1; `docs/iptvnator/01-ui-ux.md`)
8. Pesquisa nos três tipos — busca local, indicando cobertura parcial
   offline. (RF-012; ADR-005 §3)
9. Favoritos nos três tipos — persistência local, sobrevive a reimportação.
   (RF-013; ADR-005 §4)
10. Indicação de visualização anterior / histórico básico — "já assistido",
    progresso de filme/episódio, "em dia" de série. Consumir esse estado na
    Home com hero de "Continuar assistindo", rails horizontais separados para
    pôsteres e canais, foco que conduz o scroll e rails independentes.
    (RF-014; ADR-005 §4; `docs/iptvnator/09-dashboard-home.md`)

### Pós-MVP — mais fontes e qualidade de classificação

11. Adicionar fonte por arquivo `.m3u` (seleção/USB na TV; envio pareado por
    celular como conveniência). (RF-004; ADR-004 §4)
12. Múltiplas fontes simultâneas + atualização sem duplicar nem apagar
    favoritos/histórico. (RF-007; ADR-004 §6)
13. Seção "Não classificados" com regra de correção reaplicável sem perder
    preferências. (RF-011; ADR-005 §2)
14. Registrar "Gostei" em filmes, sinal distinto de favorito/histórico.
    (RF-015; ADR-005 §4)

### Pós-MVP — enriquecimento e IA

15. Consultar/ordenar filmes por nota IMDb (fonte/licença dos dados ainda
    pendente de decisão). (RF-016; ADR-005 §5)
16. Recomendações a partir de filmes curtidos (TMDB como candidatos, regras
    de cruzamento com o catálogo próprias do CCPlay). (RF-017; ADR-005 §6)
17. Trailers para filmes e séries — TMDB para descoberta, YouTube IFrame
    Player API via `TrailerService` separado do `PlayerService`.
    (RF-019; ESPECIFICACAO-TRAILERS.md; ADR-006 §4.8, Incremento C)

### Pós-MVP — controle remoto e voz

18. Voz via página web no celular (pressionar-para-falar, transcrição
    OpenAI, comando com expiração). (ADR-001 §4; ADR-006 §4.7, Incremento D)
19. Controle remoto por app Android (WebSocket autenticado, pareamento
    explícito na TV). (ADR-001 §5; ADR-006 Incremento D)

### Pós-MVP — operação e preparo comercial

20. Migração do backend de computador local para VPS (TLS, backup/restore,
    reconexão). (ADR-006 §4.4, Incremento E)
21. Fila/worker durável para importação, substituindo `BackgroundTasks`.
    (ADR-003 §4; ADR-006 §4.4)

### A avaliar (`sdd-assess`) — comparação com outro player IPTV de referência

Trazidas em 2026-09-14 a partir da descrição/lista de funcionalidades de um
player IPTV de referência colada pelo usuário na conversa — hipótese por
comparação, sem evidência própria de demanda ainda, por isso cada uma
precisa passar por `sdd-assess` (Explora/Define/Decide) antes de virar spec,
em vez de ir direto pro `sdd-specify`.

22. Suporte a portais Stalker/Ministra (STB) como fonte adicional, ao lado
    do conector Xtream Codes já previsto no item 1 — protocolo,
    autenticação e mapeamento de catálogo ainda não avaliados.
23. EPG/XMLTV — guia de programação (grade multi-canal + timeline "ao
    vivo") a partir de uma fonte XMLTV por URL, associado aos canais já
    importados.
24. TV Archive / Catch-up / Timeshift — reprodução de conteúdo passado da
    grade de EPG, condicionada ao provedor da fonte oferecer o recurso.
25. Seleção de canal por número (zapping numérico) na tela Ao Vivo.
26. Enriquecimento TMDB estendido além do já previsto (item 17: trailers) —
    elenco/equipe técnica, páginas de ator navegáveis, trilha "Similares" e
    rail de tendências (trending) num dashboard. Sobreposição parcial com o
    item 10 (dashboard de "continuar assistindo"): assessment deve decidir
    se viram uma tela só ou telas separadas.

### Refinamentos técnicos derivados da análise do IPTVnator

27. **Contrato de compatibilidade do parser M3U** — cobrir `radio`,
    separação de URL e headers no primeiro `|`, preservação de `#KODIPROP` e
    detecção de manifesto HLS antes da classificação, com testes de contrato
    contra amostras reais. (`docs/iptvnator/03-apis.md` #1–2)
28. **Resiliência e segurança das integrações** — garantir User-Agent VLC em
    todas as chamadas do provedor, SSRF validado a cada hop e limite de
    tamanho/redirecionamento, além de um helper único para redigir credenciais
    em logs e erros. Remover também credenciais reais de `docs/m3u/dados.md` e
    substituí-las por placeholders ou arquivo fora do controle de versão.
    (`docs/iptvnator/03-apis.md` #5, #15–16; `docs/iptvnator/00-resumo.md`)
29. **Worker durável de importação** — substituir `BackgroundTasks` por
    processo/fila separado, mantendo `ImportJob.id` como `operationId`,
    cancelamento cooperativo por lote e progresso observável sem bloquear as
    rotas interativas. Complementa o item 21.
    (`docs/iptvnator/02-arquitetura.md` #3/#5;
    `docs/iptvnator/06-carga-listas-url-xtream.md` #11)
30. **Contrato de reconciliação após resync** — reaplicar favoritos e
    histórico por chave estável, com restore explícito antes de expor o
    snapshot novo, e preservar estratégia cache-first/DB-first. Complementa
    os itens 2, 9, 10 e 12. (`docs/iptvnator/02-arquitetura.md` #4;
    `docs/iptvnator/06-carga-listas-url-xtream.md` #6/#8/#12)
31. **Skills e mapa de validação por domínio** — criar skills curtos para
    player AVPlay, importação M3U e navegação D-pad, apontando para ADRs/docs
    canônicos, além de um mapa do menor comando de validação por área.
    (`docs/iptvnator/04-skills.md` #1–3)
32. **Documentação canônica por subsistema** — conforme cada área ganhar
    código, manter um documento de arquitetura para importer, player,
    navegação e cache offline, com racional, referências cruzadas e status
    honesto; docs escritos por LLM continuam sendo artefatos canônicos.
    (`docs/iptvnator/05-documentos.md` #1–3)

## Features

| Slug | Título | Status | Progresso | Última Atualização |
| --- | --- | --- | --- | --- |
| 001-importacao-fonte-m3u | Importação de Fonte M3U por URL e por Provedor | Convergida | 63/63 tasks | 2026-09-14 |
| 002-splash-home-perfis | Splash, ícone do app e Home de perfis/listas | Em Execução | 4/20 tasks | 2026-09-15 |

## Bugs

| Slug | Título | Fase Atual | Veredito/Status | Próximo Passo | Última Atualização |
| --- | --- | --- | --- | --- | --- |
