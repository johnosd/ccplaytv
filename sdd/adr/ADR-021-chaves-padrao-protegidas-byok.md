# ADR-021: Chaves padrão protegidas e credenciais pessoais opcionais

## Status

Aceita (2026-10-21), por escolha explícita do usuário da opção “No serviço do ccplayTv, com chave pessoal opcional e caminho direto quando permitido”.

Concretiza a exceção de complemento para chave compartilhada da ADR-008 e complementa as ADRs 013/016 quanto à separação entre controle e integrações. O princípio de segredos fora dos clientes permanece. A compatibilização normativa das novas chamadas ao serviço precisa preceder código, sem alterar silenciosamente a constitution. Aceitação arquitetural não é implementação, contratação ou autorização de lançamento.

## Data

2026-10-21

## Contexto

O app hoje usa TMDB com chave da própria pessoa. A avaliação de OpenSubtitles demonstrou buscas de filme/episódio em pt-BR, en e es e um download no PC; o caminho de legenda externa no AVPlay ainda não foi validado.

O usuário decidiu oferecer uma credencial padrão do ccplayTv a quem não configurar a própria, para reduzir a barreira de uso. Também quer permitir uma credencial pessoal como alternativa quando admitida pelo fornecedor. Após avaliar a extração de uma chave no pacote, escolheu protegê-la no serviço.

A orientação pública do OpenSubtitles diferencia chave de aplicação de conta/token de usuário. O uso de uma chave padrão não concede automaticamente cotas ilimitadas, login, recursos pagos ou permissão para BYOK no app distribuído.

## Decisão

1. **Padrão sem chave pessoal.** Oferecer operações delimitadas de TMDB e OpenSubtitles por um serviço opcional do ccplayTv. As chaves padrão ficam privadas no servidor e são usadas somente nas chamadas aos respectivos fornecedores. A TV recebe resultados ou arquivos autorizados, nunca a chave compartilhada.
2. **Credencial pessoal opcional.** Uma credencial pessoal configurada, validada e escolhida pela pessoa tem precedência para a respectiva integração. Preservar o caminho direto existente do TMDB. Para OpenSubtitles, API key pessoal e conta/token de usuário são mecanismos distintos: BYOK direto só poderá ser oferecido após verificar sua aceitação pelo fornecedor; não anunciá-lo como entregue.
3. **Independência do núcleo.** Importação, catálogo, foco, RETURN, reprodução e comandos locais continuam na TV. Indisponibilidade do complemento não bloqueia esses fluxos. Um caminho direto permitido pode contornar falha do intermediário; não contorna indisponibilidade da API do fornecedor.
4. **Mudança de credencial explícita.** Não alternar silenciosamente entre chave pessoal e cota compartilhada quando houver erro. A feature deverá definir estado e ação de retorno ao padrão, preservando a escolha da pessoa e a atribuição correta de uso. Não usar rotação de chaves para tentar contornar limites impostos pelo fornecedor.
5. **Superfície restrita.** Intermediar apenas operações que a feature especificar, com destinos fixos, validação, identificação/autenticação apropriada, limites de uso e cache permitido. Não criar proxy de URL arbitrária. Não enviar host, usuário, senha, URL de reprodução ou vídeo IPTV; pesquisas usam apenas os identificadores ou o texto mínimo necessários.
6. **Vídeo e cache.** Nenhum vídeo passa pelo serviço. A decisão de baixar a legenda diretamente de um host autorizado ou por operação restrita fica no plano da feature, após validar CORS/redirects. Cache de legenda precisa de identidade estável e limite próprio integrado ao orçamento do dispositivo. Links temporários não substituem o arquivo armazenado.
7. **Controle separado de integrações.** A nova função não reativa polling de licença/listas, não muda o Atualizar do portal e não leva credenciais pessoais ao serviço por herança. Pode compartilhar implantação somente se o plano delimitar rotas, permissões e recursos. Não exige outro servidor sempre ligado.
8. **Disparos de chamadas.** Esta ADR aprova o modelo de credenciais, não o conjunto de eventos que fará chamadas. Antes do código, a especificação deve delimitar as ações de metadados/legendas e compatibilizar a regra da constitution que hoje enumera as chamadas ao serviço. Nenhuma consulta por foco; não migrar automaticamente os produtores periódicos do TMDB da feature 087 para o serviço.
   **Atualização (feature 090, 2026-10-22):** compatibilização feita na constitution 1.16.0 — exceção (k) (chaves
   padrão de legenda no serviço, só operações "buscar legendas" e "obter arquivo", só por ação da pessoa, com limite
   por TV e licença/teste vigente) e exceção (l) (BYOK de legendas na TV). O **SubDL** entrou como segundo fornecedor
   de legendas sob esta mesma decisão (chave padrão no serviço, chave pessoal opcional, caminho direto), por escolha do
   usuário; o BYOK dos dois é implementado na feature 090, e anunciá-lo depende da evidência de aceitação de cada
   fornecedor (gate G-4 da 090). A chave padrão do TMDB pelo serviço continua fora (outra feature).
9. **Segredos.** Não colocar chaves padrão em .wgt, JavaScript, variáveis públicas VITE, respostas, logs ou erros. Guardar a chave no .env do desenvolvimento não autoriza incorporá-la ao build. Configuração, guarda e rotação no servidor seguem os mecanismos privados já aceitos e o plano específico.
10. **Escopo do produto.** A chave padrão habilita as integrações que forem especificadas e admitidas pelo plano/conta do fornecedor; não promete “todas as features da API”. Atribuição/licenciamento do TMDB, cotas do OpenSubtitles e eventual autenticação de usuário são gates de oferta em produção.
11. **Credenciais pessoais existentes.** A ADR-020 e o backup da ADR-017 mantêm seus escopos atuais para TMDB. Não estender suas exceções a OpenSubtitles, senhas ou tokens sem decisão e compatibilização próprias.
12. **Custo e implantação.** A escolha autoriza registrar e avaliar essa arquitetura. Não autoriza contratação, habilitação de cobrança, alteração de infraestrutura ou implantação. O plano precisa demonstrar cotas/custos e os limites de abuso antes de uma oferta padrão em produção.

## Alternativas Consideradas

### Chave do desenvolvedor incluída no pacote

- **Rejeitada pelo usuário ao escolher a opção protegida no serviço.** A chave seria extraível e exporia a cota comum; ofuscação ou cifragem decifrada no mesmo cliente não a mantém privada. Também conflita com a regra atual de segredos fora dos clientes.

### Apenas BYOK, exigido de todas as pessoas

- **Substituída como estratégia exclusiva.** Mantém atrito de configuração e não atende ao objetivo de experiência pronta. O caminho pessoal continua opcional quando permitido. Não exigir uma API key do usuário para usar a oferta padrão do OpenSubtitles.

### Todo acesso, inclusive com chave pessoal, obrigatório pelo serviço

- **Não escolhida.** O usuário pediu caminho direto quando permitido. Fazer o modo pessoal depender do intermediário elimina essa alternativa em uma falha do serviço e amplia desnecessariamente o trânsito de segredos pessoais.

## Consequências

### Positivas

- Permite experiência padrão sem entregar segredos compartilhados às TVs.
- Mantém uma opção pessoal e a arquitetura client-first do núcleo.
- Permite revogar/rotacionar a chave padrão no serviço sem depender de distribuir outra chave em um pacote.
- Compartilha um contrato de seleção de credencial entre TMDB e legendas, respeitando as diferenças dos fornecedores.

### Negativas

- O modo padrão depende da rede e do serviço; agrega custo, uso e potencial de abuso.
- Há cotas e termos comerciais que a chave de teste não demonstra.
- É necessário distinguir indisponibilidade, chave inválida, cota e ausência de resultado; trocar a chave não resolve todos esses casos.
- Novas chamadas ao serviço exigem compatibilização normativa e teste da superfície de integração.
- BYOK do OpenSubtitles continua sem aceitação confirmada; uma chave válida no PC não basta.

### Caminho de Migração / Evolução Futura

Especificar as operações e disparos, compatibilizar as regras antes da implementação e planejar serviço/cliente com credenciais padrão somente no servidor. Manter o fluxo TMDB pessoal existente durante a adoção. Validar a legenda externa na TV antes de prometer reprodução/sincronismo.

Rever se o fornecedor não admitir o modelo, se custo/cota tornarem a oferta inviável ou se o caminho pessoal exigir autenticação adicional. O complemento pode ser desativado sem apagar dados locais ou impedir Direct Play.

## Referências

- [ADR-008](ADR-008-arquitetura-client-first-backend-so-quando.md), [ADR-013](ADR-013-portal-controle-serverless-google-cloud.md), [ADR-016](ADR-016-consulta-sob-demanda-qr-fixo.md), [ADR-020](ADR-020-chave-tmdb-pelo-portal.md).
- [Proposta revisada e escolha do usuário](../assessments/opensubtitles-legendas-externas/proposta-chave-padrao-byok.md).
- [Avaliação do OpenSubtitles](../assessments/opensubtitles-legendas-externas/decision.md), [prova HTTP no PC](../assessments/opensubtitles-legendas-externas/evidencias/api-real-pc-download.json).
- [TMDB: FAQ/licenciamento](https://developer.themoviedb.org/docs/faq), [autenticação de aplicação](https://developer.themoviedb.org/docs/authentication-application).
- [OpenSubtitles: orientação de chave de aplicativo](https://forum.opensubtitles.com/t/apikey-for-player-video/7998), [planos](https://opensubtitles.tawk.help/article/pro-packages).
