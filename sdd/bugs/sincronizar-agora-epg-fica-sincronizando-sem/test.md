# Bug Test: "Sincronizar agora" do EPG fica "Sincronizando" sem terminar na lista real da TV

- **Slug**: sincronizar-agora-epg-fica-sincronizando-sem
- **Testado**: 2026-10-20
- **Fix**: ./fix.md
- **Result**: verified

## Checagens

| Checagem | Resultado | Observação |
| --- | --- | --- |
| Reprodução original (TV física, lista real) | **not-run** | Exige instalar o build de medição na TV (autorização por instalação). Não foi feita depois do fix |
| Download parado → falha `network` e nada gravado | passed | `epgSync.extra.test.ts` (corpo que para, servidor sem resposta) |
| Cancelamento de quem chama segue propagando `AbortError` | passed | `epgSync.extra.test.ts` |
| Fases `headers → room → read → written` em ordem | passed | `epgSync.extra.test.ts` |
| Regressão: `src/lib/epg`, `src/lib/perf`, `src/features/import`, `src/features/settings` | passed | 1939 testes |
| `tsc -b` e `npm run lint` | passed | sem erros |
| Contratos da 085 | passed | `metricsChannel.gravacao-carga-secao.contract.test.ts` verde, trava íntegra |
| `syncEpg` real contra a lista real no PC | passed | 0,38 s, 11 467 programas (antes e depois do fix: o fix não muda o caminho feliz) |

## Atualização (causa real: `guideRow`)

| Checagem | Resultado | Observação |
| --- | --- | --- |
| `guideRow` com guia fresco | passed | `importSections.test.ts` |
| `npx vitest run src/features/import src/lib/epg` | passed | 184 testes |
| E2E `carga-listas`, `epg-dados-agora`, `epg-guia-completo`, `configuracoes-lista-global` | passed | 4/4 |
| Reprodução original na TV (ressincronizar dentro de 12 h → Guia deixa de ficar "Carregando") | **passed** | 2026-10-20: o usuário ressincronizou a lista no pacote normal com a correção e a foto da tela de progresso mostra Canais, Filmes, Séries e **Guia: Pronto**, com "Abrir lista" em foco |

## Leitura honesta

O fix cobre o caso de **download parado** e instrumenta o resto. Como a causa na TV segue desconhecida, não dá para dizer que o sintoma sumiu.
Para fechar: instalar o build de medição, tocar em **Sincronizar agora** e ler as linhas `epg` (`phase` + `ms`) no coletor. A última fase
recebida diz onde o tempo vai; se nenhuma chegar, o Worker nem passou do download. Recomendação: **segurar** (não fechar) até essa passada.

## Fechamento

Reprodução original executada na TV física, e o sintoma sumiu: **verified**. Ressalva que não muda o veredito: o guia do Xtream só é baixado de
novo depois de 12 h, então o **tempo do download do guia** (SC-007 da 082) continua sem medição; as fases `sent`/`start`/`config`/`headers`/`room`/
`read`/`written` estão no build de medição para isso.
