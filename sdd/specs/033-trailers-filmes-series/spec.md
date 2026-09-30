# Feature Specification: Trailers de Filmes e Séries

**Slug**: `033-trailers-filmes-series`

**Created**: 2026-09-29

**Status**: Em Execução

**Input**: Item 32 do backlog ("Trailers para filmes e séries", RF-019), a partir da
avaliação `sdd/assessments/viabilidade-youtube-iframe-na-tv-campo/` (veredito `go`) e
da ADR-012 (página-ponte estática HTTPS). O botão "▶ Trailer" do detalhe de filme e de
série é hoje um mock soft-disabled (`trailer` em `comingSoon.ts`); esta feature o torna
real, tocando o trailer no player oficial do YouTube dentro do app.

## Escopo

### Incluído

- Ação "Trailer" real no detalhe de **filme** e de **série**, no mesmo lugar da linha
  de ações de hoje (a ordem e os índices das outras ações não mudam).
- Descoberta da referência do trailer **só ao abrir o detalhe**, em duas fontes, nesta
  ordem: (1) o identificador de trailer que o **provedor** já entrega para aquele
  título; (2) os vídeos do **TMDB** do título, quando a pessoa tem a chave BYOK
  configurada (feature 032).
- Estados visíveis do botão: consultando, disponível, indisponível.
- Reprodução em camada de tela cheia, no player oficial do YouTube, carregado através
  da página-ponte estática da ADR-012; o app mantém o controle do controle remoto.
- Teclas durante o trailer: RETURN fecha, OK pausa/retoma, ←/→ voltam/avançam 10 s,
  teclas de mídia Play/Pause equivalentes.
- Fim do trailer fecha a camada e devolve o foco ao botão "Trailer".
- Nova tentativa automática, uma única vez, com o próximo candidato conhecido quando
  o primeiro está removido/privado/com embed bloqueado.
- Tela de erro com código técnico discreto e ações focáveis.
- A página-ponte (conteúdo e publicação) em hospedagem estática gratuita com HTTPS.
- Remoção do mock `trailer` de `comingSoon.ts`.

### Fora de Escopo

- "Mais trailers" / escolher entre vários vídeos.
- Trailer por temporada ou por episódio.
- Preview no foco (ADR-011) — trailer só por ação explícita.
- Qualquer alternativa fora do app: deep link no app YouTube da TV, link ou QR para o
  celular (decisão da avaliação: sem fallback).
- Backend, proxy, função serverless ou domínio próprio (ADR-008/ADR-012).
- Extrair, baixar, cachear ou tocar vídeo do YouTube pelo AVPlay; ocultar anúncios,
  branding ou controles do player do YouTube.
- Trailer em mídia direta (MP4) de outra fonte.
- Trailers fora do detalhe (Home, grade, player chrome, busca).
- Legendas/idioma de áudio do trailer (controlados pelo próprio YouTube, se houver).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver o trailer que o provedor já informa (Priority: P1)

A pessoa abre o detalhe de uma série (ou filme) cujo provedor informa um trailer.
O botão "▶ Trailer" fica disponível; ao apertar OK, o trailer toca em tela cheia
dentro do app. RETURN fecha e a pessoa volta ao detalhe, com o foco no botão
"Trailer". Se o vídeo termina, o mesmo acontece sozinho. Nada disso altera histórico,
progresso, "assistido" ou favoritos.

**Why this priority**: é o caminho que funciona sem configuração nenhuma (cerca de
24% das séries do painel de referência têm o identificador) e prova a cadeia inteira:
descoberta → página-ponte → player → volta com foco.

**Independent Test**: com uma fonte cujo título traga o identificador de trailer do
provedor e sem chave TMDB, abrir o detalhe, apertar OK em "Trailer", ver o vídeo, e
voltar com RETURN ao botão "Trailer".

**Acceptance Scenarios**:

1. **Given** uma série com trailer informado pelo provedor, **When** a pessoa abre o
   detalhe, **Then** o botão mostra "▶ Trailer" disponível assim que a consulta
   termina.
2. **Given** o botão disponível, **When** a pessoa aperta OK, **Then** o trailer
   começa a tocar em tela cheia em até 15 s, sem áudio de outra reprodução.
3. **Given** o trailer tocando, **When** a pessoa aperta RETURN, **Then** o vídeo e o
   áudio param, a camada fecha e o foco volta ao botão "Trailer" do mesmo detalhe.
4. **Given** o trailer tocando, **When** o vídeo chega ao fim, **Then** a camada fecha
   sozinha e o foco volta ao botão "Trailer".
5. **Given** a pessoa viu um trailer inteiro, **When** consulta o título depois,
   **Then** histórico, "Continuar assistindo", progresso, "assistido" e favoritos
   estão exatamente como antes.
6. **Given** um título sem nenhum trailer conhecido, **When** o detalhe termina a
   consulta, **Then** o botão fica soft-disabled "Trailer — indisponível" e OK só
   mostra uma mensagem, sem abrir nada.
7. **Given** a pessoa apenas foca o botão ou o cartão do título, **Then** nenhum
   vídeo começa e nenhuma consulta nova é feita por causa do foco.

---

### User Story 2 - TMDB completa quando o provedor não informa (Priority: P2)

Para títulos sem trailer do provedor — quase todos os filmes — o app usa os vídeos do
TMDB do título, se a pessoa configurou a chave. Prefere trailer oficial (e, entre oficiais, o
em português); quando só há outro idioma ou só um teaser, o botão diz isso antes de tocar. Se o
vídeo escolhido estiver removido ou com embed bloqueado, o app tenta o próximo
candidato uma vez. Sem chave configurada, a mensagem do "indisponível" diz que
configurar o TMDB encontra mais trailers.

**Why this priority**: sem isso, filmes praticamente não têm trailer (~1% pelo
provedor); depende da chave BYOK, então é incremento sobre a P1.

**Independent Test**: com chave TMDB configurada, abrir o detalhe de um filme sem
trailer do provedor e com trailer no TMDB; o botão fica disponível com o rótulo certo
e o vídeo toca.

**Acceptance Scenarios**:

1. **Given** um filme sem trailer do provedor, com chave TMDB e trailer oficial em
   português no TMDB, **When** o detalhe abre, **Then** o botão mostra "▶ Trailer" e
   toca esse vídeo.
2. **Given** o TMDB só tem trailer em inglês, **When** o detalhe abre, **Then** o
   botão mostra "▶ Trailer · Inglês".
3. **Given** o TMDB só tem teaser, **When** o detalhe abre, **Then** o botão mostra
   "▶ Teaser" (com idioma, se não for português) — nunca "Trailer".
4. **Given** o primeiro candidato está removido/privado/com embed bloqueado e existe
   outro candidato, **When** a pessoa aperta OK, **Then** o app tenta o segundo
   automaticamente, uma vez; se ele tocar, a pessoa não vê erro.
5. **Given** nenhum candidato em nenhuma fonte e nenhuma chave TMDB configurada,
   **When** a pessoa aperta OK em "Trailer — indisponível", **Then** a mensagem
   sugere configurar o TMDB em Integrações.
6. **Given** o provedor e o TMDB informam trailers diferentes, **Then** o do provedor
   é o primeiro candidato e o do TMDB o segundo.

---

### User Story 3 - Controlar o trailer e se recuperar de falhas (Priority: P3)

Com o trailer aberto, OK pausa e retoma, ←/→ voltam e avançam 10 s, e as teclas de
mídia Play/Pause fazem o mesmo que OK. Quando algo falha — sem rede, página-ponte fora
do ar, vídeo que não começa em 15 s, vídeo bloqueado sem alternativa — aparece uma
tela de erro com código discreto e ações focáveis: "Tentar de novo" (só para falhas de
rede/tempo) e "Voltar".

**Why this priority**: a P1 já é útil só com RETURN; controles e recuperação refinam a
experiência sem mudar o núcleo.

**Independent Test**: com o trailer tocando, OK pausa e OK retoma; → avança; com a
rede cortada, OK em "Trailer" leva à tela de erro com "Tentar de novo" focado, e
"Voltar" devolve o foco ao botão.

**Acceptance Scenarios**:

1. **Given** o trailer tocando, **When** OK (ou a tecla de mídia Play/Pause), **Then**
   pausa; de novo, retoma.
2. **Given** o trailer tocando, **When** → / ←, **Then** avança / volta 10 s, sem
   passar do início nem do fim.
3. **Given** a rede caiu ou a página-ponte não responde, **When** OK em "Trailer",
   **Then** em até 15 s aparece a tela de erro com "Tentar de novo" e "Voltar", o foco
   num deles, e um código técnico discreto.
4. **Given** o vídeo foi removido/bloqueado e não há outro candidato, **Then** a tela
   de erro mostra só "Voltar" (tentar de novo não resolveria).
5. **Given** a tela de erro, **When** RETURN ou "Voltar", **Then** a camada fecha e o
   foco volta ao botão "Trailer".
6. **Given** a pessoa segura uma tecla de seta, **Then** o app não trava nem acumula
   saltos (single-flight, como no player de filmes).

### Edge Cases

- **Consulta ainda em andamento**: botão soft-disabled "Trailer…"; OK diz
  "Consultando trailer". Vira disponível/indisponível quando a resposta chega, sem
  mover o foco.
- **Identificador do provedor malformado** (não é um id de vídeo válido): tratado como
  ausente, nunca enviado à página-ponte.
- **Sem rede ao abrir o detalhe**: a consulta ao TMDB falha em silêncio (a feature 032
  já trata o estado do TMDB); se o provedor informou um id já guardado, o botão pode
  ficar disponível — a falha aparece só ao tentar tocar.
- **Trailer aberto e a pessoa sai do app (app oculto)**: o trailer para e a camada
  fecha (não há posição para retomar), como o canal ao vivo na feature 020.
- **Tecla RETURN durante o carregamento**: cancela e fecha, sem o vídeo começar depois.
- **Código 153 / erro de configuração do player**: é falha da página-ponte, não do
  vídeo — não tenta o próximo candidato; mostra erro com "Tentar de novo".
- **Autoplay bloqueado**: o app pede a reprodução; se não começar em 15 s, é timeout.
- **Anúncio antes do trailer**: o player do YouTube pode exibir anúncio; o app não o
  oculta nem pula. **Emenda R-013 (2026-09-29, achado na TV: dois anúncios seguidos
  derrubavam o trailer com TRL-TEMPO):** os 15 s valem até a ponte avisar que o player
  está vivo ("ready"); daí em diante o prazo é de 90 s (`TRAILER_READY_TOLERANCE_MS`),
  porque o que atrasa é o anúncio do YouTube. A faixa avisa que anúncios podem passar
  e "Cancelar" segue ativável o tempo todo.
- **Detalhe fechado com a consulta em andamento**: a resposta é descartada, sem erro.
- **Catálogo re-sincronizado enquanto o trailer toca**: ao fechar, o foco volta ao
  botão do mesmo título se ele ainda existir; senão, segue a regra de volta do detalhe.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O detalhe de filme e o de série DEVEM ter a ação "Trailer" real, na
  mesma posição de hoje na linha de ações; as demais ações e a ação primária no índice
  0 NÃO DEVEM mudar de ordem.
- **FR-002**: A busca da referência do trailer DEVE acontecer só ao abrir o detalhe,
  nunca por foco num cartão ou na navegação, e NÃO DEVE bloquear sinopse, favoritos,
  "Assistir" ou qualquer outra ação da tela.
- **FR-003**: O sistema DEVE usar como primeiro candidato o identificador de trailer
  informado pelo provedor para aquele título (filme ou série), quando existir e for um
  identificador de vídeo válido.
- **FR-004**: Com a chave TMDB configurada, o sistema DEVE obter os vídeos do título no
  TMDB e acrescentá-los como candidatos depois do provedor, ordenados por: tipo
  Trailer antes de Teaser, oficial antes de não oficial, português antes de outro
  idioma (**emenda R-012, 2026-09-29**: era "português antes de outro idioma, oficial
  antes de não oficial"; a passada na TV mostrou o dublado de um canal agregador,
  cheio de anúncio, passando na frente do oficial da distribuidora). Outros tipos (making-of, clipe, bastidores) NÃO DEVEM virar candidatos.
- **FR-005**: A consulta ao TMDB DEVE reaproveitar a identificação do título e a
  chamada que a feature 032 já faz ao abrir o detalhe, sem requisição adicional por
  título quando for possível obter os vídeos na mesma resposta.
- **FR-006**: O botão DEVE ter três estados: consultando (soft-disabled, "Trailer…"),
  disponível ("▶ Trailer") e indisponível (soft-disabled, "Trailer — indisponível").
  Nenhum dos estados muda a posição do botão.
- **FR-007**: O rótulo disponível DEVE indicar tipo e idioma somente quando o
  candidato preferido não for um trailer em português: "▶ Trailer · Inglês",
  "▶ Teaser", "▶ Teaser · Inglês". Idioma desconhecido (caso do provedor) mostra só o
  tipo "Trailer". Teaser NUNCA é rotulado como trailer.
- **FR-008**: OK no botão consultando DEVE mostrar a mensagem "Consultando trailer";
  OK no indisponível DEVE mostrar "Trailer indisponível para este título" e, se não
  houver chave TMDB configurada, acrescentar que configurar o TMDB em Integrações
  encontra mais trailers.
- **FR-009**: OK no botão disponível DEVE abrir uma camada de tela cheia que toca o
  candidato preferido no player oficial do YouTube, carregado através da página-ponte
  da ADR-012; o app NUNCA carrega o player do YouTube diretamente.
- **FR-010**: O sistema DEVE enviar à página-ponte somente o identificador público do
  vídeo; NUNCA credencial, URL de fonte ou de stream, chave BYOK, título, id do
  catálogo ou qualquer dado da pessoa.
- **FR-011**: A comunicação entre app e página-ponte DEVE aceitar só mensagens de um
  conjunto fechado e de origem validada nos dois sentidos; mensagem fora disso é
  ignorada.
- **FR-012**: Antes de iniciar o trailer, NENHUMA outra reprodução pode estar tocando
  áudio ou vídeo no app.
- **FR-013**: Com o trailer aberto, o app DEVE continuar recebendo as teclas: RETURN
  fecha; OK e Play/Pause alternam pausa; ← volta 10 s; → avança 10 s, limitados ao
  início e ao fim do vídeo. Teclas repetidas NÃO DEVEM acumular comandos pendentes.
- **FR-014**: Ao fechar a camada (RETURN, fim do vídeo, "Voltar" ou app oculto), o
  vídeo e o áudio DEVEM parar e o foco DEVE voltar ao botão "Trailer" do mesmo detalhe.
- **FR-015**: Quando o app for ocultado com o trailer aberto, a camada DEVE fechar.
- **FR-016**: Ver um trailer NÃO DEVE alterar histórico, "Continuar assistindo",
  progresso, marca de assistido, favoritos ou qualquer estado do título.
- **FR-017**: Se o candidato falhar por vídeo removido/privado ou embed não permitido,
  e houver outro candidato, o sistema DEVE tentar o próximo automaticamente, **uma
  única vez** por abertura; nunca em laço.
- **FR-018**: Se o vídeo não começar a tocar em até 15 s depois do OK, o sistema DEVE
  encerrar a tentativa e mostrar a tela de erro. Exceção (R-013): depois que a ponte
  disser "ready" o prazo é de 90 s, para não derrubar anúncios do YouTube.
- **FR-019**: A tela de erro DEVE dizer o que aconteceu em linguagem simples, mostrar
  um código técnico discreto e oferecer ações focáveis: "Tentar de novo" (só para
  falha de rede, página-ponte indisponível, erro de configuração do player ou tempo
  esgotado) e "Voltar" (sempre). Deve haver foco em uma delas ao aparecer.
- **FR-020**: Mensagens e códigos de erro NUNCA DEVEM conter URL, credencial, chave ou
  o texto bruto de erro do player ou da rede.
- **FR-021**: O mock `trailer` DEVE ser removido do registro de "Em breve".
- **FR-022**: A página-ponte DEVE ser estática, publicada em hospedagem gratuita com
  HTTPS, sob os critérios 1–6 da ADR-012, e versionada no repositório.
- **FR-023**: Todos os estados (consultando, indisponível, carregando, tocando, erro)
  DEVEM manter exatamente um elemento com foco visível.

### Key Entities

- **Referência de trailer**: um candidato a trailer de um título — de onde veio
  (provedor ou TMDB), identificador do vídeo no serviço, tipo (Trailer/Teaser),
  idioma (ou desconhecido), se é oficial (ou desconhecido). Ligada ao título pela
  mesma identidade estável que a metadata da feature 032 já usa. Não é uma URL de
  mídia e não promete que o vídeo ainda exista.
- **Estado do trailer no detalhe**: consultando / disponível (com o candidato
  preferido e os demais) / indisponível (com ou sem chave TMDB configurada).
- **Sessão de trailer**: aberta por um OK; carregando / tocando / pausado / erro
  (com código e se admite nova tentativa); termina ao fechar. Não gera nenhum registro
  persistente de estado do usuário.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Na TV de referência, com a página-ponte publicada em HTTPS, um trailer
  disponível começa a tocar em até 15 s após o OK em pelo menos 9 de 10 tentativas
  (títulos diferentes, rede normal). **Gate obrigatório na TV física.**
- **SC-002**: Na TV de referência, RETURN fecha o trailer e o foco volta ao botão
  "Trailer" em 10 de 10 tentativas, sem áudio remanescente. **Gate obrigatório na TV
  física.**
- **SC-003**: Em nenhum caso de teste ver um trailer altera histórico, progresso,
  assistido ou favoritos (0 alterações).
- **SC-004**: Navegar pelas grades de Filmes/Séries, sem abrir detalhe, gera zero
  consultas de trailer.
- **SC-005**: Com a lista real e chave TMDB, a fração de títulos com trailer
  disponível é medida e registrada (séries e filmes em separado), sem meta mínima —
  serve para dizer à pessoa o que esperar, nunca para inventar trailer.
- **SC-006**: Nenhum log, mensagem, código ou requisição para a página-ponte contém
  credencial, URL de fonte/stream ou chave (verificação por inspeção e teste).

## Assumptions

- O provedor Xtream de referência informa o identificador de trailer para séries na
  listagem e para filmes nos dados detalhados do filme (medido em 2026-09-29: 2 298 de
  9 663 séries; 1 de 80 filmes amostrados), sempre como id de vídeo do YouTube.
- Uma fonte M3U não informa trailer; títulos dessa fonte dependem só do TMDB.
- A página-ponte em HTTPS público se comporta como a página http da LAN usada no spike
  (a confirmar no gate da TV — primeiro risco do plano).
- A TV de referência é Tizen 9.0 / Chromium 120 e o app roda em origem `file://`
  (medido no spike); o player do YouTube não funciona carregado diretamente do app.
- O provedor de hospedagem estática é escolhido no `sdd-plan` (ADR-012).
- Anúncios e controles próprios do player do YouTube aparecem como o YouTube decidir;
  a experiência não pode escondê-los.
- A referência de trailer fica guardada junto da metadata do título e segue a mesma
  validade que a feature 032 já aplica a cada fonte (provedor/TMDB).

## Clarifications

### Sessão 2026-09-29

Decisões herdadas da avaliação (`sdd/assessments/viabilidade-youtube-iframe-na-tv-campo/`)
e da ADR-012: provedor primeiro, TMDB completa; sem fallback fora do app; página-ponte
estática HTTPS; sem domínio próprio.

- Q: Sem trailer conhecido, o botão some ou fica? → A: Fica, soft-disabled
  "Trailer — indisponível" (FR-006).
- Q: Sem chave TMDB, dizer que o TMDB ajudaria? → A: Sim, ao apertar OK no
  indisponível, só quando não há chave (FR-008).
- Q: Teclas durante o trailer? → A: RETURN fecha, OK pausa, ←/→ ±10 s, Play/Pause de
  mídia igual a OK (FR-013).
- Q: Fim do trailer? → A: Fecha e devolve o foco ao botão "Trailer" (FR-014).
- Q: Candidato removido/bloqueado com outro disponível? → A: Tenta o próximo uma vez,
  sem laço (FR-017).
- Q: Rótulo com tipo/idioma? → A: Só quando não é trailer em português (FR-007).
- Q: Botão durante a consulta? → A: "Trailer…" soft-disabled; OK diz "Consultando
  trailer" (FR-006/FR-008).
- Q: Tempo máximo até o vídeo começar? → A: 15 s (FR-018).
- Q: Passada na TV física é gate? → A: Sim, obrigatório (SC-001/SC-002).
- Q: Ações da tela de erro? → A: "Tentar de novo" (só rede/tempo/configuração) +
  "Voltar" (FR-019).
