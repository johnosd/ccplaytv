# Bug Assessment: CH+/CH− não trocam canal no player

- **Slug**: ch-mais-menos-nao-trocam-canal
- **Criado**: 2026-10-11
- **Origem**: conversa com o usuário
- **Veredito**: likely valid, needs reproduction
- **Severidade**: medium

## Report

Usuário pediu navegação por teclas de canal durante reprodução de TV e confirmou CH+/CH− após ser informado de que o código já oferece esse caminho.

## Symptom

A expectativa é trocar o canal em reprodução pelas teclas CH+/CH−. Ainda não foi informado se a TV ignora as teclas, mostra um aviso de limite ou troca para o lado inesperado.

## Reproduction

1. Abrir TV ao vivo numa categoria com pelo menos três canais reproduzíveis.
2. Reproduzir o canal intermediário e aguardar o início da reprodução.
3. Com guia, lista de zapping e painéis fechados, pressionar CH+ e CH− e observar canal/faixa/avisos.
4. Comparar com ↑/↓; repetir durante preparação e com lista de zapping aberta, registrando o estado em que ocorre a falha.

Não executado na TV física. Testes atuais de software: 3 arquivos / 74 testes passaram (`PlayerLayer.test.tsx`, `PlayerLayer.guide.test.tsx`, `tizenMediaKeys.test.ts`). Comando: `node node_modules/vitest/vitest.mjs run src/components/PlayerLayer.test.tsx src/lib/tizenMediaKeys.test.ts src/components/PlayerLayer.guide.test.tsx`, em `tv-web/`.

## Suspected Code Paths

- `tv-web/src/lib/tizenMediaKeys.ts` — reconhece nomes e códigos 427/428; registra somente teclas declaradas por `getSupportedKeys`.
- `tv-web/src/App.tsx` — chama `registerMediaKeys` ao montar.
- `tv-web/src/lib/useRemoteNav.ts` — encaminha teclas de mídia para o listener modal do player.
- `tv-web/src/components/player/usePlayerKeyboard.ts` — ignora mídia em idle/preparing/error e com painéis abertos; encaminha ao topLayer quando presente; CH+ pede previous e CH− next no Live.
- `tv-web/src/features/live/useLiveZapping.ts` — captura sequência ao iniciar playback; pula indisponíveis, para nas pontas; topLayer de zapping não fornece onMediaKey.
- `tv-web/src/features/live/LiveScreen.tsx` / `useLiveArchive.ts` — conectam callback do player à troca de canal.

## Root Cause Hypothesis

Confiança baixa. O caminho normal já está conectado e passa nos testes existentes. Registro/entrega no aparelho, estado da sessão, camada aberta e limites da sequência são hipóteses distintas; não há evidência suficiente para escolher uma como causa. O teste do guia confirma explicitamente que o topLayer de zapping ignora CH±. Uma correção recente separada (`live-tv-carregando-durante-reproducao`) altera confirmação de playing no AVPlay; não comprova resolução deste relato.

## Proposed Remediation

**Preferida**: primeiro identificar o sintoma e reproduzir o estado exato. Depois criar teste de regressão que falhe antes do patch e corrigir apenas o ponto demonstrado. Não alterar direção, registro estrito ou política de camadas por hipótese.

**Files likely to change** (candidatos; selecionar conforme evidência):
- `tv-web/src/lib/tizenMediaKeys.ts`
- `tv-web/src/lib/tizenMediaKeys.test.ts`
- `tv-web/src/components/player/usePlayerKeyboard.ts`
- `tv-web/src/components/PlayerLayer.test.tsx`
- `tv-web/src/features/live/useLiveZapping.ts`
- `tv-web/src/features/live/LiveScreen.test.tsx`

**Tests to add or update**:
- Regressão do cenário confirmado, incluindo evento com código físico e nome ausente se aplicável.
- Troca entre canais reais da fixture e retorno com foco no canal escolhido, se a falha estiver na integração da Live.

## Risks & Considerations

- Não inverter CH+/CH− sem confirmar o problema: implementação existente alinha CH+ com ↑/anterior e CH− com ↓/seguinte.
- Preservar guia, painéis, foco, categorias, dados locais e exclusão de credenciais dos diagnósticos.
- Testes de software não confirmam entrega das teclas do controle físico.
- Nenhum código-fonte alterado, deploy ou commit realizado nesta avaliação.

## Open Questions

- [NEEDS CLARIFICATION: ao pressionar CH+/CH−, nada acontece, aparece aviso de limite ou a troca ocorre no sentido inesperado?]
- [NEEDS CLARIFICATION: ocorre em reprodução fullscreen sem guia/lista/painéis? As setas ↑/↓ conseguem trocar o canal no mesmo estado?]

## Complemento da fase Assess — permissão Tizen (2026-10-11)

Usuário confirmou: **não acontece nada** ao pressionar CH+/CH−. A investigação adicional encontrou `http://tizen.org/privilege/tvinputdevice` em `CCPlayTv/config.xml`. O nome correto documentado pela Samsung é **`http://tizen.org/privilege/tv.inputdevice`**. O nome da propriedade JavaScript continua sendo `tizen.tvinputdevice`; ele não é o sufixo da permissão.

Fonte primária consultada nesta sessão: [Samsung — Remote Control, Prerequisites](https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html). Sem a permissão correta, o registro pode lançar SecurityError; `registerMediaKeys` trata a falha devolvendo `[]`, deixando CH± sem entrega ao app. Setas/OK/Back são teclas obrigatórias sem registro e não comprovam permissão de CH±. Os testes existentes simulam API permitida e não leem o manifesto.

**Veredito complementar: valid. Severidade: medium.** Há um defeito comprovado na declaração de permissão, compatível com o sintoma. A causalidade no aparelho continua pendente de reinstalação/validação física; não foi capturado SecurityError na TV. `sdb devices` nesta sessão não apresentou aparelhos conectados.

**Remediação revisada antes da fase Fix:** corrigir somente a URI da permissão e o comentário correspondente. Não mudar direção, estados ou política de camadas do player. Adicionar teste que lê o manifesto de empacotamento e exige a permissão oficial, executar antes/depois do patch; ampliar cobertura CH± por códigos 427/428.

**Files likely to change (contrato complementar):**
- `CCPlayTv/config.xml`
- `tv-web/scripts/tizenInputPrivilege.test.mjs` (novo teste de regressão do manifesto)
- `tv-web/src/lib/tizenMediaKeys.test.ts`
- `tv-web/src/components/PlayerLayer.test.tsx`

As perguntas anteriores sobre sentido/avisos foram resolvidas pela resposta do usuário. Detalhes de camadas/setas não impedem corrigir a permissão comprovadamente errada, sem alterar seus comportamentos. Aceite físico: depois de instalar atualização preservando dados, reproduzir canal intermediário, pressionar CH+/CH− e confirmar ambas as trocas e RETURN. Até lá, verificação final deve ser `partial`.
