# Bug Fix: Tecla Voltar (RETURN) não funciona na TV física

- **Slug**: tecla-voltar-return-nao-funciona-na
- **Corrigido**: 2026-09-17
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`useRemoteNav` passou a reconhecer a tecla RETURN do controle Samsung
(`keyCode` 10009) como "voltar", além de `Backspace`/`Escape` do teclado de
desktop. Como o hook é o único ponto do app que traduz tecla em intenção de
navegação, a correção de uma linha restabelece o Voltar em todas as telas.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/lib/useRemoteNav.ts` | modified | Constante `TIZEN_RETURN_KEYCODE = 10009` com comentário explicando a origem do número e link para este bug; `isBack` passou a aceitar `keyCode === 10009` e `event.key === 'XF86Back'`, mantendo `Backspace`/`Escape` |
| `tv-web/src/lib/useRemoteNav.test.tsx` | added | Não havia teste dedicado ao hook — o comportamento só era exercitado de forma indireta pelos testes de tela |

Nenhum consumidor de `onBack` mudou: `App.tsx`, `HomeScreen`,
`ListHomeScreen`, `LiveScreen`, `PlayerOverlay`, `ConfirmDialog`,
`AddSourceScreen`, `ImportProgressScreen`, `MoviesScreen`, `SeriesScreen` e
as duas telas de detalhe herdam a correção pelo hook.

## Tests Added or Updated

- `tv-web/src/lib/useRemoteNav.test.tsx::a tecla RETURN do controle Samsung
  (keyCode 10009) aciona onBack` — trava a regressão exata deste bug.
- `tv-web/src/lib/useRemoteNav.test.tsx::Backspace e Escape continuam
  acionando onBack (caminho do desktop)` — garante que a TV não foi
  atendida às custas do desenvolvimento em navegador.
- `tv-web/src/lib/useRemoteNav.test.tsx::a tecla de voltar chama
  preventDefault, para a plataforma não encerrar o app` — o risco levantado
  no assessment (app fechar junto com o voltar) fica coberto.
- `tv-web/src/lib/useRemoteNav.test.tsx::tecla não mapeada não aciona nenhum
  handler` — impede que a condição estendida vire um catch-all.

Os testes existentes que disparam `Backspace`/`Escape`
(`ConfirmDialog.test.tsx`, `HomeScreen.test.tsx`, `LiveScreen.test.tsx`,
`PlayerOverlay.test.tsx`) passaram sem alteração.

## Local Verification

- `npx vitest run src/lib/useRemoteNav.test.tsx src/components/ConfirmDialog.test.tsx src/features/home/HomeScreen.test.tsx src/features/live/LiveScreen.test.tsx src/features/live/PlayerOverlay.test.tsx` → 5 arquivos, 32 testes, todos passando.
- `npx tsc -b` → exit 0.
- `npm run lint` (oxlint) → sem apontamentos.
- `npm run test` (suite completa) → 10 arquivos, 53 testes, todos passando.
- Checagens manuais: **nenhuma ainda no aparelho**. O sintoma original só
  reproduz com o controle da TV, então a verificação que vale é da fase
  Test — instalar o pacote novo na QN50Q60DAGXZD e repetir o passo 4 da
  reprodução.

## Deviations from Assessment

Nenhum desvio de arquivos: a mudança ficou exatamente nos dois arquivos
previstos.

Uma adição ao que o assessment listou: o quarto teste ("tecla não mapeada
não aciona nenhum handler") não estava na lista de testes propostos. Entrou
porque a condição de `isBack` cresceu de duas para quatro alternativas, e
uma condição mais larga merece um caso que prove que ela não passou a
capturar teclas quaisquer. Custo zero, mesmo arquivo.

## Follow-ups

- A questão aberta do assessment continua aberta: não medimos qual
  `event.key` a TV entrega junto do `keyCode` 10009. Se o Web Inspector da
  TV ficar acessível, registrar o valor real permite simplificar a condição
  depois.
- Se no futuro aparecer necessidade de outras teclas de plataforma (EXIT
  10182, teclas de mídia), a alternativa `normalizeRemoteKey` descartada no
  assessment volta a fazer sentido — hoje seria refatoração maior que o bug.
- A tecla Voltar na Home passa a abrir a confirmação de saída no aparelho
  pela primeira vez. É o comportamento pretendido, mas vale confirmar na
  fase Test que o diálogo aparece e que o "cancelar" mantém o app aberto.
