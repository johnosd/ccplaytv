# Tasks: 007-higiene-credenciais

## Phase 1: Utilitário de Sanitização e Logs
- [x] 1. Criar `tv-web/src/lib/logger.ts` com a regex de redação para mascarar padrões como `username=...`, `password=...`.
- [x] 2. Escrever `logger.test.ts` cobrindo strings simples, objetos complexos (JSON) e instâncias de `Error` contendo as queries maliciosas.

## Phase 2: Injeção pelo Código
- [x] 1. Atualizar `tv-web/src/lib/catalog/xtreamConnector.ts` para usar o helper de sanitização em falhas.
- [x] 2. Atualizar `tv-web/src/lib/catalog/importPipeline.ts` para que os erros que disparam toasts passem pelo `sanitize()`.
- [x] 3. Varrer o projeto buscando `console.log` e `console.error` abertos para substituir pelo `logger`.

## Phase 3: Validação de Headers
- [x] 1. Checar viabilidade técnica de sobrescrever User-Agent nas chamadas `fetchListDirect` (`clientUtils.ts`). Se possível, adicionar.
- [x] 2. Rodar suite de testes para verificar se nada foi quebrado pelas mudanças.

