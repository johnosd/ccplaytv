# Implementation Plan: Virtualização de Grades e Foco Direcional

**Slug**: `009-virtualizacao-foco`

## Summary
Refatorar as listas de conteúdo no app (focado inicialmente na `LiveScreen`, estendível a Filmes e Séries) para usar renderização virtualizada (TanStack Virtual), permitindo exibir dezenas de milhares de itens de forma fluida na TV. Ao mesmo tempo, sincronizar a virtualização com a engine de Spatial Navigation (Norigin), garantindo que o scroll acompanhe a navegação por setas (DPAD).

## Technical Context
- **Linguagem/Framework**: TypeScript, React (Vite).
- **Virtualização**: `@tanstack/react-virtual`.
- **Engine de Foco**: `@noriginmedia/norigin-spatial-navigation`.
- **Desafio Arquitetural**: O `norigin-spatial-navigation` depende de encontrar o elemento no DOM para focar. Se o elemento não está no DOM (está virtualizado e fora da tela), o foco não pode pular para ele diretamente. Precisamos do padrão documentado: "próximo índice → deslocar grade virtual (scroll) → aguardar montagem no DOM → focar novo elemento montado".

## Decisões Invariantes
- **Hand-off Controlado**: A seta `Right` nas categorias deve entrar na lista de canais/conteúdo virtualizado na última posição focada (ou na primeira). A seta `Left` na lista virtualizada deve retornar o foco à barra de categorias sem perder o scroll state.
- **Não-Circulação**: O foco NÃO deve saltar da última posição da lista de volta para a primeira (diretrizes de design de TV, "Foco não salta inesperadamente para o lado oposto").
- **Preservação de Scroll e Foco**: Mudar de filtro/categoria, ou dar "Voltar" (RETURN) de um submenu, exige preservar ou restaurar o identificador do item e sua posição, usando chaves estáveis.

## Constitution Check
| Princípio | Avaliação (Pré-Design) | Avaliação (Pós-Design) |
|---|---|---|
| Client-first architecture | Atende: Virtualização reduz consumo de memória cliente para coleções locais enormes. | Atende. |
| Testabilidade | Atende: Funções lógicas de scroll e cálculos de viewport serão separadas da UI React. | Atende. |
| Navegação por TV (10-foot) | Atende: O escopo é 100% focado no modelo DPAD, garantindo performance de setas pressionadas seguidamente. | Atende. |

## Complexity Tracking
- **Violação**: Nenhuma.
- **Complexidade Intencional**: Sincronizar estado React, DOM, TanStack Virtual e Norigin.
- **Por que é necessária**: Porque TVs Tizen e WebOS têm memória baixíssima (muitas limitam abas a 150MB~300MB de RAM) e não suportam criar 10.000 nós no DOM. A complexidade do virtual scroll é indispensável para IPTV.

## Estratégia de Testes
- **Testes Unitários**: Lógica pura de predição do próximo índice, limitadores de array (`clamp`), cálculos de overscan.
- **Integração JSDOM**: Componente de lista mockado testando o dispatch de eventos `ArrowDown` e conferindo a chamada das APIs `scrollToIndex` do TanStack.
- Comando: `npx vitest run src/features/live`

## Project Structure
- `tv-web/src/features/live/LiveScreen.tsx` (modificado para virtual list)
- `tv-web/src/components/VirtualizedList.tsx` (novo componente agnóstico, se aplicável, ou hook/helper focado)
- `tv-web/src/lib/focus/virtualFocusEngine.ts` (helper de sincronização Norigin/Tanstack)


## Estado Atual
| Área | Estado |
|---|---|
| Infra | Phase 1 concluída |

## Arquivos Principais
- `tv-web/package.json`

## Execution Notes
| Data | Fase/Story | Resumo | Pendência Principal |
|---|---|---|---|
| 2026-09-22 | Phase 1 | Instalação do @tanstack/react-virtual | Ir para Phase 2 |
| 2026-09-23 | Pausa decidida | A Fase 3 (aplicação em `LiveScreen.tsx`) fica pausada até a feature `010-catalogo-sob-demanda` concluir sua Fase 3 (US2). As duas alteram o mesmo arquivo: a 010 muda a leitura de "catálogo inteiro" para "por categoria sob demanda", e refatorar `LiveScreen.tsx` para virtualização antes disso duplicaria trabalho quando a fonte de dados mudar embaixo. Decisão do usuário, registrada em `sdd/specs/010-catalogo-sob-demanda/tasks.md` § "Ordem decidida frente à feature 009". Fases 1 e 2 (helper matemático) não são afetadas e podem continuar. | Retomar a Fase 3 quando `010` fechar o checkpoint da US2 |

PRÓXIMO: Phase 2 - VirtualFocus Helper (Fase 3 pausada — ver nota acima)
