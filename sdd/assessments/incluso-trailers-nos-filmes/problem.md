# Assessment Problem: Inclusão de Trailers

- **Slug**: incluso-trailers-nos-filmes
- **Criado**: 2026-09-24
- **Explora**: ./explora.md

## Problem Statement

Na TV, navegar por filmes desconhecidos sem contexto audiovisual é frustrante, pois o usuário não consegue avaliar bem a obra apenas pelo pôster e sinopse. Existe a necessidade de assistir a um trailer oficial diretamente da página de detalhes para embasar a decisão antes de dar play no filme completo.

## Usuários / Partes Afetadas

- **Usuários da TV** — hesitam em assistir filmes novos pois a busca externa por um trailer via celular quebra o conforto do sofá.
- **Botão "Trailer" (UX)** — já desenhado na UI de Detalhes (`MovieDetailScreen`), porém apenas dispara um toast, gerando a sensação de feature incompleta.

## Goals

- Implementar a exibição de trailers oficiais na TV através de um componente modal/separado da arquitetura do `PlayerService` principal.
- Garantir que o foco (D-pad) e a tecla Return funcionem para que o usuário feche o vídeo do YouTube sem travar o app Tizen.
- Basear a obtenção do ID do YouTube **exclusivamente na futura integração com o TMDB** (já planejada no backlog).

## Non-Goals

- Construir um `YoutubeAdapter` para a stack de player.
- Suportar trailers localmente usando IDs extraídos do `get_vod_info` do Xtream (a decisão foi universalizar usando TMDB).
- Desenvolver a própria infraestrutura do TMDB como parte deste escopo (isso será pré-requisito).

## Success Metrics

- Botão "Trailer" comuta para um modal que inicia o vídeo do YouTube associado à chave do TMDB.
- Usuário consegue cancelar/voltar para a tela de detalhes usando apenas o controle remoto (Return/D-pad).

## Cost of Inaction

- O usuário continuará ignorando boa parte do catálogo por falta de preview.
- Um elemento na tela primária de conversão (o botão Trailer) permanecerá disfuncional.

