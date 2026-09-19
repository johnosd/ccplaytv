# ADR-006: Seleção de Bibliotecas e SDKs para o CCPlay TV

## Status

**Proposta consolidada após entrevista — seleção técnica recomendada para implementação.**

As respostas do responsável e o novo requisito de trailers estão registrados. “Recomendada” significa uma escolha desta proposta, não pacote instalado, versão homologada ou aprovação expressa de cada biblioteca pelo usuário. Compatibilidade na TV, desempenho, versões exatas e licenças dos artefatos distribuídos ainda precisam de validação.

Esta revisão substitui o texto preliminar da ADR-006, não as decisões aceitas das ADR-001 a ADR-003. Complementa as propostas ADR-004/005 e o RF-019. Não incorpora trechos antigos superados que descreviam Node.js/Fastify como backend.

## Data

2026-09-13. Revisão 2 da ADR-006, após a entrevista. Pacote documental v3.

## 1. Contexto e decisões preservadas

O CCPlay é um aplicativo web empacotado para Samsung Tizen, com React, TypeScript, CSS e Vite. AVPlay permanece o player principal das fontes de mídia, atrás de `PlayerService`. O backend continua Python/FastAPI/Uvicorn, Pydantic e `uv`, com PostgreSQL escolhido para persistência. Ver [ADR-001](ADR-001-arquitetura-tech-stack-aplicativo-tv.md) e [ADR-003](ADR-003-mudanca-backend-python-fastapi.md).

Permanecem o acesso sem conta obrigatória, as entradas por URL M3U, arquivo e credenciais de provedor, importação acompanhável, categorias da fonte, canais/filmes/séries, pesquisa, favoritos, histórico, gosto pessoal, IMDb e recomendações. Cache local não significa vídeo offline; comandos locais não dependem de OpenAI ou WebSocket. Ver [ADR-002](ADR-002-offline-first-resiliencia-na-tv.md), [ADR-004](ADR-004-acesso-sem-conta-fontes-importacao.md) e [ADR-005](ADR-005-catalogo-preferencias-imdb-recomendacoes.md).

A entrevista confirmou **Samsung QN50Q60DAGXZD**, uso pessoal com intenção comercial futura, backend no computador com evolução desejada para VPS, experiência sênior em Python/dados e desenvolvimento assistido por IA usando SDD. A primeira integração de voz pode capturar áudio no celular. **Filmes e séries devem oferecer trailers de fácil acesso.**

**Atualização (ADR-008, 2026-09-19):** "backend no computador com evolução
para VPS" deixa de ser o caminho padrão de produção. Import e catálogo
passam a ser client-first (sem backend sempre-ligado, nem local nem VPS),
motivado por custo — distribuição comercial não pode depender de o
desenvolvedor pagar hospedagem por instalação. VPS/backend auto-hospedado
viram contorno opcional, não pré-requisito. Ver ADR-008 para o raciocínio
completo e as seções 4.4/E4 abaixo, emendadas no mesmo sentido.

O usuário forneceu dois endereços de catálogo com credenciais. A leitura limitada de ambos falhou por conexão neste ambiente, sem conteúdo retornado. Não foram reproduzidos streams, descobertos outros endpoints ou testadas credenciais em serviços diferentes. Quantidade de entradas, categorias, qualidade dos dados, equivalência entre as fontes e protocolo efetivo continuam **não medidos**. O registro sanitizado está em `VERIFICACAO-AMOSTRAS.json`.

Não foram inspecionados `package.json`, `pyproject.toml`, `uv.lock`, código, sistema operacional do computador ou firmware da TV. O número de TVs simultâneas não foi informado. Não se presume que a experiência geral intermediária corresponda a uma avaliação específica de React.

## 2. Critérios de seleção propostos

### Plataforma-alvo e compatibilidade

A página Samsung Brasil identifica o modelo exato como Q60D de 50 polegadas; a família Q60D pertence à linha 2024.[^samsung-model][^samsung-year] A referência de desenvolvimento para TVs 2024 é **Tizen 8.0 / Chromium M108**.[^samsung-engine] A Samsung documenta atualizações do sistema em linhas recentes; portanto, essa referência não comprova o runtime atualmente instalado na TV do usuário.[^samsung-general]

O primeiro alvo de homologação será esse aparelho. Registrar modelo, firmware, `navigator.userAgent` e testes de capacidades; ProductInfo oferece consultas de modelo/firmware.[^productinfo] Não declarar suporte comercial a todas as TVs 2024+ apenas porque usam engines semelhantes.

Proposta de build inicial: alvo JavaScript/CSS compatível com Chromium 108, ajustado à versão real do Vite. `build.target` e `build.cssTarget` devem ser explícitos; transpilar sintaxe não adiciona automaticamente APIs ausentes.[^vite-build] Inspecionar dependências transitivas e testar o pacote de produção instalado, não só o servidor Vite no computador. Node.js permanece ferramenta de build, não runtime da TV.

### Escala e operação

Usar um perfil de piloto de **uma TV**, apenas como hipótese operacional, sem atribuí-lo como resposta do usuário. Exercitar conjuntos sintéticos de 1.000, 10.000 e 100.000 entradas, contando episódios individualmente. São cenários de teste, não tamanhos constatados nem capacidade garantida. Medir memória, tempo de importação, consultas, DOM e latência de foco; ajustar limites ao volume real depois.

### Uso comercial e custo

Ausência de teto informado permite comparar soluções pagas; não equivale a autorização de compra nem dispensa análise de custo. Preferir dependências substituíveis, com licença identificada e ganho concreto. Licença de código, termos de API e direitos sobre conteúdo são avaliações diferentes. Não há auditoria jurídica ou de dependências concluída.

## 3. Bibliotecas e SDKs selecionados nesta proposta

**Preservar:** decisão anterior. **Recomendada:** seleção para o próximo incremento, sujeita aos testes. **Condicional:** não incluir antes de resolver o risco indicado. Nenhuma linha comprova instalação.

| Área | Biblioteca / SDK | Encaminhamento e limite |
| --- | --- | --- |
| Plataforma e mídia | SDK/extensões Tizen, Samsung AVPlay e APIs Tizen necessárias | **Preservar.** AVPlay para mídia compatível; Filesystem para a entrada por arquivo quando validada. Não são substituídos por um player React.[^avplay][^usb] |
| Foco direcional | Norigin Spatial Navigation, implementação web React | **Recomendada.** O projeto declara suporte a Tizen; homologar junto da grade. Conferir o pacote web e seus peer dependencies na release escolhida.[^norigin] |
| Grades/listas | TanStack Virtual, `@tanstack/react-virtual` | **Recomendada.** Virtualizar linhas/cartões sem impor design visual; construir integração explícita com foco.[^virtual] |
| Persistência na TV | `dexie`; `dexie-react-hooks` apenas onde útil | **Recomendada.** IndexedDB atrás de `CatalogRepository` e `UserStateRepository`. Não inclui Dexie Cloud nem sincronização automática com FastAPI.[^dexie] |
| Estado remoto | TanStack Query, `@tanstack/react-query` | **Recomendada com escopo limitado.** Jobs, fontes e integrações; não duplicar todo o catálogo persistente em seu cache de memória.[^query] |
| Cliente HTTP gerado | Hey API, `@hey-api/openapi-ts` | **Recomendada como ferramenta de desenvolvimento.** Gerar tipos/cliente HTTP do OpenAPI; validar código gerado no alvo Tizen.[^hey][^fastapi-client] |
| Persistência Python | SQLAlchemy 2 + Alembic + Psycopg 3 (`psycopg`) | **Recomendada.** ORM/Core, migrações e driver PostgreSQL; modelos Pydantic separados das tabelas.[^sqlalchemy][^alembic][^psycopg] |
| HTTP externo | `httpx` | **Recomendada.** Cliente assíncrono reutilizado para M3U, provedor e TMDB, com limites e política de destino do CCPlay.[^httpx] |
| Parser M3U Plus | `m3u-ipytv` | **Condicional, candidato preferido para prova técnica.** Conferir atributos preservados, consumo de memória e Python efetivo; não aprovar sem uma amostra utilizável.[^ipytv] |
| Provedor com usuário/senha/servidor | Adaptador do CCPlay sobre HTTPX | **Recomendada a fronteira própria.** Xtream Codes/compatível é hipótese a validar, não protocolo confirmado. Não escolher SDK comunitário como se fosse oficial universal.[^xtream] |
| Correspondência de títulos | `rapidfuzz` | **Recomendada no incremento de enriquecimento.** Pontuar candidatos limitados; não decide sozinho identidade, gênero, temporada ou disponibilidade.[^rapidfuzz] |
| Metadados/recomendações/trailers | API TMDB via HTTPX | **Preservar e ampliar para vídeos.** Conector pequeno sobre endpoints usados; nenhum wrapper adicional é obrigatório.[^tmdb-movie-videos][^tmdb-tv-videos] |
| Transcrição e assistente | SDK oficial Python `openai` | **Preservar no backend.** Transcrição e chamadas controladas; não adotar framework de agentes como pré-requisito.[^openai-sdk][^openai-audio] |
| Microfone do celular | `getUserMedia` + `MediaRecorder` | **Recomendada.** Interface web móvel com pressionar para falar, HTTPS e permissão. Não é necessário Android nativo no primeiro fluxo.[^gum][^recorder] |
| Trailer hospedado no YouTube | YouTube IFrame Player API | **Condicional à prova na Q60D.** Usar player oficial por `TrailerService`, não extrair o vídeo para AVPlay.[^youtube-api][^youtube-policy] |
| Python: testes/qualidade | `pytest` + `ruff` | **Recomendada como ferramentas de desenvolvimento.** Regras de domínio, importação, contratos e estilo.[^pytest][^ruff] |
| Frontend: testes | Vitest + Playwright | **Recomendada no computador/CI.** Testes unitários e de navegador, mais testes obrigatórios na TV real.[^vitest][^playwright] |
| SDD | Especificações versionadas; GitHub Spec Kit opcional | **Recomendado o processo; ferramenta opcional.** Não supor que SDD significa que Spec Kit já está instalado.[^speckit] |
| Execução de jobs | Worker Python separado; biblioteca de fila ainda pendente | **Preservar requisito de isolamento e recuperação.** Celery continua candidato, não dependência obrigatória desta revisão.[^celery] |

Não instalar a matriz inteira em um único passo. Pacotes condicionais só entram após seus testes; bibliotecas de desenvolvimento não devem inflar desnecessariamente o pacote Tizen.

## 4. Fronteiras e cuidados específicos

### 4.1 Foco e virtualização

Usar identificador estável e índice lógico por cartão. Para um destino ainda não montado: resolver o próximo índice, deslocar a grade, aguardar a montagem e aplicar foco. Não depender apenas de o algoritmo geométrico encontrar um elemento inexistente no DOM.

Testar bordas, repetição de tecla, diálogos, categorias vazias, alteração de filtros e remoção do item focado. Voltar de detalhes, player ou trailer deve restaurar foco/posição. Capas carregadas depois não devem alterar imprevisivelmente as dimensões do grid. Manter tamanho reservado para imagens e um overscan pequeno, ajustado por medição.

Não executar consultas externas por movimento de foco, nem reproduzir mídia automaticamente ao focar. Norigin não é um kit visual; Virtual não é o gerenciador do controle. Os componentes de TV serão próprios sobre essas duas peças.

**Atualização (ADR-007):** o "como o foco se parece" desses componentes próprios deixou de ser decisão de cada tela — a receita única de foco, a paleta, a escala tipográfica e os estados obrigatórios por superfície estão na ADR-007, implementados como tokens CSS. Esta seção continua valendo para o **comportamento** (índice lógico, ordem de montagem, bordas, restauração); a ADR-007 cobre a **aparência**. Ver ADR-007 para o raciocínio completo.

### 4.2 Catálogo, preferências e estado remoto

IndexedDB/Dexie será a base local de catálogo e preferências; estados de foco, diálogo e filtros serão transitórios. TanStack Query terá chaves com escopo de instalação/fonte quando apropriado, descarte definido e invalidação após atualização. Não será considerado armazenamento offline durável.

Um coordenador de sincronização gravará snapshots/lotes coerentes. Preferências não pertencerão ao snapshot substituível do catálogo. A tela lerá do repositório local; resultados remotos recebidos não competirão com uma segunda cópia integral em memória.

Preservar fila local de operações pendentes, limites de cache, migrações, cobertura parcial e tratamento de quota. Dexie não define a resolução de conflitos do CCPlay nem protege segredos como um cofre. Somente bytes de imagem efetivamente guardados poderão ser exibidos sem a origem. Trailer remoto não faz parte do cache de vídeo.

### 4.3 Importação e exemplos recebidos

Os parâmetros recebidos mostram **a solicitação** de catálogo `type=m3u_plus`, uma com `output=ts` e outra com `output=m3u8`. Isso não comprova o conteúdo retornado, codecs, quantidades ou que as duas origens sejam equivalentes. O formato do endpoint sugere uma integração compatível com Xtream, mas não confirma `player_api.php`, validade da conta ou acesso a todos os tipos.[^xtream]

Manter conectores `M3USourceConnector` e `ProviderSourceConnector` separados, com saída normalizada comum. Preferir IDs/categorias/hierarquia do provedor quando disponíveis. Não converter uma API estruturada para M3U apenas para reutilizar um parser. Preservar seleção de arquivo na TV como requisito, independentemente da prioridade inicial por URL/provedor.

Obter a lista pelo conector HTTPX com streaming, limite de bytes, tempo, redirecionamentos e política anti-SSRF. Só então entregar dados autorizados ao parser; não usar seu downloader como atalho que ignore a política. Streaming no download não prova que o parser trabalhe com memória limitada.

`m3u-ipytv` documenta suporte a `#EXTM3U`, `#EXTINF` e URLs, preservando outras linhas como extras.[^ipytv] Testar BOM, codificação, vírgulas/aspas nos nomes, grupos, logos, atributos extras e entradas inválidas. Parsing não inclui classificação confiável de filme/série, correspondência TMDB ou reconciliação de favoritos.

A biblioteca Python `m3u8` é um parser de HLS, não substituto automático do importador IPTV.[^m3u8] Detectar manifesto HLS para não importar segmentos como itens; não rejeitar um catálogo apenas porque suas URLs de reprodução terminam em `.m3u8`.

Se o candidato perder dados ou exceder limites medidos, substituí-lo por parser incremental próprio, atrás da mesma interface. Registrar a evidência da troca em vez de atribuir desempenho ruim ao Python como linguagem.

### 4.4 Persistência, worker e migração computador → VPS

**Preferir SQLAlchemy 2 + Alembic + Psycopg 3 a acrescentar SQLModel neste projeto.** Justificativa de projeto: experiência sênior em dados/Python e domínio com obras, fontes, opções, snapshots e preferências separadas. SQLModel é uma alternativa válida construída sobre SQLAlchemy/Pydantic, mas não oferece aqui um benefício demonstrado que compense outra camada.[^sqlmodel]

Usar sessões/transações curtas e isoladas por requisição ou trabalho; não compartilhar `AsyncSession` entre tarefas concorrentes.[^sqlalchemy] Gravações em lotes e caminhos Core/bulk devem ser avaliados antes de materializar objetos ORM para uma lista inteira. Não consultar TMDB ou OpenAI mantendo uma transação aberta.

Psycopg tem interfaces síncrona/assíncrona. Escolher uma por fluxo e testá-la com Uvicorn; não tratar `async` como correção para CPU intensiva. Para setup local, o extra `binary` é uma opção de instalação documentada, condicionado ao sistema e Python reais; não obriga instalar `psycopg_pool` junto ao pool do SQLAlchemy.[^psycopg]

O desenho de implantação será um monólito modular, com processo de API e processo de importação isolados. Estado consultável dos jobs, repetição segura e checkpoints precisam de persistência. Não vender `BackgroundTasks` ou memória do processo como fila durável. Framework/broker continuam pendentes; antes do piloto que dependa de recuperação, escolher e testar essa execução.

Celery não tem suporte oficial a Windows desde a linha 4; isso importa porque o sistema local não foi informado.[^celery] Linux/WSL2/container só serão acrescentados conscientemente, não presumidos já configurados. Docker permanece opcional e não bloqueia o setup `uv` existente.

Configurações externas, URLs de API configuráveis, contratos versionados e migrações permitem preparar a transferência para VPS sem reescrever as telas. A migração não será apenas trocar um IP: exige TLS, autorização, backup/restore, persistência de chaves, reconexão e confirmação de que as fontes permitem aquisição a partir da VPS. Verificar restrições de IP/rede do provedor; não prometer que toda origem doméstica será acessível na nuvem.

### 4.5 Metadados, IMDb e recomendações

Manter `MetadataProvider`, `RatingProvider`, `RecommendationService` e `TrailerProvider` separados. TMDB fornecerá candidatos de metadados e vídeos; RapidFuzz ajudará na comparação após limitar por tipo/ano/evidências. Correspondências incertas não serão aplicadas como certezas.

Recomendar com base em “Gostei” e cruzar com o catálogo, sem associar trailers ou metadados a uma opção de mídia fictícia. Nenhuma dessas consultas entra no caminho do controle local.

IMDb continua requisito de nota real e procedência. A biblioteca de HTTP ou similaridade não fornece a licença da base; o fornecedor autorizado permanece pendente. Não usar scraping como decisão implícita, nem renomear avaliação TMDB para IMDb.[^imdb]

### 4.6 Contratos, testes e desenvolvimento assistido por IA

Usar o OpenAPI do FastAPI para gerar o cliente TypeScript com Hey API, reduzindo duplicação manual de contratos.[^fastapi-client] Gerar apenas recursos necessários; validar serialização, autorização, erros e APIs de navegador no runtime-alvo. OpenAPI não gera automaticamente o protocolo WebSocket.

O fluxo SDD proposto será **requisito → especificação → contrato/plano → tarefas → implementação → testes → evidência de aceite**. Registrar invariantes nas instruções do repositório: sem conta obrigatória, segredos fora dos clientes, categorias preservadas, IA sem inventar fontes, comandos locais independentes e trailers sem alterar histórico de filmes/episódios.

GitHub Spec Kit é opcional para organizar especificações/tarefas; não é SDK de runtime nem decisão de trocar o assistente de código atual.[^speckit] Não executar inicializadores de agentes, instalar skills externas ou reescrever instruções do projeto sem revisar os arquivos existentes. A experiência declarada com SDD não comprova ferramenta específica instalada.

pytest/Ruff e Vitest/Playwright serão a base recomendada de testes/qualidade.[^pytest][^ruff][^vitest][^playwright] Simulações de AVPlay no computador são úteis, mas não contam como teste na TV. Testes de mídia, foco e integração de trailers precisam do aparelho real. A IA não deve converter resultados esperados em testes supostamente executados.

### 4.7 Voz inicial pelo celular

Adotar uma página web móvel pareada com autorização explícita na TV. Usar `getUserMedia({audio: true})`, `MediaRecorder` e pressionar para falar. A primeira versão não exige instalar PWA nem desenvolver aplicativo Android nativo.

**A página precisa de contexto seguro e permissão do usuário.** Acessar um IP privado do computador por HTTP no celular não equivale à exceção de `localhost` no próprio aparelho. Planejar HTTPS com certificado confiável no celular e rotas de API/áudio seguras; não desativar proteções do navegador.[^gum]

Selecionar MIME/container suportado com `MediaRecorder.isTypeSupported()` e validar o arquivo aceito pelo backend/API de transcrição; não apenas renomear a extensão.[^recorder][^openai-audio] Definir limite curto de duração/tamanho, ação cancelar, descarte local e encerramento das trilhas de microfone. Não gravar continuamente ou reter áudio bruto por padrão no CCPlay; políticas do fornecedor da API continuam aplicáveis.

Fluxo proposto: celular autorizado → áudio → FastAPI → transcrição OpenAI → interpretação validada → comando com ID/expiração → TV → confirmação do estado real. Emissão de comando não equivale a execução. Pedidos ambíguos exibem opções; comandos atrasados após reconexão devem expirar. Chaves da API permanecem no backend. Identidade técnica não introduz conta CCPlay obrigatória.

VoiceInteraction Samsung e áudio bruto do controle deixam de ser bloqueadores deste piloto; continuam possibilidades futuras a validar, não recursos comprovados.

### 4.8 Trailers de fácil acesso para filmes e séries

Registrar o [RF-019 e sua especificação](ESPECIFICACAO-TRAILERS.md). O requisito é confirmado; a seleção de provedor/player e os critérios detalhados abaixo são a solução proposta.

Mostrar uma ação **“Trailer”** na primeira área de ações da tela de detalhes, próxima de assistir/favoritar, acessível por setas/OK sem abrir configurações ou pesquisar manualmente fora do app. Sem trailer conhecido, mostrar estado claro. Não iniciar trailer ao apenas focar um cartão.

Consultar vídeos dos endpoints TMDB de filme e série depois de associar corretamente a obra.[^tmdb-movie-videos][^tmdb-tv-videos] Preferir referências de tipo Trailer, oficiais quando esse atributo estiver disponível, em português; oferecer outro idioma identificado quando necessário. Teaser não será rotulado silenciosamente como trailer. Dados da lista podem complementar a busca se houver referência validada; nunca inventar trailer ausente.

Persistir referência normalizada com origem/ID externo, tipo, idioma, título e data de atualização, não uma promessa de MP4 para todo trailer. `site` e `key` de um vídeo do YouTube indicam como localizá-lo no serviço, não uma URL de mídia autorizada para AVPlay.

Criar **`TrailerService` separado de `PlayerService`**. Para YouTube, usar o IFrame Player oficial se funcionar e cumprir as condições no pacote Tizen. AVPlay só será adaptador para trailer com mídia direta fornecida com autorização adequada. Não adotar extração de streams, download/cache de vídeo YouTube ou player não autorizado.[^youtube-api][^youtube-policy]

A prova técnica de YouTube deve verificar origem/identificação do cliente, HTTP Referer ou identificação equivalente exigida, CSP, navegação/Voltar, tamanho/controles do player e ausência de bloqueios de reprodução.[^youtube-identity] Se a origem do widget for insuficiente, avaliar página HTTPS do player sob domínio do CCPlay, com `postMessage` validado por origem e esquema. Isso é alternativa de integração a testar, não garantia de funcionamento nem licença para falsificar identidade ou burlar restrições.

Tratar vídeo removido/privado, embedding desabilitado, indisponibilidade regional, autoplay bloqueado e erro de identificação. A API documenta, entre outros, erros 100, 101/150 e 153.[^youtube-api] Ao falhar, oferecer outro trailer autorizado ou link/QR para o celular. **O fallback no celular não prova que trailers funcionam dentro da TV**; o aceite completo na Q60D exige o teste do caminho escolhido.

Ao abrir trailer, coordenar o recurso de mídia para evitar áudio duplicado com AVPlay. Ao sair, restaurar foco e estado de reprodução anterior quando apropriado. **Ver um trailer não registra a obra como assistida, não altera progresso de episódio e não marca “Gostei”.** Consultas de trailer não bloqueiam catálogo básico nem reprodução principal. Ver todos os critérios na especificação complementar.

## 5. Estratégia de adoção proposta

**Incremento A — fundação na TV.** Registrar ambiente real; grade com Norigin + Virtual; persistência Dexie; abrir/fechar detalhes/player e restaurar foco. Introduzir Query apenas nas chamadas remotas necessárias. Metas anteriores de resposta visual abaixo de 100 ms e navegação próxima de 60 fps permanecem metas a medir, não garantias da combinação.

**Incremento B — fonte até reprodução.** SQLAlchemy/Alembic/Psycopg, HTTPX e importação com estados reais. Comparar parser com amostra autorizada obtida localmente; testar um canal, filme e episódio compatíveis sem anexar URLs secretas aos relatórios. Implementar preferências separadas e idempotência antes de grandes reimportações.

**Incremento C — catálogo enriquecido e trailers.** Correspondência TMDB/RapidFuzz; botão Trailer; prova de player oficial; erros e retorno. Usar referência de trailer autorizada e conhecida para isolar a prova do player da incerteza do catálogo. Definir fonte IMDb em sua própria integração, sem bloquear os demais recursos.

**Incremento D — controle/voz móvel.** Pareamento, HTTPS, captura curta, transcrição, comandos e confirmação. Android nativo fica para evolução; não substituir a seleção de arquivo na TV por obrigação de usar celular.

**Incremento E — VPS e preparação comercial.** Ensaiar migração de banco/chaves, autorização por instalação, worker recuperável, reconexão e limites de consumo; revisar licenças/termos das versões realmente empacotadas. Não publicar backend sem proteção apenas porque a interface dispensa login de pessoa.

**Atualização (ADR-008, 2026-09-19):** este incremento deixa de ser o
caminho padrão de preparação comercial — a decisão agora é client-first,
sem backend sempre-ligado como pré-requisito de uso (pessoal ou
comercial). O que resta deste incremento vira contorno opcional (fallback
para provedor sem CORS) ou infraestrutura mínima só quando voz/OpenAI for
de fato construída. Ver ADR-008.

Preservar o setup existente. As versões exatas serão resolvidas e fixadas em `package.json`/lockfile e `pyproject.toml`/`uv.lock` após verificar compatibilidade. Não usar “latest” como contrato de build permanente. `uv sync --locked` depende de lockfile coerente e pode remover pacotes não declarados na sincronização exata.[^uv]

Nenhum comando de instalação foi executado no repositório do usuário nesta revisão. Não é necessário reiniciar `uv init`, recriar `main.py` ou trocar a versão de Python apenas para adotar o documento.

## 6. Entrevista arquitetural consolidada

| ID | Resposta recebida | Encaminhamento / pendência real |
| --- | --- | --- |
| E1 | Samsung **QN50Q60DAGXZD**. | Alvo inicial definido. Firmware e expansão para outras gerações não informados; baseline documental e validação separados. |
| E2 | Pessoal agora, comercial no futuro. | Avaliar licenças de código e serviços desde já; distribuição comercial ainda não autorizada/implementada. |
| E3 | Fornecidos dois exemplos de URL, sem quantidade. | Tentativa de leitura falhou por conexão neste ambiente. Volume e simultaneidade continuam desconhecidos; fixtures sintéticas não são contagem real. |
| E4 | Computador primeiro, depois intenção de migrar para VPS. | Recomendada configuração portável local → VPS. Sistema local, Docker e provedor de VPS não foram escolhidos. |
| E5 | Desenvolvedor intermediário; sênior em dados/Python; desenvolvimento assistido por IA com SDD. | SQLAlchemy/Pydantic explícitos, contratos gerados e testes. Equipe, versões instaladas e ferramenta SDD específica não presumidas. |
| E6 | M3U e acesso por usuário, senha e DNS. | Validar os dois conectores; manter arquivo no escopo. Não declarar Xtream confirmado só pelo formato de URL. |
| E7 | Sem restrição de custo por hora. | Soluções comerciais podem ser avaliadas, sem contratação automática. Ainda definir limites operacionais de gasto. |
| E8 | Aceita começar com áudio do celular. | Priorizar web móvel; microfone do controle não bloqueia. Ordem de incrementos é recomendação, não prazo solicitado. |
| E9 | Filmes e séries devem ter trailers de fácil acesso. | Requisito RF-019 confirmado. TMDB + player oficial por TrailerService, com prova de compatibilidade. |

### Proteção das amostras

Não repetir domínios privados, usuário, senha ou links completos em ADRs, fixtures, commits, telemetria ou prompts de agentes. Os exemplos continham credenciais e usavam HTTP; não registrar esses valores em documentação. Recomenda-se trocar/revogar credenciais válidas compartilhadas antes de novos testes.

Usar aliases como Amostra A/B nos relatórios. Falha de conexão daqui não prova que o serviço está offline, que as credenciais são inválidas ou que faltam direitos; apenas impede obter medidas neste ambiente. Não copiar dados de fontes para ferramentas de IA sem sanitização e necessidade explícita.

## 7. Alternativas consideradas

**Implementar foco, virtualização e IndexedDB sem bibliotecas:** não é a primeira escolha por esforço repetitivo. Manter abstrações próprias para substituição se os candidatos falharem.

**Adotar kit visual de desktop como solução de TV:** não presumir que formulários/menus prontos resolvam controle direcional. Preferir componentes de TV próprios com foco explícito.

**SDK comercial completo de player/TV:** não escolhido agora; não há requisito validado que justifique substituir AVPlay. Orçamento aberto permite reavaliar suporte, DRM, métricas ou múltiplas plataformas quando houver demanda concreta.

**SQLModel:** válido, mas não recomendado como camada adicional no desenho atual, pelos motivos da seção 4.4. Não se afirma inferioridade de desempenho.

**Parser próprio desde o início:** alternativa de fallback ao candidato M3U, não trabalho obrigatório antes de testar amostras. **Parser HLS como importador IPTV:** rejeitado por diferença de finalidade.

**Redis/Celery ou vários microsserviços obrigatórios já:** adiar seleção de infraestrutura, não os requisitos de isolamento e recuperação dos jobs. Não fingir que BackgroundTasks satisfaz durabilidade.

**Framework de agentes, banco vetorial ou modelo local de voz obrigatório:** não necessários ao primeiro fluxo de transcrição/consulta validada. Considerar só com evidência de benefício.

**Android nativo e microfone Samsung antes do primeiro comando de voz:** não necessários para o caminho aceito de celular.

**Usar AVPlay para qualquer URL YouTube ou extrair MP4:** não adotado. A integração seguirá os players e condições permitidos pelo serviço.

**Trocar a stack ou refazer setup uv:** fora do escopo. Esta ADR complementa, não reinicia o projeto.

## 8. Consequências e critérios de aceite

O benefício esperado é concentrar código próprio em regras de domínio, integração com TV e experiência do usuário, reutilizando foco, armazenamento, contratos e acesso a dados. Custos: manutenção de dependências, coordenação foco/virtualização, sincronização, testes físicos, TLS no celular e integração de trailers com serviços externos.

### Licenças e preparação comercial

Norigin, Hey API e `m3u-ipytv` declaram licença MIT nos repositórios consultados.[^norigin][^hey][^ipytv] Isso não é auditoria de versões/transitivos. Psycopg declara LGPL-3.0 no repositório, não MIT; revisar obrigações pertinentes ao modo de uso/distribuição, sem supor proibição automática de produto comercial.[^psycopg-license]

TMDB diferencia uso não comercial e comercial e exige sua atribuição.[^tmdb-faq] IMDb mantém suas próprias condições de dados.[^imdb] YouTube tem condições de player, identidade, dados e conteúdo.[^youtube-policy][^youtube-identity] Um SDK não concede direitos de distribuição de filmes, trailers ou dados. Registrar componentes e textos de licença do pacote efetivo antes da distribuição; nenhuma compra, concessão de licença ou auditoria completa está incluída nesta entrega.

### Portas de validação

| ID | Evidência exigida | Estado nesta revisão |
| --- | --- | --- |
| V1 | Modelo, firmware, engine observada, APIs necessárias e build de produção instalado na Q60D. | Não executado na TV. |
| V2 | Foco/retorno/virtualização com fixtures crescentes; memória/DOM/latência registrados. | Não executado. |
| V3 | Abrir com cache/backend desligado; quota, atualização interrompida, preferências preservadas. | Não executado. |
| V4 | Amostra M3U real utilizável, preservação de atributos e benchmark do parser; conector de provedor validado. | Leitura remota falhou; parser/provedor não testados. |
| V5 | Migrações, sessão por fluxo, isolamento da instalação, repetição e recuperação de importação. | Não executado. |
| V6 | Trailer de filme e série, botão acessível, Voltar, falhas de embedding e histórico intacto. | Não executado; ver RF-019. |
| V7 | Áudio móvel por HTTPS, permissão/MIME, transcrição e comando reconhecido pela TV com expiração. | Não executado. |
| V8 | Contratos gerados reproduzíveis, testes, lockfiles, licenças/transitivos e políticas de consumo. | Manifests e código não inspecionados. |
| V9 | Migração local→VPS, restore, acesso às fontes, TLS, pareamento e reconexão. | Não executado. |

**Atualização (ADR-006, 2026-09-17): V1 executada na TV, com evidência
parcial.** A feature `003-live-tv-avplay` levou um build de produção à
Samsung **QN50Q60DAGXZD** — pacote assinado com a cadeia Samsung completa
(author por `Samsung VD Author CA`, distribuidor por `VD DEVELOPER Public CA
Class`), instalado por `sdb` e lançado por `tizen run`. Resultado: **um canal
da fonte real reproduziu com vídeo e áudio**, e a Home consumiu o catálogo do
backend pela LAN (confirmado no log da API por requisição vinda do IP da TV).
As APIs necessárias estão presentes e funcionais: `webapis.avplay` com
`open`, `setListener`, `setDisplayRect`, `prepareAsync`, `play`, `stop` e
`close`.

Duas exigências desta porta **continuam sem registro**, por limitação do
aparelho e não por omissão: **firmware** e **engine observada**
(`navigator.userAgent`). A TV não expõe console ao desenvolvedor —
`sdb root on` responde `Permission denied`, `dlog` retorna vazio e a porta
7011 do Web Inspector fica fechada. Enquanto não houver um caminho de leitura,
qualquer afirmação sobre a versão exata do Chromium do aparelho seria
suposição; o build continua fixado em `chrome108` por decisão de projeto
(`tv-web/vite.config.ts`), não por medição.

A execução também revelou dois comportamentos de plataforma que nenhum teste
automatizado ou navegador pegaria, ambos corrigidos e verificados em
hardware: a tecla RETURN do controle chega como `keyCode` 10009, e o AVPlay
pinta num plano de hardware atrás da camada web, exigindo que a área
correspondente seja transparente. Ver `sdd/bugs/tecla-voltar-return-nao-funciona-na`
e `sdd/bugs/live-tv-toca-audio-sem-imagem`.

A aprovação arquitetural pode preceder implementação, mas não substitui essas
evidências para alegar compatibilidade. Pendências que não impedem escrever as primeiras especificações: firmware, volume, simultaneidade, sistema local/Docker, versões dos pacotes, fila e fonte IMDb. Reavaliar a seleção se a prova na TV ou a inspeção de licenças apontar incompatibilidade.

## 9. Referências técnicas

Fontes públicas primárias consultadas em 2026-09-13. Capacidades externas são fundamentadas abaixo; escolhas de integração e metas são propostas de engenharia. Requisitos e respostas provêm da conversa. A documentação v2 foi preservada como base, com atualizações explícitas de contexto.

[^samsung-model]: Samsung Brasil — modelo QN50Q60DAGXZD. `https://www.samsung.com/br/tvs/qled-tv/q60d-50-inch-qled-4k-tizen-os-smart-tv-qn50q60dagxzd/`
[^samsung-year]: Samsung — família Q60D 50, modelo regional identificado como 2024; não substitui a ficha brasileira. `https://www.samsung.com/latin_en/tvs/qled-tv/q60d-50-inch-qled-4k-tizen-os-smart-tv-qn50q60dapxpa/`
[^samsung-engine]: Samsung Developer — Web Engine Specifications. `https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html`
[^samsung-general]: Samsung Developer — General Specifications, OS Upgrade. `https://developer.samsung.com/smarttv/develop/specifications/general-specifications.html`
[^productinfo]: Samsung Developer — ProductInfo API. `https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/productinfo-api.html`
[^vite-build]: Vite — Build Options. `https://vite.dev/config/build-options`
[^avplay]: Samsung Developer — Playback Using AVPlay. `https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-avplay.html`
[^usb]: Samsung Developer — Handling USB Storages. `https://developer.samsung.com/smarttv/develop/guides/data-handling/handling-usb-storages.html`
[^norigin]: Norigin — Spatial Navigation, suporte Tizen e licença. `https://github.com/NoriginMedia/Norigin-Spatial-Navigation`
[^virtual]: TanStack — Virtual Introduction. `https://tanstack.com/virtual/latest/docs/introduction`
[^dexie]: Dexie — Get started with Dexie in React. `https://dexie.org/docs/Tutorial/React`
[^query]: TanStack — Query Installation e compatibilidade. `https://tanstack.com/query/latest/docs/framework/react/installation`
[^hey]: Hey API — repositório, gerador e licença. `https://github.com/hey-api/hey-api`
[^fastapi-client]: FastAPI — Generating SDKs. `https://fastapi.tiangolo.com/advanced/generate-clients/`
[^sqlalchemy]: SQLAlchemy — Asynchronous I/O. `https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html`
[^alembic]: Alembic — documentação. `https://alembic.sqlalchemy.org/en/latest/`
[^psycopg]: Psycopg — Installation e variantes. `https://www.psycopg.org/psycopg3/docs/basic/install.html`
[^psycopg-license]: Psycopg — repositório e licença. `https://github.com/psycopg/psycopg`
[^sqlmodel]: SQLModel — relação com SQLAlchemy e Pydantic. `https://github.com/fastapi/sqlmodel`
[^httpx]: HTTPX — Async Support, streaming e ciclo de vida. `https://www.python-httpx.org/async/`
[^ipytv]: ipytv — M3U Plus, tags, limitações e licença. `https://github.com/Beer4Ever83/ipytv`
[^m3u8]: Globo — parser Python de HLS. `https://github.com/globocom/m3u8`
[^xtream]: BUI — documentação da sua implementação XtreamCodes; não é padrão universal nem prova de compatibilidade da fonte enviada. `https://github.com/bluchip-studio-official/BUI/blob/main/docs/en/api/xtreamcodes_api.md`
[^rapidfuzz]: RapidFuzz — documentação. `https://rapidfuzz.github.io/RapidFuzz/`
[^tmdb-movie-videos]: TMDB — Movie Videos. `https://developer.themoviedb.org/reference/movie-videos`
[^tmdb-tv-videos]: TMDB — TV Series Videos. `https://developer.themoviedb.org/reference/tv-series-videos`
[^tmdb-faq]: TMDB — FAQ e uso comercial/atribuição. `https://developer.themoviedb.org/docs/faq`
[^imdb]: IMDb — Can I use IMDb data in my software? `https://help.imdb.com/article/imdb/general-information/can-i-use-imdb-data-in-my-software/G5JTRESSHJBBHTGX`
[^openai-sdk]: OpenAI — SDKs and CLI. `https://developers.openai.com/api/docs/libraries`
[^openai-audio]: OpenAI — File transcription. `https://developers.openai.com/api/docs/guides/speech-to-text`
[^gum]: MDN — MediaDevices.getUserMedia, contexto seguro/permissão. `https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia`
[^recorder]: MDN — MediaRecorder.isTypeSupported. `https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static`
[^youtube-api]: Google — YouTube IFrame Player API, eventos/erros. `https://developers.google.com/youtube/iframe_api_reference`
[^youtube-identity]: Google — Required Minimum Functionality, API Client Identity. `https://developers.google.com/youtube/terms/required-minimum-functionality`
[^youtube-policy]: Google — YouTube API Services Developer Policies. `https://developers.google.com/youtube/terms/developer-policies`
[^pytest]: pytest — documentação. `https://docs.pytest.org/en/stable/`
[^ruff]: Astral — Ruff. `https://docs.astral.sh/ruff/`
[^vitest]: Vitest — Getting Started. `https://vitest.dev/guide/`
[^playwright]: Playwright — Browsers. `https://playwright.dev/docs/browsers`
[^speckit]: GitHub — Spec Kit. `https://github.com/github/spec-kit`
[^celery]: Celery — FAQ, suporte a Windows. `https://docs.celeryq.dev/en/stable/faq.html`
[^uv]: Astral — Locking and syncing. `https://docs.astral.sh/uv/concepts/projects/sync/`
