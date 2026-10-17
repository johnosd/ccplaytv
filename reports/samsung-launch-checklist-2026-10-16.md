# Análise de prontidão para publicação — Samsung TV Seller Office

**Data:** 16 de outubro de 2026  
**Referência normativa:** [Samsung Developer — Launch Checklist](https://developer.samsung.com/tv-seller-office/checklists-for-distribution/launch-checklist.html)  
**Escopo:** inspeção estática do repositório e do artefato `.wgt` já existente. Não houve login, upload ou submissão no Seller Office.

## Veredito

**BLOQUEADO para submissão neste momento.**

O manifesto e a estrutura básica do pacote têm evidências positivas, mas o `.wgt` assinado não corresponde aos assets atualmente sincronizados, e não há evidência local de todo o kit obrigatório de publicação (Application UI Description, screenshots da loja, metadados públicos, contato e acesso de teste). Um build comercial também precisa de política de privacidade se o portal/licenciamento fizer parte da versão enviada.

Isso é uma análise de prontidão, não uma aprovação de certificação. A Samsung ainda precisa executar o pré-teste e a revisão do pacote.

## Evidência e limites da análise

- Snapshot do repositório: branch `feature/licenca`, commit `2493a13c3ac3a7915ac7c42f9baca63b6ec60145`.
- O worktree está em desenvolvimento ativo, com 90 caminhos modificados ou novos; o pacote existente não deve ser presumido como o resultado desses arquivos.
- Artefato inspecionado: `CCPlayTv/.buildResult/CCPlayTv.wgt`, 825.143 bytes, SHA-256 `07A320F1353E7A3DC1FF2C3A5A77835BB804F6369FD0A883E82EF7343C637A08`.
- `config.xml` do pacote é byte-a-byte igual ao `CCPlayTv/config.xml` atual e o XML é bem-formado.
- Não foram executados nesta análise: `npm run build:tizen`, testes Vitest/E2E, Seller Office pre-test, emulador ou confirmação em TV física.

## Checklist confrontado com o projeto

| Área do checklist Samsung | Situação observada | Classificação |
| --- | --- | --- |
| **Packaging** — `config.xml`/manifesto, `author-signature.xml`, `signature1.xml` | Os três arquivos estão dentro do `.wgt` inspecionado. | **Passa estruturalmente** |
| **Packaging** — pacote candidato representa o código atual | 11 assets do `.wgt` têm hash diferente dos mesmos caminhos em `CCPlayTv/assets`: `HistoryRemovalModal.js`, `index.js`, `route-add-source.js`, `route-epg-settings.js`, `route-import-progress.js`, `route-list-settings.js`, `route-radio.js`, `route-settings.js`, `route-source-access.js`, `route-tmdb-key.js` e `SourcesPanel.js`. | **P0 — bloqueador** |
| Multi-arquitetura | O projeto é um Web App `tv-samsung`; não há evidência de suporte a arquiteturas múltiplas que exija pacote integrado. | **Não aplicável, confirmar no cadastro** |
| **Privileges** | `productinfo` e `network.public` estão declarados. A documentação Samsung os classifica como privilégios **Public** ([ProductInfo](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/productinfo-api.html), [Network](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/network-api.html)). `tv.inputdevice` é usado para teclas, `internet` para rede, `application.launch` para sair do app e `unlimitedstorage` para o catálogo local. Não há `adinfo`, `billing` ou `smartcontroller.microphone`. | **Passa estaticamente; testar no grupo de TVs** |
| **Tizen ID / Package ID** | `tizen:application id="8tZqMtwANL.CCPlayTv"`, package `8tZqMtwANL`; formato sem caracteres especiais. | **Passa formato; continuidade no Seller Office pendente** |
| **Application Version** | `0.2.1`, compatível com o formato de três componentes. | **Passa formato; precisa ser maior que a versão publicada** |
| **API Version** | `required_version="2.3"`, no formato exigido. | **Passa sintaxe; compatibilidade real não comprovada** |
| **Application Title** | Manifesto usa `CCPlayTv`. A igualdade com o título do idioma padrão no Seller Office não pode ser confirmada sem acesso à conta. | **Pendente** |
| **Screensize** | `screen.size.normal.1080.1920` está declarado; orientação é landscape. | **Passa estaticamente; conferir modelos selecionados** |
| **Privilege API proporcional** | O manifesto contém privilégios justificáveis pelo código atual, mas a versão comercial deve ser revalidada depois do congelamento do escopo portal/licença. | **Pendente de matriz final** |
| **Package Security** | Assinaturas estão presentes no `.wgt`; não há como provar que `author-signature.xml` é a mesma assinatura da versão já publicada. | **P1 — continuidade pendente** |
| **Application UI Description** | Não foi encontrado no repositório um template preenchido para esta versão. O guia interno existente (`docs/guia-praticas-app-tv/10_checklist_de_lancamento.md`) é orientação, não o arquivo oficial preenchido. | **P0 — material de submissão ausente** |
| **Logo / background / screenshots** | O único ícone empacotado é `CCPlayTv/icon.png` (117×117 PNG, 2.896 bytes). Não foi encontrado conjunto dedicado de logo transparente, fundo e quatro JPEGs de loja. Imagens em `.playwright-mcp`, `test-results` e `sdd` são evidências de desenvolvimento, não assets de publicação. | **P0 — material de loja ausente** |
| **Título e descrição por idioma** | O app tem i18n pt/en/es, mas isso não prova que título e descrição de loja foram cadastrados nesses idiomas. | **P1 — confirmar no Seller Office** |
| **Privacy policy URL** | O código do portal pode enviar o DUID e MAC da TV no cadastro (`tv-web/src/lib/portal/portalConnection.ts`) e pode enviar URL/usuário/senha de fontes ao serviço (`tv-web/src/lib/portal/sourceUploads.ts`). Não há URL pública de política de privacidade identificada no snapshot. | **P0 condicional ao build portal/comercial** |
| **VOC / contato** | Não há evidência de contato de suporte pronto para o cadastro. | **P0 — material de submissão ausente** |
| **Test account / voucher** | A aplicação é client-first e usa fontes fornecidas pela pessoa; ainda é necessário preparar fonte de demonstração autorizada e credenciais de teste suficientes para o revisor. `docs/m3u/dados.md` é credencial real ignorada pelo Git e não deve ser enviada. | **P0 — material de teste ausente** |

## Achados prioritários

### P0 — Reconstruir e congelar o pacote

O artefato assinado existente foi produzido antes dos assets que hoje estão em `CCPlayTv/assets`; a comparação de SHA-256 mostrou 11 divergências. O próximo pacote deve ser gerado a partir de uma revisão limpa e só então ter seus arquivos, manifesto, assinatura e hash arquivados juntos. Não submeter o `.wgt` atual como representação do worktree.

### P0 — Completar o kit de Seller Office

Preparar, para a mesma versão do pacote:

1. Application UI Description no template oficial, incluindo telas, comandos do controle, idiomas e fluxos condicionais.
2. Logo transparente, fundo, ícone de loja e quatro screenshots JPEG da versão executável, sem URLs privadas, credenciais ou conteúdo não autorizado.
3. Título, descrição e idioma padrão alinhados ao `name`/`label` do manifesto.
4. E-mail de VOC monitorado.
5. Fonte e conta de demonstração estáveis, autorizadas e com crédito para testar importação, catálogo e reprodução.

### P0 condicional — Decidir o tratamento de dados antes do build comercial

O portal não é apenas telemetria local: a implementação prevê identificação da TV e envio remoto das configurações de fonte, incluindo credenciais de provedor em ações explícitas. Se essa capacidade estiver no pacote enviado, publicar uma política de privacidade acessível e refletir exatamente o tratamento, retenção, exclusão e contato. Se a primeira distribuição não incluir portal/licenciamento, gerar e auditar explicitamente um build sem essa configuração, em vez de depender de variável ausente por acidente.

### P1 — Separar Debug de Release

`CCPlayTv/tizen_web_project.yaml` está com `build_type: Debug`. O checklist exige um pacote submetível e assinado; antes do envio, gerar o pacote com o perfil de release/comercial aprovado e registrar qual perfil/certificado foi usado. A presença de assinatura no `.wgt` não prova que ele é o candidato de release nem que preserva a assinatura de uma versão publicada.

### P1 — Fechar a matriz de TVs

`required_version="2.3"` pode levar o cadastro a declarar suporte a TVs antigas. O build Vite está direcionado a `chrome108`, e não há nesta análise evidência de execução nos modelos que seriam selecionados. Escolher os modelos realmente suportados, testar instalação/atualização e ajustar `required_version` ou a seleção do Seller Office para não prometer compatibilidade não testada.

### P2 — Limpar o inventário Tizen

`tizen_web_project.yaml` declara 65 arquivos, mas três entradas (`assets/FavoritesState.js`, `assets/TextField.js`, `assets/useEnterSimilarPanel.js`) não aparecem no `.wgt`; não há assets emitidos no pacote fora da lista. Isso não invalida sozinho a assinatura, mas deixa o inventário de empacotamento inexato. O guard deve também detectar entradas declaradas que deixaram de existir, ou as entradas obsoletas devem ser removidas após o build final.

## Critérios de aceite para mudar o veredito

- [ ] Worktree/revisão de release congelado; `npm run build:tizen` (ou fluxo comercial equivalente) executado a partir dessa revisão.
- [ ] Manifesto, assets sincronizados e `.wgt` comparados; nenhum asset divergente ou ausente; hash do pacote registrado.
- [ ] `.wgt` contém `config.xml`, `author-signature.xml` e `signature1.xml`; certificado de autor é o mesmo da versão publicada quando for atualização.
- [ ] Tizen ID/package ID, versão, título padrão, `required_version` e grupo de modelos conferidos no Seller Office.
- [ ] Matriz de privilégios aprovada; nenhum privilégio opcional sem funcionalidade correspondente.
- [ ] Application UI Description preenchido para a mesma versão.
- [ ] Assets de loja aprovados: logo/fundo/ícone e quatro screenshots dentro das dimensões e limites de tamanho exigidos pelo portal.
- [ ] Descrições e títulos públicos em todos os idiomas suportados, contato de VOC e países autorizados conferidos.
- [ ] Conta/fonte de teste autorizada, com roteiro para importação, Live, Filme, Série, erro de rede e reprodução.
- [ ] Política de privacidade publicada se o build coletar/enviar identificadores de dispositivo, credenciais ou outros dados pessoais.
- [ ] Seller Office pre-test executado e, depois, instalação/atualização verificadas no emulador e na TV física selecionada.

## Conclusão

O projeto está tecnicamente bem encaminhado no manifesto: XML, versão, tela, IDs e privilégios têm evidência estática favorável, e o pacote contém as assinaturas exigidas. Ainda assim, a submissão deve ser **adiada** até reconstruir o `.wgt` contra o código atual e completar o kit de publicação e a decisão de privacidade do portal. A aprovação só deve ser declarada depois do pre-test do Seller Office e das verificações de modelo/TV; testes de navegador, existência de um `.wgt` e presença de assinaturas não substituem esses gates.
