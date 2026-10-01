# Feature Specification: Qualidade, aspecto e preferências do player (sem velocidade)

**Slug**: `041-player-qualidade-aspecto`

**Created**: 2026-10-01

**Status**: Convergida

**Input**: Item 55b do backlog — qualidade, aspecto e preferências do player
(DS V14 §27.5–§27.7) e a aba real "Player & reprodução" em Configurações,
**sem velocidade**: por decisão do usuário, o controle "Velocidade" sai do
player e da feature.

## Escopo

### Incluído

- **Aspecto** no player (filme, episódio e canal): Ajustar, Preencher,
  Original e Zoom — o controle "Aspecto" deixa de ser "Em breve".
- **Qualidade** no player (filme, episódio e canal): "Auto" mais as
  resoluções que o stream de fato anuncia; quando o stream não oferece
  variação, o controle fica soft disabled com o motivo — nunca uma opção
  inventada.
- **Remoção do controle "Velocidade"** do player (o mock "Em breve" some do
  chrome e do registro de mocks) — decisão do usuário.
- **Aba real "Player & reprodução"** em Configurações, com quatro
  preferências do aparelho: aspecto padrão, qualidade padrão (Auto / Máxima /
  Econômica), idioma preferido de áudio e legenda padrão (desligada ou um
  idioma).
- Cada reprodução **nova** começa pelas preferências; trocar no player vale
  para a sessão e a sequência dela, sem mudar a preferência.

### Fora de Escopo

- **Velocidade de reprodução** (0.5×–2.0×, DS §27.6) — retirada pelo usuário
  em 01/10/2026; não volta como mock.
- Aparência da legenda (tamanho, cor, fundo — item 56 do backlog) e alto
  contraste.
- Preferências por lista (perfil): as do player são do aparelho.
- Trocar o motor de reprodução, transcodificar ou converter o stream (Direct
  Play, ADR-001/ADR-008).
- Ajuste fino de zoom/posição (só os quatro modos do DS).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ajustar o aspecto do vídeo no player (Priority: P1)

Assistindo a um filme, episódio ou canal com barras pretas ou imagem
esticada, a pessoa abre o controle "Aspecto" no player e escolhe entre
Ajustar, Preencher, Original e Zoom; a imagem muda na hora e a escolha vale
até o fim daquela sequência.

**Why this priority**: É o ajuste visível mais pedido em IPTV (streams com
proporções variadas) e o que mais depende do aparelho — prova o caminho todo
(controle, motor, sessão).

**Independent Test**: Num filme e num canal, abrir "Aspecto", trocar o modo,
ver a imagem mudar; trocar de canal (zapping/CH±) e ver o modo mantido; abrir
outro conteúdo do zero e ver o aspecto padrão de novo.

**Acceptance Scenarios**:

1. **Given** um conteúdo tocando, **When** a pessoa abre "Aspecto", **Then**
   vê os quatro modos com o atual marcado e o foco nele.
2. **Given** o painel aberto, **When** escolhe outro modo, **Then** a imagem
   muda imediatamente e o modo fica marcado.
3. **Given** um modo escolhido num canal, **When** troca de canal pelo
   zapping, CH± ou ↑/↓, **Then** o mesmo modo continua aplicado.
4. **Given** um modo escolhido num episódio, **When** o próximo episódio
   começa (autoplay ou "Próximo episódio"), **Then** o mesmo modo continua.
5. **Given** o player fechado, **When** a pessoa abre outro conteúdo, **Then**
   ele começa no aspecto padrão das preferências, não no último escolhido.
6. **Given** um aparelho que não aceita trocar o aspecto, **When** a pessoa
   foca "Aspecto", **Then** o controle aparece soft disabled e explica por quê
   — nunca um painel que não faz nada.

---

### User Story 2 - Escolher a qualidade quando o stream oferece (Priority: P2)

Num stream com várias resoluções, a pessoa abre "Qualidade" e escolhe "Auto"
ou uma resolução específica; num stream com uma só, o controle explica que
não há o que escolher.

**Why this priority**: Útil em rede instável, mas muitos streams IPTV têm uma
resolução só — o valor depende da fonte.

**Independent Test**: Num stream com variações, trocar para uma resolução e
ver a qualidade mudar (e o Info do stream refletir); num stream de qualidade
única, ver o controle soft disabled com o motivo.

**Acceptance Scenarios**:

1. **Given** um stream que anuncia várias resoluções, **When** a pessoa abre
   "Qualidade", **Then** vê "Auto" e só as resoluções anunciadas, com a atual
   marcada.
2. **Given** o painel aberto, **When** escolhe uma resolução, **Then** a
   reprodução passa a usá-la e "Info do stream" mostra a nova resolução.
3. **Given** um stream que não anuncia variação, **When** a pessoa foca
   "Qualidade", **Then** o controle fica soft disabled com o motivo, sem
   abrir painel.
4. **Given** uma qualidade escolhida, **When** troca de canal/episódio na
   mesma sequência, **Then** aplica a mesma regra (a mesma resolução se o
   novo stream a anunciar; senão "Auto").

---

### User Story 3 - Preferências do player em Configurações (Priority: P2)

Em Configurações › "Player & reprodução", a pessoa define o aspecto padrão, a
qualidade padrão (Auto / Máxima / Econômica), o idioma preferido de áudio e a
legenda padrão; toda reprodução nova começa por elas.

**Why this priority**: Evita reescolher a cada canal/filme; depende das
peças da US1/US2 e das faixas da 029.

**Independent Test**: Definir aspecto "Preencher", qualidade "Máxima", áudio
"Inglês" e legenda "Português"; abrir um filme com essas opções e ver tudo
aplicado; abrir um sem inglês e ver o áudio padrão do stream, sem aviso.

**Acceptance Scenarios**:

1. **Given** Configurações aberta, **When** a pessoa entra em "Player &
   reprodução", **Then** vê as quatro preferências com o valor atual (de
   fábrica: Ajustar, Auto, sem preferência de áudio, legenda desligada).
2. **Given** uma preferência alterada, **When** a pessoa abre uma reprodução
   nova, **Then** ela começa com o valor escolhido.
3. **Given** um idioma preferido de áudio ou legenda que o conteúdo não tem,
   **When** a reprodução começa, **Then** fica o padrão do stream (legenda
   desligada se não houver o idioma), sem mensagem.
4. **Given** uma preferência alterada, **When** a pessoa volta a uma
   sequência já em andamento (o mesmo player aberto), **Then** a escolha feita
   no player continua valendo até a sequência acabar.
5. **Given** a aba aberta sem nenhuma lista ativa, **When** a pessoa a usa,
   **Then** funciona normalmente (as preferências são do aparelho).

---

### User Story 4 - Sem controle de velocidade (Priority: P3)

O player não mostra mais o controle "Velocidade" (nem como "Em breve") em
nenhum tipo de conteúdo.

**Why this priority**: Pedido explícito do usuário; trivial, mas mexe em
contratos travados de outras features (027/029).

**Independent Test**: Abrir um filme e percorrer a linha de controles: não
existe "Velocidade"; a ordem dos demais continua lógica.

**Acceptance Scenarios**:

1. **Given** um filme ou episódio tocando, **When** a pessoa percorre a linha
   de controles, **Then** não há "Velocidade".
2. **Given** o registro de mocks "Em breve", **When** se procura
   "Velocidade", **Then** ele não existe mais.

---

### Edge Cases

- **Aspecto não suportado pelo motor** (ex.: `<video>` de desenvolvimento ou
  TV que recuse um modo): só os modos de fato aplicáveis aparecem; se nenhum,
  o controle fica soft disabled com o motivo.
- **Qualidade com uma só resolução**: soft disabled, nunca lista com um item.
- **Stream que muda as resoluções anunciadas** no meio (adaptativo
  reanuncia): o painel aberto acompanha (mesma releitura do painel de faixas,
  029) e a escolha que deixou de existir cai para "Auto".
- **Troca de qualidade falha**: mensagem curta, a reprodução continua na
  qualidade anterior — nunca tela de erro.
- **Preferência "Máxima"/"Econômica" em stream de qualidade única**: usa a
  única que há, sem aviso.
- **Preferência alterada com o player aberto**: não muda a sequência em
  andamento; vale da próxima reprodução nova.
- **Tela de erro do player**: aspecto/qualidade não aparecem.
- **Guia ou zapping abertos sobre o vídeo**: os painéis de aspecto/qualidade
  não abrem por cima deles (mesma regra dos painéis da 029).

## Requirements *(mandatory)*

### Functional Requirements

**Aspecto**

- **FR-001**: O controle "Aspecto" do player DEVE ser real em filme,
  episódio e canal, oferecendo Ajustar, Preencher, Original e Zoom (só os que
  o motor aceita).
- **FR-002**: Escolher um modo DEVE aplicá-lo imediatamente e marcá-lo como
  atual; o foco ao abrir DEVE estar no modo atual.
- **FR-003**: O modo escolhido DEVE valer para a sessão e para a sequência
  dela (zapping, CH±, ↑/↓, próximo episódio, autoplay) sem alterar a
  preferência.
- **FR-004**: Sem nenhum modo aplicável no motor, o controle DEVE ficar soft
  disabled com o motivo no nome acessível, sem abrir painel.

**Qualidade**

- **FR-005**: O controle "Qualidade" DEVE listar "Auto" mais somente as
  resoluções que o stream anuncia, com a atual marcada.
- **FR-006**: Com uma só resolução (ou nenhuma informação), o controle DEVE
  ficar soft disabled com o motivo, sem abrir painel.
- **FR-007**: Escolher uma resolução DEVE aplicá-la; falhar DEVE manter a
  anterior com um aviso curto, sem tela de erro.
- **FR-008**: A escolha de qualidade DEVE seguir a sequência como o aspecto;
  num stream novo que não anuncia a resolução escolhida, DEVE usar "Auto".

**Velocidade**

- **FR-009**: O player NÃO DEVE exibir o controle "Velocidade" (nem como "Em
  breve") em nenhum tipo de conteúdo, e o mock correspondente DEVE sair do
  registro de "Em breve".

**Preferências**

- **FR-010**: Configurações DEVE ter a aba real "Player & reprodução" (o mock
  `settings-player` sai), com: aspecto padrão (Ajustar/Preencher/Original/
  Zoom), qualidade padrão (Auto/Máxima/Econômica), idioma preferido de áudio
  (nenhum ou um idioma) e legenda padrão (desligada ou um idioma).
- **FR-011**: As preferências DEVEM ser do aparelho (independentes da lista
  ativa) e DEVEM persistir entre aberturas do app.
- **FR-012**: Toda reprodução nova DEVE começar pelas preferências; a escolha
  feita no player DEVE prevalecer dentro da sequência e NÃO DEVE alterar a
  preferência.
- **FR-013**: Idioma preferido (áudio ou legenda) ausente no conteúdo DEVE
  resultar no padrão do stream (legenda desligada), sem mensagem.
- **FR-014**: "Máxima"/"Econômica" DEVEM escolher, respectivamente, a maior e
  a menor resolução anunciada; sem variação, a única disponível.

**Navegação e acessibilidade**

- **FR-015**: Os painéis de aspecto e qualidade DEVEM seguir o padrão dos
  painéis do player (feature 029): ↑/↓ movem, OK aplica, RETURN fecha
  devolvendo o foco ao controle que abriu; um foco visível por vez.
- **FR-016**: Todo controle e opção DEVE ter nome acessível; os soft disabled
  DEVEM trazer o motivo no nome.

### Key Entities

- **Preferências do player (do aparelho)**: aspecto padrão, qualidade padrão
  (Auto/Máxima/Econômica), idioma preferido de áudio, legenda padrão.
- **Escolha da sequência**: o aspecto, a qualidade e as faixas escolhidos no
  player para a sessão atual e as seguintes da mesma sequência (estende a
  escolha de faixas da 029); nunca persistida como preferência.

### Measurable Outcomes

- **SC-001**: Em 100% dos casos de teste, nenhuma opção de qualidade é
  exibida sem que o stream a anuncie.
- **SC-002**: Trocar o aspecto reflete na imagem em até 1 s na TV de
  referência.
- **SC-003**: Em 100% dos casos de teste, a escolha feita no player não
  altera nenhuma preferência, e cada reprodução nova começa pelas
  preferências.
- **SC-004**: O controle "Velocidade" não aparece em nenhum tipo de conteúdo.
- **SC-005**: Na TV de referência (gate), aspecto e qualidade funcionam nos
  conteúdos testados, e o que o aparelho não suportar aparece soft disabled
  com o motivo — nunca um controle que não faz nada.

## Assumptions

- **Velocidade fora** por decisão do usuário (01/10/2026): é um desvio do DS
  V14 §27.6, permitido pela precedência da ADR-011 (decisão de produto acima
  do DS), registrado aqui.
- Contratos travados de outras features descrevem o chrome atual (027 exige
  os mocks "Qualidade/Velocidade/Aspecto — em breve" e conta os passos da
  linha; 029 conta passos passando por "Velocidade"): **só o contrato da 027
  precisou de emenda** (1º teste, com aprovação do usuário, trava regravada —
  R-012 do plano dela). O da 029 **não** precisou: os 6 passos continuam
  chegando em "Info do stream" porque o foco para no fim da linha; só um
  comentário dele ainda cita "Velocidade" (arquivo travado, não editado).
- A escolha de faixas da 029 (por idioma, que segue a sequência) é a base:
  aspecto/qualidade entram no mesmo modelo, e as preferências de áudio/
  legenda passam a ser o ponto de partida dela.
- Aspecto e qualidade dependem de APIs do AVPlay que só se provam na TV —
  **passada na TV física é gate obrigatório** (constitution "Validação em
  hardware real", mesmo padrão das 013/027), com um spike no começo da
  execução.
- A aba "Player & reprodução" entra pelo registro de abas de Configurações
  (item 63).

## Clarifications

### Sessão 2026-10-01

- Q: O botão de velocidade? → A: Sai do player e da feature (decisão do
  usuário).
- Q: Qualidade, se muitos streams têm uma resolução só? → A: Real só quando o
  stream anuncia (Auto + resoluções anunciadas); senão soft disabled com o
  motivo.
- Q: Aspecto no player × preferência? → A: Preferência define o padrão; a
  troca no player vale para a sessão e a sequência, sem mudar o padrão.
- Q: O que entra na aba "Player & reprodução"? → A: Aspecto padrão,
  qualidade padrão, idioma preferido de áudio e legenda padrão.
- Q: Opções da qualidade padrão? → A: Auto / Máxima / Econômica.
- Q: Preferências do aparelho ou por lista? → A: Do aparelho inteiro.
- Q: Preferência × escolha no player? → A: Cada reprodução nova começa pela
  preferência; a escolha no player vence dentro da sequência e nunca altera a
  preferência; idioma ausente cai no padrão do stream, sem aviso.
- Q: Passada na TV física? → A: Gate obrigatório.
