# Bug Assessment: Portal: login sem identidade visual e com ações extras

- **Slug**: portal-login-sem-identidade-visual-aes
- **Criado**: 2026-10-13
- **Origem**: texto colado
- **Veredito**: valid
- **Severidade**: high

## Relato

A tela inicial do portal não apresenta a identidade visual definida para o CCPlayTV e expõe ações de operação fora do contexto autenticado. O pedido é manter na tela de login somente a identificação do dispositivo, a chave do dispositivo e o botão de conexão; ações como Reload e Recover devem ficar disponíveis dentro da área autenticada.

## Reprodução estática

1. Abrir o portal web sem uma sessão autenticada.
2. Observar o cabeçalho e a tela de acesso.
3. Verificar que o cabeçalho usa apenas texto simples (`CCPlayTV`) e não apresenta o logotipo/mark do produto.
4. Verificar que `Reload` é renderizado globalmente pelo `App` e que `Recover` é renderizado junto do formulário de login por `SessionPage`.

## Evidências no código

- `portal-web/src/App.tsx`: renderiza `wordmark`, o botão global `reload` e passa `onRecover` para `SessionPage`.
- `portal-web/src/features/SessionPage.tsx`: renderiza a ação de recuperação abaixo do formulário de login.
- `portal-web/src/features/SourceManager.tsx`: é a área autenticada apropriada para ações de manutenção da sessão/dispositivo.
- `portal-web/src/styles.css`: possui tokens do portal, mas não define o mark/wordmark visual do sistema CCPlayTV.

## Diagnóstico

Bug de UI e composição de fluxo, severidade P1 (a tela inicial diverge do contrato visual e mistura ações autenticadas com o acesso). A causa é a composição global no `App`, sem um shell de marca e sem separar as ações de sessão da tela de autenticação.

## Escopo da correção

- Criar um cabeçalho de marca CCPlayTV alinhado ao Spectrum, com mark e wordmark locais, sem depender de CDN ou segredo.
- Remover Reload e Recover do estado de login.
- Expor Reload e Recover no shell autenticado/gerenciador, preservando a recuperação iniciada por QR (`recoveryStartup`).
- Manter os campos Device ID, Device Key e a conexão; o controle de revelar/ocultar a chave continua sendo uma affordance do próprio campo, não uma ação de navegação.
- Adicionar verificação automatizada para a composição anônima/autenticada.

## Critérios de aceite

- A tela anônima apresenta a identidade CCPlayTV e não apresenta botões de Reload ou Recover.
- O formulário anônimo possui os campos Device ID e Device Key e o botão de conexão.
- Após autenticar, Reload e Recover aparecem dentro da área autenticada.
- O fluxo de recuperação por QR continua abrindo `RecoveryPage`.
- Os testes do portal e os gates aplicáveis passam, ou qualquer bloqueio de executor é registrado separadamente.

## Veredito

**GO — corrigir.** O relato é reproduzível no código, o escopo é localizado e não exige decisão de produto adicional.
