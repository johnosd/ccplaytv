# Implementation Plan: Splash, ícone do app e Home de perfis/listas

**Slug**: `002-splash-home-perfis` | **Date**: 2026-09-15 | **Spec**: `sdd/specs/002-splash-home-perfis/spec.md`

## Summary

Fecha a lacuna entre o que a Home real faz hoje e o que a spec exige:
(1) gerar um `icon.png` novo pro app Tizen com o mesmo tratamento visual da
Splash; (2) a `HomeScreen` hoje trata "carregando" e "sem lista" como o
mesmo caso (`data?.sources ?? []`), causando um flash real do formulário
antes dos cards aparecerem — precisa de um terceiro estado explícito de
carregamento/erro; (3) quando vazia, a Home precisa renderizar o
`AddSourceScreen` **inline** (composição, não uma transição de tela via
roteador) pra que o botão Voltar dessa instância dispare um novo diálogo de
confirmação de saída, em vez do `back()` genérico já usado quando o mesmo
formulário é aberto a partir do card "+" (com listas já existentes). Splash
(`SplashScreen.tsx`) já implementa integralmente FR-001/FR-002 — não
precisa de mudança nesta feature.

## Technical Context

**Language/Version**: TypeScript 5 / React 19, Vite 8 (frontend); sem
mudança de backend nesta feature (Python 3.13/FastAPI já existente, só
consumido via `GET /sources` já implementado).

**Primary Dependencies**: `@tanstack/react-query` (já em uso via
`importApi.ts`), nenhuma dependência nova.

**Storage**: N/A — reaproveita `Source` já persistida (feature 001).

**Testing**: `vitest` + `@testing-library/react` (padrão já estabelecido em
`ImportProgressScreen.test.tsx`/`importApi.test.tsx`).

**Target Platform**: Tizen 9.0 (Samsung QN50Q60DAGXZD, engine de referência
da constitution é Tizen 8.0/Chromium 108) + navegador de desenvolvimento.

**Performance Goals**: N/A — sem operação pesada nova.

**Constraints**: `window.tizen` só existe no runtime real da TV — todo
código que chama a Web API de saída precisa de guard de ambiente
(`typeof window.tizen?.application?.... === 'function'`), testável em
navegador sem quebrar.

**Scale/Scope**: 1 ícone estático, 1 tela (Splash, sem mudança), 1 tela
remodelada (Home) + 1 componente novo (diálogo de confirmação).

## Decisões Invariantes

- A Home, quando vazia, renderiza o **mesmo componente** `AddSourceScreen`
  usado pelo card "+" — nunca um formulário duplicado/paralelo. A diferença
  de comportamento (o que `onBack` faz) vem só da prop passada por quem
  renderiza, não de uma segunda implementação.
- O estado "vazio mostra formulário" **nunca** passa pelo roteador de
  `App.tsx` como uma transição de tela — é uma decisão de renderização
  interna da própria `HomeScreen`, componível com o novo estado de
  loading/erro sem introduzir uma quarta tela no `switch` de `App.tsx`.
- O diálogo de confirmação de saída é um componente genérico reutilizável
  (`ConfirmDialog`), não amarrado à palavra "sair" — outras features
  futuras podem reaproveitar pra outras confirmações destrutivas (ex.:
  excluir lista, se algum dia precisar de confirmação).
- Geração do `icon.png` é uma etapa de build-asset one-off (script
  PowerShell, ver `research.md`), não uma dependência nova do projeto nem
  um passo do `npm run build`.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | N/A | N/A | Feature não introduz login/conta. |
| Segredos Fora dos Clientes e dos Logs | Compatível | Compatível | Cards da Home já usam `SourceOut` (sem senha/URL completa) — nenhuma mudança nesse contrato. |
| Categorias da Fonte São Preservadas | N/A | N/A | Sem toque em classificação/grupos. |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | Sem IA/classificação nesta feature. |
| Comandos Locais Independem de Rede, Backend ou IA | Compatível | Compatível | Navegação, diálogo de confirmação e saída do app são 100% locais — a única chamada de rede (`GET /sources`) já existe e não bloqueia foco/Voltar. |
| Trailers e Metadados Não Alteram Estado Principal | N/A | N/A | Sem trailers/metadados nesta feature. |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | Compatível, com atenção | Compatível | Exige que RETURN feche primeiro o diálogo de confirmação aberto antes de sair da tela — modelado explicitamente no design do `ConfirmDialog` (§ Fase 1), não deixado implícito. |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | N/A | N/A | Sem parsing de M3U nesta feature. |

Nenhuma violação — nada em `## Complexity Tracking`.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/002-splash-home-perfis/
├── spec.md
├── plan.md
├── research.md
├── quickstart.md
└── tasks.md
```

(Sem `data-model.md`/`contracts/` — nenhuma entidade ou superfície de API
nova; `GET /sources` já existe desde a feature 001.)

### Source Code (repository root)

```text
api/                          # Sem mudança nesta feature
tv-web/
├── index.html                # Título/ícone web (não o icon.png do Tizen)
├── src/
│   ├── App.tsx                       # Roteador — pequeno ajuste de props passadas à HomeScreen
│   ├── index.css                     # Tokens de design já existentes, reaproveitados
│   ├── components/
│   │   ├── Toast.tsx                 # Já existe
│   │   └── ConfirmDialog.tsx         # NOVO
│   ├── features/
│   │   ├── home/HomeScreen.tsx       # Remodelada: loading/erro/vazio-inline/cards
│   │   ├── import/AddSourceScreen.tsx # Sem mudança de lógica — já aceita onBack como prop
│   │   ├── splash/SplashScreen.tsx   # Sem mudança — já implementa FR-001/002
│   │   └── screens.css               # + classes do ConfirmDialog
│   └── lib/
│       ├── useRemoteNav.ts           # Reaproveitado pelo ConfirmDialog
│       └── tizenExit.ts              # NOVO — wrapper da Web API de saída
CCPlayTv/
├── config.xml                 # Referencia icon.png — sem mudança de path
└── icon.png                   # SUBSTITUÍDO — gerado via script (ver research.md)
```

**Structure Decision**: mesma estrutura de `tv-web/src/features/<área>/` já
estabelecida pela feature 001 — nenhuma pasta nova além de `components/`
(já existe, ganha um arquivo) e o `icon.png` do projeto Tizen scaffolded
(`CCPlayTv/`), que já existe e é só substituído no lugar.

## Complexity Tracking

Nenhuma violação a justificar.

## Estratégia de Testes

Prioridade: unitário (vitest/testing-library) → manual (navegador, depois
TV física) — sem contrato/integração/E2E dedicados porque a feature não
adiciona endpoint de API.

Comandos-base:

```powershell
cd tv-web
npx tsc -b
npm run lint
npx vitest run
npm run build
```

Casos de unitário a cobrir (novos, além do que já existe):

- `HomeScreen`: estado de loading (`useSources().isLoading`) mostra
  indicador, não formulário nem cards; estado de erro mostra mensagem;
  vazio (sem loading/erro, `sources.length === 0`) renderiza o formulário
  inline; com 1+ fontes, renderiza os cards (comportamento já coberto
  implicitamente, sem teste dedicado hoje — este é o momento de acrescentar
  um teste real dado que a lógica fica mais crítica).
- `ConfirmDialog`: navegável por setas/OK, `onCancel` fecha (chamado
  também pelo Back), `onConfirm` só dispara com confirmação explícita.
- `tizenExit.ts`: chama `window.tizen.application.getCurrentApplication().exit()`
  quando presente; não lança erro quando `window.tizen` é `undefined`.

## Estado Atual

| Área | Estado |
| --- | --- |
| Toolchain | Verde (`tsc -b`, `oxlint`, `vitest` 15/15, `vite build`). |
| `tizenExit.ts` | Implementado e testado — `exitApp()` com guard de `window.tizen`, no-op fora da TV. |
| `ConfirmDialog` | Implementado e testado — navegação por `useRemoteNav({modal:true})` (fase de captura), Back sempre cancela. |
| `HomeScreen` remodelada | Implementada e validada em navegador real (Playwright): loading/erro/vazio-inline/cards, sem flash. |
| Ícone do app | Gerado (`CCPlayTv/icon.png`, 117×117) — **falta validação visual na TV física**. |
| `screens.css` | Corrigido bug real: nunca estava importado (R-004) — agora aplicado em toda a UI, confirmado visualmente. |
| Verificação end-to-end | US1/US2 confirmadas em navegador com backend/Postgres reais, incluindo um import real completo (311.969 entradas, 0 inválidos) através da Home remodelada. |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | `hwkey-event="enable"` já está configurado em `CCPlayTv/config.xml` (feature 001) — sem isso, o runtime Tizen poderia interceptar a tecla Voltar na raiz do app e minimizar/sair sozinho, sem nunca disparar nosso diálogo de confirmação. | Alto, se regredir — a US1 inteira depende disso. | Já mitigado por config existente; não precisa de mudança nesta feature, só confirmação durante o teste manual na TV (`quickstart.md`). |
| R-002 | `window.tizen` não existe em navegador de desenvolvimento — testar a confirmação de saída "de verdade" (processo encerrando) só é possível na TV física. | Baixo — comportamento local, sem dado em jogo; consistente com a constitution ("validação em hardware real... não é gate obrigatório"). | Guard de ambiente no `tizenExit.ts` + teste unitário cobre a chamada condicional; verificação end-to-end do encerramento real fica pro passo manual na TV do `quickstart.md`. |
| R-004 | **Bug real encontrado durante T013 (primeira verificação em navegador de verdade desta feature)**: `tv-web/src/features/screens.css` — criado numa sessão anterior com todas as classes de design system (cards, formulário, tabs, etc.) — nunca foi importado em nenhum arquivo (`main.tsx`, `App.tsx`). Passava em `tsc`/`oxlint`/`vitest`/`vite build` normalmente (nada disso detecta um CSS órfão), então só apareceu ao abrir a página de verdade: layout completamente sem estilo, tudo espremido numa única linha. | Alto — nenhuma tela desta feature (nem das anteriores que já usavam essas classes) estava realmente estilizada em produção, apesar de todos os testes automatizados passarem. | **Resolvido**: adicionado `import './features/screens.css'` em `tv-web/src/main.tsx`, junto do `index.css` já existente. Confirmado visualmente via Playwright (MCP) após a correção — layout completo, cores, foco e animações corretos. **Lição**: testes automatizados (tsc/lint/vitest/build) não substituem verificação visual real — nenhum deles pega um `<link>`/import de CSS esquecido. |
| R-003 | **Bug real encontrado durante T008**: `useTvKeyNav` e `useRemoteNav` registram cada um seu próprio `document.addEventListener('keydown', ...)`, sem noção de sobreposição. Com o `ConfirmDialog` aberto por cima do `AddSourceScreen` renderizado inline pela Home vazia, as duas camadas reagiriam à mesma tecla simultaneamente (ex.: Enter podia submeter o formulário por baixo *e* confirmar o diálogo por cima no mesmo evento). | Alto, se não corrigido — comportamento imprevisível/duplo exatamente no fluxo mais crítico desta feature (US1). | **Resolvido** — tentativa 1 (pilha de camadas em `keyLayerStack.ts`) foi **abandonada**: quebrava telas que já usam `useTvKeyNav` *e* `useRemoteNav` juntas (`AddSourceScreen`/`ImportProgressScreen`), porque cada hook empurrava sua própria camada e competia consigo mesmo dentro do mesmo componente. Solução final: `useRemoteNav` ganhou uma opção `{ modal: true }` (só usada por `ConfirmDialog`) que registra o listener na **fase de captura** e chama `stopImmediatePropagation()` — intercepta a tecla antes de qualquer listener de bubble-phase por baixo, sem exigir que as telas normais saibam de nada. `useTvKeyNav`/`useRemoteNav` sem `modal` voltaram exatamente ao comportamento original. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-15 | Fase 1 (Setup) + Fase 2 (Foundational) | Toolchain confirmado verde; `tizenExit.ts` e `ConfirmDialog` implementados e tipados/lintados limpos (testes dedicados ficam pra Fase 3, junto do `HomeScreen.test.tsx`). | Nenhuma. |
| 2026-09-16 | Fase 3 (US1) + Fase 4 (US2) | `HomeScreen` remodelada (4 ramos), `App.tsx` ajustado, 15 testes novos/atualizados verdes. Bug ad-hoc T007a: conflito de teclado entre `ConfirmDialog` e a tela por baixo — resolvido com opção `{modal:true}` em `useRemoteNav` (captura + `stopImmediatePropagation`), não com pilha de camadas (tentativa abandonada, quebrava telas que usam os dois hooks juntos). | Nenhuma. |
| 2026-09-16 | Fase 5 (US3) + Fase 6 (Polish) | Ícone gerado via script GDI+ one-off (`CCPlayTv/icon.png`). Bug real T013a: `screens.css` nunca importado — toda a UI estava sem estilo em produção apesar de todos os testes automatizados passarem; corrigido (`import` em `main.tsx`). Verificação end-to-end em navegador real (Playwright/MCP) contra backend+Postgres reais: US1 completo incluindo diálogo de saída (abrir/cancelar/reabrir), US2 (cards sem flash), FR-007, e um import real de 311.969 entradas/0 inválidos através do fluxo novo, ponta a ponta. | Validação do ícone (US3) na TV física — não executada nesta rodada (precisa do pipeline de deploy + acesso ao hardware). |

**PRÓXIMO**: Validar visualmente o ícone (`icon.png`) na TV física após reinstalação (`build:tizen` + `tz pack` + Apps2Samsung) — único item pendente antes de rodar `sdd-converge`.

## Arquivos Principais

- `tv-web/src/features/home/HomeScreen.tsx`
- `tv-web/src/components/ConfirmDialog.tsx`
- `tv-web/src/lib/{tizenExit,useRemoteNav,useTvKeyNav}.ts`
- `tv-web/src/main.tsx` (import de `screens.css`)
- `CCPlayTv/icon.png`

## Cuidados para Retomada

- **Sempre verificar visualmente em navegador antes de considerar uma tela
  "pronta"** — `tsc`/`oxlint`/`vitest`/`vite build` não detectam um arquivo
  CSS criado mas nunca importado (R-004); só apareceu ao abrir a página de
  verdade via Playwright.
- Servidores de dev (`uv run python main.py` em `api/`, `npm run dev` em
  `tv-web/`) e o **Docker Desktop** (Postgres) não sobrevivem entre sessões/
  janelas de contexto longas — sempre confirmar `GET /health` e `GET
  /sources` antes de testar manualmente, e checar `docker ps` antes de
  assumir que o Postgres está de pé (o daemon do Docker Desktop também pode
  estar completamente parado, não só o container).
- O banco de dev local acumula fontes de teste de sessões/pytest anteriores
  (não isolado) — para testar o estado "nenhuma lista cadastrada" (US1) de
  verdade em navegador, é preciso limpar a tabela (`TRUNCATE catalog_items,
  import_jobs, sources CASCADE` via `docker exec <container> psql ...`);
  são só fixtures descartáveis de teste, nunca dado real de usuário.
