# Backlog

Painel único de ideias futuras e status de features/bugs geridas pelo
sistema sdd-*. Mantido automaticamente por update-feature-status.ps1 e
update-bug-status.ps1.

## Ideias Futuras

**Só o que falta**, na ordem de execução sugerida (revisada em 02/10/2026,
mantida a prioridade do usuário: player completo e valor direto ao usuário
antes de lançamento). O que foi entregue está na tabela `## Features`; só os retirados ficam no fim da seção.

ID é identificador estável, não ordem: `comingSoon.ts` (campo `backlogItem`)
e `.planning/migracao-design-system-v14.md` apontam para ele. Nunca renumerar;
item novo recebe o próximo número livre (**hoje: 67**); fatias usam letra
(`55a`, `62b`). Todo item assume o dado no aparelho (ADR-008): chamadas externas
só a APIs de terceiro com a chave do próprio usuário (BYOK); `api/` é contorno
congelado. Quem entrega um item apaga o mock correspondente de `comingSoon.ts`
na mesma feature (hoje restam **15**). Dexie hoje é **v15**; a próxima livre é
**v16** (reservar na spec). Itens de categoria vivem em blocos: ler/gravar só
por `catalogRepository.ts`, nunca `db.channels`.

Estados: `Pronto` (vai para `sdd-specify`), `Bloqueado` (dependência dura
aberta), `A avaliar` (precisa de `sdd-assess`), `Verificação` (só hardware ou
medição), `Bugfix` (segue em `## Bugs`).


### Valor direto ao usuário

- **27** — **"Gostei" em filmes e séries**: sinal explícito, distinto de favorito e de histórico, persistido por identidade lógica estável. Base do 30. Falta `sdd-plan` e `sdd-execute`.
  - Ordem: 4
  - Tipo: feature
  - Estado: Especificada — `043-gostei-filmes-series`
  - Depende de: —
  - Remove mocks: —
  - Fonte: RF-015; ADR-005 §4
- **36** — **Dedup/single-flight de importação por fonte**: duas telas ou hooks não disparam o mesmo trabalho de importação. Já existe single-flight por categoria, série, EPG e metadados; falta só a importação inteira de uma fonte. Conferir antes se o FR-017 da 005 já basta (pode virar "Retirado").
  - Ordem: 5
  - Tipo: feature
  - Estado: Pronto
  - Depende de: —
  - Remove mocks: —
  - Fonte: `docs/iptvnator/06-carga-listas-url-xtream.md` #9
- **24** — **Reconciliação pós-resync ("pending restore")**: reaplicar favoritos, "gostei" e progresso por chave estável num passo pós-import, com o snapshot novo **bloqueado até terminar**; item não reconciliável fica indisponível com o estado anterior, nunca atribuído a outra obra por aproximação. Protege contra perda de dados do usuário.
  - Ordem: 6
  - Tipo: feature
  - Estado: Pronto
  - Depende de: 008 ✅, 013 ✅, 019 ✅; *36*; *27 (o "gostei" entra na reconciliação)*
  - Remove mocks: —
  - Fonte: ADR-005 §2/§4
- **25b** — **Repasse dos headers (`User-Agent`/`Referer`) ao AVPlay**: muitas listas só tocam assim. O parser (25a, `044`) já guarda os headers; falta o adapter AVPlay. Resta também `tvg-chno` (exibir exige emendar a ADR-011).
  - Ordem: 7
  - Tipo: feature
  - Estado: Pronto
  - Depende de: — (spike de header do AVPlay encerrado no 58)
  - Remove mocks: —
  - Fonte: RF-011; ADR-006 §4.3
- **26** — **Seção "Não classificados"**: itens sem tipo confiável ficam visíveis e acessíveis, com regra de correção reaplicável sem perder preferências. Sem desenho no DS: grade + `EmptyState` do Component Lab.
  - Ordem: 8
  - Tipo: feature
  - Estado: Pronto
  - Depende de: —
  - Remove mocks: —
  - Fonte: RF-011; ADR-005 §2
- **22a** — **Adicionar lista por arquivo `.m3u`** (Filesystem/USB, `tizen.filesystem`), validando extensão **e** conteúdo, mesmo `m3uParser.ts`.
  - Ordem: 9
  - Tipo: feature
  - Estado: Pronto
  - Depende de: privilégio de filesystem justificado (38)
  - Remove mocks: —
  - Fonte: RF-004; ADR-004 §4
- **66** — **Busca global por blocos em fluxo** (`039` FR-013 emendado): para listas enormes (~300 mil), varrer bloco a bloco e guardar só os resultados (teto por tipo), sem mudar ordem nem relevância. Medir antes com o cenário 3 de `e2e/catalogo-em-blocos.mjs`.
  - Ordem: 10
  - Tipo: feature
  - Estado: Pronto
  - Depende de: 039 ✅
  - Remove mocks: —
  - Fonte: `039` R-011/R-013


### Diferenciais de produto

- **30** — **Recomendações + Curadoria IA na Home**: sementes reais de "Gostei" e histórico, candidatos TMDB cruzados com o catálogo local (reusar `resolveTmdbTitles`), justificativa compatível com o método. Sem sinais, estado vazio orientativo, nunca justificativa inventada.
  - Ordem: 11
  - Tipo: feature
  - Estado: Bloqueado
  - Depende de: 27; 28 ✅; 45 ✅
  - Remove mocks: `home-ai-curation`
  - Fonte: RF-017; ADR-005 §6; V14 §23
- **32** — **Trailer no herói do Início** (o do detalhe foi entregue pela 033): botão "▶ Trailer" reusando a `TrailerLayer`, nunca tocando no foco. Candidato a `sdd-adhoc`.
  - Ordem: 12
  - Tipo: feature
  - Estado: Pronto
  - Depende de: 033 ✅
  - Remove mocks: `home-trailer`
  - Fonte: `033` R-010
- **56** — **Acessibilidade de sistema**: aparência de legenda (tamanho, cor, fundo, contorno, sincronização) com **prévia real**, respeitando as preferências de caption da TV se o Tizen expuser; alto contraste como variação de tokens; Voice Guide com anúncios configuráveis sobre a região `aria-live`.
  - Ordem: 13
  - Tipo: feature
  - Estado: Pronto
  - Depende de: 55a ✅; 55b ✅; 63 ✅
  - Remove mocks: `a11y-subtitles`, `a11y-high-contrast`, `a11y-voice-guide`
  - Fonte: V14 §31/§38/§39
- **31** — **"Descobrir com IA" (BYOK OpenAI)**: chat que só consulta o catálogo **real** por function-calling restrito, nunca sugere título fora dele; chamada direta com a chave da pessoa, configurada em Integrações & BYOK.
  - Ordem: 14
  - Tipo: feature
  - Estado: Pronto
  - Depende de: 032 ✅; *30*
  - Remove mocks: `dock-ai`
  - Fonte: ADR-001 §4; ADR-008 §4; V14 §23
- **23** — **Várias fontes com refresh isolado**: atualizar várias listas sem duplicar registros nem apagar favoritos/histórico, falha isolada e resultado por fonte (`atualizada`/`falhou`/`ignorada`) em Configurações › Fontes IPTV. Navegação continua uma lista por vez (ADR-011).
  - Ordem: 15
  - Tipo: feature
  - Estado: Bloqueado
  - Depende de: 46 ✅ (`034`), 24
  - Remove mocks: —
  - Fonte: RF-007; ADR-004 §6


### Qualidade e lançamento (depois da UI estável)

- **40** — **Conta de publicação e abrangência**: Public Seller publica só nos EUA; Brasil depende de Partner Seller. Confirmar antes de prometer data; kit de revisão com fonte de demonstração e credenciais de teste separadas. Pode começar a qualquer momento.
  - Ordem: 16
  - Tipo: lançamento
  - Estado: Pronto
  - Depende de: —
  - Remove mocks: —
  - Fonte: guias `/09` §2/§3, `/11`
- **35** — **Benchmark determinístico de importação**: fixtures de 1 000/10 000/100 000 entradas servidas localmente, medindo fetch/parse/classify/store e o parse de XMLTV, com aparelho e commit registrados. Base da 039: `e2e/catalogo-em-blocos.mjs` (cenário 3) e `e2e/catalogo-em-blocos-real.mjs`. Falta M3U/classificação e XMLTV.
  - Ordem: 17
  - Tipo: qualidade
  - Estado: Pronto
  - Depende de: —
  - Remove mocks: —
  - Fonte: ADR-006 §2; V14 §30
- **50** — **Suíte de aceite de UX e percurso de referência**: UX01–UX10 dos guias + checklist §46 do DS como conjunto executável, com fonte vazia, demonstrativa e volumosa, repetido com falha de rede; cada execução com responsável, aparelho, firmware e evidência.
  - Ordem: 18
  - Tipo: qualidade
  - Estado: Bloqueado
  - Depende de: itens de produto acima estáveis
  - Remove mocks: —
  - Fonte: V14 §34/§46; guias `/08`, `/13`
- **38** — **Pacote e checklist de lançamento Tizen**: `config.xml` e assinaturas revisados, Tizen ID preservado, versão crescente, `required_version` coerente, permissões proporcionais e justificadas (teclas de cor/mídia, filesystem do 22a), custódia do certificado. Bloqueadores: falha de instalação, perda de favoritos, áudio em segundo plano, credencial em log.
  - Ordem: 19
  - Tipo: lançamento
  - Estado: Bloqueado
  - Depende de: 22a (o 58 foi concluído)
  - Remove mocks: —
  - Fonte: guias `/10` §1–3
- **39** — **Materiais de loja e Application UI Description**: logo, fundo, ícone e 4 capturas nos tamanhos da Samsung, de uma versão executável com dados fictícios ou autorizados, sem credencial à vista.
  - Ordem: 20
  - Tipo: lançamento
  - Estado: Bloqueado
  - Depende de: UI estável (depois do 50)
  - Remove mocks: —
  - Fonte: guias `/02`, `/09` §1


### Habilitadores e processo (paralelos, sem urgência)

- **49a-2** — **Dividir `catalogRepository.ts` (~1 350 linhas)** por responsabilidade (categorias, blocos/leitura, estado do usuário, gerações/limpeza, preparo da carga) sem mudar comportamento nem API pública, provado pela suíte, pelas travas e pelos E2E. A fatia 49a-1 (player/live) foi entregue pela `040`.
  - Ordem: 21
  - Tipo: refatoração
  - Estado: Pronto
  - Depende de: —
  - Remove mocks: —
  - Fonte: `docs/iptvnator/02-arquitetura.md` #7
- **49b** — **Fronteiras de código e limite de tamanho por lint**: `features/` não importa de outro `features/`; `lib/` não importa UI; `lib/catalog/` → `lib/player/` unidirecional; ~300 linhas por arquivo.
  - Ordem: 22
  - Tipo: processo
  - Estado: Pronto
  - Depende de: 49a
  - Remove mocks: —
  - Fonte: `docs/iptvnator/02-arquitetura.md` #7
- **48** — **Documentação canônica por subsistema** em `docs/architecture/`: importador, player, navegação, armazenamento local. ADR registra decisão; o documento registra o estado resultante.
  - Ordem: 23
  - Tipo: processo
  - Estado: Pronto
  - Depende de: —
  - Remove mocks: —
  - Fonte: `docs/iptvnator/05-documentos.md`
- **47** — **Skills de domínio + mapa de validação por área** (player AVPlay, importador, navegação D-pad), cada um com "gatilho + leia primeiro + comando de validação". (Não confundir com a feature `047-player-dev-mpegts`.)
  - Ordem: 24
  - Tipo: processo
  - Estado: Pronto
  - Depende de: *48*
  - Remove mocks: —
  - Fonte: `docs/iptvnator/04-skills.md`
- **0** — **Destino de `api/delete_sources.py`**: continua versionado junto do pacote congelado ou sai.
  - Ordem: 25
  - Tipo: processo
  - Estado: Pronto
  - Depende de: —
  - Remove mocks: —
  - Fonte: T052 da 003
- **Bugfix** — **Feature `047-player-dev-mpegts`** (reprodução de canais MPEG-TS no navegador do dev, 0/35 tasks, "Em Execução"): só ajuda o desenvolvimento, não chega ao usuário. Adiar, ou fazer só o necessário para testar Live no PC.
  - Ordem: —
  - Tipo: feature
  - Estado: Adiada
  - Depende de: —
  - Remove mocks: —
  - Fonte: `sdd/assessments/mpegtsjs-no-htmlvideoadapter-tocar-canais-no/`


### Bloqueados ou a avaliar (sem data)

- **64** — **Avaliação: canal celular ↔ TV na LAN.** Um web app Tizen não abre socket de escuta: decidir entre service app Tizen, relay ou outro caminho que respeite a ADR-008. Resolve uma vez para 22b, 33 e 34. O item 58 foi concluído: o `sdd-assess` já pode rodar.
  - Ordem: —
  - Tipo: avaliação
  - Estado: A avaliar
  - Depende de: —
  - Remove mocks: —
  - Fonte: ADR-008 §5; itens 22/33/34
- **22b** — **Conectar a lista pelo celular (QR).**
  - Ordem: —
  - Tipo: feature
  - Estado: Bloqueado
  - Depende de: 64
  - Remove mocks: `pair-phone`
  - Fonte: RF-004; V14 §46
- **33** — **Voz pelo celular (BYOK OpenAI)**: pressionar-para-falar com `getUserMedia` + `MediaRecorder`, transcrição direta do celular, comando com ID e expiração confirmado pelo estado real da TV.
  - Ordem: —
  - Tipo: feature
  - Estado: Bloqueado
  - Depende de: 64
  - Remove mocks: `voice-search`
  - Fonte: ADR-001 §4; ADR-008 §4
- **34** — **Controle remoto por app Android**: mesma LAN, WebSocket autenticado com pareamento explícito, TV como fonte do estado real, controle físico sempre operacional.
  - Ordem: —
  - Tipo: feature
  - Estado: Bloqueado
  - Depende de: 64
  - Remove mocks: —
  - Fonte: ADR-001 §5; ADR-008 §5
- **29** — **Nota IMDb com procedência**: nota real com origem, "Sem avaliação" quando faltar, nunca nota genérica renomeada nem gerada por IA; ordenar antes de paginar, sem nota no fim.
  - Ordem: —
  - Tipo: feature
  - Estado: Bloqueado
  - Depende de: decisão de fonte/licença dos dados (`sdd-assess`/ADR)
  - Remove mocks: —
  - Fonte: RF-016; ADR-005 §5
- **37** — **Matriz de TVs e evidências de compatibilidade**: modelo, firmware, `userAgent`, protocolo, contêiner, codecs, resolução, DRM e legendas em cada teste de mídia. Hoje só a QN50Q60DAGXZD (Tizen 9.0 / Chromium 120).
  - Ordem: —
  - Tipo: verificação
  - Estado: Bloqueado
  - Depende de: outro aparelho disponível
  - Remove mocks: —
  - Fonte: ADR-006 E1/V1
- **43** — **TV Archive / Catch-up / Timeshift**: tocar programa passado a partir do Guia, se o provedor oferecer; duas variantes de URL exigem probe; liberaria Play/Pause em Live (§43.3).
  - Ordem: —
  - Tipo: avaliação
  - Estado: A avaliar
  - Depende de: 031 ✅; `sdd-assess`
  - Remove mocks: —
  - Fonte: `docs/iptvnator/03-apis.md` #8
- **52** — **Perfis de pessoa e controle parental**: perfis independentes da lista (perfil = lista pela ADR-011), PIN, bloqueio de categoria. Exige migração Dexie do estado da pessoa e decisão de produto.
  - Ordem: —
  - Tipo: avaliação
  - Estado: A avaliar
  - Depende de: `sdd-assess`
  - Remove mocks: `settings-parental`
  - Fonte: V14 §13.3/§48
- **53** — **Seções Esportes e Infantil** sem substituir as categorias da fonte (seleção manual de grupos ou regra reversível). Fora da topbar até lá.
  - Ordem: —
  - Tipo: avaliação
  - Estado: A avaliar
  - Depende de: `sdd-assess`
  - Remove mocks: —
  - Fonte: V14 §13.1; ADR-011
- **54** — **Dock: clima e teste de velocidade**. O teste de velocidade tem valor de diagnóstico para stream travando.
  - Ordem: —
  - Tipo: avaliação
  - Estado: A avaliar
  - Depende de: `sdd-assess`; 19 ✅
  - Remove mocks: `dock-weather`, `dock-speedtest`
  - Fonte: V14 §20/§21
- **41** — **Portais Stalker/Ministra (STB)**: protocolo, autenticação, CORS do portal; "full" × "simple" por comportamento observado.
  - Ordem: —
  - Tipo: avaliação
  - Estado: A avaliar
  - Depende de: `sdd-assess`
  - Remove mocks: —
  - Fonte: `docs/iptvnator/03-apis.md` #9
- **51** — **Descarte quando o espaço do aparelho acaba**: descartar a categoria menos usada, parar e declarar (hoje) ou teto configurável. Medir categoria, XMLTV e a quota real da TV (300 mil filmes em blocos ≈ 13 MB no navegador do PC).
  - Ordem: —
  - Tipo: avaliação
  - Estado: A avaliar
  - Depende de: `sdd-assess` com medição
  - Remove mocks: —
  - Fonte: feature 010, Clarifications
- **17** — **Detalhe em dois estados (browse ↔ watch)**: o DS V14 não adota (player é camada em tela cheia); só se o uso real pedir.
  - Ordem: —
  - Tipo: avaliação
  - Estado: A avaliar
  - Depende de: `sdd-assess`
  - Remove mocks: —
  - Fonte: `docs/iptvnator/08-tela-filmes.md` #5/#7


### Retirados

- **20** — Design das telas sem protótipo: resolvido pela migração DS V14 (021–028). "Não classificados" segue no 26.
- **21** — Um dono de scroll por painel: absorvido pela 009, pela 028 e pela fonte ativa única.
- **44** — Teclas de mídia entregues pela 027; a entrada numérica de canal (§44) foi retirada a pedido do usuário em 30/09/2026.

## Features

| Slug | Título | Status | Progresso | Última Atualização |
| --- | --- | --- | --- | --- |
| 001-importacao-fonte-m3u | Importação de Fonte M3U por URL e por Provedor | Convergida | 63/63 tasks | 2026-09-14 |
| 002-splash-home-perfis | Splash, ícone do app e Home de perfis/listas | Implementada | 22/22 tasks | 2026-09-16 |
| 003-live-tv-avplay | Live TV com catálogo real e reprodução AVPlay | Convergida | 67/67 tasks | 2026-09-18 |
| 004-conector-xtream-live | Conector Xtream JSON para canais ao vivo | Convergida | 55/55 tasks | 2026-09-18 |
| 005-import-catalogo-client-first | Import e catálogo client-first, sem backend sempre-ligado | Convergida | 59/59 tasks | 2026-09-22 |
| 006-conector-xtream-vod-series | Conector Xtream JSON para VOD e Series | Convergida | 15/15 tasks | 2026-09-22 |
| 007-higiene-credenciais | Higiene de Credenciais e Políticas de Rede | Convergida | 7/7 tasks | 2026-09-22 |
| 008-user-state-repo | UserStateRepository | Convergida | 14/14 tasks | 2026-09-22 |
| 009-virtualizacao-foco | Virtualização de Grades e Foco Direcional | Convergida | 28/28 tasks | 2026-09-23 |
| 010-catalogo-sob-demanda | Importação por Estrutura com Carga sob Demanda por Categoria | Convergida | 59/59 tasks | 2026-09-23 |
| 011-assistir-filme-retomada | Assistir Filme, com Retomada | Convergida | 63/72 tasks | 2026-09-24 |
| 012-series-episodios-temporadas | Séries — Episódios e Temporadas | Convergida | 52/55 tasks | 2026-09-24 |
| 013-favoritos | Favoritos em Canais, Filmes e Séries | Convergida | 47/47 tasks | 2026-09-24 |
| 014-m3u-sob-demanda | Fonte M3U Estrutura-Primeiro (Detecção de Painel Xtream ou Arquivo Guardado) | Convergida | 58/62 tasks | 2026-09-24 |
| 015-capa-real-filmes-series | Capa Real de Filmes e Séries | Convergida | 34/34 tasks | 2026-09-25 |
| 016-zapping-live-tv | Zapping por Cima do Vídeo em Live TV | Convergida | 41/41 tasks | 2026-09-25 |
| 017-busca-local-catalogo | Busca Local em Live TV, Filmes e Séries | Implementada | 40/42 tasks | 2026-09-25 |
| 018-busca-por-categoria | Busca por categoria com ícone de entrada e categoria virtual "Todos" | Convergida | 36/36 tasks | 2026-09-26 |
| 019-historico-continuar-assistindo | Histórico e Continuar Assistindo | Convergida | 30/31 tasks | 2026-09-26 |
| 020-ciclo-vida-player | Ciclo de Vida do Player na TV | Convergida | 15/16 tasks | 2026-09-26 |
| 021-fundacao-visual-ds-v14 | Fundação Visual do Design System V14 (Onda 0 da migração) | Convergida | 65/65 tasks | 2026-09-26 |
| 022-biblioteca-componentes-ds-v14 | Biblioteca de Componentes do Design System V14 (Onda 1 da migração) | Convergida | 80/80 tasks | 2026-09-26 |
| 023-shell-navegacao-entrada-ds-v14 | Shell, Navegação e Entrada do Design System V14 (Onda 2 da migração) | Convergida | 59/59 tasks | 2026-09-27 |
| 024-live-tv-ds-v14 | Live TV no Design System V14 (Onda 3) | Convergida | 59/60 tasks | 2026-09-27 |
| 025-filmes-series-ds-v14 | Filmes e Séries no Design System V14 (Onda 4) | Convergida | 79/80 tasks | 2026-09-27 |
| 026-home-busca-configuracoes-ds-v14 | Home definitiva, Busca global e Configurações no Design System V14 (Onda 5) | Convergida | 50/50 tasks | 2026-09-28 |
| 027-player-chrome-ds-v14 | Player chrome do Design System V14 com auto-hide e teclas de mídia (Onda 6) | Convergida | 55/55 tasks | 2026-09-28 |
| 028-limpeza-qa-ds-v14 | Limpeza e QA do Design System V14 (Onda 7) | Implementada | 78/78 tasks | 2026-09-28 |
| 029-audio-legendas-info-player | Player — Trilhas de Áudio, Legendas e Info do Stream | Convergida | 50/52 tasks | 2026-09-28 |
| 030-epg-dados-agora | EPG — Dados de Programação e "Agora" na Live TV, no Player e na Home | Convergida | 55/56 tasks | 2026-09-29 |
| 031-epg-guia-completo | EPG — Guia Completo em Tela Cheia | Convergida | 47/48 tasks | 2026-09-29 |
| 032-metadata-tmdb-integracoes | Metadata de Filmes e Séries — Provedor Primeiro, TMDB (BYOK) Completa, e Tela Integrações | Convergida | 58/58 tasks | 2026-09-29 |
| 033-trailers-filmes-series | Trailers de Filmes e Séries | Convergida | 55/55 tasks | 2026-09-29 |
| 034-fontes-estado-expiracao | Fontes IPTV completas — estado, contagem e expiração da conta | Convergida | 45/45 tasks | 2026-10-01 |
| 035-semelhantes-elenco-ator | Semelhantes, fotos do elenco e página de ator | Convergida | 63/63 tasks | 2026-09-30 |
| 036-limpar-historico | Limpar histórico e remover item do Histórico | Convergida | 46/46 tasks | 2026-10-01 |
| 037-entrada-listas-prototipo | Entrada fiel ao protótipo — tela de listas e cadastro de lista | Convergida | 51/51 tasks | 2026-09-30 |
| 038-carga-listas-pre-carga | Carga de listas — progresso claro, pré-carga em segundo plano, contagens e atualização visível | Convergida | 84/84 tasks | 2026-09-30 |
| 039-catalogo-em-blocos | Catálogo em blocos por categoria — leitura e gravação instantâneas | Convergida | 44/44 tasks | 2026-09-30 |
| 040-dividir-player-live | Dividir PlayerLayer e LiveScreen por responsabilidade | Convergida | 35/35 tasks | 2026-10-01 |
| 041-player-qualidade-aspecto | Qualidade, aspecto e preferências do player (sem velocidade) | Convergida | 53/53 tasks | 2026-10-01 |
| 042-rede-lifecycle-erros | Rede, lifecycle e erros acionáveis | Convergida | 61/62 tasks | 2026-10-01 |
| 043-gostei-filmes-series | "Gostei" em filmes e séries | Especificada | N/A | 2026-10-01 |
| 044-parser-m3u-headers | Contrato de compatibilidade do parser M3U (headers, radio, tvg-chno) | Convergida | 26/27 tasks | 2026-10-02 |
| 045-ime-formularios-tv | IME da TV nos formulários — teclado, Next/Done, senha e erros de conexão | Convergida | 39/42 tasks | 2026-10-02 |
| 046-memoria-foco-key-repeat | Memória de foco por área e key repeat | Convergida | 27/27 tasks | 2026-10-02 |
| 047-player-dev-mpegts | Reprodução de canais ao vivo MPEG-TS no navegador do dev | Convergência Pendente | 35/38 tasks | 2026-10-02 |
| 048-live-paridade-v14 | Paridade visual da TV ao vivo com o Design System V14 | Em Execução | 4/47 tasks | 2026-10-02 |

## Bugs

| Slug | Título | Fase Atual | Veredito/Status | Próximo Passo | Última Atualização |
| --- | --- | --- | --- | --- | --- |
| tecla-voltar-return-nao-funciona-na | Tecla Voltar (RETURN) não funciona na TV física | Test | verified | Concluído | 2026-09-17 |
| live-tv-toca-audio-sem-imagem | Live TV toca áudio sem imagem na TV física | Test | verified | Concluído | 2026-09-17 |
| enter-controle-remoto-nao-ativa-botoes | Enter do controle remoto não ativa botões em telas de foco DOM nativo | Test | verified | Concluído | 2026-09-18 |
| prefetch-concorrente-categoria-sem-cancelamento-requisicao | Prefetch de categoria sem cancelamento de requisição HTTP em voo | Test | verified | Concluído | 2026-09-25 |
| mensagem-generica-erro-reproducao-sempre-diz | Mensagem genérica de erro de reprodução sempre diz "canal" | Test | verified | Concluído | 2026-09-29 |
| modal-temporada-sem-indicador-mais-itens | Modal de temporada — foco some e não há indicador de "mais abaixo" | Test | verified | Concluído | 2026-09-29 |
| flake-e2e-home-busca-configuracoes-passo-continuar-progresso | Detalhe do filme pode voltar do player sem "Continuar" (flake do E2E da 026) | Test | verified | Concluído | 2026-09-30 |
| epg-manual-falha-ao-salvar-epg-02 | EPG manual falha com EPG-02 embora o navegador baixe o XML | Assess | valid (reproduzido) — mas a causa é do servidor do EPG; no app há só uma lacuna de diagnóstico (medium) | Rodar fase Fix | 2026-10-02 |

## Melhorias Ad-hoc

| Data | Área | Resumo |
| --- | --- | --- |
| 2026-09-30 | E2E (`tv-web/e2e`, `package.json`) | Dois ajustes de script, sem tocar em `src/`: (1) `filmes-series-ds-v14.mjs` esperava o Trailer como mock "Em breve", desatualizado desde a feature 033 — agora espera o toast "Trailer indisponível para este título" (ou "Consultando trailer") e que nenhuma camada abra; (2) `e2e/modal-temporada.mjs` (bug `modal-temporada-sem-indicador-mais-itens`) entrou no fim de `npm run test:e2e`. Validado: `filmes-series-ds-v14.mjs` passa inteiro, `npm run lint` exit 0. Não incluído (fora do pedido): `filmes-series-ds-v14.mjs` também está fora do `test:e2e`, e foi por isso que a asserção velha passou despercebida. |
| 2026-10-01 | Guia de programação (`tv-web/src/features/live/guide/EpgGuide.tsx`, `useLiveGuide.tsx`, `LiveScreen.tsx`, `App.tsx`) | **Item 62a do backlog, por decisão do usuário:** o guia não tem mais a ação "Configurar EPG" — o EPG só se configura ao editar a lista, em Configurações › Fontes IPTV. Antes, a ação saía da Live TV e, com um canal tocando, fechava o player (R-010 da 031). Removidos a prop `onOpenEpgSettings` (guia → `useLiveGuide` → `LiveScreen` → `App.tsx`, que despachava `open epg-settings` com `from: live`) e o botão; o estado "Sem programação" agora diz "O EPG é configurado em Configurações › Fontes IPTV, na linha da lista." e o foco fica no seletor de lista (o mesmo caminho que já existia sem a prop). Considerado e descartado antes da decisão: manter a ação e restaurar canal/guia na volta, ou manter o player tocando por baixo das configurações — o usuário preferiu que a ação simplesmente não exista no canal. Nenhum contrato travado citava a ação; mudaram, por ser comportamento pedido, um teste não travado (`EpgGuide.states.test.tsx`: os 3 estados de "sem programação" agora checam a explicação de onde configurar, a ausência do botão e o foco no seletor; o caso "sem destino" ficou redundante e saiu) e o E2E `epg-guia-completo.mjs` (sem o botão; 56 ✓). Validado: `tsc` limpo; `npx vitest run` 2029/2034 (só os contratos da 034); `oxlint` 0 erros (45 avisos, a linha de base aceita na 040); `npm run build:tizen` ok; todas as travas íntegras; `node e2e/epg-guia-completo.mjs` 56 ✓ / 0 ✗. |
| 2026-10-01 | Teste da 036 (`SettingsScreen.privacidade.test.tsx`) | Teste instável achado ao medir a linha de base da 040: sob `npx vitest run` inteiro, a leitura do resumo do Histórico no IndexedDB passava de 1 s (o padrão do `waitFor`) e o teste via "Carregando…"; isolado, 3/3 verde. Corrigido **só no teste**, a pedido do usuário: as quatro esperas de IndexedDB usam `IDB_WAIT = { timeout: 5000 }` — nenhuma asserção mudou, nenhum código do app. Validado: o arquivo 3/3 em duas rodadas isoladas e `tsc` limpo; a prova na suíte inteira vem na próxima rodada completa da 040. |
| 2026-10-01 | Configurações (`tv-web/src/features/settings/`) | **Item 63 do backlog — registro de abas.** A união `SettingsTab` + as cadeias de `if` por aba de `SettingsScreen.tsx` viraram um registro (`tabs/settingsTabs.ts`, `{id, label, icon, Panel}`) e um módulo por aba (`SourcesTab`, `IntegrationsTab`, `AccessibilityTab`, `SimpleTabs` com Sobre e os dois "Em breve"), cada um com o próprio estado, mutações e modal. A tela ficou só com as zonas topbar/abas/painel e encaminha as teclas do painel à aba ativa por um handle (`SettingsTabHandle`: `onEnter`/`onDirection`/`onSelect` — mesmo padrão do `EpgGuideHandle`); tipos em `tabs/settingsTab.ts`, `SettingsTab`/`SettingsFocus` reexportados pela tela (o `appNav.ts` não mudou). Sem mudança de comportamento. Descartados: (1) um hook por aba chamado em laço sobre o registro — o lint barra (`react/rules-of-hooks: error`); (2) remontar a aba a cada entrada (`key` com contador) — quebrou o contrato travado da 026, que guarda nós do DOM antes de entrar no painel; ficou `key` = id da aba, e reentrar na mesma aba chama `onEnter`; (3) `mutateAsync` para a saída de uma mutação sobreviver à troca de aba — os contratos travados mockam só `mutate`. Limite assumido e comentado em `settingsTab.ts`: trocar de aba durante uma exclusão/ressincronização ainda em voo perde o callback (`onSourceDeleted`/`onResyncStarted`), como já acontecia com RETURN na tela inteira; exige ≥ 5 teclas depois de confirmar. Validado: `tsc` e `npm run lint` limpos, 1 teste novo (reentrar zera o foco sem remontar; o foco restaurado não volta depois de trocar de aba), `npx vitest run` 1992/2002 (as 10 falhas são só os contratos das features 034/036 ainda não executadas, como antes), `npm run build:tizen` ok, `npm run test:e2e` inteiro verde, e `paridade-limpeza.mjs` 21 telas: 20 idênticas ou ruído; a 08 (Fontes IPTV) só difere na largura das tarjas que mascaram a data dinâmica da linha (capturas de evidência da 028 restauradas depois). |
| 2026-10-02 | Live TV — logo do canal e prévia (`tv-web/src/styles/shared.css`, `live.css`) | Dois ajustes de CSS a pedido do usuário, sem tocar em componente. (1) **Logo cortado e fundo competindo:** a `<img>` do `PosterArt` na variante `logo` usava `object-fit: cover` e não tinha fundo, então cortava o logo e deixava o ruído listrado e as iniciais do placeholder aparecerem pelas partes transparentes; agora `.poster-box-logo .poster-box-art` usa `contain` + 6px de respiro + fundo sólido (e o fundo de foco), e o placeholder segue no DOM para quando a imagem falha — confirmado pelo usuário na tela. (2) **Botões Assistir/Favoritar/Guia completo sobrepondo o "A seguir" do EPG:** os filhos do `.live-preview-panel` (coluna flex de altura limitada) encolhiam e o conteúdo transbordava por cima dos botões; agora `.live-preview-panel > * { flex-shrink: 0 }`, logo da prévia 220px→160px e sinopse 3→2 linhas para caber. **Considerado e descartado:** deixar os botões encolherem/rolar (esconderia EPG) e não mexer no logo (a prévia não cabia). **Validação:** `npx tsc --noEmit` e `npx oxlint` limpos, `npm run build` ok e `npm test` 335 arquivos/2406 testes verdes (uma rodada anterior teve 1 falha em 2357 que não identifiquei e não se repetiu). **Não verificado:** o ajuste (2) não foi visto numa tela real (navegador ou TV) — 160px/2 linhas são estimativa de altura; conferir com sinopse longa. |
