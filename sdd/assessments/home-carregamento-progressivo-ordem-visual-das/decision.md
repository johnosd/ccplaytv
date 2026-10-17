# Assessment Decision: Home — carregamento progressivo e ordem visual das fileiras

- **Slug**: home-carregamento-progressivo-ordem-visual-das
- **Decidido**: 2026-10-16
- **Problem**: ./problem.md
- **Veredito**: go

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | Relato direto do usuário, apoiado pelo código: consultas independentes fazem `rowKeys` mudar conforme os dados chegam; hero e metadados também são separados. A dor é de experiência, não uma suposição abstrata. |
| Força da evidência | adequate | Há confirmação no código e precedente de TV para fileiras pulando em Filmes/Séries. Falta a medição temporal da Home na TV real; isso é gate explícito da Fase 0, não motivo para declarar a causa fechada. |
| Valor vs. custo de inação | strong | Acontece no primeiro contato com cada abertura de lista e afeta percepção de prontidão, foco e confiança no histórico. |
| Viabilidade / apetite | adequate | Existe padrão recente no próprio produto para compor fileiras e há pontos claros de instrumentação. O risco é prender a Home esperando uma consulta lenta ou degradar foco; a spec deve exigir limite de espera e recuo. |
| Fit estratégico | strong | Reforça a navegação por controle remoto, a regra de estados focáveis, a ordem do Design System e a exigência de medir desempenho no aparelho. Mantém o modelo client-first. |

## Abordagens Candidatas

### A. Composição progressiva por prioridade visual, com limite de espera

- Medir a sequência atual; dar prioridade ao billboard e às fileiras de cima,
  manter a ordem estável e liberar um conjunto inicial em uma janela curta.
  Dados que chegarem depois atualizam o conteúdo sem inserir uma linha acima
  do que já foi apresentado. Um estado focável cobre a janela até o primeiro
  conjunto ficar pronto.
- **Recomendada**: sim — ataca a percepção de ordem sem exigir carga eager e
  permite recuar para uma composição menor se a TV mostrar custo alto.

### B. Bloqueio até todas as consultas da Home terminarem

- **Recomendada**: não — simplifica a ordem, mas faz a consulta mais lenta
  controlar a primeira interação e pode repetir o congelamento percebido em
  outras áreas.

### C. Apenas skeletons mantendo cada posição reservada

- **Recomendada**: não como solução completa — reduz o deslocamento visual,
  mas não resolve hero incompleto nem mede quando o conteúdo prioritário está
  pronto. Pode ser parte da abordagem A para estados ainda não resolvidos.

## Veredito

**go.** O problema é válido, recorrente e diretamente observável na
implementação. A evidência é adequada para avançar porque há relato do usuário,
causa estrutural plausível no código e precedente do próprio produto. O go não
fecha a causa nem fixa tempos: a primeira etapa da spec deve medir a Home na TV
de referência, comparar com browser/E2E separadamente e definir o limite de
composição e o critério de recuo.

### Se go — Handoff

- **Problema**: a Home aparece parcialmente enquanto consultas independentes
  terminam; hero e fileiras chegam em momentos diferentes e podem deslocar a
  ordem percebida, deixando a primeira entrada lenta e imprevisível.
- **Abordagem recomendada**: A — medir a sequência atual, compor por prioridade
  visual de cima para baixo, reservar/estabilizar a estrutura e aplicar um
  limite curto com estado focável; atualizações tardias não podem inserir uma
  fileira acima do conteúdo já mostrado.
- **Escopo sugerido**: entra a Home, suas consultas de hero/fileiras,
  instrumentação e validação na TV; não entra catálogo eager, novas fileiras,
  redesign editorial ou correções gerais de Filmes/Séries.
- **Métricas de sucesso**: p50/p95 de entrada até billboard, primeira fileira
  e Home estável; zero inversão de ordem e zero deslocamento estrutural tardio;
  foco/SELECT/RETURN preservados; p95 de tecla → foco durante carga no máximo
  20% pior que a linha de base.
- **Perguntas em aberto pro sdd-specify**: qual janela de composição a medição
  suporta; se o billboard deve ser liberado antes das fileiras; quais dados
  são prioritários quando “Continuar” e “Canais favoritos” competem; e qual
  comportamento visual deve representar uma consulta que exceda o limite.
