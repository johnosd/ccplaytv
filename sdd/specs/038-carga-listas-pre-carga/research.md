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
