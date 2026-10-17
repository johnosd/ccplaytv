# Bug Assessment: Guia EPG demorando para carregar na tela de progresso de importacao

- **Slug**: guide-epg-demorando-carregar-na-tela
- **Criado**: 2026-10-16
- **Origem**: texto colado
- **Veredito**: likely valid, needs reproduction
- **Severidade**: medium

## Report

Relato: "guide epg demorando para carregar, na tela import progress".

O relato nao informa lista/provedor, tamanho do XMLTV, tempo observado, se ocorreu em TV fisica ou navegador, nem se a lista ja podia ser aberta enquanto a linha Guia mostrava "Carregando".

## Symptom

Depois que a importacao da lista termina, a linha **Guia** da tela de progresso permanece em "Carregando" por tempo percebido como excessivo. O esperado e que a pessoa possa distinguir a importacao ja concluida da sincronizacao posterior do EPG e que essa sincronizacao tenha tempo mensuravel e aceitavel.

## Reproduction

1. Adicionar ou ressincronizar uma fonte que declare um XMLTV/EPG.
2. Aguardar a importacao estrutural chegar a "Concluida" na tela de progresso.
3. Observar a linha **Guia** e medir o intervalo ate `Pronto` ou `Falhou`; confirmar se **Abrir lista** ja esta disponivel durante esse intervalo.
4. Repetir em TV fisica com a mesma fonte, registrando tamanho do XMLTV, tipo de fonte e conectividade, sem registrar URL ou credenciais.

## Suspected Code Paths

- `tv-web/src/features/import/importApi.ts:263-305` - apos a importacao concluir, solicita `requestEpgSync` em segundo plano quando o EPG esta devido; importacao e guia sao deliberadamente desacoplados.
- `tv-web/src/features/import/ImportProgressScreen.tsx:124-143,227-229,274-309` - mostra a linha Guia como pendente, mas renderiza **Abrir lista** assim que a estrutura acaba; apenas a troca automatica de foco aguarda o guia se resolver.
- `tv-web/src/features/import/importSections.ts:68-101` - para uma sincronizacao desta importacao, mantem a linha em `loading` ate haver sucesso, falha ou indisponibilidade posteriores ao inicio do job.
- `tv-web/src/lib/epg/epgRunner.ts:39-91` - executa o EPG em Worker quando disponivel e cai para a thread principal se ele falhar; nao mede nem impoe prazo para fetch, parse e gravacao.
- `tv-web/src/lib/epg/epgSync.ts:68-97` e `tv-web/src/lib/epg/epgRepository.ts:57-100` - download do XMLTV, parse streaming e gravacao IndexedDB em lotes de 2.000 programas formam o intervalo percebido como "Carregando".
- `tv-web/src/App.tsx:101-112` - so ao fim da sincronizacao invalida `sources`/`epg`, permitindo a tela receber o estado terminal.

## Root Cause Hypothesis

**Confianca: medium.** A importacao acaba antes por desenho; o EPG e iniciado somente apos o `completion` da importacao e pode incluir download remoto, parse de XMLTV e escrita de muitos programas. A tela deixa a linha Guia em "Carregando" durante todo esse trabalho e nao expõe duracao, etapa interna ou criterio de aceitacao. O botao **Abrir lista** nao e bloqueado - isto foi confirmado pelo teste focal existente -, portanto ainda nao ha evidencia de regressao funcional nem de qual componente esta lento. Uma lista real recente de outro bug mediu XMLTV de 14,8 MB e 40.877 programas, suficiente para tornar essa etapa materialmente perceptivel; essa medida nao foi repetida para o relato atual.

## Proposed Remediation

**Preferida**: antes de alterar o fluxo, criar uma reproducao controlada que meca separadamente (a) conclusao da importacao estrutural, (b) inicio do pedido XMLTV e (c) estado terminal do guia, em navegador e depois na TV fisica. O roteiro deve usar uma fonte local ficticia com atraso e tamanhos conhecidos, preservar o requisito de que **Abrir lista** aparece ao fim da importacao e nao registrar URL, usuario ou senha. Com a medicao, decidir entre otimizar a etapa dominante ou deixar explicito, ja enquanto o guia roda, que a lista pode ser aberta e o guia continua em segundo plano.

**Alternativas**:
- Mostrar imediatamente a nota de trabalho em segundo plano enquanto Guia esta `loading`; melhora a compreensao, mas nao reduz download, parse ou escrita e nao deve ser chamada de correcao de performance sem medicao.
- Impor timeout fixo ao EPG; rejeitada por ora, pois pode transformar uma sincronizacao valida e lenta em falha e nao identifica a etapa responsavel.
- Abrir a lista automaticamente; rejeitada, pois contraria o comportamento atual que mantem a pessoa no progresso para ler avisos e exige decisao de UX separada.

**Files likely to change**:
- `tv-web/e2e/` - roteiro focal e servidor local de EPG com atraso/tamanho controlados para medir o intervalo.
- `tv-web/src/features/import/ImportProgressScreen.tsx` - somente se a medicao confirmar que falta comunicacao de que a lista ja esta utilizavel.
- `tv-web/src/features/import/ImportProgressScreen.secoes.test.tsx` - teste de regressao para lista disponivel durante EPG pendente e mensagem de fundo, se adotada.
- `tv-web/src/lib/epg/epgSync.ts` ou `tv-web/src/lib/epg/epgRepository.ts` - somente apos a medicao localizar fetch, parse ou IndexedDB como gargalo.

**Tests to add or update**:
- E2E focal com XMLTV local atrasado: registrar tempos `importacao concluida -> guia carregando -> guia terminal`, verificar **Abrir lista** antes do fim e ausencia de segredos no DOM/console.
- Se houver mudanca de UI, teste de componente nos tres idiomas cobrindo a explicacao durante `loading`, sem percentual ou duracao inventada.
- Se houver otimizacao, benchmark repetivel com tamanho de XMLTV proximo ao caso observado; navegador e TV fisica devem permanecer evidencias separadas.

## Risks & Considerations

- O EPG recente de uma lista real ja foi observado com 14,8 MB e 40.877 programas; otimizar apenas o render da tela nao reduz o custo de rede, parse ou IndexedDB.
- Worker ausente no pacote Tizen cai para a thread principal: Chromium pode aparentar fluidez que a TV fisica nao tera. Validacao em TV e obrigatoria antes de declarar ganho de performance.
- Logs, textos de erro e artefatos de benchmark nao podem conter URL de EPG ou credenciais.
- A arvore de trabalho contem alteracoes nao relacionadas, inclusive no backlog; esta fase deve preservar todas elas.

## Open Questions

- [NEEDS CLARIFICATION: quanto tempo a linha Guia permaneceu em "Carregando", em qual dispositivo e com qual tipo de fonte?]
- [NEEDS CLARIFICATION: durante o atraso, **Abrir lista** estava visivel e acionavel?]
- [NEEDS CLARIFICATION: o objetivo prioritario e reduzir o tempo real do EPG ou deixar claro que a lista ja pode ser usada enquanto ele carrega?]
