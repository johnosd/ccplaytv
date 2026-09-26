# ADR-010: URL completa de fonte e arquivo M3U podem ser armazenados no aparelho

## Status

Aceita. Atualiza a ADR-008 (Decisão, item 2; Consequências Negativas,
primeiro item), estendendo a exceção de segredo no aparelho.

## Data

2026-09-24.

## Contexto

A ADR-008 abriu uma exceção consciente ao princípio "Segredos Fora dos
Clientes e dos Logs": a **credencial de provedor** (endereço, usuário,
senha) pode morar no aparelho, porque sem backend o cliente precisa dela
para se reautenticar. A constitution (v1.2.0 em diante) registrou essa
exceção e foi explícita no resto: "URL completa de fonte continuam
proibidas no cliente, sem exceção".

Três fatos tornaram essa redação insustentável:

1. **O app já guarda a URL completa hoje.** Uma fonte cadastrada por URL
   M3U grava a URL em `SourceRecord.m3uUrl`
   (`tv-web/src/lib/catalog/sourceRepository.ts`), e o caminho de
   importação M3U grava a URL de reprodução de cada item em
   `CatalogRecord.directUrl` (`importPipeline.ts`, `keepUrl`). Não existe
   outro jeito de uma fonte por URL funcionar sem backend: a URL é o único
   dado que a pessoa informa. Numa lista de painel IPTV
   (`…/get.php?username=…&password=…`), essa URL e cada URL de item
   embutem o usuário e a senha. A proibição estava sendo violada desde a
   feature 005, sem registro.
2. **A feature `014-m3u-sob-demanda` precisa guardar o arquivo M3U
   baixado**, para ler as categorias na importação e os itens de cada
   categoria só quando a pessoa entra nela, sem baixar a lista de novo.
   Numa lista de painel, esse arquivo repete a credencial em cada entrada
   (centenas de milhares de vezes numa lista grande).
3. **O código evitava guardar URL de propósito num caso só**: no "Modo
   limitado" (fonte de provedor que caiu no caminho M3U), os itens guardam
   só o identificador e a extensão, nunca a URL
   (`xtreamConnector.ts`, comentário sobre `parseXtreamStreamUrl`:
   "Guardá-la espalharia a senha por milhares de registros"). Essa cautela
   não reduzia a exposição real, porque a mesma fonte guarda a senha em
   `providerPassword` no mesmo banco.

O ponto técnico que decide: **quem consegue ler o IndexedDB do app já tem
a credencial**, esteja ela guardada uma vez (campo da fonte) ou repetida em
cada linha de um arquivo. Repetir o mesmo segredo no mesmo armazenamento
não dá a um atacante nada que ele já não tenha. O risco real está nas
**saídas**: log, tela, mensagem de erro, envio a terceiros, exportação.

Decisão pedida pelo usuário em 2026-09-24, durante o planejamento da
feature 014.

## Decisão

A exceção da ADR-008, item 2, passa a cobrir, além da credencial de
provedor:

- a **URL completa de uma fonte** (inclusive com usuário e senha na query
  ou no caminho);
- a **URL de reprodução de cada item** que a fonte fornece;
- o **conteúdo do arquivo M3U baixado**, guardado inteiro ou já separado
  por categoria.

Todos esses **PODEM ser armazenados no aparelho** (IndexedDB), sob as
mesmas mitigações que já valem para a credencial, que continuam
obrigatórias e se aplicam a todos eles:

- **nunca** em log, diagnóstico ou telemetria (a sanitização da feature
  007, que mascara `username=`/`password=` e `user:pass@`, continua sendo a
  rede de segurança, não a primeira defesa);
- **nunca** exibidos em tela, cartão, aviso ou mensagem de erro — a
  interface mostra o nome da fonte e, no máximo, o host, nunca a URL
  inteira;
- **nunca** enviados a terceiros (TMDB, OpenAI ou qualquer outro serviço);
- **nunca** incluídos em canal de exportação ou backup;
- descartados junto com a fonte ou com a geração a que pertencem — nada
  fica para trás depois de remover a fonte.

"Expor", nesta ADR, significa **permitir guardar no aparelho**. Não
autoriza mostrar a URL na interface.

## Alternativas Consideradas

### Manter a proibição e guardar só o conteúdo sem URL

- Guardar o arquivo já interpretado, sem a URL de cada item: só
  identificador, tipo e extensão (como o Modo limitado faz hoje), e
  remontar a URL na hora de reproduzir.
- **Rejeitada:** só funciona para listas de painel Xtream, em que a URL
  pode ser remontada a partir do identificador e da credencial. Uma lista
  M3U avulsa não tem identificador: a URL é o único dado de reprodução, e
  sem ela o item não toca. Além disso, a fonte continuaria guardando a
  própria URL completa em `m3uUrl` — a proibição seguiria violada no mesmo
  banco.

### Criptografar URL e arquivo no IndexedDB

- Cifrar o conteúdo antes de gravar.
- **Rejeitada:** a chave teria de ficar no próprio aparelho, ao alcance de
  quem lê o IndexedDB — mesma exposição, com custo de desempenho na
  importação de listas grandes (o problema que a 014 existe para
  resolver) e sem ganho real de segurança.

### Baixar a lista de novo a cada categoria, sem guardar

- Nunca guardar o arquivo; baixar a URL a cada primeira entrada numa
  categoria.
- **Rejeitada** na avaliação da feature 014
  (`sdd/assessments/import-m3u-por-url-le-tudo/decision.md`): cada
  categoria nova custaria quase um download inteiro, e a fonte continuaria
  guardando a URL completa de qualquer forma.

## Consequências

### Positivas

- A documentação volta a descrever o que o app faz: a fonte por URL M3U
  deixa de ser uma violação silenciosa da constitution.
- A feature 014 pode guardar o arquivo M3U e ler cada categoria sob
  demanda, sem novo download.
- O Modo limitado pode passar a guardar a URL de cada item, se isso
  simplificar o código (a cautela antiga deixa de ser obrigatória, mas não
  precisa ser desfeita).

### Negativas

- **O segredo fica repetido no aparelho**, potencialmente centenas de
  milhares de vezes numa lista grande. Não aumenta a exposição para quem
  lê o armazenamento (a senha já está lá), mas aumenta a superfície de
  código que manipula texto com credencial: qualquer caminho novo que
  trate uma linha do arquivo ou uma URL de item precisa das mesmas
  mitigações. Isso é aceito conscientemente e cobrado em toda feature que
  tocar nesses dados.
- Um erro ao exibir ou registrar uma linha do arquivo vaza a credencial.
  A sanitização da feature 007 continua como rede de segurança, mas não
  substitui não passar esses dados para superfícies de saída.
- **Ferramentas de depuração** (Web Inspector da TV, DevTools do
  navegador) mostram o IndexedDB inteiro, inclusive o arquivo. Isso já era
  verdade para a senha; continua aceito no desenvolvimento.

### Caminho de Migração / Evolução Futura

Revisitar esta ADR se:

1. o produto passar a ter **exportação, backup ou sincronização** de
   dados entre aparelhos — esses canais precisam excluir URL, arquivo e
   credencial por construção, não por filtro;
2. a distribuição comercial exigir **armazenamento seguro** oferecido pela
   plataforma (algo equivalente a um cofre de credenciais no Tizen) — nesse
   caso, credencial e URL passam a morar lá, e o arquivo guardado passa a
   ser salvo sem as URLs, remontadas na hora de reproduzir;
3. surgir um **incidente de vazamento** por log ou tela — a resposta é
   reforçar a sanitização nas saídas, não voltar a proibir o
   armazenamento.

A constitution (princípio "Segredos Fora dos Clientes e dos Logs",
exceção ADR-008) precisa de emenda correspondente: hoje ela ainda diz que
a URL completa de fonte é proibida no cliente, sem exceção.
