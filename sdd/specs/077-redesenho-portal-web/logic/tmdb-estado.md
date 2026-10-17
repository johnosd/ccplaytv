# Estado da chave TMDB no portal (077, US4)

Delimita a regra que um executor erraria. Contrato executável: `portal-web/src/features/settings/tmdbStatus.redesenho-portal-web.contract.test.ts`. Implementação: `resolveTmdbView(state)` em `portal-web/src/features/settings/tmdbStatus.ts` (função pura, sem rede, sem a chave).

## Entradas

`TmdbServiceState = { pending?, last?, tvReported? }` (de `GET /integrations/tmdb`).

## Saída e prioridade (de cima para baixo; vale a primeira que casar)

| # | Condição | `view` | `canRemove` | `needsRetry` | `reason` |
| --- | --- | --- | --- | --- | --- |
| 1 | `pending` presente | `pending` | `tvReported === 'configured'` ou `last` = set aplicado | `pending.retryReason != null` | — |
| 2 | `last.result === 'rejected'` | `rejected` | `tvReported === 'configured'` (a TV ainda tem a chave antiga) | `false` | `last.reason` |
| 3 | `last` = `set` aplicado e `tvReported === 'none'` | `none` (a pessoa tirou a chave na TV) | `false` | `false` | — |
| 4 | `last` = `set` aplicado (`tvReported` ausente ou `configured`) | `applied` | `true` | `false` | — |
| 5 | `last` = `remove` aplicado | `none` | `false` | `false` | — |
| 6 | sem `last`, `tvReported === 'configured'` | `configured_on_tv` | `true` | `false` | — |
| 7 | resto | `none` | `false` | `false` | — |

Observações:
- A TV é a fonte da verdade do que existe: o `tvReported` de um snapshot **mais novo** que a operação desfaz o "aplicada" (linha 3). O contrato fixa os casos acima; o serviço devolve `tvReported` já copiado do último snapshot.
- Linha 5 não depende de `tvReported`: remover é terminal mesmo se o snapshot for antigo.
- "Recusada" mantém `Substituir` e, se a TV ainda tem a chave antiga, `Remover`.
- Nenhuma linha lê o valor da chave; o tipo nem o tem.

## Textos (pt de referência; en/es no mesmo sentido)

| `view` | Título do estado | Linha de apoio |
| --- | --- | --- |
| `none` | Não configurada | Adicione sua chave do TMDB para ter capas, elenco e detalhes. |
| `configured_on_tv` | Configurada na TV | A chave foi digitada na TV. O portal não a conhece; você pode substituí-la ou removê-la. |
| `pending` | Aguardando a TV | Na TV, aperte Atualizar. (com `needsRetry`: A TV tentou e não conseguiu falar com o TMDB; ela tenta de novo no próximo Atualizar.) |
| `applied` | Aplicada na TV | O TMDB aceitou a chave. |
| `rejected` | Recusada pelo TMDB | (`refused`) O TMDB não aceitou esta chave. Confira e envie outra. (`invalid_format`) Esta chave não tem o formato do TMDB. |

## Formato da chave (validação antes de enviar)

Espelha `detectKeyFormat` da TV (`tv-web/src/lib/metadata/tmdbConnector.ts`): **v3** = 32 caracteres hexadecimais; **v4** = token JWT de 3 partes (`eyJ…`). O portal aceita os dois, apara espaços e recusa o resto com `invalid_format` **antes** de enviar. O serviço só confere tamanho/alfabeto genérico (16–600, `[A-Za-z0-9._-]`); a TV é a autoridade final.
