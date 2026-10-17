# Produto e capacidades do CCPlay TV

Este guia apresenta as capacidades e os limites do produto. Para o estado verificável de uma feature, consulte o [backlog](../.planning/backlog.md) e o respectivo `sdd/specs/<feature>/plan.md`.

## Proposta

O CCPlay TV permite que uma pessoa organize e assista às próprias fontes IPTV em uma TV Samsung com Tizen. O aplicativo é orientado ao controle remoto e mantém o catálogo no próprio aparelho para que a navegação não dependa de um serviço sempre conectado.

O produto não distribui, hospeda ou fornece listas, canais, filmes, séries ou outro conteúdo digital.

## Listas e fontes

- Importação de listas M3U/M3U8 por arquivo local ou URL remota.
- Acesso a provedores compatíveis com Xtream Codes por endereço, usuário e senha.
- Atualização de fontes já cadastradas.
- Categorias e grupos preservados como declarados pela fonte; o aplicativo não os substitui por uma taxonomia externa.
- Para fontes Xtream, a estrutura de categorias chega primeiro e os itens são carregados quando a pessoa entra na categoria. Uma M3U avulsa é lida localmente de uma vez, pois o formato não oferece consulta por categoria.

O suporte a portais Stalker/Ministra permanece uma possibilidade futura, não uma capacidade entregue.

## Experiência na TV

### Canais ao vivo e EPG

- Canais organizados por grupos da própria fonte, com busca, favoritos, zapping e Guia completo.
- EPG em XMLTV, incluindo programa atual, próximos programas e catch-up quando a fonte declara suporte compatível.
- Navegação por categorias, páginas e cards pensada para setas, SELECT e RETURN.

### Filmes e séries

- Catálogo real das fontes, sem conteúdo fictício.
- Detalhes, capas e informações complementares quando já existirem na fonte ou quando o TMDB estiver configurado.
- Favoritos, histórico, continuar assistindo, retomada e indicação de assistido.
- Controles do player compatíveis com as capacidades reais de cada mídia. Conteúdo ao vivo sem DVR não oferece barra de busca.

### Personalização e acessibilidade

- Idioma do aplicativo em Português, English e Español; títulos, canais e categorias vindos do provedor não são traduzidos.
- Categorias podem ser ocultadas ou protegidas com PIN por lista.
- Preferências de aspecto, qualidade, áudio e legendas guardadas no aparelho.
- Estados de carregamento, erro e lista vazia mantêm um caminho acessível pelo controle remoto.

## Metadados e trailers

O TMDB é opcional e usa uma chave informada pela própria pessoa. Ele pode complementar dados ausentes do provedor com sinopse, classificação, nota, elenco, semelhantes e imagens. O aplicativo nunca inventa esses dados quando não há uma correspondência segura.

Os trailers usam o player oficial do YouTube em uma página-ponte estática. A disponibilidade, anúncios e restrições do trailer são definidos pelo próprio YouTube.

Menções a IMDb, Google, voz e aplicativo Android representam possibilidades futuras; não são integrações entregues.

## Portal, licença e backup

O portal é uma extensão opcional vinculada à TV, não uma conta obrigatória.

- O pareamento pode ser iniciado pelo QR ou pelo ID e chave exibidos na TV.
- A TV consulta o portal somente após uma ação explícita, como **Atualizar** ou salvar uma lista.
- A aba **Avançado** reúne recuperação, rotação de chave e código, e desvinculação; ações destrutivas pedem confirmação.
- O backup de dados de uso tem uma aba própria e é limitado à identidade da mesma TV.
- O código de recuperação começa oculto e só pode ser revelado por ação explícita na TV. Ele não entra em QR, logs, URLs, erros ou exportações.

O Pix está implementado para desenvolvimento, testes e staging. A venda real continua bloqueada até que os gates documentados sejam concluídos. Não comunique cobrança como disponível sem consultar o [backlog](../.planning/backlog.md).

## Privacidade e limites importantes

- Credenciais da fonte e URLs de reprodução podem ficar no IndexedDB do aparelho somente para autenticação e reprodução; nunca devem aparecer em logs, cards, diagnósticos, erros ou exportações.
- Catálogo local não torna streams remotos disponíveis sem internet nem impede expiração de URLs.
- Navegador e emulador não comprovam AVPlay, codecs, teclas físicas, desempenho ou memória na TV. Essas evidências são registradas por feature.

## Onde encontrar o detalhe técnico

| Assunto | Fonte canônica |
| --- | --- |
| Status e pendências | [`.planning/backlog.md`](../.planning/backlog.md) e `sdd/specs/<feature>/plan.md` |
| Decisões de arquitetura | [`sdd/adr/`](../sdd/adr/) |
| Operação do portal | [`docs/portal/`](portal/) |
| Design, foco e navegação | [`docs/design/design-system/`](design/design-system/) |
| Práticas de UX para TV | [`docs/guia-praticas-app-tv/`](guia-praticas-app-tv/) |

