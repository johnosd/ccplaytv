# 04. Telas, layout e tipografia

**Página pesquisada:** Apps Screen
**Consulta:** 13 de setembro de 2026
**Link fornecido:** https://developer.samsung.com/smarttv/design/apps-screen.html

> Usar categorias laterais e grades regulares, com espaço suficiente para ler títulos e reconhecer o foco.

## 1. Síntese da orientação oficial

O guia distingue a resolução da aplicação: 1920 × 1080 para UHD e 1280 × 720 para FHD. Apresenta One UI Sans, pesos 200, 300, 400 e 600, e recomenda entrelinha de 1,2 ou 1,4 vezes o tamanho da fonte. Grades combinam miniaturas e nomes; listas atendem informação textual. Categorias numerosas podem funcionar melhor na lateral. [1]

A página diferencia foco móvel de foco fixo, orienta indicadores de rolagem e pede feedback para operações a partir de 100 ms. Quando o progresso não pode ser medido, deve-se usar indicação indeterminada em vez de uma porcentagem artificial. [1]

### Resolução de interface não é resolução de vídeo

O guia técnico de resolução explica o enquadramento e a escala da aplicação na TV. [2] Para o projeto, não concluir que um painel 4K exige uma interface HTML em 3840 × 2160, nem que desenhar a UI em 1080p limita automaticamente a qualidade do vídeo.

### Premissas para o protótipo

Propor uma composição base 16:9, inicialmente desenhada em 1920 × 1080 e validada nas resoluções dos aparelhos-alvo. Números de cards, margens e tamanhos tipográficos devem ser ajustados após os testes de distância e desempenho; não são cotas universais da Samsung.

> Não foram extraídos valores numéricos das figuras tipográficas. A escala sugerida na próxima página é uma decisão de prototipação, não uma transcrição dessas figuras.

## 2. Estrutura de telas proposta

### Home e fontes

A home deve separar navegação principal e conteúdo. Uma identificação curta da fonte ativa pode ficar no cabeçalho. Sem fonte, substituir a grade por uma ação central de configuração; com fonte, oferecer acesso às três áreas de mídia e às preferências locais.

### Canais, filmes e séries

Em Canais, propor grupos à esquerda e lista com logo e nome à direita. Em Filmes e Séries, usar categorias laterais e grade de pôsteres. Em Séries, abrir detalhes antes da lista de temporadas e episódios. Reservar a navegação global em uma área que não seja confundida com o fim da rolagem do catálogo.

### Escala visual inicial, a validar

| Elemento | Proposta na base 1080p |
| --- | --- |
| Título de página | 40–48 px; uma hierarquia visual dominante. |
| Ações e nomes de cards | 28–32 px, com truncamento controlado. |
| Metadados auxiliares | 24–28 px, sem concentrar conteúdo essencial no menor tamanho. |
| Pôsteres por linha | Começar com 5 ou 6; reduzir se os títulos perderem legibilidade. |
| Foco | Contorno e realce combinados, sem depender só de mudança de cor. |

### Estados não ideais

Projetar explicitamente: sem fonte, sem resultados, categoria vazia, capa ausente, metadados incompletos, carregamento, falha parcial e erro de rede. Usar uma imagem substituta para capas ausentes sem mudar a dimensão do card. Propor carregamento por lotes e renderização apenas da região necessária para listas grandes.

### Ordenação e notas

Mostrar a ordenação ativa perto do título. Para a opção por nota IMDb, exibir a origem do dado somente quando identificada e reservar Sem nota para ausências. Não transformar nota desconhecida em zero e não reorganizar a grade enquanto o usuário estiver confirmando um item.

## 3. Critérios visuais e funcionais

| ID | Verificação proposta |
| --- | --- |
| T01 | Grade: cards têm dimensões estáveis, inclusive sem capa ou com título longo. |
| T02 | Texto: testar português com acentos, nomes extensos e legendas em duas linhas. |
| T03 | Escala: as telas não ganham recortes, barras externas ou áreas inutilizáveis. |
| T04 | Carregamento: a etapa descrita corresponde à atividade real, sem progresso inventado. |
| T05 | Ordenação: a opção ativa é visível e não destrói a posição sem necessidade. |
| T06 | Desempenho: medir navegação com catálogos pequenos, médios e volumosos. |
| T07 | Contraste: testar o foco sobre capas claras, escuras e muito coloridas. |
| T08 | Estados vazios e falhas: existe uma ação útil para seguir ou recuperar. |

### Entregáveis de design sugeridos

Manter uma biblioteca de componentes com card, categoria, botão, campo, diálogo, aviso e player. Cada componente deve ter estados documentados de foco, seleção, indisponibilidade e carregamento. Vincular as telas ao mesmo mapa de navegação do documento 03.

## 4. Fontes e escopo da pesquisa

[1] **Samsung Developer — Apps Screen** — Resolução, tipografia, categorias, listas, foco e feedback.  
https://developer.samsung.com/smarttv/design/apps-screen.html

[2] **Samsung Developer — Managing Screen Resolution** — Complemento técnico para a escala da interface.  
https://developer.samsung.com/smarttv/develop/guides/fundamentals/managing-screen-resolution.html


Consulta: 13 de setembro de 2026. As recomendações e os critérios de aceite deste relatório não substituem as exigências de revisão vigentes no Seller Office.
