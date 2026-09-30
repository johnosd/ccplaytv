# Assessment Problem: Trailers — viabilidade do YouTube IFrame e do `youtube_trailer`

- **Slug**: viabilidade-youtube-iframe-na-tv-campo
- **Criado**: 2026-09-29
- **Explora**: ./explora.md

## Problem Statement

A pessoa que navega o catálogo na TV não tem como ver o trailer de um filme ou série
antes de decidir assistir; o botão "Trailer" do detalhe é hoje um mock soft-disabled.
Falta saber se existe um caminho **autorizado e sem infraestrutura nova** para tocar
um trailer do YouTube dentro do app empacotado na Samsung QN50Q60DAGXZD, e de onde
tirar a referência do vídeo.

## Usuários / Partes Afetadas

- Pessoa que assiste na TV — decide o que ver sem sair do app nem perder o foco.
- Pessoa sem chave TMDB (BYOK) — só teria trailer onde o provedor entrega o ID.
- O produto — a feature 032 deixou o mock `trailer` prometido; o item 32 do backlog
  depende de uma resposta honesta sobre viabilidade.

## Goals

- Decidir, com evidência, se o IFrame Player do YouTube toca no app Tizen **sem
  hospedar nenhuma página** (restrição do produto, respondida em 2026-09-29).
- Definir a fonte da referência: **provedor primeiro (`youtube_trailer`), TMDB
  `videos` completa** (escolha do usuário).
- Se viável: trailer por ação explícita (nunca no foco), sem alterar histórico/
  progresso, com RETURN restaurando foco (TR-05/06/07).

## Non-Goals

- ~~Página HTTPS hospedada por nós~~ — **revisto em 29/09/2026 após o spike**: o
  usuário aceita uma página **estática gratuita** (GitHub/Cloudflare Pages), sem
  backend, sem dados e sem chave, porque é o único caminho que funcionou na TV.
  Continua fora: qualquer servidor com lógica, proxy de vídeo ou backend.
- **Fallback de degradação** (app nativo do YouTube, QR/link): o usuário decidiu que,
  se o IFrame não funcionar, a feature **morre** — não construir alternativa. O deep
  link no app YouTube, testado, também não abriu o vídeo.
- Extrair stream/MP4 do YouTube, tocar por AVPlay, esconder anúncios/branding
  (ADR-006 §4.8, developer policies).
- Preview de trailer no foco; download/cache de vídeo; trailer offline.
- Trailer por episódio/temporada; "Mais trailers" (só um preferido no 1º corte).

## Success Metrics

- Spike na TV: um trailer de ID conhecido **toca e é encerrado pelo RETURN** dentro do
  app empacotado, sem erro 153/101/150, com áudio do AVPlay já fechado.
- Cobertura medida (já feita): séries com `youtube_trailer` no provedor ≈ 24% (2 298 de
  9 663); filmes ≈ 1% (1 de 80). Cobertura efetiva final = provedor ∪ TMDB, a medir
  com a chave real.
- Nenhuma URL/credencial em log ou requisição a terceiro além do ID do vídeo.

## Cost of Inaction

O detalhe segue com um botão "Em breve" para sempre, e o item 32 permanece uma
promessa sem viabilidade conhecida. O custo é baixo (funcionalidade desejável, não
essencial ao uso diário); o maior custo real seria construir a feature inteira e só
descobrir na TV que o player não abre.
