# Apps IPTV de mercado em TVs restritas (Tizen / webOS): como lidam com listas grandes e armazenamento

Legenda usada em todo o documento:
- **[FATO-DOC]**: documentação oficial (do app ou da plataforma).
- **[FATO-FÓRUM-OFICIAL]**: resposta de funcionário/moderador num fórum oficial de desenvolvedores.
- **[RELATO]**: relato de usuário, guia de terceiro ou blog (muitas vezes de revendedor, com viés comercial).
- **[INFERÊNCIA]**: dedução minha a partir das fontes; não está documentada.

Observação sobre a qualidade das fontes: a busca por este tema é muito poluída por sites de revendedores de IPTV (SEO). Sites oficiais como flixiptv.eu (HTTP 403), iboplayer.com (só o título), iboplayerpro.com/support (conexão recusada), duplexplay.com/faq (404) e ss-iptv.com (404) **não puderam ser lidos** nesta sessão. Por isso, a maior parte da evidência primária sobre apps vem do Smart IPTV (siptv.app). Nenhuma fonte de conteúdo pirata é citada.

## 1. Como os apps do mercado no Tizen carregam as listas (portal por MAC, servidor, sob demanda, cache local)

### Takeaway
O modelo dominante nos apps "player vazio" do Tizen/webOS (SIPTV, IBO, Flix, Duplex, Set IPTV, Net IPTV e semelhantes) é cadastrar a lista num **portal web**, identificado pelo MAC ou Device ID da TV (às vezes com uma "device key"). O portal guarda a **URL** ou o arquivo. Em geral, a TV baixa e processa a lista **ela mesma**, guardando-a na memória do app. O caso documentado (SIPTV) trata o processamento ou a hospedagem no servidor ("Save online") como **plano B para TVs com pouca memória**, e não como o caminho padrão. Não encontrei evidência pública de que algum desses apps envie à TV uma versão pré-processada ou comprimida do catálogo.

### Cited Findings
- **Smart IPTV (SIPTV)**: "Smart IPTV application does not include any channels". A lista é carregada a partir de uma URL, que precisa ser "direct link, not a redirect" e estar "currently online" [FATO-DOC] — [siptv.app/faq](https://siptv.app/faq/)
- **SIPTV**: a identificação é feita por MAC. Cada TV tem dois MACs (WiFi e Ethernet), e o MAC não pode ser alterado. No LG webOS, a partir do app 3.0.0 o MAC deixou de ser acessível e só aparece um Device ID. No Android 13+ e nas instalações pela Play Store é usado um Device ID temporário, que pode mudar com um reset de fábrica [FATO-DOC] — [siptv.app/faq](https://siptv.app/faq/)
- **SIPTV**: a página de upload aceita "Upload playlist Files or external URLs and EPGs", ou seja, arquivo **ou** URL, mais EPG [FATO-DOC] — [siptv.app/mylist](https://siptv.app/mylist/)
- **SIPTV**: "Use Save online ONLY if you have problems loading playlist on your TV due to low memory". A opção online é explicitamente um recurso de contingência para pouca memória na TV [FATO-DOC] — [siptv.app/mylist](https://siptv.app/mylist/)
- **SIPTV**: se a lista some depois de reiniciar a TV, a FAQ recomenda ativar "Save online". A lista também pode ser baixada da URL e usada "as a static playlist" [FATO-DOC] — [siptv.app/faq](https://siptv.app/faq/)
- **SIPTV**: há opções para desligar o EPG externo ou desmarcar "Detect EPG" no upload. O "Detect EPG" detecta automaticamente `tvg-url`, `url-tvg` e `x-tvg-url` dentro da lista [FATO-DOC] — [siptv.app/faq](https://siptv.app/faq/); [siptv.app/mylist](https://siptv.app/mylist/)
- **SIPTV (cache)**: para forçar o recarregamento da lista sem usar o cache do app, basta manter pressionado "0" ou "CH". No Samsung, a orientação para limpar o cache é resetar o Smart Hub ou desligar a TV da tomada [FATO-DOC] — [siptv.app/faq](https://siptv.app/faq/)
- **IBO Player / IBO Player Pro**: a TV mostra um MAC e uma device key. A pessoa entra com esses dois códigos no site do desenvolvedor, a partir do celular ou do PC, e adiciona uma lista M3U ou Xtream Codes. Não se digita login na TV. Os guias citam domínios diferentes para esse site (iboplayer.com, iboplayerpro.com, iboproapp.com, activation.iboplayer.com) [RELATO] — [iptvv-ca.ca](https://iptvv-ca.ca/ibo-player-guide/); [smooiptv.com](https://smooiptv.com/ibo-player-pro-setup-guide/)
- **IBO Player**: disponível para Samsung (Tizen) e LG (webOS), nas lojas oficiais de cada fabricante [RELATO] — [hungaryiptv.net](https://hungaryiptv.net/en/blog/iptv-guide-ibo-player-pro)
- **Duplex IPTV**: a lista é adicionada por um "online management portal", não pelo próprio app. Duplex Play e Duplex IPTV são apps diferentes. A versão Samsung do Duplex IPTV aparece listada como "USA only" [RELATO] — [install-iptv.com](https://www.install-iptv.com/how-install-iptv/smarttv/duplex-iptv/); [iptv-support.kayako.com](https://iptv-support.kayako.com/article/12-how-to-setup-iptv-on-smart-tv-duplex)
- **Duplex Play**: aceita listas .m3u carregadas como URLs "http" [RELATO] — [duplexplays.com](https://duplexplays.com/). Um artigo de terceiro diz que o DuplexPlay "parou de funcionar" e sumiu dos dispositivos [RELATO] — [wedostreaming.com](https://www.wedostreaming.com/iptv/121-duplexplay-application-stopped-working-what-are-alternatives)
- **IPTV Smarters Pro**: um guia de terceiro recomenda trocar M3U por login Xtream Codes porque assim os canais são carregados "em etapas" e o app usa menos memória do dispositivo [RELATO] — [lumiptv.com](https://lumiptv.com/blog/iptv-smarters-pro-not-working-fixes)
- **TiviMate**: não existe no Tizen nem no webOS. É um app Android. A alternativa sugerida é um dispositivo Android/Google TV ou Fire TV ligado à TV [RELATO, voluntário do Samsung Members] — [eu.community.samsung.com](https://eu.community.samsung.com/t5/mobiele-apps-services/tivimate-app-op-samsung-rv/td-p/7206256); [larepublica.pe](https://larepublica.pe/tecnologia/actualidad/2024/06/29/smart-tv-quieres-television-gratis-asi-podras-instalar-tivimate-en-tu-televisor-y-ver-cientos-de-canales-de-todo-el-mundo-1217826)

### Inferences
- [INFERÊNCIA] O portal por MAC desses apps resolve principalmente **entrada de dados** (digitar URL ou credenciais pelo controle remoto é ruim) e **licenciamento** (ativação por MAC). Não resolve o processamento do catálogo. A frase do SIPTV sobre "Save online" indica que, por padrão, a lista fica na memória do app na TV, e que hospedar no servidor é a exceção para aparelhos fracos.
- [INFERÊNCIA] Como "Save online" no SIPTV resolve o caso de "lista some depois de reiniciar", o modo padrão provavelmente grava a lista inteira (ou o resultado do parse) no armazenamento local do app. Quando não cabe, a gravação falha em silêncio e o app recomeça vazio, o que bate com o sintoma "fails to save in TV's memory".
- [INFERÊNCIA] A recomendação de Xtream "em etapas" no Smarters é coerente com o protocolo Xtream (`player_api.php` com `action=get_live_streams&category_id=…`, `get_vod_streams`, `get_series`), que permite buscar por categoria. A mesma estratégia já foi adotada no ccplayTv (feature 010). Não encontrei documentação do próprio Smarters confirmando que ele busca por categoria na versão Tizen.
- [INFERÊNCIA] O modelo do ccplayTv (portal da ADR-013/016 só para entrada e licença, com import e catálogo na TV) é, na prática, o mesmo do mercado. A diferença é que o ccplayTv persiste um catálogo estruturado no IndexedDB, enquanto o mercado parece guardar a lista bruta, ou nada, e reprocessar ao abrir o app.

### Gaps
- Não consegui ler as FAQs oficiais de IBO, Flix, Duplex, Set IPTV, Net IPTV, Bay IPTV, Hot IPTV, Smart STB, Purple Player, OTT Player e SS IPTV: 403, 404, conexão recusada ou página sem texto. Não há evidência primária de **pré-processamento no servidor** (lista convertida ou comprimida antes de chegar à TV) para nenhum desses apps.
- Smart STB e SS IPTV historicamente usam outros modelos: Smart STB emula um portal Stalker/Ministra e SS IPTV usa um código de conexão. Não obtive fontes atuais (2021–2026) para descrever como armazenam o catálogo.
- Não há fonte sobre quanto cada app guarda localmente em MB.

## 2. Limites conhecidos e reclamações (lista grande demais, número máximo de canais, EPG, memória cheia)

### Takeaway
O único limite **documentado oficialmente** que encontrei é qualitativo: o SIPTV avisa que "TVs have limited memory available for app storage" e que uma lista grande demais "might fail to save". Nenhum app publica um teto em MB ou em número de canais. O resto são relatos e guias de terceiros que apontam a memória e a RAM da TV como gargalo para listas com dezenas de milhares de itens.

### Cited Findings
- **SIPTV**: "TVs have limited memory available for app storage, so if your playlist is too big, it might fail to save in TV's memory". A solução indicada é reduzir a lista "by removing channels/movies", com menção especial às TVs LG da série LM [FATO-DOC] — [siptv.app/faq](https://siptv.app/faq/)
- **SIPTV**: a FAQ **não** informa limite de tamanho de lista, de número de canais nem de EPG [FATO-DOC, por ausência] — [siptv.app/faq](https://siptv.app/faq/)
- Guia sobre Net IPTV recomenda deixar o M3U8 abaixo de **5 MB**, removendo EPG e categorias redundantes, para acelerar o parse em LG e Samsung [RELATO, blog sem verificação] — [indiehackers.com](https://www.indiehackers.com/post/net-iptv-auf-lg-und-samsung-schnelle-playlists-ohne-ladezeiten-leitfaden-8b455ed269)
- Guias de terceiros dizem que listas M3U muito grandes "com milhares de canais" esgotam a memória do Smarters e causam lentidão ou crash, e que TVs Tizen/webOS antigas travam ao processar listas com 50.000+ entradas [RELATO, com viés comercial] — [lumiptv.com](https://lumiptv.com/blog/iptv-smarters-pro-not-working-fixes); [easy-ip.tv](https://easy-ip.tv/blog/best-iptv-player-samsung-tv)
- Na comunidade Samsung, um usuário com QE55Q60T não conseguiu reproduzir uma lista M3U no OTT Player (fica em "connecting" ou "buffering"), mas a mesma lista funcionou num Firestick. Outro usuário relata que o SIPTV parou de carregar canais de repente. Ninguém cita tamanho de lista como causa [RELATO] — [eu.community.samsung.com](https://eu.community.samsung.com/t5/tv/none-of-the-iptv-app-not-playing-in-sumsung-55-tizen-tv/td-p/3725926/page/2)
- Num contexto de digital signage em Tizen, "usually only a few hundred MB are available" de memória local [RELATO, fornecedor de signage, não é TV de consumo] — [support.optisigns.com](https://support.optisigns.com/hc/it/articles/28424138317971-Samsung-Tizen-TVs-Troubleshooting-Guide)
- Netzwelt descreve um menu de limpeza de armazenamento em TVs Samsung com Tizen 9/10 para liberar espaço removendo apps e dados [RELATO, imprensa] — [netzwelt.de](https://www.netzwelt.de/news/259077-fernseher-reagiert-langsam-versteckte-samsung-einstellung-schafft-speicherplatz-macht-tv-flotter.html)
- Histórico, fora de escopo (2012, servidor DLNA Serviio, não IPTV): "I think 1020 is the Samsung's limit" de entradas numa playlist DLNA [RELATO, antigo] — [forum.serviio.org](https://forum.serviio.org/viewtopic.php?p=51498)

### Inferences
- [INFERÊNCIA] O silêncio dos fabricantes sobre limites numéricos sugere que eles também não controlam a cota: ela depende do modelo e do firmware da TV, e o app só descobre o limite quando a gravação falha. Isso bate com o cenário do ccplayTv (cota de ~80 MB observada).
- [INFERÊNCIA] As respostas do mercado ao problema são: (a) mandar o usuário reduzir a lista, (b) desligar o EPG, (c) hospedar no servidor ("Save online"), (d) preferir Xtream em etapas. Nenhuma fonte mostra técnicas como compactar blocos ou guardar só a estrutura, que o ccplayTv já usa (features 010/014/039).

### Gaps
- Não encontrei mensagens literais do tipo "memory full", "playlist too large" ou "insufficient memory" atribuídas a apps IPTV específicos no Samsung. A busca não trouxe threads do Reddit (r/IPTV, r/samsung) nos resultados.
- Nenhum limite oficial de tamanho de EPG/XMLTV foi encontrado para nenhum app.

## 3. Players open source para TV: como guardam catálogos em engines web de TV; notas sobre cota de IndexedDB no Tizen

### Takeaway
Há poucos players IPTV open source maduros para Tizen. O IPTVnator, que é Electron e PWA e não roda em TV, migrou do IndexedDB para SQLite num worker no Electron, o que mostra que o IndexedDB foi o gargalo em catálogos grandes. No Tizen, a documentação oficial cita um privilégio `http://tizen.org/privilege/unlimitedstorage` que cobre "Indexed Database API (Partial)", mas **não publica números de cota**.

### Cited Findings
- **Samsung (config.xml)**: o privilégio `unlimitedstorage` aparece associado a "File API: Directories and System", "File API: Writer (Partial)", "Indexed Database API (Partial)" e "Web SQL Database". A página não traz números de cota [FATO-DOC] — [developer.samsung.com – Configuring Web Applications](https://developer.samsung.com/smarttv/develop/guides/fundamentals/configuring-tv-applications.html)
- **Tizen Web Runtime**: para apps de domínio local, a permissão de armazenamento ilimitado é concedida se estiver declarada no manifesto; caso contrário, aparece um prompt ao usuário. O documento diz que isso vale para **mobile e wearable**, então a aplicação em TV não está confirmada [FATO-DOC, escopo ambíguo] — [github.com/Samsung/tizen-docs – web-runtime.md](https://github.com/Samsung/tizen-docs/blob/master/docs/application/web/tutorials/web-runtime.md)
- **Samsung Web Engine Specifications**: a tabela "Offline Storage" lista suporte a IndexedDB, Web Storage, Web SQL e Quota Management API por versão do Tizen. O texto extraído não permitiu alinhar com segurança as colunas da Quota Management API (aparece "Yes" para a versão mais recente e "No" em outras). Não há números de cota [FATO-DOC, leitura parcial] — [developer.samsung.com – Web Engine Specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html)
- **Fórum Tizen (2013, histórico)**: web storage limitado a ~2,49 MB, com o privilégio `unlimitedstorage` indicado como solução [RELATO, antigo, antes das TVs atuais] — [developer1.tizen.org](https://developer1.tizen.org/forums/web-application-development/how-use-unlimited-web-storage-indexeddb-websql-localstorage-on-tizen-web-application?langswitch=fr)
- **Medium**: afirma que o IndexedDB em SmartTVs costuma ter de "centenas de MB a vários GB", sem fonte específica de Tizen [RELATO, não confiável] — [medium.com](https://medium.com/@thanhcongns2212/the-easiest-way-to-use-indexeddb-on-smarttv-with-typescript-a9620db3c3b6)
- **IPTVnator**: no Electron, o armazenamento passou por migração "IndexedDB→SQLite", com um worker SQLite (`docs/architecture/sqlite-db-worker.md` no repositório deles) [FATO, relatório interno do projeto sobre o repositório] — `C:\Users\johns\Documents\Projetos\ccplayTv\docs\iptvnator\02-arquitetura.md` (linhas 78–111)
- **tizenos-iptv**: pacote npm, MIT, v0.2.2, descrito como player IPTV para TizenBrew (ambiente homebrew, não loja). Repositório e maturidade não confirmados [FATO, registro npm] — [jsdelivr.com/package/npm/tizenos-iptv](https://www.jsdelivr.com/package/npm/tizenos-iptv)
- Outros players open source encontrados são Android TV (SERFF/iptv-app, OwnTV, Ultra TV, Prysm) e não rodam em Tizen [FATO, repositórios] — [github.com/SERFF/iptv-app](https://github.com/SERFF/iptv-app); [github.com/oerd/OwnTV](https://github.com/oerd/OwnTV)

### Inferences
- [INFERÊNCIA] Vale testar se o `config.xml` do `CCPlayTv/` declara `http://tizen.org/privilege/unlimitedstorage` e medir `navigator.storage.estimate()` com e sem ele na TV de referência. É a única alavanca oficial conhecida para a cota de IndexedDB, mas a palavra "Partial" e a ausência de números tornam o efeito incerto.
- [INFERÊNCIA] A migração do IPTVnator para SQLite em desktop indica que nem em desktop o IndexedDB foi considerado adequado para catálogos de centenas de milhares de itens. Em TV, sem SQLite nativo para web apps, o caminho realista é reduzir o que se persiste: estrutura, blocos por categoria, e despejar categorias pouco usadas.

### Gaps
- Não encontrei o cliente Jellyfin Tizen nem outro repositório Tizen com notas explícitas sobre a cota de IndexedDB (busca não feita a fundo por limite de chamadas).
- Nenhum número público de cota de IndexedDB para Samsung TV 2021–2026, com ou sem `unlimitedstorage`.

## 4. LG webOS como referência: limites de armazenamento de web apps

### Takeaway
O webOS documenta limites **muito pequenos** e **compartilhados**: o DB8 tem 10 MB compartilhados entre todos os apps e serviços, e o localStorage tem 16 MB compartilhados entre todos os apps desde o webOS 3.5. Um app hospedado pode ter seus dados apagados quando o total chega ao limite. Não há número publicado para IndexedDB. A orientação oficial é tratar o armazenamento local como algo que pode não estar lá.

### Cited Findings
- **Fórum oficial webOS TV (resposta de staff, 2 jan. 2023)**: "The webOS TV apps share one local storage." "Since webOS TV 3.5, the local storage size is limited to 16MB." App empacotado: "The data is deleted when users update or remove your app on webOS TV." App hospedado: "The data is deleted when the total usage of data reaches the limit." "Therefore, you should consider the case where the data is not in the local storage." A thread não menciona IndexedDB [FATO-FÓRUM-OFICIAL] — [forum.webostv.developer.lge.com/t/…/1371](https://forum.webostv.developer.lge.com/t/migrate-from-packaged-to-hosted-app/1371)
- **DB8 FAQ (webOS TV)**: limite total de **10 MB compartilhados** entre todos os apps e serviços. Um único app pode ocupar todo o espaço. Não há método para consultar o espaço livre. Com o banco cheio, o app recebe um erro "out-of-space" [FATO-DOC] — [webostv.developer.lge.com/develop/guides/db8-faq](https://webostv.developer.lge.com/develop/guides/db8-faq)
- **Especificação do web engine webOS**: o cache do engine "is used only while the web browser engine is running and is not used anymore once an app has been terminated". Cookies só funcionam em apps hospedados (http/https), não em apps empacotados (`file://`). A página não traz limites de IndexedDB [FATO-DOC] — [webostv.developer.lge.com – Web API and Web Engine](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine)
- **SIPTV**: TVs LG da série LM têm memória limitada, e listas grandes falham mais nelas [FATO-DOC] — [siptv.app/faq](https://siptv.app/faq/)

### Inferences
- [INFERÊNCIA] Comparado ao webOS (16 MB de localStorage e 10 MB de DB8, ambos compartilhados), os ~80 MB de IndexedDB observados no Tizen do ccplayTv são generosos. Ainda assim, ficam ordens de grandeza abaixo de um catálogo completo de 300k VOD com metadados. Isso explica por que os apps de mercado multiplataforma (Tizen + webOS) evitam persistir o catálogo inteiro e usam portal, lista enxuta ou carga em etapas.
- [INFERÊNCIA] A regra do webOS ("considere que os dados podem não estar lá") é a mesma postura que o ccplayTv já adota: catálogo parcial é o estado normal (ADR-002, emenda da feature 010). Reforça a ideia de tratar o IndexedDB como algo que pode ser despejado, e não como garantia.

### Gaps
- Nenhuma documentação LG sobre a cota de **IndexedDB** em webOS TV (só localStorage e DB8). Seria necessário medir com `navigator.storage.estimate()` num aparelho.
- A resposta do fórum é de 2023. Versões mais recentes do webOS (24/25) podem ter mudado esses números.
