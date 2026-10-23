# Bug Verification: licenca.spec.ts:43 falha esporádica ao esperar "Renovar licença"

- **Slug**: playwright-portal-licencaspects43-falha-esporadica-renovar
- **Testado**: 2026-10-23
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

A corrida diagnosticada (`approve()` com leitura do painel em voo → `device` velho → "Renovar licença" ausente) não reapareceu nas execuções medidas depois do fix. Porém ainda surgem falhas raras de primeira carga da página em testes variados, que não são essa corrida e não foram explicadas — por isso `partial`, não `verified`.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `npx playwright test --project=default` × 6 + × 14 (rodada do fix) | pass (20/20) | antes: `licenca.spec.ts:43` falhou em 4 de ~20 suítes |
| Estabilidade dos testes | `npx playwright test e2e/gerenciador.spec.ts:95 e2e/licenca.spec.ts --project=default --repeat-each=15 --workers=6` → 150/150; `--repeat-each=10` → 160/160 | pass | |
| Suíte de regressão | `npx playwright test` (4 projetos) → 65 passaram, 4 pulados nesta rodada | pass | mas ver abaixo |
| Rodadas completas durante a investigação | ~55 execuções de todos os projetos depois das correções | **3 falhas** | `layout.spec.ts:81` (campo do ID não aparece), `licenca.spec.ts:158` ("Listas" não aparece em 10 s) e `licenca.spec.ts:46` (erro não capturado); nenhuma é a espera de "Renovar licença" confirmada |
| Lint / type-check | `npx tsc -b`; `npm run lint`; `npx vitest run` do portal (37/37) | pass | |

## Output Excerpts

- Antes: `Locator: getByRole('button', { name: 'Renovar licença', exact: true }) … element(s) not found`, com "Pagamento confirmado…" visível.
- Falhas residuais: `Expect "toBeVisible" getByRole('heading', { name: 'Listas', level: 1 }) with timeout 10000ms … element(s) not found` (`licenca.spec.ts:38`, no fixture); `expect(locator('input[name=displayId]')).toBeFocused()` sem o elemento (`layout.spec.ts:81`).

## Residual Risks

- Falha de primeira carga ainda sem causa (≈ 1 em 15–40 suítes completas, só com os 4 projetos em paralelo; o `error-context.md` não trouxe snapshot da página). Hipóteses não confirmadas: carga do dev server, ou o estado de sessão do fixture. Elevar o timeout do `expect` para 10 s foi testado e **não** resolveu (revertido).
- O `licenca.spec.ts:46` falhou uma vez após o fix sem erro capturado: não é possível afirmar que a corrida do `approve` está 100% fechada.

## Recommendation

Segurar — a corrida diagnosticada está tratada e não reapareceu, mas a suíte completa ainda tem uma falha rara de primeira carga. Se persistir, rodar Assess de novo com `--trace on` na rodada que falhar.
