# Feature Specification: Player — Trilhas de Áudio, Legendas e Info do Stream

**Slug**: `029-audio-legendas-info-player`

**Created**: 2026-09-28

**Status**: Implementada

**Input**: Item 55 do backlog, sub-entrega 55a — "Áudio, legendas e info
(§27.4, §27.8)": modal de trilhas com idiomas disponíveis, legenda Off,
ajuste de sincronização de legenda (−1000…+1000 ms), áudio-descrição como
soft disabled quando não houver faixa (§39.4); modal de info técnica só com o
que o motor informar. Remove os mocks `player-tracks` e `player-info` de
`comingSoon.ts`.

## Escopo

### Incluído

- Botão **"Áudio e legendas"** do chrome do player (feature 027) deixa de
  ser mock e abre um modal real, em **VOD (filme/episódio) e Live (canal)**.
- Seleção da **faixa de áudio** entre as que o stream anuncia.
- Seleção da **legenda** entre as faixas de texto **embutidas no stream**,
  mais a opção **"Desativadas"**.
- **Renderização da legenda pelo próprio app**, sobre o vídeo, com um
  estilo fixo legível definido pelo DS V14.
- **Sincronização da legenda** com os cinco valores do §27.4
  (−1000 / −500 / 0 / +500 / +1000 ms); os valores negativos aparecem soft
  disabled enquanto o motor não permitir adiantar legenda embutida (ver
  Clarifications, sdd-plan).
- Entrada **"Áudio-descrição"** no modal: soft disabled por padrão, real só
  quando o motor identificar explicitamente uma faixa como
  áudio-descrição (§39.4).
- Continuidade da escolha: vale para a sessão e é **reaplicada por idioma**
  no próximo episódio (autoplay ou botão "Próximo") e na troca de canal
  em Live (zapping/CH±), quando o item seguinte tiver faixa equivalente.
- Botão **"Info do stream"** deixa de ser mock e abre um modal com os dados
  técnicos que o motor informar (resolução, codec de vídeo, FPS, bitrate,
  buffer, protocolo, faixa de áudio ativa) mais o estado online/offline do
  aparelho, **atualizado periodicamente** enquanto aberto.
- Remoção das entradas `player-tracks` e `player-info` de `comingSoon.ts`.

### Fora de Escopo

- Legenda externa (arquivo `.srt`/`.vtt` por URL, USB ou serviço como
  OpenSubtitles).
- Aparência da legenda configurável (tamanho, cor, fundo, contorno, prévia
  real — §39.1/§39.2): fica no **item 56**. A entrada "Aparência" do modal,
  se exibida, continua mock `a11y-subtitles`.
- Preferência global de idioma de áudio/legenda e a aba "Player &
  reprodução" em Configurações: fica no **item 55b** (`settings-player`).
- Qualidade, velocidade e aspecto (`player-quality`, `player-speed`,
  `player-aspect`): **item 55b**.
- Lembrar a faixa escolhida por obra entre sessões diferentes (persistência
  em estado do usuário).
- Teste de velocidade da internet, latência medida, "Testar internet" no
  modal de info (item 54, mock `dock-speedtest`) — nem como mock neste
  modal.
- Tela de erro de reprodução com ação "Info técnica" (item 19) — esta
  feature só entrega o modal que o item 19 poderá reusar.
- Suporte a trilhas no motor de desenvolvimento desktop além do que o
  navegador oferecer de fato.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trocar áudio e ligar legenda embutida (Priority: P1)

Uma pessoa assistindo a um filme, episódio ou canal abre o chrome, escolhe
"Áudio e legendas" e vê as faixas de áudio e de legenda que aquele stream
realmente oferece, com a ativa marcada. Ela troca o áudio (ex.: dublado →
original) e liga uma legenda (ou desativa); a mudança acontece sem
interromper a reprodução nem perder a posição, e a legenda aparece sobre o
vídeo.

**Why this priority**: legenda e troca de idioma são a funcionalidade mais
cobrada em VOD de IPTV; hoje não existe nenhuma forma de fazê-lo. Sozinha,
esta story já remove o mock `player-tracks`.

**Independent Test**: abrir um conteúdo com ≥2 faixas de áudio e ≥1 legenda
embutida, trocar cada uma pelo modal e verificar o áudio ouvido, o texto
exibido e que a posição de reprodução não voltou.

**Acceptance Scenarios**:

1. **Given** um filme tocando com 2 faixas de áudio e 1 legenda embutida,
   **When** a pessoa abre "Áudio e legendas", **Then** o modal lista as 2
   faixas de áudio (com idioma quando informado) e as opções de legenda
   "Desativadas" + a faixa embutida, com a ativa de cada grupo marcada e o
   foco na faixa de áudio ativa.
2. **Given** o modal aberto, **When** a pessoa seleciona outra faixa de
   áudio, **Then** o áudio muda sem reiniciar o conteúdo e a marcação
   acompanha.
3. **Given** legenda "Desativadas", **When** a pessoa seleciona a faixa
   embutida, **Then** o texto da legenda passa a aparecer sobre o vídeo no
   tempo certo; **When** seleciona "Desativadas", **Then** nenhum texto é
   exibido.
4. **Given** um stream com uma só faixa de áudio e nenhuma legenda,
   **When** a pessoa abre o modal, **Then** ele mostra a faixa única marcada
   e informa "Nenhuma legenda neste conteúdo", sem entrada focável morta.
5. **Given** o modal aberto, **When** a pessoa pressiona RETURN, **Then** o
   modal fecha e o foco volta ao botão "Áudio e legendas" do chrome.
6. **Given** um canal ao vivo com 2 faixas de áudio, **When** a pessoa troca
   a faixa pelo modal, **Then** o áudio muda e o canal continua tocando.

---

### User Story 2 - Info técnica do stream (Priority: P2)

A pessoa, com o stream travando ou com imagem ruim, abre "Info do stream" e
vê o que o motor sabe daquele stream — resolução, codec, FPS, bitrate,
buffer, protocolo, faixa de áudio ativa — e se o aparelho está online. Os
números se atualizam enquanto o modal está aberto.

**Why this priority**: diagnóstico útil e independente da P1; remove o mock
`player-info`. Vem depois porque não altera a reprodução.

**Independent Test**: abrir o modal durante a reprodução, verificar que só
aparecem campos que o motor informou e que bitrate/buffer mudam ao longo de
alguns segundos.

**Acceptance Scenarios**:

1. **Given** um conteúdo tocando, **When** a pessoa abre "Info do stream",
   **Then** o modal exibe apenas os campos que o motor informou, cada um com
   rótulo e valor; campo não informado não aparece.
2. **Given** o modal aberto, **When** passam alguns segundos, **Then**
   valores variáveis (bitrate, buffer) refletem a leitura mais recente.
3. **Given** o modal aberto, **When** o aparelho perde a conexão, **Then**
   o estado muda para offline sem fechar o modal.
4. **Given** o modal aberto, **When** a pessoa pressiona RETURN ou aciona
   "Fechar", **Then** o modal fecha, a atualização periódica para e o foco
   volta ao botão "Info do stream".

---

### User Story 3 - Sincronizar legenda e manter a escolha adiante (Priority: P3)

Com uma legenda ativa fora de sincronia, a pessoa escolhe um atraso entre
−1000 e +1000 ms e a legenda se ajusta. Ao passar para o próximo episódio
(ou trocar de canal em Live), o app tenta manter o mesmo idioma de áudio e
de legenda e o mesmo atraso, sem perguntar de novo.

**Why this priority**: refinamento sobre a P1; útil sobretudo em séries
maratonadas, mas a P1 já entrega valor sem ela.

**Independent Test**: ativar legenda, aplicar +500 ms e verificar o
deslocamento; avançar para o próximo episódio com o mesmo idioma disponível
e verificar que áudio/legenda/atraso foram reaplicados.

**Acceptance Scenarios**:

1. **Given** legenda ativa, **When** a pessoa escolhe "+500 ms", **Then**
   cada linha passa a aparecer 500 ms mais tarde que antes e a opção fica
   marcada.
2. **Given** legenda "Desativadas", **When** a pessoa abre o modal,
   **Then** as opções de sincronização aparecem soft disabled, com
   explicação ao selecionar.
3. **Given** áudio "English" e legenda "Português" escolhidos no episódio 1,
   **When** o episódio 2 começa (autoplay ou "Próximo"), **Then** o app
   seleciona áudio "English" e legenda "Português" se o episódio 2 tiver
   faixas com esses idiomas, e o mesmo atraso.
4. **Given** o idioma escolhido não existe no item seguinte, **When** ele
   começa, **Then** vale o padrão do stream para aquele grupo, sem aviso
   intrusivo.
5. **Given** áudio "Original" escolhido num canal ao vivo, **When** a pessoa
   troca de canal por zapping ou CH±, **Then** o app tenta o mesmo idioma no
   canal seguinte.
6. **Given** a pessoa fecha o player, **When** abre outro conteúdo não
   sequencial, **Then** a escolha anterior não é reaplicada.

---

### Edge Cases

- **Motor não informa faixas** (motor de desenvolvimento desktop, ou falha
  na leitura): o botão "Áudio e legendas" fica soft disabled com explicação
  ("Este aparelho não informou as faixas deste conteúdo"), nunca abre um
  modal vazio nem inventa faixas.
- **Faixa sem idioma declarado**: rótulo neutro e estável ("Faixa 1",
  "Faixa 2"…), nunca um idioma adivinhado pelo nome; codec/canais só se o
  motor informar.
- **Idioma repetido** (duas faixas "Português"): ambas listadas,
  distinguidas pela informação extra que o motor der, ou pela numeração.
- **Troca de faixa falha**: a marcação volta para a faixa realmente ativa e
  um aviso discreto informa a falha; a reprodução continua.
- **Faixas mudam durante a sessão** (Live muda de programa, stream
  adaptativo reanuncia): o modal aberto reflete a lista atual; a faixa
  escolhida é mantida se ainda existir.
- **Legenda com texto vazio / cue de apagar**: a área de legenda some, sem
  caixa de fundo vazia sobre o vídeo.
- **Chrome oculto**: a legenda continua visível sobre o vídeo com o chrome
  oculto ou visível, sem ser coberta por ele nem cobrir os controles.
- **Zapping aberto sobre o vídeo (feature 016)**: a legenda não aparece por
  cima da lista de canais.
- **Pausa**: a última linha de legenda permanece visível enquanto pausado.
- **App oculto/retomado (feature 020)**: ao voltar, a legenda e a faixa de
  áudio da sessão continuam as mesmas.
- **Modal aberto e a sessão termina** (fim do conteúdo, erro, autoplay do
  próximo episódio): o modal fecha e o foco segue o fluxo normal do player.
- **Áudio-descrição**: sem faixa marcada pelo motor como tal, a entrada é
  soft disabled; Select explica "Este conteúdo não oferece
  áudio-descrição". Nunca inferir pelo rótulo da faixa.
- **Info com zero campos informados**: o modal mostra só o estado de rede e
  uma frase "O aparelho não informou dados técnicos deste stream".

## Requirements *(mandatory)*

### Functional Requirements

**Áudio e legendas (P1)**

- **FR-001**: O botão "Áudio e legendas" do chrome DEVE ser uma ação real
  em VOD (filme/episódio) e em Live (canal) quando o motor informar as
  faixas do conteúdo atual; o mock `player-tracks` DEVE ser removido do
  registro de "Em breve".
- **FR-002**: Quando o motor não informar as faixas, o botão DEVE ficar soft
  disabled (focável, com "indisponível" no nome acessível) e, ao ser
  acionado, DEVE explicar o motivo sem abrir o modal.
- **FR-003**: O modal DEVE listar, em grupos separados, as faixas de áudio e
  as faixas de legenda que o motor informar, na ordem informada, e marcar a
  faixa ativa de cada grupo.
- **FR-004**: O grupo de legendas DEVE incluir sempre a opção
  "Desativadas"; se não houver nenhuma faixa de legenda, o grupo DEVE dizer
  "Nenhuma legenda neste conteúdo".
- **FR-005**: O rótulo de cada faixa DEVE usar o idioma informado pelo motor
  (nome legível em português quando o código for reconhecido) e, quando
  informados, dados extras (ex.: canais, codec); sem idioma, DEVE usar um
  rótulo neutro numerado. Nenhum rótulo DEVE ser inventado.
- **FR-006**: Selecionar uma faixa de áudio DEVE trocar o áudio sem
  reiniciar o conteúdo nem alterar a posição de reprodução.
- **FR-007**: Selecionar uma faixa de legenda DEVE passar a exibir o texto
  dessa faixa sobre o vídeo; "Desativadas" DEVE ocultar qualquer texto de
  legenda.
- **FR-008**: A legenda DEVE ser renderizada pelo app com um estilo fixo
  legível definido pelos tokens do DS V14, dentro da área segura, sem ser
  coberta pelo chrome e sem cobrir seus controles; e NÃO DEVE aparecer por
  cima da lista de zapping.
- **FR-009**: Se a troca de faixa falhar, a marcação DEVE refletir a faixa
  realmente ativa e um aviso DEVE informar a falha, sem interromper a
  reprodução.
- **FR-010**: O modal DEVE seguir as regras de modal do projeto: foco
  inicial na faixa de áudio ativa, navegação por D-pad entre grupos,
  RETURN fecha e devolve o foco ao botão que o abriu, e nenhuma tecla vaza
  para o player por trás.
- **FR-011**: A entrada "Áudio-descrição" DEVE estar presente no modal;
  DEVE ser uma seleção real só quando o motor identificar explicitamente uma
  faixa como áudio-descrição; caso contrário DEVE ser soft disabled e, ao
  ser acionada, anunciar "Este conteúdo não oferece áudio-descrição".
- **FR-012**: Se a lista de faixas mudar com o modal aberto, o modal DEVE
  refletir a lista atual, mantendo a seleção quando a faixa ainda existir.

**Info do stream (P2)**

- **FR-013**: O botão "Info do stream" do chrome DEVE ser uma ação real em
  VOD e Live; o mock `player-info` DEVE ser removido do registro de "Em
  breve".
- **FR-014**: O modal DEVE exibir somente os campos que o motor informar
  entre: resolução, codec de vídeo, FPS, bitrate, buffer, protocolo e faixa
  de áudio ativa; campo não informado NÃO DEVE aparecer nem ser
  preenchido com valor estimado.
- **FR-015**: O modal DEVE exibir o estado online/offline do aparelho,
  acompanhando mudanças enquanto estiver aberto.
- **FR-016**: Os valores DEVEM ser relidos periodicamente (≈1 s) enquanto o
  modal estiver aberto, e a releitura DEVE parar quando ele fechar ou o app
  for ocultado.
- **FR-017**: O modal DEVE ter uma ação focável "Fechar"; RETURN e "Fechar"
  DEVEM devolver o foco ao botão "Info do stream".
- **FR-018**: Nenhum valor exibido no modal DEVE conter URL do stream,
  host do provedor ou credencial.

**Sincronização e continuidade (P3)**

- **FR-019**: O modal DEVE oferecer os atrasos −1000, −500, 0 ("Sem
  atraso"), +500 e +1000 ms, marcando o ativo (padrão 0), e aplicá-los ao
  momento de exibição de cada linha de legenda. Atrasos negativos (adiantar)
  DEVEM ficar soft disabled, com explicação ao serem acionados, quando o
  motor não oferecer como adiantar legenda embutida — o app só recebe cada
  linha no instante de exibi-la e não consegue mostrá-la antes.
- **FR-020**: Com legenda "Desativadas", as opções de sincronização DEVEM
  ficar soft disabled, com explicação ao serem acionadas.
- **FR-021**: A escolha de áudio, legenda e atraso DEVE valer até o player
  fechar e DEVE ser reaplicada, por idioma, quando o próximo episódio
  começar (autoplay ou "Próximo/Anterior") e quando o canal mudar em Live
  (zapping ou CH±), se o item seguinte tiver faixa do mesmo idioma.
- **FR-022**: Quando o item seguinte não tiver faixa do idioma escolhido, o
  grupo correspondente DEVE usar o padrão do stream, sem aviso intrusivo.
- **FR-023**: Ao fechar o player e abrir outro conteúdo fora dessa
  sequência, nenhuma escolha anterior DEVE ser reaplicada.

**Transversais**

- **FR-024**: Todo controle novo DEVE ter nome acessível; controles soft
  disabled DEVEM ter `aria-disabled` ou "indisponível"/"em breve" no nome,
  conforme a checagem de nomes acessíveis da feature 028.
- **FR-025**: Os demais botões do chrome (Qualidade, Velocidade, Aspecto,
  Guia) DEVEM continuar exatamente como estão (mocks), e o comportamento de
  teclas do chrome da feature 027 NÃO DEVE mudar.

### Key Entities

- **Faixa de mídia**: uma faixa de áudio ou de legenda anunciada pelo motor
  para a sessão atual — tipo (áudio/texto), identificador dentro da sessão,
  idioma (opcional), dados extras (opcionais: canais, codec), marca de
  áudio-descrição (só se o motor informar) e se está ativa.
- **Escolha de faixas da sessão**: idioma de áudio escolhido, idioma de
  legenda escolhido (ou "desativadas") e atraso da legenda — vive só em
  memória, do abrir ao fechar do player, e é o que se reaplica ao item
  seguinte da sequência.
- **Linha de legenda**: texto a exibir, com instante de início e duração,
  entregue pelo motor durante a reprodução.
- **Info técnica do stream**: conjunto de campos opcionais (resolução,
  codec, FPS, bitrate, buffer, protocolo, faixa de áudio ativa) lido do
  motor em um instante, mais o estado de rede do aparelho.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Num conteúdo com ≥2 faixas de áudio e ≥1 legenda embutida, a
  pessoa troca o áudio e liga a legenda em no máximo 10 pressionamentos de
  tecla a partir do chrome visível, sem a reprodução reiniciar. (Emendado no
  sdd-execute, 2026-09-28: o original dizia 6, inalcançável com o painel
  em lista única — ver Clarifications.)
- **SC-002**: 100% das faixas exibidas no modal correspondem a faixas
  informadas pelo motor; nenhum rótulo, idioma ou campo técnico aparece sem
  vir do motor (verificável por teste com motor simulado).
- **SC-003**: A legenda ativa aparece sobre o vídeo em até 1 s após a
  seleção, na próxima linha programada, e respeita o atraso escolhido com
  precisão de ±100 ms.
- **SC-004**: Ao avançar para o próximo episódio com os mesmos idiomas
  disponíveis, áudio, legenda e atraso são reaplicados em 100% dos casos,
  sem nenhuma ação da pessoa.
- **SC-005**: Os mocks `player-tracks` e `player-info` não existem mais no
  registro de "Em breve", e nenhum controle do modal fica sem nome
  acessível.
- **SC-006** *(recomendado, não gate)*: Na TV de referência (QN50Q60DAGXZD),
  com um stream real de múltiplas faixas, trocar áudio, ligar legenda e ver
  a info técnica funcionam sobre o plano de hardware do vídeo.

## Assumptions

- O AVPlay expõe listagem e seleção de faixas, informação do stream atual e
  entrega de texto de legenda por callback — a confirmar num **spike na TV
  de referência como primeira fase do `sdd-execute`**. O `sdd-plan` desenha
  o contrato pela documentação oficial e registra essa incerteza como
  risco; se o spike mostrar que algo não existe, o requisito vira soft
  disabled com explicação, nunca simulação.
- O motor de desenvolvimento desktop (`<video>`) pode não oferecer faixas
  de áudio no Chromium; nele, os botões podem ficar soft disabled (FR-002)
  e os testes usam um motor simulado.
- A legenda embutida em IPTV chega como texto (não bitmap). Legendas em
  imagem, se aparecerem, não são exibidas nesta feature e ficam como
  risco/descoberta do spike.
- O estilo fixo da legenda é substituível depois pelo item 56 sem mudar o
  comportamento desta feature.
- "Estado de rede" usa o mesmo sinal online/offline que o `OfflineBanner`
  já usa (feature 022); latência e velocidade medidas ficam fora.
- A verificação na TV física é **recomendada, não gate** desta feature
  (decisão do usuário), apesar do spike depender dela.

## Clarifications

### Sessão 2026-09-28

- Q: Onde "Áudio e legendas" e "Info do stream" passam a ser reais? → A: VOD
  e Live (§27.1 lista ambos como compartilhados).
- Q: Legendas de onde entram? → A: Só as embutidas no stream; arquivo
  externo fica fora de escopo.
- Q: Quanto dura a escolha de faixa? → A: A sessão, reaplicada por idioma no
  próximo episódio; preferência global fica para a 55b.
- Q: Aparência da legenda nesta feature? → A: Estilo fixo legível; ajuste
  fica no item 56.
- Q: Stream com 1 áudio e nenhuma legenda — o botão faz o quê? → A: Abre o
  modal mostrando o que há, com "Nenhuma legenda neste conteúdo".
- Q: Áudio-descrição? → A: Entrada sempre presente, soft disabled; real só
  se o motor marcar a faixa explicitamente; nunca adivinhar pelo nome.
- Q: No Live, ao trocar de canal, o idioma de áudio? → A: Tenta manter o
  mesmo idioma no canal seguinte (estendido também à legenda e ao atraso,
  pela mesma regra da sequência de episódios).
- Q: A verificação na TV física é gate? → A: Recomendada, não gate.
- Q: O que o modal de info inclui além dos dados do motor? → A: Só o estado
  online/offline; "Testar internet" fica fora, nem como mock.
- Q: Os valores de info atualizam com o modal aberto? → A: Sim, a cada ~1 s.
- Q: Quando fazer o spike das APIs do AVPlay? → A: Como primeira fase do
  `sdd-execute`, na TV; o `sdd-plan` registra a incerteza como risco.

### Sessão 2026-09-28 (sdd-plan)

- Q: Os atrasos negativos da sincronização (−1000/−500 ms) são viáveis? →
  A: Não para legenda embutida no AVPlay: a referência oficial diz que
  `setSubtitlePosition` só vale para legenda externa, e o app recebe cada
  linha (`onsubtitlechange`) no instante de exibi-la. Os negativos aparecem
  soft disabled com explicação (constitution, "Progresso e Capacidades São
  Reais"); FR-019 e o item Incluído foram ajustados. Se o spike da Fase 1
  provar o contrário na TV, vira seleção real (R-003 do `plan.md`).
- Q: SC-001 (≤ 6 teclas) é alcançável? → A: Não: abrir o painel custa 3
  teclas (→ →, OK), trocar o áudio +2 e ligar a legenda +4, ≈ 9. Decidido
  pelo usuário no sdd-execute (achado A-001 do Analyze): SC-001 passa a
  "≤ 10 pressionamentos". Só texto da spec; contrato, ordem do painel e
  código não mudam.
- Q: O modal "Info do stream" mostra protocolo, FPS e buffer? → A: Só se o
  motor informar; o AVPlay não expõe nenhum dos três pela referência, então
  na TV ficam ausentes. Protocolo nunca é deduzido da URL.
