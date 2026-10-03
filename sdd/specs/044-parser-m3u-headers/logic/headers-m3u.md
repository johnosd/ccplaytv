# Lógica: headers, `radio` e `tvg-chno` no parser M3U (feature 044)

Quem executa **não** decide estas regras: elas estão aqui para não serem reinventadas. Módulo puro `tv-web/src/lib/catalog/m3uHeaders.ts` (stubs já criados), sem rede, sem armazenamento, sem log.

## 1. Sufixo `|` na linha da URL — `splitUrlHeaders(line)`

```ts
const KNOWN = ['user-agent','referer','referrer','origin','cookie','accept','accept-language','authorization','host']

function splitUrlHeaders(line: string): { url: string; headers?: PlaybackHeaders } {
  const bar = line.indexOf('|')
  if (bar === -1) return { url: line }            // caminho rápido: 99% das linhas
  const url = line.slice(0, bar)
  const suffix = line.slice(bar + 1)
  if (suffix !== '' && !startsWithKnownPair(suffix)) return { url: line }   // FR-006: `a|b.ts` fica
  // pares: separa em `&` ou `|` SOMENTE quando o que vem depois é `<nome conhecido>=`
  // (um `&y=2` dentro do Referer não é fronteira, porque `y` não é header conhecido)
  ...
}
```

- `startsWithKnownPair(s)`: `/^([A-Za-z-]+)=/` com o nome (minúsculo) em `KNOWN`.
- Fronteira de par: um `&` ou `|` seguido de `/(?:user-agent|referer|referrer|origin|cookie|accept-language|accept|authorization|host)=/i`. Qualquer outro `&`/`|` pertence ao valor anterior.
- Valor: `trim()`; se contém `%`, `decodeURIComponent` dentro de `try` (falhou → valor cru); **nunca** converte `+` em espaço.
- Só `user-agent` → `userAgent` e `referer`/`referrer` → `referer` são guardados. Os demais pares somem sem erro.
- Valor vazio, ou com mais de **512** caracteres → o header não é guardado (não é erro).
- Header repetido: vale o último.
- `headers` só existe no retorno se ao menos um dos dois foi guardado (senão `undefined`, nunca `{}`).
- `URL|` e `URL|Cookie=x` devolvem a URL **limpa** e sem headers.

## 2. Diretivas — `readDirectiveHeaders(line)`

Para uma linha que começa com `#EXTVLCOPT:` ou `#KODIPROP:` devolve `{ headers?, supported }`; para qualquer outra, `null`.

- `#EXTVLCOPT:http-user-agent=<v>` → `userAgent`; `#EXTVLCOPT:http-referrer=<v>` (e `http-referer`) → `referer`.
- `#KODIPROP:` com chave `inputstream.adaptive.stream_headers=User-Agent=...&Referer=...` → mesma leitura do §1 sobre o valor. Qualquer outra chave (licença DRM etc.): `supported: false`, valor **descartado**.
- Mesmos limites do §1 (vazio, 512, `%`).

## 3. Quando uma diretiva vale — dentro de `parseM3uLines`

- Acumulador `directiveHeaders` independente de `pending`.
- Uma diretiva lida **antes ou depois** do `#EXTINF`, mas antes da URL, vale para a próxima URL emitida.
- Chega um `#EXTINF` e `pending !== null` (entrada anterior sem URL, que já conta `invalidCount`): **zera** `directiveHeaders` (a diretiva era daquela entrada inválida). Chega um `#EXTINF` com `pending === null`: **mantém** (ordem Kodi, diretiva antes do `#EXTINF`).
- Ao emitir a entrada: `headers = { ...directiveHeaders, ...pipeHeaders }` (o `|` prevalece **por chave**); zera `directiveHeaders`.
- Diretiva órfã no fim do arquivo: descartada, nunca é "entrada inválida" (`invalidCount` não muda).
- `ParseTally.unsupportedDirectives` conta as diretivas `supported: false` (só contagem, nunca o conteúdo; nenhuma tela o lê).
- Uma linha de diretiva **nunca** passa por `isHlsTagLine` como entrada nova e continua sendo "outra diretiva" (`#`) para o resto do parser.

## 4. `radio` e `tvg-chno` — em `classifyEntry` (`classifier.ts`)

- `radio`: `entry.attributes['radio']` em minúsculas e `trim()` igual a `'true'` → `true`; qualquer outra coisa → ausente.
- `declaredChannelNumber`: `entry.attributes['tvg-chno']`, `trim()`, só se `/^[1-9]\d{0,5}$/` → `Number(...)`; senão ausente.
- `playbackHeaders`: `entry.headers` (já sem os headers vazios).
- `ClassifiedEntry` ganha os três campos opcionais. São calculados nos três ramos de retorno (episódio, por grupo, não classificado) para que o `refineFromUrl` do Modo limitado não os perca.
- Quem **grava** (`toStoredRecord`, em `importPipeline.ts`): `radio` e `declaredChannelNumber` só quando `kind === 'channel'` (mesmo padrão do `epgChannelId`); `playbackHeaders` em qualquer tipo reproduzível. A série sintética (`m3uSeriesGrouping`) **não** herda headers — só os episódios têm URL.

## 5. Assinatura do bloco — `itemsSignature` (`categoryBlocks.ts`)

A assinatura compara a lista nova com a guardada e decide se o bloco é regravado. Os três campos novos entram **só quando algum existe** (empurrados ao fim do vetor do item); um item sem eles gera exatamente o mesmo vetor de hoje, para que uma lista antiga não ganhe uma regravação de todo o bloco só por esta feature (FR-011). Um header que muda **deve** mudar a assinatura (senão a renovação não regrava).

## 6. O que NÃO fazer

- Nenhum `console.*`, nenhuma mensagem de erro, nenhum campo de `ImportRunRecord` com valor de header.
- Nenhum campo novo em `CatalogItemOut` (`catalogApi.itemOut` é um mapeamento explícito — deixe assim).
- Não mexer em `playbackUrl.ts`, `PlayerLayer`, `avplayAdapter` (é a 25b).
