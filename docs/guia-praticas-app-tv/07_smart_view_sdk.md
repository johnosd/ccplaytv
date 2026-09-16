# 07. Integração móvel com Smart View

**Página pesquisada:** Smart View SDK
**Consulta:** 13 de setembro de 2026
**Link fornecido:** https://developer.samsung.com/smarttv/design/smart-view-sdk.html

> Tratar casting como evolução independente; não torná-lo necessário para cadastrar uma lista ou assistir na TV.

## 1. O que o guideline cobre

O guia trata do envio de conteúdo do celular à TV. Recomenda estados claros no botão de casting, seleção de dispositivos, conexão, fila e sincronização dos comandos entre telas. A descoberta depende de condições de compatibilidade e rede. Há fluxos de conectar antes de escolher a mídia e de transferir uma reprodução em andamento. Ao desconectar o celular, a experiência descrita mantém o app da TV aberto e a reprodução em andamento. [1]

### Situação da documentação consultada

A página de downloads permanece acessível. Entre as versões publicadas nela estão Android 2.5.34, de 25/07/2024, iOS 3.1.1, de 05/04/2023, e JavaScript 2.3.4, de 20/02/2018. [2] Essas datas não demonstram suporte a toda combinação de TV, firmware e sistema móvel em 2026.

Não foi identificada nessas páginas uma declaração que permita classificar todo o SDK como descontinuado. Também não foi realizada compilação ou conexão com aparelhos. Portanto, a compatibilidade do projeto continua pendente de prova de conceito.

### Aplicabilidade ao escopo

O requisito principal é um app que funcione diretamente na TV. A proposta é concluir primeiro importação de fontes, navegação e reprodução local. Smart View só entra se a experiência de envio de conteúdo pelo celular for aprovada como requisito separado.

> Casting, espelhamento da tela e preenchimento remoto por QR code não devem ser tratados como a mesma funcionalidade neste projeto.

## 2. Arquitetura e experiência propostas

### Enviar conteúdo não é enviar uma lista inteira

Definir se o telefone selecionará um item já conhecido da TV ou enviará uma URL temporária. Não transmitir credenciais completas da fonte em cada comando. Validar a sessão e o item de destino antes de alterar a reprodução. Mostrar o nome da TV escolhida para reduzir envios acidentais.

### A TV continua utilizável sozinha

Manter o controle remoto operacional durante toda a sessão móvel. Alterações feitas na TV devem chegar à interface móvel quando conectada. Propor um indicador de dispositivo conectado e uma forma de encerrar o vínculo, sem remover a fonte cadastrada no aplicativo.

### Modelo de estados proposto

| Estado | Tratamento sugerido |
| --- | --- |
| Nenhuma TV encontrada | Explicar como verificar a rede; permitir nova busca. |
| Dispositivo selecionado | Confirmar destino e iniciar a tentativa de conexão. |
| Conectando | Mostrar atividade e permitir cancelar sem afetar o catálogo. |
| Conectado | Exibir dispositivo, item atual e controles compatíveis. |
| Conexão perdida | Informar a perda; não apagar conteúdo ou histórico local. |
| Sessão encerrada | Remover o vínculo móvel mantendo o estado previsto para a TV. |

### Prova de conceito antes do compromisso

Escolher aparelhos representativos e verificar descoberta, conexão, transferência de VOD, live, retomada e desligamento. Registrar versões exatas das bibliotecas e ferramentas. Se o recurso não atender à matriz pretendida, manter o app de TV independente e reavaliar a integração, em vez de prometer suporte universal.

### Alternativa de configuração assistida

Para reduzir a digitação de URL, considerar um serviço de pareamento temporário separado do casting. O telefone envia os dados de configuração para a sessão autorizada; a TV confirma a importação. Essa alternativa também exige projeto de segurança e testes próprios.

## 3. Critérios de aceite condicionais

| ID | Teste a executar apenas se Smart View entrar no escopo |
| --- | --- |
| S01 | Descoberta: listar apenas dispositivos previstos e identificar a TV escolhida. |
| S02 | Conexão: cancelar uma tentativa não altera a fonte nem inicia vídeo acidental. |
| S03 | Controle simultâneo: comandos no celular e na TV convergem para um único estado. |
| S04 | Transferência de VOD: a posição confirmada é preservada quando o fluxo exigir. |
| S05 | Perda da rede móvel: o app da TV permanece operável pelo controle remoto. |
| S06 | Desconexão: o comportamento não apaga catálogo, favoritos ou histórico. |
| S07 | Segurança: logs e QR codes não expõem senha ou URL privada completa. |

### Decisão recomendada para o planejamento

Classificar o recurso como P2: evolução opcional. Antes de implementá-lo, registrar custo de manutenção de um aplicativo móvel, aparelhos suportados e critérios de recuperação. A decisão proposta não elimina o requisito de adicionar fontes diretamente na TV.

## 4. Fontes e escopo da pesquisa

[1] **Samsung Developer — Smart View SDK (Design)** — Experiência de descoberta, casting, sincronização e desconexão.  
https://developer.samsung.com/smarttv/design/smart-view-sdk.html

[2] **Samsung Developer — Smart View SDK Download** — Versões e datas publicadas; não equivale a teste de compatibilidade.  
https://developer.samsung.com/smarttv/develop/extension-libraries/smart-view-sdk/download.html


Consulta: 13 de setembro de 2026. As recomendações e os critérios de aceite deste relatório não substituem as exigências de revisão vigentes no Seller Office.
