# CCPlay TV

Reprodutor e organizador de listas M3U, M3U8 para Smart TVs Samsung com Tizen, com foco em navegação por controle remoto, organização do catálogo e fluidez, que permite usuarios importarem URL remotas e adicionalmente suporta EPG em XMLTV.

## Estado do projeto

Projeto em desenvolvimento ativo. Conforme a arquitetura atualizada (ADR-008), o app roda 100% no cliente (TV) usando React, TypeScript e IndexedDB, abolindo a necessidade de um backend dedicado sempre ligado.

## Escopo funcional

O objetivo é carregar múltiplas listas M3U, reproduzir canais, filmes e séries compatíveis, permitir favoritos e organizar capas e detalhes do catálogo. As evoluções previstas incluem recomendações, pesquisa por voz com transcrição, integração com OpenAI e controle por aplicativo Android.

TMDB é a integração inicial escolhida para metadados. As menções originais a **YouTube, “TV local”, IMDb e Google** permanecem como intenções a esclarecer: forma de acesso, requisitos, APIs e compatibilidade ainda não foram definidos. Elas não são consideradas integrações prontas nem substituições automáticas do TMDB.

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
- *A avaliar:* guia de programação (EPG) via XMLTV, com timeline "ao vivo"
  e grade multi-canal; TV archive/catch-up/timeshift; seleção de canal por
  número.

**Descoberta e metadados**
- Pesquisa nos três tipos de conteúdo (canais, filmes, séries).
- Enriquecimento por TMDB (opcional, com chave própria do usuário):
  sinopse, capas e trailers para filmes e séries.
- *A avaliar:* elenco e equipe técnica, páginas de ator navegáveis, trilha
  "Similares" e rail de tendências num dashboard.
- Recomendações a partir de filmes marcados como "Gostei"; ordenação por
  nota IMDb (fonte/licença dos dados ainda não definida).

**Organização**
- Favoritos nos três tipos de conteúdo (canal, filme, série), por fonte —
  segurando OK ou pela tecla amarela do controle sobre o item focado.
- Indicação de "já assistido" (filme, com correção manual) e "em dia"
  (série, por cobertura de episódios conhecidos), além de "continuar
  assistindo" no hub da fonte para o que tem retomada salva — canal ao
  vivo não tem histórico nem "já assistido" (decisão de escopo, feature
  019). *A avaliar:* agregação de favoritos/histórico entre todas as
  fontes.

## Arquitetura

**TV:** aplicativo web empacotado para Tizen, com React, TypeScript, CSS e Vite; `PlayerService` usando AVPlay na Samsung; cache de catálogo em IndexedDB, condicionado à validação no aparelho.


**Mídia:** reprodução direta da origem para a TV por padrão. O aplicativo não retransmite nem transcodifica o vídeo. Navegação e comandos são processados localmente.

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


