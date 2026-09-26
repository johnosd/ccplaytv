# Quickstart — verificação manual

**Nota de reconstrução (23/09/2026)**: assim como `research.md` e
`logic/virtualizacao-foco.md`, este arquivo é uma recriação — o original
nunca foi commitado (R-007 em `plan.md`). Os cinco cenários abaixo
reconstroem exatamente o que `tasks.md` já cita por letra (Fase 3: "Cenários
A, B e D... restritos a Live TV"; Fase 4: "Cenários A, C e D... em Filmes e
Séries"; T018/Fase 5: "pelo menos os cenários A/B/D... precisam da TV...;
C/E podem ser conferidos no navegador").

## Pré-requisitos

- `cd tv-web; npm install` já rodado.
- Nenhum backend necessário — esta feature é inteiramente client-first
  (ADR-008). Não suba `api/` nem PostgreSQL.
- Para os cenários que exigem TV física (A, B, D — ver cada um): procedimento
  da skill `tizen-tv`, com a TV em Developer Mode, o IP do PC atualizado
  nela e o perfil de assinatura Samsung completo (author + distributor). A
  TV não entrega console (sem `dlog`, sem Web Inspector) — cronometragem e
  fluidez visual são sempre observação humana, nunca medição automatizada.
- Uma fonte real já importada, com pelo menos uma categoria de Canais e uma
  de Filmes ou Séries grande o bastante para testar a virtualização de
  verdade (algumas centenas a poucos milhares de itens — a escala que a
  feature 010 deixou como pior caso normal, não mais o catálogo inteiro).
  Categorias pequenas (dezenas de itens) não expõem regressão nenhuma:
  a lista/grade inteira cabe na janela virtual de qualquer forma.

## Checagens automatizadas

```powershell
cd tv-web
npm run test
npm run lint
npm run build
```

As três precisam passar antes de qualquer cenário manual. Nenhuma task é
concluída com elas vermelhas (constitution, "Fluxo de Desenvolvimento").

## Cenário A — Categoria grande não trava (SC-001, TV física)

1. Na TV, abrir Live TV (ou Filmes/Séries) e entrar na maior categoria
   disponível.
2. Segurar ▼ (ou ▲) continuamente por alguns segundos.
3. Observar: a TV responde ao controle o tempo todo, sem congelar, sem
   atraso perceptível acumulando, sem o app reiniciar.

**Aprovado se**: a rolagem contínua não trava a TV, em nenhuma das telas
testadas, independentemente do tamanho da categoria.

**Não aprovado se**: a TV trava, o app reinicia, ou o controle para de
responder por mais de 1-2 segundos.

## Cenário B — Foco visível ao rolar uma lista longa de canais (SC-002, Live TV, TV física)

1. Em Live TV, entrar numa categoria de canais com centenas a milhares de
   itens.
2. Descer item a item, depois em rajada (segurar ▼), até passar do que
   cabia na tela inicial.
3. A cada parada, confirmar visualmente: o item focado tem o destaque
   `tv-focus` (ADR-007 — contorno + glow + `scale(1.06)`), e ele está
   dentro da área visível — nunca fora da tela, nunca "sumido".

**Aprovado se**: em qualquer ponto da lista (início, meio, fim), o item
focado está visível e destacado, sem precisar de um segundo movimento pra
"alcançar" o scroll.

## Cenário C — Foco visível ao navegar numa grade de pôsteres (Filmes/Séries, navegador ou TV)

1. Em Filmes (ou Séries), entrar numa categoria grande.
2. Navegar em todas as direções (▲▼◀▶) até sair da janela inicial de 6
   colunas × N linhas visíveis.
3. Confirmar: a grade mantém 6 colunas fluidas (não reflui pra menos, não
   estica além da largura do painel), e o item focado sempre aparece
   destacado dentro da área visível.
4. Ir até a última linha (parcialmente preenchida, se o total não for
   múltiplo de 6) e confirmar que a navegação para ali sem erro nem item
   focado "fantasma" (índice que não existe).

**Aprovado se**: 6 colunas em qualquer ponto da rolagem, foco sempre visível,
e a última linha parcial não quebra a navegação. Diferente do Cenário A/B,
este **pode** ser conferido no navegador de desenvolvimento (`npm run dev`)
— não depende de comportamento exclusivo do AVPlay ou do hardware da TV.

## Cenário D — Voltar restaura foco e posição (constitution, "Voltar Restaura Foco e Posição"; TV física)

1. Em qualquer uma das três telas, entrar numa categoria e descer até um
   item bem abaixo do início (fora da janela inicial).
2. Selecionar o item (abrir o player, ou — em Filmes/Séries — abrir o
   detalhe) e voltar.
3. Repetir saindo da categoria inteira (voltar pra trilha, `col 0`) e
   entrando de novo.

**Aprovado se**: o item que originou a navegação recupera o foco — e a
posição de rolagem correspondente — reconciliado por identidade (id do
item), nunca por índice bruto. Isso já era true antes desta feature
(feature 010); esta feature não pode regredir isso ao trocar `.map()` por
virtualização.

## Cenário E — Estados sem lista continuam navegáveis (constitution, "Foco Visível e Sem Becos Sem Saída"; navegador)

1. Em cada uma das três telas, provocar os estados de carregando, erro (ex.:
   desligar a rede antes de entrar numa categoria nunca visitada) e "grupo
   vazio" (uma categoria sem itens, se houver uma na fonte de teste).
2. Em cada estado, confirmar que existe pelo menos um elemento com
   `tv-focus`, e que ele responde a OK quando aplicável (ex.: "Tentar de
   novo").

**Aprovado se**: nenhum desses estados fica sem elemento focável — a
virtualização só decide quais **itens de lista/grade** existem no DOM; ela
nunca pode remover o botão de ação de um estado de carregando/erro/vazio,
que continuam fora da janela virtualizada (ver §3 de
`logic/virtualizacao-foco.md`). Conferível inteiramente no navegador de
desenvolvimento.

## Itens cross-cutting antes de considerar pronta

- [ ] `npm run test`, `npm run lint` e `npm run build` passando.
- [ ] Todo estado — carregando, erro, vazio, com itens — com elemento
      focável, verificado só com o controle remoto/teclado (Cenário E).
- [ ] Nenhum valor de layout hardcoded fora dos tokens de `index.css`
      (ADR-007) — geometria dinâmica (altura total, `translateY`, `left`/
      `width` em porcentagem) é calculada, não um pixel literal inventado.
- [ ] Nada em `api/` modificado.

## O que este quickstart não prova

Desempenho real de memória (SC-001) e latência de input (SC-002) só valem
observados na TV física — os Cenários A e B **precisam** dela; um navegador
de desenvolvimento tem engine e memória muito mais generosos que o
QN50Q60DAGXZD e esconderia exatamente o problema que esta feature existe
para resolver. Cenário não observado por uma pessoa olhando a tela é "não
executado", nunca "aprovado" (mesma disciplina da feature 010 — a TV não
entrega console).
