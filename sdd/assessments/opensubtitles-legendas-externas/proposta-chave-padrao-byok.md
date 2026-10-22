# Proposta: chave padrão do ccplayTv e credencial pessoal opcional

- **Data**: 2026-10-21
- **Status**: opção de chave padrão privada no serviço aceita pelo usuário em 2026-10-21; formalizada na [ADR-021](../../adr/ADR-021-chaves-padrao-protegidas-byok.md). Não é implementação ou lançamento.
- **Origem**: nova orientação do usuário após o assessment de OpenSubtitles.
- **Escopo**: TMDB e OpenSubtitles; reavalia a exigência anterior de exclusivamente BYOK em [decision.md](./decision.md), preservada como registro histórico.

## Intenção do Usuário

O aplicativo deve oferecer as integrações sem obrigar cada pessoa a configurar uma API key. Se a pessoa desejar usar sua própria chave, ela deve poder substituir a chave padrão do ccplayTv. O objetivo é conveniência e uma alternativa a problemas na credencial do aplicativo.

O usuário esclareceu “chave na distribuição” ao escolher: **“No serviço do ccplayTv, com chave pessoal opcional e caminho direto quando permitido”**. Não será uma chave padrão contida no pacote. A escolha não aprova contratação, custo, exposição de segredo ou emenda automática da constitution.

## Opção Recomendada: chave padrão protegida por serviço opcional

- Sem credencial pessoal: TV solicita operações de metadados/legendas a um serviço do ccplayTv; a chave padrão fica privada no serviço.
- Com credencial pessoal válida: priorizar a credencial escolhida pela pessoa; para TMDB, preservar o caminho direto existente.
- Para OpenSubtitles, confirmar a permissão de API key pessoal como alternativa no app distribuído. Conta/token de usuário para sua cota é outro mecanismo, diferente de BYOK.
- Catálogo, dados de uso e vídeo continuam no aparelho; o vídeo não passa pelo serviço. Chamadas de legenda/metadados devem carregar somente os campos estritamente necessários.
- Recurso opcional: falha do serviço do ccplayTv não impede importação, navegação ou playback. No TMDB, o caminho BYOK direto pode oferecer independência desse intermediário.
- Serviço com operações delimitadas, autenticação quando aplicável, limites, cache permitido e rotação das chaves; não se presume a criação de um proxy genérico.
- Para legendas, definir depois se o arquivo vem direto do host autorizado ou por operação restrita; não prometer CORS de todos os hosts a partir do teste da API.
- Guardar uma chave no .env do desenvolvimento não a protege no frontend. Não usar variável pública nem entrega remota do segredo compartilhado à TV.
- Reutilizar o portal amplia sua finalidade atual e precisa de decisão própria, mesmo com infraestrutura existente.

A [ADR-008](../../adr/ADR-008-arquitetura-client-first-backend-so-quando.md#L60) já contempla complemento opcional para proteger chave compartilhada. A concretização em TMDB/legendas e sua relação com o portal precisam ser documentadas.

## Alternativa: chave padrão literalmente no pacote

Atende ao uso sem intermediário, mas deve ser tratada como pública: pode ser extraída do pacote, do código em execução ou das chamadas. Ofuscação/cifragem cuja decifragem ocorre no mesmo cliente não preserva um segredo compartilhado.

Abuso pode consumir a cota comum e a revogação afeta as instalações que usam a chave. Uma chave substituta colocada no mesmo cliente continua exposta. Não foi escolhida.

Essa alternativa contraria a regra atual de [segredos fora dos clientes](../../../.planning/memory/constitution.md#L274). Exigiria uma decisão explícita de mudar essa regra, com análise das condições dos provedores. Não é tratada como uma implementação rotineira autorizada.

## O que a Credencial Alternativa Resolve

| Situação | Outra chave pode ajudar? |
| --- | --- |
| Chave padrão revogada, inválida ou com sua própria cota esgotada | Pode, se o fornecedor autorizar e a alternativa for válida; não garantir quando o limite é por IP/conta/serviço |
| Intermediário do ccplayTv indisponível | Pode, se existir caminho direto permitido com a chave pessoal |
| API do fornecedor fora do ar | Não |
| Endpoint removido ou formato alterado | Não; exige atualização da integração |
| Legenda inexistente ou fora de sincronismo | Não resolve por si só |
| Recurso pago ou que exige autorização de usuário | A chave da aplicação, sozinha, não garante acesso |

## Condições Específicas dos Fornecedores

- **TMDB:** autenticação de aplicação e sessão de usuário têm papéis distintos. A FAQ distingue uso não comercial de projetos cujo objetivo principal é receita; a licença apropriada e a atribuição precisam ser verificadas para uma oferta padrão do produto. Não há promessa de acesso a “todas as features”. [FAQ](https://developer.themoviedb.org/docs/faq), [autenticação de aplicação](https://developer.themoviedb.org/docs/authentication-application).
- **OpenSubtitles:** a orientação pública pede chave do aplicativo e desaconselha exigir que usuários criem API keys. Planos Pro oferecem cotas próprias e uso sem login do usuário; a chave não equivale a plano ilimitado. O fallback BYOK continua exigindo esclarecimento, mesmo quando deixa de ser obrigatório. [Orientação da equipe](https://forum.opensubtitles.com/t/apikey-for-player-video/7998), [planos](https://opensubtitles.tawk.help/article/pro-packages).
- As provas anteriores demonstram a API no PC, não contratação, direito a recursos adicionais, aceitação da distribuição ou playback no hardware.

## Decisão Recebida

Opção protegida no serviço aceita em resposta estruturada pelo usuário. A arquitetura está registrada na [ADR-021](../../adr/ADR-021-chaves-padrao-protegidas-byok.md) e o assessment foi [reavaliado](./reavaliacao-chave-padrao.md), preservando o veredito anterior e explicitando as pendências remanescentes.
