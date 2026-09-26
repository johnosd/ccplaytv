# Feature Specification: Séries — Episódios e Temporadas

**Slug**: `012-series-episodios-temporadas`

**Created**: 2026-09-24

**Status**: Convergida

**Input**: Item 9 do backlog (`.planning/backlog.md`) — "o buraco mais visível hoje":
`SeriesDetailScreen` declara que não tem episódios e `fetchSeriesInfo`
(`xtreamConnector.ts`) nunca é chamado. Fechar essa lacuna: obter e gravar
episódios (provedor Xtream e, por pedido do usuário durante a entrevista,
também fonte M3U agrupando por título), navegação por temporada/episódio,
reprodução e retomada por episódio, marca de assistido, e autoplay do
próximo episódio com aviso cancelável.

## Escopo

### Incluído

- Obter os episódios de uma série de provedor Xtream (`get_series_info`),
  sob demanda ao entrar no detalhe da série.
- Agrupar entradas de fonte M3U cujo título tenha o padrão de temporada/
  episódio (ex.: "Nome S01E02") em uma série navegável, por título
  normalizado dentro da mesma fonte.
- Detalhe de série com abas de temporada e lista de episódios abaixo —
  layout já desenhado no protótipo (`docs/design/CCPlayTv Prototype -
  Standalone.html`, tela "detalhe série").
- Reprodução de episódio com retomada por identidade estável, mesmo
  mecanismo já usado para filme (feature 011).
- Marca visual de episódio assistido (concluído), distinta de "com
  progresso salvo" e de "nunca aberto".
- Autoplay do próximo episódio ao concluir, com aviso cancelável;
  encadeia para a temporada seguinte quando a atual termina.
- Corrigir o "Modo limitado" (provedor sem protocolo JSON): hoje cada
  arquivo com `/series/` na URL vira um cartão de série próprio, sem
  reprodução; passa a ser tratado como episódio e agrupado como no M3U
  (achado no planejamento, `plan.md` R-004/D-012).

### Fora de Escopo

- Sinopse, elenco e pôster reais de série/episódio — dependem do conector
  TMDB (item 28 do backlog), ainda não existe.
- "Continuar assistindo" agregado por série (progresso "em dia" somando
  episódios) e o hero da Home — itens 13 e 16 do backlog.
- Ação "Trailer" para série — item 32; o protótipo não desenha essa ação
  para esta tela (só a tela de filme tem `trailerBtnStyle`/`watchBtnStyle`).
- Busca (item 12) e favoritar série/episódio (item 11) — o dado de
  identidade estável grava certo, mas nenhuma UI de busca ou favorito
  nasce nesta feature.
- Sinal "Gostei" (item 27).
- Correspondência aproximada/fuzzy de título para o agrupamento M3U — só
  igualdade exata de título normalizado (minúsculas, aparado).
- Unificar uma série cujos episódios M3U estão espalhados por mais de um
  `group-title` na mesma fonte — cada agrupamento por categoria permanece
  separado; risco aceito, sem reconciliação automática.
- Portais Stalker/Ministra, EPG/XMLTV, timeshift — não relacionados.
- Corrigir o bug pré-existente "voltar da grade não restaura foco/posição"
  (backlog, seção "Processo, documentação e qualidade de código") — não
  introduzido nem corrigido por esta feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Assistir episódio de série de provedor, com retomada (Priority: P1)

Uma pessoa cuja fonte é um provedor Xtream abre uma série na grade,
escolhe uma temporada e um episódio, e assiste — retomando de onde parou
se já tinha começado antes.

**Why this priority**: fecha a lacuna mais citada do backlog — hoje
`SeriesDetailScreen` não reproduz nada. Sem esta story funcionando, as
demais (M3U, marca de assistido, autoplay) não têm o que estender.

**Independent Test**: com uma fonte de provedor Xtream com ao menos uma
série de duas temporadas, abrir a série, trocar de temporada, selecionar
um episódio e ver a reprodução começar; sair e reabrir mostra retomada no
mesmo episódio.

**Acceptance Scenarios**:

1. **Given** uma série de provedor nunca aberta antes, **When** a pessoa a
   seleciona na grade de Séries, **Then** o app busca os episódios do
   provedor e mostra as temporadas em abas, com a lista de episódios da
   primeira temporada abaixo.
2. **Given** o detalhe de uma série já com episódios carregados, **When**
   a pessoa move o foco para outra aba de temporada, **Then** a lista de
   episódios troca para a temporada focada sem nova busca de rede.
3. **Given** um episódio focado na lista, **When** a pessoa pressiona OK,
   **Then** a reprodução começa direto, sem menu de ações.
4. **Given** um episódio assistido parcialmente antes (posição salva),
   **When** a pessoa o seleciona de novo, **Then** a reprodução retoma da
   posição salva.
5. **Given** uma série cuja obtenção de episódios falhou e nunca deu certo
   antes, **When** a tela é mostrada, **Then** aparece um estado de erro
   com ação "Tentar de novo" focável.

---

### User Story 2 - Séries também a partir de fonte M3U (Priority: P2)

Uma pessoa cuja fonte é uma lista M3U (sem protocolo de provedor) vê
arquivos nomeados como episódios (ex.: "Nome da Série S01E02") aparecerem
agrupados como uma série na tela Séries, em vez de soltos ou invisíveis.

**Why this priority**: estende a mesma capacidade da P1 para o outro tipo
de fonte. Sem isto, quem só tem M3U não ganha nada da P1 — hoje esses
arquivos nem aparecem na tela Séries (ficam sem categoria).

**Independent Test**: com uma fonte M3U contendo várias entradas "Nome da
Série S01E0N", abrir Séries e ver um único cartão "Nome da Série" (não um
cartão por arquivo), com temporadas/episódios agrupados corretamente.

**Acceptance Scenarios**:

1. **Given** uma fonte M3U com 10 entradas "Breaking Bad S01E01" a
   "S01E10", **When** a importação classifica essas entradas, **Then** a
   tela Séries mostra um único cartão "Breaking Bad", não dez.
2. **Given** esse cartão agrupado, **When** a pessoa o abre, **Then** vê a
   Temporada 1 com os 10 episódios, ordenados pelo número do episódio.
3. **Given** duas fontes M3U diferentes com uma série de mesmo nome,
   **When** ambas são importadas, **Then** cada fonte mantém sua própria
   série separada, sem mistura entre fontes.

---

### User Story 3 - Marca de episódio assistido (Priority: P3)

Uma pessoa acompanhando uma série vê quais episódios já assistiu até o
fim, sem precisar lembrar onde parou.

**Why this priority**: melhora a usabilidade da lista sobre P1/P2, mas não
é pré-requisito para assistir — por isso não é P1.

**Independent Test**: assistir um episódio até o fim (ou ultrapassar o
limiar final de retomada), voltar à lista, e ver esse episódio marcado
como assistido, distinto dos demais.

**Acceptance Scenarios**:

1. **Given** um episódio assistido até a conclusão, **When** a pessoa
   volta à lista de episódios, **Then** esse episódio aparece com uma
   marca visual de assistido.
2. **Given** um episódio com progresso salvo mas não concluído, **When** a
   lista é mostrada, **Then** ele não aparece marcado como assistido
   (distinto do caso 1).
3. **Given** um episódio nunca aberto, **When** a lista é mostrada,
   **Then** ele não aparece marcado como assistido nem com retomada.

---

### User Story 4 - Autoplay do próximo episódio (Priority: P4)

Uma pessoa maratonando uma série vê o próximo episódio começar sozinho
quando um termina, com uma chance de cancelar antes disso acontecer.

**Why this priority**: conveniência sobre a P1 — exige que reprodução e
conclusão de episódio já funcionem, e é a mais arriscada tecnicamente
(encadeia sessões de reprodução). Por isso vem por último.

**Independent Test**: assistir um episódio até o fim com um próximo
disponível na mesma temporada; ver o aviso de contagem regressiva
cancelável aparecer; deixar a contagem terminar sem cancelar e ver o
próximo episódio começar sozinho.

**Acceptance Scenarios**:

1. **Given** um episódio concluído com um próximo na mesma temporada,
   **When** a conclusão acontece, **Then** aparece um aviso com contagem
   regressiva e uma ação focada para cancelar.
2. **Given** esse aviso na tela, **When** a pessoa confirma cancelar (ou
   pressiona RETURN), **Then** a reprodução automática não começa e a
   tela volta para a lista de episódios.
3. **Given** esse aviso na tela, **When** a contagem chega a zero sem
   cancelamento, **Then** o próximo episódio começa a tocar
   automaticamente.
4. **Given** o episódio concluído é o último da temporada focada e existe
   uma temporada seguinte, **When** a conclusão acontece, **Then** o
   aviso de autoplay aponta para o primeiro episódio da temporada
   seguinte.
5. **Given** o episódio concluído é o último da última temporada, **When**
   a conclusão acontece, **Then** a reprodução fecha e volta para a lista
   de episódios, sem aviso de autoplay.

### Edge Cases

- Série cuja obtenção de episódios devolve lista vazia (provedor não tem
  nada para aquele `series_id`): tela distingue isso de falha de rede,
  sem inventar episódio.
- Episódio sem temporada identificável: Temporada 1 no Xtream; grupo
  "Episódios" no M3U/Modo limitado (FR-019). Nunca descartado.
- Duas séries reais cujo título normalizado colide por coincidência (fonte
  M3U): ficam artificialmente unidas — limitação conhecida, sem correção
  automática nesta feature (ver Fora de Escopo).
- Mesma série M3U espalhada por dois `group-title` diferentes na mesma
  fonte: não é unificada entre categorias — cada uma permanece separada
  (ver Fora de Escopo).
- Episódio sem identidade estável (sem identificador de painel nem nome
  aproveitável): reproduz normalmente, só sem retomada nem marca de
  assistido (FR-018, mesmo padrão D-010 do filme).
- Autoplay cancelado por RETURN no meio da contagem: comportamento igual
  ao cancelamento pela ação focada (FR-015).
- Próximo episódio do autoplay falha ao resolver URL ou reproduzir: trata
  como falha de reprodução normal, sem repetir automaticamente.
- Fonte cujo provedor não responde a `get_series_info` (erro/404): mesma
  resposta de "obtenção falhou" das demais obtenções sob demanda, nunca
  trava a tela.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE obter os episódios de uma série de provedor
  Xtream via `get_series_info` somente quando a pessoa entra no detalhe da
  série (seleciona na grade), nunca durante a importação de estrutura nem
  ao mover o foco sobre o cartão.
- **FR-002**: Episódios já obtidos e ainda dentro da janela de frescor
  usada para categorias sob demanda DEVEM ser servidos do disco, sem nova
  obtenção de rede.
- **FR-003**: Quando a obtenção de episódios falha e não há episódios
  salvos de uma tentativa anterior, o sistema DEVE mostrar um estado de
  erro com uma ação "Tentar de novo" focável.
- **FR-004**: Quando a obtenção falha mas há episódios salvos de uma
  obtenção anterior, o sistema DEVE mostrar esses episódios com um aviso
  de que não foi possível atualizar agora, em vez de esconder o que já
  existe.
- **FR-005**: O sistema DEVE agrupar entradas de fonte M3U cujo título siga
  o padrão de temporada/episódio (já detectado pelo classificador) em uma
  única série navegável por nome normalizado, restrito à mesma fonte —
  nunca mesclando entre fontes diferentes.
- **FR-006**: A tela Séries DEVE listar as séries agrupadas de M3U da mesma
  forma que lista séries de provedor: um cartão por série, nunca um cartão
  por arquivo de episódio.
- **FR-007**: O detalhe de uma série DEVE apresentar as temporadas como
  abas horizontais focáveis, com a lista de episódios da temporada
  selecionada logo abaixo — mesmo layout do protótipo (`docs/design`, tela
  "detalhe série").
- **FR-008**: Mover o foco entre abas de temporada DEVE trocar a lista de
  episódios exibida sem recarregar a série nem tocar rede, quando os
  episódios já tiverem sido obtidos.
- **FR-009**: Selecionar (OK) um episódio focado DEVE iniciar a reprodução
  dele diretamente, sem menu de ações intermediário — retomando da posição
  salva quando houver, ou do início quando não houver.
- **FR-010**: A posição de reprodução de um episódio DEVE ser gravada e
  lida por identidade estável (fonte + série + temporada + número do
  episódio), nunca pela URL — mesmo mecanismo já usado para filme.
- **FR-011**: A lista de episódios DEVE indicar visualmente quais
  episódios já foram assistidos até a conclusão, de forma distinta de
  "com posição salva, ainda não concluído" e de "nunca aberto".
- **FR-012**: Um episódio DEVE ser considerado assistido pelo mesmo
  critério de conclusão já usado para filme (fim natural do stream, ou
  ultrapassar o limiar final de retomada) — sem inventar um segundo
  critério de conclusão.
- **FR-013**: Ao concluir um episódio, o sistema DEVE encerrar a sessão de
  reprodução dele antes de decidir o próximo passo — nunca sobrepor duas
  sessões de reprodução.
- **FR-014**: Quando um episódio conclui e existe um próximo episódio
  (mesma temporada, ou o primeiro da temporada seguinte se for o último
  dela), o sistema DEVE mostrar um aviso com contagem regressiva antes de
  iniciar a reprodução automática dele.
- **FR-015**: Durante a contagem regressiva, o sistema DEVE oferecer uma
  ação focável para cancelar; cancelar (por seleção ou por RETURN) DEVE
  fechar a reprodução e voltar à lista de episódios sem iniciar o próximo.
- **FR-016**: Quando não existe próximo episódio (fim da última temporada
  da série), o sistema DEVE fechar a reprodução e voltar à lista de
  episódios ao concluir, sem mostrar aviso de autoplay.
- **FR-017**: O sistema NUNCA DEVE encadear autoplay para uma série
  diferente da que está sendo assistida.
- **FR-018**: Episódio sem identidade estável (sem identificador de painel
  nem nome aproveitável) DEVE reproduzir normalmente — só fica sem
  retomada e sem marca de assistido, nunca falha a reprodução por causa
  disso.
- **FR-019**: Episódio de provedor Xtream sem temporada identificável DEVE
  ser tratado como pertencente à Temporada 1, nunca descartado. Episódio de
  fonte M3U/Modo limitado sem temporada identificável no nome DEVE aparecer
  num grupo rotulado "Episódios", sem temporada inventada.
- **FR-020**: Ao abrir o detalhe de uma série, o foco inicial DEVE estar
  na aba da primeira temporada.
- **FR-021**: RETURN fora do aviso de autoplay (navegando entre
  temporada/episódio) DEVE voltar para a tela Séries, preservando o
  comportamento já existente do detalhe.
- **FR-022**: Todo estado do detalhe de série (carregando, vazio, erro,
  com conteúdo, aviso de autoplay) DEVE ter ao menos um elemento focável
  alcançável por controle remoto — sem beco sem saída.
- **FR-023**: Mensagens de erro de obtenção de episódios NUNCA DEVEM
  expor URL nem credencial do provedor — mesma sanitização já aplicada às
  demais obtenções sob demanda.

### Key Entities

- **Episódio**: item de catálogo reproduzível pertencente a uma série,
  identificado por fonte + série + temporada + número do episódio; carrega
  duração/sinopse só quando a fonte de fato declara (raro hoje).
- **Série (agrupador)**: entidade navegável que reúne os episódios de uma
  mesma obra dentro de uma fonte — vem pronta do provedor (Xtream, com
  `series_id` próprio) ou é inferida por título normalizado (M3U, sem
  identificador próprio do painel).
- **Temporada**: agrupamento de episódios dentro de uma série, numerado;
  só existe enquanto houver ao menos um episódio associado a ela.
- **Estado de assistido**: sinal por episódio, distinto da posição de
  retomada, que marca conclusão — chaveado pela mesma identidade estável.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A partir da tela Séries, uma pessoa chega a "assistindo um
  episódio" em no máximo 3 seleções (série → temporada → episódio).
- **SC-002**: Fechar e reabrir o app, ou navegar embora e voltar, preserva
  a posição de retomada de um episódio parcialmente assistido, com a
  mesma confiabilidade já validada para filme.
- **SC-003**: 100% dos episódios concluídos naturalmente aparecem
  marcados como assistidos na próxima vez que a lista é exibida.
- **SC-004**: Séries de fonte M3U com títulos "Nome S01E0N" aparecem na
  tela Séries como um cartão por série, nunca um cartão por arquivo.
- **SC-005**: Em nenhum estado do detalhe de série (carregando, vazio,
  erro, aviso de autoplay) o controle remoto fica sem elemento focável
  para agir.
- **SC-006**: A contagem regressiva de autoplay pode ser cancelada em
  100% das tentativas, em qualquer instante antes de a próxima reprodução
  começar.

## Assumptions

- Duração e sinopse de episódio geralmente não estarão disponíveis (nem
  Xtream nem M3U garantem isso de forma confiável): a tela mostra o que
  existe, sem inventar — mesmo padrão já usado pelo filme, à espera do
  conector TMDB (item 28).
- O valor exato da contagem regressiva do autoplay (quantos segundos) é
  decisão de implementação do `sdd-plan`, não fixado nesta spec — só o
  comportamento (cancelável, com ação focada) é contrato.
- O agrupamento M3U usa correspondência exata de título normalizado
  (minúsculas, aparado), sem normalização Unicode nem correspondência
  aproximada — mesma simplicidade já usada pelo classificador hoje.
- O agrupamento M3U considera só o padrão de temporada/episódio no título,
  independente do `group-title` declarado — o grupo é usado para nome de
  exibição/categoria, nunca como filtro que impede o agrupamento.
- O foco inicial ao abrir o detalhe é sempre a primeira temporada — não há
  memória de "última temporada vista" nesta feature (isso é do item 13/16,
  "continuar assistindo", fora de escopo).
- Sem sinopse/elenco reais e sem ação de trailer para série — o cabeçalho
  usa o mesmo texto-placeholder já usado pelo filme, e a ausência de
  trailer aqui segue o próprio desenho do protótipo (que só define
  Trailer/Assistir para a tela de filme).
- Título original do provedor/arquivo nunca é substituído por taxonomia
  externa (constitution).
- Fonte M3U (ou Modo limitado) importada antes desta feature precisa ser
  re-sincronizada para ganhar o agrupamento em séries — episódios já
  gravados não são religados por aproximação (`data-model.md` §1).

## Clarifications

### Sessão 2026-09-24

- Q: Fontes M3U têm cada episódio "S01E02" já como arquivo individual
  reproduzível, mas sem agrupamento em série nenhum (nem aparecem hoje na
  tela Séries). Qual o escopo desta feature quanto a fonte? → A: Xtream +
  M3U — a pessoa mostrou que o M3U real já declara `group-title` (ex.:
  "Series | Disney Plus") e nome com padrão S/E, dado suficiente para
  agrupar. Ver FR-005/FR-006 e User Story 2.
- Q: Ao focar um episódio na lista e apertar OK, o que acontece? → A: Toca
  direto, retomando se houver posição salva — sem submenu de ações. Ver
  FR-009.
- Q: Além de retomar a posição dentro de um episódio, a lista deve indicar
  quais já foram assistidos? → A: Sim, marca visual de episódio concluído,
  distinta de "com progresso" e de "nunca aberto". Ver User Story 3,
  FR-011/FR-012.
- Q: Layout do detalhe de série (não há protótipo desenhado pra isso na
  ADR-007)? → A: Existe sim, na tela "detalhe série" de `docs/design/
  CCPlayTv Prototype - Standalone.html` — abas de temporada horizontais +
  lista de episódios abaixo, cabeçalho igual ao de filme. Ver FR-007.
  Ação do usuário: `CLAUDE.md` deve passar a dizer explicitamente para
  consultar `docs/design/` e `docs/guia-praticas-app-tv/` ao planejar/
  arquitetar telas novas (mudança feita fora desta spec, direto no
  `CLAUDE.md`).
- Q: Quando um episódio termina naturalmente, o que acontece? → A: Toca
  automaticamente o próximo episódio (autoplay). Ver User Story 4.
- Q: Autoplay é imediato ou dá uma janela para cancelar? → A: Aviso com
  contagem regressiva cancelável. Ver FR-014/FR-015.
- Q: Quando o episódio concluído é o último da temporada focada, o
  autoplay continua para a temporada seguinte? → A: Sim, se ela existir
  no catálogo local; sem próxima temporada, fecha e volta à lista. Ver
  FR-016 e Acceptance Scenarios 4/5 da User Story 4.
- Q: (Analyze do `sdd-plan`) Aplicar os ajustes de consistência A1–A5? →
  A: Sim. FR-019 passa a distinguir Xtream (Temporada 1) de M3U/Modo
  limitado (grupo "Episódios"); correção do Modo limitado entra no escopo;
  premissa de re-sincronizar fonte M3U antiga registrada.
