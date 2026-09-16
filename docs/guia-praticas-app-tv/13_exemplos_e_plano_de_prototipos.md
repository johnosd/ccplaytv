# 13. Exemplos e plano de protótipos

**Página pesquisada:** General Web Application Samples
**Consulta:** 13 de setembro de 2026
**Link fornecido:** https://developer.samsung.com/smarttv/develop/samples/general-samples.html

> Usar cada exemplo para validar uma capacidade isolada antes de integrá-la ao aplicativo completo.

## 1. O que o catálogo oficial oferece

A página reúne 19 exemplos de funções gerais, como entrada, arquivos, rede, integração com a TV e armazenamento. Os links ajudam a estudar APIs específicas; não representam, por si só, um aplicativo completo de canais, filmes e séries. [1]

| Grupo | Exemplos listados na fonte [1] |
| --- | --- |
| Entrada | RegisterKey; IME. |
| Dados e arquivos | Filesystem; USBStorage; WebStorage; Content; Download; Archive. |
| Sistema e conexão | Network; DeviceInformation; Alarm; LaunchApp; MessagePort. |
| Apresentação e integração | Animation; TVWindow; Preview; PublicPreview; PersonalPreview; Checkout. |

### Prioridades propostas para este projeto

Começar por RegisterKey e IME para testar navegação e cadastro da fonte. Usar Network para estudar conectividade, Filesystem e USBStorage para o percurso de importação local, e WebStorage para uma prova pequena de persistência. DeviceInformation ajuda a organizar a identificação do ambiente de teste. A prioridade é uma decisão deste relatório, não uma ordenação oficial.

### Limite importante do exemplo Filesystem

O README do repositório descreve um navegador do sistema de arquivos virtual. Ele esclarece que leitura e escrita são recursos da API, mas não são demonstradas nesse exemplo. [2] Assim, abrir uma pasta não deve ser apresentado como prova de que o importador M3U já consegue ler e interpretar o arquivo.

> Nesta pesquisa foram consultados o catálogo e a documentação pública associada. Nenhum exemplo foi compilado, instalado em TV ou auditado integralmente.

## 2. Percurso de integração proposto

| Etapa | Experimento | Critério de conclusão |
| --- | --- | --- |
| 1 | Controle e foco | Usar as ações principais sem mouse e manter um único foco visível. |
| 2 | Cadastro de fonte | Preencher, corrigir e confirmar campos pelo teclado da TV. |
| 3 | Entrada de arquivo | Escolher uma fonte local disponível e tratar cancelamento ou remoção. |
| 4 | Importador | Ler, interpretar e validar dados próprios de demonstração. |
| 5 | Persistência | Salvar favoritos de teste e recuperá-los após reiniciar o aplicativo. |
| 6 | Reprodução | Abrir mídia autorizada, tratar eventos e sair sem áudio residual. |
| 7 | Integração | Conectar catálogo e player, preservando foco e posição no retorno. |

### Complemento necessário: exemplos de mídia

O catálogo de mídia da Samsung inclui PlayerAVPlay, PlayerAVMultitasking e exemplos de legendas e DRM. [3] Para este app, estudar primeiro reprodução e ciclo de vida, acrescentando legendas e DRM somente quando os conteúdos e contratos de suporte exigirem. A seleção complementa o link de exemplos gerais solicitado.

### O que não precisa entrar na primeira versão

Tratar Checkout, integrações de preview, TVWindow e comunicação entre apps como opcionais. Não importar uma função só porque o exemplo existe. Para cada dependência adicionada, registrar objetivo, licença aplicável, permissões, aparelhos-alvo e comportamento na ausência do recurso.

### Como aproveitar sem copiar fragilidades

Manter os protótipos separados do código principal. Extrair apenas o comportamento necessário, eliminar dados demonstrativos e envolver a integração em uma interface pequena. Não transportar para produção credenciais, URLs fixas, assinaturas ou escolhas de armazenamento sem revisão.

## 3. Registro e critérios de aceite propostos

| ID | Evidência a produzir |
| --- | --- |
| EX01 | Origem do exemplo, revisão ou data obtida, licença e modificações realizadas. |
| EX02 | Modelo, firmware, versão do ambiente e permissões utilizadas no teste. |
| EX03 | Vídeo ou relatório da capacidade isolada funcionando e dos erros tratados. |
| EX04 | Resultado com e sem recurso opcional, incluindo USB e teclas adicionais. |
| EX05 | Limites conhecidos e decisão de integrar, adaptar ou descartar o exemplo. |

### Critério de encerramento da prova

Um exemplo só deve ser considerado validado para o projeto quando a capacidade demonstrada funcionar no grupo de TVs escolhido e seus limites estiverem registrados. A recomendação oficial é testar em aparelho real, pois há diferenças em relação ao emulador. [4] O status inicial de todas as provas deste material é Não executada.

## 4. Fontes e escopo da pesquisa

[1] **Samsung Developer — General Web Application Samples** — Fonte principal: catálogo de 19 exemplos.  
https://developer.samsung.com/smarttv/develop/samples/general-samples.html

[2] **SamsungDForum — SampleWebApps-Filesystem** — README do exemplo vinculado pela documentação Samsung; limites da demonstração.  
https://github.com/SamsungDForum/SampleWebApps-Filesystem

[3] **Samsung Developer — Media Samples** — Exemplos complementares de reprodução e ciclo de vida.  
https://developer.samsung.com/smarttv/develop/samples/media-samples.html

[4] **Samsung Developer — TV Device** — Necessidade de verificação em aparelho real.  
https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html


Consulta: 13 de setembro de 2026. As recomendações e os critérios de aceite deste relatório não substituem as exigências de revisão vigentes no Seller Office.
