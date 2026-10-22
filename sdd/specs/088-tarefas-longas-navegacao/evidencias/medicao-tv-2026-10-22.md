# Medição na TV — atribuição das tarefas longas (feature 088, Fase 3)

**Data**: 2026-10-22 · **Aparelho**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120, origin `file://`)
**Classificação**: **gate** para a atribuição (SC-001 a SC-003 ficam como **linha de base**, não aprovados — ver §5)
**Origem dos números**: `evidencias/app-metricas-tv-2026-10-22.jsonl` (62 linhas, canal de métricas da feature 085)

## 1. O que foi instalado e desinstalado

| Passo | O quê |
| --- | --- |
| Instalado | `8tZqMtwANL.CCPlayTv`, build de medição (`VITE_CCPLAY_PERF=1`, `VITE_CCPLAY_METRICS_REPORT`, `VITE_CCPLAY_AUTOPILOT=1`) |
| Reinstalado ao final | **Pacote normal**, sem nenhum marcador (`'tecla'`, `ccplay-app-metrics`, `autopilot`, IP do PC — todos ausentes de `dist/assets`) |
| Desinstalado | **Nada.** O CCPlayTV nunca foi desinstalado e os dados da TV foram preservados (`deploy-tv.ps1 -SkipBuild`) |

Lista real ativa, catálogo obtido: **43 549 filmes / 34 categorias**, **9 777 séries / 28 categorias**, 2 355 canais
(linhas `section-load`). Coletor local; nenhum segredo saiu da TV — ver §6.

## 2. Cobertura da sonda — parcial, e isso importa

A sonda automática (087) devia rodar **quatro** janelas de 60 s (Filmes e Séries, duas vezes). Rodou **duas**, ambas em
Filmes, e reportou **`falhas = 2`**:

| Janela | Tela | Teclas | fps | Quadros | Pior quadro | > 50 ms |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `movies` | 163 | **37** | 2 205 | **717 ms** | 127 |
| 2 | `movies` | 166 | **40** | 2 370 | **700 ms** | 104 |
| 0 (resumo) | — | 0 | — | — | — | `falhas: 2` |

As duas janelas de **Séries não existem**: a navegação em malha fechada não chegou ao destino e abandonou a janela
(é o comportamento correto — ela não inventa medida). O T020 pedia `falhas = 0`, então **a cobertura por tela está
incompleta**: tudo abaixo vale para **Filmes**, com a lista de referência.

Os números das duas janelas que valem **reproduzem a linha de base** de 2026-10-22 (717–783 ms de pior quadro,
33–41 fps). Ou seja: **a instrumentação não alterou o que ela mede** — o que é a condição para a atribuição valer.

## 3. A atribuição (a resposta da Fase 3)

29 janelas de ~5 s com `longtask` e as etapas na mesma janela. Medianas:

| Medida | Mediana | Máximo | Leitura |
| --- | --- | --- | --- |
| `longTaskMs` / 5 000 | **1 658 ms → 33%** | 3 452 ms (69%) | thread presa 1/3 do tempo — **igual à linha de base** |
| `longTaskMaxMs` | **442 ms** | **766 ms** | uma única tarefa chega a 0,77 s |
| `teclaMs` | **8 ms** (14 teclas) | — | **0,6 ms por tecla**, pior caso 1 ms |
| `renderMs` | **352 ms** (14 commits) | — | **27,8 ms por tecla**, pior caso 80 ms (mediana) / 125 ms |
| `capaMs` | ver §4 | — | **não atribuível** por este instrumento |

Pela ordem de leitura de `logic/atribuicao.md` §3:

1. **`teclaMs` ≈ `longTaskMs`? NÃO — é 1%.** O manipulador de tecla (`moveShowcaseVertical`/`Horizontal`, `entryIdsOf`,
   `setFocusState`) custa **0,6 ms**. **Hipótese eliminada com número.** Otimizar navegação de foco não devolveria nada.
2. **`renderMs` ≈ `longTaskMs`? NÃO — é 23%.** O re-render é real e é o maior item nomeado (27,8 ms por tecla, pior
   caso 125 ms), mas **não é dominante**.
3. **`capaMs` alto e `longTaskMs` baixo?** Não se aplica: `longTaskMs` é alto. E `capaMs` não mede CPU (§4).
4. **Soma ≪ `longTaskMs`? SIM.** `tecla + render` = **24%** da thread presa. **76% está fora dos intervalos medidos.**

Caímos no **passo 4**: a tarefa longa está, em sua maior parte, fora das três etapas.

### 3.1 Uma hipótese atraente, refutada aqui

A leitura de categoria em segundo plano pelo prefetch roda **durante** a navegação (6 linhas `entry` com
`background: 1`, `readMs` 148–471 ms — a mesma ordem de grandeza de `longTaskMaxMs` 442 ms). Era o candidato óbvio
para o 76%. Agrupando as 29 janelas:

| Janelas | n | fps | Pior quadro | `longTaskMs` | `longTaskMaxMs` |
| --- | --- | --- | --- | --- | --- |
| **COM** leitura de fundo (`entry`/`section-load`) | 11 | **41** | 467 ms | 1 513 ms | 460 ms |
| **SEM** leitura de fundo | 18 | **36** | 375 ms | 1 715 ms | 387 ms |

As janelas **com** leitura de fundo são **melhores**, não piores. A hipótese está **refutada** — e é exatamente o tipo
de causa provável que o FR-001 proíbe registrar sem medir (foi o erro das features 087 e do primeiro assessment).

## 4. O que `capa` mediu — e por que não serve (erro de desenho meu)

`capaMs` chegou a **266 138 ms em uma janela de 5 000 ms**, com `capaN = 8` e `capaMax` de **33 268 ms**. Um número
53× maior que a janela não é tempo de CPU: a etapa `capa` abre quando o card pede a imagem e fecha no `onLoad`/`onError`,
então ela mede **espera de parede, com 8 imagens em paralelo** — rede + fila do decodificador + o tempo em que o card
simplesmente ficou pendurado. Não é comparável com `longTaskMs`, que é tempo de thread.

**Isto é uma falha da minha instrumentação, não um achado.** O que ela prova, e só isso: **capa pendente é um estado
normal e longo** neste aparelho com esta lista (dezenas de segundos), o que já é informação útil para a US2/US3.

Há uma correlação forte entre haver capa fechando na janela e a janela ser ruim (33 fps / 1 747 ms contra 44 fps /
1 020 ms), mas ela **não sustenta causa**: `capaN = 0` também marca as janelas em que a sonda não estava na grade de
cards (as três melhores janelas — 55–59 fps — têm `capaN = 0` **e** mais teclas, 16–20, porque navegavam a topbar).
Registrar "é a capa" a partir disso seria repetir o erro do FR-001 com outro nome.

## 5. Leitura honesta — o que esta medição prova e o que não prova

**Prova:**
- O custo síncrono do manipulador de tecla é **0,6 ms**: desprezível, com número do aparelho.
- O re-render custa **27,8 ms por tecla** e responde por **23%** da thread presa.
- **76% da thread presa está fora** de `tecla` e `render`.
- A leitura de fundo do prefetch **não** é a causa.
- A instrumentação **não** alterou o que mede (os números reproduzem a linha de base).

**Não prova:**
- Nada sobre **Séries**: as duas janelas falharam (`falhas = 2`).
- Nada sobre o custo de CPU da decodificação de capa — o instrumento mede espera, não trabalho (§4).
- **Onde** estão os 76%. Há candidatos (decodificação/layout das imagens que entram na viewport, efeitos e queries
  pós-commit, recálculo do virtualizador), e nenhum foi medido. Nomeá-los agora seria especulação.

SC-001 (< 15%), SC-002 (< 300 ms) e SC-003 (≥ 45 fps) **continuam reprovados** — mas esta rodada é a **linha de base
com instrumentação**, não uma tentativa de atingi-los: nada foi otimizado ainda (FR-001).

## 6. Segurança (FR-011 / SC-008)

O `.jsonl` foi auditado antes de gravar esta evidência: todas as chaves são numéricas, e os **únicos** valores não
numéricos são carimbos de tempo e rótulos do conjunto fechado — `source` (`showcase`/`assembly`/`epg`/`frames`/
`budget`/`section-load`/`entry`), `outcome` (`done`/`failed`/`synced`), `screen` (`home`/`movies`), `kind`
(`movie`/`series`/`channel`), `phase`, `reason` (`cap`/`ready`), `mode` (`prefetch`). **Nenhum** nome de item,
categoria ou canal, nenhuma URL, host ou credencial. O build normal reinstalado não carrega o canal nem o IP do PC.
