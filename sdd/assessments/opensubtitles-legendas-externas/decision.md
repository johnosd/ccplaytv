> **Revisão vigente (2026-10-21, ADR-021):** o usuário substituiu BYOK exclusivo por chave padrão mantida no serviço do ccplayTv e credencial pessoal opcional, com caminho direto quando permitido. O texto abaixo preserva a avaliação original. A interpretação e o scorecard atuais estão em [reavaliacao-chave-padrao.md](./reavaliacao-chave-padrao.md); o veredito permanece `needs-clarification`, com pendências revisadas.

# Assessment Decision: OpenSubtitles com BYOK

- **Slug**: opensubtitles-legendas-externas
- **Decidido**: 2026-10-21
- **Problem**: ./problem.md
- **Veredito**: needs-clarification

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | O usuário confirmou falta de legendas em seu uso de filmes/séries e escolheu pt-BR, en e es. Não é apenas interesse abstrato no serviço |
| Força da evidência | adequate | API real: seis combinações filme/episódio × idioma com 200 e um arquivo pt-BR obtido. Há precedente no xstream e suporte nativo documentado. Não há medição de cobertura/sincronismo nos vídeos reais |
| Valor vs. custo de inação | adequate | Resolve uma dor explícita sem depender de nova experiência central. O custo de esperar é manter os títulos afetados sem alternativa adequada. Diferenciação comercial, demanda agregada e retorno não estão demonstrados |
| Viabilidade / apetite | unknown | API viável no PC; apetite foi esclarecido: BYOK obrigatório e sem servidor presumido. Falta aceitação pelo fornecedor de API key própria de cada usuário em aplicativo distribuído. A orientação pública aponta em outra direção. É uma dúvida externa reconhecida após perguntar e receber a preferência |
| Fit estratégico | adequate | BYOK, operação opcional e Direct Play combinam com o modelo do app, desde que o fornecedor aceite. Não existe decisão para chave do desenvolvedor no cliente nem para ampliar o portal. Relevância como diferencial exclusivo não demonstrada |

## Abordagens Candidatas

### 1. BYOK opcional, por ação da pessoa, com chave da própria conta

- Pessoa informa sua API key e pede uma legenda em pt-BR/en/es. Busca e seleção são opcionais, sem substituir playback ou legenda embutida.
- **Recomendada**: como candidata preferida pelo usuário, somente depois de confirmar a aceitação do fornecedor. Não está aprovada para delivery.
- A prova HTTP indica que a chave permite buscar e baixar no PC. O preflight com origem null é favorável, mas não comprova que o navegador Tizen envia a identificação exigida pelo serviço nem que o arquivo funciona no AVPlay.
- Se aceita, o planejamento deverá escolher entre arquivo local consumido pelo AVPlay e agenda de cues no app. A SDK Samsung exige caminho absoluto local na primeira opção; o overlay atual não é, sozinho, um player de SRT externo.

### 2. Chave de aplicação protegida por serviço opcional

- Alternativa conceitual: ccplayTv registra o aplicativo, guarda a chave fora dos clientes e oferece operações restritas de legendas. A conta/token de usuário, se necessário, é diferente da API key.
- **Recomendada**: não no escopo escolhido. O usuário manteve BYOK como requisito e condicionou o avanço à aceitação desse modelo.
- A ADR-008 admite complemento para proteger chave compartilhada, mas isso não cria autorização para implementar serviço, ampliar finalidade do portal, armazenar credenciais adicionais ou contratar plano. Não é o caminho presumido para desbloquear esta avaliação.

### 3. Adiar a integração, preservando o player atual

- Manter legendas embutidas e registrar a oportunidade enquanto se esclarece a regra do fornecedor.
- **Recomendada**: conduta atual do assessment. Não resolve a dor, mas evita entregar um modelo incompatível com a exigência do usuário ou com a orientação do serviço.
- Se o fornecedor rejeitar BYOK, essa abordagem pode encerrar a proposta sob as restrições atuais; mudança de apetite precisa ser uma decisão nova.

## Veredito

**needs-clarification.** Existe problema válido e a API foi demonstrada, mas isso não alcança a barra de go no critério central de viabilidade do modelo escolhido. O usuário explicitou BYOK e aceitou condicionar o avanço à aprovação desse uso pelo OpenSubtitles.

Em 07 e 28/09/2026, a equipe orientou que aplicativos distribuídos tenham sua própria chave e que não peçam API key a cada usuário. Essa orientação pública impede tratar o padrão do TMDB como automaticamente aceito pelo OpenSubtitles. O teste pessoal com uma chave não confirma condições de distribuição. [Orientação da equipe](https://forum.opensubtitles.com/t/apikey-for-player-video/7998).

Não é kill: há demanda pessoal e funcionamento técnico suficientes para justificar a clarificação. Também não é go condicionado disfarçado: nenhuma spec deve ser iniciada com esta decisão como aprovação.

### Se needs-clarification — Perguntas Bloqueantes

1. O OpenSubtitles aceita explicitamente um aplicativo Tizen distribuído em que cada pessoa cria/configura sua própria API key, como ocorre no modelo BYOK escolhido? A resposta precisa abordar esse caso, não apenas confirmar que a API permite uma chave válida.
2. Se aceita, que condições se aplicam: identificação do aplicativo, criação dos consumers, cotas, tipo de conta, eventual plano e armazenamento local da chave? Não foi confirmada franquia/custo de produção.
3. Se a resposta for negativa, o usuário mantém BYOK (encerrar a integração sob esse requisito) ou deseja reavaliar a alternativa com chave de aplicativo protegida? Não há autorização presumida para essa mudança.

**Fase a revisitar**: explora.

## Evidência e Limites

- Chave lida de OPEN_SUBTITLES_API_KEY somente para teste, sem impressão, cópia para cliente ou gravação em relatório.
- pt-BR: filme 35 e episódio 14 resultados; en: filme 67, episódio 16; es: filme 62, episódio 26. Todos HTTP 200; páginas de filme en/es retornaram 50 itens, sem buscar páginas extras.
- Uma solicitação de legenda e um arquivo obtidos. 85.662 bytes, timestamps presentes; conteúdo e link temporário não persistidos. remaining=99 observado, sem extrapolar franquia.
- Somente PC/Node/HTTP. Nenhuma medição na TV, navegador Tizen, emulador, sincronismo real, fluxo por controle remoto ou desempenho do player.
- A sintaxe e os arquivos dos scripts são de evidência, não implementação. A prova não altera .env, .env.example, código-fonte, catálogo nem dados do aparelho.
- A busca de preços não confirmou a tabela aplicável: a página pública do Stoplight não foi acessível nesta consulta. Não confundir preços de recursos de IA com download de legendas existentes.
- Fontes: [API e fluxo](https://blog.opensubtitles.com/opensubtitles/how-to-build-a-movie-subtitle-finder-cli-with-python-and-the-opensubtitles-api), [planos](https://opensubtitles.tawk.help/article/pro-packages), [AVPlay](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplay-api.html).
- Detalhes: [problem.md](./problem.md), [explora.md](./explora.md), [teste pt-BR/download](./evidencias/api-real-pc-download.json), [teste en/es](./evidencias/api-idiomas-pc.json).

## Próximo Passo Concreto

Obter uma resposta aplicável da equipe do OpenSubtitles sobre o modelo BYOK do aplicativo distribuído e suas condições; não foi enviado contato nesta avaliação. Um rascunho está em [consulta-modelo-byok.md](./evidencias/consulta-modelo-byok.md).

Depois dessa evidência, revisitar Explora/Decide pelo sdd-assess. Não avançar automaticamente para sdd-specify, não contratar plano e não alterar ADRs a partir deste veredito.

Esta ideia veio da conversa e do relatório comparativo, não de uma entrada de Ideias Futuras. Nenhuma entrada do backlog foi removida nem painel de status foi alterado.
