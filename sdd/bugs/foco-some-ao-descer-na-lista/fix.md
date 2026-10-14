# Bug Fix: Foco some ao descer na lista de episódios do detalhe da série

- **Slug**: foco-some-ao-descer-na-lista
- **Corrigido**: 2026-10-05
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Depois que o foco muda para a temporada ou para um episódio, a tela agora traz o elemento focado à vista na página (`.vod-detail`), que é quem de fato rola desde o hero Cinema (059). Antes, só o virtualizador da lista interna era movido, e ela não rola.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/features/series/SeriesDetailScreen.tsx` | modified | Novo `useEffect` em `[row, episodeIdx, activeTab]` (depois do `useVirtualFocusSync`, porque `episodeIdx` só existe ali): nas linhas `season` e `episodes` chama `scrollIntoView?.({ block: 'nearest', inline: 'nearest' })` no `.tv-focus` da raiz. Comentário do efeito da 059 (que dizia "a lista virtual e os cartões rolam sozinhos") corrigido. |
| `tv-web/src/styles/vod.css` | modified | `scroll-padding-block: var(--safe-y)` em `.vod-detail`, para a linha focada respeitar a zona segura (mesmo padrão de `onboarding.css`). |
| `tv-web/src/features/series/SeriesDetailScreen.foco-episodios.test.tsx` | added | Teste de componente. |
| `tv-web/e2e/serie-foco-episodios.mjs` | added | Roteiro E2E com 14 episódios, registrado em `tv-web/e2e/run.mjs` (`SUITE`). |
| `tv-web/e2e/run.mjs` | modified | Uma linha na `SUITE`. |

## Tests Added or Updated

- `SeriesDetailScreen.foco-episodios.test.tsx::descer pelos episódios traz cada linha focada à vista; nas abas não rola` — `scrollIntoView` nunca é chamado ao focar as abas, é chamado no botão de temporada e em cada episódio ao descer e ao subir. **Falha sem o fix** (conferido guardando o `SeriesDetailScreen.tsx` de lado), passa com ele.
- `SeriesDetailScreen.foco-episodios.test.tsx::rolar só mexe na posição: nenhuma reprodução inicia ao descer pelos episódios` — guarda de que rolar não inicia reprodução (constituição: focar não dispara nada).
- `e2e/serie-foco-episodios.mjs` — em Chromium 1920×1080, painel Xtream fictício com 14 episódios: em todos os passos de ↓ (2→14) e de ↑ (13→1) a linha focada fica dentro de `0..1080`, a página rola (máx. 3178 px), e de volta às ações o `scrollTop` volta a 0. **Falha sem o fix** (episódio 1 já fora da tela, 1010–1260), passa com ele.

## Local Verification

- `npx tsc -b` → exit 0.
- `npm run lint` → sem erros (só os avisos antigos).
- `npx vitest run src/features/series src/features/movies src/features/vod src/components src/lib/focus` → 134 arquivos, 770 testes verdes.
- `npm run test:e2e` (suíte inteira, 3 em paralelo) → 35/38; `serie-foco-episodios` ✓. Falharam `metadata-tmdb` e `semelhantes-elenco-ator` (já falhavam **sem** as minhas mudanças: desatualizados em relação à 059) e `headers-catchup`, que passou isolado duas vezes e falhou uma vez na suíte paralela (flake provável, causa não identificada).
- Checagem manual: captura do último passo (episódio 9 focado, anel visível, página rolada).

## Deviations from Assessment

Nenhum desvio de arquivos ou de abordagem. Dois detalhes que o assessment não previa: o efeito precisou ficar *depois* da declaração de `episodeIdx` (senão a lista de dependências quebra na renderização), e a feature 059 já tinha um efeito que leva a tela ao topo nas linhas `more`/`actions`/`tabs`, então só foi preciso complementá-lo para `season`/`episodes`, sem mexer no retorno ao topo.

## Follow-ups

- Observação visual, **fora do escopo**: a linha do episódio focado (`.vod-episode-row.tv-focus`) desenha um anel laranja que atravessa a largura inteira, além do anel do cartão. Parece desenho antigo da linha com `tv-focus`, não do efeito novo; vale olhar com o carrossel.
- Fora do escopo, já no assessment: a lista não rola, então o virtualizador renderiza todas as linhas; para temporadas com centenas de episódios isso pesa. Entra na decisão do carrossel horizontal de episódios, que o usuário adiou.
- Não verificado na TV física (rolagem do Tizen/Chromium 120).
