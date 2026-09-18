# Bug Assessment: Tecla Voltar (RETURN) não funciona na TV física

- **Slug**: tecla-voltar-return-nao-funciona-na
- **Criado**: 2026-09-17
- **Origem**: texto colado — observação direta do usuário durante a primeira
  execução do app instalado na TV de referência (sessão de 17/09/2026)
- **Veredito**: valid
- **Severidade**: high

## Report

> "Apareceu algumas listas, várias listas na verdade que eu nunca havia
> carregado. Quando eu entrei em uma, apareceu live TV e o botão voltar não
> funcionou para voltar."

Observado na Samsung **QN50Q60DAGXZD** (Tizen 8.0 / Chromium 108), a TV de
referência da ADR-001, com o pacote instalado por `sdb` e lançado por
`tizen run` — não em emulador, não em navegador de desenvolvimento. Setas e
OK funcionaram normalmente na mesma sessão (o usuário navegou até uma lista
e abriu o Live TV usando só o controle).

A primeira parte do relato — as listas "que nunca havia carregado" — **não é
bug**: o backend tem 50 fontes reais acumuladas dos testes de import das
features 001/002/003, e o log da API confirma a origem
(`192.168.0.4 - "GET /sources HTTP/1.1" 200 OK`, onde `192.168.0.4` é a TV).
Comportamento correto; fica registrado aqui só para não virar um bug
fantasma depois.

## Symptom

Na TV física, pressionar a tecla Voltar (RETURN) do controle não produz
efeito nenhum em nenhuma tela — a navegação fica presa na tela atual.
Esperado: voltar à tela anterior restaurando foco e posição de rolagem
(Constitution, *Voltar Restaura Foco e Posição*).

Como toda ação essencial precisa ter caminho completo por controle remoto
(Constitution, *Toda Ação Essencial Tem Caminho Completo por Controle
Remoto*), e a única saída de uma tela interna é a tecla Voltar, o aparelho
fica num beco: entrou no Live TV, não sai.

## Reproduction

1. Instalar o pacote na TV (`tizen install -n CCPlayTv.wgt -t QN50Q60DAGXZD`)
   e lançar (`tizen run -p 8tZqMtwANL.CCPlayTv -t QN50Q60DAGXZD`).
2. Na Home, mover o foco com as setas até uma lista e pressionar OK.
3. Na tela da lista, mover o foco até **Live TV** e pressionar OK.
4. Pressionar a tecla **Voltar** do controle.
5. **Observado**: nada acontece, a tela permanece no Live TV.
   **Esperado**: voltar à tela da lista, com o foco no item de origem.

Reprodução equivalente no desktop **não** expõe o bug: o teclado emite
`Backspace`/`Escape`, que o código trata. Só o controle da TV reproduz.

## Suspected Code Paths

- `tv-web/src/lib/useRemoteNav.ts:49` — **causa direta**. A detecção de
  "voltar" é `event.key === 'Backspace' || event.key === 'Escape'`. O
  controle Samsung emite RETURN como `keyCode` **10009**, que não casa com
  nenhuma das duas strings, então `isBack` é `false` e `onBack` nunca é
  chamado.
- `tv-web/src/lib/useRemoteNav.ts:47-48` — as setas (`DIRECTION_BY_KEY`) e o
  OK (`Enter`) usam nomes de tecla que a TV emite no formato padrão, o que
  explica por que só o Voltar falhou. Não precisam mudar.
- `tv-web/src/lib/useTvKeyNav.ts:28-29` — trata apenas setas (roving focus
  nos formulários). Não participa do Voltar; fora do escopo.

Consumidores de `onBack` (nenhum precisa mudar — todos passam pelo hook):
`App.tsx` (rotas de Movies, Series, detalhes, Live, ListHome, AddSource,
ImportProgress), `HomeScreen.tsx:118` (confirmação de saída),
`LiveScreen.tsx:63`, `PlayerOverlay.tsx:146`, `ConfirmDialog.tsx:34`,
`AddSourceScreen.tsx:16`, `ImportProgressScreen.tsx:32`,
`ListHomeScreen.tsx:35`, `MoviesScreen`, `SeriesScreen`,
`MovieDetailScreen`, `SeriesDetailScreen`.

## Root Cause Hypothesis

`useRemoteNav` é o único ponto do app que traduz tecla em intenção de
navegação, e traduz só pelo nome lógico da tecla (`event.key`). Esse nome é
estável em teclado de desktop, mas a tecla RETURN do controle Samsung chega
como código numérico de plataforma (`keyCode` 10009, fora da faixa padrão do
DOM) sem um `event.key` equivalente a `Backspace`/`Escape`. Confiança:
**high** — o comportamento observado no aparelho (setas e OK funcionando,
Voltar inerte) bate exatamente com o que o código faz, e o ponto de decisão
é único e isolado.

O que **não** foi medido: qual valor exato de `event.key` a TV entrega junto
do `keyCode` 10009. A remediação não depende dessa resposta (trata os dois
caminhos), mas registrar isso evita uma afirmação que não verificamos.

## Proposed Remediation

**Preferida**: estender a detecção de "voltar" em `useRemoteNav.ts` para
aceitar também o código de plataforma da TV, mantendo `Backspace`/`Escape`
para o desenvolvimento em desktop. Constante nomeada com comentário
explicando a origem do número, no idioma dos comentários vizinhos
(português), e cobertura defensiva de `event.key === 'XF86Back'`, que é o
nome que alguns engines Tizen entregam para a mesma tecla.

**Alternativas**:
- Registrar a tecla via `tizen.tvinputdevice.registerKey('Return')` —
  desnecessário: RETURN é tecla sempre entregue, registro serve para as
  opcionais (coloridas, canal, mídia). Adicionaria dependência de
  `webapis`/`tizen` num hook que hoje é puro DOM e testável em jsdom.
- Normalizar a tecla numa camada separada (`normalizeRemoteKey`) — mais
  arrumado se um dia houver várias teclas de plataforma (EXIT 10182, mídia),
  mas hoje é uma tecla só; refatoração maior que o bug.

**Files likely to change**:
- `tv-web/src/lib/useRemoteNav.ts`
- `tv-web/src/lib/useRemoteNav.test.tsx` (novo — não existe teste dedicado
  ao hook hoje)

**Tests to add or update**:
- Novo teste do hook: `keydown` com `keyCode: 10009` aciona `onBack`.
- Novo teste do hook: `Backspace` e `Escape` continuam acionando `onBack`
  (não regredir o caminho de desktop).
- Novo teste do hook: a tecla de voltar chama `preventDefault`, para a
  plataforma não encerrar o app por conta própria.
- Os testes existentes que disparam `Backspace`/`Escape`
  (`ConfirmDialog.test.tsx`, `HomeScreen.test.tsx`, `LiveScreen.test.tsx`,
  `PlayerOverlay.test.tsx`) devem continuar passando sem alteração.

## Risks & Considerations

- `event.keyCode` é deprecado no padrão DOM. Continua disponível no Chromium
  108 da TV e é a forma documentada pela Samsung para as teclas do controle,
  mas se um engine futuro removê-lo a checagem volta a falhar em silêncio —
  daí a cobertura redundante por `event.key`.
- Teste verde em jsdom **não** prova que a TV emite 10009. A verificação que
  vale é reproduzir o passo 4 no aparelho depois do fix; a fase Test não pode
  marcar `verified` sem isso.
- `preventDefault` já é chamado para teclas tratadas (linha 52) e passa a
  valer também para a RETURN — é o que evita a plataforma fechar o app ao
  mesmo tempo em que a tela volta. Merece atenção na verificação: se o app
  fechar junto, o comportamento correto ainda não foi alcançado.
- Na Home, `onBack` abre a confirmação de saída (`HomeScreen.tsx:118`). Com o
  fix, a tecla Voltar na Home passa a abrir esse diálogo na TV pela primeira
  vez — comportamento pretendido, mas é mudança visível que não existia no
  aparelho antes.

## Open Questions

- [NEEDS CLARIFICATION: qual `event.key` a TV entrega junto do `keyCode`
  10009 — não medido nesta sessão. Não bloqueia o fix; se o Web Inspector da
  TV ficar acessível, vale registrar o valor real para simplificar a
  condição no futuro.]
