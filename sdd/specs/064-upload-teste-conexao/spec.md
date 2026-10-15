# Feature Specification: Upload no teste de conexão da TV

**Slug**: `064-upload-teste-conexao`

**Created**: 2026-10-07

**Status**: Convergida

**Input**: pedido do usuário em 2026-10-07, depois de usar o teste da [062](../062-teste-conexao-tv/spec.md) e ver só download, latência e jitter: "qual velocidade de download e upload, sem isso não temos como saber o resultado". A 062 deixou o upload fora de escopo de propósito; esta feature o acrescenta, sem refazer o que a 062 entrega.

**Referências normativas**: constitution; ADR-008 (client-first); ADR-009 (navegação própria); ADR-011 (precedência); V14 §11/§19/§38/§40/§41/§45 (foco, estados, acessibilidade, ciclo de vida, erros). **Herda da 062** tudo o que não é dito aqui: início manual, cancelamento, um teste por vez, bloqueio com mídia ativa, só o último resultado, mensagens sanitizadas, i18n pt/en/es, sem inferir causa nem nota de qualidade (062 FR-003, FR-009..FR-021).

## Escopo

### Incluído

- Medir **upload (Mbps)** no mesmo teste e na mesma ação "Iniciar teste", depois do download, sem execução em paralelo com ele.
- Mostrar o upload no resultado do diálogo e no **último resultado** do card de Configurações › Integrações & BYOK, ao lado de download, latência e jitter.
- Guardar o upload junto do último resultado do aparelho.
- Novo teto do teste inteiro: **60 segundos ou 150 MB** de carga útil (latência, download e upload somados), parando no primeiro limite.
- Situação "completo" passa a exigir as **quatro** métricas; falha só do upload gera resultado parcial.
- Resultado guardado antes desta feature continua válido e visível, com o upload identificado como não medido.
- Textos novos em pt/en/es, inclusive a explicação prévia do que o teste envia.

### Fora de Escopo

- Upload na dica do dock da Home: ela continua mostrando só o download (062 FR-018). Não muda.
- Perda de pacotes, DNS, monitoramento contínuo, execução automática e histórico de medições (continuam fora, como na 062).
- Medir o servidor IPTV, enviar dados da pessoa ou da fonte, reproduzir mídia durante o teste.
- Download e upload simultâneos, ou conexões paralelas para "saturar" o link.
- Recomendar resolução, atribuir nota ou percentual, garantir reprodução ou inferir causa de travamento.
- Migrar, reescrever ou descartar resultados antigos.
- Escolher destino, endpoint, tamanho dos blocos, cálculo da velocidade ou formato de persistência: decisões do `sdd-plan`.
- Tornar a rodada na TV física um gate (ver Clarifications).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Medir e ver o upload no teste (Priority: P1)

A pessoa inicia o teste de conexão, e ele agora mede também a velocidade de envio. No fim, o resultado mostra download, upload, latência e jitter, com data e destino, e fica salvo como último resultado.

**Why this priority**: é o pedido: sem o upload medido, salvo e visível, a feature não existe.

**Independent Test**: com respostas controladas do destino, rodar o teste e conferir as quatro métricas, o teto, o cancelamento e a gravação; depois reabrir o app e consultar o último resultado.

**Acceptance Scenarios**:

1. **Given** destino acessível e nenhuma mídia ativa, **When** SELECT inicia o teste, **Then** ele mede latência, download e upload em sequência, mostra a etapa real em andamento e, ao concluir, exibe Download, Upload, Latência e Jitter com unidades, data/hora e destino.
2. **Given** o teste na etapa de upload, **When** SELECT em "Cancelar" ou RETURN, **Then** o envio é interrompido, a camada fecha, o foco volta ao card de origem e o último resultado guardado não é substituído.
3. **Given** o teto de 60 s ou de 150 MB atingido antes do fim do upload, **When** o teste encerra, **Then** informa o limite, mantém só as métricas válidas e mostra as demais como amostra insuficiente.
4. **Given** download e latência medidos e o upload recusado, bloqueado ou sem amostra válida, **When** o teste termina, **Then** o resultado é parcial, salvo, com Upload como amostra insuficiente e uma mensagem sanitizada; download, latência e jitter continuam visíveis.
5. **Given** falha total (nenhuma métrica válida), **When** o teste termina, **Then** nada é salvo nem substitui o resultado anterior, com tentativa manual e saída (062).
6. **Given** um resultado completo salvo, **When** o app é fechado e reaberto, **Then** o último resultado mostra as quatro métricas e a data, sem nenhuma requisição de medição.
7. **Given** SELECT repetido ou saída/suspensão do app durante qualquer etapa, **When** ocorre, **Then** não há duas execuções, o envio é cancelado e não reinicia sozinho.

---

### User Story 2 - Ver o último upload no card e entender resultados antigos (Priority: P2)

O card do teste em Configurações mostra o upload do último resultado, sempre que existir um salvo. Quem tem um resultado de antes desta feature vê esse resultado como estava, com o upload indicado como não medido.

**Why this priority**: sem isso o upload só aparece logo após medir; o usuário pediu poder consultar o último resultado sempre.

**Independent Test**: semear no aparelho um resultado com upload, um sem upload (antigo) e um parcial, e conferir o card em cada caso, sem abrir o diálogo e sem medir.

**Acceptance Scenarios**:

1. **Given** um último resultado com upload, **When** a pessoa abre Configurações › Integrações & BYOK, **Then** o card mostra Download, Upload, Latência e Jitter e a data, só com dados locais.
2. **Given** um resultado salvo antes desta feature, **When** o card ou o diálogo o mostra, **Then** download, latência e jitter aparecem como antes e o Upload aparece como "não medido neste teste", sem número e sem ser tratado como falha.
3. **Given** um resultado em que o upload foi tentado e não teve amostra válida, **When** é exibido, **Then** o Upload aparece como amostra insuficiente, diferente de "não medido".
4. **Given** nenhum resultado salvo, **When** o card é exibido, **Then** vale a mensagem de vazio da 062, sem métricas.

### Edge Cases

- Conexão com envio muito mais lento que o download: o upload pode terminar por limite com amostra insuficiente; o teto não aumenta sozinho.
- Download consome muito do teto: o upload ainda precisa de uma parte garantida, para um resultado de download rápido não impedir sempre a medição de upload.
- Destino aceita o download e recusa o envio (limite de uso, bloqueio, método não permitido): resultado parcial com upload insuficiente, nunca 0 Mbps.
- Resposta ou conclusão tardia do envio depois de cancelar ou iniciar outro teste: não altera o resultado corrente nem o guardado.
- Falha ao guardar: o resultado atual continua visível, com o aviso de que não foi salvo (062).
- Resultado guardado com campos inconsistentes (upload negativo, zero ou não numérico): é tratado como inválido e não exibido, sem derrubar a tela.
- Troca de idioma muda rótulos e formatação, nunca os valores nem a data.
- Relógio incorreto: a duração não depende de ajustes do relógio (062).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O teste DEVE medir a velocidade de **upload (Mbps)** na mesma ação "Iniciar teste", **depois** do download e sem executar as duas transferências ao mesmo tempo. Não DEVE haver nova ação de início só para o upload.
- **FR-002**: O upload DEVE ter amostra válida e critério de cálculo e de validade documentados no plano, como as demais métricas (062 FR-005). A interface NÃO DEVE apresentar como medição algo que não seja a taxa de envio observada até o destino.
- **FR-003**: Os dados enviados DEVEM ser gerados pelo app, sem nenhum dado da pessoa, da fonte, do catálogo, de credenciais ou de chaves BYOK (062 FR-019 passa a cobrir o envio). O app NÃO DEVE enviar cópia adicional do resultado a nenhum serviço.
- **FR-004**: O teste inteiro DEVE terminar ao concluir as medições ou ao atingir o primeiro teto: **60 segundos desde o início** ou **150.000.000 bytes de carga útil** somando latência, download e upload (cabeçalhos e sobrecarga de protocolo não contam). NÃO DEVE haver aumento automático dos tetos. Isso substitui os 30 s / 100 MB da 062 FR-007.
- **FR-005**: Cada etapa de transferência (download e upload) DEVE ter no máximo **metade do teto**, para que uma não consuma a outra. O plano DEVE definir a contabilização de transferências interrompidas.
- **FR-006**: Ao atingir um teto, o app DEVE interromper as transferências pendentes, identificar o limite atingido e mostrar só métricas válidas; as demais DEVEM aparecer como amostra insuficiente, nunca como zero ou estimativa.
- **FR-007**: O resultado é **completo** somente com as quatro métricas válidas (download, upload, latência e jitter). Com ao menos uma e sem todas, é **parcial**. Sem nenhuma, é falha, não é salvo e não substitui o anterior.
- **FR-008**: Falha, recusa ou ausência de amostra válida **só do upload** DEVE gerar resultado parcial salvo, com mensagem sanitizada e Upload como amostra insuficiente, mantendo download, latência e jitter.
- **FR-009**: "Cancelar", RETURN, saída ou suspensão do app DEVEM interromper também o envio em andamento, sem requisições remanescentes, e NÃO DEVEM alterar o resultado guardado. Valem a execução única e a proibição de reinício automático da 062 (FR-009, FR-010, FR-012).
- **FR-010**: O feedback de execução DEVE indicar a etapa real, com uma etapa própria para o upload, e só mostrar percentual com denominador confiável (062 FR-014). Os controles DEVEM continuar responsivos durante o envio.
- **FR-011**: O último resultado guardado DEVE incluir o upload (quando medido) junto de download, latência, jitter, data/hora, destino e situação. Continua existindo **só um** resultado por aparelho, sem histórico (062 FR-016/FR-017).
- **FR-012**: Um resultado guardado **antes** desta feature DEVE continuar válido e visível, sem migração destrutiva nem perda de dados. Nele, o Upload DEVE aparecer como **"não medido neste teste"**, distinto de "amostra insuficiente", e sem ser tratado como falha.
- **FR-013**: O diálogo e o card de Configurações DEVEM mostrar Download, **Upload**, Latência e Jitter do último resultado, com unidades, data e destino, usando só dados locais, sem medir ao abrir, focar ou consultar (062 FR-003). A dica do dock da Home NÃO DEVE mudar.
- **FR-014**: Valor de upload inválido no que foi guardado (ausente de forma inconsistente, negativo, zero ou não numérico) DEVE ser tratado como indisponível, sem exibir número e sem quebrar a leitura do restante.
- **FR-015**: A explicação exibida antes de iniciar DEVE informar que o teste também **envia** dados gerados pelo app ao destino, e o novo teto de tempo e tráfego. DEVE manter a distinção entre a rota medida e a do provedor IPTV (062 FR-004, FR-020).
- **FR-016**: Falhas do envio DEVEM ter mensagem sanitizada, sem URL, detalhes do destino ou do erro cru, e DEVEM oferecer tentativa manual e saída, sem bloquear catálogo nem outras integrações (062 FR-015).
- **FR-017**: Textos novos DEVEM passar pelo i18n em pt/en/es. UI e navegação seguem tokens, foco e estados V14/ADR-009; toda ação continua operável pelo controle remoto, e não DEVE haver estado sem elemento focável.
- **FR-018**: O app NÃO DEVE inferir causa de travamento, recomendar resolução, garantir reprodução ou atribuir nota/percentual de qualidade a partir do upload (062 FR-020).

### Key Entities *(include if feature involves data)*

- **Métrica de upload**: velocidade de envio em Mbps, com validade baseada nas amostras; pode estar **indisponível por amostra insuficiente** (foi tentada) ou **não medida** (resultado anterior à feature). Os dois estados são diferentes.
- **Último resultado** (estende o da 062): continua sendo o único registro por aparelho, agora com o upload quando houver. Um resultado antigo, sem upload, segue válido.
- **Execução de teste** (estende a da 062): ganha a etapa de upload, e o teto passa a ser do teste inteiro.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% das execuções completas verificadas, o resultado mostra as quatro métricas com unidade, e a situação "completo" só aparece com as quatro válidas.
- **SC-002**: Toda execução verificada dura **no máximo 60 segundos** e solicita **no máximo 150.000.000 bytes** de carga útil no total. Download e upload nunca ocupam mais que metade do teto cada. Ao terminar ou cancelar, não há transferência ativa nem atualização posterior do resultado.
- **SC-003**: Em 100% dos casos de falha só do upload, o resultado salvo é parcial e conserva download, latência e jitter; em nenhum caso aparece 0 Mbps no lugar de ausência.
- **SC-004**: Um resultado salvo antes da feature continua visível após a atualização, com o Upload como "não medido", em 100% das leituras, sem apagar nem alterar o registro.
- **SC-005**: Montagem, foco, consulta do resultado e retorno do app geram **zero** requisições de medição, e o upload visível no card vem só do aparelho. SELECT repetido mantém no máximo uma execução.
- **SC-006**: As requisições verificadas contêm **zero** dados da fonte, do catálogo, de credenciais ou de chaves BYOK, e **zero** envio adicional do resultado pelo app. Os estados novos permanecem compreensíveis em pt/en/es.
- **SC-007**: Após duas medições válidas e reabertura, só a segunda existe como último resultado, com o upload dela; cancelamento e falha total não a substituem.

## Assumptions

- O destino da 062 (Cloudflare) é o ponto de partida, mas **não está confirmado** que ele aceite envio nas mesmas condições (uso sem chave, origem do app empacotado na TV, limites). O `sdd-plan` DEVE verificar isso antes de escolher o destino do upload; se não servir, volta aqui para decidir com o usuário, em vez de trocar de serviço em silêncio.
- Os limites usam unidade decimal e carga útil, como na 062, e são tetos, não duração nem volume obrigatórios.
- O envio é só de bytes sem significado gerados pelo app; ele não identifica pessoa nem lista. O destino ainda recebe os dados de conexão inerentes a qualquer acesso (062, Assumptions).
- Os testes automatizados usam respostas controladas e NÃO medem a rede real. O desktop não prova o comportamento do upload na TV.
- A passada do upload na TV física é **recomendação, não gate** (ver Clarifications). A capacidade de download e do fluxo geral já foi tratada na 062.
- O formato de persistência é decisão do plano; a única exigência é que o resultado antigo continue legível e que não haja perda de dados (FR-012).
- Os valores do teto (60 s / 150 MB) são o pedido do usuário. O plano pode registrar o consumo observado, mas não os altera sem voltar à spec.

## Clarifications

### Sessão 2026-10-07

- Q: Como fica o teto de tráfego e tempo com o upload? → A: Teto total maior: o teste inteiro sobe de 30 s / 100 MB para 60 s / 150 MB, com download e upload usando no máximo metade cada; continua parando no primeiro limite e sem aumento automático.
- Q: Quando o resultado é "completo" e o que acontece se só o upload falhar? → A: Completo exige as quatro métricas; falha só do upload gera resultado parcial salvo, com Upload como amostra insuficiente.
- Q: Como mostrar um resultado antigo, sem upload? → A: Continua válido e visível, com o Upload como "não medido neste teste", distinto de amostra insuficiente; nada é apagado nem migrado.
- Q: Onde o upload aparece além do diálogo? → A: No card de Configurações. A dica do dock da Home não muda.
- Q: A medição de upload na TV física é gate? → A: Recomendação, não gate. O gate é teste automatizado + E2E no desktop; a rodada na TV fica como pendência recomendada.
