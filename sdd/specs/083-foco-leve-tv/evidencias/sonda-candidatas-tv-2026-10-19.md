# Sonda na TV — candidatas de foco (T006/T019) — 2026-10-19

**Classificação: gate (SC-001/SC-002), TV física.** Samsung QN50Q60DAGXZD, sonda `ccpSondaV2.Capacidades` (teste `foco083`, app
separado do CCPlayTV). Grade 7×20 com capas sintéticas, troca de foco a cada 140 ms, 3 s por classe, **sem rolagem**. Duas
rodadas na mesma sessão (a segunda com reinstalação da sonda). Origem dos números: `sonda-tv2.jsonl` da pasta da 082 (R-007);
só números aqui, sem URL, item ou credencial. Parado: 61 fps, pior quadro 17 ms, 0 quadros > 50 ms nas duas rodadas.

## Troca de foco sem rolagem (gate)

Formato: fps / pior quadro (ms) / quadros > 50 ms.

| Classe | O que é | Rodada 1 | Rodada 2 |
| --- | --- | --- | --- |
| `f-full` | linha de base da 082 (sombra de profundidade, offset 6 px) | 35 / 133 / 7 | 37 / 133 / 4 |
| `f-app` | receita **antiga do app** (halo + brilho, transição de `box-shadow`) | 44 / 100 / 2 | 46 / 50 / 0 |
| **`f-c1`** | **sombra estática, só `transform` anima** | **51 / 50 / 0** | **51 / 33 / 0** |
| `f-c2` | brilho em pseudo-elemento por `opacity` | 49 / 133 / 2 | 50 / 117 / 2 |
| `f-c3` | brilho por degradê, `opacity` | 48 / 150 / 2 | 49 / 133 / 2 |
| `f-c4` | sem brilho difuso | 48 / 117 / 1 | 47 / 133 / 1 |

## Foco descendo linhas com rolagem da grade (registro SC-006, não é gate)

| Classe | Rodada 1 | Rodada 2 |
| --- | --- | --- |
| `f-app` | 31 / 133 / 14 | 32 / 100 / 14 |
| `f-c1` | 50 / 83 / 2 | 48 / 67 / 3 |

## Leitura

- A C1 é a única que atinge a meta nas duas rodadas: ≥ 50 fps e 0 quadros > 50 ms. Também é a de maior fps.
- A receita antiga do app (`f-app`) fica abaixo da meta (44–46 fps) e, com rolagem, cai a ~31 fps com 14 quadros lentos; a C1
  quase dobra o desempenho com rolagem (50/48 fps), embora a rolagem não seja gate.
- C2/C3/C4 não superam a C1 mesmo mantendo o brilho em camada: o pseudo-elemento não é ganho de desempenho nesta TV, o que confirma
  a ordem de preferência do D-003 (a C1 não muda a estrutura do CSS).
- Margem curta: 51 fps contra 50 fps de meta, com pior quadro 33–50 ms. A conclusão vale para a troca de foco **sem rolagem** na
  sonda; o app real é registro (T020).
- A C4 (sem brilho) não foi necessária: nenhuma decisão de emenda da spec (FR-002).
