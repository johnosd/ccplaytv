# 10. Checklist de lançamento

**Página pesquisada:** Launch Checklist
**Consulta:** 13 de setembro de 2026
**Link fornecido:** https://developer.samsung.com/smarttv/develop/distribute/launch-checklist.html
**Destino verificado:** https://developer.samsung.com/tv-seller-office/checklists-for-distribution/launch-checklist.html

> Validar identidade, assinatura, permissões e documentação antes de gerar o pacote definitivo para envio.

## 1. Requisitos técnicos verificados

O link fornecido redireciona para Checklists for Distribution / Launch Checklist. Para o pacote, a página lista config.xml ou tizen-manifest.xml, author-signature.xml e signature1.xml. Distingue privilégios public, partner e platform; permissões incompatíveis podem bloquear o pré-teste. [1]

| Tema | Síntese do checklist [1] |
| --- | --- |
| Identidade | Preservar Tizen ID nas atualizações; não confundi-lo com o App ID do portal. |
| Versão | Pacote comum: [0–255].[0–255].[0–65535]; uma atualização exige versão superior. |
| API mínima | required_version usa o formato x.y e deve corresponder aos modelos-alvo. |
| Título | name ou label deve coincidir com o título do idioma padrão no portal. |
| Configuração | Informar recursos, tamanho de tela e privilégios adequados. |
| Assinatura | Atualizações mantêm a assinatura de autor da versão anterior. |

A página também aborda pacotes multi-arquitetura e solicita imagens, descrição de UI, contato, acesso de teste e política de privacidade quando houver coleta de dados pessoais. [1]

### Interpretação para o aplicativo Web

Propor um pacote Web .wgt com configuração revisada. Não adotar multi-arquitetura por hábito: só fazê-lo se a solução e o fluxo de distribuição realmente exigirem. A existência de uma API no catálogo não substitui a conferência de permissões e suporte.

> Uma alteração de assinatura ou identidade pode comprometer o processo de atualização. Organizar a custódia das credenciais de assinatura como parte do trabalho de lançamento.

## 2. Checklist operacional proposto

| ID | Verificação | Evidência sugerida |
| --- | --- | --- |
| L01 | Conferir identificadores e versão. | Relatório comparando pacote anterior e candidato. |
| L02 | Conferir a assinatura de autor. | Registro seguro da identidade do certificado. |
| L03 | Auditar config.xml. | Lista de permissões justificadas por recurso. |
| L04 | Definir os modelos-alvo. | Matriz de versão, firmware e funções testadas. |
| L05 | Revisar título e idioma padrão. | Comparação entre pacote e metadados. |
| L06 | Validar instalação limpa e atualização. | Vídeo de abertura e persistência de preferências. |
| L07 | Preparar acesso de demonstração. | Lista e credenciais de teste válidas. |
| L08 | Revisar materiais da loja. | Assets do documento 02 aprovados internamente. |
| L09 | Completar descrição da UI. | Template oficial para a mesma versão. |
| L10 | Sanitizar pacote e diagnóstico. | Ausência de segredos de produção e logs sensíveis. |

### Permissões proporcionais ao escopo

Propor uma justificativa explícita para cada permissão: entrada do controle, acesso à rede, arquivos ou outra função realmente usada. Não acrescentar permissões de anúncio, cobrança, microfone ou integração privilegiada somente porque aparecem em algum exemplo. Remover recursos desativados e código demonstrativo antes do envio.

### Dependências de revisão

O guia do template de UI pede informação adicional para login, ativação, integração móvel e restrições geográficas quando esses recursos existem. [2] Para este app, preparar o acesso à fonte do provedor mesmo que não exista uma conta própria obrigatória na entrada.

## 3. Decisão de liberar ou bloquear o envio

### Bloqueadores internos propostos

Não liberar a versão se instalação ou atualização falhar; se existir perda sistemática de favoritos; se o fluxo de importação não puder ser testado; se o player deixar áudio em segundo plano; ou se credenciais aparecerem em logs. Os bloqueadores são critérios internos de qualidade, não uma transcrição exaustiva da certificação.

### Pacote de rastreabilidade

Guardar a versão, o hash do arquivo enviado, a revisão do código, o conjunto de testes, os assets e o template de UI. Registrar quem aprovou o envio e quais aparelhos foram usados. Não colocar certificados privados ou senhas dentro do mesmo arquivo compartilhado com os relatórios de QA.

### Diferenças entre fontes

Este checklist não deve ser usado isoladamente para especificar imagens de loja: o documento 02 compara a página de design e o guia operacional. Antes do envio, conferir também campos e validações apresentados pelo próprio portal, porque esta pesquisa não inspecionou uma sessão autenticada.

| Resultado | Ação proposta |
| --- | --- |
| Pronto para enviar | Todos os bloqueadores internos resolvidos e evidências anexadas. |
| Pronto com ressalvas | Somente desvios não bloqueadores, explicitamente aceitos e documentados. |
| Bloqueado | Há falha de uso central, segurança, atualização ou acesso de teste. |

## 4. Fontes e escopo da pesquisa

[1] **Samsung Developer — Launch Checklist** — Destino atual; pacote, permissões, identidade e itens de submissão.  
https://developer.samsung.com/tv-seller-office/checklists-for-distribution/launch-checklist.html

[2] **Samsung Developer — Application UI Description** — Informação adicional para funcionalidades condicionais.  
https://developer.samsung.com/tv-seller-office/checklists-for-distribution/application-ui-description.html


Consulta: 13 de setembro de 2026. As recomendações e os critérios de aceite deste relatório não substituem as exigências de revisão vigentes no Seller Office.
