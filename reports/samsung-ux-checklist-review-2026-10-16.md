# Auditoria UX Samsung Smart TV — 2026-10-16

## Veredito

No escopo solicitado, o **SUX-01 está corrigido**. A pendência de assets do
Seller Office foi resolvida nesta revisão. Os demais achados permanecem apenas
como histórico da auditoria e foram descartados pelo usuário para este ciclo.

1. os assets de publicação agora existem em 1920 x 1080 e 512 x 423 px;
2. os demais achados abaixo não fazem parte deste ajuste.

Há também correções importantes no foco do player, no acionamento por ponteiro
dos controles e na explicação de alguns erros. O código apresenta uma base
boa de navegação por controle, foco e feedback; isso, porém, não substitui a
validação em TV física das teclas de mídia e canal.

## Escopo e método

- Escopo: `tv-web/` e o pacote Tizen `CCPlayTv/`; portal e API não foram
  revisados.
- Referência principal: [UX Checklist da Samsung](https://developer.samsung.com/smarttv/design/ux-checklist.html).
  As regras operacionais de entrada e player foram confrontadas também com
  [Input Methods](https://developer.samsung.com/smarttv/design/input-methods.html),
  [Media Player](https://developer.samsung.com/smarttv/design/media-player.html)
  e [Apps Screen](https://developer.samsung.com/smarttv/design/apps-screen.html).
- Base inspecionada: working tree em 2026-10-16, commit-base `2493a13`.
  Havia alterações locais pré-existentes e elas não foram modificadas.
- Evidência estática: leitura de configuração, componentes, CSS, mensagens e
  testes. Evidência executada: testes Vitest focados, abaixo.
- Não executado: inspeção visual no navegador local (a conexão de inspeção não
  ficou disponível), emulador Tizen e TV física. Portanto, nenhuma conclusão
  visual ou de hardware abaixo deve ser lida como homologação de dispositivo.

Comando executado com sucesso:

```text
npm.cmd run test -- src/lib/useRemoteNav.test.tsx src/lib/tizenMediaKeys.test.ts src/components/PlayerLayer.test.tsx src/components/RouteBoundary.test.tsx src/components/focoDeEstado.test.tsx src/components/Rail.test.tsx src/features/live/guide/EpgGuide.nav.test.tsx src/features/shell/ExitModal.test.tsx

8 arquivos, 136 testes aprovados
```

## Itens que precisam de ajuste

### SUX-01 — Ícone do aplicativo fora da dimensão exigida

- Severidade: **corrigido**
- Checklist: 1.1
- Evidência anterior: `CCPlayTv/config.xml:4` declara `icon.png`, que mede
  117 x 117 px. Esse é o ícone interno do pacote Tizen e não deve ser
  confundido com os assets cadastrados no Seller Office.
- Correção: foram criados `docs/guia-praticas-app-tv/assets/logo_1920x1080.png`,
  `fundo_1920x1080.jpg` e `icone_512x423.png`, derivados da identidade visual
  atual e dentro dos limites de dimensão, formato e tamanho da Samsung.
- O `CCPlayTv/icon.png`, o `config.xml` e o `tizen_web_project.yaml` foram
  preservados sem alteração.

**Ajuste requerido**

Enviar os três assets da pasta de publicação no Seller Office. Eles não fazem
parte do build Tizen e, por isso, não devem entrar no `tizen_web_project.yaml`.

**Aceite**

1. `logo_1920x1080.png` mede 1920 x 1080 px, é RGBA e tem menos de 300 KB.
2. `fundo_1920x1080.jpg` mede 1920 x 1080 px e tem menos de 300 KB.
3. `icone_512x423.png` mede 512 x 423 px, é RGB e tem menos de 300 KB.
4. As prévias são conferidas no Seller Office antes do envio final.

### SUX-02 — Rolagem sem barra nativa: decisão de produto aceita

- Severidade: **sem bloqueio por si só**
- Checklist: 1.2
- Decisão: manter `.no-scrollbar`. A recomendação Samsung exige um indicador
  quando o conteúdo excede uma página, mas não exige a barra nativa do navegador.
  O app pode comunicar continuidade com os fades de `useOverflowEdges.ts` e o
  indicador próprio de `Rail.tsx`, preservando o visual limpo de TV.
- Ação: nenhuma troca global para scrollbar nativa. Apenas conferir no roteiro
  visual que listas longas continuam percebendo que há mais conteúdo e que o
  foco não fica encoberto.

### SUX-03 — Foco do player diverge da orientação após seek por seta ou tecla física

- Severidade: **P1 — navegação do player**
- Checklist: 3.1, 3.3; *Media Player* relacionado
- Evidência: quando o chrome VOD está oculto, `usePlayerKeyboard.ts:185-194`
  faz o salto de 10 s com Esquerda/Direita e chama `revealFull()`. Essa função
  em `usePlayerChrome.ts:169-178` fixa o foco em Play/Pause, em vez de focar a
  barra de progresso, como a orientação Samsung pede após o seek com seta.
- Evidência: `MediaRewind` e `MediaFastForward` também chamam `revealFull()`
  (`usePlayerKeyboard.ts:362-369`) e, portanto, mostram o foco em Play/Pause,
  não nos controles \"voltar 10 s\" e \"avançar 10 s\" correspondentes. A ação
  de mídia ocorre; o problema é a confirmação visual e a continuidade do
  controle.

**Ajuste requerido**

Criar uma forma explícita de revelar o chrome com destino de foco:

- Esquerda/Direita com controles ocultos: saltar e focar a barra de progresso,
  quando houver `canSeek` e duração confiável;
- `MediaRewind`/`MediaFastForward`: saltar e focar respectivamente
  `jumpBack`/`jumpForward`;
- Play/Pause: revelar e focar Play/Pause;
- sem capacidade real: apenas revelar feedback apropriado, sem simular foco em
  uma ação indisponível.

**Aceite**

1. Os quatro caminhos acima têm testes de teclado com a classe `.tv-focus`
   esperada.
2. A tecla física mostra o chrome e o controle correspondente recebe foco.
3. Em conteúdo sem seek ou duração, não há barra de progresso nem foco nela.

### SUX-04 — Botões visuais do PlayerChrome não têm acionamento por clique/ponteiro

- Severidade: **P1 — interação complementar do player**
- Checklist: 3.2; *Media Player* relacionado
- Evidência: `PlayerChrome.tsx:169-180` renderiza controles como `<button>`,
  mas não fornece `onClick`, `onPointerUp` ou callback de ativação. O fluxo de
  D-pad funciona pelo handler global em `usePlayerKeyboard`, porém clicar em
  um botão do chrome não executa ação alguma.
- Impacto: a diretriz do player exige que os controles na tela sejam acessíveis
  também por interação de apontamento; isso também dificulta QA desktop.

**Ajuste requerido**

Extrair a ativação do controle para uma única função compartilhada por D-pad e
clique. `PlayerChrome` deve receber um callback por controle e preservar o
mesmo tratamento de capacidades, ações \"Em breve\", toast e foco.

**Aceite**

1. Clique/tap em cada controle real chama exatamente a mesma ação que SELECT.
2. Controle indisponível não inicia reprodução nem operação indevida e explica
   a indisponibilidade.
3. Testes cobrem Play/Pause, ±10 s, painéis e uma ação indisponível.

### SUX-05 — Alguns erros não informam causa e como resolver

- Severidade: **P1 — feedback de erro**
- Checklist: 4.6
- Evidência: `ErrorState` permite `description` opcional
  (`tv-web/src/components/ErrorState.tsx:19`). Na falha do guia EPG,
  `EpgGuide.tsx:538-542` exibe apenas \"Não foi possível carregar os canais
  desta lista\" e \"Tentar novamente\". Na Rádio, `radioColumns.tsx:95-102`
  apresenta uma falha genérica/offline e os botões, sem texto de recuperação
  contextual. Há outras rotas boas como contraponto: `RouteBoundary` fornece
  instrução explícita e Live superior explica verificar a conexão.
- Impacto: \"tentar novamente\" não basta para os casos em que o catálogo está
  localmente ausente, a conexão caiu ou a lista exige ressincronização.

**Ajuste requerido**

Tornar a descrição de recuperação obrigatória para estados de erro que chegam
à pessoa usuária, sem expor URL, credencial ou texto bruto do provedor. Mapear
códigos seguros para causa + próximo passo. Exemplos: verificar conexão e
tentar novamente; ressincronizar a lista; voltar e escolher outra lista.

**Aceite**

1. Todo `ErrorState` de produção contém causa compreensível e instrução/ação
   viável.
2. As mensagens são traduzidas em pt/en/es e não vazam dados sensíveis.
3. EPG offline, erro de carga da Rádio e categoria não disponível têm testes
   de texto e SELECT/RETURN.

### SUX-06 — Teclas físicas: implementação estática, homologação pendente

- Severidade: **P0 — gate de liberação, não um defeito de código já reproduzido**
- Checklist: 2.1, 2.3 e 3.3
- Evidência positiva: o manifesto contém
  `http://tizen.org/privilege/tv.inputdevice`; `App.tsx:77-81` registra as
  teclas uma vez; `tizenMediaKeys.ts:16-42` mapeia Play/Pause, Play, Pause,
  Stop, Rewind, FastForward e CH+/CH−. Os testes focados aprovados verificam
  o mapeamento no DOM.
- Limite: `tizenMediaKeys.ts:29-32` declara expressamente que os códigos devem
  ser confirmados na TV física. Não houve esse ensaio nesta auditoria. Em
  especial, CH+/CH− já possuía histórico de pendência de dispositivo.

**Ajuste requerido**

Não alterar o fluxo com base apenas no navegador. Instalar sem desinstalar a
aplicação e registrar, em TV Samsung real, a matriz abaixo. Corrigir somente
o caminho que falhar (registro de chave, evento recebido, foco ou ação).

| Contexto | Teclas a confirmar | Resultado esperado |
|---|---|---|
| VOD tocando/pausado | Play/Pause, Play, Pause, Rewind, FastForward, Stop | Ação correta, chrome visível e foco coerente com SUX-03; Stop fecha o player. |
| Live em tela cheia | CH+, CH−, Play/Pause e Stop | Zapping só no Live; aviso no limite; nenhuma ação inesperada fora desse contexto. |
| Catálogo, modal e formulário | Setas, SELECT e RETURN | Um único foco, SELECT ativa o alvo, RETURN fecha modal ou volta pela hierarquia. |
| Raiz (Perfis/Início) | RETURN | Modal de saída com Cancelar em foco; RETURN cancela o modal. |

**Aceite**

O roteiro é registrado com modelo/versão Tizen e resultado por tecla. Build e
instalação não contam como confirmação de comportamento físico.

## Matriz resumida do checklist

`Estático` significa que o código suporta o item; não significa validação em
TV ou aprovação Samsung. `Manual` requer roteiro visual/dispositivo.

| Item | Situação | Base da conclusão |
|---|---|---|
| 1.1 Ícone 1920 x 1080 | **Corrigido nos assets de publicação** | SUX-01 |
| 1.2 Indicador de rolagem | **Aceito — indicador customizado** | SUX-02; validar continuidade visual |
| 1.3 Alvos ao redor de listas | Manual | conferir em Live, EPG, VOD, busca e modais |
| 1.4 Grade, não diagonal | Estático parcial | navegação por zonas/índices e grids; exige roteiro de todas as transições |
| 1.5 Poucos estilos tipográficos | Estático | duas famílias locais principais: Poppins e Inter |
| 1.6 Padrões coerentes de TV | Estático parcial | Stage, topbar, HintBar, `useRemoteNav` e V14; falta inspeção visual |
| 1.7 Carga visual reduzida | Manual | precisa revisão das telas com catálogo real a distância de TV |
| 1.8 Agrupamento de informação | Estático parcial | categorias/rails/painéis são agrupados; requer inspeção de densidade |
| 1.9 Metáfora clara | Estático | botões, hints, estados vazios e soft-disabled explicam ações |
| 1.10 Sem movimento excessivo | Estático | tokens de 140 ms e preferência de reduzir movimento |
| 2.1 Ações do controle | Manual de hardware | SUX-06; fluxo de saída existe em `ExitModal` |
| 2.2 Navegação pelos quatro direcionais | Estático | `useRemoteNav` e testes focados aprovados |
| 2.3 Botões de reprodução físicos | Manual de hardware | SUX-06 |
| 3.1 Controles em tela | Estático | `PlayerChrome` e `PlayerLayer` os compõem por capacidade |
| 3.2 D-pad/SELECT no player | Ajustar parcialmente | D-pad existe; falta apontamento (SUX-04) |
| 3.3 Teclas físicas no player | Ajustar + manual | foco divergente (SUX-03) e ensaio em TV (SUX-06) |
| 4.1 Feedback claro | Estático parcial | spinner, toast, loading e estado do player; revisar visualmente |
| 4.2 Um foco por vez | Estático | contratos focados verificam um `.tv-focus` nos fluxos cobertos |
| 4.3 Foco reconhecível | Estático | outline 4 px, offset, halo, glow e escala em `index.css` |
| 4.4 Padrão de foco consistente | Estático | receita global `.tv-focus`/`:focus` |
| 4.5 Progresso durante tarefa | Estático parcial | `Spinner`, estados de carga e importação; validar duração real em TV |
| 4.6 Causa e solução do erro | **Ajustar (P1)** | SUX-05 |

## Itens fora do escopo — descartados

SUX-02 a SUX-06 não serão implementados neste ciclo, conforme decisão do
usuário. A validação de upload e prévia dos assets ainda deve ser feita no
Seller Office.

## Pontos positivos preservados

- O foco é centralizado e visualmente forte (`.tv-focus`), com testes para
  cenários de foco único, modal, retorno, EPG, player e rails.
- A rota de carregamento tem Spinner, texto e um botão Voltar focável;
  estados vazios e de erro preservam uma ação focável.
- O player deriva controles das capacidades reais: conteúdo Live sem DVR não
  recebe barra de seek fictícia.
- A saída na base da navegação usa modal explícito, com Cancelar inicialmente
  focado, em linha com a recomendação Samsung de confirmar o encerramento.

Esses pontos devem ser preservados ao implementar os ajustes acima.
