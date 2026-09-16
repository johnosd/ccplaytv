# ADR-004: Acesso sem Conta, Fontes e Importação Acompanhável

## Status

**Proposta técnica — requisitos funcionais confirmados pelo usuário.** O acesso sem login obrigatório e as três entradas de conteúdo são requisitos. Identidade técnica, conectores, transporte de progresso e políticas operacionais abaixo são propostas para atendê-los, ainda não implementadas ou validadas.

Complementa a ADR-001, a ADR-002 e a ADR-003. Os critérios de aceite estão em [REQUISITOS-FUNCIONAIS.md](REQUISITOS-FUNCIONAIS.md).

## Data

2026-09-13. Revisão de escopo v2.

## Contexto

O usuário definiu que deve ser possível abrir o CCPlay na TV sem usuário e senha do aplicativo. Dentro dele, será possível adicionar uma lista por URL, selecionar um arquivo `.m3u` ou informar endereço do provedor, usuário e senha. A pessoa deverá acompanhar o carregamento e a separação dos conteúdos.

A expressão “logar” foi usada para uma opção interna ao aplicativo; o fluxo com credenciais do provedor foi explicitado. Não foi definido um sistema de cadastro próprio do CCPlay. Esta ADR não acrescenta cadastro obrigatório nem considera o login do provedor uma conta CCPlay.

A arquitetura já escolhida atribui o processamento do catálogo ao backend Python/FastAPI. A seleção de arquivo na TV é uma etapa de entrada de dados, não uma mudança para importar e enriquecer todo o catálogo no cliente.

## Decisão proposta

### 1. Entrada na aplicação e identidade da instalação

Abrir diretamente a interface, usando catálogo salvo quando existir. Na primeira abertura, apresentar opções para adicionar conteúdo e configurações, sem bloqueio por login, assinatura de conta ou verificação de e-mail do CCPlay.

Criar um perfil local padrão por instalação para favoritos, histórico e gosto pessoal. Esse perfil representa o uso daquela instalação, não identifica automaticamente cada pessoa da casa. Perfis familiares múltiplos e conta própria são evoluções ainda não definidas.

Ao acessar dados privados no backend, utilizar uma identidade técnica da instalação com credencial verificável e escopo limitado. Um `installation_id` informado em uma requisição não será prova suficiente de autorização. O mecanismo de emissão, retenção, renovação e revogação dessa credencial precisa de implementação e teste; não usará senha IPTV como senha do CCPlay nem número de série público como segredo.

A indisponibilidade ou expiração dessa credencial não bloqueará a abertura da interface nem o acesso ao estado local. Novas operações remotas poderão exigir restabelecer a autorização técnica. Sem conta e sem backup/vínculo explícito, não haverá promessa de recuperar preferências após apagar os dados da instalação.

Qualquer conta CCPlay criada futuramente deverá ser opcional, com adesão explícita e regras de vinculação dos dados locais. Ela não será pré-requisito para importar, assistir ou favoritar nesta TV.

### 2. Modelo de fonte e três entradas

Uma `Source` representará uma origem de conteúdo, e não uma pessoa. Cada fonte pertencerá a um escopo autorizado da instalação/perfil, terá nome de exibição e poderá ser atualizada ou removida sem alterar outras fontes.

| Tipo proposto | Entrada | Aquisição pelo backend |
| --- | --- | --- |
| `m3u_url` | URL da lista e nome de exibição | Obter a lista pela rede após validações e limites. |
| `m3u_file` | Arquivo escolhido pelo usuário | Receber os bytes, validar o conteúdo e importar. |
| `provider_credentials` | Endereço do servidor, usuário e senha | Usar conector compatível com o serviço informado. |

Campos conceituais adicionais: `source_id`, estado de conexão/importação, data da última atualização bem-sucedida e referência privada à configuração. Esses nomes são proposta de contrato, não esquema de banco já migrado.

Para arquivo, um caminho como `removable_.../lista.m3u` não é um caminho acessível ao servidor. A TV deverá ler/transferir o conteúdo autorizado, não enviar apenas esse caminho e esperar que o backend o abra. Seleção, tamanho máximo, codificação e envio em partes precisam ser testados.

Uma fonte por arquivo não será tratada como se tivesse uma URL atualizável: sua atualização poderá exigir nova seleção/envio. Preservar o `source_id` ao substituir seu conteúdo facilita manter preferências; não implica guardar indefinidamente o arquivo bruto.

### 3. Endereço do provedor e autenticação

O campo referido como “DNS” será rotulado **Endereço do servidor (DNS do provedor)**. Representará a URL/base do serviço, com protocolo, domínio/endereço e porta quando necessários. Não modificará o resolvedor DNS ou as configurações de rede da TV.

**Proposta inicial:** um conector compatível com Xtream Codes, sujeito à confirmação do protocolo real. Uma implementação pública desse tipo de serviço documenta autenticação por usuário/senha e consultas separadas de canais, VOD, séries e categorias.[^xtream-implementation] Essa referência é uma implementação de terceiros; não garante compatibilidade universal nem comprova o protocolo do provedor do usuário.

Usar a estrutura entregue pelo conector quando existir, em vez de obrigar todos os serviços a virarem primeiro um arquivo M3U. Preservar os IDs e categorias do provedor. Para outro protocolo, registrar incompatibilidade clara ou implementar outro conector; não testar portas ou caminhos arbitrários para contornar acesso.

Autenticação, expiração e restrições do provedor deverão gerar mensagens específicas. Uma falha nessa fonte não provocará logout global, perda de favoritos ou remoção do catálogo de outras fontes. A compatibilidade será testada com uma fonte autorizada, sem exemplos de credenciais reais nos documentos.

### 4. Seleção de arquivo na TV

A Samsung documenta acesso a armazenamento USB pela Filesystem API e operações de listagem/leitura de arquivos, com privilégios declarados no aplicativo.[^samsung-usb][^samsung-files] A proposta é construir seleção por controle remoto sobre armazenamentos permitidos e validar no modelo/firmware-alvo.

Não se presume que um `<input type="file">` de navegador desktop ofereça a mesma experiência na TV. Verificar descoberta de armazenamento, navegação em diretórios, leitura, remoção de USB durante acesso, permissões e consumo de memória. Solicitar somente os privilégios necessários; escrita no USB não é um requisito do importador.

Uma interface web de envio pelo celular/computador, pareada por autorização explícita na TV, é uma alternativa proposta de conveniência. Não substitui silenciosamente a seleção de arquivo no aparelho: se o fluxo direto não funcionar na TV-alvo, a limitação e a alteração do critério de aceite precisarão ser registradas.

### 5. Importação como trabalho acompanhável

A API receberá a entrada, validará os dados iniciais e criará um `ImportJob` associado à fonte e ao escopo autorizado. A resposta de criação não significará que o catálogo já foi importado. Processamento pesado seguirá a ADR-003.

Etapas propostas: obtenção/envio, leitura, classificação, organização de séries/episódios e publicação do catálogo básico. Enriquecimento de capas, metadados e avaliações será um trabalho complementar, sem impedir o uso do catálogo básico válido.

Estados propostos do job: `queued`, `running`, `completed`, `completed_with_warnings`, `failed` e `cancelled`. Etapa atual será um campo distinto do estado. Sair da tela não será o mesmo que cancelar; um cancelamento solicitado só será confirmado quando o trabalho reconhecer a solicitação.

A tela deverá mostrar etapa, contadores reais, avisos e ações disponíveis. Separar **entradas lidas**, **canais**, **filmes**, **séries únicas**, **episódios**, **itens não classificados** e **itens inválidos**. Esses números têm unidades diferentes; não deverão ser somados como se cada série representasse uma linha da lista.

Só exibir percentual quando o denominador daquela etapa for conhecido. Sem tamanho/total confiável, usar indicador indeterminado com contagem e etapa. Não mostrar “100%” enquanto o catálogo básico ainda não estiver disponível, nem reiniciar o percentual sem explicar a mudança de etapa.

Consulta periódica por HTTP é a estratégia inicial proposta para a tela de progresso. O estado ficará consultável após fechar/reabrir a tela. Notificações por WebSocket/SSE são uma possível otimização, não uma dependência obrigatória desta entrega.

### 6. Publicação, falhas e retomada

Na primeira importação, lotes coerentes poderão ser disponibilizados como **catálogo parcial**, com indicação explícita de processamento e contagem incompleta. Nenhum item parcialmente gravado deverá aparecer como pronto para reprodução.

Numa atualização, conservar a versão anterior utilizável enquanto a nova é preparada. Publicar uma nova versão coerente de forma controlada; falha ou cancelamento não apagará a versão anterior. Se houver prévia da nova versão, ela ficará identificada e separada da ativa.

Atualizações repetidas não deverão duplicar o catálogo. A API aceitará identificação de operação para evitar que repetição de rede crie jobs/fontes em duplicidade; uma nova importação deliberada terá identificação própria. Checkpoints, persistência dos jobs e retomada após reinício do servidor ainda precisam ser implementados. A interface não declarará retomada automática se o trabalho precisar ser reiniciado.

Falhas de itens individuais produzirão avisos sanitizados quando houver conteúdo válido aproveitável. Uma resposta HTML de erro, arquivo vazio, conteúdo incompatível ou autenticação inválida não será apresentada como lista importada com sucesso.

A origem precisa ser acessível ao ambiente que faz a aquisição. Uma lista que só responde na rede da TV pode não ser acessível por um backend hospedado fora dela; diagnosticar esse caso sem prometer que a hospedagem em nuvem resolve qualquer fonte.

### 7. Segurança e limites

Sem login de pessoa não significa API sem autorização. Aplicar isolamento entre instalações a fontes, uploads, jobs, preferências e comandos. Limitar criação de identidades, uploads, importações e consumo de integrações; CORS não será usado como substituto da autorização.

Tratar URLs, senhas do provedor e arquivos brutos como potencialmente secretos. Redigir logs e erros, não enviar esses dados a OpenAI/TMDB/IMDb e não devolvê-los em respostas comuns do catálogo. Configuração sensível retida pelo backend exigirá proteção em repouso e gestão de chave separada; detalhes da infraestrutura continuam abertos. Direct Play poderá exigir fornecer à TV informações de reprodução sensíveis em tempo de execução, sem incorporá-las ao pacote do app.

A entrada de URL exige proteção contra SSRF. A proposta é permitir protocolos necessários, verificar destino após resolução e a cada redirecionamento, limitar tempo/tamanho e bloquear destinos internos/metadata por padrão. Fontes de rede local serão exceções explicitamente configuradas num backend local, não uma liberação geral de endereços privados na hospedagem pública. Essas medidas seguem a orientação OWASP e precisam de testes de implementação.[^owasp-ssrf]

Usar HTTPS nas comunicações sob controle do CCPlay e validar certificados. Se o provedor só oferecer HTTP, apresentar a limitação de proteção do transporte; o aplicativo não poderá prometer sigilo equivalente a HTTPS. Não desativar validação TLS globalmente para aceitar uma fonte.

Remover uma fonte revogará sua configuração retida, cancelará trabalhos aplicáveis e eliminará seus dados/credenciais conforme a política definida, sem afetar outras fontes. A retenção ou exclusão do histórico será apresentada explicitamente ao usuário. Preservar apenas um registro mínimo indisponível de histórico não autoriza manter senha, URL secreta ou arquivo bruto.

## Alternativas consideradas

**Conta obrigatória do CCPlay:** incompatível com o requisito de abrir e usar sem cadastro.

**Reutilizar usuário/senha do provedor como conta do aplicativo:** mistura escopos, dificulta múltiplas fontes e vincula acesso à interface à disponibilidade de um terceiro.

**Processar tudo numa requisição longa e mostrar somente um spinner:** não atende ao acompanhamento do carregamento e dificulta recuperação de falhas.

**Publicar somente depois de completar IMDb, capas e IA:** torna o catálogo dependente de serviços que não são necessários para assistir a uma fonte válida.

## Consequências e validação pendente

A proposta preserva entrada sem conta e permite progresso observável, mas exige identidade técnica, isolamento, importação recuperável e cuidado com segredos. Não representa funcionalidade entregue.

Validar acesso/USB no aparelho, um provedor compatível, limites de arquivos, falhas de importação, concorrência entre fontes, segurança de URL e reabertura do job. Escolher mecanismo de identidade, execução durável e políticas de retenção antes de disponibilizar o serviço a terceiros.

## Referências técnicas

Os requisitos vêm da descrição do usuário; os contratos e políticas acima são propostas do CCPlay. Fontes externas consultadas em 2026-09-13:

[^xtream-implementation]: BUI — documentação de sua implementação XtreamCodes API, referência de implementação, não padrão universal. `https://github.com/bluchip-studio-official/BUI/blob/main/docs/en/api/xtreamcodes_api.md`
[^samsung-usb]: Samsung Developer — Handling USB Storages. `https://developer.samsung.com/smarttv/develop/guides/data-handling/handling-usb-storages.html`
[^samsung-files]: Samsung Developer — Managing File Operations. `https://developer.samsung.com/smarttv/develop/guides/data-handling/managing-file-operations.html`
[^owasp-ssrf]: OWASP — Server Side Request Forgery Prevention Cheat Sheet. `https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html`
