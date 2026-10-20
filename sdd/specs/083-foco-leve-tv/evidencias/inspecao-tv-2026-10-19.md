# Inspeção na TV e app real (T020/T021) — 2026-10-19

**Classificação: registro (SC-006) e inspeção visual (SC-005).** Quem viu: o usuário, na TV, com o build de medição
(`VITE_CCPLAY_PERF=1`) instalado por `deploy-tv.ps1 -SkipBuild`, sem desinstalar (dados preservados), com a lista real dele.
Receita no app: **C1** (sombra estática; só `transform` e `background` animam).

## Inspeção visual (SC-005, SC-003, SC-004)

Roteiro: leitura do foco a ~3 m com capas claras, escuras e saturadas; primeiro e último card; troca rápida de foco; movimento
reduzido; categoria com poucos cards; SELECT/RETURN em uma superfície de cada família (botão, campo, linha do Live, player).

**Resultado informado pelo usuário: "tudo certo, o foco se comporta bem em todos os casos".** Sem efeito preso, corte ou perda
de leitura relatados. O usuário não detalhou caso a caso; o que consta aqui é o veredito geral dele sobre o roteiro.

## Painel de medição (SC-006, registro)

Uma única leitura, em foto do painel com o controle **parado** (`tecla: sem tecla`): `quadros>100ms=76` e `parado>100ms=7`
(contadores acumulados da sessão, que incluem abertura, navegação e capas), `primeiraPágina=0ms`; leituras de entrada de
categoria de filmes com 11 378 itens (`read=4098` e `read=3168` ms — tempo de leitura do catálogo, não do foco).

**Não capturado:** fps, pior quadro e quadros > 50 ms **durante a navegação** (a linha `tecla:` só aparece com tecla nos
últimos 2 s e a foto foi tirada parada). Portanto SC-006 fica **sem números de navegação no app real**; o gate de desempenho
(SC-001/SC-002) está na sonda, que não depende disso (`sonda-candidatas-tv-2026-10-19.md`).

## Estado final da TV

Pacote normal reinstalado em seguida (T022); a sonda já havia sido desinstalada.
