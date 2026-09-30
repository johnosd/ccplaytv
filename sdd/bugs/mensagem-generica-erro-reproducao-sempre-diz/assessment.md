# Bug Assessment: Mensagem genérica de erro de reprodução sempre diz "canal"

- **Slug**: mensagem-generica-erro-reproducao-sempre-diz
- **Criado**: 2026-09-28
- **Origem**: entrada `[Bug]` de `.planning/backlog.md` (Fase 2), achada na verificação manual da feature `012-series-episodios-temporadas` (24/09/2026)
- **Veredito**: valid
- **Severidade**: low

## Report

> `avplayAdapter.ts` (`toPlayerError`) e `htmlVideoAdapter.ts` traduzem
> qualquer falha de stream sem código reconhecido para o texto fixo "Não foi
> possível reproduzir este canal.", inclusive quando o item é um filme ou um
> episódio de série. `PlayerLayer` só usa a mensagem genérica configurável por
> prop (`genericErrorMessage`) quando o adaptador não fornece `message`
> nenhuma — como os dois adaptadores sempre fornecem esta string fixa, a prop
> nunca tem chance de valer para esse caminho de erro específico.

## Symptom

Quando o motor (AVPlay na TV, `<video>` no desktop) falha durante a
reprodução de um **filme** ou **episódio**, a tela de erro diz "Não foi
possível reproduzir este **canal**." O esperado é uma mensagem que não
nomeie o tipo de mídia errado: a genérica neutra do `PlayerLayer` ("Não foi
possível reproduzir isto.") ou a mensagem da tela que montou a camada.

## Reproduction

1. `npm run dev`; abrir um filme (ou episódio) cujo stream falhe **depois**
   de a sessão abrir (URL de playback que resolve, mas cujo conteúdo o motor
   rejeita). No desktop, qualquer URL que o `<video>` não consiga tocar
   dispara o evento `error` do elemento.
2. Observar a tela de erro do `PlayerLayer`: aparece "Não foi possível
   reproduzir este canal."

Reproduzido na verificação manual da 012 (URL de episódio inválida). Por
leitura de código, o caminho é determinístico — não depende de hardware.

## Suspected Code Paths

- `tv-web/src/lib/player/avplayAdapter.ts:91-100` — `toPlayerError` sempre
  devolve `message: 'Não foi possível reproduzir este canal.'`.
- `tv-web/src/lib/player/htmlVideoAdapter.ts:72-79` — listener `error` do
  `<video>` envia a mesma string fixa.
- `tv-web/src/lib/player/PlayerService.ts:67-70` — `PlayerError.message` é
  `string` obrigatória, o que empurra cada adaptador a inventar um texto.
  `PlayerService` repassa o erro do adaptador sem tocar (`:220`,
  `applyError`); suas próprias mensagens (`:241` "Não foi possível iniciar a
  reprodução.", `:401` "A transmissão foi interrompida.") são corretas e
  específicas.
- `tv-web/src/components/PlayerLayer.tsx:475-482` — `session.error?.message
  ?? genericErrorMessage`: o fallback só vale com `message` ausente, o que
  nunca acontece nesse caminho.
- `tv-web/src/components/PlayerLayer.tsx:161` —
  `DEFAULT_GENERIC_ERROR_MESSAGE = 'Não foi possível reproduzir isto.'`
  (neutra). Só `LiveScreen.tsx:1278` passa uma prop própria ("…este canal.");
  `MovieDetailScreen`, `SeriesDetailScreen` e `HomeScreen` (Continuar
  assistindo) usam o padrão neutro.

## Root Cause Hypothesis

Os dois adaptadores foram escritos na feature 003, quando só existia canal ao
vivo, e cravaram o texto de canal como mensagem da falha do motor. Quando a
011 introduziu filme e a prop `genericErrorMessage`, o fallback foi colocado
atrás de um `??` que nunca dispara, porque o contrato `PlayerError.message:
string` obriga o adaptador a mandar algo. O adaptador não conhece o tipo de
mídia — quem conhece é a tela que monta o `PlayerLayer`. Confiança: **high**.

## Proposed Remediation

**Preferida**: o motor deixa de redigir texto de usuário para falhas
genéricas.
- `PlayerError.message` passa a ser **opcional** (`message?: string`),
  documentando que ausência significa "use a mensagem genérica de quem
  apresenta".
- `avplayAdapter.toPlayerError` e o listener `error` do `htmlVideoAdapter`
  passam só o `code` (sem `message`).
- As mensagens próprias do `PlayerService` (falha ao iniciar, transmissão
  interrompida) continuam como estão: são específicas e corretas.
- `PlayerLayer` já faz `?? genericErrorMessage` — nenhuma mudança de lógica,
  só confirmar que o tipo compila.
- Resultado: Live continua mostrando "Não foi possível reproduzir este
  canal." (prop própria em `LiveScreen`); filme, episódio e Home mostram
  "Não foi possível reproduzir isto."

**Alternativas**:
- Adaptadores passarem `message: ''` e o `PlayerLayer` trocar `??` por `||`
  — funciona sem mexer no tipo, mas esconde a intenção atrás de uma string
  vazia mágica. Rejeitada.
- Texto neutro fixo no adaptador ("…este conteúdo.") — some o "canal" errado,
  mas a prop `genericErrorMessage` continuaria morta para esse caminho, e o
  Live perderia sua mensagem específica. Rejeitada.
- Esperar o item 19 (taxonomia de erros §45), que reescreve esse caminho —
  válido, mas o 19 está longe na fila e a correção aqui é pequena e
  compatível com ele (o `code` continua atravessando).
- Opcional, **não incluído**: `MovieDetailScreen`/`SeriesDetailScreen`
  passarem mensagens próprias ("…este filme."/"…este episódio."). Melhoria de
  texto, não correção do bug — fica para o item 19.

**Files likely to change**:
- `tv-web/src/lib/player/PlayerService.ts` (tipo `PlayerError` + comentário)
- `tv-web/src/lib/player/avplayAdapter.ts`
- `tv-web/src/lib/player/htmlVideoAdapter.ts`
- testes existentes desses adaptadores, se algum afirmar a string fixa

**Tests to add or update**:
- `avplayAdapter` / `htmlVideoAdapter`: falha do motor gera erro **sem**
  `message` (e com `code` quando houver).
- `PlayerLayer.test.tsx`: sessão que entra em `error` sem `message` mostra
  `genericErrorMessage` da prop; sem prop, mostra "Não foi possível
  reproduzir isto."; erro com `message` explícita (ex.: "A transmissão foi
  interrompida.") continua ganhando da prop.
- Regressão: `LiveScreen.test.tsx` T028 continua vendo "…este canal." (vem
  da prop).

## Risks & Considerations

- Tornar `message` opcional pode quebrar algum consumidor que leia
  `session.error.message` como `string` — verificar com `tsc -b` (grep
  indica só `PlayerLayer` e testes de `PlayerService`).
- A invariante de segurança do `PlayerError` (nunca URL/credencial) fica
  **mais** forte, não menos: menos texto atravessando.
- Nenhuma mudança visível no Live — a mensagem de canal vem da prop.

## Open Questions

- Nenhuma.
