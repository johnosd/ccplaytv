# Emenda proposta à constitution (gate G-3, FR-022)

Feature `090-legendas-externas`. Texto **proposto** pelo `sdd-plan` em 2026-10-22; a task **T001** só o aplica em
`.planning/memory/constitution.md` depois de o usuário aprovar este texto (ou uma versão editada por ele). A
constitution não é editada por skill sem essa aprovação (seção Governança). Enquanto T001 não fechar, **nenhum código
que chame o serviço de legendas** pode ser escrito (T020 em diante dependem dela).

## Por que a emenda é necessária

| Trecho atual | Conflito com a 090 |
| --- | --- |
| "Comandos Locais…", **Atualização (2026-10-14, feature 071)**: "Só as ações listadas na exceção (d)–(f) de 'Segredos' e o botão **Atualizar** falam com o serviço." | Buscar e obter legenda é uma chamada nova da TV ao serviço, por ação da pessoa, que não está na lista fechada. |
| Restrições → **Exceção (2026-10-11, feature 069/ADR-013)**: o serviço central "PODE cuidar de identidade/sessões, configurações…, pendências, pagamento/licença, recuperação pelo site e backups de controle". | Intermediar uma integração de terceiro com chave padrão guardada no servidor (ADR-021) não é nenhuma dessas funções. |

A ADR-021 §8 já exige esta compatibilização antes do código. A regra "chave do desenvolvedor ou compartilhada
continua proibida em qualquer cliente" **não muda** — a chave padrão nunca sai do servidor.

## Mudança de versão

`1.15.0 -> 1.16.0` (MINOR: expansão delimitada de "Segredos Fora dos Clientes e dos Logs", novas exceções (k) e (l), e
atualização das listas fechadas de "Comandos Locais…" e da exceção da feature 069 em Restrições).

## Texto a inserir

### 1. Em "Segredos Fora dos Clientes e dos Logs", depois do item (j)

> **Exceção de integrações com chave padrão protegida (2026-10-22, feature 090/ADR-021)**, decisão explícita do
> usuário com risco aceito:
> (k) o serviço PODE guardar a chave de aplicação **do ccplayTv** de fornecedores de legenda de terceiro (hoje o
> OpenSubtitles e o SubDL) e usá-la **somente** em chamadas a esse fornecedor, por operações delimitadas que a spec da feature
> enumera (na 090: "buscar legendas" e "obter arquivo de legenda"), com destino fixo — nunca proxy de URL arbitrária.
> A TV PODE chamar essas operações **somente por ação da pessoa** (SELECT em "Buscar legenda online", trocar o idioma
> da busca, escolher um resultado, "Tentar de novo"), autenticada pela própria identidade de TV; nunca ao focar, abrir
> o player, retomar, avançar episódio ou em autoplay. A TV envia só os identificadores da obra (TMDB, temporada,
> episódio) ou o nome limpo e o ano, o idioma e o identificador do resultado escolhido — **nunca** host, usuário,
> senha, URL de reprodução, nome da lista ou vídeo IPTV. A chave padrão NÃO PODE ir para pacote, JavaScript, variável
> pública, resposta, log, erro ou analytics; o serviço NÃO PODE registrar em log o termo pesquisado junto à identidade
> da TV, e DEVE impor limite de uso por TV e só atender TV com licença ou teste vigente. Falha do serviço ou do
> fornecedor NÃO PODE afetar reprodução, navegação, importação ou o que já está guardado no aparelho. A legenda obtida
> PODE ficar no aparelho, chaveada pela identidade lógica do item, sai junto com a lista e NÃO entra em backup nem
> exportação. Esta exceção NÃO se estende à chave padrão do TMDB nem à OpenAI, que exigem feature/decisão própria, e
> NÃO autoriza contratação, cobrança ou oferta em produção (gate da feature). URL de fornecedor que embuta a chave
> padrão (ex.: o link de download do SubDL) NUNCA é repassada à TV nem registrada.
> (l) **BYOK de legendas**: a chave de API **da própria pessoa**, da conta dela no OpenSubtitles ou no SubDL,
> digitada **na TV**, PODE residir no dispositivo e ser enviada **só** ao fornecedor a que pertence, direto da TV,
> sob todas as regras da extensão BYOK da feature 032 (nunca em log, tela depois de digitada, erro, outro serviço,
> portal, backup ou exportação; sai do aparelho quando a pessoa a remove). Não herda a exceção (j) (envio pelo
> portal) nem a (g) (backup); estender a elas exige decisão própria.

### 2. Em "Comandos Locais Independem de Rede, Backend ou IA", substituir a última frase da **Atualização (2026-10-14, feature 071)**

De:

> Só as ações listadas na exceção (d)–(f) de "Segredos" e o botão **Atualizar** falam com o serviço.

Para:

> Só as ações listadas nas exceções (d)–(f) e (k) de "Segredos" e o botão **Atualizar** falam com o serviço.

### 3. Em Restrições do Projeto, na **Exceção (2026-10-11, feature 069/ADR-013)**, primeira frase

De:

> serviço central serverless PODE cuidar de identidade/sessões, configurações fornecidas no portal, pendências,
> pagamento/licença, recuperação pelo site e backups de controle.

Para:

> serviço central serverless PODE cuidar de identidade/sessões, configurações fornecidas no portal, pendências,
> pagamento/licença, recuperação pelo site, backups de controle e, desde a feature 090 (ADR-021), operações
> delimitadas de integração com chave padrão protegida (exceção (k) de "Segredos").

### 4. Relatório de Impacto de Sincronização (topo do arquivo)

Novo bloco no topo, rebaixando o atual para "Relatório anterior", no mesmo formato dos existentes: mudança de versão,
origem (feature 090, ADR-021, gate G-3), exceção delimitada (k), o que continua proibido (chave padrão em cliente,
TMDB/OpenAI, dados IPTV na busca), risco aceito (o serviço vê o título pesquisado e o idioma; a cota padrão é
compartilhada entre as TVs) e "formalização normativa não comprova implementação, hardware ou lançamento".

### 5. Rodapé

`**Versão**: 1.16.0 | **Ratificada**: 2026-09-14 | **Última Emenda**: <data da aprovação>`.

## Também na mesma task

- `CLAUDE.md` cita "`.planning/memory/constitution.md` (v1.15.0)" — atualizar para a versão nova (regra
  "Documentação do Repositório É Canônica").
- Nota `**Atualização (feature 090):**` na ADR-021, §8, dizendo que a compatibilização foi feita e em qual versão, e
  que o **SubDL** entrou como segundo fornecedor de legendas sob a mesma decisão (chave padrão no serviço, chave
  pessoal opcional, caminho direto) — decisão do usuário em 2026-10-22.
