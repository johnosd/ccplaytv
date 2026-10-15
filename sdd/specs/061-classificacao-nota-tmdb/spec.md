# Feature Specification: Classificação indicativa e nota TMDB no Início e no detalhe

**Slug**: `061-classificacao-nota-tmdb`

**Created**: 2026-10-06

**Status**: Convergida

**Input**: Pacote G3 do backlog, item **72**: "Classificação indicativa e nota TMDB no billboard e nos cards do Início (e onde mais couber): dado novo do TMDB, com cache e origem declarada; marcados como 'dado novo' no protótipo da 060 (`.hb-nd`). A Spec V14 proíbe exibi-los enquanto o dado não for real." Os demais itens do G3 (30 Bloqueado, 31 com escopo a decidir, 54 A avaliar) ficam de fora.

**Referências normativas**: Spec V14, seção "Home (layout 'Vitrine expandida')" (l. 1526: classificação e nota TMDB só com dado real) e seção "Detalhe de filme e de série (layout 'Cinema')" (l. 1593); função `home()` do protótipo `CCPlayTV_Tizen_Ultimate_Prototype_v13_2.html` (`hbCls`, `.hb-tmdb`, `.hb-nd`). Precedência do ADR-011 (constitution > ADRs > Spec V14 > Component Lab > protótipo).

## Escopo

### Incluído

- **Classificação indicativa** do título no billboard do Início, no card expandido das fileiras do Início e no hero do detalhe de filme e de série.
- **Nota TMDB** (com a origem "TMDB") nos mesmos três lugares, ao lado da nota do provedor quando as duas existem.
- **País da classificação pelo idioma do app**: pt → Brasil (escala L, 10, 12, 14, 16, 18), en → Estados Unidos, es → Espanha. Trocar o idioma troca o país na hora, sem consulta nova.
- **Selo da classificação**: cores oficiais da escala brasileira; selo neutro para Estados Unidos e Espanha.
- **Dado obtido na mesma consulta que o app já faz** ao abrir o detalhe ou o Início (metadata do título), e guardado com o resto da metadata.
- **Nota TMDB do Top 10 e da Dica** a partir das respostas que a Home já baixa, sem consulta nova.
- Atualizar a Spec V14 nas duas seções citadas, tirando a ressalva "enquanto o app não tiver esse dado real" depois de entregue.

### Fora de Escopo

- Pôsteres pequenos das fileiras e das grades (Início, Filmes, Séries): não ganham selo de classificação nem nota TMDB.
- Classificação de outro país quando falta a do país do idioma (nenhuma conversão, nenhuma reserva).
- Consulta ao focar; preencher em lote a metadata já guardada. Um título cuja metadata do TMDB foi guardada antes desta feature é reconsultado **uma vez**, ao abrir o detalhe ou o billboard (padrão da 033 e da 035), nunca por foco.
- Controle parental, bloqueio por classificação ou perfis de pessoa (item 52 do backlog, pacote G6).
- Itens 30 (recomendações e Curadoria IA), 31 ("Descobrir com IA") e 54 (clima e teste de velocidade no dock) do G3.
- Canais ao vivo e programas do EPG.
- Nota IMDb (item 29, retirado).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Classificação e nota TMDB no detalhe (Priority: P1)

Ao abrir um filme ou uma série, a pessoa vê, na linha de metadata do hero, a classificação indicativa do país do idioma do app e a nota do TMDB, ao lado da nota do provedor.

**Why this priority**: o detalhe é onde a metadata do título é consultada; é o primeiro lugar em que o dado passa a existir e a fonte de que os outros dependem.

**Independent Test**: com chave TMDB, abrir títulos com e sem classificação no país do idioma, com nota TMDB acima e abaixo do mínimo de votos, e com e sem nota do provedor; trocar o idioma e reabrir.

**Acceptance Scenarios**:

1. **Given** um filme casado no TMDB com classificação brasileira e idioma pt, **When** o detalhe abre, **Then** a linha de metadata mostra o selo da classificação nas cores oficiais (ex.: "14") e "TMDB 7,8".
2. **Given** um título sem classificação no país do idioma, **When** o detalhe abre, **Then** nenhum selo de classificação aparece — nunca o de outro país.
3. **Given** uma nota TMDB com menos votos que o mínimo, **When** o detalhe abre, **Then** a nota TMDB não aparece.
4. **Given** o idioma do app trocado para en, **When** o mesmo detalhe abre, **Then** aparece a classificação dos Estados Unidos (selo neutro), sem consulta nova.
5. **Given** sem chave TMDB ou título não casado no TMDB, **When** o detalhe abre, **Then** nada muda em relação a hoje.
6. **Given** um título com metadata do TMDB guardada antes desta feature, **When** o detalhe abre, **Then** o TMDB é consultado uma única vez para obter os dois dados (como a 033 e a 035 fizeram com trailers e semelhantes), e as aberturas seguintes usam o cache.

---

### User Story 2 - Classificação e nota TMDB no billboard do Início (Priority: P2)

No billboard do Início, a pessoa vê a classificação e a nota TMDB do título em destaque, como no protótipo.

**Why this priority**: o billboard já consulta a metadata do seu título ao abrir; reaproveita a P1 no lugar de maior destaque da Home.

**Independent Test**: abrir o Início com título no billboard com e sem os dois dados; trocar o idioma.

**Acceptance Scenarios**:

1. **Given** o título do billboard com classificação e nota TMDB, **When** o Início abre, **Then** a metadata do billboard mostra os dois, na ordem do protótipo (ano · duração · ★ provedor · classificação · TMDB).
2. **Given** o billboard de boas-vindas, **When** o Início abre, **Then** nenhum dos dois aparece.

---

### User Story 3 - Classificação e nota TMDB no card expandido do Início (Priority: P3)

Ao focar um card de uma fileira do Início, o card expandido mostra a classificação e a nota TMDB quando o dado já está no aparelho.

**Why this priority**: enriquece a navegação, mas depende de o dado já existir; nunca dispara consulta.

**Independent Test**: focar cards de títulos com metadata guardada, sem metadata, e do Top 10 e da Dica.

**Acceptance Scenarios**:

1. **Given** um card cujo título já tem metadata guardada com os dois dados, **When** ele expande, **Then** a metadata do card expandido mostra a classificação e a nota TMDB.
2. **Given** um card do Top 10 ou da Dica, **When** ele expande, **Then** a nota TMDB vem da resposta que a Home já baixou, sem consulta nova; a classificação só aparece se a metadata do título estiver guardada.
3. **Given** um card sem metadata guardada (e fora do Top 10 e da Dica), **When** ele expande, **Then** nenhum dos dois aparece e nenhuma consulta acontece.

---

### Edge Cases

- Título casado no TMDB, mas sem classificação em nenhum país: nenhum selo.
- Classificação em formato inesperado ou vazio no TMDB: nenhum selo; nunca um texto cru adivinhado.
- Série: a classificação vem da classificação de conteúdo da série, não de um episódio.
- Nota TMDB 0 ou ausente: nada aparece.
- Nota do provedor e nota TMDB iguais: as duas aparecem, cada uma com a sua origem.
- Troca de idioma com a tela aberta: na próxima renderização a classificação passa a ser a do novo país, sem consulta.
- Chave TMDB removida: a metadata já guardada continua sendo mostrada como hoje (regra da 032); nenhum dado novo é obtido.
- Título longo no billboard ou no card expandido: os selos não empurram ações nem metadata para fora (regras de quebra da 059 e da 060).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A classificação indicativa DEVE ser obtida na mesma consulta de metadata do título que o app já faz ao abrir o detalhe ou o billboard, sem nenhuma requisição a mais.
- **FR-002**: A nota TMDB (média e número de votos) DEVE ser obtida na mesma consulta do FR-001 e, para o Top 10 e a Dica, das respostas que a Home já baixa.
- **FR-003**: As classificações do Brasil, dos Estados Unidos e da Espanha DEVEM ser guardadas com a metadata do título, para a troca de idioma não exigir consulta.
- **FR-004**: O país mostrado DEVE seguir o idioma do app: pt → Brasil, en → Estados Unidos, es → Espanha.
- **FR-005**: Sem classificação do país do idioma, o selo NÃO DEVE aparecer; classificação de outro país NUNCA DEVE ser mostrada no lugar.
- **FR-006**: A classificação brasileira DEVE usar a escala L, 10, 12, 14, 16, 18 com as cores oficiais; valores fora da escala NÃO DEVEM aparecer.
- **FR-007**: As classificações dos Estados Unidos e da Espanha DEVEM aparecer num selo neutro com o texto da classificação; valor vazio ou fora do conjunto conhecido de cada país NÃO DEVE aparecer.
- **FR-008**: A nota TMDB só DEVE aparecer com média maior que 0 e número de votos igual ou acima de um mínimo fixo, e DEVE trazer a origem "TMDB", formatada com o separador decimal do idioma do app.
- **FR-009**: A nota TMDB e a nota do provedor DEVEM aparecer lado a lado quando as duas existem, cada uma com a sua origem; uma nunca substitui a outra.
- **FR-010**: O detalhe de filme e de série DEVE mostrar a classificação e a nota TMDB na linha de metadata do hero.
- **FR-011**: O billboard do Início DEVE mostrar a classificação e a nota TMDB na metadata, na ordem do protótipo.
- **FR-012**: O card expandido do Início DEVE mostrar a classificação e a nota TMDB só com dado já no aparelho; focar NUNCA DEVE disparar consulta.
- **FR-013**: Pôsteres não expandidos (Início, Filmes, Séries) NÃO DEVEM ganhar selo de classificação nem nota TMDB.
- **FR-014**: Um registro do TMDB guardado antes desta feature (sem os campos de classificação e de nota) DEVE contar como vencido e ser reconsultado **uma única vez**, ao abrir o detalhe ou o billboard; nunca por foco, nunca em lote, nunca de novo depois de gravado com os campos (mesmo que vazios).
- **FR-015**: Sem chave TMDB, sem casamento no TMDB ou com o TMDB indisponível, as telas DEVEM se comportar como hoje.
- **FR-016**: O selo de classificação DEVE ter nome acessível com o significado (ex.: "Classificação indicativa: 14 anos"), não só a cor ou o número.
- **FR-017**: Nenhum valor visual fixo: cores (inclusive as da escala oficial), raios, espaçamentos e tamanhos vêm de tokens V14.
- **FR-018**: Todo texto novo DEVE existir em pt, en e es no catálogo de idioma; o valor da classificação (ex.: "PG-13") não é traduzido.
- **FR-019**: A chave TMDB NUNCA DEVE aparecer em log, erro ou interface.
- **FR-020**: Depois de entregue, a Spec V14 DEVE deixar de marcar classificação e nota TMDB como "dado novo" nas seções do Início e do detalhe.

### Key Entities *(include if feature involves data)*

- **Classificação indicativa**: país (BR, US, ES) → valor da classificação, por título; origem TMDB; guardada com a metadata.
- **Nota TMDB**: média de 0 a 10 e número de votos; origem TMDB.
- **Metadata do título**: o registro já existente da 032, que passa a carregar os dois campos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Para um título com metadata já no formato novo, 0 requisições a mais por abertura de detalhe ou do Início em relação a hoje; para um título gravado antes desta feature, exatamente uma reconsulta, na primeira abertura (verificado por teste automatizado).
- **SC-002**: 0 consultas disparadas por foco (verificado por teste automatizado).
- **SC-003**: 0 ocorrências de classificação de um país diferente do país do idioma do app.
- **SC-004**: 0 ocorrências de nota TMDB abaixo do mínimo de votos.
- **SC-005**: Trocar o idioma troca a classificação mostrada a partir do que já está guardado, sem requisição por causa dela (a releitura do TMDB em outro idioma ao abrir o detalhe, da feature 054, continua como hoje).
- **SC-006**: Nos títulos casados da lista real com classificação no país do idioma, o selo aparece no detalhe em 100% dos casos depois da renovação do cache.

## Assumptions

- O casamento com o TMDB, a chave BYOK, o cache de metadata e a renovação são os da feature 032; esta feature só acrescenta campos.
- A nota do provedor continua aparecendo como hoje ("★ 7,4 Provedor"); a nota TMDB entra ao lado, como no protótipo.
- O número mínimo de votos da nota TMDB é decidido no `sdd-plan`.
- A paleta oficial da escala brasileira vira tokens; o protótipo (`hbClassInd`) é a referência de cor.
- O conjunto de valores aceitos para Estados Unidos e Espanha é decidido no `sdd-plan`, a partir do que o TMDB devolve.

## Clarifications

### Sessão 2026-10-06

- Q: Onde a classificação indicativa e a nota TMDB devem aparecer? → A: Billboard do Início, card expandido do Início e hero do detalhe de filme e de série; os pôsteres pequenos não mudam.
- Q: Qual sistema de classificação indicativa usar? → A: Pelo idioma do app (pt → Brasil, en → Estados Unidos, es → Espanha).
- Q: A nota TMDB precisa de um mínimo de votos? → A: Sim; o número exato fica para o `sdd-plan`.
- Q: Como os títulos com metadata já guardada passam a ter os dois dados? → A: Na próxima renovação natural do cache, sem consulta extra.
- Q: Sem classificação no país do idioma? → A: Nada; nunca a de outro país.
- Q: Trocar o idioma muda a classificação na hora? → A: Sim, sem consulta nova; guardam-se as de Brasil, EUA e Espanha.
- Q: Visual do selo? → A: Cores oficiais no Brasil; selo neutro para EUA e Espanha.
- Q: Card expandido do Top 10 e da Dica usa a nota que já veio na resposta da Home? → A: Sim, sem consulta nova.
