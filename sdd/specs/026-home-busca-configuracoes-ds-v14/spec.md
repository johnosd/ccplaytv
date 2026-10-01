# Feature Specification: Home definitiva, Busca global e Configurações no Design System V14 (Onda 5)

**Slug**: `026-home-busca-configuracoes-ds-v14`

**Created**: 2026-09-27

**Status**: Convergida

**Input**: Onda 5 da migração para o Design System V14 Spectrum — item M6
do backlog (`.planning/backlog.md`) e seção "Onda 5" de
`.planning/migracao-design-system-v14.md`: Home definitiva em hero + rails
(absorve o item 16 do backlog), Busca global na topbar e Configurações em
abas laterais. O hub provisório (`ListHomeScreen`, 3 tiles + "Continuar
assistindo") sai do código.

## Contexto

Desde a feature 023, o Início é uma moldura V14 (topbar + barra de teclas)
em volta do **conteúdo provisório** do hub antigo: `ListHomeScreen`, com
três atalhos grandes (TV ao vivo, Filmes, Séries), a seção "Continuar
assistindo" (feature 019) e o aviso de Modo limitado (feature 014). Na
topbar, "Buscar" e "Configurações" são mocks "Em breve". A gestão de listas
(editar, ressincronizar, excluir) mora nos cartões da tela "Quem está
assistindo?" (feature 023).

Esta onda entrega as três superfícies que faltam do shell V14:

- **Home definitiva** no layout `home()` do protótipo (§13, §16, §32 do
  Spec): hero de largura total + rails horizontais com dado real
  ("Continuar assistindo", "Minha Lista", "Canais favoritos") + mocks
  honestos ("Curadoria IA", dock de serviços).
- **Busca global**: a lupa da topbar vira real, numa tela própria que
  pesquisa canais, filmes e séries **já lidos** da lista ativa, com aviso de
  cobertura (o mesmo motor `searchIndex()` da feature 018).
- **Configurações** em abas laterais (`settings()` do protótipo): Fontes
  IPTV (real — a gestão de listas, hoje só nos cartões da tela de perfis,
  ganha um lugar completo aqui, com o aviso de Modo limitado que o hub
  provisório exibia),
  Acessibilidade ("Reduzir movimento" real), Sobre (real) e três abas "Em
  breve" (Integrações & BYOK, Player & reprodução, Perfis & parental).

Nada do que as features 001–025 entregaram pode ficar inalcançável: toda
ação de gestão de lista continua existindo, só muda de lugar.

## Escopo

### Incluído

- **Home definitiva** sob a topbar persistente (aba "Início" atual):
  - Hero de largura total com o **primeiro item de "Continuar
    assistindo"**; sem progresso, o **primeiro favorito de filme ou
    série**; sem nenhum dos dois, um hero de **boas-vindas**. Capa real
    (feature 015), título e metadados reais; nunca sinopse, nota,
    "relevância" ou selo inventado.
  - Ações do hero: primária "Continuar" (retoma direto, com o player por
    cima da Home) ou "Assistir"; "Mais informações" (abre o detalhe);
    "Minha Lista" (alterna favorito); "Trailer" como mock "Em breve"
    (item 32).
  - Rails reais: "Continuar assistindo" (feature 019), "Minha Lista"
    (favoritos de filmes e séries, feature 013) e "Canais favoritos"
    (linha compacta com logo, slot "Agora" vazio — sem EPG, item 42).
  - "Ver todos (N)" com contagem real onde há destino único: "Canais
    favoritos" → TV ao vivo em `★ Favoritos`; "Minha Lista" → dois atalhos,
    "Filmes (N)" → Filmes em `★ Favoritos` e "Séries (N)" → Séries em
    `★ Favoritos`. "Continuar assistindo" não tem "Ver todos".
  - Mocks: uma rail "Curadoria IA" com um único card "Em breve" (itens
    30/31) e um dock de serviços com ícones soft disabled (TMDB, IA, clima,
    teste de velocidade — item 54).
  - Rail sem itens não renderiza; cada rail tem skeleton próprio enquanto
    carrega.
- **Remoção do hub provisório**: `ListHomeScreen`, seus testes, CSS e
  trechos de E2E saem do código; os três atalhos grandes deixam de existir
  (a topbar já leva aos três destinos).
- **Busca global**:
  - Lupa da topbar real em **todas** as telas com topbar (Início, TV ao
    vivo, Filmes, Séries); abre a tela "Buscar" sob a topbar.
  - Campo de texto conforme o IME da TV (rótulo permanente, `TextField` da
    feature 022); resultados a partir de 2 caracteres, filtrados ao
    digitar, agrupados em rails por tipo (Canais, Filmes, Séries).
  - Pesquisa só o que já foi lido da lista ativa; aviso de cobertura
    permanente ("Busca em X de Y categorias").
  - Botão "Buscar por voz" como mock "Em breve" (item 33).
  - OK num resultado: filme → detalhe do filme; série → detalhe da série;
    canal → TV ao vivo tocando o canal. RETURN volta à busca com o termo e
    o resultado de origem focado.
- **Configurações** (lupa e engrenagem viram reais na topbar de todas as
  telas com topbar), em abas laterais na ordem do DS:
  - **Integrações & BYOK** — mock "Em breve" (itens 28, 31, 54).
  - **Fontes IPTV** — real e **aba inicial**: todas as listas cadastradas
    (não só a ativa), cada uma com nome, tipo (Xtream/M3U), marca de "lista
    ativa", última sincronização real, badge de Modo limitado com a
    explicação (hoje `LimitedModeNotice`), e as ações Editar,
    Ressincronizar, Excluir (com confirmação) e "EPG" como mock "Em breve"
    (item 42); mais "Adicionar lista".
  - **Player & reprodução** — mock "Em breve" (item 55).
  - **Acessibilidade & sistema** — "Reduzir movimento" real (liga/desliga
    a preferência interna persistida da feature 021); demais opções do DS
    (Voice Guide, alto contraste, aparência de legendas) como mock "Em
    breve" (item 56).
  - **Perfis & parental** — mock "Em breve" (item 52).
  - **Sobre & créditos** — real: nome e versão do app, licenças das fontes
    tipográficas embarcadas.
- **Tela "Quem está assistindo?"** mantém as ações de gestão por cartão
  (Ressincronizar, Editar, Excluir — comportamento e contrato travado da
  feature 023 intactos) e ganha um atalho "Gerenciar listas", que abre
  Configurações › Fontes IPTV sem exigir escolher uma lista antes.
- Estados de carregando, erro e vazio das três telas com os componentes V14,
  cada um com elemento focável.
- Atualização dos E2E afetados (`e2e.mjs`, `historico-continuar-
  assistindo.mjs`, `paridade-visual.mjs` e qualquer outro que passe pelo hub
  ou pelas ações de gestão na tela de perfis) e um E2E novo cobrindo Home,
  Busca e Configurações.

### Fora de Escopo

- **Limpar histórico / remover item do `↺ Histórico`** — adiado pela
  feature 025 para esta onda; **não entra** aqui e volta ao backlog como
  item próprio. Não há aba "Privacidade".
- **Buscas recentes** persistidas e **chips de gênero** do protótipo — os
  chips exigiriam taxonomia externa (constitution, "Categorias da Fonte São
  Preservadas").
- **Busca que dispara leitura** de categorias ainda não carregadas, ou
  qualquer consulta à rede ao digitar.
- **Busca por voz real** (item 33), **EPG real** (item 42), **TMDB/IA
  reais** (itens 28, 30, 31), **trilhas/qualidade** (item 55),
  **acessibilidade além de "Reduzir movimento"** (item 56), **perfis de
  pessoa e PIN** (item 52), **clima e teste de velocidade** (item 54).
- Rail "Histórico recente" e rail "Tendências/Top" na Home.
- **Agregação multi-fonte** (item 23): Home, Busca e "Minha Lista" são
  sempre da lista ativa. Configurações › Fontes lista todas, mas só para
  gestão.
- **Chrome do player** (auto-hide, botões de trilhas) — Onda 6. O hero usa
  o player atual (features 011/012/020).
- Topbar sobre os detalhes de filme/série e sobre o player.
- Esportes/Infantil na topbar (ADR-011).
- Quebra do `screens.css` e limpeza geral de CSS — Onda 7 (só o CSS do hub
  removido sai aqui).
- Mudança de regras de negócio em `lib/` (importação, catálogo, estado do
  usuário) além do que a nova composição de dados da Home exigir.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Home definitiva em hero + rails (Priority: P1)

A pessoa escolhe uma lista em "Quem está assistindo?" e cai no Início: no
topo, um hero grande com o filme ou a série que ela estava vendo, com
"Continuar" já em foco. Abaixo, rails de "Continuar assistindo", "Minha
Lista" e "Canais favoritos", mais um card "Em breve" de Curadoria IA. OK em
"Continuar" retoma o vídeo na hora; RETURN fecha o player e volta ao hero.
Descendo, ela percorre as rails; OK num card abre o detalhe (filme/série) ou
a TV ao vivo tocando o canal.

**Why this priority**: é a primeira tela depois de escolher a lista e o
motivo de a onda existir; sem ela o `ListHomeScreen` provisório não pode
sair.

**Independent Test**: com uma lista que tenha progresso, favoritos de
filme/série e canais favoritos, abrir o Início e verificar hero, rails,
retomada direta pelo hero, abertura de detalhe e de canal pelos cards,
"Ver todos" e a volta com o foco restaurado.

**Acceptance Scenarios**:

1. **Given** a lista ativa tem itens em "Continuar assistindo", **When** o
   Início abre, **Then** o hero mostra o primeiro deles (capa real,
   título), com a ação primária "Continuar" focada.
2. **Given** não há progresso mas há favoritos de filme ou série, **When**
   o Início abre, **Then** o hero mostra o primeiro favorito, com a ação
   primária "Assistir".
3. **Given** não há progresso nem favoritos de filme/série, **When** o
   Início abre, **Then** o hero é de boas-vindas (sem conteúdo inventado),
   com uma ação focável, e só as rails com dado aparecem.
4. **Given** o hero mostra um filme com posição salva, **When** a pessoa
   aperta OK em "Continuar", **Then** a reprodução começa naquela posição
   por cima da Home, e RETURN fecha o player e devolve o foco a
   "Continuar".
5. **Given** o hero mostra uma série com episódio em andamento, **When** OK
   em "Continuar", **Then** o episódio em andamento retoma na posição
   salva.
6. **Given** o hero, **When** OK em "Mais informações", **Then** abre o
   detalhe do item; RETURN volta ao Início com o foco em "Mais
   informações".
7. **Given** o hero, **When** OK em "Minha Lista", **Then** o favorito
   alterna, o rótulo reflete o estado e a rail "Minha Lista" se atualiza
   sem sair da tela.
8. **Given** um card de "Continuar assistindo" ou "Minha Lista", **When**
   OK, **Then** abre o detalhe do filme ou da série; RETURN volta ao mesmo
   card (por id).
9. **Given** um card de "Canais favoritos", **When** OK, **Then** abre TV
   ao vivo em `★ Favoritos` com o canal focado e tocando; RETURN (depois de
   fechar o player e sair da Live) volta ao mesmo card.
10. **Given** "Minha Lista" com filmes e séries, **When** OK em "Filmes
    (N)", **Then** abre Filmes em `★ Favoritos`; "Séries (N)" abre Séries em
    `★ Favoritos`; N é a contagem real de cada tipo.
11. **Given** o card "Curadoria IA" ou um ícone do dock, **When** OK,
    **Then** aparece o aviso "Em breve — …" e nada mais acontece.
12. **Given** o Início, **When** RETURN (sem player aberto), **Then** abre o
    modal de saída — como hoje.

---

### User Story 2 - Configurações com gestão de listas (Priority: P1)

A pessoa aperta OK na engrenagem da topbar e vê Configurações: abas à
esquerda, "Fontes IPTV" aberta. Ali estão todas as listas, com qual é a
ativa, quando sincronizou pela última vez e se está em Modo limitado (com a
explicação). Ela edita uma lista, ressincroniza outra (vê a tela de
progresso) e exclui uma terceira depois de confirmar. Em "Acessibilidade",
liga "Reduzir movimento". Em "Sobre", vê a versão do app.

**Why this priority**: o aviso de Modo limitado, que hoje só existe no hub
provisório, passa a morar aqui; sem Configurações › Fontes ele ficaria
inalcançável ao remover o hub. É P1 junto com a Home porque as duas juntas
é que permitem remover o hub provisório.

**Independent Test**: com duas listas cadastradas, abrir Configurações pela
topbar e pelo atalho "Gerenciar listas" da tela de perfis, executar editar,
ressincronizar, excluir (inativa e ativa), adicionar, alternar "Reduzir
movimento" e percorrer as abas mock.

**Acceptance Scenarios**:

1. **Given** qualquer tela com topbar, **When** OK na engrenagem, **Then**
   abre Configurações com a aba "Fontes IPTV" ativa e o foco nela.
2. **Given** a aba Fontes IPTV, **When** exibida, **Then** cada lista
   mostra nome, tipo, marca de ativa (só na ativa), última sincronização
   (ou "Nunca sincronizada") e, se em Modo limitado, o badge com a
   explicação — e **nunca** URL, DNS, usuário ou senha.
3. **Given** uma lista, **When** OK em "Editar", **Then** abre o formulário
   de edição existente; salvar ou RETURN volta a Configurações › Fontes com
   o foco na mesma lista.
4. **Given** uma lista, **When** OK em "Ressincronizar", **Then** abre a
   tela de progresso de importação existente, que termina com a ação de
   abrir a lista.
5. **Given** uma lista inativa, **When** OK em "Excluir", **Then** abre um
   modal de confirmação com "Cancelar" focado; confirmar remove a lista,
   seus favoritos e progresso (comportamento da feature 013/019) e o foco
   vai para a lista vizinha (ou "Adicionar lista", se não restar nenhuma).
6. **Given** a lista **ativa**, **When** a exclusão é confirmada, **Then**
   a tela "Quem está assistindo?" vira a base, com a pilha zerada (mesmo
   comportamento de hoje).
7. **Given** a aba Fontes, **When** OK em "EPG", **Then** aviso "Em breve —
   …".
8. **Given** a aba Fontes, **When** OK em "Adicionar lista", **Then** abre
   o onboarding existente.
9. **Given** a aba Acessibilidade, **When** OK em "Reduzir movimento",
   **Then** o valor alterna (Ligado/Desligado), o efeito vale na hora e
   persiste entre aberturas do app.
10. **Given** uma aba mock (Integrações, Player, Perfis & parental), **When**
    ela é aberta, **Then** mostra cabeçalho real + estado "Em breve" com
    explicação e um elemento focável.
11. **Given** a aba Sobre, **When** exibida, **Then** mostra nome e versão
    reais do app e as licenças das fontes embarcadas.
12. **Given** a tela "Quem está assistindo?", **When** OK em "Gerenciar
    listas", **Then** abre Configurações › Fontes IPTV sem lista ativa (sem
    topbar); RETURN volta aos perfis.
13. **Given** Configurações aberta pela topbar, **When** RETURN, **Then**
    volta à tela de onde veio, com o foco na engrenagem.

---

### User Story 3 - Busca global (Priority: P2)

De qualquer tela com topbar, a pessoa aperta OK na lupa, digita "matrix" no
teclado da TV e vê resultados em rails: Filmes, Séries e Canais cujo nome
contém o termo, só do que já foi carregado — com o aviso "Busca em 12 de 40
categorias". OK num filme abre o detalhe; RETURN volta à busca com o termo e
o resultado ainda lá.

**Why this priority**: útil, mas o app já tem busca por categoria (feature
018); a Home e Configurações vêm antes por serem as que liberam a remoção
do hub.

**Independent Test**: com algumas categorias de filmes, séries e canais já
carregadas, abrir a busca pela topbar de telas diferentes, digitar termos
com e sem resultado, abrir cada tipo de resultado e voltar.

**Acceptance Scenarios**:

1. **Given** qualquer tela com topbar, **When** OK na lupa, **Then** abre a
   tela "Buscar" com o campo focado, o aviso de cobertura e "Buscar por
   voz" (Em breve).
2. **Given** a tela de busca, **When** o termo tem menos de 2 caracteres,
   **Then** nenhum resultado é mostrado, só o estado inicial.
3. **Given** um termo com 2+ caracteres, **When** a pessoa digita, **Then**
   os resultados aparecem em rails por tipo (só tipos com resultado), sem
   atraso artificial e sem nenhuma consulta à rede.
4. **Given** um termo sem resultado, **When** exibido, **Then** aparece um
   estado vazio que repete o aviso de cobertura (a pessoa entende que pode
   haver itens em categorias ainda não abertas) e mantém um elemento
   focável.
5. **Given** um resultado de filme ou série, **When** OK, **Then** abre o
   detalhe; RETURN volta à busca com o mesmo termo e o mesmo resultado
   focado.
6. **Given** um resultado de canal, **When** OK, **Then** abre TV ao vivo
   tocando o canal; RETURN (depois de sair da Live) volta à busca.
7. **Given** a tela de busca, **When** RETURN sem teclado aberto, **Then**
   volta à tela de onde a busca foi aberta, com o foco na lupa.

### Edge Cases

- **Item do hero some** (concluído em outra tela, favorito removido,
  categoria regenerada): ao revalidar, o hero passa ao próximo candidato da
  cadeia sem deixar o foco num elemento que não existe mais (mesmo padrão
  de "linha efetiva" da feature 023).
- **Item de "Continuar" que não resolve** mais no catálogo (fonte
  ressincronizada sem ele): não aparece no hero nem na rail; nunca um card
  quebrado.
- **Retomada pelo hero falha** (URL inválida/expirada): mesma tela de erro
  do player das features 011/020; ao fechar, foco volta ao hero.
- **Série no hero sem episódio resolvível** (lista de episódios nunca lida
  ou indisponível offline): "Continuar" abre o detalhe da série em vez de
  falhar em silêncio.
- **Lista sem nada carregado ainda** (acabou de importar a estrutura):
  Home mostra hero de boas-vindas + mocks; Busca mostra "Busca em 0 de Y
  categorias" e explica que é preciso abrir categorias.
- **Rail que fica vazia** enquanto a tela está aberta (último favorito
  removido pelo hero): a rail some e o foco vai para o vizinho mais
  próximo, nunca para o nada.
- **Offline**: Home, Busca e Configurações abrem do IndexedDB; só
  reproduzir e ressincronizar dependem de rede, e falham com as mensagens
  já existentes.
- **Nome de lista muito longo** em Configurações: truncado com reticências,
  sem empurrar as ações.
- **Excluir a última lista** restante: volta a "Quem está assistindo?" só
  com "Adicionar lista".
- **Ressincronizar a lista ativa** pelas Configurações enquanto ela está em
  uso: ao terminar, abrir a lista volta ao Início da lista atualizada.
- **Termo de busca com acentos/maiúsculas**: mesma normalização da feature
  018.
- **Muitos resultados** numa rail de busca: rail virtualizada, sem travar a
  digitação.
- **Teclado da TV aberto** na busca: RETURN fecha o teclado primeiro, só
  depois sai da tela (RETURN em camadas).
- **Duplo OK** em "Excluir" ou "Ressincronizar": uma ação só.

## Requirements *(mandatory)*

### Functional Requirements

**Home (US1)**

- **FR-001**: O Início DEVE substituir o conteúdo provisório do hub
  (`ListHomeScreen`) por hero + rails, sob a topbar persistente da feature
  023.
- **FR-002**: O hero DEVE mostrar, nesta ordem de preferência: o primeiro
  item de "Continuar assistindo" da lista ativa; senão o primeiro favorito
  de filme ou série; senão um hero de boas-vindas.
- **FR-003**: O hero DEVE exibir só dados reais do catálogo (capa real com
  fallback, título, metadados já disponíveis) e NÃO DEVE exibir sinopse,
  nota, percentual de relevância, classificação ou selo não fornecidos pela
  fonte.
- **FR-004**: A ação primária do hero DEVE ser "Continuar" quando há
  posição salva (filme) ou episódio em andamento (série), e "Assistir"
  caso contrário; o foco inicial do Início DEVE ser essa ação.
- **FR-005**: OK em "Continuar"/"Assistir" no hero DEVE iniciar a
  reprodução por cima do Início (filme na posição salva; série no episódio
  em andamento na posição salva; "Assistir" de série a partir do primeiro
  episódio conhecido), com RETURN fechando o player e devolvendo o foco à
  ação primária.
- **FR-006**: Quando a série do hero não tem episódio resolvível, a ação
  primária DEVE abrir o detalhe da série em vez de tentar reproduzir.
- **FR-007**: O hero DEVE oferecer "Mais informações" (abre o detalhe),
  "Minha Lista" (alterna favorito, com rótulo refletindo o estado) e
  "Trailer" como mock "Em breve".
- **FR-008**: O hero de boas-vindas DEVE ter ao menos uma ação focável e
  real (por exemplo, abrir Filmes ou TV ao vivo).
- **FR-009**: O Início DEVE exibir as rails "Continuar assistindo", "Minha
  Lista" (favoritos de filmes e séries) e "Canais favoritos", nessa ordem,
  todas da lista ativa.
- **FR-010**: Uma rail sem itens NÃO DEVE ser renderizada; uma rail
  carregando DEVE mostrar skeleton com a geometria do card real.
- **FR-011**: As rails DEVEM ser horizontais e virtualizadas, com o foco
  dirigindo o scroll.
- **FR-012**: OK num card de filme ou série DEVE abrir o detalhe
  correspondente; um episódio em "Continuar assistindo" DEVE resolver para
  a série (regra da feature 019).
- **FR-013**: OK num card de "Canais favoritos" DEVE abrir TV ao vivo em
  `★ Favoritos`, com o canal focado e em reprodução.
- **FR-014**: A rail "Canais favoritos" DEVE terminar com "Ver todos (N)",
  que abre TV ao vivo em `★ Favoritos`; a rail "Minha Lista" DEVE terminar
  com "Filmes (N)" e "Séries (N)", cada um presente só se N > 0, abrindo
  Filmes/Séries em `★ Favoritos`. N DEVE ser a contagem real.
- **FR-015**: Os cards de canal DEVEM reservar o slot "Agora" vazio (sem
  texto inventado de programação).
- **FR-016**: O Início DEVE exibir uma rail "Curadoria IA" com um único
  card "Em breve" e um dock de serviços com ícones soft disabled, ambos
  registrados no registro único de mocks; OK neles DEVE anunciar "Em breve
  — <descrição>" e não fazer mais nada.
- **FR-017**: Voltar ao Início a partir de detalhe, player, Live, Filmes,
  Séries, Busca ou Configurações DEVE restaurar o foco no elemento de
  origem, reconciliado por id do item (não por índice); se ele não existir
  mais, no vizinho mais próximo.
- **FR-018**: Quando o item focado ou o item do hero deixa de existir com a
  tela aberta, o foco DEVE cair num elemento visível e focável.
- **FR-019**: RETURN no Início (sem camada aberta) DEVE continuar abrindo o
  modal de saída.
- **FR-020**: `ListHomeScreen`, seus testes e seu CSS DEVEM ser removidos;
  os três atalhos grandes deixam de existir.

**Configurações (US2)**

- **FR-021**: A engrenagem da topbar DEVE ser real em todas as telas com
  topbar e abrir Configurações sob a topbar.
- **FR-022**: Configurações DEVE ter abas laterais na ordem: Integrações &
  BYOK, Fontes IPTV, Player & reprodução, Acessibilidade & sistema, Perfis
  & parental, Sobre & créditos; a aba inicial DEVE ser Fontes IPTV.
- **FR-023**: A aba Fontes IPTV DEVE listar todas as listas cadastradas,
  cada uma com nome, tipo (Xtream ou M3U), marca de lista ativa, data da
  última sincronização bem-sucedida (ou "Nunca sincronizada") e, quando em
  Modo limitado, o badge com a explicação da feature 014.
- **FR-024**: A aba Fontes IPTV NÃO DEVE exibir URL, DNS, usuário, senha
  ou qualquer parte de credencial.
- **FR-025**: Cada lista DEVE ter as ações Editar, Ressincronizar, Excluir
  e "EPG" (mock "Em breve"); a aba DEVE ter "Adicionar lista".
- **FR-026**: Editar DEVE abrir o formulário de edição existente; ao
  concluir ou voltar, o foco DEVE retornar à mesma lista em Configurações.
- **FR-027**: Ressincronizar DEVE abrir a tela de progresso de importação
  existente; uma segunda ativação durante uma ressincronização da mesma
  lista NÃO DEVE iniciar outra.
- **FR-028**: Excluir DEVE exigir confirmação num modal com "Cancelar"
  focado; confirmada, a exclusão DEVE manter o comportamento atual
  (remove favoritos e progresso da lista); se a lista era a ativa, "Quem
  está assistindo?" vira a base com a pilha zerada; senão o foco vai à
  lista vizinha ou a "Adicionar lista".
- **FR-029**: A aba Acessibilidade DEVE oferecer "Reduzir movimento" real,
  alternando a preferência interna persistida (feature 021), com efeito
  imediato; as demais opções do DS DEVEM aparecer como mock "Em breve".
- **FR-030**: A aba Sobre DEVE mostrar o nome e a versão reais do app e as
  licenças das fontes tipográficas embarcadas; NÃO DEVE exibir atribuição
  de serviço que o app não usa.
- **FR-031**: As abas Integrações & BYOK, Player & reprodução e Perfis &
  parental DEVEM mostrar cabeçalho real + estado "Em breve" com
  explicação, registrados no registro único de mocks, com um elemento
  focável.
- **FR-032**: A tela "Quem está assistindo?" DEVE manter as ações de
  gestão por cartão (Ressincronizar, Editar, Excluir) exatamente como hoje
  e ganhar a ação "Gerenciar listas", que abre Configurações › Fontes IPTV.
- **FR-033**: Configurações aberta sem lista ativa (via "Gerenciar listas")
  NÃO DEVE mostrar a topbar; RETURN DEVE voltar a "Quem está assistindo?".
- **FR-034**: RETURN em Configurações aberta pela topbar DEVE voltar à tela
  de origem com o foco na engrenagem.

**Busca global (US3)**

- **FR-035**: A lupa da topbar DEVE ser real em todas as telas com topbar
  e abrir a tela "Buscar" sob a topbar, com o campo de texto focado.
- **FR-036**: O campo DEVE seguir as regras de entrada de texto da TV
  (rótulo permanente, IME da plataforma); RETURN com o teclado aberto DEVE
  fechar o teclado antes de sair da tela.
- **FR-037**: A busca DEVE pesquisar canais, filmes e séries **já lidos**
  da lista ativa, com a mesma normalização de texto da feature 018, e NÃO
  DEVE disparar nenhuma leitura de categoria nem consulta à rede.
- **FR-038**: A tela DEVE mostrar sempre o aviso de cobertura "Busca em X
  de Y categorias", com X e Y reais.
- **FR-039**: Resultados DEVEM aparecer a partir de 2 caracteres, ao
  digitar, agrupados em rails por tipo (Canais, Filmes, Séries), exibindo
  só os tipos com resultado; rails virtualizadas.
- **FR-040**: Sem resultado, a tela DEVE mostrar um estado vazio que
  repete o aviso de cobertura e mantém um elemento focável.
- **FR-041**: OK num resultado de filme/série DEVE abrir o detalhe; num
  canal DEVE abrir TV ao vivo com o canal focado e em reprodução.
- **FR-042**: Voltar à busca a partir de um resultado DEVE preservar o
  termo e o foco no resultado de origem (por id).
- **FR-043**: "Buscar por voz" DEVE aparecer como mock "Em breve".
- **FR-044**: RETURN na busca (teclado fechado) DEVE voltar à tela de
  origem com o foco na lupa.

**Transversais**

- **FR-045**: Todo mock desta feature DEVE estar no registro único de
  mocks (feature 022) com o item do backlog que o substitui; nenhum mock
  DEVE exibir dado fictício.
- **FR-046**: Todo estado (carregando, vazio, erro) de Home, Busca e
  Configurações DEVE ter ao menos um elemento focável.
- **FR-047**: Focar um elemento NÃO DEVE iniciar reprodução nem consulta
  externa; só OK reproduz.
- **FR-048**: As telas novas DEVEM consumir os tokens V14 e os componentes
  da feature 022, sem valores de cor, raio, espaçamento ou fonte fixos.
- **FR-049**: Os E2E existentes que passavam pelo hub provisório ou pelas
  ações de gestão da tela de perfis DEVEM ser atualizados, e um E2E novo
  DEVE cobrir Home, Busca e Configurações.

### Key Entities

- **Candidato a hero**: item de catálogo (filme ou série) resolvido a
  partir de "Continuar assistindo" ou de favoritos, mais a ação primária
  derivada (Continuar/Assistir/abrir detalhe) e, para série, o episódio a
  retomar.
- **Rail da Home**: título, tipo de card (capa ou canal), itens reais da
  lista ativa e atalhos "Ver todos" com contagem real.
- **Resultado de busca**: item já lido (canal, filme ou série) que casa com
  o termo, agrupado por tipo; mais a cobertura (X de Y categorias).
- **Lista em Configurações**: fonte cadastrada exibida sem credencial
  (nome, tipo, ativa, última sincronização, Modo limitado + motivo).
- **Preferência "Reduzir movimento"**: valor persistido já existente
  (feature 021), agora com controle na interface.
- **Entrada de mock**: registro "Em breve" (id, mensagem, item do backlog).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Da escolha da lista até o vídeo retomado, uma pessoa com
  progresso salvo precisa de **um único OK** no Início.
- **SC-002**: 100% das ações de gestão de lista que existiam antes (criar,
  editar, ressincronizar, excluir, ver Modo limitado) continuam alcançáveis
  só com o controle remoto, tanto pelos cartões da tela de perfis quanto
  por Configurações › Fontes IPTV.
- **SC-003**: Nenhuma tela de Home, Busca ou Configurações, em nenhum
  estado (incluindo vazio, erro e lista recém-importada), deixa o controle
  remoto sem elemento focado.
- **SC-004**: Nenhum texto de URL, DNS, usuário ou senha aparece em
  Configurações, Busca ou Home.
- **SC-005**: Resultados da busca aparecem enquanto a pessoa digita, sem
  pausa perceptível, com 5.000 itens já lidos.
- **SC-006**: Voltar de detalhe, player ou Live ao Início ou à Busca
  devolve o foco ao item de origem em 100% dos casos em que ele ainda
  existe.
- **SC-007**: O código do hub provisório (`ListHomeScreen`) não existe mais
  no repositório, e a suíte de testes e todos os E2E passam.

## Assumptions

- `getContinueWatching()`/`resolveContinueWatching` (feature 019),
  `resolveFavorites`/`useFavoritesContent` (feature 013), `searchIndex()`
  (feature 018) e os componentes `Rail`, `ContentCard`, `ChannelRow`,
  `Skeleton`, `EmptyState`, `Modal`, `Tabs`/`SideCategoryNav`, `TextField`
  e `ComingSoon` (feature 022) servem como estão; o `sdd-plan` decide se
  algum precisa de ajuste.
- A entrada `★ Favoritos` de Live/Filmes/Séries já pode ser aberta
  diretamente (há snapshot de restauração de categoria desde a 017/025);
  abrir a Live com um canal específico tocando é viável reaproveitando o
  caminho de reprodução da Live.
- O player atual (`PlayerLayer`) pode ser montado sobre o Início; o Início
  precisa estar coberto pela regra CSS de plano de hardware (lição da
  feature 011).
- "Última sincronização" vem de `last_successful_sync_at`, já gravado por
  lista.
- A versão do app exibida em Sobre vem de uma fonte única do build (a
  mesma do pacote), decidida no `sdd-plan`.
- "Primeiro" em "Continuar assistindo" e em favoritos segue a ordem que
  esses dados já têm hoje (mais recente primeiro), sem ranqueamento novo.
- A tela de progresso, ao terminar uma ressincronização iniciada em
  Configurações, mantém o comportamento atual ("Abrir lista" define a
  lista como ativa e vai ao Início).
- Não há passada obrigatória na TV física nesta feature (é recomendada,
  junto com a medição de custo de render das rails — risco R-2 do
  roteiro — na Onda 6/7).

## Clarifications

### Sessão 2026-09-27

- Q: Como fatiar Home, Busca global e Configurações? → A: Uma feature
  (026) com três user stories independentes: P1 Home, P1 Configurações
  (junto com a Home, é o que permite remover o hub), P2 Busca global.
- Q: Onde fica a gestão de listas (editar, ressincronizar, excluir)? → A:
  Em Configurações › Fontes IPTV. **Revisto durante o `sdd-plan`** (ver
  abaixo): a tela de perfis também mantém as ações.
- Q: Que item o hero mostra? → A: Primeiro de "Continuar assistindo" →
  senão primeiro favorito de filme/série → senão boas-vindas.
- Q: Os três atalhos grandes (TV ao vivo/Filmes/Séries) continuam? → A:
  Não; a topbar cobre os três destinos.
- Q: Ações do hero? → A: Continuar/Assistir + Mais informações + Minha
  Lista; Trailer como mock "Em breve".
- Q: Quais rails reais? → A: Continuar assistindo, Minha Lista (favoritos
  de filmes e séries) e Canais favoritos. Sem rail de histórico recente.
- Q: Quais mocks na Home? → A: Rail "Curadoria IA" com um card "Em breve"
  e dock de serviços soft disabled. Sem rail de Tendências.
- Q: Para onde leva "Ver todos (N)"? → A: Canais favoritos → Live em
  `★ Favoritos`; Minha Lista → dois atalhos, "Filmes (N)" e "Séries (N)",
  para `★ Favoritos` de cada seção; Continuar assistindo sem "Ver todos".
- Q: O que a busca global pesquisa? → A: Só o já carregado da lista ativa,
  com aviso "Busca em X de Y categorias"; nunca dispara rede.
- Q: Forma da busca? → A: Tela própria sob a topbar, resultados em rails
  por tipo (Canais/Filmes/Séries).
- Q: Extras da busca do protótipo? → A: Só "Buscar por voz" como mock "Em
  breve"; sem buscas recentes, sem chips de gênero.
- Q: Lupa ativa em todas as topbars? → A: Sim — Início, Live, Filmes e
  Séries (a engrenagem também).
- Q: Abas de Configurações? → A: As 6 do DS; reais: Fontes IPTV (aba
  inicial), Acessibilidade ("Reduzir movimento") e Sobre; Integrações,
  Player e Perfis & parental como "Em breve".
- Q: O que Fontes IPTV mostra de cada lista? → A: Tipo, badge de Modo
  limitado com explicação, última sincronização real, marca de lista ativa
  e "EPG" como mock "Em breve".
- Q: Pode excluir a lista ativa? → A: Sim, com confirmação; "Quem está
  assistindo?" vira a base (comportamento atual).
- Q: Ressincronizar em Configurações mostra o quê? → A: A tela de
  progresso existente.
- Q: OK em "Continuar"? → A: No hero, toca direto por cima da Home; nos
  cards da rail, abre o detalhe (comportamento atual).
- Q: OK num canal (busca ou rail de Canais favoritos)? → A: Abre TV ao
  vivo com o canal focado e tocando; RETURN volta à origem.
- Q: Termo mínimo da busca? → A: 2 caracteres, filtrando ao digitar, sem
  debounce.
- Q: A tela de perfis sem as ações de gestão? → A: Cartões + "Adicionar
  lista" + atalho "Gerenciar listas" para Configurações › Fontes (aberta
  sem lista ativa, sem topbar).
- Q (`sdd-plan`): o 3º teste do contrato travado da feature 023
  (`ProfilesScreen.shell-navegacao.contract.test.tsx`) exercita "Excluir
  com confirmação" pelos cartões da tela de perfis — tirar as ações de lá
  quebraria essa trava. Como tratar? → A: **Manter as ações também nos
  perfis** (Ressincronizar/Editar/Excluir por cartão, como hoje), além de
  Configurações › Fontes e do atalho "Gerenciar listas". Nenhuma trava de
  outra feature é tocada.
- Q: Limpar histórico / remover item do `↺ Histórico` (adiado pela 025
  para esta onda)? → A: Fica fora; volta ao backlog como item próprio.
