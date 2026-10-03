# Quickstart — feature 046 (memória de foco e key repeat)

## Pré-requisitos

- `npm run dev` em `tv-web/` (reiniciado antes de rodar E2E — um dev server de horas fica instável).
- Dados fictícios apenas (E2E sobe o próprio servidor de fixture); a lista real só nos itens manuais, com `.env` na raiz.

## Checagens automatizadas

```powershell
# de tv-web/
npx vitest run src/features/catalog/catalogApi.key-repeat.contract.test.tsx src/features/live/liveSessionMemory.memoria-foco.contract.test.ts src/features/live/LiveScreen.memoria-foco.contract.test.tsx   # 5/5
npx vitest run src/features/catalog/catalogApi.test.tsx src/lib/focus
npx tsc -b ; npm run lint ; npm run build
node e2e/memoria-foco-key-repeat.mjs      # ou: npm run test:e2e
# da raiz
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 046-memoria-foco-key-repeat
```

## Cenário ponta a ponta (navegador)

1. Abrir Live TV numa lista com ≥ 30 categorias. Segurar ↓ na trilha por todas: o painel de rede não mostra requisições de categoria durante a rajada; ao soltar, **uma** (a categoria parada).
2. Tocar ↓ uma vez e esperar 300 ms: o prefetch da categoria acontece (sem regressão).
3. Entrar numa categoria, descer 5 canais, voltar à trilha, ir a outra categoria e voltar: o foco está no 5º canal. Repetir em ★ Favoritos e Todos.
4. Tocar um canal em "Todos", OK (abre a lista), RETURN (fecha só a lista), ↓ (próximo canal), RETURN até fechar o player: foco em "Todos" no canal que tocava.
5. Excluir a lista e cadastrar de novo: a memória começa vazia (1º item).

## Itens que só a TV prova (recomendado, não é gate)

- A TV entrega `KeyboardEvent.repeat` nas setas ao segurar? (R-001) Ligar `VITE_CCPLAY_PERF=1` não é necessário: basta o painel de rede/`PerfOverlay` ou observar que a trilha não dispara buscas ao segurar ↓ numa lista real grande.
- SC-006: segurar ↓ na trilha de uma lista real grande não degrada a fluidez.
- Fechar o player depois de CH± devolve o foco ao canal certo.

## Checklist de pré-aceite (constitution)

- [ ] Foco visível em todo estado (vazio/erro/carregando) após restaurar.
- [ ] Focar/restaurar não toca nem consulta (FR-016).
- [ ] Nada de credencial/URL em memória, log ou UI.
