# Quickstart — Busca por categoria com ícone de entrada e "Todos"

Verificação manual (emulador/navegador primeiro; TV física recomendada, não
gate obrigatório desta feature — constitution, "Validação em hardware
real").

## Pré-requisitos

- `npm run dev` rodando em `tv-web/` (http://localhost:5173).
- Uma fonte importada com pelo menos 2 categorias de Live TV, 2 de Filmes
  e 2 de Séries, com nomes de item que permitam testar prefixo/contém
  (ex.: dois itens com "Globo" no nome em categorias diferentes).

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

### A — Buscar dentro de uma categoria

1. Abrir Live TV, entrar numa categoria com vários canais.
2. Subir com ↑ a partir do primeiro canal — o foco deve ir para um ícone
   de busca no topo da lista, junto ao título da categoria.
3. Confirmar (OK) — um campo de texto substitui a lista, com foco real do
   teclado do sistema.
4. Digitar parte do nome de um canal desta categoria — só ele (e outros
   desta MESMA categoria que batam) aparece.
5. Digitar parte do nome de um canal que existe só em OUTRA categoria —
   nenhum resultado.
6. Confirmar um resultado — o canal toca, como na navegação normal.

### B — "Todos"

1. Voltar à trilha de Live TV; a segunda entrada (logo após "★
   Favoritos") deve ser "Todos".
2. Entrar em "Todos" — canais de mais de uma categoria já visitada
   aparecem juntos, sem precisar buscar.
3. Se houver categoria de canal nunca aberta, a tela informa "Busca em X
   de Y categorias" mesmo sem estar buscando.
4. Acionar o ícone de busca dentro de "Todos" e digitar o nome de um
   canal de qualquer categoria já coberta — ele aparece.

### C — RETURN em camadas

1. Dentro de uma busca ativa com um resultado focado, apertar RETURN —
   volta o foco ao campo (termo continua lá).
2. RETURN de novo a partir do campo — fecha a busca, volta a mostrar a
   lista normal da categoria (sem sair dela).
3. RETURN de novo — sai da categoria para a trilha.

### D — Repetir A-C em Filmes e Séries

Mesmo roteiro, na grade de pôsteres. Confirmar que abrir um filme/série a
partir de um resultado de busca e voltar restaura o termo, os resultados e
o foco no item (mecanismo herdado da feature 017, D-007).

### E — Favoritos

Com itens favoritados, entrar em "★ Favoritos", acionar o ícone e
confirmar que a busca filtra só os favoritos daquele tipo.

### F — Zapping (Live TV)

Com um canal tocando em tela cheia, apertar OK para abrir a lista de
zapping por cima do vídeo — "Todos" deve aparecer na trilha (navegável,
trocando de canal normalmente); o ícone de busca NÃO deve aparecer
enquanto o zapping estiver aberto.

## Itens do checklist pré-aceite (constitution)

- Toda categoria/Favoritos/Todos vazia ou carregando continua com pelo
  menos um elemento focável (sem o ícone de busca, que não aparece nesses
  estados).
- RETURN sempre sai, em qualquer camada — nunca prende o controle.
- Nenhuma chamada de rede/log contém o termo digitado.
