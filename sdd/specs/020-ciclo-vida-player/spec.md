# Feature Specification: Ciclo de Vida do Player na TV

**Slug**: `020-ciclo-vida-player`

**Created**: 2026-09-26

**Status**: Especificada

**Input**: Item 10 do backlog (`.planning/backlog.md`, Fase 1) — o que resta
depois que o zapping saiu para a feature `016-zapping-live-tv` (convergida)
e o contrato de capacidades/identidade lógica/progresso intermediário foi
entregue pela feature `011-assistir-filme-retomada`
(`progressRecorder.ts`). Fecha a Fase 1 ("MVP: do catálogo real até
assistir") por completo. Fonte normativa:
`docs/guia-praticas-app-tv/06_player_de_midia.md` §"Reprodução, segundo
plano e proteção de tela" e §"Troca de conteúdo";
`docs/guia-praticas-app-tv/12_apis_web_e_arquitetura.md` (API03/API04).

## Escopo

### Incluído

- Desligar a proteção de tela (screensaver) do sistema Tizen enquanto o
  player está em reprodução ativa, para os três tipos de mídia (canal ao
  vivo, filme, episódio); reativá-la ao pausar, encerrar ou falhar a
  reprodução.
- Tratar a ocultação do app (`visibilitychange` → oculto) durante
  reprodução ativa como uma pausa automática, sem áudio residual em
  segundo plano.
- Ao o app voltar a ficar visível com uma sessão de player ainda aberta,
  revalidar a URL de reprodução do item atual antes de permitir retomar.
- Se a reprodução tiver concluído naturalmente enquanto o app estava
  oculto, tratar essa conclusão (ao voltar a ficar visível) exatamente
  como uma conclusão observada em primeiro plano.

### Fora de Escopo

- Preservar preferência de faixa de áudio/legenda entre mídias — não
  existe hoje nenhuma seleção manual de faixa no app; sem uma escolha
  existente, não há "preferência" para preservar. Fica bloqueado por uma
  feature futura de seleção de faixa, ainda não especificada (decisão
  explícita do usuário nesta entrevista).
- Zapping por cima do vídeo em Live TV — já entregue pela feature
  `016-zapping-live-tv`, não redefinido aqui.
- Contrato de capacidades do motor, identidade lógica de reprodução,
  gravação de progresso em pontos intermediários — já entregues pela
  feature `011-assistir-filme-retomada`, só reaproveitados.
- Qualquer novo tipo de histórico/"já assistido"/último acesso para canal
  ao vivo — decisão já fechada pela feature `019-historico-continuar-
  assistindo` (D-012), intocada aqui.
- Encerramento do app pelo sistema operacional (processo morto pelo SO)
  durante a reprodução — fora do controle do app.
- Qualquer controle visual novo na UI do player além do necessário para
  os comportamentos acima (sem novos botões/menus).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Proteção de tela nunca apaga durante reprodução (Priority: P1)

Como pessoa assistindo um canal, filme ou episódio, quero que a TV não
entre em modo de proteção de tela enquanto o conteúdo está tocando, para
não ter a experiência interrompida por um comportamento do próprio
aparelho.

**Why this priority**: é o objetivo central do item — hoje o player não
desliga o screensaver do sistema, então uma sessão longa sem interação no
controle (comum ao assistir TV) pode disparar a proteção de tela por cima
do vídeo.

**Independent Test**: iniciar a reprodução de qualquer um dos três tipos
de mídia, não tocar no controle pelo tempo que normalmente dispararia a
proteção de tela do aparelho, e confirmar que ela não aparece; pausar (ou
sair/a reprodução falhar) e confirmar que o comportamento normal de
proteção de tela volta a valer.

**Acceptance Scenarios**:

1. **Given** um canal, filme ou episódio em reprodução ativa (estado
   "playing"), **When** o tempo de inatividade do controle ultrapassa o
   limiar de proteção de tela do aparelho, **Then** a proteção de tela
   NÃO é ativada.
2. **Given** uma reprodução em andamento com a proteção de tela desligada,
   **When** a pessoa pausa, sai da reprodução (RETURN/conclusão) ou a
   sessão termina em erro, **Then** o comportamento normal de proteção de
   tela do aparelho volta a valer.
3. **Given** o zapping (feature 016) aberto por cima de um canal ainda
   tocando, **When** a lista está sobreposta, **Then** a proteção de tela
   continua desligada (a reprodução não pausou, só ganhou uma camada por
   cima).

---

### User Story 2 - Ocultar o app pausa a reprodução sem deixar rastro (Priority: P1)

Como pessoa que troca de app ou minimiza a TV enquanto assiste algo, quero
que a reprodução pause automaticamente e retome de forma segura quando eu
voltar, para nunca ficar com áudio tocando às cegas nem encontrar uma
sessão quebrada.

**Why this priority**: é o segundo objetivo central do item — hoje nada
observa `visibilitychange`, então ocultar o app deixa o vídeo (e o áudio)
tocando em segundo plano indefinidamente.

**Independent Test**: iniciar a reprodução de qualquer tipo de mídia,
ocultar o app (trocar de fonte de entrada/app na TV), confirmar que o
áudio para, e então voltar ao app e confirmar que a reprodução está
pausada na posição em que estava, retomável normalmente.

**Acceptance Scenarios**:

1. **Given** uma reprodução ativa, **When** o app fica oculto
   (`visibilitychange` → oculto), **Then** a reprodução pausa
   automaticamente e nenhum áudio continua tocando.
2. **Given** uma reprodução pausada automaticamente por ocultação,
   **When** o app volta a ficar visível, **Then** a camada de player
   continua aberta, pausada na posição correta, e a URL de reprodução do
   item é revalidada antes de qualquer nova tentativa de retomar.
3. **Given** a revalidação da URL encontra uma sessão que não é mais
   válida (expirou durante o tempo oculto), **When** a pessoa tenta
   retomar, **Then** aparece o mesmo estado de erro de reprodução já
   existente no app (mensagem, "Tentar de novo"/"Voltar", foco navegável)
   — nunca uma tentativa silenciosa de tocar uma URL morta, nem uma tela
   travada.
4. **Given** a reprodução concluiu naturalmente (fim do filme/episódio)
   enquanto o app estava oculto, **When** o app volta a ficar visível,
   **Then** o sistema trata essa conclusão exatamente como uma conclusão
   observada em primeiro plano (marca como assistido conforme a feature
   019, fecha a camada de player, aciona o autoplay de próximo episódio
   com o mesmo cancelável de 10s quando aplicável).

---

### Edge Cases

- A revalidação da URL de reprodução só acontece se ainda existir uma
  sessão de player aberta — navegar o catálogo normalmente (fora do
  player) nunca dispara esse mecanismo.
- Uma reprodução já pausada manualmente antes de o app ficar oculto não
  tem uma segunda transição visível de "pausar" — mas a revalidação da URL
  ao voltar a ficar visível continua acontecendo normalmente.
- Ocultar e mostrar o app repetidamente em sucessão rápida nunca acumula
  múltiplas revalidações concorrentes nem múltiplos listeners.
- Fora da tela de player (navegando o catálogo, nas telas de detalhe sem
  reprodução ativa), o comportamento de proteção de tela do aparelho
  permanece o padrão do sistema — esta feature só atua enquanto o player
  está montado e em reprodução.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE desligar a proteção de tela do aparelho
  enquanto a reprodução estiver no estado "playing", para canal ao vivo,
  filme e episódio.
- **FR-002**: O sistema DEVE reativar a proteção de tela do aparelho ao
  pausar, ao encerrar a reprodução (RETURN, conclusão real, ou erro), ou
  ao fechar a camada de player por qualquer motivo.
- **FR-003**: Quando o app ficar oculto (`visibilitychange`) durante uma
  reprodução ativa, o sistema DEVE pausar a reprodução automaticamente,
  sem deixar áudio tocando em segundo plano.
- **FR-004**: Quando o app voltar a ficar visível com uma sessão de player
  ainda aberta, o sistema DEVE revalidar a URL de reprodução do item atual
  antes de permitir retomar, em toda transição oculto→visível, sem
  depender de quanto tempo o app ficou oculto.
- **FR-005**: Se a revalidação encontrar uma URL que não é mais válida, o
  sistema DEVE apresentar o mesmo estado de erro de reprodução já
  existente no app — nunca tentar retomar silenciosamente com a URL
  antiga, nem travar a tela.
- **FR-006**: Se a reprodução tiver concluído naturalmente enquanto o app
  estava oculto, o sistema DEVE, ao voltar a ficar visível, tratar essa
  conclusão exatamente como uma conclusão observada em primeiro plano
  (mesma marca de "assistido", mesmo fechamento de camada, mesmo autoplay
  quando aplicável).
- **FR-007**: O sistema NUNCA DEVE deixar áudio tocando enquanto o app
  está oculto.
- **FR-008**: A revalidação da URL de reprodução NUNCA DEVE ser disparada
  fora de uma sessão de player aberta.

### Key Entities

Nenhuma entidade de dado nova. Reaproveita a identidade lógica de
reprodução e o progresso já persistidos pelo `UserStateRepository`
(feature 008) e pelo `progressRecorder.ts` (feature 011); nenhuma tabela
Dexie nova nem campo novo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma pessoa assistindo qualquer um dos três tipos de mídia
  sem interagir por um período prolongado não vê a proteção de tela do
  aparelho aparecer por cima do conteúdo tocando.
- **SC-002**: Uma pessoa que pausa ou sai da reprodução vê o comportamento
  normal de proteção de tela do aparelho voltar a valer, nunca ficando
  permanentemente desligado.
- **SC-003**: Uma pessoa que troca de app durante a reprodução e volta
  encontra a reprodução pausada, nunca tocando às cegas em segundo plano.
- **SC-004**: Uma pessoa que volta ao app depois de uma sessão de
  streaming ter expirado enquanto estava oculto vê um erro claro e
  recuperável, nunca uma tela travada ou uma reprodução corrompida.
- **SC-005**: Uma pessoa cujo filme/episódio terminou enquanto o app
  estava em segundo plano encontra, ao voltar, o mesmo resultado de quem
  viu o fim acontecer na tela.

## Assumptions

- A API de proteção de tela do Tizen (a escolher no `sdd-plan`) é
  chamável do navegador embutido da TV; o comportamento real só é
  confirmável na TV física — **recomendado, não bloqueante** para a
  convergência desta feature (mesmo padrão das features 011/012/019),
  decisão explícita do usuário nesta entrevista.
- `visibilitychange`/`document.visibilityState` é o mecanismo padrão do
  navegador (Chromium 108) usado para detectar a ocultação do app,
  disponível tanto em desenvolvimento desktop quanto na TV.
- Revalidar a URL de reprodução reaproveita o mesmo mecanismo já usado ao
  abrir o item pela primeira vez (`fetchPlayback`) — não é um mecanismo
  novo, só um novo gatilho para chamá-lo.
- Preferência de áudio/legenda entre mídias fica fora do escopo por não
  existir hoje nenhuma seleção manual de faixa no app.

## Clarifications

### Sessão 2026-09-26

- Q: Ao ocultar o app durante reprodução, o que deve acontecer com a
  sessão de vídeo? → A: Pausar e preparar para retomar (reativa
  screensaver, sem áudio residual; ao voltar, a camada de player continua
  aberta, pausada, pronta para retomar).
- Q: Qual escopo de revalidação de dados expirados ao retomar? → A: Só a
  URL de reprodução do item atual (não a fonte/categoria inteira).
- Q: Como tratar "preservar preferência de áudio/legenda", já que não
  existe seletor de faixa hoje? → A: Cortar do escopo desta feature —
  não há preferência a preservar sem uma escolha existente.
- Q: Esta feature cobre os três tipos de mídia ou só VOD? → A: Os três
  tipos (canal ao vivo, filme, episódio).
- Q: Quando a revalidação da URL deve disparar ao voltar a ficar visível?
  → A: Sempre, em toda transição oculto→visível, sem limiar de tempo.
- Q: Como aparece o erro se a revalidação encontrar uma URL inválida? →
  A: Reaproveitar o estado de erro de reprodução já existente no app.
- Q: A verificação real de screensaver na TV deve ser gate obrigatório ou
  recomendado? → A: Recomendado, não bloqueante — mesmo padrão das
  features 011/012/019.
- Q: Se a reprodução concluir naturalmente enquanto o app está oculto, o
  que acontece ao voltar? → A: Tratar como conclusão normal (marca
  assistido, fecha a camada, autoplay quando aplicável).
