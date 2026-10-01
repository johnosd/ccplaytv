# Lógica: verificador de nomes acessíveis (feature 028)

Fonte da verdade para `tv-web/src/testing/accessibleNames.ts`
(`findUnnamedControls`) e para como os testes de tela o usam (FR-015–FR-017).
O contrato `accessibleNames.limpeza-qa-ds-v14.contract.test.tsx` fixa o
comportamento — este documento explica as regras.

## 1. O que é "controle"

`button`, `a[href]`, `input` (exceto `type=hidden`), `select`, `textarea`,
qualquer `[tabindex]` diferente de `-1`, e os papéis `button`, `tab`,
`option`, `menuitem`, `link`, `switch`, `checkbox`, `slider`.

Ignorados: elemento dentro de `[aria-hidden="true"]` ou `[hidden]`.

## 2. Nome

Nome acessível pelo algoritmo do W3C (`computeAccessibleName` de
`dom-accessibility-api`, a mesma biblioteca que o Testing Library usa em
`getByRole({ name })`). Hoje ela já está em `node_modules` como dependência
transitiva; a 028 a declara em `devDependencies` na versão já instalada
(D-008). Nome vazio depois de `trim()` → `no-name`.

## 3. Indisponível (soft/hard disabled)

Elemento com `.is-soft-disabled` ou `.is-hard-disabled` (utilitários da
021) precisa anunciar a condição: `aria-disabled="true"` **ou** nome que
contenha "em breve" ou "indisponível" (sem diferenciar maiúsculas, com ou
sem acento em "indisponível"). Senão → `disabled-unannounced`.

O atributo nativo `disabled` já é anunciado pela plataforma — não exige
nada a mais.

Uma entrada por elemento: sem nome, a razão é `no-name`, mesmo que também
esteja indisponível.

## 4. `description`

Texto curto para a mensagem de falha: tag, classes e nome/texto. Nunca
vazio.

## 5. Uso nos testes de tela (FR-017)

Em cada arquivo de teste de tela **já existente** (reusa os mocks dele),
um caso por estado principal:

```ts
expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
```

Comparar as `description` (e não só o tamanho) faz a falha dizer qual
controle. Estados principais por tela: pronto, vazio, erro e carregando
(os que a tela tiver) e cada modal que ela abre.

Não é teste de contrato: esses casos são escritos pelo executor, fora da
trava.
