# Quickstart: Limpeza e QA do DS V14 (feature 028)

## Pré-requisitos

- `tv-web/` com dependências instaladas (`npm ci`).
- `npm run dev` rodando (reinicie se estiver de pé há horas — nota da 022).
- No Windows, os scripts E2E precisam do override local do
  `executablePath` (os scripts usam o caminho fixo Linux quando existe).
- Para a passada física: skill `tizen-tv`, QN50Q60DAGXZD na rede, controle
  Samsung original.

## Checagens automatizadas

```powershell
cd tv-web
npx vitest run src/testing/accessibleNames.limpeza-qa-ds-v14.contract.test.tsx src/components/Icon.limpeza-qa-ds-v14.contract.test.tsx   # 3/3
npm run test
npx tsc -b
npm run lint
npm run build
npm run build:tizen      # guarda de arquivos emitidos: nada novo no tizen_web_project.yaml
cd ..
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 028-limpeza-qa-ds-v14
# SC-007: todas as travas do repositório, inclusive a 017
Get-ChildItem sdd\specs -Directory | Where-Object { Test-Path "$($_.FullName)\contract-tests.lock" } | ForEach-Object { .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug $_.Name }
```

E2E (dev server no ar):

```powershell
cd tv-web
node e2e/limpeza-qa.mjs                 # barras de rolagem + Início (US1)
node e2e/paridade-limpeza.mjs depois
node e2e/paridade-limpeza.mjs comparar  # só diferenças da lista INTENTIONAL
npm run test:e2e
node e2e/player-chrome.mjs
node e2e/filmes-series-ds-v14.mjs
```

## Cenário ponta a ponta (navegador)

1. **Filmes**: categoria com muitos filmes → nenhuma barra na trilha nem na
   grade; ↓ até o último item → a grade rola junto; → até a última coluna
   → nenhuma barra horizontal aparece.
2. **Início**: com "Continuar assistindo" e "Minha Lista" → sem faixa vazia
   grande embaixo; nenhum rail/card novo.
3. **Estados**: forçar erro de carga (fonte fora do ar) em Perfis, Live,
   Filmes, detalhe de série e player → "Tentar de novo"/"Voltar" respondem a
   OK.
4. **Ícones**: estrela/histórico da trilha, botões do chrome, dock do
   Início e ícones da Busca com o tamanho do token do contexto.
5. **Player sobre as telas**: abrir filme, episódio e canal → vídeo visível,
   nenhuma camada web por cima (regras do plano de hardware ainda valendo).

## Passada na TV física — **gate obrigatório** (SC-008)

- Filmes, Séries, Início, Live, Busca e Configurações: nenhuma barra de
  rolagem nativa (o bug só apareceu aqui).
- Início sem faixa vazia grande.
- Ícones da trilha (★ Favoritos/↺ Histórico) e do chrome no tamanho certo
  (antes ficavam enormes neste motor).
- Colunas só-na-TV da matriz: sobreposição em repetição rápida (segurar ↓
  em grade e lista), desempenho geral, vídeo sobre as telas.
- Registrar o resultado em `matriz-qa.md` (coluna só-na-TV) e em
  `plan.md` → `Riscos e Decisões`.

Fechar sem esta passada só com decisão explícita do usuário registrada em
`Riscos e Decisões` (constitution, "Validação em hardware real").

## Checklist cross-cutting (constitution)

- [ ] Todo estado de toda tela tem ao menos um focável ativável por OK.
- [ ] Um único foco visível por vez, sem depender só de cor.
- [ ] Voltar restaura foco/posição por id (nada mudou nos fluxos).
- [ ] Nenhum texto/dado inventado no Início redistribuído.
- [ ] Nenhuma URL/credencial em rótulo, `aria-label` ou erro.
- [ ] Só tokens V14 em CSS novo ou movido; fontes e ícones locais.
