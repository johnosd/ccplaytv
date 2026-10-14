# Bug Assessment: Teste de conexão não guarda resultado na TV

- **Slug**: teste-conexo-armazenamento-indisponvel-tv
- **Criado**: 2026-10-07
- **Origem**: texto colado e confirmação do usuário na TV física
- **Veredito**: likely valid, needs reproduction
- **Severidade**: medium

## Report

Após instalar a feature 064, o app apareceu corretamente e o teste rodou, mas não guardou o resultado: “Armazenamento indisponível”. O usuário confirmou que outras alterações continuam sendo salvas.

## Symptom

A medição permanece disponível no diálogo, mas não pode ser consultada como último resultado salvo. Esperado: gravar `networkDiagnostics/last` e exibi-lo depois de fechar/reabrir.

## Reproduction

1. Na TV Samsung QN50Q60DAGXZD, abrir Configurações → Integrações → teste de conexão.
2. Iniciar manualmente e aguardar conclusão.
3. Observar aviso de armazenamento e ausência de resultado guardado (relato do usuário).
4. Contraprova em Chromium isolado: mesmo build de produção, transporte sintético, IndexedDB novo v170 nativo/v17 Dexie; leitura e escrita funcionam, sem aviso. Não reproduziu o defeito físico.

## Suspected Code Paths

- `tv-web/src/lib/network/speedTestRepository.ts` — leitura e escrita descartam a exceção original e devolvem apenas indisponibilidade.
- `tv-web/src/features/settings/useSpeedTest.ts` — aviso pode nascer da leitura inicial ou do compromisso da escrita.
- `tv-web/src/lib/catalog/db.ts` — v17 acrescenta a tabela; migração testada em desktop, mas banco físico não inspecionado.

## Root Cause Hypothesis

Confiança **low** na causa específica. O relato de outras gravações bem-sucedidas sugere investigar a tabela/transação do diagnóstico, mas não elimina quota nem falha transitória. Não há evidência suficiente para mudar esquema, usar outro armazenamento ou apagar dados. A limitação confirmada no código é a perda da classificação da exceção, impossibilitando distinguir esses casos. A TV não disponibiliza console neste ambiente, conforme diagnóstico operacional registrado no skill tizen-tv.

## Proposed Remediation

**Preferida**: primeiro acrescentar diagnóstico limitado a códigos definidos pelo app, indicando operação e categoria conhecida da exceção. Não exibir mensagem, stack, URL ou conteúdo do banco. Preservar contratos de retorno do repositório e resultado atual; obter o código observado na TV antes da correção definitiva. Testar a classificação, passagem ao hook e aviso; atualizar o app pelo mesmo author sem desinstalar.

**Files likely to change**:
- `tv-web/src/lib/network/storageFailure.ts`
- `tv-web/src/lib/network/storageFailure.test.ts`
- `tv-web/src/lib/network/speedTestRepository.ts`
- `tv-web/src/lib/network/speedTestRepository.test.ts`
- `tv-web/src/features/settings/useSpeedTest.ts`
- `tv-web/src/features/settings/useSpeedTest.test.tsx`
- `tv-web/src/features/settings/SpeedTestDialog.tsx`
- `tv-web/src/features/settings/SpeedTestDialog.test.tsx`
- `tv-web/e2e/teste-conexao-tv.mjs`
- Artefatos em `CCPlayTv/assets/`, regenerados pelo build/deploy.

**Tests to add or update**:
- Códigos de quota, tabela ausente, transação, segurança, tipo e exceção desconhecida; conteúdo privado nunca compõe o código.
- Repositório informa operação/código mantendo retornos e exceção sanitizada.
- Hook mantém resultado atual e disponibiliza código; sucesso limpa diagnóstico.
- Diálogo mantém aviso, métricas e foco; E2E injeta falha de guarda e confirma diagnóstico sem expor texto bruto.

## Risks & Considerations

- Esta etapa instrumenta o defeito; não corrige uma causa ainda desconhecida.
- Não alterar versões históricas, limpar IndexedDB ou desinstalar o app.
- Seguir constitution e V14 §45: código técnico curto no aviso existente, sem console na UI.
- Não alterar contratos SHA256 das features 062/064.

## Open Questions

- Qual operação/categoria falha no aparelho? A atualização permitirá observar o código. Não bloqueia a instrumentação.
- Medição e abertura confirmadas pelo usuário; valores exatos, limites de tráfego/tempo e demais cenários físicos não foram confirmados.
