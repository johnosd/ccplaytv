# CCPlay TV — Especificação de Trailers para Filmes e Séries

Data: 2026-09-13. Requisito **RF-019**. Relações: ADR-005 e [ADR-006](ADR-006-bibliotecas-sdks-ccplay-tv.md), seção 4.8.

## Estado e base

**Requisito confirmado:** filmes e séries devem ter trailers de fácil acesso. **Proposta de implementação:** botão nos detalhes, descoberta via TMDB e reprodução por adaptador autorizado, priorizando player oficial para YouTube. Nenhum cenário abaixo foi executado nesta revisão.

Não foi solicitado que todo título tenha um trailer existente, que trailers iniciem automaticamente ou que sejam baixados para uso offline. A aplicação não pode criar disponibilidade onde não há referência adequada.

## História de uso

Como pessoa navegando pelo catálogo na TV, quero acessar o trailer de um filme ou série pela própria tela de detalhes, usando o controle remoto, para decidir se desejo assistir à obra, sem perder o foco de navegação nem alterar meu histórico por engano.

## Experiência proposta

A primeira área de ações dos detalhes conterá “Assistir”/“Episódios”, “Trailer” e ações de preferências. A ordem final dependerá do design, mas “Trailer” não ficará escondido em configurações ou menu secundário. A partir da ação Trailer, um OK iniciará o trailer preferido quando conhecido e compatível; “Mais trailers” será opcional quando houver alternativas.

Não iniciar mídia ao apenas focar cartão ou abrir detalhes. Reservar espaço para um estado textual “Consultando trailers” sem deslocar os botões. Uma consulta de trailer não bloqueará sinopse, favoritos ou reprodução da obra.

Estados funcionais: não consultado, consultando, referência disponível, sem referência adequada, carregando player, reproduzindo e falha de reprodução. “Referência disponível” não deve ser rotulada como garantia de acesso ao vídeo externo.

Idioma e tipo devem ser visíveis: por exemplo, “Trailer · Português” ou “Trailer · Inglês”. Priorizar idioma português e referência oficial quando informado pelo provedor. Teaser será identificado como teaser; não converter making-of ou trecho de episódio em trailer sem sinalização.

## Origem e contratos propostos

O backend associa a obra ao identificador TMDB com a confiança prevista na ADR-005. Consulta vídeos de filme ou série pelos endpoints apropriados; dados de temporadas, se acrescentados, deverão ser rotulados com seu escopo.[^movie][^tv]

Contrato conceitual `TrailerReference`:

| Campo | Significado |
| --- | --- |
| `id`, `catalog_item_id` | Referência interna e obra correta. |
| `provider`, `external_id` | Serviço de reprodução e identificador do vídeo. |
| `metadata_source` | Origem dos metadados, separada de quem hospeda o vídeo. |
| `title`, `kind`, `language` | Nome, Trailer/Teaser/outro e idioma conhecido. |
| `official` | Indicador do provedor quando disponível; desconhecido não equivale a falso. |
| `retrieved_at`, `availability_checked_at` | Obtenção da referência e última verificação, se realizada. |

Campos de URL direta só existirão para fontes explicitamente autorizadas e validadas. Para YouTube, armazenar ID e usar player oficial, sem extrair mídia.[^youtube][^policy] Este quadro não define tabelas migradas nem obriga uma biblioteca adicional.

Proposta de consulta HTTP: `GET /catalog/items/{item_id}/trailers`, autorizada no escopo da instalação. Retornar lista e estado de consulta; não expor credenciais do provedor IPTV. Rotas de descoberta não precisam retornar segredos do TMDB/OpenAI. A implementação final do contrato poderá ser refinada antes da geração do cliente.

## Reprodução e segurança

Usar `TrailerService`, não enviar toda URL de trailer para AVPlay indiscriminadamente. Coordenar pausa/encerramento do player anterior para evitar áudio simultâneo. Controle Voltar deve interromper/fechar o trailer e devolver a pessoa ao mesmo item, filtro e posição. A retomada de mídia anterior dependerá do estado existente e da escolha de UX, sem iniciar uma nova reprodução inesperada.

Para YouTube, validar identificação/origem, Referer ou equivalente, CSP, controles e eventos reais no pacote Tizen. O serviço documenta erros de vídeo privado/removido, embedding não permitido e falta de identificação do cliente.[^youtube][^identity] Página HTTPS intermediária sob controle do CCPlay pode ser avaliada, mas não resolve automaticamente todas as restrições.

Validar `postMessage` por origem, emissor e esquema. Links externos devem ser construídos por provedor conhecido e ID validado, não por HTML arbitrário vindo da lista. Não passar tokens de pareamento, senha de fonte ou tokens de API em links de vídeo externos.

Não ocultar anúncios/branding/controles contrariando políticas do player, baixar trailers YouTube ou simular um cliente aprovado. Oferecer saída clara em bloqueios, sem instruções de bypass.[^policy]

## Critérios de aceite propostos

| ID | Cenário | Resultado esperado |
| --- | --- | --- |
| TR-01 | Filme com referência correta e acessível. | Ação Trailer na primeira área dos detalhes; OK abre o vídeo correspondente no caminho homologado. |
| TR-02 | Série com trailer próprio. | Abre trailer da série correta; não troca por filme homônimo ou episódio aleatório. |
| TR-03 | Nenhuma referência encontrada. | Mostra “Trailer indisponível”; catálogo, favoritos e assistir continuam utilizáveis. |
| TR-04 | Só existe outro idioma ou teaser. | Informa idioma/tipo antes de reproduzir; não promete dublagem ou trailer inexistente. |
| TR-05 | Usuário apenas foca o cartão ou botão. | Não inicia reprodução nem grava histórico da obra. |
| TR-06 | Usuário volta do trailer. | Interrompe áudio/vídeo e restaura foco, categoria, filtro e posição do item. |
| TR-07 | Trailer chega ao fim. | Filme/episódio não é marcado como assistido, curtido ou favorito; progresso principal permanece intacto. |
| TR-08 | AVPlay já estava usando recurso de mídia. | Sem áudio duplicado; transição e retorno seguem a política do aplicativo. |
| TR-09 | API externa demora ou falha. | Timeout e mensagem específica; demais ações da tela não aguardam indefinidamente. |
| TR-10 | YouTube retorna erro 100, 101/150 ou 153. | Falha sanitizada, saída pelo controle e alternativa autorizada; nenhum bypass ou extração de stream. |
| TR-11 | Aplicativo sem internet/backend. | Pode mostrar metadados salvos, mas não promete trailer remoto offline. |
| TR-12 | Retorno do player depois de catálogo atualizado. | Mantém foco na obra quando existente; caso removida, escolhe destino consistente sem erro fatal. |
| TR-13 | Identificação da obra é incerta. | Não associa trailer do primeiro resultado como se fosse correto; mostra ausência/necessidade de identificação. |
| TR-14 | Teste somente no navegador do computador. | Não encerra homologação: repetir controle, mídia e identificação do player na QN50Q60DAGXZD. |

Link/QR para celular é uma **degradação proposta**, não substituição automática da experiência de TV. O aceite completo do caminho de TV exige reprodução real no aparelho. Se nenhum método autorizado funcionar, registrar a limitação e uma decisão explícita de produto sobre o fallback.

## Tarefas sugeridas para SDD

Definir `TrailerReference` e estados; criar testes com respostas fictícias; implementar conector TMDB; criar consulta autorizada; gerar cliente TypeScript; construir botão/estados; provar reprodução de um trailer autorizado na Q60D; implementar retorno e erros; verificar isolamento do histórico; registrar evidências de TR-01 a TR-14.

Não incluir listas reais, credenciais ou vídeos copiados nas fixtures. Conteúdo de teste deve ser sintético ou autorizado, e resultados esperados não serão registrados como testes aprovados.

## Referências

[^movie]: TMDB — Movie Videos. `https://developer.themoviedb.org/reference/movie-videos`
[^tv]: TMDB — TV Series Videos. `https://developer.themoviedb.org/reference/tv-series-videos`
[^youtube]: Google — YouTube IFrame API, eventos e erros. `https://developers.google.com/youtube/iframe_api_reference`
[^identity]: Google — Required Minimum Functionality, identificação. `https://developers.google.com/youtube/terms/required-minimum-functionality`
[^policy]: Google — Developer Policies. `https://developers.google.com/youtube/terms/developer-policies`
