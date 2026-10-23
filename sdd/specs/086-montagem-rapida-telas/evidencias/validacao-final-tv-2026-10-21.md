# Validação final na TV — feature 086

- **Data**: 2026-10-21
- **Aparelho**: QN50Q60DAGXZD, Tizen 9 / Chromium 120, `file://`, lista real (390 categorias, 43 549 filmes, 9 777 séries)
- **Build**: de medição (`VITE_CCPLAY_PERF`, canal de métricas), com toda a Fase 8. Dados preservados.
- **Origem**: `evidencias/validacao-final.jsonl`, trecho após 15:05Z (282 eventos, ~14 min de uso, 2 sessões do app)
- **Classificação**: **gate**
- **Veredito**: **passou**, com SC-003 parcial e SC-005/SC-006/SC-009/SC-010 sem número (detalhado em §4)

## 1. Critérios de tempo

| Critério | Meta | Linha de base | Resultado | Veredito |
| --- | --- | --- | --- | --- |
| **SC-001** | Início com conteúdo ≤ 1 s na 1ª abertura | `cap` **2 039 ms**, vazio | **`ready` 355 ms** e **362 ms** (2 sessões) | **atendido** |
| **SC-002** | Nenhuma das três revela pelo teto | Início revelava por `cap` nas duas medições | **nenhuma** por `cap` — todas `ready` ou `cache` | **atendido** |
| **SC-003** | Filmes e Séries ≤ 1 s, ≤ 2 leituras pendentes | 497 / 1 074 ms | **313–380 ms** em 12 aberturas; **6 pendentes** na 1ª de cada tela | **parcial**: tempo sim, pendentes não |
| **SC-004** | Montar as fileiras de um tipo ≤ 100 ms | ~1,2 s estimado na TV | **`docMs` 0–1 ms** em todas as leituras | **atendido** |
| **SC-007** | Mesmo conteúdo da varredura | — | contrato C1, verde | **atendido** (sem TV) |
| **SC-011** | Mais capas da 1ª tela prontas | 3 de 17 | **2/7, 4/13, 6/13, 7/17** | **atendido** |
| **SC-013** | Sem regressão | — | 3697 testes, 54/54 E2E, travas de 052/056/065/066/079/082/085 íntegras | **atendido** |

Reabertura (em cache): Início **1–2 ms**, Filmes **4–9 ms**, Séries **1–2 ms**, com `paintMs` igual.

## 2. O que fez a diferença, medido

| Etapa | Antes | Depois |
| --- | --- | --- |
| Ler as fileiras na abertura | `addedMoviesMs` **1 810–1 939 ms** | **`docMs` 0–1 ms** |
| As duas consultas de validação que eu havia posto | `prepareMs` **883–3 986 ms** | **removidas** (quem escreve invalida) |
| Abrir o IndexedDB | dentro do tempo da 1ª tela | **926 / 544 ms**, pagos na splash |
| Carga da lista | competia com a abertura | `gateWait` 1–2 ms: **só começa depois da 1ª revelação** |
| Carga de séries | **26 639 ms** (regressão) | **3 480 ms** |
| Leituras de categoria em 2º plano | 8 523–10 618 ms | 100–1 093 ms |

## 3. A sequência de causas, e os erros que cometi no caminho

Cinco diagnósticos, quatro deles meus e errados, cada um derrubado por medição:

1. **"É a retenção dos itens e as transações por categoria"** — corrigi (P0); a carga de séries de fato voltou ao normal,
   mas o número de filmes não mudou.
2. **"É projetar os 43 549 itens"** — corrigi (T079); `encodeMs` ficou em 8 366 contra 8 274. Zero efeito.
3. **"Filmes regrediu na carga"** — **falso**: a instrumentação por etapa (T080) mostrou que o número depende de haver
   regravação, e as sessões que eu comparava diferiam nisso. Não havia regressão em filmes.
4. **"É a minha invalidação apagando o documento"** — corrigi (T084, `stale` em vez de apagar); a Home continuou em
   ~1,9 s.
5. **O que era**: eu havia posto **duas consultas ao IndexedDB** para validar o documento. Elas custavam 0,9–4,0 s na
   abertura (`prepareMs`), contra 1–17 ms para ler o documento (`docMs`). Troquei uma leitura lenta por duas.

O que quebrou o ciclo foi parar de supor e instrumentar cada etapa (T085–T087): `prepareMs`/`docMs` separados,
`dbOpenMs`, e os tempos de **todas** as leituras — não só as que resolviam antes da revelação, que era justamente onde
o diagnóstico estava cego.

Também corrigi um erro de método: a sondagem do orçamento do `PerfOverlay` rodava 3× custando 1,2–4,9 s cada e
**disputava o aparelho com o que estava medindo** (T088). Virou opt-in.

## 4. O que fica sem número, declarado

- **SC-003 (pendentes)**: a 1ª abertura de Filmes/Séries mostra 6 leituras pendentes, contra a meta de ≤ 2. Elas não
  seguram a tela (são as `external` e as adiadas, que entram depois — `settled` mostra 2–18 s para elas), mas o critério
  como está escrito **não** foi atingido. Não vou reescrever o critério depois de ver o resultado.
- **SC-005** (atualizar com a tela aberta) e **SC-006** (sem rede): **não testados** — o usuário não executou esses dois
  passos do roteiro. Ficam sem verificação.
- **SC-008** (`paintMs` não maior que a base): em cache, 1 ms nas duas; na 1ª abertura, 291–379 ms agora contra um valor
  que a base não produziu (lá nenhuma leitura resolvia antes da revelação). **Não comparável** com honestidade.
- **SC-009** (quadros longos): mediana de 38 fps contra ~32 da base, mas com mínimo de 2 fps em algum ponto da sessão de
  14 min e 746 quadros acima de 50 ms no total. As duas amostras têm durações muito diferentes; **não aprovo** por este
  número.
- **SC-010** (memória): `performance.memory` continua fixo em 10 MB nesta TV (R-010). Sem método.
- **SC-012** (capas fora da 1ª tela): não isolado nesta coleta.

## 5. Limites desta medição

Duas sessões do app, ~14 min, uma lista real. Os tempos de abertura repetiram-se de forma estreita (Início 355/362 ms;
Filmes 357–380; Séries 313–367), o que sustenta a conclusão sobre eles. Os números de quadros e memória **não**
sustentam conclusão, e estão declarados como tal acima.
