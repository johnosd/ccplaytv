# Bug Assessment: Armazenamento cheio em séries com espaço livre na TV

- **Slug**: armazenamento-cheio-ao-entrar-sries-espao
- **Criado**: 2026-10-11
- **Origem**: texto colado
- **Veredito**: valid
- **Severidade**: high

## Report

Entrar em séries informa armazenamento cheio, embora a TV mostre 1,27 GB livres. Após o usuário excluir o app, passou a 1,38 GB. Usuário solicita revisão e nova instalação, evitando testes extensos.

## Symptom

A interface afirma que todo o armazenamento do aparelho está cheio ao receber falha de quota do IndexedDB. A falha pode também impedir gravar favoritos.

## Reproduction

1. No aparelho com o catálogo carregado, abrir uma série e observar STO-01 (relato do usuário).
2. Comparar com espaço livre nas configurações da TV (relato: 1,27 GB).
3. Automatizado disponível: `seriesLoader.test.ts` simula `QuotaExceededError` na gravação de episódios.

## Suspected Code Paths

- `tv-web/src/lib/catalog/repository/shared.ts`: só converte nomes de erro de quota reconhecidos; não confunde exceção genérica com falta de espaço.
- `tv-web/src/lib/catalog/repository/series.ts`: quota na transação dos episódios vira `StorageFullError`.
- `tv-web/src/lib/i18n/messages/errors.ts`: STO-01 afirma que o aparelho inteiro está cheio sem essa evidência.
- `CCPlayTv/config.xml`: a árvore atual já tem adição local de `unlimitedstorage`, ausente no HEAD. Não há confirmação de que o pacote anteriormente instalado incluía essa permissão.

## Root Cause Hypothesis

Alta confiança no texto enganoso; média na quota padrão como causa no aparelho. Espaço físico livre não demonstra quota disponível ao app. A documentação oficial associa IndexedDB ao privilégio público `http://tizen.org/privilege/unlimitedstorage`. A permissão já presente será preservada e incluída no novo pacote. Não inventar quantidade de quota nem afirmar que foi medida na TV.

Fonte: https://developer.samsung.com/smarttv/develop/api-references/w3chtml5-api-references.html?device=htv

## Proposed Remediation

**Preferida**: manter a permissão já adicionada; conferir manifesto empacotado e instalar versão atual. Ajustar STO-01 para informar limite de armazenamento do aplicativo em pt/en/es, sem afirmar que o disco todo está cheio. Nenhuma limpeza automática de dados.

**Files likely to change**:
- `tv-web/src/lib/i18n/messages/errors.ts`
- `CCPlayTv/config.xml` (preservar mudança preexistente; não requer novo patch)
- Artefatos gerados por `build:tizen` em `CCPlayTv/`.

**Tests to add or update**:
- Reutilizar os dois testes de quota de `seriesLoader.test.ts`, sem suíte completa.
- Build com type-check e roteiro E2E dirigido de favoritos antes da instalação.

## Risks & Considerations

- Usuário já desinstalou; não executar nova desinstalação nem apagar dados restantes.
- Nova instalação não prova solução até reimportar lista e testar série/favorito no aparelho.
- A árvore contém alterações preexistentes de séries, diagnóstico e manifesto; preservá-las.

## Open Questions

- Pacote anterior e quota interna não foram inspecionados no aparelho. Confirmação física após instalação permanece necessária.
