# Captura rejeitada — não usar como baseline

Interrompida pelo executor em 2026-10-07 (horário local), durante T003, antes de alterar o produto.

Ao conferir as sete amostras de screens-tmdb-20-images, categories-three apresentou duas seleções diferentes. A causa foi addedAt = Date.now() + 1 dentro do loop que fabricava 40 itens: cruzar um milissegundo mudava os desempates. Essa fixture não era determinística.

A linha temporal de atividade continua avançando para os gates de navegação. Somente os dados editoriais de eventos passam a usar CLOCK + (category.order + 1) * 1000, igual nos dois lados futuros. Novo teste cobre igualdade de dados e seleção apesar de diferenças no relógio real.

Manifesto e amostras parciais originais estão preservados. failure.json identifica a interrupção; não há samples.json/report.md completos. O browser headless foi encerrado após verificar seu parent PID e o comando do runner; seus processos terminaram e a trava foi removida pelo próprio runner.

Recapturar toda a matriz em baseline/run-002 com o novo hash de harness. Nenhuma dessas amostras aprova critérios de aceite.
