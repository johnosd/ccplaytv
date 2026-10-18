# Bug Assessment: Fixture antiga do catálogo em blocos acessa `block.items`

- **Slug**: fixture-antiga-catlogo-blocos-acessa-blockitems
- **Criado**: 2026-10-18
- **Origem**: falha observada no `node e2e/run.mjs --only catalogo-em-blocos`
- **Veredito**: valid
- **Severidade**: low

## Report

O cenário de downgrade da fixture antiga acessa `block.items` diretamente. Após a migração para `categoryBlocks` em `format: 2`, o registro é apenas um cabeçalho e os itens vivem em `categoryChunks`.

## Symptom

O cenário 2 falha com `TypeError: Cannot read properties of undefined (reading 'forEach')` ao reescrever blocos comprimidos como linhas legadas de `channels`.

## Reproduction

1. Iniciar o servidor Vite em `tv-web/`.
2. Executar `node e2e/run.mjs --only catalogo-em-blocos --jobs 1`.
3. Observar a falha em `downgradeAndSeedUserState` no acesso `block.items.forEach`.

## Suspected Code Paths

- `tv-web/e2e/catalogo-em-blocos.mjs:downgradeAndSeedUserState` — fixture abre o IndexedDB bruto e assume o formato antigo.
- `tv-web/src/lib/catalog/blockChunks.ts:readBlockChunks` — caminho oficial para reconstruir itens `format: 2`.
- `tv-web/src/lib/catalog/blockTypes.ts:CategoryBlockRecord` — documenta que `items` é opcional e ausente no formato comprimido.

## Root Cause Hypothesis

Confiança alta: a fixture foi escrita antes do formato 2 e não decodifica `categoryChunks` antes de iniciar a transação de downgrade.

## Proposed Remediation

**Preferida**: ler e decodificar cada bloco pelo repositório `readBlockChunks` antes de abrir a transação IndexedDB de escrita; manter `items` como fallback para fixtures de formato antigo. Depois reexecutar o cenário 2 e a suíte E2E do catálogo.

**Files likely to change**:
- `tv-web/e2e/catalogo-em-blocos.mjs`

**Tests to add or update**:
- cenário E2E de downgrade/migração do próprio `catalogo-em-blocos`.

## Risks & Considerations

- A leitura deve ocorrer fora da transação bruta de escrita, pois a decodificação é assíncrona.
- Não alterar dados de usuário sem preservar favorito, progresso, geração e ordem.
