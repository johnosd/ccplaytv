# Backlog

Painel único de ideias futuras e status de features/bugs geridas pelo
sistema sdd-*. Mantido automaticamente por update-feature-status.ps1 e
update-bug-status.ps1.

## Ideias Futuras

Derivado de `sdd/adr/REQUISITOS-FUNCIONAIS.md` (RF-001 a RF-019),
`sdd/adr/ESPECIFICACAO-TRAILERS.md`, `ADR-001` a `ADR-011`, da constitution
v1.5.0, do **Design System V14 Spectrum** (`docs/design/design-system/`:
Spec normativa, Component Lab e protótipo de telas) e da análise de
`docs/iptvnator/` e `docs/guia-praticas-app-tv/`.

**Atualização de 29/09/2026:** as features `029` (áudio/legendas/info),
`030` (EPG: dados e "Agora") e `031` (Guia completo) foram entregues em
código e removeram 4 mocks (`player-tracks`, `player-info`, `settings-epg`,
`epg-guide`); restam **19**. Os itens 55a e 42 saíram da lista de próximas
entregas e estão na seção "Entregues". Em seguida a `032` (item 28) removeu
mais 2 (`settings-integrations`, `dock-tmdb`): restam **17**. O texto abaixo é
o da revisão de 28/09, mantido como histórico.

**Revisão de 28/09/2026 — reorganização pós-migração.** A migração visual
para o DS V14 (features `021`–`028`) terminou, mas deixou **23 mocks "Em
breve"** registrados em `tv-web/src/lib/comingSoon.ts` e várias regras
normativas do Spec sem implementação (§24, §26, §27, §39, §40, §41, §44,
§45, §48.4). As próximas entregas passam a ser guiadas por **trocar esses
mocks por funcionalidade real**, na ordem de dependência, intercaladas com
o que é essencial para o app ser confiável no dia a dia (bugs conhecidos,
gates de hardware abertos, integridade do estado do usuário).

### Como ler esta lista

- **Os números são identificadores estáveis, não ordem.**
  `comingSoon.ts` (campo `backlogItem`) e
  `.planning/migracao-design-system-v14.md` apontam para eles. Nunca
  renumerar; item novo recebe o próximo número livre (hoje: 63).
- **A ordem de execução é a das fases e, dentro delas, a da tabela
  "Próximas entregas" logo abaixo.** Cada fase assume a anterior pronta
  ou, quando não, diz explicitamente do que depende.
- **Client-first (ADR-008)**: todo item assume que o dado nasce e vive no
  aparelho; chamadas externas só a APIs de terceiro (TMDB, OpenAI) com a
  chave do próprio usuário (BYOK). A pasta `api/` é contorno congelado,
  não caminho de nenhuma feature.
- **Mock → real (ADR-011)**: ao entregar um item que substitui um mock,
  apagar a entrada correspondente de `comingSoon.ts` na mesma feature.
- **Fonte de cada item** entre parênteses no fim. Itens sob `A avaliar`
  precisam passar por `sdd-assess` antes de virar spec.

### Próximas entregas (sequência recomendada)

| # | Entrega | Itens | Tipo | Mocks que remove |
| --- | --- | --- | --- | --- |
| 1 | Passada física dos gates abertos (013, 027) e dos cenários recomendados (029, 030, 031 e anteriores) | 58 | verificação | — |
| 2 | Pendências abertas do EPG e do E2E (fechar player ao configurar EPG, desempenho do Guia, flake de E2E) | 62 | correção | — |
| 3 | Entrada numérica de canal | 44 | feature | — (regra §44 sem UI) |
| 4 | Limpar histórico + aba Privacidade | 57 | feature | — (regra §48.4 sem UI) |
| 5 | Memória de foco por área + key repeat | 14 | feature | — (regra §41/§42) |
| 6 | Rede e lifecycle + erros acionáveis com código | 61, 19 | feature | — (regras §40/§45) |
| 7 | Fontes IPTV completas (estado, contagem, expiração) | 46 | feature | — (regra §24) |
| 8 | Qualidade, velocidade e aspecto no player + preferências | 55 (55b) | feature | `player-quality`, `player-speed`, `player-aspect`, `settings-player` |
| 9 | Acessibilidade: legendas, alto contraste, Voice Guide | 56 | feature | `a11y-subtitles`, `a11y-high-contrast`, `a11y-voice-guide` |
| 10 | Elenco e Semelhantes | 45 | feature | `cast`, `similar` |
| 11 | Trailers (`033`, código completo; gate da TV aberto) | 32 | feature | — (o `trailer` saiu; o herói do Início ganhou `home-trailer`) |
| 12 | Reconciliação pós-resync | 24 | feature | — |
| 13 | IA: curadoria na Home e "Descobrir com IA" | 27, 30, 31 | feature | `home-ai-curation`, `dock-ai` |

**Já entregues em código, só com a passada física em aberto** (saíram desta
tabela em 29/09/2026; a verificação segue no item 58): áudio, legendas e info
do stream (`029`, item 55a), o EPG completo — dados, "Agora" e Guia (`030`
e `031`, item 42) e a metadata do provedor + TMDB BYOK + aba Integrações &
BYOK (`032`, item 28). Ver a seção "Entregues" mais abaixo.

Os demais mocks (`pair-phone`, `voice-search`, `dock-weather`,
`dock-speedtest`, `settings-parental`) dependem de itens em `A avaliar` ou
da Fase 6 e **ficam como mock** até uma avaliação dizer que valem a pena.

---

### Fase 2 — Fechar a base (bugs conhecidos e gates abertos)

Antes de somar função nova: bugs já conhecidos e o que foi entregue sem a
verificação de hardware que a própria spec exigia.

Os dois bugs conhecidos desta fase estão em andamento via `sdd-bugfix`
(ver o painel `## Bugs`): `mensagem-generica-erro-reproducao-sempre-diz` e
`modal-temporada-sem-indicador-mais-itens`.

58. **Passada física dos gates de hardware ainda abertos**

    Duas features marcaram a verificação na TV física como **gate
    obrigatório** e ele segue aberto:
    - `013-favoritos`: gesto de segurar OK (SC-001) e tecla amarela
      (SC-006), incluindo se o nome `ColorF2Yellow` e o privilégio
      `tvinputdevice` estão corretos (R-011).
    - `027-player-chrome-ds-v14`: nomes/`keyCode`s das teclas de mídia,
      `getSupportedKeys()` na QN50Q60DAGXZD, chrome/toast sobre o plano de
      hardware do AVPlay, e se ↑=anterior/↓=próximo soa natural (SC-004).

    Aproveitar a mesma sessão para os cenários **recomendados** (não
    gates) de 012, 020 (nome da API de screensaver, R-001), 024, 025 e
    026 (IME real, custo das rails), e das três features entregues depois:
    - `029`: formato real de `getTotalTrackInfo`/`extra_info`,
      `setSelectTrack` com o vídeo pausado, `onsubtitlechange` e a legenda
      sobre o plano de hardware (R-001–R-004; o spike foi adiado por falta
      da TV).
    - `030`: `DecompressionStream` real no Chromium 108 (R-007), o Worker
      carregando sem cair no fallback (R-005), navegação fluida durante uma
      sincronização grande (SC-002, R-006) e o endereço XMLTV externo do
      `.env`, que deu timeout da máquina de desenvolvimento (R-001).
    - `031`: Guia opaco sobre o plano de hardware do AVPlay com o áudio
      acompanhando (R-002), segurar ↓/→ numa lista real e a entrega das
      teclas CH± (R-003).
    - `032`: **feito em 29/09/2026** (deploy por `deploy-tv.ps1`, visto pelo
      usuário) — backdrop sem cobrir o vídeo, CORS do TMDB, chave pelo IME da
      TV com "Mostrar", dock "conectado": tudo aprovado. Nada a repetir.

    Usa o skill `tizen-tv`; resultado de cada cenário registrado no
    `plan.md` da feature correspondente, "não testado" nunca vira
    "aprovado".

    (constitution "Validação em hardware real"; `plan.md` de 013, 027, 029,
    030 e 031)

62. **Pendências abertas do EPG e do E2E**

    Três itens que as features 030/031 deixaram registrados nos `plan.md`
    mas sem dono no backlog:
    - **Configurar EPG com um canal tocando fecha o player** (`031` R-010):
      abrir "Configurar EPG" a partir do Guia sobre o vídeo desmonta o
      `PlayerLayer`. Decidir se o fluxo deve preservar a sessão ou se
      fechar é aceitável e dito à pessoa.
    - **Desempenho do Guia com milhares de canais** (`031` R-003): a
      medição com a lista real cobriu só 2 das 41 categorias no "Todos";
      p95 de 128 ms numa amostra pequena não prova o caso grande.
    - **Flake do E2E `home-busca-configuracoes.mjs`**: o passo "com
      progresso salvo… vira Continuar" falha em ~19% das execuções, já no
      código anterior à 030 (medido num worktree de `HEAD`). Sem correção,
      aguardando decisão; investigar por `sdd-bugfix`.

    (`sdd/specs/031-epg-guia-completo/plan.md` R-003/R-010;
    `sdd/specs/030-epg-dados-agora/plan.md` → `## Estado Atual`)

---

### Fase 3 — Completar o DS V14: trocar mocks por funcionalidade real

O núcleo das próximas entregas. Cada item remove mocks de `comingSoon.ts`
ou implementa uma regra normativa do Spec que a migração deixou sem UI.
Nenhum depende de API de terceiro — tudo roda com o que o provedor e o
AVPlay já entregam.

55. **Player: trilhas de áudio/legenda, info do stream, qualidade,
    velocidade e aspecto**

    Estender o contrato de capacidades do `PlayerService` (feature 011)
    para cada botão do chrome V14, dirigido pela capacidade real do stream
    (soft disabled quando o stream não oferece; Velocidade ausente em Live,
    §27.3/§43.3). Começa por um **spike na TV de referência** sobre o que
    o AVPlay expõe de fato: `getTotalTrackInfo`/`setSelectTrack` (áudio e
    texto), `getCurrentStreamInfo`, `setDisplayMethod`, `setSpeed`,
    `setSubtitlePosition`. Legenda embutida no AVPlay chega pelo callback
    `onsubtitlechange` e **é renderizada pelo próprio app** — o que torna
    possível a aparência configurável do item 56.

    Duas features sugeridas, nesta ordem:
    - **55a — Áudio, legendas e info (§27.4, §27.8)** — *código completo como
      `029-audio-legendas-info-player` (28/09/2026); o formato real do AVPlay
      (spike) e a legenda sobre o plano de hardware ainda não foram vistos na
      TV — ver `plan.md` R-001…R-004*: modal de trilhas
      com idiomas disponíveis, legenda Off, ajuste de sincronização de
      legenda (−1000…+1000 ms), áudio-descrição como soft disabled quando
      não houver faixa (§39.4); modal de info técnica (resolução, codec,
      bitrate, protocolo, faixa ativa) só com o que o motor informar.
      Remove `player-tracks` e `player-info`. **Essencial**: legenda é a
      funcionalidade mais cobrada em VOD de IPTV.
    - **55b — Qualidade, velocidade, aspecto e preferências (§27.5–§27.7)**:
      Auto como padrão e resoluções só as que o stream anuncia; velocidade
      0.5×–2.0× só em VOD com `canSeek`; Ajustar/Preencher/Original/Zoom;
      aba real "Player & reprodução" em Configurações (idioma preferido de
      áudio/legenda, aspecto padrão). Remove `player-quality`,
      `player-speed`, `player-aspect`, `settings-player`.

    (V14 §27/§39/§43; protótipo `playerTracksModal()`/`playerQualityModal()`/
    `playerSpeedModal()`/`playerAspectModal()`/`playerInfoModal()`;
    matriz da migração §5)

44. **Entrada numérica de canal**

    Em Live TV e no player Live, dígitos `0–9` abrem um overlay compacto:
    acumula até 3 dígitos com padding (`005`), confirma após ~1100 ms,
    troca de canal se existir, senão "Canal 999 não encontrado" sem sair
    do contexto (§44). O número é o já exibido na linha de canal (posição
    na ordem da fonte, ADR-011) — o overlay não inventa outra numeração.

    **Já entregue pela feature 027**: teclas de mídia e CH±
    (`tizenMediaKeys.ts`). Falta registrar as teclas numéricas pelo mesmo
    mecanismo estrito (`getSupportedKeys()` antes, nunca registrar tudo —
    item 38).

    (V14 §44/§46 "Remote"; `docs/guia-praticas-app-tv/03` §1; `/10` §2;
    `docs/iptvnator/07-tela-canais.md`, resumo #4)

57. **Limpar histórico e remover item do `↺ Histórico`**

    O DS exige (§48.4): remover item individual do `↺ Histórico`, limpar
    Histórico de Filmes, de Séries ou ambos, sempre com confirmação
    (`Modal`), sem tocar em favoritos nem em "assistido". Entra com uma aba
    **Privacidade** em Configurações (ou dentro de uma aba existente, a
    decidir no `sdd-specify`). "Remover do histórico" também tira o item
    de "Continuar assistindo" na Home.

    (V14 §13.3/§48.4; `sdd/specs/025-filmes-series-ds-v14/spec.md` →
    Fora de Escopo; decisão de 27/09/2026 na feature 026)

14. **Memória de foco por área + navegação rápida (key repeat)**

    Hoje o foco é restaurado ao voltar do detalhe (`CategoryScreenSnapshot`,
    features 017/018), mas trocar de categoria e voltar a ela depois
    reabre no topo. O DS pede memória **contextual** (§41): uma posição por
    chave `seção:categoria` (`movies:favorites`, `live:<grupo>`…),
    reconciliada por id do item, nunca por índice; Favoritos e Histórico
    com memória própria; modal devolvendo foco ao controle que o abriu; EPG
    voltando ao canal de origem. Junto, §42: usar `KeyboardEvent.repeat`
    para que segurar uma seta atravesse a grade/trilha sem disparar
    prefetch/metadata a cada item transitório, reativando só quando o foco
    estabiliza.

    (V14 §41/§42/§46 "System"; constitution "Voltar Restaura Foco e
    Posição"; ADR-009; `docs/guia-praticas-app-tv/03` §2)

61. **Rede e lifecycle completos (§40)**

    A feature 020 cobriu pausar/fechar o player ao ocultar e reconfirmar a
    URL ao voltar. Falta o resto do §40:
    - estados explícitos `verificando rede` e `reconectando stream`, com
      UI própria em vez de erro seco;
    - ao retomar: `verificar rede → restaurar estado → restaurar foco →
      retomar player quando seguro`, nunca retomar stream sem conexão;
    - ao ocultar: suspender timers e prefetch de categoria, persistir foco
      essencial;
    - banner offline com ação `Tentar novamente` focável, bloqueando só as
      ações dependentes de internet (hoje o `OfflineBanner` só informa).

    (V14 §40/§46 "System"; feature 020)

19. **Erros acionáveis com código + diagnóstico de reprodução**

    Unificar os erros existentes (importação, categoria, reprodução,
    credencial) na taxonomia §45: o que aconteceu, por quê quando se
    sabe, **uma** ação primária útil, código técnico discreto (`NET-01`,
    `SRC-401`, `PLAY-04`, `API-429`…), foco preservado. Na reprodução,
    distinguir ao menos "falha de rede", "codec não suportado" e "fonte
    expirada/credencial recusada", com no máximo 3 ações focáveis
    (Tentar novamente / Info técnica — esta liga no item 55a / Editar
    credenciais). Nada troca de motor sozinho, nada marca como assistido,
    sem retentativa infinita. Diagnóstico sempre sanitizado (sem URL nem
    credencial). Absorve naturalmente o bug "mensagem sempre diz canal".

    (V14 §19/§45/§46 "Error handling"; `docs/iptvnator/02-arquitetura.md`
    #6; `docs/guia-praticas-app-tv/06` §2 e P04; ADR-005 §3)

46. **Fontes IPTV completas: estado, contagem e expiração da conta**
    *(promovido de `A avaliar` e ampliado para o §24 do DS)*

    A linha de fonte em Configurações e o cartão em "Quem está
    assistindo?" passam a mostrar o que o §24.1/§24.3 pede, só com dado
    real: tipo (Xtream/M3U), contagem conhecida (sem "0" inventado para
    categoria não carregada), estado de sincronização
    (Sincronizada/Sincronizando/Erro/**Credencial inválida**), estado do
    EPG (o 42a já entregou os estados "EPG vinculado"/"não configurado"/erro
    `EPG-02`; aqui entra só o chip na linha de fonte e no cartão), e o
    `exp_date` da conta Xtream como chip passivo
    (âmbar perto do vencimento, erro quando expirado; 0/negativo/ausente =
    sem expiração; "ativa" com data no passado = expirada). `exp_date` já
    é obtido por `xtreamConnector.ts` — falta persistir e exibir.

    (V14 §24; `docs/iptvnator/03-apis.md` #7; `09-dashboard-home.md` #9)

56. **Acessibilidade de sistema: legendas acessíveis, alto contraste,
    Voice Guide**

    - **Aparência de legenda** (§39): tamanho, cor, fundo, contorno e
      sincronização, com **prévia real** enquanto se ajusta; respeitar as
      preferências de caption da TV quando o Tizen as expuser. Depende do
      55a (o app precisa estar renderizando a legenda).
    - **Alto contraste**: variação de tokens, sem quebrar layout (§46).
    - **Voice Guide**: anúncios configuráveis e "testar anúncio de foco"
      sobre a região `aria-live` que já existe (feature 021).

    Remove `a11y-subtitles`, `a11y-high-contrast`, `a11y-voice-guide`.
    "Reduzir movimento" já é real desde a feature 021/026.

    (V14 §31/§38/§39/§46 "Accessibility"; protótipo
    `settingsAccessibility()`/`subtitleStyleModal()`)

18. **Entrada de texto conforme o IME da TV (acabamento)**

    As features 023 e 026 já usam o IME real no formulário de lista e na
    busca. Verificar no `sdd-specify` o que ainda falta do §37: campo
    editado nunca coberto pelo teclado; `Next` avança e `Done` conclui;
    rótulo permanente; senha com máscara e "mostrar" temporário; os
    **quatro erros** distinguidos (endereço inválido, falha de conexão,
    autenticação recusada, resposta incompatível — `xtreamConnector.ts`
    já distingue, feature 005 FR-011); sem submissão duplicada.

    (V14 §37/§46 "Input"; `docs/guia-praticas-app-tv/05` §1/§2 e E01–E07)

---

### Fase 4 — Enriquecimento com TMDB (BYOK) e IA

O TMDB é a chave que destrava a maior parte dos mocks restantes do
detalhe e da Home: sinopse e backdrop no hero, Elenco, Semelhantes e
Trailer. IA vem depois, porque precisa de sinais reais ("Gostei",
histórico) para não inventar justificativa.

28. **Conector TMDB client-first (BYOK) + tela Integrações & BYOK**

    *Entregue em código como `032-metadata-tmdb-integracoes` (29/09/2026;
    ver a seção "Entregues"), com escopo revisto: uma medição na lista real
    mostrou que o provedor Xtream já entrega sinopse, backdrop, gênero,
    elenco, diretor, país e `tmdb_id` (séries na listagem, filmes em
    `get_vod_info`). A feature captura isso primeiro e o TMDB só completa
    lacunas; a constitution foi emendada para 1.6.0 (chave BYOK no
    aparelho). O texto abaixo é o original.*

    **Desbloqueia o hero de detalhe de Filmes/Séries** (backdrop, sinopse
    com "ver mais" acionável por Enter): sem TMDB a sinopse não existe na
    fonte, e a tela hoje diz isso em vez de inventar.

    `tmdb_id` vindo do provedor é dica forte, não verdade: pesar contra
    título/ano; anos incompatíveis significam id contradito e a busca por
    título assume; 404 marca o id como morto em vez de suprimir o
    enriquecimento.

    **Decisão client-first (ADR-008 §3)**: TMDB é chamado **direto do
    aparelho** com a **chave do próprio usuário** (BYOK). TMDB é
    CORS-friendly por design.

    **Entregáveis**:
    - `tmdbConnector.ts` em `tv-web/src/lib/catalog/`.
    - **Aba real "Integrações & BYOK" em Configurações** (§21): chave
      mascarada, Testar, Editar, estado; mesma política de segredo da
      credencial de provedor. Estrutura pronta para receber a chave de IA
      (itens 30/31) depois.
    - Merge por campo: TMDB preenche **só o que falta**, nunca
      sobrescreve título de stream, duração ou URL do provedor.
    - Fallback para idioma original quando o payload em português não traz
      sinopse.
    - Cache com `fetched_at` e expiração de 6 meses (termos do TMDB).
    - Busca normalizada com gate de ano ±1 quando não há `tmdb_id`.
    - Nunca buscar metadata no foco durante navegação rápida (§42, item 14).

    Remove `dock-tmdb` e a parte TMDB de `settings-integrations`.

    (RF-016 base; ADR-001 §4; ADR-005 §2; ADR-006 §4.5; ADR-008 §3;
    V14 §21; `docs/iptvnator/03-apis.md` #11–14)

45. **Elenco e Semelhantes** *(promovido de `A avaliar`)*

    Preenche as abas hoje mock do detalhe (feature 025). **Atualização
    (29/09/2026): a aba Elenco já é real, só com a lista de nomes em texto
    (feature 032, task ad-hoc T044; o mock `cast` saiu). O que sobra aqui:**
    equipe técnica além da direção, foto/página de ator navegável e, sobretudo,
    Semelhantes **cruzados com o catálogo local** — só aparece o que a pessoa
    consegue assistir. Séries usam `aggregate_credits`, não `credits`. Rail de
    tendências fica para depois, se houver demanda. A dependência do 28 está
    cumprida. Remove só `similar`.

    (`docs/iptvnator/03-apis.md` #11; `00-resumo.md`; V14 §32)

32. **Trailers para filmes e séries** — *avaliado `go` em 29/09/2026;
    registro permanente em `sdd/assessments/viabilidade-youtube-iframe-na-tv-
    campo/decision.md` (spike na TV: IFrame direto do `file://` dá erro 153;
    via página estática HTTPS intermediária toca e o RETURN fica com o app).
    Página-ponte aceita pela ADR-012 (emenda a ADR-008). **Especificado
    como `033-trailers-filmes-series`** (ver `## Features`); o número 32
    segue só como referência de `comingSoon.ts`. **Código completo em
    29/09/2026** (botão real no detalhe de filme e de série; o mock `trailer`
    saiu do registro e o herói do Início ficou com `home-trailer`, fora do
    escopo). Gate obrigatório ainda aberto: passada na TV física com a ponte
    publicada (SC-001/SC-002).*

29. **Nota IMDb com procedência**

    Nota real e origem registrada, com "Sem avaliação" para ausências;
    nunca renomear nota genérica do provedor ou do TMDB para "IMDb", nunca
    gerar nota por IA. Ordenar o conjunto filtrado antes de paginar, sem
    nota no final, desempate estável. **Fonte/licença dos dados continua
    pendente de decisão** e bloqueia a entrega do recurso.

    (RF-016; ADR-005 §5; ADR-006 §4.5;
    `docs/iptvnator/08-tela-filmes.md` #10)

27. **Registrar "Gostei" em filmes e séries**

    Sinal explícito, distinto de favorito e de histórico, base das
    recomendações (30). Persistido em `userStateRepository` por identidade
    lógica estável.

    (RF-015; ADR-005 §4)

30. **Recomendações a partir do que a pessoa curte + Curadoria IA na Home**

    Sementes reais de "Gostei" e histórico, candidatos TMDB cruzados com o
    catálogo local, justificativa compatível com o método usado. Sem
    sinais, estado vazio orientativo — nunca justificativa pessoal
    inventada. É o que substitui a rail mock "Curadoria IA" da Home.
    Depende de 27 e 28. Remove `home-ai-curation`.

    (RF-017; ADR-005 §6; V14 §23)

31. **"Descobrir com IA": recomendação conversacional (BYOK OpenAI)**

    Chat de texto que responde cruzando com o catálogo **real** importado,
    via function-calling restrito a consultar o catálogo local — nunca
    sugere título fora dele. Chamada direta à OpenAI com a chave do
    usuário (ADR-008 §4), configurada na aba Integrações (item 28). Se o
    produto um dia oferecer chave compartilhada, só ela precisaria de
    intermediário. O DS cita DeepSeek; o provedor é decisão de ADR (hoje
    OpenAI). Remove `dock-ai`.

    (ADR-001 §4; ADR-008 §4; ADR-005 §6; V14 §23; constitution "IA e
    Classificação Nunca Inventam Dados")

---

### Fase 5 — Fontes e integridade do catálogo

Essenciais para quem usa listas reais por muito tempo: não perder estado
em resync, tocar streams que exigem cabeçalho, e não esconder itens que o
classificador não soube tipar.

24. **Reconciliação explícita após resync ("pending restore")**

    Ao substituir um catálogo, reaplicar favoritos, "gostei" e progresso
    por chave estável num passo pós-import, mantendo o snapshot novo
    **bloqueado até a reconciliação terminar** — nunca expor um catálogo
    sem as preferências do usuário. Item que não puder ser reconciliado
    com segurança preserva o estado anterior como indisponível, sem ser
    atribuído a outra obra por aproximação. Pré-requisitos (008, 013, 019)
    todos entregues.

    (ADR-005 §2/§4; `docs/iptvnator/06-carga-listas-url-xtream.md` #8/#12)

25. **Contrato de compatibilidade do parser M3U**

    O `m3uParser.ts` já trata BOM, atributos com vírgula/aspas, entrada
    sem URL e manifesto HLS. Falta:
    - separação de URL e headers no primeiro `|` (`|User-Agent=` /
      `|Referer=` indo para headers) — **muitas listas reais só tocam com
      isso**; verificar o que o AVPlay aceita de header;
    - atributo `radio`;
    - preservação de `#KODIPROP` (DRM/ClearKey) antes de `#EXTINF`;
    - `tvg-chno` como dado guardado (exibir como número do canal exigiria
      emendar a ADR-011, que hoje fixa "posição na ordem da fonte");
    - testes de contrato contra amostras reais adicionais.

    (RF-011; ADR-006 §4.3; ADR-011; `docs/iptvnator/03-apis.md` #1/#2)

26. **Seção "Não classificados"**

    Itens sem evidência confiável de tipo ficam visíveis e acessíveis
    (`classifier.ts` já preserva o caminho), com regra de correção
    reaplicável sem perder preferências. O DS não desenha esta seção:
    usar os componentes do Component Lab (grade + `EmptyState`).

    (RF-011; ADR-005 §2)

22. **Adicionar lista por arquivo `.m3u` ou pelo celular**

    Seleção via Filesystem/USB na TV (`tizen.filesystem`), validando
    extensão **e** conteúdo, parse pelo mesmo `m3uParser.ts`. O mock
    `pair-phone` do onboarding (conectar a lista pelo celular via QR)
    também aponta para cá — mas **exige `sdd-assess` antes**: um web app
    Tizen não abre socket de escuta por conta própria, então o pareamento
    precisa de outro caminho (service app, relay) que respeite a ADR-008.

    (RF-004; ADR-004 §4; V14 §46 "Input"; `docs/guia-praticas-app-tv/05`
    §2 e `/13` §1)

36. **Idempotência e dedup de importação por fonte**

    Deduplicar importações e leituras de categoria em voo por `sourceId`
    (single-flight), para duas telas ou hooks não dispararem o mesmo
    trabalho. Verificar se o FR-017 da feature 005 já basta.

    (`docs/iptvnator/06-carga-listas-url-xtream.md` #9)

23. **Múltiplas fontes com refresh isolado**

    Com a ADR-011 (fonte ativa única), a navegação continua sendo de uma
    lista por vez; o que sobra é **atualizar** várias fontes sem duplicar
    registros nem apagar favoritos/histórico, com isolamento de falha e
    resultado próprio por fonte (`atualizada`/`falhou`/`ignorada`)
    exposto em Configurações › Fontes IPTV.

    (RF-007; ADR-004 §6; ADR-011;
    `docs/iptvnator/06-carga-listas-url-xtream.md` #10)

---

### Fase 6 — Controle remoto por celular e voz

33. **Voz via página web no celular (BYOK OpenAI)**

    Pressionar-para-falar com `getUserMedia` + `MediaRecorder`,
    transcrição OpenAI **direta do celular** com a chave do usuário,
    comando com ID e expiração confirmado pelo estado real da TV.
    Substitui o mock `voice-search` da busca global. Compartilha com o 34
    (e com o pareamento do 22) o problema de como o celular fala com a TV
    na LAN — resolver uma vez.

    (ADR-001 §4; ADR-006 §4.7 e Incremento D; ADR-008 §4)

34. **Controle remoto por app Android**

    Restrito a mesma-LAN por padrão (ADR-008 §5). WebSocket autenticado
    com pareamento explícito na TV; protocolo com
    identificação/confirmação/expiração/reconexão; TV como fonte do estado
    real; controle remoto da TV operacional durante toda a sessão móvel.
    **Risco técnico a avaliar primeiro**: TV como servidor exige service
    app Tizen ou relay.

    (ADR-001 §5; ADR-006 Incremento D; ADR-008 §5;
    `docs/guia-praticas-app-tv/07` §2)

---

### Fase 7 — Qualidade, distribuição e lançamento

50. **Suíte de aceite de UX e percurso de referência**

    Transformar a matriz UX01–UX10 dos guias **e o checklist §46 do DS**
    num conjunto executável, percorrido com fonte vazia, fonte
    demonstrativa e catálogo volumoso: instalar, abrir sem fonte,
    configurar, entrar em canais, reproduzir, voltar, buscar, favoritar,
    assistir parcialmente, reabrir, continuar e remover a fonte —
    repetindo com falha de rede e dados incompletos. Cada execução
    registra responsável, aparelho, firmware, versão, dados, resultado e
    evidência; teste não executado fica "a testar", nunca "aprovado".

    (V14 §34/§46; `docs/guia-praticas-app-tv/08` §2/§3; `/13` §2)

35. **Benchmark determinístico de importação client-side**

    Fixtures sintéticas de 1.000/10.000/100.000 entradas servidas
    localmente, medindo fetch/parse/classify/store isoladamente, com
    aparelho e commit registrados e sem misturar warm-up. Incluir o parse
    de XMLTV (item 42, já entregue pela feature 030, com o Worker
    `assets/epgWorker.js`).

    (ADR-006 §2; V14 §30; `docs/iptvnator/02-arquitetura.md` #8)

37. **Matriz de TVs e evidências de compatibilidade**

    Registrar modelo, firmware, `navigator.userAgent`, protocolo,
    contêiner, codecs, resolução, DRM e legendas em cada teste de mídia.
    Hoje apenas a QN50Q60DAGXZD (Tizen 9.0 / Chromium 120, medido em 2026-09-29) foi testada.

    (ADR-006 E1/V1; `docs/guia-praticas-app-tv/12` §3 e `/13` §3)

38. **Pacote e checklist de lançamento Tizen**

    - `config.xml`, `author-signature.xml` e `signature1.xml` revisados.
    - Tizen ID preservado entre atualizações.
    - Versão `[0–255].[0–255].[0–65535]` sempre crescente.
    - `required_version` coerente com os modelos-alvo.
    - Título do pacote igual ao título do idioma padrão no portal.
    - **Permissões proporcionais ao escopo, cada uma justificada** (conta
      as teclas registradas pelos itens 44 e 58).
    - Custódia organizada do certificado de assinatura.
    - Todo arquivo emitido pelo Vite listado em `tizen_web_project.yaml`
      (guarda `findUnlistedFiles`, feature 021).

    **Bloqueadores internos propostos**: falha de instalação/atualização,
    perda sistemática de favoritos, importação não testável, áudio em
    segundo plano, ou credencial em log.

    (`docs/guia-praticas-app-tv/10` §1–3)

39. **Materiais de loja e Application UI Description**

    Logo 1920×1080 PNG RGBA (<300 KB), fundo 1920×1080 (<300 KB), ícone
    512×423 (<300 KB) e 4 capturas 1920×1080 JPG (<500 KB cada), de uma
    versão executável com dados fictícios ou autorizados — nunca telas
    conceituais nem credenciais visíveis. Application UI Description no
    template oficial é entregável obrigatório.

    (`docs/guia-praticas-app-tv/02` §1/§2; `/09` §1)

40. **Conta de publicação e abrangência geográfica**

    Public Seller publica **somente nos EUA**; Brasil depende de Partner
    Seller. Confirmar **antes** de prometer data. Preparar kit de revisão
    com fonte de demonstração estável e credenciais de teste separadas.

    (`docs/guia-praticas-app-tv/09` §2/§3; `/11` §1/§2)

---

### A avaliar (`sdd-assess`)

Hipóteses sem evidência própria de demanda, ou com risco técnico/produto
ainda não resolvido. Cada uma passa por `sdd-assess` antes de virar spec.
Os mocks que apontam para cá **continuam mock** até lá.

43. **TV Archive / Catch-up / Timeshift**

    Reprodução de conteúdo passado da grade de EPG, condicionada ao
    provedor oferecer. Duas variantes de URL (REST `/timeshift/...` e
    legado `/streaming/timeshift.php?...`) exigem probe concreto,
    preferindo TS antes de HLS. Liberaria também Play/Pause em Live (§43.3).
    Depende do item 42 (já entregue: o Guia completo da feature 031 é onde
    um programa passado poderia virar reprodução).

    (`docs/iptvnator/03-apis.md` #8; V14 §43.3)

52. **Perfis de pessoa e controle parental** *(mock `settings-parental`)*

    Pela ADR-011, **perfil = lista**. Sobra a hipótese de perfis de pessoa
    independentes das listas (várias pessoas na mesma lista com estado
    separado) e o controle parental (PIN, bloqueio de categoria). Exige
    migração Dexie de `UserStateRecord`, reconciliação do estado existente
    e decisão de produto. Sem demanda registrada.

    (V14 §13.3/§32/§48; protótipo `profiles()`/`profileCreate()`)

53. **Seções Esportes e Infantil**

    Destinos da topbar do DS sem fonte de dado definida. Precisa decidir
    como montá-los **sem substituir as categorias da fonte** (constitution,
    "Categorias da Fonte São Preservadas"): seleção manual de grupos pela
    pessoa, ou regra explícita e reversível. Fora da topbar até lá
    (ADR-011).

    (V14 §13.1; protótipo `sports()`/`kids()`)

54. **Dock de serviços: clima e teste de velocidade**
    *(mocks `dock-weather`, `dock-speedtest`)*

    TMDB e IA do dock/Integrações já estão nos itens 28/30/31. Clima
    (WeatherAPI) e teste de velocidade (Cloudflare) são novos e sem
    demanda; o teste de velocidade tem valor de diagnóstico real para
    stream travando — avaliar junto com o item 19.

    (V14 §20/§21; protótipo `serviceStrip()`/`settingsIntegrations()`)

41. **Portais Stalker/Ministra (STB) como fonte adicional**

    Protocolo, autenticação e mapeamento ainda não avaliados; decidir
    "full" × "simple" por comportamento observado, nunca pela forma da
    URL. Verificar CORS do portal antes de comprometer.

    (`docs/iptvnator/03-apis.md` #9)

51. **Política de descarte quando o espaço do aparelho acaba**

    Com a carga sob demanda (feature 010) e o EPG (item 42, já entregue), o
    banco cresce com o uso. Decidir: descartar a categoria menos usada
    (reobtenível), parar de gravar e declarar (comportamento atual, FR-018
    da 010), ou teto configurável. Depende de medir quanto uma categoria e
    um XMLTV ocupam (o EPG já existe, então a medição é possível) e qual é a
    quota real na TV de referência.

    (feature 010, `Clarifications` 2026-09-23)

17. **Detalhe em dois estados: browse ↔ watch**

    Hero colapsando numa faixa fina ao dar play e RETURN voltando ao
    browse. O DS V14 não adota esse padrão (o player é camada em tela
    cheia, §27); só vale se o uso real pedir.

    (`docs/iptvnator/08-tela-filmes.md` #5/#7)

---

### Processo, documentação e qualidade de código

0. **Decidir o destino de `api/delete_sources.py`** — lint corrigido em
   18/09/2026 (T052 da 003); fica em aberto se o script continua
   versionado junto do pacote congelado ou sai dele.

47. **Skills de domínio + mapa de validação por área**

    Skills curtos (~500 palavras) no formato "gatilho + Read First → doc
    canônico + Validation → comando concreto" para player AVPlay,
    importador client-side e navegação D-pad, complementando os skills
    `sdd-*`. Junto, um mapa do **menor** comando que valida cada área:

    ```powershell
    cd tv-web
    npx tsc -b
    npm run lint
    npx vitest run
    npm run build:tizen

    # Backend (contorno congelado — só prova que não quebrou)
    cd ..\api
    uv run ruff check .
    uv run pytest
    ```

    (`docs/iptvnator/04-skills.md` #1–3)

48. **Documentação canônica por subsistema**

    Um documento de arquitetura por área em `docs/architecture/`:
    importador client-side, player, navegação (foco, escopos, RETURN em
    camadas), armazenamento local (schema Dexie, repositórios). ADRs
    registram decisões; estes documentos, o **estado resultante**. Padrão
    antigo que contradiz o novo = **dívida de migração, não precedente**.

    (`docs/iptvnator/05-documentos.md` #1/#2/#4; `04-skills.md` #4;
    constitution "Documentação do Repositório É Canônica")

49. **Fronteiras de código explícitas e limite de tamanho de arquivo**

    - `features/` não importa de outro `features/` direto, usa `lib/`.
    - `lib/` não importa componentes de UI.
    - `lib/catalog/` → `lib/player/` (unidirecional).

    Limite soft de ~300 linhas por arquivo TS/React via lint.
    `PlayerLayer.tsx` e `LiveScreen.tsx` já são candidatos a divisão antes
    que o item 55 e o 42 os façam crescer mais.

    (`docs/iptvnator/02-arquitetura.md` #7; `04-skills.md` #5)

---

### Entregues (código completo; falta só a passada física)

Saíram das fases acima em 29/09/2026. A verificação na TV física segue no
item 58; nada aqui é dado como "aprovado em hardware".

- **42. EPG — guia de programação** *(promovido de `A avaliar`)* — três
  incrementos, todos com código completo e E2E verdes (com fixtures e com
  a lista/EPG reais do `.env`):
  - **42a — Dados** e **42b — "Agora" em todo lugar**: `030-epg-dados-agora`.
    XMLTV do painel Xtream (`xmltv.php`), do `url-tvg`/`x-tvg-url` do M3U ou
    de um endereço digitado (o manual vence), lido por stream em Web Worker,
    janela −12h…+48h no IndexedDB, vínculo canal↔programa só por id exato
    (`epg_channel_id`/`tvg-id`). "Agora"/"A seguir" na linha de canal, no
    preview, na banda do player Live e na Home; tela real em Configurações
    › Fontes IPTV › EPG. Removeu `settings-epg`.
  - **42c — Guia completo (§26)**: `031-epg-guia-completo`. Grade
    canal × programa em tela cheia, parada ou sobre o player. Removeu
    `epg-guide`.
  - **Limite conhecido**: no painel de referência só ~10 canais têm
    programação na janela, apesar de os 954 ids casarem. Uma avaliação de
    EPG externo como fallback (`sdd/assessments/epg-externo-como-fallback-
    por-canal/`, 29/09/2026) mediu o ganho possível em ~50–100 dos ~324
    canais com potencial e foi **descartada** (`kill`); a alternativa sem
    mudança no app é apontar o endereço XMLTV manual para um arquivo gerado
    pelo scraper do próprio usuário, com `channel id` iguais aos
    `epg_channel_id` do provedor.
  - Pendências abertas: item 62 (correções) e item 58 (passada física).
  - (V14 §24/§25/§26; `docs/iptvnator/03-apis.md` #10; `07-tela-canais.md`
    #3/#8)
- **55a — Áudio, legendas e info do stream**: `029-audio-legendas-info-player`
  (ver o item 55, que segue aberto só para o 55b).
- **28 — Conector TMDB client-first (BYOK) + tela Integrações & BYOK**:
  `032-metadata-tmdb-integracoes`, código completo com E2E (fictício, 3/3
  execuções verdes) e medição na lista real (sinopse + backdrop em 90 % das
  9 663 séries e 87–93 % dos filmes amostrados). O detalhe de filme/série
  mostra backdrop, sinopse com "Ver mais" e Gênero/Duração/Direção/País/Elenco
  em texto, buscados **só ao abrir o detalhe**; o TMDB só completa o que o
  provedor deixou vazio (`tmdb_id` do provedor, ou título + ano com candidato
  único); a sinopse do episódio focado (quando o provedor a manda — ~4–30 %
  dos episódios neste painel) aparece na série; Configurações › Integrações &
  BYOK é real (card do TMDB, tela da chave) e o dock da Home mostra o estado
  real. Removeu `settings-integrations` e `dock-tmdb`. Constitution → 1.6.0.
  **Fora, ainda mock**: Elenco/Semelhantes navegáveis (45), Trailer (32),
  nota (29), TMDB por episódio. **Verificada na TV física em 29/09/2026**
  (CORS do TMDB, IME para a chave, backdrop sobre o plano do AVPlay —
  aprovados pelo usuário); SC-003 medido com chave real (0 casamentos
  errados em 80 filmes). A pedido do usuário depois da passada física, a aba
  "Elenco" do detalhe virou **real** (lista os nomes do elenco em texto; mock
  `cast` removido — task ad-hoc T044); "Semelhantes" e as páginas de ator
  seguem no item 45.

### Retirados ou absorvidos nesta revisão

Registrados para que referências antigas continuem rastreáveis:

- **20. Design das telas que o protótipo não cobre** — resolvido pela
  migração DS V14 (021–028). A única tela sem desenho, "Não
  classificados", segue no item 26.
- **21. Um dono de scroll por painel + rótulo de escopo** — absorvido:
  rolagem dirigida pelo foco é o padrão da virtualização (feature 009),
  barras nativas foram removidas na 028, e com a fonte ativa única
  (ADR-011) o escopo é sempre a lista do topbar. O que restar de memória
  de rolagem entra no item 14.
- **44 (parte "teclas de mídia")** — entregue pela feature 027; o item 44
  agora cobre só a entrada numérica de canal.

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
| 020-ciclo-vida-player | Ciclo de Vida do Player na TV | Convergida | 15/16 tasks | 2026-09-26 |
| 021-fundacao-visual-ds-v14 | Fundação Visual do Design System V14 (Onda 0 da migração) | Convergida | 65/65 tasks | 2026-09-26 |
| 022-biblioteca-componentes-ds-v14 | Biblioteca de Componentes do Design System V14 (Onda 1 da migração) | Convergida | 80/80 tasks | 2026-09-26 |
| 023-shell-navegacao-entrada-ds-v14 | Shell, Navegação e Entrada do Design System V14 (Onda 2 da migração) | Convergida | 59/59 tasks | 2026-09-27 |
| 024-live-tv-ds-v14 | Live TV no Design System V14 (Onda 3) | Convergida | 59/60 tasks | 2026-09-27 |
| 025-filmes-series-ds-v14 | Filmes e Séries no Design System V14 (Onda 4) | Convergida | 79/80 tasks | 2026-09-27 |
| 026-home-busca-configuracoes-ds-v14 | Home definitiva, Busca global e Configurações no Design System V14 (Onda 5) | Convergida | 50/50 tasks | 2026-09-28 |
| 027-player-chrome-ds-v14 | Player chrome do Design System V14 com auto-hide e teclas de mídia (Onda 6) | Convergida | 55/55 tasks | 2026-09-28 |
| 028-limpeza-qa-ds-v14 | Limpeza e QA do Design System V14 (Onda 7) | Implementada | 78/78 tasks | 2026-09-28 |
| 029-audio-legendas-info-player | Player — Trilhas de Áudio, Legendas e Info do Stream | Convergida | 50/52 tasks | 2026-09-28 |
| 030-epg-dados-agora | EPG — Dados de Programação e "Agora" na Live TV, no Player e na Home | Convergida | 55/56 tasks | 2026-09-29 |
| 031-epg-guia-completo | EPG — Guia Completo em Tela Cheia | Convergida | 47/48 tasks | 2026-09-29 |
| 032-metadata-tmdb-integracoes | Metadata de Filmes e Séries — Provedor Primeiro, TMDB (BYOK) Completa, e Tela Integrações | Convergida | 58/58 tasks | 2026-09-29 |
| 033-trailers-filmes-series | Trailers de Filmes e Séries | Convergida | 55/55 tasks | 2026-09-29 |

## Bugs

| Slug | Título | Fase Atual | Veredito/Status | Próximo Passo | Última Atualização |
| --- | --- | --- | --- | --- | --- |
| tecla-voltar-return-nao-funciona-na | Tecla Voltar (RETURN) não funciona na TV física | Test | verified | Concluído | 2026-09-17 |
| live-tv-toca-audio-sem-imagem | Live TV toca áudio sem imagem na TV física | Test | verified | Concluído | 2026-09-17 |
| enter-controle-remoto-nao-ativa-botoes | Enter do controle remoto não ativa botões em telas de foco DOM nativo | Test | verified | Concluído | 2026-09-18 |
| prefetch-concorrente-categoria-sem-cancelamento-requisicao | Prefetch de categoria sem cancelamento de requisição HTTP em voo | Test | verified | Concluído | 2026-09-25 |
| mensagem-generica-erro-reproducao-sempre-diz | Mensagem genérica de erro de reprodução sempre diz "canal" | Fix | applied | Rodar fase Test | 2026-09-28 |
| modal-temporada-sem-indicador-mais-itens | Modal de temporada — foco some e não há indicador de "mais abaixo" | Fix | applied | Rodar fase Test | 2026-09-28 |

## Melhorias Ad-hoc

| Data | Área | Resumo |
| --- | --- | --- |
