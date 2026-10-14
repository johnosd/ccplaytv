# Feature Specification: Portal web da TV por QR code e licença anual

**Slug**: `069-portal-tv-licenca-anual`

**Created**: 2026-10-10

**Revised**: 2026-10-11 — revisão sdd-specify após entrevista de arquitetura e clarificação de produto.

**Status**: Encerrada com riscos aceitos

**Input**: Como usuário do CCPlayTV, quero acessar um portal autenticado para minha TV por QR ou device ID/device key, gerenciar configurações Xtream e M3U por URL guardadas no serviço e comprar uma licença anual de R$35 para aquela TV.

## Escopo

### Incluído

- Portal para celular/computador, sem conta pessoal obrigatória; sessão temporária por QR ou device ID + device key. Usuários-alvo: pessoas configurando e licenciando sua própria TV; piloto inicial de 10–50 TVs.
- Entrada em Configurações globais da TV para acesso ao portal, revogação de credenciais/sessões, teste/licença, compra e código da licença e recuperação pelo próprio site. Atalho na tela de listas para adicionar pelo site.
- Adicionar, editar e remover configurações Xtream e M3U por URL, preservando categorias e campos complementares já suportados, inclusive EPG aplicável. A TV baixa/importa a URL; o serviço guarda apenas a configuração, nunca o arquivo M3U ou o catálogo.
- Retenção permanente cifrada das configurações fornecidas pelo usuário no portal, enquanto cadastradas. Reabrir, substituir campos e reenviar à TV autorizada sem revelar os segredos guardados ao navegador.
- Pendências enquanto a TV estiver offline, conflitos explícitos, confirmação do estado aplicado e acompanhamento separado da importação. Estado informado como último conhecido quando estiver desatualizado.
- Remoção na TV também remove a configuração correspondente do portal e cancela pendências. Sem conexão, registrar a intenção de exclusão localmente para comunicá-la depois; nenhuma sincronização pode recriar a lista por conta própria.
- Recuperação de acesso/licença na mesma TV após reinstalação pelo próprio site, com código da licença guardado pelo usuário e confirmação do destino, revogação dos acessos antigos e possibilidade de reenviar configurações ainda guardadas. Não recupera catálogo ou dados locais apagados.
- Teste completo de sete dias consecutivos; depois, licença anual de R$35 por TV, compra avulsa e renovação manual. Vencimento bloqueia a próxima entrada na lista. Uma sessão já aberta continua até sair da lista ou fechar o app; seleção/gestão, configuração, compra e dados locais permanecem acessíveis.
- Brasil, BRL, Pix e cartão. Compra iniciada na TV conclui no celular/site; compra também disponível no portal. Ativação automática depois da confirmação confiável do pagamento e do próximo contato da TV.
- Licença local vigente autoriza entrada na lista; vencimento posterior não encerra a sessão já admitida. Consulta diária quando online recebe renovações e revogações; falha de rede não invalida licença vigente. Fluxo de QR/configuração/compra aberto na TV antecipa a consulta.
- Backup diário dos dados de controle e configurações cifradas, com objetivo de perda máxima de 24 horas de alterações e restauração manual documentada e ensaiada.

### Fora de Escopo

- Upload, envio ou armazenamento remoto de arquivo M3U; criar um novo tipo de fonte por arquivo. O armazenamento local já utilizado pela TV para baixar/importar URLs continua existente.
- Gestão remota de chaves TMDB/OpenAI, chaves compartilhadas do desenvolvedor, voz/IA, fornecimento ou revenda de IPTV.
- Conta pessoal obrigatória, renovação automática, licença para várias TVs, transferência entre aparelhos e recuperação baseada somente em identificadores públicos.
- Pagamento integral pelo controle remoto, coleta de cartão na TV, player web, catálogo na nuvem, proxy/transcodificação ou migração de importação/reprodução para servidor.
- Sincronização de favoritos/histórico/progresso entre TVs, exportação pública de credenciais, leitura remota de segredos existentes apenas na TV e recuperação geral de dados locais apagados.
- Painel administrativo web, cupons e venda internacional. Recuperação não exige atendimento; tratamento de estorno não inclui construir solicitação própria de reembolso.
- Definir ou implementar stack, hospedagem, algoritmos de cifragem, armazenamento de chaves ou mecanismo técnico de identidade nesta spec; decisões já tomadas estão na ADR-013 e no plano técnico.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gerenciar listas da TV pelo navegador (Priority: P1)

Como usuário, quero acessar o portal da minha TV e configurar listas sem digitar URLs e senhas pelo controle remoto.

**Why this priority**: entrega configuração remota útil com cobrança desligada, mantendo configuração local e reprodução existentes.

**Independent Test**: com uma TV de teste e cobrança desativada, autorizar uma sessão, adicionar/editar/remover configurações fictícias Xtream e M3U URL e conferir estado aplicado/importação na TV. Não depende de compra ou recuperação pelo site.

**Acceptance Scenarios**:

1. **Given** a tela de gerenciamento na TV, **When** o usuário lê um QR válido, **Then** abre uma sessão temporária restrita àquela TV, sem conta pessoal, identificando o destino e a expiração.
2. **Given** o portal, **When** informa device ID/device key válidos, **Then** acessa somente a TV correspondente; ID isolado, chave inválida/revogada, sessão vencida e acesso a outra TV são recusados.
3. **Given** uma sessão autorizada, **When** adiciona Xtream ou M3U URL, **Then** acompanha envio, aplicação e importação separados; categorias da fonte são preservadas e o servidor não baixa arquivo ou catálogo.
4. **Given** a TV offline, **When** envia uma alteração, **Then** ela permanece pendente pelo prazo informado; ao retomar uma consulta, aplica uma única vez ou informa conflito/erro/expiração. Não prometer entrega imediata fora do fluxo rápido.
5. **Given** uma lista existente, **When** edita ou remove pelo portal, **Then** afeta somente essa lista, preserva identidade/estado compatível e pede confirmação na TV antes de alteração destrutiva que afete uso ativo.
6. **Given** alterações concorrentes na TV e no portal, **When** uma revisão obsoleta tenta substituir a atual, **Then** mostra conflito para revisão, sem sobrescrita ou recriação silenciosa.
7. **Given** uma lista também gerenciada no portal, **When** é removida diretamente na TV, **Then** deixa de existir localmente e sua configuração é removida do portal, com cancelamento das pendências; se offline, a exclusão remota é comunicada no próximo contato, sem recriar a lista antes disso.

### User Story 2 - Gerenciar configurações guardadas e recuperar acesso (Priority: P2)

Como usuário, quero editar e reenviar configurações guardadas e obter recuperação pelo site de acesso na mesma TV após reinstalar o app.

**Why this priority**: reduz redigitação e permite recuperar configurações guardadas com autoatendimento na mesma TV, sem exportar segredos locais.

**Independent Test**: a partir de registros fictícios de uma TV/configuração já cadastrados, testar reenvio, substituição, exclusão e recuperação pelo site com ou sem uma licença de teste preexistente. Não requer compra real nem a interface de cadastro da US1.

**Acceptance Scenarios**:

1. **Given** uma configuração cadastrada, **When** a TV confirma aplicação e o portal é reaberto, **Then** a configuração continua guardada cifrada e são exibidos somente metadados e estado, sem devolver senha ou URL secreta.
2. **Given** uma configuração guardada, **When** o usuário substitui campos ou solicita reenvio, **Then** cria nova tentativa autorizada, preservando campos secretos deixados vazios e respeitando revisão/conflito; reenvio não exige redigitar segredos que continuam guardados.
3. **Given** uma entrega cancelada ou expirada, **When** consulta a configuração guardada, **Then** ela continua cadastrada; reenviar exige ação explícita e nova tentativa, sem repetir comando terminal.
4. **Given** reinstalação na mesma TV, **When** o usuário abre a recuperação no site e informa o código da licença guardado, **Then** confirma o destino e restabelece o vínculo existente sem atendimento, revogando acessos e código anteriores e mostrando um novo código para guardar. ID/DUID isolado, código inválido/usado e outra TV são recusados; teste/vencimento não mudam e catálogo apagado não é recuperado.
5. **Given** exclusão confirmada no portal ou na TV, **When** o serviço a processa, **Then** remove segredo ativo e pendências, impede recriação por estado antigo e informa que backups protegidos expiram conforme retenção definida no plano.

6. **Given** o vínculo da TV cadastrado, **When** o usuário escolhe mostrar o código da licença, **Then** pode anotá-lo ou fotografá-lo, recebe orientação para guardá-lo em segurança e encontra a opção de recuperação no próprio site. O código não aparece em URLs, comprovantes ou telas comuns.
7. **Given** perda do código e de todos os acessos autenticados anteriores, **When** tenta recuperar, **Then** o site informa que não é possível recuperar automaticamente, sem conceder novo teste ou aceitar ID público como prova.

### User Story 3 - Comprar e renovar licença anual (Priority: P2)

Como usuário, quero pagar R$35 por uma licença anual da minha TV, por Pix/cartão, sem renovação automática.

**Why this priority**: entrega licenciamento comercial, testável com fontes locais e independentemente da gestão remota de configurações.

**Independent Test**: com TV e fontes locais de teste, usar ambiente de pagamento de teste para comprar/renovar, observar ativação, recusas, duplicações, expiração e funcionamento offline. Não depende de enviar listas pelo portal.

**Acceptance Scenarios**:

1. **Given** primeiro uso elegível com internet, **When** inicia o teste, **Then** informa início/fim dos sete dias consecutivos e permite as funcionalidades existentes; reabertura não reinicia o prazo.
2. **Given** teste/licença vencido, **When** tenta entrar numa lista, inclusive por RETURN do seletor, **Then** vê motivo e ações comprar/renovar/voltar sem abrir o catálogo; seleção/gestão, configuração, compra e dados locais continuam acessíveis.
3. **Given** compra pela TV ou portal autorizado, **When** abre o checkout, **Then** identifica a TV beneficiária, R$35 como preço final, validade de 12 meses, Pix/cartão e renovação manual antes de pagar.
4. **Given** pagamento pendente, recusado ou cancelado, **When** consulta a situação, **Then** vê o estado real e nenhuma nova licença é concedida; recibo visual ou retorno do checkout não bastam.
5. **Given** pagamento confirmado, **When** a TV comunica no fluxo rápido ou próxima consulta diária, **Then** ativa uma vez, sem código adicional ou perda de dados, mesmo que o checkout já tenha sido fechado.
6. **Given** licença ainda vigente, **When** renova, **Then** adiciona 12 meses ao vencimento atual; se vencida, conta 12 meses desde a confirmação do pagamento, sem conceder dias duplicados por reenvio.
7. **Given** licença válida guardada na TV, **When** a consulta diária falha, **Then** permite entrada offline enquanto vigente, distinguindo rede de expiração/revogação. Se vencer após entrar, mantém a sessão até sair da lista ou fechar o app; a próxima entrada revalida.
8. **Given** estorno/revogação confirmado no serviço, **When** a TV realiza uma consulta bem-sucedida, **Then** aplica o estado atualizado, preservando dados e outras concessões válidas; offline não se promete revogação imediata.

### Edge Cases

- QR vencido/revogado, sessão que expira durante edição, chave inválida, tentativas repetidas, múltiplos navegadores e perda do celular.
- TV offline além do prazo de entrega; cancelamento/expiração não apagam a configuração corrente e não aplicam comandos antigos ao reconectar.
- URL inválida ou com credenciais, resposta vazia/HLS em vez de catálogo, fonte duplicada, credencial recusada e falta de espaço local. Erros de importação não apagam a geração anterior válida.
- Remoção local offline concorrente com comando remoto antigo; reconexão e restauração de backup não podem ressuscitar a lista removida.
- Edição/remoção que afete lista ativa durante reprodução ou importação; exigir confirmação segura, sem trocar a lista ativa ou interromper uso silenciosamente.
- Pagamento aprovado após fechar página, callbacks duplicados/fora de ordem, webhook perdido e tentativa de recomprar enquanto um pedido estiver pendente.
- Estorno de uma renovação com outras compras válidas: recalcular somente a concessão afetada e os períodos dependentes, sem apagar direitos pagos não estornados.
- Relógio alterado, suspensão, reinício e reinstalação; não presumir novo teste, recuperação por identificador público ou proteção inviolável contra adulteração do aparelho.
- Vencimento durante sessão/reprodução: manter navegação, novas reproduções e retomada até sair da lista ou fechar o app; bloquear próxima entrada. RETURN do seletor também revalida. Revogação confirmada continua encerrando controladamente, preservando retomada aplicável.
- Falha de backup, perda das chaves de recuperação ou restauração de dados antigos; reconciliar pagamentos, revogações e exclusões antes de reabrir o serviço.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE identificar a TV por device ID e autorizar acesso remoto com credencial verificável; ID isolado NÃO DEVE autorizar.
- **FR-002**: A TV DEVE oferecer QR temporário e alternativa endereço web + device ID/device key, sem conta pessoal obrigatória. **Atualização (071, 2026-10-14):** o QR passa a ser fixo, gerado na TV, sem requisição (ADR-016).
- **FR-003**: QR e sessões DEVEM ter validade finita e informar expiração; device key permanente NÃO DEVE integrar a URL do QR. O plano DEVE definir limites testáveis de validade e uso do convite. **Atualização (071):** o QR fixo carrega ID e chave **no fragmento** e não expira (muda só com "Gerar nova chave"); o convite efêmero fica só na recuperação pelo site. Constitution 1.11.0 (e).
- **FR-004**: O usuário DEVE poder sair da sessão e, pela TV, revogar sessões/regenerar device key, invalidando acessos anteriores sem perder licença, configurações guardadas, catálogo ou preferências.
- **FR-005**: O portal DEVE identificar o destino e impedir acesso, alteração, reenvio ou compra para outra TV sem autorização; tentativas inválidas DEVEM ser limitadas.
- **FR-006**: O portal DEVE adicionar/editar/remover Xtream e M3U por URL, preservando campos complementares locais aplicáveis. NÃO DEVE aceitar upload, guardar arquivo M3U ou baixar catálogo no servidor.
- **FR-007**: O sistema DEVE validar entradas e limites definidos no plano, distinguir envio, aplicação e importação, apresentar erros sanitizados e identificar estados desatualizados. Falha de importação NÃO DEVE apagar geração anterior válida.
- **FR-008**: Download de lista, importação, classificação, catálogo e reprodução DEVEM continuar na TV. Indisponibilidade do portal NÃO DEVE impedir configuração local ou invalidar licença vigente conhecida.
- **FR-009**: Alterações DEVEM sobreviver à TV temporariamente offline pelo prazo informado, mostrar pendente/aplicado/erro/expirado e permitir nova tentativa. Aplicado exige confirmação do estado efetivo; recebimento não equivale a aplicação ou importação concluída.
- **FR-010**: Reenvio/reconexão NÃO DEVEM duplicar operações, listas ou importações. Conflitos DEVEM exigir revisão; comando obsoleto ou terminal NÃO DEVE sobrescrever alteração mais recente ou recriar dado removido.
- **FR-011**: Edição DEVE preservar identidade e estado compatível da lista; remoção DEVE informar impacto e não afetar outras listas. Alteração destrutiva que afete lista em uso DEVE aguardar confirmação na TV antes de interromper uso ou excluir dados.
- **FR-012**: Configurações Xtream e M3U URL fornecidas no portal DEVEM permanecer cifradas enquanto cadastradas, permitindo edição e reenvio autorizado depois da aplicação. Campo secreto ausente/vazio mantém o valor; apagar exige ação explícita.
- **FR-013**: O portal DEVE mostrar somente metadados e estados não secretos; NÃO DEVE devolver ao navegador segredos guardados no serviço nem exportar valores existentes apenas na TV. Campos de entrada secretos permitem substituição sem revelar o valor anterior.
- **FR-014**: Segredos NÃO DEVEM aparecer em logs, URLs comuns, erros, telemetria, analytics, exportações públicas ou comprovantes, nem chegar ao pagamento. As exceções restritas da constitution 1.8.0 permitem convite QR efêmero e exibição protegida de device key/código de recuperação por ação explícita para guardar ou fotografar; nunca chave permanente/código em URL. Backup operacional protegido pode conter configurações cifradas, separado das chaves. **Atualização (070, 2026-10-13):** a constitution 1.10.0 acrescenta exceções restritas — chave do dispositivo sempre visível só na tela Adicionar da TV e valores salvos devolvidos apenas à sessão `manage` da mesma TV (rota `values`, `no-store`). Proibições de log/URL/QR/erro/exportação permanecem. Ver `## Atualização (070)` ao fim.
- **FR-015**: Configurações enviadas pelo portal DEVEM ser protegidas em trânsito e cifradas na retenção permanente. O serviço só pode decifrar no fluxo autorizado. Aplicação, cancelamento ou expiração encerram entrega, sem apagar configuração corrente; exclusão permanente elimina segredo ativo e cancela pendências. O plano DEVE definir prazos de entrega, versões, metadados e backups e recuperação protegida das chaves.
- **FR-016**: A TV DEVE oferecer teste completo de sete dias consecutivos desde primeiro início elegível, com internet para iniciar, exibindo início/fim. Reabertura, regeneração de device key ou recuperação NÃO DEVEM reiniciar o teste.
- **FR-017**: Após teste, entrar no catálogo de uma lista DEVE exigir licença vigente daquela TV. A guarda DEVE cobrir escolha, abertura após importação/verificação do provedor e RETURN do seletor para a lista anterior. Vencimento durante sessão já admitida NÃO DEVE interromper navegação, novas reproduções ou retomada; próxima entrada, inclusive após fechar/reabrir o app, revalida localmente. Seleção/gestão, configuração, compra e dados locais NÃO DEVEM ser bloqueados nem apagados.
- **FR-018**: Licença DEVE valer 12 meses de calendário para uma TV, com renovação manual. Renovação antecipada estende o vencimento existente; renovação vencida começa na confirmação. O plano DEVE tratar limites de calendário sem perder dias já pagos.
- **FR-019**: TV/portal DEVEM exibir validade e situação, distinguindo teste, licença vigente, expiração, revogação confirmada, pagamento pendente e indisponibilidade de atualização. Estado remoto antigo DEVE ser identificado como último conhecido.
- **FR-020**: Compra DEVE iniciar pela TV via QR para checkout web ou pelo portal autenticado, identificando a TV beneficiária antes de pagar; não concluir pagamento pelo controle remoto.
- **FR-021**: Checkout DEVE atender Brasil/BRL, Pix/cartão e apresentar R$35 como preço final por 12 meses para uma TV, em compra avulsa e sem renovação automática. Preço DEVE ser definido pelo serviço, sem aceitar alteração pelo cliente.
- **FR-022**: Ativação/renovação DEVE exigir confirmação confiável junto ao provedor de pagamento; retorno do navegador, screenshot, pedido criado ou Pix emitido NÃO DEVEM bastar.
- **FR-023**: Confirmações duplicadas ou fora de ordem NÃO DEVEM gerar licença duplicada ou meses extras. Pedido/licença DEVEM ser conciliáveis ao reabrir TV/portal; pedido pendente NÃO DEVE iniciar nova cobrança automaticamente.
- **FR-024**: Pagamento confirmado DEVE ativar automaticamente quando a TV comunicar, sem código adicional. Primeira ativação e recebimento de renovação exigem internet; fechar o checkout NÃO DEVE perder a compra confirmada.
- **FR-025**: Licença validada DEVE autorizar entrada local/offline até o vencimento conhecido. Depois dele, nenhuma nova entrada é permitida sem renovação válida; sessão já admitida permanece até sair da lista ou fechar o app, conforme FR-017. Falha de contato NÃO DEVE ser apresentada como recusa/revogação nem bloquear licença vigente.
- **FR-026**: Vencimento DEVE bloquear a próxima entrada, sem encerrar a sessão já admitida. Estorno/revogação confirmado recebido pela TV DEVE encerrar controladamente o acesso se não houver outra concessão vigente, preservando dados e retomada aplicável; estorno NÃO DEVE apagar direitos válidos independentes.
- **FR-027**: Licença DEVE ser verificada localmente contra adulteração e destino incorreto; alteração simples do relógio NÃO DEVE reiniciar teste ou estender validade. O plano DEVE provar o comportamento suportado e explicitar limitações sem relógio confiável, antes de liberar cobrança; não prometer DRM inviolável.
- **FR-028**: Funções locais essenciais DEVEM manter setas/SELECT/RETURN; web é complemento para configuração. Loading, vazio, erro e bloqueio DEVEM ter ação focável; focar NÃO DEVE iniciar compra/importação/reprodução.
- **FR-029**: TV DEVE seguir V14 Spectrum, escala vigente da 068 e separação global/lista da 067; textos de produto em pt/en/es, sem traduzir nomes do provedor. Portal DEVE funcionar com teclado/touch e feedback acessível.
- **FR-030**: Em uso normal, a TV DEVE consultar configurações e licença a cada 24 horas quando conectada, persistindo o prazo entre reaberturas. Ao voltar/reconectar, executar consulta vencida. Abrir QR/configuração/compra DEVE consultar imediatamente e atualizar rapidamente enquanto aberta; sair DEVE encerrar o modo rápido. Falha diária NÃO DEVE invalidar licença local vigente.
- **FR-031**: Recuperação após reinstalação na mesma TV DEVE ocorrer pelo próprio site, sem atendimento, com código da licença previamente guardado pelo usuário e confirmação do destino. A TV DEVE permitir exibir o código por ação explícita para anotar/fotografar, explicando sua função de credencial privada; o portal DEVE orientar recuperação e regeneração autorizada. Recuperação DEVE preservar teste/licença/configurações ainda cadastradas, revogar acessos antigos e substituir o código após uso. Código inválido/reutilizado, ID/DUID isolado ou outra TV NÃO DEVEM autorizar. Sem código nem acesso anterior, informar impossibilidade de recuperação automática, sem novo trial. Não prometer catálogo apagado.
- **FR-032**: Dados de controle/licenças e configurações cifradas DEVEM ter backup diário protegido, objetivo de perda máxima de 24 horas de alterações, detecção de falhas e restauração manual documentada e ensaiada. Recuperação das chaves DEVE ser protegida separadamente. Restaurar NÃO DEVE duplicar licença, reativar acesso revogado ou ressuscitar configuração excluída; reconciliar alterações posteriores antes de reabrir.
- **FR-033**: Remover uma lista na TV DEVE também remover sua configuração correspondente no portal e cancelar pendências, preservando licença e outras listas. Offline, a exclusão local DEVE persistir até ser comunicada no próximo contato; comandos antigos NÃO DEVEM recriar a lista. O portal DEVE distinguir exclusão remota pendente de exclusão confirmada. Exclusão no portal com TV offline DEVE cancelar entregas antigas e manter a intenção de remoção até confirmação, sem declarar exclusão local antes dela.

### Key Entities

- **TV**: beneficiário identificado, credenciais revogáveis, estado local e vínculo de teste/licença; não equivale a conta pessoal ou conta IPTV.
- **Convite/sessão**: autorização temporária limitada à TV, finalidade e prazo; distinta da device key permanente.
- **Lista/configuração**: identidade lógica estável, tipo Xtream/M3U URL, nome e parâmetros; cópia aplicada na TV e configuração fornecida no portal guardada cifrada, com estados separados.
- **Alteração/exclusão**: destino, revisão, prazo de entrega, estado e confirmação; cancelamento/expiração não equivalem a excluir a configuração corrente.
- **Teste/licença**: elegibilidade, TV, período e situação; independente da assinatura IPTV e da device key.
- **Pedido/pagamento**: oferta anual de R$35, TV beneficiária, confirmação e conciliação, sem dados de cartão ou credenciais IPTV.
- **Código/desafio de recuperação**: código privado guardado pelo usuário, desafio temporário da mesma TV, consumo único e revogação de acessos/código antigos; sem catálogo local.
- **Backup operacional**: cópia protegida de dados de controle e configurações cifradas, retenção limitada e restauração ensaiada; separado da recuperação das chaves.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: QR/manual autorizam somente a TV correta em todos os cenários de aceite; ID isolado, chave inválida/revogada, QR expirado e tentativas de outra TV são recusados.
- **SC-002**: Criar/editar/remover Xtream e M3U URL passa nos cenários online, offline/reconexão, conflito, expiração e reenvio; nenhuma repetição duplica lista/importação e nenhum comando antigo recria lista removida. Nenhum fluxo aceita arquivo M3U ou o armazena no servidor.
- **SC-003**: Com TV conectada e tela de QR/configuração/compra aberta, pelo menos 95% das alterações recebem confirmação de recebimento em até 30 segundos. Importação é medida separadamente. Fora dessas telas, consulta automática a cada 24 horas, recuperando prazo vencido ao voltar; abrir tela rápida consulta imediatamente. Medições incluem primeiras chamadas após ociosidade, sem omitir amostras lentas.
- **SC-004**: Edições preservam favoritos/histórico/retomada compatíveis e outras listas. Configuração guardada sobrevive a aplicação/cancelamento/expiração da entrega; reenvio e exclusão passam sem segredo em respostas de leitura, UI de consulta, URLs comuns, logs, diagnósticos ou comprovantes. **Atualização (070):** vale para leituras comuns (`SourceView`, listas, diagnósticos); a única rota que devolve valores salvos é `GET /portal/v1/configurations/{sourceId}/values`, para a sessão da mesma TV.
- **SC-005**: Pix/cartão passam em ambiente de pagamento de teste por confirmação, pendência, recusa, cancelamento, duplicação, retorno tardio e estorno. Oferta exibe e cobra exatamente R$35/12 meses/uma TV; somente confirmação confiável concede uma vez, sem preço alterável pelo cliente.
- **SC-006**: Pelo menos 95% das TVs conectadas com tela rápida aberta refletem a licença em até 60 segundos após confirmação. Fora dela, ativação ocorre na próxima consulta diária; offline, quando voltar conforme prazo vencido ou abertura do fluxo rápido. Renovação antecipada preserva dias pagos; amostras frias são incluídas.
- **SC-007**: Sete dias de teste, 12 meses, limites de calendário, vencimento dentro da lista sem interrupção, bloqueio ao reentrar (escolha/RETURN/abertura pós-importação), tentativa de adulteração e indisponibilidade são verificados com tempo controlado. Licença conhecida vigente funciona offline; dados sobrevivem a bloqueio/reativação. Limitações do relógio no aparelho são registradas antes de cobrar.
- **SC-008**: Funções locais essenciais, inclusive loading/vazio/erro/bloqueio, são concluídas por setas/SELECT/RETURN. Portal funciona por teclado/touch; retorno restaura foco e nenhum foco inicia ação externa. Textos de produto são verificados em pt/en/es.
- **SC-009**: Antes de cobrança real, preço de R$35 refletido na oferta, conflitos normativos resolvidos, backup/restore e recuperação pelo site ensaiados, testes automatizados/E2E e pagamento de teste aprovados, além de QR → pagamento → ativação validado na TV física.
- **SC-010**: Backup diário e detecção de falhas são demonstrados; ensaio de restauração mede perda de alterações de no máximo 24 horas no cenário nominal e registra tempo de recuperação. Reconciliar pagamentos/revogações/exclusões impede duplicar concessão ou restaurar configuração excluída; falha de backup é reportada, sem declarar o objetivo garantido.
- **SC-011**: Guardar/fotografar código e recuperar pelo site na mesma TV são verificados sem atendimento. Código inválido/usado, desafio expirado, tentativas repetidas, duas recuperações concorrentes e outra TV são recusados; somente uma recuperação prevalece. Acesso/código antigos deixam de valer, novo código é entregue de forma recuperável, teste/vencimento não mudam e reenvio exclui fontes removidas. Restore antigo não revalida código usado. Não presumir catálogo apagado ou transferência.
- **SC-012**: Exclusão pela TV conectada, exclusão local offline, exclusão pelo portal com TV offline e restauração de backup antigo são verificados: após reconciliação não resta configuração ativa no serviço ou pendência capaz de recriar a lista; licença e outras listas permanecem. Retenção de cópias antigas e prazo de entrega são informados conforme plano.

## Assumptions

- R$35 é o preço final da licença anual, por TV e por compra/renovação. Não inclui conteúdo IPTV, assinatura de provedor ou créditos de APIs. A referência operacional de infraestrutura é R$10/mês e pertence ao planejamento operacional.
- Teste começa no primeiro uso elegível com internet e dura sete dias corridos, inclusive com TV desligada. O plano prova identidade/tempo no alvo antes de prometer garantia comercial.
- Ano significa 12 meses de calendário; datas e vencimentos devem ser inequívocos. Reabertura, troca de navegador, regeneração de key ou recuperação pelo site não concedem novo teste nem apagam licença paga.
- QR autoriza sessão temporária sem confirmação adicional na TV nesta versão; exceção restrita do convite efêmero está formalizada na constitution 1.8.0. Key permanente nunca integra URL.
- Alterações remotas não trocam lista ativa nem interrompem reprodução silenciosamente; efeitos destrutivos durante uso aguardam confirmação na TV.
- Falha de rede não equivale a revogação. Revogação/renovação só chegam no próximo contato bem-sucedido; offline, a licença conhecida autoriza entrada até vencer; sessão já admitida segue FR-017.
- Configuração permanente significa enquanto cadastrada, não retenção ilimitada após exclusão. Cópias de backup expiram segundo política do plano; exclusão ativa não promete apagamento instantâneo de todos os backups.
- Portal/configuração podem ser entregues antes de habilitar cobrança. Compra e restauração reais dependem dos gates comerciais, normativos, de plataforma e de operação.

## Constraints & Planning Handoff

- Esta spec descreve comportamento de produto; não altera a constitution nem declara implementação, lançamento comercial ou recursos provisionados.
- ADR-013 registra decisões de arquitetura aceitas, incluindo retenção cifrada e backup das configurações fornecidas no portal. Constitution 1.8.0 formaliza as exceções restritas em T001; conformidade da implementação ainda precisa ser comprovada. Não exportar segredos existentes apenas na TV nem ampliar exceções locais BYOK/M3U por inferência.
- Licença do aplicativo é diferente da credencial IPTV da feature 034. Formalizar bloqueio comercial sem impedir abertura/configuração ou apagar dados; checkout externo é escolha do usuário.
- Stack, hospedagem, chaves, proteção/retenção, limites de sessão/entrega, política de backup, desafio/código de recuperação, retenções e tempo de restauração operacional pertencem ao plano e precisam critérios testáveis antes da execução afetada.
- Preservar IDs FR-001–FR-029 e SC-001–SC-009 existentes; FR-030–FR-033 e SC-010–SC-012 explicitam comportamentos agora revisados. Plano/tasks foram sincronizados nesta revisão com os acréscimos, preço aprovado, exclusão bidirecional e recuperação pelo site. Cobertura de planejamento não equivale a implementação validada.
- Testes automatizados/E2E web/TV e pagamento de teste antecedem validação física. Atualizar TV preservando dados/assinatura; reinstalação apenas em laboratório autorizado. Browser não prova identidade, persistência, tempo ou AVPlay.
- Consultar as três referências V14 e guias Tizen antes de desenhar telas. Esta revisão sincroniza documentos, sem implementar layouts/runtime ou alterar testes de contrato.

## Clarifications

### Sessão 2026-10-10

- Q: Como acessar pelo site? → A: QR abre sessão temporária; alternativa device ID + device key, sem conta pessoal.
- Q: O que gerenciar? → A histórica de 2026-10-10: M3U URL/arquivo, Xtream e chaves pessoais. **Superada pela revisão de 2026-10-11:** somente Xtream e M3U por URL, sem arquivo ou API keys remotas.
- Q: Quantas TVs e renovação? → A: Uma TV por licença, renovação manual anual.
- Q: Compra pela TV? → A: Inicia na TV, conclui no celular/site pelo QR, ativa automaticamente.
- Q: Teste e vencimento? → A: Teste completo 7 dias; depois bloqueia reprodução, mantendo configuração, compra e dados locais.
- Q: Sem contato com licenciamento? → A: Licença validada até vencimento conhecido; primeira ativação/renovação exigem internet.
- Q: Alterações com TV offline? → A: Guardar pendências, aplicar ao conectar, mostrar pendente/aplicado/erro.
- Q: Condições comerciais? → A: Brasil, BRL, Pix/cartão; preço anual ainda a definir.
- Varredura de escopo, domínio/dados, UX, segurança, integração, edge cases, terminologia e conclusão realizada. Identidade, retenção, sessões e pagamento ficam explicitamente no handoff técnico; preço fica marcado para clarificação. Não foram feitas perguntas de stack/arquitetura.

## Clarificação — frequência de sincronização (2026-10-10)

Usuário confirmou: checagem automática a cada 24 horas em uso normal e checagem rápida somente com tela de QR/configuração/compra aberta na TV. Não manter polling de 10 segundos durante navegação/reprodução comum; atualização remota pode aguardar o ciclo diário. Falha de rede não invalida licença já validada e ainda vigente. SC-003/SC-006 delimitam as metas rápidas ao fluxo aberto.

### Sessão 2026-10-11 — revisão sdd-specify

- Q: Quais modalidades fazem parte do incremento? → A: Xtream e M3U por URL; sem upload/armazenamento remoto de arquivo e sem gestão remota TMDB/OpenAI.
- Q: O que permanece depois que a TV aplica a configuração? → A: Configuração fornecida no portal continua guardada cifrada para edição/reenvio; ACK ou expiração de entrega não apagam a configuração corrente.
- Q: Como recuperar depois de reinstalar? → A: Atendimento manual na mesma TV, com comprovação de titularidade, revogação dos acessos antigos e preservação de teste/licença; sem recuperação de catálogo apagado.
- Q: Consulta diária precisa ter sucesso para usar? → A: Não. Licença local vigente funciona até o vencimento; consulta diária online recebe renovação/revogação e fluxo rápido existe só com QR/configuração/compra aberta.
- Q: Qual o objetivo de backup? → A: Backup diário, perda máxima de 24 horas de alterações como objetivo e restauração manual documentada; plano define proteção, retenção e ensaio.
- Q: Quando remover uma lista diretamente na TV, o que acontece no portal? → A: Remover também do portal, cancelar pendências e impedir recriação automática. Offline, registrar e comunicar a exclusão no próximo contato.
- Q: Qual o preço anual? → A: R$35 por TV, por 12 meses, compra avulsa/renovação manual; diferente da referência mensal de infraestrutura, também R$35.
- Varredura das oito categorias: escopo, domínio/dados, UX, não funcionais, integração, edge cases, terminologia e conclusão revisados. Perguntas novas limitadas à exclusão pela TV e ao preço; demais respostas vieram da entrevista desta sessão. Não restam marcadores de produto NEEDS CLARIFICATION. Detalhes operacionais/plataforma e compatibilização normativa permanecem no handoff técnico, sem alegar validação concluída.

## Referências de planejamento

Decisões de infraestrutura estão em [ADR-013](../../adr/ADR-013-portal-controle-serverless-google-cloud.md), [infraestrutura.md](infraestrutura.md) e [plan.md](plan.md). O registro anterior de 2026-10-11 sobre FastAPI/Cloud Run/Firestore, EUA, piloto de 10–50 TVs, orçamento operacional de R$10/mês, segredos privados sem KMS/Secret Manager e backup diário permanece nesses artefatos; não é requisito de implementação desta spec. Plano e tasks foram alinhados às decisões de produto acima nesta resolução de pendências.

### Atualização operacional — 2026-10-12

O usuário confirmou a manutenção do budget de **R$10/mês** para o piloto, com alertas em 50%, 90%, 100% e 150%. Esse valor é somente referência de infraestrutura e permanece separado do preço comercial de R$35 por licença anual.

### Sessão 2026-10-11 — resolução de pendências

- Q: Canal e prazo de atendimento? → A: O número da licença deve aparecer para o usuário guardar ou fotografar; a recuperação acontece pelo próprio site, sem atendimento. Esta resposta substitui o atendimento manual da clarificação anterior.
- Recuperação permanece restrita à mesma TV e preserva teste/validade. O código é uma credencial privada, distinta do identificador público e do pagamento; o plano define desafio, proteção e rotação.
- Constitution 1.8.0 formalizada e planejamento sincronizado; preço anual R$35 confirmado. Não houve implementação ou validação física nesta revisão.

### Decisão de vencimento na entrada — 2026-10-11

Usuário confirmou: “Permitir o uso até sair da lista; bloquear apenas a próxima entrada”. Substitui bloqueio por vencimento a cada início de playback e encerramento automático ao vencer. Sair para o seletor ou fechar o app encerra essa continuidade; RETURN do seletor revalida. Configurações abertas dentro da sessão podem voltar ao conteúdo sem nova entrada. Não se persiste autorização de sessão para a próxima abertura. Revogação/estorno confirmado mantém FR-026. Constitution 1.9.0 e plano atualizados; contratos congelados não foram alterados.

## Atualização (070) — 2026-10-13

A feature `070-entrada-listas-gerenciador` (convergida) alterou comportamentos que esta spec descreve. **Esta spec não deve desfazê-los**; onde o texto acima diverge, vale o que está aqui e a constitution 1.10.0 / ADR-014 / ADR-015.

- **Identidade exibida**: o aparelho mostra um ID no formato MAC (`XX:XX:XX:XX:XX:XX`) — o MAC real quando o privilégio de rede o fornece, senão um ID derivado da identidade do aparelho. É **imutável** depois de atribuído (ADR-015). O `deviceId` interno e a licença presa a ele não mudam.
- **Chave do dispositivo**: numérica de 10 dígitos, permanente até "Gerar nova chave" (`revoke`), exibida o tempo todo na tela Adicionar. Substitui o token longo citado em FR-002/FR-003/FR-004/US1; "device ID" passa a ser o ID exibido (`displayId`). FR-003 continua valendo: a chave não integra a URL do QR.
- **Entrada manual no portal**: somente ID exibido + chave, com limites por ID/origem, recusa uniforme `401` e bloqueio temporário. Convite QR segue efêmero e de uso único.
- **Valores salvos no portal**: a edição mostra URL, usuário e senha salvos, só para a sessão da mesma TV, resposta `no-store`, nunca em log.
- **TV**: a entrada é "Adicionar lista" (QR, ID, chave, endereço, Recarregar); o canto "Adicionar pelo site" dos perfis não existe mais; Configurações → "Portal & licença" permanece para licença, revogar e código de recuperação. RETURN volta em cadeia até a tela de listas, única que pede para sair.
- **Plataforma**: `CCPlayTv/config.xml` declara `network.public` (sonda da TV física: `mac: passed`); não remover.
- **Não alterado**: preço, oferta, vencimento, licença assinada, guarda de entrada (D-016), recuperação pelo site, exclusão bidirecional.