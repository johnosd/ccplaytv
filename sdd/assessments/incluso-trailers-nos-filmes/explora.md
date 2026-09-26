# Assessment Explora: Inclusão de Trailers

- **Slug**: incluso-trailers-nos-filmes
- **Criado**: 2026-09-24
- **Origem**: Ideia do backlog ("inclusão de trailers nos filmes")

## Ideia Bruta

Permitir que o usuário assista a trailers de filmes (e possivelmente séries) antes de decidir reproduzi-los. Atualmente, a tela de detalhes de filme (`MovieDetailScreen.tsx`) já possui um botão "Trailer" desenhado na UI, que hoje apenas dispara um toast. A ideia é dar funcionalidade a esse botão, exibindo o trailer do filme em questão.

## Evidência a Favor

- **Design Existente**: A UI atual (`MovieDetailScreen`) já prevê esse botão e a ação primária dupla (Assistir / Trailer).
- **Padrão de Mercado**: Essencial para a experiência em TV, onde o usuário não tem uma segunda tela tão acessível para buscar o trailer por conta própria antes de decidir gastar tempo com o filme.
- **Disponibilidade via Xtream**: A API Xtream Codes (no endpoint `get_vod_info`) geralmente envia um campo `youtube_trailer` com o ID do YouTube do trailer.
- **Integração Futura TMDB**: Já está no backlog (P1) a integração com TMDB, que através de `append_to_response=videos` traz facilmente as chaves do YouTube para os trailers oficiais.

## Evidência Contra

- **Viabilidade Técnica no Tizen (Foco e Iframe)**: Reproduzir YouTube em apps Tizen via `<iframe>` traz um problema crônico de UX com o controle remoto (D-pad). O iframe da Google rouba o foco e os eventos de teclado, impedindo que o usuário use o botão "Voltar" ou as setas da TV adequadamente. Exige hackear a YouTube Iframe Player API para tirar o foco do iframe e rotear os botões via JavaScript.
- **Acoplamento com TMDB**: Para provedores baseados em `.m3u` legado, não há trailer. A feature pode acabar ficando bloqueada (ou restrita só para contas Xtream completas) até que a Epic do TMDB (buscando metadados extras no backend) seja construída.
- **Arquitetura de Player**: Hoje o app usa `PlayerService` com adaptadores (`html-video` e `avplay`). Adicionar YouTube exige ou construir um `youtube-adapter` (misturando conceitos de streaming vs iframe) ou tratar o trailer de forma completamente separada do player principal (um modal de UI sobreposto).

## Perguntas em Aberto

- Essa feature deve esperar a integração com o TMDB, ou usamos inicialmente apenas o campo `youtube_trailer` do Xtream?
- Para o player de trailer, construiremos um adaptador para o `PlayerService` existente ou faremos um componente UI completamente à parte (`YoutubeModal`)?
- Como lidaremos com a captura de botões (D-pad e Return) no iframe do YouTube para garantir que o usuário não fique preso na tela do trailer?

