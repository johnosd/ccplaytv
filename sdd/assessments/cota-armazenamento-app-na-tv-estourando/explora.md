# Assessment Explora: Cota de armazenamento do app na TV estourando

- **Slug**: cota-armazenamento-app-na-tv-estourando
- **Criado**: 2026-10-17
- **Origem**: texto colado + [Filesystem API (Samsung)](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/filesystem-api.html)

## Ideia Bruta

O app passa com frequência do limite de ~80 MB de armazenamento na TV, e daí vem `QuotaExceededError`. A ideia é
aumentar esse limite ou achar outra saída na documentação da Samsung (Filesystem API) ou no GitHub.

É a "feature própria de orçamento de armazenamento" que o usuário pediu em 2026-10-18, no bug
`sdd/bugs/armazenamento-app-cheio-na-tv-impede` (adendo do assessment).

## Evidência a Favor

**O problema é real e foi medido:**
- Na TV de referência, Sobre & créditos mostrou **"82,1 MB de 80 MB"**, com **1,27 GB livres** no aparelho
  (bugs `armazenamento-app-cheio-na-tv-impede` e `armazenamento-cheio-ao-entrar-sries-espao`). Logo, o limite é uma cota
  do motor web e não falta de disco.
- Já houve impacto real: licença paga sem chegar à TV, falha ao desvincular, e STO-01 ao abrir séries e favoritos.
- O bugfix só contorna: a pré-carga para em ~72 MB, e há liberação de emergência (EPG e cache da lista ativa) para
  gravações críticas. O teto continua o mesmo.

**O volume dos dados medidos já se aproxima da cota:**
- Listagens Xtream de uma lista real: filmes 17,6 MB + séries 9,8 MB + canais 0,8 MB ≈ **28 MB de JSON**, com cerca de
  55 mil itens (`sdd/bugs/abrir-app-nao-atualiza-todas-categorias/assessment.md`).
- EPG de uma lista: **15 MB de XMLTV**, cerca de 41 mil programas (`sdd/bugs/epg-nao-atualiza-depois-primeira-carga`).
- Uma lista M3U real do usuário tem **78,4 MB** (`sdd/specs/001-importacao-fonte-m3u/plan.md` R-009). Ela vai para
  `storedEntries` e sozinha praticamente enche a cota.
- O app aceita várias listas (ADR-011, perfil = lista), e cada uma tem o próprio cache.

**Caminho 1: aumentar a cota.** Não há evidência de que funcione:
- `http://tizen.org/privilege/unlimitedstorage` já está no `config.xml`, mas a medição mostra 80 MB.
- A página de [APIs W3C/HTML5 da Samsung](https://developer.samsung.com/smarttv/develop/api-references/w3chtml5-api-references.html?device=htv)
  cita o privilégio para IndexedDB, mas não diz o que ele faz nem dá números.
- Um [fórum do Tizen](https://developer.tizen.org/forums/web-application-development/how-use-unlimited-web-storage-indexeddb-websql-localstorage-on-tizen-web-application)
  de 2013 relata o mesmo efeito nulo.
- A tabela de [especificações do motor web](https://developer.samsung.com/tv/develop/specifications/web-engine-specifications)
  marca **Quota Management API: No**, então não há como pedir mais cota.
- Não há atalho documentado para elevar a cota do IndexedDB numa TV Samsung.

**Caminho 2: Filesystem do Tizen, que a própria Samsung recomenda:**
- O guia [Using Web Storage](https://developer.samsung.com/smarttv/develop/guides/data-handling/using-web-storage.html)
  diz: *"The Web storage can only store up to 5 MB… If you need to store larger amounts, use the file system."*
- O guia [Managing File Operations](https://developer.samsung.com/smarttv/develop/guides/data-handling/managing-file-operations.html)
  vale para TV e Signage. Pede os privilégios **públicos** `filesystem.read` e `filesystem.write`.
- A raiz `wgt-private` é privada do app e é apagada na desinstalação.
- `wgt-private-tmp` é apagada ao fechar o app.
- Nenhuma das duas páginas menciona cota.
- A [Filesystem API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/filesystem-api.html)
  (5.0+) tem `openFile`, `FileHandle` com `readString`/`writeString`, `readData`/`writeData` e
  `readBlob`/`writeBlob` (com variantes `NonBlocking`), além de `listDirectory`, `deleteFile` e `deleteDirectory`.
- A TV de referência roda Tizen 9.
- **ASSUMPTION**: a `wgt-private` grava pelo plugin de Device API direto no diretório do app e fica fora do gerenciador
  de cota do Chromium. Seria limitada pelo disco (~1,2 GB livres) e não pelos 80 MB. **Nenhuma fonte confirma isso**, e
  só um teste na TV prova.

**Caminho 3: gastar menos, com o mesmo IndexedDB:**
- Cada item do bloco guarda o `directUrl` inteiro (`db.ts` `CatalogRecord.directUrl`). Num provedor Xtream essa URL é
  `dns/tipo/usuário/senha/id.ext`, a mesma para todos menos o id.
- **ASSUMPTION**: ela pode ser montada na hora, a partir da fonte, e deixar de ocupar ~50–80 bytes × 55 mil itens por
  lista.
- O app não usa `CompressionStream` no armazenamento, só para baixar o EPG. O Chromium 120 suporta gzip/deflate nativos.
- **ASSUMPTION**: comprimir os blocos (JSON com chaves repetidas) reduziria o tamanho em 3–5×. Não foi medido.
- Ao ser lido, o EPG pode ficar restrito a uma janela (por exemplo, agora + 24 h) em vez do arquivo inteiro.
- Hoje cada lista guardada mantém o próprio cache. Com uma regra de **só a lista ativa tem cache completo**, o pico fica
  em uma lista e não em N.

## Evidência Contra

- **O Filesystem não é transacional nem indexado.** Hoje os leitores de `lib/catalog` dependem de consultas do Dexie
  (índices, gerações, `categoryBlocks` lidos pelo repositório). Levar os blocos para arquivos exigiria:
  - uma camada própria de leitura e gravação atômica (gravar num temporário e renomear);
  - um índice próprio;
  - garantir consistência entre o IndexedDB, onde ficam as categorias, e os arquivos.

  É uma mudança de arquitetura e precisa de ADR, porque o ADR-002/ADR-008 fazem do IndexedDB a fonte da verdade.
- **Não há dev desktop nem testes.** `tizen.filesystem` não existe no navegador do PC nem no jsdom. Seria preciso um
  adaptador com duas implementações, como o `PlayerService` (AVPlay/`<video>`): IndexedDB ou OPFS no PC e Tizen FS na TV.
  A paridade só pode ser provada na TV física, e o emulador está bloqueado.
- **A cota da `wgt-private` não foi medida.** Ela pode ter limite próprio, ou entrar na mesma contagem do aparelho.
  Hoje é um caminho caro em cima de uma ASSUMPTION.
- **Revisão da loja:** dois privilégios novos (`filesystem.read`/`write`) entram no gate da 078 e no UI Description.
  São públicos, mas mudam o pacote já preparado para o Seller Office.
- **Comprimir custa CPU.** Na TV, gzip num Worker é barato. Na thread principal, compete com a navegação (constitution:
  foco nunca trava). Ler "Todos" (feature 039, leitura progressiva) teria de descomprimir vários blocos.
- **Gastar menos não elimina o teto.** Uma lista M3U de 78 MB, ou um provedor com 300 mil filmes (estresse da 039),
  pode não caber em 80 MB mesmo comprimida. ASSUMPTION: nesses casos sobra o modo sob demanda, sem cache completo.
- **Mesmo com cota maior, a pré-carga da 038 cresce até preencher o espaço.** Sem um orçamento explícito, só se adia o
  problema.
- **GitHub:** não foi achado código público do `chromium-efl` ou do Tizen que explique ou contorne a cota de 80 MB.
  Nenhuma solução pronta encontrada.

## Perguntas em Aberto

- Quantas listas, e de que tamanho, o app precisa suportar ao mesmo tempo sem perder dados? Isso define a meta.
- Gravar em `wgt-private` escapa da cota de 80 MB? Um *spike* na TV física (gravar 150 MB e ler de volta) responde,
  e a instalação só ocorre com permissão do usuário.
- Quanto cada tabela ocupa de fato hoje (`categoryBlocks`, `storedEntries`, `epgPrograms`, `titleMetadata`)? Medir antes
  de escolher o caminho.
- Quanto reduzem a compressão e a URL derivada nos blocos reais? Dá para medir no PC, sem TV.
