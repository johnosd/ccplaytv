# Lógica: conector do diretório Radio Browser

Escopo: `tv-web/src/lib/radio/radioDirectory.ts` (e arquivos auxiliares em `lib/radio/` se passar de 300 linhas).
Origem: ADR-018 §2/§3, spec FR-008, FR-019, FR-023, FR-025..FR-028. Contrato travado:
`lib/radio/radioDirectory.radio-global.contract.test.ts`.

## 1. Fronteira

- `lib/radio/*` NÃO importa `lib/catalog`, `lib/portal`, `features/` nem `components/` (ADR-018 §2; catraca de
  arquitetura para os dois últimos). Pode importar `lib/metadata/requestDeadline.ts` (tempo limite) e `lib/i18n`.
- Nenhum `console.*` no módulo. Erro sempre como `RadioDirectoryError(kind)`, com mensagem fixa `radio:<kind>`, nunca a
  do `fetch` (que pode trazer a URL). `AbortError` é relançado como veio, sem virar categoria.
- `fetchImpl` e `random` injetáveis (`RadioDirectoryOptions`), com os globais como padrão.

## 2. Descoberta de espelho

```text
resolveMirror():
  se há espelho em memória → ele
  GET https://all.api.radio-browser.info/json/servers   (tempo limite 5 s)
    → array de { name }; tira vazios e repetidos; embaralha (Fisher-Yates com `random`)
  para os 4 primeiros: GET https://<name>/json/stats (3 s); resposta JSON objeto → escolhido
  nenhum respondeu (ou /servers falhou) → https://de1.api.radio-browser.info
  guarda em memória (módulo) e devolve
```

- Requisição pelo espelho que falha com `offline` (rede, timeout, 5xx) → esquece o espelho, redescobre **uma** vez e
  repete a requisição; falhou de novo → lança. `bad_response`, `refused` e `rate_limited` não redescobrem.
- O espelho é dica de sessão, nunca endereço fixo (ADR-018 §3). Não persistir no MVP.

## 3. Requisições (exatamente estas)

| Método | Caminho | Parâmetros |
| --- | --- | --- |
| GET | `/json/countries` | nenhum |
| GET | `/json/stations/search` | `countrycode=<XX>` (só país; omitido no mundo), `hidebroken=true`, `order=clickcount`, `reverse=true`, `limit=100` |
| GET | `/json/stations/byuuid` | `uuids=<uuid1,uuid2,…>` |
| POST | `/json/url/<uuid>` | nenhum; corpo vazio |

- Nada mais vai na URL ou no corpo (FR-026). O contrato confere o conjunto exato da busca.
- Cabeçalho `User-Agent: CCPlayTv` é tentado; o navegador pode descartar (R-002), e isso não é erro.
- Tempo limite de 10 s por requisição de dados (`requestDeadline`).
- `reportClick(uuid)`: dispara o POST sem `await`, com `catch` vazio. Nunca lança, nunca afeta a UI (FR-019).

## 4. Resposta e categorias de falha

```text
fetch lançou (rede) ou deadline → offline
status 401/403 → refused · 429 → rate_limited · outro !ok → offline
content-type contém html/xml, ou corpo não faz JSON.parse, ou não é array → bad_response
```

Ler o corpo como texto e fazer `JSON.parse` aqui (não `response.json()` cego): uma página de captcha com status 200 é
`bad_response`, nunca "lista vazia" (FR-025).

## 5. Normalização

País (`/json/countries`): `iso_3166_1` (ou `countrycode`) com 2 letras A–Z depois de `toUpperCase()`, `stationcount`
inteiro > 0; o resto é descartado. `directoryName` = `name` com `trim()`.

Estação, válida só com:

- `stationuuid` string não vazia;
- `url_resolved` http(s) sem usuário/senha, sem caractere de controle, até 4096 caracteres (mesma regra de
  `safeExternalUrl` do Open-Media-Explorer, reescrita aqui);
- `name` não vazio depois de `trim()` (cortado em 120 caracteres).

Campos: `id = radioStationId(uuid)`; `artUrl` = `favicon` pela mesma regra de URL, senão ausente; `countryCode` =
`countrycode` em maiúsculas se tiver 2 letras, senão `''`; `tags` = `tags.split(',')`, `trim`, sem vazios, no máximo 5;
`codec` texto até 16; `bitrate` inteiro > 0 ou ausente; `hls` = `hls === 1 || hls === true || hls === '1'`;
`popularity` = `clickcount` numérico ou 0.

Depois de normalizar: descarta inválidas, **remove `uuid` repetido mantendo o primeiro**, corta em `STATION_LIMIT`. A
ordem do diretório (popularidade) é preservada.
