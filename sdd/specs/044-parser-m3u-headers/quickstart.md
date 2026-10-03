# Quickstart — verificação da feature 044

Nada visível muda nesta feature; a verificação é por teste e por inspeção do que foi guardado.

## Pré-requisitos

- `tv-web/` com dependências instaladas (`npm ci`).
- Para o E2E: `npm run dev` rodando em outro terminal (reinicie se estiver de pé há horas).

## Checagens automatizadas (a partir de `tv-web/`)

```powershell
npx vitest run src/lib/catalog/m3uParser.parser-m3u-headers.contract.test.ts src/lib/catalog/importPipeline.parser-m3u-headers.contract.test.ts   # 5/5
npx vitest run src/lib/catalog          # a área inteira
npx tsc -b ; npm run lint ; npm run build
..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 044-parser-m3u-headers   # trava íntegra
npm run test:e2e                         # regressão da importação M3U
```

## Cenário ponta a ponta (sem TV)

1. Servir uma lista M3U local (qualquer servidor estático) com:
   ```
   #EXTM3U
   #EXTINF:-1 tvg-chno="7" radio="true" group-title="Canais",Radio Teste
   http://exemplo.test/live/1.ts|User-Agent=UA-TESTE&Referer=http://ref.test/
   #EXTINF:-1 group-title="Canais",Canal Teste
   #EXTVLCOPT:http-user-agent=UA-DIRETRIZ
   http://exemplo.test/live/2.ts
   ```
2. No app (dev), adicionar a lista por URL e deixar a importação concluir; abrir a categoria "Canais".
3. No DevTools › Application › IndexedDB › `categoryBlocks`, conferir no bloco: item 1 com `directUrl` **sem** `|…`, `playbackHeaders {userAgent, referer}`, `radio: true`, `declaredChannelNumber: 7`; item 2 com `playbackHeaders {userAgent: 'UA-DIRETRIZ'}`.
4. Conferir que **nenhuma tela** mostra os valores (nome da lista, cartões, avisos, Info do stream) e que o console não os imprime.
5. Tocar o canal: abre a URL limpa, **sem** headers (a 25b é quem os repassa). Anotar o resultado — um servidor que exige o header ainda recusa, e isso é o esperado até a 25b.

## Item cross-cutting da constituição

- Nenhum segredo em log/UI/erro (cenário 4 e contrato 5).
- Nenhuma passada na TV física é exigida (nada visível muda); se a lista real do usuário tiver `|` ou `#EXTVLCOPT`, vale importá-la uma vez e olhar o passo 3.
