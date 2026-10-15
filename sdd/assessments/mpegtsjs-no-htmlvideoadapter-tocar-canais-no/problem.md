# Assessment Problem: Reproduzir canais ao vivo no navegador do dev

- **Slug**: mpegtsjs-no-htmlvideoadapter-tocar-canais-no
- **Criado**: 2026-10-02
- **Explora**: não rodada (a evidência veio de uma reprodução direta, descrita abaixo)

## Problem Statement

No `npm run dev` nenhum canal ao vivo toca: o app usa o `htmlVideoAdapter` (`<video>`), e o Chromium não decodifica MPEG-TS bruto, que é o formato das URLs Xtream (`/live/u/p/<id>.ts`). O resultado é `PLAY-04` em todo canal, então os fluxos de player (zapping, chrome, guia sobre o vídeo, reconexão) só podem ser exercitados com vídeo de verdade na TV física.

## Usuários / Partes Afetadas

- Quem desenvolve o app (hoje, o autor) — para validar qualquer mudança em player/Live/zapping/guia com vídeo real precisa do ciclo de instalar na TV (skill `tizen-tv`); no PC só vê a tela de erro.
- Os scripts E2E (Playwright) — hoje contornam isso com um `webapis.avplay` falso (3 scripts) ou com mídia fictícia; nenhum toca um stream real da lista.
- A TV de produção **não é afetada**: o AVPlay toca `.ts` nativamente.

## Goals

- No `npm run dev`, um canal ao vivo `.ts` de uma lista Xtream real chega a `playing` (som/imagem) no Chromium.
- A lib de demux fica **fora do bundle da TV**: `build` e `build:tizen` não a incluem nem mudam.
- Reaproveitar o contrato de `PlayerAdapter` existente: nenhuma tela passa a saber qual motor está ativo.

## Non-Goals

- Provar compatibilidade da TV: o `htmlVideoAdapter` continua declarando que não prova mídia; a prova segue sendo o AVPlay no aparelho.
- Cobrir tudo que a TV toca (HEVC, AC3/EAC3, DRM, headers por item da feature 044/25b): o que o Chromium decodificar já basta.
- HLS (`.m3u8`) e VOD: só entram se saírem de graça; o alvo é canal `.ts`.
- Mudar o build de produção, o app web ou o adaptador do AVPlay.
- Substituir a validação na TV física, nem os testes com `webapis.avplay` falso.

## Success Metrics

- Com a lista real do `.env` e a lib ativa, um canal `.ts` chega a `playing` em ≤ 15 s no Chromium, medido por um script Playwright (estado do player e `video.readyState`, sem URL/credencial na saída).
- `npm run build` e `npm run build:tizen` produzem os mesmos arquivos de antes (a lista de `tizen_web_project.yaml` não muda) e o bundle de produção não contém a lib.
- Os testes unitários dos adaptadores e a suíte `test:e2e` continuam verdes sem editar asserções existentes.

## Cost of Inaction

Continua funcionando, só mais devagar: toda verificação de player com vídeo real exige instalar na TV, e as features recentes (016, 027, 031, 042) deixaram "passada na TV" como pendência por falta de ciclo curto. Não há risco para o usuário final; o custo é de velocidade e de cobertura do desenvolvimento.
