# Backlog

Painel único de ideias futuras e status de features/bugs geridas pelo
sistema sdd-*. Mantido automaticamente por update-feature-status.ps1 e
update-bug-status.ps1.

## Ideias Futuras
- Incluir uma gestão de categorias nas configurações que permita o usuario, colocar senha em categorias ou esconder
- incluir controle parental para canais adultos
- bug analisar atualizacao da lista, parece que a lista tem novos filmes, series e nao está aparecendo na lista

**Só o que falta**, na ordem de execução sugerida (revisada em 02/10/2026,
mantida a prioridade do usuário: player completo e valor direto ao usuário
antes de lançamento). O que foi entregue está na tabela `## Features`; só os retirados ficam no fim da seção.

ID é identificador estável, não ordem: `comingSoon.ts` (campo `backlogItem`)
e `.planning/migracao-design-system-v14.md` apontam para ele. Nunca renumerar; os pacotes `G1`–`G8` agrupam itens para uma única passada de `sdd-specify`;
item novo recebe o próximo número livre (**hoje: 73**; o 67 foi entregue pela `057`, o 68 pela `056`, o 70 virou o bug `tela-principal-filmes-lenta-na-tv`, em `sdd/bugs/`, e o 71 virou o bug `url-do-stream-no-src-do-video-de-dev`, em `sdd/bugs/`); fatias usam letra
(`55a`, `62b`). Todo item assume o dado no aparelho (ADR-008): chamadas externas
só a APIs de terceiro com a chave do próprio usuário (BYOK); `api/` é contorno
congelado. Quem entrega um item apaga o mock correspondente de `comingSoon.ts`
na mesma feature (hoje restam **9**, conferido em `comingSoon.ts` em 06/10/2026; a `057` retirou `vod-top10-movies` e `vod-top10-series`, a `060` retirou `vod-because` e `home-trailer`, a `062` substituiu `dock-speedtest` por diagnóstico real, com gate físico pendente). Dexie hoje é **v17** (a `062` acrescentou `networkDiagnostics`); a próxima livre é
**v18** (reservar na spec). Itens de categoria vivem em blocos: ler/gravar só
por `catalogRepository.ts`, nunca `db.channels`.

Estados: `Pronto` (vai para `sdd-specify`, pelo pacote), `Bloqueado` (dependência dura
aberta), `A avaliar` (precisa de `sdd-assess`), `Verificação` (só hardware ou
medição), `Bugfix` (segue em `## Bugs`).


### Pacotes para especificar

Cada pacote vira **uma** passada de `sdd-specify` (uma spec, várias user stories). Os
IDs dos itens continuam estáveis (`comingSoon.ts` aponta para eles); `G6`–`G8` são só
rótulos de pacote (o G1 — itens 25b e 43 — virou a `058-headers-avplay-catchup`; o G5 — itens 49a-2, 49b e 35 — virou a `063-codigo-saudavel-benchmark`; G3 foi reduzido ao item 54 e especificado na `062-teste-conexao-tv`; G2 e G4 foram retirados pelo `sdd-assess` em 06/10/2026) e podem ser reagrupados. Dentro de um pacote, as fatias "A avaliar"
só entram na spec depois do `sdd-assess`/medição — o resto sai sem esperar por elas.

**Dificuldade** (para escolher o modelo no `sdd-plan`; vale a mais alta do pacote que você vai
especificar agora): **Baixa** — mudança local, padrão já existente, sem dado nem contrato novo
(modelo mais barato basta). **Média** — toca vários arquivos ou um contrato travado, mas o
desenho é conhecido (modelo padrão). **Alta** — integridade de dados, desempenho em escala,
API de plataforma incerta ou arquitetura nova (vale o modelo mais caro **para planejar**; a
execução das tasks já definidas pode voltar ao modelo padrão). Estimativa de 04/10/2026, a
rever no `sdd-specify`.

- **G6 — Pessoa e seções do catálogo** (decisão de produto antes de tudo)
  - Ordem: 6
  - Tipo: avaliação
  - Dificuldade: **Alta** — modelo de dados da pessoa e migração Dexie; decisão de produto antes do plano
  - Estado: A avaliar
  - Itens:
    - **52** [Alta] — Perfis de pessoa e controle parental: perfis independentes da lista (perfil = lista pela ADR-011), PIN, bloqueio de categoria. Exige migração Dexie do estado da pessoa. Remove `settings-parental`.
    - **53** [Média] — Seções Esportes e Infantil sem substituir as categorias da fonte (seleção manual de grupos ou regra reversível). Fora da topbar até lá. O bloqueio de categoria do 52 e a seleção de grupos do 53 compartilham o mesmo modelo "grupo da fonte → rótulo da pessoa".
  - Depende de: `sdd-assess` (um só, para os dois)
  - Remove mocks: `settings-parental`
  - Fonte: V14 §13.1/§13.3/§48; ADR-011
- **G7 — Lançamento na loja Samsung** (depois da UI estável)
  - Ordem: 7
  - Tipo: lançamento
  - Dificuldade: **Baixa** — majoritariamente não é código; o 38 pede cuidado com `config.xml` e certificado
  - Estado: 40 Pronto; 38 e 39 Bloqueados pela UI estável
  - Itens:
    - **40** [Baixa] — Conta de publicação e abrangência: Public Seller publica só nos EUA; Brasil depende de Partner Seller. Confirmar antes de prometer data; kit de revisão com fonte de demonstração e credenciais de teste separadas. Pode começar a qualquer momento.
    - **38** [Média] — Pacote e checklist Tizen: `config.xml` e assinaturas revisados, Tizen ID preservado, versão crescente, `required_version` coerente, permissões proporcionais e justificadas, custódia do certificado. Bloqueadores: falha de instalação, perda de favoritos, áudio em segundo plano, credencial em log.
    - **39** [Baixa] — Materiais de loja e Application UI Description: logo, fundo, ícone e 4 capturas nos tamanhos da Samsung, de uma versão com dados fictícios ou autorizados, sem credencial à vista.
  - Depende de: UI estável (para 38/39)
  - Remove mocks: —
  - Fonte: guias `/02`, `/09`, `/10`, `/11`
- **G8 — Canal celular ↔ TV** (bloqueado por uma avaliação)
  - Ordem: 8
  - Tipo: avaliação → feature
  - Dificuldade: **Alta** — arquitetura de rede inexistente hoje (socket de escuta na TV); decide a ADR-008 de novo
  - Estado: 64 A avaliar; 22b e 33 Bloqueados
  - Itens:
    - **64** [Alta] — Avaliação: um web app Tizen não abre socket de escuta; decidir entre service app Tizen, relay ou outro caminho que respeite a ADR-008. Resolve uma vez para 22b e 33. O `sdd-assess` já pode rodar.
    - **22b** [Alta] — Conectar a lista pelo celular (QR). Remove `pair-phone`.
    - **33** [Alta] — Voz pelo celular (BYOK OpenAI): pressionar-para-falar com `getUserMedia` + `MediaRecorder`, transcrição direta do celular, comando com ID e expiração confirmado pelo estado real da TV. Remove `voice-search`.
  - Depende de: 64
  - Remove mocks: `pair-phone`, `voice-search`
  - Fonte: ADR-008 §4/§5; ADR-001 §4; RF-004; V14 §46


### Retirados

Revisão crítica de arquiteto em 04/10/2026 — cortado o que não entrega valor proporcional ao custo de manter:

- **G4 (56)** — Acessibilidade de sistema: aparência de legendas, alto contraste e anúncios configuráveis. `sdd-assess` de 06/10/2026, veredito `kill` ([decisão](../sdd/assessments/g4-acessibilidade-sistema/decision.md)): o usuário não vê necessidade agora; nenhuma barreira atual foi relatada. Retomar com necessidade concreta ou exigência comprovada de publicação. Recursos atuais, requisitos V14 e os três placeholders honestos permanecem; não é entrega nem dispensa de acessibilidade.

- **G3 — 30, 31 e clima (fatia do 54)** — `sdd-assess` de 06/10/2026, veredito `kill` no horizonte atual ([decisão](../sdd/assessments/g3-inicio-descoberta-dock/decision.md)): o usuário não relata lacuna concreta de descoberta após 057/060 e vê utilidade apenas no teste de velocidade. 30 ainda acrescentaria combinação de favoritos/múltiplas sementes; não foi considerado integralmente entregue. Não foi encontrada necessidade técnica para 31 depender de 30; o chat também carece de caso de uso atual. Retomar IA com pedido concreto não atendido; clima com necessidade explícita. `home-ai-curation`, `dock-ai` e `dock-weather` permanecem como placeholders nesta avaliação; 54 conserva o ID e segue somente como teste de conexão.

- **27** — "Gostei": terceiro sinal de preferência ao lado de favorito e histórico, com UI em todo card, estado Dexie e reconciliação. Favoritos + histórico já alimentam recomendações. Spec `043` fica como histórico.
- **22a** — Importar `.m3u` por USB: pouco uso em TV, e custaria um privilégio de filesystem a justificar na revisão da Samsung. URL e provedor cobrem o caso.
- **50** — Suíte de aceite de UX com "responsável, aparelho, firmware" por execução: cerimônia. O gate já existe (E2E + passada na TV física por feature).
- **48** — Documentação canônica por subsistema: duplica ADRs, specs e `CLAUDE.md`, e envelhece sozinha. Atualizar o ADR/spec onde a decisão mudou.
- **47** — Skills de domínio: o `CLAUDE.md` e o `.planning/README.md` já são o mapa; mais skills é mais superfície para divergir.
- **0** — Destino de `api/delete_sources.py`: não é item de produto; o arquivo fica junto do pacote congelado.
- **34** — App Android de controle remoto: um segundo produto (pareamento, WebSocket, relay) para substituir o controle físico e o SmartThings. Contradiz o espírito client-first da ADR-008.
- **29** — Nota IMDb com procedência: depende de licença de dados que não temos; a nota do provedor (`055`/`056`) e o TMDB já cobrem o caso.
- **37** — Matriz de TVs: não é acionável sem outro aparelho. Reabrir quando houver.
- **41** — Portais Stalker/Ministra: protocolo próprio, CORS e autenticação por MAC; custo de um terceiro conector para público de nicho.
- **17** — Detalhe em dois estados: o DS V14 já rejeitou; item só existia como "se o uso pedir".
- **23** — Várias fontes com refresh isolado: a navegação é uma lista por vez (ADR-011); atualizar listas inativas em segundo plano gasta rede, disco e CPU da TV sem benefício visível. A `034` já mostra estado por fonte.
- `tvg-chno` (resto do 25b): exibir número do canal exigiria emendar a ADR-011, que fixa a posição na fonte.

- **G2 inteiro (36, 26, 24, 66, 51)** — `sdd-assess` de 06/10/2026, veredito `kill` (`sdd/assessments/g2-integridade-carga-catalogo/decision.md`): nenhum sintoma visto com a lista real. 36 e 24 já têm a proteção principal (FR-017 da 005; chave lógica estável) e só voltam como **bug** se houver reprodução; 26 só afeta M3U fora do padrão; 66 morreu por decisão de produto (o usuário não quer busca global, só a de Filmes e a de Séries); 51 reabre com o aviso de espaço numa lista real ou com a quota medida pelo 35.

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
| 006-conector-xtream-vod-series | Conector Xtream: fatia de VOD e séries pelo mesmo protocolo | Convergida | 18/18 tasks | 2026-10-06 |
| 007-higiene-credenciais | Higiene de Credenciais e Políticas de Rede | Convergida | 7/7 tasks | 2026-09-22 |
| 008-user-state-repo | UserStateRepository | Convergida | 14/14 tasks | 2026-09-22 |
| 009-virtualizacao-foco | Virtualização de Grades e Foco Direcional | Convergida | 28/28 tasks | 2026-09-23 |
| 010-catalogo-sob-demanda | Importação por Estrutura com Carga sob Demanda por Categoria | Convergida | 59/59 tasks | 2026-09-23 |
| 011-assistir-filme-retomada | Assistir Filme, com Retomada | Convergida | 70/72 tasks | 2026-10-06 |
| 012-series-episodios-temporadas | Séries — Episódios e Temporadas | Convergida | 54/55 tasks | 2026-10-06 |
| 013-favoritos | Favoritos em Canais, Filmes e Séries | Convergida | 47/47 tasks | 2026-09-24 |
| 014-m3u-sob-demanda | Fonte M3U Estrutura-Primeiro (Detecção de Painel Xtream ou Arquivo Guardado) | Convergida | 59/62 tasks | 2026-10-06 |
| 015-capa-real-filmes-series | Capa Real de Filmes e Séries | Convergida | 34/34 tasks | 2026-09-25 |
| 016-zapping-live-tv | Zapping por Cima do Vídeo em Live TV | Convergida | 41/41 tasks | 2026-09-25 |
| 017-busca-local-catalogo | Busca Local em Live TV, Filmes e Séries | Implementada | 41/42 tasks | 2026-10-06 |
| 018-busca-por-categoria | Busca por categoria com ícone de entrada e categoria virtual "Todos" | Convergida | 36/36 tasks | 2026-09-26 |
| 019-historico-continuar-assistindo | Histórico e Continuar Assistindo | Convergida | 30/31 tasks | 2026-09-26 |
| 020-ciclo-vida-player | Ciclo de Vida do Player na TV | Convergida | 16/16 tasks | 2026-10-06 |
| 021-fundacao-visual-ds-v14 | Fundação Visual do Design System V14 (Onda 0 da migração) | Convergida | 65/65 tasks | 2026-09-26 |
| 022-biblioteca-componentes-ds-v14 | Biblioteca de Componentes do Design System V14 (Onda 1 da migração) | Convergida | 80/80 tasks | 2026-09-26 |
| 023-shell-navegacao-entrada-ds-v14 | Shell, Navegação e Entrada do Design System V14 (Onda 2 da migração) | Convergida | 59/59 tasks | 2026-09-27 |
| 024-live-tv-ds-v14 | Live TV no Design System V14 (Onda 3) | Convergida | 60/60 tasks | 2026-10-06 |
| 025-filmes-series-ds-v14 | Filmes e Séries no Design System V14 (Onda 4) | Convergida | 79/80 tasks | 2026-09-27 |
| 026-home-busca-configuracoes-ds-v14 | Home definitiva, Busca global e Configurações no Design System V14 (Onda 5) | Convergida | 50/50 tasks | 2026-09-28 |
| 027-player-chrome-ds-v14 | Player chrome do Design System V14 com auto-hide e teclas de mídia (Onda 6) | Convergida | 55/55 tasks | 2026-09-28 |
| 028-limpeza-qa-ds-v14 | Limpeza e QA do Design System V14 (Onda 7) | Implementada | 78/78 tasks | 2026-09-28 |
| 029-audio-legendas-info-player | Player — Trilhas de Áudio, Legendas e Info do Stream | Convergida | 52/52 tasks | 2026-10-06 |
| 030-epg-dados-agora | EPG — Dados de Programação e "Agora" na Live TV, no Player e na Home | Convergida | 56/56 tasks | 2026-10-06 |
| 031-epg-guia-completo | EPG — Guia Completo em Tela Cheia | Convergida | 48/48 tasks | 2026-10-06 |
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
| 042-rede-lifecycle-erros | Rede, lifecycle e erros acionáveis | Convergida | 62/62 tasks | 2026-10-06 |
| 043-gostei-filmes-series | "Gostei" em filmes e séries | Especificada | N/A | 2026-10-01 |
| 044-parser-m3u-headers | Contrato de compatibilidade do parser M3U (headers, radio, tvg-chno) | Convergida | 26/27 tasks | 2026-10-02 |
| 045-ime-formularios-tv | IME da TV nos formulários — teclado, Next/Done, senha e erros de conexão | Convergida | 41/42 tasks | 2026-10-06 |
| 046-memoria-foco-key-repeat | Memória de foco por área e key repeat | Convergida | 27/27 tasks | 2026-10-02 |
| 047-player-dev-mpegts | Reprodução de canais ao vivo MPEG-TS no navegador do dev | Convergida | 38/38 tasks | 2026-10-05 |
| 048-live-paridade-v14 | Paridade visual da TV ao vivo com o Design System V14 | Encerrada | 43/47 tasks | 2026-10-05 |
| 050-filmes-series-paridade-v14 | Paridade visual de Filmes e Séries com o Design System V14 | Implementada | 30/30 tasks | 2026-10-02 |
| 049-navegacao-por-pagina | Navegação por página nas listas | Convergida | 42/42 tasks | 2026-10-02 |
| 051-detalhe-filme-paridade-v14 | Paridade visual do detalhe do filme com o Design System V14 | Substituída pela 059 | 0/31 tasks | 2026-10-05 |
| 052-vitrine-filmes-series | Vitrine de Filmes e Séries e tela de categoria em grade cheia | Convergida | 54/54 tasks | 2026-10-03 |
| 053-carrosseis-filmes-series | Carrosséis de categoria, lista lateral recolhível e slots TMDB na tela hero de Filmes e Séries | Convergida | 48/48 tasks | 2026-10-03 |
| 054-idioma-do-app | Idioma do app | Convergida | 60/60 tasks | 2026-10-05 |
| 055-campos-da-listagem-xtream | Nota, gênero e fundo vindos da listagem Xtream | Convergida | 38/38 tasks | 2026-10-03 |
| 056-bem-avaliados | Fileira "Bem avaliados" em Filmes e Séries | Convergida | 44/44 tasks | 2026-10-04 |
| 057-top10-dica-tmdb | Top 10 da semana e carrossel "Dica" (TMDB) em Filmes, Séries e Início | Convergida | 55/58 tasks | 2026-10-05 |
| 058-headers-avplay-catchup | Headers da lista no AVPlay e catch-up de programas passados (Xtream) | Convergida | 53/53 tasks | 2026-10-05 |
| 059-detalhe-cinema-filme-serie | Detalhe de filme e de série no layout Cinema do Design System | Convergida | 49/49 tasks | 2026-10-06 |
| 060-home-vitrine-expandida | Home no layout "Vitrine expandida" do Design System | Convergida | 53/53 tasks | 2026-10-06 |
| 061-classificacao-nota-tmdb | Classificação indicativa e nota TMDB no Início e no detalhe | Convergida | 46/46 tasks | 2026-10-06 |
| 062-teste-conexao-tv | Teste de conexão da TV em Configurações | Em Execução | 28/34 tasks | 2026-10-06 |
| 063-codigo-saudavel-benchmark | Código saudável — divisão do repositório do catálogo, fronteiras e tamanho por lint, benchmark de importação | Implementada | 48/49 tasks | 2026-10-07 |
| 064-upload-teste-conexao | Upload no teste de conexão da TV | Convergida | 35/36 tasks | 2026-10-07 |
| 065-otimizacao-carga-consultas-memoria | Otimização de carga, consultas externas, memória e abertura do app | Em Execução | 47/61 tasks | 2026-10-08 |

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
| epg-manual-falha-ao-salvar-epg-02 | EPG manual falha com EPG-02 embora o navegador baixe o XML | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-10-05 |
| tela-principal-filmes-lenta-na-tv | Tela principal de Filmes lenta na TV (1ª e 2ª visita) | Test | verified | Concluído | 2026-10-05 |
| continue-assistindo-sobreposto-na-primeira-abertura | Continue assistindo sobreposto na 1ª abertura de Filmes e Séries | Test | verified | Concluído | 2026-10-05 |
| url-do-stream-no-src-do-video-de-dev | URL do stream no `src` do `<video>` de dev | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-10-05 |
| foco-some-ao-descer-na-lista | Foco some ao descer na lista de episódios do detalhe da série | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-10-05 |
| teste-conexo-armazenamento-indisponvel-tv | Teste de conexão não guarda resultado na TV | Test | verified | Concluído | 2026-10-07 |

## Melhorias Ad-hoc

| Data | Área | Resumo |
| --- | --- | --- |
| 2026-09-30 | E2E (`tv-web/e2e`, `package.json`) | Dois ajustes de script, sem tocar em `src/`: (1) `filmes-series-ds-v14.mjs` esperava o Trailer como mock "Em breve", desatualizado desde a feature 033 — agora espera o toast "Trailer indisponível para este título" (ou "Consultando trailer") e que nenhuma camada abra; (2) `e2e/modal-temporada.mjs` (bug `modal-temporada-sem-indicador-mais-itens`) entrou no fim de `npm run test:e2e`. Validado: `filmes-series-ds-v14.mjs` passa inteiro, `npm run lint` exit 0. Não incluído (fora do pedido): `filmes-series-ds-v14.mjs` também está fora do `test:e2e`, e foi por isso que a asserção velha passou despercebida. |
| 2026-10-01 | Guia de programação (`tv-web/src/features/live/guide/EpgGuide.tsx`, `useLiveGuide.tsx`, `LiveScreen.tsx`, `App.tsx`) | **Item 62a do backlog, por decisão do usuário:** o guia não tem mais a ação "Configurar EPG" — o EPG só se configura ao editar a lista, em Configurações › Fontes IPTV. Antes, a ação saía da Live TV e, com um canal tocando, fechava o player (R-010 da 031). Removidos a prop `onOpenEpgSettings` (guia → `useLiveGuide` → `LiveScreen` → `App.tsx`, que despachava `open epg-settings` com `from: live`) e o botão; o estado "Sem programação" agora diz "O EPG é configurado em Configurações › Fontes IPTV, na linha da lista." e o foco fica no seletor de lista (o mesmo caminho que já existia sem a prop). Considerado e descartado antes da decisão: manter a ação e restaurar canal/guia na volta, ou manter o player tocando por baixo das configurações — o usuário preferiu que a ação simplesmente não exista no canal. Nenhum contrato travado citava a ação; mudaram, por ser comportamento pedido, um teste não travado (`EpgGuide.states.test.tsx`: os 3 estados de "sem programação" agora checam a explicação de onde configurar, a ausência do botão e o foco no seletor; o caso "sem destino" ficou redundante e saiu) e o E2E `epg-guia-completo.mjs` (sem o botão; 56 ✓). Validado: `tsc` limpo; `npx vitest run` 2029/2034 (só os contratos da 034); `oxlint` 0 erros (45 avisos, a linha de base aceita na 040); `npm run build:tizen` ok; todas as travas íntegras; `node e2e/epg-guia-completo.mjs` 56 ✓ / 0 ✗. |
| 2026-10-01 | Teste da 036 (`SettingsScreen.privacidade.test.tsx`) | Teste instável achado ao medir a linha de base da 040: sob `npx vitest run` inteiro, a leitura do resumo do Histórico no IndexedDB passava de 1 s (o padrão do `waitFor`) e o teste via "Carregando…"; isolado, 3/3 verde. Corrigido **só no teste**, a pedido do usuário: as quatro esperas de IndexedDB usam `IDB_WAIT = { timeout: 5000 }` — nenhuma asserção mudou, nenhum código do app. Validado: o arquivo 3/3 em duas rodadas isoladas e `tsc` limpo; a prova na suíte inteira vem na próxima rodada completa da 040. |
| 2026-10-01 | Configurações (`tv-web/src/features/settings/`) | **Item 63 do backlog — registro de abas.** A união `SettingsTab` + as cadeias de `if` por aba de `SettingsScreen.tsx` viraram um registro (`tabs/settingsTabs.ts`, `{id, label, icon, Panel}`) e um módulo por aba (`SourcesTab`, `IntegrationsTab`, `AccessibilityTab`, `SimpleTabs` com Sobre e os dois "Em breve"), cada um com o próprio estado, mutações e modal. A tela ficou só com as zonas topbar/abas/painel e encaminha as teclas do painel à aba ativa por um handle (`SettingsTabHandle`: `onEnter`/`onDirection`/`onSelect` — mesmo padrão do `EpgGuideHandle`); tipos em `tabs/settingsTab.ts`, `SettingsTab`/`SettingsFocus` reexportados pela tela (o `appNav.ts` não mudou). Sem mudança de comportamento. Descartados: (1) um hook por aba chamado em laço sobre o registro — o lint barra (`react/rules-of-hooks: error`); (2) remontar a aba a cada entrada (`key` com contador) — quebrou o contrato travado da 026, que guarda nós do DOM antes de entrar no painel; ficou `key` = id da aba, e reentrar na mesma aba chama `onEnter`; (3) `mutateAsync` para a saída de uma mutação sobreviver à troca de aba — os contratos travados mockam só `mutate`. Limite assumido e comentado em `settingsTab.ts`: trocar de aba durante uma exclusão/ressincronização ainda em voo perde o callback (`onSourceDeleted`/`onResyncStarted`), como já acontecia com RETURN na tela inteira; exige ≥ 5 teclas depois de confirmar. Validado: `tsc` e `npm run lint` limpos, 1 teste novo (reentrar zera o foco sem remontar; o foco restaurado não volta depois de trocar de aba), `npx vitest run` 1992/2002 (as 10 falhas são só os contratos das features 034/036 ainda não executadas, como antes), `npm run build:tizen` ok, `npm run test:e2e` inteiro verde, e `paridade-limpeza.mjs` 21 telas: 20 idênticas ou ruído; a 08 (Fontes IPTV) só difere na largura das tarjas que mascaram a data dinâmica da linha (capturas de evidência da 028 restauradas depois). |
| 2026-10-02 | Live TV — logo do canal e prévia (`tv-web/src/styles/shared.css`, `live.css`) | Dois ajustes de CSS a pedido do usuário, sem tocar em componente. (1) **Logo cortado e fundo competindo:** a `<img>` do `PosterArt` na variante `logo` usava `object-fit: cover` e não tinha fundo, então cortava o logo e deixava o ruído listrado e as iniciais do placeholder aparecerem pelas partes transparentes; agora `.poster-box-logo .poster-box-art` usa `contain` + 6px de respiro + fundo sólido (e o fundo de foco), e o placeholder segue no DOM para quando a imagem falha — confirmado pelo usuário na tela. (2) **Botões Assistir/Favoritar/Guia completo sobrepondo o "A seguir" do EPG:** os filhos do `.live-preview-panel` (coluna flex de altura limitada) encolhiam e o conteúdo transbordava por cima dos botões; agora `.live-preview-panel > * { flex-shrink: 0 }`, logo da prévia 220px→160px e sinopse 3→2 linhas para caber. **Considerado e descartado:** deixar os botões encolherem/rolar (esconderia EPG) e não mexer no logo (a prévia não cabia). **Validação:** `npx tsc --noEmit` e `npx oxlint` limpos, `npm run build` ok e `npm test` 335 arquivos/2406 testes verdes (uma rodada anterior teve 1 falha em 2357 que não identifiquei e não se repetiu). **Não verificado:** o ajuste (2) não foi visto numa tela real (navegador ou TV) — 160px/2 linhas são estimativa de altura; conferir com sinopse longa. |
| 2026-10-05 | Detalhe do filme — aba Elenco (`tv-web/src/styles/vod.css`, `features/movies/MovieDetailScreen.tsx`) | A pedido do usuário (a TV exigia descer para ver o elenco inteiro): em 1920×1080 o hero Cinema (860 px) deixava a capa terminar em 749 px, e as abas começavam em 892 px com o elenco indo até 1224 px. O hero **não mudou** (0–860, capa 149–749). As abas e o painel sobem para dentro da faixa livre de ~111 px do hero (abas 892→765, elenco termina em 1065, dentro dos 1080), por um modificador `vod-detail--movie` só no filme (a série usa as mesmas classes e fica de fora). Primeira versão pintava as abas por baixo da vinheta do hero (elemento posicionado cobre irmãos não posicionados): corrigido com `position: relative; z-index: 1` nas abas e no painel. Descartado: encolher o hero (muda um visual já aprovado). Validado em Chromium com TMDB fictício e medições por `getBoundingClientRect`; `tsc` limpo, lint sem erros, 123 arquivos / 725 testes de movies/vod/series/components e `npm run build` ok. **Não verificado na TV física.** Achado fora do escopo, falha igual sem o ajuste: E2E `metadata-tmdb` (selo "Dados: fonte" e duração) e `semelhantes-elenco-ator` (passo "foco no não encontrado") estão desatualizados em relação à 059/hero Cinema. |
| 2026-10-06 | Detalhe da série — lista de episódios (`tv-web/src/features/series/SeriesDetailScreen.tsx`, `styles/vod.css`) | A pedido do usuário: título, sinopse e demais dados do episódio passam a ficar **ao lado** da capa (292×164), não abaixo. A linha deixou de usar `ContentCard` (que sempre põe título/meta embaixo) e monta `PosterArt` + coluna `.vod-episode-info` com título, meta (`T1:E2 · 30:00`), sinopse (até 3 linhas) e progresso; altura da linha virtualizada 232→196 px, então cabem mais episódios na tela. A faixa única "sinopse do episódio focado" (032/FR-028, altura fixa acima da lista) saiu: cada episódio que o provedor descreve mostra a própria sinopse na linha, sem depender do foco; as regras de dado seguem — sem sinopse, nada é mostrado, nunca a da série no lugar, e mover o foco não faz consulta. Pequeno extra: quando `episodeCode` já é o nome (M3U sem T/E), a meta não repete o nome ao lado do título. Dados de episódio além de título/duração/sinopse/progresso (ex.: data de exibição, nota) não existem em `EpisodeOut` — ficam como ideia futura, não inventados. Descartado: adicionar prop ao `ContentCard` só para esconder a legenda (acoplaria um componente compartilhado a um caso só). Validado: `tsc -b` limpo, lint só com avisos da linha de base, `npm test` 443 arquivos / 2827 testes verdes (testes de sinopse reescritos + 1 novo para "título ao lado da capa"), `npm run build` ok, E2E (`serie-foco-episodios`, `metadata-tmdb`, `modal-temporada` — seletor `.content-card-title`→`.vod-episode-title`) verdes e screenshot em Chromium conferido. **Não verificado na TV física** (corte da sinopse em 3 linhas e altura de 196 px sobre a capa com foco 1.06×). |
| 2026-10-07 | Configurações — card do teste de conexão (`tv-web/src/features/settings/IntegrationsPanel.tsx`, `tabs/IntegrationsTab.tsx`) | Pedido do usuário: o card só dizia "Último teste · data" e não dava para saber a velocidade. A gravação do último resultado já existia e funcionava (IndexedDB `networkDiagnostics`, coberta pelo E2E `teste-conexao-tv`); faltava mostrá-lo. O card agora recebe o resultado inteiro (`SpeedTestResult`) e mostra, sempre que houver um salvo, data, Download (Mbps), Latência HTTP (ms) e Jitter (ms), com "Amostra insuficiente" no que não foi medido (nunca um número inventado); sem teste salvo, a mensagem de vazio de antes. Só leitura local: focar nada mede. Reaproveita os estilos `.speed-test-metrics` do diálogo e as chaves i18n existentes (pt/en/es), sem string nova. **Não incluído, de propósito:** upload — a spec 062 o deixou fora de escopo e medi-lo exige endpoint próprio, mais tráfego e limite de bytes, então é feature nova (`sdd-specify`). **Considerado e descartado:** só mexer na Home (já mostra o download, mas só na dica do ícone). Validado: 3 testes novos em `SettingsScreen.speedTestUltimo.test.tsx` (valores, resultado parcial, vazio); `npx tsc -b` 0; `npm run lint` 0; `npm run build` ok; `npm run test` 2 914/2 914; E2E `teste-conexao-tv` ok. **Segundo ajuste, a pedido do usuário (print do card): botão "Abrir teste" cortado no fim.** Duas causas em `tabs/IntegrationsTab.tsx`: o `scrollIntoView({ block: 'nearest' })` do foco encostava o botão na borda do painel (anel de foco recortado) e ele só rodava quando o foco mudava, não quando o resultado chegava do IndexedDB e o card crescia. Agora o efeito também depende de `lastSpeedTest.data` e, na última linha (`SPEED_TEST_ROW`), rola o `.settings-panel` até o fim — o botão fica 30 px acima da borda e o anel inteiro à vista, medido e visto em Chromium 1920×1080 com um resultado salvo. **Considerado e descartado:** `scroll-padding-block` no painel — corrigia a medida, mas deixava o botão exatamente na fronteira e o `scale(1.06)` do foco forçava uma rolagem extra de 1 px a cada foco (E2E `teste-conexao-tv` falhou 2 de 6 por `scrollTop` 231 ≠ 230; sem a mudança, 8 de 8 passam; com a rolagem até o fim, 10 de 10). Validado: `tsc` 0, `lint` 0, `vitest src/features/settings` 97/97, `build` ok, E2E `teste-conexao-tv` 10/10. **Não verificado:** na TV física (só Chromium desktop). |
| 2026-10-07 | Filmes e Séries — vitrines (`tv-web/src/features/vod/VodShowcaseScreen.tsx`, `styles/vod.css`) | A pedido do usuário, removida a `vod-hero-band` das telas iniciais de Filmes e Séries. As fileiras ocupam o painel desde o topo, sem a faixa de 176 px nem espaço reservado; removidos também `VodHeroArt`, CSS e leituras de assistidos/retomada usadas exclusivamente no hero. Categorias, cards, notas reais, navegação, SELECT e RETURN preservados. Testes que dependiam do hero foram emendados para verificar ausência da faixa e foco nos cards; travas das features 050/052/057 regravadas e conferidas. Validado: `npm run lint` sem erros (avisos existentes), `npx tsc --noEmit` limpo, `npx vitest run src/features/vod` 180/180, `npm run build` ok; E2E `carrosseis-filmes-series`, `vitrine-filmes-series`, `campos-da-listagem`, `bem-avaliados` e `top10-dica` 5/5, capturas Chromium 1920×1080 conferidas. `npm test` padrão: 2953/2954, timeout de 10 s no `afterEach` de XMLTV em `scripts/bench/importBench.test.mjs` (arquivo não alterado); isolado 9/9; `npm test -- --hookTimeout 30000` 2954/2954 em 476 arquivos. **Não verificado na TV física.** |
