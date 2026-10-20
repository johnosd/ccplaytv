# Matriz de superfícies (T015) — 2026-10-19

**Classificação: navegador (diagnóstico).** Não aprova SC-001/SC-002 nem SC-005 (D-005); registra SC-003/SC-004 no navegador.
Receita aplicada: **C1 provisória** (R-008) — transição só de `transform` e `background`; tokens de foco intactos.

## Método

Rastreador temporário (apagado depois) sobre o painel Xtream fictício dos E2E: a cada tecla (setas) lê, no(s) elemento(s) em
foco (`.tv-focus` ou `:focus`), o estilo calculado — contorno, presença de sombra e `transition-property`/duração. 65 amostras,
64 elementos em foco, 11 telas.

## Resultado

| Verificação | Resultado |
| --- | --- |
| Elemento em foco sem contorno nem sombra | 0 |
| Elemento em foco com `box-shadow`/`all` em transição de duração > 0 | 0 |
| Amostra com mais de um elemento em foco | 0 |

## Famílias

| Família | Onde foi amostrada | Resultado | Exceção |
| --- | --- | --- | --- |
| Cartões/pôsteres | fileira da tela de Séries/Filmes (`poster-box`), "Ver tudo" (`home-see-all`), cartões de lista (`source-card`, `add-card`) | contorno + halo + brilho; sombra entra de uma vez | — |
| Botões e chips | `button-secondary`, `source-type`, `home-hero-action`, `icon-button` | idem | — |
| Navegação (topbar e trilha lateral) | `topbar-item`, `topbar-profile`, `side-category-nav-item` | idem | — |
| Painéis | `about-panel-version` (Ajustes) | contorno presente | — |
| Campos de texto, player, linhas do Live/guia, vitrine em grade (`vod-grid`), PIN, Rádio com estações | **não alcançados** pelo rastreador (painel fictício sem EPG/estações; sem teclas até a grade) | cobertos por CSS que usa os mesmos tokens e pelos E2E (`ime-formularios`, `player-chrome`, `live-tv-ds-v14`, `filmes-series-ds-v14`, `radio-global`) — ver Registro da Fase 4 | Geometrias preservadas por D-004 (anel interno da vitrine, pôster da Rádio, `.vod-detail-icon`, campo do onboarding): nenhum anima sombra |

## Exceções de geometria (D-004)

Conferidas por leitura de CSS em T010: `onboarding.css` `.text-field:focus-within` (só halo), `vod.css`
`.vod-grid-cell .poster-box.tv-focus::before` (anel interno, sem animação), `radio.css` (pôster da Rádio). Nenhuma foi alterada.
A inspeção a ~3 m (SC-005) é da Fase 5.
