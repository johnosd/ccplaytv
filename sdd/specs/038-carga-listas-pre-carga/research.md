# Fase 0 — Pesquisa

## R0-1. Onde vão os ~60 s da primeira entrada fria

**Status**: **aberto — medir antes de corrigir** (FR-012, Fase 2 de `tasks.md`).

**Por que é incerto**: a feature 010 aprovou, na TV física em 23/09/2026, a
primeira entrada em ≤ 3 s (SC-002 da 010). O dono do produto observa hoje ~1
minuto (não cronometrado). Candidatos, sem evidência ainda:

| Hipótese | Onde olhar | Sinal |
| --- | --- | --- |
| Painel lento para `get_vod_streams&category_id=` / `get_series` | tempo até o primeiro byte e até o fim da resposta | alto já no navegador do PC |
| Parse do JSON grande na thread da interface (séries: até 1,5 MB por categoria) | intervalo fim-da-resposta → fim do `mapXxxEntry` | alto só na TV |
| Gravação (`bulkAdd` + exclusão na mesma transação) | duração da transação de `storeCategoryItems` | cresce com o nº de itens |
| Leitura (`listChannels` sem teto + `countChannels`) | duração da leitura depois da gravação | alto com milhares de itens |
| Desenho da grade/capas (feature 015/025) | OK → primeiro quadro com cartões | alto mesmo com dado no disco |
| Fila atrás de pré-buscas por foco (bug de 25/09, já corrigido) | nº de buscas simultâneas no momento da entrada | > 1 |

**Método** (sem URL, credencial ou conteúdo em lugar nenhum — só ms, contagens
e bytes):

1. Instrumentação desligada por padrão: `lib/perf/entryTiming.ts` com
   `performance.now()` em cada fase (`request`, `firstByte`, `responseEnd`,
   `mapped`, `written`, `read`, `firstPaint`), ligada por
   `localStorage['ccplaytv:perf'] === '1'`, relatório por `logger.info` só com
   números (nunca a URL). Remover ou deixar desligada ao final (decisão do
   execute, registrada).
2. Navegador do PC contra o painel real (`e2e/carga-listas-real.mjs`, fora de
   `test:e2e`, lê `CCPLAY_PROBE_*` do `.env` da raiz, imprime só números): 3
   categorias por seção, 3 repetições.
3. TV de referência (`tizen-tv`), mesmas categorias, com a instrumentação
   ligada; coleta pelo `sdb dlog`/Web Inspector.
4. Registrar a tabela de decomposição aqui e em `plan.md` → Riscos (R-001).

**Decisão**: pendente da medição. O que for do app entra como tasks de
correção na Fase 2; o que for do painel fica registrado com números (FR-013).

### Medição 1 — PC (Chromium do Playwright, lista real), 2026-09-30

`node e2e/carga-listas-real.mjs 3 3` — 3 repetições × 3 primeiras categorias
por seção, contexto novo a cada repetição (entrada fria de verdade), capas
carregando normalmente. Tempos em ms desde o pedido ao painel (`mapped` =
rede + JSON + mapear; `written` = gravação feita; `firstPaint` = primeiro
quadro com itens); "parede" = tecla → quadro, medido pelo roteiro.

| Seção | Parede p50 / máx | Rede total p50 / máx | mapped p50 | written p50 / máx | firstPaint p50 / máx | Itens p50 / máx | Bytes p50 / máx |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Canais | 618 / 901 | 406 / 551 | 408 | 506 / 680 | 550 / 732 | 79 / 122 | 1,7 k / 2,8 k |
| Filmes | 1.678 / 3.792 | 1.189 / 2.233 | 1.230 | 1.450 / 3.505 | 1.630 / 3.753 | 1.693 / 11.130 | 109 k / 673 k |
| Séries | 1.323 / 1.706 | 1.037 / 1.310 | 1.049 | 1.225 / 1.546 | 1.285 / 1.660 | 1.751 / 1.891 | 436 k / 602 k |

Leitura:

- **No PC nada chega perto de 1 minuto**: a pior entrada (categoria de 11.130
  filmes) leva ~3,8 s. A rede do painel domina (ttfb ~250 ms, corpo até ~2 s);
  a gravação é a segunda parcela e cresce com o tamanho (11.130 itens: ~1,5 s
  entre `mapped` e `written`; 1.700 itens: ~0,2–0,5 s). Leitura + pintura:
  < 300 ms.
- A primeira tentativa do roteiro registrou "Séries não abre em 180 s" — era
  **bug do roteiro** (a topbar não era alcançada saindo de uma categoria
  funda da trilha de Filmes), confirmado por diagnóstico à parte (Séries abre
  em ~2 s). Corrigido antes da medição acima.
- **Consequência**: o ~1 minuto observado vem da TV (CPU/IndexedDB mais lentos
  e/ou rede da TV), ou de algo que o roteiro não reproduz (navegação humana
  com pré-buscas por repouso encadeadas). Precisa da medição na TV.

### Medição 2 — TV de referência

Build de medição (`VITE_CCPLAY_PERF=1`, painel de números no canto da tela —
a TV não entrega console) instalado em 2026-09-30. **Aguardando leitura na
TV** (roteiro no `quickstart.md`, seção "Medição").

## R0-2. Por que a pré-carga não repete o "adia o sintoma" da 010

**Decisão**: pré-carga uma categoria por vez, suspensa com tecla recente
(2 s), player/trailer aberto, app oculto ou sem rede; escrita com id
preservado e assinatura (renovação idêntica não regrava); exclusão de gerações
antigas em partes. Critério de recuo explícito (FR-014): se SC-003 falhar na TV
mesmo assim, a ordem passa a cobrir só T0/T1 (focada + vizinhas).

**Justificativa**: o que a 010 descartou foi gravar **tudo de uma vez** atrás da
interface ("a TV fica lenta enquanto isso"). O gargalo medido era a transação
gigante; aqui a maior transação é uma categoria (a maior medida: 1.746 séries,
1,5 MB), e nada começa enquanto a pessoa usa o controle.

**Alternativas consideradas**: pré-carga só por vizinhança (é o recuo);
Web Worker para a escrita (IndexedDB no Worker não tira a contenção do banco, e
o `categoryLoader` hoje roda na thread principal por causa do `dedup` com a
entrada — mover exigiria outro mecanismo de compartilhamento; fica para depois
se a medição mostrar parse/gravação como gargalo, R-002).

## R0-3. Estratégia para carga instantânea de canais, filmes e séries

**Status**: estratégia proposta (2026-09-30), pedido do dono do produto depois
do primeiro teste na TV: "pré-carga funciona; canais ainda lentos ao abrir
(10–30 s); pré-carga demora para terminar; carregar/ler a lista mais rápido,
sem gastar muita memória".

### Evidência medida (lista real / navegador do PC)

1. **O painel limita a frequência.** A pré-carga por categoria fez ~34 pedidos
   (~1/s) e o painel passou a recusar (erro sem cabeçalho CORS →
   `net::ERR_FAILED`). Com a CPU 4× mais lenta: 78 pedidos, 75 de canais, só
   9 de 99 categorias prontas — as falhas esgotam as 3 tentativas. É por isso
   que os canais não ficam prontos na TV e a entrada espera a rede.
2. **A TV ao vivo em si é rápida**: categoria de canais já no aparelho abre em
   ~0,4 s mesmo com CPU 4× mais lenta. A demora vista é a categoria não estar
   pronta (item 1).
3. **Seção inteira é barata na rede**: 3 pedidos trazem tudo —
   canais 0,76 MB (2.266 itens, 41 categorias) em 0,9–1,2 s; filmes 12,4 MB
   (31.432, 32 categorias) em 1,4–2,6 s; séries 9,7 MB (9.667, 27 categorias)
   em 1,6–1,8 s. `JSON.parse`: 3–100 ms no PC.
4. **O gargalo é gravar uma linha por item** (IndexedDB, CPU 4×, mesmos 5
   índices de `channels`): 11.130 itens = **6,7 s** gravar / 0,9 s ler;
   `relaxed` ou lotes de 1.000 quase não mudam; **um bloco único por
   categoria = 0,25–0,33 s gravar / 0,12–0,19 s ler** (~25× e ~5×). 2.266
   itens: 2,0 s × 0,05–0,07 s.
5. **Pesquisa externa**: apps nativos (TiviMate) usam SQLite e ainda sofrem com
   escrita de dezenas de milhares de linhas; apps Xtream (Smarters) abrem
   rápido porque não baixam tudo e depois usam cache local; um player web para
   webOS foi morto pelo sistema (`memoryReclaim`) ao manter 2–3 cópias de um
   catálogo de 98 MB na memória — o risco de memória é real em TV. Gravar
   blocos grandes em vez de registros soltos é a técnica que tornou IndexedDB
   "muito, muito mais rápido" em relatos independentes; o Chrome só passou a
   usar `durability: relaxed` por padrão na versão 121 (a TV é 120).

### Cadeia de raciocínio — soluções consideradas

**S1. Manter por categoria, só respeitar o limite do painel** (backoff,
intervalo maior). Resolve as falhas, mas deixa tudo mais lento: 99 pedidos
espaçados + 43 mil linhas gravadas uma a uma. Não atende "instantâneo".
**Descartada.**

**S2. Seção inteira (3 pedidos) + linhas como hoje, gravadas num Worker, com
menos índices e `relaxed`.** Resolve o limite do painel (e com ele os canais,
que são pequenos). Mas 43 mil linhas continuam custando ~25 s com CPU 4×
(minutos na TV) em segundo plano, e abrir a categoria de 11 mil filmes ainda
lê 11 mil linhas (~0,6–0,9 s com CPU 4×). Memória: a seção de filmes inteira
parseada (~12 MB de texto + objetos) no Worker. **Melhora, não resolve.**

**S3. Seção inteira lida em fluxo num Worker + "pacotes" por categoria.**
- Rede: 3 pedidos (canais → filmes → séries), nunca 99 — fim do limite.
- "Multithread": o download e a leitura rodam num **Web Worker** e em
  **fluxo** (o JSON do Xtream é um array de objetos planos: um separador
  incremental por profundidade de chaves entrega um objeto por vez, e
  `JSON.parse` de cada objeto pequeno) — a memória nunca guarda o arquivo
  inteiro nem uma segunda cópia; cada item vira um registro compacto só com
  os campos usados.
- Armazenamento: **um bloco por categoria** (as linhas de hoje saem do
  caminho quente). Gravar a seção de filmes inteira ~1 s com CPU 4×; abrir
  uma categoria = **uma leitura** (~0,1–0,2 s mesmo a de 11 mil).
- Identidade: cada item ganha uma **chave estável** (tipo + categoria + id do
  provedor), que é o que telas, detalhe, player e favoritos passam a usar no
  lugar do id numérico autoincremento — e que também elimina o problema de
  "id muda na renovação" da Fase 2.
- M3U guardado já é quase isso (`storedEntries` são blocos por categoria):
  passa a ler do bloco direto, sem materializar em linhas.
- Custo: é uma refatoração da camada de catálogo (todo leitor de `channels`
  por id: detalhe, player, favoritos, histórico, "Todos", busca, Semelhantes,
  número do canal). Episódios (por série, sob demanda) podem continuar em
  linhas.
**Promissora.**

**S4. Cache em memória do catálogo inteiro** (carregar tudo ao abrir o app).
Instantâneo depois de carregado, mas 43 mil objetos vivos na memória da TV o
tempo todo — o caso webOS mostra o risco. **Descartada.**

**S5. Backend que pré-processa o catálogo.** Contraria ADR-008 (client-first)
e exige servidor sempre ligado. **Descartada.**

### Eleita: S3, em duas entregas

| Critério | S2 | **S3** |
| --- | --- | --- |
| Limite do painel | resolvido | resolvido |
| Canais prontos | ~2–5 s | **~2 s** |
| Catálogo todo pronto (CPU 4×) | ~30 s + rede, minutos na TV | **~6–10 s** (rede ~5 s + gravação ~2 s) |
| Abrir categoria de 11 mil itens (CPU 4×) | 0,6–0,9 s | **0,12–0,19 s** |
| Pico de memória | seção inteira parseada no Worker | um objeto por vez + os blocos em montagem |
| Tamanho da mudança | médio | grande (camada de catálogo) |

1. **Entrega 1 (dentro da 038, pequena, resolve os canais já):** seção
   inteira por fluxo num Worker, distribuindo por categoria para o caminho de
   gravação atual, com canais primeiro. Acaba com o limite do painel; canais
   (2.266 itens) ficam prontos em segundos. Mede na TV a memória da seção de
   filmes antes de ir adiante.
2. **Entrega 2 (feature própria):** pacotes por categoria + chave estável de
   item, trocando os leitores de `channels`. É o que torna filmes e séries
   "instantâneos" na TV e o catálogo inteiro pronto em segundos.

### Entrega 1 — feita (2026-09-30)

`jsonArrayStream.ts` (leitura em fluxo, um objeto por vez), `sectionLoader.ts`
(seção inteira → mesmos mapeadores → `renewCategoryItems` por categoria, com
pausa pelo portão e cancelamento), `sectionWorker.ts` + `sectionRunner.ts`
(Web Worker, plano B na thread principal, `assets/sectionWorker.js` no
`tizen_web_project.yaml`), agendador com `runSection` (seção da dica primeiro,
≥ 2 categorias a obter, uma vez por sessão ou até a estrutura mudar), e
`chromeTransactionDurability: 'relaxed'` no banco.

Medido com a lista real, CPU 4× mais lenta (navegador do PC):

| | Antes (por categoria) | Depois (por seção) |
| --- | --- | --- |
| Pedidos ao painel | 78, com recusas por limite de frequência | **3** |
| Canais prontos (41 categorias) | 9 de 99 em 90 s | **3,6 s** |
| Filmes prontos (32) | — | **12,4 s** |
| Séries prontas (27) | — | **17,1 s** |
| Abrir categoria de canais pronta | 10–30 s relatados na TV | **0,32–0,47 s** |

Falta medir na TV (memória do Worker na seção de filmes e os tempos reais).
A Entrega 2 (blocos por categoria + chave estável) continua sendo o que tira
o custo de gravação linha a linha (~25× na medição acima) — é feature própria.

Riscos: memória do Worker na seção de filmes (mitigado pelo fluxo); a
refatoração de identidade da Entrega 2 (planejar com contratos de
favoritos/histórico/retomada por `stableId`, que já não dependem do id local).
Fontes: [TiviMate/SQLite](https://tivimateplayer.co.uk/tivimate-buffering-fix/),
[webOS IPTV player #64](https://github.com/lennylxx/webos-iptv-player/issues/64),
[IndexedDB bulk inserts](https://blog.lekoala.be/indexeddb-bulk-inserts-are-slow),
[Chrome: relaxed por padrão no 121](https://developer.chrome.com/blog/indexeddb-durability-mode-now-defaults-to-relaxed),
[RxDB: lentidão do IndexedDB](https://rxdb.info/slow-indexeddb.html),
[json-ext: parse em fluxo](https://github.com/discoveryjs/json-ext).
