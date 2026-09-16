# 06. Player de canais, filmes e séries

**Página pesquisada:** Media Player
**Consulta:** 13 de setembro de 2026
**Link fornecido:** https://developer.samsung.com/smarttv/design/media-player.html

> Manter a operação do player previsível e habilitar somente as capacidades realmente disponíveis no conteúdo.

## 1. Síntese da orientação oficial

O player deve oferecer controles na tela acessíveis por setas e SELECT. O guia descreve reprodução/pausa, saltos de 10 segundos e anterior/próximo. Com controles visíveis, esquerda e direita navegam entre ações; sem controles, fazem os saltos, exibindo a barra. SELECT, cima ou baixo revelam os controles. A orientação prevê ocultá-los após 5 segundos sem interação. [1]

O capítulo também apresenta composição para fotos e música, mas esses modos não integram o escopo principal informado. [1] A regra de salto não deve ser interpretada como garantia de que uma transmissão ao vivo oferece retrocesso.

### Reprodução, segundo plano e proteção de tela

A Samsung orienta desligar o screensaver durante vídeo em reprodução e reativá-lo quando pausado ou parado. [2] Também orienta observar visibilitychange; ao ocultar o app durante mídia, o tratamento deve seguir o comportamento de retorno, e a retomada deve revalidar rede e dados expirados. [3]

### Separação de responsabilidades proposta

O player deve receber um item já resolvido para reprodução. Importar listas, descobrir metadados, favoritar e manter histórico pertencem a serviços separados. Isso permite trocar ou recuperar uma sessão de vídeo sem reprocessar o catálogo inteiro.

> Os exemplos visuais do guia não definem compatibilidade universal de codec, protocolo, DRM ou retrocesso em live. Essas capacidades precisam ser verificadas por conteúdo e aparelho.

## 2. Comportamento proposto por tipo de mídia

| Tipo | Interface e ações sugeridas |
| --- | --- |
| Canal ao vivo | Mostrar Ao vivo, nome, grupo e ações de canal. Não oferecer uma duração total fictícia. |
| Live com janela de retorno | Habilitar busca temporal somente na janela efetivamente disponível; oferecer Voltar ao vivo. |
| Filme | Progresso, duração, retomar, reiniciar, áudio e legendas quando disponíveis. |
| Episódio | Identificar série, temporada e episódio; oferecer próximo apenas quando existir. |

### Estados explícitos

Propor estados distintos: preparando, carregando buffer, reproduzindo, pausado, buscando posição, concluído e erro. Uma mensagem de Carregando não deve esconder autenticação inválida ou formato incompatível. Oferecer Tentar novamente e Voltar, evitando ciclos automáticos infinitos.

### Retorno e interrupção

Ao usar RETURN, fechar primeiro um menu de áudio ou legenda aberto. Se não houver uma camada parcial, sair da reprodução e retornar ao catálogo. Ao ocultar o app, executar o fluxo de interrupção completo, sem deixar áudio tocando por acidente. Salvar progresso em pontos intermediários, não apenas no encerramento.

### Histórico e conclusão

Registrar identificadores estáveis de conteúdo, posição e data. Para VOD, propor conclusão automática a partir de 90% como ponto inicial de teste, com correção manual. Esse limiar é uma decisão do produto. Para série, calcular progresso a partir dos episódios; para canal, guardar acesso recente, não um percentual concluído.

### Troca de conteúdo

Impedir sessões sobrepostas quando o usuário troca rapidamente de canal. Descartar eventos atrasados do vídeo anterior. Preservar as preferências de legenda e áudio quando a próxima mídia oferecer uma opção equivalente, sem afirmar que essa faixa existe em todos os itens.

## 3. Critérios de aceite propostos

| ID | Cenário e resultado esperado |
| --- | --- |
| P01 | Controlar todas as ações essenciais sem teclas extras no controle. |
| P02 | Live sem retorno: os controles não prometem uma busca temporal impossível. |
| P03 | Pausar e retomar VOD: posição, indicador e estado visual permanecem coerentes. |
| P04 | Perder rede: a sessão informa falha e permite recuperação sem travar o catálogo. |
| P05 | Trocar canal repetidamente: não acumular áudio, listeners ou sessões antigas. |
| P06 | Ocultar e reabrir o app: não reproduzir áudio indevido; revalidar a sessão. |
| P07 | Sair após assistir parte de um episódio: o histórico aponta para o episódio correto. |
| P08 | Pausar por período prolongado: validar a proteção de tela nas configurações do aparelho. |

### Evidências de reprodução

Guardar modelo, firmware, versão do app, origem do stream e sequência de comandos, com URLs sensíveis removidas. Incluir live e VOD, falha no início e durante reprodução, troca de fonte e ausência de legendas. A aprovação exige execução em hardware-alvo, não apenas a existência destes critérios.

## 4. Fontes e escopo da pesquisa

[1] **Samsung Developer — Media Player** — Controles visuais, comandos, saltos e ocultação.  
https://developer.samsung.com/smarttv/design/media-player.html

[2] **Samsung Developer — Setting Screensaver** — Proteção de tela conforme o estado da mídia.  
https://developer.samsung.com/smarttv/develop/guides/fundamentals/setting-screensaver.html

[3] **Samsung Developer — Multitasking** — Visibilidade, interrupção e retomada do aplicativo.  
https://developer.samsung.com/smarttv/develop/guides/fundamentals/multitasking.html


Consulta: 13 de setembro de 2026. As recomendações e os critérios de aceite deste relatório não substituem as exigências de revisão vigentes no Seller Office.
