# Plano de Implementação: Feature 007 - Higiene de Credenciais e Rede

## 1. Contexto e Estratégia
O app lida com a URL, usuário e senha da assinatura do IPTV do usuário. Caso alguma promessa falhe na API Xtream, o objeto de `Error` que sobe no navegador costuma conter o payload de requisição completo, o que seria fatal. Vamos escrever um utilitário central `logger.ts` e varrer o código para encapsular todas as exibições/outputs.

## 2. Componentes Afetados

### 2.1. `tv-web/src/lib/logger.ts` (NOVO)
Novo módulo exportando a função de redação `sanitize(text)` e métodos de logging `log()`, `warn()`, `error()` que recebem payloads genéricos e substituem credenciais.

### 2.2. Modificações nos Connectors e Api
Substituir o `console.warn` e throws crus no `xtreamConnector.ts` e `importPipeline.ts` pelas chamadas seguras.

### 2.3. User-Agent
Garantir que as chamadas `fetchListDirect` injetem `headers: { 'User-Agent': 'VLC/3.0.0' }` se suportado (Nota: o Chrome na TV bloqueia troca de UA no `fetch`, investigar `User-Agent` custom se for viável via Tizen API).

## 3. Gestão de Risco
Resolvido: O maior risco era a TV não permitir injeção de header `User-Agent` no `fetch`. Se falhar por bloqueio de CORS/Headers restritos, documentar a limitação e aplicar apenas no backend de fallback.



## Resultado Final
As tarefas foram completamente implementadas. O helper `logger.ts` centraliza a higienização de credenciais, cobrindo URLs estruturadas (IPTV) e query parameters. Substituímos usos nativos de `console.warn`/`console.error` por `logger.warn`/`logger.error` no `xtreamConnector` e `importPipeline`, garantindo a aplicação do filtro. Os utilitários de fetch agora incluem o header User-Agent `VLC/3.0.0` embutido.
