# ADR-001: Arquitetura e Tech Stack do Aplicativo de TV

## Status

Aceita — texto consolidado e revisado. A escolha original de backend Node.js/Fastify foi substituída pela ADR-003; as demais decisões arquiteturais permanecem, com o escopo de resiliência detalhado na ADR-002.

Esta ADR registra a arquitetura escolhida, não a conclusão de sua implementação. Pontos sem definição estão identificados ao final.

## Data

2026-09-13. Revisão documental: 2026-09-13.

## Contexto

O CCPlay TV será um **aplicativo web empacotado para Smart TVs Samsung com Tizen**, desenvolvido em TypeScript, React e CSS, com compilação pelo Vite. Usará APIs específicas da Samsung; isso não o transforma em um projeto nativo C/C++ ou .NET.

O objetivo é reproduzir e organizar múltiplas listas M3U com canais, filmes e séries, carregar capas, permitir favoritos e evoluir para recomendações, pesquisa por voz e controle por um aplicativo Android externo. O conteúdo utilizado deverá ser autorizado pelo usuário e pelo respectivo fornecedor.

Como a qualidade dos dados das listas varia, o catálogo será normalizado no backend e enriquecido com TMDB quando houver correspondência confiável. A navegação e os comandos locais de reprodução não devem depender de uma resposta da OpenAI.

## Decisão

### 1. Frontend — aplicativo Tizen na TV

**Stack:** TypeScript, React, CSS e Vite, com desenvolvimento no VS Code e ferramentas Tizen. Node.js/npm permanecem no computador para as ferramentas do frontend; não são o runtime do backend escolhido.

A TV renderizará um catálogo previamente organizado. Importação de M3U e consultas de enriquecimento ao TMDB/OpenAI serão responsabilidades do backend. A interface manterá foco visível, navegação por controle remoto, virtualização dos cartões e carregamento limitado de imagens.

**Atualização (ADR-007):** "foco visível" deixou de ser uma intenção genérica e passou a ter contrato — paleta, escala tipográfica, receita de foco (outline + glow + escala), palco 1920×1080 com overscan e estados obrigatórios por superfície estão registrados na ADR-007 e implementados como tokens em `tv-web/src/index.css`. Ver ADR-007 para o raciocínio completo.

A compilação e as dependências deverão ser compatíveis com o aparelho-alvo. A Samsung documenta diferentes mecanismos web por geração; o modelo e o firmware ainda precisam ser identificados antes de fixar a matriz de suporte.[^samsung-engine]

O catálogo sincronizado terá cache local conforme a ADR-002. **Cache de metadados não significa download dos vídeos, nem garante que todas as capas ou fontes continuem acessíveis.**

### 2. Reprodução — `PlayerService` e AVPlay

A camada `PlayerService` isolará as telas da implementação do player. Na Samsung, o mecanismo principal será `webapis.avplay`; no navegador de desenvolvimento, poderá existir um adaptador com `<video>` ou uma implementação simulada.

A opção por AVPlay atende à integração com os recursos de reprodução da plataforma. Não se afirma que `<video>` seja inutilizável: a própria Samsung documenta seu uso para formatos comuns e indica AVPlay para recursos adicionais.[^samsung-avplay]

A compatibilidade de cada fonte deverá ser verificada no aparelho real, incluindo contêiner, codecs, streaming adaptativo, áudio, legendas, autenticação e eventual DRM. Emulador e navegador auxiliam o desenvolvimento, mas não substituem essa validação.

**Direct Play será o padrão:** o vídeo seguirá da origem indicada pela lista para a TV. O backend fornecerá catálogo, permissões e informações de reprodução, sem retransmitir ou transcodificar o vídeo por padrão. Proxy ou transcodificação exigirão uma decisão posterior, baseada em necessidade comprovada, custo e permissões da fonte.

Uma fonte somente poderá ser iniciada sem o backend quando a TV já possuir os dados necessários e puder acessar a origem e os serviços de autorização/licença exigidos. URLs expiradas ou dependentes de renovação pelo backend podem impedir a reprodução.

### 3. Backend — monólito modular Python

**Stack vigente:** Python, FastAPI, Uvicorn, Pydantic e `uv`, conforme a ADR-003. PostgreSQL permanece como banco escolhido para persistência; sua instalação e integração não são dadas como concluídas nesta revisão.

O backend terá módulos para importação, catálogo, integrações, recomendações e controle externo. Separação em módulos não implica iniciar vários microsserviços.

Na importação, preservará os dados originais, normalizará títulos e distinguirá a obra de suas opções de reprodução. A associação com TMDB considerará título, ano e tipo de conteúdo, sem assumir que o primeiro resultado é correto. A API do TMDB oferece pesquisa e consulta de detalhes; os critérios de correspondência e correção serão regras do CCPlay.[^tmdb-search]

Trabalhos extensos não deverão bloquear as rotas interativas. A estratégia de execução e o eventual uso de processos de trabalho estão tratados na ADR-003, sem escolher antecipadamente uma fila.

### 4. Recomendações, OpenAI e voz

O TMDB é a integração inicial escolhida para metadados. Recomendações deverão ser cruzadas com o catálogo disponível; eventual descoberta de títulos fora dele será identificada separadamente. Atribuição e condições de uso do TMDB deverão ser atendidas antes da distribuição.[^tmdb-faq]

As chamadas à OpenAI serão feitas pelo backend, utilizando a Responses API e funções controladas para pesquisar o catálogo, obter recomendações e interpretar comandos. O modo estrito limita o formato dos argumentos; o código ainda deverá validar identificadores, autorização, disponibilidade e estado do player.[^openai-functions]

Chaves privadas das integrações não serão incluídas no pacote Tizen, no futuro aplicativo Android ou em variáveis públicas do frontend. A OpenAI orienta manter sua chave fora de aplicações cliente.[^openai-keys] URLs de listas com credenciais também não serão enviadas ao modelo nem registradas integralmente em logs.

**Voz terá duas possibilidades distintas:** integração com comandos reconhecidos pelo assistente Samsung e captura de áudio para transcrição via OpenAI. A API `VoiceInteraction` documenta callbacks de comandos, mas isso não comprova acesso ao áudio bruto do microfone do controle remoto. A captura disponível no modelo escolhido precisa ser validada; o celular permanece como alternativa.[^samsung-voice]

A primeira interação de fala livre será do tipo pressionar para falar. O modelo de transcrição ainda não está definido; não há decisão de usar exclusivamente Whisper ou instalar um modelo local.

### 5. Comandos locais e controle Android

As ações de domínio — como `playItem`, `pause`, `resume`, `seek` e `search` — serão compartilhadas conceitualmente entre controle remoto, voz e aplicativo externo.

**Comandos originados na TV serão executados localmente**, respeitando o estado do player. Não precisarão atravessar WebSocket, backend ou OpenAI para mover o foco, pausar ou retomar.

Para o futuro aplicativo Android, a arquitetura será celular ↔ backend ↔ TV, por WebSockets autenticados. O pareamento usará autorização explícita na TV. O protocolo deverá prever identificação, confirmação, expiração e reconexão; a TV será a fonte do estado real da reprodução.

O escopo inicial do controle externo é operar o CCPlay aberto. Ligar a TV e iniciar o aplicativo fechado não fazem parte desta decisão.

## Alternativas Consideradas

### Aplicativo standalone na TV

Não adotado para o escopo atual. Concentraria importação, enriquecimento e integração com IA no cliente, aumentando o trabalho no dispositivo e dificultando a proteção de credenciais. Isso não significa que qualquer processamento local seja inviável: leitura de cache, pesquisa local e comandos permanecem na TV.

### Usar exclusivamente `<video>` como player principal

Não adotado como padrão na Samsung por priorizarmos integração com AVPlay. `<video>` continua válido no adaptador de desenvolvimento e em cenários que forem compatíveis.[^samsung-avplay]

### Microsserviços imediatos

Não adotados por complexidade operacional prematura. Um monólito modular Python é a escolha inicial, sujeito a testes de carga e revisão quando houver evidência de gargalos.

### Proxy e transcodificação de todo o vídeo

Não adotados por acrescentarem processamento, tráfego e dependência do servidor ao caminho da mídia. Direct Play será tentado somente quando fonte e aparelho forem compatíveis.

## Consequências

### Positivas

- Separação entre navegação/reprodução, processamento do catálogo e integrações externas.
- Possibilidade de continuar usando dados sincronizados quando o backend estiver indisponível, dentro dos limites da ADR-002.
- Evolução de voz e Android sobre ações comuns, sem tornar o controle local dependente da rede.

### Negativas

- Dois ambientes de desenvolvimento: TypeScript/npm no frontend e Python/uv no backend.
- Necessidade de implementar sincronização, limites de cache, segurança e tratamento de fontes indisponíveis.
- Testes em TV real para comprovar desempenho e compatibilidade; APIs externas e fornecedores de mídia continuam sendo dependências de suas respectivas funções.

### Caminho de Migração / Evolução Futura

A configuração inicial segue o ambiente local descrito no README. Hospedagem definitiva, ORM, fila de tarefas e versões mínimas da TV continuam pendentes.

Resposta visual abaixo de 100 ms e navegação próxima de 60 quadros por segundo são **metas de avaliação**, não resultados garantidos pela stack. Deverão ser medidas com aparelho, volume de catálogo e cenários de teste identificados.

YouTube, “TV local”, IMDb e Google aparecem no README original, mas não possuem uma decisão de integração nesta arquitetura. Permanecem registrados como itens a esclarecer, sem serem removidos ou apresentados como implementados.

## Referências técnicas da revisão

As escolhas do produto provêm das ADRs fornecidas e das decisões da conversa. As referências abaixo fundamentam correções sobre as plataformas, não comprovam uma implementação do CCPlay. Consultadas em 2026-09-13.

[^samsung-engine]: Samsung Developer — Web Engine Specifications. `https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html`
[^samsung-avplay]: Samsung Developer — Playback Using AVPlay. `https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-avplay.html`
[^tmdb-search]: TMDB — Search & Query For Details. `https://developer.themoviedb.org/docs/search-and-query-for-details`
[^tmdb-faq]: TMDB — FAQ. `https://developer.themoviedb.org/docs/faq`
[^openai-functions]: OpenAI — Function calling. `https://developers.openai.com/api/docs/guides/function-calling`
[^openai-keys]: OpenAI — Best Practices for API Key Safety. `https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety`
[^samsung-voice]: Samsung Developer — VoiceInteraction API. `https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/voiceinteraction-api.html`
