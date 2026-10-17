# Feature Specification: Rádio global por país

**Slug**: `074-radio-global`

**Created**: 2026-10-15

**Status**: Convergência Pendente

**Input**: "Trazer para o ccplayTv a feature 'Tuner' do Open-Media-Explorer — um rádio global
com seleção de país." Avaliada em `sdd/assessments/radio-global-por-pais/` (veredito `go`,
2026-10-15, incluindo spike na TV física com 10/10 estações tocando) e decidida
arquiteturalmente na ADR-018 (Radio Browser como diretório de terceiro; item "Rádio" na
topbar, emendando a ADR-011 §3).

## Escopo

### Incluído

- Destino **Rádio** na topbar, depois de Séries, disponível com lista ativa (ADR-018 §6).
- Tela Rádio no padrão da TV ao vivo:
  - à esquerda, a trilha com `★ Favoritos`, "Mais ouvidas no mundo" e os países do
    diretório, ordenados por quantidade de estações, com o país da TV no topo;
  - à direita, a grade das estações do item escolhido.
- Para cada país (e para o mundo), as **100 estações mais ouvidas** e não quebradas do
  diretório.
- **Mini-barra** "tocando agora" na própria tela, com arte, nome, país, formato/kbps e
  ação Parar. A pessoa continua navegando e trocando de estação enquanto ouve.
- **Favoritos de estação**: segurar OK ou tecla amarela favorita e desfavorita. Ficam só
  no aparelho.
- País inicial: o último usado; na primeira vez, o país configurado na TV; se não der
  para saber, Brasil.
- Nomes de país no idioma do app (pt/en/es), derivados do código ISO.
- Estados de carregando, vazio, erro e sem rede sempre focáveis. Abre do cache local
  quando o diretório ou a rede não respondem.
- Falha de reprodução por estação, com ações "Tentar de novo" e "Próxima estação".

### Fora de Escopo

- Dial, frequência MHz, "girar toca na hora" e qualquer dado cosmético do Tuner do OME
  (constitution: nunca inventar dado; focar não toca).
- Rádio sem lista ativa (tela de perfis, antes de escolher lista).
- Reprodução em segundo plano: sair da tela Rádio para a rádio.
- As rádios `radio="true"` da própria lista IPTV (feature 044) nesta tela.
- Busca de estação ou país por nome (teclado/IME); filtros por gênero, idioma ou formato.
- Histórico de estações ouvidas e "continuar ouvindo".
- Metadados da música que toca (ICY/"tocando agora" da faixa), gravação, equalizador.
- TV aberta do iptv-org, podcasts ou qualquer outro diretório (ADR-018 §1).
- Controle parental (PIN/ocultação) sobre a tela Rádio ou estações.
- Favoritos de estação no backup de uso (ADR-017) e sincronização entre TVs.
- Filtro de formatos que o aparelho talvez não toque (Opus/Vorbis/desconhecido).
- Proxy, backend ou espelho próprio do diretório (ADR-018 §7).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ouvir uma estação de um país (Priority: P1)

Com uma lista ativa, a pessoa escolhe **Rádio** na topbar. A tela abre no país inicial,
já mostrando as estações mais ouvidas dele. A pessoa navega pela trilha. Focar um país
não muda nada; OK entra nele e mostra as estações. Na grade, OK toca a estação. A
mini-barra aparece com arte, nome, país e formato, e a pessoa continua navegando
enquanto ouve. OK em outra estação troca o que toca. OK na estação que está tocando, ou
Parar na mini-barra, para. Sair da tela Rádio (RETURN até o Início, ou outro destino da
topbar) para a rádio.

**Why this priority**: é o núcleo do pedido ("usar a TV como rádio") e entrega valor
sozinho, sem favoritos nem cache.

**Independent Test**: com lista ativa e rede, abrir Rádio, entrar em "Brasil", tocar
uma estação e ouvir som, trocar para outra, parar, voltar ao Início. Tudo só com D-pad.

**Acceptance Scenarios**:

1. **Given** uma lista ativa, **When** a pessoa foca a topbar, **Then** "Rádio" aparece
   depois de "Séries", e OK nele abre a tela Rádio.
2. **Given** a tela Rádio aberta pela primeira vez numa TV configurada para o Brasil,
   **When** a tela termina de carregar, **Then** o país selecionado é Brasil e a grade
   mostra até 100 estações, das mais ouvidas para as menos.
3. **Given** a trilha de países com foco em "Brasil", **When** a pessoa move o foco para
   "Portugal" sem apertar OK, **Then** nenhuma consulta ao diretório é feita e a grade
   continua mostrando o Brasil.
4. **Given** a grade com foco numa estação, **When** a pessoa aperta OK, **Then** a
   estação começa a tocar, a mini-barra mostra arte, nome, país e formato/kbps, e o
   foco continua na grade.
5. **Given** uma estação tocando, **When** a pessoa aperta OK em outra estação, **Then**
   a primeira para e a nova toca.
6. **Given** uma estação tocando, **When** a pessoa aperta OK nela de novo ou aciona
   Parar na mini-barra, **Then** a reprodução para e a mini-barra mostra o estado parado.
7. **Given** uma estação tocando, **When** a pessoa sai da tela Rádio (RETURN até o
   Início ou outro destino da topbar), **Then** a reprodução para.
8. **Given** a pessoa saiu da Rádio com foco na estação X do país Y, **When** volta à
   Rádio, **Then** o país Y está aberto e o foco está na estação X (por identidade), se
   ela ainda estiver na lista.
9. **Given** a trilha, **When** a pessoa escolhe "Mais ouvidas no mundo", **Then** a grade
   mostra as até 100 estações mais ouvidas de todos os países, com o país de cada uma
   no card.

---

### User Story 2 - Guardar e reencontrar estações favoritas (Priority: P2)

A pessoa segura OK (ou aperta a tecla amarela) numa estação para favoritá-la, e repete
para desfavoritar. `★ Favoritos`, fixo no topo da trilha, lista as estações favoritas
de qualquer país, e OK toca, como em qualquer outra grade.

**Why this priority**: torna o uso repetido rápido (a rádio de sempre em dois cliques),
mas a P1 já entrega valor sem isso.

**Independent Test**: favoritar duas estações de países diferentes, abrir
`★ Favoritos`, ver as duas, tocar uma, desfavoritar a outra e vê-la sumir da lista.
Fechar e reabrir o app e os favoritos continuam lá.

**Acceptance Scenarios**:

1. **Given** foco numa estação não favorita, **When** a pessoa segura OK ou aperta a tecla
   amarela, **Then** a estação vira favorita, com indicação visual no card e aviso
   anunciado, e não começa a tocar.
2. **Given** `★ Favoritos` sem nenhuma estação, **When** a pessoa entra nele, **Then** vê
   um estado vazio focável explicando como favoritar.
3. **Given** estações favoritas de Brasil e Japão, **When** a pessoa abre `★ Favoritos`,
   **Then** as duas aparecem com nome, arte e país, sem precisar entrar nos países.
4. **Given** uma estação favorita que saiu do diretório, **When** a pessoa tenta tocá-la,
   **Then** vê o erro "estação indisponível" com as ações da falha, e pode desfavoritá-la.
5. **Given** favoritos salvos, **When** a pessoa remove a lista IPTV ativa ou troca de
   lista, **Then** os favoritos de estação continuam (não pertencem a uma lista).

---

### User Story 3 - Abrir a Rádio sem rede ou com o diretório fora do ar (Priority: P3)

Se a rede ou o diretório não responde, a tela abre com o que já foi visto antes: países
e estações dos países visitados, e os favoritos. Ela avisa que a lista pode estar
desatualizada e oferece "Tentar de novo". Tocar continua exigindo rede.

**Why this priority**: o serviço é comunitário e sem SLA (ADR-018). Sem isso, uma queda
deixa a tela vazia, mas o núcleo funciona sem isso.

**Independent Test**: abrir a Rádio com rede, entrar em dois países; cortar o acesso ao
diretório; reabrir a Rádio e ver os dois países com as estações, o aviso de dados
antigos e "Tentar de novo" focável.

**Acceptance Scenarios**:

1. **Given** países e estações já vistos e o diretório inacessível, **When** a pessoa abre
   a Rádio, **Then** a trilha e as grades vêm do que foi guardado, com aviso de que podem
   estar desatualizadas.
2. **Given** nada guardado e o diretório inacessível, **When** a pessoa abre a Rádio,
   **Then** vê um estado de erro com "Tentar de novo" focado, e `★ Favoritos` continua
   acessível na trilha.
3. **Given** a TV sem rede, **When** a pessoa aperta OK numa estação, **Then** vê o erro de
   falta de conexão, sem travar o foco.

---

### Edge Cases

- **Nenhum espelho do diretório responde**: estado de erro focável com "Tentar de novo";
  favoritos e cache seguem acessíveis (US3).
- **Diretório devolve resposta inválida** (HTML, JSON malformado, não-lista): tratado
  como falha, nunca como "nenhuma estação".
- **País sem estações** (ou todas quebradas): estado vazio focável, com o foco podendo
  voltar à trilha.
- **País da TV desconhecido ou fora do diretório**: abre no Brasil.
- **Último país usado sumiu do diretório**: abre no país da TV, ou no Brasil.
- **Estação não toca** (fora do ar, formato não aceito, tempo esgotado): a mini-barra
  mostra "estação indisponível" com "Tentar de novo" e "Próxima estação"; nada toca
  sozinho.
- **Estação para no meio** (stream cai): mesma falha, com a mini-barra informando.
- **OK rápido em várias estações**: só a última escolhida toca; uma resposta atrasada
  nunca troca a estação.
- **Troca de país enquanto uma estação toca**: a estação continua tocando; a mini-barra
  segue mostrando-a.
- **Favicon que não carrega ou demora**: avatar com iniciais, sem buraco nem quebra de
  layout.
- **Nome de estação muito longo ou com caracteres estranhos**: truncado com rolagem no
  foco (como os títulos do app), sem quebrar o card; nunca interpretado como marcação.
- **Estação duplicada no diretório** (mesma estação em espelhos/ids diferentes): cada id
  aparece uma vez.
- **Tela Rádio aberta e a pessoa abre um canal/filme pela topbar ou pelo Início**: a
  rádio já parou ao sair da tela (o motor de reprodução é um só).
- **Proteção de tela da TV ligando com a rádio tocando**: a proteção liga e o som continua.
- **Tecla de mídia Stop**: para a rádio. Play/Pause não pausa, porque rádio ao vivo não
  tem pausa.

## Requirements *(mandatory)*

### Functional Requirements

**Entrada e navegação**

- **FR-001**: A topbar DEVE ter o destino **Rádio** logo depois de **Séries**, só quando
  há lista ativa, com rótulo traduzido em pt/en/es.
- **FR-002**: RETURN DEVE seguir as camadas do app: da grade para a trilha, da trilha para
  o Início, como nos outros destinos de topo (ADR-011 §3).
- **FR-003**: Ao voltar à Rádio na mesma sessão, a tela DEVE restaurar o item da trilha e a
  estação focada **por identidade**, nunca por índice. Se a estação sumiu, o foco vai
  para o primeiro item da grade.
- **FR-004**: Toda tela e estado (carregando, vazio, erro, sem rede, cache) DEVE ter ao
  menos um elemento focável.

**Trilha e estações**

- **FR-005**: A trilha DEVE mostrar, nesta ordem:
  1. `★ Favoritos`;
  2. "Mais ouvidas no mundo";
  3. o país da TV (se estiver no diretório);
  4. os demais países, em ordem decrescente de quantidade de estações, com essa
     quantidade visível.
- **FR-006**: A trilha DEVE paginar com `←`/`→` como as trilhas de categoria (feature 049),
  com OK como único gesto que entra num item.
- **FR-007**: Focar um item da trilha NÃO DEVE consultar o diretório nem trocar a grade.
  Só OK faz isso. Não há pré-carga de outros países.
- **FR-008**: Cada país e "Mais ouvidas no mundo" DEVEM mostrar até **100** estações não
  quebradas, das mais ouvidas para as menos, sem duplicar a mesma estação.
- **FR-009**: Cada card de estação DEVE mostrar arte (favicon ou iniciais), nome e até 2
  tags do diretório. Em "Mais ouvidas no mundo" e `★ Favoritos`, também o país.
- **FR-010**: Nomes de país DEVEM aparecer no idioma do app, derivados do código ISO, com
  o nome do diretório como fallback. Nome de estação e tags NÃO DEVEM ser traduzidos
  (texto de provedor).
- **FR-011**: O país inicial DEVE ser o último usado. Na primeira vez, o país configurado na
  TV. Se ele não for determinável ou não estiver no diretório, Brasil.

**Reprodução**

- **FR-012**: OK numa estação DEVE tocá-la. Focar NUNCA DEVE tocar.
- **FR-013**: Enquanto toca, a tela DEVE mostrar uma mini-barra com arte, nome, país,
  formato/kbps e a ação Parar, sem tirar o foco da grade. A pessoa continua navegando.
- **FR-014**: OK numa estação diferente da que toca DEVE trocar para ela; OK na que toca,
  ou Parar, DEVE parar. Uma resposta atrasada de uma escolha anterior NUNCA DEVE
  substituir a estação escolhida por último.
- **FR-015**: Sair da tela Rádio, por qualquer caminho, DEVE parar a reprodução.
- **FR-016**: A reprodução NÃO DEVE oferecer pausa, busca, posição ou duração, porque é
  rádio ao vivo. A tecla Stop DEVE parar.
- **FR-017**: Quando uma estação não toca ou cai, a mini-barra DEVE mostrar "estação
  indisponível" com "Tentar de novo" e "Próxima estação". Sem ação da pessoa, NADA DEVE
  começar a tocar.
- **FR-018**: Com uma estação tocando, a proteção de tela da TV DEVE poder ligar
  normalmente, sem interromper o som.
- **FR-019**: Depois que uma estação começa a tocar, o app DEVE registrar o clique no
  diretório como o serviço pede (ADR-018 §3), sem efeito visível e sem erro visível se
  falhar.

**Favoritos**

- **FR-020**: Segurar OK ou a tecla amarela numa estação DEVE alternar favorito, com
  indicação no card e anúncio acessível. O gesto NÃO DEVE tocar a estação.
- **FR-021**: `★ Favoritos` DEVE listar as estações favoritas de qualquer país, com o que
  foi guardado delas (nome, arte, país), mesmo sem rede.
- **FR-022**: Favoritos de estação DEVEM ser guardados só no aparelho, pela identidade
  estável da estação (nunca pela URL do stream). NÃO DEVEM ser apagados ao remover ou
  trocar de lista, nem entrar no backup de uso.
- **FR-023**: Tocar um favorito DEVE usar a versão atual da estação no diretório. Se ela não
  existir mais, vale a falha de FR-017, e a pessoa pode desfavoritar.

**Dados, rede e privacidade**

- **FR-024**: O app DEVE guardar localmente a lista de países e as estações de cada país
  visitado. Se o diretório ou a rede falhar, a tela DEVE abrir a partir disso com aviso
  de que pode estar desatualizado, e oferecer "Tentar de novo".
- **FR-025**: Uma resposta inválida do diretório (não-JSON, malformada, formato inesperado)
  DEVE ser tratada como falha, nunca como lista vazia.
- **FR-026**: Para o diretório, o app NÃO DEVE enviar nada além do código do país, da
  identidade da estação (clique) e dos parâmetros fixos da consulta. NUNCA DEVE enviar
  credencial, URL ou nome de lista, id/chave do dispositivo, chave TMDB, favoritos ou
  histórico (ADR-018 §2).
- **FR-027**: URL de stream, endereço do diretório ou resposta crua NÃO DEVEM aparecer em
  mensagem de erro, log ou tela. Erros aparecem por categoria fixa (sem conexão,
  diretório indisponível, estação indisponível).
- **FR-028**: Arte de estação só DEVE ser carregada de endereço http(s) sem credencial
  embutida, com tempo limite, caindo para iniciais quando falhar.

**Texto e design**

- **FR-029**: Todo texto do app nesta tela DEVE vir do catálogo de i18n em pt/en/es, usar os
  tokens do DS V14 (mínimo 20 px, padrão 24 px), e a tela DEVE entrar na auditoria de
  legibilidade em pt/en/es.

### Key Entities

- **País do diretório**: código ISO, nome no diretório, quantidade de estações. O nome
  exibido é derivado do código no idioma do app.
- **Estação**:
  - identidade estável `radio-browser:<id da estação>`;
  - nome, arte (endereço de imagem opcional), país (código), tags, formato e kbps;
  - indicação de stream segmentado;
  - endereço do stream (dado do diretório, não segredo, mas nunca chave de nada nem
    exibido);
  - popularidade (para ordenar).
- **Favorito de estação**: identidade da estação, nome, arte, país e data em que foi
  favoritada. Local ao aparelho, independente de lista.
- **Lembrança da tela Rádio**: último país/item da trilha usado e foco por identidade
  (sessão), para FR-003/FR-011.
- **Dados guardados do diretório**: países e estações por país visitado, com o momento em
  que foram obtidos (FR-024).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Na TV de referência, pelo menos **8 das 10** estações mais ouvidas do Brasil
  tocam com som audível pelo fluxo real da tela (o spike do assessment obteve 10/10 fora
  do app).
- **SC-002**: O fluxo topbar → Rádio → país → estação → tocar → trocar → parar → RETURN até o
  Início é completado só com o controle remoto, sem foco preso em nenhum estado, e ao
  voltar o foco está na mesma estação.
- **SC-003**: Focar itens da trilha sem apertar OK gera **zero** consultas ao diretório
  (verificado por teste automatizado).
- **SC-004**: Do OK numa estação até ouvir som, o tempo é medido em pelo menos 10 estações
  na TV e registrado. Meta: mediana ≤ **5 s** em rede doméstica (ASSUMPTION: meta
  inicial, sem medição anterior).
- **SC-005**: A auditoria de legibilidade não aponta texto abaixo do mínimo nem cortado na
  tela Rádio (com e sem mini-barra, vazio, erro) em pt, en e es.
- **SC-006**: Nenhuma requisição ao diretório contém dado além do previsto em FR-026, e
  nenhuma mensagem de erro exibida contém URL (verificado por teste automatizado).
- **SC-007**: Com o diretório inacessível, depois de ao menos uma visita a um país, a tela
  abre mostrando esse país a partir do que foi guardado.

## Assumptions

- O diretório Radio Browser segue acessível da TV com CORS aberto e com as mesmas
  regras de uso verificadas em 2026-10-15 (ADR-018).
- O motor de reprodução da TV toca áudio puro de rádio de internet, conforme o spike
  (10/10, só o topo do Brasil). Outros formatos e países não foram medidos.
- O país configurado na TV pode ser lido pelo app. Se não puder, o fallback é Brasil.
- O idioma do app tem nomes de país disponíveis para os códigos ISO do diretório. Se
  faltar algum, mostra o nome do diretório.
- A topbar comporta um quinto destino no layout V14 em pt/en/es sem cortar texto.
- A pessoa já tem lista ativa (a topbar só existe com fonte ativa).
- Não há medição de uso: o sucesso é julgado pelos critérios acima e pela passada na TV.

## Clarifications

### Sessão 2026-10-15

- Q: Como a tela se organiza? → A: Trilha de países + grade de estações, como a TV ao vivo.
- Q: O que se vê enquanto toca? → A: Mini-barra na própria tela; a pessoa segue navegando
  e troca de estação com OK.
- Q: País inicial? → A: O último usado; na 1ª vez, o país da TV; senão, Brasil.
- Q: Quantas estações por país? → A: As 100 mais ouvidas (não quebradas).
- Q: O que o RETURN faz com rádio tocando? → A: Navega como sempre; a rádio para ao sair da
  tela. Para parar antes: OK na estação que toca ou Parar na mini-barra.
- Q: Favoritos? → A: Igual à TV ao vivo (segurar OK / tecla amarela) + `★ Favoritos` fixo no
  topo da trilha.
- Q: Entrada global? → A: Sim, "Mais ouvidas no mundo" abaixo de Favoritos.
- Q: Como achar um país entre ~230? → A: Ordem por quantidade de estações, país da TV no
  topo, paginação `←`/`→` (sem busca no MVP).
- Q: Estação que não toca? → A: Erro na mini-barra com "Tentar de novo"/"Próxima estação";
  nunca pula sozinho.
- Q: Formatos possivelmente incompatíveis? → A: Mostrar todas; a falha é tratada; filtro só
  depois, com dado da TV.
- Q: O que o card mostra? → A: Arte, nome e até 2 tags; formato/kbps só na mini-barra.
- Q: Nome dos países? → A: No idioma do app, pelo código ISO; nome do diretório como
  fallback.
- Q: Proteção de tela com rádio tocando? → A: Pode ligar; o áudio continua.
- Q: Controle parental? → A: Fora do MVP.
- Decisões herdadas da ADR-018 e do assessment, sem nova pergunta: favoritos só locais
  (fora do backup); clique enviado ao diretório; favicon com fallback; Rádio exige lista
  ativa mas não lê dela; sem segundo plano; sem rádios da lista (044).
