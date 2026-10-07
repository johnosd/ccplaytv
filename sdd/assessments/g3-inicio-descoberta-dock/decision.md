# Assessment Decision: G3 — Início, descoberta e dock

- **Slug**: g3-inicio-descoberta-dock
- **Decidido**: 2026-10-06
- **Problem**: ./problem.md
- **Veredito**: go para 54 (teste de velocidade); kill no horizonte atual para 30, 31 e clima.

## Scorecard

Avaliação do recorte recomendado, item 54 — teste de conexão:

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | O usuário quer o teste na TV para ajudar a investigar travamentos. Não se infere causa nem bug reproduzido. |
| Força da evidência | adequate | Demanda direta, placeholder confirmado e referência de medição no navegador. Não há frequência medida dos travamentos nem aceite técnico na TV. |
| Valor vs. custo de inação | adequate | Dá evidência no aparelho afetado e evita trocar de ferramenta; o recorte evita três frentes sem demanda atual. Frequência e economia de tempo são desconhecidas e não sustentam alegação de urgência. |
| Viabilidade / apetite | adequate | O usuário escolheu somente o teste; há caminho conceitual direto no cliente. A validação do endpoint em `file://`, da precisão e do encerramento de requisições deve entrar no planejamento e no aceite físico. |
| Fit estratégico | strong | Apoia investigação de reprodução IPTV, respeita client-first e corresponde ao serviço previsto no dock. |

Nenhum critério central depende de afirmar compatibilidade já comprovada: este `go` autoriza o handoff de escopo para especificação. Uma falha técnica no aparelho pode exigir reduzir métricas, trocar a abordagem ou reavaliar viabilidade antes da entrega.

| Frente retirada | Validade | Evidência | Valor / inação | Viabilidade / apetite | Fit |
| --- | --- | --- | --- | --- | --- |
| 30 — curadoria adicional | weak | weak | weak | weak | adequate |
| 31 — descoberta por conversa | weak | weak | weak | weak | adequate |
| 54 — clima | weak | weak | weak | weak | weak |

Para essas três frentes, não há necessidade atual confirmada. A personalização por várias sementes ainda seria nova; o `kill` é por valor/apetite atual insuficiente, não por estar integralmente entregue ou ser tecnicamente impossível.

## Abordagens Candidatas

### 1. Construir todo o restante do pacote original

- Curadoria, chat, clima e velocidade numa única feature.
- **Recomendada**: não. Une problemas independentes e aumenta custo sem demanda correspondente.

### 2. Especificar somente o teste de conexão do dock

- Medição voluntária na TV, limitada e cancelável, com resultado identificado pela rota/destino.
- **Recomendada**: sim. É o único recorte com utilidade atual confirmada pelo usuário.

### 3. Manter todas as frentes em espera

- Preservar os placeholders sem iniciar nova spec.
- **Recomendada**: não para o teste, cuja utilidade foi confirmada; a descoberta existente pode continuar atendendo sem IA adicional.

## Veredito

**go para o teste de velocidade do item 54; kill no horizonte atual para 30, 31 e a fatia clima do 54.** O G3 deixa de ser um pacote de descoberta e passa a um recorte independente de diagnóstico de conexão.

### Motivo das retiradas

- **30**: Dica e “Porque você assistiu” já cobrem parte do objetivo. Combinar favoritos e múltiplas sementes seria uma extensão real, mas o usuário declarou não sentir falta concreta de descoberta agora.
- **31**: a conversa acrescentaria custo/complexidade sem pedido concreto que a justifique. A dependência do 30 no backlog não foi comprovada como necessidade técnica; numa retomada, avaliar o chat por seu próprio problema.
- **Clima**: o usuário atribuiu utilidade apenas ao teste. Não há justificativa para acoplar previsão do tempo ao diagnóstico de IPTV.

**Retomada**: reabrir Define para 30/31 diante de um pedido real não atendido pela descoberta atual; para clima, diante de necessidade explícita. Não se reabre somente para preencher o dock.

### Se go — Handoff

- **Problema**: falta de medição de conexão dentro do app na própria TV para apoiar investigação de travamentos.
- **Abordagem recomendada**: teste direto contra um serviço HTTPS de medição; Cloudflare é candidata prevista pelo V14, não dependência instalada nem escolha de implementação encerrada. Evidência técnica em [explora.md](./explora.md).
- **Escopo sugerido**: acesso `dock-speedtest`, início manual, limites de bytes/tempo, cancelamento efetivo, unidades e destino explícitos, repetição por ação do usuário, falhas sanitizadas e todos os estados navegáveis por SELECT/RETURN. Não iniciar com playback ativo sem resolver na spec a disputa de banda com a reprodução.
- **Métricas de sucesso**: as de [problem.md](./problem.md). Priorizar download e latência; decidir upload/jitter por utilidade e viabilidade, sem prometer perda de pacotes ou métricas não medidas.
- **Perguntas em aberto para `sdd-specify`**: conjunto inicial de métricas; limites máximos de consumo/duração; relação com playback ativo; retenção do último resultado; tratamento de coleta adicional pelo serviço. São refinamentos do recorte confirmado, não dúvida sobre qual problema construir.
- **Pesquisa para `sdd-plan`**: acesso e cabeçalhos de timing sob origem `file://`, compatibilidade do motor com o piso chrome108, cancelamento das transferências, configuração de envio de resultados e ausência de dados da fonte. Se houver nova dependência, observar ADR-006 e licenças; não introduzir backend automaticamente.
- **Validação física**: após unitários/E2E, executar no pacote Tizen, conferir medição/limites/cancelamento. Só a TV comprova a capacidade de medir sua conexão; navegador não prova IPTV nem causa de travamento.

**Backlog**: conservar o ID 54 para o teste, retirar 30/31/clima da fila e registrar as retiradas com este link. 69/32/72 seguem como entregues nas features 060/061. Os quatro placeholders permanecem no código nesta avaliação; não foram entregues nem removidos. A retirada de promessa visual dos itens descartados pode ser avaliada separadamente.

**Próximo passo**: `sdd-specify` do item 54, usando este handoff. Não criar spec nem implementar automaticamente nesta análise.
