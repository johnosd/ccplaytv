# Quickstart: Busca Local em Live TV, Filmes e Séries

Verificação manual. A parte automatizada (contratos, unitários, E2E) está
em `plan.md` → Estratégia de Testes; aqui fica o que só o controle remoto
e a TV física provam (constitution, "Validação em hardware real").

## Pré-requisitos

- `npm run test`, `npm run lint`, `npm run build` e `npm run test:e2e`
  limpos em `tv-web/` (gate da constitution antes da TV).
- App instalado na TV de referência via skill `tizen-tv`.
- Uma fonte de provedor com algumas categorias já abertas e outras não, e
  (se houver) uma fonte M3U com categorias `stored` ainda não abertas.

## Cenários na TV física

**A — Teclado do sistema abre e digita (R-003).** Live TV → subir até
"🔍 Buscar" → OK. O campo aparece com foco; OK de novo abre o teclado da
TV; digitar "glo" mostra resultados sem precisar confirmar. Backspace do
teclado apaga, não sai da tela.

**B — Done confirma (FR-016, R-003).** Com resultados, apertar "Done" no
teclado: o foco vai para o primeiro resultado. Anotar se a tecla chegou
(se não, ↓ a partir do campo deve funcionar — registrar o que foi visto).

**C — RETURN em camadas (FR-020).** Num resultado, RETURN volta ao campo
com o termo intacto; no campo, RETURN volta à trilha; entrar em "🔍
Buscar" de novo começa vazio.

**D — Cobertura (FR-014).** Numa seção com categorias não abertas, a tela
diz "Busca em X de Y categorias" com números que batem com o que foi
aberto; abrir mais uma categoria e buscar de novo aumenta X.

**E — Volta do detalhe (FR-019 + bug da grade).** Filmes → buscar →
abrir um filme → voltar: termo, resultados e foco no filme aberto. Repetir
pela grade normal (sem busca): categoria, foco e rolagem restaurados.

**F — Canal pela busca.** Tocar um canal a partir da busca e fechar o
player (sem zapping): a busca continua lá, foco no canal. Abrir o zapping
por cima do vídeo: não há "🔍 Buscar" na trilha (D-009).

**G — Tempo (SC-002, R-001).** Na seção com mais itens gravados, abrir a
busca e digitar: nenhuma trava perceptível ao abrir nem ao digitar.

## Checklist cross-cutting (constitution)

- [ ] Todo estado da busca (continue digitando, vazio, resultados) tem
      elemento focável ativável por SELECT.
- [ ] Nenhum termo aparece em log, erro ou armazenamento (inspecionar
      IndexedDB/localStorage no navegador de dev).
- [ ] Pesquisar não gera tráfego de rede (aba Network do navegador de dev).
