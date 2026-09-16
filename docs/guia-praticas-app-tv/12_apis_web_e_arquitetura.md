# 12. APIs web e arquitetura técnica

**Página pesquisada:** Web API References
**Consulta:** 13 de setembro de 2026
**Link fornecido:** https://developer.samsung.com/smarttv/develop/api-references/web-api-references.html

> Separar catálogo, estado do usuário e reprodução; validar cada recurso nos modelos de TV escolhidos.

## 1. Como interpretar o índice de APIs

O índice oficial reúne Samsung Product APIs, Tizen Web Device APIs, APIs web padronizadas e definições de tipos para desenvolvimento. Entre os recursos listados estão AVPlay, AppCommon e Network, além de TVInputDevice e Filesystem no conjunto Tizen. A página funciona como ponto de entrada para referências específicas, não como uma garantia de disponibilidade universal. [1]

| Camada | Uso proposto no aplicativo |
| --- | --- |
| Samsung / webapis | Reprodução com AVPlay; integração com funções da TV quando necessária. |
| Tizen / tizen | Controle remoto, acesso permitido a arquivos e integração com o dispositivo. |
| Plataforma web | Interface, eventos, organização de dados e comunicação com serviços. |
| Tipos de desenvolvimento | Apoiar o editor e a checagem estática; não substituir testes de execução. |

### AVPlay: contrato que afeta a implementação

A referência distingue os estados NONE, IDLE, READY, PLAYING e PAUSED. prepareAsync prepara a mídia sem bloquear a execução e sinaliza sucesso antes da reprodução. Operações como seekTo têm estados permitidos e callbacks; uma busca em transmissão ao vivo deve respeitar a janela DVR disponível. [2]

### Sequência de integração proposta

Encapsular abertura, configuração de listeners, preparação, reprodução e encerramento em um único adaptador. Atualizar a UI a partir dos callbacks reais; impedir chamadas incompatíveis com o estado atual. Cancelar ou ignorar callbacks de uma fonte antiga quando o usuário já tiver escolhido outra.

> Este relatório orienta a seleção e a integração das APIs. Não é uma transcrição da referência inteira nem comprova que todos os métodos funcionam em todos os televisores.

## 2. Arquitetura proposta para o app M3U

| Componente | Responsabilidade e fronteira |
| --- | --- |
| Fontes | Guardar identificação da fonte e suas opções; proteger credenciais separadamente. |
| Importador | Obter dados, validar entradas, interpretar o catálogo e relatar inconsistências. |
| Catálogo | Representar canais, filmes, séries e episódios sem depender dos componentes de tela. |
| Preferências e histórico | Persistir favoritos, progresso e correções manuais por fonte e item. |
| Navegação | Administrar foco, retorno, pesquisa, categoria ativa e posição na grade. |
| Adaptador de reprodução | Traduzir ações da UI para o player e devolver estado, progresso e erros. |
| Metadados externos | Resolver identidade de títulos e avaliações apenas por integração autorizada. |

### Lista de catálogo não é o mesmo que manifesto de streaming

HLS também usa playlists derivadas de M3U: uma playlist de mídia aponta segmentos, enquanto uma master playlist aponta playlists de mídia. [6] Portanto, o importador proposto deve reconhecer a estrutura antes de criar itens de catálogo; a extensão do arquivo, isoladamente, não deve decidir se cada linha representa um canal ou um segmento.

### Categorias e identidade

Preservar grupos declarados pela fonte. Para diferenciar canal, filme e série, priorizar dados explícitos do provedor; tratar inferências por nome como hipóteses corrigíveis. Quando faltarem episódios, temporadas ou capas, mostrar um estado incompleto em vez de inventar dados. Usar identificadores estáveis combinados com a fonte para não misturar favoritos de provedores diferentes.

### Credenciais e nota IMDb

Implementar adaptadores de provedor com contrato conhecido, em vez de prometer que qualquer servidor aceita o mesmo login. Para ordenar por IMDb, prever correspondência de títulos, origem e data da nota, ausência de avaliação e desempate. A seleção de serviço, autorização e licença de uso dos metadados permanece uma dependência do projeto; nenhuma integração IMDb foi validada nesta pesquisa.

## 3. Compatibilidade, segurança e aceite

### Não definir suporte apenas pelo nome do formato

A documentação separa especificações de mídia por ano de TV e publica limites de áudio, vídeo e streaming. [3] A proposta é registrar protocolo, contêiner, codecs, resolução, DRM, legendas, modelo e firmware em cada teste. Um link importado com sucesso só deve ser considerado reproduzível depois de uma verificação real.

### Dados mínimos e fronteiras de confiança

A Samsung recomenda segurança desde o projeto, validação de entradas, proteção de dados sensíveis e permissões proporcionais. [4] Aplicar isso ao app com logs sem senhas ou tokens, limites para importação, cancelamento de operações e revisão dos destinos de rede. Não guardar uma credencial de serviço de terceiros embutida no código entregue à TV.

| ID | Teste técnico proposto |
| --- | --- |
| API01 | Importar catálogo válido, vazio, truncado, grande e com caracteres internacionais. |
| API02 | Reconhecer um manifesto HLS sem transformar segmentos em canais. |
| API03 | Testar troca rápida de canal sem callbacks ou áudio da reprodução anterior. |
| API04 | Exercitar pause, retomada, erro e encerramento em estados válidos do player. |
| API05 | Restaurar favoritos e progresso após reinício, sem depender do título visível. |
| API06 | Exibir ação de recuperação para erro de rede, autorização ou mídia incompatível. |
| API07 | Tratar conteúdo ao vivo sem busca temporal quando a fonte não oferecer DVR. |
| API08 | Executar o percurso completo em TVs dos grupos definidos para o lançamento. |

### Emulador e TV real

A Samsung recomenda fortemente testes em aparelho real, porque o emulador não reproduz integralmente o hardware. [5] Usar o emulador para encurtar o ciclo de desenvolvimento; manter aparelhos representativos para reprodução, armazenamento, USB, retorno do sistema e desempenho. Os testes acima são um plano, não resultados executados.

## 4. Decisões pendentes e fontes

| Decisão | Resultado esperado antes da implementação final |
| --- | --- |
| Matriz de TVs | Anos, versões e aparelhos que serão efetivamente suportados. |
| Player e formatos | Combinações verificadas e tratamento explícito das não suportadas. |
| Provedores | Protocolos documentados e fontes de demonstração autorizadas. |
| Persistência | Estrutura versionada, migração e política de remoção dos dados locais. |
| Metadados | Serviço autorizado, identificação de títulos e regra para notas ausentes. |

### Limites deste levantamento

Foram lidos o índice, referências centrais de reprodução e documentos de compatibilidade e segurança. Não houve inventário exaustivo de cada método nem execução de código. Permissões, disponibilidade por versão e assinaturas devem ser confirmadas na referência específica durante a implementação.

### Fontes e escopo da pesquisa

[1] **Samsung Developer — Web API References** — Índice principal e famílias de APIs.  
https://developer.samsung.com/smarttv/develop/api-references/web-api-references.html

[2] **Samsung Developer — AVPlay API** — Estados, preparação assíncrona e operações de reprodução.  
https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplay-api.html

[3] **Samsung Developer — Media Specifications** — Especificações de mídia e referências por ano de TV.  
https://developer.samsung.com/smarttv/develop/specifications/media-specifications.html

[4] **Samsung Developer — Application Security** — Validação, dados sensíveis e permissões.  
https://developer.samsung.com/smarttv/develop/guides/fundamentals/application-security.html

[5] **Samsung Developer — TV Device** — Teste em aparelho real e limites do emulador.  
https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html

[6] **RFC Editor — RFC 8216, HTTP Live Streaming** — Seção 4: playlists de mídia e master playlists; fonte normativa complementar.  
https://www.rfc-editor.org/rfc/rfc8216.html


Consulta: 13 de setembro de 2026. As recomendações e os critérios de aceite deste relatório não substituem as exigências de revisão vigentes no Seller Office.
