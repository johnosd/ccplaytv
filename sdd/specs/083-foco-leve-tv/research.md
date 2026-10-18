# Research: foco leve na TV

## Decisão

Usar a classe global `.tv-focus` como ponto único de composição e mover o brilho animado para uma camada pseudo-elemento pré-pintada, cuja entrada e saída variam principalmente `opacity`. `outline` e `transform` continuam no elemento focado; `backdrop-filter` fica proibido em grades.

## Justificativa

A sonda 2 mediu 52 fps com `scale(1.06)`, 38 fps com a receita completa e 32 fps com `backdrop-filter`. O V14 §2.3, §2.4, §10 e §11.1/§11.2 recomenda borda + escala + sombra, transições curtas em `transform`/`opacity` e evitar filtros pesados. A mudança preserva a hierarquia visual sem animar a pintura completa do `box-shadow` a cada troca de foco.

## Alternativas consideradas

- **Manter `box-shadow` na transição**: rejeitada porque é exatamente a receita que caiu para 38 fps e teve quadro de 133 ms.
- **Remover todo o glow e manter só outline/scale**: rejeitada porque a medição de 52 fps não comprova equivalência visual a 3 m e o glow é parte do contrato de foco.
- **Usar `backdrop-filter` ou blur**: rejeitada pela medição de 32 fps/217 ms e pela recomendação explícita do V14.
- **Criar uma regra por tela**: rejeitada porque duplicaria o contrato e deixaria grades com comportamentos divergentes; `.tv-focus` já é a superfície compartilhada.

## Incertezas a resolver durante a execução

- Compatibilidade do pseudo-elemento e de `opacity`/stacking com Chromium 108/Tizen 9.0.
- Intensidade e área do brilho que preservam a leitura em capas claras, escuras e saturadas.
- Se a camada precisa de `pointer-events: none`, `isolation` ou `z-index` específico para não alterar seleção e sobreposição.
