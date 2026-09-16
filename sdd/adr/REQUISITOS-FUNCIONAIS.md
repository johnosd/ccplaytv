# CCPlay TV — Requisitos Funcionais e Critérios de Aceite

Data: 2026-09-13. Revisão de escopo v2.

## Base e estado

Este documento organiza a descrição funcional fornecida pelo usuário nesta conversa, mantendo canais, filmes, séries, grupos/categorias da lista, pesquisa, favoritos, histórico, IMDb e recomendações por gosto pessoal. Não descreve funcionalidades já entregues.

**Confirmado** significa solicitado pelo usuário ou mantido das decisões anteriores. **Proposto** identifica uma interpretação/regra técnica desta revisão. Os critérios de aceite operacionalizam os requisitos; os detalhes propostos poderão ser ajustados sem alterar o objetivo de negócio.

A arquitetura vigente está nas ADR-001 a ADR-003. Acesso/fontes/importação são detalhados como proposta na ADR-004; catálogo/preferências/IMDb, na ADR-005. Essas ADRs incluem as referências externas das observações técnicas. O código da aplicação e a TV não foram testados nesta revisão.

## 1. Abertura e acesso

### RF-001 — Abrir sem login obrigatório

**Confirmado.** A pessoa deverá abrir o CCPlay na TV sem informar usuário e senha do aplicativo. Dentro dele haverá opções de adicionar fonte e entrar no provedor. Não haverá tela de cadastro que impeça alcançar a interface.

**Aceite:** numa instalação nova, abrir a tela inicial e permitir acessar configuração/fontes sem conta. Numa instalação com dados, abrir o catálogo salvo sem exigir login CCPlay. Sem backend e sem cache, abrir a interface com estado vazio e explicação, sem exigir credencial de conta para sair desse estado.

### RF-002 — Separar login do provedor de eventual conta CCPlay

**Confirmado:** credenciais podem ser informadas dentro do app para carregar uma fonte. **Proposto:** eventual conta própria do CCPlay terá identidade e finalidade distintas e continuará opcional; o fluxo de cadastro/sincronização pessoal não foi definido.

**Aceite:** erro ou expiração da senha de uma fonte não bloqueará o aplicativo inteiro. Preferências locais não dependerão de criar conta. A interface não apresentará senha do provedor como senha do CCPlay.

## 2. Entrada e carregamento de fontes

### RF-003 — Adicionar por URL M3U

**Confirmado.** Permitir informar a URL de uma lista, identificá-la e iniciar importação.

**Aceite proposto:** uma URL válida criará uma fonte com progresso consultável. Conteúdo inválido ou resposta de erro não será marcado como importação bem-sucedida. Corrigir a configuração e tentar novamente não apagará outras fontes.

### RF-004 — Adicionar arquivo `.m3u`

**Confirmado.** Permitir encontrar/selecionar o arquivo e carregar seu conteúdo.

**Aceite proposto:** na TV-alvo, navegar pelo mecanismo autorizado de seleção, escolher `.m3u`, transferir os bytes e acompanhar a importação. Cancelar seleção, remover armazenamento ou não ter permissão produzirá mensagem recuperável. O caminho local da TV não será usado como caminho de arquivo no servidor.

O acesso local/USB precisa de prova técnica. Um envio por celular/computador pareado é alternativa proposta de conveniência, não substituição silenciosa deste aceite.

### RF-005 — Adicionar por endereço do provedor, usuário e senha

**Confirmado.** Permitir preencher “DNS”, usuário e senha para carregar o conteúdo de um serviço compatível.

**Interpretação proposta:** “DNS” significa o endereço do servidor do provedor. O primeiro conector candidato é compatível com Xtream Codes; o protocolo real não foi fornecido e precisa de validação. Não se alterará o DNS da rede da TV.

**Aceite:** autenticação válida numa fonte de teste autorizada permitirá importar as áreas disponíveis. Senha inválida, serviço expirado ou protocolo incompatível produzirão erro específico, sem revelar credenciais em logs ou bloquear outras fontes.

### RF-006 — Acompanhar o carregamento e a separação

**Confirmado.** Exibir a atividade de leitura e organização dos conteúdos em canais, filmes e séries.

**Aceite proposto:** mostrar etapa e contadores reais; distinguir séries de episódios. Quando o total for desconhecido, não inventar percentual. Distinguir catálogo parcial de importação concluída. Atraso de capa, IMDb ou recomendação não impedirá acessar conteúdo básico já publicado. Sair da tela e retornar permitirá consultar o estado do trabalho.

### RF-007 — Múltiplas fontes e atualização

**Confirmado em documentação anterior.** Manter múltiplas listas sem obrigar a substituir uma pela outra.

**Aceite proposto:** atualizar uma fonte sem duplicar seus registros nem apagar favoritos/histórico. Categorias homônimas de fontes diferentes manterão a origem identificável. Falha durante atualização conservará a última versão utilizável. Ao remover uma fonte, informar o tratamento de seu histórico e não remover dados de outra.

## 3. Catálogo e reprodução

### RF-008 — Canais pelos grupos da lista

**Confirmado.** Ao entrar em Canais, visualizar os grupos definidos pela fonte, selecionar um canal e começar a assistir.

**Aceite:** nomes e associações dos grupos serão preservados. Com fonte e aparelho compatíveis, selecionar um canal iniciará reprodução. Ausência de logotipo não impedirá assistir. Falha do stream manterá a navegação e permitirá escolher outro canal.

### RF-009 — Séries por categorias, com grid de capas e nomes

**Confirmado.** Visualizar as categorias da fonte e, em cada uma, suas séries com capa e nome.

**Aceite proposto:** quando a fonte permitir identificar a hierarquia, mostrar um cartão por série, abrir temporadas e listar episódios disponíveis. Não exibir cada episódio como uma série distinta. Se a identificação for insuficiente, manter o conteúdo acessível e indicar a limitação, sem inventar hierarquia. Imagem padrão será usada quando não houver capa.

### RF-010 — Filmes por categorias, com recursos equivalentes

**Confirmado.** Aplicar a filmes a navegação por categoria, grid, capa/nome, pesquisa, favorito e indicação de visualização anterior.

**Aceite:** preservar categorias da fonte, abrir detalhes e permitir reprodução compatível. Enriquecimento não substituirá silenciosamente as categorias por gêneros externos.

### RF-011 — Tratar classificação incompleta

**Proposto para realizar RF-006 a RF-010 com fontes incompletas.** Manter seção “Não classificados” e informações de origem quando não houver evidência confiável de tipo, série ou episódio.

**Aceite:** entrada válida mas ambígua não desaparece nem recebe classificação arbitrária. Uma correção/regra de fonte poderá ser reaplicada sem apagar preferências. A lista completa de formatos/amostras suportados será documentada após teste.

## 4. Pesquisa, favoritos e histórico

### RF-012 — Pesquisa nos três tipos

**Confirmado.** Pesquisar canais, filmes e séries.

**Aceite proposto:** consultar por nome e tornar visível o escopo/filtros. Uma pesquisa sem resultado mostra estado vazio, não erro. Offline, pesquisar a parte salva e informar quando a cobertura for parcial. Pesquisa não exigirá OpenAI ou conta CCPlay.

### RF-013 — Favoritos nos três tipos

**Confirmado.** Favoritar e desfavoritar canais, filmes e séries e identificá-los na navegação.

**Aceite:** refletir a alteração imediatamente, persistir quando o armazenamento permitir e restaurar após fechar/reabrir. Não marcar como assistido ou gostei ao favoritar. Reimportação não apagará o estado; falha de persistência será informada.

### RF-014 — Indicação de visualização anterior

**Confirmado.** Indicar se a pessoa já assistiu anteriormente a canal, filme ou série.

**Semântica proposta:** canal mostra “Já assistido”/último acesso; filme distingue histórico, progresso e conclusão; série distingue algum episódio visto de estar em dia com episódios disponíveis. Regras automáticas e ações manuais serão explícitas.

**Aceite:** tentativa de play com erro não registra visualização bem-sucedida. Um episódio iniciado não conclui a série inteira. Canal ao vivo não é tratado como obra finalizada. Novo episódio não apaga histórico anterior. Deve haver correção manual; percentuais/limiares automáticos continuam por definir.

### RF-015 — Registrar filmes de que gostou

**Confirmado pelo requisito de recomendações baseadas em gosto.** Permitir informar e retirar um sinal positivo para um filme, independentemente do favorito ou do histórico.

**Aceite proposto:** o usuário consegue gostar sem favoritar e favoritar sem gostar. Alterar esse sinal não apaga progresso. O estado é preservado localmente sem conta e utilizado na próxima atualização de recomendações. “Não gostei” é evolução proposta, não obrigação adicional desta revisão.

## 5. Recursos adicionais

### RF-016 — Consultar/ordenar filmes por índice IMDb

**Confirmado como recurso adicional.** A interpretação proposta de “índice” é a nota agregada IMDb, não posição no Top 250 ou popularidade.

**Aceite proposto:** mostrar nota de origem verificável ou “Sem avaliação”. Ordenar o resultado filtrado pela nota antes da paginação, mantendo itens sem nota no final e desempate estável. Não substituir IMDb por nota TMDB ou inventar nota com IA. Falha do serviço não bloqueará o player. A fonte/licenciamento dos dados deve ser definido antes da entrega do recurso.

### RF-017 — Recomendar a partir de filmes de que gostou

**Confirmado como recurso adicional.** Recomendar filmes com base no gosto explícito registrado.

**Aceite proposto:** considerar sementes reais de “Gostei”, retornar candidatos existentes nas fontes do perfil e explicar o critério aplicado. Não inventar disponibilidade/URLs. Sem sinais, mostrar orientação ou sugestões genéricas identificadas. Remover um gosto afeta o próximo cálculo, sem alterar histórico. Resultados externos ao catálogo só aparecerão numa área claramente separada, caso ela seja implementada.

### RF-018 — Evoluções já registradas

**Mantido da documentação anterior:** voz com transcrição/OpenAI e futuro controle Android. As decisões das ADR-001 e ADR-003 continuam válidas; estes recursos não serão condição para usar controle remoto, catálogo e reprodução local.

YouTube, “TV local” e Google permanecem intenções anteriores a esclarecer. Este documento não remove esses itens, não define suas integrações e não os apresenta como entregues.

## 6. Critérios transversais propostos

**Resiliência:** perder backend não exigirá login, nem apagará cache ou desabilitará comandos locais. Mídia remota ainda depende de fonte/autorização/rede. Preferências locais devem continuar operáveis dentro dos limites de armazenamento.

**Fluidez:** foco, Voltar e controle de reprodução não aguardarão enriquecimento ou IA. Avaliar no aparelho, com volume de catálogo identificado; não converter metas em promessas de desempenho.

**Privacidade e segurança:** isolar dados por instalação/perfil e fonte, proteger segredos, não registrá-los em logs e validar URLs/uploads. Abrir sem conta não significa tornar dados privados públicos.

**Erros:** distinguir credencial inválida, fonte indisponível, arquivo inválido, importação com avisos, sem classificação, sem capa, sem nota e cache parcial.

## 7. Rastreabilidade e pendências

| Requisitos | Documentos principais |
| --- | --- |
| RF-001 a RF-007 | ADR-004; suporte de execução na ADR-003. |
| RF-008 a RF-017 | ADR-005; reprodução na ADR-001. |
| Estado local e falhas | ADR-002. |
| Voz/Android e stack | ADR-001 e ADR-003. |

Pendentes de decisão/validação: modelo e firmware da TV, leitura de arquivo/USB, protocolo real do provedor, limites de entrada, identidade técnica, persistência de jobs, regras automáticas de assistido, eventual conta CCPlay, fornecedor/licença IMDb, critérios de recomendação e conflitos entre dispositivos. Essas pendências não anulam os requisitos; delimitam o trabalho necessário para implementá-los.
