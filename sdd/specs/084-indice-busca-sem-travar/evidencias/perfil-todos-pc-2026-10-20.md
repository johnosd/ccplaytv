# Perfil de CPU ao abrir "Todos" A–Z no PC (feature 084, T022) — 2026-10-20

**Classificação**: **diagnóstico** (o PC não aprova desempenho; serve para achar onde o tempo vai).
**Como**: build de produção sem minificar (`vite build --minify false`, nomes de função preservados) servido por
`vite preview`; painel Xtream falso com 12 categorias × 3 500 filmes (42 000), todos já gravados no catálogo; Chromium com
`Emulation.setCPUThrottlingRate` = 4×; perfil `Profiler` a 0,5 ms, `requestAnimationFrame` para os quadros e
`MutationObserver` para marcar quando o carregando e a grade aparecem. O roteiro fica no scratchpad da sessão, fora do
repositório. Só números e nomes de função.

## O que aparece

| Fase | Quadros > 100 ms (CPU 4×) | O que ocupa |
| --- | --- | --- |
| Entrar em "Todos" (ordem da fonte) | 1–3; um quadro de ~820–900 ms **antes** de a tela mostrar o carregando | ~870 ms seguidos de `(program)` (código nativo: compilar/avaliar os chunks lazy da rota, layout), sem função nossa dominando |
| Ordenar → A–Z | 1; um quadro de ~255–285 ms nos primeiros 260 ms depois do OK | ~310 ms seguidos de `(program)` (nativo) no início da troca de modo |
| Resto da montagem e da ordenação | nenhum quadro > 100 ms | comparador de A–Z (`route-vod-category.js:91`) ~850 ms **em fatias**, `decodeBlockChunk` ~260–315 ms, `normalizeForSearch` ~185 ms, `stableSortInSlices` ~65 ms |

- A parte que a 084 fatiou (índice, conversão, normalização, ordenação) aparece **espalhada em tarefas curtas**, sem
  produzir quadro acima de 100 ms nesse perfil.
- Os quadros longos que sobram são **nativos** (`(program)`) e acontecem na entrada da tela e no início da troca de
  ordenação, não dentro do que a 084 fatiou. Isso é compatível com o app real da TV ter o mesmo contador (+29/+30)
  com o código antigo e o novo.

## Custo de CPU achado e corrigido (sem mudar comportamento)

- `RatingBadge` criava um `Intl.NumberFormat` novo **por card e por render** (apareceu como 58–133 ms de tempo próprio por
  entrada com CPU 4×). Passou a usar um formatador por idioma.
- `translate.ts` (`interpolate`) criava um `Intl.NumberFormat` a cada `t()` com parâmetros (aparece no perfil como
  `environmentLanguages`/`s` de `I18nProvider`). Passou a usar um formatador por idioma.
- Depois da correção, `RatingBadge` e `Intl.NumberFormat` saem da lista de funções mais caras do perfil. Medido no PC;
  **o efeito na TV não foi medido**.

## Limites

- Perfil no PC com CPU limitada por software: a proporção entre fases é boa, mas os milissegundos não são os da TV.
- Os quadros nativos de entrada da tela (compilar chunks lazy, layout) não têm causa identificada além de `(program)`;
  achar a causa pede um perfil nativo (tracing do Chromium) que o PC sem GPU/TV não reproduz bem.
- Variação alta entre execuções (3 a 8 quadros > 100 ms entre corridas iguais): os números valem como ordem de grandeza.
