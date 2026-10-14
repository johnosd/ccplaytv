# CCPlay TV

Reprodutor e organizador de listas M3U, M3U8 para Smart TVs Samsung com Tizen, com foco em navegação por controle remoto, organização do catálogo e fluidez, que permite usuarios importarem URL remotas e adicionalmente suporta EPG em XMLTV.

## Estado do projeto

Projeto em desenvolvimento ativo. Conforme a arquitetura atualizada (ADR-008), o app roda 100% no cliente (TV) usando React, TypeScript e IndexedDB, abolindo a necessidade de um backend dedicado sempre ligado.

O portal vinculado à TV e a licença anual estão em implementação nas [features 069](sdd/specs/069-portal-tv-licenca-anual/plan.md) e [070](sdd/specs/070-entrada-listas-gerenciador/plan.md). A API FastAPI/Firestore controla configurações, recuperação e licenças; importação, catálogo e reprodução continuam na TV. A entrada manual do painel usa o ID exibido e a chave numérica da própria TV; a edição no painel devolve valores salvos somente à sessão da mesma TV, sem colocá-los em logs, URLs ou QR. No build comercial, a licença é verificada ao entrar na lista; se vencer durante o uso, a sessão continua até sair da lista ou fechar o app. Configuração e renovação continuam acessíveis. A validação local usa serviços simulados/emulador. Venda e implantação comercial permanecem bloqueadas pelos gates de infraestrutura, pagamento, restauração e TV física.

Desde a [feature 071](sdd/specs/071-consulta-sob-demanda-qr-fixo/plan.md) a TV não consulta o serviço sozinha: o botão **Atualizar** (listas e licença) e o envio no ato ao criar/editar uma lista são as únicas chamadas; "Adicionar lista" é uma tela com as abas Pelo site, Xtream Codes e Lista M3U; o QR da aba do site é fixo e gerado na TV (ID e chave no fragmento), o teste de 7 dias é contado no próprio app e as listas criadas na TV aparecem no site com nome, host, usuário e senha (cifrados no serviço; [ADR-016](sdd/adr/ADR-016-consulta-sob-demanda-qr-fixo.md)).

## Escopo funcional

O objetivo é carregar múltiplas listas M3U, reproduzir canais, filmes e séries compatíveis, permitir favoritos e organizar capas e detalhes do catálogo. As evoluções previstas incluem recomendações, pesquisa por voz com transcrição, integração com OpenAI e controle por aplicativo Android.

TMDB é a integração inicial escolhida para metadados. O **YouTube** entrou só para os trailers (feature 033), pelo player oficial dentro de uma página-ponte estática (ADR-012). As menções originais a **“TV local”, IMDb e Google** permanecem como intenções a esclarecer: forma de acesso, requisitos, APIs e compatibilidade ainda não foram definidos. Elas não são consideradas integrações prontas nem substituições automáticas do TMDB.

### Funcionalidades

> ⚠️ O CCPlay TV não distribui, hospeda nem fornece listas, canais ou
> qualquer outro conteúdo digital. Canais e imagens usados em capturas de
> tela, quando existirem, são apenas demonstrativos.

Lista de visão, não changelog — o status real de cada item está em
[`.planning/backlog.md`](.planning/backlog.md) (`## Ideias Futuras` para o
que ainda não tem spec, `## Features` para o que já tem). Itens do MVP têm
requisito rastreável em `sdd/adr/REQUISITOS-FUNCIONAIS.md`; os marcados **a
avaliar** ainda não passaram por `sdd-assess` e podem ser descartados.

**Listas e fontes**
- Listas M3U/M3U8 por arquivo local ou URL remota, com atualização das
  fontes já cadastradas.
- Acesso por credenciais de provedor (endereço, usuário, senha) — primeiro
  conector alvo é compatível com Xtream Codes.
- *A avaliar:* suporte a portais Stalker/Ministra (STB) como fonte
  adicional.

**TV ao vivo e EPG**
- Canais organizados pelos grupos definidos na própria lista, com
  pesquisa e reprodução.
- Navegação por página nas listas (trilha de categorias e canais da Live TV e
  zapping): "→" avança uma página, "←" volta, OK entra na categoria ou toca o
  canal e RETURN volta à trilha (feature 049). Em Filmes e Séries a lista lateral de
  categorias é rolada com ↑/↓ e paginada com ←/→ (features 052/053); "→" no fim da
  lista entra nos cards, e a lista recolhe enquanto o foco está neles. A tela
  traz um carrossel por categoria com "Ver tudo" (feature 053).
- Nota que o provedor declara na listagem Xtream: selo `★ 7,4` nos cards de Filmes e Séries e
  `★ 7,4 Provedor` no destaque e no detalhe (nunca como IMDb; nota 0 ou inválida não aparece).
  Nas séries, o destaque também mostra o gênero e o fundo da listagem. Tudo vem do que a listagem
  já baixa, sem consulta extra; listas já importadas ganham os campos quando a categoria é renovada
  (feature 055).
- Fileira "Bem avaliados" em Filmes e Séries: filmes dos últimos 10 anos com nota do provedor de 6,0 a
  9,9, uma versão por título, entre os já obtidos no aparelho e sem consulta extra. O conjunto muda a cada
  dia (e fica o mesmo durante o dia). Só aparece com pelo menos 5 títulos elegíveis, avisa quando só parte
  das categorias foi obtida e o "Ver tudo" abre a lista toda ordenada por nota (feature 056).
- Fileiras do TMDB em Filmes, Séries e Início (com a chave TMDB da pessoa, Integrações & BYOK): "Em alta
  esta semana" (ranking semanal do TMDB: cards numerados 1, 2, 3… e a posição real no destaque do card focado) e "Dica de filme"/"Dica de série",
  um sorteio do dia entre títulos bem avaliados e populares dos últimos 15 anos. Só aparece o que existe na
  lista, na versão principal (sem `[L]`/4K; esses só entram na falta dela), com "Fonte: TMDB" e o aviso de
  categorias ainda não obtidas. Sem chave, sem rede ou sem nada em cache as fileiras somem; com rede cortada
  vale o último resultado guardado. Focar nunca consulta o TMDB (feature 057).
- Início no layout "Vitrine expandida" (feature 060): billboard de um título (o que a pessoa está
  assistindo, senão um favorito, senão as boas-vindas) em tela cheia, com "Continuar" mostrando barra e
  "faltam X" só com posição e duração reais, e o Trailer real. Descendo, o billboard recolhe e a fileira
  focada sobe para a topbar; o fundo acompanha o item focado só com imagem já guardada no aparelho. Cards
  de pôster 250 × 375 com selos (`NOVO`, `★ nota` do provedor, `✓`, `♥`) que expandem para 16:9 no foco.
  Fileiras novas: "Filmes adicionados", "Ao vivo agora" (canais favoritos com o programa do EPG) e
  "Porque você assistiu <título>" (semelhantes do TMDB que estão na lista; também em Filmes e Séries). Fileira
  sem dado não aparece. Verificada no navegador com uma lista real; a passada na TV física foi declarada
  como realizada com sucesso, sem números medidos.
- Programa atual ("Agora") com barra de progresso na lista de canais, e
  "A seguir" com sinopse no preview, na faixa do player e nos canais
  favoritos da Home, a partir de EPG em XMLTV (do painel Xtream, do
  `url-tvg` da lista M3U ou de um endereço informado, com deslocamento de
  horário e sincronização por lista em Configurações; feature 030 — passada
  na TV física declarada como realizada com sucesso, sem números medidos).
- Guia completo em tela cheia (grade canais × programas, Hoje/Amanhã, CH±,
  seletor de lista), aberto pelo ícone ao lado da lupa na lista de canais da
  Live TV ou do player sem parar o canal (feature 031 — passada na TV física
  declarada como realizada com sucesso, sem números medidos).
- **Headers da lista e catch-up (Xtream):** canais, filmes e episódios de uma
  lista M3U que declara `User-Agent`/`Referer` são pedidos com esses headers
  no AVPlay (só o `User-Agent` foi provado na TV; `Referer` não tem propriedade
  provada e segue recusado, com erro acionável se o servidor exigir). Num painel
  Xtream com arquivo, o Guia completo marca os programas disponíveis e o OK
  toca o programa do início; no player ao vivo, "Do início" (linha de controles,
  depois de "Guia") recomeça o programa atual; o arquivo tem ⏪/⏩, barra e "Ao
  vivo", e não entra no Histórico (feature 058). Validado na TV física só com um
  painel fictício; **com uma lista real o catch-up não foi testado**.
- *A avaliar:* multi-canal (feature 031, especificada); seleção de canal por
  número.

**Descoberta e metadados**
- Pesquisa nos três tipos de conteúdo (canais, filmes, séries).
- Detalhe de filme e série no layout "Cinema" (feature 059): backdrop em tela
  cheia, capa grande, categoria da lista num chip próprio separado dos gêneros,
  sinopse (truncada, com "Ver mais"), ações em ícones (a primária mostra barra e
  "faltam X" só com posição e duração reais) e abas Detalhes (cartões com a
  origem do dado), Elenco (foto redonda) e Semelhantes (duas linhas: "Na sua
  lista" e "Não encontrados na sua lista"). Gênero, duração, direção, país e
  elenco são buscados **só ao abrir o detalhe** — o que o provedor da lista já
  informa vem primeiro, e a sinopse de cada episódio aparece quando o provedor
  a manda (feature 032, verificada na TV física).
- Classificação indicativa e nota TMDB no detalhe de filmes/séries, no billboard e no card expandido do Início
  (feature 061): país pelo idioma (pt → BR, en → US, es → ES), sem país de reserva; cores oficiais no Brasil.
  A nota diz `TMDB`, exige média positiva e pelo menos 50 votos, e aparece junto da nota do provedor.
  Dados guardados na mesma consulta de detalhe; registros antigos são renovados uma vez ao abrir.
  Cards expandidos usam só o cache local ou a nota da descoberta; pôsteres pequenos ficam sem esses selos.
- Enriquecimento por TMDB (opcional, com chave própria do usuário, digitada
  em Configurações › Integrações & BYOK): completa só o que o provedor deixou
  vazio, com o selo "Dados: TMDB"; um título só é casado quando o casamento é
  inequívoco (id do provedor, ou título + ano com um único candidato).
- Trailer de filme e de série no detalhe (feature 033): o do provedor
  primeiro, depois os do TMDB (oficial antes de idioma), tocado pelo player
  oficial do YouTube numa página-ponte estática publicada no GitHub Pages
  (só a pasta `bridge/`), com os anúncios do YouTube como vierem. Testado na
  TV física em parte — as contagens de SC-001/SC-002 não foram medidas.
- Semelhantes, elenco com foto e página de ator (feature 035; exigem a chave
  do TMDB): a aba Semelhantes cruza os títulos do TMDB com o que já está
  guardado na sua lista (título + ano exato), marca os que existem ("✓ Na sua
  lista") e mostra os demais com um resumo; a aba Elenco mostra foto e
  personagem, e OK numa pessoa abre a filmografia. Pode raramente confundir
  dois filmes homônimos do mesmo ano. Ainda sem passada na TV física.
- *A avaliar:* equipe técnica além da direção e rail de tendências num
  dashboard.
- Recomendações a partir de filmes marcados como "Gostei"; ordenação por
  nota IMDb (fonte/licença dos dados ainda não definida).

**Organização**
- Favoritos nos três tipos de conteúdo (canal, filme, série), por fonte —
  segurando OK ou pela tecla amarela do controle sobre o item focado.
- Indicação de "já assistido" (filme, com correção manual) e "em dia"
  (série, por cobertura de episódios conhecidos), além de "continuar
  assistindo" no hub da fonte para o que tem retomada salva, e uma lista
  "↺ Histórico" em Filmes e Séries com tudo que já foi reproduzido, do
  mais recente ao mais antigo, incluindo o que já terminou (feature 025)
  — canal ao vivo não tem histórico nem "já assistido" (decisão de
  escopo, feature 019). Um título sai do "↺ Histórico" pela tecla vermelha
  na grade ou pela ação "Remover do histórico" no detalhe, e Configurações ›
  Fontes IPTV › Configurar › Histórico limpa o histórico de Filmes, Séries ou
  ambos daquela lista (ativa ou não) —
  sempre com confirmação e a escolha de manter ou apagar a retomada, sem
  tocar em favoritos nem em "assistido" (feature 036). *A avaliar:*
  agregação de favoritos/histórico entre todas as fontes.
- **Aspecto, qualidade e preferências do player:** no player de filme, série e
  canal, "Aspecto" (Ajustar, Preencher, Original e Zoom — verificado na TV) e
  "Qualidade" (Auto mais só as resoluções que o stream anuncia; com uma só,
  o botão explica) são reais; "Velocidade" foi retirada por decisão de
  produto. Configurações › Player & reprodução guarda, por aparelho,
  o aspecto e a qualidade padrão e o idioma de áudio e de legenda; a escolha
  feita durante a reprodução vale só até o fim da sequência e nunca altera
  essas preferências (feature 041). A troca de resolução num stream com várias
  variantes ainda não foi provada na TV.
- **Idioma do app:** Configurações › Acessibilidade & sistema › Idioma
  (Português, English, Español) troca na hora todos os textos próprios do
  app, sem reiniciar nem tirar o foco; sem escolha gravada o app usa o idioma
  da TV, se suportado, senão Português. O idioma também define a língua da
  sinopse e dos trailers vindos do TMDB (com fallback para inglês e depois o
  original) e os formatos de data, hora e país. Nomes de canal, categoria e
  título vindos da lista nunca são traduzidos; áudio e legenda do player
  seguem com preferência própria (feature 054; validado na TV física).
- **Estado e vencimento da conta das listas:** para uma lista Xtream, a linha
  em Configurações › Fontes IPTV mostra "Conta válida até DD/MM/AAAA" (com chip
  âmbar a partir de 7 dias do vencimento e chip de erro quando vence), o estado
  de sincronização com o motivo ("Sincronizando", "Credencial inválida",
  "Conta expirada") e a contagem conhecida ("41 categorias de canais · 31 de
  filmes · 27 de séries"), nunca "0" inventado. O cartão da lista só ganha um
  chip quando há algo a fazer. Escolher uma lista cuja assinatura venceu, ou
  cuja credencial o provedor recusou, não abre o Início: aparece uma tela com o
  motivo e as ações "Editar lista", "Verificar de novo" e "Voltar" (a consulta
  ao painel é uma por dia, com limite de 5 s, e uma falha de rede sozinha nunca
  impede a lista). M3U avulsa e "Modo limitado" não têm conta (feature 034).
- **Teste de conexão:** em Configurações › Integrações & BYOK, "Iniciar teste"
  mede download, upload, latência HTTP e jitter até a Cloudflare, em sequência,
  com teto de 60 s / 150 MB (30 s / 75 MB por etapa). O diálogo e o card mostram
  o último resultado guardado no aparelho, sem medir ao consultar; resultados
  antigos identificam o upload como "Não medido neste teste". O envio contém
  só bytes gerados pelo app. Cancelar/RETURN preservam o resultado anterior.
  Mede a rota até a Cloudflare, sem diagnosticar travamentos ou garantir
  reprodução IPTV (features 062/064). Fluxo validado no navegador; o upload
  no app empacotado ainda não foi validado na TV física (recomendação, sem gate).
- **Rede, retomada e erros com código:** se o stream cai depois de tocar, o
  app reconecta sozinho até 3 vezes (filme e episódio retomam da posição em
  que estavam; canal reabre) e só então mostra o erro; um canal que nunca tocou
  vai direto ao erro. Ao voltar do app oculto sem rede, o filme continua pausado
  até a rede voltar. O aviso de "Sem conexão" ganhou a ação "Tentar de novo" no
  fim da barra de topo (alcançável pelo controle remoto) e "Ressincronizar"
  fica indisponível, com o motivo, enquanto estiver offline. Todo erro mostra
  o que houve, uma ação e um código discreto (`NET-`, `SRC-`, `API-`, `PLAY-`,
  além de `EPG-02`/`STO-01`); o erro de reprodução distingue rede, formato e
  fonte e tem "Info técnica" sem URL nem credencial, e um limite (429) do
  painel faz a pré-carga esperar um minuto em vez de insistir (feature 042).
  Os nomes reais de erro do AVPlay e uma queda de rede de verdade ainda não
  foram vistos na TV.
- **Categorias e controle parental:** em Configurações › Fontes IPTV › Configurar ›
  Categorias & controle parental, cada categoria da lista (Canais, Filmes, Séries) pode ser escondida — some de
  trilhas, "Todos", busca, fileiras, Favoritos/Histórico/Continuar assistindo,
  guia e zapping, sem apagar favorito nem progresso — ou bloqueada com um PIN
  de 4 dígitos (teclas do controle ou teclado na tela). Bloqueada aparece com
  cadeado no fim da trilha e pede o PIN; o desbloqueio vale até o app ir para
  segundo plano ou trocar de lista. O PIN é **por lista** (feature 067): cada
  lista tem o seu ou nenhum, e o de uma não vale em outra. Ao ligar, categorias
  de nome adulto da lista vêm sugeridas; com o PIN dela, editar e remover essa
  lista também o pedem (adicionar lista nunca pede). "Esqueci o PIN" confere
  usuário e senha (ou endereço M3U) da própria lista, só no aparelho.
  O número dos canais não muda ao esconder. Conteúdo adulto (categoria de nome
  adulto, item que a lista marca como adulto ou categoria bloqueada) nunca
  aparece no ↺ Histórico nem no Continuar assistindo, mesmo com o PIN digitado;
  a retomada do filme continua funcionando (feature 066).
- **Configurações da lista × globais:** a tela "Configurações da lista" (aberta por
  "Configurar" no cartão da tela de perfis ou na linha de Configurações › Fontes
  IPTV) reúne, para qualquer lista — ativa ou não, sem trocar a ativa —, Conta &
  lista (Editar, Ressincronizar, Excluir), EPG, Categorias & controle parental e
  Histórico. Configurações fica só com o que vale para o app todo (Integrações,
  Fontes IPTV, Player, Acessibilidade, Sobre). O PIN antigo, único por aparelho,
  passa às listas que tinham categoria bloqueada ao atualizar (feature 067).

## Arquitetura

**TV:** aplicativo web empacotado para Tizen, com React, TypeScript, CSS e Vite; `PlayerService` usando AVPlay na Samsung; cache de catálogo em IndexedDB, condicionado à validação no aparelho.


**Mídia:** reprodução direta da origem para a TV por padrão. O aplicativo não retransmite nem transcodifica o vídeo. Navegação e comandos são processados localmente. A única exceção hospedada é a página-ponte do trailer (ADR-012): uma página estática, sem lógica de servidor nem dado da pessoa, que só recebe o id do vídeo.

**Resiliência:** o catálogo salvo em IndexedDB garante navegação instantânea. Isso não significa que vídeos remotos funcionem sem internet, que URLs nunca expirem ou que todas as capas estejam armazenadas.

As definições, limitações e referências técnicas estão nas ADRs:

- [ADR-001 — Arquitetura e stack](ADR-001-arquitetura-tech-stack-aplicativo-tv.md).
- [ADR-002 — Cache-First e resiliência](ADR-002-offline-first-resiliencia-na-tv.md).


## Desenvolvimento local

### Pré-requisitos e organização

Recomenda-se o uso do VS Code, ferramentas Tizen e Node.js/npm para o frontend.

Os comandos abaixo pressupõem a seguinte estrutura básica:

```text
ccplayTv/
├── tv-web/             # Frontend React/TypeScript
└── tizen-app/          # Projeto de empacotamento Tizen
```

### Frontend

Em um terminal, partindo da raiz do projeto:

```bash
cd tv-web
npm run dev
```

A instalação das dependências do frontend deve já ter sido realizada (`npm install`). O aplicativo estará acessível no endereço exibido pelo Vite.

### Medição de desempenho das telas

A feature 065 mede vitrines, categorias, memória e abertura em `tv-web/scripts/bench/run-screen-perf.mjs`, com fixtures sintéticas e CPU limitada a 4×; o comparador é `compare-screen-perf.mjs` e os resultados ficam em `tv-web/bench-results/screen-perf-065/`. O aceite final usou um protocolo reduzido (3 amostras, 4 configurações, baseline e candidata em sequência — `reduced/report.md`), não a matriz de 7 amostras prevista na spec. O navegador é um proxy: não comprova RAM, pintura ou desempenho na TV.

A importação tem uma bancada própria (feature 063): `npm run bench:import`, com `npm run dev` no ar, importa fontes fictícias Xtream/M3U/XMLTV de 1k, 10k e 100k entradas no navegador e grava o resultado em `tv-web/bench-results/`. O `npm run lint` também roda uma catraca de arquitetura (`tv-web/scripts/architecture.mjs`): falha num import feature→feature, lib→UI, components→features ou `lib/catalog`→`lib/player`, e num arquivo de produção acima de 300 linhas (ou do teto herdado em `architecture-baseline.json`, que só diminui).

### Integração com a TV

Para empacotamento e testes no emulador ou TV física, o aplicativo é compilado e encapsulado no Tizen Studio através de comandos de build específicos e ferramentas como `sdb` e o CLI do Tizen. Consulte a documentação específica de build para mais detalhes.

## Próximos marcos

**Validado em 18/09/2026**: o app roda na TV de referência (Samsung QN50Q60DAGXZD) e um canal da fonte real reproduz com vídeo e áudio em tela cheia via `webapis.avplay`, com o catálogo salvo e processado localmente na TV — é a porta de validação V1 da ADR-006, executada. O firmware e a engine web do aparelho continuam sem registro: esta TV não expõe console ao desenvolvedor (`sdb root on` negado, `dlog` vazio, Web Inspector fechado).

**Validado em 18/09/2026**: canais ao vivo de fontes por credenciais de provedor (Xtream Codes) passaram a ser importados pelo protocolo JSON do próprio painel (`player_api.php`), preservando o identificador estável e as categorias como o provedor as declara — em vez de reaproveitar o parser M3U, que descartava essa estrutura. Verificado na TV física com uma fonte real: categorias e identificador confirmados, reprodução sem regressão. Painéis que não falam esse protocolo continuam funcionando pelo caminho M3U existente, sinalizados como "modo limitado".

Filmes e séries deixaram de usar dados fictícios: as telas leem o catálogo real, com o mesmo protocolo JSON do provedor (feature 006). Em 23/09/2026, a importação de fonte de provedor passou a gravar só a **estrutura** (as categorias declaradas pelo painel) e a obter os itens de cada categoria quando a pessoa entra nela — sincronizar uma fonte com centenas de milhares de itens deixou de significar esperar minutos olhando uma tela de progresso (feature 010, `sdd/specs/010-catalogo-sob-demanda/`). Fonte por URL M3U continua importando tudo de uma vez, como sempre — não existe protocolo por categoria num arquivo M3U.

**Validado em 23/09/2026**: o ciclo completo de carga sob demanda foi verificado na TV física (feature 010) — sincronizar a fonte real passou a concluir em segundos (antes, minutos), e entrar numa categoria traz os itens dela sob demanda, com cache e degradação honesta offline. 6 dos 7 cenários do quickstart foram aprovados no aparelho; o único não executado (fonte por URL M3U) fica coberto por teste automatizado, sem fonte M3U disponível na sessão para confirmação visual.

**Validado em 23/09/2026**: as listas de canais e grades de pôsteres (Live TV, Filmes, Séries) passaram a virtualizar o que renderizam (`@tanstack/react-virtual`), sincronizadas com o motor de foco próprio do projeto — nunca com uma engine de foco por DOM (feature 009, `sdd/specs/009-virtualizacao-foco/`; ADR-009 formaliza essa escolha, substituindo a recomendação original de Norigin Spatial Navigation, nunca adotada). O teto artificial de 500 itens por categoria (`CHANNELS_PER_GROUP_CAP`), necessário só por falta de virtualização, saiu de uso: uma categoria com milhares de itens agora rola sem travar a TV, confirmado no aparelho de referência.

**Validado em 24/09/2026**: favoritar canais, filmes e séries (feature 013)
foi confirmado na TV física — segurar OK sobre o item focado, ou apertar a
tecla amarela do controle num toque único (segundo caminho independente,
acrescentado depois que um controle de teste não distinguia
pressionar/segurar/soltar como o navegador). Uma categoria "★ Favoritos"
lista, por fonte e tipo, o que já estiver carregado no aparelho.

Próximos: enriquecimento, recomendações, e então voz e controle Android. Captura de áudio disponível, persistência e protocolo de sincronização ainda precisam de validação ou decisão específica.

## Referências do ambiente

Consultadas em 2026-09-13. As ADRs contêm as referências da arquitetura.

[^vite]: Vite — Getting Started. `https://vite.dev/guide/`


