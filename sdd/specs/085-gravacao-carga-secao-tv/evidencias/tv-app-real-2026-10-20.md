# App real na TV com o build de medição (2026-10-20)

- **Aparelho**: QN50Q60DAGXZD, Tizen 9. Build de medição (`VITE_CCPLAY_PERF=1`, `VITE_CCPLAY_METRICS_REPORT` apontando para o PC na
  LAN) instalado com `deploy-tv.ps1 -SkipBuild` (dados preservados), autorizado pelo usuário. Uma **Atualizar** da lista real feita pelo
  usuário. Ao final, o pacote normal (sem as variáveis) foi reinstalado; o coletor foi parado.
- **Origem**: `evidencias/app-metricas.jsonl` (63 linhas: 60 `frames`, 3 `section-load`, 2 `assembly`). **Classificação**: registro
  (SC-006) e gate de SC-008.

## Carga por seção (app real, lista real, uma rodada)

| Seção | Itens | Categorias gravadas | Ler | Codificar | Orçamento (chamadas) | Commit | Preparo (escrever) | Portão | **Total** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Filmes | 43 546 | 34 | 5 932 | 1 702 | **3 672 (2)** | 255 | 0 | 1 | **11 692 ms** |
| Séries | 9 776 | 28 | 2 737 | 404 | 1 719 (1) | 50 | 0 | 1 | 4 983 ms |
| Canais | 2 355 | 42 | 1 044 | 1 429 | 0 (0) | 0 | 0 | 2 | 2 563 ms |

## SC-008 (nada do provedor nas linhas)

As 63 linhas têm só as chaves `source, slow, idleSlow, screen, reason, revealMs, pending, deferred, imagesRequested, imagesSettled, fps,
worstMs, over50, kind, outcome, items, categories, written, *Ms, budgetCalls`. Todo valor de texto é um rótulo fixo (`channel`,
`movie`, `series`, `done`, `home`, `cap`, `cache`); nenhum nome, URL ou credencial (busca por `http`, `senha` e `password`: 0).

## Leitura honesta

- O canal funcionou ponta a ponta: o app real mandou as linhas ao coletor da LAN. SC-006 e SC-008 atendidos.
- **A carga de filmes no app real levou 11,7 s**, acima dos 8,8 s da sonda e dos 10 s do SC-001. SC-001 é um critério da sonda;
  aqui é registro, mas o número existe e importa. Duas diferenças aparecem nas etapas:
  - **O orçamento custou ~1,8 s por chamada** (3 672 ms em 2 chamadas; séries 1 719 ms em 1) contra ~29 ms por chamada na sonda. Na
    sonda o banco é novo e pequeno; no app real há as outras tabelas da lista (episódios, estados, guia, outras categorias). É a
    hipótese R-001 do plano acontecendo: a conta por categoria cresce com o catálogo. Só houve 2 chamadas porque a maioria das
    categorias estava igual à gravada (renovação sem novidade não chama o orçamento).
  - **A leitura (rede + interpretar) levou 5,9 s** contra 3,8 s da sonda, que lê do PC pela LAN; aqui vem do provedor.
- O preparo não foi usado (escrita 0), como previsto para 43 546 itens.
- Uma única rodada: serve de registro, não de média. A sonda continua sendo o gate de comparação.
