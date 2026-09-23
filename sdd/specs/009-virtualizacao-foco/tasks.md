# Execution Tasks: Virtualização de Grades e Foco Direcional

**Slug**: `009-virtualizacao-foco`

## Path Conventions
- **Componentes**: `tv-web/src/components/`
- **Telas**: `tv-web/src/features/live/`
- **Utilitários de Foco**: `tv-web/src/lib/focus/`

## Phase 1: Setup e Instalação

**Goal**: Incluir a biblioteca TanStack Virtual no projeto (se não estiver).

**Implementation**:
- [ ] 1. Checar se `@tanstack/react-virtual` está no `package.json`. Se não, `npm install @tanstack/react-virtual`.

**Tests**:
- [ ] 2. `npm run build` passa (ou tsc passa sem quebrar tipos).

**Critério de Conclusão**: Dependência instalada e disponível para importação.

**Registro da Fase**:
- Status: 
- Feito: 
- Testes executados: 
- Pendências: 

## Phase 2: VirtualFocus Helper

**Goal**: Criar o utilitário que sincroniza a intenção de movimento do Norigin com o scroll do TanStack.

**Implementation**:
- [ ] 1. Em `tv-web/src/lib/focus/virtualFocusHelper.ts`, criar um Hook ou função que intercepta o `onArrowPress` do Norigin na lista virtual.
- [ ] 2. Implementar a lógica: Ao receber `Down`, calcular próximo índice = `currentIndex + 1` (clampado ao max length).
- [ ] 3. Disparar `virtualizer.scrollToIndex(proximo)`.
- [ ] 4. Agendar (`requestAnimationFrame` ou timeout) a aplicação de `setFocus` no id do próximo item recém-montado.

**Tests**:
- [ ] 5. Testar a lógica matemática e de clamping em `virtualFocusHelper.test.ts`.

**Critério de Conclusão**: Helper matemático construído, preparado para lidar com navegação de listas 1D virtuais.

**Registro da Fase**:
- Status: 
- Feito: 
- Testes executados: 
- Pendências: 

## Phase 3: Aplicação na LiveScreen

**Goal**: Refatorar a lista de canais em `LiveScreen.tsx` para usar o Virtualizer.

**Implementation**:
- [ ] 1. Substituir a renderização de `.map` direta no `activeGroup.channels` pelo `useVirtualizer`.
- [ ] 2. Ajustar os estilos CSS (position absolute, transform `translateY`) como o TanStack Virtual exige para rolar os itens.
- [ ] 3. Aplicar o `virtualFocusHelper` nos eventos do contêiner.
- [ ] 4. Tratar Hand-off: Seta Esquerda nos canais joga o foco de volta na `Sidebar` (grupos). Seta Direita na Sidebar joga o foco no canal virtual que estava ativo.

**Tests**:
- [ ] 5. Abrir na TV/Navegador, preencher com mock gigante de 10k canais e garantir que o scroll funciona e os elementos montam/desmontam.
- [ ] 6. Rodar testes unitários do LiveScreen ou relacionados que possam ter quebrado com a mudança visual.

**Critério de Conclusão**: Tela de Live TV navegável com milhares de canais sem perda perceptível de frames, com foco e hand-off funcionando perfeitamente (Arrow Left/Right).

**Registro da Fase**:
- Status: 
- Feito: 
- Testes executados: 
- Pendências: 

## Phase 4: Polish

**Goal**: Cerimônias finais e validações na plataforma.

**Checklist de Release**:
- [ ] Phase 1 a 3 testadas
- [ ] Hand-off entre categorias e lista de canais verificado (ArrowLeft / ArrowRight)
- [ ] Memória limpa e testada (sem warnings de memory leak)

**Registro da Fase**:
- Status: 
- Feito: 
- Testes executados: 
- Pendências: 

