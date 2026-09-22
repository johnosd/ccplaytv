# CCPlay TV

Reprodutor e organizador de listas M3U, M3U8 para Smart TVs Samsung com Tizen, com foco em navegação por controle remoto, organização do catálogo e fluidez, que permite usuarios importarem URL remotas e adicionalmente suporta EPG em XMLTV.

## Estado do projeto

Projeto em configuração inicial e desenvolvimento. O desenvolvedor informou seguir o setup de React/TypeScript e Python/FastAPI, usando **uv** no backend. A revisão desta documentação não incluiu o código da aplicação nem testes na TV; funcionalidades planejadas não são apresentadas como entregues.

## Escopo funcional

O objetivo é carregar múltiplas listas M3U, reproduzir canais, filmes e séries compatíveis, permitir favoritos e organizar capas e detalhes do catálogo. As evoluções previstas incluem recomendações, pesquisa por voz com transcrição, integração com OpenAI e controle por aplicativo Android.

TMDB é a integração inicial escolhida para metadados. As menções originais a **YouTube, “TV local”, IMDb e Google** permanecem como intenções a esclarecer: forma de acesso, requisitos, APIs e compatibilidade ainda não foram definidos. Elas não são consideradas integrações prontas nem substituições automáticas do TMDB.

### Funcionalidades planejadas (visão de produto — nenhuma entregue ainda)

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
- Favoritos e indicação de "já assistido"/"continuar assistindo" nos três
  tipos de conteúdo, por fonte e agregados entre todas as fontes.

## Arquitetura

**TV:** aplicativo web empacotado para Tizen, com React, TypeScript, CSS e Vite; `PlayerService` usando AVPlay na Samsung; cache de catálogo em IndexedDB, condicionado à validação no aparelho.

**Backend:** Python, FastAPI e Uvicorn, com Pydantic para contratos e `uv` para o ambiente Python. PostgreSQL é o banco de persistência, acessado via SQLAlchemy 2 (engine assíncrono) com migrações Alembic — em uso desde a feature `001-importacao-fonte-m3u` (importação de fontes M3U por URL/provedor).

**Mídia:** reprodução direta da origem para a TV por padrão. O backend não retransmite nem transcodifica todo o vídeo. Navegação e comandos locais não aguardam OpenAI ou WebSocket.

**Resiliência:** o catálogo já salvo pode continuar navegável sem o backend. Isso não significa que vídeos remotos funcionem sem internet, que URLs nunca expirem ou que todas as capas estejam armazenadas.

As definições, limitações e referências técnicas estão nas ADRs:

- [ADR-001 — Arquitetura e stack](ADR-001-arquitetura-tech-stack-aplicativo-tv.md).
- [ADR-002 — Cache-First e resiliência](ADR-002-offline-first-resiliencia-na-tv.md).
- [ADR-003 — Python, FastAPI e uv](ADR-003-mudanca-backend-python-fastapi.md).

## Desenvolvimento local

### Pré-requisitos e organização

Manter VS Code, ferramentas Tizen, Node.js/npm para o frontend e Python/uv para o backend. Node.js continua necessário às ferramentas Vite, embora o servidor seja Python.[^vite]

Os comandos abaixo pressupõem a estrutura do roteiro de configuração. O nome da pasta raiz pode ser diferente no repositório real.

```text
samsung-player/
├── tv-web/             # Frontend React/TypeScript
├── api/
│   ├── main.py         # Servidor inicial descrito no roteiro
│   ├── pyproject.toml  # Quando adotado o fluxo de projeto uv
│   ├── uv.lock         # Gerado pelo uv; versionar
│   ├── .venv/          # Ambiente local; não versionar
│   └── .env            # Configuração local; não versionar
└── tizen-app/          # Projeto de empacotamento, quando criado
```

A versão Python validada deverá ser registrada nas configurações do projeto. Não é necessário trocar o interpretador apenas para aplicar esta revisão documental.

### Frontend

Em um terminal, partindo da raiz do projeto:

```bash
cd tv-web
npm run dev
```

A instalação das dependências do frontend deve já ter sido realizada. Use o endereço exibido pelo Vite; a configuração inicial da API autorizava as origens locais da porta `5173`. Se essa porta mudar, ajuste o CORS correspondente.

### Backend com projeto uv já configurado

Em outro terminal, partindo da raiz, **quando `api/pyproject.toml` e `api/uv.lock` já existirem e incluírem todas as dependências utilizadas**:

```bash
cd api
uv sync --locked
uv run --locked python main.py
```

`uv run` utiliza o ambiente do projeto sem exigir ativação manual. `--locked` impede a atualização automática de um lockfile incompatível; nesse caso, confira a alteração de dependências antes de gerar uma nova resolução.[^uv-projects][^uv-sync]

O comando pressupõe que `main.py` mantém o bloco de inicialização com Uvicorn apresentado no roteiro. Não cria um servidor por si só nem exige substituir o arquivo existente.

Preservando a configuração anterior, `api/.env` contém:

```dotenv
HOST=127.0.0.1
PORT=3000
DATABASE_URL=postgresql+psycopg://ccplaytv:ccplaytv_dev@127.0.0.1:5432/ccplaytv
```

O teste esperado é `GET http://127.0.0.1:3000/health`, com retorno:

```json
{"status":"ok","service":"samsung-player-api"}
```

A documentação interativa estará em `http://127.0.0.1:3000/docs`, se mantida a configuração padrão do FastAPI.[^fastapi-start]

**Banco de dados local**: as rotas de catálogo (`/sources`, `/import-jobs`,
`/catalog-items`) exigem PostgreSQL rodando. Suba-o com Docker Compose a
partir da raiz do repositório e aplique as migrações antes de usar essas
rotas:

```bash
docker compose up -d postgres
cd api
uv run alembic upgrade head
```

**Nota de plataforma (Windows)**: psycopg em modo assíncrono não funciona
com o `ProactorEventLoop` padrão do `asyncio` no Windows — `main.py` já
troca para `WindowsSelectorEventLoopPolicy` automaticamente ao rodar via
`python main.py`; entrypoints assíncronos adicionais precisam da mesma
correção.

### Migração opcional de requirements.txt para projeto uv

**Usar uv no lugar de pip não comprova que o projeto já tenha `pyproject.toml` ou `uv.lock`.** Se você já os utiliza, não execute esta inicialização novamente.

Somente para uma pasta `api` sem `pyproject.toml`, que ainda usa o `requirements.txt` do roteiro, o fluxo recomendado é:

```bash
uv init --bare
uv add -r requirements.txt
```

`uv init --bare` cria apenas a configuração de projeto, sem gerar um novo `main.py`. A importação registra as dependências no projeto e cria a resolução correspondente.[^uv-cli][^uv-migration]

Confira antes se o requirements inclui todas as bibliotecas necessárias. No roteiro inicial eram `fastapi`, `uvicorn[standard]` e `pydantic-settings`. Restrições não fixadas podem resultar em versões diferentes das já instaladas; preserve constraints existentes quando necessário.[^uv-migration]

Depois de validar a migração, adote uma única fonte de dependências. Não mantenha requirements e pyproject atualizados manualmente em paralelo. `uv sync` remove por padrão pacotes não declarados no ambiente gerenciado; não o execute esperando preservar instalações avulsas.[^uv-sync]

### Integração com a TV e segurança

O setup inicial de saúde não depende de PostgreSQL, TMDB ou OpenAI. Essas integrações serão adicionadas nas próximas etapas.

O endereço local acima é para teste no computador. A exposição na rede para a TV exigirá configuração de escuta, firewall, CORS/CSP e autorização adequados. O protótipo inicial não deve ser publicado na internet sem controles de segurança.

Mantenha `.env`, `.venv`, caches Python e certificados privados fora do Git. Versione `pyproject.toml`, `uv.lock` e, quando utilizado, `.python-version`. Não coloque credenciais no pacote da TV.[^uv-layout]

## Próximos marcos

**Validado em 18/09/2026**: o app roda na TV de referência (Samsung QN50Q60DAGXZD) e um canal da fonte real reproduz com vídeo e áudio em tela cheia via `webapis.avplay`, com o catálogo vindo do backend pela rede local — é a porta de validação V1 da ADR-006, executada. O firmware e a engine web do aparelho continuam sem registro: esta TV não expõe console ao desenvolvedor (`sdb root on` negado, `dlog` vazio, Web Inspector fechado).

Próximos: desenvolver o catálogo de filmes e séries sobre dados reais (hoje ainda em mock); adicionar enriquecimento e recomendações; então integrar voz e controle Android. Captura de áudio disponível, persistência e protocolo de sincronização ainda precisam de validação ou decisão específica.

**Validado em 18/09/2026**: canais ao vivo de fontes por credenciais de provedor (Xtream Codes) passaram a ser importados pelo protocolo JSON do próprio painel (`player_api.php`), preservando o identificador estável e as categorias como o provedor as declara — em vez de reaproveitar o parser M3U, que descartava essa estrutura. Verificado na TV física com uma fonte real: categorias e identificador confirmados, reprodução sem regressão. Painéis que não falam esse protocolo continuam funcionando pelo caminho M3U existente, sinalizados como "modo limitado". Filmes e séries pelo mesmo protocolo ficam para a próxima fatia.

## Referências do ambiente

Consultadas em 2026-09-13. As ADRs contêm as referências da arquitetura.

[^vite]: Vite — Getting Started. `https://vite.dev/guide/`
[^uv-projects]: Astral — Working on projects. `https://docs.astral.sh/uv/guides/projects/`
[^uv-sync]: Astral — Locking and syncing. `https://docs.astral.sh/uv/concepts/projects/sync/`
[^uv-cli]: Astral — Commands, `uv init --bare`. `https://docs.astral.sh/uv/reference/cli/`
[^uv-migration]: Astral — From pip to a uv project. `https://docs.astral.sh/uv/guides/migration/pip-to-project/`
[^uv-layout]: Astral — Structure and files. `https://docs.astral.sh/uv/concepts/projects/layout/`

[^fastapi-start]: FastAPI — First Steps. `https://fastapi.tiangolo.com/tutorial/first-steps/`

