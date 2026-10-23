# Feature Specification: Legendas externas (OpenSubtitles e SubDL)

**Slug**: `090-legendas-externas`

**Created**: 2026-10-22

**Status**: Em Execução

**Input**: `/sdd-specify sdd\assessments\opensubtitles-legendas-externas`. A pessoa encontra filmes e episódios cuja legenda do stream não atende (ausente ou em outro idioma) e quer obter, dentro do player, uma legenda em pt-BR, en ou es, sem configurar chave própria — modo padrão com a chave do ccplayTv guardada no serviço (ADR-021), credencial pessoal opcional quando o fornecedor permitir. Referência de comportamento: a implementação do xstream-player (`app/api/subtitles/route.ts`, `SubtitleSearchPanel.tsx`, `SubtitleContext.tsx`), adaptada às regras deste projeto. **Ampliação (2026-10-22, pedido do usuário durante o `sdd-plan`)**: o SubDL entra como segundo fornecedor, na mesma lista; as chaves de desenvolvimento dos dois já existem no `.env` (`OPEN_SUBTITLES_API_KEY`, `SUBDL_SUBTITLES_API_KEY`); chave padrão dos dois no serviço e chave pessoal (BYOK) dos dois como P3.

> **Avanço sob veredito needs-clarification.** O assessment `opensubtitles-legendas-externas` terminou em `needs-clarification` ([reavaliação](../../assessments/opensubtitles-legendas-externas/reavaliacao-chave-padrao.md)). Em 2026-10-22 o usuário decidiu especificar mesmo assim, transformando as pendências em **gates de entrega** (seção *Delivery Gates*). Esta spec não é um go retroativo do assessment: nenhuma oferta padrão em produção sai antes dos gates G-1 a G-3.

## Escopo

### Incluído

- Opção de buscar legenda externa **dentro do painel "Áudio e legendas"** do player (feature 029), para **filmes e episódios** em reprodução.
- Busca **somente por ação da pessoa**, no idioma do app (pt → pt-BR, en, es), com troca entre os três idiomas na própria lista.
- **Dois fornecedores, uma lista**: cada busca da pessoa consulta OpenSubtitles e SubDL pelo serviço, em paralelo; os resultados aparecem juntos, cada um com o nome do fornecedor; um fornecedor fora do ar ou no limite não esconde os resultados do outro.
- **Lista de resultados** para a pessoa escolher; trocar de versão a qualquer momento; desativar a legenda externa.
- Busca por identificador da obra quando o catálogo o tiver (TMDB do filme; TMDB da série + temporada/episódio); sem identificador, **busca por nome** (com ano/temporada/episódio quando houver), sinalizada como menos precisa.
- **Modo padrão** pelo serviço do ccplayTv, com as chaves compartilhadas (OpenSubtitles e SubDL) só no servidor, para TVs com **licença ou período de teste válido**, com **limite diário por TV**.
- **Memória por título**: a legenda escolhida e o arquivo baixado ficam no aparelho, chaveados pela identidade lógica do item, e são reaplicados ao retomar sem novo download, com o atraso escolhido.
- No próximo episódio, **oferecer** a busca pré-preenchida (mesmo idioma), sem chamar o serviço sozinho.
- Aparência: a mesma da legenda embutida (feature 029). Sincronização própria da externa: −10 s a +10 s em passos de 0,5 s, por ←/→, lembrada por item.
- Compatibilização da constitution com a nova chamada ao serviço (gate G-3).
- **P3**: API key pessoal do OpenSubtitles e/ou do SubDL, cadastrada na TV, usada direto da TV ao fornecedor (BYOK); para cada fornecedor, a chave pessoal escolhida tem precedência sobre o padrão. A oferta na loja exige a evidência de aceitação de cada fornecedor anexada (gate G-4).

### Fora de Escopo

- Chave padrão do TMDB pelo serviço (outra feature, com pendência própria de licença/atribuição — ADR-021 §10).
- Live TV, catch-up, rádio e trailers.
- Download em lote (todos os episódios de uma série), busca/aplicação automática ao abrir um item ou ao avançar episódio, busca ao focar qualquer coisa.
- Pesquisa na tela de detalhe antes do play (entrada única: o painel do player).
- Transcrição de áudio, tradução por IA, cálculo de moviehash a partir do stream, envio de vídeo ou de qualquer dado IPTV ao serviço ou aos fornecedores de legenda.
- Login/conta de usuário do OpenSubtitles ou do SubDL (token pessoal) — mecanismo distinto da API key (ADR-021 §2).
- Outros fornecedores além dos dois; formatos de legenda além de SRT/WebVTT (ex.: `.ass`/`.sub` dentro do ZIP do SubDL são ignorados).
- Novo controle de tamanho/estilo da legenda.
- Correção de deriva (escala de tempo para outra taxa de quadros) — só deslocamento fixo.
- Upload de legenda, edição de legenda, legenda vinda de pendrive/arquivo local.
- Garantir que qualquer resultado sincronize com a versão exata do vídeo.
- Contratação de plano, habilitação de cobrança ou implantação em produção (ADR-021 §12) — decisões fora do código desta feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Buscar e aplicar uma legenda externa no player (Priority: P1)

Assistindo a um filme ou episódio, a pessoa abre "Áudio e legendas", escolhe "Buscar legenda online", vê os resultados no idioma do app (pode trocar para outro dos três), escolhe um e a legenda passa a aparecer. Se não sincronizar, ajusta o atraso ou escolhe outra versão; pode desativar e voltar à legenda do stream.

**Why this priority**: é a dor relatada — sem isso não há feature. Entrega valor mesmo sem memória entre sessões.

**Independent Test**: com um filme e um episódio de fixture, abrir o painel, buscar, escolher um resultado e ver as falas no tempo da mídia; pausar, avançar/retroceder e conferir que a legenda acompanha; desativar e reativar; aplicar uma segunda legenda em outro idioma e alternar entre as duas.

**Acceptance Scenarios**:

1. **Given** um filme em reprodução com TV licenciada, **When** a pessoa aciona "Buscar legenda online", **Then** aparece um estado de carregamento focável e, em seguida, a lista de resultados no idioma do app, cada um com fornecedor, idioma, nome da versão/arquivo, contagem de downloads (quando o fornecedor informa) e indicação de legenda para deficiência auditiva quando houver.
2. **Given** a lista aberta, **When** a pessoa troca o idioma para en/es, **Then** uma nova busca daquele idioma é feita (por ação dela) e o foco vai para o primeiro resultado ou para o estado vazio.
3. **Given** um resultado focado, **When** a pessoa pressiona OK, **Then** a legenda é obtida, aplicada, o painel indica "Externa — <idioma>" como legenda ativa e a reprodução não é interrompida.
4. **Given** uma legenda externa ativa, **When** a pessoa pausa, avança, retrocede ou retoma, **Then** as falas exibidas correspondem ao tempo da mídia (sem resto de fala anterior ao pular).
5. **Given** uma legenda externa ativa, **When** a pessoa escolhe "Desativada" ou uma trilha embutida, **Then** a externa deixa de aparecer e a escolhida passa a valer.
6. **Given** um episódio sem ID TMDB no catálogo, **When** a pessoa busca, **Then** a busca usa nome da série + temporada/episódio e a lista mostra o aviso "Busca por nome — confira a sincronia".
7. **Given** uma legenda externa ativa e fora de tempo, **When** a pessoa foca "Sincronização" e pressiona ← ou →, **Then** o valor muda 0,5 s por tecla entre −10 s e +10 s, aparece na linha ("−2,5 s", "Sem atraso", "+1,0 s") e a fala exibida passa a valer o novo tempo na hora, sem pausar nem reiniciar o vídeo.
8. **Given** uma legenda externa desativada (por "Desativadas" ou por uma trilha embutida) neste filme, **When** a pessoa escolhe de novo "Externa — <idioma>" no painel, **Then** a legenda volta na hora, do arquivo já guardado, com o ajuste que tinha, **sem nenhuma chamada de rede**.
9. **Given** um filme em inglês com legenda externa em português ativa, **When** a pessoa busca de novo, troca o idioma para "Inglês" e escolhe um resultado, **Then** a legenda em inglês passa a valer, o painel mostra as duas opções ("Externa — Português (Brasil)" e "Externa — Inglês", só uma marcada) e voltar para o português é uma escolha no painel, **sem novo download**.

---

### User Story 2 - Lembrar a legenda por título e oferecê-la no próximo episódio (Priority: P2)

Ao reabrir/retomar o mesmo filme ou episódio, a legenda externa escolhida volta sozinha, do arquivo já guardado, com o mesmo atraso — sem consumir cota. Ao passar para o próximo episódio, o painel oferece "Buscar legenda (<idioma>)" já pronto, mas nada é buscado sem a pessoa pedir.

**Why this priority**: evita repetir a busca a cada sessão e poupa cota; depende da P1 mas é testável sozinha com um arquivo já guardado.

**Independent Test**: com uma legenda guardada para um item, fechar e reabrir o player e ver a legenda reaplicada sem nenhuma chamada de rede; avançar episódio e ver o atalho, sem chamada até o OK.

**Acceptance Scenarios**:

1. **Given** um filme com legenda externa escolhida antes, **When** a pessoa retoma o filme, **Then** a mesma legenda e o mesmo atraso são reaplicados a partir do arquivo local, sem chamada ao serviço.
2. **Given** a mesma obra presente em duas listas (fontes diferentes), **When** a pessoa a abre pela outra lista, **Then** a memória não é reaproveitada entre fontes (identidade inclui a fonte).
3. **Given** o episódio N com legenda externa em pt-BR, **When** começa o episódio N+1 (próximo episódio ou autoplay), **Then** nenhuma busca é feita automaticamente e o painel mostra "Buscar legenda (pt-BR)" como atalho.
4. **Given** espaço do aparelho apertado, **When** o orçamento de armazenamento precisa recolher, **Then** arquivos de legenda mais antigos podem ser descartados (e a memória do item volta a "sem legenda externa"), nunca favoritos, histórico, progresso ou preferências.

---

### User Story 3 - Usar a própria chave do OpenSubtitles ou do SubDL (Priority: P3)

Quem tiver uma API key pessoal do OpenSubtitles e/ou do SubDL pode cadastrá-la na TV e usá-la no lugar da chave padrão daquele fornecedor, direto da TV, sem passar pelo serviço do ccplayTv. O outro fornecedor continua pelo modo padrão.

**Why this priority**: alternativa à cota padrão esgotada ou ao serviço do ccplayTv indisponível, e uso por quem não tem licença do serviço. A implementação não depende do gate G-4; **anunciar/oferecer na loja** depende da evidência de aceitação de cada fornecedor anexada (G-4). O usuário informou em 2026-10-22 que o OpenSubtitles aceita; a orientação pública do fórum (setembro/2026) dizia o contrário — a evidência precisa ser anexada.

**Independent Test**: com uma chave pessoal válida de um fornecedor cadastrada, buscar e baixar uma legenda daquele fornecedor com o serviço do ccplayTv desligado.

**Acceptance Scenarios**:

1. **Given** uma chave pessoal válida do SubDL cadastrada e escolhida, **When** a pessoa busca, **Then** a busca e o download do SubDL vão direto ao SubDL com a chave dela; o OpenSubtitles continua pelo serviço (ou também direto, se houver chave pessoal dele).
2. **Given** a pessoa digita uma chave pessoal, **When** confirma, **Then** a TV testa a chave no próprio fornecedor antes de guardar; recusada, nada é trocado e o motivo aparece.
3. **Given** a chave pessoal falhando (inválida, cota dela esgotada), **When** a busca falha naquele fornecedor, **Then** a lista mostra o motivo para aquele fornecedor e oferece a ação explícita "Usar o padrão do ccplayTv" — nunca troca sozinho (ADR-021 §4).
4. **Given** uma chave pessoal cadastrada, **When** a pessoa a remove, **Then** o fornecedor volta ao modo padrão e a chave sai do aparelho.

---

### Edge Cases

- **Sem rede / serviço fora do ar**: o painel mostra erro com ação "Tentar de novo" focável; a reprodução continua; legendas já guardadas continuam funcionando.
- **TV sem licença/teste válido** (ou nunca pareada com o serviço): a opção aparece soft-disabled com a explicação e o caminho para Portal & licença.
- **Limite diário da TV atingido**: mensagem com quando volta; as buscas podem continuar ou não conforme o limite anti-abuso, mas o download fica bloqueado até o reset.
- **Cota global do fornecedor esgotada**: mensagem distinta do limite da TV ("serviço de legendas no limite hoje"), sem culpar a pessoa. **Só um dos dois fornecedores** fora do ar/no limite: a lista mostra os resultados do outro e um aviso curto sobre o que faltou; os dois fora → estado de erro.
- **Pacote de temporada (SubDL)**: um resultado de temporada inteira aparece marcado; no download, o arquivo do episódio é extraído; se não for possível achar o episódio no pacote → "Esta versão não pôde ser lida — escolha outra".
- **Mesma versão nos dois fornecedores**: aparecem as duas, cada uma com seu fornecedor (sem deduplicar por nome).
- **Nenhum resultado** no idioma: estado vazio focável, com atalho para os outros dois idiomas.
- **Arquivo inválido/vazio/codificação estranha**: erro "Esta versão não pôde ser lida — escolha outra", sem quebrar o player; acentos de pt-BR/es exibidos corretamente.
- **Legenda dessincronizada**: o ajuste de −10 s a +10 s (passos de 0,5 s) corrige diferenças de edição/corte; nos limites, ←/→ não passa de ±10 s; trocar de versão é sempre possível. Diferença que cresce ao longo do filme (taxa de quadros diferente) não é corrigida por deslocamento — trocar de versão.
- **Item muda durante a busca** (zapping de episódio, fechar o player): resultado tardio é descartado, nunca aplicado ao item errado.
- **Trilha embutida + externa**: só uma legenda visível por vez.
- **Texto com marcação** (tags, HTML): exibido como texto, nunca interpretado.
- **Título da obra com caracteres especiais** ou nome do provedor com prefixos ("PT | ", "[4K]"): a busca por nome usa o nome limpo; nome do provedor nunca é traduzido.
- **Retomada com arquivo descartado pelo orçamento**: player abre sem legenda externa, sem erro, e o painel oferece a busca de novo.

## Requirements *(mandatory)*

### Functional Requirements

**Entrada e disparos**

- **FR-001**: O painel "Áudio e legendas" do player DEVE oferecer "Buscar legenda online" em filmes e episódios, e NÃO DEVE oferecê-lo em Live TV, catch-up, rádio ou trailer.
- **FR-002**: Toda chamada ao serviço de legendas DEVE resultar de uma ação explícita da pessoa (abrir a busca, trocar idioma, escolher um resultado, "Tentar de novo"). Focar, abrir o player, retomar, avançar episódio ou autoplay NÃO DEVEM gerar chamada.
- **FR-003**: No episódio seguinte a um com legenda externa ativa, o painel DEVE exibir o atalho "Buscar legenda (<idioma>)" sem fazer a busca.

**Busca e escolha**

- **FR-004**: A busca DEVE começar no idioma do app (pt → pt-BR, en, es) e permitir trocar entre esses três; outros idiomas ficam fora.
- **FR-005**: Com ID TMDB do filme no catálogo (correspondência TMDB ou ID declarado pelo painel), a busca DEVE usá-lo; para episódio, ID TMDB da série + temporada + episódio. Sem ID, DEVE buscar pelo nome limpo (+ ano no filme, + temporada/episódio na série) e sinalizar "Busca por nome — confira a sincronia".
- **FR-006**: A lista DEVE mostrar, por resultado: **fornecedor** (OpenSubtitles/SubDL), idioma, nome da versão/arquivo, número de downloads **quando o fornecedor informa**, selo de deficiência auditiva quando declarado e marca de "temporada inteira" quando for pacote; DEVE ser navegável pelo controle remoto com foco sempre em algum elemento (carregando, vazio, erro incluídos).
- **FR-007**: Escolher um resultado DEVE obter o arquivo, aplicá-lo à reprodução atual sem interrompê-la e marcá-lo como legenda ativa no painel.
- **FR-008**: A legenda externa DEVE seguir o tempo da mídia em pausa, seek e retomada e usar a mesma aparência da legenda embutida. Com a externa ativa, a sincronização DEVE oferecer um único ajuste de **−10 s a +10 s em passos de 0,5 s** (negativo = adiantar a fala, positivo = atrasar), alterado por ←/→, com o valor atual visível e efeito imediato na fala exibida; o ajuste vale por item e é lembrado com a legenda (FR-019). A legenda embutida mantém as opções da feature 029, sem mudança.
- **FR-009**: Só uma legenda (embutida ou externa) DEVE estar visível por vez; "Desativada" e trilhas embutidas DEVEM continuar selecionáveis. Cada idioma de legenda externa já obtido para o item DEVE aparecer como opção própria no grupo Legendas ("Externa — <idioma>"); escolher uma delas a (re)ativa a partir do arquivo guardado, sem chamada de rede, e desativa as demais.
- **FR-010**: Resultado de busca ou arquivo que chegue depois de o item ter mudado ou de o player ter fechado DEVE ser descartado.
- **FR-011**: O texto da legenda DEVE ser exibido como texto puro (marcação não é interpretada) e com a codificação correta de pt-BR/en/es.

**Modo padrão (serviço)**

- **FR-012**: No modo padrão, a TV DEVE falar só com o serviço do ccplayTv; as chaves compartilhadas do OpenSubtitles e do SubDL DEVEM ficar exclusivamente no servidor, nunca em pacote, variável pública, resposta, log ou erro. A URL de download que o SubDL devolve **embute a chave** (`?api_key=`): NUNCA pode ser repassada à TV nem registrada.
- **FR-013**: O serviço DEVE aceitar a operação apenas de TVs identificadas com licença ou período de teste válido; as demais recebem recusa explícita que a TV mostra como opção soft-disabled com explicação.
- **FR-014**: O serviço DEVE impor um limite diário de downloads por TV e um limite anti-abuso de buscas; ao atingir, a TV DEVE informar quando o uso volta. Os valores ficam a cargo do plano, em função da cota contratada.
- **FR-015**: A TV DEVE distinguir para a pessoa: sem rede/serviço indisponível, sem licença, limite da TV, limite do fornecedor, nenhum resultado e arquivo ilegível — cada um com uma ação focável.
- **FR-016**: O serviço DEVE expor apenas as operações "buscar legendas" e "obter arquivo de legenda", com destinos fixos nos dois fornecedores (OpenSubtitles: `api.opensubtitles.com` e o host do link; SubDL: `api.subdl.com` e `dl.subdl.com`) — nunca proxy de URL arbitrária (ADR-021 §5). O resultado volta à TV com um identificador opaco (`os:…`/`sd:…`), nunca uma URL.
- **FR-017**: A TV DEVE enviar só: identidade/autenticação da TV, IDs TMDB/temporada/episódio ou nome limpo + ano, idioma e o identificador do resultado escolhido. Host, usuário, senha, URL de reprodução, nome da lista e vídeo IPTV NUNCA DEVEM ser enviados, e o serviço NÃO DEVE registrar em log o termo pesquisado junto à identidade da TV.
- **FR-018**: Falha do serviço ou do fornecedor NÃO DEVE afetar reprodução, navegação, importação nem legendas já guardadas.

**Memória e armazenamento**

- **FR-019**: A escolha (versão, atraso) e o arquivo DEVEM ser guardados no aparelho por identidade lógica do item (fonte + tipo + ID estável + temporada/episódio) **e idioma** — no máximo uma legenda por idioma por item (até três) —, nunca pela URL do stream; uma nova versão no mesmo idioma substitui a anterior. A que estava ativa é reaplicada ao retomar, sem chamada ao serviço.
- **FR-020**: Os arquivos de legenda DEVEM entrar no orçamento de armazenamento do aparelho com limite próprio; ao recolher, só legendas podem ser descartadas por esta feature, nunca dados de uso.
- **FR-021**: Remover uma lista DEVE apagar as legendas guardadas dos itens dela. Legendas guardadas NÃO entram no backup de uso (ADR-017) nem em exportação.

**Normativo e credencial pessoal**

- **FR-022**: Antes de qualquer código que chame o serviço, a constitution DEVE ser emendada para listar a operação de legendas como chamada permitida ao serviço por ação da pessoa (gate G-3, ADR-021 §8).
- **FR-023** *(P3)*: A pessoa PODE cadastrar na TV uma API key pessoal do OpenSubtitles e/ou do SubDL, testada no próprio fornecedor antes de guardar; com ela escolhida, busca e download **daquele** fornecedor vão direto da TV ao fornecedor; a chave segue as regras de BYOK da constitution (só no IndexedDB, enviada só ao seu fornecedor, nunca em log/UI/backup/portal/terceiros) e falhas dela oferecem "Usar o padrão do ccplayTv" como ação explícita, sem troca silenciosa. Oferecer na loja exige o G-4.
- **FR-024**: Todo texto novo de UI DEVE passar pelo catálogo i18n em pt/en/es; títulos e nomes do provedor nunca são traduzidos.
- **FR-026**: Uma busca DEVE consultar os dois fornecedores em paralelo (no modo padrão, pelo serviço), juntar os resultados numa lista só — OpenSubtitles por downloads decrescente, depois SubDL na ordem do fornecedor; na busca de episódio, episódio exato antes de pacote de temporada — e informar quais fornecedores não responderam, sem esconder os resultados dos outros. O limite diário de downloads da TV vale para os dois somados.
- **FR-027**: Quando o arquivo vier compactado (ZIP do SubDL), o serviço (ou a TV, no BYOK) DEVE extrair com limites de segurança (tamanho descompactado, número de entradas, nomes de caminho ignorados), aceitar só SRT/WebVTT e, em pacote de temporada, escolher o arquivo do episódio pelo padrão de temporada/episódio no nome; sem um arquivo inequívoco → `unreadable`.

**Desempenho**

- **FR-025**: A feature NÃO DEVE deixar nenhuma parte do app mais lenta: nenhum trabalho fora do player; dentro dele, nada na montagem, até o primeiro quadro tocando, na navegação do chrome ou por quadro/tique de progresso; leitura local adiada para depois de a reprodução começar; rede só por ação da pessoa.

### Key Entities

- **Pedido de busca de legenda**: item (identidade lógica), referência da obra (ID TMDB do filme ou da série + temporada/episódio, ou nome limpo + ano), idioma.
- **Resultado de legenda**: identificador opaco (`os:`/`sd:` + id do fornecedor), fornecedor, idioma, nome da versão/arquivo, downloads (quando informado), deficiência auditiva, se é pacote de temporada.
- **Legenda guardada**: identidade lógica do item + idioma (uma por idioma, até três por item), identificador do resultado, conteúdo do arquivo, atraso escolhido, se é a ativa do item, quando foi obtida, tamanho (para o orçamento).
- **Uso diário da TV** *(serviço)*: identidade da TV, dia, downloads e buscas feitos — sem termo pesquisado.
- **Credencial pessoal de legenda** *(P3)*: fornecedor (OpenSubtitles ou SubDL), chave da pessoa, estado de validação, se está escolhida — uma por fornecedor.

## Delivery Gates

| Gate | O que exige | Bloqueia |
| --- | --- | --- |
| **G-1** | Cota, custo e condições de uso das chaves de aplicativo do **OpenSubtitles e do SubDL** para o ccplayTv distribuído confirmados (plano/consumer), e valores de FR-014 fixados a partir deles. Atenção: o plano gratuito do SubDL dá ~50 downloads/dia **por chave** (não verificado na doc oficial) — insuficiente como padrão compartilhado | Oferta do modo padrão em produção. Não bloqueia desenvolvimento nem testes com as chaves de desenvolvimento |
| **G-2** | Prova física na TV de referência: legenda externa aparece, acompanha pausa/seek/retomada, acentos corretos, e a medição de desempenho do SC-009 fica dentro do ruído | Declarar a feature entregue |
| **G-3** | Emenda da constitution (FR-022) | Qualquer código que chame o serviço |
| **G-4** | Evidência de aceitação de API key pessoal em app distribuído anexada para **cada** fornecedor (OpenSubtitles: o usuário informou aceitação em 2026-10-22, contra a orientação pública do fórum — anexar a resposta; SubDL: modelo de chave por conta, a confirmar nos termos) | Anunciar/oferecer o BYOK daquele fornecedor na loja. Não bloqueia implementação |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Num roteiro com 10 títulos de teste (filmes e episódios, com e sem ID), a pessoa chega de "Áudio e legendas" a uma legenda externa visível em no máximo 4 ações de OK a partir do painel, em todos os casos com resultado disponível.
- **SC-002**: Zero chamadas ao serviço de legendas em uma sessão que só navega, foca, abre o player, retoma, avança episódio e usa autoplay sem acionar a busca (verificado por contagem de requisições).
- **SC-003**: Retomar um item com legenda guardada a reaplica em até 2 s após o início da reprodução, com zero chamadas de rede.
- **SC-004**: Após seek de ±30 s, a fala exibida corresponde ao novo tempo da mídia na primeira atualização, sem fala residual, em 100% das tentativas do roteiro.
- **SC-005**: Zero ocorrências da chave compartilhada no pacote, no JavaScript, em variáveis públicas, em respostas do serviço e em logs; zero dados IPTV (host, usuário, senha, URL de reprodução) nas requisições de legenda — verificado por varredura do pacote e inspeção das requisições.
- **SC-006**: Com o serviço desligado ou sem rede, 100% dos fluxos de reprodução do roteiro continuam funcionando e o painel mostra o erro com uma ação focável.
- **SC-007**: Cada um dos seis estados de falha de FR-015 tem mensagem própria, nos três idiomas, aprovada na auditoria de legibilidade (`legibilidade-tv`).
- **SC-008**: Gate G-2 aprovado na TV de referência.
- **SC-010**: Uma legenda deslocada em até 10 s em relação ao vídeo fica sincronizada (fala começando a menos de 0,5 s da voz) em no máximo 20 toques de ←/→ a partir do painel, sem nenhuma chamada de rede.
- **SC-009**: Na TV de referência, tempo de thread presa, pior quadro e fps (a) da navegação medida pela sonda e (b) de uma reprodução com e sem legenda externa ativa ficam dentro do ruído entre rodadas medido antes da feature; o tempo até começar a tocar não aumenta.

## Assumptions

- A identidade/licença de TV já existente no serviço do portal (ADR-013/015/016) basta para autenticar a operação; reutilizar a mesma implantação é permitido se o plano delimitar rotas, permissões e recursos (ADR-021 §7).
- O ID TMDB do item vem do que o catálogo já tem (ID declarado pelo painel ou correspondência TMDB feita com a chave da pessoa); esta feature não cria correspondência TMDB nova.
- A cota de desenvolvimento observada (remaining=99 no OpenSubtitles) serve só para testes; nenhum valor de produção é inferido dela. SubDL provado no PC em 2026-10-22 ([evidência](./evidencias/subdl-prova-pc.json)): busca por `tmdb_id` (filme e série + temporada/episódio) com `languages=BR_PT|EN|ES` → 200; pré-checagem com `Origin: null` → 204 e `Access-Control-Allow-Origin: *`; download em `dl.subdl.com` → ZIP; a resposta não trouxe cabeçalhos de limite nem contagem de downloads; a busca de episódio trouxe pacotes de temporada (`episode: null`). Documentação oficial do SubDL não legível por ferramenta (403) — limites por plano vêm de fontes secundárias.
- O caminho técnico de exibição (arquivo local entregue ao AVPlay ou agenda de cues no app) e se o arquivo vem direto do host do fornecedor ou pela operação restrita ficam para o `sdd-plan`, após validar CORS/redirects na TV (ADR-021 §6).
- A referência do xstream-player orienta comportamento (busca por TMDB/parent TMDB + temporada/episódio, fallback por nome, link novo a cada download, tratamento de cota 406/407 e 429), não código: seu download em lote, busca automática por episódio, log da URL de busca e chave configurada pela pessoa no servidor não são adotados.
- O volume de pessoas afetadas não foi medido; a prioridade vem da dor relatada pelo usuário.

## Clarifications

### Sessão 2026-10-22

- Q: A avaliação está em needs-clarification; como a spec trata isso? → A: Especificar com gates — cotas/custo, aceitação do BYOK, prova na TV e emenda da constitution viram gates explícitos de entrega (seção *Delivery Gates*).
- Q: A ADR-021 cobre TMDB e OpenSubtitles; o que entra? → A: Só legendas; chave padrão do TMDB fica para outra feature.
- Q: BYOK do OpenSubtitles entra? → A: Como P3 condicionada ao gate G-4.
- Q: Onde a pessoa pede a legenda? → A: No painel "Áudio e legendas" do player (feature 029).
- Q: Como a pessoa chega à legenda depois da busca? → A: Lista de resultados para escolher; pode trocar de versão.
- Q: Qual idioma a busca usa? → A: O do app, com troca entre pt-BR/en/es na lista.
- Q: Título sem ID TMDB/IMDb? → A: Busca por nome (+ ano/temporada/episódio), sinalizada como menos precisa.
- Q: A legenda escolhida é lembrada? → A: Por título, com arquivo em cache, reaplicada ao retomar pela identidade lógica.
- Q: Quem usa o modo padrão? → A: TVs com licença ou período de teste válido.
- Q: Limite por TV? → A: Sim, diário por TV (valores no plano conforme a cota), mais limite anti-abuso de buscas.
- Q: Próximo episódio com legenda externa ativa? → A: Oferecer o atalho de busca, sem buscar sozinho.
- Q: Além de filmes e episódios? → A: Só filmes e episódios.
- Q: Download em lote de série (existe no xstream-player)? → A: Fora de escopo.
- Q: Ajuste de tamanho (existe no xstream-player)? → A: Reusar aparência e atraso da feature 029; nenhum controle novo.
- Q: (depois do `sdd-plan`) Incluir o SubDL (https://subdl.com/api-doc) no mesmo plano? Chaves dos dois já no `.env`, BYOK com padrão. → A: Sim. Padrão dos dois **no serviço** (ADR-021, nunca no pacote); os dois fornecedores numa **lista única**, com o nome do fornecedor em cada resultado; **BYOK dos dois como P3** — o usuário informou que o OpenSubtitles aceita; prova mínima do SubDL no PC autorizada e feita (FR-026, FR-027, US3, G-1, G-4).
- Q: (depois da Fase 5, prova T053) O BYOK do OpenSubtitles funciona direto da TV? → A: Sim. No Chromium do PC (`file://`) o preflight é recusado, mas a prova na **TV física** passou (busca, `POST /download` com `X-User-Agent` e arquivo): o BYOK direto vale para **os dois fornecedores**. Evidência em `evidencias/cors-direto-tv-2026-10-23.md` (R-022); o ensaio do PC está em `evidencias/cors-direto-pc.json` só como registro.
- Q: (depois do `sdd-plan`) Casos de uso pedidos: filme em inglês → escolher o idioma da legenda e assistir; alternar entre português e inglês; ativar e desativar. → A: Cobertos por US1/AC1–AC3, AC5, **AC8 (reativar sem rede)** e **AC9 (alternar idiomas sem novo download)**; a memória passou a guardar uma legenda por idioma por item (FR-009, FR-019). **Condição do usuário**: alternar sem novo download só fica se o custo de guardar for pequeno; se a medição passar dos limites do plano (R-011, `logic §5.7`), volta-se a uma legenda por item e o AC9 passa a aceitar um novo download.
- Q: (depois do `sdd-plan`) O ajuste de ±1 s herdado da 029 basta para legenda baixada? → A: Não — só para a legenda externa, ajuste de −10 s a +10 s em passos de 0,5 s, por ←/→, lembrado por item (FR-008). A embutida mantém as opções da 029. O xstream-player não tem ajuste de tempo (só tamanho de fonte), então não há referência a copiar.
- Q: (pedido do usuário durante o `sdd-plan`) A feature pode afetar o desempenho? → A: Não — garantir que nenhuma parte do app fique mais lenta (FR-025, SC-009; `logic/legenda-externa.md` §9; medido no gate G-2).
