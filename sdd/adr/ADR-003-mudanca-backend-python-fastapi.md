# ADR-003: Backend Python + FastAPI e Gerenciamento com uv

## Status

Aceita — substitui somente a escolha original de stack do backend da ADR-001. A adoção de `uv` foi confirmada pelo desenvolvedor nesta revisão.

O fluxo de projeto com `pyproject.toml` e `uv.lock`, descrito abaixo, é a padronização operacional recomendada nesta revisão. Não se presume que esses arquivos já existam, pois o repositório da aplicação não foi fornecido.

## Data

2026-09-13. Revisão documental: 2026-09-13.

## Contexto

A proposta inicial usava Node.js, Fastify e TypeScript para manter uma linguagem comum entre frontend e backend. Posteriormente foi escolhida a mudança para Python e FastAPI, mantendo React/TypeScript na TV e PostgreSQL como banco planejado.

O backend continuará responsável por importar listas, organizar metadados, consultar serviços externos e preparar recomendações e controle remoto. Python foi escolhido por adequação ao desenvolvimento pretendido e ao ecossistema de dados, não por uma medição que demonstre superioridade sobre Node.js.

A integração com OpenAI, isoladamente, não favorece obrigatoriamente Python: existem SDKs oficiais para Python e JavaScript/TypeScript.[^openai-sdks] Também não há evidência neste projeto de que expressões regulares, parsing M3U ou WebSockets tenham desempenho melhor ou pior apenas por essa escolha.

O desenvolvedor informou ter seguido a configuração inicial do backend, utilizando `uv` no lugar de `pip`.

## Decisão

### 1. Stack e componentes

Adotar **Python + FastAPI**, executado com **Uvicorn**, e **uv** como ferramenta do ambiente Python.

Pydantic será utilizado nos esquemas de entrada e saída; `pydantic-settings` cuidará das configurações externas e do `.env`, conforme o servidor inicial descrito na configuração.[^fastapi-settings]

PostgreSQL permanece escolhido para persistência, mas ORM, driver e ferramenta de migrações ainda serão definidos. O texto anterior “SQLAlchemy ou SQLModel” descrevia alternativas, não uma decisão concluída.

HTTPX e o SDK Python da OpenAI são as opções previstas para as integrações, a serem adicionadas quando essas funcionalidades forem desenvolvidas. O HTTPX possui cliente assíncrono e recomenda reutilizá-lo para aproveitar conexões.[^httpx] Não se exige instalar todas as dependências futuras para executar o teste `/health`.

### 2. Dependências e ambiente com uv

O uso de `uv` não obriga a abandonar imediatamente um fluxo existente com `requirements.txt`: a ferramenta também oferece uma interface compatível com pip.[^uv-overview]

Para o projeto, recomenda-se o fluxo gerenciado por **`pyproject.toml` + `uv.lock`**: o primeiro declara dependências e compatibilidade Python; o segundo registra a resolução de versões e deve ser versionado. `.venv` permanece local e não entra no Git.[^uv-layout]

A versão Python efetivamente validada deverá ser registrada, inclusive em `.python-version` quando adotado o pin do interpretador. Esta revisão não impõe uma troca de versão do Python já instalado.

Nesse fluxo, usar `uv add`/`uv remove` para modificar dependências e `uv run` para executar o programa no ambiente do projeto, sem exigir ativação manual da `.venv`.[^uv-projects]

Para reproduzir o ambiente de um lockfile já existente, usar `uv sync --locked`. O parâmetro exige que o lockfile esteja coerente com o projeto, em vez de atualizá-lo silenciosamente. Atenção: `uv sync` faz sincronização exata por padrão e pode remover pacotes não declarados; dependências necessárias devem estar registradas antes dessa operação.[^uv-sync]

Não manter `requirements.txt` e `pyproject.toml` como duas fontes manuais independentes de dependências. Se o fluxo gerenciado for adotado, o arquivo legado poderá ser importado e, quando necessário, um requirements poderá ser gerado para interoperabilidade. A migração opcional está no README.[^uv-migration]

### 3. Validação e regras de negócio

Pydantic validará a estrutura dos contratos, mas não será tratado como normalizador automático de títulos, mecanismo de correspondência TMDB ou validação de autorização.

**Validação estrita não é o comportamento padrão para todos os tipos.** Pydantic pode realizar coerções; restrições estritas deverão ser configuradas explicitamente nos contratos em que forem necessárias.[^pydantic-strict]

O importador precisará de regras próprias para normalização, identificação de episódios, deduplicação e tratamento de registros inválidos. Essas regras deverão ser testadas separadamente da validação de esquema.

### 4. Concorrência e trabalhos demorados

Usar `async`/`await` com bibliotecas apropriadas nas operações de rede. Declarar uma função como assíncrona não torna parsing intensivo ou uma chamada bloqueante automaticamente não bloqueantes.[^fastapi-async]

Importações extensas e cálculos custosos deverão ser executados fora do caminho de atendimento interativo. Processos de trabalho poderão pertencer ao mesmo projeto modular; não implicam, por si só, criar microsserviços.

`BackgroundTasks` poderá atender tarefas pequenas, mas não será considerado uma fila durável para importações críticas. A documentação do FastAPI distingue essas tarefas do processamento pesado em processos/servidores separados.[^fastapi-background]

A ferramenta de fila e sua infraestrutura continuam pendentes. Caso sejam necessárias, a decisão deverá considerar recuperação após falha, progresso e repetição segura de trabalhos, não apenas o nome da biblioteca.

### 5. Contratos HTTP e WebSocket

Manter APIs HTTP para catálogo e operações do aplicativo, e WebSockets para o futuro controle externo. Não criar um segundo backend Node.js apenas para transportar comandos.

A geração de um cliente TypeScript a partir do OpenAPI é uma opção para reduzir divergência nos contratos HTTP entre Python e a TV.[^fastapi-clients] O protocolo de mensagens WebSocket terá esquemas e testes próprios; ele não é gerado automaticamente a partir das rotas HTTP.

Antes de executar várias instâncias do servidor, será necessário decidir como encaminhar comandos entre conexões distribuídas. Um registro de conexões apenas em memória de um processo não resolve esse cenário; o exemplo oficial do FastAPI explicita essa limitação.[^fastapi-websockets]

## Alternativas Consideradas

### Manter Node.js + Fastify

Alternativa tecnicamente válida e mais simples para compartilhar linguagem com o frontend. Não escolhida porque o projeto optou por Python/FastAPI. Não é rejeitada por uma suposta inferioridade universal em manipulação de strings, OpenAI ou geração de documentação.

### Manter instalação manual com pip como padrão

Não é o fluxo escolhido pelo desenvolvedor, que já utiliza `uv`. Isso não torna pip tecnicamente inadequado. O benefício pretendido do fluxo gerenciado é centralizar ambiente e dependências reproduzíveis, não acelerar a execução da API.

### Separar imediatamente um serviço de tempo real em outra linguagem

Não adotado sem evidência de necessidade. Futuras mudanças deverão partir de medições de latência, concorrência e consumo de recursos, e não de uma hipótese de gargalo inerente ao Python.

## Consequências

### Positivas

- Backend alinhado à preferência atual de desenvolvimento em Python.
- Contratos de dados explícitos e possibilidade de gerar clientes a partir do OpenAPI.
- Ambiente reproduzível quando dependências, lockfile e versão Python estiverem registrados e validados.

### Negativas

- Duas linguagens e dois conjuntos de ferramentas: TypeScript/npm na TV e Python/uv no backend.
- Tipos Python não são compartilhados diretamente como arquivos TypeScript; é necessário manter contratos entre as aplicações.
- Concorrência, persistência, execução de trabalhos e escalabilidade continuam exigindo decisões e testes. uv não altera o desempenho de runtime do player ou da API.

### Caminho de Migração / Evolução Futura

Preservar `tv-web` e a configuração Tizen. O antigo servidor Fastify deixa de ser a implementação ativa; não se remove Node.js das ferramentas do frontend.

A estrutura inicial continua admitindo `api/main.py`. Mantido o código de inicialização anterior, o comando de desenvolvimento pelo fluxo gerenciado será `uv run --locked python main.py`, com execução dentro de `api` e lockfile já criado.

Depois do teste de saúde, evoluir para módulos de catálogo, importação e integrações. Registrar em decisões posteriores ORM/migrações, processamento de tarefas e protocolo externo quando forem concretamente escolhidos.

## Referências técnicas da revisão

A mudança para Python/FastAPI e a adoção de uv derivam das decisões da conversa. As fontes abaixo corrigem afirmações sobre ferramentas e fundamentam o fluxo recomendado. Consultadas em 2026-09-13.

[^openai-sdks]: OpenAI — SDKs and CLI. `https://developers.openai.com/api/docs/libraries`
[^fastapi-settings]: FastAPI — Settings and Environment Variables. `https://fastapi.tiangolo.com/advanced/settings/`
[^httpx]: HTTPX — Async Support. `https://www.python-httpx.org/async/`
[^uv-overview]: Astral — uv, visão geral e interface pip. `https://docs.astral.sh/uv/`
[^uv-layout]: Astral — Structure and files. `https://docs.astral.sh/uv/concepts/projects/layout/`
[^uv-projects]: Astral — Working on projects. `https://docs.astral.sh/uv/guides/projects/`
[^uv-sync]: Astral — Locking and syncing. `https://docs.astral.sh/uv/concepts/projects/sync/`
[^uv-migration]: Astral — From pip to a uv project. `https://docs.astral.sh/uv/guides/migration/pip-to-project/`
[^pydantic-strict]: Pydantic — Strict Mode. `https://docs.pydantic.dev/latest/concepts/strict_mode/`
[^fastapi-async]: FastAPI — Concurrency and async / await. `https://fastapi.tiangolo.com/async/`
[^fastapi-background]: FastAPI — Background Tasks. `https://fastapi.tiangolo.com/tutorial/background-tasks/`
[^fastapi-clients]: FastAPI — Generating SDKs. `https://fastapi.tiangolo.com/advanced/generate-clients/`
[^fastapi-websockets]: FastAPI — WebSockets. `https://fastapi.tiangolo.com/advanced/websockets/`
