# Feature Specification: Contrato de compatibilidade do parser M3U (headers, radio, tvg-chno)

**Slug**: `044-parser-m3u-headers`

**Created**: 2026-10-02

**Status**: Convergida

**Input**: Item 25a do backlog — "Contrato de compatibilidade do parser M3U", fatia do parser. Separar URL e headers no primeiro `|`, preservar `#KODIPROP`/`#EXTVLCOPT`, reconhecer `radio`, guardar `tvg-chno`. O repasse dos headers ao AVPlay é a fatia 25b (depende do spike do item 58).

## Escopo

### Incluído

- Separar, na linha da URL de uma entrada M3U, a URL real do sufixo de headers após o **primeiro** `|` (`User-Agent`, `Referer`).
- Ler `#EXTVLCOPT:http-user-agent=…` e `#EXTVLCOPT:http-referrer=…` e `#KODIPROP:` (linhas de diretiva que precedem a URL e valem só para a entrada seguinte).
- Guardar, por item, apenas **User-Agent** e **Referer** quando existirem; o valor do `|` prevalece sobre o de `#EXTVLCOPT`/`#KODIPROP` quando os dois existem.
- Contar e ignorar sem erro as demais chaves de `#KODIPROP`/`#EXTVLCOPT` (ex.: licença DRM), registrando que existiram, sem guardar o valor.
- Reconhecer o atributo `radio="true"` e guardar um indicador `radio` no item, sem mudar a classificação, a UI ou o filtro.
- Guardar o `tvg-chno` do item (número declarado pela lista), sem exibi-lo.
- A URL de reprodução guardada passa a ser a **URL limpa**, sem o sufixo `|…`.
- Persistência pelo caminho M3U que usa o parser (`stored`, 014; o painel Xtream detectado pela URL não passa pelo parser de itens), como campos de valor sem índice — sem subir a versão do Dexie.
- Amostras reais (anonimizadas) de listas nos testes do parser.
- Emenda inline à ADR-010: headers `User-Agent`/`Referer` de um item podem viver no IndexedDB, sob as mesmas proibições da URL de reprodução.

### Fora de Escopo

- Repasse dos headers ao AVPlay (`setStreamingProperty` ou equivalente) — é a **25b**, depois do spike do item 58. Até lá, o player abre a URL limpa sem headers.
- Exibir `tvg-chno` (exige emendar a ADR-011, que define o número do canal como a posição na fonte).
- Filtro, seção ou tipo "Rádio"; excluir rádios do catálogo.
- Guardar chaves de DRM/licença ou qualquer outro header além de `User-Agent` e `Referer`.
- Mudar o parser Xtream JSON, o EPG ou a classificação por tipo.
- Qualquer mudança em `PlayerLayer`/`avplayAdapter`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - URL e headers separados no `|` (Priority: P1)

A lista traz `http://srv/live/1.ts|User-Agent=Foo&Referer=http://bar/`. O app guarda a URL `http://srv/live/1.ts` e os headers `User-Agent: Foo` e `Referer: http://bar/` à parte, em vez de uma URL com sufixo que nenhum player entende.

**Why this priority**: é o maior ganho de compatibilidade restante e destrava a 25b; sozinho já corrige o dado guardado.

**Independent Test**: importar uma lista M3U com entradas `|…` e inspecionar o registro: URL limpa e headers separados, sem o sufixo.

**Acceptance Scenarios**:

1. **Given** uma entrada `URL|User-Agent=Foo&Referer=Bar`, **When** importada, **Then** o item guarda `URL`, `User-Agent=Foo` e `Referer=Bar`.
2. **Given** uma entrada sem `|`, **When** importada, **Then** o item não tem headers e a URL é idêntica à de hoje.
3. **Given** uma URL cuja query contém `|` codificado ou um `|` dentro do sufixo, **When** importada, **Then** só o primeiro `|` separa, e o restante do sufixo é lido como headers.
4. **Given** um sufixo com chave desconhecida (`Cookie=…`), **When** importada, **Then** a chave é ignorada sem erro e não é guardada.

---

### User Story 2 - `#EXTVLCOPT` e `#KODIPROP` (Priority: P2)

Listas que declaram o header em linhas de diretiva (`#EXTVLCOPT:http-user-agent=…`, `#EXTVLCOPT:http-referrer=…`, `#KODIPROP:…`) entre o `#EXTINF` e a URL têm esses valores guardados na entrada seguinte, e só nela.

**Why this priority**: segunda forma mais comum de declarar headers; independente da US1.

**Independent Test**: importar uma lista com duas entradas, só a primeira com `#EXTVLCOPT`; só ela guarda o header.

**Acceptance Scenarios**:

1. **Given** `#EXTVLCOPT:http-user-agent=Foo` antes da URL, **When** importada, **Then** o item guarda `User-Agent: Foo`.
2. **Given** a mesma entrada com `|User-Agent=Bar`, **When** importada, **Then** vale `Bar` (o `|` prevalece).
3. **Given** uma diretiva sem entrada depois (fim do arquivo), **When** importada, **Then** é descartada sem erro e não vaza para outra entrada.
4. **Given** `#KODIPROP:inputstream.adaptive.license_key=…`, **When** importada, **Then** nada é guardado e a entrada é importada normalmente.

---

### User Story 3 - `radio` e `tvg-chno` (Priority: P3)

O item guarda o indicador `radio` e o `tvg-chno` declarados pela lista, sem nenhuma mudança visível.

**Why this priority**: dado preparatório, sem efeito de tela; não bloqueia as outras duas.

**Independent Test**: importar entradas com `radio="true"` e `tvg-chno="12"`; os registros guardam os dois e nenhuma tela muda.

**Acceptance Scenarios**:

1. **Given** `radio="true"`, **When** importada, **Then** o item guarda `radio` verdadeiro e continua na mesma categoria/tipo de hoje.
2. **Given** `tvg-chno="12"`, **When** importada, **Then** o item guarda `12`; um valor não numérico ou vazio não guarda nada.

---

### Edge Cases

- Sufixo `|` vazio (`URL|`): a URL é limpa e nenhum header é guardado.
- Valores com `=` ou espaços, codificados (`%20`) ou não: o valor é lido até o próximo `&` e decodificado quando codificado; nunca interpretado como cabeçalho adicional.
- Header repetido: vale o último.
- Diretiva repetida antes da mesma URL: vale a última por chave.
- URL com `|` no caminho de uma lista que não usa o padrão de headers: tratada como sufixo apenas se o trecho depois do primeiro `|` é vazio ou tem forma `nome=valor` com nome de header conhecido (FR-006); caso contrário a URL fica inalterada.
- Lista grande (centenas de milhares): leitura em fluxo e memória por entrada continuam como hoje.
- Reimportação: os headers acompanham o item na renovação da categoria (mesma identidade), sem duplicar nem vazar para outro item.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE separar a URL de um sufixo de headers no primeiro `|` da linha da URL, e guardar como URL de reprodução apenas a parte anterior.
- **FR-002**: O sistema DEVE guardar, por item, no máximo `User-Agent` e `Referer`, lidos do sufixo `|`, de `#EXTVLCOPT` (`http-user-agent`, `http-referrer`) ou de `#KODIPROP` equivalente.
- **FR-003**: Quando o mesmo header vier do `|` e de uma diretiva, o sistema DEVE usar o valor do `|`.
- **FR-004**: Uma diretiva `#EXTVLCOPT`/`#KODIPROP` DEVE valer apenas para a entrada imediatamente seguinte e nunca para outra.
- **FR-005**: O sistema DEVE ignorar sem erro qualquer outra chave de `#KODIPROP`/`#EXTVLCOPT`, sem guardar seu valor.
- **FR-006**: Um `|` só DEVE ser tratado como separador de headers quando o que o segue é vazio ou começa com um par `nome=valor` cujo nome é de header HTTP conhecido (insensível a maiúsculas; `User-Agent`, `Referer`/`Referrer`, `Origin`, `Cookie`, `Accept`, `Accept-Language`, `Authorization`, `Host`); caso contrário a URL permanece inalterada. *(Refinado no `sdd-plan`, R-001: a redação original — "ao menos um par User-Agent/Referer" — deixaria `URL|Cookie=x` com sufixo, que o player não abre.)*
- **FR-007**: O sistema DEVE guardar o indicador `radio` quando o atributo for `true` e nada nos demais casos, sem alterar tipo, categoria nem contagens.
- **FR-008**: O sistema DEVE guardar o `tvg-chno` apenas quando for um inteiro positivo, sem exibi-lo em nenhuma tela.
- **FR-009**: Os novos campos DEVEM ser persistidos pelo caminho que lê itens com o parser M3U (`fetchMode: 'stored'`, feature 014) e sobreviver à leitura da categoria, à renovação e à conversão em blocos, sem subir a versão do Dexie. *(Corrigido no `sdd-plan`, R-002: uma URL M3U reconhecida como painel Xtream segue o caminho de provedor da 010 e nunca passa pelo parser de itens — não há header a guardar ali.)*
- **FR-010**: Valores de header NUNCA DEVEM aparecer em log, mensagem de erro, UI, `aria-*`, chave de consulta, exportação ou requisição a terceiros; só podem ser guardados no IndexedDB.
- **FR-011**: Itens sem headers, sem `radio` e sem `tvg-chno` DEVEM permanecer byte a byte iguais aos de hoje (mesma URL, mesmos campos).
- **FR-012**: A ADR-010 DEVE ser emendada inline, cobrindo o armazenamento dos headers.
- **FR-013**: Os testes DEVEM incluir amostras reais, anonimizadas, de listas com `|`, `#EXTVLCOPT` e `#KODIPROP`.

### Key Entities *(include if feature involves data)*

- **Entrada M3U analisada** (`ParsedEntry`): nome, URL limpa, grupo, atributos, e agora os headers da entrada (`User-Agent`, `Referer`) e a contagem de diretivas não suportadas.
- **Item do catálogo**: ganha `playbackHeaders` (User-Agent/Referer opcionais), `radio` e `channelNumber` declarado — todos opcionais, sem índice.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das entradas das amostras reais com `|` e/ou diretivas são guardadas com URL limpa e os headers esperados.
- **SC-002**: 0 diferença nos registros de uma lista sem headers/`radio`/`tvg-chno` em relação ao comportamento anterior.
- **SC-003**: Nenhum valor de header aparece em log, UI ou mensagem de erro em varredura automatizada.
- **SC-004**: A importação de uma lista de 100 mil entradas não fica mais de 5% mais lenta nem usa mais memória de pico que antes.

## Assumptions

- O formato `URL|User-Agent=…&Referer=…` é o do Kodi/TiviMate; `#EXTVLCOPT` segue o padrão do VLC.
- Até a 25b, o player abre a URL limpa sem headers; isso nunca é pior do que abrir a URL com sufixo.
- O spike de header no AVPlay (item 58) define o que a 25b consegue repassar; esta fatia não depende dele.
- `radio` é só um indicador; a decisão de produto sobre rádio fica para outra feature.

## Clarifications

### Sessão 2026-10-02

- Q: O que fazer com `radio` nesta fatia? → A: Só marcar, sem mudar classificação, UI nem filtro.
- Q: Qual a URL de reprodução até a 25b quando há `|`? → A: URL limpa, sem sufixo; headers guardados à parte.
- Q: Quais headers guardar? → A: Só `User-Agent` e `Referer`; o `|` prevalece sobre diretivas; demais chaves ignoradas sem erro.
