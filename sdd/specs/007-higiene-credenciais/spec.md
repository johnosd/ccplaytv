# Feature 007: Higiene de Credenciais e Políticas de Rede\n\n**Status**: Converged\n

## 1. Objetivo
Garantir que segredos (usuários, senhas, URLs com tokens) nunca sejam vazados em logs, telas de erro, ou exportações (FR-009). Com a arquitetura client-first (ADR-008), o app armazena credenciais no aparelho, tornando vital a blindagem de qualquer superfície de telemetria ou log. Além disso, padronizar o comportamento de rede (User-Agent fixo e prevenção SSRF).

## 2. Escopo
- Criar o helper `sanitizeError(error, context)` para o frontend.
- Aplicar o helper em todos os `console.error`, `console.log` e exibições na interface (ex: toasts ou telas de erro fatal).
- Assegurar a higiene no código legado da `api/` (se necessário).
- Consolidar as requisições (`fetch`) do `importPipeline` e `xtreamConnector` para emitir o `User-Agent` de player padrão, contornando bloqueios de firewall de provedores.

## 3. Não Faz Parte do Escopo
- Mudança na forma como as senhas são armazenadas localmente no Dexie.
- Remoção total de logs (o objetivo é higienizar, não silenciar debug).

## 4. Decisões Arquiteturais e Restrições
- A limpeza de credencial será feita por regex mascarando `username=*`, `password=*` e URLs HTTP contendo Basic Auth (`http://user:pass@host`).
- Em falha severa, o erro redigido deve ainda prover contexto suficiente ("Falha na requisição para Xtream").

## 5. Critérios de Aceite
- Exceções e erros HTTP (404, 500) do Xtream não emitem credencial na tela ou no console.
- A função de log higienizado possui cobertura de 100% de testes unitários para múltiplos cenários maliciosos.
- Todo fetch do conector envia um User-Agent predefinido (ex: `VLC/3.0.0`).

