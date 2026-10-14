# Assessment Decision: G4 — Acessibilidade de sistema

- **Slug**: g4-acessibilidade-sistema
- **Decidido**: 2026-10-06
- **Problem**: ./problem.md
- **Veredito**: kill

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | weak | Há uma hipótese plausível e intenção no V14, mas nenhuma barreira atual foi relatada; o usuário não vê necessidade agora. |
| Força da evidência | weak | Código e referências demonstram lacunas e uma base técnica, não demanda. O sinal direto do usuário pesa contra construir neste momento. |
| Valor vs. custo de inação | weak | Benefício atual não confirmado; custo de inação não demonstrado, enquanto o pacote acrescentaria três frentes de manutenção e validação. |
| Viabilidade / apetite | weak | Há fundação para legendas e anúncios, mas o usuário declarou ausência de necessidade atual. Caption e Voice Guide no hardware continuam sem verificação; isso não precisa ser resolvido para retirar o pacote. |
| Fit estratégico | adequate | Acessibilidade combina com o V14 e navegação por controle, mas a prioridade do backlog é valor direto ao usuário; alinhamento não substitui problema confirmado. |

## Abordagens Candidatas

### 1. Construir o pacote completo para completar o V14

- Entregar aparência de legendas, alto contraste e anúncios configuráveis juntos.
- **Recomendada**: não. Três frentes sem necessidade atual confirmada não justificam iniciar uma spec.

### 2. Especificar apenas aparência de legendas agora

- Reusar o overlay existente e reduzir o escopo técnico.
- **Recomendada**: não. Menor esforço não cria demanda: também não foi relatada dificuldade com legendas.

### 3. Retirar o pacote da fila e retomar diante de evidência concreta

- Preservar recursos atuais e requisitos normativos; registrar o item 56 como retirado por decisão de produto.
- **Recomendada**: sim. Corresponde à resposta do usuário e evita compromisso de implementação sem problema demonstrado.

## Veredito

**kill para o pacote G4 no horizonte atual.** A resposta direta do usuário — “Nao vejo necessidade nisso agora” — elimina o apetite para iniciar essas frentes neste momento. Os critérios centrais de problema, evidência e valor estão abaixo de `adequate`; não há fundamento para `go` nem pergunta pendente que exija `needs-clarification` antes desta retirada.

### Se kill — Motivo

O G4 estava na fila por intenção do Design System, sem barreira atual confirmada. Não construir agora é uma decisão de produto; não implica que acessibilidade seja dispensável para outros usuários ou que o app esteja conforme todos os requisitos assistivos.

**Retomada**: reabrir Define se aparecer dificuldade concreta de leitura/visão, pessoa que dependa de narração ou exigência comprovada de publicação. Selecionar a frente necessária antes de investigar plataforma e planejar. Requisitos do V14 permanecem documentados; não se presume dispensa comercial.

**Backlog**: remover G4 dos pacotes para especificar e registrar item 56 em Retirados, com referência a esta decisão. IDs dos demais itens permanecem estáveis. Os três placeholders continuam honestos no app; não foram entregues nem removidos por esta avaliação.

**Próximo passo deste assessment**: nenhum. Não há handoff para `sdd-specify`.
