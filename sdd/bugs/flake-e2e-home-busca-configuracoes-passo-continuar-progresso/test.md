# Bug Verification: Detalhe do filme pode voltar do player sem "Continuar" (flake do E2E da 026)

- **Slug**: flake-e2e-home-busca-configuracoes-passo-continuar-progresso
- **Testado**: 2026-09-30
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

A instabilidade do E2E não reproduz mais: 0 falhas em 30 execuções seguidas,
contra 2 em 10 antes do fix. O fix é só no script (espera o "Continuar"); o app
não mudou, e o efeito para a pessoa — o rótulo "Assistir" por ~60 ms ao voltar
do player — continua existindo e está registrado como follow-up opcional.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `node e2e/home-busca-configuracoes.mjs` × 30, dev server em `localhost:5173` | pass | 0/30 falhas. Antes do fix, mesma máquina e mesmo servidor: 2/10 no mesmo passo |
| Progresso realmente gravado | Sonda temporária (removida) × 12 lendo `userStates` no IndexedDB | pass | `progressSeconds: 60` presente em 12/12; o rótulo correto chegava em 1–65 ms |
| Código do app intacto | `git status --short tv-web/src` | pass | Sem alterações em `tv-web/src`; tentativas em `PlayerLayer.tsx` foram revertidas |
| Testes / contratos | Não reexecutados nesta fase | not-run | Nenhum arquivo de `src/` mudou desde as rodadas verdes dos bugs 1 e 2 (29/09): suíte 1789/1793 com os 4 flakes conhecidos e travas 027/029 íntegras |
| Lint | `npm run lint` | pass | exit 0, rodado após as edições de `e2e/` desta sessão |
| Script vizinho | `node e2e/filmes-series-ds-v14.mjs` | pass | Passa inteiro após o ajuste ad-hoc do Trailer |

## Output Excerpts

```
falhas: 0/30
[probe] texto imediato: "▶ Assistir" ... Continuar apareceu após (ms): 56 | userStates: [[{"c":null},{"p":60,"c":null}]]
```

## Residual Risks

- O detalhe do filme mostra "▶ Assistir" por ~60 ms ao voltar do player antes de virar "▶ Continuar de mm:ss". Não perde dado, mas é visível em teoria; na TV, com IndexedDB mais lento, pode durar mais. Não medido no aparelho.
- 0/30 com taxa anterior de ~20 % dá confiança alta, não certeza (probabilidade de 30 sucessos por acaso com 20 % de falha ≈ 0,1 %).
- A suíte de unidade não foi reexecutada nesta fase (sem mudança em `src/`).

## Recommendation

Fechar. Se o piscar de "Assistir" incomodar na passada física (item 58), abrir
uma melhoria ad-hoc para segurar o rótulo enquanto a leitura do estado do
usuário está em andamento depois de fechar o player.
