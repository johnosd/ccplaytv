# Backlog

Painel único de ideias futuras e status de features/bugs geridas pelo
sistema sdd-*. Mantido automaticamente por update-feature-status.ps1 e
update-bug-status.ps1.

## Ideias Futuras

Reorganizado em 2026-09-16. Derivado de `sdd/adr/REQUISITOS-FUNCIONAIS.md`
(RF-001 a RF-019), `sdd/adr/ESPECIFICACAO-TRAILERS.md`, `ADR-001` a
`ADR-007`, e da análise de três conjuntos de documentos: `docs/iptvnator/`
(reuso de um player IPTV maduro), `docs/guia-praticas-app-tv/` (13
relatórios sobre as orientações Samsung/Tizen) e
`docs/design/CCPlayTv Prototype - Standalone.html` (protótipo navegável de
9 telas).

### Como ler esta lista

**A ordem é de dependência, não de desejo.** Cada fase assume a anterior
pronta: sem catálogo real na TV não há o que virtualizar; sem
`PlayerService` não há o que diagnosticar; sem histórico não há hero de
"continuar assistindo". Dentro de uma fase, a ordem é sugerida mas
negociável.

**A numeração mudou nesta revisão** (antes ia de 1 a 32 numa ordem
mista). Referências antigas a "item N" em conversas anteriores não valem
mais — use o título.

**Fonte de cada item** entre parênteses no fim: requisito (RF), decisão
(ADR) ou relatório de origem. Itens sob `A avaliar` são hipóteses sem
evidência própria de demanda e **precisam passar por `sdd-assess`** antes
de virar spec.

**O que já existe hoje**: importação de fonte por URL/provedor ponta a
ponta (feature 001), splash + Home de listas + formulário de adicionar
lista (feature 002), e a Live TV lendo o catálogo real com reprodução via
`PlayerService`/AVPlay (feature 003 — implementada e **verificada na TV
física em 17-18/09/2026**: canal da fonte real reproduzindo com vídeo e
áudio em tela cheia na QN50Q60DAGXZD, fechando a porta V1 da ADR-006). As
telas de **Filmes, Séries e detalhes continuam alimentadas por dados
fictícios**
(`tv-web/src/features/catalog/mockCatalog.ts`).

---

### Fase 0 — Dívidas abertas da fundação (fazer antes de empilhar em cima)

1. **[Entregue em `sdd/specs/004-conector-xtream-live`, convergida em
   18/09/2026 — só a fatia de canais ao vivo]** Conector Xtream JSON
   (`player_api.php`) separado do conector M3U: conector próprio com saída
   normalizada comum, normalização do endereço do servidor, estado de conta
   com fallback de actions, `stream_id` e categorias do provedor
   preservados, formatos derivados de `allowed_output_formats` (preferindo
   TS), modo limitado para painel incompatível, migração única das fontes já
   importadas e atualização por idade (24h) sem re-baixar a cada abertura —
   e corrigiu de caminho um bug pré-existente em que ressincronizar duplicava
   o catálogo inteiro (`_publish_in_batches` nunca removia o job anterior).
   Verificado na TV física (QN50Q60DAGXZD) com fonte real migrada e fonte
   cadastrada do zero pelo controle remoto. **Fica para a fatia seguinte**
   (item ainda sem spec própria): VOD e séries pelo mesmo protocolo, com a
   hierarquia de temporadas/episódios — é o que destrava os itens 9 e 10 —
   além de catch-up.

   Descrição original: hoje o backend monta `get.php?...&type=m3u_plus` e
   reaproveita o parser
   M3U para fontes de provedor, o que **contraria a própria ADR-006 §4.3**
   e descarta `stream_id`/`series_id`/categoria/hierarquia do provedor.
   Inclui: normalizar a URL do servidor (aceitar que o usuário cole
   `get.php`/`player_api.php`/`panel_api.php` sem gerar `{base}/get.php/get.php`),
   resolver status da conta com fallback de actions
   (`get_account_info` → sem action → `get_profile`), e derivar os formatos
   de reprodução de `allowed_output_formats` em vez de fixar `m3u8`.
   Desbloqueia séries com temporadas reais, VOD por categoria e catch-up.
   (RF-005; ADR-004 §2/3/5/6; ADR-006 §4.3 e Incremento B;
   `docs/iptvnator/03-apis.md` #3–6, `06-carga-listas-url-xtream.md` #2–5/#7)

2. **Higiene de credenciais e cobertura das políticas de rede** —
   consolidar a redação de segredos num helper único aplicado a todo log e
   mensagem de erro (nunca interpolar `str(exc)` do httpx, que embute a URL).
   Garantir que o User-Agent de player (VLC) e a política SSRF por hop valham
   em **todas** as aquisições externas — M3U, provedor e TMDB —, não só no
   primeiro request.

   **Nota de escopo (verificado em 2026-09-16)**: o relatório
   `docs/iptvnator/00-resumo.md` recomenda "remover do repositório" as
   credenciais de `docs/m3u/dados.md`. Isso **já foi resolvido durante o
   `sdd-plan` da feature 001**: o arquivo está em `.gitignore` (linha 21),
   não é rastreado pelo git e nunca entrou em nenhum commit. Continua valendo
   a regra de nunca copiar esses valores para código, specs, fixtures,
   commits ou prompts — mas não há exposição em histórico a remediar, e a
   revogação das credenciais não é urgente por esse motivo.
   (ADR-004 §7; constitution "Segredos Fora dos Clientes e dos Logs";
   `docs/iptvnator/03-apis.md` #5/#15/#16;
   `sdd/specs/001-importacao-fonte-m3u/plan.md` → Cuidados para Retomada)

3. **Leitura de catálogo DB-first, com `import_status` por fonte e tipo** —
   abrir uma fonte deve ler do PostgreSQL já importado; só o `resync`
   explícito re-baixa do provedor. Hoje falta o marcador que distingue
   "cache válido" de "frio". Evita carga redundante e torna o resync o
   único gatilho de rede.
   (ADR-002; `docs/iptvnator/06-carga-listas-url-xtream.md` #6)

---

### Fase 1 — MVP: do catálogo real até assistir

4. **Cache local do catálogo na TV (IndexedDB/Dexie)** — leitura imediata
   ao abrir, sem esperar timeout do backend; `CatalogRepository` e
   `UserStateRepository` como repositórios **separados**, para que
   preferências não pertençam ao snapshot substituível do catálogo. Estado
   explícito de conexão/configuração quando não há cache nem backend.
   (ADR-002; ADR-006 §4.2 e Incremento A;
   `docs/iptvnator/02-arquitetura.md` #4)

   **Decisão pendente, a resolver no planejamento deste item** (levantada em
   2026-09-16, deliberadamente adiada): a ADR-002 §1 permite o cache guardar
   "as informações mínimas de reprodução", contemplando reproduzir offline um
   canal já sincronizado; a ADR-002 §5 exige **retenção mínima** de
   credenciais de reprodução e diz que "cache não equivale a cofre de
   segredos". As duas colidem quando a URL de reprodução **é** a credencial —
   caso do Xtream, que embute usuário e senha no caminho
   (`/live/{user}/{pass}/{id}.ts`). Decidir então se fonte com credencial
   embutida na URL simplesmente não tem reprodução offline, e registrar o
   resultado como decisão invariante no `plan.md` ou como emenda de ADR. Não
   bloqueia a feature 003, que mantém a URL só na memória da sessão.

5. **[Parcialmente em `sdd/specs/003-live-tv-avplay`]** `PlayerService` +
   AVPlay (Direct Play) — a feature 003 cria a abstração, o adaptador AVPlay,
   o adaptador `<video>` de desenvolvimento e os estados de sessão. **Fica
   para depois**: o contrato completo de capacidades por motor, a identidade
   lógica de reprodução serializada e o ciclo de vida do item 11.

   Abstração isolando as telas de `webapis.avplay`, com adaptador `<video>`
   só para desenvolvimento.
   Formalizar como **contrato de capacidades / estado / comandos**, para a
   UI nunca oferecer um botão que o motor não suporta, e respeitar a
   máquina de estados real do AVPlay (`NONE`/`IDLE`/`READY`/`PLAYING`/
   `PAUSED`, `prepareAsync`, `seekTo` só em estado permitido). Toda sessão
   de reprodução usa identidade lógica estável (fonte + tipo + id + S/E),
   nunca a URL de stream.
   (ADR-001 §2; ADR-006 Incremento A/B; constitution "Identidade de
   Reprodução Não Depende da URL"; `docs/iptvnator/02-arquitetura.md` #1/#2;
   `docs/guia-praticas-app-tv/12` §1)

6. **[Canais em `sdd/specs/003-live-tv-avplay`]** Ligar Live TV / Filmes /
   Séries ao catálogo real — as três telas e as duas de detalhe já existem e
   navegam por D-pad, mas leem `mockCatalog.ts` e o "player" é um toast.
   Substituir por dados de `/catalog-items` da fonte ativa, mantendo a
   navegação atual. A feature 003 faz **só a parte de canais**; Filmes e
   Séries continuam em mock e saem nos itens 9 e 10.
   (RF-008/009/010; feature 002 deixou explicitamente fora de escopo)

7. **Foco direcional e virtualização de grades** — Norigin Spatial
   Navigation + TanStack Virtual como base de toda navegação por controle
   remoto. Manter a matemática de grade pura e testável (`gridNextIndex` já
   é), com identidade estável por cartão e a sequência explícita "próximo
   índice → deslocar a grade → aguardar montagem → focar" — não confiar no
   algoritmo geométrico achar um nó que ainda não existe no DOM. Conservar
   a coluna preferida ao mover entre linhas incompletas, e separar tecla
   mantida pressionada de múltiplos SELECT (evita reprodução duplicada).
   (ADR-006 §3/§4.1; `docs/iptvnator/01-ui-ux.md` #1/#2;
   `docs/guia-praticas-app-tv/03` §2)

8. **[Parcialmente em `sdd/specs/003-live-tv-avplay`]** Tela de Canais real —
   grid preservando os grupos originais da fonte, com três estados explícitos
   da área de conteúdo: **vazio** (CTA "selecione um canal"), **selecionado**
   (logo grande + nome + slot de "agora") e **reproduzindo** (AVPlay). Focar
   seleciona, Enter reproduz — nunca o inverso. A feature 003 entrega os
   estados, a troca do preview de ruído por informação real e o Enter →
   AVPlay. **Fica para depois**: hand-off direcional com foco real no
   contêiner rolável (para o scroll nativo funcionar), reset e rolagem ao
   topo ao trocar de grupo, lista virtualizada (item 7) e o botão "voltar ao
   canal que está tocando".
   (RF-008; ADR-005 §3; ADR-007 §4/§5;
   `docs/iptvnator/07-tela-canais.md` #1–5/#8)

9. **Tela de Filmes real** — grid virtualizado de pôsteres com fallback de
   arte em cascata (`poster_url` → `cover` → `stream_icon` → placeholder,
   com detecção de URL de "blank icon"), skeleton de mesma geometria do
   card, e empty states **distintos** para "categoria vazia" e "sem
   resultado de busca". Detalhe com hero real (backdrop, sinopse com "ver
   mais" acionável por Enter) e ação primária contextual
   Assistir / Retomar (com posição) / Reiniciar.
   (RF-010; ADR-005 §3; ADR-007 §5/§6;
   `docs/iptvnator/08-tela-filmes.md` #1–7)

10. **Tela de Séries real** — um cartão por série identificada, nunca
    episódio duplicado como série; detalhe com seletor de temporada e lista
    de episódios; quando a hierarquia não for identificável com segurança,
    manter o conteúdo acessível e indicar a limitação, sem inventar
    estrutura.
    (RF-009; ADR-005 §2/§3)

11. **Ciclo de vida do player na TV** — desligar o screensaver durante
    reprodução e reativá-lo ao pausar/parar; tratar `visibilitychange`
    executando o fluxo de interrupção completo (sem áudio residual em
    segundo plano) e revalidando rede/dados expirados ao retomar; impedir
    sessões sobrepostas na troca rápida de canal, descartando callbacks
    atrasados da mídia anterior; salvar progresso em pontos intermediários,
    não só no encerramento; preservar preferência de áudio/legenda quando a
    próxima mídia oferecer equivalente, sem afirmar que a faixa existe
    sempre.
    (`docs/guia-praticas-app-tv/06` §1/§2 e P05/P06;
    `docs/guia-praticas-app-tv/12` API03/API04)

    **Pedido do usuário (18/09/2026, observado na TV durante a convergência
    da 003)**: zapping por cima do vídeo — com o canal em tela cheia,
    pressionar OK traz de volta a lista de canais **sobre** a reprodução;
    escolher outro canal troca o stream; a lista some de novo. Hoje D-010 da
    003 define que no estado `playing` só RETURN age, e a lista fica
    escondida enquanto há vídeo (`video-plane-visible`). Fazer isso exige
    decidir: o que a lista mostra por cima do vídeo e quanto da tela ocupa;
    se o player continua tocando enquanto se navega; o que acontece se o
    canal novo falhar (volta para o anterior ou fica no erro?); e em que
    momento a sessão antiga é encerrada — que é exatamente a "sessão
    sobreposta na troca rápida" deste item. Merece spec própria via
    `sdd-specify`, não ajuste ad-hoc.

12. **Pesquisa nos três tipos** — busca local no catálogo já salvo,
    indicando escopo ativo e cobertura parcial quando offline. Atualizar
    após pausa curta na digitação (~300 ms, a ajustar), cancelar respostas
    antigas quando o termo muda, mover o foco para o primeiro resultado ao
    confirmar, e permitir RETURN voltar ao termo sem apagar o contexto.
    Tratar acentos e caixa de forma consistente. Não enviar todo termo
    digitado a serviço externo por padrão.
    (RF-012; ADR-005 §3; `docs/guia-praticas-app-tv/05` §2)

13. **Favoritos nos três tipos** — persistência local que sobrevive a
    reimportação, por chave estável. Favoritar não marca como assistido nem
    como "gostei".
    (RF-013; ADR-005 §4)

14. **Histórico e "continuar assistindo"** — semântica distinta por mídia:
    filme tem progresso e conclusão; série agrega o avanço dos episódios e
    distingue "em dia"; canal ao vivo registra acesso recente, nunca
    conclusão. Conclusão automática de VOD a partir de ~90% é ponto de
    partida ajustável, com correção manual disponível. Tentativa de play
    com erro não registra visualização.
    (RF-014; ADR-005 §4; `docs/guia-praticas-app-tv/06` §2 e
    `docs/guia-praticas-app-tv/01` §2)

---

### Fase 2 — Qualidade de app de TV

O que separa "web empacotada" de "app de TV". Nenhum item aqui adiciona
função nova; todos mudam a sensação de uso.

15. **Gerenciador central de foco com escopos + RETURN em camadas** — um
    controlador único com escopos (página, menu, diálogo, teclado, player).
    Ao abrir um diálogo, guardar a origem e limitar a navegação à camada
    ativa; ao fechar, devolver o foco ao item que a abriu, ou a uma posição
    de recuperação previamente definida se ele não existir mais. RETURN
    fecha primeiro a camada aberta (menu de áudio/legenda, teclado,
    diálogo) e só então volta na hierarquia — sem encerrar o app por
    propagação indevida do evento. Restaurar foco e posição ao voltar de
    detalhe, player ou trailer, reconciliando por identificador do item e
    não por índice.
    (constitution "Voltar Restaura Foco e Posição"; ADR-006 §4.1;
    `docs/guia-praticas-app-tv/03` §2 e I03/I04/I06;
    `docs/iptvnator/01-ui-ux.md` #7)

16. **Biblioteca de componentes de TV** — `PosterCard` (área reservada por
    `aspect-ratio`, badges de progresso/assistido na base do pôster),
    `ChannelRow` (logo com fallback + nome + slot de "agora" + barra de
    progresso), `EmptyState` e `ErrorState` (ambos com CTA focável),
    `Skeleton` de mesma geometria do item real, e o rail horizontal. Cada
    componente com estados documentados de foco, seleção, indisponibilidade
    e carregamento, todos consumindo os tokens da ADR-007.
    (ADR-007 §5/§6; `docs/guia-praticas-app-tv/04` "Entregáveis de design";
    `docs/iptvnator/01-ui-ux.md` #3/#6, `08-tela-filmes.md` #1/#2/#8)

17. **Home em hero + rails** — hero de "continuar assistindo" (primeiro
    item recente) como primeiro elemento focável, de largura total, com CTA
    que leva direto à retomada; abaixo, rails horizontais em dois layouts
    distintos: `cover` (pôster 2:3, filmes/séries) e `channel` (linha
    compacta com logo, para canais ao vivo) — canais e filmes **não** usam o
    mesmo card. Cada rail resolve seus dados de forma independente, com
    skeleton próprio; rail vazio não renderiza; o foco dirige o scroll
    horizontal (sem chevrons de mouse, sem arrastar); "Ver todos (N)"
    focável no fim de cada rail, com contagem real. Sem listas, o shell da
    Home permanece e só o conteúdo vira empty-state de boas-vindas.
    (`docs/iptvnator/09-dashboard-home.md` #1–6/#8;
    `docs/guia-praticas-app-tv/01` §2)

18. **Detalhe em dois estados: browse ↔ watch** — no estado *browse*, hero
    no topo e episódios/extras abaixo; ao dar play, o hero colapsa numa
    faixa fina e o player domina a tela; RETURN fecha o player e volta ao
    *browse*, não à grade. O foco inicial cai na ação primária.
    (`docs/iptvnator/08-tela-filmes.md` #5/#7)

19. **Entrada de texto conforme o IME da TV** — campo editado nunca coberto
    pelo teclado; `Next` avança entre campos e `Done` conclui o último;
    rótulos permanentes (não só placeholder); senha com máscara e ação
    explícita de exibição temporária, sem alterar automaticamente caixa,
    símbolos ou espaços. Validar antes de conectar e **distinguir os quatro
    erros**: endereço inválido, falha de conexão, autenticação recusada e
    resposta incompatível com o formato esperado — não culpar a senha
    quando o problema é rede. Formulário recuperável durante a tentativa,
    sem submissão duplicada.
    (`docs/guia-praticas-app-tv/05` §1/§2 e E01–E07)

20. **Diagnóstico de reprodução com ações ranqueadas** — falha de stream
    vira um diagnóstico estruturado e sanitizado (sem URL nem credencial)
    que distingue ao menos "falha de rede", "codec não suportado" e "fonte
    expirada", oferecendo no máximo 3 ações focáveis de recuperação. O
    usuário escolhe; nada troca de motor automaticamente, nada marca como
    assistido, nada apaga catálogo. Sem ciclos automáticos infinitos de
    retentativa.
    (`docs/iptvnator/02-arquitetura.md` #6;
    `docs/guia-praticas-app-tv/06` §2 e P04; ADR-005 §3)

21. **Design das telas que o protótipo não cobre** — o protótipo desenha 9
    telas (splash, home de listas, adicionar lista, hub da lista, Live TV,
    grade e detalhe de filmes, grade e detalhe de séries). **Não existe
    desenho** para: player em tela cheia com controles, busca, favoritos,
    "continuar assistindo", seção "Não classificados", progresso de
    importação e estados de erro/offline. Estender o design system da
    ADR-007 a essas superfícies antes de construí-las, em vez de improvisar
    tela a tela.
    (ADR-007; `docs/design/CCPlayTv Prototype - Standalone.html`)

22. **Um dono de scroll por painel + rótulo de escopo explícito** —
    cabeçalhos e tabs fixos, um único elemento rolável por painel, com o
    scroll dirigido pelo foco (focar o próximo cartão e então rolar para
    trazê-lo à vista, nunca o contrário). Com múltiplas fontes, sempre
    exibir o nome da fonte ativa acima da navegação local, distinguir
    "favoritos globais" de "favoritos desta fonte", e dizer o escopo no
    campo de busca ("Buscar nesta fonte").
    (`docs/iptvnator/01-ui-ux.md` #4/#8)

---

### Fase 3 — Mais fontes e qualidade de classificação

23. **Adicionar fonte por arquivo `.m3u`** — seleção via Filesystem/USB na
    TV, validando extensão **e** conteúdo. Os exemplos oficiais Filesystem
    e USBStorage são ponto de partida, não prova de que um seletor HTML
    qualquer funciona em qualquer TV — o README do próprio exemplo avisa
    que leitura/escrita não são demonstradas ali. Envio pareado por celular
    permanece conveniência, não substituto deste caminho.
    (RF-004; ADR-004 §4; `docs/guia-praticas-app-tv/05` §2 e `/13` §1)

24. **Múltiplas fontes simultâneas com refresh isolado** — atualizar várias
    fontes sem duplicar registros nem apagar favoritos/histórico, com
    concorrência limitada (ex.: 3) e isolamento de falha: uma fonte morta
    não segura as demais, e cada uma tem um resultado próprio
    (`atualizada`/`falhou`/`ignorada`) exposto na API. Categorias homônimas
    de fontes diferentes mantêm a origem identificável.
    (RF-007; ADR-004 §6; `docs/iptvnator/06-carga-listas-url-xtream.md` #10)

25. **Reconciliação explícita após resync ("pending restore")** — ao
    substituir um catálogo, reaplicar favoritos, "gostei" e progresso por
    chave estável num passo pós-import, mantendo o snapshot novo **bloqueado
    até a reconciliação terminar** — nunca expor um catálogo sem as
    preferências do usuário. Item que não puder ser reconciliado com
    segurança preserva o estado anterior como indisponível, sem ser
    atribuído a outra obra por aproximação.
    (ADR-005 §2/§4; `docs/iptvnator/06-carga-listas-url-xtream.md` #8/#12)

26. **Contrato de compatibilidade do parser M3U** — cobrir o atributo
    `radio`, a separação de URL e headers no primeiro `|` (com
    `|User-Agent=` / `|Referer=` indo para headers) e a preservação de
    linhas `#KODIPROP` (DRM/ClearKey) antes de `#EXTINF`, com testes de
    contrato contra amostras reais. Manter a detecção de manifesto HLS
    antes da classificação, revisando a lista de tags por fonte real.
    (RF-011; ADR-006 §4.3; `docs/iptvnator/03-apis.md` #1/#2)

27. **Seção "Não classificados"** — itens sem evidência confiável de tipo
    ficam visíveis e acessíveis, com regra de correção reaplicável sem
    perder preferências.
    (RF-011; ADR-005 §2)

28. **Registrar "Gostei" em filmes** — sinal explícito, distinto de
    favorito e de histórico, base das recomendações. Dá para gostar sem
    favoritar e favoritar sem gostar.
    (RF-015; ADR-005 §4)

---

### Fase 4 — Enriquecimento, notas e trailers

29. **Conector TMDB com correspondência conservadora** — `tmdb_id` vindo do
    provedor é dica forte, não verdade: pesar contra título/ano; anos
    incompatíveis significam id contradito e a busca por título assume; 404
    marca o id como morto em vez de suprimir o enriquecimento. Sem id,
    busca normalizada com gate de ano ±1. **Merge por campo com o provedor
    autoritativo** — TMDB preenche só o que falta, nunca sobrescreve título
    de stream, duração ou URL do provedor. Fallback para o idioma original
    quando o payload no idioma do app não traz sinopse (títulos não
    latinos). Cache com `fetched_at` e expiração de 6 meses desde o início,
    conforme os termos do TMDB.
    (RF-016 base; ADR-001 §4; ADR-005 §2; ADR-006 §4.5;
    `docs/iptvnator/03-apis.md` #11–14)

30. **Nota IMDb com procedência** — nota real e origem registrada, com
    "Sem avaliação" para ausências; nunca renomear nota genérica do
    provedor ou do TMDB para "IMDb", nunca gerar nota por IA. Ordenar o
    conjunto filtrado antes de paginar, sem nota no final, desempate
    estável. **Fonte/licença dos dados continua pendente de decisão** e
    bloqueia a entrega do recurso, não o restante do app.
    (RF-016; ADR-005 §5; ADR-006 §4.5;
    `docs/iptvnator/08-tela-filmes.md` #10)

31. **Recomendações a partir de filmes curtidos** — sementes reais de
    "Gostei", candidatos TMDB cruzados com o catálogo próprio, justificativa
    compatível com o método efetivamente usado. Sem sinais, estado vazio
    orientativo — nunca uma justificativa pessoal inventada.
    (RF-017; ADR-005 §6)

32. **Trailers para filmes e séries** — ação "Trailer" na primeira área de
    ações do detalhe; TMDB para descoberta (preferir tipo Trailer, oficial,
    em português; teaser não é rotulado silenciosamente como trailer);
    YouTube IFrame Player API via `TrailerService` **separado** do
    `PlayerService`. Tratar vídeo removido/privado, embedding desabilitado,
    indisponibilidade regional e autoplay bloqueado. Ver um trailer não
    marca a obra como assistida nem altera progresso.
    (RF-019; ESPECIFICACAO-TRAILERS.md; ADR-006 §4.8 e Incremento C)

---

### Fase 5 — Controle remoto por celular e voz

33. **Voz via página web no celular** — pressionar-para-falar com
    `getUserMedia` + `MediaRecorder`, transcrição OpenAI no backend,
    comando com ID e expiração confirmado pelo estado real da TV. Exige
    HTTPS com certificado confiável no celular (acessar IP privado por HTTP
    não herda a exceção de `localhost`). Chaves de API ficam no backend.
    (ADR-001 §4; ADR-006 §4.7 e Incremento D)

34. **Controle remoto por app Android** — WebSocket autenticado, pareamento
    explícito na TV, protocolo com identificação/confirmação/expiração/
    reconexão, e a TV como fonte do estado real. O controle remoto da TV
    permanece operacional durante toda a sessão móvel.
    (ADR-001 §5; ADR-006 Incremento D;
    `docs/guia-praticas-app-tv/07` §2)

---

### Fase 6 — Operação, escala e distribuição

35. **Worker durável de importação** — substituir `BackgroundTasks` por
    processo/fila separado, mantendo `ImportJob.id` como `operationId`
    público (distinto de qualquer id de transporte interno), cancelamento
    cooperativo por lote e progresso observável sem bloquear as rotas
    interativas. A análise do IPTVnator classifica isto como **P0**
    ("heavy operations were freezing the UI"); aqui fica na Fase 6 porque o
    piloto é de uma TV — se a importação real de um catálogo grande
    começar a travar as rotas, este item sobe de fase.
    (ADR-003 §4; ADR-006 §4.4; `docs/iptvnator/02-arquitetura.md` #3/#5;
    `06-carga-listas-url-xtream.md` #11)

36. **Idempotência e dedup de leitura (single-flight)** — a criação de
    fonte/job já é idempotente por `request_key`; falta deduplicar leituras
    de catálogo em voo por `(source_id, tipo)`, para a TV e um refresh
    simultâneo não dispararem dois GETs idênticos.
    (`docs/iptvnator/06-carga-listas-url-xtream.md` #9)

37. **Benchmark determinístico de importação** — fixtures sintéticas de
    1.000/10.000/100.000 entradas servidas em `127.0.0.1`, medindo as fases
    do importer isoladamente (adquirir/parse/classificar/publicar), com
    máquina e commit registrados e sem misturar warm-up. Torna as medições
    comparáveis entre revisões em vez de anedóticas.
    (ADR-006 §2; `docs/iptvnator/02-arquitetura.md` #8)

38. **Migração do backend para VPS** — não é trocar um IP: exige TLS,
    autorização por instalação, backup/restore, persistência de chaves,
    reconexão e **confirmação de que as fontes permitem aquisição a partir
    da VPS** (provedores restringem IP/região).
    (ADR-006 §4.4 e Incremento E)

39. **Matriz de TVs e evidências de compatibilidade** — registrar modelo,
    firmware, `navigator.userAgent`, protocolo, contêiner, codecs,
    resolução, DRM e legendas em cada teste de mídia. Um link importado com
    sucesso só é considerado reproduzível após verificação real no
    aparelho; o emulador encurta o ciclo mas não substitui a TV.
    (ADR-006 E1/V1; `docs/guia-praticas-app-tv/12` §3 e `/13` §3)

40. **Pacote e checklist de lançamento Tizen** — `config.xml`,
    `author-signature.xml` e `signature1.xml` revisados; Tizen ID
    preservado entre atualizações (não confundir com o App ID do portal);
    versão no formato `[0–255].[0–255].[0–65535]` sempre crescente;
    `required_version` coerente com os modelos-alvo; título do pacote igual
    ao título do idioma padrão no portal; **permissões proporcionais ao
    escopo, cada uma justificada**; custódia organizada do certificado de
    assinatura (trocá-lo quebra o caminho de atualização). Bloqueadores
    internos propostos: falha de instalação/atualização, perda sistemática
    de favoritos, importação não testável, áudio em segundo plano, ou
    credencial em log.
    (`docs/guia-praticas-app-tv/10` §1–3)

41. **Materiais de loja e Application UI Description** — logo 1920×1080 PNG
    RGBA (<300 KB), fundo 1920×1080 (<300 KB), ícone 512×423 (<300 KB) e 4
    capturas 1920×1080 JPG (<500 KB cada), produzidas a partir de uma
    versão executável com dados fictícios ou autorizados — nunca telas
    conceituais nem credenciais visíveis. A terceira captura pode não
    aparecer em alguns modelos, então não deve carregar sozinha a
    explicação da função central. O **Application UI Description** no
    template oficial é entregável obrigatório da submissão e precisa ser
    atualizado a cada versão.
    (`docs/guia-praticas-app-tv/02` §1/§2; `/09` §1)

42. **Conta de publicação e abrangência geográfica** — Public Seller publica
    **somente nos EUA**; distribuição no Brasil depende de associação
    Partner Seller aprovada e do acordo correspondente. Confirmar isso
    **antes** de prometer data de lançamento. Definir responsável pela
    conta e pelo acompanhamento das mensagens de revisão, com e-mail
    monitorado pela equipe. Preparar um kit de revisão com fonte de
    demonstração estável e autorizada (um filme, uma série com temporadas,
    alguns canais, um arquivo M3U) e credenciais de teste separadas de
    contas pessoais — um reprodutor sem conteúdo acessível impede a revisão
    de percorrer os casos de uso.
    (`docs/guia-praticas-app-tv/09` §2/§3; `/11` §1/§2)

---

### A avaliar (`sdd-assess`)

Hipóteses trazidas por comparação com outros players IPTV, sem evidência
própria de demanda. Cada uma precisa passar por `sdd-assess`
(Explora → Define → Decide) antes de virar spec.

43. **Portais Stalker/Ministra (STB) como fonte adicional** — protocolo,
    autenticação e mapeamento de catálogo ainda não avaliados. Se for
    aprovado, a lição pronta do IPTVnator é decidir o modo "full" × "simple"
    por **comportamento observado** (handshake + token), nunca pela forma da
    URL, e concentrar isso num predicado canônico único em vez de três
    cópias divergentes.
    (`docs/iptvnator/03-apis.md` #9)

44. **EPG/XMLTV — guia de programação** — grade multi-canal + timeline "ao
    vivo" a partir de uma fonte XMLTV por URL, associada aos canais já
    importados. Padrão de carga recomendado: janela inteira em bulk por
    fonte, com consulta curta só como fallback do canal ativo. Mesmo sem
    EPG, o slot de "agora + progresso" já deve existir no `ChannelRow`
    (item 16).
    (`docs/iptvnator/03-apis.md` #10; `07-tela-canais.md` #3/#8)

45. **TV Archive / Catch-up / Timeshift** — reprodução de conteúdo passado
    da grade de EPG, condicionada ao provedor oferecer o recurso. Duas
    variantes de URL (REST `/timeshift/...` e legado
    `/streaming/timeshift.php?...`) exigem probe concreto com a variante
    vencedora cacheada por fonte, preferindo TS antes de HLS. Depende do
    item 44.
    (`docs/iptvnator/03-apis.md` #8)

46. **Seleção de canal por número (zapping numérico) e teclas de mídia** —
    setas, Enter e Back são detectados sem registro; teclas numéricas,
    CH+/CH− e `MediaPlayPause` exigem `TVInputDevice`, o privilégio
    `tv.inputdevice` e registro explícito. Consultar `getSupportedKeys()`
    antes de depender delas e **não registrar indiscriminadamente todas as
    teclas** — permissões desproporcionais podem bloquear o pré-teste de
    distribuição (item 40).
    (`docs/guia-praticas-app-tv/03` §1; `/10` §2;
    `docs/iptvnator/07-tela-canais.md`, resumo #4)

47. **Enriquecimento TMDB estendido** — elenco e equipe técnica, páginas de
    ator navegáveis, trilha "Similares" e rail de tendências. Sobrepõe-se
    parcialmente ao item 17 (Home em rails): o assessment deve decidir se
    vira uma tela só ou telas separadas. Séries devem usar
    `aggregate_credits`, não `credits`.
    (`docs/iptvnator/03-apis.md` #11; `00-resumo.md`)

48. **Expiração de conta visível na Home** — `exp_date` da conta Xtream
    vira chip passivo no card da fonte (âmbar perto do vencimento, erro
    quando expirado), sem exigir abrir um diálogo. Conta "ativa" com
    `exp_date` no passado é tratada como expirada; valor 0/negativo/ausente
    significa "sem expiração". Depende do item 1.
    (`docs/iptvnator/03-apis.md` #7; `09-dashboard-home.md` #9)

---

### Processo, documentação e qualidade de código

0. **~~[Bug] `ruff check .` falha no backend por `api/delete_sources.py`~~ —
   resolvido em 18/09/2026** (decisão do usuário na Fase 7 da
   `003-live-tv-avplay`, task T052). Era `I001`, bloco de import não
   ordenado; corrigido com `uv run ruff check --fix delete_sources.py`, e
   `uv run ruff check .` passa limpo. **Fica em aberto a segunda metade da
   entrada original**: decidir se esse script utilitário deve continuar
   versionado e lintado junto do pacote, ou mudar para `scripts/` fora dele.
   Vale notar que ele **apaga todas as fontes** via API sem confirmação —
   quem for mexer nisso decide também se é isso mesmo que se quer commitado.

49. **Skills de domínio + mapa de validação por área** — skills curtos
    (~500 palavras) no formato "gatilho + Read First → doc canônico +
    Validation → comando concreto" para player AVPlay, importador M3U e
    navegação D-pad, complementando os 8 skills de processo `sdd-*` que já
    existem. Junto, um mapa do **menor** comando que valida cada área
    (`pytest api/tests/test_...`, `ruff`, `vitest`, `oxlint`) antes de rodar
    a suíte inteira.
    (`docs/iptvnator/04-skills.md` #1–3)

50. **Documentação canônica por subsistema** — conforme cada área ganhar
    corpo, manter **um** documento de arquitetura em `docs/architecture/`
    (importador, player, navegação, cache offline), com racional das
    decisões não óbvias, seção "Related docs" cruzando ADRs/specs e status
    honesto. As ADRs registram decisões; estes documentos registram o
    estado resultante — são camadas complementares. Quando um padrão antigo
    contradisser o novo, rotulá-lo explicitamente como **dívida de migração,
    não precedente**.
    (`docs/iptvnator/05-documentos.md` #1/#2/#4; `04-skills.md` #4;
    constitution "Documentação do Repositório É Canônica")

51. **Fronteiras de código explícitas e limite de tamanho de arquivo** —
    documentar as direções de dependência permitidas (`features/` não
    importa de outro `features/` direto, usa `lib/`; `lib/` não importa
    componentes de UI; no backend, `routers` → `services` → `models`), e
    adotar um limite soft de linhas por arquivo (~300 para TS/React, ~400
    para Python) via configuração de lint. Começar limpo é mais barato do
    que herdar uma baseline.
    (`docs/iptvnator/02-arquitetura.md` #7; `04-skills.md` #5)

52. **Suíte de aceite de UX e percurso de referência** — transformar a
    matriz UX01–UX10 dos guias num conjunto executável, percorrido com
    **fonte vazia, fonte demonstrativa e catálogo volumoso**: instalar,
    abrir sem fonte, configurar, entrar em canais, reproduzir, voltar,
    buscar filme, favoritar, assistir parcialmente, reabrir, continuar e
    remover a fonte — repetindo com falha de rede e dados incompletos. Cada
    execução registra responsável, aparelho, firmware, versão, dados,
    resultado e evidência; um teste não executado fica **"a testar"**, nunca
    "aprovado".
    (`docs/guia-praticas-app-tv/08` §2/§3; `/13` §2)

## Features

| Slug | Título | Status | Progresso | Última Atualização |
| --- | --- | --- | --- | --- |
| 001-importacao-fonte-m3u | Importação de Fonte M3U por URL e por Provedor | Convergida | 63/63 tasks | 2026-09-14 |
| 002-splash-home-perfis | Splash, ícone do app e Home de perfis/listas | Implementada | 22/22 tasks | 2026-09-16 |
| 003-live-tv-avplay | Live TV com catálogo real e reprodução AVPlay | Convergida | 67/67 tasks | 2026-09-18 |
| 004-conector-xtream-live | Conector Xtream JSON para canais ao vivo | Convergida | 55/55 tasks | 2026-09-18 |

## Bugs

| Slug | Título | Fase Atual | Veredito/Status | Próximo Passo | Última Atualização |
| --- | --- | --- | --- | --- | --- |
| tecla-voltar-return-nao-funciona-na | Tecla Voltar (RETURN) não funciona na TV física | Test | verified | Concluído | 2026-09-17 |
| live-tv-toca-audio-sem-imagem | Live TV toca áudio sem imagem na TV física | Test | verified | Concluído | 2026-09-17 |
| enter-controle-remoto-nao-ativa-botoes | Enter do controle remoto não ativa botões em telas de foco DOM nativo | Test | verified | Concluído | 2026-09-18 |

## Melhorias Ad-hoc

| Data | Área | Resumo |
| --- | --- | --- |
