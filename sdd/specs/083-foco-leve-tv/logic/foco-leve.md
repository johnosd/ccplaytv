# Lógica: composição do foco leve

## Invariantes

1. Existe no máximo um `.tv-focus` lógico por superfície de navegação.
2. O foco continua sendo estado React; nenhuma mudança de CSS pode introduzir `.focus()` de DOM, hover, autoplay, consulta externa ou SELECT implícito.
3. O elemento focado mantém `outline` de 4 px, offset de 3 px e `transform: scale(1.06)` para cards que já usam escala.
4. O brilho deve ser uma camada visual não interativa, sem alterar o tamanho medido do card nem a janela virtualizada.
5. A entrada/saída da camada deve ser animada por `opacity` dentro da faixa de 120–160 ms; não animar `backdrop-filter`, layout ou uma sombra pesada no elemento a cada frame.
6. Componentes `.no-scale` continuam sem transformação; rows, tabelas, opções e controles que já usam essa classe não podem ganhar escala por esta feature.
7. `prefers-reduced-motion` e `:root.reduce-motion` devem continuar zerando a duração sem remover a distinção visual do foco.
8. O fallback visual deve continuar funcional se pseudo-elementos forem ignorados: outline e escala permanecem suficientes para localizar o item.

## Forma de validação

- Inspecionar que a regra compartilhada mantém o foco visível nos componentes que recebem `focused`/`.tv-focus`.
- Verificar que a troca rápida de foco deixa somente o item atual com a camada ativa.
- Medir a grade de 140 cards no mesmo roteiro da sonda 2 e comparar fps, pior quadro e contagem de quadros acima de 50 ms.
- Repetir inspeção visual nas famílias Home, Live, Filmes e Séries; SELECT e RETURN são testes de regressão, não novos contratos de navegação.

# Inventário executado — T001

A auditoria encontrou `tv-focus` em 
214
 arquivos de `tv-web/src/`. Distribuição por área:
- `` — 1 arquivo(s)
- `components` — 46 arquivo(s)
- `components\player` — 1 arquivo(s)
- `features\favorites` — 2 arquivo(s)
- `features\history` — 1 arquivo(s)
- `features\home` — 12 arquivo(s)
- `features\live` — 14 arquivo(s)
- `features\live\guide` — 6 arquivo(s)
- `features\movies` — 10 arquivo(s)
- `features\person` — 2 arquivo(s)
- `features\portal` — 3 arquivo(s)
- `features\profiles` — 5 arquivo(s)
- `features\radio` — 4 arquivo(s)
- `features\search` — 1 arquivo(s)
- `features\series` — 11 arquivo(s)
- `features\settings` — 27 arquivo(s)
- `features\settings\list` — 3 arquivo(s)
- `features\settings\parental` — 3 arquivo(s)
- `features\settings\tabs` — 7 arquivo(s)
- `features\shell` — 6 arquivo(s)
- `features\sources` — 3 arquivo(s)
- `features\splash` — 2 arquivo(s)
- `features\vod` — 29 arquivo(s)
- `lib\focus` — 2 arquivo(s)
- `styles` — 13 arquivo(s)

Consumidores centrais revisados: `src/index.css`, `components/PosterArt.tsx`, `Button.tsx`, `Chip.tsx`, `ContentCard.tsx`, `ChannelRow.tsx`, `PlayerChrome.tsx`, `PlayerLayer.tsx`, `features/home/`, `features/live/` e `features/vod/`.
Nenhum consumidor exigiu estado novo; `.no-scale` aparece em controles que não podem alterar geometria.