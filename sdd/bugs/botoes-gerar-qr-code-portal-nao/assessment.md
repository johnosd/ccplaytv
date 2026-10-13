# Bug Assessment: Botões de QR do portal inativos no `npm run dev`

- **Slug**: botoes-gerar-qr-code-portal-nao
- **Criado**: 2026-10-13
- **Origem**: texto colado pelo usuário + reprodução em `http://localhost:5173/`
- **Veredito**: invalid
- **Severidade**: low

## Report

O usuário relata que os botões para gerar o QR de acesso ao site não funcionam ao testar o app no PC com `npm run dev`.

## Symptom

Ao abrir **Add on website** → **Portal & license**, a tela mostra “The portal is not available in this app yet.” e os seis botões ficam inativos. O esperado pelo usuário era gerar um QR para entrar no portal.

## Reproduction

1. Abrir `http://localhost:5173/` no navegador.
2. Clicar em **Add on website**.
3. Observar a região **Portal & license**: status de portal não configurado e botões com `aria-disabled="true"`.
4. Tentar clicar em **Generate portal QR**: o Playwright não consegue ativar o elemento porque ele está desabilitado; nenhuma chamada de rede ao portal é iniciada.

## Suspected Code Paths

- `tv-web/src/lib/portal/portalRuntime.ts:7-9` — retorna `undefined` quando `import.meta.env.VITE_PORTAL_ORIGIN` não existe.
- `tv-web/src/features/settings/PortalLicensePanel.tsx:106,117-119` — exibe `portal.unconfigured` e passa `softDisabled={!connection}` aos seis botões quando não há conexão.
- `tv-web/src/lib/portal/portalConnection.ts:65-70` — mesmo com origem configurada, o enrollment exige a identidade da plataforma (`webapis.productinfo.getDuid`), que o navegador comum não fornece.
- `tv-web/e2e/portal-configuracao.mjs:7-9,19` — o caminho suportado de teste injeta `VITE_PORTAL_ORIGIN` e uma identidade Tizen sintética.

## Root Cause Hypothesis

**Confiança: alta.** O servidor Vite iniciado apenas com `npm run dev` não recebe `VITE_PORTAL_ORIGIN`; portanto o runtime não cria uma conexão nem inicia rede. O comportamento é explicitamente refletido pela mensagem de estado e pelo soft-disable. O browser de PC também não tem `webapis.productinfo.getDuid`, então apenas adicionar uma URL não transformaria o PC em uma TV válida.

## Proposed Remediation

**Preferida**: nenhuma alteração de produção nesta triagem. Para validar o fluxo de QR, iniciar a configuração local/integrada documentada (origem do portal + API/fixtures e identidade Tizen sintética) ou executar `node e2e/portal-configuracao.mjs` em `tv-web/`; esse E2E passou nesta reprodução.

**Alternativas** (opcional):
- Criar um modo explícito de desenvolvimento com backend local/fixture e DUID sintético, separado do runtime normal e sem apontar silenciosamente para staging/produção. Isso é uma decisão de produto/infraestrutura, não um ajuste seguro inferível deste relato.

**Files likely to change**:
- Nenhum para este veredito. Se o usuário optar pelo modo de desenvolvimento, revisar `tv-web/src/lib/portal/portalRuntime.ts`, documentação de desenvolvimento e testes E2E em uma tarefa própria.

**Tests to add or update**:
- Nenhum. O teste de integração existente `tv-web/e2e/portal-configuracao.mjs` já cobre geração do QR quando o ambiente é configurado.

## Risks & Considerations

- Não apontar o app de desenvolvimento automaticamente para staging/produção: enrollment e QR vinculam uma identidade de TV e podem criar estado remoto.
- Não inventar um DUID no caminho normal do app; a identidade sintética deve ficar restrita a testes/fixture explícitos.
- A validação feita no PC não comprova comportamento de `webapis` nem de controle remoto na TV física.

## Open Questions

- [NEEDS CLARIFICATION: o usuário quer apenas configurar a reprodução local existente ou deseja uma nova experiência de fixture local no `npm run dev`?]
