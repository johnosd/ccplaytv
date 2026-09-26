# ADR-011: Adoção do Design System V14 Spectrum e Shell de Navegação

## Status

**Aceita.** Atualiza a ADR-007: a referência visual passa a ser o DS V14,
enquanto a paleta e a receita de foco da ADR-007 seguem válidas. Também
fecha as 5 decisões em aberto da seção 7 de
`.planning/migracao-design-system-v14.md`.

"Aceita" vale para a direção de produto. Nenhuma tela foi migrada ainda.
A execução segue as ondas do roteiro (features 021+), e cada uma pode
refinar detalhes de layout em `plan.md` sem relitigar o que está aqui.

## Data

2026-09-26

## Contexto

O projeto adotou um design system novo, o **CCPlayTV V14 "Spectrum"**, em
`docs/design/design-system/`:

- uma Spec normativa;
- um Component Lab;
- um protótipo de telas.

O protótipo antigo de 9 telas foi para `docs/design/old/`.

O V14 mantém a identidade visual já implementada (paleta, gradiente de
marca, Poppins/Inter, foco laranja com glow e `scale(1.06)`). O que ele
muda é a **estrutura do produto**, em quatro pontos que nenhuma ADR cobre:

1. **Shell com navegação superior.** Hoje a navegação é hierárquica: Home de
   fontes → hub da fonte (3 tiles) → Live/Filmes/Séries, com voltar em
   pilha. O V14 tem uma topbar persistente (Início, TV ao vivo, Filmes,
   Séries, Esportes, Infantil + Busca, Configurações, relógio) e uma Home de
   conteúdo (hero + rails).
2. **Perfis.** O protótipo abre em "Quem está assistindo?", com Favoritos e
   Histórico **por perfil** (Spec §13.3, §48). O modelo de dados não tem
   perfil. `UserStateRecord` é chaveado por `sourceId` + `stableId`.
3. **Fontes em Configurações.** O protótipo tira a gestão de fontes da
   entrada do app e a leva para Configurações › Fontes IPTV & EPG.
4. **Funcionalidades desenhadas mas inexistentes.** Estão no protótipo:
   - EPG ("Agora: …", "A seguir", guia completo);
   - curadoria de IA;
   - dock de serviços (clima, teste de velocidade, TMDB, IA);
   - trailers;
   - elenco e semelhantes;
   - trilhas de áudio/legenda, qualidade, velocidade e aspecto;
   - Esportes e Infantil;
   - parental.

   Para aparecer "cheio", o protótipo usa conteúdo inventado: "98%
   relevante", nota TMDB 8.7, programação fictícia, rails "Mais
   assistidos".

O pedido do usuário (26/09/2026) é migrar **mantendo tudo o que existe
(features 001–020) e mockando o que ainda não existe**. Isso esbarra em
dois princípios da constitution:

- "IA e Classificação Nunca Inventam Dados";
- "Progresso e Capacidades São Reais, Nunca Prometidos".

Dois comportamentos do V14 também conflitam com a constitution e com o
hardware:

- **Preview de trailer ao focar** (~850 ms, §22);
- **preview de canal ao focar** (~520 ms, §42.3).

Pela constitution, "focar um item NÃO DEVE iniciar reprodução nem
disparar consulta a serviço externo". Além disso, o `webapis.avplay` é
singleton, ou seja, só uma sessão de vídeo por vez (feature 016).

## Decisão

### 1. O DS V14 é a referência visual; a precedência fica explícita

A referência de intenção passa a ser o conjunto em
`docs/design/design-system/`. O contrato executável continua sendo os
tokens em `tv-web/src/index.css`. Em conflito, vale esta ordem:

**constitution > ADRs aceitas > Spec V14 > Component Lab > protótipo.**

Consequências imediatas dessa ordem:

- A §36 da Spec ("CSS canônico V13": accent vermelho, foco branco) é
  **obsoleta**. Valem as §5 e §11.
- **Não há preview de mídia disparado por foco.** O painel de preview da
  Live TV mostra só metadados locais (logo, nome, grupo, slot "Agora"). O
  trailer só roda por ação explícita (OK em "Trailer").
- **O provedor de IA não é decidido pelo DS.** A Spec cita DeepSeek, mas
  continua valendo a ADR-008 §4 (OpenAI BYOK) até outra ADR mudar isso.
- **Fontes tipográficas empacotadas localmente** (Spec §2.3), com fallback
  Arial/Helvetica. Sai o Google Fonts via CDN.

### 2. Perfil = lista (fonte)

A tela "Quem está assistindo?" do V14 é mantida, e **cada perfil é uma
lista IPTV cadastrada**. Não existe entidade de perfil separada.

- Os cartões de perfil mostram as fontes do aparelho: nome, tipo
  (Xtream/M3U), estado e selo de Modo limitado quando houver.
- Mais um cartão **"Adicionar lista"** no lugar de "Novo perfil". Ele leva
  ao onboarding de fonte (M3U/Xtream), que é o `AddSourceScreen` atual no
  visual V14.
- **Sem nenhuma lista**, a tela mostra só "Adicionar lista" como caminho
  principal, com foco inicial nele. Mantém o estado vazio focável e com
  CTA (constitution, "Foco Visível e Sem Becos Sem Saída").
- **A tela aparece a cada abertura do app, depois do Splash**, com foco
  inicial na última lista usada. Isso segue o protótipo e evita trocar de
  lista sem a pessoa perceber.
- A **Home de fontes atual** (`HomeScreen`) **vira esta tela**, em vez de
  ser removida. As ações de gestão (editar, ressincronizar, remover) vão
  para Configurações › Fontes IPTV (decisão 4) e deixam de ser o centro
  da entrada.

Isso torna os "Favoritos e Histórico por perfil" do V14 (§13.3, §48)
**verdadeiros sem migração de dados**: `UserStateRecord` já é chaveado por
`sourceId`. Favoritos, retomada e histórico de uma lista nunca aparecem
em outra.

### 3. Fonte ativa única; shell com topbar

- Escolher um perfil (lista) define a **fonte ativa** da sessão. Home, TV
  ao vivo, Filmes, Séries e Busca leem só dela.
- A última fonte usada é gravada localmente e define o foco inicial da
  tela de perfis.
- **Não há agregação entre fontes.** Isso continua sendo o item 23 do
  backlog.
- Topbar do V14 **com Início, TV ao vivo, Filmes, Séries**, mais Busca,
  Configurações e relógio à direita.
- A topbar inclui o **indicador do perfil ativo**, ou seja, o nome da
  lista (Spec §31 "perfil ativo claramente indicado"). Com OK, ele volta à
  tela de perfis para trocar de lista.
- **Esportes e Infantil ficam fora da topbar** até o item 53 do backlog
  ser avaliado. Destino sem fonte de dado definida não vira promessa
  visível.
- **RETURN em camadas:**
  - modal aberto → fecha o modal;
  - detalhe/player → volta ao contexto de origem;
  - destino de topo (Live/Filmes/Séries/Busca/Configurações) → Início;
  - Início → modal "Sair do CCPlayTV?" (Spec §11.6).
- A navegação continua no `useRemoteNav` (ADR-009). Topbar e conteúdo são
  escopos compostos, sem biblioteca de foco e sem portar o `navigate()`
  geométrico do protótipo.

### 4. Gestão de fontes em Configurações

Configurações › **Fontes IPTV** é onde a lista se gerencia:

- adicionar, editar, ressincronizar e remover;
- explicação do Modo limitado, hoje em `LimitedModeNotice` (feature 014);
- ação de tornar uma lista ativa.

O hub da fonte (`ListHomeScreen`, com os 3 tiles e "Continuar
assistindo") é **substituído** pela Home V14. "Continuar assistindo" vira
rail da Home e os tiles viram destinos da topbar.

### 5. Política de mock: soft disabled "Em breve", nunca conteúdo fictício

Funcionalidade que o V14 desenha e o app ainda não tem aparece como **soft
disabled** (Spec §11.4):

- **Aparência e foco:** o controle é focável, com aparência reduzida em
  repouso.
- **Ação:** OK abre um toast ou modal curto "**Em breve** — <o que vai
  fazer>".
- **Rail ou seção sem dado:** vira **um** card "Em breve", nunca pôsteres
  fictícios.
- **Tela de destino inteira:** cabeçalho real + `EmptyState` "Em breve"
  com CTA focável de volta.

Nenhum mock exibe dado que não venha do catálogo real ou do estado do
usuário: nota, percentual de relevância, sinopse, programação,
contagem, título, "mais vistos".

Todo mock é registrado num **único módulo** (proposto:
`tv-web/src/lib/comingSoon.ts`), com id e o item do backlog que o
substitui. Remover um mock é trocar uma entrada.

Fixtures visuais para revisão de design só podem existir atrás de
`import.meta.env.DEV` e nunca entram no build Tizen.

### 6. Número do canal = posição na ordem da fonte

A lista de canais da Live TV mostra um número de 3 dígitos (`001`, `002`…)
igual à posição do canal na ordem declarada pela fonte, dentro de "Todos".
Ele é o mesmo em qualquer categoria em que o canal apareça. O número é
exibição, não identidade: favoritos e retomada continuam pela chave
estável (constitution, "Identidade de Reprodução Não Depende da URL").

Quando o item 25 do backlog trouxer `tvg-chno` ou equivalente, o número
declarado pela fonte substitui a posição.

## Alternativas Consideradas

### Perfis como entidade própria, independente das listas

- É o que o protótipo sugere: "Sala", "Família", "Kids", cada um com
  favoritos e histórico próprios, usando qualquer lista.
- **Rejeitada:** exige migração Dexie de `UserStateRecord` (nova
  dimensão de chave), reconciliação do estado já gravado para um perfil
  padrão, UI de criação e edição, e decisão sobre PIN/parental. É uma
  feature inteira (item 52) sem demanda registrada. O usuário decidiu
  que o perfil **é** a lista, o que já corresponde ao isolamento de
  estado existente.

### Pular a tela de perfis e abrir direto na Home

- Economiza um OK a cada abertura.
- **Rejeitada:** a tela é o lugar natural para escolher e adicionar lista,
  e uma lista que muda sem a pessoa ver é confusa. Com perfil = lista, a
  tela tem função real, não é decorativa.

### Agregar todas as fontes na Home e nas categorias

- Uma visão única do conteúdo de todas as listas.
- **Rejeitada agora:** exige tratar categorias homônimas entre fontes,
  deduplicação, origem visível em cada item e refresh isolado. É o item
  23 inteiro, antes da migração. Com fonte ativa, nenhuma consulta de
  catálogo muda.

### Esportes e Infantil como "Em breve" na topbar

- Seguiria o protótipo à risca e sinalizaria o roadmap.
- **Rejeitada:** não há critério de dado definido. Montar essas seções sem
  substituir as categorias da fonte ("Categorias da Fonte São
  Preservadas") ainda precisa de `sdd-assess`, e um destino de topo que só
  diz "em breve" pesa mais que um botão soft disabled dentro de uma tela.

### Mocks com dados de exemplo (fixtures) visíveis em produção

- Deixaria as telas "cheias" como no protótipo.
- **Rejeitada:** apresentaria nota, relevância e programação inventadas
  como se fossem fato, violando dois princípios da constitution. Fica
  permitido só em build de desenvolvimento.

### Esconder o número do canal até existir `tvg-chno`

- Evita número que muda se o provedor reordenar a lista.
- **Rejeitada:** a posição é estável enquanto a fonte não muda, ajuda a
  orientação na lista longa (layout do protótipo) e não é usada como
  identidade. A troca pelo número declarado é direta quando existir.

### Adotar o preview de mídia ao focar, como a Spec pede

- Experiência mais "streaming".
- **Rejeitada:** viola "focar não inicia reprodução nem consulta
  externa", e o AVPlay singleton faria um preview de canal derrubar a
  sessão que estiver aberta.

## Consequências

### Positivas

- A migração tem regras fechadas: nenhuma onda precisa redecidir entrada,
  navegação, perfis ou mock.
- "Por perfil" (favoritos, histórico, retomada) fica correto **sem
  migração de dados**, porque o isolamento por `sourceId` já existe desde a
  feature 008.
- A Home de fontes atual é reaproveitada como tela de perfis, em vez de ser
  jogada fora, o que reduz a regressão da Onda 2.
- Mocks rastreáveis num lugar só. Cada item do backlog que entrega remove
  um mock identificável.
- Conflitos entre DS e constitution resolvidos por regra de precedência,
  não caso a caso.

### Negativas

- **Um OK extra a cada abertura** (tela de perfis), mesmo com uma lista
  só. Trade-off aceito pela clareza de "qual lista estou vendo".
- O vocabulário muda: "perfil" no V14 significa "lista" aqui. A tela e o
  copy precisam deixar isso evidente (por exemplo, subtítulo "Escolha uma
  lista"). Se um dia existirem perfis de pessoas (item 52), será preciso
  renomear ou aninhar os conceitos.
- Sem agregação, quem tem duas listas troca de perfil para ver a outra.
- A topbar fica mais curta que a do protótipo (4 destinos). O layout do
  V14 precisa absorver isso sem buracos.
- A Spec V14 e o protótipo divergem do app em pontos conhecidos (§36,
  preview em foco, DeepSeek, Esportes/Infantil, perfis). Quem consultar o
  DS precisa ler esta ADR junto. A precedência está no CLAUDE.md.

### Caminho de Migração / Evolução Futura

Revisitar:

- **Perfis independentes das listas:** se houver demanda (item 52). Seria
  preciso adicionar a dimensão de perfil em `UserStateRecord` com
  migração Dexie e manter "lista" como escolha dentro do perfil.
- **Agregação entre fontes:** quando o item 23 existir. A fonte ativa
  vira filtro opcional.
- **Esportes e Infantil:** voltam à topbar quando o item 53 definir o
  critério de dado.
- **Número do canal:** passa a ser o declarado pela fonte quando o item 25
  entregar `tvg-chno`.
- **Tela de perfis a cada abertura:** se a medição com usuário mostrar que
  o passo extra incomoda com uma lista só, trocar para "pula quando houver
  exatamente uma lista". A decisão é local à tela de perfis.
