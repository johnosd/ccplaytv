# Quickstart — Histórico e Continuar Assistindo

Verificação manual (emulador/navegador — TV física não é gate obrigatório
para esta feature, constitution "Validação em hardware real").

## Pré-requisitos

- `npm run dev` rodando em `tv-web/` (http://localhost:5173).
- Uma fonte importada com: pelo menos 1 filme curto (ou um adaptador de
  dev que permita simular posição/duração), e pelo menos 1 série com 2+
  episódios.

## Checagens automatizadas (rodar antes de qualquer verificação manual)

```powershell
cd tv-web
npx tsc -b
npx vitest run
npm run lint
npm run build
npm run test:e2e   # com npm run dev já rodando
```

## Cenário ponta a ponta

### A — Filme marcado como assistido automaticamente

1. Abrir um filme, assistir até ultrapassar 90% da duração (ou simular
   via `<video>` de dev disparando `timeupdate`/`ended`).
2. Sair, reabrir o detalhe do mesmo filme.
3. Confirmar: a ação primária voltou a ser "Assistir" (não "Retomar"), e
   a nova ação "Desmarcar assistido" aparece na lista de ações.
4. Se a grade de Filmes tiver o selo (D-006): confirmar que o card desse
   filme mostra "Assistido".

### B — Corrigir manualmente

1. No detalhe de um filme nunca assistido, navegar até a ação "Marcar
   como assistido" e confirmar (SELECT).
2. Confirmar que o selo aparece (detalhe e, se aplicável, grade).
3. Confirmar (SELECT) de novo na mesma ação (agora "Desmarcar assistido")
   e confirmar que volta ao estado anterior.

### C — Série "Em dia"

1. Abrir o detalhe de uma série nunca aberta antes — confirmar que a
   grade de Séries não mostra nenhum selo de progresso para ela (cobertura
   zero, D-007).
2. Assistir/marcar todos os episódios conhecidos dessa série até o fim.
3. Voltar à grade de Séries — confirmar que o card agora mostra "Em dia".
4. Assistir só parte dos episódios de outra série (com 2+) — confirmar
   que o card mostra a contagem parcial ("X/Y"), nunca "Em dia".

### D — Continuar assistindo no hub da fonte

1. Começar a assistir um filme ou episódio, sair antes do fim (com
   progresso salvo, acima do limiar mínimo de retomada).
2. Voltar ao hub da fonte ("O que você quer assistir?").
3. Confirmar que a seção "Continuar assistindo" aparece, com esse item.
4. Navegar até o item e confirmar (SELECT) — confirmar que abre
   retomando a posição salva, igual à navegação normal.
5. Assistir esse mesmo item até passar do limiar de conclusão — voltar
   ao hub e confirmar que ele NÃO aparece mais em "Continuar assistindo".
6. Sem nenhum item com progresso: confirmar que a seção não aparece, e
   que o hub continua navegável normalmente pelos 3 tiles.

## Itens do checklist pré-aceite (constitution)

- Nenhuma leitura desta feature dispara rede ao focar/renderizar um card
  (o selo de série nunca chama `get_series_info`/`fetchSeriesInfo`).
- "Em dia" nunca aparece com cobertura parcial, mesmo que os episódios
  conhecidos estejam todos assistidos.
- A ação de marcar/desmarcar e a seção "Continuar assistindo" são
  alcançáveis inteiramente por seta + SELECT; RETURN sempre sai sem
  prender o controle.
- Canal ao vivo não ganhou nenhum indicador novo.
