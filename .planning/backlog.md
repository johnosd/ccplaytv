# Backlog

Painel único de ideias futuras e status de features/bugs geridas pelo
sistema sdd-*. Mantido automaticamente por update-feature-status.ps1 e
update-bug-status.ps1.

## Ideias Futuras

Revisado em 2026-09-25 para refletir a convergência das features
`013-favoritos`, `014-m3u-sob-demanda` e `015-capa-real-filmes-series`
(favoritos em canal/filme/série; fonte M3U estrutura-primeiro com detecção
de painel Xtream; capa real de filmes e séries capturada da própria
fonte). A revisão anterior, de 24/09, refletia o progresso da feature
`011-assistir-filme-retomada` (contrato de capacidades, reprodução de
filme, retomada). A de 23/09 refletia a convergência das features 006 a
010 (conector VOD/séries, higiene de credenciais, `UserStateRepository`,
virtualização e carga sob demanda por categoria), e a de 22/09 a
**decisão ADR-008** (arquitetura client-first) e a conclusão da feature
005.
Derivado de `sdd/adr/REQUISITOS-FUNCIONAIS.md` (RF-001 a
RF-019), `sdd/adr/ESPECIFICACAO-TRAILERS.md`, `ADR-001` a `ADR-009`, da
constitution v1.2.0, e da análise de três conjuntos de documentos:
`docs/iptvnator/` (reuso de um player IPTV maduro), `docs/guia-praticas-app-tv/`
(13 relatórios sobre as orientações Samsung/Tizen) e
`docs/design/CCPlayTv Prototype - Standalone.html` (protótipo navegável
de 9 telas).

### Como ler esta lista

**A ordem é de dependência, não de desejo.** Cada fase assume a anterior
pronta: sem contrato de capacidades do motor não há reprodução de VOD; sem
reprodução que informe posição não há progresso confiável; sem histórico
não há hero de "continuar assistindo". Dentro de uma fase, a ordem é
sugerida mas negociável.

**O paradigma mudou na revisão de 22/09.** Com a ADR-008 e a feature 005, o
CCPlayTv é agora um **app client-first**: import de fonte, parsing,
classificação, armazenamento (IndexedDB via Dexie) e reprodução acontecem
inteiramente no aparelho, sem backend sempre-ligado. A pasta `api/`
continua no repositório como contorno congelado (D-007 da feature 005) mas
**não é o caminho principal de nenhuma feature futura**. Todo item deste
backlog assume que o dado nasce e vive no aparelho; chamadas externas são
só a APIs de terceiro (TMDB, OpenAI) com a chave do próprio usuário
(BYOK), nunca a um processo que alguém opere.

**Fonte de cada item** entre parênteses no fim: requisito (RF), decisão
(ADR) ou relatório de origem. Itens sob `A avaliar` são hipóteses sem
evidência própria de demanda e **precisam passar por `sdd-assess`** antes
de virar spec.

**Revisão de 2026-09-24 (pós-012)**: removidos desta lista os itens já
entregues (4, 5, 6 e 9) e o bug de lint resolvido; os itens parcialmente
entregues (7, 8, 13) dizem só o que falta. O item 11 (Favoritos) virou a
feature **013-favoritos**, especificada no mesmo dia.

**Revisão de 2026-09-25 (pós-015)**: item 8 (arte de filmes/séries) —
a parte de capa real foi **entregue** pela feature `015-capa-real-filmes-series`;
só o hero de detalhe (que depende de TMDB, item 28) e itens menores
continuam pendentes. Item 13 (histórico) ganhou a marca "assistido" por
episódio da feature `012-series-episodios-temporadas` — a semântica
agregada por série e o hero da Home continuam pendentes. Itens 16 e 24
tinham "feature 013 (favoritos)" como pré-requisito ainda não cumprido —
**013 convergiu em 24/09/2026**, então esse pré-requisito específico já
está satisfeito; o que falta em cada item é só o que o próprio item ainda
lista. O bug "Botões 'Tentar de novo'/'Voltar' não ativáveis por controle
remoto" foi **corrigido nas três telas de categoria** (Live/Filmes/
Séries) pela feature `014-m3u-sob-demanda` — a entrada ficou só com o que
não foi coberto por essa correção pontual.

**O que já existe hoje** (estado pós-feature 015):
- **Importação client-first ponta a ponta** (feature 005, convergida em
  22/09/2026): o app obtém dados da fonte (provedor Xtream ou URL M3U)
  diretamente do aparelho, interpreta e classifica em Web Worker
  (`tv-web/src/lib/catalog/`), armazena em IndexedDB via Dexie, e serve
  às telas — **sem backend ligado**. Medido na TV física
  QN50Q60DAGXZD: provedor em 10 s, M3U grande (312.936 entradas) em 16 s,
  pico de memória 10 MB.
- **Importação por estrutura + carga sob demanda por categoria** (feature
  010, convergida em 23/09/2026, verificada na TV física): fonte de
  provedor grava só as categorias declaradas; os itens de uma categoria
  são obtidos quando a pessoa entra nela (`categoryLoader.ts`).
  **Substituiu o descarte de VOD/séries da FR-008 da 005**: os três tipos
  são gravados hoje.
- **Fonte M3U também estrutura-primeiro** (feature `014-m3u-sob-demanda`,
  convergida em 24/09/2026, ADR-010): uma URL M3U de painel Xtream
  reconhecido segue a 010 por inteiro; o resto (URL avulsa, painel não
  confirmado, "Modo limitado") guarda o conteúdo já classificado e
  separado por categoria — nunca mais em `channels` durante a
  importação — e lê cada categoria desse conteúdo guardado ao entrar,
  sem rede nova. O selo "Modo limitado" ganhou explicação no hub da
  lista. Faltam só as duas medições de tempo com a lista real do
  usuário (SC-001/SC-002), fora do gate de convergência; ver
  `sdd/specs/014-m3u-sob-demanda/plan.md` → `## Resultado Final`.
- **Favoritos em canal, filme e série** (feature `013-favoritos`,
  convergida em 24/09/2026): segurar OK (ou a tecla amarela, segundo
  caminho achado necessário na TV física) favorita/desfavorita qualquer
  item, com "★ Favoritos" fixo no topo da trilha de categorias das três
  telas. Sobrevive a ressincronização e remoção de fonte. Primeiro
  consumidor real dos favoritos do `UserStateRepository` (feature 008).
- **Capa real de filmes e séries** (feature `015-capa-real-filmes-series`,
  convergida em 25/09/2026, pedido direto do usuário): captura
  `stream_icon`/`cover` (Xtream) e `tvg-logo` (M3U) na importação, com
  fallback ao placeholder de sempre — sem capa declarada ou falha de
  carregamento, nunca o ícone nativo de imagem quebrada. Carregamento
  segue a janela da virtualização (feature 009): nunca a categoria
  inteira de uma vez. Live TV fica de fora, de propósito.
- **Splash + Home de listas + formulário de adicionar lista** (feature
  002).
- **Live TV com catálogo real e reprodução AVPlay** (feature 003,
  verificada na TV física em 17–18/09/2026).
- **Conector Xtream JSON** para canais ao vivo (feature 004) e para VOD e
  séries (feature 006), tudo em TypeScript no aparelho. Inclui
  `fetchSeriesInfo` (temporadas/episódios) — **já implementado e ainda sem
  consumidor**.
- **Live TV, Filmes e Séries categoria-primeiro e virtualizadas** (features
  010 e 009): trilha de categorias + conteúdo obtido ao entrar, sem teto
  de leitura e sem truncamento, com foco sincronizado pelo `useRemoteNav`
  próprio (ADR-009 — Norigin nunca foi instalado). **Nenhum dado fictício
  resta no app**; `mockCatalog.ts` não existe mais.
- **`UserStateRepository`** (feature 008): favoritos, progresso e
  "continuar assistindo" por identidade lógica estável. Favoritos
  continuam sem consumidor; progresso ganhou o primeiro (ver abaixo).
- **URL de reprodução para os três tipos** (`playbackUrl.ts`, feature
  006/007): canal, filme e episódio, cada um no caminho e extensão certos.
  `fetchPlayback` já devolve o `kind` real do item.
- **Reprodução de filme, com contrato de capacidades e retomada** (feature
  `011-assistir-filme-retomada`, 24/09/2026, verificação na TV física em
  andamento): filme abre em tela cheia com play/pause, busca (±10s, com
  barra de progresso focável) e retomada automática, gravada em pontos
  intermediários por identidade estável — primeiro consumidor real do
  `UserStateRepository`. A camada de reprodução (`components/PlayerLayer.tsx`)
  é compartilhada com a Live TV, que não regrediu. Achados só possíveis na
  TV real: a porta que evita saltos sobrepostos na API do motor acumulava
  pedidos em vez de descartar (travava o app ao segurar o controle) e o
  backdrop do detalhe do filme vazava atrás do vídeo — os dois corrigidos.
- **Frescor decidido localmente**: migração de fonte antiga, atualização
  por idade (24 h) e ressincronização explícita — tudo no aparelho.
- **Detecção de provedor sem CORS**: explicação distinta de "sem
  internet" e "senha errada".

**Fechado em 24/09/2026**: filme e episódio de série já reproduzem os
dois. A lacuna de "episódio de série ainda não" (`SeriesDetailScreen` sem
episódios, `fetchSeriesInfo` sem consumidor) foi fechada pela feature
`012-series-episodios-temporadas` (código completo nas 4 user stories,
suíte automatizada limpa; verificação na TV física é recomendada, não
obrigatória — ver `Estado Atual` da spec; detalhamento em
`sdd/specs/012-series-episodios-temporadas/`). Ver o item 13 para o que continua fora de escopo (semântica
de "assistido" agregada por série, hero de "continuar assistindo").

**O que não existe mais**:
- O backend Python/FastAPI **não é mais o caminho principal**. Continua no
  repositório como contorno congelado para provedor sem CORS (ADR-008
  item 6, FR-021). Nenhuma feature futura deve assumir o backend como
  pré-requisito de uso.
- O PostgreSQL **não é mais a fonte de verdade do catálogo**. O IndexedDB
  no aparelho é.

---

### Fase 1 — MVP: do catálogo real até assistir

7. **Tela de Canais — melhorias pendentes da feature 003**

   A feature 003 entregou a tela com três estados (vazio, selecionado,
   reproduzindo), troca do preview de ruído por informação real e Enter →
   AVPlay. As features 009 e 010 entregaram a lista virtualizada e o reset
   ao trocar de categoria.

   **Especificada como feature `016-zapping-live-tv`** (25/09/2026): o
   zapping por cima do vídeo e o "botão voltar ao canal que está tocando"
   (que só fazia sentido dado o zapping — virou o próprio RETURN da lista
   sobreposta, com foco padrão no canal tocando, não um botão à parte).

   **Saiu de escopo, considerado já resolvido**: hand-off direcional de
   foco no contêiner rolável — a lista de canais já tem scroll
   sincronizado ao foco (`scrollToIndex`, feature 009), sem gap
   conhecido.

   (RF-008; ADR-005 §3; ADR-007 §4/§5;
   `docs/iptvnator/07-tela-canais.md` #1–5/#8)

8. **Filmes: arte e detalhe real**

   **Já entregue** (features 009/010): a grade virtualizada de pôsteres por
   categoria, com contagem real e empty state de categoria.

   **Já entregue pela feature 011**: Assistir/Retomar/Reiniciar, controles
   de VOD e retomada por identidade estável.

   **Entregue pela feature `015-capa-real-filmes-series`** (convergida em
   25/09/2026, pedido direto do usuário — percebeu que nenhuma capa
   carrega): captura de `stream_icon`/`cover` (Xtream) e `tvg-logo` (M3U)
   para filme e série, guardada no catálogo local, exibida nas grades de
   Filmes e Séries com fallback ao placeholder atual (sem capa declarada,
   ou falha de carregamento — nunca o ícone nativo de imagem quebrada).
   Deixou fora de escopo, de propósito: Live TV, detecção de "capa em
   branco", e o hero de detalhe (abaixo, que depende de TMDB).

   **Entregue pela feature `017-busca-local-catalogo`** (25/09/2026):
   empty state de "sem resultado de busca", distinto do de categoria vazia
   — nas três telas (Live TV, Filmes, Séries).

   **Continua fora de escopo, depende de outros itens**:
   - Skeleton de mesma geometria do card.
   - Detalhe com hero real (backdrop, sinopse com "ver mais" acionável por
     Enter). Sem TMDB (item 28) a sinopse não existe na fonte — hoje a tela
     diz isso em vez de inventar.

   **Nota client-first**: os dados vêm do IndexedDB local, não de API
   REST. A leitura paginada por grupo já existe em `catalogRepository`.

   (RF-010; ADR-005 §3; ADR-007 §5/§6;
   `docs/iptvnator/08-tela-filmes.md` #1–7)

10. **Ciclo de vida do player na TV**

    **Especificada como feature `020-ciclo-vida-player`** (26/09/2026):
    desligar screensaver durante reprodução (religa ao pausar/encerrar),
    pausa automática ao ocultar o app (`visibilitychange`) com revalidação
    da URL de reprodução ao voltar a ficar visível, e tratamento de
    conclusão detectada ao voltar como conclusão normal. Preservar
    preferência de áudio/legenda ficou **fora do escopo** — não existe
    seletor de faixa hoje, decisão explícita do usuário na entrevista. Ver
    `sdd/specs/020-ciclo-vida-player/spec.md`.

    **O zapping por cima do vídeo** (pedido do usuário, 18/09/2026,
    observado na TV durante a convergência da 003) **virou a feature
    `016-zapping-live-tv`** (especificada em 25/09/2026), com todas as
    decisões de design já resolvidas lá (o que a lista mostra, se o
    player continua tocando, o que fazer se o canal novo falhar, quando
    a sessão antiga encerra). **"Impedir sessões sobrepostas na troca
    rápida de canal" também saiu daqui** — na prática só acontece através
    do zapping (a navegação normal não permite reselecionar rápido com
    um canal já tocando), então virou FR-009/SC-003 da 016, não uma
    pendência solta deste item.

    **Nota client-first**: o progresso é gravado no `UserStateRepository`
    (feature 008), não num banco remoto. A revalidação de dados expirados ao
    retomar consulta `freshness.ts` (já existente).

    (`docs/guia-praticas-app-tv/06` §1/§2 e P05/P06;
    `docs/guia-praticas-app-tv/12` API03/API04)

12. **Pesquisa nos três tipos**

    **Virou a feature `017-busca-local-catalogo`** (especificada em
    25/09/2026): entrada "🔍 Buscar" no topo da trilha de cada seção,
    busca por nome só no que já está no aparelho (nunca no provedor), a
    partir de 3 caracteres, com aviso "busca em X de Y categorias" quando
    a cobertura for parcial. Ficaram fora de escopo, de propósito: busca
    global no hub, achar categorias pelo nome, buscar episódios, buscar
    no provedor pela rede para ampliar a cobertura, e teclado próprio
    (item 18). Ver `sdd/specs/017-busca-local-catalogo/spec.md`.

    (RF-012; ADR-005 §3; `docs/guia-praticas-app-tv/05` §2)

13. **Histórico e "continuar assistindo"**

    **O repositório já existe** (feature 008): `updateProgress` e
    `getContinueWatching` prontos e testados. **A feature
    `011-assistir-filme-retomada` (24/09/2026)** é o primeiro consumidor
    real: `progressRecorder.ts` grava a posição de filme em pontos
    intermediários, com limiar inicial (~30s) e final (apaga ao
    ultrapassar ~95% ou concluir de verdade). **A feature
    `012-series-episodios-temporadas` (24/09/2026)** somou o segundo
    consumidor: marca "assistido" por episódio, independente da retomada
    do episódio em si e do resumo de filme.

    **A parte que faltava virou a feature `019-historico-continuar-
    assistindo`** (especificada em 26/09/2026): filme concluído passa a
    ficar marcado como assistido de verdade (hoje só perde o progresso,
    ~90%, com correção manual no detalhe); série ganha agregação "em dia"
    exposta na grade (só quando a cobertura de episódios for completa,
    nunca escondendo cobertura parcial); e uma seção "Continuar
    assistindo" aparece no hub da fonte (não na Home de múltiplas listas,
    que continua sendo o item 16). Canal ao vivo e marcação em lote de
    episódios ficaram de propósito fora do escopo dessa feature. Ver
    `sdd/specs/019-historico-continuar-assistindo/spec.md`.

    (RF-014; ADR-005 §4; `docs/guia-praticas-app-tv/06` §2 e
    `docs/guia-praticas-app-tv/01` §2)

---

### Fase 2 — Qualidade de app de TV

O que separa "web empacotada" de "app de TV". Nenhum item aqui adiciona
função nova; todos mudam a sensação de uso.

14. **Gerenciador central de foco com escopos + RETURN em camadas**

    Um controlador único com escopos (página, menu, diálogo, teclado,
    player). Ao abrir um diálogo, guardar a origem e limitar a navegação
    à camada ativa; ao fechar, devolver o foco ao item que a abriu, ou a
    uma posição de recuperação se ele não existir mais. RETURN fecha
    primeiro a camada aberta (menu de áudio/legenda, teclado, diálogo) e
    só então volta na hierarquia — sem encerrar o app por propagação
    indevida. Restaurar foco e posição ao voltar de detalhe, player ou
    trailer, reconciliando por identificador do item e não por índice.

    (constitution "Voltar Restaura Foco e Posição"; ADR-006 §4.1;
    `docs/guia-praticas-app-tv/03` §2 e I03/I04/I06;
    `docs/iptvnator/01-ui-ux.md` #7)

15. **Biblioteca de componentes de TV**

    **Primeiro passo real, feature 015**: `PosterArt`
    (`tv-web/src/components/PosterArt.tsx`) já reserva área por
    `aspect-ratio`, mostra a capa real com fallback seguro (placeholder
    sem capa, nunca o ícone nativo de imagem quebrada) e aceita overlay
    (`children`, hoje só `.fav-star`). Falta o resto do `PosterCard`
    completo:
    - Badges de progresso/assistido na base do pôster (depende do item 13,
      que ainda não persiste "assistido" agregado nem progresso de filme
      exposto como badge visual).
    - `ChannelRow`: logo com fallback + nome + slot de "agora" + barra de
      progresso.
    - `EmptyState` e `ErrorState`: ambos com CTA focável.
    - `Skeleton`: mesma geometria do item real.
    - Rail horizontal.

    Cada componente com estados documentados de foco, seleção,
    indisponibilidade e carregamento, todos consumindo os tokens da
    ADR-007.

    (ADR-007 §5/§6; `docs/guia-praticas-app-tv/04` "Entregáveis de
    design"; `docs/iptvnator/01-ui-ux.md` #3/#6,
    `08-tela-filmes.md` #1/#2/#8)

16. **Home em hero + rails**

    - Hero de "continuar assistindo" (primeiro item recente) como primeiro
      elemento focável, de largura total, com CTA para retomada direta.
    - Abaixo, rails horizontais em dois layouts distintos: `cover`
      (pôster 2:3, filmes/séries) e `channel` (linha compacta com logo).
    - Cada rail resolve seus dados de `catalogRepository` de forma
      independente, com skeleton próprio; rail vazio não renderiza.
    - Foco dirige o scroll horizontal (sem chevrons de mouse, sem
      arrastar).
    - "Ver todos (N)" focável no fim de cada rail, com contagem real.
    - Sem listas, o shell da Home permanece e só o conteúdo vira
      empty-state de boas-vindas.

    **Pré-requisitos**: feature 013 (favoritos) — **já entregue,
    convergida em 24/09/2026** — e o restante do item 13 (histórico
    agregado por série + hero) para o hero funcionar.

    (`docs/iptvnator/09-dashboard-home.md` #1–6/#8;
    `docs/guia-praticas-app-tv/01` §2)

17. **Detalhe em dois estados: browse ↔ watch**

    No estado *browse*, hero no topo e episódios/extras abaixo; ao dar
    play, o hero colapsa numa faixa fina e o player domina a tela; RETURN
    fecha o player e volta ao *browse*, não à grade. Foco inicial na ação
    primária.

    (`docs/iptvnator/08-tela-filmes.md` #5/#7)

18. **Entrada de texto conforme o IME da TV**

    - Campo editado nunca coberto pelo teclado.
    - `Next` avança entre campos e `Done` conclui o último.
    - Rótulos permanentes (não só placeholder).
    - Senha com máscara e ação explícita de exibição temporária, sem
      alterar automaticamente caixa, símbolos ou espaços.
    - Validar antes de conectar e **distinguir os quatro erros**:
      endereço inválido, falha de conexão, autenticação recusada e
      resposta incompatível com o formato esperado — não culpar a senha
      quando o problema é rede.
    - Formulário recuperável durante a tentativa, sem submissão duplicada.

    **Nota client-first**: a validação de credencial é um `fetch()` direto
    do aparelho ao painel; a distinção de erros já está em
    `xtreamConnector.ts` (feature 005, FR-011).

    (`docs/guia-praticas-app-tv/05` §1/§2 e E01–E07)

19. **Diagnóstico de reprodução com ações ranqueadas**

    Falha de stream vira diagnóstico estruturado e sanitizado (sem URL nem
    credencial) que distingue ao menos "falha de rede", "codec não
    suportado" e "fonte expirada", oferecendo no máximo 3 ações focáveis
    de recuperação. O usuário escolhe; nada troca de motor
    automaticamente, nada marca como assistido, nada apaga catálogo. Sem
    ciclos automáticos infinitos de retentativa.

    **Nota client-first**: a sanitização usa o mesmo helper do item 2.

    (`docs/iptvnator/02-arquitetura.md` #6;
    `docs/guia-praticas-app-tv/06` §2 e P04; ADR-005 §3)

20. **Design das telas que o protótipo não cobre**

    O protótipo desenha 9 telas (splash, home de listas, adicionar lista,
    hub da lista, Live TV, grade e detalhe de filmes, grade e detalhe de
    séries). **Não existe desenho** para: player em tela cheia com
    controles, busca, favoritos, "continuar assistindo", seção "Não
    classificados", progresso de importação e estados de erro/offline.
    Estender o design system da ADR-007 a essas superfícies antes de
    construí-las, em vez de improvisar tela a tela.

    (ADR-007; `docs/design/CCPlayTv Prototype - Standalone.html`)

21. **Um dono de scroll por painel + rótulo de escopo explícito**

    Cabeçalhos e tabs fixos, um único elemento rolável por painel, com
    scroll dirigido pelo foco (focar o próximo cartão e então rolar para
    trazê-lo à vista, nunca o contrário). Com múltiplas fontes, sempre
    exibir o nome da fonte ativa acima da navegação local, distinguir
    "favoritos globais" de "favoritos desta fonte", e dizer o escopo no
    campo de busca ("Buscar nesta fonte").

    (`docs/iptvnator/01-ui-ux.md` #4/#8)

---

### Fase 3 — Mais fontes e qualidade de classificação

22. **Adicionar fonte por arquivo `.m3u`**

    Seleção via Filesystem/USB na TV, validando extensão **e** conteúdo.

    **Entregáveis**:
    - Uso da API `tizen.filesystem` (ou Tizen File API) para leitura do
      arquivo.
    - Parsing do arquivo local via o mesmo `m3uParser.ts` (feature 005).
    - Armazenamento no IndexedDB via `catalogRepository`.
    - Testes contra os exemplos oficiais Filesystem e USBStorage — o
      README avisa que leitura/escrita não são demonstradas ali.
    - Envio pareado por celular como conveniência, não substituto.

    **Nota client-first**: não há upload para backend. O arquivo é lido
    diretamente no aparelho.

    (RF-004; ADR-004 §4; `docs/guia-praticas-app-tv/05` §2 e `/13` §1)

23. **Múltiplas fontes simultâneas com refresh isolado**

    - Atualizar várias fontes sem duplicar registros nem apagar
      favoritos/histórico.
    - Concorrência limitada (ex.: 3 imports simultâneos no IndexedDB).
    - Isolamento de falha: uma fonte morta não segura as demais.
    - Cada fonte tem resultado próprio
      (`atualizada`/`falhou`/`ignorada`) exposto na interface.
    - Categorias homônimas de fontes diferentes mantêm a origem
      identificável.

    **Nota client-first**: a concorrência agora é dentro do mesmo
    aparelho (Web Workers ou importações sequenciais). O isolamento é por
    geração no IndexedDB (D-004 da 005).

    (RF-007; ADR-004 §6;
    `docs/iptvnator/06-carga-listas-url-xtream.md` #10)

24. **Reconciliação explícita após resync ("pending restore")**

    Ao substituir um catálogo, reaplicar favoritos, "gostei" e progresso
    por chave estável num passo pós-import, mantendo o snapshot novo
    **bloqueado até a reconciliação terminar** — nunca expor um catálogo
    sem as preferências do usuário.

    **Nota client-first**: a reconciliação é local: lê de
    `userStateRepository` e aplica sobre a nova geração no IndexedDB.
    Item que não puder ser reconciliado com segurança preserva o estado
    anterior como indisponível, sem ser atribuído a outra obra por
    aproximação.

    **Pré-requisitos**: feature 008 (`UserStateRepository`) e feature 013
    (favoritos) — **as duas já entregues** — e o item 13 (histórico).

    (ADR-005 §2/§4;
    `docs/iptvnator/06-carga-listas-url-xtream.md` #8/#12)

25. **Contrato de compatibilidade do parser M3U**

    O parser M3U em TypeScript (`m3uParser.ts`, feature 005) já trata
    BOM, atributos com vírgula/aspas, entrada sem URL e manifesto HLS.
    Falta cobrir:
    - Atributo `radio`.
    - Separação de URL e headers no primeiro `|` (com `|User-Agent=` /
      `|Referer=` indo para headers).
    - Preservação de linhas `#KODIPROP` (DRM/ClearKey) antes de `#EXTINF`.
    - Detecção de manifesto HLS — já implementada (`is_hls_manifest`),
      revisar a lista de tags por fonte real.
    - Testes de contrato contra amostras reais adicionais.

    (RF-011; ADR-006 §4.3; `docs/iptvnator/03-apis.md` #1/#2)

26. **Seção "Não classificados"**

    Itens sem evidência confiável de tipo ficam visíveis e acessíveis
    (`classifier.ts` já preserva o caminho "não classificado"), com regra
    de correção reaplicável sem perder preferências.

    (RF-011; ADR-005 §2)

27. **Registrar "Gostei" em filmes**

    Sinal explícito, distinto de favorito e de histórico, base das
    recomendações. Dá para gostar sem favoritar e favoritar sem gostar.
    Persistido em `userStateRepository`.

    **Pré-requisitos**: feature 008 (`UserStateRepository`) — já entregue.

    (RF-015; ADR-005 §4)

---

### Fase 4 — Enriquecimento, notas e trailers

28. **Conector TMDB client-first (BYOK)**

    `tmdb_id` vindo do provedor é dica forte, não verdade: pesar contra
    título/ano; anos incompatíveis significam id contradito e a busca por
    título assume; 404 marca o id como morto em vez de suprimir o
    enriquecimento.

    **Decisão client-first (ADR-008 §3)**: TMDB é chamado **direto do
    aparelho** com a **chave do próprio usuário** (BYOK). TMDB é
    CORS-friendly por design — não há bloqueio técnico.

    **Entregáveis**:
    - `tmdbConnector.ts` em `tv-web/src/lib/catalog/` — chamada direta à
      API TMDB v3 via `fetch()` do aparelho.
    - Tela de configuração para o usuário informar sua chave TMDB
      (armazenada no `sourceRepository` ou em coleção Dexie separada,
      com a mesma política de segredo da credencial de provedor).
    - Merge por campo: TMDB preenche **só o que falta**, nunca
      sobrescreve título de stream, duração ou URL do provedor.
    - Fallback para idioma original quando o payload em português não traz
      sinopse (títulos não latinos).
    - Cache com `fetched_at` e expiração de 6 meses, conforme os termos
      do TMDB.
    - Busca normalizada com gate de ano ±1 quando não há `tmdb_id`.

    (RF-016 base; ADR-001 §4; ADR-005 §2; ADR-006 §4.5; ADR-008 §3;
    `docs/iptvnator/03-apis.md` #11–14)

29. **Nota IMDb com procedência**

    Nota real e origem registrada, com "Sem avaliação" para ausências;
    nunca renomear nota genérica do provedor ou do TMDB para "IMDb", nunca
    gerar nota por IA. Ordenar o conjunto filtrado antes de paginar, sem
    nota no final, desempate estável. **Fonte/licença dos dados continua
    pendente de decisão** e bloqueia a entrega do recurso, não o restante
    do app.

    (RF-016; ADR-005 §5; ADR-006 §4.5;
    `docs/iptvnator/08-tela-filmes.md` #10)

30. **Recomendações a partir de filmes curtidos**

    Sementes reais de "Gostei", candidatos TMDB cruzados com o catálogo
    próprio (lido do IndexedDB local), justificativa compatível com o
    método usado. Sem sinais, estado vazio orientativo — nunca
    justificativa pessoal inventada.

    **Nota client-first**: o cruzamento entre TMDB e catálogo local é
    feito no aparelho.

    (RF-017; ADR-005 §6)

31. **Recomendação conversacional via chat com IA (BYOK OpenAI)**

    Chat de texto onde o usuário pede recomendações em linguagem natural
    ("um filme de ação dos anos 90", "algo parecido com X que já assisti")
    e a IA responde cruzando com o catálogo **real** já importado (lido do
    IndexedDB), nunca sugerindo título que a pessoa não tem acesso.

    **Decisão client-first (ADR-008 §4)**: chamada **direta à API da
    OpenAI** com a **chave do próprio usuário** (BYOK). Não exige manter
    processo no ar — é chamada sob demanda, paga pela conta OpenAI de cada
    usuário.

    **Entregáveis**:
    - `openaiConnector.ts` em `tv-web/src/lib/` — function-calling
      restrito a consultar o catálogo local (busca por gênero/ano/
      similaridade/já assistido), nunca a inventar título fora dele.
    - Tela de configuração para o usuário informar sua chave OpenAI.
    - Mesma regra: "IA Nunca Inventa Dados" da constitution.

    **Ressalva futura**: se o produto decidir oferecer chave
    compartilhada/gratuita, **só essa chave** precisaria de intermediário
    (backend) para não vazar. Hoje não é o caso.

    (ADR-001 §4; ADR-008 §4; ADR-005 §6; constitution "IA e
    Classificação Nunca Inventam Dados")

32. **Trailers para filmes e séries**

    Ação "Trailer" na primeira área de ações do detalhe; TMDB para
    descoberta (preferir tipo Trailer, oficial, em português; teaser não é
    rotulado silenciosamente como trailer); YouTube IFrame Player API via
    `TrailerService` **separado** do `PlayerService`. Tratar vídeo
    removido/privado, embedding desabilitado, indisponibilidade regional e
    autoplay bloqueado. Ver um trailer não marca a obra como assistida nem
    altera progresso.

    **Nota client-first**: a descoberta do trailer é via TMDB (BYOK,
    item 28); a reprodução é via YouTube IFrame API no próprio aparelho.

    (RF-019; ESPECIFICACAO-TRAILERS.md; ADR-006 §4.8 e Incremento C)

---

### Fase 5 — Controle remoto por celular e voz

33. **Voz via página web no celular (BYOK OpenAI)**

    Pressionar-para-falar com `getUserMedia` + `MediaRecorder`,
    transcrição OpenAI **direta do celular** com a chave do próprio
    usuário (BYOK), comando com ID e expiração confirmado pelo estado real
    da TV.

    **Mudança client-first**: na ADR-008, voz/OpenAI é client-first com
    BYOK. O celular chama a API OpenAI diretamente (a chave é do
    usuário), e envia o resultado (texto transcrito) para a TV via
    conexão local (WebSocket ou similar). **Não exige HTTPS com
    certificado confiável para chamar a API OpenAI** (o `fetch()` do
    celular para `api.openai.com` já usa HTTPS da própria OpenAI). A
    comunicação celular→TV pode ser via WebSocket local (mesmo da LAN).

    **Ressalva**: se no futuro o produto oferecer chave compartilhada,
    aí sim precisará de intermediário.

    (ADR-001 §4; ADR-006 §4.7 e Incremento D; ADR-008 §4)

34. **Controle remoto por app Android**

    **Decisão client-first (ADR-008 §5)**: restrito a mesma-LAN por
    padrão. A TV funciona como servidor local (descoberta tipo mDNS/SSDP).
    Controle fora da LAN como extensão futura condicionada a demanda real.

    **Entregáveis**:
    - WebSocket autenticado com pareamento explícito na TV.
    - Protocolo com identificação/confirmação/expiração/reconexão.
    - TV como fonte do estado real.
    - Controle remoto da TV permanece operacional durante toda a sessão
      móvel.

    (ADR-001 §5; ADR-006 Incremento D; ADR-008 §5;
    `docs/guia-praticas-app-tv/07` §2)

---

### Fase 6 — Qualidade, distribuição e lançamento

> **Nota de revisão**: com a arquitetura client-first, vários itens da
> antiga Fase 6 perderam sentido ou mudaram de natureza. Itens como
> "worker durável de importação", "dedup de leitura" e "migração do
> backend para VPS" **presumiam um backend compartilhado** — o que não
> existe mais. A feature 005 já usa Web Worker para importação no
> aparelho, e cada instalação processa só o próprio catálogo.

35. **Benchmark determinístico de importação client-side**

    Fixtures sintéticas de 1.000/10.000/100.000 entradas servidas
    localmente, medindo as fases do `importPipeline.ts` isoladamente
    (fetch/parse/classify/store), com aparelho e commit registrados e sem
    misturar warm-up.

    **Nota client-first**: substitui o antigo benchmark de backend. O
    gate de performance da feature 005 já mediu na TV real (10 s
    provedor, 16 s M3U grande), mas sem fixtures determinísticas para
    comparação entre revisões.

    (ADR-006 §2; `docs/iptvnator/02-arquitetura.md` #8)

36. **Idempotência e dedup de importação por fonte**

    A criação de fonte já é idempotente; falta deduplicar importações em
    voo por `sourceId`, para duas telas ou dois hooks não dispararem dois
    imports idênticos.

    **Nota client-first**: no aparelho, o mecanismo é local
    (`importRuns` no IndexedDB com status `running` por fonte). Já existe
    FR-017 da feature 005 ("NÃO DEVE existir mais de uma importação
    simultânea para a mesma fonte") — verificar se a cobertura é
    suficiente ou se precisa de single-flight para leitura de catálogo
    também.

    (`docs/iptvnator/06-carga-listas-url-xtream.md` #9)

37. **Matriz de TVs e evidências de compatibilidade**

    Registrar modelo, firmware, `navigator.userAgent`, protocolo,
    contêiner, codecs, resolução, DRM e legendas em cada teste de mídia.
    Um link importado com sucesso só é considerado reproduzível após
    verificação real no aparelho; o emulador encurta o ciclo mas não
    substitui a TV.

    **Estado atual**: apenas QN50Q60DAGXZD (Tizen 8.0 / Chromium 108)
    testada.

    (ADR-006 E1/V1; `docs/guia-praticas-app-tv/12` §3 e `/13` §3)

38. **Pacote e checklist de lançamento Tizen**

    - `config.xml`, `author-signature.xml` e `signature1.xml` revisados.
    - Tizen ID preservado entre atualizações.
    - Versão no formato `[0–255].[0–255].[0–65535]` sempre crescente.
    - `required_version` coerente com os modelos-alvo.
    - Título do pacote igual ao título do idioma padrão no portal.
    - **Permissões proporcionais ao escopo, cada uma justificada.**
    - Custódia organizada do certificado de assinatura.

    **Nota client-first**: o pacote `.wgt` inclui `assets/importWorker.js`
    na lista `files:` do `tizen_web_project.yaml` (feature 005, R-002).
    Qualquer Worker novo precisa ser adicionado explicitamente.

    **Bloqueadores internos propostos**: falha de instalação/atualização,
    perda sistemática de favoritos, importação não testável, áudio em
    segundo plano, ou credencial em log.

    (`docs/guia-praticas-app-tv/10` §1–3)

39. **Materiais de loja e Application UI Description**

    Logo 1920×1080 PNG RGBA (<300 KB), fundo 1920×1080 (<300 KB), ícone
    512×423 (<300 KB) e 4 capturas 1920×1080 JPG (<500 KB cada),
    produzidas a partir de uma versão executável com dados fictícios ou
    autorizados — nunca telas conceituais nem credenciais visíveis. O
    Application UI Description no template oficial é entregável
    obrigatório da submissão.

    (`docs/guia-praticas-app-tv/02` §1/§2; `/09` §1)

40. **Conta de publicação e abrangência geográfica**

    Public Seller publica **somente nos EUA**; distribuição no Brasil
    depende de associação Partner Seller. Confirmar **antes** de prometer
    data de lançamento. Preparar kit de revisão com fonte de demonstração
    estável (um filme, uma série com temporadas, alguns canais, um arquivo
    M3U) e credenciais de teste separadas.

    (`docs/guia-praticas-app-tv/09` §2/§3; `/11` §1/§2)

---

### A avaliar (`sdd-assess`)

Hipóteses trazidas por comparação com outros players IPTV, sem evidência
própria de demanda. Cada uma precisa passar por `sdd-assess`
(Explora → Define → Decide) antes de virar spec.

41. **Portais Stalker/Ministra (STB) como fonte adicional**

    Protocolo, autenticação e mapeamento de catálogo ainda não avaliados.
    Se aprovado, decidir o modo "full" × "simple" por **comportamento
    observado** (handshake + token), nunca pela forma da URL, e concentrar
    isso num predicado canônico único.

    **Nota client-first**: a conexão ao portal seria direta do aparelho
    (mesma abordagem do Xtream). Verificar CORS do portal Stalker antes
    de comprometer.

    (`docs/iptvnator/03-apis.md` #9)

42. **EPG/XMLTV — guia de programação**

    Grade multi-canal + timeline "ao vivo" a partir de uma fonte XMLTV
    por URL, associada aos canais já importados (lidos do IndexedDB).
    Padrão de carga: janela inteira em bulk por fonte, com consulta curta
    só como fallback do canal ativo. Mesmo sem EPG, o slot de "agora +
    progresso" já deve existir no `ChannelRow` (item 15).

    **Nota client-first**: o XMLTV seria baixado e parseado diretamente
    no aparelho (pode ser grande — mesmo cuidado de Web Worker + stream
    da feature 005).

    (`docs/iptvnator/03-apis.md` #10; `07-tela-canais.md` #3/#8)

43. **TV Archive / Catch-up / Timeshift**

    Reprodução de conteúdo passado da grade de EPG, condicionada ao
    provedor oferecer o recurso. Duas variantes de URL (REST
    `/timeshift/...` e legado `/streaming/timeshift.php?...`) exigem
    probe concreto, preferindo TS antes de HLS. Depende do item 42.

    (`docs/iptvnator/03-apis.md` #8)

44. **Seleção de canal por número (zapping numérico) e teclas de mídia**

    Setas, Enter e Back são detectados sem registro; teclas numéricas,
    CH+/CH− e `MediaPlayPause` exigem `TVInputDevice`, o privilégio
    `tv.inputdevice` e registro explícito. Consultar
    `getSupportedKeys()` antes de depender delas e **não registrar
    indiscriminadamente todas as teclas** — permissões desproporcionais
    podem bloquear o pré-teste de distribuição (item 38).

    (`docs/guia-praticas-app-tv/03` §1; `/10` §2;
    `docs/iptvnator/07-tela-canais.md`, resumo #4)

45. **Enriquecimento TMDB estendido**

    Elenco e equipe técnica, páginas de ator navegáveis, trilha
    "Similares" e rail de tendências. Sobrepõe-se parcialmente ao item 16
    (Home em rails). Séries devem usar `aggregate_credits`, não `credits`.

    **Nota client-first**: tudo via TMDB BYOK (item 28), lido e cacheado
    no IndexedDB.

    (`docs/iptvnator/03-apis.md` #11; `00-resumo.md`)

46. **Expiração de conta visível na Home**

    `exp_date` da conta Xtream vira chip passivo no card da fonte (âmbar
    perto do vencimento, erro quando expirado), sem exigir abrir um
    diálogo. Conta "ativa" com `exp_date` no passado é tratada como
    expirada; valor 0/negativo/ausente significa "sem expiração".

    **Nota client-first**: o `exp_date` já é obtido no
    `xtreamConnector.ts` ao consultar o estado da conta. Basta persistir e
    exibir.

    (`docs/iptvnator/03-apis.md` #7; `09-dashboard-home.md` #9)

51. **Política de descarte quando o espaço do aparelho acaba**

    Com a carga sob demanda por categoria (feature 010), o catálogo passa
    a crescer enquanto a pessoa navega, em vez de nascer inteiro. Falta
    decidir o que acontece quando o espaço acaba **durante a navegação**:
    descartar a categoria menos usada (o catálogo virou reobtenível por
    categoria, então descartar deixa de ser perda — é uma busca a mais
    depois), parar de gravar e declarar, ou um teto configurável.

    Precisa de `sdd-assess` porque depende de medição real de quanto uma
    categoria ocupa no aparelho e de qual é a quota efetiva na TV de
    referência — nenhum dos dois foi medido.

    **Origem**: deliberadamente deixado fora do escopo da feature 010
    (decisão registrada em `Clarifications`, sessão 2026-09-23). Até essa
    decisão existir, vale o comportamento atual de FR-018: para de gravar
    e declara.

---

### Itens removidos ou rebaixados pela ADR-008

Os itens abaixo existiam no backlog anterior e **perderam sentido ou
mudaram de natureza** com a arquitetura client-first:

- ~~**Worker durável de importação** (antigo item 35)~~: presumia um
  backend compartilhado (`BackgroundTasks` do FastAPI). Com client-first,
  a importação roda em Web Worker no próprio aparelho (feature 005), e
  cada instalação processa só o próprio catálogo. O risco de "travar a
  UI" que motivava P0 foi resolvido pelo Worker. Se o Worker falhar,
  `importRunner.ts` cai para a thread principal — o mecanismo já existe.
  **Rebaixado para observação**: se catálogos maiores travarem
  futuramente, o item ressurge como otimização do Worker, não como
  migração para fila de backend.

- ~~**Migração do backend para VPS** (antigo item 38)~~: presumia que o
  backend seria o caminho de produção. Com client-first, não há backend
  para migrar. O contorno congelado (`api/`) só serve para provedor sem
  CORS, e **não justifica investimento em TLS, backup/restore e
  infraestrutura de VPS**. Removido.

- ~~**Leitura de catálogo DB-first com `import_status` por fonte e tipo**
  (antigo item 3)~~: inteiramente absorvido pela feature 005 (FR-012,
  FR-013, FR-014 e `freshness.ts`). O princípio — abrir fonte dentro do
  prazo não dispara rede — está implementado e medido.

- ~~**Cache local do catálogo na TV como cache/espelho** (antigo item
  4)~~: com client-first, o IndexedDB no aparelho **é** a fonte de
  verdade, não um cache. A feature 005 implementou isso. O que sobra
  (separação de repositório de catálogo e de estado do usuário) virou o
  item 3 da revisão de 22/09, entregue como feature 008 em 22/09/2026.

---

### Processo, documentação e qualidade de código

0. **[Bug] Estado de erro da Home não tem elemento focável** — em
   `tv-web/src/features/home/HomeScreen.tsx`, o ramo `isError` renderiza
   só um parágrafo. Com o backend fora do ar (ou, no cenário client-first,
   com IndexedDB inacessível), o controle remoto fica preso e a única
   saída é fechar o app — viola "Foco Visível e Sem Becos Sem Saída".

   **Origem**: achado durante a feature 005, Fase 3 (T021), em
   19/09/2026 — fora do escopo dela. O sintoma está temporariamente
   mascarado: a tela de diagnóstico da US1 acrescentou um botão nesse
   estado, e **a armadilha volta quando essa tela temporária for removida
   na fase Polish**. Caminho normal: `sdd-bugfix`.

0. **[Bug] Botões "Tentar de novo"/"Voltar" de estados de carregando/erro
   não são ativáveis por controle remoto** — **parcialmente corrigido**:
   a feature `014-m3u-sob-demanda` (T039, 24/09/2026) consertou o
   "Tentar de novo" nas três telas de categoria (`LiveScreen.tsx`,
   `MoviesScreen.tsx`, `SeriesScreen.tsx`), no mesmo `onSelect` que ganhou
   o caso `source_missing` — aprovado pelo usuário como desvio pequeno
   dentro daquela feature, por ser exatamente o mesmo padrão que a task
   em questão já estava mexendo. **O que fica**: conferir se o mesmo
   padrão (`.tv-focus` sem roteamento real em `onSelect`) se repete em
   outras telas fora dessas três (a suspeita original — "provavelmente em
   outras telas" — nunca foi varrida no app inteiro, só nas três
   corrigidas).

   **Origem**: achado durante a feature 010, Fase 3 (T033), em
   23/09/2026 — pré-existente ao `LiveScreen` original. Corrigido nas três
   telas de categoria pela feature 014; permanece como item de backlog só
   pela parte não varrida. Caminho normal: `sdd-bugfix`.

0. **Decidir o destino de `api/delete_sources.py`** — o lint foi
   corrigido em 18/09/2026 (T052 da 003); fica em aberto se o script
   continua versionado junto do pacote congelado ou sai dele.

0. **[Bug] Mensagem genérica de erro de reprodução sempre diz "canal"**
   — `tv-web/src/lib/player/avplayAdapter.ts` (`toPlayerError`) e
   `tv-web/src/lib/player/htmlVideoAdapter.ts` traduzem qualquer falha de
   stream sem código reconhecido para o texto fixo "Não foi possível
   reproduzir este canal.", inclusive quando o item é um filme ou um
   episódio de série. `PlayerLayer` só usa a mensagem genérica configurável
   por prop (`genericErrorMessage`) quando o adaptador não fornece
   `message` nenhuma — como os dois adaptadores sempre fornecem esta
   string fixa, a prop nunca tem chance de valer para esse caminho de
   erro específico.

   **Origem**: achado durante a verificação manual no navegador da feature
   `012-series-episodios-temporadas` (24/09/2026), ao simular uma URL de
   episódio inválida — pré-existente desde que os dois adaptadores foram
   escritos (antes da feature 011 introduzir filme), fora do escopo desta
   feature. Severidade baixa: cosmético, não vaza segredo, não bloqueia
   nenhuma função — só descreve errado o tipo de mídia numa falha rara.
   Corrigir exige decidir se a mensagem vem do `kind` da sessão (motor não
   sabe, só o `PlayerService` sabe) ou se os adaptadores passam de vez a
   mensagem em branco pra sempre cair no `genericErrorMessage` da tela
   chamadora. Caminho normal: `sdd-bugfix`.

0. **[Bug] `e2e.mjs` testa um diálogo de saída que não existe mais em
   `AddSourceScreen`** — o script `tv-web/e2e.mjs` (cenário "US1: Sem lista
   cadastrada") pressiona Escape na tela de Adicionar Fonte esperando um
   `.confirm-dialog` com botão "Sair" (`page.click('button:has-text("Sair")')`,
   linha 45), mas nem `AddSourceScreen.tsx` nem `App.tsx` têm hoje qualquer
   tratamento de Escape para essa tela — não existe mais esse diálogo de
   confirmação de saída ali. `npm run test:e2e` trava com timeout de 30s
   nesse `page.click`, antes mesmo de chegar aos outros dois scripts
   (`e2e/favoritos.mjs`, `e2e/m3u-sob-demanda.mjs`).

   **Origem**: achado ao rodar o gate `npm run test:e2e` na feature
   `014-m3u-sob-demanda` (24/09/2026) — `e2e.mjs` está intocado desde o
   commit inicial do repositório (`git log -- e2e.mjs` só mostra "first
   commit"), então é drift pré-existente entre o script e o comportamento
   atual do app, não uma regressão desta feature (que não toca
   `AddSourceScreen`). Corrigir exige decidir o comportamento correto —
   reintroduzir confirmação de saída nessa tela, ou atualizar o script pra
   refletir que Escape ali simplesmente não faz nada — decisão pequena mas
   que precisa ser tomada, não um typo. Caminho normal: `sdd-bugfix`.

47. **Skills de domínio + mapa de validação por área**

    Skills curtos (~500 palavras) no formato "gatilho + Read First → doc
    canônico + Validation → comando concreto" para player AVPlay,
    importador client-side (M3U parser + classificador + conector Xtream
    em TypeScript) e navegação D-pad, complementando os 8 skills de
    processo `sdd-*` existentes. Junto, um mapa do **menor** comando que
    valida cada área antes de rodar a suíte inteira:

    ```powershell
    # Frontend (onde tudo acontece agora)
    cd tv-web
    npx tsc -b
    npm run lint
    npx vitest run
    npm run build:tizen

    # Backend (contorno congelado — não muda, só prova que não quebrou)
    cd ..\api
    uv run ruff check .
    uv run pytest
    ```

    (`docs/iptvnator/04-skills.md` #1–3)

48. **Documentação canônica por subsistema**

    Conforme cada área ganhar corpo, manter **um** documento de
    arquitetura em `docs/architecture/`:
    - **Importador client-side**: parser M3U, classificador, conector
      Xtream, pipeline, Worker — tudo em `tv-web/src/lib/catalog/`.
    - **Player**: `PlayerService`, adaptador AVPlay, adaptador `<video>`.
    - **Navegação**: sistema de foco, escopos, RETURN em camadas.
    - **Armazenamento local**: schema Dexie, repositórios,
      `userStateRepository`.

    ADRs registram decisões; estes documentos registram o **estado
    resultante** — camadas complementares. Quando um padrão antigo
    contradisser o novo, rotulá-lo explicitamente como **dívida de
    migração, não precedente**.

    **Nota**: README, CLAUDE.md e as specs 001/004 **já foram
    atualizados** na Fase 8 (Polish) da feature 005 para refletir a
    arquitetura client-first. Verificar que não há referência residual ao
    backend como caminho principal.

    (`docs/iptvnator/05-documentos.md` #1/#2/#4; `04-skills.md` #4;
    constitution "Documentação do Repositório É Canônica")

49. **Fronteiras de código explícitas e limite de tamanho de arquivo**

    Documentar as direções de dependência permitidas:
    - `features/` não importa de outro `features/` direto, usa `lib/`.
    - `lib/` não importa componentes de UI.
    - `lib/catalog/` → `lib/player/` (unidirecional, player não importa
      catálogo).

    Adotar limite soft de linhas por arquivo (~300 para TS/React) via
    configuração de lint. Começar limpo é mais barato que herdar baseline.

    **Nota**: com a feature 005, `lib/catalog/` tem 19 arquivos. Monitorar
    que nenhum ultrapasse o limite.

    (`docs/iptvnator/02-arquitetura.md` #7; `04-skills.md` #5)

50. **Suíte de aceite de UX e percurso de referência**

    Transformar a matriz UX01–UX10 dos guias num conjunto executável,
    percorrido com **fonte vazia, fonte demonstrativa e catálogo
    volumoso**: instalar, abrir sem fonte, configurar, entrar em canais,
    reproduzir, voltar, buscar filme, favoritar, assistir parcialmente,
    reabrir, continuar e remover a fonte — repetindo com falha de rede e
    dados incompletos.

    **Nota client-first**: toda a suíte roda com o **backend desligado**
    (é o cenário principal agora). Cada execução registra responsável,
    aparelho, firmware, versão, dados, resultado e evidência; um teste
    não executado fica "a testar", nunca "aprovado".

    (`docs/guia-praticas-app-tv/08` §2/§3; `/13` §2)

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
| 020-ciclo-vida-player | Ciclo de Vida do Player na TV | Especificada | N/A | 2026-09-26 |

## Bugs

| Slug | Título | Fase Atual | Veredito/Status | Próximo Passo | Última Atualização |
| --- | --- | --- | --- | --- | --- |
| tecla-voltar-return-nao-funciona-na | Tecla Voltar (RETURN) não funciona na TV física | Test | verified | Concluído | 2026-09-17 |
| live-tv-toca-audio-sem-imagem | Live TV toca áudio sem imagem na TV física | Test | verified | Concluído | 2026-09-17 |
| enter-controle-remoto-nao-ativa-botoes | Enter do controle remoto não ativa botões em telas de foco DOM nativo | Test | verified | Concluído | 2026-09-18 |
| prefetch-concorrente-categoria-sem-cancelamento-requisicao | Prefetch de categoria sem cancelamento de requisição HTTP em voo | Test | verified | Concluído | 2026-09-25 |

## Melhorias Ad-hoc

| Data | Área | Resumo |
| --- | --- | --- |
