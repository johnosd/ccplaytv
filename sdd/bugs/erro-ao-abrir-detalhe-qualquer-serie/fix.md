# Bug Fix: Erro ao abrir detalhe de qualquer série

- **Slug**: erro-ao-abrir-detalhe-qualquer-serie
- **Corrigido**: 2026-10-10
- **Assessment**: assessment.md
- **Status**: partial

## Summary
Instrumentação visível instalada no código para coletar a falha na TV, conforme solicitação do usuário. A causa original não foi reproduzida nem corrigida ainda.

## Changes
| Arquivo | Alteração |
| --- | --- |
| lib/diagnostics/seriesDiagnostics.ts | Buffer em memória de 8 eventos, estágios fixos e classificação segura; hook de acompanhamento das consultas. |
| components/DiagnosticReport.tsx; styles/screens.css | Painel traduzido fotografável com código SERIES-DIAG-01. |
| components/RouteBoundary.tsx; navigation/lazyRoute.ts | Captura sanitizada de falha de módulo/render, mantendo retry e RETURN. |
| features/series/SeriesDetailScreen.tsx | Etapas de abertura/consultas; painel nos estados de carregamento, ausente, vazio e falha. |
| lib/i18n/messages/errors.ts | Textos pt/en/es. |

## Tests Added or Updated
Sanitização com credenciais sintéticas e URL, código React/posição local, limite e assinantes, erro com getter inválido; integração de falha renderizada e RETURN. Playwright no pacote final com falha sintética do módulo de detalhe, painel inteiro no viewport e RETURN ao catálogo.

## Local Verification
121 testes / 13 arquivos passaram. Lint passou com avisos herdados e sem violações arquiteturais. build:tizen passou (TypeScript, guard de assets e exclusão do demuxer). Playwright do painel: 4/4 verificações passaram; fotografia em evidencias/diagnostico-painel.png. Suíte E2E completa em andamento, resultado final será registrado em test.md.

## Deviations from Assessment
Nenhuma expansão de escopo de produção. Removida a opção de bypass CORS do utilitário de diagnóstico: revisão automática rejeitou a execução e o usuário preferiu logs visíveis na TV. Bypass nunca executado. Ajustadas linhas em branco para respeitar o teto arquitetural existente, sem elevar baseline.

## Follow-ups
Instalar com assinatura existente, sem desinstalar. Usuário abre uma série e envia fotografia da mensagem e do painel. Manter bug aberto para análise dessa evidência. Ponto de commit sugerido após captura/validação; nenhum commit realizado.

## Reabertura — expansão fundamentada pela fotografia

A fotografia aponta desfecho tratado, não erro de render. Edição interrompida para reavaliar: assessment.md recebeu reabertura e escopo explícito de seriesLoader/testes e classificações. Continuação da fase Fix para coletar a causa descartada pelo loader, sem hipótese de correção ainda.

## Fix — iteração SERIES-DIAG-02

Aplicadas etapas internas em seriesLoader (série ausente, credencial, geração, obtenção e gravação). Exceção classificada antes de virar failed/stale-served. Motivos de ProviderError permitidos e status HTTP da mensagem local de ProviderIncompatibleError; classes de IndexedDB permitidas. Mensagens brutas continuam descartadas. Preservados resultados e fallback offline.

136/136 testes em 14 arquivos passaram; lint passou com avisos herdados. build:tizen passou. Playwright com recusa 401 de provedor fictício reproduziu o mesmo estado da foto e aprovou 5/5 verificações (motivo visível, sigilo, versão 02, painel inteiro e RETURN). Falha inicial na aplicação do patch detectada e corrigida antes do build aprovado; nenhuma versão com falha de testes foi instalada. Suíte E2E afetada em andamento.

## Reavaliação antes da correção de quota

A foto DIAG-02 fundamenta expansão explícita do escopo para configuração de armazenamento e reason/UI; assessment.md registra diagnóstico e arquivos. A regra operacional tizen-tv de não alterar configuração para fazer um passo passar não é usada como atalho: instalação já passava, a mudança corrige privilégio documentado do recurso usado pelo app. Sem exclusão de dados.

## Fix — quota / SERIES-DIAG-03

CCPlayTv/config.xml agora declara o privilégio público http://tizen.org/privilege/unlimitedstorage, documentado pela Samsung para IndexedDB. A foto confirma quota durante gravação, mas falta de espaço físico não foi medida; omissão do privilégio é a hipótese corrigida, sujeita a confirmação no aparelho.

seriesLoader preserva o motivo storage_full ao tratar StorageFullError; catalogApi o repassa; SeriesDetailScreen usa mensagem existente STO-01 e mantém retry/RETURN. Sem limpeza, alteração de banco, mudança de identidade ou fallback em memória.

141/141 testes em 15 arquivos passaram, incluindo rollback de quota na primeira gravação e na renovação e mensagem focável. Lint e build:tizen passaram; XML parseado e privilégio conferido. Playwright no pacote final: quota injetada no método nativo antes de o Dexie capturá-lo (apenas no teste), 8/8 checagens passaram: motivo, sigilo, versão, layout, título/código STO-01, retry abre detalhe após escrita voltar e RETURN. Tentativa inicial de injeção posterior à abertura do banco não reproduziu quota devido à captura do método pelo Dexie; roteiro corrigido, sem modificação de produção para testes.

Gate completo novamente em andamento. Não marcar verified antes do usuário confirmar abertura na TV com o pacote corrigido.
