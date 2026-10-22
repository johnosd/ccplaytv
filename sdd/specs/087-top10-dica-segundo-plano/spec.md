# Feature: Top 10 e Dica produzidos em segundo plano

**Status**: Convergência Pendente
**Criada**: 2026-10-21
**Origem**: feature 086 (T082 / CV-013), decisão do usuário de 2026-10-21 de tratar como feature própria. A mudança
chegou a ser escrita e foi revertida porque o custo real é reescrever os testes de comportamento da feature 057 — então
este escopo **já está medido**, não estimado.

## Contexto

As fileiras **Em alta esta semana** (Top 10) e **Dica de filme/série** cruzam o ranking do TMDB com a lista da pessoa.
Para casar os títulos, é preciso um índice com os nomes de **todos** os itens do tipo — e montá-lo percorre o catálogo
inteiro (43 549 filmes na TV de referência).

Hoje isso acontece **na tela**: fora da montagem (o slot é `external`, então a tela aparece sem esperar — feature 086,
FR-013), mas na mesma thread, enquanto a pessoa navega. A feature 086 tirou todo o resto do caminho da abertura; esta é
a última coisa que ainda percorre o catálogo quando uma tela abre.

Não é um defeito visível: Filmes e Séries abrem em 313–380 ms, medidos na TV. É trabalho pesado disputando a thread
depois do desenho — o que a 086 mostrou ser o custo dominante naquele aparelho.

## Escopo

### Incluído

- Produzir o resultado de **Top 10** e **Dica** fora da tela, na fila de segundo plano que já existe, e guardá-lo.
- A tela passa a **ler o resultado guardado** por chave primária: nunca consulta o serviço externo, nunca monta o
  índice de nomes.
- Reescrever a cobertura de comportamento que hoje vive nos testes de tela da feature 057, para o novo lugar.

### Fora de Escopo

- **A fileira "Porque você assistiu"**. Ela também depende do TMDB e também é `external`, mas **não** monta índice do
  tipo (`features/catalog/becauseApi.ts`, 68 linhas, nenhuma passada pelo catálogo) — não tem o problema que esta
  feature resolve.
- **Mudar quais títulos entram, a ordem, o mínimo de cruzados ou o sorteio da Dica.** As regras da feature 057 ficam
  idênticas; só muda **onde** e **quando** são calculadas.
- **Mudar o período**: Top 10 semanal e Dica diária, como já são.
- **Reduzir o custo de montar o índice.** Ele continua caro; a feature o move para onde o custo não atrapalha.
- Qualquer mudança visual nas fileiras.

## Clarifications

### Sessão 2026-10-21

- Q: Sem resultado guardado (primeira vez), o que a tela mostra? → A: **A fileira simplesmente não existe** — sem
  esqueleto e sem "Em breve"; ela aparece sozinha quando a fila produzir, sem mover o foco. É a mesma regra da 086
  (FR-007) e o que a 057 já faz sem chave.
- Q: Salvar a chave do TMDB hoje faz as fileiras aparecerem na hora, e remover faz sumirem. Como fica? → A: **Ação da
  pessoa tem efeito imediato**: salvar acorda a produção na hora, sem esperar a vez na fila; remover apaga o guardado
  imediatamente.
- Q: Trocar o idioma do app hoje refaz a consulta no idioma novo. Como fica? → A: **Mantém o guardado e refaz em 2º
  plano** — a fileira continua na tela com o resultado anterior e troca sozinha quando o novo ficar pronto. Mesma regra
  da 086 para período vencido: nunca esvaziar o que já está bom.
- Q: Quando a fila deve tentar produzir? → A: **Quando o período guardado venceu**, na fila do prefetch, que já espera o
  aparelho ficar quieto e já cede a vez à primeira tela. O período é a validade: no máximo uma produção por semana
  (Top 10) e uma por dia (Dica).
- Q: "Porque você assistiu" entra? → A: **Não** — verificado no código: ela não monta índice do tipo.
- Q: E ao apagar a lista? → A: **Já resolvido** — `lib/catalog/sourceDeletion.ts` apaga `showcaseExternalRows` da lista.

## User Stories

### US1 — As telas deixam de percorrer o catálogo para montar essas fileiras (P1)

Como quem abre Filmes ou Séries, quero que a tela não faça trabalho pesado depois de aparecer, para a navegação não
engasgar enquanto eu rolo as fileiras.

**Acceptance scenarios**

1. Com resultado guardado e no período, abrir Filmes mostra o Top 10 e a Dica, e **nenhuma** passada pelo catálogo
   acontece por causa dessas fileiras.
2. Sem resultado guardado, as duas fileiras não existem na tela, e nenhuma consulta ao serviço externo é disparada pela
   abertura.
3. Depois de a fila produzir, as fileiras aparecem **sem** a pessoa sair e voltar, e sem mover o foco nem a rolagem.

### US2 — O resultado se mantém correto sem a pessoa pedir nada (P2)

Como quem usa a TV todo dia, quero que o Top 10 acompanhe a semana e a Dica o dia, sem nunca ver a fileira vazia por
causa de uma falha de rede.

**Acceptance scenarios**

1. Período vencido e serviço indisponível: a fileira continua mostrando o guardado do período anterior.
2. Período vencido e serviço disponível: a fila produz o novo e a fileira troca sozinha.
3. Dentro do período, nenhuma consulta nova é feita, mesmo abrindo a tela várias vezes.
4. Trocar a lista ativa mostra o resultado daquela lista; a de outra lista nunca aparece.

### US3 — O que a pessoa faz tem efeito imediato (P3)

Como quem acabou de configurar a chave do TMDB, quero ver as fileiras sem esperar, porque eu agi e espero consequência.

**Acceptance scenarios**

1. Salvar a chave em Integrações dispara a produção na hora; a fileira aparece sem esperar a fila.
2. Remover a chave apaga o guardado e as fileiras somem, sem consulta nenhuma.
3. Chave recusada ou em pausa por limite de uso: nenhuma requisição é feita, e o último resultado guardado continua
   valendo.
4. Trocar o idioma do app mantém a fileira com o resultado anterior e a troca quando o novo ficar pronto.

## Edge Cases

- **Catálogo vazio** (lista nova, nada obtido): não há como casar; a fileira não existe e nada é gravado.
- **Menos cruzados que o mínimo** da regra 057: a fileira não existe **naquele período**, e isso é registrado para a
  fila não repetir o trabalho a cada rodada.
- **Geração trocada** (lista recarregada): o resultado da geração anterior não é mostrado.
- **Lista apagada**: o guardado dela sai junto (já implementado).
- **Produção interrompida** (a pessoa volta a navegar, a TV é desligada): nada pela metade é gravado; a próxima rodada
  recomeça.
- **Espaço de armazenamento no limite**: o resultado é pequeno (até 10 itens por fileira), mas gravá-lo não pode
  impedir a gravação do catálogo.
- **Duas listas**: cada uma tem seu resultado; produzir para uma não invalida a outra.

## Requirements

### Functional Requirements

- **FR-001**: A abertura de Filmes e Séries NÃO DEVE montar o índice de nomes do tipo nem consultar o serviço externo
  por causa do Top 10 ou da Dica.
- **FR-002**: O resultado dessas fileiras DEVE ser produzido fora da tela, na fila de segundo plano, e guardado com o
  período a que pertence.
- **FR-003**: A tela DEVE obter essas fileiras por leitura do resultado guardado, sem percorrer o catálogo.
- **FR-004**: O conteúdo das fileiras DEVE ser o mesmo que as regras atuais produzem para o mesmo catálogo e o mesmo
  ranking — mesmos títulos, mesma ordem, mesmo mínimo, mesmo sorteio da Dica.
- **FR-005**: Sem resultado guardado válido, a fileira NÃO DEVE existir na tela — sem esqueleto, sem aviso técnico e
  sem "Em breve".
- **FR-006**: Quando a fila produzir com a tela aberta, a fileira DEVE entrar sem mover o foco nem a posição de rolagem.
- **FR-007**: Dentro do período guardado, NENHUMA consulta nova ao serviço externo DEVE ser feita.
- **FR-008**: Com o período vencido e sem resposta nova, a fileira DEVE continuar mostrando o conteúdo do período
  anterior, trocando sozinha quando o novo chegar.
- **FR-009**: Serviço fora do ar, lento, recusando a chave, em pausa por limite ou sem chave NÃO DEVE esvaziar a
  fileira nem atrasar a abertura de nenhuma tela.
- **FR-010**: Salvar a chave do serviço DEVE disparar a produção imediatamente, sem esperar a vez na fila.
- **FR-011**: Remover a chave DEVE apagar o resultado guardado, e as fileiras DEVEM sumir sem nenhuma consulta.
- **FR-012**: Trocar o idioma do app DEVE manter o resultado guardado na tela e produzir o novo em segundo plano.
- **FR-013**: Um resultado guardado DEVE pertencer à geração ativa do catálogo da lista; o de geração anterior não é
  mostrado.
- **FR-014**: Produzir o resultado NÃO DEVE competir com a primeira tela de uma sessão nem com a carga da lista.
- **FR-015**: Abaixo do mínimo de cruzados, a ausência da fileira naquele período DEVE ser registrada, para a fila não
  repetir o trabalho a cada rodada.
- **FR-016**: Gravar o resultado NUNCA DEVE impedir nem atrasar a gravação do catálogo.
- **FR-017**: A cobertura de comportamento que hoje vive nos testes de tela DEVE passar a cobrir o novo lugar — nenhuma
  das garantias listadas em `## Assumptions` pode ficar sem teste.

### Key Entities

- **Resultado de fileira externa**: por lista, tipo e fileira — os itens escolhidos, a posição no ranking (Top 10), o
  fundo e a nota que vieram do serviço, a cobertura de categorias no momento da produção, o período e a geração.

## Measurable Outcomes

- **SC-001**: Abrir Filmes ou Séries não dispara nenhuma passada pelo catálogo por causa dessas fileiras — verificável
  sem a TV.
- **SC-002**: Abrir Filmes ou Séries não dispara nenhuma requisição ao serviço externo — verificável sem a TV.
- **SC-003**: As fileiras mostram os mesmos itens, na mesma ordem, que as regras atuais produzem para o mesmo catálogo
  e ranking — verificável sem a TV.
- **SC-004**: Com a tela aberta, o resultado recém-produzido aparece sem a pessoa sair e voltar, e o foco e a rolagem
  ficam onde estavam.
- **SC-005**: Dentro do período, nenhuma requisição nova ao serviço externo acontece, mesmo abrindo as telas várias
  vezes.
- **SC-006**: Salvar a chave faz as fileiras aparecerem sem a pessoa esperar a fila; remover faz sumirem sem requisição.
- **SC-007**: Na TV, os quadros longos ao navegar em Filmes e Séries não aumentam em relação à medição de 2026-10-21
  (mediana de 38 fps), num roteiro de **duração fixa** — a lição do SC-009 da 086, que ficou sem veredito por comparar
  amostras de durações diferentes.
- **SC-008**: Na TV, o tempo de abertura de Filmes e Séries continua na faixa de 313–380 ms medida em 2026-10-21.
- **SC-009**: Sem regressão: a suíte unitária, os roteiros de tela e os contratos travados das features 057, 086, 082 e
  085 continuam passando.

## Assumptions

- As **regras** de seleção da feature 057 (mínimo de cruzados, ordem pelo ranking, filtro e sorteio da Dica) já vivem
  em código separado da tela e não precisam mudar.
- A fila de segundo plano usada pela feature 086 (que já espera o aparelho ficar quieto, já cede a vez à primeira tela
  e já faz uma tarefa por rodada) é o lugar certo para a produção.
- **As garantias que hoje são cobertas por teste de tela e precisam continuar cobertas** (daqui sai o FR-017; são os
  nomes dos testes de comportamento de hoje):
  1. cruza o ranking guardado com a lista, com a posição real e a cobertura, sem rede;
  2. abaixo do mínimo, a fileira é vazia;
  3. sem chave não há dado, e o índice nem é lido;
  4. categoria que chega depois atualiza a fileira;
  5. o resultado não é calculado na renderização;
  6. série usa o ranking e o índice de séries;
  7. a Dica sorteia igual a cada montagem no mesmo dia, e é vazia abaixo do mínimo;
  8. o dia fica fixo na montagem — o relógio andando não troca o sorteio;
  9. chave recusada ou em pausa: nenhuma requisição, e o guardado ainda vale;
  10. sem rede: com cache de outro período usa o último; sem cache a fileira some, sem erro;
  11. trocar a lista ativa não dispara consulta nova;
  12. trocar o idioma refaz no idioma novo, e o cache do idioma anterior segue guardado;
  13. salvar a chave faz as fileiras aparecerem;
  14. remover a chave limpa o guardado e as fileiras somem sem requisição.
- O resultado guardado é **projeção descartável**: apagá-lo custa no máximo uma fileira ausente até a próxima rodada da
  fila, nunca conteúdo da pessoa.
