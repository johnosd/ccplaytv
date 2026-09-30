# Assessment Decision: Trailers — viabilidade do YouTube IFrame e do `youtube_trailer`

- **Slug**: viabilidade-youtube-iframe-na-tv-campo
- **Decidido**: 2026-09-29 (1ª passada `needs-clarification`; revisto no mesmo dia
  após o spike na TV)
- **Problem**: ./problem.md
- **Veredito**: go

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | adequate | Trailer é requisito confirmado (RF-019) e o mock já está no detalhe; desejável, não essencial ao uso diário. |
| Força da evidência | strong | Spike na TV física (explora.md): 153 em todas as variantes sem origem http(s); com página intermediária http o trailer tocou 2/2 e o RETURN chegou ao app. Cobertura do provedor medida na lista real. |
| Valor vs. custo de inação | adequate | Valor para descoberta de conteúdo; custo de inação baixo, mas o mock segue prometendo algo. |
| Viabilidade / apetite | adequate | Mecanismo provado no aparelho. Resta: hospedar a página em HTTPS (estática, aceita pelo usuário) e confirmar 1 vez que HTTPS público se comporta igual ao http da LAN. |
| Fit estratégico | adequate | Substitui mock (ADR-011) e reaproveita TMDB/metadata da 032. Custo: a primeira dependência de hospedagem própria do projeto — pede emenda na ADR-008 (via `sdd-adr`). |

## Abordagens Candidatas

### A. App `file://` → iframe de página estática HTTPS nossa → YouTube IFrame API

- Página de ~40 linhas, publicada em hospedagem estática gratuita (GitHub Pages ou
  Cloudflare Pages), recebe só o ID do vídeo (validado como 11 caracteres) e fala com o
  app por `postMessage` (origem validada nos dois sentidos). O app mantém o teclado e o
  RETURN; o iframe é uma camada em tela cheia, fechada por RETURN ou pelo fim do vídeo.
- **Recomendada**: sim — é a única que funcionou na TV.

### B. Deep link no app YouTube da TV

- Testado: a chamada é aceita mas o vídeo não abre (formato de payload desconhecido).
  E o usuário recusou fallback. Recomendada: não.

### C. IFrame direto do `file://`

- Testado: erro 153 em todas as variantes. Descartada.

## Veredito

**go.** O critério que bloqueava (viabilidade) saiu de `unknown` para `adequate` com
evidência no próprio aparelho, e a restrição de produto foi revista pelo usuário
diante dela (página estática, sem backend). Nenhum critério central está `weak` ou
`unknown`.

### Se go — Handoff

- **Problema**: a pessoa não consegue ver o trailer de um filme/série no detalhe; o
  botão é mock (`trailer`, `comingSoon.ts`, item 32 do backlog).
- **Abordagem recomendada**: A — iframe de uma página estática HTTPS própria que
  hospeda a YouTube IFrame API; o app (`file://`) nunca carrega o player direto.
  `TrailerService` separado do `PlayerService` (ADR-006 §4.8); fechar a sessão AVPlay
  antes de abrir o trailer (singleton); ação explícita, nunca no foco (ADR-011).
- **Fonte da referência** (decisão do usuário): **provedor primeiro, TMDB completa** —
  - Séries: `youtube_trailer` já vem em `get_series` (24% das 9 663 séries do painel
    de referência; sempre ID de 11 caracteres).
  - Filmes: `youtube_trailer` em `get_vod_info` (~1% na amostra) — na prática, TMDB
    `videos` via `append_to_response` no `lookupTmdb` já feito ao abrir o detalhe
    (exige a chave BYOK; sem ela, filme quase nunca terá trailer — dizer isso, sem
    mock).
  - Preferir tipo Trailer, idioma pt, oficial; teaser rotulado como teaser.
- **Escopo sugerido**: entra — ação Trailer real em filme e série, estados
  (consultando/indisponível/carregando/tocando/erro com código do YouTube
  100/101/150/153 sanitizado), RETURN e fim do vídeo devolvendo o foco ao botão,
  página estática + sua publicação, remover o mock `trailer`. Não entra — "Mais
  trailers", trailer por temporada/episódio, preview no foco, fallback (deep link/QR),
  qualquer backend/proxy.
- **Métricas de sucesso**: trailer toca na QN50Q60DAGXZD pela página HTTPS pública
  (não só http da LAN); RETURN fecha e restaura o foco; sem áudio duplicado com o
  AVPlay; ver trailer não altera histórico/progresso/assistido (TR-05/06/07/08);
  cobertura efetiva medida (provedor ∪ TMDB).
- **Perguntas em aberto pro sdd-specify / sdd-plan**:
  - Onde hospedar e sob qual domínio; quem publica/versiona a página (pasta própria no
    repo + deploy estático?). A página vira dependência externa do app — registrar em
    emenda da **ADR-008** (`sdd-adr`) antes do plano.
  - Página fora do ar/offline: estado de erro com ação focável, nunca tela presa.
  - Controles do player por D-pad (pausar/buscar) — por `postMessage` do app ou só
    RETURN no 1º corte?
  - O CLAUDE.md diz Chromium 108; o aparelho de referência reportou **Tizen 9.0 /
    Chromium 120** no spike. Não muda o alvo de build (`chrome108` continua seguro),
    mas vale corrigir a documentação.
  - Termos do YouTube: não ocultar branding/anúncios/controles; nenhuma extração.
