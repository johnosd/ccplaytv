# Assessment Decision: G2 — Integridade da carga e do catálogo

- **Slug**: g2-integridade-carga-catalogo
- **Decidido**: 2026-10-06
- **Problem**: ./problem.md
- **Veredito**: kill

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | weak | Nenhum dos cinco pontos foi observado pelo usuário (respostas de 2026-10-06); 36 e 24 já têm a proteção principal no código (FR-017 da 005; chave lógica estável). |
| Força da evidência | weak | Só brechas teóricas (36) e casos hipotéticos (26 com M3U fora do padrão; 66/51 com 300 mil itens). A lista real tem ~55 mil itens e coube inteira. |
| Valor vs. custo de inação | weak | Custo de inação baixo; os descartes já são declarados com aviso e contagem. |
| Viabilidade / apetite | adequate | Tecnicamente viável, mas 24, 66 e 51 eram de dificuldade Alta (integridade de dados e desempenho em escala). |
| Fit estratégico | weak | O usuário prioriza valor direto e player; não quer busca global, o que tira o 66 do produto. |

## Abordagens Candidatas

### Não construir; reabrir por evidência

- Retirar o pacote das Ideias Futuras e registrar aqui as condições de reabertura de cada item.
- **Recomendada**: sim — nenhum item tem dor demonstrada.

### Fatiar só o 36 como endurecimento

- Tornar atômica a checagem de importação em andamento (ler e gravar na mesma transação).
- **Recomendada**: não agora — a brecha é teórica e a dedup já existe; se aparecer uma reprodução, entra como `sdd-bugfix`, não como feature.

## Veredito

`kill`. O scorecard tem validade do problema, força da evidência e valor vs. custo de inação como `weak`, e o usuário confirmou não ter visto nenhum dos sintomas. O pacote era defensivo: protegia contra casos que não aconteceram com a lista real e, no caso do 66, contra o desempenho de uma função que o usuário nem quer.

### Se kill — Motivo

Por item, com a condição de reabertura:

- **36 (dedup da importação)** — a dedup por fonte já existe (FR-017 da 005, `ImportAlreadyRunningError`); resta só uma brecha teórica de atomicidade. Reabrir como **bug** (`sdd-bugfix`) se aparecer importação duplicada ou contagem dobrada.
- **26 (Não classificados)** — só afeta M3U de tipo não reconhecido; a lista real é Xtream e o aviso nunca apareceu. Reabrir se uma lista M3U real mostrar "Entradas de tipo não reconhecido ficaram de fora" com itens que a pessoa queira ver.
- **24 (reconciliação pós-resync)** — a chave lógica estável já protege favoritos, progresso e histórico, e nada foi perdido. Reabrir como **bug** se houver perda após resync.
- **66 (busca global por blocos)** — o usuário não quer busca global; o modelo desejado é a busca em Filmes e em Séries. Morto pela decisão de produto, não só por falta de medição.
- **51 (descarte por falta de espaço)** — a lista real coube; sem quota da TV medida, não há o que desenhar. Reabrir se aparecer o aviso "A lista não coube inteira no aparelho" ou quando o benchmark (item 35, G5) medir a quota.

**Observação fora do pacote**: a busca global da 026 (`SearchScreen`) continua no app. A frase do usuário sugere uma decisão de produto própria (manter, esconder ou retirar), que não foi tomada aqui.
