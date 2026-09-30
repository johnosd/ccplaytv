# Backlog

Painel único de ideias futuras e status de features/bugs geridas pelo
sistema sdd-*. Mantido automaticamente por update-feature-status.ps1 e
update-bug-status.ps1.

## Ideias Futuras

**Reescrita em 29/09/2026** numa tabela única com dependências e zonas de
código, para permitir tocar **duas features ao mesmo tempo** sem uma pisar na
outra. O texto longo das revisões anteriores (28/09 e antes) está no
histórico do git; o que era requisito dele foi para a coluna "Escopo".

Fontes: `sdd/adr/REQUISITOS-FUNCIONAIS.md` (RF-001 a RF-019), ADR-001 a
ADR-012, constitution 1.7.0, Design System V14 Spectrum
(`docs/design/design-system/`), `docs/iptvnator/` e
`docs/guia-praticas-app-tv/`.

### Como ler

- **ID é identificador estável, não ordem.** `comingSoon.ts` (campo
  `backlogItem`) e `.planning/migracao-design-system-v14.md` apontam para
  ele. Nunca renumerar. Item novo recebe o próximo número livre (**hoje: 65**).
  Fatias de um item usam letra (`55a`, `62b`).
- **Trilha** agrupa itens que mexem nas mesmas zonas de código. **Dentro de
  uma trilha, um item por vez**, na coluna "Ordem". **Trilhas diferentes
  podem andar em paralelo**, desde que as zonas dos dois itens não se cruzem
  (ver "Regras para trabalhar em paralelo"). Trilhas: **H** hardware e
  medição · **B** bugfix · **P** player e Live · **U** usuário,
  Configurações e acessibilidade · **F** fontes e catálogo · **D**
  descoberta e metadados · **X** transversal · **R** celular e voz · **L**
  qualidade e lançamento · **Doc** processo e documentação.
- **Depende de**: dependência dura (sem ela o item não fecha). `✅` = já
  cumprida. *Itálico* = dependência branda (conversar/combinar um nome, não
  esperar).
- **Estado**: `Pronto` (pode ir para `sdd-specify`), `Bloqueado` (dependência
  dura aberta), `A avaliar` (precisa de `sdd-assess` antes), `Bugfix` (segue
  no painel `## Bugs`), `Verificação` (sem código, só hardware/medição),
  `Entregue`, `Retirado`.
- **Client-first (ADR-008)**: todo item assume que o dado nasce e vive no
  aparelho; chamadas externas só a APIs de terceiro com a chave do próprio
  usuário (BYOK). A pasta `api/` é contorno congelado.
- **Mock → real (ADR-011)**: quem entrega um item apaga o mock
  correspondente de `comingSoon.ts` na mesma feature. Hoje restam **16**.

### Zonas de código

Duas features em paralelo só se os conjuntos de zonas forem **disjuntos**.

| Zona | Arquivos | Observação |
| --- | --- | --- |
| `PLAYER` | `components/PlayerLayer.tsx` (1 094 linhas), `PlayerChrome.tsx`, `chromeControls.ts`, `lib/player/*` | Ponto quente: 6 itens abertos passam aqui. O 49a divide o arquivo antes. |
| `LIVE` | `features/live/LiveScreen.tsx` (1 390 linhas), `features/live/guide/*` | Ponto quente, mesmo caso. |
| `FOCO` | `useRemoteNav`, `lib/focus/*`, `CategoryScreenSnapshot` | Transversal: atinge todas as telas. |
| `CONFIG` | `features/settings/SettingsScreen.tsx` (união `SettingsTab` + cadeias de `if` por aba) | Toda aba nova edita o mesmo trecho. O 63 cria um registro de abas. |
| `FONTE` | `SourcesPanel.tsx`, `ProfilesScreen.tsx`, registro de fonte | Linha da fonte e cartão da lista. |
| `IMPORT` | `lib/catalog/` — `importRunner`, `categoryLoader`, `xtreamConnector`, `m3uParser`, `classifier` | Pipeline de importação e carga sob demanda. |
| `DB` | `lib/catalog/db.ts` (Dexie, hoje **v12**) | Duas features que sobem versão ao mesmo tempo colidem. Reservar a versão na spec. |
| `USER` | `userStateRepository`, hooks de favoritos/histórico/retomada | Estado da pessoa. |
| `DETALHE` | `MovieDetailScreen`, `SeriesDetailScreen`, `lib/metadata/*` | Detalhe de filme/série. |
| `VOD` | `VodCatalogScreen` (Filmes/Séries, `↺ Histórico`) | Grade e trilha lateral. |
| `HOME` | `HomeContent`, `HomeScreen` | Herói, rails, dock. |
| `ERRO` | `ErrorState` e as mensagens de erro de cada tela | Transversal quando se muda a taxonomia. |
| `A11Y` | `index.css` (tokens), `AccessibilityPanel`, `SubtitleOverlay`, `lib/announcer.ts` | Acessibilidade. |
| `FORM` | `AddSourceScreen`, `TextField`, `TmdbKeyScreen` | Entrada de texto. |
| — | nenhuma | Verificação, medição, documento ou decisão. |

### Tabela do backlog

| ID | Item e escopo | Tipo | Estado | Trilha · Ordem | Depende de | Zonas | Remove mocks | Fonte |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **58** | **Passada física dos gates abertos.** Gates obrigatórios: `013` (segurar OK — SC-001; tecla amarela — SC-006; nome `ColorF2Yellow` e privilégio `tvinputdevice` — R-011) e `027` (nomes/`keyCode`s das teclas de mídia, `getSupportedKeys()`, chrome sobre o plano do AVPlay, ↑=anterior/↓=próximo — SC-004). Recomendados: 012, 020 (API do screensaver, R-001), 024–026 (IME real, custo das rails), `029` (formato de `getTotalTrackInfo`/`extra_info`, `setSelectTrack` pausado, `onsubtitlechange`, legenda sobre o plano — R-001–R-004), `030` (`DecompressionStream`, Worker sem fallback, navegação durante sync grande, XMLTV externo), `031` (Guia opaco sobre o AVPlay com áudio, segurar ↓/→, CH±), `033` (contagens SC-001 9/10 e SC-002 10/10, Play/Pause e ←/→, sair do app com trailer, filme + trailer sem áudio duplo — R-015). Aproveitar a sessão para o **spike do 55b**. "Não testado" nunca vira "aprovado". | verificação | Verificação | H · 1 | TV ligada (skill `tizen-tv`) | — | — | constitution "Validação em hardware real"; `plan.md` de 013, 027, 029–031, 033 |
| **62b** | **Desempenho do Guia com milhares de canais** (`031` R-003): a medição real cobriu 2 de 41 categorias no "Todos"; p95 de 128 ms numa amostra pequena não prova o caso grande. Medir com `e2e/epg-guia-completo-real.mjs` ampliado; se falhar, vira correção na trilha P. | verificação | Verificação | H · 2 | — | — | — | `031` R-003 |
| **37** | **Matriz de TVs e evidências de compatibilidade**: modelo, firmware, `userAgent`, protocolo, contêiner, codecs, resolução, DRM e legendas em cada teste de mídia. Hoje só a QN50Q60DAGXZD (Tizen 9.0 / Chromium 120). | verificação | Bloqueado | H · 3 | outro aparelho disponível | — | — | ADR-006 E1/V1; guias `/12` §3, `/13` §3 |
| **49a** | **Dividir `PlayerLayer.tsx` e `LiveScreen.tsx`** (habilitador): extrair em módulos por responsabilidade (sessão, chrome, painéis, zapping, guia) sem mudar comportamento, provado pela suíte e pelos E2E atuais. **Reduz o conflito entre os 6 itens da trilha P** e deixa dois deles andarem juntos. | refatoração | Pronto | P · 1 | — | `PLAYER`, `LIVE` | — | `docs/iptvnator/02-arquitetura.md` #7 |
| **62a** | **Configurar EPG com um canal tocando fecha o player** (`031` R-010): abrir "Configurar EPG" a partir do Guia sobre o vídeo desmonta o `PlayerLayer`. Decidir se preserva a sessão ou se fecha e diz à pessoa. | correção | Pronto | P · 2 | — | `LIVE`, `PLAYER`, navegação (`appNav.ts`) | — | `031` R-010 |
| **55b** | **Qualidade, velocidade, aspecto e preferências do player** (§27.5–§27.7): Auto por padrão e só as resoluções que o stream anuncia; velocidade 0.5×–2.0× só em VOD com `canSeek`; Ajustar/Preencher/Original/Zoom; aba real "Player & reprodução" (idioma preferido de áudio/legenda, aspecto padrão). Soft disabled quando o stream não oferece. | feature | Pronto | P · 3 | 55a ✅; spike na TV (`setDisplayMethod`, `setSpeed`, `getCurrentStreamInfo`) — no 58; 63 | `PLAYER`, `CONFIG` | `player-quality`, `player-speed`, `player-aspect`, `settings-player` | V14 §27/§43; protótipo `playerQualityModal()`… |
| **61** | **Rede e lifecycle completos (§40)**: estados `verificando rede` e `reconectando stream` com UI própria; ao retomar, rede → estado → foco → player só quando seguro; ao ocultar, suspender timers e prefetch e persistir foco; banner offline com `Tentar novamente` focável, bloqueando só o que depende de internet. | feature | Pronto | P · 4 | 020 ✅ | `PLAYER`, `IMPORT` (prefetch), `OfflineBanner`, `lib/onlineStatus.ts` | — (regra §40) | V14 §40; feature 020 |
| **19** | **Erros acionáveis com código + diagnóstico de reprodução** (§45): o que aconteceu, por quê, **uma** ação primária, código discreto (`NET-01`, `SRC-401`, `PLAY-04`, `API-429`). Reprodução distingue rede × codec × fonte expirada/credencial recusada, no máximo 3 ações (Tentar novamente / Info técnica / Editar credenciais). Sem troca de motor sozinha, sem retentativa infinita, diagnóstico sanitizado. Sugerido junto do 61. | feature | Pronto | P · 4 | 55a ✅; *46 (nome do estado "Credencial inválida" e código `SRC-401`)*; *18 (os quatro erros do formulário)* | `ERRO`, `PLAYER`, `IMPORT` | — (regra §45) | V14 §19/§45; guias `/06` §2 |
| **63** | **Registro de abas de Configurações** (habilitador, `sdd-adhoc`): trocar a união `SettingsTab` + cadeias de `if` de `SettingsScreen.tsx` por um registro onde cada aba é um módulo. Depois dele, 55b, 56, 57 e 52 adicionam abas sem editar o mesmo trecho. | refatoração | Pronto | U · 1 | — | `CONFIG` | — | análise de 29/09/2026 |
| **57** | **Limpar histórico e remover item do `↺ Histórico`** (§48.4): remover um item (tecla vermelha na grade ou ação no detalhe); limpar Filmes, Séries ou ambos numa aba nova **Privacidade**, sempre com confirmação (`Modal`) em que a pessoa escolhe se apaga também o progresso (§13.3); não toca em favoritos nem em "assistido"; só a lista ativa. | feature | Planejada — `036-limpar-historico` | U · 2 | *63* | `USER`, `VOD`, `DETALHE`, `CONFIG` (aba nova), `FOCO` (só `useRemoteNav`, tecla vermelha) — `HOME` só relê, `DB` sem bump | — (regra §48.4) | V14 §13.3/§48.4; `025` Fora de Escopo |
| **56** | **Acessibilidade de sistema**: aparência de legenda (tamanho, cor, fundo, contorno, sincronização) com **prévia real**, respeitando as preferências de caption da TV se o Tizen expuser; alto contraste como variação de tokens sem quebrar layout; Voice Guide com anúncios configuráveis sobre a região `aria-live` existente. | feature | Pronto | U · 3 | 55a ✅; *55b (onde fica a preferência de idioma de legenda)*; *63* | `A11Y`, `CONFIG` (aba existente), `PLAYER` (só `SubtitleOverlay`) | `a11y-subtitles`, `a11y-high-contrast`, `a11y-voice-guide` | V14 §31/§38/§39; protótipo `settingsAccessibility()` |
| **18** | **IME da TV (acabamento, §37)**: campo nunca coberto pelo teclado; `Next` avança e `Done` conclui; rótulo permanente; senha com máscara e "mostrar" temporário; **quatro erros** distinguidos (endereço inválido, falha de conexão, autenticação recusada, resposta incompatível); sem submissão duplicada. Confirmar na spec o que 023/026 já cobriram. | feature | Pronto | U · 4 | *19 (mesma taxonomia de erro)* | `FORM` | — | V14 §37; guias `/05` §1/§2 |
| **46** | **Fontes IPTV completas (§24)** na linha de Configurações e no cartão de "Quem está assistindo?", só com dado real: tipo (Xtream/M3U); contagem conhecida, sem "0" para categoria não carregada; sincronização (Sincronizada/Sincronizando/Erro/**Credencial inválida**); chip de EPG (estados já entregues pela 030); `exp_date` da conta Xtream como chip passivo (âmbar perto do vencimento, erro quando expirado; 0/negativo/ausente = sem expiração; "ativa" com data passada = expirada). `xtreamConnector.ts` já lê o `exp_date`: falta persistir e exibir. | feature | Especificada — `034-fontes-estado-expiracao` | F · 1 | *19 (combinar o nome do estado de credencial)* | `FONTE`, `IMPORT` (só o conector), `DB` (campo sem índice — provavelmente sem subir versão), navegação (`appNav.ts`: tela de bloqueio ao escolher a lista) | — (regra §24) | V14 §24; `docs/iptvnator/03-apis.md` #7 |
| **36** | **Dedup/single-flight de importação por fonte**: duas telas ou hooks não disparam o mesmo trabalho de importação ou de categoria. Conferir antes se o FR-017 da 005 já basta (pode virar "Retirado"). | feature | Pronto | F · 2 | — | `IMPORT` | — | `docs/iptvnator/06-carga-listas-url-xtream.md` #9 |
| **24** | **Reconciliação pós-resync ("pending restore")**: reaplicar favoritos, "gostei" e progresso por chave estável num passo pós-import, com o snapshot novo **bloqueado até terminar**; item não reconciliável fica indisponível com o estado anterior, nunca atribuído a outra obra por aproximação. | feature | Pronto | F · 3 | 008 ✅, 013 ✅, 019 ✅; *36*; *27 (se já existir, "gostei" entra na reconciliação)* | `IMPORT`, `USER`, `DB` | — | ADR-005 §2/§4 |
| **23** | **Várias fontes com refresh isolado**: atualizar várias listas sem duplicar registros nem apagar favoritos/histórico, falha isolada e resultado por fonte (`atualizada`/`falhou`/`ignorada`) em Configurações › Fontes IPTV. Navegação continua uma lista por vez (ADR-011). | feature | Bloqueado | F · 4 | 46 (linha da fonte com estado), 24 | `IMPORT`, `FONTE` | — | RF-007; ADR-004 §6 |
| **25** | **Contrato de compatibilidade do parser M3U**: URL e headers separados no primeiro `\|` (`User-Agent`/`Referer` — muitas listas só tocam assim; verificar o que o AVPlay aceita); atributo `radio`; `#KODIPROP` preservado; `tvg-chno` guardado (exibir exige emendar a ADR-011); amostras reais nos testes. | feature | Pronto | F · 5 | spike de header no AVPlay (no 58) | `IMPORT` (`m3uParser`), `PLAYER` (só o adapter AVPlay) | — | RF-011; ADR-006 §4.3 |
| **26** | **Seção "Não classificados"**: itens sem tipo confiável ficam visíveis e acessíveis, com regra de correção reaplicável sem perder preferências. Sem desenho no DS: grade + `EmptyState` do Component Lab. | feature | Pronto | F · 6 | — | `IMPORT` (`classifier`), `VOD`, navegação | — | RF-011; ADR-005 §2 |
| **22a** | **Adicionar lista por arquivo `.m3u`** (Filesystem/USB, `tizen.filesystem`), validando extensão **e** conteúdo, mesmo `m3uParser.ts`. | feature | Pronto | F · 7 | privilégio de filesystem justificado (38) | `FORM`, `IMPORT` (entrada) | — | RF-004; ADR-004 §4 |
| **45** | **Semelhantes, fotos do elenco e página de ator** (a aba Elenco já é real desde a 032): Semelhantes do TMDB marcando o que foi ou não encontrado na lista, foto no Elenco, página de ator com filmografia marcada. Equipe técnica e biografia ficaram fora. | feature | Especificada — `035-semelhantes-elenco-ator` | D · 1 | 28 ✅ | `DETALHE`, `lib/metadata`, navegação (`appNav.ts`: página de ator e pilha de detalhes) | `similar` | `docs/iptvnator/03-apis.md` #11; V14 §32 |
| **27** | **"Gostei" em filmes e séries**: sinal explícito, distinto de favorito e de histórico, persistido por identidade lógica estável. Base do 30. | feature | Pronto | D · 2 | — | `USER`, `DETALHE`, `DB` (se exigir índice) | — | RF-015; ADR-005 §4 |
| **30** | **Recomendações + Curadoria IA na Home**: sementes reais de "Gostei" e histórico, candidatos TMDB cruzados com o catálogo local, justificativa compatível com o método. Sem sinais, estado vazio orientativo, nunca justificativa inventada. | feature | Bloqueado | D · 3 | 27; 28 ✅; *45 (mesma lógica de cruzar TMDB com o catálogo)* | `HOME`, `lib/metadata` | `home-ai-curation` | RF-017; ADR-005 §6; V14 §23 |
| **31** | **"Descobrir com IA" (BYOK OpenAI)**: chat que só consulta o catálogo **real** por function-calling restrito, nunca sugere título fora dele; chamada direta com a chave da pessoa (constitution 1.6.0), configurada em Integrações & BYOK. | feature | Pronto | D · 4 | 032 ✅ (aba Integrações); *30* | módulo novo de IA, `HOME` (dock), `CONFIG` (card em `IntegrationsPanel`) | `dock-ai` | ADR-001 §4; ADR-008 §4; V14 §23 |
| **32** | **Trailer no herói do Início** (resto do item 32; o trailer do detalhe foi entregue pela 033): decidir se o herói ganha um botão "▶ Trailer" reusando a `TrailerLayer`, nunca tocando no foco. Candidato a `sdd-adhoc`. | feature | Pronto | D · 5 | 033 ✅ | `HOME` | `home-trailer` | `033` R-010 |
| **29** | **Nota IMDb com procedência**: nota real com origem, "Sem avaliação" quando faltar, nunca nota genérica renomeada nem gerada por IA; ordenar antes de paginar, sem nota no fim. | feature | Bloqueado | D · 6 | decisão de fonte/licença dos dados (`sdd-assess`/ADR) | `DETALHE`, `VOD` (ordenação) | — | RF-016; ADR-005 §5 |
| **14** | **Memória de foco por área + key repeat** (§41/§42): posição por chave `seção:categoria`, reconciliada por id; Favoritos/Histórico com memória própria; modal devolve foco ao controle que abriu; EPG volta ao canal de origem. `KeyboardEvent.repeat` para segurar a seta sem disparar prefetch/metadata a cada item. **Atinge todas as telas: rodar sozinho, ou fatiar em 14a (key repeat, só `FOCO`) e 14b (memória, por tela).** | feature | Pronto | X · 1 | — | `FOCO`, `LIVE`, `VOD`, `DETALHE` | — (regra §41/§42) | V14 §41/§42; constitution "Voltar Restaura Foco"; ADR-009 |
| **49b** | **Fronteiras de código e limite de tamanho por lint**: `features/` não importa de outro `features/`; `lib/` não importa UI; `lib/catalog/` → `lib/player/` unidirecional; ~300 linhas por arquivo. | processo | Pronto | X · 2 | 49a | transversal (só lint) | — | `docs/iptvnator/02-arquitetura.md` #7 |
| **64** | **Avaliação: canal celular ↔ TV na LAN.** Um web app Tizen não abre socket de escuta: decidir entre service app Tizen, relay ou outro caminho que respeite a ADR-008. Resolve uma vez para 22b, 33 e 34. | avaliação | A avaliar | R · 1 | — | — | — | ADR-008 §5; itens 22/33/34 |
| **22b** | **Conectar a lista pelo celular (QR)**. | feature | Bloqueado | R · 2 | 64 | `FORM`, onboarding | `pair-phone` | RF-004; V14 §46 |
| **33** | **Voz pelo celular (BYOK OpenAI)**: pressionar-para-falar com `getUserMedia` + `MediaRecorder`, transcrição direta do celular, comando com ID e expiração confirmado pelo estado real da TV. | feature | Bloqueado | R · 3 | 64 | busca global, canal LAN | `voice-search` | ADR-001 §4; ADR-008 §4 |
| **34** | **Controle remoto por app Android**: mesma LAN, WebSocket autenticado com pareamento explícito, TV como fonte do estado real, controle físico sempre operacional. | feature | Bloqueado | R · 4 | 64 | canal LAN, `FOCO` | — | ADR-001 §5; ADR-008 §5 |
| **35** | **Benchmark determinístico de importação**: fixtures de 1 000/10 000/100 000 entradas servidas localmente, medindo fetch/parse/classify/store e o parse de XMLTV, com aparelho e commit registrados. | qualidade | Pronto | L · 1 | — | só testes/fixtures | — | ADR-006 §2; V14 §30 |
| **40** | **Conta de publicação e abrangência**: Public Seller publica só nos EUA; Brasil depende de Partner Seller. Confirmar antes de prometer data; kit de revisão com fonte de demonstração e credenciais de teste separadas. | lançamento | Pronto | L · 2 | — | — | — | guias `/09` §2/§3, `/11` |
| **50** | **Suíte de aceite de UX e percurso de referência**: UX01–UX10 dos guias + checklist §46 do DS como conjunto executável, com fonte vazia, demonstrativa e volumosa, repetido com falha de rede; cada execução com responsável, aparelho, firmware e evidência. | qualidade | Bloqueado | L · 3 | as trilhas P, U e F estáveis | `e2e/` | — | V14 §34/§46; guias `/08`, `/13` |
| **38** | **Pacote e checklist de lançamento Tizen**: `config.xml` e assinaturas revisados, Tizen ID preservado, versão crescente, `required_version` coerente, permissões proporcionais e justificadas (teclas de cor/mídia do 57/58, filesystem do 22a), custódia do certificado. Bloqueadores: falha de instalação, perda de favoritos, áudio em segundo plano, credencial em log. | lançamento | Bloqueado | L · 4 | 58, 22a (permissões finais) | `CCPlayTv/config.xml` | — | guias `/10` §1–3 |
| **39** | **Materiais de loja e Application UI Description**: logo, fundo, ícone e 4 capturas nos tamanhos da Samsung, de uma versão executável com dados fictícios ou autorizados, sem credencial à vista. | lançamento | Bloqueado | L · 5 | UI estável (depois do 50) | — | — | guias `/02`, `/09` §1 |
| **48** | **Documentação canônica por subsistema** em `docs/architecture/`: importador, player, navegação, armazenamento local. ADR registra decisão; o documento registra o estado resultante. | processo | Pronto | Doc · 1 | — | só `docs/` | — | `docs/iptvnator/05-documentos.md` |
| **47** | **Skills de domínio + mapa de validação por área** (player AVPlay, importador, navegação D-pad), cada um com "gatilho + leia primeiro + comando de validação". | processo | Pronto | Doc · 2 | *48* | só `.claude/skills` e `.agent/skills` | — | `docs/iptvnator/04-skills.md` |
| **0** | **Destino de `api/delete_sources.py`**: continua versionado junto do pacote congelado ou sai. | processo | Pronto | Doc · 3 | — | `api/` | — | T052 da 003 |
| **43** | **TV Archive / Catch-up / Timeshift**: tocar programa passado a partir do Guia, se o provedor oferecer; duas variantes de URL exigem probe; liberaria Play/Pause em Live (§43.3). | avaliação | A avaliar | — | 031 ✅; `sdd-assess` | `LIVE`, `PLAYER` | — | `docs/iptvnator/03-apis.md` #8 |
| **52** | **Perfis de pessoa e controle parental**: perfis independentes da lista (perfil = lista pela ADR-011), PIN, bloqueio de categoria. Exige migração Dexie do estado da pessoa e decisão de produto. | avaliação | A avaliar | — | `sdd-assess`; *63* | `DB`, `USER`, `CONFIG` | `settings-parental` | V14 §13.3/§48 |
| **53** | **Seções Esportes e Infantil** sem substituir as categorias da fonte (seleção manual de grupos ou regra reversível). Fora da topbar até lá. | avaliação | A avaliar | — | `sdd-assess` | navegação, `VOD`, `LIVE` | — | V14 §13.1; ADR-011 |
| **54** | **Dock: clima e teste de velocidade**. O teste de velocidade tem valor de diagnóstico para stream travando. | avaliação | A avaliar | — | `sdd-assess`; *19* | `HOME`, `CONFIG` | `dock-weather`, `dock-speedtest` | V14 §20/§21 |
| **41** | **Portais Stalker/Ministra (STB)**: protocolo, autenticação, CORS do portal; "full" × "simple" por comportamento observado. | avaliação | A avaliar | — | `sdd-assess` | `IMPORT` | — | `docs/iptvnator/03-apis.md` #9 |
| **51** | **Descarte quando o espaço do aparelho acaba**: descartar a categoria menos usada, parar e declarar (hoje) ou teto configurável. Medir quanto ocupam categoria e XMLTV e a quota real da TV. | avaliação | A avaliar | — | `sdd-assess` com medição | `DB`, `IMPORT` | — | feature 010, Clarifications |
| **17** | **Detalhe em dois estados (browse ↔ watch)**: o DS V14 não adota (player é camada em tela cheia); só se o uso real pedir. | avaliação | A avaliar | — | `sdd-assess` | `DETALHE` | — | `docs/iptvnator/08-tela-filmes.md` #5/#7 |
| 42 | EPG: dados, "Agora" e Guia completo. Pendências no 58 e no 62. Avaliação de EPG externo descartada (`kill`). | feature | Entregue | — | — | — | `settings-epg`, `epg-guide` | `030`, `031` |
| 55a | Áudio, legendas e info do stream. | feature | Entregue | — | — | — | `player-tracks`, `player-info` | `029` |
| 28 | Metadata do provedor + TMDB (BYOK) + Integrações & BYOK + aba Elenco real. Verificada na TV. | feature | Entregue | — | — | — | `settings-integrations`, `dock-tmdb`, `cast` | `032` |
| 32 (detalhe) | Trailer no detalhe de filme e de série, pela página-ponte da ADR-012. Contagens da TV no 58. | feature | Entregue | — | — | — | `trailer` | `033` |
| 20 | Design das telas sem protótipo — resolvido pela migração DS V14; "Não classificados" segue no 26. | — | Retirado | — | — | — | — | 021–028 |
| 21 | Um dono de scroll por painel — absorvido pela virtualização (009), pela 028 e pela fonte ativa única; memória de rolagem segue no 14. | — | Retirado | — | — | — | — | 009, 028 |
| 44 | Teclas de mídia entregues pela 027; a entrada numérica de canal (§44) foi retirada a pedido do usuário em 30/09/2026. | — | Retirado | — | — | — | — | `027` |

### Regras para trabalhar em paralelo

1. **Zonas disjuntas.** Antes de começar a segunda feature, compare a coluna
   "Zonas" dos dois itens. Se cruzarem, escolha outro par ou espere.
2. **Um branch/worktree por feature**, a partir do mesmo commit. Commits de
   documentação (`backlog.md`, `CLAUDE.md`, `README.md`) vão por último no
   merge: os scripts de status reescrevem as linhas do painel `## Features`,
   então rode `update-feature-status.ps1` de novo depois de cada merge.
3. **Reserve o número da feature antes de ramificar.** `new-feature.ps1`
   pega o próximo `NNN` livre olhando `sdd/specs/`; duas especificações em
   branches separados pegam o mesmo número. Rode os dois `sdd-specify` no
   mesmo branch, um depois do outro, e só então separe.
4. **Reserve a versão do Dexie na spec.** Quem precisa subir `db.ts` diz
   "precisa de v13" no `plan.md`; a segunda feature que precisar pega v14 e
   rebaseia depois da primeira.
5. **Habilitadores primeiro, quando o paralelismo depender deles**: 49a
   antes de dois itens da trilha P; 63 antes de dois itens que mexem em abas
   de Configurações.
6. **O item 14 roda sozinho** (ou fatiado), porque atinge o foco de todas as
   telas.

### Pares que podem andar juntos agora

| Par | Por que não se cruzam |
| --- | --- |
| **46** (fontes) ∥ **45** (Semelhantes) | `FONTE`/`IMPORT` × `DETALHE`/`lib/metadata`. **Única sobreposição: `navigation/appNav.ts`** — as duas acrescentam telas ao redutor de navegação (bloqueio da lista × página de ator). Conflito pequeno: quem fizer o merge por último rebaseia. |
| **57** (limpar histórico) ∥ **62a** (Configurar EPG) | `USER`/`VOD`/`DETALHE`/`CONFIG` × `LIVE`/`PLAYER` — ambos podem tocar `appNav.ts`; quem fizer o merge por último rebaseia |
| **55b** (qualidade/velocidade) ∥ **27** (Gostei) | `PLAYER`/`CONFIG` × `USER`/`DETALHE` — depois do 63 e do spike na TV |
| **61 + 19** (rede e erros) ∥ **30** (recomendações) | `PLAYER`/`IMPORT`/`ERRO` × `HOME`/`lib/metadata` |
| **56** (acessibilidade) ∥ **26** (Não classificados) | `A11Y`/`CONFIG` × `IMPORT`/`VOD` |
| **58** (passada na TV) ∥ qualquer um | sem código |

**Sequência sugerida para as próximas duas frentes:**

1. Habilitadores curtos, em paralelo: **49a** (trilha P) ∥ **63** (trilha U).
   (O antigo **62c**, flake do E2E, foi fechado em 30/09/2026 — a causa era o
   script ler o texto sem esperar; ver o painel `## Bugs`. Sobra só o piscar
   de ~60 ms de "Assistir" no detalhe, a olhar na passada do 58.)
2. **46** ∥ **45**, com uma sessão de **58** na TV quando der (inclui o spike
   do 55b e a medição do 62b).
3. **57** ∥ **62a**.
4. **55b** ∥ **27**.
5. **61 + 19** ∥ **30**.
6. **14** sozinho; depois **56** ∥ **26**, e **24 → 23** na trilha F.

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
| 034-fontes-estado-expiracao | Fontes IPTV completas — estado, contagem e expiração da conta | Especificada | N/A | 2026-09-30 |
| 035-semelhantes-elenco-ator | Semelhantes, fotos do elenco e página de ator | Convergida | 62/63 tasks | 2026-09-30 |
| 036-limpar-historico | Limpar histórico e remover item do Histórico | Planejada | 0/43 tasks | 2026-09-30 |
| 037-entrada-listas-prototipo | Entrada fiel ao protótipo — tela de listas e cadastro de lista | Em Execução | 34/50 tasks | 2026-09-30 |
| 038-carga-listas-pre-carga | Carga de listas — progresso claro, pré-carga em segundo plano, contagens e atualização visível | Em Execução | 63/76 tasks | 2026-09-30 |

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

## Melhorias Ad-hoc

| Data | Área | Resumo |
| --- | --- | --- |
| 2026-09-30 | E2E (`tv-web/e2e`, `package.json`) | Dois ajustes de script, sem tocar em `src/`: (1) `filmes-series-ds-v14.mjs` esperava o Trailer como mock "Em breve", desatualizado desde a feature 033 — agora espera o toast "Trailer indisponível para este título" (ou "Consultando trailer") e que nenhuma camada abra; (2) `e2e/modal-temporada.mjs` (bug `modal-temporada-sem-indicador-mais-itens`) entrou no fim de `npm run test:e2e`. Validado: `filmes-series-ds-v14.mjs` passa inteiro, `npm run lint` exit 0. Não incluído (fora do pedido): `filmes-series-ds-v14.mjs` também está fora do `test:e2e`, e foi por isso que a asserção velha passou despercebida. |
