# Assessment Decision: Inclusão de Trailers

- **Slug**: incluso-trailers-nos-filmes
- **Decidido**: 2026-09-24
- **Problem**: ./problem.md
- **Veredito**: needs-clarification

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | O usuário perde tempo para descobrir sobre o que é o filme e o botão "Trailer" atual já existe na UI como uma promessa não cumprida. |
| Força da evidência | strong | Presença do botão na tela atual e padrão consolidado de apps de streaming na TV. |
| Valor vs. custo de inação | adequate | O app sobrevive sem trailers, mas a experiência fica inferior aos competidores oficiais. |
| Viabilidade / apetite | weak | A ausência da integração com o TMDB e a sabida dificuldade técnica de injetar e controlar um `iframe` do YouTube em uma aplicação Tizen TV derrubam a viabilidade no curtíssimo prazo. |
| Fit estratégico | strong | Agrega extremo valor ao catálogo de VOD (filmes/séries). |

## Abordagens Candidatas

### Abordagem 1: Modal Iframe via TMDB (Recomendada)
- Renderizar um componente modal em tela cheia que contém o player embed do YouTube. Esse componente será isolado da arquitetura do `PlayerService`. As chaves do YouTube serão consumidas da base de dados local, recém preenchidas por um serviço assíncrono de enriquecimento usando a API do TMDB.
- **Recomendada**: sim — Isola a lógica complexa de manipulação de foco/iframe do player principal de streams `.m3u` e resolve a carência de trailers para provedores que não enviam a chave do YouTube (garantindo trailers para todos).

### Abordagem 2: Integração de Youtube no PlayerService via Xtream
- Criar um `YoutubeAdapter` que consome apenas o campo `youtube_trailer` enviado pelo painel Xtream no momento do carregamento da tela.
- **Recomendada**: não — Exclui os usuários de listas `.m3u` simples, polui o conceito do `PlayerService` (que hoje reproduz apenas media source/avplay), e esbarra no fato de que o campo do Xtream é frequentemente ausente.

## Veredito

Como decidido explicitamente pelo usuário, a feature será bloqueada e não fará handoff para implementação (`sdd-specify`) agora, caindo portanto num estado de `needs-clarification`. A barra para `go` exige viabilidade plena e apetite imediato. O escopo da integração do TMDB é uma Epic em si (P1) e precisa ser concluído antes que possamos extrair o ID de trailers de maneira universal. Além disso, teremos que dominar o controle de foco do iframe da Google dentro do Tizen.

### Se needs-clarification — Perguntas Bloqueantes

- A Epic de "Integração TMDB (P1)" já foi concluída e o banco de dados/backend já dispõe da chave do YouTube atrelada a cada item do catálogo de VOD?
- Como contornaremos a armadilha do foco no `iframe` do YouTube? Há bibliotecas recomendadas (`react-youtube`, etc) que permitam manipular play/pause sem ceder o foco nativo do D-pad ao iframe?

**Fase a revisitar**: define

