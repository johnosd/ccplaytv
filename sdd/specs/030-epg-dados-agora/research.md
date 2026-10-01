# Research — 030-epg-dados-agora

Spike executado no `sdd-plan` (2026-09-29) contra a lista e o EPG reais do
`.env` da raiz (`CCPLAY_PROBE_*`). O script vive fora do repositório (scratchpad
da sessão) e só imprimiu contagens/formatos — **nenhum valor de credencial ou
URL foi registrado aqui nem em lugar nenhum**. Para repetir: ler o `.env` em
tempo de execução, nunca colar valores.

## R1 — O painel Xtream expõe o id de EPG do canal? Qual campo?

**Decisão**: `epg_channel_id` de `get_live_streams`, string não vazia após
`trim()`. `null`/vazio = canal sem EPG.

**Evidência**: 2.266 canais ao vivo em 41 categorias; chaves do item:
`num, name, stream_type, stream_id, stream_icon, epg_channel_id, added,
custom_sid, tv_archive, direct_source, tv_archive_duration, category_id,
category_ids, thumbnail`. 954 canais com `epg_channel_id` não vazio; o resto
vem `null` (tipo `object`). Vários canais compartilham o mesmo id (variantes
HD/SD/FHD do mesmo canal, ex.: um id repetido 5×) — a associação é
**muitos-canais → um id**, nunca 1:1.

**Alternativas**: casar por nome (`display-name`) — rejeitada pela spec
(FR-008) e pela constitution ("Nunca Inventam Dados").

## R2 — `xmltv.php` do painel: CORS, tamanho, formato, cobertura

**Decisão**: endereço do painel = `${dns}/xmltv.php?username=…&password=…`
(mesma credencial, via `readCredential`). Leitura em fluxo mesmo com tamanho
modesto, porque outros provedores/URLs `url-tvg` chegam a dezenas de MB.

**Evidência**:
- `200` em ~1,2 s; `Access-Control-Allow-Origin: *` — o navegador lê direto
  (ADR-008 continua valendo para EPG).
- 2,24 MB de XML (o servidor manda `Content-Encoding: gzip` de transporte, que
  o `fetch` já descomprime sozinho; o corpo NÃO começa com o magic gzip).
- 982 `<channel>`, 7.499 `<programme>`, **todos com `<desc>`**.
- Fuso declarado em 100% dos horários: `-0300`.
- Cobre ~8 dias (primeiro início 23/09, último 01/10); ~1.350 programas caem
  na janela −12 h…+48 h — é o que o aparelho guarda.
- **954/954** canais com `epg_channel_id` casam **por igualdade exata** com um
  `<channel id>` do XMLTV.
- Há `<channel id="">` (id vazio) no arquivo — programa com `channel` vazio é
  descartado (nunca vira chave "").

## R3 — URL EPG externa do `.env` (`CCPLAY_PROBE_EPG`)

**Evidência**: `http://`, sem query, host diferente do painel, caminho sem
extensão reconhecível. A conexão **expirou** a partir da máquina de
desenvolvimento (`UND_ERR_CONNECT_TIMEOUT`) — não foi possível medir tamanho,
gzip nem CORS.

**Decisão**: o caminho "endereço manual" (FR-016) é validado nesta feature com
fixture local no E2E; a URL real fica como verificação da passada na TV/rede de
casa (R-001 do `plan.md`). O painel (`xmltv.php`) é o caminho principal e está
provado.

## R4 — gzip de arquivo (`.xml.gz`)

**Decisão**: detectar pelo conteúdo — os 2 primeiros bytes `1f 8b` no primeiro
pedaço do corpo — e só então passar o fluxo por `DecompressionStream('gzip')`
(Chromium 80+, presente no Chromium 108 da TV). `Content-Encoding: gzip` de
transporte **não** conta: o `fetch` já entrega descomprimido (R2).

**Alternativas**: decidir pela extensão `.gz` (rejeitada pela spec, FR-002);
biblioteca JS de inflate (peso extra sem necessidade — a API nativa existe no
alvo).

## R5 — Onde ler o XMLTV sem travar a TV

**Decisão**: Web Worker próprio (`epgWorker.ts`), com o mesmo plano B do
`importRunner.ts` (thread principal se o Worker não subir). Parser próprio por
varredura de texto — **`DOMParser` não existe em Worker**, e um SAX genérico
seria dependência nova para um formato com 3 elementos relevantes.

**Alternativas**: reusar o Worker de importação com uma mensagem nova (acopla
dois ciclos de vida diferentes — importação termina o Worker ao concluir);
thread principal sempre (2 MB passa, 50 MB congelaria a navegação — FR-003).

## R6 — Canais gravados antes desta feature (FR-007)

**Achado**: categorias `stored` (M3U, feature 014) apagam os blocos de
`storedEntries` na primeira leitura, e os blocos gravados antes desta feature
não têm `tvg-id`; o `url-tvg` do cabeçalho também nunca foi guardado. Para
essas fontes, "renovar a categoria" não tem de onde reler o dado — só uma
nova importação resolve.

**Decisão**: migração única e silenciosa por ressincronização ao abrir a fonte
— o mesmo mecanismo já usado pela feature 004 (`decideOnOpen` → `'migrate'`,
importação em segundo plano sem tela de progresso, `App.tsx`
`autoRefreshJobId`). Vale para toda fonte sincronizada sem a marca
`epgIdsCapturedAt`; numa fonte Xtream custa segundos (só estrutura, feature
010) e as categorias são reobtidas na próxima entrada, já com o id. O
resultado para a pessoa é o do FR-007 (nenhuma ação); o mecanismo difere do
texto da spec ("renovada na próxima entrada") — registrado em R-002 do
`plan.md`.
