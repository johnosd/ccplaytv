# Lógica: composição do foco leve

Revisado em 2026-10-19. Candidatas e ordem de escolha em `research.md`.

## Invariantes

1. Existe no máximo um `.tv-focus` lógico por superfície de navegação; o foco continua sendo estado React + classe
   (ADR-009). Nenhuma mudança introduz `.focus()` de DOM, hover, autoplay, consulta externa ou SELECT implícito.
2. Contorno `var(--focus-ring-width)` + `var(--focus-ring-offset)`, halo `var(--focus-halo)`, brilho `var(--focus-glow)`
   e `scale(var(--focus-scale))` continuam sendo os **valores** do foco; a feature muda como eles entram, não os tokens.
3. **Nenhuma folha de estilo anima `box-shadow`** (nem por `transition: all`, nem por `@keyframes`) e nenhuma usa
   `backdrop-filter` — é o teste de contrato `foco-leve-tv.contract.test.ts`. Animação de foco fica em `transform`,
   `opacity` e, onde já existe, `background`.
4. `.no-scale` continua sem escala; as exceções de tela já existentes (anel interno da grade da vitrine
   `.vod-grid-cell .poster-box.tv-focus::before`, pôster da Rádio, ícone de detalhe `.vod-detail-icon`) mantêm a
   **geometria** que têm hoje — só perdem a animação de sombra, se tiverem.
5. Cópias locais da receita (hoje `.vod-detail-icon-action.tv-focus .vod-detail-icon` em `vod.css` e
   `.source-setup .text-field:focus-within` em `onboarding.css`) usam os mesmos tokens e obedecem ao item 3.
6. Movimento reduzido (`prefers-reduced-motion` e `:root.reduce-motion`) continua zerando a duração; o estado final do
   foco é o mesmo.
7. Se a candidata escolhida for C2/C3 (pseudo-elemento): a camada é `pointer-events: none`, não altera o tamanho medido
   (virtualização), não é posta em elemento com `overflow: hidden` que a corte, e não reaproveita `::before/::after`
   já usados pelo componente — cada exceção fica listada na matriz de superfícies.

## Medição — duas superfícies, papéis diferentes

| Superfície | Papel | Movimento | O que registra |
| --- | --- | --- | --- |
| Sonda (`sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/app2`, teste `foco083`) | **Gate** SC-001/SC-002 | Troca de foco entre cards visíveis a cada 140 ms, sem rolagem, 3 s por candidata | fps, pior quadro, quadros > 50 ms |
| Sonda, mesmo teste | Registro (SC-006) | Foco descendo linhas com rolagem da grade | idem |
| App real, build de medição (`VITE_CCPLAY_PERF=1`, `PerfOverlay`) | Registro (SC-006) e inspeção (SC-005) | Navegação na grade da vitrine de Filmes e numa fileira da tela de Filmes, com capas | idem, na janela com tecla ativa |

Na sonda, cada rodada mede na mesma sessão: `f-full` (linha de base da 082), `f-app` (receita atual exata do app) e as
candidatas C1–C4. Assim a comparação não depende de outro dia/firmware.

## Pseudocódigo da sonda (`foco083`)

```text
monta grade 7×20 igual à do teste render (capas sintéticas, 220×330)
para cada classe em [f-full, f-app, f-c1, f-c2, f-c3, f-c4]:
    out[classe] = frames(3000, focusLoop(classe, 3000))        // sem rolagem
para cada classe em [f-app, f-c1]:
    out.rolagem[classe] = frames(3000, foco desce uma linha a cada 140 ms, rolando o palco até a linha)
loga uma linha por classe: fps | pior | >50ms
```

`frames()` já devolve `fps`, `maxGapMs` e `longFrames` (> 50 ms) em `core.js`.
