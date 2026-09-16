# 01. Princípios de design

**Página pesquisada:** Design Principles
**Consulta:** 13 de setembro de 2026
**Link fornecido:** https://developer.samsung.com/smarttv/design/design-principles.html

> Projetar para assistir e encontrar conteúdo, não para administrar uma lista técnica.

## 1. Síntese da orientação oficial

A Samsung considera o uso a cerca de 3 metros da tela, navegação direcional e compartilhamento da TV. A interface deve ser simples, legível, previsível e coerente; os comandos precisam produzir respostas claras. A pessoa deve reconhecer sua posição, diferenciar foco de seleção e perceber operações de carregamento. Elementos alinhados em grades favorecem trajetos compreensíveis. Informações pessoais e a identificação de quem está conectado exigem cuidado em um ambiente compartilhado. [1]

### O que isso representa no projeto

O escopo informado prevê entrada no aplicativo sem conta obrigatória. A conexão com uma fonte de conteúdo acontece depois, por URL M3U, arquivo ou credenciais de um provedor. Recomenda-se preservar essa separação: abrir o app não equivale a autenticar no serviço que fornece os vídeos.

### Decisões de produto propostas

A tela inicial deve oferecer Adicionar fonte e, quando houver conteúdo, Canais, Filmes, Séries, Favoritos e Continuar assistindo. Configurações técnicas ficam em uma área secundária. A primeira experiência deve explicar qual informação o usuário precisa fornecer, sem exigir que ele conheça a arquitetura do aplicativo.

> Este documento é uma síntese aplicada. As decisões sobre M3U, favoritos, histórico e organização do catálogo são propostas para o projeto, não requisitos específicos publicados pela Samsung.

## 2. Aplicação ao aplicativo

### Entrada sem barreiras

Permitir abrir a interface vazia, ler uma explicação curta e escolher a forma de adicionar conteúdo. Não pedir cadastro próprio antes de mostrar essas opções. Exibir claramente a fonte ativa, usando um apelido definido pelo usuário, e oferecer desconectar ou remover sem apagar outras fontes por engano.

### Catálogo progressivo

Propor a importação em etapas: conectar, obter dados, interpretar entradas, organizar categorias e concluir. Apresentar contagens reais quando disponíveis. Se uma categoria estiver ausente, manter o item em uma seção de revisão em vez de inventar seu tipo. Disponibilizar um resultado final com itens aceitos e ignorados.

### Navegação com memória

Ao abrir os detalhes de um filme e voltar, restaurar categoria, ordenação, rolagem e item de origem. Separar a categoria ativa do cartão em foco. Manter o mesmo vocabulário e as mesmas posições para Buscar, Favoritar e Marcar como assistido nas áreas equivalentes.

### Histórico adequado a cada mídia

Para filmes, usar progresso e estado assistido; para séries, registrar episódios e agregar o avanço da temporada. Para canais contínuos, propor Visto recentemente em vez de concluir que todo o canal foi assistido. O usuário deve conseguir corrigir ou limpar esses registros.

### Privacidade na sala

Não mostrar a senha nem a URL completa do provedor na home. Pedir confirmação antes de remover a fonte e explicar se o histórico será mantido. Tratar perfis e sincronização entre TVs como evolução opcional, sem transformá-los em pré-requisito do uso local.

## 3. Critérios de aceite propostos

| ID | Cenário e resultado esperado |
| --- | --- |
| D01 | Primeiro acesso: a home abre sem conta própria e apresenta Adicionar fonte. |
| D02 | Uso à distância: títulos, foco e ações principais são reconhecíveis na sala de teste. |
| D03 | Importação lenta: cada etapa informa atividade; a interface oferece recuperação em caso de erro. |
| D04 | Retorno de detalhes: reaparece o mesmo item, na mesma categoria e posição. |
| D05 | TV compartilhada: nenhuma credencial aparece em cards, avisos ou histórico visível. |
| D06 | Tipos de mídia: filme, episódio e canal recebem indicadores semanticamente diferentes. |
| D07 | Remoção de fonte: a confirmação explica o impacto sobre preferências e histórico. |

### Evidências a guardar

Gravar os percursos de primeira abertura, importação e retorno ao catálogo. Registrar o modelo da TV, a distância utilizada no teste, a versão do app e a fonte de demonstração. Os critérios acima ainda precisam ser executados; este relatório não certifica um aplicativo.

## 4. Fontes e escopo da pesquisa

[1] **Samsung Developer — Design Principles** — Fonte principal: ambiente de uso, princípios, foco e navegação.  
https://developer.samsung.com/smarttv/design/design-principles.html


Consulta: 13 de setembro de 2026. As recomendações e os critérios de aceite deste relatório não substituem as exigências de revisão vigentes no Seller Office.
