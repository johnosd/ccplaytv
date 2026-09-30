# Prompt para o Claude Design — CCPlayTv (Samsung Tizen)

> Cole o texto abaixo no Claude Design. Anexe também a imagem de referência do
> logo "IA Creators Hub" junto com o prompt — a descrição em texto é reforço,
> não substitui a imagem.

---

Quero o design system e o wireframe de alta fidelidade de um app de Smart TV
Samsung (Tizen), chamado **CCPlayTv**. É um cliente de IPTV: o usuário
cadastra uma ou mais listas de canais/filmes/séries (por URL M3U ou por
credenciais de um provedor Xtream) e navega um catálogo organizado em Live
TV, Filmes e Séries, enriquecido com metadados (sinopse, elenco, trailer).

## Restrições de plataforma (não são sugestões — são obrigatórias)

- **Controle é só o remoto da TV**: setas (↑↓←→), OK/Enter e Voltar. Não
  existe mouse, não existe toque. Todo elemento interativo precisa de um
  **estado de foco** claramente visível e de alto contraste — é o estado mais
  importante do design, mais até que hover (que não existe aqui).
- **UI "10 pés"**: vista de um sofá, a uns 2-3 metros de distância. Fontes
  grandes, alto contraste, pouca informação densa por tela.
- **Landscape fixo**, resolução base 1920×1080 (Full HD), TV com tela de 50".
- **Margem de segurança (overscan)**: manter conteúdo interativo dentro de
  ~90% da tela — nada essencial encostado na borda.
- **Tema escuro** como base — reduz cansaço visual em sala escura/à noite e é
  o padrão do gênero (Netflix, Disney+, Prime Video, Apple TV).
- **Fluidez com moderação**: transições e microanimações são bem-vindas, mas
  o hardware da TV é modesto — evitar blur pesado, glassmorphism exagerado ou
  animações custosas demais.

## Identidade visual — referência de marca

O logo do CCPlayTv precisa ter o nome **"CCPlayTv"** escrito, num estilo
**parecido com o logo em anexo** ("IA Creators Hub"): letras bold/arredondadas
com textura de tinta/pincelada e gradiente multicolorido vibrante (rosa →
laranja → amarelo → verde → azul-petróleo), sensação criativa, energética,
"paint splash". Pode ter uma faixa secundária sólida (como o "CREATORS HUB"
do exemplo) se fizer sentido para o nome CCPlayTv.

Referência adicional de marca/tom: https://chaiglobal01.wixsite.com/ia-creators-hub

Adapte esse estilo pro contexto de um app de TV: precisa funcionar sobre
fundo escuro, precisa ter uma versão compacta (ícone quadrado, para tela
inicial da TV e splash screen) além da versão wordmark completa. Proponha
também uma cor de destaque (accent) extraída dessa paleta para usar em
botões, estados de foco e realces na UI toda — o app precisa ter coerência
visual entre o logo e a interface.

## Telas a desenhar

Para cada tela, mostrar o estado normal **e** pelo menos um elemento com foco
ativo (para deixar claro como o foco se destaca visualmente).

### 1. Splash / Abertura
Tela de entrada do app com animação de revelação do logo CCPlayTv, antes de
cair na tela inicial. Descreva a animação sugerida (ex.: fade + scale, traço
se desenhando, partículas da paleta) mesmo que o wireframe seja estático.

### 2. Início — Minhas Listas
- **Primeiro uso (vazio)**: estado vazio, com um botão central de destaque
  "Adicionar lista".
- **Uso normal**: uma ou mais listas já cadastradas aparecem como
  cards/ícones clicáveis (o app suporta múltiplas listas na mesma TV), mais
  um card fixo de "Adicionar lista" para incluir outra. Cada card mostra
  nome da lista e algum indicativo de status (ex. última sincronização).
- **Ações por lista**: ao focar um card, deve ficar visível como o usuário
  recarrega (resincroniza) ou exclui aquela lista — pode ser um menu
  contextual, ícones secundários que aparecem no foco, ou botões dedicados.

### 3. Adicionar lista
Formulário com alternância entre duas formas de entrada: **URL da lista
M3U** ou **Endereço, usuário e senha** (provedor Xtream). Campos de texto
precisam deixar claro visualmente que abrem teclado virtual ao serem
focados/confirmados.

### 4. Tela principal da lista
Depois de entrar numa lista, o usuário vê 3 pontos de entrada bem
destacados: **Live TV**, **Filmes**, **Séries**.

### 5. Live TV
Navegação por **grupos de canais** (categorias) de um lado, lista de canais
do grupo selecionado do outro, e uma **prévia do canal** (preview de vídeo
ou thumbnail) conforme o usuário navega pelos canais com o foco.

### 6. Filmes — grade
Grid paginado de pôsteres/capas de filmes, estilo catálogo de streaming.

### 7. Detalhe do filme
Capa/backdrop em destaque, título, nome dos atores/elenco, botão de
**trailer** e botão de **assistir** (acesso ao player).

### 8. Séries — grade
Grid paginado de pôsteres/capas de séries (mesmo padrão visual da grade de
filmes).

### 9. Detalhe da série
Capa/backdrop, seletor de **temporada**, lista de **episódios** da
temporada selecionada, com acesso ao player por episódio.

## Entrega esperada

- Um pequeno style guide: paleta de cores (incluindo a cor de destaque
  derivada do logo), tipografia (escala de tamanhos), espaçamento, raio de
  borda, e o tratamento visual do **estado de foco** (isso vai virar CSS
  depois, então quanto mais específico — cor, espessura, glow/outline —
  melhor).
- Wireframes/mockups de alta fidelidade das 9 telas acima, em 1920×1080,
  tema escuro, com pelo menos um elemento em estado de foco visível em cada
  tela.
- Proposta de logo CCPlayTv (wordmark completo + versão ícone compacto),
  seguindo a referência visual descrita acima.
