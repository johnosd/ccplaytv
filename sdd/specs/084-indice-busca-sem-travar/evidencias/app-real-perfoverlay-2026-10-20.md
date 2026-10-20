# App real na TV com `PerfOverlay` (feature 084, SC-005) — 2026-10-20

**Classificação**: **registro** lido pela pessoa na TV (contador cumulativo do painel, sem tempos de quadro por entrada).
**Aparelho**: TV de referência QN50Q60DAGXZD, lista real do usuário. Pacote de medição (`VITE_CCPLAY_PERF=1`) instalado por
cima do app, com os dados preservados; ao final, pacote normal reinstalado (sem `PerfOverlay`).
**Leitura**: o usuário abre Filmes → "Todos" → Ordenar → A–Z com a grade já aberta na Início e lê o painel antes e depois.

| # | Código | Estado do app | `quadros>100ms` antes → depois | `parado>100` antes → depois | Percepção |
| --- | --- | --- | --- | --- | --- |
| 1 | **novo** (084) | 1ª abertura após instalar (pré-carga enchendo o catálogo) | 5 → 57 (+52) | — → 22 | — |
| 2 | **antigo** (HEAD, sem a 084) | catálogo quente | 3 → 32 (+29) | 0 → 7 | "foi rápido" |
| 3 | **novo** (084) | catálogo quente | 3 → 33 (+30) | 0 → 12 | "foi rápido; não sei dizer se um pouco mais lento" |

Busca global: o usuário informou que ela não existe/não está acessível na interface hoje ("até prefiro assim"), então não
houve leitura de Busca. Ordenações Ano, Adicionados e Nota (passo opcional, 1ª leitura do código novo): 57 → 60 (+3).

## Leitura honesta

- **Não há ganho mensurável no app real**: +29 (antigo) contra +30 (novo) com o catálogo quente; a leitura #1 (+52) é a
  primeira após instalar, com a pré-carga em curso, e não é comparável.
- **O critério de SC-005 (`quadros>100ms` sem subir ao abrir "Todos" A–Z) não é cumprido** nem pelo código antigo nem pelo
  novo: abrir "Todos" soma ~30 quadros acima de 100 ms nos dois. Isso mostra que, no app real, o custo dominante nessa
  entrada **não é** o que a 084 fatiou (montagem do índice, conversão e ordenação), ou não só ele.
- **O contador não separa uma trava longa de várias curtas**: um congelamento de 1 s no código antigo conta 1; vários
  quadros de ~110 ms no novo contam vários. Por isso a igualdade acima não prova que o congelamento de 933–1 233 ms medido
  na sonda continue existindo no app real; mostra que o contador do painel não o distingue.
- `parado>100` (quadros lentos sem tecla, medidos pelo painel): 0 → 7 no antigo e 0 → 12 no novo; diferença pequena,
  dentro do ruído de uma leitura a olho, mas na direção contrária à desejada. Pode ser trabalho em segundo plano (pré-carga,
  conversão) e não o índice.
- Limites: uma leitura por condição, lida a olho pelo usuário, sem tempo até pronto medido.

## Leitura 4 — código novo com o cache dos formatadores `Intl` (Fase 7, T022)

Pacote de medição com `RatingBadge` e `translate.ts` usando um formatador por idioma; catálogo quente.

| Leitura | `quadros>100ms` | `parado>100` |
| --- | --- | --- |
| Início, antes | 6 | 2 |
| Depois de "Todos" → Ordenar A–Z | 26 (**+20**) | 9 (+7) |
| De volta à Início (cumulativo, inclui a navegação) | 45 (+19) | 16 (+7) |

- **+20** contra +29 (antigo) e +30 (novo sem o cache): parece melhora de ~30 %, mas é uma leitura só, com ruído do contador.
- `parado>100` +7: igual ao antigo (+7) e menor que o do novo sem o cache (+12).
- SC-005 (zero quadros lentos) continua **não cumprido**.
- A leitura de TV ao vivo "Todos" e do guia (T026) **não foi feita**: o usuário encerrou as medições em 2026-10-20.