# Spike (US1) — resultado e decisão

**Data**: 2026-10-02 | **Script**: `tv-web/e2e/spike-mpegts-real.mjs` (fora do `test:e2e`) | **Resumo/teste**: `tv-web/scripts/spikeSummary.mjs` + `.test.mjs`

Lista real do `.env` (nenhum endereço, usuário, senha, URL ou nome de canal registrado aqui). A página do spike não usa o código do app: carrega `mpegts.js@1.8.2` direto de `node_modules` e alimenta um `<video>` mudo.

## Navegador

| Navegador | Disponível | H.264 + AAC (`MediaSource.isTypeSupported`) |
| --- | --- | --- |
| Chromium do Playwright (o do `test:e2e`) | sim | **sim** |
| Chrome instalado (`channel: 'chrome'`) | não tentado (o primeiro já decodifica) | — |

Isso resolve o **R-002**: a fixture `.ts` H.264/AAC do E2E (T018/T019) decodifica no navegador padrão do Playwright; `PULADO` (D-008) fica só como rede de segurança.

## Amostra

10 canais ao vivo espalhados por uma lista de 2360 (passo fixo, determinística), até 15 s por canal, duas execuções seguidas com o mesmo resultado.

| Resultado | Canais |
| --- | --- |
| Vídeo **e** áudio decodificados | **9 de 10** |
| Erro de rede | 1 (o mesmo canal nas duas execuções — persistente, não é instabilidade do spike; provavelmente canal indisponível no painel) |
| Só vídeo / só áudio / erro de demux / nada decodificado / tempo esgotado | 0 |

Tempo até tocar (canais ok): mediana ≈ 3,0 s, máximo ≈ 6,3 s na primeira execução e ≈ 3,3 s na segunda — bem dentro do limite de 15 s do SC-002.

## Limite do que isto prova

- 10 canais não cobrem a lista: HEVC/AC3 podem existir em outros canais (a amostra não encontrou nenhum, mas não os exclui). O limite aceito continua o da spec: o que o Chromium decodificar.
- Prova a decodificação com a biblioteca numa página mínima, **não** o fallback dentro do app (isso é a Fase 4) e **nada** sobre o AVPlay da TV (FR-011).

## Decisão

**SEGUIR.** 9/10 (> metade) decodificam vídeo e áudio; o navegador do E2E decodifica H.264/AAC. As Fases 4–6 estão liberadas (D-007, FR-002).

Fato que também resolve uma dúvida do plano: a API de log da biblioteca existe nos tipos instalados (`Mpegts.LoggingControl.applyConfig({ enableAll: false, … })`) — R0-5/R-003 podem usá-la.
