# Feature Specification: Teste de conexão da TV em Configurações

**Slug**: `062-teste-conexao-tv`

**Created**: 2026-10-06

**Status**: Convergida

**Input**: `sdd-specify` a partir de [decision.md](../../assessments/g3-inicio-descoberta-dock/decision.md), item **54** do backlog. O usuário quer medir a conexão da TV para ajudar a investigar travamentos. Definiu: execução em Configurações; download, latência e jitter; até 30 segundos ou 100 MB; guardar apenas o último resultado no aparelho, com data e destino.

**Referências normativas**: constitution; ADR-008 (client-first), ADR-009 (navegação própria), ADR-011 (precedência e placeholders); V14 §20/§21.5 (dock e diagnóstico), §11/§19/§38/§40/§41/§45 (foco, estados, acessibilidade, ciclo de vida e erros). Component Lab `services`/`byok`; protótipo `settingsIntegrations()`/`speedTestModal()`; guias Samsung locais 03 e 08. Os valores, medidor e classificação “ótima para 4K” do protótipo são ilustrativos, não dados nem critérios de diagnóstico.

## Escopo

### Incluído

- Teste em **Configurações › Integrações & BYOK**, substituindo o placeholder de velocidade por serviço real, sem chave do usuário.
- Download em Mbps, latência e jitter em ms, contra destino externo identificado.
- Início manual, execução limitada a **30 segundos ou 100 MB**, cancelamento, resultado completo/parcial, erros e repetição manual.
- Apenas o último resultado válido guardado no aparelho, com data/hora, destino e situação.
- Dock do Início como atalho para o card em Configurações, sem segunda superfície de execução e sem iniciar medição ao abrir/focar.
- Navegação por setas, SELECT e RETURN, saída focável em todos os estados e restauração da origem.
- Remoção de `dock-speedtest` do registro de placeholders quando os acessos reais forem entregues.

### Fora de Escopo

- Upload, perda de pacotes, DNS, monitoramento contínuo, execução automática e histórico de medições.
- Medir servidor IPTV, testar URL de stream ou reproduzir mídia durante a medição.
- Corrigir AVPlay/codec/rede; diagnosticar definitivamente travamentos; recomendar resolução ou inventar nota/percentual de qualidade.
- Clima, curadoria (30), chat (31), voz, pareamento ou integração com erros do player.
- Backend obrigatório, relay, conta CCPlay, chave do desenvolvedor, exportação ou sincronização.
- Remover placeholders de IA/clima ou reorganizar outras áreas de Configurações.
- Escolher motor, algoritmo, endpoint definitivo, modelo de persistência ou migração: decisões do `sdd-plan`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Medir a conexão em Configurações (Priority: P1)

A pessoa abre o serviço de teste em Configurações, inicia a medição e vê download, latência e jitter reais, com data e destino. Pode cancelar, repetir e consultar o último resultado depois de reabrir o app.

**Why this priority**: entrega o diagnóstico solicitado mesmo sem o atalho do Início.

**Independent Test**: entrar diretamente em Configurações; verificar sucesso, erro, limite e cancelamento com respostas controladas e persistência após reabertura. Executar medição real na TV para comprovar a capacidade no aparelho.

**Acceptance Scenarios**:

1. **Given** nenhum resultado guardado, **When** a pessoa abre o serviço, **Then** vê destino, limites, explicação e “Iniciar teste” focável, sem requisições de medição nem números demonstrativos.
2. **Given** destino acessível e nenhuma mídia ativa, **When** SELECT inicia, **Then** há feedback e “Cancelar”; ao concluir, aparecem as três métricas válidas com unidades, data/hora e destino.
3. **Given** teste em andamento, **When** SELECT em “Cancelar” ou RETURN, **Then** interrompe transferências, fecha a camada e restaura foco no card de origem, sem substituir o resultado guardado.
4. **Given** primeiro limite atingido, **When** o teste encerra, **Then** informa o limite, mantém apenas métricas válidas e identifica as demais como amostra insuficiente.
5. **Given** falha de rede/destino, **When** não há medição válida, **Then** exibe mensagem sanitizada, tentativa manual e saída; não apresenta velocidade zero nem apaga o último resultado.
6. **Given** resultado completo ou parcial guardado, **When** o app reabre e a pessoa consulta o serviço, **Then** vê “Último teste” com data e destino, sem consulta externa automática.
7. **Given** navegação da reprodução para Configurações, **When** a pessoa inicia o teste, **Then** a sessão de mídia já está encerrada; se ainda estiver ativa, o teste não inicia e informa o impedimento.
8. **Given** SELECT repetido ou saída/suspensão do app, **When** esses eventos ocorrem, **Then** não há execução concorrente; saída/suspensão cancela e o retorno não reinicia automaticamente.

---

### User Story 2 - Acessar o diagnóstico pelo dock (Priority: P2)

No Início, o ícone de velocidade leva ao card do teste em Configurações, mantendo o dock compacto e permitindo retorno ao contexto original.

**Why this priority**: torna útil o acesso já desenhado, sem criar outra tela de diagnóstico.

**Independent Test**: com o serviço de Configurações disponível e resultado local conhecido, selecionar o dock, conferir aba/card focados e voltar; não é necessário executar uma medição externa nesta jornada.

**Acceptance Scenarios**:

1. **Given** foco no ícone, **When** a pessoa move foco, **Then** há somente informação local, sem requisições de medição.
2. **Given** ícone selecionado, **When** SELECT, **Then** abre Configurações › Integrações & BYOK no card do teste, sem iniciar execução.
3. **Given** diálogo aberto após entrada pelo dock, **When** RETURN, **Then** fecha/cancela primeiro o diálogo; voltar depois de Configurações restaura ícone e posição do Início.
4. **Given** resultado guardado, **When** o ícone recebe foco, **Then** mostra resumo compacto identificado como último teste, com data, sem alegar estado atual da conexão.

### Edge Cases

- Sem fonte, TMDB ou catálogo: acesso pelas Configurações independentes da fonte continua funcionando.
- Sem internet, destino recusado/limitado ou incapacidade de medir: saída e tentativa manual, nunca 0 Mbps/0 ms como substituto de ausência.
- Conexão lenta/rápida: teto permanece; amostra insuficiente não aumenta automaticamente tempo/tráfego.
- Cancelamento/suspensão descarta execução; término por limite pode produzir resultado parcial explicitamente identificado.
- Resposta tardia após cancelamento ou nova execução não altera resultado corrente/guardado.
- Troca de lista não muda o último resultado, que pertence ao aparelho; troca de rede não torna a medição antiga atual.
- Relógio incorreto: data local não implica horário validado externamente; duração não depende de ajustes no relógio.
- Falha ao guardar: resultado atual continua visível, com aviso de que não foi salvo, sem bloquear nova tentativa.
- Troca de idioma altera rótulos/formatação, não valores e data da medição.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O app DEVE oferecer o teste em Configurações › Integrações & BYOK, inclusive sem fonte IPTV, TMDB ou chave de integração.
- **FR-002**: O atalho `dock-speedtest` DEVE abrir esse local com aba/card focados, sem iniciar medição. O acesso por Configurações DEVE funcionar sem o dock.
- **FR-003**: Abrir, focar, consultar resultado salvo e retomar o app NÃO DEVEM medir a rede. Início e repetição DEVEM exigir SELECT em ação explícita.
- **FR-004**: Antes de iniciar, a interface DEVE informar destino/serviço, teto de 30 segundos ou 100 MB, consumo de tráfego e que o resultado caracteriza a rota até aquele destino.
- **FR-005**: O teste DEVE medir **download (Mbps)**, **latência de requisições ao destino (ms)** e **jitter (ms, variação entre amostras dessa latência)**. Cada valor DEVE ter amostra válida e critério de cálculo/validade documentado no plano; a interface NÃO DEVE chamar a medição de ping ICMP.
- **FR-006**: Resultado DEVE mostrar unidade, destino, data/hora e situação completa/parcial. Métrica ainda não calculada ou inválida DEVE aparecer como indisponível, nunca como zero ou estimativa sem amostra.
- **FR-007**: A execução DEVE terminar quando concluir as medições ou atingir o primeiro teto: **30 segundos desde o início da medição** ou **100.000.000 bytes de carga útil total de teste**, incluindo medições de latência. Não se incluem cabeçalhos/sobrecarga dos protocolos. Transferências solicitadas DEVEM caber nesse orçamento; o plano DEVE definir contabilização de respostas interrompidas. NÃO DEVE haver aumento automático dos tetos.
- **FR-008**: Ao atingir teto, o app DEVE interromper transferências pendentes, identificar o limite atingido e mostrar apenas métricas válidas; sem nenhuma válida, DEVE apresentar amostra insuficiente com tentativa manual e saída.
- **FR-009**: “Cancelar” DEVE estar sempre acessível durante execução. Cancelar/RETURN DEVE interromper transferências, fechar a camada e devolver foco à origem. Novo teste NÃO DEVE deixar requisições do anterior em andamento.
- **FR-010**: DEVE existir no máximo uma execução ativa. SELECT repetido e respostas tardias NÃO DEVEM duplicar trabalho, reabrir a camada ou sobrescrever outro teste/resultado após cancelamento.
- **FR-011**: A navegação para Configurações DEVE preservar o encerramento existente da reprodução. O teste NÃO DEVE iniciar com sessão de mídia ainda ativa: DEVE informar a necessidade de encerrá-la e oferecer saída. O teste não encerra nem retoma mídia automaticamente.
- **FR-012**: Sair/fechar a superfície de diagnóstico ou suspender/ocultar o app DEVE cancelar a execução. Ao voltar, DEVE estar ocioso ou mostrar o último resultado salvo; nunca reiniciar automaticamente.
- **FR-013**: Inicial, execução, resultado, limite, erro e impedimento por mídia ativa DEVEM ter ação focável e operável por SELECT. RETURN DEVE fechar a camada antes de sair de Configurações; foco e posição da origem DEVEM ser restaurados.
- **FR-014**: Feedback de execução DEVE refletir atividade/etapa real. Percentual só DEVE aparecer com denominador confiável; senão, usar indicação indeterminada. Navegação e cancelamento DEVEM continuar responsivos.
- **FR-015**: Falhas de rede, recusa/limitação do serviço e impossibilidade de medir DEVEM ter mensagem sanitizada, tentativa manual e saída, sem bloquear catálogo, outras integrações ou Configurações.
- **FR-016**: O app DEVE guardar **somente o último resultado com ao menos uma métrica válida**, completo ou parcial, com data/hora, destino, métricas e situação. Nova medição válida substitui a anterior; cancelamento, falha total e amostra totalmente insuficiente não a substituem. Guarda DEVE sobreviver ao fechamento, sem histórico.
- **FR-017**: O resultado DEVE pertencer ao aparelho, compartilhado entre listas e sem vínculo a credenciais/catálogo. Falha de guarda DEVE ser comunicada sem perder visualização da medição atual. Limpeza geral de dados locais DEVE removê-lo.
- **FR-018**: Resultado guardado DEVE ser identificado como “Último teste” com data, sem alegar estado atual nem revalidação automática. Dock DEVE ficar compacto; ao focar, mostrar resumo/data somente de dados locais ou informar que não há teste.
- **FR-019**: O teste NÃO DEVE enviar catálogo, histórico, favoritos, credenciais, chaves BYOK, URLs de fonte/stream ou identificadores da lista ao destino. O app NÃO DEVE enviar cópia adicional dos resultados para analytics/telemetria; o plano DEVE verificar/desabilitar esse comportamento em motor candidato. Tráfego necessário à medição é esperado.
- **FR-020**: A interface NÃO DEVE inferir causa de travamento, recomendar resolução, garantir reprodução ou atribuir nota/percentual de qualidade. A explicação DEVE distinguir a rota medida da rota do provedor IPTV.
- **FR-021**: UI/navegação DEVEM seguir tokens, foco, estados e acessibilidade V14/ADR-009. Textos DEVEM passar pelo i18n em pt/en/es; dados não vêm dos exemplos fictícios do protótipo.
- **FR-022**: A entrega DEVE substituir os placeholders de velocidade nos dois acessos e remover somente `dock-speedtest` de `comingSoon.ts`; não implementa nem remove IA/clima.
- **FR-023**: A capacidade DEVE ser validada no app empacotado na TV física após os testes automatizados/E2E, cobrindo sucesso, limite e cancelamento. Encerramento da feature DEVE registrar essa evidência; desktop/emulador não satisfaz esse aceite.

### Key Entities *(include if feature involves data)*

- **Execução de teste**: tentativa com destino, início, etapa, consumo de carga útil, duração e situação (executando, concluída, limitada, cancelada ou falhou). Não representa sessão IPTV.
- **Métrica medida**: tipo, valor, unidade e validade baseada nas amostras; pode estar indisponível.
- **Último resultado**: único registro local por aparelho, com data/hora, destino, métricas válidas e situação completa/parcial. Não contém dados da fonte nem exige perfil de pessoa.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Os dois acessos chegam ao diagnóstico por controle remoto; em 100% dos cenários inicial, execução, resultado, erro e limite há saída operável e retorno à origem. Sem fonte, acesso por Configurações funciona.
- **SC-002**: Montagem, foco, consulta do resultado salvo e retorno do app geram **zero requisições de medição**; SELECT repetido mantém **no máximo uma execução**.
- **SC-003**: Toda execução verificada mede por até **30 segundos** e solicita no máximo **100.000.000 bytes de carga útil**. Ao terminar/cancelar, não há transferências ativas daquela execução nem atualização posterior de resultado.
- **SC-004**: 100% das métricas exibidas em sucesso/parcial são rastreáveis às amostras e ao cálculo documentado. Falha/insuficiência nunca produz valores fictícios nem garantia de reprodução.
- **SC-005**: Após duas medições válidas e reabertura, apenas a segunda existe como último resultado. Cancelamento/falha total não a substitui; troca de lista permite consultá-la e limpeza geral a remove.
- **SC-006**: Requisições verificadas contêm **zero dados da fonte/catálogo ou chaves BYOK**, com **zero envio adicional de resultados pelo app**. Mesmas ações/estados permanecem compreensíveis em pt/en/es.
- **SC-007**: Na TV física, executar sucesso real com as três métricas, encerramento por limite e cancelamento/liberação da rede. Registrar aparelho, versão, destino, duração, consumo e resultados medidos, sem credenciais. São gate da feature; navegador/emulador não substitui essa evidência.

## Assumptions

- Público inicial: pessoa usando a TV de referência e querendo evidência de conexão para investigar travamentos; não há diagnóstico de causa confirmado.
- Serviço acessível sem fonte/conta CCPlay e sem chave. Cloudflare é candidata do V14, não escolha técnica encerrada; verificar viabilidade/configuração no `sdd-plan`.
- “100 MB” usa unidade decimal e carga útil; não promete medir sobrecarga dos protocolos. Limites são tetos, não duração/volume obrigatórios.
- A escolha de Configurações preserva o padrão existente: `App.tsx` troca a tela e `usePlayerSession.ts` fecha a sessão ao desmontar. Isso fundamenta FR-011, sem alegar validação física já executada.
- Plano define cálculo/amostragem; não se promete medir o máximo contratado pela operadora, ICMP ou perda de pacotes.
- O destino recebe necessariamente tráfego e dados de conexão associados ao acesso. Proibir cópia adicional dos resultados pelo app não promete ausência de registros de rede no serviço externo.
- Formato de persistência e eventual migração/versão livre serão conferidos no planejamento.

## Clarifications

### Sessão 2026-10-06

- Q: Quais métricas entram na primeira versão? → A: Download, latência e jitter.
- Q: Como deve se comportar quando há vídeo em reprodução? → A: “deve ser feito em um local de configuracoes”. Aplicação: executar em Configurações, com dock como atalho; preservar encerramento normal do player ao sair da tela, sem concorrência entre medição e reprodução.
- Q: Qual limite por execução, encerrando no primeiro limite e declarando amostra insuficiente? → A: Até 30 segundos ou 100 MB transferidos.
- Q: O último resultado fica disponível depois de fechar/reabrir? → A: Guardar só o último resultado no aparelho, com data e destino.

### Nota de 2026-10-07 (feature 064)

- O **upload**, que esta feature deixou fora de escopo, entrou pela [064](../064-upload-teste-conexao/spec.md): o mesmo teste passa a medir também o envio, com teto de 60 s / 150 MB no total (30 s / 75 MB por etapa) e resultado "completo" só com as quatro métricas. O motor desta feature (`runSpeedTest`) e seus contratos continuam como estão; o upload é uma etapa de uma camada nova (`runConnectionTest`). O resultado guardado antes da 064 continua válido, com o upload "não medido".
