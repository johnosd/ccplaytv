# Linha de base das telas principais na TV (2026-10-20)

- **Aparelho**: QN50Q60DAGXZD, Tizen 9, Chromium 120. Build de medição (`VITE_CCPLAY_PERF=1` + canal de métricas da 085, com
  a instrumentação por leitura da T001/T002), instalado com autorização; dados do usuário preservados. Lista real ativa.
- **Roteiro**: abrir Início (1ª vez na sessão) → Filmes → Séries, navegando (foco entre cards e fileiras, rolagem) em cada uma.
- **Origem**: `evidencias/linha-de-base.jsonl` (66 linhas: 44 `frames`, 11 `entry`, 5 `assembly`, 3 `section-load`, 3 `budget`).
- **Classificação**: gate da Fase 1 — é contra estes números que a validação (Fase 7) compara.

## Montagem das telas

| Momento | Tela | `revealMs` | Motivo | Leituras pendentes | Leituras que resolveram | `paintMs` |
| --- | --- | --- | --- | --- | --- | --- |
| 23:16:41 | Início (1ª abertura) | **2 039** | `cap` | **6 de 6** | **nenhuma** | — |
| 23:17:00 | Filmes | 497 | `ready` | 6 | `added` 0 ms, `rated` 0 ms | 497 |
| 23:18:20 | Séries | 1 074 | `ready` | 7 | **`categories` 1 074 ms** | 0 |
| 23:18:15 | Início (reentrada) | 1 | `cache` | 2 | hero, continue, mylist, addedMovies: 0 ms | 1 |
| 23:19:11 | Início (reentrada) | 1 | `cache` | 2 | idem | 1 |

## O que estava acontecendo em volta (a medição não é de um app ocioso)

| Momento | Evento |
| --- | --- |
| 23:16:48 | Orçamento (`probe`): **2 437 ms** — contra ~400 ms medidos hoje com o app quieto |
| 23:17:11–23:17:16 | Cargas de seção: filmes 7 384 ms (43 549 itens), canais 1 620 ms, séries 3 217 ms |
| 23:17:46 / 23:18:46 | Orçamento: 1 016 ms / 435 ms (voltando ao normal conforme a pré-carga termina) |
| 23:17:48–23:19:00 | 11 leituras de fundo de categoria: 153–580 ms, com um pico de **2 586 ms** |

## Leitura honesta

1. **A primeira abertura do Início não resolve NENHUMA das 6 leituras em 2 s.** A tela aparece vazia pelo teto. Isso é o
   sintoma do assessment, agora com a prova por leitura: não há uma leitura lenta, há **seis** que não terminam.
2. **A renderização da Início não é o gargalo.** Nas reentradas com dado em cache, a tela revela em **1 ms** e o `paintMs` é
   **1 ms**. Desenhar o billboard e as 5 fileiras é barato — o custo é inteiramente de obter o dado. Isso **descarta o
   risco R-006** (Home sem virtualização vertical) como causa.
3. **Descoberta nova: a lista de categorias custa ~1 s.** Em Séries, `categories` (a leitura obrigatória da vitrine) levou
   **1 074 ms** e foi a única a resolver — ela sozinha define quando a vitrine aparece. Não é a varredura do tipo; é outra
   leitura, que o plano não previa.
4. **Tudo fica 2–5× mais lento sob concorrência.** O orçamento, que hoje mede ~400 ms com o app quieto, levou **2 437 ms**
   durante a abertura. A primeira abertura acontece exatamente quando a pré-carga está começando — é o pior momento, e é o
   momento real da pessoa.
5. **Filmes revela cedo porque quase nada resolveu**: só `added` e `rated`, ambos em 0 ms, provavelmente vazios ou já em
   cache da Home. As outras 6 continuavam pendentes na revelação.

## Limitações desta medição

- **`paintMs` não é só desenho**: ele mede da última leitura resolvida até a revelação, o que inclui a janela deliberada de
  300 ms da feature 079. Em Filmes (497 ms) a maior parte é essa espera, não desenho. Serve para comparação entre antes e
  depois, não como "custo de pintar".
- **Memória não foi medida de verdade**: `performance.memory` devolveu **10 MB fixos** em todas as 44 amostras, o que não é
  plausível para um app com catálogo carregado. A API não tem precisão útil nesta TV. O SC-010 precisa de outro método ou
  fica registrado como não verificável.
- Uma sessão, um roteiro. Os números de navegação (abaixo) misturam as três telas.

## Navegação (quadros)

- Acumulado na sessão: **192** quadros acima de 100 ms, dos quais **35** com o controle parado.
- Janela com tecla, durante a navegação: **39 fps**, pior quadro **267 ms**, 7 quadros acima de 50 ms.
- Referência da feature 083: 51 fps com a receita de foco leve. Os 39 fps aqui são com as telas sob carga de pré-carga.
