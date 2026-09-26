# Implementation Plan: Fundação Visual do Design System V14 (Onda 0 da migração)

**Slug**: `021-fundacao-visual-ds-v14` | **Date**: 2026-09-26 | **Spec**: `sdd/specs/021-fundacao-visual-ds-v14/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Primeira onda da migração para o DS V14 Spectrum
(`.planning/migracao-design-system-v14.md`, ADR-011). Prepara a base que
as features 022–027 consomem, **sem mudar o layout de nenhuma tela**.

1. **Fontes locais.** Poppins/Inter passam a vir de arquivos `.woff2`
   vendorizados em `tv-web/src/assets/fonts/`, e sai o Google Fonts. O
   `sync-tizen.mjs` ganha uma guarda que falha quando um arquivo do build
   não está na lista `files:` do pacote.
2. **Tokens.** Tokens V14 completos em `index.css`. Os nomes antigos viram
   alias com o mesmo valor.
3. **Palco.** Palco 1920×1080 escalado por um componente `Stage` que
   envolve o app. Em 1920×1080 não aplica `transform` algum.
4. **Anúncios.** Região de anúncio única (`AnnouncerRegion`). O `Toast`
   passa a renderizar **dentro** dela, via portal, em vez de duplicar o
   texto.
5. **Movimento reduzido.** Media query mais preferência interna persistida
   (classe `reduce-motion` no `<html>`).
6. **Utilitários de estado.** `.no-scale`, `.pressed`, soft/hard disabled.
7. **Ícones.** Conjunto de ícones SVG locais (`Icon`), sem uso nas telas
   ainda.
8. **Idioma.** `lang="pt-BR"`.

A paridade visual é provada por capturas antes/depois de 8 telas, mais as
suítes existentes verdes sem editar asserções.

## Technical Context

**Language/Version**: TypeScript ~6.0 (strict via `tsconfig.app.json`: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`), React 19.2, CSS puro (sem pré-processador). Scripts de build em Node ESM (`.mjs`).

**Primary Dependencies**: Vite 8 (`build.target`/`cssTarget: 'chrome108'`, `assetFileNames: 'assets/[name].[ext]'`, ou seja, nomes sem hash), `@tanstack/react-query`, `@tanstack/react-virtual` (mede por `offsetWidth/offsetHeight` e `contentRect`, que não são afetados por `transform`, verificado em `virtual-core/dist/esm/index.js`). **Nenhuma dependência de runtime nova.** Os `.woff2` vêm do Fontsource v5 e são copiados para o repositório (D-002), não instalados como pacote.

**Storage**: `localStorage` só para a preferência de movimento (`ccplaytv:reduce-motion`). Acesso protegido, porque pode lançar exceção.

**Testing**: Vitest 5 + jsdom + Testing Library (`tv-web/src/setupTests.ts`). E2E: scripts Playwright avulsos em `tv-web/e2e/*.mjs` contra `npm run dev` (http://localhost:5173), com fixtures M3U servidas por HTTP local do próprio script.

**Target Platform**: Samsung QN50Q60DAGXZD, Tizen 8.0 / Chromium 108, área de navegador 1920×1080. O pacote `.wgt` sai de `CCPlayTv/`, sincronizado por `tv-web/scripts/sync-tizen.mjs`, e a lista de arquivos está em `CCPlayTv/tizen_web_project.yaml`.

**Performance Goals**: nenhuma regressão.
- Em 1920×1080 o palco não aplica `transform`, então não há camada composta nova.
- As fontes somam 8 arquivos latinos (~15–25 KB cada).

**Constraints**:
- **Plano de vídeo de hardware.** O AVPlay pinta atrás da camada web, e as
  regras `:root.video-plane-visible …` de `index.css`/`screens.css` precisam
  continuar deixando-o passar. O palco não pode ter fundo próprio.
- **`position: fixed`** em `.toast` e `.confirm-dialog`. Dentro de um
  ancestral com `transform` ele passa a ser relativo ao palco, que é o
  comportamento desejado quando há escala.
- **Testes de tela** buscam o texto do toast com `getByText`, e a E2E com
  `getByText().isVisible()` (modo estrito). O texto do toast nunca pode
  existir em duas cópias no DOM (D-004).
- **Testes de contrato travados de features anteriores** não podem ser
  tocados.

**Scale/Scope**: arquivos globais (`index.html`, `main.tsx`, `index.css`, `src/styles/*.css`, `useToast`, `Toast`), 4 módulos novos em `src/lib/` e `src/components/`, um script de build e 5 telas que só passam `messageKey` ao `Toast` (edição de 1 linha cada).

## Decisões Invariantes

- **D-001 — Tokens: nomes V14 recebem os valores; nomes atuais viram
  alias.** Cada token existente em `index.css` continua existindo e
  resolvendo **para o mesmo valor** de hoje (FR-007). Os valores normativos
  vêm da Spec V14 §5–§10 e §29. Nada vem da §36 obsoleta, e nada dos
  aliases do Component Lab que colidem com nomes do app (`--bg` no Lab =
  `#0B0D12`, no app = `#05060a`; idem `--surface`, `--muted`, `--r8`…). O
  mapeamento obrigatório está na tabela "Tokens" abaixo.
- **D-002 — Fontes vendorizadas, só `woff2`, subconjunto latino.** Os 8
  arquivos abaixo, com o nome exato do Fontsource v5, ficam em
  `tv-web/src/assets/fonts/`, junto com os textos de licença OFL
  (`OFL-Poppins.txt`, `OFL-Inter.txt`):
  - `poppins-latin-{600,700,800}-normal.woff2`
  - `inter-latin-{400,500,600,700,800}-normal.woff2`

  Os `@font-face` ficam em `tv-web/src/styles/fonts.css` (`font-display:
  swap`, só `format('woff2')`, `url()` relativo). Pilhas: `'Poppins',
  Arial, Helvetica, sans-serif` e `'Inter', Arial, Helvetica, sans-serif`.
  Nenhum pacote npm de runtime novo.
- **D-003 — Palco: identidade em 1920×1080, sem `transform`.** O
  componente `Stage` (`src/components/Stage.tsx`) envolve o app em
  `main.tsx`. Ele é um `div.stage` de 1920×1080, com `position: absolute`
  no canto superior esquerdo, `transform-origin: 0 0` e fundo
  transparente. O `transform` vem de `computeStageLayout()`
  (`src/lib/stage.ts`) e é recalculado no `resize` da janela, mudando só o
  `style` do nó, sem remontar os filhos (FR-011). Quando a escala é 1 e os
  deslocamentos são 0, o nó **não recebe `transform`**. A cor das faixas
  de sobra vem do fundo de `:root`, que já fica transparente com
  `video-plane-visible`. `PlayerService.FULLSCREEN_REGION` (1920×1080) não
  muda (ver R-001).
- **D-004 — Anúncio sem texto duplicado.** Existe **uma**
  `AnnouncerRegion`, montada em `main.tsx` dentro do `Stage` e envolvendo
  o `App`. Ela é `role="status"` + `aria-live="polite"`, persistente e
  **não** é `sr-only`: é um contêiner sem tamanho e sem `overflow: hidden`,
  porque hospeda o toast visível. Com região no contexto
  (`AnnouncerContext`), o `Toast` renderiza por portal **dentro** dela e
  **sem** `role` próprio. Sem região (testes de tela isolados), ele
  renderiza exatamente como hoje (inline, `role="status"`). A repetição de
  texto é tratada por `useToast().toastKey`, que incrementa a cada
  `showToast`, e o `Toast` usa `key={messageKey}` para remontar o nó.
  `useAnnounce()` serve para mensagens sem texto visível: grava num
  `span.sr-only` dentro da mesma região. Detalhes em
  `logic/regiao-de-anuncio.md`.
- **D-005 — Movimento reduzido.**
  - Classe pública `reduce-motion` no `<html>` e chave
    `ccplaytv:reduce-motion` (`'true'`/`'false'`).
  - `applyMotionPreference()` roda em `main.tsx` **antes** do primeiro
    render.
  - A regra CSS de redução vale igualmente sob `@media
    (prefers-reduced-motion: reduce)` e sob `:root.reduce-motion`: zera
    `transition-duration`/`animation-duration`, mas **não** remove o estado
    final do foco (outline, halo, glow e escala continuam aplicados, só sem
    animar).
- **D-006 — Ícones.** `Icon` (`src/components/Icon.tsx`):
  - SVG inline, `viewBox="0 0 24 24"`, `stroke="currentColor"`, sem
    preenchimento; os desenhos ficam em `src/components/iconPaths.ts`.
  - Tamanho por `--icon-size`, com padrão `1em`.
  - Com `label`: `role="img"` + `aria-label`. Sem `label`:
    `aria-hidden="true"`.
  - Nenhuma tela passa a usá-lo nesta feature (FR-022).
- **D-007 — Utilitários de estado** ficam em `src/styles/utilities.css`,
  importado depois de `index.css` e antes de `screens.css`.
  - `.no-scale` anula só o `transform` do foco (`.tv-focus.no-scale`,
    `.no-scale:focus`).
  - `.pressed` aplica `scale(.985)` por `--duration-fast`.
  - `.is-soft-disabled`: opacidade reduzida em repouso e opacidade total
    quando focado.
  - `.is-hard-disabled`: opacidade reduzida, `pointer-events: none` e sem
    receita de foco.

  Tirar o elemento hard disabled da ordem de foco é responsabilidade de
  quem o renderiza (`useRemoteNav`/componentes da Onda 1). CSS não faz
  isso.
- **D-008 — Receita de foco em tokens, mesmos valores.** A regra de foco
  de `index.css` passa a usar os tokens `--focus-ring-width`,
  `--focus-ring-offset`, `--focus-halo`, `--focus-glow`, `--focus-scale` e
  `--duration-fast`, com os valores idênticos aos de hoje.
- **D-009 — Guarda do pacote Tizen.** `findUnlistedFiles()`
  (`tv-web/scripts/tizenFiles.mjs`) compara os arquivos de `dist/` com a
  seção `files:` do YAML. Ela ignora comentários e a seção `excludes:`, e
  normaliza `\` para `/`. `sync-tizen.mjs` **aborta com a lista dos
  faltantes** antes de copiar. `CCPlayTv/index.html` é regenerado por
  `npm run build:tizen`, nunca editado à mão.
- **D-010 — Telas intocadas.** Nenhuma regra de `screens.css` e nenhum JSX
  de tela muda. A única exceção é passar `messageKey={toastKey}` ao
  `Toast` em `HomeScreen`, `LiveScreen` (4 ocorrências),
  `MovieDetailScreen`, `MoviesScreen` e `SeriesScreen`. Glifos/emoji ficam
  como estão.
- **D-011 — Evidência de paridade.** O script novo
  `tv-web/e2e/paridade-visual.mjs` captura 8 telas em 1920×1080 para
  `sdd/specs/021-fundacao-visual-ds-v14/evidencias/antes/`, **rodado antes
  de qualquer mudança**. Depois captura as mesmas telas em
  `evidencias/depois/` e, para SC-004, em 1280×720 e 3840×2160.
  - Telas: lista de fontes, hub da lista, Live TV, Filmes, Séries,
    detalhe de filme, detalhe de série, camada de reprodução.
  - Dados só fictícios (`e2e/fixtures/paridade-visual.m3u`).
  - Não entra em `test:e2e` porque é evidência de revisão, não asserção.

### Tokens (mapeamento obrigatório de D-001)

| Grupo | Nome V14 (valor) | Alias existente mantido |
| --- | --- | --- |
| Superfícies | `--bg-canvas` #05060A · `--bg-base` #0B0D12 · `--bg-surface` #15181F · `--bg-elevated` #1D212B · `--bg-hover` #2A2F3C | `--bg`, `--surface-deep`, `--surface`, `--surface-field-active`, `--surface-active`/`--border-dashed` |
| Texto | `--text-primary` #F5F6F8 · `--text-secondary` #A7ADBB · `--text-disabled` #5C6372 · `--text-annotation` #7C8494 | `--text-primary`, `--text-secondary`, `--text-muted`, `--text-tertiary` |
| Accent | `--accent` #FF7A3D · `--accent-light` #FFA36B · `--accent-pressed` #D9601F · `--accent-tint` rgba(255,122,61,.16) · `--accent-tint-border` rgba(255,122,61,.40) · `--accent-ink` #2A1206 | `--accent-hover` → `--accent-light` |
| Semânticos | `--success` #3DDC84 · `--warning` #FFC93D · `--info` #2DB8C4 · `--info-deep` #1E9AB0 · `--live` #FF2E87 · `--danger` #FF4F68 (Component Lab V14) | — |
| Marca | `--brand-1..5`, `--brand-gradient`, `--brand-gradient-diagonal` (já existem) | — |
| Tipografia | `--font-heading`, `--font-body` (pilhas de D-002) · `--fs-display` 64px · `--fs-h1` 40px · `--fs-h2` 28px · `--fs-body-lg` 24px · `--fs-body` 20px · `--fs-caption` 16px · `--fw-display` 800 · `--fw-h1` 700 · `--fw-h2` 600 · `--fw-body` 500 · `--fw-caption` 600 | — |
| Espaçamento | `--space-1` 8px … `--space-7` 96px (8/16/24/32/48/64/96) | — |
| Raio | `--radius-sm` 8px · `--radius-md` 12px · `--radius-lg` 16px · `--radius-pill` 999px | — |
| Elevação | `--elevation-1` `0 8px 24px rgba(0,0,0,.28)` · `--elevation-2` `0 16px 48px rgba(0,0,0,.48)` · `--elevation-3` `0 24px 70px rgba(0,0,0,.62)` | — |
| Motion | `--ease` cubic-bezier(.2,.8,.2,1) · `--duration-fast` 140ms · `--duration-standard` 200ms · `--duration-slow` 320ms | — |
| Foco | `--focus-ring-width` 4px · `--focus-ring-offset` 3px · `--focus-halo` `0 0 0 8px rgba(255,122,61,.22)` · `--focus-glow` `0 0 40px rgba(255,122,61,.55)` · `--focus-scale` 1.06 | (valores idênticos à regra atual) |
| Camadas | `--z-background` 0 · `--z-content` 10 · `--z-nav` 50 · `--z-overlay` 100 | — |
| Palco | `--stage-width` 1920px · `--stage-height` 1080px · `--safe-x` 96px · `--safe-y` 76px | — |
| Ícone | `--icon-size` 1em | — |

`--duration-fast` fica em 140 ms, o valor atual do foco (a Spec dá a faixa
120–160). `standard` e `slow` ficam no meio das faixas (180–240 e 280–420).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Não toca em conta nem fonte. |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | Nenhum segredo envolvido. Anúncios só repetem textos de toast que já são públicos na tela, e nenhum toast atual contém URL/credencial. O script de paridade usa fixture fictícia. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Não toca catálogo. |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Não se aplica. Nenhum mock nesta onda. |
| Comandos Locais Independem de Rede | ✅ | ✅ | **Melhora**: a tipografia deixa de depender de rede. |
| Trailers e Metadados Não Alteram o Estado | ✅ | ✅ | Não se aplica. |
| Toda Ação Essencial por Controle Remoto | ✅ | ✅ | Nenhuma ação nova, e o palco não muda a navegação por teclado. |
| Lista de Catálogo ≠ Manifesto | ✅ | ✅ | Não se aplica. |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | Receita de foco inalterada (D-008). O movimento reduzido mantém o estado final de foco (D-005). O redimensionamento não remonta nada (D-003). Anunciar não move o foco (contrato C4). |
| Voltar Restaura Foco e Posição | ✅ | ✅ | O `transform` não afeta `scrollTop` nem as medições da virtualização (offset*/contentRect). |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Não se aplica. |
| Progresso e Capacidades São Reais | ✅ | ✅ | Não se aplica. |
| Documentação do Repositório É Canônica | ✅ | ✅ | O Polish atualiza o CLAUDE.md: fontes locais, palco, região de anúncio, guarda de pacote e tokens V14. |
| Restrição: Design system de TV | ✅ | ✅ | Implementa "palco escalado uniformemente" (já exigido e não implementado) e completa os tokens. |
| Restrição: licenças observadas | ✅ | ✅ | Poppins/Inter são SIL OFL 1.1, e os textos de licença vão junto dos arquivos (D-002). A atribuição na tela "Sobre" fica para a Onda 5. |
| Restrição: plataforma-alvo Chromium 108 | ✅ | ✅ | `woff2`, `@font-face`, `transform` e `prefers-reduced-motion` são todos suportados no 108. Nada de `:has()`. |
| Fluxo: testes automatizados + E2E antes da TV | ✅ | ✅ | Tasks exigem `vitest` por task e `npm run test:e2e` no Polish. A TV física é recomendada (spec, Assumptions). |

Sem violações. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/021-fundacao-visual-ds-v14/
├── spec.md
├── plan.md                    # este arquivo
├── quickstart.md              # verificação manual (fontes offline, viewports, leitor de tela, TV)
├── logic/
│   └── regiao-de-anuncio.md   # D-004 em detalhe
├── contract-tests.lock        # 5 contratos travados
├── evidencias/                # criada no execute: antes/ e depois/ (capturas D-011)
└── tasks.md
```

### Source Code (repository root)

```text
tv-web/
├── index.html                          # lang pt-BR, sem Google Fonts
├── scripts/
│   ├── sync-tizen.mjs                  # + guarda findUnlistedFiles (D-009)
│   ├── tizenFiles.mjs                  # NOVO (stub) — findUnlistedFiles
│   └── pacoteTizen.fundacao-visual.contract.test.mjs   # CONTRATO C1, C2
├── e2e/
│   ├── paridade-visual.mjs             # NOVO — capturas (D-011)
│   └── fixtures/paridade-visual.m3u    # NOVO — dados fictícios
└── src/
    ├── main.tsx                        # Stage + AnnouncerRegion + applyMotionPreference
    ├── index.css                       # tokens V14 + aliases + foco em tokens + reduced motion
    ├── styles/
    │   ├── fonts.css                   # NOVO — @font-face locais
    │   └── utilities.css               # NOVO — no-scale, pressed, soft/hard disabled, sr-only, announcer
    ├── assets/fonts/                   # NOVO — 8 .woff2 + OFL-*.txt
    ├── lib/
    │   ├── stage.ts                    # NOVO (stub) — computeStageLayout
    │   ├── stage.fundacao-visual.contract.test.ts        # CONTRATO C3
    │   ├── motionPreference.ts         # NOVO (stub)
    │   ├── motionPreference.fundacao-visual.contract.test.ts  # CONTRATO C5
    │   ├── announcer.ts                # NOVO (stub) — AnnouncerContext, useAnnounce
    │   └── useToast.ts                 # + toastKey (stub = 0)
    ├── components/
    │   ├── Stage.tsx                   # NOVO
    │   ├── AnnouncerRegion.tsx         # NOVO (stub)
    │   ├── Toast.tsx                   # + messageKey, portal na região
    │   ├── Toast.fundacao-visual.contract.test.tsx       # CONTRATO C4
    │   ├── Icon.tsx                    # NOVO
    │   └── iconPaths.ts                # NOVO
    └── features/{home,live,movies,series}/*Screen.tsx   # só messageKey={toastKey}
CCPlayTv/
├── index.html                          # regenerado por build:tizen
└── tizen_web_project.yaml              # + 8 assets/*.woff2 em files:
```

**Structure Decision**: frontend único em `tv-web/`. O pacote Tizen em
`CCPlayTv/` é derivado do build. Os estilos globais novos ficam em
`tv-web/src/styles/`, pasta nova porque `index.css` concentraria tokens,
fontes e utilitários num arquivo só. Os estilos de tela continuam em
`features/screens.css`, intocados (D-010). `api/` não é tocado (ADR-008).

## Complexity Tracking

> **Preencher SOMENTE se o Constitution Check tiver violações que precisam ser justificadas**

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

- **Contratos (5, travados):** definem pronto para US1–US4.
- **Unitários adicionais** (escritos no execute):
  - `Stage`: recalcula no `resize` sem remontar filhos, ou seja, o foco
    fica;
  - `useAnnounce`: sem região é no-op; repete a mesma mensagem;
  - `Icon`: nome acessível com e sem `label`;
  - `Toast` sem região: comportamento antigo intacto;
  - `readReducedMotionPreference` com storage indisponível.
- **Regressão:** as 69 suítes existentes. **Nenhuma asserção existente pode
  ser editada** (FR-027). Duas instabilidades já conhecidas sob
  paralelismo (`LiveScreen.favorites.test.tsx`) são confirmadas isoladas,
  como já faz o projeto.
- **E2E:** `npm run test:e2e` com baseline registrada antes da mudança.
  `e2e.mjs` já falha hoje (bug do backlog: diálogo de saída inexistente em
  `AddSourceScreen`); FR-027 vale para os scripts que passavam na baseline.
  Mais `e2e/paridade-visual.mjs` para evidência (D-011).
- **Manual:** `quickstart.md` cobre fontes offline, viewports, leitor de
  tela e reduced motion. A TV física é recomendada.

Comandos-base (em `tv-web/`):

```powershell
npx tsc -b
npm run lint
npx vitest run
npm run build
npm run build:tizen          # build + guarda D-009 + sincroniza CCPlayTv/
npm run dev                  # outro terminal, para E2E
npm run test:e2e
node e2e/paridade-visual.mjs antes   # ou: depois
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
- `tv-web/scripts/pacoteTizen.fundacao-visual.contract.test.mjs`
- `tv-web/src/lib/stage.fundacao-visual.contract.test.ts`
- `tv-web/src/components/Toast.fundacao-visual.contract.test.tsx`
- `tv-web/src/lib/motionPreference.fundacao-visual.contract.test.ts`

Comando (em `tv-web/`):
`npx vitest run scripts/pacoteTizen.fundacao-visual.contract.test.mjs src/lib/stage.fundacao-visual.contract.test.ts src/components/Toast.fundacao-visual.contract.test.tsx src/lib/motionPreference.fundacao-visual.contract.test.ts`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| C1 `não referencia serviço de fontes externo, declara pt-BR e aponta @font-face para os 8 arquivos locais` | US1/AC2 · FR-001, FR-002, FR-026 | Fase 3 (US1) | `AssertionError: expected '<!doctype html>…' not to match /fonts\.(googleapis\|gstatic)\.com/` |
| C2 `findUnlistedFiles acusa arquivo do build fora da lista (inclusive caminho com \) e a lista real cobre as fontes` | FR-005 · D-009 | Fase 3 (US1) | `Error: not implemented` |
| C3 `escala uniforme e centralizada; em 1920×1080 é a identidade, sem transform` | US2/AC1–AC3 · FR-009, FR-010 · D-003 | Fase 4 (US2) | `Error: not implemented` |
| C4 `toast aparece uma única vez, dentro da região polite persistente, é reanunciado ao repetir e não move o foco` | US3/AC1–AC3 · FR-023–FR-025 · Constitution: Foco Visível | Fase 5 (US3) | `Error: not implemented` (de `AnnouncerRegion`) |
| C5 `preferência persistida liga/desliga a classe; armazenamento bloqueado não lança e não aplica` | US4/AC2–AC3 · FR-018, FR-019 | Fase 6 (US4) | `Error: not implemented` |

Vermelho confirmado em 2026-09-26: 5/5 falhando pelos motivos acima. A
suíte completa com os stubs deu 737 verdes. As 2 falhas de
`LiveScreen.favorites.test.tsx` são a instabilidade conhecida (15/15
isolado). `tsc -b` passou limpo.

Stubs criados pelo plan (ponto de partida do execute, não travados):
- `tv-web/src/lib/stage.ts`
- `tv-web/src/lib/motionPreference.ts`
- `tv-web/src/lib/announcer.ts`
- `tv-web/src/components/AnnouncerRegion.tsx`
- `tv-web/src/components/Toast.tsx` (prop `messageKey`, ainda sem efeito)
- `tv-web/src/lib/useToast.ts` (`toastKey` fixo em 0)
- `tv-web/scripts/tizenFiles.mjs`

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 (Setup/baseline) | Concluída. `evidencias/antes/` com 8 capturas. Baseline de vitest/E2E registrado em `tasks.md`. |
| Fase 2 (Foundational/tokens) | Concluída. Tokens V14 completos em `index.css`, foco em tokens, `tokens.test.ts` 74/74. |
| Fase 3 (US1/fontes locais) | Concluída. 8 `.woff2` vendorizados, `styles/fonts.css`, `lang="pt-BR"`, guarda `findUnlistedFiles` no `sync-tizen.mjs`, `build:tizen` verde. Contratos C1/C2 verdes. |
| Fase 4 (US2/palco) | Concluída. `Stage` monta em `main.tsx`, escala confirmada no navegador (1920×1080 = identidade, 1280×720 = scale 0.666…). Contrato C3 verde. |
| Fase 5 (US3/anúncio) | Concluída. `AnnouncerRegion` + `useAnnounce`, `Toast` portado sem duplicar texto (D-004), `useToast` com `toastKey` real. Ponta a ponta: `favoritos.mjs` 18/18 no app real. Contrato C4 verde. |
| Fase 6 (US4/motion) | Concluída. `motionPreference.ts` (media query + preferência interna), aplicada em `main.tsx` antes do 1º render. Confirmado no navegador nas duas fontes, independentemente. Contrato C5 verde. |
| Fase 7 (US5/utilitários+ícones) | Concluída. `.no-scale`/`.pressed`/soft-hard disabled em `utilities.css`; 17 ícones (`iconPaths.ts` + `Icon.tsx`), nenhuma tela consome ainda (FR-022). |
| Fase 8 (Polish) | Concluída. Capturas antes/depois sem diferença de layout (SC-003/SC-004). Suíte completa e E2E sem regressão real (2 achados de outras features corrigidos como desvio pequeno). `CLAUDE.md` atualizado. |
| Contratos (5) | **Todos os 5 verdes** (C1–C5), confirmado na suíte completa. Trava íntegra. |
| **Feature** | **Código-completo.** Único gate pendente: TV física (R-012), recomendada e conscientemente adiada pelo usuário. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Com a viewport diferente de 1920×1080, o retângulo do AVPlay (`setDisplayRect` em base 1920×1080) pode não coincidir com o palco escalado (ex.: faixas laterais em proporção não 16:9). | Médio em aparelhos fora da referência; nulo na QN50Q60 (escala 1). | Tela cheia continua cobrindo a tela inteira (FR-012). O alinhamento fino em outras resoluções não é verificável sem outro aparelho, e a pendência fica registrada. Revisitar quando a matriz de TVs (item 37) existir. |
| R-002 | Um `transform` no ancestral poderia afetar a composição da camada web sobre o plano de vídeo de hardware. | Alto se acontecesse (vídeo sem imagem). | D-003: na escala 1 não há `transform`, então a TV de referência fica idêntica. Roteiro recomendado de TV no `quickstart.md`. |
| R-003 | Texto do toast duplicado no DOM (região + toast) quebraria `getByText` em 6 suítes e o modo estrito da E2E. | Alto (viola FR-027). | D-004: o toast é portado **para dentro** da região, e sem região renderiza como hoje. O contrato C4 garante exatamente um nó. |
| R-004 | Um arquivo de fonte ausente em `files:` só falha na TV. | Médio (fonte cai no fallback em silêncio). | D-009: a guarda no `sync-tizen.mjs` e o contrato C2 conferem o YAML real. |
| R-005 | `e2e.mjs` já está quebrado antes desta feature (bug no backlog: Escape em `AddSourceScreen`). | Baixo, mas pode ser confundido com regressão. | Baseline E2E registrada na Fase 1 antes de qualquer mudança. FR-027 compara com ela. O bug continua no backlog, fora de escopo. |
| R-006 | Scripts E2E têm `executablePath` do Chromium fixado no caminho Linux do sandbox. | Baixo (atrito local no Windows). | Override temporário, sem commit, como nas features anteriores (CLAUDE.md). O `paridade-visual.mjs` novo segue o mesmo padrão dos demais para não divergir. |
| R-007 | A fonte local renderizando diferente da fonte do CDN (versão diferente do Poppins/Inter) mudaria métricas e quebras de linha. | Médio (viola SC-003). | Fontsource v5 e Google Fonts servem as mesmas versões upstream. As capturas antes/depois (D-011) detectam a diferença; se aparecer, registrar e escolher a versão que empata. |
| R-008 | Mudar a pilha de fallback de `system-ui, 'Segoe UI'` para `Arial, Helvetica` altera a aparência **só** quando a fonte não carrega. | Baixo. | Exigido pela Spec V14 §2.3 (FR-003). Não afeta a paridade com fonte carregada. |
| R-009 | **Resolvido**: `tv-web/e2e/favoritos.mjs` tinha um bug pré-existente (não desta feature) — 2 pontos pressionavam `ArrowUp` uma única vez pra alcançar "★ Favoritos" na trilha, mas a feature 018 inseriu "Todos" como 2ª entrada fixa (`VIRTUAL_TRAIL_COUNT=2`); uma seta só chega em "Todos". Nunca detectado porque o script também não tinha o fallback `existsSync` que os outros 6 scripts de `e2e/` têm pra rodar fora do ambiente Linux fixo — achado na Fase 1 (T004) ao estabelecer o baseline nesta feature, no Windows. | Alto antes da correção (o gate de E2E de favoritos ficava mudo em qualquer plataforma sem o caminho fixo; a US3 desta feature depende justamente do toast que esse script exercita). | **Resolvido** (T004a, aprovado pelo usuário como desvio pequeno): 2ª `ArrowUp` adicionada nos dois pontos, e o fallback `existsSync` adicionado em `favoritos.mjs` e `zapping-live-tv.mjs` (mesmo padrão dos demais). 18/18 e 11/11 verdes, respectivamente. |
| R-010 | `tv-web/e2e/m3u-sob-demanda.mjs` (feature 014, fora do escopo desta feature) se mostrou intermitente neste ambiente sob carga: 3 execuções do baseline, 2 falharam em pontos diferentes da suíte (timeout de seletor), 1 passou completa (26/26). Nenhum arquivo de produção foi tocado até a Fase 1, então não é causado por esta feature. | Baixo para esta feature; pode voltar a aparecer nas comparações de baseline das fases seguintes. | Tratado como instabilidade de ambiente (mesma categoria das `*.favorites.test.tsx` sob paralelismo). Confirmado de novo no Polish: `favoritos.mjs` também apresentou o mesmo padrão (2 falhas na navegação Filmes/Séries, depois 18/18 completo) — mesma causa (carga do ambiente, não regressão). Se reaparecer, rodar isolado antes de atribuir a uma regressão; não investigar/corrigir dentro desta feature. |
| R-012 | Verificação na TV física (`quickstart.md` §6) não foi executada — decisão explícita do usuário em 2026-09-26, feature fechando sem esse gate. | Baixo nesta fase (constitution: TV física é recomendada, não obrigatória, por padrão). O risco residual é o mesmo do R-002/R-004: um `.woff2` faltando na lista do pacote, ou o palco desalinhando o plano de vídeo em hardware real, só apareceriam lá. | Pendência aberta, não bloqueante. Recomendado rodar via skill `tizen-tv` antes da Onda 1 (feature 022) começar a consumir os ícones/utilitários desta feature, ou antes de qualquer preparação comercial. |
| R-011 | **Resolvido**: `tv-web/e2e/capa-real.mjs` (feature 015, fora do escopo desta feature) tinha um cenário (virtualização de 500 pôsteres) que passava desde a Fase 1 e passou a falhar de forma determinística no Polish (T045): "rolar até o fim pediu mais capas (84 -> 84)". Causa raiz confirmada experimentalmente (não suposição): o script não fixa `viewport` no `newContext()`, então herdava o padrão do Playwright (~1280×720) como área de layout. O palco lógico fixo desta feature (`.stage { width: 1920px; height: 1080px }`, US2) faz a área de LAYOUT do conteúdo deixar de acompanhar o viewport real — testado com viewport explícito 1920×1080 e com o padrão implícito, o número de itens pré-carregados foi **idêntico** (84) nos dois casos, confirmando que é o palco (não mais o viewport do navegador) que agora decide quanto cabe. Com mais área de layout, mais itens pré-carregam de cara, e os 10 `ArrowDown` fixos do script deixaram de bastar pra sair da janela virtualizada maior e disparar carga de mais itens — confirmado: com 40 `ArrowDown`, o teste passa (84 → 254). | Médio antes da correção: um gate de regressão real de outra feature (virtualização, feature 015) ficaria silenciosamente quebrado por uma mudança de comportamento correta desta feature, sem relação com a lógica de virtualização em si. | **Resolvido** (aprovado pelo usuário como desvio pequeno, mesma categoria do R-009): `for (let i = 0; i < 10; …)` → `40`, com comentário explicando a causa. Nenhuma asserção foi tocada — só o parâmetro de simulação. 2 execuções consecutivas verdes depois da correção. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-26 | Fase 1 (Setup) | Fixture + `paridade-visual.mjs` criados, `evidencias/antes/` capturada (8/8). Baseline de vitest (736/744, 5 contratos vermelhos + 3 flakes conhecidas) e dos 8 scripts de E2E registrado. Desvio pequeno aprovado: `favoritos.mjs` tinha bug pré-existente (ArrowUp desatualizado da feature 018) — corrigido junto com o fallback Windows em `favoritos.mjs`/`zapping-live-tv.mjs` (R-009). `m3u-sob-demanda.mjs` intermitente neste ambiente, não investigado (fora de escopo, R-010). | Nenhuma |
| 2026-09-26 | Fase 2 (Foundational) | Tokens V14 completos em `index.css` (D-001), com os nomes antigos como alias de mesmo valor; regra de foco reescrita em tokens (D-008), aparência idêntica. `tokens.test.ts` (74 casos) confere presença + paridade de valor. Achado: `.css?raw`/`?inline` voltam vazio sob Vitest (mock automático) — contornado com `node:fs` + `/// <reference types="node" />` (tsconfig.app.json restringe `types`). Suíte completa 810/818 (5 contratos esperados + 3 flakes conhecidas sob paralelismo, confirmadas isoladas). | Nenhuma |
| 2026-09-26 | Fase 3 (US1) | 8 `.woff2` (Fontsource v5) vendorizados em `src/assets/fonts/` + licenças OFL, `styles/fonts.css` com `@font-face`/`font-display: swap`, Google Fonts removido de `index.html`, `lang="pt-BR"`. `findUnlistedFiles` implementado e ligado ao `sync-tizen.mjs` como guarda pré-cópia (D-009); as 8 fontes adicionadas em `tizen_web_project.yaml`. `npm run build:tizen` verde; guarda testada de propósito (bloqueou um arquivo fictício). Verificado no navegador: fontes carregam, zero requisição externa. Contratos C1/C2 verdes. | Nenhuma |
| 2026-09-26 | Fase 4 (US2) | `computeStageLayout` (identidade em 1920×1080, `translate()+scale()` caso contrário) + componente `Stage` montado em `main.tsx`, recalculando só `style.transform` no `resize` (sem remontar filhos — foco sobrevive). `.stage` sem `background` (D-003) — regras de `video-plane-visible` conferidas, sem precisar de ajuste (seletores não dependem de profundidade a partir de `#root`). Confirmado no navegador em 1920×1080 (identidade) e 1280×720 (scale 0.666…, captura de tela sem corte). `PlayerLayer` 46/46 sem alteração. Contrato C3 verde. | Nenhuma |
| 2026-09-26 | Fase 5 (US3) | `AnnouncerRegion` (região `aria-live="polite"` persistente, montada dentro do `Stage`) + `useAnnounce` (slot `.sr-only`, limpa-e-regrava). `Toast` lê `AnnouncerContext`: sem região, comportamento antigo intacto; com região, portado pra dentro dela via `createPortal`, sem `role` próprio — `useToast().toastKey` (contador real) o remonta a cada exibição, inclusive texto repetido (D-004, `logic/regiao-de-anuncio.md`). `messageKey` passado nas 8 ocorrências de `<Toast>` em 5 telas — nenhuma outra mudança nelas (D-010). Prova de ponta a ponta: `node e2e/favoritos.mjs` 18/18 no app real (dev server), sem duplicação de texto fora do jsdom. Contrato C4 verde. | Nenhuma |

| 2026-09-26 | Fase 6 (US4) | `motionPreference.ts`: `resolveStorage` distingue `storage` omitido (tenta `window.localStorage`, `null` se indisponível) de explícito (usado como está, inclusive `null`) — é o que deixa os testes simularem "sem armazenamento" sem mexer no `window` de verdade. Regra de redução em `index.css` duplicada sob a media query e `:root.reduce-motion`, só zerando duração (estado final do foco intacto). `applyMotionPreference()` chamado em `main.tsx` antes do `createRoot(...).render`. Confirmado no navegador com as duas fontes independentemente (emulação de media query, e via `localStorage` + reload). Contrato C5 verde — **os 5 contratos da feature (C1–C5) estão todos verdes**. | Nenhuma |

| 2026-09-26 | Fase 7 (US5) | Utilitários de estado em `utilities.css`: `.no-scale` (mantém a receita de foco sem escala), `.pressed` (feedback tátil), `.is-soft-disabled`/`.is-hard-disabled` (aparência apenas — tirar da ordem de foco é responsabilidade de quem renderiza, D-007). Conjunto de 17 ícones SVG (`iconPaths.ts`, formas como dados + `Icon.tsx` traduzindo em elementos — sem JSX no `.ts`), nome acessível condicional (`role="img"`+`aria-label` com `label`, `aria-hidden` sem). Confirmado que nenhuma tela importa `Icon` ainda (FR-022). | Nenhuma |
| 2026-09-26 | Fase 8 (Polish) | Capturas "depois" (14, incl. 720p/4K) comparadas manualmente com "antes": zero diferença de layout em 1920×1080 (SC-003), escala correta noutras resoluções (SC-004). Suíte completa 858/861 (3 flakes conhecidas). E2E: `e2e.mjs` falha como na baseline (R-005); dois achados de **outras features**, ambos corrigidos como desvio pequeno aprovado pelo usuário — `favoritos.mjs` tinha `ArrowUp` desatualizado desde a feature 018 (R-009, já corrigido na Fase 1) e `capa-real.mjs` (feature 015) assumia uma janela de virtualização do tamanho do viewport real, que o palco fixo desta feature genuinamente mudou (R-011, causa confirmada experimentalmente: contagem idêntica de itens pré-carregados em 1280×720 e 1920×1080, provando que é a área de layout do `.stage` — não mais o viewport do navegador — que decide isso agora). `tsc`/lint/`build:tizen` limpos. `CLAUDE.md` atualizado com o resumo da feature. TV física (R-012) conscientemente não executada, decisão do usuário. | R-012 (TV física, não bloqueante) |

**PRÓXIMO**: Feature código-completa. Próximo passo natural é `/sdd-converge` nesta feature, e depois `/sdd-specify` da Onda 1 (feature 022 — biblioteca de componentes, consumindo os ícones/utilitários desta feature).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/assets/fonts/` — 8 `.woff2` + `OFL-Poppins.txt`/`OFL-Inter.txt`
- `tv-web/src/styles/fonts.css` — `@font-face` locais
- `tv-web/scripts/tizenFiles.mjs` (+ `.test.mjs`) — `findUnlistedFiles`
- `tv-web/scripts/sync-tizen.mjs` — guarda pré-cópia (D-009)
- `CCPlayTv/tizen_web_project.yaml` — 8 fontes em `files:`
- `tv-web/index.html` — `lang="pt-BR"`, sem Google Fonts
- `tv-web/src/index.css` — tokens V14 completos + aliases + foco em tokens
- `tv-web/src/styles/tokens.test.ts` — paridade de tokens (74 casos)
- `tv-web/e2e/fixtures/paridade-visual.m3u`, `tv-web/e2e/paridade-visual.mjs` — evidência de paridade (D-011)
- `sdd/specs/021-fundacao-visual-ds-v14/evidencias/antes/` — 8 capturas
- `tv-web/e2e/favoritos.mjs`, `tv-web/e2e/zapping-live-tv.mjs` — corrigidos (R-009, fora do escopo original mas aprovados como desvio pequeno)
- `tv-web/src/lib/stage.ts`, `tv-web/src/components/Stage.tsx` (+ `.test.tsx`) — palco escalado
- `tv-web/src/components/AnnouncerRegion.tsx`, `tv-web/src/lib/announcer.ts` (+ `.test.tsx`) — região de anúncio
- `tv-web/src/components/Toast.tsx` (+ `.test.tsx`), `tv-web/src/lib/useToast.ts` — toast sem duplicação
- `tv-web/src/styles/utilities.css`, `tv-web/src/main.tsx` — `.stage`/`AnnouncerRegion` montados na raiz + `applyMotionPreference()` antes do render
- `tv-web/src/lib/motionPreference.ts` (+ `.test.ts`) — reduzir movimento
- `tv-web/src/index.css` — regra de redução de movimento (media query + `:root.reduce-motion`)
- `tv-web/src/styles/utilities.css` (+ `.test.ts`) — `.no-scale`/`.pressed`/soft-hard disabled
- `tv-web/src/components/iconPaths.ts`, `tv-web/src/components/Icon.tsx` (+ `.test.tsx`) — 17 ícones
- `tv-web/e2e/capa-real.mjs` — corrigido (R-011, fora do escopo original mas aprovado como desvio pequeno)
- `sdd/specs/021-fundacao-visual-ds-v14/evidencias/depois/` — 14 capturas
- `CLAUDE.md` — status da feature + seção "Design system" atualizados

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- **`.css?raw`/`.css?inline` sob Vitest voltam string vazia** — `vite.config.ts` não liga `test.css`, e o Vitest troca todo import de `.css` por um módulo vazio por padrão, com ou sem query de asset. Pra ler CSS de verdade num teste, usar `node:fs` (`readFileSync(path.resolve(process.cwd(), 'src/...'))`), como em `tokens.test.ts` — e lembrar do `/// <reference types="node" />` no topo do arquivo, porque `tsconfig.app.json` restringe `types` a `["vite/client"]` (sem isso, `tsc -b` falha com "Cannot find name 'node:fs'"/`'process'`).
- **`favoritos.mjs`/`zapping-live-tv.mjs`** já têm o fallback `existsSync` pro Windows (R-009) — não precisa mais editar na hora de rodar localmente.
- **`node e2e/m3u-sob-demanda.mjs`** pode falhar de forma intermitente neste ambiente (R-010) — rodar de novo isolado antes de suspeitar de regressão.
