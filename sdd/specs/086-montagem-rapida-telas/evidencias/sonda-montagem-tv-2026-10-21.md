# T070 — sonda `montagem086` na TV: onde o documento de tela deve morar

- **Data**: 2026-10-21 (02:51–03:10Z)
- **Aparelho**: QN50Q60DAGXZD, Tizen 9 / Chromium 120, `file://`
- **Instalado/desinstalado**: `ccpSondaV2.Capacidades` (app separado). Ao final, `applist` só com `8tZqMtwANL.CCPlayTv`.
- **Carga do teste**: 34 categorias × 1 281 itens, pedaços de 320, **amostras sanitizadas da lista real**
  (`amostraReal: true`) — só números e campos, sem credencial, host ou nome de item.
- **Origem**: `sonda-tv2.jsonl` da feature 082 (as duas últimas linhas `fim`)
- **Classificação**: **gate** — decide P2 do `logic/documento-de-tela.md`.
- **Critério, fixado antes de medir**: p95 ≤ 50 ms sob carga real, **nas duas rodadas**.

## 1. Onde o documento mora (teste `montagemContencao`)

Latência de ler o documento da tela (28 KB) enquanto a carga real roda (ler o preparo + comprimir + gravar):

| Condição | p95 r1 | p95 r2 | máx r1 | máx r2 | Veredito |
| --- | --- | --- | --- | --- | --- |
| **`localStorage`** | **0,8 ms** | **0,8 ms** | 17,9 | 0,9 | **aprovado** |
| Mesmo banco, 1 registro | 22,6 ms | 19,1 ms | 41,7 | 35,9 | aprovado |
| **Banco separado** | **223 ms** | 40,8 ms | 822,8 | 262,3 | **reprovado** |
| 6 leituras (como hoje) | 27,8 ms | 46,1 ms | **789** | **699,2** | cauda inaceitável |

Em repouso, as quatro formas custam 0,6–3,1 ms: **sem carga, nada disto aparece**. O problema é só concorrência.

### O que isso derruba e o que confirma

- **Banco próprio não resolve — é pior.** Era a candidata principal de P2(a). A literatura nunca confirmou essa
  parte (nenhuma fonte media), e a TV refuta: p95 223 ms na 1ª rodada.
- **O gargalo é a thread, não a fila.** Na condição que **só comprime**, sem tocar o banco (`soCpu`), a leitura já
  custa p95 **20,6 / 19,8 ms** — estável nas duas rodadas. É o piso que a thread impõe. Por isso trocar de banco não
  ajuda, e por isso o `localStorage` escapa: síncrono, ele lê nas janelas livres entre os `await` da carga, sem
  precisar de ida e volta assíncrona.
- **Um documento único já conserta a cauda**, mesmo sem trocar de lugar: o pior caso cai de **789/699 ms** (6 leituras)
  para **41,7/35,9 ms** (1 registro) — cerca de 19×. É aí que está o ganho de P1.
- **Fatiar a carga não é confiável**: `fatiadaMesmoBanco` deu p95 19,2 e depois 104,9. P3 deve ser *não começar a carga
  antes da primeira revelação*, não fatiar.

**Decisão (P2)**: o documento vai em **`localStorage`**, com o IndexedDB como reserva — que também passa o critério
(p95 ~20 ms), o que torna a reserva segura quando o `localStorage` falhar (cota, modo privado).

## 2. A trilha de categorias: volume ou fila? (teste `montagemTrilha`)

| | r1 | r2 |
| --- | --- | --- |
| Varredura (390 categorias + preferências), repouso | 26,4 ms | 25,9 ms |
| Trilha pronta (1 registro), repouso | 1,3 ms | 1,1 ms |
| Varredura, sob carga (p95) | 81,4 ms | 82,8 ms |
| Trilha pronta, sob carga (p95) | 18,8 ms | 16 ms |

**A trilha não é volume.** 390 categorias custam ~26 ms, não os 854–991 ms que o app mostrou. Aqueles números eram
**contenção**. Guardá-la pronta economiza ~25 ms em repouso e ~65 ms no p95 sob carga: ganho real, mas modesto — e
**R-009 estava mal interpretado**, o que fica registrado aqui.

## 3. Formato do documento (teste `montagemDocumento`)

| Forma | Bytes | Ler r1 | Ler r2 |
| --- | --- | --- | --- |
| **Cru** (objeto no store) | 28 076 | **2,9 ms** | **2,9 ms** |
| Texto (JSON string) | 28 076 | 3,7 ms | 3,9 ms |
| Comprimido (deflate-raw) | 6 103 | 5,6 ms | 5,5 ms |

**Decisão**: documento **cru**. Comprimir economiza 78% de espaço e custa quase o dobro na leitura; para 3 documentos
(~84 KB) não há motivo.

## 4. Backfill (teste `montagemBackfill`)

Descomprimir um bloco de 1 281 itens: **38,3 / 39,5 ms**. Para as 390 categorias desta TV, ~15 s de CPU no total,
uma categoria por rodada. O teto de 400 ms por rodada (T068) é folgado — cabem ~10 categorias — e pode baixar para
~100 ms se quisermos ainda menos interferência.

## 5. Limites desta medição

- Mede **cadência de pintura e latência de leitura numa sonda**, não o app real: a carga sintética tem a forma da
  nossa (ler preparo → comprimir → gravar pedaços), mas o app faz mais coisas em volta.
- `fps` ficou em 58–61 em todas as condições: a sonda não desenha nada pesado, então **isso não diz nada** sobre a
  navegação do app.
- O `localStorage` venceu por margem grande e consistente, mas o teste lê a cada 40 ms; um app que leia em rajada
  pode ver outro número. O limite de ~5 MB e a natureza síncrona exigem o documento pequeno — 28 KB medidos.
