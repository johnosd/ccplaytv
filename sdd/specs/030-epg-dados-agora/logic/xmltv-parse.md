# Lógica — leitura incremental de XMLTV

Arquivo: `tv-web/src/lib/epg/xmltvParser.ts` (stub criado pelo plan).
Contrato: `xmltvParser.epg-dados-agora.contract.test.ts`.

## Por que não `DOMParser` nem biblioteca

Roda dentro de Web Worker (R5 do research) — `DOMParser` não existe lá. O
XMLTV útil tem três elementos (`programme`, `title`, `desc`); um varredor de
texto resolve com memória limitada a um elemento por vez.

## Algoritmo

```text
buffer = ''
for await chunk of chunks:
  buffer += chunk
  loop:
    i = buffer.indexOf('<programme')
    if i < 0:
      # mantém só o final que pode ser o começo de '<programme' partido
      buffer = buffer.slice(-('<programme'.length - 1)); break
    j = buffer.indexOf('</programme>', i)
    if j < 0:
      buffer = buffer.slice(i); break          # elemento incompleto: espera o próximo pedaço
    element = buffer.slice(i, j + '</programme>'.length)
    buffer = buffer.slice(j + '</programme>'.length)
    program = parseProgramme(element)
    if program and overlaps(program, window): yield program
```

Um `<programme .../>` auto-fechado não tem título → descartado (tratar como
"sem `</programme>`" é aceitável só se não travar: o próximo `<programme`
reinicia a busca; implementar procurando o fechamento **antes** do próximo
`<programme` para não engolir o seguinte).

`parseProgramme(element)`:

- atributos da tag de abertura por regex `([\w-]+)="([^"]*)"` (mesma do
  `m3uParser`): `start`, `stop`, `channel`.
- `channelKey = decode(channel).trim()`; vazio → descarta (R2: existe
  `<channel id="">` no provedor real).
- `start = parseXmltvTime(start)`, `end = parseXmltvTime(stop)`; qualquer um
  `undefined`, ou `end <= start` → descarta.
- `title`: primeiro `<title[^>]*>([\s\S]*?)</title>`; `decode` + `trim`;
  vazio → descarta (FR-030).
- `description`: primeiro `<desc…>`, `decode` + `trim`, vazio → ausente,
  truncado em 600 caracteres **na gravação** (repositório), não aqui.
- `CDATA` (`<![CDATA[…]]>`) dentro de title/desc: usar o conteúdo cru.

`decode`: `&amp; &lt; &gt; &quot; &apos;` e numéricas `&#NNN;`/`&#xHH;`.
`&amp;` **por último**, para não decodificar duas vezes (`&amp;lt;` → `&lt;`).

## `parseXmltvTime(raw)`

`/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/`

- sem segundos → 0; sem fuso → UTC (edge case da spec);
- `Date.UTC(...) − sinal·(hh·60+mm)·60_000`;
- não casa → `undefined`.

## Janela

`overlaps = end > window.from && start < window.to`. O parser não conhece
deslocamento — quem monta a janela (`syncEpg`) já a alarga por `|offset|`
(data-model §4).
