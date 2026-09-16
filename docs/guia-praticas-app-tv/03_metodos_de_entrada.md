# 03. Controle remoto e navegação

**Página pesquisada:** Input Methods
**Consulta:** 13 de setembro de 2026
**Link fornecido:** https://developer.samsung.com/smarttv/design/input-methods.html

> Todas as ações essenciais devem ter um caminho por setas, seleção e retorno; atalhos são complementares.

## 1. Síntese da orientação oficial

Todas as funções devem ser acessíveis pelo Smart Remote. Setas deslocam o foco e SELECT executa a ação. RETURN volta na hierarquia; na home, encerra o app, com confirmação de saída recomendada. Listas não devem circular automaticamente entre início e fim. Em grades, o deslocamento considera proximidade e direção. Nas categorias, o item anterior é restaurado quando a categoria não muda; uma nova categoria começa no primeiro item. [1]

Nos modelos e fluxos que incluírem touch ou mouse, a documentação também pede maneiras visíveis de voltar e sair. Essas entradas complementam o controle remoto, não o substituem. [1]

### Complemento técnico

Setas, Enter e Back são detectados sem registro separado. Outras teclas podem exigir TVInputDevice, declaração do privilégio tv.inputdevice e registro. Consultar getSupportedKeys() antes de depender de teclas opcionais. O guia distingue clique em Back de pressão prolongada em Exit. [2]

| Evento | Código documentado |
| --- | --- |
| ArrowLeft / ArrowUp / ArrowRight / ArrowDown | 37 / 38 / 39 / 40 |
| Enter / Back | 13 / 10009 |
| MediaPlayPause | 10252 |

Os códigos acima são referência técnica de [2]. Não registrar indiscriminadamente todas as teclas do aparelho.

## 2. Mapa de interação proposto

| Contexto | SELECT | RETURN |
| --- | --- | --- |
| Home | Abre a seção ou a fonte. | Abre a confirmação de saída. |
| Lista de categorias | Confirma a categoria. | Volta à seção anterior. |
| Card de filme ou série | Abre detalhes. | Restaura a tela de origem. |
| Item de canal | Inicia a reprodução. | Retorna à lista de grupos. |
| Menu de ações | Executa a ação selecionada. | Fecha sem mudar de tela. |
| Formulário | Edita o campo ou confirma. | Fecha primeiro a edição ativa. |
| Player | Opera o controle em foco. | Fecha a camada aberta ou retorna ao catálogo. |

### Gerenciamento central de foco

Propor um controlador único com escopos: página, menu, diálogo, teclado e player. Ao abrir um diálogo, guardar a origem e limitar a navegação à camada ativa. Ao fechar, devolver o foco ao item que abriu a camada; se ele deixou de existir, usar uma posição de recuperação previamente definida.

### Grades extensas e repetição

Para filmes e séries, conservar coluna preferida ao mover entre linhas incompletas. Separar uma tecla mantida pressionada de vários comandos de confirmação para evitar reproduções duplicadas. Depois de atualizar ou filtrar o catálogo, reconciliar o foco pelo identificador do item, não apenas pelo índice.

### Ações secundárias explícitas

Favoritar, Marcar como assistido, Ordenar e Gerenciar fonte devem aparecer em botões ou menus alcançáveis. Pressão longa, teclas coloridas, voz e gestos podem servir como atalhos, mas não como único acesso. Volume permanece com a função de volume da TV, sem virar navegação de catálogo.

## 3. Testes de navegação propostos

| ID | Cenário e resultado esperado |
| --- | --- |
| I01 | Percorrer todas as funções com um Smart Remote sem teclas numéricas dedicadas. |
| I02 | Chegar às extremidades: o foco não salta inesperadamente para o lado oposto. |
| I03 | Abrir e fechar menu de favorito: o card de origem recupera o foco. |
| I04 | Trocar filtro ou ordenação: não existe foco perdido, duplicado ou fora da tela. |
| I05 | Manter uma seta pressionada: a navegação continua responsiva, sem disparar SELECT. |
| I06 | Abrir teclado e usar RETURN: não encerrar o app por propagação indevida do evento. |
| I07 | Sair do player: liberar a reprodução e restaurar corretamente a origem. |
| I08 | Testar Back e Exit em aparelho físico e registrar diferenças do emulador. |

### Observação de implementação

O mapa é uma proposta de produto. Resolver o tratamento de RETURN em camadas sem alterar sua finalidade de voltar ou sair. Documentar o comportamento escolhido e testá-lo junto do ciclo de vida, especialmente quando a TV suspender o app.

## 4. Fontes e escopo da pesquisa

[1] **Samsung Developer — Input Methods** — Funções básicas, listas, grades, categorias e entradas adicionais.  
https://developer.samsung.com/smarttv/design/input-methods.html

[2] **Samsung Developer — Remote Control** — Registro de teclas, privilégio, eventos e códigos.  
https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html


Consulta: 13 de setembro de 2026. As recomendações e os critérios de aceite deste relatório não substituem as exigências de revisão vigentes no Seller Office.
