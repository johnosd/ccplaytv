# Bug Fix: Portal: login sem identidade visual e com ações extras

- **Slug**: portal-login-sem-identidade-visual-aes
- **Corrigido**: 2026-10-13
- **Assessment**: ./assessment.md
- **Status**: applied

## Alterações

- `portal-web/src/App.tsx`
  - substituído o wordmark textual isolado por um cabeçalho com mark/play e wordmark CCPlayTV;
  - removidos o status e o botão Reload globais da composição anônima;
  - removido o callback de Recover do `SessionPage`;
  - adicionados Reload e Recover no bloco autenticado, ao lado da navegação de fontes/licença;
  - preservado o ramo de `recoveryStartup` para recuperação iniciada por QR.
- `portal-web/src/features/SessionPage.tsx`
  - o formulário não recebe mais a ação de recuperação; seus únicos controles são os campos Device ID, Device Key e conectar.
- `portal-web/src/styles.css`
  - adicionados estilos locais para o mark/play, wordmark e agrupamento de ações autenticadas, usando os tokens já existentes do portal.

## Decisões

O Device Key permanece mascarado, sem um botão adicional na tela de login, para que a composição tenha somente os dois campos e a conexão; Reload e Recover, que eram as ações indevidas no contexto anônimo, foram retirados da tela de login.

## Tests Added or Updated

- `portal-web/e2e/bootstrap.spec.ts::bootstrap acessível mantém o login enxuto e sem ações autenticadas` — confirma dois inputs, Connect, marca e ausência de Reload/Recover.
- `portal-web/e2e/gerenciador.spec.ts::entra por ID e chave, mostra o cabeçalho e oferece gestão e pagamento` — confirma Reload/Recover dentro da sessão autenticada.

## Local Verification

- `npm.cmd run lint` → pass.
- `npm.cmd run test` → 3 arquivos e 6 testes pass.
- `npm.cmd run build` → type-check e Vite pass.
- `npm.cmd run test:e2e` → 14 testes pass.
- DOM do portal local → marca CCPlayTV, dois campos e Connect na tela anônima; Reload/Recover ausentes.

## Deviations from Assessment

Nenhum.

## Follow-ups

- Nenhum.
