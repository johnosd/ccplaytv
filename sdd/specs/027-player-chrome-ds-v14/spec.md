# Feature Specification: Player chrome do Design System V14 com auto-hide e teclas de mídia (Onda 6)

**Slug**: `027-player-chrome-ds-v14`

**Created**: 2026-09-28

**Status**: Convergida

**Input**: Onda 6 da migração para o Design System V14 Spectrum — item M7
do backlog (`.planning/backlog.md`) e seção "Onda 6" de
`.planning/migracao-design-system-v14.md`: chrome V14 do player com
auto-hide (§27, §43 do Spec) — live bug e canal no Live; timeline e ±10 s
no VOD; anterior/próximo episódio; botões de áudio/legenda, qualidade,
velocidade, aspecto e info soft disabled, dirigidos pelo contrato de
capacidades; teclas de mídia registradas só se disponíveis. A Onda 7
(limpeza e QA) foi separada para uma feature própria (ver Clarifications).

## Contexto

Hoje o `PlayerLayer` (feature 011, estendido por 012, 016, 019 e 020) é a
única camada de reprodução em tela cheia, compartilhada por Live TV, Filmes
e Séries. Ele já tem:

- barra de controles (`PlayerControls`) derivada do contrato de capacidades
  (`canPause`/`canSeek`/`reportsPosition`/`reportsDuration`): `⏪ 10s`,
  `▶/⏸`, `⏩ 10s` e a barra de progresso focável — e **nenhum** controle
  quando a capacidade não existe (canal ao vivo: a barra inteira some);
- auto-hide de 5 s, em que o primeiro toque de qualquer seta/OK com a barra
  escondida só a revela;
- no canal, só um bloco de status com o nome do canal e um rótulo;
- zapping por OK (feature 016), autoplay do próximo episódio com contagem
  regressiva de 10 s (feature 012), retomada (011/019), protetor de tela e
  ciclo de vida (020).

O que falta para o V14 é o **chrome**: a moldura visual e de navegação do
Spec §27/§43, com identidade do que está tocando (canal com número, logo e
live bug; filme; episódio com temporada/número), os controles que já
existem no novo visual, os controles do Spec que ainda não têm capacidade
real como mocks honestos "Em breve", troca de canal por ↑/↓ e as teclas
físicas de mídia do controle.

## Escopo

### Incluído

- Chrome V14 para os três tipos de mídia (canal, filme, episódio), com
  auto-hide durante reprodução contínua e permanência enquanto pausado.
- **Live**: live bug ("AO VIVO"), número do canal (posição na fonte,
  ADR-011/feature 024), logo e nome do canal; troca de canal por ↑/↓ e por
  CH+/CH− dentro da categoria de origem; botão "Guia" soft disabled
  "Em breve".
- **VOD (filme e episódio)**: título, tempo decorrido/total, timeline,
  `⏪ 10s`/`▶⏸`/`⏩ 10s` — os mesmos controles de hoje, dirigidos pelas
  mesmas capacidades, no visual V14.
- **Episódio**: botões "Episódio anterior" e "Próximo episódio", soft
  disabled no primeiro/último episódio conhecido, atravessando temporada.
- Botões de **Áudio e legendas, Qualidade, Aspecto e Info do stream** (Live
  e VOD) e **Velocidade** (só VOD) como soft disabled "Em breve",
  registrados no registro único de "Em breve" (feature 022).
- **Teclas de mídia**: `MediaPlayPause`, `MediaPlay`, `MediaPause`,
  `MediaStop`, `MediaRewind`, `MediaFastForward`, `ChannelUp`,
  `ChannelDown` — registradas só se a plataforma as declarar suportadas.
- Rótulos acessíveis em todos os controles do chrome.

### Fora de Escopo

- **Onda 7 (limpeza e QA)**: quebra do `features/screens.css`, remoção de
  CSS morto, matriz de QA Tizen (§34) em todas as telas, varredura geral de
  `aria-label`, emenda final da ADR-007/CLAUDE.md — vira feature própria
  (028).
- Capacidade real de trilhas de áudio/legenda, qualidade, velocidade,
  aspecto e info do stream (item 55 do backlog) — aqui só os mocks.
- EPG, "programa atual" e guia de programação (item 42) — nenhuma linha de
  programa é exibida.
- Seleção de canal por número / overlay de dígitos (§44, item 44).
- Timeshift, catch-up, pausa no ao vivo (item 43).
- Preview de mídia no foco (vedado pela ADR-011).
- Topbar sobre o player.
- Qualquer mudança no fluxo de retomada, no autoplay do próximo episódio,
  no zapping por lista (016) ou no ciclo de vida/protetor de tela (020),
  além de coexistir com o chrome.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Chrome V14 no filme e no episódio (Priority: P1)

Quem assiste a um filme ou episódio vê, ao interagir, um chrome V14 com o
título (e, no episódio, a série, temporada e número), tempo e timeline, e
os controles de pular 10 s e play/pause — os mesmos de hoje, no novo
visual. O chrome some sozinho após alguns segundos de reprodução contínua e
fica visível enquanto a reprodução estiver pausada.

**Why this priority**: É o player mais usado para conteúdo sob demanda e o
núcleo visual do §27; sem ele o player continua no layout antigo.

**Independent Test**: Abrir um filme, confirmar o chrome com título,
tempo, timeline e três controles; esperar 5 s tocando e ver o chrome
sumir; pausar e ver que ele não some.

**Acceptance Scenarios**:

1. **Given** um filme tocando com o chrome escondido, **When** a pessoa
   pressiona ↑/↓ ou OK, **Then** o chrome aparece sem executar ação e o
   foco fica em Play/Pause; **When** pressiona ←/→, **Then** a posição
   salta 10 s e o chrome aparece (comportamento atual).
2. **Given** o chrome visível e a reprodução contínua, **When** passam 5 s
   sem interação, **Then** o chrome se esconde.
3. **Given** a reprodução pausada, **When** passam 5 s sem interação,
   **Then** o chrome continua visível; **When** a pessoa retoma, **Then** o
   timer de 5 s recomeça.
4. **Given** um episódio tocando, **When** o chrome aparece, **Then** ele
   mostra o nome da série, temporada, número e título do episódio.
5. **Given** um motor sem capacidade de busca, **When** o chrome aparece,
   **Then** `⏪ 10s`, `⏩ 10s` e a timeline não existem (contrato de
   capacidades inalterado).

---

### User Story 2 - Chrome V14 no canal ao vivo com troca por ↑/↓ (Priority: P1)

Quem assiste a um canal vê um chrome com live bug, número, logo e nome do
canal — sem timeline, sem velocidade, sem play/pause (o canal não tem essa
capacidade). ↑/↓ trocam para o canal anterior/seguinte da categoria de
onde o canal foi aberto, mesmo com o chrome escondido, e mostram o chrome
com o novo canal. OK continua abrindo a lista de zapping da feature 016.

**Why this priority**: Live TV é a primeira seção do app; zapear pelas
setas é o gesto mais básico de TV e hoje não existe fora da lista.

**Independent Test**: Abrir um canal, pressionar ↓ com o chrome escondido
e ver o chrome com o canal seguinte da mesma categoria e a sessão trocar;
pressionar OK e ver a lista de zapping abrir como hoje.

**Acceptance Scenarios**:

1. **Given** um canal tocando, **When** o chrome aparece, **Then** exibe
   "AO VIVO", número, logo (com fallback) e nome, e nenhuma timeline,
   velocidade ou play/pause.
2. **Given** um canal tocando com o chrome escondido, **When** a pessoa
   pressiona ↓, **Then** a sessão troca para o canal seguinte da categoria
   de origem e o chrome aparece com ele.
3. **Given** o último canal da categoria, **When** a pessoa pressiona ↓,
   **Then** nada troca, não há volta ao primeiro e a pessoa recebe um aviso
   de limite.
4. **Given** várias ↑/↓ rápidas, **When** a última é pressionada, **Then** o
   chrome mostra o canal-alvo mais recente e só a sessão dele permanece.
5. **Given** um canal tocando, **When** a pessoa pressiona OK, **Then** a
   lista de zapping abre exatamente como na feature 016, com o chrome
   escondido enquanto ela estiver aberta.

---

### User Story 3 - Teclas de mídia do controle (Priority: P2)

Quem usa as teclas físicas do controle pausa/retoma, pula 10 s, sai do
player e troca de canal sem precisar navegar no chrome.

**Why this priority**: Atalho esperado em qualquer app de TV (§43), mas as
setas + OK + RETURN já dão caminho completo a todas as ações.

**Independent Test**: Com um filme tocando, pressionar Play/Pause e ver a
reprodução alternar, o chrome aparecer com o foco em Play/Pause; pressionar
Stop e ver o player fechar salvando a retomada.

**Acceptance Scenarios**:

1. **Given** um filme tocando, **When** a pessoa pressiona Play/Pause,
   **Then** a reprodução alterna, o chrome aparece, o foco vai para
   Play/Pause e o timer de auto-hide reinicia.
2. **Given** um filme pausado, **When** a pessoa pressiona Play, **Then**
   retoma; **When** pressiona Play de novo já tocando, **Then** nada muda.
3. **Given** um filme tocando, **When** a pessoa pressiona Rewind ou Fast
   Forward, **Then** a posição recua/avança 10 s e o chrome aparece.
4. **Given** qualquer mídia tocando, **When** a pessoa pressiona Stop,
   **Then** o player fecha exatamente como com RETURN (retomada salva).
5. **Given** um canal tocando, **When** a pessoa pressiona CH+ ou CH−,
   **Then** troca de canal como ↑/↓; **When** pressiona Play/Pause, Rewind
   ou Fast Forward, **Then** nada acontece além de revelar o chrome.
6. **Given** uma plataforma que não declara uma tecla como suportada,
   **When** o app inicia, **Then** essa tecla não é registrada e nada
   quebra.

---

### User Story 4 - Episódio anterior/próximo pelo chrome (Priority: P2)

No player de episódio, o chrome oferece "Episódio anterior" e "Próximo
episódio". No primeiro e no último episódio conhecidos, o botão
correspondente fica soft disabled explicando o limite.

**Why this priority**: Hoje só o autoplay no fim leva ao próximo; voltar ou
pular exige sair do player. Útil, mas não bloqueia assistir.

**Independent Test**: Abrir o episódio 2 da temporada 1, selecionar
"Próximo episódio" e ver o episódio 3 tocar; abrir o primeiro episódio e
ver "Episódio anterior" soft disabled com o motivo anunciado.

**Acceptance Scenarios**:

1. **Given** um episódio do meio da temporada, **When** a pessoa seleciona
   "Próximo episódio", **Then** o progresso do atual é salvo e o seguinte
   começa a tocar (retomando se houver posição salva).
2. **Given** o último episódio de uma temporada com uma temporada seguinte
   conhecida, **When** a pessoa seleciona "Próximo episódio", **Then** toca
   o primeiro da temporada seguinte.
3. **Given** o primeiro episódio conhecido, **When** o chrome aparece,
   **Then** "Episódio anterior" está soft disabled e, selecionado, anuncia
   o limite sem trocar nada.
4. **Given** um filme, **When** o chrome aparece, **Then** não há botões de
   episódio.

---

### User Story 5 - Controles "Em breve" do Spec (Priority: P3)

O chrome mostra os botões de Áudio e legendas, Qualidade, Aspecto e Info
do stream (Live e VOD), Velocidade (só VOD) e Guia (só Live) como soft
disabled: focáveis, visualmente distintos, e ao serem selecionados anunciam
"Em breve" com uma explicação — sem abrir nada nem inventar dado.

**Why this priority**: Deixa o chrome completo conforme o V14 e sinaliza o
que vem (item 55, item 42), mas não entrega função nova.

**Independent Test**: Abrir um canal e um filme, navegar até cada botão
mock, selecionar e ver/ouvir o anúncio "Em breve"; confirmar que
Velocidade não aparece no canal.

**Acceptance Scenarios**:

1. **Given** um filme tocando, **When** a pessoa foca e seleciona
   "Velocidade", **Then** é anunciado "Em breve — …" e a reprodução segue
   inalterada.
2. **Given** um canal tocando, **When** o chrome aparece, **Then**
   "Velocidade" não existe e "Guia" está presente como "Em breve".
3. **Given** qualquer botão mock, **When** focado, **Then** tem foco visível
   e rótulo acessível que diz que está indisponível.

---

### Edge Cases

- Canal aberto a partir de "★ Favoritos" ou "Todos": ↑/↓ percorrem essa
  mesma entrada, na ordem em que a lista a exibia.
- Canal único na categoria: ↑/↓ só avisam o limite.
- ↑/↓ enquanto a troca anterior ainda está abrindo: a mais recente vence;
  a anterior é descartada (comportamento de sessão já existente).
- Troca por ↑/↓ que falha ao abrir: mesma tela de erro de hoje, com foco
  numa ação.
- Lista de zapping (016) aberta: chrome escondido e ↑/↓ navegam na lista,
  não trocam de canal.
- Contagem regressiva do autoplay (012) visível: continua funcionando como
  hoje; o chrome não a encobre nem a cancela sozinho.
- Tela de erro do player: sem chrome; mantém as ações de erro atuais.
- Teclas de mídia com o app em segundo plano ou fora do player: não fazem
  nada (sem iniciar reprodução fora do player).
- Tecla de mídia pressionada antes de a sessão estar tocando (abrindo,
  bufferizando): ignorada ou aplicada só se a capacidade já estiver
  disponível; nunca trava.
- Tecla segurada (auto-repeat): não acumula saltos (mesma regra de
  single-flight do seek já corrigida na 011).
- Episódio anterior/próximo quando só parte das temporadas é conhecida: o
  limite é o do conjunto conhecido, nunca inventado.
- Logo do canal ausente ou com falha de carga: fallback visual, nunca o
  ícone de imagem quebrada.
- Reduzir movimento ativo: chrome aparece/some sem animação perceptível,
  com o estado final idêntico.

## Requirements *(mandatory)*

### Functional Requirements

**Chrome e auto-hide**

- **FR-001**: O player DEVE exibir um chrome V14 (§27) para canal, filme e
  episódio, sobreposto ao vídeo, sem pintar por cima do plano de hardware
  quando escondido.
- **FR-002**: No VOD, com o chrome escondido, ↑/↓/OK DEVEM apenas
  revelá-lo e ←/→ DEVEM saltar ∓10 s e revelá-lo (comportamento atual da
  feature 011 preservado). No Live, ver FR-010 e FR-034.
- **FR-003**: O chrome DEVE se esconder após 5 s sem interação enquanto a
  reprodução estiver contínua, e DEVE permanecer visível enquanto a mídia
  estiver pausada; ao retomar, o timer DEVE reiniciar.
- **FR-004**: Toda interação com o chrome visível DEVE reiniciar o timer de
  auto-hide.
- **FR-005**: O chrome DEVE ficar escondido enquanto a lista de zapping
  (016), a tela de erro ou outra camada superior estiver ativa.
- **FR-006**: Sempre que o chrome estiver visível, exatamente um controle
  DEVE ter foco visível.

**Controles dirigidos por capacidade**

- **FR-007**: `⏪ 10s`, `▶/⏸`, `⏩ 10s` e a timeline DEVEM continuar
  existindo somente quando a capacidade correspondente for verdadeira,
  sem alterar a regra de hoje (nenhum controle de capacidade ausente é
  exibido, nem desabilitado).
- **FR-008**: O VOD DEVE exibir tempo decorrido e, só com duração
  confiável, total e timeline — sem percentual estimado.

**Live**

- **FR-009**: O chrome do canal DEVE exibir o live bug "AO VIVO", o número
  do canal (posição na fonte, ADR-011), o logo (com fallback) e o nome, e
  NÃO DEVE exibir linha de programa, timeline, velocidade ou play/pause.
- **FR-010**: No canal, ↑ e ↓ DEVEM trocar para o canal anterior/seguinte
  da entrada da trilha de onde o canal foi aberto (categoria, "★
  Favoritos" ou "Todos"), mesmo com o chrome escondido, e revelar o chrome
  com o canal-alvo.
- **FR-011**: A troca por ↑/↓ NÃO DEVE dar a volta nas pontas; no primeiro
  ou último canal, DEVE anunciar o limite sem trocar a sessão.
- **FR-012**: Trocas rápidas sucessivas DEVEM resultar só na sessão do
  canal-alvo mais recente.
- **FR-013**: OK no canal DEVE continuar abrindo a lista de zapping da
  feature 016, com todo o comportamento dela preservado.
- **FR-034**: O chrome do canal DEVE ter dois níveis: (a) a **faixa de
  identidade** (FR-009), sem controle focado, exibida ao abrir o canal e
  a cada troca por ↑/↓/CH±, na qual OK abre a lista de zapping; e (b) a
  **linha de controles**, revelada por ←/→ com o foco no primeiro
  controle, na qual ←/→ movem o foco, OK aciona o controle focado e
  RETURN esconde só a linha (sem fechar o player). A faixa segue o mesmo
  auto-hide de 5 s.
- **FR-014**: O foco na lista de zapping e na tela de Live ao sair do
  player DEVE refletir o último canal efetivamente assistido após trocas
  por ↑/↓.

**Episódios**

- **FR-015**: O chrome do episódio DEVE exibir nome da série, temporada,
  número e título do episódio.
- **FR-016**: O chrome do episódio DEVE oferecer "Episódio anterior" e
  "Próximo episódio", atravessando temporadas pela mesma ordem usada pelo
  autoplay (012).
- **FR-017**: No primeiro/último episódio conhecido, o botão
  correspondente DEVE ficar soft disabled e, selecionado, anunciar o
  limite sem trocar.
- **FR-018**: Trocar de episódio pelo chrome DEVE salvar o progresso do
  atual e abrir o outro pelo mesmo caminho do autoplay (retomada e marca
  de assistido inalteradas).
- **FR-019**: O filme NÃO DEVE exibir botões de episódio.

**Mocks "Em breve"**

- **FR-020**: O chrome DEVE exibir Áudio e legendas, Qualidade, Aspecto e
  Info do stream (canal e VOD), Velocidade (só VOD) e Guia (só canal) como
  soft disabled, registrados no registro único de "Em breve".
- **FR-021**: Selecionar um mock DEVE anunciar "Em breve — {explicação}"
  e NÃO DEVE abrir modal, alterar a reprodução nem exibir dado fictício.
- **FR-022**: Velocidade NÃO DEVE existir no chrome do canal (§43.3).

**Teclas de mídia**

- **FR-023**: O app DEVE registrar somente `MediaPlayPause`, `MediaPlay`,
  `MediaPause`, `MediaStop`, `MediaRewind`, `MediaFastForward`,
  `ChannelUp` e `ChannelDown`, e só as que a plataforma declarar
  suportadas; fora da TV, o registro DEVE ser um no-op silencioso.
- **FR-024**: `MediaPlayPause` DEVE alternar a reprodução, revelar o
  chrome, focar Play/Pause e reiniciar o auto-hide (§43.1); `MediaPlay` e
  `MediaPause` DEVEM ser idempotentes.
- **FR-025**: `MediaRewind`/`MediaFastForward` DEVEM recuar/avançar 10 s e
  revelar o chrome, só quando houver capacidade de busca, respeitando a
  regra de salto único em voo (sem acumular com a tecla segurada).
- **FR-026**: `MediaStop` DEVE fechar o player exatamente como RETURN.
- **FR-027**: `ChannelUp`/`ChannelDown` DEVEM trocar de canal como ↑/↓ no
  Live e NÃO DEVEM ter efeito em filme/episódio.
- **FR-028**: Teclas de mídia sem capacidade correspondente (ex.:
  Play/Pause no canal) DEVEM apenas revelar o chrome.
- **FR-029**: Teclas de mídia NÃO DEVEM ter efeito fora do player.

**Acessibilidade e preservação**

- **FR-030**: Todo controle do chrome DEVE ter rótulo acessível; mocks e
  limites DEVEM indicar a indisponibilidade no rótulo.
- **FR-031**: Com reduzir movimento ativo, aparecer/sumir do chrome DEVE
  ocorrer sem animação perceptível.
- **FR-032**: Retomada, autoplay do próximo episódio, zapping por lista,
  favoritar no zapping, protetor de tela e ciclo de vida (features 011,
  012, 016, 019, 020) DEVEM continuar funcionando como hoje.
- **FR-033**: O chrome DEVE usar apenas tokens do DS V14 e ícones locais.

### Key Entities

- **Controle do chrome**: ação exibida no chrome — tipo (real,
  mock "Em breve", limite de episódio), rótulo acessível, disponibilidade
  por tipo de mídia e por capacidade.
- **Vizinhança de canal**: sequência ordenada de canais da entrada da
  trilha de origem, usada por ↑/↓ e CH±.
- **Vizinhança de episódio**: episódio anterior/próximo no conjunto
  conhecido da série, na mesma ordem do autoplay.
- **Tecla de mídia**: nome da tecla na plataforma, se é suportada, e a
  ação que dispara por tipo de mídia.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em canal, filme e episódio, o chrome aparece na primeira
  interação e some em 5 s (±0,5 s) de reprodução contínua; pausado, não
  some em 30 s.
- **SC-002**: Com um canal aberto de uma categoria de N canais, N−1
  pressões de ↓ percorrem todos os canais seguintes em ordem, e a N-ésima
  só anuncia o limite.
- **SC-003**: 100% dos controles do chrome têm rótulo acessível e foco
  visível; em nenhum estado com chrome visível o foco some.
- **SC-004**: Na TV física de referência, cada tecla de mídia registrada
  produz a ação descrita e as não suportadas não são registradas —
  verificação obrigatória (gate) para convergir.
- **SC-005**: Todos os testes de comportamento existentes do player e o
  E2E de ciclo de vida continuam passando.

## Assumptions

- ↑ e CH+ levam ao canal **anterior** na ordem exibida pela lista, e ↓ e
  CH− ao **seguinte** — consistente com a direção visual da lista de
  zapping (↓ desce na lista). Ajustável no `sdd-plan` se a TV física
  mostrar outra expectativa.
- O número e o logo do canal já existem no catálogo desde a feature 024.
- O registro de teclas segue o mesmo padrão já usado pela tecla amarela
  (`tizenColorKey.ts`) e o privilégio `tvinputdevice` já declarado.
- 5 s de auto-hide é o valor atual e continua.
- "Soft disabled" segue §11 do Spec e os utilitários da feature 021
  (`.is-soft-disabled`); "Em breve" usa o `ComingSoon`/`getComingSoon` da
  feature 022.
- A Onda 7 será especificada como `028` depois desta.

## Clarifications

### Sessão 2026-09-28

- Q: A Onda 7 (limpeza e QA) entra na 027 ou vira feature própria? → A:
  Separar — 027 é só o player chrome + teclas de mídia; a limpeza/QA vira
  a 028.
- Q: Botões de áudio/legenda, qualidade, velocidade, aspecto e info (sem
  capacidade real): como aparecem? → A: Soft disabled "Em breve", focáveis
  e anunciados; Velocidade some no Live.
- Q: Quais teclas de mídia registrar? → A: Play/Pause, Play, Pause, Stop,
  Rewind, Fast Forward e CH±, só se suportadas; sem dígitos (§44 fora).
- Q: No Live em tela cheia, ↑/↓ trocam de canal direto? → A: Sim, além do
  OK que continua abrindo a lista de zapping.
- Q: Anterior/próximo episódio nos limites? → A: Soft disabled explicando
  o limite; atravessa temporada como o autoplay.
- Q: "Programa atual" e "Guia" no Live? → A: Nenhuma linha de programa;
  "Guia" soft disabled "Em breve".
- Q: O que a tecla Stop faz? → A: Igual ao RETURN (fecha salvando a
  retomada).
- Q: A passada na TV física é gate? → A: Obrigatória para convergir (mesmo
  padrão da 013).
- Q: Com o chrome escondido no Live, o primeiro ↑/↓ troca ou só revela? →
  A: Troca direto e revela o chrome com o novo canal; ←/→/OK continuam só
  revelando no primeiro toque.
- Q: Pausado, o chrome se esconde sozinho? → A: Não; o auto-hide só corre
  em reprodução contínua e reinicia ao retomar.
- Q (sdd-plan): No canal, com botões no chrome, o que OK faz? → A: Dois
  níveis — faixa de identidade (abrir/↑/↓, OK abre o zapping da 016) e
  linha de controles revelada por ←/→ (OK aciona o botão focado, RETURN
  esconde só a linha). Ver FR-034.
- Correção (sdd-plan): o FR-002 e o US1/AC1 diziam que ←/→ com o chrome
  escondido "só revelam"; o comportamento real da feature 011 é saltar
  ∓10 s e revelar. O texto foi corrigido para o comportamento real, que
  continua preservado.
