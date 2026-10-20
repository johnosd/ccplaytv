# Feature Specification: Orçamento de armazenamento do app na TV

**Slug**: `082-orcamento-armazenamento-tv`

**Created**: 2026-10-17 (reescrita em 2026-10-18 com as medições das sondas na TV)

**Status**: Implementada

**Input**: "Estamos frequentemente passando do limite de 80 MB de espaço do app, o que gera erros de quota. Precisamos
aumentar esse tamanho ou ver outras soluções." Avaliação `go` em
`sdd/assessments/cota-armazenamento-app-na-tv-estourando/decision.md`.

Em 2026-10-18 duas sondas foram instaladas na TV física. Os resultados estão em `evidencias/medicao-cota-tv-2026-10-18.md`
e `evidencias/sonda2-capacidades-tv-2026-10-18.md`. Elas mostraram:

- **A cota é fixa em 80 MiB.** Nenhuma alavanca a aumenta: `unlimitedstorage`, `persist()`, `requestQuota` e estourar a
  cota foram testados.
- **OPFS, Cache Storage e Web SQL dividem a mesma cota.**
- **A TV não comprime o que grava.** Na lista real, o catálogo e o guia ocupam ~44 MB como o app grava hoje. A maior
  parte é a 2ª cópia das categorias grandes, a projeção da feature 065, com 18,7 MB só em filmes.
- **Comprimidos em pedaços, o catálogo e o guia caem para ~3,3 MB.** A 1ª página de uma categoria grande abre em 13,8 ms,
  contra 178 ms hoje.
- **O híbrido (pasta de arquivos) foi descartado**: a leitura ficou ~3× mais lenta.

O usuário pediu um plano para "ter mais espaço, comprimindo e quebrando em pedaços".

## Escopo

### Incluído

- **Formato comprimido em pedaços para o catálogo.**
  - Os itens de cada categoria (canais, filmes, séries) passam a ser gravados em **pedaços de 500 itens**, com JSON
    enxuto comprimido em gzip.
  - Esse formato **substitui** a projeção de leitura da 065: os pedaços passam a ser a única cópia, e a leitura em janela
    lê pedaço a pedaço.
- **Formato comprimido para o guia**: os programas passam a ser gravados **por canal**, comprimidos, no lugar de uma
  linha por programa.
- **Compressão fora da tela**: codificar acontece no Worker que já baixa e grava (seção, importação, guia). Na thread da
  interface, só se codifica pedaço a pedaço, cedendo a vez entre os pedaços. Nada trava a navegação.
- **Conversão em segundo plano** do que já está gravado nas TVs (blocos, projeções e linhas de guia), sem perder dados e
  funcionando offline.
- **Orçamento de armazenamento**: uma reserva para o estado da pessoa e as gravações críticas, um teto para o catálogo e o
  guia, e uma conta própria de bytes gravados. A liberação começa pelo que pode ser refeito e foi usado há mais tempo.
  Com a compressão, deve agir raramente, mas garante que nada da pessoa falhe.
- **Listas inativas** mantêm os dados enquanto couberem; quando falta espaço, sai primeiro a lista usada há mais tempo.
- **Lista de provedor maior que o teto**: funciona sem erro, sob demanda, liberando as categorias menos usadas da
  própria lista.
- **Teto de memória nos leitores que esta feature toca**: o cache de itens descomprimidos tem limite. Na TV o heap tem
  364 MB, e o app foi fechado perto de 4,4 milhões de objetos.
- **As sondas como ferramenta permanente de medição**:
  - `sonda-tv/`: app de teste separado, coletor no PC e medição da lista real no PC;
  - **simulação no PC** com a cota forçada em 80 MiB, como gate antes da TV.
- **Registro da decisão do híbrido**: descartado, com os números.

### Fora de Escopo

- **Híbrido** (pasta de arquivos `wgt-private`): descartado pelo critério 3 do portão. A leitura do arquivo foi ~3× mais
  lenta e a gravação foi de 0,8 MB/s.
- Aumentar a cota por configuração ou privilégio: as sondas provaram que não há como.
- **M3U**: as categorias `stored`/`eager` **nunca** são liberadas (decisão de 2026-10-17), e o `storedEntries` (o
  conteúdo M3U guardado) continua como está. Os blocos que o gravador comum escreve (`writeBlockWithin`) passam para o
  formato comprimido para **todas** as listas, M3U incluído, porque só existe um gravador (ver Clarifications).
- Tela de gerenciar armazenamento, botão de liberar espaço e tela de detalhamento por parte.
- Apagar estado da pessoa: favoritos, histórico, progresso, preferências e ocultação de categorias, PIN, listas,
  pareamento, licença ou período de teste.
- Backend ou proxy para guardar catálogo fora da TV (ADR-008).
- **Achados das sondas fora do armazenamento** viram ideias futuras no backlog, com os números:
  - o foco com brilho cai para 38 fps;
  - limites de memória gerais;
  - a leitura de rede em fluxo é 55 % mais lenta.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Muito mais catálogo no mesmo espaço (Priority: P1) 🎯

A lista grande inteira (canais, filmes, séries e guia) fica no aparelho ocupando uma fração da cota. Hoje são ~44 MB na
conta por JSON, e na TV mais que isso. Depois serão poucos MB. Sobra espaço para outras listas, e o problema de "espaço
cheio" deixa de aparecer no uso normal.

**Why this priority**: é a causa do problema. A compressão medida reduz o catálogo real em ~13×.

**Independent Test**: na simulação do PC (cota de 80 MiB) e na TV, importar a lista real, deixar a pré-carga e o guia
terminarem, e conferir o uso em Sobre & créditos e a conta própria.

**Acceptance Scenarios**:

1. **Given** a lista real de referência ativa, com pré-carga completa e guia sincronizado, **When** o uso é medido na
   TV, **Then** fica em **até 25 % da cota** (≤ 20 MiB).
2. **Given** uma categoria gravada no formato novo, **When** é lida inteira pela lista ou em janela, **Then** os itens,
   a ordem, os ids e os campos são os mesmos do formato atual.
3. **Given** o guia sincronizado no formato novo, **When** o guia e a linha "agora/a seguir" são abertos, **Then**
   mostram os mesmos programas de antes, e o catch-up do passado continua disponível.

---

### User Story 2 - Abrir e navegar mais rápido, sem travar (Priority: P1)

Quem entra numa categoria grande vê a primeira página mais rápido que hoje: o 1º pedaço abre em ~14 ms, contra 178 ms do
bloco inteiro. Enquanto o app comprime ou converte em segundo plano, o foco continua respondendo e a imagem não
congela.

**Why this priority**: a compressão não pode trocar espaço por travamento. A sonda mostrou 250 ms de quadro congelado
quando se comprime na thread da interface.

**Independent Test**: na TV, com o painel de medição, medir a entrada em categorias grandes e os quadros durante a
pré-carga e a conversão.

**Acceptance Scenarios**:

1. **Given** uma categoria de milhares de itens já no aparelho, **When** a pessoa entra nela, **Then** a primeira
   página aparece em tempo **menor ou igual ao de hoje** (mediana na TV).
2. **Given** a pré-carga ou a conversão em andamento, **When** a pessoa navega, **Then** nenhum quadro passa de
   **100 ms** por causa da compressão, e o foco responde a cada tecla.
3. **Given** "Todos" ou uma busca, que leem a categoria inteira, **When** são abertos, **Then** continuam funcionando,
   lendo pedaço a pedaço, sem segurar todos os itens descomprimidos de uma vez além do teto de memória.

---

### User Story 3 - O que é da pessoa sempre grava (Priority: P1)

Favoritar, gravar progresso, receber a licença no Atualizar e desvincular sempre gravam. O catálogo nunca ocupa a reserva.

**Why this priority**: a licença paga não chegou à TV por falta de espaço (081, R-014).

**Independent Test**: com o catálogo no teto (simulação no PC), favoritar, gravar progresso e gravar a licença: tudo grava
na 1ª tentativa.

**Acceptance Scenarios**:

1. **Given** catálogo e guia no teto, **When** a pessoa favorita, **Then** grava na 1ª tentativa.
2. **Given** a pré-carga rodando, **When** o catálogo alcança o teto, **Then** a pré-carga para ou libera
   temporários e listas inativas, e a reserva continua livre.
3. **Given** a reserva livre, **When** o Atualizar recebe a licença, **Then** a licença grava sem mensagem de armazenamento.

---

### User Story 4 - Várias listas convivem (Priority: P2)

A lista que a pessoa deixou continua com os dados enquanto houver espaço, e voltar a ela é imediato. Com a compressão,
cabem várias listas grandes. Quando falta espaço, sai primeiro a lista usada há mais tempo. Reativar mostra as
categorias na hora e a pré-carga refaz o resto.

**Why this priority**: cada lista é um perfil (ADR-011).

**Independent Test**: com 3 listas e o teto reduzido na simulação, ativar uma de cada vez até passar do teto.

**Acceptance Scenarios**:

1. **Given** 3 listas e espaço sobrando, **When** a pessoa troca e volta, **Then** a lista anterior abre sem nova obtenção.
2. **Given** o teto atingido, **When** uma lista precisa de espaço, **Then** saem primeiro os itens e o guia da lista
   inativa usada há mais tempo, antes de qualquer categoria da ativa.
3. **Given** uma lista com os itens liberados, **When** é reativada, **Then** as categorias aparecem na hora, a
   categoria em que a pessoa entra carrega sob demanda, e a pré-carga refaz o resto.

---

### User Story 5 - Lista maior que o espaço funciona sem erro (Priority: P2)

Uma lista de provedor enorme, maior que o teto mesmo comprimida (por exemplo 300 mil filmes), funciona como em outros
apps de IPTV. As categorias carregam ao entrar, e as menos usadas da própria lista saem.

**Why this priority**: com a compressão, isso fica raro, mas não pode virar erro.

**Independent Test**: lista sintética maior que o teto (painel falso do E2E), com o teto reduzido na simulação, navegando
por 50 categorias.

**Acceptance Scenarios**:

1. **Given** uma lista maior que o teto, **When** a pessoa entra numa categoria ainda não obtida no teto, **Then** saem
   categorias da mesma lista usadas há mais tempo, e a categoria abre sem erro.
2. **Given** uma categoria liberada, **When** a pessoa volta a ela, **Then** ela é obtida de novo com os **mesmos ids**.
   Favoritos, progresso e foco continuam ligados à identidade estável.
3. **Given** a pré-carga parada no teto, **When** o Início é exibido, **Then** mostra uma linha não alarmante de cobertura
   parcial, nunca STO-01, e nenhum progresso afirma que a lista está completa.

---

### User Story 6 - Medir na TV em vez de supor (Priority: P3)

O responsável pelo app tem uma ferramenta para medir a TV de verdade:
- um app de teste separado, que não toca o CCPlayTV;
- um coletor no PC;
- a medição da lista real no PC;
- a simulação da cota de 80 MiB no PC, como passo antes da TV.

A decisão do híbrido fica registrada com os números.

**Why this priority**: as sondas mudaram o plano inteiro, e o usuário quer medir antes de supor.

**Independent Test**: rodar a sonda de novo e conferir que o relatório chega ao PC só com números. Rodar a simulação e
ver o `QuotaExceededError` em ~80 MiB.

**Acceptance Scenarios**:

1. **Given** a TV na rede e a autorização do usuário, **When** a sonda é instalada, **Then** o relatório chega ao PC
   sem credencial, URL de provedor ou nome de item, e o app de teste é desinstalado no fim.
2. **Given** a simulação no PC, **When** o catálogo passa do teto, **Then** o comportamento (erro, liberação) é o mesmo
   da TV, e o roteiro E2E do orçamento roda nela.

### Edge Cases

- **A TV não informa uso/cota**: vale a cota de 80 MiB da TV de referência como teto conservador, mais a conta
  própria.
- **`clear()` não devolve espaço na hora** (medido na TV): a decisão usa a conta própria de bytes gravados, nunca só o
  `estimate()`. Liberar por lista inteira, quando possível, apaga por faixa de chave.
- **Folga de início de sessão** (medida): logo depois de abrir, uma gravação passa acima da cota. O orçamento não conta
  com ela.
- **Conversão interrompida** (TV desligada no meio): retoma sem duplicar nem perder. Uma categoria fica ou toda no
  formato antigo ou toda no novo, nunca misturada.
- **Dado antigo e TV offline**: tudo continua legível até converter.
- **Uma categoria sozinha maior que o teto**: abre, liberando as outras da lista. A reserva da pessoa nunca é usada.
- **Liberar a categoria aberta ou a do player**: nunca. Ela fica protegida por uso recente e pela reprodução.
- **Favorito ou "Continuar assistindo" de uma categoria liberada**: o card não pode sumir do Início da lista ativa. As
  categorias com favoritos ou com itens em "Continuar assistindo" ficam protegidas.
- **Categoria oculta ou bloqueada (066)**: não gasta pré-carga. Os filtros de leitura continuam iguais.
- **Memória**: "Todos" e a busca leem pedaço a pedaço, e o cache de itens descomprimidos tem teto. Nunca se monta o
  catálogo inteiro descomprimido em memória.
- **Guia**: o catch-up do passado continua (a janela −12 h/+48 h não muda). O guia de uma lista inativa liberada passa a
  "ainda não sincronizado".

## Requirements *(mandatory)*

### Functional Requirements

**Formato comprimido (US1, US2)**

- **FR-001**: Os itens de uma categoria DEVEM ser gravados em pedaços de 500 itens, com JSON enxuto comprimido em gzip:
  - sem `group`/`providerCategoryId` repetidos, que ficam uma vez por categoria;
  - sem `originalName` quando é igual a `name`;
  - sem chaves vazias.
  Ler DEVE devolver exatamente os mesmos registros, ids e ordem de hoje.
- **FR-002**: A leitura em janela DEVE ler só os pedaços que cobrem a janela pedida, sem descomprimir a categoria
  inteira. Esse formato substitui a projeção de leitura da 065, que deixa de existir.
- **FR-003**: Os programas do guia DEVEM ser gravados comprimidos por canal, com a mesma janela de tempo e os mesmos
  campos que as telas e o catch-up usam.
- **FR-004**: Codificar DEVE acontecer no Worker quando a gravação já nasce num Worker (seção, importação, guia). Na
  thread da interface, codificar é pedaço a pedaço, cedendo a vez entre pedaços. Nenhuma descompressão ou compressão
  roda dentro de uma transação aberta do banco.
- **FR-005**: O cache de itens descomprimidos DEVE ter teto de itens e de memória. Leitores de "Todos", busca e
  derivados DEVEM ler pedaço a pedaço, sem manter tudo descomprimido.
- **FR-006**: Os dados no formato antigo DEVEM continuar legíveis, inclusive offline, até serem convertidos:
  - blocos com `items`;
  - projeções da 065;
  - linhas de `epgPrograms`.

  A conversão DEVE rodar aos poucos em segundo plano, retomar depois de uma interrupção, não travar a navegação e
  apagar a cópia antiga só depois de gravar a nova.
- **FR-007**: Nenhuma mudança de formato pode alterar ids, `itemsSignature`, identidade estável ou a URL resolvida para
  reproduzir.

**Orçamento (US3, US4, US5)**

- **FR-008**: O app DEVE manter uma **reserva** para o estado da pessoa e as gravações críticas: licença, relógio da
  licença, pareamento, credenciais do portal e desvincular.
- **FR-009**: O catálogo e o guia DEVEM respeitar um **teto** (cota − reserva), medido por uma **conta própria de bytes
  gravados**. O `estimate()` serve só de guarda, e com a conta dentro do teto libera no máximo 1 candidato por vez.
- **FR-010**: Ao atingir o teto, a liberação DEVE vir **antes** de gravar, nesta ordem:
  1. temporários;
  2. listas inativas, da usada há mais tempo para a mais recente;
  3. categorias da lista ativa, da usada há mais tempo para a mais recente, **só na entrada da pessoa**. A pré-carga e o
     guia nunca liberam categorias da lista ativa.
- **FR-011**: Nunca DEVEM ser liberados:
  - a categoria em uso (janela de uso recente);
  - a categoria do item tocando;
  - as categorias da lista ativa com favoritos ou com itens em "Continuar assistindo";
  - as categorias `eager`/`stored` (M3U).
- **FR-012**: A liberação NUNCA DEVE apagar estado da pessoa. Uma categoria liberada volta a "não obtida" (cobertura
  parcial, ADR-002) e, ao ser obtida de novo, mantém os mesmos ids.
- **FR-013**: Ao trocar de lista, os dados da anterior DEVEM ficar enquanto couberem. Reativar mostra as categorias na
  hora, obtém a categoria aberta sob demanda e refaz o resto pela pré-carga.
- **FR-014**: Parar no teto DEVE aparecer como cobertura parcial, numa linha não alarmante no Início. STO-01 fica só
  para a reserva esgotada.

**Medição (US6)**

- **FR-015**: A ferramenta de sondas DEVE:
  - instalar só um app separado do CCPlayTV, com outro id e outra pasta de dados;
  - instalar **só com aviso e autorização do usuário antes**;
  - mandar ao PC só números, nomes de API e nomes de erro;
  - usar só amostras sanitizadas (sem host do provedor, credencial ou URL de stream);
  - desinstalar o app de teste ao final.
- **FR-016**: DEVE existir uma simulação no PC (Chromium com a cota forçada em 80 MiB) usada como gate antes de cada
  validação do orçamento na TV.
- **FR-017**: Nenhum código das sondas DEVE entrar no app nem no pacote da loja, e o `config.xml` do CCPlayTV não ganha
  privilégio.

### Key Entities

- **Pedaço de categoria**: até 500 itens comprimidos, com a posição inicial e a contagem. Ele pertence a uma categoria
  e a uma geração.
- **Cabeçalho da categoria**: os campos comuns (`group`, `providerCategoryId`) e o índice de identidade (ids e chaves de
  identidade, para reaproveitar ids na renovação), mais os bytes gravados. Nada disso é descomprimido.
- **Pedaço de guia**: os programas de um canal na janela, comprimidos.
- **Orçamento**: a cota (80 MiB fixos na TV de referência), a reserva, o teto e a conta de bytes.
- **Uso recente**: quando uma lista ou uma categoria foi usada pela última vez.
- **Medição/sonda**: os relatórios com números, sem dados do usuário.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Lista real ativa, com pré-carga e guia completos: uso na TV **≤ 25 % da cota** (≤ 20 MiB). Antes, ficava
  em 100 % ou mais.
- **SC-002**: Entrar numa categoria grande já obtida: a 1ª página aparece em tempo **≤ o de hoje** (mediana na TV; a sonda
  indica ~14 ms contra 178 ms).
- **SC-003**: Durante a pré-carga ou a conversão, **nenhum quadro > 100 ms** causado por compressão (painel de medição na
  TV).
- **SC-004**: Roteiro na TV com 3 listas (trocar, entrar em muitas categorias, séries, favoritar, assistir, Atualizar da
  licença): **zero erros de armazenamento**, sem acionar a liberação de emergência.
- **SC-005**: Lista sintética maior que o teto (simulação no PC): 50 categorias navegadas **sem erro**, cada uma com
  seus itens.
- **SC-006**: Dados antigos convertidos: as contagens por categoria e por canal do guia antes e depois são iguais, e o app
  abre offline durante a conversão.
- **SC-007**: A gravação do guia da lista real fica **muito mais rápida** que hoje. Na sonda, 20 mil linhas levaram 14,5
  s. A meta é ≤ 3 s na TV para o guia inteiro.

## Assumptions

- Cota de 80 MiB fixos na TV de referência (sondas de 2026-10-18). Outras TVs podem ter outro valor: o teto usa a cota
  informada, e na falta dela os 80 MiB.
- A lista real de referência vem das credenciais `CCPLAY_PROBE_*` do `.env` da raiz, nunca expostas: ~55 mil itens e um
  guia de ~41 mil programas.
- `CompressionStream`/`DecompressionStream` existem na TV, inclusive no Worker (sonda 2), e no Node 22 dos testes.
- Os ajustes do bugfix `armazenamento-app-cheio-na-tv-impede` continuam valendo e são absorvidos: a folga da pré-carga,
  `withStorageRelief` com a emergência como último recurso, `storage_full` e a linha em Sobre & créditos.
- O emulador Tizen continua bloqueado. A TV física é o gate dos números de espaço e velocidade, sempre com autorização.

## Clarifications

### Sessão 2026-10-17

- Q: O que acontece com os dados de uma lista quando ela deixa de ser a ativa? → A: Ficam enquanto couberem; quando falta
  espaço, sai primeiro a lista usada há mais tempo (FR-010, FR-013).
- Q: Ao ativar uma lista cujos itens foram liberados, como ela volta? → A: Pré-carga mais sob demanda, como hoje
  (FR-013).
- Q: Onde mostrar quanto cada parte ocupa? → A: Sobre & créditos continua com a linha atual. O detalhamento por parte
  fica só na medição (FR-015).
- Q: A janela do guia (−12 h a +48 h) pode encolher? → A: Só se a medição mandar. Com a compressão, não é preciso
  (FR-003).
- Q: E se a lista ativa sozinha não couber? → A: "A maioria dos apps de IPTV consegue lidar sem dar erro" (US5,
  FR-010).
- Q: Como tratar o que já está gravado quando o formato mudar? → A: Converter em segundo plano (FR-006).
- Q: Os limites do portão do híbrido? → A: 60 % e 5×, e a leitura não pode ser mais lenta que hoje.
- Q: Quando rodar o teste do híbrido? → A: Logo no início, junto da medição.
- Usuário: "Me avise antes de instalar na TV" → FR-015.
- Q (sdd-plan): Lista M3U maior que o espaço? → A: Deixar o M3U fora (as categorias `stored`/`eager` nunca são liberadas;
  o `storedEntries` não muda).
- Q (sdd-plan): Onde fica o uso por parte? → A: Só na medição, sem tela nova.

### Sessão 2026-10-18 (depois das sondas na TV)

- Medido: a cota é de 80 MiB fixos, e nada a aumenta. A TV não comprime o que grava. O gzip em pedaços reduz o catálogo
  real ~13×, e o 1º pedaço abre 13× mais rápido. O híbrido é ~3× mais lento e foi **descartado** pelo critério 3.
- Usuário: "faça um plano em que a gente consiga ter mais espaço, de repente comprimindo e quebrando em pedaços".
- Usuário: "a sonda poderia extrapolar não só a parte de armazenamento, mas de memória e tudo" → a sonda 2 (US6) e os
  achados registrados.
- Q: O que entra na compressão? → A: O catálogo **e** o guia (FR-001, FR-003).
- Q: E a projeção da 065 (18,7 MB só em filmes)? → A: É **substituída** pelos pedaços (FR-002).
- Q: E os achados fora do armazenamento (foco a 38 fps, memória, rede em fluxo)? → A: Viram **ideias futuras** no
  backlog. A 082 só põe teto de memória nos leitores que toca (FR-005).
- Q: Os blocos M3U também ficam comprimidos (existe um gravador só)? → A: **Sim**, confirmado pelo usuário (pendência B-04).
  A regra de "M3U fora" continua valendo para a liberação e para o `storedEntries`.
- Medido na TV (pendência B-05): o guia real comprimido por canal no Worker é gravado em 1,01 s, contra 10,2 s hoje.
  SC-007 (≤ 3 s) se confirma. Transações grandes podem ser abortadas por tempo na TV (R-013), e por isso a gravação é em
  lotes pequenos.
