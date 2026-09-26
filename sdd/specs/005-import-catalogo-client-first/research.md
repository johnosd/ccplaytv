# Research — 005-import-catalogo-client-first

Incertezas técnicas resolvidas antes de escrever tasks. Cada item traz a
decisão, o porquê e o que foi descartado.

## R1 — Camada de IndexedDB: Dexie

**Decisão**: adotar `dexie` como camada de acesso ao IndexedDB, sempre
atrás dos repositórios (D-001).

**Justificativa**: a feature depende de duas operações que o IndexedDB
cru torna verbosas e fáceis de errar — gravação em lote dentro de uma
transação (FR-004) e leitura por faixa de índice (FR-005). Dexie oferece
as duas de forma direta, além de versionamento de schema, que vamos
precisar quando VOD/séries entrarem. A ADR-006 §4.2 já a lista como
**recomendada** para persistência na TV; esta feature apenas a exerce.

**Alternativas consideradas**:
- **IndexedDB nativo, sem biblioteca**: rejeitado pelo custo de escrever
  e testar manualmente controle de transação, cursores e migrações — o
  mesmo motivo que a ADR-006 §7 registra ("não é a primeira escolha por
  esforço repetitivo"). Mantemos a porta aberta: como tudo passa pelos
  repositórios, trocar a camada não alcança nenhuma tela.
- **localStorage**: rejeitado por ser síncrono (bloqueia a thread de
  interface, colidindo com SC-005), limitado a texto e com cota muito
  menor.

**Pendência honesta**: Dexie funcionar em Chromium 108 é esperado (ela
usa só IndexedDB padrão), mas **não verificado neste aparelho**. A
primeira gravação real na TV, na US1, é o que confirma.

## R2 — Parser M3U: implementação própria, não biblioteca

**Decisão**: implementar o parser em TypeScript neste repositório, em
`tv-web/src/lib/catalog/m3uParser.ts`, espelhando o comportamento de
`api/app/services/m3u_parser.py`.

**Justificativa**: o backend usa `ipytv`, uma biblioteca Python sem
equivalente adotado em JavaScript. Portar não é traduzir chamadas — é
reescrever o comportamento. E o formato relevante aqui é pequeno: linhas
`#EXTINF:<dur> <atributos>,<nome>` seguidas da URL, mais a detecção de
manifesto HLS que já existe como expressão regular pronta e portável.
Trazer uma dependência de terceiro para isso adicionaria superfície de
compatibilidade com Chromium 108 sem remover trabalho real.

**Alternativas consideradas**:
- **Adotar uma biblioteca npm de M3U/HLS**: rejeitado porque as
  disponíveis miram manifestos HLS (o oposto do que queremos: precisamos
  **rejeitar** manifesto e aceitar catálogo), e porque o parser precisa
  operar em fluxo (R3), o que a maioria não expõe.

**Casos de borda que viram teste obrigatório** (derivados do que o
parser atual e seus testes já tratam):
- Conteúdo que não começa com `#EXTM3U` → recusa explícita.
- Manifesto HLS de verdade (`#EXT-X-TARGETDURATION`, `#EXT-X-STREAM-INF`
  etc.) → recusa como manifesto, **sem** confundir com
  `#EXT-X-SESSION-DATA`, que painéis Xtream injetam em catálogos comuns
  e que **não** deve reprovar a lista.
- Entrada sem URL → contabilizada como inválida, não gravada.
- Atributo com vírgula e aspas dentro do valor → nome extraído correto.
- Lista sintaticamente válida e sem nenhuma entrada → recusa própria,
  distinta de "conteúdo inválido".
- BOM no início do arquivo.

## R3 — Leitura do conteúdo: em fluxo, não em texto único

**Decisão**: consumir a resposta HTTP como fluxo
(`Response.body` → decodificação incremental → recorte por linha),
interpretando e descartando à medida que avança. O texto completo da
lista **nunca** existe como uma única string, e o conjunto completo de
entradas nunca existe como um único array.

**Justificativa**: é a diferença entre um pico de memória proporcional ao
arquivo inteiro (dezenas de MB de texto, mais centenas de milhares de
objetos) e um consumo aproximadamente constante. Numa TV, isso é o que
separa "funciona" de "o app fecha sozinho". A ADR-002 §2 já orientava
nessa direção ("evitar um JSON integral excessivamente grande em
memória"); aqui isso deixa de ser diretriz e vira o mecanismo central.

**Alternativas consideradas**:
- **`await response.text()` e interpretar tudo de uma vez**: rejeitado —
  é exatamente o pico que R-001 teme, e torna FR-004 impossível de
  cumprir de verdade.
- **Baixar para armazenamento e reler**: rejeitado por dobrar a escrita
  em disco sem remover o problema de interpretação.

**Pendência honesta**: as APIs de fluxo e decodificação incremental
existem em Chromium 108 pela documentação da plataforma, mas, como toda
API de runtime neste projeto, **só valem depois de vistas funcionando no
aparelho** — o `vite.config.ts` já avisa que transpilar sintaxe não
adiciona API. A US1 confirma.

## R4 — Onde o trabalho pesado roda: Worker, com invólucro trocável

**Decisão**: rodar interpretação e classificação num Web Worker, mantendo
parser e classificador como funções puras exportadas separadamente. O
Worker é um invólucro fino.

**Justificativa**: SC-005 exige que o controle remoto continue
respondendo durante um import que pode levar até 2 minutos. Na thread de
interface, um laço sobre centenas de milhares de entradas bloqueia o
desenho e o tratamento de tecla — o que, na prática, é o "beco sem saída"
que a constitution proíbe. Manter a lógica pura e fora do Worker garante
que ela seja testável em `vitest`/jsdom, onde não há Worker real.

**Alternativas consideradas**:
- **Fatiar o trabalho na thread principal** (processar N entradas por
  quadro, cedendo o controle entre lotes): rejeitado como escolha
  primária por tornar o tempo total significativamente pior e a
  responsividade dependente de ajuste fino. Continua sendo o **plano B**
  se o empacotamento do Worker se mostrar inviável no pacote Tizen (R-002)
  — e é justamente por isso que a lógica fica fora do Worker.

**Risco de empacotamento associado**: `CCPlayTv/tizen_web_project.yaml`
lista os arquivos do pacote explicitamente. O arquivo gerado para o
Worker precisa ser acrescentado ali, **e verificado no aparelho** — a
ausência não aparece no navegador nem nos testes. Registrado como R-002.

## R5 — Como medir performance numa TV que não dá console

**Decisão**: o próprio app exibe as medições na tela, numa superfície de
diagnóstico temporária da US1, e o registro do resultado é a leitura
dessa tela. As medições usam o relógio de alta resolução do navegador e,
quando disponível, o indicador de memória do runtime — tratando a
ausência desse indicador como "não medido", nunca como zero.

**Justificativa**: este é o ponto que quase passou despercebido. O
procedimento de TV física deste repositório documenta que o aparelho
**não entrega console ao desenvolvedor**: acesso privilegiado é negado, o
log da plataforma volta vazio e a porta de inspeção remota fica fechada.
Ou seja, não há como "olhar o console" para colher tempo e memória. Se a
medição não for desenhada para aparecer na tela, a US1 simplesmente não
tem como produzir evidência — e SC-014 exige execução observada, não
estimativa.

**Alternativas consideradas**:
- **Ler tempos pelo log do backend**: rejeitado porque o caminho em teste
  não fala com backend nenhum — é justamente o ponto da feature.
- **Enviar métricas para um coletor**: rejeitado por reintroduzir um
  serviço na medida em que a feature existe para removê-los, além de ser
  desproporcional para uma medição pontual.
- **Inspeção remota pelo navegador de mesa**: rejeitado porque está
  fechada neste aparelho, e porque medir no navegador de mesa violaria
  SC-014.

**Consequência para o escopo**: a superfície de diagnóstico da US1 é
código temporário, com o mesmo contrato do código de spike já usado nesta
sessão — nasce marcada e é removida quando a medição termina. O que
**permanece** é o pipeline medido, não a tela que o mostra.

## R6 — Como testar armazenamento local sem navegador

**Decisão**: adicionar `fake-indexeddb` como dependência de
desenvolvimento e registrá-la no arquivo de setup dos testes
(`tv-web/src/setupTests.ts`), habilitando os testes de repositório em
`vitest`/jsdom.

**Justificativa**: jsdom não implementa IndexedDB. Sem isso, toda a
camada de armazenamento — incluindo o comportamento crítico de troca de
geração (D-004) e de falha de escrita (FR-018) — só seria verificável
manualmente na TV, o que contraria a prioridade de teste do projeto
(unitário antes de manual) e o princípio de checagens automatizadas
obrigatórias.

**Alternativas consideradas**:
- **Só testar armazenamento na TV**: rejeitado por transformar regressão
  silenciosa em algo detectável apenas por inspeção humana esporádica.
- **Abstrair o armazenamento atrás de uma interface e testar com uma
  implementação em memória**: parcialmente adotado — os repositórios já
  são a interface (D-001) —, mas insuficiente sozinho, porque os erros
  que mais importam aqui (transação, cota, cursor) só aparecem contra uma
  implementação real de IndexedDB.
