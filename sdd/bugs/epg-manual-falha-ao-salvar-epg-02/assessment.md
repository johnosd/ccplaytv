# Bug Assessment: EPG manual falha com EPG-02 embora o navegador baixe o XML

- **Slug**: epg-manual-falha-ao-salvar-epg-02
- **Criado**: 2026-10-02
- **Origem**: texto colado
- **Veredito**: valid (reproduzido) — mas a causa é do servidor do EPG; no app há só uma lacuna de diagnóstico
- **Severidade**: medium

## Report

Ao incluir o endereço de EPG manual em Configurações › Fontes IPTV, no formato
`http://cbsrv.top/epg/<usuario>/<senha>`, o salvamento falha com "Não foi possível
baixar a programação. Verifique a conexão ou o endereço. EPG-02". No navegador
(navegação direta) o mesmo endereço baixa o XML.

## Symptom

Esperado: o EPG sincroniza. Observado: `EPG-02` com a mensagem da categoria `network`.

## Reproduction

1. `curl` sem User-Agent de navegador em `/epg/<u>/<p>` → 403 (filtro do servidor; não é o caso do app, que roda em navegador).
2. Com User-Agent de navegador, o mesmo endereço responde **302** para `http://cbsrv.top/epg.php?username=…&password=…`, e essa resposta 302 **não traz `Access-Control-Allow-Origin`**.
3. A resposta final (`epg.php`) responde 200, `application/xml`, com `Access-Control-Allow-Origin: *`.
4. Reproduzido num Chromium real (Playwright), a partir de uma página `http://example.com` com `fetch()` (modo `cors`, como o app faz):
   - endereço original (`/epg/<u>/<p>`) → `TypeError` (falha de rede/CORS);
   - endereço final (`/epg.php?username=…&password=…`) → 200 OK, `application/xml`.

## Suspected Code Paths

- `tv-web/src/lib/epg/epgSync.ts:71-74` — qualquer exceção do `fetch` vira `EpgFailure('network')`, sem distinguir causa.
- `tv-web/src/lib/epg/epgStatus.ts:136-139` — a mensagem de `network` ("Verifique a conexão ou o endereço") não orienta o caso de CORS/redirecionamento.
- `tv-web/src/features/settings/EpgSettingsScreen.tsx` — onde o endereço é digitado e a falha exibida.

## Root Cause Hypothesis

O endereço digitado redireciona (302) para outro caminho, e a resposta de redirecionamento do servidor
não envia cabeçalhos CORS. Num `fetch` cross-origin, o navegador exige CORS também nos redirecionamentos;
sem `Access-Control-Allow-Origin` no 302 a requisição é abortada com `TypeError`, que o app classifica como
`network`. A navegação direta no navegador não aplica CORS, por isso "funciona" lá. Confiança: **alta**
(reproduzida; o endereço final funciona com o mesmo `fetch`). O app **não consegue contornar** isso no
cliente: `redirect: 'manual'` devolve resposta opaca, sem `Location` legível. O `[NEEDS CLARIFICATION]`
restante é se a TV (origem `file://`) se comporta igual; é esperado que sim, pelo mesmo mecanismo de CORS.

## Proposed Remediation

**Preferida (sem código)**: usar como endereço manual o destino final, `http://cbsrv.top/epg.php?username=<u>&password=<p>`,
que o servidor serve com CORS aberto. Validar na tela e na TV.

**Melhoria opcional no app** (pequena, só se o usuário quiser): distinguir "o endereço falhou por CORS/redirecionamento"
de "sem conexão", usando um segundo `fetch` de diagnóstico não é viável sem expor a URL; a alternativa honesta é
só **ajustar o texto de `network`** para sugerir "confira se o endereço é o final (sem redirecionamento)" e registrar
isso em documentação. Não adivinhar a URL final automaticamente — seria reescrever o endereço do usuário.

**Alternativas** (descartadas):
- Seguir o redirecionamento no cliente: impossível sob CORS (resposta opaca).
- Proxy/backend: contraria ADR-008 (backend só como fallback congelado); só valeria com decisão registrada.

**Files likely to change** (se aplicar a melhoria de texto):
- `tv-web/src/lib/epg/epgStatus.ts` (mensagem de `network`)
- `tv-web/src/lib/epg/epgStatus.test.ts`

**Tests to add or update**:
- Ajustar a asserção da mensagem de `network`, se o texto mudar.

**Verificação da alternativa 3 (2026-10-02, lista do `.env`, sem expor valores)**: o `xmltv.php` do próprio
painel (o que o app já deriva sozinho, origem `panel`) responde 200 com `Access-Control-Allow-Origin: *`,
sem redirecionamento, e devolve o mesmo arquivo (mesmos bytes, 35 773 programas, 1 013 canais) que o endereço
`epg.php` final. O host é o mesmo do painel. Logo, **o campo manual é desnecessário para este provedor**:
deixá-lo vazio já sincroniza. Resta apurar por que o usuário precisou preencher o manual (EPG automático
não sincronizou? lista M3U sem forma de painel?).

## Risks & Considerations

- A URL contém credencial; nada disso pode ir para log, teste ou doc (ADR-010). Este assessment não a reproduz.
- Mudar o texto de `network` afeta outras telas que o exibem (Importação, Configurações); conferir testes que o citam literalmente.
- O ajuste do endereço pelo usuário não depende de nenhuma alteração de código.

## Open Questions

- [NEEDS CLARIFICATION: confirmar na TV física que o endereço final (`epg.php`) sincroniza — a reprodução foi em Chromium desktop.]
- [NEEDS CLARIFICATION: o usuário quer a melhoria de texto da mensagem, ou basta usar o endereço final?]
