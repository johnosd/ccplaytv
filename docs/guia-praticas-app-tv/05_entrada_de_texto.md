# 05. Entrada de texto e configuração

**Página pesquisada:** Text Input
**Consulta:** 13 de setembro de 2026
**Link fornecido:** https://developer.samsung.com/smarttv/design/text-input.html

> Permitir configurar a fonte e pesquisar pelo controle remoto; o celular deve ser apenas uma alternativa.

## 1. Síntese da orientação oficial

Quando for necessária entrada de texto, o app deve oferecer teclado na tela: próprio ou Samsung IME. O campo editado não pode ficar coberto pelo teclado. O IME permite navegação por setas e seleção, além de interação com teclado físico. Na entrada consecutiva, Next avança entre os campos e Done conclui o último. [1]

### Separar três fluxos

| Fluxo | Dados propostos |
| --- | --- |
| Adicionar URL M3U | Nome da fonte e endereço completo da lista. |
| Conectar a provedor | Endereço do servidor, usuário e senha; protocolo de integração identificado. |
| Pesquisar no catálogo | Termo de busca e escopo: Canais, Filmes, Séries ou Tudo. |

No requisito informado, DNS é tratado como o endereço do servidor fornecido pelo provedor, não como autorização para modificar o DNS de rede da TV. A forma de autenticação e o contrato da API do provedor precisam ser definidos antes da implementação.

### Segurança da entrada

A documentação de segurança recomenda minimizar os dados solicitados, validar entradas, proteger informações sensíveis e usar canais seguros. [2] Para este app, a proposta é nunca registrar senha, tokens ou URLs privadas completas nos logs e mensagens de falha.

> Digitação remota assistida por QR code é uma proposta independente. Não pressupõe Smart View, não deve expor credenciais no QR e não substitui a configuração disponível na TV.

## 2. Fluxos e comportamento propostos

### URL e credenciais

Usar rótulos permanentes, não apenas texto temporário dentro do campo. Na URL, explicar que se espera o endereço completo da lista. No servidor, mostrar um exemplo com domínio fictício. Na senha, usar máscara e uma ação explícita de exibição temporária, sem alterar automaticamente maiúsculas, símbolos ou espaços digitados.

Validar antes da conexão e distinguir: endereço inválido, falha de conexão, autenticação recusada e resposta incompatível com o formato esperado. Não culpar a senha quando o problema for rede. Durante a tentativa, manter o formulário recuperável e evitar submissões duplicadas.

### Busca no catálogo

Propor atualização após uma pausa curta na digitação, inicialmente 300 ms, a ajustar em testes. Esse intervalo é uma escolha do projeto. Cancelar ou ignorar respostas antigas quando o termo mudar. Ao confirmar a pesquisa, mover o foco para o primeiro resultado; RETURN deve permitir voltar ao termo sem apagar o contexto.

Tratar acentos e diferenças de caixa de modo consistente. Informar quantos resultados foram encontrados e qual área está sendo pesquisada. Não enviar todo termo digitado a um serviço externo por padrão; definir explicitamente quando uma consulta remota for necessária.

### Arquivo M3U

Separar a escolha do arquivo da digitação de URL. Propor um seletor por diretórios e armazenamento acessível, validando a extensão e o conteúdo. O documento 13 identifica exemplos oficiais de Filesystem e USBStorage; eles são pontos de partida, não evidência de que qualquer seletor HTML funcionará em qualquer TV.

### Assistência pelo celular

Como evolução, considerar um código temporário de pareamento que permita enviar a configuração à sessão correta. Exigir confirmação na TV, expiração e possibilidade de revogar a operação. Não colocar a senha do provedor em links públicos nem torná-la parte do histórico de navegação.

## 3. Testes propostos para formulários

| ID | Cenário e resultado esperado |
| --- | --- |
| E01 | Preencher servidor, usuário e senha apenas pelo controle remoto. |
| E02 | Editar URL longa: o cursor e a região ativa continuam visíveis. |
| E03 | Cancelar a edição: o app não salva dados incompletos nem encerra acidentalmente. |
| E04 | Alternar Mostrar senha: o valor não é perdido nem copiado para logs. |
| E05 | Buscar rapidamente termos diferentes: resultados antigos não substituem os atuais. |
| E06 | Digitar acentos e símbolos: a pesquisa e a autenticação preservam o valor esperado. |
| E07 | Falhar a conexão: existe uma explicação adequada e uma tentativa de recuperação. |
| E08 | Selecionar arquivo errado: nenhuma parte do texto importado é executada como código. |

### Dados de teste

Utilizar endereços fictícios nas telas de exemplo e credenciais de demonstração no ambiente de validação. Incluir senha com símbolos, URL extensa, arquivo vazio e nome de fonte repetido. Os testes de segurança são propostos; não foram executados nesta pesquisa.

## 4. Fontes e escopo da pesquisa

[1] **Samsung Developer — Text Input** — IME, teclado visível e sequência de campos.  
https://developer.samsung.com/smarttv/design/text-input.html

[2] **Samsung Developer — Application Security** — Minimização, proteção de dados e validação de entradas.  
https://developer.samsung.com/smarttv/develop/guides/fundamentals/application-security.html


Consulta: 13 de setembro de 2026. As recomendações e os critérios de aceite deste relatório não substituem as exigências de revisão vigentes no Seller Office.
