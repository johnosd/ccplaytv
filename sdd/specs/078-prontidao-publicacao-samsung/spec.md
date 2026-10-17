# Feature Specification: Prontidão para publicação do app Samsung TV

**Slug**: `078-prontidao-publicacao-samsung`

**Created**: 2026-10-16

**Status**: Em Execução

**Input**: "Fazer uma análise baseada no checklist de lançamento da Samsung TV Seller Office e transformar isso em um sdd-specify para deixar o app pronto para publicação. Incluir o kit como entregável rastreável, sem obrigar a criação artística nesta spec; cobrir os builds base e comercial/portal; usar política de privacidade como gate condicional; limitar a primeira distribuição aos modelos e países comprovados, embora a intenção futura seja ampla."

**Referência externa**: [Samsung TV Seller Office — Launch Checklist](https://developer.samsung.com/tv-seller-office/checklists-for-distribution/launch-checklist.html)

## Escopo

Esta feature cria um gate interno, repetível e auditável de prontidão para publicação no Samsung TV Seller Office. Ela organiza candidatos de release, evidências técnicas, matriz de compatibilidade, kit de publicação e decisão de liberação. O Seller Office continua sendo operado manualmente.

### Incluído

- Candidato de release separado para o build **base** e, quando selecionado para distribuição, para o build **comercial/portal**, cada um vinculado à revisão do código, modo de build, configuração, versão, arquivo `.wgt`, hash e estado da árvore de trabalho.
- Conferência do pacote Tizen e do inventário de arquivos emitidos: `config.xml`, `author-signature.xml`, `signature1.xml`, Tizen ID, Package ID, versão, privilégios (com nível public/partner/platform), `required_version` coerente com os modelos-alvo, `screensize` (tag `feature`), orientação e arquivos declarados no projeto.
- Lista de itens do checklist com ID estável (base: L01–L10 de `docs/guia-praticas-app-tv/10_checklist_de_lancamento.md`, estendida pelos itens da página oficial), cada um classificado como **obrigatório Samsung** ou **critério interno**.
- Custódia do certificado de autor (identidade registrada, backup fora do repositório) como pré-condição de qualquer atualização futura.
- Multi-arquitetura: para o `.wgt` Web atual, registrado como `Not Applicable` com justificativa; só conferido (estrutura em zip único, até 10 pacotes do mesmo tipo, `architecture` vinculado ao quarto dígito de versão) se um candidato futuro de fato abranger mais de uma arquitetura.
- Matriz inicial de países, modelos e firmware comprovados, com evidência por combinação e estado permitido/pendente/bloqueado. A aprovação inicial não presume cobertura mundial.
- Kit completo e rastreável do Seller Office, com manifest de artefatos, proprietário, versão, hash, origem e estado. O kit pode receber artes já fornecidas; a criação artística não é requisito desta feature.
- Application UI Description, identidade da aplicação, ícone/logo/background, screenshots, textos de listagem, idiomas, contato/VOC e acesso de demonstração, conforme aplicável ao candidato.
- Página pública de política de privacidade em HTTPS e seu vínculo com o candidato quando ele coleta, armazena ou envia dados pessoais, identificadores do dispositivo, credenciais de provedor ou dados equivalentes. A existência e o vínculo técnico são gate; revisão jurídica do texto fica fora do escopo.
- Gates de validação estática, build/testes, navegador, emulador Tizen e TV física, registrados como evidências distintas, com modelo, firmware, data, resultado e limitações.
- Verificação de instalação/atualização assinada e de preservação de dados do usuário, sem desinstalação casual, quando houver candidato para atualização.
- Relatório final com itens `Pass`, `Blocked`, `Pending`, `Not Applicable` ou `Waived`, evidências, responsáveis, próxima ação e decisão de prontidão.

### Fora de Escopo

- Login, upload, preenchimento ou submissão automática no Samsung TV Seller Office, nem qualquer outra ação externa irreversível.
- Criação ou direção artística de logos, backgrounds, screenshots ou peças de marketing; esta feature apenas exige que o artefato fornecido esteja presente, válido e rastreável.
- Parecer jurídico ou garantia de suficiência legal da política de privacidade; também não inclui contratar serviço jurídico.
- Novas funcionalidades do app, mudanças no portal, pagamentos, licenciamento ou expansão de arquitetura para atender ao checklist.
- Aprovar modelos, firmwares ou países sem evidência reproduzível, ou declarar suporte amplo com base apenas em navegador/emulador.
- Guardar credenciais reais, chaves, M3U ou segredos no repositório, kit, logs, screenshots ou relatório.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gerar candidato identificável (Priority: P1)

Como responsável pelo release, quero produzir um candidato base ou comercial/portal cuja origem e artefato sejam inequívocos, para não enviar um `.wgt` antigo, divergente ou impossível de reproduzir.

**Independent Test**: selecionar uma revisão limpa, gerar o candidato, conferir a versão e o hash no relatório e demonstrar que o inventário do pacote corresponde ao build selecionado. Repetir para cada variante de distribuição escolhida.

### User Story 2 - Passar pelo gate técnico do pacote (Priority: P1)

Como revisor, quero ver IDs, versão, assinatura, privilégios, requisitos de plataforma e arquivos emitidos conferidos, para identificar bloqueios antes do Seller Office.

**Independent Test**: executar a verificação contra um pacote válido e contra amostras com assinatura, versão, ID ou arquivo declarado inválidos; o relatório deve distinguir aprovação e bloqueio e apontar a evidência.

### User Story 3 - Limitar a distribuição ao que foi comprovado (Priority: P1)

Como responsável pelo lançamento, quero uma matriz explícita de país/modelo/firmware, para que a primeira distribuição só anuncie combinações realmente verificadas.

**Independent Test**: registrar pelo menos uma combinação comprovada e uma não comprovada; somente a primeira pode entrar no conjunto aprovado, e a segunda deve permanecer pendente ou bloqueada.

### User Story 4 - Entregar um kit de publicação rastreável (Priority: P1)

Como pessoa que fará o cadastro manual no Seller Office, quero localizar cada artefato e metadado exigido em um kit versionado, para preencher o cadastro sem procurar arquivos soltos nem expor segredos.

**Independent Test**: abrir o manifest do kit, localizar cada item exigido (ou sua justificativa `Not Applicable`), conferir hash/owner/status e verificar que screenshots, textos e acessos de demonstração são sanitizados.

### User Story 5 - Tratar privacidade conforme o build (Priority: P1)

Como revisor, quero saber se o candidato precisa de uma política pública e qual URL será informada, para não liberar um build que coleta dados sem o gate correspondente.

**Independent Test**: avaliar um candidato com coleta/transmissão de dados e outro sem essa condição; o primeiro bloqueia sem URL pública HTTPS válida, enquanto o segundo pode registrar `Not Applicable` com justificativa e evidência.

### User Story 6 - Separar evidência de emulador e TV física (Priority: P1)

Como responsável pela qualidade, quero registrar emulador e TV física como gates independentes, para que uma validação de navegador ou emulador não seja apresentada como prova de AVPlay, codecs, controle remoto ou comportamento do aparelho.

**Independent Test**: executar o roteiro em um emulador e em uma TV física de referência; o relatório deve identificar cada ambiente e permanecer `Pending`/`Blocked` quando um deles não estiver disponível.

### User Story 7 - Repetir o gate após uma mudança (Priority: P2)

Como mantenedor, quero repetir o processo após qualquer alteração e obter um relatório novo, para detectar kit ou pacote obsoleto antes da decisão final.

**Independent Test**: alterar a revisão ou a versão, rerodar o gate e confirmar que hash, evidências e estado do relatório são atualizados e que o candidato anterior não é reutilizado silenciosamente.

### Edge Cases

- `.wgt` ou kit originado de revisão diferente, árvore suja, arquivo não listado ou arquivo obsoleto na pasta de empacotamento.
- Assinatura de autor não disponível, diferente da usada na atualização ou incompatível com o perfil esperado; pacote de debug apresentado como release.
- ID Tizen duplicado/alterado, versão inválida, versão que se sobrepõe a um pacote já enviado ou não superior à última versão **publicada no Seller Office** (não apenas à instalada na TV de teste).
- Tizen ID confundido com o App ID do Seller Office, ou Package ID/nome de pacote já registrado por outro app.
- `required_version` que oferece o app a grupos de modelos mais antigos que o alvo real do build (hoje `required_version="2.3"`, que inclui TVs 2015/2016, contra build `chrome108`).
- Privilégio declarado sem justificativa funcional, privilégio ausente para comportamento usado, privilégio partner sem autorização do Samsung Content Manager, ou privilégio da lista nominal do checklist sem o recurso correspondente — por exemplo `productinfo` (da tríade do Samsung Checkout) declarado sem uso de Checkout; `adinfo` sem anúncio; `smartcontroller.microphone` sem consulta prévia; `keymanager`/`systemmanager`/`websetting` (descontinuados).
- Builds base e comercial compartilhando o mesmo `config.xml`, levando para o build base privilégios exigidos apenas pelo comercial/portal.
- `name` do pacote diferente do título do idioma padrão apenas por caixa ou grafia (ex.: `CCPlayTv` vs. "CCPlayTV").
- Certificado de autor perdido, sem backup ou sem identidade registrada, impedindo atualização futura.
- Build base e comercial/portal com comportamento ou metadados divergentes, ou variante comercial selecionada sem configuração e evidência próprias.
- País/modelo/firmware fora da matriz comprovada, dispositivo indisponível, TV offline ou emulador sem suporte para o cenário.
- Atualização feita com certificado diferente, ou validação que tenta preservar dados após desinstalação/limpeza.
- URL de privacidade ausente, inacessível, não HTTPS ou incoerente com o conjunto de dados usado pelo candidato.
- Conta/lista de demonstração expirada, sem autorização, sem conteúdo reproduzível ou com credenciais aparecendo em logs, imagens ou metadados.
- Build comercial cujo revisor fica preso no fim do trial ou sem licença válida, ou acesso de teste que expira antes do fim da janela de revisão.
- `Waived` aplicado a um item obrigatório Samsung (assinatura, privilégio, screenshots, título, política de privacidade exigida).
- Screenshot com dimensão/formato/tamanho inválido, conteúdo de debug, dados pessoais ou textos divergentes da listagem.
- Testes de navegador verdes enquanto a validação física falha ou não foi executada; o resultado deve conservar a limitação, não fazer substituição automática.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O processo deve identificar revisão, estado da árvore, variante, modo/configuração, versão, artefato e hash do candidato; uma árvore suja não pode resultar em `Pass` silencioso.
- **FR-002**: O processo deve permitir candidatos independentes para base e comercial/portal e registrar quando uma variante não faz parte da distribuição atual.
- **FR-003**: O processo deve conferir se o pacote é bem-formado, contém `config.xml`, `author-signature.xml` e `signature1.xml`, e se Tizen ID, Package ID, versão, assinatura de autor, assinatura de distribuição, `screensize` (tag `feature`) e requisitos de plataforma são válidos para a variante; um pacote de debug não pode passar como release.
- **FR-003a**: O processo deve validar a versão no formato `[0–255].[0–255].[0–65535]` e o formato `x.y` de `required_version`. Para o `.wgt` Web atual, multi-arquitetura é `Not Applicable` com justificativa; se um candidato abranger mais de uma arquitetura, deve conferir o zip único, o limite de 10 pacotes do mesmo tipo, o quarto dígito `0–99999` e o vínculo entre `architecture` e esse dígito.
- **FR-003b**: O processo deve exigir que `required_version` seja coerente com o modelo/ano mais antigo comprovado na matriz (FR-006) e com o alvo de runtime do build; um valor que ofereça o app a grupos de modelos não suportados deixa o item `Blocked`.
- **FR-003c**: O processo deve registrar o Tizen ID e, após o cadastro, o App ID do Seller Office como identidades distintas e vinculadas; deve conferir que o Package ID é único, sem caracteres especiais, e incluir uma verificação manual de que o nome do pacote não colide com app já registrado.
- **FR-004**: O processo deve comparar o inventário emitido com os arquivos declarados no projeto, detectando ausências, extras e artefatos obsoletos antes de liberar o pacote.
- **FR-005**: O processo deve listar cada privilégio declarado por variante com nível (public/partner/platform), comportamento que o justifica e, se partner, a evidência de autorização do Samsung Content Manager. Deve aplicar as regras nominais do checklist: `adinfo` somente com anúncio no app; `sso.partner`/`productinfo`/`billing` somente com Samsung Checkout (qualquer exceção, como `productinfo` usado para identidade do dispositivo, exige confirmação explícita registrada ou fica `Blocked`); `smartcontroller.microphone` somente com consulta prévia; `keymanager`, `systemmanager` e `websetting` proibidos. Não deve introduzir privilégios apenas para satisfazer o checklist, e o build base não deve herdar privilégios que só o comercial/portal usa.
- **FR-006**: O processo deve manter a matriz de país/modelo/firmware com evidência, data, ambiente, resultado e estado permitido; itens sem prova não podem entrar no conjunto aprovado.
- **FR-007**: O processo deve verificar o caminho de atualização com a mesma assinatura de autor da versão anterior, comparar a versão do candidato com a última versão enviada/publicada no Seller Office (registrada no kit) e com a instalada na TV de teste, e registrar critérios de preservação de catálogo, preferências, favoritos e histórico quando aplicável.
- **FR-007a**: O processo deve registrar a identidade do certificado de autor (sem a chave privada nem a senha) e a existência de backup em armazenamento seguro fora do repositório; sem essa evidência, o candidato não pode ser `Ready for submission`.
- **FR-008**: O kit deve possuir um manifest versionado, com artefato, caminho, hash, proprietário, estado e justificativa para cada item `Not Applicable`, sem exigir a criação artística nesta feature.
- **FR-009**: O kit deve incluir ou apontar para a Application UI Description, identidade, imagens, screenshots, textos de listagem, idiomas, contato/VOC e instruções de acesso de demonstração exigidos pela distribuição selecionada.
- **FR-010**: O processo deve validar a transparência do logo, o background do ícone e quatro screenshots JPEG menores que 500 kB em 1280x720 ou 1920x1080 (exigência fixa do checklist), além da ausência de segredos, debug ou dados pessoais nos itens de mídia e metadados do kit.
- **FR-010a**: O processo deve conferir que o `name` do pacote coincide exatamente (inclusive caixa e grafia) com o título do idioma padrão no Seller Office e que títulos e descrições estão disponíveis em cada idioma suportado.
- **FR-011**: Para qualquer variante que colete, armazene ou transmita dados pessoais, identificadores do dispositivo, credenciais de provedor ou dados equivalentes, o processo deve exigir uma página pública de privacidade em HTTPS e registrar sua URL; a não aplicabilidade deve ser justificada por evidência. O checklist só exige a política quando há dados pessoais; a ampliação para identificadores e credenciais é decisão deste projeto.
- **FR-012**: O acesso de demonstração deve ser autorizado, sanitizado, reproduzível e mantido fora do repositório e dos logs, com proprietário e validade registrados sem expor o segredo. A validade deve cobrir a janela de revisão e todos os modelos/plataformas selecionados na matriz; para o build comercial/portal, deve incluir licença ou voucher de teste que permita usar o app além do trial.
- **FR-013**: O processo deve registrar separadamente evidências estáticas, de build/teste, navegador, emulador Tizen e TV física, incluindo dispositivo/firmware, data, roteiro, resultado e limitações.
- **FR-014**: O relatório deve bloquear a decisão em qualquer item bloqueador (todo item obrigatório Samsung e os critérios internos marcados como bloqueadores) que não esteja `Pass` ou `Not Applicable` justificado, e deve tornar explícitos itens `Pending`, `Not Applicable` e `Waived`, incluindo responsável, justificativa e próxima ação.
- **FR-014a**: `Waived` só é permitido para critérios internos; um item obrigatório Samsung nunca pode ser dispensado.
- **FR-014b**: Cada item do checklist deve ter ID estável (L01–L10 do doc 10, estendidos pelos itens da página oficial) usado igualmente no relatório, no manifest do kit e nas evidências.
- **FR-015**: O processo não deve autenticar, preencher, enviar ou submeter dados automaticamente ao Seller Office; sua saída é preparação, validação e material para operação manual.
- **FR-016**: Nenhum relatório, kit, log, screenshot ou erro deve conter credenciais, chaves, M3U, URLs de reprodução autenticadas ou outro segredo real.

### Key Entities

- **ReleaseCandidate**: variante, revisão, estado da árvore, modo/configuração, versão, última versão publicada, Tizen ID, App ID do Seller Office, `required_version`, `.wgt`, hash, identidade do certificado de autor e estado do gate.
- **ChecklistItem**: ID estável, origem (página oficial ou doc 10), classe (obrigatório Samsung / critério interno), bloqueador sim/não, status e evidência.
- **PrivilegeEntry**: variante, privilégio, nível public/partner/platform, comportamento que justifica, regra nominal do checklist aplicável e evidência de autorização.
- **TargetMatrixEntry**: país, modelo, firmware, ambiente, evidência, data, estado permitido e limitações.
- **PublicationKitItem**: artefato/metadado, tipo, versão, caminho, hash, proprietário, status e justificativa de não aplicabilidade.
- **PrivacyDeclaration**: variante, categorias de dados, necessidade do gate, URL pública HTTPS, data de verificação e evidência.
- **DemoAccess**: referência sanitizada do acesso autorizado, proprietário, validade, escopo e local seguro do segredo.
- **ValidationEvidence**: gate, comando/roteiro, ambiente, dispositivo, resultado, timestamp, limitações e vínculo com o candidato.
- **LaunchDecision**: status final, bloqueios, pendências, waivers, responsáveis, próxima ação e candidato avaliado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos itens do checklist têm ID e status `Pass`, `Blocked`, `Pending`, `Not Applicable` ou `Waived` com evidência e responsável; nenhum item fica implícito e nenhum item obrigatório Samsung está `Waived`.
- **SC-002**: Cada variante aprovada tem um candidato identificado por revisão, versão e hash, e nenhuma divergência de inventário/artefato obsoleto permanece sem bloqueio explícito.
- **SC-003**: 100% das combinações no conjunto inicial de distribuição aparecem na matriz com modelo, firmware, país e evidência; combinações não comprovadas não são anunciadas como suportadas.
- **SC-004**: O kit contém ou referencia todos os artefatos aplicáveis, cada um com owner/status/hash, sem segredos e sem depender de arquivos não rastreados fora do kit.
- **SC-005**: Todo candidato sujeito ao gate de privacidade aponta para uma página pública HTTPS verificável; candidatos sem esse requisito trazem justificativa técnica registrada.
- **SC-006**: Cada afirmação de validação em emulador ou TV física identifica o ambiente real, modelo/firmware e data; navegador não é contado como substituto de qualquer gate de hardware.
- **SC-007**: Em uma atualização do cenário de referência, os dados do usuário definidos no roteiro permanecem disponíveis sem desinstalação ou limpeza usada apenas para mascarar falha.
- **SC-008**: Qualquer bloqueio P1 impede a decisão `Ready for submission`, e o relatório informa claramente o próximo passo para desbloqueio.
- **SC-009**: Após uma mudança de código, versão, assinatura, matriz ou kit, uma nova execução produz hash/relatório atualizados e detecta o candidato anterior como obsoleto.
- **SC-010**: Para o pacote atual, o relatório classifica explicitamente `required_version="2.3"` e o privilégio `productinfo` — como `Pass` com evidência de coerência/autorização ou como `Blocked` com próxima ação — e nunca os deixa sem decisão.

## Assumptions

- O Seller Office, a conta do publicador e o perfil de assinatura são externos a esta feature e serão usados manualmente por pessoa autorizada.
- A distribuição inicial será deliberadamente limitada aos países, modelos e firmwares para os quais o projeto conseguir evidência; a expansão posterior será uma decisão futura.
- A política de privacidade pública será entregue pelo projeto como página acessível, enquanto adequação jurídica e tradução legal permanecem responsabilidades fora desta spec.
- Artes e textos podem ser fornecidos por outra frente ou pelo responsável do produto; esta feature verifica presença, rastreabilidade e conformidade, mas não os cria.
- Os dados locais da TV devem ser preservados durante validações de atualização; desinstalação não é estratégia de limpeza ou correção.
- Segredos necessários para teste permanecem em armazenamento seguro e referências sanitizadas podem ser registradas no relatório.
- A execução pode ficar `Pending` quando não houver emulador ou TV física disponível; isso não autoriza declarar prontidão.
- **Risco aberto (fora do Launch Checklist)**: o build comercial vende licença pelo portal, sem Samsung Checkout. A página do Launch Checklist não trata política de pagamento, mas a revisão do Seller Office pode tratar; o tema fica registrado como pergunta a confirmar antes de submeter a variante comercial, não como requisito desta feature.
- Campos e validações do próprio Seller Office (sessão autenticada) não foram inspecionados; o checklist oficial e os docs 02/10 de `docs/guia-praticas-app-tv/` são a base, e divergências encontradas no portal durante o cadastro manual viram itens novos do relatório.

## Clarifications

### Sessão 2026-10-16

- **Objetivo e automação**: incluir preparação, validação e materiais do checklist; não incluir login, upload ou submissão automática no Seller Office.
- **Variantes**: cobrir o build base e o build comercial/portal, tratando a política de privacidade como gate condicional por variante.
- **Evidência**: emulador Tizen e TV física são gates explícitos de aceitação, registrados separadamente; nenhum deles é considerado executado automaticamente pela spec.
- **Kit**: o kit completo é um entregável rastreável desta feature, mas a criação artística não é obrigatória nesta spec.
- **Privacidade**: o projeto deve entregar uma página pública de privacidade; revisão jurídica do conteúdo está fora do escopo.
- **Distribuição inicial**: limitar a modelos e países comprovados, mantendo a intenção de ampliar a cobertura em trabalho futuro.

### Revisão 2026-10-16 (contra o Launch Checklist oficial e o `CCPlayTv/config.xml`)

- **`required_version`**: além do formato `x.y`, passa a exigir coerência com os modelos-alvo; o valor atual `2.3` (TVs 2015/2016) é incompatível com o alvo `chrome108` e precisa de decisão (FR-003b, SC-010).
- **Privilégios**: nível public/partner/platform, autorização partner e regras nominais do checklist explícitas; `productinfo` hoje declarado sem Samsung Checkout fica como item a decidir (FR-005, SC-010).
- **Identidades**: Tizen ID ≠ App ID do Seller Office; Package ID único e verificação manual de nome de pacote (FR-003c).
- **Versão**: faixas explícitas e comparação com a última versão publicada, não só a instalada (FR-003a, FR-007).
- **Multi-arquitetura**: `Not Applicable` para o `.wgt` Web atual (FR-003a).
- **Screenshots**: quatro JPEG < 500 kB é exigência fixa, não condicional (FR-010).
- **Acesso de teste**: inclui licença/voucher para o build comercial e validade cobrindo revisão e plataformas (FR-012).
- **Certificado de autor**: custódia e backup viram pré-condição (FR-007a).
- **Estados**: `Waived` vedado para itens obrigatórios Samsung; IDs estáveis por item; SC-001 alinhado com `Not Applicable` (FR-014, FR-014a, FR-014b).
