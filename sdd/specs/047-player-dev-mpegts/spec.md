# Feature Specification: Reprodução de canais ao vivo MPEG-TS no navegador do dev

**Slug**: `047-player-dev-mpegts`

**Created**: 2026-10-02

**Status**: Convergida

**Input**: `sdd/assessments/mpegtsjs-no-htmlvideoadapter-tocar-canais-no/decision.md` (veredito `go`, 2026-10-02) — no `npm run dev` nenhum canal ao vivo toca, porque o `<video>` do Chromium não decodifica MPEG-TS bruto (o formato das URLs Xtream `/live/u/p/<id>.ts`); o app mostra `PLAY-04`. Objetivo: poder testar fluxos de player (zapping, chrome, guia, reconexão) com vídeo de verdade sem instalar na TV.

## Escopo

### Incluído

- No ambiente de desenvolvimento (`npm run dev`), um canal ao vivo cujo stream é MPEG-TS passa a reproduzir no navegador, automaticamente, sem configuração.
- Um spike de viabilidade (codec dos canais reais no Chromium) como primeira etapa, com porta de saída: se não decodificar, a feature para e registra o motivo.
- Garantia verificável de que nada disso entra no build de produção nem no pacote da TV.
- Prova automatizada: um stream MPEG-TS servido localmente no `test:e2e` padrão e um script contra a lista real, fora do `test:e2e`.

### Fora de Escopo

- Provar compatibilidade da TV: o adaptador de navegador continua declarando que não prova mídia; a aceitação segue sendo o AVPlay no aparelho.
- HLS (`.m3u8`) e VOD (filme/episódio) — só se saírem de graça, nunca como requisito.
- Decodificar o que o Chromium não decodifica (ex.: HEVC, AC3/EAC3), DRM, cabeçalhos por item (feature 044/25b).
- Mensagem ou código de erro novos para "codec não suportado": continua o `PLAY-04` de hoje.
- Qualquer mudança no AVPlay, nas telas, no contrato do player ou na tabela de erros.
- Opção de ativar/desativar por configuração: em dev é sempre ativa.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Spike: os canais reais decodificam no navegador? (Priority: P1)

Antes de construir qualquer coisa, a pessoa que desenvolve descobre, com a lista real do `.env`, se o Chromium consegue decodificar vídeo **e** áudio dos canais dela quando o MPEG-TS é demultiplexado em JavaScript.

**Why this priority**: é o único `unknown` relevante do assessment. Se a resposta for não, o resto da feature não tem valor e deve parar sem custo de implementação.

**Independent Test**: rodar o spike contra a lista real e ler o veredito registrado (decodifica / não decodifica, e quantos canais amostrados em cada caso); nada mais é necessário para ele ter valor.

**Acceptance Scenarios**:

1. **Given** a lista Xtream real do `.env` e o dev server no ar, **When** o spike tenta tocar uma amostra de canais ao vivo, **Then** ele registra, por canal amostrado, se chegou a tocar com imagem e áudio, sem imprimir URL, usuário, senha nem nome de canal.
2. **Given** a maioria da amostra não decodificar (vídeo ou áudio), **When** o spike termina, **Then** o resultado registra a feature como inviável e as demais histórias **não** são implementadas.
3. **Given** a maioria da amostra decodificar, **When** o spike termina, **Then** o resultado registra o que não decodificou (para saber o limite aceito) e libera a História 2.

---

### User Story 2 - Assistir um canal ao vivo no `npm run dev` (Priority: P1)

Quem desenvolve abre o app no navegador com `npm run dev`, escolhe um canal ao vivo e ele toca, com a máquina de estados do player (carregando → tocando, trocar de canal, fechar) se comportando como na TV.

**Why this priority**: é o valor da feature — validar zapping, chrome, guia sobre o vídeo e reconexão com vídeo real, sem o ciclo de instalação na TV.

**Independent Test**: com a lista real, abrir um canal em `npm run dev` e ver o estado do player chegar a "tocando"; trocar de canal e fechar sem restar áudio nem conexão aberta.

**Acceptance Scenarios**:

1. **Given** `npm run dev` e um canal ao vivo MPEG-TS decodificável, **When** a pessoa o abre, **Then** o player chega a "tocando" em até 15 s, com imagem e som.
2. **Given** um canal tocando, **When** ela troca para outro canal (OK/↑/↓/CH±), **Then** a sessão anterior é encerrada por completo antes da nova começar, sem som residual do canal anterior.
3. **Given** um canal tocando, **When** ela fecha o player (RETURN), **Then** não sobra áudio, vídeo nem conexão de rede aberta para o stream.
4. **Given** um canal cujo vídeo ou áudio o navegador não decodifica, **When** ela o abre, **Then** vê o mesmo erro `PLAY-04` de hoje, com as mesmas ações, sem travar o foco.
5. **Given** um stream que cai no meio, **When** o fluxo de reconexão da feature 042 age, **Then** ele continua funcionando como hoje (a camada nova não o contorna).

---

### User Story 3 - Nada disso chega à TV nem à produção (Priority: P2)

Quem faz o build de produção e o pacote da TV tem certeza de que a capacidade nova é só de desenvolvimento.

**Why this priority**: protege o alvo real do projeto; sem isso a feature poderia aumentar o pacote da TV ou mudar seu comportamento silenciosamente.

**Independent Test**: gerar `npm run build` e conferir que a biblioteca de demux não está no resultado e que a lista de arquivos emitidos é a mesma de antes.

**Acceptance Scenarios**:

1. **Given** o código desta feature, **When** roda `npm run build`, **Then** nenhum arquivo emitido contém a biblioteca de demux e o conjunto de arquivos emitidos é idêntico ao anterior.
2. **Given** a TV (AVPlay presente), **When** o app roda, **Then** o motor usado continua sendo o AVPlay e a capacidade nova nem é carregada.
3. **Given** `npm run build:tizen`, **When** o guard de arquivos não listados roda, **Then** nada novo é exigido em `tizen_web_project.yaml`.

---

### User Story 4 - Prova automatizada (Priority: P3)

A feature tem testes que a protegem de regressão sem depender da lista real no fluxo padrão.

**Why this priority**: reduz o custo de manter a capacidade, mas só faz sentido depois de ela existir e valer a pena.

**Independent Test**: o `test:e2e` padrão passa com a capacidade ativa; o script real roda sob demanda e imprime só estados e contagens.

**Acceptance Scenarios**:

1. **Given** um servidor local servindo um stream MPEG-TS pequeno, **When** o `test:e2e` padrão abre um canal apontando para ele, **Then** o player chega a "tocando" no Chromium.
2. **Given** o script contra a lista real (fora do `test:e2e`), **When** ele roda, **Then** a saída tem só estados, tempos e contagens, sem URL, credencial nem nome real.
3. **Given** os testes unitários dos adaptadores, **When** a suíte roda, **Then** passam sem edição de asserções existentes.

---

### Edge Cases

- Troca rápida de canal (várias trocas em sequência): só a última sessão fica viva; nenhuma instância da camada de demux vaza.
- Rede cai ou o painel responde 4xx/5xx/429 no meio do stream: cai no tratamento de erro existente (042), com o código já usado hoje.
- URL que não é MPEG-TS (ex.: `.mp4`, `.m3u8`): segue pelo caminho atual do `<video>`, sem mudança de comportamento.
- Ambiente de teste unitário (jsdom, sem MediaSource): a capacidade não quebra a suíte; o adaptador se comporta como hoje.
- Aba escondida/mostrada, offline/online: o ciclo de vida da feature 020/042 continua valendo.
- Falha ao carregar a biblioteca em dev: cai em `PLAY-04`, nunca em tela sem foco.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Antes de qualquer implementação além do spike, o projeto DEVE registrar o resultado do spike de decodificação com a lista real (quantos canais amostrados decodificaram vídeo e áudio e quais não), sem expor URL, credencial nem nome de canal.
- **FR-002**: Se o spike mostrar que a maioria dos canais amostrados não decodifica, a feature DEVE parar e registrar o motivo; as histórias 2–4 não DEVEM ser implementadas.
- **FR-003**: No ambiente de desenvolvimento, o sistema DEVE reproduzir um canal ao vivo cujo stream é MPEG-TS, sem configuração do desenvolvedor.
- **FR-004**: O sistema DEVE manter o contrato do player (`PlayerAdapter`/capacidades) inalterado: nenhuma tela DEVE saber qual motor está ativo.
- **FR-005**: Ao trocar de canal ou fechar o player, o sistema DEVE encerrar a sessão anterior por completo (sem áudio residual, sem conexão de rede aberta para o stream) antes de iniciar outra.
- **FR-006**: Quando o navegador não conseguir decodificar o stream (ou a camada de demux falhar), o sistema DEVE entregar a mesma falha de reprodução de hoje (`PLAY-04`), sem código novo na tabela de erros e sem erro bruto do motor.
- **FR-007**: O sistema NÃO DEVE incluir a biblioteca de demux no build de produção (`npm run build`) nem no pacote da TV (`npm run build:tizen`), e NÃO DEVE alterar a lista de arquivos emitidos.
- **FR-008**: Com o AVPlay presente (TV), o sistema DEVE continuar usando-o exclusivamente; a capacidade nova NÃO DEVE ser carregada nem executada ali.
- **FR-009**: URLs que não são MPEG-TS DEVEM seguir exatamente pelo caminho atual do adaptador de navegador.
- **FR-010**: A reprodução em dev NÃO DEVE registrar em log, nem exibir, a URL do stream ou credenciais, e a saída de qualquer script de prova DEVE conter apenas estados, tempos e contagens.
- **FR-011**: O `htmlVideoAdapter` DEVE continuar declarando que o navegador não prova compatibilidade de mídia da TV; nenhum texto, teste ou veredito de feature DEVE tratar a reprodução em dev como aceite de reprodução.
- **FR-012**: O `test:e2e` padrão DEVE incluir um cenário em que um stream MPEG-TS servido localmente chega a "tocando"; um script contra a lista real DEVE existir fora do `test:e2e`.
- **FR-013**: Os testes unitários e E2E existentes DEVEM continuar passando sem alteração de asserções.

### Key Entities *(include if feature involves data)*

Não envolve dados persistidos novos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O spike registra um resultado numérico (canais amostrados × decodificaram vídeo+áudio) com a lista real, e a decisão de seguir ou parar fica escrita.
- **SC-002**: Com a lista real, um canal MPEG-TS decodificável chega a "tocando" em até 15 s no navegador de desenvolvimento.
- **SC-003**: Em 10 trocas de canal seguidas, no máximo uma sessão de stream fica aberta ao final de cada troca (zero conexões residuais).
- **SC-004**: `npm run build` e `npm run build:tizen` emitem exatamente os mesmos arquivos de antes, e nenhum contém a biblioteca de demux.
- **SC-005**: O `test:e2e` padrão passa por completo, incluindo o novo cenário, em 3 execuções seguidas; as suítes existentes passam sem edição de asserções.

## Assumptions

- A lista do `.env` (`CCPLAY_PROBE_*`) continua disponível localmente e é a base do spike e do script real; nunca é impressa.
- O painel Xtream real libera CORS (`Access-Control-Allow-Origin: *`, medido em 2026-10-02 tanto na resposta 302 quanto na 200), o que permite a leitura do stream por JavaScript no dev.
- O Chromium do dev decodifica H.264/AAC; HEVC e AC3/EAC3 ficam fora (limite aceito, registrado no spike).
- A TV de referência (QN50Q60DAGXZD) segue como única porta de aceite de reprodução; esta feature não pede passada na TV.
- Zapping, chrome, guia e reconexão (features 016/027/031/042) já são independentes do motor; só dependem de o motor chegar a "tocando".

## Clarifications

### Sessão 2026-10-02

- Q: Como ativar a reprodução por demux no `npm run dev`? → A: Automática em dev, sem configuração; produção e Tizen nunca a usam.
- Q: O que mostrar quando o Chromium não decodificar o canal (HEVC/AC3)? → A: O mesmo `PLAY-04` de hoje, sem código novo na tabela de erros.
- Q: Como provar por E2E, sem pôr a lista real no `test:e2e` padrão? → A: Servidor local de `.ts` no `test:e2e` padrão + script com a lista real fora dele (como os `*-real.mjs`).
- Q: O spike de codec é parte da feature? → A: Sim, é a User Story 1 (P1), com porta de saída: se falhar, a feature para e registra o motivo.
