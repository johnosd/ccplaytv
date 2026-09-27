# Quickstart: verificação da feature 023 (Shell, navegação e entrada)

## Pré-requisitos

- `tv-web/` com dependências instaladas (`npm ci`).
- Dev server **recém-iniciado**: `npm run dev` em `tv-web/`, na porta 5173.
  Um servidor aberto há horas deixou a sequência de E2E instável na feature
  022. Reinicie antes de rodar E2E.
- Duas listas M3U fictícias (as fixtures de `tv-web/e2e/fixtures/` servem).
  **Nunca** use os dados de `docs/m3u/dados.md`.

## Checagens automatizadas

```powershell
cd tv-web
npx vitest run src/navigation/appNav.shell-navegacao.contract.test.ts src/features/profiles/ProfilesScreen.shell-navegacao.contract.test.tsx   # 5/5 contratos
npm run test          # suíte inteira
npm run lint
npm run build         # tsc -b + vite build
npm run build:tizen   # a guarda de files: do tizen_web_project.yaml não pode acusar nada
npm run test:e2e      # com o dev server de pé
cd ..
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 023-shell-navegacao-entrada-ds-v14
```

As travas das features anteriores também precisam continuar íntegras. Em
especial, `LiveScreen.busca-categoria.contract.test.tsx` e
`PlayerLayer.ciclo-vida-player.contract.test.tsx` não podem ser editados.

## Cenário ponta a ponta (navegador, 1920×1080)

Limpe o IndexedDB e o `localStorage` do site antes de começar.

1. **Sem lista**: abrir o app. O Splash V14 aparece, depois "Quem está
   assistindo?" só com "Adicionar lista", focado. RETURN abre "Sair do
   CCPlayTV?" com Cancelar focado. RETURN fecha.
2. **Adicionar lista**: OK em "Adicionar lista". O onboarding tem os
   rótulos permanentes e o cartão "Conectar pelo celular". OK nele anuncia
   "Em breve" e nada muda. Preencher e salvar. O progresso mostra
   etapas/contagens reais. Ao concluir, "Abrir lista" leva ao Início da
   lista (topbar com o nome dela).
3. **Início**:
   - o foco começa em "TV ao vivo";
   - UP (sem histórico) leva à topbar em "Início";
   - DOWN volta a "TV ao vivo";
   - na topbar, RIGHT até "Filmes" e OK abre Filmes;
   - RETURN volta ao Início com o foco em "Filmes" na topbar.
4. **Busca e Configurações** na topbar: OK anuncia "Em breve — …", sem
   navegar.
5. **Relógio**: confere com o do sistema e vira no minuto.
6. **Segunda lista**:
   - no indicador da lista ativa, OK abre os perfis com foco na lista
     atual, e RETURN volta ao Início;
   - de novo no indicador, "Adicionar lista" leva ao Início da lista nova;
   - fechar a aba e reabrir: o foco dos perfis está na última lista usada.
7. **Gestão**:
   - DOWN num cartão mostra as ações, com foco em Ressincronizar;
   - Editar e salvar volta aos perfis;
   - Excluir abre o modal com Cancelar em foco, e OK duplo não apaga nada;
   - confirmar apaga, e o foco vai para o cartão vizinho.
8. **Muitas listas** (FR-012, só verificável em navegador real, porque o
   jsdom não calcula layout):
   - cadastrar 6 ou mais listas (a mesma fixture com nomes diferentes serve);
   - na tela de perfis, RIGHT até o último cartão e até "Adicionar lista":
     cada cartão focado fica inteiro dentro do palco, e a fileira rola
     acompanhando o foco;
   - LEFT de volta até o primeiro cartão rola no sentido contrário;
   - DOWN no último cartão visível mostra as ações sem cortá-las;
   - nomes longos aparecem com reticências, no cartão e no indicador da
     topbar.
9. **Detalhe e volta**:
   - Filmes → categoria → detalhe → RETURN restaura a categoria, o scroll e
     o item;
   - RETURN de novo volta ao Início;
   - "Continuar assistindo" → detalhe → RETURN volta ao mesmo item da rail.
10. **Offline**: DevTools → Network → Offline. O banner aparece no Início e
   a navegação continua. Voltar para Online some com o banner.
11. **Reduzir movimento**: `localStorage['ccplaytv:reduce-motion']='true'`
    e recarregar. O Splash e o foco não animam.

## Itens cross-cutting da constitution

- Nenhum cartão, indicador, anúncio ou erro mostra URL, usuário, senha ou
  DNS de provedor (FR-048). Confira o cartão de uma lista Xtream.
- Todo estado tem elemento focável e ativável: carregando, vazio, erro e
  os dois modais (FR-042).
- Nenhum mock mostra dado inventado. Os três "Em breve" estão em
  `tv-web/src/lib/comingSoon.ts`.

## TV física

Não é gate desta feature. É recomendada ao fim da Onda 3 (medição de
desempenho, R-2 do roteiro). Se fizer uma passada (`tizen-tv`), confira
também:

- RETURN (10009) no Início abre o modal de saída;
- "Sair" encerra o widget;
- o relógio e a topbar ficam dentro da safe zone.
