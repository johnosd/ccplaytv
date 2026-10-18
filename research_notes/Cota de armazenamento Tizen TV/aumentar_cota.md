# Alavancas para aumentar a cota de armazenamento web de um app Tizen (.wgt) em TV Samsung

Contexto medido no projeto: na TV de referência (Tizen 9 / Chromium 120, origem `file://`) a tela Sobre mostrou
"82,1 MB de 80 MB" com 1,27 GB livres no aparelho, **com `http://tizen.org/privilege/unlimitedstorage` já declarado**
em `CCPlayTv/config.xml` (linha 15) — ver `sdd/assessments/cota-armazenamento-app-na-tv-estourando/explora.md`.
Legenda: **[FATO]** documentado em fonte primária; **[RELATO]** fórum/terceiro; **[INFERÊNCIA]** raciocínio meu.

## 1. `navigator.storage.persist()` / `persisted()` muda a cota?

### Takeaway
No Chromium upstream, não: `persist()` só protege contra despejo (eviction), a cota por origem é a mesma em modo
persistente e best-effort. A Samsung não lista o Storage API (StorageManager) em nenhuma tabela do motor web da TV.
Não há evidência de que `persist()` exista ou faça algo de diferente no Tizen.

### Cited Findings
- [FATO] "In browsers based on the Chromium open-source project, including Chrome and Edge, an origin can store up to
  60% of the total disk size in both persistent and best-effort modes." — [MDN, Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [FATO] O despejo "only applies to origins that are not persistent and skips over origins that have been granted data
  persistence by using `navigator.storage.persist()`". Chromium aprova ou nega `persist()` sozinho, sem prompt, com
  base no histórico de interação. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [FATO] Só no Firefox `persist()` muda a cota: até 50% do disco, contra min(10% do disco, 10 GiB) em best-effort. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [FATO] A cota por origem no código atual do Chromium é `per_storage_key_quota = pool_size * kPerStorageKeyTemporaryRatio`
  (`kDefaultPerStorageKeyRatio = 0.75`). O pool vem de flags (`kPoolSizeRatio`, `kPoolSizeBytes`), e "If both the
  ratio and the absolute size are set, the lower value will be honored". O código não depende de `persist()`. — [quota_settings.cc (main)](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/storage/browser/quota/quota_settings.cc)
- [FATO] web.dev: "An origin can use up to 60% of the total disk space". O texto não diz que a persistência muda a cota,
  só que "Persistent storage is not automatically cleared when storage is low". — [web.dev, Storage for the web](https://web.dev/articles/storage-for-the-web)
- [FATO] A tabela "Offline Storage" (Table 9) do Web Engine Specifications da Samsung não tem linha para Storage API,
  StorageManager ou `persist`. As únicas linhas são CacheStorage, IndexedDB, Service Worker, SharedWorker, Quota
  Management API, Web SQL e Web Storage. — [Samsung Web Engine Specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html)
- [FATO] O guia de otimização de flash da Samsung manda ler o uso com `navigator.storage.estimate()` e diz "Check
  support on your target web engine". — [Web App Flash Storage Optimization Guide](https://developer.samsung.com/smarttv/develop/guides/web-app-flash-storage-optimization-guide.html)

### Inferences
- [INFERÊNCIA] O "80 MB" medido no projeto não é 60% do disco (1,27 GB livres já dariam muito mais) nem 75% de 80% do
  disco. O mais provável é que o embedder da Samsung (chromium-efl) fixe o pool em bytes (`kPoolSizeBytes`) ou devolva
  o próprio `QuotaSettings`. Se for isso, `persist()` não mexe no número, porque a cota é calculada sem levar a
  persistência em conta.
- [INFERÊNCIA] Vale um teste barato na TV: logar `typeof navigator.storage.persist`, o retorno de `persist()` e de
  `persisted()`, e chamar `estimate()` antes e depois. A expectativa é que a cota continue em ~80 MB.

### Gaps
- Nenhuma fonte Samsung ou Tizen diz se `navigator.storage.persist()` existe ou o que ele faz na TV.
- Não achei o código do chromium-efl que define a cota. O gitweb `review.tizen.org` devolveu 403 para busca, e não há
  espelho público pesquisável.

## 2. API legada de Quota Management (`webkitStorageInfo`, `webkitPersistentStorage/TemporaryStorage.requestQuota`)

### Takeaway
Upstream, `window.webkitStorageInfo` teve remoção proposta para M106. A cota "persistente" por `requestQuota` deixou de
existir: `webkitPersistentStorage` passou a se comportar igual a `webkitTemporaryStorage`, ou seja, `requestQuota` não
dá mais espaço. **Correção importante:** a tabela da Samsung **não** diz "Quota Management API: No" para as TVs
2017–2026. Lido o HTML com rowspan, a linha diz **Yes** de Tizen 3.0 a 10.0 e **No** só em Tizen 2.4/2.3. Na prática
isso não ajuda, porque no Chromium ≥ ~M94 a API existe mas não aumenta a cota.

### Cited Findings
- [FATO] HTML bruto da Table 9 (baixado em 2026-10-17). A linha `CacheStorage` tem
  `<td rowspan="7">Yes</td>` nas colunas Tizen 9.0 até Tizen 3.0 (nove células), e essas células cobrem as 7 linhas da
  tabela. A linha "Quota Management API" tem só três células próprias, `Yes` / `No` / `No`, que caem nas colunas que
  sobram: Tizen 10.0 (2026), Tizen 2.4 (2016) e Tizen 2.3 (2015). O mesmo padrão vale para Service Worker
  (`Yes`/`No`/`No`) e IndexedDB (`Yes`/`Yes`/`Yes`). — [Samsung Web Engine Specifications, Table 9](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html)
  - Consequência: Quota Management API = **Yes** de Tizen 3.0 a 10.0 e **No** em 2.4/2.3. Uma extração em texto plano
    (WebFetch/leitor) mostra "Yes, No, No" e parece dizer "No" para Tizen 9/8. Essa é a leitura errada que está em
    `explora.md` linha 40.
  - Pela mesma regra, Service Worker = Yes de Tizen 3.0 em diante, o que contradiz a leitura comum de "No" na TV.
- [FATO] Versões de Chromium por Tizen (Table 1): 10.0 = M130, 9.0 = M120, 8.0 = M108, 7.0 = M94, 6.5 = M85,
  6.0 = M76. — [Samsung Web Engine Specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html)
- [FATO] Intent to Remove (Ayu Ishii, 26/07/2022): "We propose to remove the following prefixed quota API,
  window.webkitStorageInfo in M106". "navigator.webkitXXXStorage.requestQuota() will still exist", com uso de 0,01%.
  Sobre substituto: "window.webkitStorageinfo.requestQuota() will not have a recommended replacement". — [blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/HPuDXPKwW_s/m/KKLW2JYpAAAJ)
- [FATO] O Chrome 106 depreciou o tipo `window.PERSISTENT` em `webkitRequestFileSystem()`. — [Deprecations and removals in Chrome 106](https://developer.chrome.com/blog/deps-rems-106/)
- [FATO] Qt WebEngine (Chromium embutido), `QWebEngineQuotaRequest`, "Deprecated since 6.5": "Requesting host quota is
  no longer supported by Chromium." e "The behavior of navigator.webkitPersistentStorage is identical to
  navigator.webkitTemporaryStorage." — ver https://crbug.com/1233525. — [Qt docs](https://doc-snapshots.qt.io/qtwebengine/qwebenginequotarequest.html)
- [FATO] O guia antigo do Chrome (Apps) diz que "unlimited storage" é parecido com o persistente, mas só para Chrome
  apps/extensões (.crx). — [Managing HTML5 Offline Storage](https://developer.chrome.com/docs/apps/offline_storage)

### Inferences
- [INFERÊNCIA] O Qt 6.5 usa Chromium ~108. Então, no Tizen 8 (M108) e no Tizen 9 (M120), `requestQuota` em
  `webkitPersistentStorage` provavelmente responde, mas não concede nada acima da cota temporária. O "Yes" da Samsung
  quer dizer apenas que a interface existe.
- [INFERÊNCIA] O teste de 2 minutos na TV:
  `navigator.webkitPersistentStorage.requestQuota(500*1024*1024, g => console.log(g), e => console.log(e))`, depois
  `estimate()`. Se a cota subir, o embedder da Samsung tem um caminho próprio, o que contradiria o upstream.

### Gaps
- Não confirmei o milestone exato em que a host quota persistente foi neutralizada (crbug 1233525 não foi aberto).
- Não confirmei se `window.webkitStorageInfo` ainda existe no Chromium 120 do Tizen 9. A remoção upstream foi proposta
  para M106, mas não vi o "shipped".

## 3. `config.xml`, privilégios e APIs Samsung (`webapis.*`) ligadas a armazenamento

### Takeaway
A única alavanca documentada no `config.xml` é o privilégio público `http://tizen.org/privilege/unlimitedstorage`. A
documentação do Tizen para TV diz que ele dá "storage with unlimited size" para IndexedDB, Web SQL e File API. **O
projeto já o declara e a cota medida continua em 80 MB**, e um relato de 2013 diz o mesmo. Não há `tizen:setting`
documentado sobre armazenamento. Não achei privilégio de parceiro nem API `webapis.*` que aumente a cota. A saída
documentada pela Samsung é outra: o Filesystem do Tizen (`tizen.filesystem`, raiz `wgt-private`), fora da API web.

### Cited Findings
- [FATO] Tabela de privilégios web do Tizen: "`http://tizen.org/privilege/unlimitedstorage` | public | The application
  can use the storage with unlimited size with the File API: Directories and System, File API: Writer, Indexed Database,
  and Web SQL Database APIs. Privilege behavior: In the local domain, if this privilege is defined, permission is
  granted. Otherwise, pop-up user prompt is used. In the remote domain, pop-up user prompt is used." — [Samsung/tizen-docs, security-privileges.md](https://github.com/Samsung/tizen-docs/blob/master/docs/application/web/reference/security-privileges.md)
- [FATO] A lista W3C para TV do Tizen 9.0 associa IndexedDB a "Privilege level : Public / Privilege :
  http://tizen.org/privilege/unlimitedstorage". "File API: Directories and System", "File API: Writer" e "Web SQL
  Database" aparecem como "Deprecated Since 3.0", dentro de comentários HTML. — [tizen-docs, api/9.0/w3c_api/w3c_api_tv.html](https://github.com/Samsung/tizen-docs/blob/master/docs/application/web/api/9.0/w3c_api/w3c_api_tv.html)
- [FATO] O guia "Configuring Web Applications" da Samsung TV cita `unlimitedstorage` na tabela de privilégios W3C, sem
  dizer nível nem efeito. O único atributo de `tizen:setting` documentado na página é `pointing-device-support`. — [Configuring Web Applications](https://developer.samsung.com/smarttv/develop/guides/fundamentals/configuring-tv-applications.html)
- [RELATO] Fórum Tizen (2013, SDK 2.2.1): web storage limitado a ~2,49 MB mesmo com o privilégio `unlimitedstorage`.
  Sem resolução confirmada. — [developer.tizen.org forum](https://developer.tizen.org/forums/web-application-development/how-use-unlimited-web-storage-indexeddb-websql-localstorage-on-tizen-web-application) (hoje redireciona para samsungtizenos.com)
- [FATO no projeto] `CCPlayTv/config.xml` declara `unlimitedstorage`, e a medição na TV é de 80 MB de cota. — `CCPlayTv/config.xml`, `sdd/assessments/cota-armazenamento-app-na-tv-estourando/explora.md`
- [FATO] Chromium: "unlimited storage" vem de `SpecialStoragePolicy::IsStorageUnlimited`, e uma origem com ele "is not
  subject to quota or storage pressure eviction". No Chrome, a política é derivada das extensões instaladas. — [special_storage_policy.h](https://chromium.googlesource.com/chromium/src/+/e9b1018/storage/browser/quota/special_storage_policy.h)
- [FATO] O guia "Using Web Storage" da Samsung diz: "The Web storage can only store up to 5 MB of data for your
  application", e manda usar o file system para volumes maiores. — [Using Web Storage](https://developer.samsung.com/smarttv/develop/guides/data-handling/using-web-storage.html)
- [FATO] O guia "Managing File Operations" (TV) pede `http://tizen.org/privilege/filesystem.read` e `.write` e lista as
  raízes `documents`, `wgt-package`, `wgt-private` (apagada na desinstalação) e `wgt-private-tmp`. Não fala em cota. — [Managing File Operations](https://developer.samsung.com/smarttv/develop/guides/data-handling/managing-file-operations.html)
- [FATO] O guia de flash diz que o flash da TV é "limited and shared by the system and many apps" e é só boas práticas
  ("It is not intended to mandate compliance"). Os números que aparece (20 MB, 30 MB) são só exemplos. — [Flash Storage Optimization Guide](https://developer.samsung.com/smarttv/develop/guides/web-app-flash-storage-optimization-guide.html)

### Inferences
- [INFERÊNCIA] O mais provável é que, no Chromium 120 do Tizen 9, o `unlimitedstorage` não chegue até
  `IsStorageUnlimited` para a origem `file://`. Isso acontece se a ligação privilégio → special storage policy não
  existir mais no chromium-efl, ou se a política for chaveada por uma origem que não bate com a storage key do
  `file://`. Também pode ser que ele só pule o prompt da antiga "quota exceeded" do WebDatabase. O fato observado é que
  ele não muda o `estimate().quota`.
- [INFERÊNCIA] Os privilégios de parceiro (`http://developer.samsung.com/privilege/...`) são de rede, produto,
  broadcast etc. Não achei nenhum de armazenamento. A alavanca prática fora do Chromium é `tizen.filesystem` em
  `wgt-private`, que outra nota cobre (`filesystem_tizen.md`).

### Gaps
- Não há doc da Samsung com o valor numérico da cota web na TV, nem com o efeito real do `unlimitedstorage` no
  Tizen 6–9.
- Não achei `tizen:setting` nem elemento de `config.xml` sobre storage ou quota. Não dá para afirmar que nenhum existe
  sem acesso ao chromium-efl ou ao WRT.

## 4. App hospedado (origem https) muda a cota? Política da loja

### Takeaway
Não há evidência de que uma origem https tenha cota maior na TV. Upstream, a cota é por origem e calculada igual para
todas. A política da Samsung praticamente fecha esse caminho: app hospedado "is not allowed to submit" fora de casos
especiais, exige grupo de parceiro e não tem APIs Tizen. Além disso, no domínio remoto o `unlimitedstorage` vira prompt
ao usuário.

### Cited Findings
- [FATO] "Basically, hosted application is not allowed to submit due to security policy. It can be acceptable for some
  special cases only. You need to contact your Content Manager in advance." "No. For security reasons, Tizen APIs are not
  supported in hosted applications." "Yes, but you must be a member of a partner group to create hosted applications." — [Samsung Hosted Applications Q&A](https://developer.samsung.com/smarttv/develop/faq/hosted-applications.html)
- [FATO] Para `unlimitedstorage`: "In the remote domain, pop-up user prompt is used." — [tizen-docs security-privileges.md](https://github.com/Samsung/tizen-docs/blob/master/docs/application/web/reference/security-privileges.md)
- [RELATO] Desenvolvedores relatam tela preta e problemas de CSP e `access` whitelist com apps hospedados em TVs 2020. — [Samsung forum: Hosted Web Application Issue - Black Screen on TV](https://forum.developer.samsung.com/t/hosted-web-application-issue-black-screen-on-tv/22003)
- [FATO] Projeto: ADR-012 já permite uma "página ponte" https só para embed de terceiro, sem dados e sem lógica. — `CLAUDE.md`/ADR-012

### Inferences
- [INFERÊNCIA] Se o limite de 80 MB vem de um pool fixo do embedder, ele vale para qualquer origem e um app hospedado
  não ganharia nada. Se vem de algo específico do `file://` (storage key opaca ou "session-only"), uma origem https
  poderia ter outro número. Isso só se descobre medindo `estimate()` numa página https aberta no app (por exemplo a
  página ponte da ADR-012). Para o upstream, `kMaxSessionOnlyStorageKeyQuota = 300 MB`, então 80 MB também não bate com
  o caso session-only.
- [INFERÊNCIA] Mesmo que a cota fosse maior, mudar para app hospedado quebraria o client-first (ADR-008), perderia as
  APIs Tizen (AVPlay é `webapis`) e dependeria de aprovação da Samsung. Não é viável.

### Gaps
- Não achei nenhuma medição pública de `estimate()` numa origem https dentro de um app Tizen TV.

## 5. Quais APIs dividem a mesma cota (IndexedDB, Cache Storage, OPFS, WebSQL, localStorage)

### Takeaway
No Chromium, IndexedDB, Cache Storage e OPFS/File System (e o legado `webkitRequestFileSystem`) entram no mesmo
balde de cota por origem (storage key) do QuotaManager. localStorage/sessionStorage ficam fora, com limite fixo de
~5 MB. WebSQL também entrava no QuotaManager no upstream. No Tizen 9 a Samsung marca WebSQL como "Yes" na tabela do
motor, mas a lista W3C do Tizen 9 TV o dá como "Deprecated Since 3.0", e não achei fonte de que ele tenha cota
separada. Nenhuma API web alternativa escapa da cota. Só o Filesystem do Tizen (fora do Chromium) poderia.

### Cited Findings
- [FATO] "The data that's stored by using other web technologies, such as IndexedDB, Cache API, or File System API (which
  defines the Origin Private File System), is managed by a storage management system that's specific to each browser."
  Web Storage é separado: "Browsers can store up to 5 MiB of local storage, and 5 MiB of session storage per origin." — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [FATO] O `estimate()` "reports the total number of bytes used by IndexedDB and the Cache API", e "Both IndexedDB and
  the Cache API throw a `DOMError` named `QuotaExceededError`". — [web.dev](https://web.dev/articles/storage-for-the-web)
- [RELATO] "every byte written into OPFS draws down the origin's storage quota alongside IndexedDB and the Cache API". Fonte
  de terceiro, mas consistente com o MDN. — [fast.io](https://fast.io/resources/file-system-access-api.md)
- [FATO] Samsung TV: CacheStorage Yes (Tizen 3.0+), IndexedDB Yes, Web SQL Yes (Tizen 3.0–10.0, e também 2.4/2.3 pelo
  rowspan), Web Storage Yes. Não há linha para OPFS, File System Access ou `navigator.storage.getDirectory`. — [Samsung Web Engine Specifications, Table 9](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html)
- [FATO] Na lista W3C do Tizen 9 TV, "Web SQL Database" está como "Deprecated Since 3.0", dentro de comentário HTML. Isso
  contradiz o "Yes" da tabela do motor. — [tizen-docs api/9.0 w3c_api_tv.html](https://github.com/Samsung/tizen-docs/blob/master/docs/application/web/api/9.0/w3c_api/w3c_api_tv.html)
- [FATO] WebSQL upstream: removido de contextos de terceiros em M97, inseguros em M110, e "Web SQL access in all contexts
  is no longer available from Chromium 119" (com deprecation trial de M117 a M123). — [Chrome blog, Deprecating Web SQL](https://developer.chrome.com/blog/deprecating-web-sql)
- [FATO] O guia de Web Storage da Samsung diz que o limite é 5 MB por app. — [Using Web Storage](https://developer.samsung.com/smarttv/develop/guides/data-handling/using-web-storage.html)

### Inferences
- [INFERÊNCIA] Se o WebSQL ainda existir no Chromium 120 do Tizen 9 (a Samsung diz Yes, então é provável que o
  embedder tenha mantido a flag), ele usaria o mesmo QuotaManager (`DatabaseQuotaClient`) e dividiria os 80 MB. Não é
  uma saída, e ainda é API removida upstream.
- [INFERÊNCIA] OPFS (`navigator.storage.getDirectory`, Chromium 86+) provavelmente existe no M120, mas cai no mesmo
  balde. Não serve para escapar da cota.
- [INFERÊNCIA] localStorage tem balde próprio de ~5 MB. Serve só para preferências pequenas, não para catálogo.

### Gaps
- Nenhuma fonte Samsung confirma OPFS no Tizen 8/9, nem se o WebSQL do Tizen tem cota separada. Isso precisa de teste
  na TV: gravar em WebSQL ou OPFS com o IndexedDB já cheio e olhar `estimate().usage`.

## 6. Comprimir (CompressionStream) ou gravar como Blob muda a contagem?

### Takeaway
A cota conta bytes em disco. Comprimir no app reduz o uso de forma real. O Chromium 120 do Tizen 9 **não** tem a
compressão Snappy automática de valores grandes do IndexedDB, que chegou só no Chrome 129. Por isso, JSON grande gravado
hoje ocupa o tamanho bruto, e comprimir no cliente tende a dar ganho grande em texto e JSON. Blobs não escapam da cota.

### Cited Findings
- [FATO] O Chrome guarda "values larger than a single page as plain files on the disk". Antes, "the large files stored
  as plain files were not compressed". Com a mudança, "Chrome will now compress these large files" com Snappy
  ("Storage from version 129"). O ganho é maior em dados estruturados (JSON/XML) e pequeno em mídia já comprimida. "The
  space savings can be indirectly observed using web APIs like `navigator.storage.estimate()`". — [Chrome, More efficient IndexedDB storage in Chrome](https://developer.chrome.com/docs/chromium/indexeddb-storage-improvements) (última atualização 2024-08-27)
- [FATO] Tizen 9.0 = Chromium M120, Tizen 10.0 = M130. — [Samsung Web Engine Specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html)

### Inferences
- [INFERÊNCIA] Como `estimate()` reflete a economia da compressão, a contagem é por tamanho em disco. Gravar
  `Uint8Array`/Blob comprimido com `CompressionStream('gzip')` (Chromium 80+) reduz o uso na mesma proporção da
  compressão. JSON de catálogo costuma comprimir de 5 a 10×, mas esse número não foi medido aqui.
- [INFERÊNCIA] Blobs no IndexedDB do Chromium vão para arquivos no diretório de blobs da mesma origem e contam no mesmo
  uso. Gravar como Blob não comprime nada sozinho. Já um valor binário evita o overhead do structured clone de objetos
  JS com muitas chaves repetidas.
- [INFERÊNCIA] As TVs Tizen 10 (M130) já ganham a compressão Snappy automática, mas Snappy comprime menos que gzip/deflate.

### Gaps
- Não achei fonte primária dizendo como o QuotaManager do Chromium soma Blobs do IndexedDB e arquivos do LevelDB (disco
  real ou tamanho lógico). A conclusão de que é tamanho em disco é inferência a partir do artigo de 2024.
- A taxa de compressão dos dados reais do projeto (listagens Xtream, M3U, XMLTV) precisa ser medida.

## Inventário-resumo das alavancas

| Alavanca | Funciona na TV? | Evidência |
|---|---|---|
| `unlimitedstorage` no `config.xml` | Não (cota medida = 80 MB com ele declarado) | Docs dizem "unlimited size", mas a medição do projeto e um relato de 2013 dizem que não |
| `navigator.storage.persist()` | Não muda a cota no Chromium. No Tizen não está documentado | MDN / quota_settings.cc |
| `webkitPersistentStorage.requestQuota` | A interface existe (Samsung "Yes" de 3.0 a 10.0), mas o upstream neutralizou a host quota | Tabela Samsung (rowspan), Qt 6.5 / crbug 1233525 |
| `tizen:setting` / privilégio de parceiro | Não achei nenhum | Docs de config.xml |
| App hospedado (https) | Barrado pela política, sem APIs Tizen. Nenhuma evidência de cota diferente | Samsung Hosted Apps FAQ |
| Cache Storage / OPFS / WebSQL | Mesmo balde do IndexedDB (inferência forte para Cache e OPFS) | MDN, web.dev |
| localStorage | Balde separado de ~5 MB | Samsung Using Web Storage |
| Compressão no cliente | Reduz o uso de verdade, e o M120 não comprime sozinho | Chrome IndexedDB storage improvements |
| `tizen.filesystem` em `wgt-private` | É a única saída documentada fora do Chromium. A cota não foi medida | Samsung Managing File Operations (ver `filesystem_tizen.md`) |
