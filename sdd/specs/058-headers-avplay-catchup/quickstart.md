# Quickstart — 058 Headers da lista no AVPlay e catch-up Xtream

## Pré-requisitos

- `tv-web/`: `npm install` feito; `npm run dev` em outro terminal para os E2E.
- Para a TV: skill `tizen-tv` (TV ligada na LAN, perfil Samsung), e o PC e a
  TV na mesma rede (o painel falso roda no PC).
- Lista real: variáveis `CCPLAY_PROBE_*` no `.env` da raiz (nunca impressas).

## Checagens automatizadas

```powershell
cd tv-web
npx vitest run src/lib/player/avplayAdapter.headers-avplay-catchup.contract.test.ts src/components/PlayerLayer.headers-avplay-catchup.contract.test.tsx src/lib/epg/catchup.headers-avplay-catchup.contract.test.ts src/lib/catalog/archiveUrl.headers-avplay-catchup.contract.test.ts
cd ..; .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 058-headers-avplay-catchup; cd tv-web
npx tsc -b
npm run lint
npm test
node e2e/headers-catchup.mjs          # com `npm run dev` rodando
npm run test:e2e                      # gate da constitution antes da TV
npm run build:tizen
```

## Cenário A — US1 no navegador (E2E `e2e/headers-catchup.mjs`)

1. Servidor local serve uma lista M3U com dois canais: `Canal Header` (`|User-Agent=CCPlayTeste/1.0`)
   e `Canal Livre` (sem header), e o vídeo `fixtures/canal-teste.mpegts`. O
   servidor recusa (403) o vídeo do `Canal Header` sem esse User-Agent.
2. Adicionar a lista, abrir Live TV, OK em `Canal Livre` → toca.
3. OK em `Canal Header` → o `<video>` não envia headers → tela de erro com
   "Esta lista exige um header que esta TV não envia." e código `PLAY-05`;
   nenhum texto da página contém `CCPlayTeste`.
4. "Info técnica" do erro não mostra o valor.

## Cenário B — US2/US3 no navegador (mesmo script, painel Xtream falso)

1. Painel falso: `player_api.php` com `server_info.timezone = America/Sao_Paulo`,
   `time_now`/`timestamp_now` coerentes; `get_live_streams` com `Canal Arquivo`
   (`tv_archive: 1`, `tv_archive_duration: 3`) e `Canal Sem Arquivo`; XMLTV com
   programas das últimas 6 h e próximas 2 h; `/timeshift/...` responde o TS
   (a variante `rest`), `/streaming/timeshift.php` responde 404.
2. Live TV: a prévia do `Canal Arquivo` mostra "Arquivo · 3 dias"; a do outro não.
3. Guia completo: programa passado do `Canal Arquivo` tem a marca; OK → player
   com selo "Arquivo", título do programa, barra com a duração do EPG.
4. ⏸, ⏩, "Ao vivo" → volta ao ao vivo (selo "AO VIVO").
5. Programa passado do `Canal Sem Arquivo` → OK mostra "Este programa já terminou.".
6. Ao vivo do `Canal Arquivo` → → (linha) → "Do início" → toca do começo do programa atual.
7. RETURN no arquivo aberto pelo Guia → Guia com o foco no programa.
8. Painel falso responde 404 nas duas variantes → erro `PLAY-06` com "Ao vivo" e "Voltar".
9. Capturas: `test-results/headers-catchup/`.

## Cenário C — TV física (T003 e T014 são gates; a T043 final é recomendação)

**T003 (gate da Fase 2):** com `node e2e/lib/servidorHeadersArquivo.mjs --lan` no PC
(registra os headers recebidos por pedido em `/_registro`), instalar na TV um
build com o adaptador da T002 e conferir:

- `USER_AGENT` aplicado chega ao servidor? (registro mostra `CCPlayTeste/1.0`)
- Alguma propriedade aceita `Referer`? (testar só as que a referência Samsung
  documentar; registrar o que lançou)
- `Intl.DateTimeFormat` com `timeZone: 'America/Sao_Paulo'` funciona no app?
- Depois de `close()`, um `open` sem headers ainda envia o UA anterior? (não deve)

Registrar em `plan.md` → R-001/R-005.

**T014 (gate da Fase 3):** o filme `.ts` do painel falso, aberto pelo caminho de
VOD que já existe, com `range: true` e `range: false` — ⏩/⏪ e barra funcionam?
Registrar em `plan.md` → R-003.

**Passada final (recomendada):** Cenários A e B na TV (painel falso na LAN), e
a lista real: canal com arquivo → OK num programa passado → esperado hoje o
erro `PLAY-06` (o painel responde 404, research R3). Catch-up com a lista real
fica **"não testado"** enquanto o painel não servir arquivo — nunca "aprovado".

## Itens cross-cutting da constitution

- Nenhum valor de header, URL de arquivo ou credencial em log, tela, erro,
  `aria-*` ou Info técnica (grep nos registros do E2E e inspeção do DOM).
- Todo estado novo tem foco: erro `PLAY-06` (Ao vivo/Voltar), "Do início"
  desabilitado (soft disabled, OK explica).
- Focar um programa no Guia não toca nada nem consulta rede.
- RETURN restaura o foco (Guia → programa; Live → canal).
