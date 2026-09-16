# Guias Samsung Smart TV — pesquisa aplicada

**Data de consulta:** 13 de setembro de 2026

Este pacote reúne 13 relatórios independentes, um para cada link de conteúdo fornecido. As URLs das imagens decorativas não foram tratadas como páginas de guidelines. Cada relatório está disponível em Word e Markdown.

## Escopo do projeto

A aplicação prática considera o app discutido no projeto: abertura sem cadastro próprio obrigatório; inclusão de uma fonte por URL M3U, arquivo ou credenciais do provedor; canais, filmes e séries por grupos; pesquisa, favoritos e histórico; e ordenação por avaliação IMDb como integração complementar. Essas decisões não são atribuídas à Samsung.

O foco normativo é Samsung Smart TV/Tizen. Não se deve assumir que detalhes de APIs, assinatura e publicação se aplicam a Android TV, Google TV, tvOS ou LG webOS.

## Como interpretar os relatórios

As sínteses oficiais usam referências numeradas. As seções de aplicação, arquitetura e critérios de aceite são recomendações originais para o projeto. P0, P1 e P2, quando usados, indicam prioridades internas propostas, não a classificação oficial da Samsung. Os testes permanecem não executados.

A data acima é de consulta; não indica que todas as páginas foram publicadas ou atualizadas nessa data. A pesquisa utilizou páginas oficiais Samsung, repositório ligado pelo catálogo oficial e, no relatório de APIs, a RFC 8216 como complemento técnico. Não reproduz integralmente as páginas.

## Índice dos arquivos

| Nº | Tema | Word | Markdown |
| --- | --- | --- | --- |
| 01 | Princípios de design | [Abrir](docx/01_principios_de_design.docx) | [Abrir](markdown/01_principios_de_design.md) |
| 02 | Ícones e capturas de tela | [Abrir](docx/02_icones_e_screenshots.docx) | [Abrir](markdown/02_icones_e_screenshots.md) |
| 03 | Controle remoto e navegação | [Abrir](docx/03_metodos_de_entrada.docx) | [Abrir](markdown/03_metodos_de_entrada.md) |
| 04 | Telas, layout e tipografia | [Abrir](docx/04_telas_layout_e_tipografia.docx) | [Abrir](markdown/04_telas_layout_e_tipografia.md) |
| 05 | Entrada de texto e configuração | [Abrir](docx/05_entrada_de_texto.docx) | [Abrir](markdown/05_entrada_de_texto.md) |
| 06 | Player de canais, filmes e séries | [Abrir](docx/06_player_de_midia.docx) | [Abrir](markdown/06_player_de_midia.md) |
| 07 | Integração móvel com Smart View | [Abrir](docx/07_smart_view_sdk.docx) | [Abrir](markdown/07_smart_view_sdk.md) |
| 08 | Checklist de experiência de uso | [Abrir](docx/08_checklist_de_ux.docx) | [Abrir](markdown/08_checklist_de_ux.md) |
| 09 | Como distribuir o aplicativo | [Abrir](docx/09_como_distribuir.docx) | [Abrir](markdown/09_como_distribuir.md) |
| 10 | Checklist de lançamento | [Abrir](docx/10_checklist_de_lancamento.docx) | [Abrir](markdown/10_checklist_de_lancamento.md) |
| 11 | Seller Office: conta e operação | [Abrir](docx/11_seller_office.docx) | [Abrir](markdown/11_seller_office.md) |
| 12 | APIs web e arquitetura técnica | [Abrir](docx/12_apis_web_e_arquitetura.docx) | [Abrir](markdown/12_apis_web_e_arquitetura.md) |
| 13 | Exemplos e plano de protótipos | [Abrir](docx/13_exemplos_e_plano_de_prototipos.docx) | [Abrir](markdown/13_exemplos_e_plano_de_prototipos.md) |

## Mapeamento dos links pesquisados

### 01. Design Principles
Fornecido: https://developer.samsung.com/smarttv/design/design-principles.html

### 02. App Icons and Screenshots
Fornecido: https://developer.samsung.com/smarttv/design/app-icons-and-screenshots.html

### 03. Input Methods
Fornecido: https://developer.samsung.com/smarttv/design/input-methods.html

### 04. Apps Screen
Fornecido: https://developer.samsung.com/smarttv/design/apps-screen.html

### 05. Text Input
Fornecido: https://developer.samsung.com/smarttv/design/text-input.html

### 06. Media Player
Fornecido: https://developer.samsung.com/smarttv/design/media-player.html

### 07. Smart View SDK
Fornecido: https://developer.samsung.com/smarttv/design/smart-view-sdk.html

### 08. UX Checklist
Fornecido: https://developer.samsung.com/smarttv/design/ux-checklist.html

### 09. How To Distribute
Fornecido: https://developer.samsung.com/smarttv/develop/distribute.html
Destino após redirecionamento: https://developer.samsung.com/tv-seller-office

### 10. Launch Checklist
Fornecido: https://developer.samsung.com/smarttv/develop/distribute/launch-checklist.html
Destino após redirecionamento: https://developer.samsung.com/tv-seller-office/checklists-for-distribution/launch-checklist.html

### 11. Smart TV Seller Office
Fornecido: https://seller.samsungapps.com/tv/login
Somente entrada pública consultada. Não houve autenticação nem inspeção da conta; o relatório usa guias públicos de operação.

### 12. Web API References
Fornecido: https://developer.samsung.com/smarttv/develop/api-references/web-api-references.html

### 13. General Web Application Samples
Fornecido: https://developer.samsung.com/smarttv/develop/samples/general-samples.html

## O que este pacote não substitui

Estes relatórios não são uma aprovação da Samsung, não incluem submissão no portal, não substituem o template obrigatório de descrição de UI e não comprovam compatibilidade de um aplicativo ou stream. Não houve compilação ou execução dos exemplos nem teste em televisor.

As divergências verificadas sobre imagens e os redirecionamentos foram registrados nos documentos correspondentes. Revalidar requisitos de loja, APIs e recursos por modelo antes do envio. A escolha do serviço de metadados IMDb e a autorização de seu uso ainda dependem de definição do projeto.

## Estrutura

`docx/` contém os 13 documentos editáveis em Word. `markdown/` contém o mesmo conteúdo em texto estruturado. `fontes.json` relaciona as URLs, seus escopos e a data de consulta. `manifest.txt` lista os arquivos do pacote.
