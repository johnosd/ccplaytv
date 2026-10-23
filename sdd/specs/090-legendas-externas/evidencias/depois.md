# Medição "depois" na TV (T042) — G-2 e SC-009, feature 090

**Data**: 2026-10-23 · **Aparelho**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120, `file://`), IP `192.168.0.12`
**Classificação**: **gate** (navegação e reprodução ociosa) + **registro** (passos interativos, memória) · **o que não foi
medido está dito na seção 6.**
**Origem**: `app-metricas-tv-2026-10-23-{A1,A2,B1,B2,B3-com-legenda}.jsonl` (coletor local, build de medição com
`VITE_CCPLAY_PERF`/`VITE_CCPLAY_METRICS_REPORT`; sonda automática só com `→`/`↓`, regra da 089).

## 1. O que foi instalado e como terminou

| Passo | O quê |
| --- | --- |
| Build A | `85e2ead` (sem a 090) buildado num worktree à parte; marcadores de medição presentes, `device/subtitles` ausente |
| Build B | árvore atual (com a 090), mesmas variáveis; `device/subtitles` presente |
| Mesma sessão | A1, A2, B1, B2 (sonda de navegação, 4 janelas de 60 s cada) e as reproduções |
| Fim | pacote **normal** reinstalado (sem a string do canal de métricas), coletor parado, worktree removido; `applist` só com o CCPlayTV. Nada desinstalado; reinstalar com o mesmo certificado preservou listas e dados |

A chave pessoal do SubDL ficou salva no aparelho (digitada pelo usuário na TV). **Remover** pela tela Integrações →
Legendas se não for mais usada.

## 2. Navegação (SC-009a) — medianas em navegação plena (`teclaN ≥ 13`)

| Rodada | Thread presa | `longTaskMs` | Pior tarefa | fps | `worstMs` | janelas | `falhas` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 (sem a 090) | 25,5% | 1 277 | 312 | 40 | 317 | 49 | 0 |
| A2 (sem a 090) | 22,9% | 1 145 | 292 | 44 | 267 | 49 | 0 |
| B1 (com a 090) | 20,8% | 1 039 | 286 | 45 | 300 | 45 | 0 |
| B2 (com a 090) | 21,0% | 1 071 | 266 | 44 | 283 | 48 | 0 |

**Ruído entre as duas rodadas do build A**: 2,6 pontos de thread presa, 4 fps, 50 ms de pior quadro. B fica **dentro ou
abaixo** do A em tudo (−2 a −5 pontos de thread presa, fps 44–45 contra 40–44). Não há regressão; **não** se afirma
ganho — a diferença está no tamanho do ruído.

Janelas da sonda (fps / pior quadro ms), A × B: Filmes 32–41 / 650–717 × 38–41 / 683–850; Séries 42–47 / 483–550 ×
45–47 / 517–600. O pior quadro de Filmes em B1 (850 ms) é o maior de todas as rodadas; B2 voltou a 683 ms (ruído).

## 3. Reprodução (SC-009b)

| Situação | Duração observada | Long tasks no app | Quadros |
| --- | --- | --- | --- |
| Build A, sem legenda | ~4,5 min | **0** | sem janela com atividade (camada web ociosa) |
| Build B, sem legenda | ~38 s | **0** | idem |
| Build B, **com legenda externa ativa** | ~60 s (12 janelas de 5 s contíguas) | **0** | idem |

Com a camada web ociosa o medidor não registra quadros; o que vale é a ausência de tarefas longas. O `heapMB` ficou
constante durante cada reprodução. **A legenda ativa não acrescentou nenhuma tarefa longa na reprodução.**

## 4. O que o usuário viu na TV (G-2, só observação dele)

Com a legenda externa ativa: a fala apareceu no tempo certo; acentos corretos; legível e acima da barra de controles; tocou
~60 s sem travar. (Observação do usuário, 2026-10-23; sem captura de tela.)

## 5. Ponto aberto: tarefas longas na sessão interativa — NÃO atribuídas

Na sessão manual com a legenda (digitar a chave, abrir Configurações, buscar, aplicar), o medidor registrou tarefas
longas isoladas de **0,75 a 1,6 s** (maiores: 1 301, 1 453, 1 210, 1 424 e uma janela com 1 631 ms). Como o usuário
operou sem roteiro, **não dá para dizer qual passo as causou** (teclado/IME da chave, teste da chave na rede, abertura do
diálogo, busca, parse e gravação, ou a navegação de volta). O build A tem tarefas de ~0,5–0,8 s ao sair do player, mas não
passa de 1,0 s. Um build com tempos por passo (`parse`, `apply`, `gzip`, `save`, troca de idioma) foi feito e **não
instalado** — o usuário optou por encerrar a medição. O código dessa instrumentação foi revertido (nada dela no pacote).

Isto **não** é um achado de regressão — é uma lacuna: o tempo de cada passo interativo da 090 na TV continua sem número.

## 6. O que NÃO foi medido

- **Tempo até começar a tocar** (SC-009): o app não tem esse marcador e criá-lo mudaria o build A. Não executado.
- **Pausa, seek ±30 s e retomar com a legenda** (quickstart C2) e **troca pt-BR ↔ inglês ×10 ≤ 100 ms** (C7): não executados.
- **10 min de reprodução e memória estável** (C6): só ~60 s com a legenda; heap constante durante cada reprodução. O heap
  cresce com o tempo de uso do app (10 MB logo após instalar; 23 MB no fim do A2 e 26 MB no fim do B2, que incluem a
  navegação e a reprodução do usuário) — comparação de memória A × B **não** é conclusiva e fica como registro.
- Rodadas independentes: 2 por build para a navegação; 1 para cada reprodução.

## 7. Leitura honesta

- A hipótese da D-012 ("nada da 090 fora do player e antes do `playing`") **se sustenta** onde foi medida: navegação sem
  regressão e reprodução ociosa sem tarefas longas, com e sem legenda.
- **G-2 aprovado em parte**: legenda visível, acentos e posição (usuário) e SC-009 (a) e (b) dentro do ruído. Ficam como
  pendência explícita C2, C5, C6, C7 e a atribuição do §5. Nada foi afrouxado depois de ver o resultado.
- Segurança: os `.jsonl` só têm `source`, números e rótulos fixos; busca por `http`, `opensubtitles`, `subdl` e `.srt`
  deu 0 ocorrências nos cinco arquivos.
