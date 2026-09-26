# Feature Specification: Fonte M3U Estrutura-Primeiro (Detecção de Painel Xtream ou Arquivo Guardado)

**Slug**: `014-m3u-sob-demanda`

**Created**: 2026-09-24

**Status**: Convergida

**Input**: Adicionar uma fonte por URL M3U demora muito numa lista grande,
porque a importação classifica e grava todos os itens antes de concluir. A
importação deve ler só as categorias de canais, filmes e séries e deixar
os itens para quando a pessoa entrar na categoria — como a feature
`010-catalogo-sob-demanda` já faz para fonte de provedor Xtream. Avaliada
em `sdd/assessments/import-m3u-por-url-le-tudo/` (veredito `go`, revisado
em 2026-09-24).

## Contexto

A feature 010 tornou a fonte de provedor (protocolo Xtream JSON)
estrutura-primeiro e deixou a fonte M3U de fora de propósito (010,
Fora de Escopo; FR-011 e FR-012): um arquivo M3U não tem como pedir "só a
categoria X". Pela FR-018 da 010, toda fonte M3U já grava suas categorias,
mas como `eager` — os itens continuam sendo classificados e gravados um a
um durante a importação.

Esta feature resolve a fonte M3U por dois caminhos, nesta ordem:

1. **Painel Xtream reconhecido na URL.** A maioria das URLs M3U de painel
   IPTV carrega o endereço do painel, o usuário e a senha
   (`…/get.php?username=…&password=…`) — o mesmo formato que o app já
   monta hoje no sentido inverso para o "Modo limitado". Se o painel
   responder ao protocolo com essas credenciais, a fonte segue as regras
   de provedor da 010 por inteiro.
2. **Arquivo guardado.** Quando a URL não é de painel Xtream, ou o painel
   não confirma o protocolo (e sempre no "Modo limitado", que é por
   definição um painel sem o protocolo), o app baixa o arquivo, o guarda
   no aparelho, extrai dele só a estrutura e lê cada categoria do arquivo
   guardado quando a pessoa entra nela.

Não há medição de como o tempo da importação M3U atual se divide entre
download, leitura e gravação (as três correm no mesmo laço). A 010
observou na TV que o gargalo do caminho de provedor, quando ele ainda
gravava tudo, era a gravação — o mesmo padrão que o M3U segue hoje.

**Esta feature substitui a FR-011 e a FR-012 da 010.** Quando ela for
entregue, aquelas duas FRs recebem uma nota `**Atualização (014):**`.

## Escopo

### Incluído

- Reconhecer, na URL de uma fonte M3U, o endereço do painel, o usuário e a
  senha no formato de painel Xtream, e confirmar com o painel antes de
  usar esse caminho.
- Fonte M3U reconhecida como painel Xtream seguindo as regras de provedor
  da 010: só categorias na importação, itens ao entrar na categoria.
- Caminho do arquivo guardado para toda fonte M3U que não for reconhecida
  ou confirmada, incluindo o "Modo limitado" (`legacy_m3u`) de fonte de
  provedor.
- Estados de erro próprios do arquivo guardado: arquivo ausente ao entrar
  numa categoria, falta de espaço ao guardar.
- Contagem real por categoria no caminho do arquivo guardado.
- Explicação do "Modo limitado": hoje a Home mostra só um selo, sem dizer
  por que a fonte entrou nesse modo nem o que ela perde. O selo continua,
  e o hub da lista passa a explicar o motivo real, o que a fonte perde e o
  que a pessoa pode fazer.

### Fora de Escopo

- Protocolo de rede novo por categoria para M3U (não existe no formato),
  inclusive pedidos parciais do arquivo (`Range`).
- Fonte por arquivo `.m3u` local (backlog, item 22) — ainda não existe no
  app. Quando existir, herda o caminho do arquivo guardado.
- Mudar o tipo com que a fonte aparece na interface: uma fonte cadastrada
  por URL M3U continua aparecendo como URL M3U, qualquer que seja o caminho
  usado por dentro. (A indicação de Modo limitado, quando cabe, é uma
  informação a mais, não uma troca de tipo.)
- Aviso de Modo limitado para URL M3U de arquivo avulso: sem painel por
  trás, não há protocolo que ela tenha deixado de usar.
- Guardar numa categoria própria as entradas que o app não consegue
  identificar como canal, filme ou série — continuam descartadas e
  contadas, como hoje.
- Qualquer mudança no caminho de fonte de provedor cadastrada com dns,
  usuário e senha — já é estrutura-primeiro desde a 010.
- Busca global sobre itens ainda não lidos; tela de "Não classificados".
- Política de descarte quando o espaço acaba durante a navegação (mesma
  exclusão da 010; vale a FR-018 da feature 005).
- Importação em tempo constante: descobrir as categorias de um M3U exige
  percorrer o arquivo inteiro, porque a categoria vem escrita em cada
  entrada. No caminho do arquivo guardado, o tempo de importação continua
  proporcional ao tamanho do arquivo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - URL M3U de painel Xtream importa só as categorias (Priority: P1)

A pessoa adiciona uma fonte colando uma URL M3U de painel IPTV. O app
reconhece na URL o painel e as credenciais, confirma que o painel responde
ao protocolo e importa só as categorias de canais, filmes e séries. Os
itens de cada categoria chegam quando a pessoa entra nela, como já
acontece com fonte de provedor.

**Why this priority**: é o caminho esperado para as listas reais do
usuário (URLs de painel), e reaproveita por inteiro o que a 010 já
verificou na TV física. Entregue sozinha, já elimina a espera para essas
fontes; uma lista que não é de painel Xtream continua no comportamento de
hoje (importação integral), sem regressão.

**Independent Test**: adicionar uma fonte por URL M3U de painel Xtream
com lista grande; a importação conclui sem gravar item nenhum, a fonte
aparece como URL M3U, e entrar numa categoria traz os itens dela.

**Acceptance Scenarios**:

1. **Given** uma URL M3U no formato de painel Xtream cujo painel responde
   ao protocolo, **When** a pessoa adiciona a fonte, **Then** a importação
   grava só as categorias de canais, filmes e séries, na ordem declarada
   pelo painel, e conclui sem gravar item.
2. **Given** essa fonte importada, **When** a pessoa entra numa categoria,
   **Then** os itens dela aparecem, com os mesmos estados de carregando e
   de erro da 010.
3. **Given** essa fonte, **When** a pessoa olha a Home e o hub da lista,
   **Then** a fonte continua identificada como URL M3U, sem aviso de troca
   de caminho.
4. **Given** uma URL M3U que não está no formato de painel Xtream, ou
   cujo painel não confirma o protocolo, **When** a pessoa adiciona a
   fonte, **Then** ela é importada pelo caminho do arquivo guardado (US3)
   — ou, se só esta story estiver entregue, pelo caminho integral atual.
5. **Given** uma fonte reconhecida como Xtream, **When** ocorre um erro
   em qualquer ponto, **Then** nenhuma mensagem, log ou tela mostra o
   usuário, a senha ou a URL completa.

---

### User Story 2 - Saber por que uma fonte está em Modo limitado (Priority: P2)

Uma fonte entra em Modo limitado quando havia um painel envolvido e ele
não respondeu ao protocolo completo. A pessoa vê o selo na Home e, ao
abrir a fonte, o hub da lista explica o motivo real, o que a fonte perde
e o que ela pode fazer.

**Why this priority**: pedido direto do usuário — hoje o selo não explica
nada, e sem o motivo a pessoa não consegue entender nem agir (por
exemplo, falar com o provedor). Independe das outras stories: vale já
para o Modo limitado de fonte de provedor que existe hoje.

**Independent Test**: importar uma fonte de provedor cujo painel não
responde ao protocolo; o selo aparece na Home, e o hub da lista mostra o
motivo, o que a fonte perde e o que fazer, sem expor endereço, usuário ou
senha.

**Acceptance Scenarios**:

1. **Given** uma fonte em Modo limitado, **When** a pessoa olha a Home,
   **Then** o selo "Modo limitado" continua no cartão da fonte.
2. **Given** essa fonte, **When** a pessoa a abre, **Then** o hub da lista
   mostra o motivo real pelo qual a fonte entrou em Modo limitado.
3. **Given** essa explicação, **When** a pessoa a lê, **Then** ela diz que
   todos os itens identificados estão disponíveis, o que a fonte perde em
   relação ao protocolo completo e o que a pessoa pode fazer.
4. **Given** qualquer motivo, **When** a explicação é exibida, **Then**
   ela nunca mostra o endereço do painel, o usuário, a senha ou a URL.
5. **Given** uma URL M3U de arquivo avulso (sem painel), **When** ela é
   importada, **Then** não aparece selo nem explicação de Modo limitado.
6. **Given** uma fonte que estava em Modo limitado, **When** uma
   ressincronização passa a usar o protocolo completo, **Then** o selo e a
   explicação somem.

---

### User Story 3 - Lista que não é de painel Xtream usa o arquivo guardado (Priority: P3)

A pessoa adiciona uma URL M3U que não é de painel Xtream (ou uma fonte de
provedor cai no "Modo limitado"). O app baixa o arquivo uma vez, guarda-o
no aparelho, mostra as categorias e só lê os itens de uma categoria —
do arquivo guardado, sem internet — quando a pessoa entra nela.

**Why this priority**: cobre os casos que a US1 não alcança (arquivo
estático, painel sem API, "Modo limitado"). É o caminho menos frequente
para as listas do usuário, que esperam cair sempre na US1; sem ela, essas
fontes só continuam com a espera de hoje.

**Independent Test**: adicionar uma fonte por URL de um M3U estático
grande; a importação conclui sem gravar item; entrar numa categoria traz
os itens sem nenhuma requisição de rede; voltar a ela não relê o arquivo.

**Acceptance Scenarios**:

1. **Given** uma URL M3U que não é de painel Xtream, **When** a pessoa
   adiciona a fonte, **Then** o app guarda o arquivo e grava só as
   categorias de canais, filmes e séries, na ordem em que aparecem no
   arquivo, cada uma com a contagem real de itens.
2. **Given** essa fonte, **When** a pessoa entra numa categoria nunca
   aberta, **Then** os itens aparecem lidos do arquivo guardado, sem
   requisição de rede, iguais aos que a importação integral de hoje
   produziria para aquela categoria (inclusive as séries montadas a partir
   de episódios, feature 012).
3. **Given** uma categoria já lida, **When** a pessoa volta a ela na mesma
   versão da fonte, **Then** os itens aparecem sem reler o arquivo.
4. **Given** o cursor parado sobre uma categoria da lista, **When** passa
   o breve amortecimento da 010, **Then** o app pode pré-carregar essa
   categoria em segundo plano, sem exibi-la antes da entrada explícita.
5. **Given** o arquivo guardado ausente (por exemplo, apagado pelo
   sistema), **When** a pessoa entra numa categoria não lida, **Then**
   aparece um estado de erro focável com a ação de ressincronizar a
   fonte, e a categoria continua na lista.
6. **Given** falta de espaço para guardar o arquivo, **When** a
   importação tenta guardá-lo, **Then** ela falha declarando falta de
   espaço, e a versão anterior do catálogo da fonte continua intacta.
7. **Given** uma fonte de provedor em "Modo limitado", **When** ela é
   importada, **Then** segue este mesmo caminho.

---

### Edge Cases

- **Painel reconhecido na URL que recusa as credenciais ou diz que a
  assinatura venceu**: a importação falha com esse motivo, como para
  fonte de provedor hoje (FR-002). Não cai no arquivo guardado, porque o
  download usaria as mesmas credenciais.
- **Painel reconhecido na URL que não responde ao protocolo, ou falha de
  rede ao consultá-lo**: a fonte vai para o caminho do arquivo guardado
  (ou para o integral, se só a US1 estiver entregue) e fica em Modo
  limitado com o motivo registrado (FR-019, FR-020).
- **O painel muda entre uma sincronização e outra** (passa a responder ou
  deixa de responder ao protocolo): a detecção é refeita a cada
  importação, e a fonte troca de caminho sem a pessoa precisar fazer nada.
- **URL com parâmetros além de usuário e senha** (`type=m3u_plus`,
  `output=ts`): o reconhecimento não depende deles; o formato de
  reprodução segue o que o painel declara pelo protocolo, como já é para
  provedor.
- **Lista M3U do painel diferente do catálogo que o protocolo entrega**
  (por exemplo, uma URL de lista filtrada): no caminho Xtream vale o que o
  protocolo entrega. Ver Assumptions.
- **Ressincronizar ou remover a fonte**: o arquivo guardado e os itens
  lidos dele são descartados junto com a versão, na mesma troca atômica da
  010.
- **Categoria vazia depois da classificação** (todas as entradas do grupo
  eram não classificáveis): não vira categoria, como hoje.
- **Arquivo sem categoria alguma** (nenhum `group-title`): mantém o
  comportamento atual da importação integral para esse caso.
- **Pré-carga concorrendo com a entrada explícita** na mesma categoria:
  uma leitura só, sem duplicar itens.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Ao importar uma fonte por URL M3U, o sistema DEVE tentar
  reconhecer na URL o endereço do painel, o usuário e a senha no formato
  de painel Xtream.
- **FR-002**: Reconhecidos, o sistema DEVE confirmar com o painel, por
  meio do protocolo e com essas credenciais, que ele responde e autoriza o
  acesso, antes de adotar o caminho Xtream. Se o painel responder ao
  protocolo recusando o acesso ou dizendo que a assinatura venceu, a
  importação DEVE falhar com esse motivo, como já acontece com fonte de
  provedor — o download do arquivo usaria as mesmas credenciais e seria
  recusado também. Qualquer outro resultado (painel não responde ao
  protocolo, falha de rede ao consultá-lo) DEVE levar ao caminho do
  arquivo guardado.
- **FR-003**: Confirmado o painel, a importação e a obtenção de itens
  DEVEM seguir as regras de fonte de provedor da 010 (FR-001 a FR-010 e
  FR-013 a FR-016, FR-019 daquela spec), inclusive a validade de 24 h por
  categoria e a pré-carga com o cursor parado.
- **FR-004**: A detecção DEVE ser refeita a cada importação e
  ressincronização da fonte.
- **FR-005**: A fonte DEVE continuar identificada na interface como fonte
  por URL M3U, qualquer que seja o caminho usado. Confirmado o painel
  (FR-002), nenhum aviso de caminho aparece; se a URL foi reconhecida
  como painel e ele não confirmou, vale a FR-019.
- **FR-006**: O usuário, a senha e a URL completa extraídos DEVEM seguir
  as mesmas regras das credenciais de provedor: nunca em log, mensagem de
  erro, tela ou exportação, e nunca gravados junto com as categorias ou os
  itens.
- **FR-007**: Uma fonte por URL M3U não reconhecida ou não confirmada, e
  uma fonte de provedor em "Modo limitado", DEVEM ser importadas pelo
  caminho do arquivo guardado: baixar o arquivo, guardá-lo no aparelho
  associado à versão do catálogo da fonte — já separado por categoria —,
  gravar só a estrutura de categorias de canais, filmes e séries, na ordem
  em que aparecem, e concluir sem gravar nenhum item no catálogo.
- **FR-008**: No caminho do arquivo guardado, cada categoria DEVE ter a
  contagem real dos itens que a leitura dela vai produzir, conhecida desde
  a importação.
- **FR-009**: No caminho do arquivo guardado, entrar numa categoria não
  lida DEVE ler os itens dela do arquivo guardado, sem requisição de rede,
  e gravá-los no aparelho.
- **FR-010**: Os itens lidos de uma categoria no caminho do arquivo
  guardado DEVEM ser os mesmos que a importação integral de hoje
  produziria para aquela categoria, incluindo a classificação e as séries
  montadas a partir de episódios (feature 012).
- **FR-011**: No caminho do arquivo guardado, os itens lidos de uma
  categoria DEVEM valer enquanto durar a versão da fonte, sem prazo por
  categoria.
- **FR-012**: No caminho do arquivo guardado, o sistema PODE pré-carregar
  a categoria sobre a qual o cursor repousa, com a mesma regra da FR-004
  da 010 (só após amortecimento, nunca a cada tecla, nunca exibindo antes
  da entrada explícita).
- **FR-013**: Uma pré-carga e uma entrada explícita na mesma categoria
  NÃO DEVEM produzir leitura nem itens duplicados.
- **FR-014**: Se o arquivo guardado não estiver disponível ao entrar numa
  categoria não lida, o sistema DEVE mostrar um estado de erro com ao
  menos um elemento focável e a ação de ressincronizar a fonte, sem
  remover a categoria da lista.
- **FR-015**: Se não houver espaço para guardar o arquivo, a importação
  DEVE falhar declarando falta de espaço, e a versão anterior do catálogo
  da fonte DEVE continuar intacta.
- **FR-016**: Ressincronizar ou remover a fonte DEVE descartar o arquivo
  guardado e os itens lidos dele junto com a versão, na mesma troca
  atômica que já existe.
- **FR-017**: Os estados de carregando e de erro de uma categoria, nos
  dois caminhos, DEVEM ter ao menos um elemento focável cada.
- **FR-018**: A tela de progresso DEVE relatar as etapas reais do caminho
  em curso, sem percentual.
- **FR-019**: Uma fonte DEVE ser marcada como Modo limitado quando havia
  um painel envolvido e ele não confirmou o protocolo completo: fonte de
  provedor que caiu no caminho M3U, ou URL M3U reconhecida como painel
  (FR-001) cujo painel não confirmou (FR-002). URL M3U não reconhecida
  como painel NÃO DEVE ser marcada.
- **FR-020**: A fonte DEVE registrar o motivo real do Modo limitado, dentre
  categorias fixas: painel não respondeu ao protocolo; falha de rede ao
  consultar o painel. (Acesso recusado e assinatura vencida não levam ao
  Modo limitado: fazem a importação falhar, FR-002.) Um
  resultado que não caiba em nenhuma delas NÃO DEVE ser apresentado como
  uma delas por conveniência.
- **FR-021**: A Home DEVE manter o selo "Modo limitado" no cartão da fonte,
  e o hub da lista DEVE exibir, para essa fonte, uma explicação com: o
  motivo registrado; que todos os itens identificados estão disponíveis;
  o que a fonte perde em relação ao protocolo completo (ordem e
  identificação das categorias pelo painel, contagem declarada, temporadas
  e episódios declarados pelo painel, situação da conta); o número de
  entradas descartadas por não serem identificadas, quando houver; e o que
  a pessoa pode fazer (ressincronizar depois, falar com o provedor).
- **FR-022**: A explicação é informação, não erro: DEVE seguir o tom de
  estado normal já decidido para o Modo limitado (feature 004, D-008), e
  NÃO DEVE exibir o endereço do painel, o usuário, a senha ou a URL.
- **FR-023**: Uma ressincronização que passe a usar o protocolo completo
  DEVE remover a marca, o motivo, o selo e a explicação.

### Key Entities

- **Fonte por URL M3U**: o que a pessoa cadastrou; ganha o registro de
  qual caminho a última importação usou (Xtream ou arquivo guardado).
- **Motivo do Modo limitado**: categoria fixa (FR-020) registrada na
  fonte, de provedor ou por URL M3U, quando ela está em Modo limitado;
  nunca carrega texto de erro cru, endereço ou credencial.
- **Arquivo guardado**: o conteúdo do M3U baixado na importação, já
  interpretado e separado por categoria (não o texto bruto), pertencente a
  uma fonte e a uma versão do catálogo; existe só no caminho do arquivo
  guardado, a parte de uma categoria some quando ela é lida, e o resto some
  junto com a versão.
- **Categoria**: a mesma entidade da 010. No caminho do arquivo guardado,
  carrega a contagem real calculada na importação e o instante em que foi
  lida.
- **Item de catálogo**: o mesmo de hoje, nascendo vinculado a uma
  categoria lida.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma fonte por URL M3U de painel Xtream com a lista de
  referência conclui a importação em no máximo 15 s (mesma meta da SC-001
  da 010), sem nenhum item gravado.
- **SC-002**: No caminho do arquivo guardado, a importação da mesma lista
  conclui em tempo menor que a importação integral atual, medido antes e
  depois com a mesma lista, sem nenhum item gravado até a conclusão.
- **SC-003**: No caminho do arquivo guardado, entrar numa categoria nunca
  aberta apresenta os itens em no máximo 3 s, sem nenhuma requisição de
  rede.
- **SC-004**: Voltar a uma categoria já lida, na mesma versão da fonte,
  apresenta os itens sem nenhuma requisição de rede e sem reler o arquivo.
- **SC-005**: Para um mesmo arquivo M3U, as categorias e os itens de cada
  categoria obtidos pelo caminho do arquivo guardado são idênticos aos da
  importação integral atual.
- **SC-006**: Em todos os estados de categoria (carregando, erro, arquivo
  ausente, vazia) existe ao menos um elemento focável, verificável só com
  o controle remoto.
- **SC-007**: Em nenhum caminho de erro o usuário, a senha ou a URL
  completa extraídos aparecem em log, mensagem ou tela.
- **SC-008**: Para cada um dos motivos da FR-020, uma fonte em Modo
  limitado mostra no hub da lista a explicação com aquele motivo; uma URL
  M3U de arquivo avulso não mostra selo nem explicação.

## Assumptions

- As listas reais do usuário vêm de painéis Xtream, então o caminho
  esperado é a US1. O arquivo guardado existe para o "Modo limitado" e
  para listas que não são de painel.
- Uma URL M3U de painel e o protocolo do mesmo painel, com as mesmas
  credenciais, entregam o mesmo catálogo. Não verificado em painel real.
- Guardar o arquivo tende a ocupar menos espaço que a importação integral
  de hoje, que grava todos os itens processados. Estimativa sem medição.
  Comparado à 010, que guarda só as categorias, ocupa mais: a SC-004 da
  010 (espaço proporcional ao número de categorias) não vale para o
  caminho do arquivo guardado.
- Ler uma categoria do arquivo guardado lê só a parte daquela categoria,
  porque o arquivo é guardado já separado por categoria. Uma categoria
  muito grande ainda grava todos os seus itens de uma vez; se a meta de
  3 s da SC-003 não for alcançada, isso fica registrado como achado, não
  escondido.
- A verificação na TV física é **recomendada, não obrigatória** para esta
  feature. As metas de tempo são medidas no ambiente disponível, e o
  ambiente fica declarado junto de cada medição.
- A fonte cadastrada por URL M3U já guarda a URL completa no aparelho
  (exceção da ADR-008 para credenciais de provedor). Esta feature não muda
  onde ela fica, só passa a extrair dela as credenciais.

## Clarifications

### Sessão 2026-09-24

- Q: Como os itens de uma categoria M3U ficam disponíveis quando a pessoa
  entra nela? → A: Híbrido. Extrair dns, usuário e senha da própria URL M3U
  e usar o protocolo Xtream (caminho da 010); se não for possível, guardar
  o arquivo no aparelho e ler cada categoria dele. Opção rejeitada: baixar
  a lista de novo a cada categoria, porque cada categoria nova custaria
  quase um download inteiro.
- Q: Isso vale para a URL M3U e para o "Modo limitado"? → A: Os dois. O
  "Modo limitado" vai direto para o arquivo guardado, porque por
  definição o painel não respondeu ao protocolo.
- Q: Com a detecção, sempre vamos cair no Xtream? → A: Para as listas do
  usuário, é o esperado. O arquivo guardado continua necessário para o
  "Modo limitado", arquivos estáticos e painéis sem API. Por isso a
  detecção é a P1 e o arquivo guardado é a P2.
- Q: Quando uma URL M3U é reconhecida como painel Xtream, como a fonte
  aparece? → A: Continua como URL M3U, sem aviso (FR-005).
- Q: E se o arquivo guardado não estiver no aparelho ao entrar numa
  categoria? → A: Estado de erro focável com ação de ressincronizar; a
  categoria não some (FR-014).
- Q: E se faltar espaço para guardar o arquivo? → A: Falha declarada; a
  versão anterior do catálogo continua intacta (FR-015).
- Q: Por quanto tempo valem os itens lidos do arquivo guardado? → A:
  Enquanto durar a versão da fonte. No caminho Xtream vale a regra de 24 h
  por categoria da 010 (FR-003, FR-011).
- Q: Pré-carga com o cursor parado no caminho do arquivo guardado? → A:
  Sim, igual à 010 (FR-012).
- Q: Meta para entrar numa categoria nunca aberta no caminho do arquivo
  guardado? → A: No máximo 3 s, como a 010 (SC-003).
- Q: A verificação na TV física é obrigatória? → A: Recomendada, não
  obrigatória.
- Q (achado A1/A2 do Analyze do `sdd-plan`): o arquivo é guardado como
  texto bruto ou já separado por categoria? → A: Separado por categoria
  (D-004 do `plan.md`). O comportamento visível é o mesmo — nenhum
  download novo, só a categoria pedida é lida —, e evita percorrer o
  arquivo inteiro a cada categoria. Permitido pela ADR-010. FR-007, Key
  Entities e Assumptions atualizados.
- Q: O Modo limitado carrega a lista sem todos os itens? → A: Não. Ele
  carrega todos os itens identificados; o que fica limitado é a
  informação sobre cada um. Itens que o app não identifica como canal,
  filme ou série são descartados em qualquer fonte M3U (não só no Modo
  limitado) e contados. O Modo limitado continua existindo, porque a
  alternativa é recusar a fonte de quem tem painel sem API — mas a pessoa
  precisa de informação para saber e entender quando ele acontece (nova
  US2).
- Q: Onde a explicação do Modo limitado aparece? → A: O selo continua na
  Home, e o hub da lista mostra a explicação (FR-021).
- Q: A explicação diz o motivo específico? → A: Sim, o motivo real, em
  categorias fixas, sem endereço nem credencial (FR-020, FR-022).
- Q: URL M3U de arquivo avulso também mostra o aviso? → A: Não, só quando
  havia um painel envolvido (FR-019).
- Q (achado na revisão da spec): acesso recusado e assinatura vencida
  entram no Modo limitado? → A: Não. O download do arquivo usaria as
  mesmas credenciais e seria recusado, então a fonte nunca chegaria ao
  Modo limitado por esses motivos — só falharia com "credenciais
  recusadas", escondendo a assinatura vencida. A importação passa a falhar
  com o motivo real (FR-002), e o Modo limitado fica com dois motivos
  (FR-020).
- Q: Com a nova story de explicação, como ficam as prioridades? → A:
  Detecção de painel P1, explicação do Modo limitado P2, arquivo guardado
  P3 — o arquivo guardado é o caminho menos esperado para as listas do
  usuário.
