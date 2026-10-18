# Quickstart: validação do foco leve na TV

## Pré-requisitos

- Dependências de `tv-web` instaladas.
- Dev server disponível para a validação automatizada.
- TV Samsung QN50Q60DAGXZD acessível pelo fluxo existente de `deploy-tv.ps1`.
- Roteiro e ferramentas da sonda 2 da feature 082 disponíveis; não apagar IndexedDB nem reinstalar desinstalando o app.

## Checagens automatizadas

A partir de `tv-web/`:

```powershell
npm run lint
npx tsc -b
npm run test
npm run build
npm run dev
npm run test:e2e -- --only home-vitrine-expandida,live-tv-ds-v14,vitrine-filmes-series
```

O E2E deve rodar contra o dev server já iniciado. Se a execução geral for necessária, usar `npm run test:e2e` antes de pedir a validação física.

## Roteiro manual

1. Instalar/atualizar o pacote pela skill `tizen-tv`, preservando dados da TV.
2. Abrir Home e mover o foco pela fileira de cards; confirmar que há um único foco visível, que a escala/contorno/brilho continuam reconhecíveis e que o foco não inicia reprodução ou consulta.
3. Repetir em Live TV, Filmes e Séries, incluindo card na primeira/última posição, grade curta, placeholder e estado indisponível quando disponível.
4. Pressionar SELECT e RETURN em cada superfície; confirmar que as ações existentes e a restauração de foco permanecem iguais.
5. Executar a sonda de desempenho com uma grade de pelo menos 140 cards e registrar fps, pior quadro e quantidade de quadros acima de 50 ms.
6. Repetir a medição após navegação rápida e com reduced motion, registrando qualquer diferença.

## Aceite

- Grade de referência: pelo menos 50 fps e nenhum quadro acima de 50 ms.
- Visual: foco identificável a distância, sem brilho preso, sem corte pela viewport e sem perda de distinção em estados disabled/loading/empty/error.
- Evidência: separar resultados automatizados, inspeção no navegador/emulador e confirmação da TV física; a medição da TV física é o gate de desempenho desta feature.
