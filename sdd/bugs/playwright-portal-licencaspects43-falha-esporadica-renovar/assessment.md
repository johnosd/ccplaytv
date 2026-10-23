# Bug Assessment: licenca.spec.ts:43 falha esporádica ao esperar "Renovar licença"

- **Slug**: playwright-portal-licencaspects43-falha-esporadica-renovar
- **Criado**: 2026-10-23
- **Origem**: desdobramento do bug `playwright-portal-gerenciadorspects95-falha-na-suite` (R-010 da feature 091); no primeiro assess a falha do `licenca.spec.ts` não tinha sido reproduzida e a hipótese era "partida a frio do Vite" (confiança baixa)
- **Veredito**: valid
- **Severidade**: medium (teste instável da suíte paralela do portal; o produto se comporta como projetado)

## Report

`licenca.spec.ts` falha esporadicamente na suíte `--project=default`: `:124` uma vez (o título "Listas" não aparece) e `:43` quatro vezes em ~20 suítes completas
(a 4ª, capturada com detalhe, na 8ª suíte de uma sequência). Reexecutado isolado ou com `--repeat-each=12 --workers=6` (120 repetições) passa sempre.

## Symptom

`licenca.spec.ts:67`: depois de `state.approve()` e de uma releitura forçada, aparece "Pagamento confirmado. Na TV, aperte Atualizar…" mas o botão **"Renovar licença"**
não aparece em 5 s (`element(s) not found`). O snapshot da página na falha mostra o aviso de pagamento confirmado e nenhum botão "Renovar licença".

## Reproduction

1. Dev server do portal na 5174; `cd portal-web; for i in 1..8: npx playwright test --project=default` (suíte paralela inteira).
2. Em ~1 de cada 4–8 suítes, `licenca.spec.ts:43` falha como acima. Isolado/repetido sozinho não reproduz.

## Suspected Code Paths

- `portal-web/e2e/licenca.spec.ts:61-67` — `refresh(page)` (evento `visibilitychange`), `state.approve()`, outro `refresh(page)` e a espera por "Renovar licença".
- `portal-web/src/features/shell/useTvData.ts:19-33` — `refresh` é **serializado de propósito**: "uma leitura em andamento não dispara outra" (`if (loading.current) return`). O rótulo
  "Renovar licença" depende de `device` (licença ativa), lido por essa leitura compartilhada; o aviso "Pagamento confirmado" vem de outra fonte (pedido da compra).
- `portal-web/e2e/licenca.spec.ts:134-141` — mesmo padrão (`approve()` + `refresh`), hoje protegido porque o fixture já esperou a leitura inicial.

## Root Cause Hypothesis

Condição de corrida **no teste**: o primeiro `refresh(page)` (linha 61) inicia uma leitura; o teste só espera "Aguardando pagamento" (que não prova que a leitura terminou) e então faz
`approve()` + o segundo `refresh(page)` (linha 64). Se a primeira leitura ainda está em voo, o segundo gatilho é **descartado** pela serialização (`loading.current`), e a leitura em voo pode ter
pego o dispositivo ainda sem a aprovação; o `device` fica velho até o próximo ciclo de 10 s, maior que o timeout de 5 s. Confiança: **high** (o snapshot da falha mostra o aviso vindo do pedido
sem o botão derivado do dispositivo; a serialização descarta o gatilho; a taxa sobe com a carga paralela). A serialização é decisão de design do portal (D-003) e não é o defeito.
O `:124` da primeira rodada pode ser a mesma família (leitura inicial lenta antes do "Listas"), mas não foi capturado com detalhe: fica como observação.

## Proposed Remediation

**Preferida**: no teste, só chamar `state.approve()` depois que a(s) leitura(s) do portal ficarem quietas (contagem de requisições `/portal/v1/` em voo = 0 e total estável), com o mesmo auxiliar
usado no bug irmão, extraído para um arquivo compartilhado de e2e (`portal-web/e2e/portalQuiet.ts`) e reutilizado em `gerenciador.spec.ts`. Aplicar antes de cada `approve()` de `licenca.spec.ts` (linhas 63 e 139).

**Alternativas**:
- `expect(async () => { await refresh(page); await expect(botão).toBeVisible({ timeout: 1000 }) }).toPass()` — idiomático e tolera o gatilho descartado, mas dispara leituras repetidas e deixa a corrida existir; descartada como principal.
- Mudar `useTvData` para enfileirar um refresh pendente — alteração de produto para satisfazer um teste; descartada (a serialização é intencional).

**Files likely to change**:
- `portal-web/e2e/licenca.spec.ts`
- `portal-web/e2e/gerenciador.spec.ts` (usar o auxiliar compartilhado)
- `portal-web/e2e/portalQuiet.ts` (novo)

**Tests to add or update**:
- Os testes `licenca.spec.ts:43` e `:134`; reexecutar a suíte `--project=default` ≥ 12 vezes e `--repeat-each` do arquivo.

## Risks & Considerations

- Sem `waitForTimeout`; a quietude é por contagem de requisições, como no bug irmão.
- Não tocar `useTvData`/`TvDataProvider`.
- Playwright (`page.on('request')`) enxerga requisições atendidas por `context.route`, que é como o fixture de `licenca.spec.ts` as intercepta.

## Open Questions

- Nenhuma bloqueante.
