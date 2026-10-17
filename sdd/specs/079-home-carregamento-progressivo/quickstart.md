# Quickstart de validação — 079

## Pré-requisitos

- `tv-web/` com dependências instaladas.
- Comportamento local: `npm run dev`.
- TV: Samsung QN50Q60DAGXZD (skill `tizen-tv`), build com `VITE_CCPLAY_PERF=1`; relatórios em
  `window.__ccplayAssemblyTimings`. Uma lista real com histórico, favoritos (canais, filmes) e chave TMDB configurada.
- Não registrar credenciais, URLs, M3U ou títulos em capturas e relatórios.

## Checagens automatizadas

```powershell
npx vitest run src/lib/assembly src/features/home/HomeContent.home-carregamento-progressivo.contract.test.tsx src/features/vod/VodShowcaseScreen.home-carregamento-progressivo.contract.test.tsx
npm run lint
npx tsc -b
npm run test
npm run build
npm run test:e2e
```

## Definições

- **Abertura fria**: app fechado e relançado, entrando na lista.
- **Abertura quente**: voltar à tela na mesma sessão.
- **Primeira tela**: o que cabe em 1920×1080 com o foco na posição inicial.

## Roteiro na TV (por tela: Home, Filmes, Séries)

1. Abertura fria: a tela aparece **inteira de uma vez** — nenhuma fileira surge, troca ou pula depois; as capas visíveis já
   estão desenhadas.
2. Se demorar: "Carregando" com Voltar focado; ↑ leva à topbar; RETURN volta.
3. Home: o billboard nunca mostra "Bem-vindo(a)" antes do título de continuar/favorito.
4. Com a internet lenta ou sem TMDB: Filmes/Séries aparecem em ~2 s sem "Em alta"/"Dica"; sair e voltar mostra-os.
5. Abertura quente: a tela aparece direto, sem "Carregando".
6. Home: assistir algo pela primeira vez e fechar o player — "Continuar assistindo" aparece na hora.
7. Registrar `__ccplayAssemblyTimings` (tela, `revealMs`, `reason`, adiadas, capas no teto) e a avaliação visual do usuário.

## Pre-acceptance checklist

- [ ] Abertura fria das três telas sem fileira surgindo depois.
- [ ] "Carregando" nunca pisca em abertura quente.
- [ ] Voltar/RETURN/topbar funcionam durante a espera.
- [ ] Teto de 2 s respeitado com TMDB lento.
- [ ] Contratos 079 e das features 026/052/056/057/060/paridade verdes e intactos.
- [ ] Evidência de navegador, E2E, emulador e TV registradas separadamente.
- [ ] Avaliação visual do usuário registrada.
