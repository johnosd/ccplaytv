# Pesquisa — Upload no teste de conexão

**Data:** 2026-10-07. Decisões locais da feature 064; a 062 (`research.md` R-001) escolheu o destino do download e deixou o upload de fora.

## R-001 — Destino do upload

**Decisão:** o mesmo serviço do download, `https://speed.cloudflare.com/__up`, com `POST` e corpo gerado pelo app, **sem query, sem headers e sem credenciais**.

**Justificativa (verificada em 2026-10-07, do PC, com `Origin: null`, que é a origem do app empacotado em `file://`):**

- `POST` de 100 KB sem `Content-Type`, e com `text/plain`: HTTP 200, corpo vazio.
- Respostas com `Access-Control-Allow-Origin: *`, `Timing-Allow-Origin: *` e `Access-Control-Expose-Headers: server-timing, cf-meta-colo, cf-meta-request-time, cf-meta-upload-bytes`.
- `OPTIONS` (preflight): 204, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: authorization, content-type`. O app não precisa de preflight: não manda headers.

Isso prova o protocolo no PC. **Não prova o navegador da TV**, a disponibilidade futura nem corpos de 20 MB (só 100 KB foram enviados). Fica como recomendação de TV física (spec, Clarifications), e o plano deixa o upload falhar sem derrubar o resto (resultado parcial).

**Alternativas consideradas:** outro serviço de speed test, rejeitado (a spec manda voltar ao usuário antes de trocar de serviço, e não foi necessário); SDK da Cloudflare, rejeitado pelos mesmos motivos da 062 (inicia sozinho, reporta resultados, difícil impor teto); backend próprio, rejeitado por ADR-008.

## R-002 — Compor o motor da 062, não reescrevê-lo

**Decisão:** `runConnectionTest` (novo, em `lib/network/connectionTest.ts`) chama `runSpeedTest` e depois mede o upload. `runSpeedTest` só ganha a opção `limits`, com o padrão atual (30 s / 100 MB).

**Justificativa:** os contratos travados da 062 fixam o motor: C1 espera exatamente 12 GETs, `complete` com três métricas e `requestedBytes: 26_000_009`; C2 fixa 100 MB. Mudar `runSpeedTest` para incluir o upload exigiria editar contrato de outra feature. Compondo, as travas da 062 continuam valendo sem emenda, e a regra nova ("completo exige quatro métricas") vive só na camada nova. Isso foi **provado** com um protótipo descartável: os 5 contratos novos e os 128 testes da área passaram juntos.

**Alternativas consideradas:** estender `runSpeedTest` (exige emenda de contrato da 062 e do `valid()`), rejeitado; um motor de upload independente chamado pelo hook (a UI orquestraria duas execuções), rejeitado por duplicar a exclusão mútua e o cancelamento.

## R-003 — Como medir o envio

**Decisão:** cronometrar do instante anterior ao `fetch` até a resposta completa, com o relógio monotônico. Sem ler progresso do envio (o `fetch` não o expõe). Tamanhos 1 MB, 5 MB, 20 MB e depois blocos de até 20 MB, até o orçamento da etapa. Mesma fórmula e mesmos mínimos do download (1 MB e 200 ms agregados; para de vez com 3 amostras e 3 000 ms).

**Justificativa:** reaproveitar o critério já validado na 062 mantém as duas velocidades comparáveis. A medição inclui um RTT por requisição e subestima um pouco em link muito rápido com blocos pequenos; o download tem o mesmo viés. Registrado como R-002 do plano.

**Alternativas consideradas:** usar o `Server-Timing` / `cf-meta-request-time` da resposta para descontar o tempo de servidor, rejeitado por complexidade e por depender de cabeçalhos expostos que a TV pode não entregar; `ReadableStream` como corpo para ter progresso, rejeitado porque o upload por stream não existe no Chromium 108.

## R-004 — O que se envia

**Decisão:** um `Uint8Array` de 20 MB alocado uma vez por teste, preenchido pelo app com bytes sem significado (um bloco de 64 KB de `crypto.getRandomValues` repetido; sem `crypto`, um padrão fixo). Cada requisição envia uma visão (`subarray`) dele, sem copiar.

**Justificativa:** FR-003: nada da pessoa, da fonte ou do catálogo pode entrar. Bytes aleatórios evitam que um intermediário comprima o envio e inflem a taxa. Uma alocação só limita a memória a 20 MB.

## R-005 — Persistência

**Decisão:** campos opcionais aditivos no registro `networkDiagnostics` (`uploadMbps`, `uploadSamples`, `uploadRequestedBytes`, `uploadSentBytes`), `version` continua 1, **sem mudar o esquema do Dexie (continua v17)**.

**Justificativa:** o campo não é indexado, então o IndexedDB aceita sem migração, e o resultado antigo continua legível sem ser reescrito (FR-012). Ver `data-model.md`.

**Alternativas consideradas:** `version: 2` com migração, rejeitado (o contrato C4 da 062 só aceita `version: 1` e a migração apagaria a distinção entre "não medido" e "sem amostra"); tabela nova, rejeitada (um único registro por aparelho, FR-011).
