# Linha de base na TV — código anterior à 085 (2026-10-20)

- **Aparelho**: QN50Q60DAGXZD, Tizen 9, Chromium 120. Sonda `ccpSondaV2.Capacidades` (autorizada pelo usuário), testes
  `etapasCanais`, `etapasSeries`, `etapasFilmes`, 2 rodadas cada, mesma instalação. Desinstalada ao final.
- **Código medido**: `tv-web` do commit `5605148` (antes da 085) num worktree, com a sonda parametrizada por seção. `loadSection`
  real com `STAGE_FLUSH_ITEMS = 20 000` e orçamento com `filter` sobre o preparo.
- **Dados**: brutos reconstruídos das amostras sanitizadas: filmes 43 510 em 35 categorias; séries 9 768 em 28; canais 2 355 em
  42. (O texto de séries e canais é menor que o do painel real.) Banco novo a cada carga. Nada enviado a provedor.
- **Origem**: `sdd/specs/082-orcamento-armazenamento-tv/evidencias/sonda-tv2.jsonl` (últimas linhas de 2026-10-20).
- **Classificação**: gate (linha de base de SC-001/SC-002/SC-005).
- Tentativas anteriores no mesmo dia (2 instalações) não reportaram nada: a TV estava sem ninguém olhando (R-008). Esta rodada
  funcionou com a TV acordada.

## Resultado (ms) — `loadSection` real e sequência por etapas (código antigo)

| Seção | Rodada | `loadSection` | Ler+interpretar | Descarregar preparo | Reler preparo | Comprimir | **Orçamento** | Transação | Limpar preparo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Filmes | 1 | 22 607 | 3 752 | 678 | 583 | 3 399 | **10 579** | 658 | 1 105 |
| Filmes | 2 | 21 888 | 3 817 | 683 | 585 | 3 418 | **10 618** | 684 | 1 079 |
| Séries | 1 | 3 165 | 1 243 | 0 | 0 | 850 | 701 | 417 | 0 |
| Séries | 2 | 3 157 | 1 135 | 0 | 0 | 856 | 716 | 406 | 0 |
| Canais | 1 | 2 634 | 159 | 0 | 0 | 308 | 1 256 | 575 | 0 |
| Canais | 2 | 2 515 | 168 | 0 | 0 | 411 | 1 350 | 641 | 0 |

## Referência para o gate (D-006: 110 % da rodada mais lenta)

- Filmes: 22 607 ms (SC-001: todas ≤ 10 000; SC-002: orçamento ≤ 1 000, hoje ~10 600 em 35 chamadas).
- Séries: pior rodada 3 165 ms → teto 3 482 ms. Canais: pior rodada 2 634 ms → teto 2 897 ms.

## Leitura

- Filmes confirma a evidência de 2026-10-19: o orçamento é ~48 % da carga (10,6 s). Séries e canais gastam menos no orçamento
  (0,7–1,3 s), mas em canais ele já é a maior etapa (~50 %).
- Aqui a segunda rodada não ficou mais lenta (a variação 22 → 33 s de 2026-10-19 não apareceu neste dia).
