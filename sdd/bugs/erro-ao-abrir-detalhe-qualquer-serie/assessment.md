# Bug Assessment: Erro ao abrir detalhe de qualquer série

- **Slug**: erro-ao-abrir-detalhe-qualquer-serie
- **Criado**: 2026-10-10
- **Origem**: relato do usuário na TV física
- **Veredito**: likely valid, needs reproduction
- **Severidade**: high

## Report
Qualquer série apresenta erro ao entrar no detalhe. Esperado: detalhe e episódios navegáveis.

## Symptom
Falha relatada na TV; mensagem original ainda indisponível.

## Reproduction
115 testes de séries e E2E serie-foco-episodios passaram. Playwright com lista real de .env abriu dois títulos (8 e 24 episódios), sem pageerror. Pacote com provedor simulado também passou. Tentativas de importação do pacote com origem diferente falharam por rede/CORS, sem comprovar a causa da TV. Console da TV indisponível.

## Suspected Code Paths
RouteBoundary, lazyRoute e SeriesDetailScreen: carregamento do módulo, consulta local, episódios e renderização.

## Root Cause Hypothesis
Sem evidência suficiente para atribuir causa. Necessário capturar classe e posição do erro na TV.

## Proposed Remediation
Usuário autorizou explicitamente instalar diagnóstico visível, em substituição ao diagnóstico com proteções do navegador desativadas (não autorizado e não executado). Painel automático nas falhas e carregamento de séries; buffer em memória limitado, somente etapas fixas, classes permitidas, códigos React e posições de arquivos locais conhecidos. Nenhuma mensagem bruta, URL, identificador de lista ou credencial.

**Files likely to change**: tv-web/src/lib/diagnostics/seriesDiagnostics.ts e .test.ts; tv-web/src/components/DiagnosticReport.tsx e .test.tsx; tv-web/src/components/RouteBoundary.tsx e .test.tsx; tv-web/src/navigation/lazyRoute.ts; tv-web/src/features/series/SeriesDetailScreen.tsx; tv-web/src/lib/i18n/messages/errors.ts; tv-web/src/styles/screens.css; utilitários de evidência desta pasta.

**Tests to add or update**: sanitização e limite do buffer, assinatura de erro e arquivo local, painel na fronteira de erro, navegação SELECT/RETURN existente. Lint, build e E2E antes da instalação.

## Risks & Considerations
Não confundir instrumentação com correção do sintoma. Preservar dados e assinatura na TV. Logs não persistidos nem enviados. Preservar alterações em andamento da feature 069.

## Open Questions
A causa permanece aberta; o usuário determinou coleta por fotografia e autorizou prosseguir com essa instrumentação sem nova confirmação.

## Reabertura — fotografia da TV (2026-10-10)

Sintoma confirmado (valid, high): tela “Não foi possível carregar os episódios desta série”; SERIES_QUERY ready e EPISODES_QUERY failed. Não é falha da fronteira de renderização. O desfecho failed pode vir de série/credencial/geração ausente ou exceção tratada em fetchAndStore. A primeira instrumentação acompanhava a consulta, mas não o erro convertido em desfecho.

Remediação desta iteração: instrumentar os retornos e etapas internos de seriesLoader antes do descarte da exceção; adicionar classificações fixas para ProviderError.kind e erros de IndexedDB. Sem mudar rede, autenticação ou persistência com base apenas nesta foto.

Files likely to change (escopo adicional desta iteração): tv-web/src/lib/catalog/seriesLoader.ts e seriesLoader.test.ts; tv-web/src/lib/diagnostics/seriesDiagnostics.ts e seriesDiagnostics.test.ts; evidências e documentos deste bug.

Tests to add or update: falha de rede/provedor versus gravação, credencial/geração ausentes; logs sem segredos e desfechos/fallback preservados. Usuário mantém autorização para investigação e instalação contínuas; pendência de causa não exige nova escolha de produto.

## Reabertura — quota confirmada na TV (2026-10-10)

A segunda fotografia mostra CREDENTIAL_READ ready, GENERATION_READ ready, EPISODES_FETCH ready e EPISODES_STORE failed | StorageFullError. A falha de quota é confirmada na gravação; rede e autenticação passaram nessa tentativa. A quantidade de espaço físico livre não foi medida.

Diagnóstico do pacote: CCPlayTv/config.xml omite http://tizen.org/privilege/unlimitedstorage. Samsung lista esse privilégio público para IndexedDB: https://developer.samsung.com/smarttv/develop/api-references/w3chtml5-api-references.html (consultado nesta sessão). A omissão é candidata fundamentada ao limite por app, sem afirmar que o disco físico está cheio.

Proposed Remediation: declarar o privilégio próprio de IndexedDB e propagar reason: storage_full para a UI exibir STO-01, preservando transações, catálogo e estado pessoal. Sem limpeza automática, mudança de esquema, fallback em memória ou desinstalação.

Files likely to change: CCPlayTv/config.xml; tv-web/src/lib/catalog/seriesLoader.ts e seriesLoader.test.ts; tv-web/src/features/catalog/catalogApi.ts; tv-web/src/features/series/SeriesDetailScreen.tsx e seus testes; tv-web/src/lib/diagnostics/seriesDiagnostics.ts (versão 03); scripts de evidência e documentos do bug.

Tests to add or update: quota durante gravação preserva episódios existentes e fornece reason específico; erro de quota usa texto/código correto e mantém retry/RETURN. Validar XML e presença do privilégio no pacote assinado. Testes relevantes, lint/build e E2E antes da atualização. A correção declarativa é baseada na falha de armazenamento e documentação, não um desvio para contornar instalação rejeitada (que já funcionava).
