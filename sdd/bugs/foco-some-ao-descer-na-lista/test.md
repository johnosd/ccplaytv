# Bug Verification: Foco some ao descer na lista de episódios do detalhe da série

- **Slug**: foco-some-ao-descer-na-lista
- **Testado**: 2026-10-22
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Encerrado em 2026-10-22 após confirmação do usuário na TV física: todos os itens do [roteiro único](../ROTEIRO-TV-2026-10-22.md) foram validados com sucesso. No item 1, foco e rolagem dos episódios foram aprovados ao descer e voltar pela lista. A evidência física é o relato do usuário, não uma execução automatizada desta sessão.

Esta atualização é documental; os testes automatizados abaixo não foram reexecutados. As falhas antigas de E2E alheias à correção permanecem registradas, sem novo veredito sobre elas.

### Registro anterior — 2026-10-05

O sintoma original não reproduz mais no Chromium: com uma temporada de 14 episódios a linha focada fica dentro da tela em todos os passos de ↓ e ↑, a página acompanha, e de volta às ações ela volta ao topo. É `partial` porque **a TV física (onde o usuário viu o problema) não foi verificada**, porque a suíte E2E completa teve uma falha intermitente em outro roteiro que passa isolado, e porque dois E2E antigos falham independentemente desta correção.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução original (sem o fix) | `node e2e/serie-foco-episodios.mjs` com o `SeriesDetailScreen.tsx` guardado de lado | fail (esperado) | Episódio 1 já fora da tela (topo 1010, base 1260 de 1080); ↓ 2..14 todos fora; `scrollTop` da página em 0. Confirma que o roteiro pega o bug. |
| Reprodução (pós-fix) | `node e2e/serie-foco-episodios.mjs` (reexecutado nesta fase) | pass | 6/6: 1º episódio à vista (792–1042), episódios 2→14 e 13→1 à vista, rolagem máxima 3178 px, retorno ao topo, sempre há foco. |
| Testes novos | `npx vitest run src/features/series/SeriesDetailScreen.foco-episodios.test.tsx` | pass | 2 testes. O primeiro falha sem o fix (conferido). |
| Testes das áreas | `npx vitest run src/features/series src/features/movies src/features/vod src/components src/lib/focus` | pass | 134 arquivos, 770 testes. |
| Lint / type-check | `npx tsc -b`; `npm run lint` | pass | tsc exit 0; lint sem erros (só avisos antigos). |
| Regressão E2E | `npm run test:e2e` (suíte inteira) | partial | 35/38. `serie-foco-episodios` ✓. Falharam `metadata-tmdb` e `semelhantes-elenco-ator` (**já falhavam sem as mudanças**: desatualizados em relação à 059) e `headers-catchup` (**passou isolado 2×**; falha única na suíte paralela, causa não identificada). |
| TV física | — | not-run | Fora do alcance desta sessão (sem deploy). |

## Output Excerpts

```
== sem o fix ==
✗ FALHOU: 1º episódio focado e à vista (topo 1010, base 1260 de 1080)
  episódio 2 fora da tela (topo 1242, base 1492 de 1080)
== com o fix ==
✓ 1º episódio focado e à vista (topo 792, base 1042 de 1080)
✓ descendo do episódio 2 ao 14, a linha focada ficou dentro da tela em todos os passos
✓ a página rolou para acompanhar o foco (rolagem máxima 3178px)
35/38 scripts passaram em 286s — Falharam: metadata-tmdb, semelhantes-elenco-ator, headers-catchup
```

## Residual Risks

Registro de 2026-10-05: a pendência de observação física do foco e da fluidez foi encerrada pela confirmação de 2026-10-22. As demais limitações abaixo permanecem como histórico e fora do escopo deste aceite.

- Rolagem em Tizen/Chromium 120 (fluidez de `scrollIntoView` com linhas de 232 px) não foi vista na TV física.
- Temporadas com centenas de episódios: a lista não rola, então o virtualizador renderiza todas as linhas (já no assessment; não alterado).
- Anel de foco largo da linha inteira (`.vod-episode-row.tv-focus`): observação visual antiga, fora do escopo.
- `headers-catchup`: uma falha em 3 execuções completas hoje (as demais passaram, e 2 execuções isoladas passaram); não reproduzido, não atribuído a esta mudança.
- `metadata-tmdb` e `semelhantes-elenco-ator` seguem vermelhos por motivo anterior a esta correção.

## Recommendation

Fechar como `verified`, conforme validação física e autorização expressa do usuário em 2026-10-22: "Todos os itens foram validados com sucesso. Podem fechar todos esses bugs".

### Recomendação anterior — 2026-10-05

Segurar até o usuário confirmar na TV que o foco acompanha ao descer pelos episódios; então fechar como `verified`. Se confirmar, o carrossel horizontal vira decisão independente (o bug do foco estará resolvido sem ele). Os dois E2E desatualizados merecem um item próprio.
