# Quickstart — 048 Paridade visual da TV ao vivo

## 1. Pré-requisitos

- `tv-web/`: `npm install` feito; `npm run dev` rodando em `http://localhost:5173` para os E2E.
- Nenhum backend (`api/` é fallback congelado, ADR-008). Nenhuma credencial real: fixtures M3U/EPG fictícias.

## 2. Checagens automatizadas (de `tv-web/`)

```powershell
npx vitest run src/lib/epg/upcoming.live-paridade-v14.contract.test.ts src/features/live/LiveScreen.live-paridade-v14.contract.test.tsx   # 5/5
npx tsc -b
npm run lint
npm run test
npm run build
npm run test:e2e          # inclui e2e/live-paridade-v14.mjs
npm run build:tizen       # sync-tizen não pode recusar nada
```

Da raiz: `check-contract-tests.ps1 -Slug` para `048-live-paridade-v14`, `018-busca-por-categoria`,
`024-live-tv-ds-v14`, `030-epg-dados-agora`, `031-epg-guia-completo`, `046-memoria-foco-key-repeat` —
todas íntegras.

## 3. Cenário ponta a ponta (Chromium 1920×1080)

1. Cadastrar uma lista M3U fictícia com 3+ grupos, um canal com logo e um sem logo, e EPG com 4+
   programas futuros para um canal (reaproveitar fixtures de `e2e/epg-dados-agora.mjs`).
2. Abrir TV ao vivo e entrar numa categoria:
   - colunas em painéis com cabeçalho de duas linhas; larguras ~200 / ~340 / resto;
   - destaque com rótulo do grupo (caixa alta, laranja), nome grande, "● Ao vivo" (sem EPG) ou
     "● <programa> • ao vivo agora" (com EPG), ações em linha;
   - canal com logo: logo esmaecido à direita do destaque; sem logo: só degradê.
3. Focar o canal com EPG: até 3 cartões A seguir / Depois / Mais tarde com títulos e horários reais.
   Canal sem EPG: nenhuma faixa de cartões.
4. → do canal para as ações; → / ↓ avançam, ↑ volta, ← volta ao canal de qualquer ação.
5. Descer até o último canal visível e além: anel de foco inteiro nos quatro lados em todas as posições.
   Indicador de continuação: no topo só a borda de baixo esmaece, no meio as duas, no fim só a de cima;
   numa categoria que cabe inteira, nenhuma; o canal focado nunca fica sob o esmaecimento. Idem na trilha.
6. Trilha: tile ★ Favoritos, ∞ Todos, iniciais nas categorias; selecionada com texto laranja.
7. Abrir um canal e o zapping (OK no player): mesmos painéis/itens, canal tocando com estado próprio.
8. Abrir Filmes, Séries e Configurações: idênticos às capturas de antes (SC-004).

## 4. Conferência com o Design System

1. **Spec V14** (`docs/design/design-system/CCPlayTV_Design_System_Spec_v14_Spectrum.md`): percorrer a
   tabela `## Referências do Design System` do `plan.md` — §5 (cores/superfícies), §6 (tipografia;
   nenhum texto < 16px), §7–§8 (espaçamento/raio dos painéis), §11 (anel, no-scale), §15 (ícones SVG),
   §25 (estrutura e channel item), §31.1 (botões, cards, seleção), §33/§34 (focus path e QA matrix).
2. **Component Lab** (`…Component_Lab_v14_Spectrum.html`, abrir no navegador servido por HTTP): comparar
   a trilha com `#categoriesv131`/`#navigation`, as ações com `#actions`/`#states`, a linha de canal com
   `#cards` (compact), os estados com `#feedback`.

## 5. Revisão lado a lado com o protótipo

Servir `docs/design/design-system/` por HTTP (o protótipo roda num IIFE; para ir direto à Live,
expor `go` injetando `window.__go=go` no HTML servido, como na revisão de 2026-10-02) e comparar a
captura de `live()` com a do app. Diferenças aceitas: as do `## Fora de Escopo` da spec (moldura
global, "Preview pronto", dados de exemplo, Esportes/Infantil, barra de dica sob o preview, textos
"Assistir agora") **e** onde a Spec/Lab prevalecem sobre o protótipo (plan D-014..D-017: painéis em
`--bg-surface`, título em H1 40px, chip selecionado em tint, número do canal ≥ 16px, progresso laranja,
ícones SVG em vez de glifos).

## 6. Itens cross-cutting da constitution

- Foco visível e sem becos sem saída em carregando/vazio/erro (dentro dos painéis).
- Nenhum dado inventado: sem EPG, nenhum texto de programação; nenhum progresso fictício.
- Nenhuma URL de stream/credencial em DOM/log.
- Passada na TV física: **recomendação**, não gate (decisão de 2026-10-02) — se feita, observar
  fluidez ao trocar o canal focado com o logo de fundo.
