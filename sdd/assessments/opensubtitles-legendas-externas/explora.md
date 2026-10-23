# Assessment Explora: OpenSubtitles para legendas externas

- **Slug**: opensubtitles-legendas-externas
- **Criado**: 2026-10-21
- **Origem**: pedido explícito do usuário via sdd-assess, após comparação com xstream-player; autorização de teste usando somente OPEN_SUBTITLES_API_KEY do .env.
- **Fase concluída**: Explora. Define depende das respostas de produto enviadas na conversa.

## Ideia Bruta

Avaliar se obter legendas externas pelo OpenSubtitles resolve uma necessidade dos usuários e constitui um diferencial útil para filmes e episódios do ccplayTv. O usuário criou a chave para permitir uma avaliação com API real. A existência da chave não aprova implementação, contratação, implantação ou uso da TV.

## Evidência a Favor

1. **A API funciona com a chave fornecida.** No PC, em 21/10/2026, busca em pt-BR para o filme público IMDb 133093 retornou HTTP 200 e 35 resultados; busca de episódio (TMDB da série 1396, temporada 1/episódio 1) retornou HTTP 200 e 14 resultados. Não foram enviados dados da lista IPTV.
2. **Download real concluído.** Uma única chamada POST /download retornou HTTP 200 e remaining=99. O arquivo também respondeu HTTP 200, com 85.662 bytes e timestamps de legenda. Conteúdo e URL temporária não foram gravados. Essa amostra não comprova alinhamento ao vídeo nem cobertura do catálogo real.
3. **Acesso de navegador é plausível.** Respostas da API declararam Access-Control-Allow-Origin: *. Um OPTIONS simulando Origin: null foi aceito. Isso é evidência HTTP no PC, não execução de fetch no navegador Tizen; autenticação, headers e redirects ainda precisam de prova no aparelho.
4. **Há suporte nativo documentado.** A Samsung oferece setExternalSubtitlePath com caminho absoluto local; arquivo remoto precisa ser baixado antes. É uma rota candidata para prova de viabilidade, não confirmação no modelo da TV. [Referência Samsung](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplay-api.html).
5. **Já existe base no produto.** PlayerService entrega eventos de legenda; SubtitleOverlay já desenha texto, lida com pausa e protege contra HTML. A extensão pode reaproveitar contratos, sem substituir Direct Play. Ver [PlayerService](../../../tv-web/src/lib/player/PlayerService.ts#L227), [overlay](../../../tv-web/src/components/SubtitleOverlay.tsx#L19) e [trilhas](../../../tv-web/src/lib/player/tracks.ts#L35).
6. **O serviço segue mantido.** O blog oficial publicou instruções da API em 15/10/2026. Fluxo básico: buscar, selecionar file_id, solicitar link temporário e obter o arquivo; autenticação de usuário é distinta da chave do aplicativo. [Tutorial oficial](https://blog.opensubtitles.com/opensubtitles/how-to-build-a-movie-subtitle-finder-cli-with-python-and-the-opensubtitles-api).
7. **Sinal de interesse explícito.** O usuário quer explorar o diferencial e forneceu meios para testá-lo. ASSUMPTION: esse interesse representa demanda suficiente entre usuários; ainda não há amostra, frequência ou proporção de títulos afetados.

### Evidência operacional preservada

| Caso | Resultado final | Limite da conclusão |
| --- | --- | --- |
| Chave presente | Sim, sem impressão de valor | Não identifica plano nem condições comerciais |
| Buscar filme pt-BR | 200; 35 resultados | Um filme conhecido |
| Buscar episódio pt-BR | 200; 14 resultados | Um episódio conhecido |
| Preflight Origin null | 200; origem e headers permitidos | Simulação HTTP, não teste no navegador da TV |
| Solicitar uma legenda | 200; remaining 99 | Cota observada só naquela resposta |
| Obter o arquivo | 200; 85.662 bytes; timestamps presentes | Não confirma sincronismo, tradução, integridade completa ou codec |
| Executar no AVPlay | Não executado | Precisa de prova física autorizada |
| Alinhar legenda ao stream do provedor | Não executado | Principal risco da experiência final |

Evidência final: [api-real-pc-download.json](./evidencias/api-real-pc-download.json).

O primeiro teste de download não solicitou arquivo porque o teste comparava pt-br com pt-BR de modo sensível a caixa. A inspeção do esquema confirmou o código pt-BR; a comparação foi corrigida no script de evidência. Preservados [primeira tentativa](./evidencias/api-real-pc.json) e [inspeção do esquema](./evidencias/api-schema-pc.json). Ao todo, os três processos autorizados fizeram seis buscas, três preflights, uma solicitação de download e uma obtenção do arquivo. Não houve login de usuário nem download em lote.

A tentativa inicial no ambiente restrito falhou com EACCES antes de alcançar o serviço. A execução autorizada fora dessa restrição concluiu os testes. Não foi falha da API nem da chave.

## Evidência Contra

1. **Demanda e frequência ainda não demonstradas.** Interesse em um diferencial não estabelece que faltam legendas no uso real nem o tamanho do público afetado. Não atribuir conversão/retenção ou vantagem exclusiva sem pesquisa.
2. **Correspondência por obra não assegura sincronismo.** Versões diferentes do mesmo filme/episódio podem exigir outro arquivo ou ajuste de tempo. Sem ler o vídeo do provedor, não temos o moviehash do arquivo; começar a baixar trechos do stream apenas para isso não faz parte da proposta.
3. **Chave de aplicativo compartilhada não pode ir para o cliente.** A constitution proíbe embuti-la no pacote ou variável pública. Estar no .env do PC não a torna disponível com segurança na TV. Não criar VITE_OPEN_SUBTITLES_API_KEY. Ver [constitution](../../../.planning/memory/constitution.md#L264).
4. **Exigir uma API key de cada pessoa não é a abordagem indicada pelo serviço.** Em setembro de 2026, o administrador orientou que aplicativos tenham sua própria chave e rejeitou pedir chave a cada usuário. Não confundir a chave da aplicação com conta/token pessoal para cota. [Orientação da equipe](https://forum.opensubtitles.com/t/apikey-for-player-video/7998).
5. **Proteger a chave implica avaliar serviço opcional.** A ADR-008 admite complemento para uma barreira real como chave compartilhada, sem torná-lo necessário ao uso principal. Reutilizar o portal para pesquisar/baixar legendas amplia sua finalidade atual e precisa de decisão explícita; a existência do portal não autoriza a extensão automaticamente. [ADR-008](../../../sdd/adr/ADR-008-arquitetura-client-first-backend-so-quando.md#L60), [ADR-013](../../../sdd/adr/ADR-013-portal-controle-serverless-google-cloud.md#L19).
6. **Custo e limites de produção desconhecidos.** remaining=99 não demonstra uma franquia universal de 100/dia. As páginas oficiais apresentam contas/cotas distintas e planos Pro; preço e cota aplicáveis ao ccplayTv distribuído não foram confirmados. Não foi contratado plano. [Pro packages](https://opensubtitles.tawk.help/article/pro-packages), [guia inicial](https://opensubtitles.tawk.help/article/getting-started). Centralizar chamadas pode concentrar limites por IP/consumer; a divisão exata precisa ser verificada.
7. **Não basta anexar uma URL ao player.** O contrato local de AVPlay ainda não expõe setExternalSubtitlePath. A alternativa de interpretar SRT/VTT no app precisa de agenda de cues baseada no tempo da mídia e suporte a seek/offset negativo; o overlay atual recebe cues no instante de exibição. Nenhuma das opções está pronta.
8. **Armazenamento nativo exige avaliação própria.** O config.xml atual não declara privilégios de filesystem/download. A necessidade e os nomes exatos devem ser conferidos no caminho escolhido; o ledger IndexedDB não conta automaticamente arquivos fora dele. Há risco de cache duplicado e descarte indevido de dados de uso. Ver [configuração](../../../CCPlayTv/config.xml), [orçamento](../../../tv-web/src/lib/catalog/storageBudget.ts) e [ledger](../../../tv-web/src/lib/catalog/storageLedger.ts).
9. **Privacidade e disponibilidade.** A pesquisa revela a obra ao serviço de legendas. Enviar apenas ID da obra/temporada/episódio/idioma ou título mínimo; nunca endereço, credencial ou URL do stream IPTV. Sem rede, o recurso opcional deve falhar sem impedir playback.
10. **Automação precoce pode piorar o produto.** Buscar/baixar ao focar ou em todo play traz consumo, atraso e escolha errada. O comportamento precisa ser definido pelo usuário; não foi assumido.

## Perguntas em Aberto

As perguntas de Define foram apresentadas de forma estruturada, sem assumir a opção recomendada:

1. Priorizar pt-BR quando a legenda é inadequada/ausente, ampliar idiomas/versões ou baixar/aplicar automaticamente?
2. A falta já ocorre com o usuário, foi relatada por outras pessoas ou é hipótese de diferencial?
3. Há apetite por serviço opcional e possível custo, ou a exigência é tudo direto na TV sem custo recorrente?

Também faltam dados externos: custo/condições de distribuição, cota de produção e eficácia de sincronismo em amostra de vídeos reais. A skill não permite transformar essas lacunas em aprovação otimista.

## Cuidados para Retomada

- Nenhum código-fonte, .env, .env.example, backlog ou ADR foi alterado.
- Os scripts desta pasta são somente provas de avaliação. Por padrão não solicitam download; --download-one consome no máximo uma solicitação por execução.
- Não executar os scripts novamente só para reconfirmar sucesso; já há evidência suficiente da API no PC.
- Não afirmar suporte no hardware a partir da documentação ou de CORS no PC.
- Não reutilizar os arquivos de legenda para fixtures. Nenhum texto baixado foi persistido.
- Próximo passo: incorporar as respostas do usuário em problem.md (Define); então preencher scorecard e veredito em decision.md (Decide), sem criar uma spec automaticamente.
