# Bug Verification: EPG "vinculado, recente" mas guia e "Agora" vazios

- **Slug**: epg-vinculado-recente-mas-guia-vazio
- **Testado**: 2026-10-15
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

O sintoma não aparece mais: o usuário viu o guia e o "Agora" normais na TV física
(2026-10-15). Nenhum fix foi aplicado neste bug e a causa do episódio anterior não
foi identificada, por isso o resultado é `partial`, não `verified`. **Fechado em
2026-10-15 por decisão do usuário.**

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução na TV física | Observação do usuário: abrir a lista, ver Live TV e o guia | pass | Relato do usuário; não foi uma passada roteirizada pela skill `tizen-tv`, e não se sabe que build está instalado. |
| Reprodução no navegador (lista real) | Sondas do Assess (`npm run dev` + Playwright; pedido direto ao painel) | pass | Não reproduz: 131/131 ids casam, 123 com programa agora (ver `assessment.md`). |
| Testes novos/atualizados | — | not-run | Nenhum teste foi criado (fix `not-applied`). |
| Suite de regressão | — | not-run | Nenhum código mudou. |
| Lint / type-check | — | not-run | Nenhum código mudou. |

## Output Excerpts

```
Assess (navegador, lista real): epgActiveGeneration 1 · 10.824 programas · 131 ids
  casam exatamente 131 · com programa agora 123 · só por caixa 0
Painel (UA Tizen, Origin null): 200 · ACAO * · 40.877 programas · 135/135 ids casam
```

## Residual Risks

- Não se sabe o que esvaziou o guia na TV antes. A hipótese mais compatível
  (sincronização que trouxe 0 programas, registrada como sucesso) não foi provada
  nem descartada no aparelho.
- O defeito do código continua: `epgSync.ts` registra sucesso com 0 programas, e
  `writeEpgPrograms` troca uma programação boa por uma geração vazia. Se o painel
  devolver um XMLTV vazio uma vez, o guia esvazia de novo, com "vinculado, recente".
- A TV não mostra nenhum número do EPG. Se o problema voltar, continua sem
  diagnóstico no aparelho.

## Recommendation

Fechar por decisão do usuário: o sintoma não aparece mais na TV. Se o guia vazio
com "vinculado, recente" voltar, reabrir pela fase Assess e aplicar a remediação
preferida do `assessment.md`, que já está pronta.
