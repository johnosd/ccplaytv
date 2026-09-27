# Research: Filmes e Séries no DS V14 (feature 025)

## R1 — Campos de ano, inclusão, duração e imagem no painel Xtream

**Decisão**: capturar, só de campo próprio da fonte:

- filme (`get_vod_streams`): `year`, com `releaseDate`/`release_date` como
  alternativa; `added` (epoch em segundos) como inclusão;
- série (`get_series`): `year`, com `releaseDate`/`release_date` como
  alternativa; **sem** inclusão (`last_modified` é data de atualização);
- episódio (`get_series_info`, `episodes[temporada][n].info`):
  `duration_secs` (alternativa `duration` "HH:MM:SS") e `movie_image`.

**Justificativa**: são os nomes usados pelas implementações comuns do
protocolo Xtream (XUI/Xtream-UI), conhecidos de fora deste repositório e
**ainda não confirmados aqui** — nenhum documento de `docs/` os registra (o
`docs/iptvnator/08-tela-filmes.md` só cita "year" como campo de card, sem
dizer de onde vem). O conector já recebe esses objetos inteiros e hoje
descarta os campos.

**Pendente de verificação (T001)**: confirmar contra o painel real, com a
credencial de teste do `.env` da raiz (nunca impressa em log, commit ou
documento — mesmo procedimento do R1 da feature 024), quais desses campos
vêm preenchidos e em que formato. Resultado vai para `Riscos e Decisões`
(R-001). Se um nome diferente aparecer, ele entra na captura sem mudar o
contrato travado. Se `year` nunca vier preenchido nesse painel, "Ano" fica
ausente para essa fonte, o que é o comportamento correto, não um defeito.

**Execução (2026-09-27, sessão em ambiente remoto)**: T001 não pôde ser
executado nesta sessão — o container de execução remota não tem o `.env` da
raiz (só `.env.example`, com valores de exemplo), então não há credencial de
teste nem painel real acessível para confirmar os nomes de campo. Isso é
uma lacuna de ambiente, não uma decisão de projeto: registrado como
verificação pendente em R-001 de `plan.md`, sem fingir uma confirmação que
não ocorreu. A implementação segue com os nomes já documentados acima (o
código já trata ausência/nome diferente como estado legítimo — "Ano" some
para a fonte, nunca um valor inventado), e uma sessão com acesso ao painel
real deve rodar a verificação de T001 antes de considerar R-001 encerrado.

**Alternativas consideradas**:

- Extrair o ano do título ("Filme (2020)"): rejeitada pela spec (FR-050) e
  pela constitution (heurística apresentada como dado).
- `get_vod_info` por filme para obter duração/sinopse: rejeitada. Seria uma
  consulta por item, fora de escopo (sinopse é do item 28) e contra
  "focar/abrir não dispara consulta externa" no caso da hero band.
- Gravar a duração vista pelo player no estado do usuário: rejeitada pelo
  usuário na sessão de planejamento (spec, Clarifications).

## R2 — Ordenação estável no alvo

**Decisão**: `Array.prototype.sort` com comparador; empates mantêm a ordem
de entrada.

**Justificativa**: `sort` é estável desde o V8 7.0 (Chrome 70); o alvo é
Chromium 108. O contrato travado de `vodSort` exige a estabilidade.

**Alternativas**: índice de desempate explícito. Desnecessário no alvo, mas
aceitável se o executor preferir.

## R3 — Altura útil da grade com a hero band fixa

**Decisão**: sem título de página separado (o título da entrada vai na
toolbar) e hero band de ≈150px. No palco 1920×1080, sobram ≈2 linhas de
cards 205×302 visíveis.

**Justificativa**: a spec escolheu hero compacta e fixa. Com título de página
mais toolbar mais hero de 200px, cabia ≈1,5 linha, e a grade viraria uma
faixa.

**Pendente**: confirmar no navegador (E2E/screenshot) e, se possível, na TV
física (recomendado, não gate). Se ficar abaixo de 2 linhas, reduzir a hero
antes de mexer no card (205×302 é a proporção V14).
