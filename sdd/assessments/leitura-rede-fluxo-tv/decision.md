# Assessment Decision: Leitura de rede em fluxo mais eficiente na TV

- **Slug**: leitura-rede-fluxo-tv
- **Decidido**: 2026-10-19
- **Problem**: ./problem.md
- **Veredito**: kill (reavaliado em 2026-10-19 após a medição na TV; antes: needs-clarification)

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | adequate | O usuário percebe demora na carga da lista, e o custo extra da leitura em fluxo foi medido na TV. |
| Força da evidência | **weak** | A medida foi na rede local, na thread principal e sem interpretar nada. Não há ligação medida entre a demora percebida e a leitura por pedaço; a velocidade do provedor é desconhecida. |
| Valor vs. custo de inação | unknown | Se a rede do provedor ou a gravação forem o gargalo, o valor é zero. |
| Viabilidade / apetite | adequate | São três leitores pequenos e isolados, com testes. O limite de memória (D-002) impede ler respostas grandes inteiras, então só sobra juntar pedaços ou ler inteiro abaixo de um tamanho. |
| Fit estratégico | adequate | É a carga da lista que a 038/082 já trataram. |

## Abordagens Candidatas

### A. Dividir o tempo primeiro (medir), depois atacar a etapa que pesar

- Teste de conexão do app na TV (feature 062): velocidade real do provedor. Não precisa instalar nada.
- Sonda em Worker, com o `readJsonArrayStream` e o mapeamento reais empacotados (como em `memoria/entrada.ts`), sobre os
  16,5 MB de filmes servidos pelo coletor. Compara em fluxo como hoje, pedaços juntados em ~256 KB e leitura inteira, e
  mede a interpretação separada do download.
- **Recomendada**: sim.

### B. Juntar pedaços já, sem medir

- **Recomendada**: não. Pode não mexer na demora percebida.

## Veredito

`needs-clarification`. Há um sintoma real (o usuário percebe a carga da lista lenta), mas nada liga esse sintoma à
leitura em fluxo. A demora pode vir da rede do provedor, da gravação comprimida da 082 ou da ordem da pré-carga.

### Se needs-clarification — Perguntas Bloqueantes

- Qual a velocidade do provedor até a TV? (Teste de conexão do app; o usuário pode rodar sozinho.)
- Na TV, em Worker, quanto da carga da seção de filmes (16,5 MB) é leitura em fluxo, quanto é interpretação e quanto é
  download? E quanto se ganha juntando pedaços ou lendo inteiro?
- Critério para `go`: juntar pedaços (ou ler inteiro abaixo de um tamanho seguro) reduz a leitura + interpretação da
  seção de filmes em ≥ 20 % na TV, e a velocidade do provedor é alta o bastante (≳ 27 Mbit/s) para que esse ganho
  apareça. Se a rede do provedor for o gargalo, `kill`. Se a gravação for o gargalo, o problema vira outro item.

**Fase a revisitar**: explora (anexar as medições e rodar Decide de novo)

## Reavaliação após a medição na TV (2026-10-19)

Evidência: `./evidencias/carga-secao-tv-2026-10-19.md`. Foram 2 instalações × 2 rodadas, Worker com o código real
(`readJsonArrayStream`, `mapVodEntry`, `loadSection`).

| Critério | Antes | Agora | Notas |
| --- | --- | --- | --- |
| Validade do problema | adequate | **weak** | No Worker, o fluxo puro empata com o download inteiro (1,9–2,1 s contra 1,9–2,0 s); os 55 % da sonda 2 eram da thread principal. |
| Força da evidência | weak | **strong** | Aparelho real, código real, 4 medições. |
| Valor vs. custo de inação | unknown | **weak** | Juntar pedaços não ganha nada (+0,2 a +1,1 s) e ler inteiro piora (+2,5 a +3 s). |
| Viabilidade / apetite | adequate | adequate | Sem mudança. |
| Fit estratégico | adequate | adequate | Sem mudança. |

### Se kill — Motivo

O critério combinado antes de medir ("juntar pedaços reduz a leitura + interpretação em ≥ 20 %") não foi atingido em
nenhuma das quatro medições. A leitura em fluxo no Worker custa o mesmo que baixar inteiro. A velocidade do provedor
deixou de ser bloqueante: mesmo na rede local rápida não há ganho.

**O sintoma que o usuário percebe tem outra causa**, medida aqui: a carga real da seção de filmes leva ~21 s, e só
~3,5 s disso é baixar e interpretar. Os ~17–18 s restantes são a gravação dentro de `loadSection` (área de preparo,
releitura, `renewCategoryItems` com compressão e `makeRoomFor`, categoria por categoria). Por decisão do usuário, isso
virou um item novo no backlog: "Gravação da carga por seção".
