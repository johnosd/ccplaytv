# Tizen Filesystem Device API (tizen.filesystem) como armazenamento de dados grandes em TVs Samsung

Legenda: **[DOC]** = fato documentado em fonte oficial; **[RELATO]** = relato de usuário/fórum; **[INFERÊNCIA]** = dedução minha; **[SUPOSIÇÃO]** = não verificado.

Contexto local: `CCPlayTv/config.xml` deste repositório já declara `http://tizen.org/privilege/unlimitedstorage` (e não declara `filesystem.read`/`filesystem.write`) — verificado por grep no arquivo em 2026-10-17.

Nota de acesso: em 2026-10-17, as páginas `docs.tizen.org/application/web/api/<versão>/device_api/tv/tizen/filesystem.html` e `developer.tizen.org/dev-guide/...` retornam **301 para `samsungtizenos.com`** (sem chegar à página equivalente). Por isso, a fonte primária usada aqui é a referência da Samsung em developer.samsung.com. As versões 5.5/6.0/6.5 da referência TV do docs.tizen.org aparecem na busca, mas não puderam ser lidas.

## 1. Raízes virtuais na TV, ciclo de vida e cotas

### Takeaway
A TV expõe `wgt-package` (só leitura), `wgt-private` (privada, apagada ao desinstalar), `wgt-private-tmp` (volátil, apagada ao fechar o app ou reiniciar o runtime), `documents`/`downloads`/mídia (sobrevivem à desinstalação) e `removable_*` (USB). **Nenhuma fonte oficial documenta cota ou limite de tamanho por app para `wgt-private`**, nem diz se ele conta na cota do IndexedDB. O limite prático é o espaço livre da TV.

### Cited Findings
- [DOC] A referência lista as raízes `images, videos, music, documents, downloads`, `camera` (desde Tizen 2.3), `wgt-package` ("read-only"), `wgt-private` ("private storage for a widget, not accessible to other widgets or apps"), `wgt-private-tmp` (volátil, "may be cleared when the widget closes or the runtime restarts") e `removable_...` (o sufixo é um ID único, obtido com `listStorages`). A seção de `resolve()` (descontinuado) também cita `ringtones`. — [Samsung Filesystem API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/filesystem-api.html)
- [DOC] Guia de TV: "Accessible parts of the TV file system are represented as virtual root locations". Para `wgt-private`: "Files in this directory are removed when the application is uninstalled." Para `documents`: "Files in this directory are not removed when the application is uninstalled." `wgt-private-tmp`: os arquivos são removidos quando o app termina ou quando o Web runtime reinicia. — [Managing File Operations](https://developer.samsung.com/smarttv/develop/guides/data-handling/managing-file-operations.html)
- [DOC] O guia não dá nenhuma cota para o sistema de arquivos. A referência expõe só `maxPathLength` (exemplo: 4096) e `maxNameLength` (exemplo: 255), e não fala de cota de armazenamento. — [Managing File Operations](https://developer.samsung.com/smarttv/develop/guides/data-handling/managing-file-operations.html); [Samsung Filesystem API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/filesystem-api.html)
- [DOC] Atualizações: "Web application data, such as Tizen settings, cookies, and local storage are preserved across updates." Uma atualização só é aplicada com o mesmo Tizen AppID e a mesma assinatura de autor. O texto não cita `wgt-private` explicitamente. — [Tizen Web Runtime tutorial](https://docs.tizen.org/application/web/tutorials/web-runtime)
- [DOC] Seller Office: "All application data is deleted when the application is uninstalled, and cannot be recovered." — resultado de busca que aponta para os guias de publicação [Application Publication Process](https://developer.samsung.com/tv-seller-office/guides/applications/tv-app-publication-process.html) (trecho visto no resumo da busca, página não aberta).
- [RELATO] Reinstalar pelo Tizen Studio pode apagar o localStorage, porque faz um ciclo completo de desinstalar e reinstalar. Os relatos se contradizem. Uma resposta diz que o armazenamento via tizen.filesystem persistiu após reinstalar (anedótico). — [fórum Tizen: localStorage cleared after reinstall](https://developer.tizen.org/forums/web-application-development/window.localstorage-data-cleared-after-app-re-installation-tizen-studio)
- [DOC] O privilégio `http://tizen.org/privilege/unlimitedstorage` aparece entre os "W3C/HTML5 API Privileges" do guia de configuração da Samsung. Ele cobre File API (diretório/sistema), Indexed Database e Web SQL, sem nível mostrado. — [Configuring TV Applications](https://developer.samsung.com/smarttv/develop/guides/fundamentals/configuring-tv-applications.html)

### Inferences
- [INFERÊNCIA] Como `wgt-private` é um diretório real do sistema de arquivos (o caminho `/opt/usr/home/owner/content/...` apareceu em resumo de busca, sem página confirmada), é provável que ele **não** conte na cota do motor web para IndexedDB e que seja limitado só pelo espaço livre da partição de usuário. Não há documentação que confirme isso; precisa ser medido na TV.
- [INFERÊNCIA] Para dados derivados de catálogo, que podem ser baixados de novo, o ciclo de vida de `wgt-private` (sobrevive a fechar o app e a atualizar, some ao desinstalar) é adequado. `wgt-private-tmp` não serve para persistir. `documents` sobreviveria à desinstalação, o que é pior para privacidade: a ADR-010 do projeto exige que os dados do provedor saiam junto com o app. Hoje isso também exigiria o privilégio de storage (ver seção 3).

### Gaps
- Nenhuma cota oficial ou relatada para `wgt-private` em TV, e nenhum dado sobre a interação com a cota do IndexedDB e com o `unlimitedstorage`.
- Comportamento documentado de `wgt-private` ao atualizar o app pela loja: só há a frase geral sobre "local storage". Não verifiquei se o "Clear Data" do Manage Storage da TV apaga `wgt-private` [SUPOSIÇÃO: provavelmente apaga].

## 2. API por versão: FileHandle (5.0+) vs. resolve()/openStream descontinuados; situação no Tizen 8/9

### Takeaway
A API Filesystem é **obrigatória ("Mandatory") no perfil TV** e continua listada pela Samsung sem nenhuma descontinuação. `openFile()` e `FileHandle` (com variantes NonBlocking) existem desde 5.0, e `resolve()`/`File`/`FileStream` estão descontinuados desde 5.0, mas não foram removidos. A Samsung avisa que a API "might be obsolete in the future". Nenhuma remoção foi documentada para Tizen 8 ou 9.

### Cited Findings
- [DOC] Tabela de APIs da TV: Filesystem — "This API provides access to the file system of a device", Since 1.0, **TV: Mandatory**, Emulator: Yes. Aviso: "This API might be obsolete in the future when W3C File APIs are extended" (para acessar arquivos sensíveis do sistema). A tabela de Deprecated APIs lista só Iotcon (descontinuada desde 10.0) e LibTeec (desde 6.5). Filesystem não está lá. — [Tizen TV Web Device API Reference](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references.html)
- [DOC] A maioria dos métodos, o tipo `Path` e o modo `rwo` são "Since: 5.0". `resolve()` aparece como "Deprecated. Since 5.0". As interfaces antigas `File` e `FileStream` (`openStream`, `readAsText`, `copyTo`...) também são "Deprecated. Since 5.0". — [Samsung Filesystem API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/filesystem-api.html)
- [DOC] `openFile(path, openMode, makeParents)` aceita os modos `a`, `r`, `rw`, `rwo` ("read and write mode, overwriting existing file content") e `w`. `FileHandle` tem `seek`, `readString`, `writeString`, `readBlob`, `writeBlob`, `readData`, `writeData`, `flush`, `sync` e `close`, cada um com variante `...NonBlocking`, que "are executed in background in the order in which they were called". Não existe `openFile` NonBlocking. — [Samsung Filesystem API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/filesystem-api.html)
- [DOC] Ainda assim, o guia de TV "Managing File Operations" e o de USB usam nos exemplos a API antiga (`resolve()`, `openStream()`, callbacks). — [Managing File Operations](https://developer.samsung.com/smarttv/develop/guides/data-handling/managing-file-operations.html); [Handling USB Storages](https://developer.samsung.com/smarttv/develop/guides/data-handling/handling-usb-storages.html)
- [DOC] Os "Supported Devices" das páginas listam "TV" e "HTV Signage", sem tabela por ano ou modelo. — mesmas fontes.

### Inferences
- [INFERÊNCIA] Na TV de referência (Tizen 9), o caminho certo é `openFile` + `FileHandle` (5.0+). Usar `resolve()`/`openStream` ainda funcionaria, mas é API descontinuada. Como ela é "Mandatory" no perfil TV, todo modelo de 2019 em diante (Tizen 5.0+) deveria tê-la. [SUPOSIÇÃO: mapeamento ano→Tizen 2019=5.0, 2020=5.5, 2021=6.0, 2022=6.5, 2023=7.0, 2024=8.0; a TV de referência do projeto mediu Tizen 9.]

### Gaps
- Não consegui ler as páginas versionadas do docs.tizen.org (8.0/9.0), que redirecionam para samsungtizenos.com. Por isso não confirmei se há nota de mudança para 8/9. A Samsung não lista nenhuma.

## 3. Privilégios, nível e implicações na Seller Office

### Takeaway
`filesystem.read` e `filesystem.write` são de nível **public**. A referência também exige `mediastorage` (armazenamento interno) e `externalstorage` (USB) para as raízes de armazenamento, igualmente públicos. Nenhuma fonte encontrada indica restrição extra na Seller Office por usar esses privilégios. Nenhuma fonte diz explicitamente se `wgt-private` dispensa `mediastorage`. O guia de TV pede só `filesystem.read/write`.

### Cited Findings
- [DOC] `filesystem.read` é exigido em `listDirectory`, `isFile`, `pathExists` e em `openFile` nos modos `r`, `rw` e `rwo`. `filesystem.write` é exigido em `createDirectory`, `deleteFile`, `deleteDirectory`, `rename`, `addStorageStateChangeListener` e em `openFile` nos modos `a`, `rw`, `rwo` e `w`. Copiar ou mover exige os dois. "Storage privileges": armazenamento interno → `mediastorage`; externo → `externalstorage`. Todos com "Privilege level: public". — [Samsung Filesystem API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/filesystem-api.html)
- [DOC] O guia de TV pede só "`http://tizen.org/privilege/filesystem.read`" e "`filesystem.write`" no config.xml e não menciona privilégio específico para `wgt-private`. — [Managing File Operations](https://developer.samsung.com/smarttv/develop/guides/data-handling/managing-file-operations.html)
- [DOC] O guia de configuração de app de TV não lista `filesystem.*`, `mediastorage` nem `externalstorage` na tabela de privilégios e não traz lista de privilégios partner. Ele diz para "sign your application with a certificate for the appropriate privilege level". — [Configuring TV Applications](https://developer.samsung.com/smarttv/develop/guides/fundamentals/configuring-tv-applications.html)
- [RELATO] Resposta de fórum de 2018 (Tizen 4.0, wearable, não é TV) afirma que o privilégio de media storage era necessário para escrever, com `tizen.ppm.requestPermission`. Não se aplica diretamente à TV. — [fórum Tizen: unable to write files Tizen 4.0](https://developer.tizen.org/forums/web-application-development/unable-write-files-tizen-4.0.0)
- [DOC] A Seller Office roda um pré-teste automático no upload do pacote. Não encontrei regra de revisão específica para privilégios de filesystem nem limite de tamanho do .wgt. Os únicos limites listados são de imagens (ícone ≤ 300 kB, screenshot JPG ≤ 500 kB). — [Application Publication Process](https://developer.samsung.com/tv-seller-office/guides/applications/tv-app-publication-process.html) (via resumo de busca)

### Inferences
- [INFERÊNCIA] Como são privilégios public, não deve haver barreira de certificado partner. Mesmo assim, o projeto teria de acrescentar privilégios ao config.xml (hoje há só `unlimitedstorage`), o que pode exigir atualizar a privacidade/UI Description da versão comercial (feature 078). [SUPOSIÇÃO: a Samsung pode questionar acesso a armazenamento na revisão manual, o que não está documentado.]
- [INFERÊNCIA] O trecho "Storage privileges" da referência parece valer para as raízes de mídia e compartilhadas (`documents`, `downloads`, `images`...) e para USB, não para a área privada do app. Isso é coerente com o guia de TV, que não pede `mediastorage`, mas precisa ser confirmado empiricamente (abrir `wgt-private/x.json` sem `mediastorage` e ver se lança `SecurityError`).

### Gaps
- Nenhuma fonte oficial afirma literalmente "wgt-private não requer privilégio" nem que `openFile` em `wgt-private` funciona sem `filesystem.*`.
- Não encontrei política da Seller Office sobre esses privilégios.

## 4. Desempenho: throughput, bloqueio de thread, limites de memória

### Takeaway
**Não há benchmark confiável** de leitura/escrita em TV. Os métodos síncronos de `FileHandle` bloqueiam a thread de JS (na prática, a UI). As variantes `NonBlocking` rodam em background, mas `close()` síncrono espera todos os jobs. Ler um arquivo grande de uma vez esbarra num limite por chamada não especificado ("maximum value supported by the device").

### Cited Findings
- [DOC] `readStringNonBlocking` "is executed in background and does not block further instructions". `close()` é síncrono: "close will block further instructions until all background jobs finish execution". — [Samsung Filesystem API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/filesystem-api.html)
- [DOC] `readString`, `readBlob`, `readData` e as variantes NonBlocking lançam `InvalidValuesError` se o tamanho pedido "exceeds maximum value supported by the device". O valor não é publicado. — mesma fonte.
- [RELATO, baixa confiabilidade] ~"100 kB/s with 100% CPU usage" em `FileStream.writeBytes/writeBase64` no **emulador mobile Tizen 3.0** com host lento. A própria página se declara gerada por IA e não é TV. — [samsungtizenos knowledge hub](https://samsungtizenos.com/knowledge-hub/filestream-write-performance-issues-9790)
- Não encontrei números de throughput em TV física em fórum, Stack Overflow ou GitHub.

### Inferences
- [INFERÊNCIA] Os métodos `tizen.*` só existem no contexto da página (o objeto `tizen` não está disponível em Web Workers no WRT [SUPOSIÇÃO não verificada]). Então a escrita de centenas de MB teria de usar as variantes NonBlocking em blocos (`writeStringNonBlocking`/`writeBlobNonBlocking`), evitando `close()` antes de os jobs terminarem. Uma string JSON de centenas de MB num único `readString` é arriscada por memória (string UTF-16 ~2× o tamanho) e pelo limite por chamada. O caminho é fragmentar (vários arquivos por categoria/bloco), como o projeto já faz com `categoryBlocks` no IndexedDB.
- [INFERÊNCIA] Como `readBlob` devolve `Blob`, dá para passar o Blob a um Worker e fazer `blob.text()`/`JSON.parse` fora da thread de UI, reduzindo o bloqueio.

### Gaps
- Throughput real na TV (MB/s) de leitura e escrita, latência de `openFile`, valor do limite por chamada e comportamento de memória: tudo precisa ser medido na TV de referência.

## 5. Orientação da própria Samsung sobre limites de armazenamento

### Takeaway
A Samsung diz que Web Storage guarda até 5 MB e manda usar o sistema de arquivos para mais que isso, mas não dá nenhum limite para o sistema de arquivos nem para o IndexedDB.

### Cited Findings
- [DOC] "The Web storage can only store up to 5 MB of data for your application." / "If you need to store larger amounts, use the file system." (com link para Managing File Operations). A página não fala de IndexedDB. Guias relacionados: Handling USB Storages e Downloading Data. — [Using Web Storage](https://developer.samsung.com/smarttv/develop/guides/data-handling/using-web-storage.html)
- [DOC] O guia Managing File Operations não declara cota e recomenda Web Storage para dados abaixo de 5 MB. — [Managing File Operations](https://developer.samsung.com/smarttv/develop/guides/data-handling/managing-file-operations.html)

### Inferences
- [INFERÊNCIA] A recomendação "use the file system" é genérica, provavelmente escrita antes do IndexedDB maduro no WRT, e não implica que `wgt-private` tenha mais espaço que o IndexedDB com `unlimitedstorage`. As duas opções acabam no mesmo flash interno.

### Gaps
- Não li o guia "Downloading Data" (tizen.download). Nenhuma declaração da Samsung sobre cota do IndexedDB em TV foi encontrada nesta pesquisa.

## 6. Armazenamento interno típico das TVs 2021–2025 e comportamento com pouco espaço

### Takeaway
Os relatos indicam que o espaço livre para apps é pequeno: de dezenas de MB em modelos antigos até ~0,8–1 GB num Neo QLED de 8 GB anunciados. A Samsung não publica o espaço utilizável. Centenas de MB de catálogo por app podem não caber em muitas TVs.

### Cited Findings
- [RELATO] QA55QN85BAKLXL (Neo QLED QN85B, linha **2022**; post de fev/2024): 8 GB anunciados, a TV mostra 3,8 GB no total, ~800 MB livres (o resumo do post diz "only 1 GB"), mais de 3 GB ocupados por apps pré-instalados. O suporte Samsung disse que parte do sistema é inacessível ao usuário. — [hifivision](https://www.hifivision.com/threads/total-storage-spec-by-samsung-tv-is-misleading.95306)
- [RELATO] UE55NU7500 (2018): ~751 MB usados, ~64 MB livres após a configuração. Moderadores e "engenheiros" disseram que é assim por projeto. — [Samsung EU Community "Apps storage space issue"](https://eu.community.samsung.com/t5/TV/Apps-storage-space-issue/td-p/808085/page/48) (403 ao abrir; conteúdo via resumo de busca)
- [RELATO] CU8000 (2023): 4 GB no total, ~2 GB usados (não verificado). — [Samsung EU Community CU8000](https://eu.community.samsung.com/t5/tv/cu8000-crystal-uhd-4k-hdr-smart-tv-storage-memory/m-p/7563238/highlight/true) (via resumo de busca)
- [DOC] Suporte Samsung (capturas de um modelo 2024): o armazenamento da TV é limitado. Em Manage Storage dá para ver o espaço restante, apagar apps e usar, por app, "Clear Data" e "Clear Cache", sem definição do que cada um apaga. — [Samsung AU: Clear App Cache and Data](https://www.samsung.com/au/support/tv-audio-video/clear-app-cache-and-data-on-your-samsung-tv/)
- [DOC/imprensa] One UI Tizen 9: Device Care → Storage mostra o espaço usado e restante e "how much storage each installed app occupies". — [SamMobile](https://www.sammobile.com/news/manage-and-free-up-storage-on-your-samsung-tv-running-one-ui-tizen/)

### Inferences
- [INFERÊNCIA] Os dados do app em `wgt-private` provavelmente entram no total "por app" do Device Care, ficando visíveis para o usuário e apagáveis por Clear Data. Com ~1 GB livre num modelo topo de linha e menos em modelos de entrada, um orçamento seguro para catálogo local deveria ficar em dezenas de MB, não centenas, independentemente de ser IndexedDB ou filesystem.

### Gaps
- Nenhuma fonte sobre o que o WRT/sistema faz quando o disco enche: erro de escrita, despejo de dados, aviso ao usuário ou bloqueio de atualizações de firmware. Não há números oficiais por modelo 2024–2025.

## 7. USB via raízes removable_*

### Takeaway
É possível ler e escrever em USB via `listStorages()` + raízes `removable_*` (com `filesystem.write` e `externalstorage`), mas o recurso é opcional e removível. Não serve como armazenamento principal do catálogo.

### Cited Findings
- [DOC] "Removable storages have the prefix "removable_"". O acesso é feito por `listStorages()` e `resolve()` com o rótulo, no exemplo em modo `'rw'`. `addStorageStateChangeListener()` avisa quando um dispositivo é conectado ou removido, e o emulador simula USB. O guia não fala de formatos de sistema de arquivos nem de limites. — [Handling USB Storages](https://developer.samsung.com/smarttv/develop/guides/data-handling/handling-usb-storages.html)
- [DOC] O acesso a armazenamento externo exige `externalstorage` (public). — [Samsung Filesystem API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/filesystem-api.html)
- [RELATO] O suporte Samsung sugere instalar apps em USB quando falta memória, e o USB formatado assim não pode ser usado em outra TV ou PC. Um desenvolvedor com QN90A (2021) relatou que tentar usar USB como armazenamento interno não funcionou (o post não abriu, 404; conteúdo via resumo de busca). — [Samsung AE 2024 apps](https://www.samsung.com/ae/support/tv-audio-video/how-to-use-apps-on-a-2024-samsung-smart-tv/); [fórum Samsung QN90A](https://forum.developer.samsung.com/t/extending-app-storage-using-usb-drive-on-tizen-t-nkm2akuc-1805-4-bt-s-2021-qn90a/17092)

### Inferences
- [INFERÊNCIA] Gravar credenciais ou URLs do provedor num pendrive violaria a ADR-010 do projeto: o dado sai do dispositivo, é legível em outro PC e não é apagado ao desinstalar. O USB só faria sentido como cache opcional não sensível, e mesmo assim com outro privilégio e outro fluxo de UX.

### Gaps
- Formatos suportados (FAT32/exFAT/NTFS) e desempenho de escrita em USB na TV: não documentados nas fontes lidas.
