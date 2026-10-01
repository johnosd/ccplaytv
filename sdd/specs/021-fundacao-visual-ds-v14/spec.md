# Feature Specification: Fundação Visual do Design System V14 (Onda 0 da migração)

**Slug**: `021-fundacao-visual-ds-v14`

**Created**: 2026-09-26

**Status**: Convergida

**Input**: "Feature 021 — Onda 0 da migração para o DS V14 Spectrum (fundação
visual): fontes Poppins/Inter empacotadas localmente (sai Google Fonts CDN),
tokens completos (espaçamento, raio, elevação, motion, semânticos, camadas
z), palco 1920×1080 escalado + safe zone, utilitários
.no-scale/.pressed/soft-hard disabled, reduced motion, ícones SVG locais,
região aria-live + announce(). Sem mudança de layout." Contexto:
`.planning/migracao-design-system-v14.md` (Onda 0) e
`sdd/adr/ADR-011-adocao-design-system-v14-spectrum.md`.

## Escopo

Primeira onda da migração para o Design System V14 Spectrum
(`docs/design/design-system/`). Prepara a base que as ondas seguintes
(022–027) consomem. **Nenhuma tela muda de layout nesta feature**: quem usa
o app na TV de referência não deve perceber diferença visual, exceto o que
depende do ambiente (fonte disponível sem internet; escala correta fora de
1920×1080).

### Incluído

- **Tipografia sem dependência de rede**: Poppins e Inter passam a vir de
  dentro do próprio app. A dependência do Google Fonts sai por completo,
  com fallback Arial/Helvetica quando a fonte não carregar (V14 §2.3).
- **Tokens completos do V14** disponíveis para as próximas ondas (V14
  §5–§10, §29):
  - superfícies em 5 níveis;
  - accent com estados (claro, pressionado, tint de seleção);
  - cores semânticas (sucesso, aviso, informação, ao vivo, erro);
  - escala tipográfica 64/40/28/24/20/16;
  - espaçamento 8/16/24/32/48/64/96;
  - raio 8/12/16/pill;
  - elevação 1–3;
  - motion (easing, durações rápida/padrão/lenta);
  - camadas lógicas 0/10/50/100;
  - safe zone de 96/76 px.

  Os nomes de token já usados pelo app continuam funcionando.
- **Palco 1920×1080 com escala uniforme** para qualquer viewport (V14 §4.1).
  A safe zone existe **só como token**: aplicá-la às telas é trabalho das
  ondas seguintes.
- **Utilitários de estado globais** (V14 §11.2–§11.4): sem escala no foco
  (`no-scale`), feedback de pressionado, e aparência de soft disabled e
  hard disabled. Aqui entra só a aparência; o comportamento "OK explica o
  motivo" do soft disabled vem nos componentes da Onda 1.
- **Reduzir movimento** (V14 §10): respeita a preferência do sistema e
  ganha uma preferência interna persistida no aparelho, já aplicada, mas
  sem controle visível (o controle chega em Configurações › Acessibilidade,
  na Onda 5).
- **Conjunto de ícones SVG locais** com a família mínima da V14 §15: Play,
  Pause, Search, Add, Next, Back, Menu, Device, Settings, Audio,
  Subtitles, Quality, Info, Favorite, Live, mais Rewind e Forward, que o
  player atual já usa. O conjunto é **pronto e testado, mas não aplicado
  às telas** nesta onda.
- **Anúncios acessíveis** (V14 §38.3): uma região de anúncio persistente e
  única, e os toasts já existentes (por exemplo, favoritar/desfavoritar)
  passam a ser anunciados por ela.
- **Idioma do documento** declarado como português do Brasil (`pt-BR`) no
  app de desenvolvimento e no pacote da TV.
- **Evidência de paridade visual**: capturas das telas principais antes e
  depois da mudança, anexadas à feature.

### Fora de Escopo

- Trocar glifos/emoji atuais (★, 🔍, ▶/⏸, ⏪/⏩, 🎬/🎞️) pelos ícones SVG.
  Cada tela troca quando for reescrita (Ondas 2–6).
- Aplicar a safe zone de 96/76 px às telas existentes.
- Qualquer componente novo (botão, card, rail, modal, empty/error state):
  Onda 1, feature 022.
- Shell, topbar, tela de perfis, fonte ativa, roteamento: Onda 2 (ADR-011).
- Controle visível de "Reduzir movimento", alto contraste, Voice Guide
  configurável, legendas acessíveis (Onda 5 / item 56 do backlog).
- Anunciar erros de carregamento/reprodução ou troca de canal: cada onda
  liga os anúncios das próprias telas.
- Mudar a paleta, a receita de foco ou qualquer cor já em uso. O V14 as
  mantém (ADR-007/ADR-011).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - App abre com a tipografia certa mesmo sem internet (Priority: P1)

A pessoa liga a TV e abre o CCPlayTv numa rede sem acesso à internet (ou
com o serviço de fontes bloqueado). O app mostra títulos em Poppins e
textos em Inter, exatamente como com internet, porque as fontes vêm do
próprio pacote.

**Why this priority**: hoje a identidade tipográfica depende de um serviço
externo a cada abertura, o que contraria o shell offline da V14 (§2.3, §3)
e a ADR-002. Sem internet, o app cai hoje na fonte padrão do motor, e é a
única mudança desta onda que a pessoa pode notar.

**Independent Test**: abrir o app com as requisições a serviços de fonte
externos bloqueadas e confirmar que títulos e textos usam as famílias
corretas e que nenhuma requisição de fonte sai do aparelho.

**Acceptance Scenarios**:

1. **Given** o app instalado e sem acesso à internet, **When** a pessoa
   abre qualquer tela, **Then** os títulos aparecem em Poppins e o texto
   corrido em Inter.
2. **Given** o app em uso normal, **When** qualquer tela é aberta, **Then**
   nenhuma requisição de fonte é feita a um domínio externo.
3. **Given** um arquivo de fonte ausente ou corrompido, **When** o app
   abre, **Then** o texto aparece em Arial/Helvetica, continua legível e
   navegável, e nenhuma tela quebra.

---

### User Story 2 - A interface ocupa a tela corretamente em qualquer resolução (Priority: P1)

Numa TV cuja área de navegador não é exatamente 1920×1080 (720p, 4K,
proporções levemente diferentes) ou na janela de desenvolvimento, o app
aparece inteiro, proporcional, centralizado, sem cortar nem esticar. Na TV
de referência (1920×1080) nada muda.

**Why this priority**: todas as ondas seguintes desenham em pixels do palco
1920×1080 (cards 205×302, safe zone de 96 px). Sem o palco escalado, cada
medida do DS vira um palpite dependente de viewport.

**Independent Test**: abrir o app em viewports 1280×720, 1920×1080 e
3840×2160 e comparar proporção e enquadramento. Na TV física, confirmar
que o vídeo em tela cheia continua cobrindo a tela inteira.

**Acceptance Scenarios**:

1. **Given** uma viewport 1280×720, **When** o app abre, **Then** a
   interface aparece inteira, escalada proporcionalmente, sem barra de
   rolagem nem corte.
2. **Given** uma viewport 1920×1080, **When** o app abre, **Then** a
   interface é visualmente idêntica à de antes desta feature.
3. **Given** uma viewport com proporção diferente de 16:9, **When** o app
   abre, **Then** o palco fica centralizado com faixas neutras nas sobras,
   nunca distorcido.
4. **Given** um filme, episódio ou canal em reprodução em tela cheia,
   **When** a viewport não é 1920×1080, **Then** o vídeo continua ocupando
   a tela inteira, alinhado à camada de controles.

---

### User Story 3 - Toasts são anunciados pelo leitor de tela (Priority: P2)

Com o Voice Guide (ou outro leitor de tela) ativo, a pessoa favorita ou
desfavorita um item e ouve a confirmação ("Adicionado aos favoritos"), sem
que o foco saia de onde estava. O leitor pronuncia o texto em português.

**Why this priority**: acessibilidade é pilar da V13/V14 (§38). A
infraestrutura de anúncio é pré-requisito de todos os componentes da Onda
1, e os toasts atuais são o primeiro consumidor real. Hoje o toast é
montado e desmontado a cada exibição, e leitores de tela anunciam isso de
forma instável.

**Independent Test**: com um leitor de tela ativo no navegador, favoritar
um canal e um filme e confirmar que cada toast é anunciado exatamente uma
vez, em português, sem mover o foco.

**Acceptance Scenarios**:

1. **Given** um leitor de tela ativo, **When** um toast existente aparece,
   **Then** o texto é anunciado uma vez, de forma não interruptiva
   ("polite").
2. **Given** dois toasts idênticos seguidos, **When** o segundo aparece,
   **Then** ele também é anunciado (repetição não é engolida).
3. **Given** o anúncio em andamento, **When** ele termina, **Then** o foco
   permanece no mesmo elemento de antes.

---

### User Story 4 - Movimento reduzido é respeitado (Priority: P3)

Com a preferência de reduzir movimento ativa (no sistema ou na preferência
interna do app), o foco passa de um item a outro sem animação de escala ou
brilho progressivo. O item focado continua claramente identificável pela
borda, pelo halo e pela escala final.

**Why this priority**: conforto (§10, §31), barato de entregar agora e
exigido pela QA matrix. Nenhuma tela depende disso para funcionar.

**Independent Test**: ativar a emulação de `prefers-reduced-motion` no
navegador (e, separadamente, a preferência interna do app) e navegar pelas
telas conferindo que as transições somem e o foco continua visível.

**Acceptance Scenarios**:

1. **Given** a preferência do sistema de reduzir movimento, **When** a
   pessoa move o foco, **Then** não há transição animada, e o estado final
   do foco continua visível e não depende só de cor.
2. **Given** a preferência interna ativada e a do sistema desativada,
   **When** a pessoa move o foco, **Then** o comportamento é o mesmo do
   cenário 1.
3. **Given** a preferência interna ativada, **When** o app é fechado e
   reaberto, **Then** a preferência continua ativa.

---

### User Story 5 - Base visual pronta para as próximas ondas (Priority: P3)

Quem constrói a Onda 1 encontra todos os tokens do V14, os utilitários de
estado e o conjunto de ícones prontos, documentados e testados. Não precisa
escrever cor, raio, espaçamento ou tamanho de fonte literal em nenhum
componente.

**Why this priority**: é a razão de ser da onda, mas não tem valor
visível para quem assiste. Por isso vem depois das stories que a pessoa
percebe.

**Independent Test**: conferir que cada valor das tabelas da V14 (§5–§10,
§29) tem um token correspondente, que os ícones renderizam em teste
isolado com nome acessível quando usados sem texto, e que os utilitários
de estado produzem a aparência da Spec em um elemento de teste.

**Acceptance Scenarios**:

1. **Given** a tabela de tokens da V14, **When** comparada aos tokens do
   app, **Then** todo valor da tabela tem um token, e todo token antigo
   continua resolvendo para o mesmo valor de antes.
2. **Given** um ícone do conjunto usado sem texto ao lado, **When**
   renderizado, **Then** ele expõe um nome acessível. Usado ao lado de um
   texto, ele é ignorado pelo leitor de tela.
3. **Given** um elemento com o utilitário de soft disabled, **When** ele
   recebe foco, **Then** recupera o contraste (V14 §11.4). Com hard
   disabled, ele não é alcançável pelo foco.

### Edge Cases

- **Fonte não carrega** (arquivo ausente no pacote, corrompido ou formato
  não suportado pelo motor da TV): o fallback Arial/Helvetica entra sem
  quebra de layout que prenda o foco ou esconda ação essencial. O arquivo
  ausente do pacote é o caso mais provável: só aparece na TV, nunca no
  navegador.
- **Texto renderizado antes da fonte chegar**: sem texto invisível
  prolongado. Texto aparece no fallback e troca quando a fonte carrega.
- **Viewport muda com o app aberto** (redimensionar a janela de dev): a
  escala se recalcula sem recarregar e sem perder o foco atual.
- **Viewport muito pequena** (ex.: 960×540): escala abaixo de 1 continua
  proporcional. Legibilidade nesse tamanho não é requisito.
- **Plano de vídeo de hardware**: a escala da camada web não pode
  desalinhar o retângulo do vídeo nativo nem reintroduzir fundo opaco
  sobre ele. As regras de transparência existentes continuam valendo.
- **Toasts em sequência rápida**: cada um é anunciado. O último texto
  visível é o último anunciado.
- **Preferência interna de movimento indisponível** (armazenamento local
  bloqueado ou cheio): o app segue a preferência do sistema, sem erro
  visível.
- **Motor da TV sem suporte à media query de movimento**: a preferência
  interna continua funcionando sozinha.

## Requirements *(mandatory)*

### Functional Requirements

**Tipografia**

- **FR-001**: O app DEVE carregar Poppins (títulos) e Inter (interface)
  exclusivamente de arquivos incluídos no próprio app/pacote da TV, nunca
  de um serviço externo.
- **FR-002**: O app NÃO DEVE fazer nenhuma requisição de rede para obter
  fontes tipográficas.
- **FR-003**: Toda declaração de família tipográfica DEVE ter fallback
  `Arial, Helvetica, sans-serif` (V14 §2.3). Sem as fontes customizadas, o
  app DEVE continuar legível e navegável.
- **FR-004**: Os pesos disponíveis DEVEM cobrir os usados hoje pelo app e
  os da escala canônica V14 (§6). Nenhum texto atual pode mudar de peso ou
  família nesta feature.
- **FR-005**: Os arquivos de fonte DEVEM entrar no pacote instalável da TV
  junto com os demais arquivos do build.

**Tokens**

- **FR-006**: O app DEVE expor como tokens todos os valores normativos da
  V14: superfícies (§5.1), texto (§5.2), accent e estados (§5.3),
  gradiente de marca (§5.4), semânticos (§5.5), escala tipográfica (§6),
  espaçamento (§7), raio (§8), elevação (§9), motion (§10), camadas (§29)
  e safe zone (§4.2).
- **FR-007**: Todo token já existente DEVE continuar existindo e resolvendo
  para o mesmo valor de antes.
- **FR-008**: Os valores DEVEM ser os da V14 (§5–§10, §29), nunca os do
  bloco obsoleto "CSS canônico V13" (§36) (ADR-011).

**Palco**

- **FR-009**: A interface DEVE ser desenhada num palco lógico de 1920×1080
  e escalada uniformemente para caber inteira na viewport, centralizada,
  preservando a proporção 16:9.
- **FR-010**: Em viewport 1920×1080, a aparência DEVE ser idêntica à de
  antes da feature (escala 1).
- **FR-011**: A escala DEVE ser recalculada quando a viewport mudar, sem
  recarregar o app e sem alterar o elemento focado.
- **FR-012**: O vídeo em reprodução (motor de hardware da TV e motor de
  desenvolvimento) DEVE continuar ocupando a tela inteira e alinhado à
  camada de controles, em qualquer escala.
- **FR-013**: A safe zone DEVE existir como token e NÃO DEVE ser aplicada a
  telas existentes nesta feature.

**Utilitários de estado**

- **FR-014**: DEVE existir um utilitário que mantém a receita de foco
  (borda, halo, glow) sem a escala, para linhas, EPG, opções e tabelas
  (V14 §11.2).
- **FR-015**: DEVE existir um utilitário de feedback de pressionado curto
  (V14 §11.3).
- **FR-016**: DEVE existir a aparência de soft disabled (focável, reduzida
  em repouso, com contraste recuperado quando focada) e de hard disabled
  (reduzida, fora do foco, marcada como indisponível para tecnologias
  assistivas) (V14 §11.4). Indisponibilidade NÃO DEVE ser comunicada só
  por cor.

**Movimento reduzido**

- **FR-017**: Com a preferência de sistema de reduzir movimento ativa, o
  app DEVE desativar transições e animações não essenciais (V14 §10),
  mantendo o estado final de foco visível.
- **FR-018**: O app DEVE ter uma preferência interna de reduzir movimento,
  persistida no aparelho, com o mesmo efeito da preferência do sistema,
  aplicada desde a abertura. Sem controle visível nesta feature.
- **FR-019**: Falha ao ler ou gravar a preferência interna NÃO DEVE gerar
  erro visível nem impedir a abertura do app.

**Ícones**

- **FR-020**: DEVE existir um conjunto de ícones vetoriais locais com, no
  mínimo: Play, Pause, Search, Add, Next, Back, Menu, Device, Settings,
  Audio, Subtitles, Quality, Info, Favorite, Live, Rewind e Forward. Traço
  consistente, cor herdada do contexto e tamanho controlado por token.
- **FR-021**: Um ícone usado sem texto DEVE expor nome acessível. Um ícone
  usado junto de texto DEVE ser ignorado por tecnologias assistivas.
- **FR-022**: Esta feature NÃO DEVE substituir glifos/emoji nas telas
  existentes.

**Anúncios e idioma**

- **FR-023**: O app DEVE manter uma única região de anúncio persistente,
  não interruptiva, e um meio único de anunciar mensagens por ela.
- **FR-024**: Todo toast existente DEVE ser anunciado por essa região,
  exatamente uma vez por exibição, inclusive quando o mesmo texto se
  repete.
- **FR-025**: Anunciar NÃO DEVE mover nem alterar o foco.
- **FR-026**: O idioma do documento DEVE ser declarado como português do
  Brasil no app de desenvolvimento e no pacote da TV.

**Paridade**

- **FR-027**: Todos os testes automatizados e roteiros E2E existentes
  DEVEM passar sem editar nenhuma asserção de comportamento. Os testes de
  contrato travados de features anteriores DEVEM permanecer intactos.
- **FR-028**: DEVEM ser produzidas capturas das telas principais antes e
  depois da feature, em 1920×1080, para revisão de paridade: Home de
  listas, hub da lista, Live TV, Filmes, Séries, detalhe de filme,
  detalhe de série e camada de reprodução.

### Key Entities

- **Preferência de movimento reduzido**: escolha local do aparelho
  (ligada/desligada), independente de fonte/lista, lida na abertura e
  combinada com a preferência do sistema (qualquer uma ligada = movimento
  reduzido).
- **Anúncio**: mensagem curta de texto destinada a tecnologias
  assistivas, sem persistência.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com o acesso à internet bloqueado, 100% das telas principais
  exibem títulos e textos nas famílias tipográficas corretas.
- **SC-002**: Zero requisições de fonte a domínios externos durante um
  percurso completo pelas telas principais.
- **SC-003**: Em 1920×1080, as capturas antes/depois das telas listadas
  em FR-028 não mostram diferença de layout (posição, tamanho, quebra de
  linha) na revisão.
- **SC-004**: Em 1280×720 e 3840×2160, a interface aparece inteira,
  proporcional, sem rolagem nem corte, nas mesmas telas.
- **SC-005**: 100% dos valores normativos das tabelas V14 §5–§10 e §29 têm
  token correspondente.
- **SC-006**: 100% dos testes automatizados e roteiros E2E existentes
  passam sem alteração de asserção.
- **SC-007**: Cada toast existente é anunciado exatamente uma vez por
  exibição, verificado com leitor de tela ou teste automatizado da região
  de anúncio.

## Assumptions

- A licença de Poppins e Inter (SIL Open Font License) permite empacotá-las
  no app. O plano confirma isso e registra a atribuição na tela "Sobre"
  quando ela existir (Onda 5).
- A TV de referência (QN50Q60DAGXZD, Chromium 108) tem área de navegador de
  1920×1080. Por isso a escala é 1 nela, e o palco escalado beneficia
  sobretudo a janela de desenvolvimento e outros aparelhos.
- O retângulo do vídeo nativo já é informado em coordenadas de 1920×1080
  (`PlayerService`). Com o palco escalado, essas coordenadas continuam
  corretas na TV de referência. Outras resoluções dependem de o plano
  confirmar a conversão (risco a tratar no `sdd-plan`).
- As capturas "antes" podem ser tiradas do commit anterior ao início da
  implementação, no mesmo navegador e com os mesmos dados de fixture E2E.
- A verificação na TV física é **recomendada, não obrigatória** (padrão da
  constitution). O roteiro recomendado: fontes carregando do pacote sem
  rede externa, escala correta, foco/glow iguais. É o único ambiente onde um
  arquivo faltando na lista do pacote aparece.
- O comportamento "OK em soft disabled explica o motivo" pertence aos
  componentes da Onda 1. Aqui só existe a aparência.

## Clarifications

### Sessão 2026-09-26

- Q: A Onda 0 já aplica a escala uniforme do palco 1920×1080? → A: Sim,
  escala agora. A safe zone fica só como token, aplicada tela a tela nas
  ondas seguintes (FR-009, FR-013).
- Q: A Onda 0 troca os glifos/emoji atuais pelos ícones SVG? → A: Não. Só
  cria o conjunto; cada tela troca quando for reescrita. Evita reescrever
  ~34 asserções de testes/E2E de telas que vão mudar de novo (FR-020,
  FR-022).
- Q: O que a região de anúncio já anuncia nesta onda? → A: A infraestrutura
  e os toasts existentes. Erros e troca de canal ficam para as ondas das
  telas (FR-023, FR-024).
- Q: Corrigir o idioma do documento (`lang="en"`)? → A: Sim, para pt-BR
  nesta onda (FR-026).
- Q: Como provar "sem mudança de layout"? → A: Capturas antes/depois das
  telas principais mais as suítes existentes verdes sem editar asserções
  (FR-027, FR-028, SC-003, SC-006).
- Q: A TV física é gate desta feature? → A: Recomendada, não obrigatória
  (Assumptions).
- Q: Reduzir movimento nesta onda? → A: Media query mais preferência
  interna persistida, sem UI. O controle visível chega na Onda 5 (FR-017,
  FR-018).
