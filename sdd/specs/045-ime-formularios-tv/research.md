# Pesquisa — feature 045 (IME da TV nos formulários)

## R0-1 — Quais eventos o IME real da Samsung entrega à página?

**Decisão**: desenhar tolerante e medir. A tabela `IME_KEYCODES` (`lib/imeKeys.ts`) concentra o que se
sabe (`done: 65376`, `cancel: 65385`, `next: []`), e uma sonda dev-only (T001, molde do `PerfOverlay` da
038) mostra na tela da TV cada `keydown`/`focusin`/`focusout` (`key`, `keyCode`, `code`, alvo, `isComposing`)
para a passada de T002 preencher a tabela com fato.

**Justificativa**: a única fonte local é o guia `docs/guia-praticas-app-tv/05_entrada_de_texto.md`
("Next avança, Done conclui o último"), sem códigos de tecla. Os valores 65376/65385 vêm da documentação
Samsung de IME de que me lembro, **não verificada neste repositório nem na TV**. Inventar um `keyCode` de Next
seria o oposto de honesto; por isso `next` fica vazio.

**Alternativas consideradas**:
- Tratar `Enter` como Done — rejeitado: na TV, OK num campo focado abre o teclado do sistema; interceptar
  `Enter` o impediria (`useRemoteNav.ts` `EDITABLE_PASSTHROUGH_KEYS`).
- Teclado virtual próprio — rejeitado: DS §37.1 e o escopo da spec.
- Deixar o IME fazer o "Next" sozinho (ordem do DOM = ordem visual, já é) — **é o que provavelmente já
  acontece**; a feature só garante a ordem, a cobertura do campo e o destino do Done.

**Em aberto até a TV**: (a) Next chega como `keydown` ou o sistema só move o foco? (b) Done chega à página?
(c) com o teclado aberto, RETURN chega à página e, se chegar, `useRemoteNav` o trataria como "sair da tela"
(RETURN **não** está em `EDITABLE_PASSTHROUGH_KEYS`) — o teste da spec ("já ocorre hoje") não é verificável no
código e deve ser lido como hipótese (R-002).

## R0-2 — A confirmação deve repetir pedidos que a importação já faz?

**Decisão**: aceitar a duplicação mínima. Xtream: 1 consulta de conta (`resolveAccountStatus`) antes e a
importação refaz a sua. M3U: 1 leitura que para na primeira entrada (cancelada) antes do download completo.

**Justificativa**: entregar o resultado da confirmação ao importador exigiria mudar `startLocalImport`/
`importPipeline.ts` (zona `IMPORT`, travas de 5 features) para ganhar ~1 requisição leve. A 038 mediu que o
painel real limita ~99 requisições; +1 não muda isso.

**Alternativas**: passar uma "rota confirmada" ao importador — rejeitado agora (custo/risco), registrado
como otimização possível (R-004).

## R0-3 — "Resposta incompatível" convive com o Modo limitado?

**Decisão**: sim, como a spec pediu (FR-004): `ProviderIncompatibleError` do Xtream cai na leitura do M3U de
fallback (`legacyM3uUrl`), exatamente como `importPipeline.ts` já faz; `SRC-422` só se o fallback também
falhar. `direct_connection_refused` (CORS) é `NET-02`, como `providerErrorCode` da 042.

**Justificativa**: `importPipeline.ts` (linhas ~738–773) já define essa árvore; a confirmação a espelha para
que "o que o formulário aceita" e "o que a importação consegue" nunca divirjam.
