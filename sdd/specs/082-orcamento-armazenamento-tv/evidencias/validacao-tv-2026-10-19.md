# Validação física — T050 (2ª rodada, versão revisada)

- **Dispositivo**: Samsung QN50Q60DAGXZD, `192.168.0.2:26101`
- **Pacote**: normal (`npm run build:tizen` de 2026-10-19, com T054–T068 e o bug `vitrine-filmes-estoura-maximum-update-depth`)
- **Instalação**: `deploy-tv.ps1 -SkipBuild`, mesmo certificado (`ccplay_samsung_certificate_4`), **sem desinstalar** —
  os dados no formato antigo (~97 MiB lidos em 2026-10-18) ficaram para testar a recuperação.
- **Conexão**: a TV recusou o `sdb` 3 vezes (Host PC IP 192.168.0.14 conferido, TV reiniciada a frio); aceitou em seguida
  na 1ª tentativa manual — parece a TV ainda subindo o daemon. O preflight do script tenta uma vez só.

## Leituras (observadas pelo usuário)

| Momento | Armazenamento (Sobre & créditos) | STO-01 | Categorias | Guia |
| --- | --- | --- | --- | --- |
| Antes (2026-10-18, versão anterior) | 97 MiB / 80 MiB | — | — | — |
| ~5 min depois de abrir esta versão | **63 MB / 80 MB** | não | abrem | abre |
| ~15 min depois | **43 MB / 80 MB** | não | — | — |
| Depois de fechar e reabrir o app + ~10 min parado | **16 MB / 80 MB (20 %)** | não | — | — |

## Leitura honesta

| Critério | Resultado | Evidência |
| --- | --- | --- |
| SC-001 — lista real ≤ 25 % em Sobre & créditos | **aprovado** | 16/80 MB (20 %), partindo de 97 MiB no formato antigo, sem desinstalar |
| Recuperação do banco cheio (R-019) | **aprovado** | 97 → 63 → 43 → 16 MB sozinho, sem STO-01; categorias e guia abrindo durante a limpeza |
| "Minha Lista" no banco cheio (bug de 2026-10-18) | **aprovado** | filme adicionado com sucesso a ~43 MB e de novo depois de reabrir (usuário) |
| SC-002 — 1ª página ≤ hoje | não executado | precisa do pacote de medição (`VITE_CCPLAY_PERF=1`) |
| SC-003 — nenhum quadro > 100 ms | não executado nesta versão | idem (2026-10-18: 0 quadros longos no Worker do guia, pela sonda) |
| SC-004 — 3 listas e Atualizar da licença | não executado nesta versão | — |
| SC-007 — guia em ≤ 3 s | não reexecutado | 2026-10-18: 1,071 s no Worker (sonda); o guia abriu nesta versão |

Observado pelo usuário na TV; leitura de armazenamento é o `estimate()` mostrado em Sobre & créditos. Como na TV ele
demora a refletir o apagado (R-002), a queda levou ~25 min e uma reabertura do app.

## Pacote de medição (`VITE_CCPLAY_PERF=1`) — leituras parciais

| Leitura | Valor | Validade |
| --- | --- | --- |
| `quadros>100ms` navegando a vitrine | 4 → 27 → 57 → 76; entrar na categoria de 11 mil filmes: 76 → 91 | **inconclusiva**: o contador somava tudo desde a abertura (carga, capas, navegação) |
| `primeiraPágina` (1º pacote) | `?` | **defeito do painel**: a janela (T056) não marcava a entrada — corrigido (T069) |
| `parado>100ms` (2º pacote) | 0 | **não vale para SC-003**: lido na tela de listas, onde pré-carga/conversão não rodam |
| `primeiraPágina` (2º pacote) | 0 ms (`movie ?it first=0`) | real para a pessoa (a grade pintou da memória), mas a leitura foi feita antes pela pré-busca por foco e não era medida — corrigido (T069, linha `:foco`) |

Instalado agora na TV: o **pacote de medição** com as correções da T069 (ainda não medido).
