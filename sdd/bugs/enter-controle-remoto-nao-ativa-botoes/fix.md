# Bug Fix: Enter do controle remoto não ativa botões em telas de foco DOM nativo

- **Slug**: enter-controle-remoto-nao-ativa-botoes
- **Corrigido**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`useRemoteNav` só chama `preventDefault()`/consome o Enter (`isSelect`)
quando um `onSelect` foi de fato passado; sem ele, o evento segue seu curso
e o navegador ativa nativamente o `<button>`/`<input>` com foco real — o
que `AddSourceScreen` e `ImportProgressScreen` sempre esperaram, mas que o
`preventDefault()` incondicional estava suprimindo.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/lib/useRemoteNav.ts` | modified | Adicionada guarda `if (isSelect && !handlersRef.current.onSelect) return` antes do `preventDefault()`, com comentário explicando o porquê (roving DOM focus vs. foco gerenciado 2D). |
| `tv-web/src/lib/useRemoteNav.test.tsx` | modified | 2 testes novos (ver abaixo). |

## Tests Added or Updated

- `tv-web/src/lib/useRemoteNav.test.tsx::sem onSelect, Enter não chama preventDefault (...)` — trava a regressão: sem `onSelect`, `event.defaultPrevented` deve ficar `false`, permitindo a ativação nativa do elemento focado.
- `tv-web/src/lib/useRemoteNav.test.tsx::com onSelect, Enter continua chamando preventDefault e o handler (...)` — trava que o comportamento das 12+ telas de foco gerenciado 2D (`LiveScreen`, `HomeScreen`, `ConfirmDialog`, `PlayerOverlay` etc., todas passam `onSelect`) não regrediu.

Não foi adicionado um teste de integração em nível de `AddSourceScreen`
(cenário mais fiel ao bug relatado: foco real + Enter trocando de aba). jsdom
não implementa nativamente "Enter num `<button>` focado dispara `click`" —
isso é um polyfill do `@testing-library/user-event`, que não é dependência
deste projeto hoje. Adicionar essa dependência só para este teste ficaria
fora do escopo desta correção; os dois testes do hook cobrem o mecanismo
exato que estava quebrado de forma determinística.

## Local Verification

- `npx vitest run src/lib/useRemoteNav.test.tsx` → 6 passed (4 existentes + 2 novos).
- `npx tsc -b` → sem erros.
- `npm run lint` (oxlint) → sem erros.
- `npx vitest run` (suíte completa do frontend) → 64 passed (10 arquivos).
- Checagem manual: **não re-executada na TV física ainda** — isso é a fase
  Test deste bugfix, pendente de confirmação do usuário com o app
  reinstalado.

## Deviations from Assessment

Nenhuma. A correção ficou exatamente no arquivo previsto
(`useRemoteNav.ts`), e a única mudança de plano foi não adicionar o teste de
integração "idealmente" mencionado no assessment, pelo motivo de
infraestrutura de teste descrito acima — não por mudança de causa raiz.

## Follow-ups

- Rodar a fase Test deste bugfix reinstalando o app na TV física e repetindo
  a reprodução original (aba "Endereço, usuário e senha" via D-pad + OK).
- Ao mesmo tempo, vale confirmar que o próprio botão "Adicionar lista" (submit)
  e os botões de `ImportProgressScreen` (Cancelar/Tentar novamente/Voltar)
  também passam a responder ao Enter do controle — o assessment previu que
  sofriam do mesmo problema, mas só a troca de aba foi o sintoma relatado
  originalmente.
