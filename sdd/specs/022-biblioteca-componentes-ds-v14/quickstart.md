# Quickstart — verificação manual da feature 022

Esta feature não tem tela real pra "ver" — os 16 componentes são
verificados isolados. Por isso o roteiro abaixo é sobretudo automatizado;
a parte manual é revisão de código (SC-003) e uma checagem de teclado no
navegador usando os próprios testes como harness.

## Pré-requisitos

- `tv-web/`: `npm install` feito (nenhuma dependência nova é esperada).
- Nenhum servidor precisa estar rodando para os passos 1–3. O passo 4
  (Polish) precisa de `npm run dev` de pé, só para `npm run test:e2e`.

## 1. Checagens automatizadas (em `tv-web/`)

```powershell
npx tsc -b
npm run lint
npx vitest run src/components/Modal.biblioteca-componentes.contract.test.tsx src/components/EmptyErrorState.biblioteca-componentes.contract.test.tsx src/components/Rail.biblioteca-componentes.contract.test.tsx src/components/ContentCard.biblioteca-componentes.contract.test.tsx
npx vitest run
..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 022-biblioteca-componentes-ds-v14   # da raiz do repo
```

Esperado: 5/5 contratos verdes, suíte completa sem regressão (comparar com
o baseline da feature 021: 858 passed, mesmas flakes conhecidas sob
paralelismo).

## 2. SC-003 — nenhum valor literal (revisão de código)

```powershell
# Da raiz de tv-web/src/components e tv-web/src/styles/components.css:
# procurar cor hex, px de raio/espaçamento fora de var(--...), fora de
# comentário. Qualquer resultado fora de um comentário é uma falha de SC-003.
Select-String -Path src\components\*.tsx, src\styles\components.css -Pattern '#[0-9a-fA-F]{3,6}\b' | Where-Object { $_.Line -notmatch '//|/\*' }
```

Esperado: nenhuma ocorrência fora de comentário/exemplo de teste com URL
fictícia (`http://exemplo.test/...` não é cor, ignorar falso positivo se
aparecer).

## 3. Componente por componente (SC-001) — teclado no navegador

Sem tela real, a forma mais fiel de "ver" o comportamento de teclado é
rodar os testes em modo watch com `--ui` (interface do Vitest) e inspecionar
a árvore renderizada de cada teste, ou criar temporariamente (sem commitar)
uma página local que importa e monta um componente à mão:

```powershell
npx vitest --ui src/components
```

Abra a UI (URL impressa no terminal), rode `Modal.biblioteca-componentes.
contract.test.tsx` e `EmptyErrorState...`/`Rail...`/`ContentCard...`, e
inspecione o DOM renderizado de cada asserção pela aba de preview do
Vitest UI — confirma visualmente a estrutura sem precisar de uma tela do
app.

Itens a conferir manualmente por leitura do DOM renderizado:

- `Modal`: `role="dialog"`, `aria-modal="true"`, `aria-label` presente.
- `EmptyState`/`ErrorState`: o `<button>` da ação tem texto legível, o
  código (`ErrorState`) aparece discreto (classe/estilo menor).
- `ContentCard`: a `<img>` interna é exatamente a do `PosterArt`
  (`class="poster-box-art"`), nunca uma segunda imagem.
- `Rail`: os itens fora da janela virtual não têm nó no DOM (confirmar via
  `container.innerHTML` no teste, já feito pelo contrato).

## 4. Polish — regressão completa

```powershell
npm run dev            # outro terminal
npm run test:e2e       # nenhuma tela mudou; deve dar o mesmo resultado da feature 021
npm run build:tizen    # guarda D-009 (feature 021) continua valendo — nenhum arquivo novo deveria escapar dela
```

Comparar com o registro da feature 021 (`sdd/specs/021-fundacao-visual-ds-
v14/tasks.md`, Fase 8): mesmos scripts passando, mesma falha conhecida em
`e2e.mjs` (bug pré-existente, fora de escopo).

## 5. TV física

Não aplicável nesta feature — nenhuma superfície nova aparece na TV
(nenhum componente é consumido por nenhuma tela ainda). A verificação real
em hardware fica para a Onda 2 (feature 023), quando Live TV de fato passar
a usar `SideCategoryNav`/`ContentCard`/`Rail`.
