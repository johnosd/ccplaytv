# Quickstart: Orçamento de armazenamento do app na TV (082)

## Pré-requisitos

- `tv-web/`: dependências instaladas e `npm run dev` no ar (porta 5173).
- `.env` da raiz com `CCPLAY_PROBE_*`, a lista real. **Nunca** imprimir os valores.
- Para a TV: QN50Q60DAGXZD na rede, com o Developer Mode ligado. **Cada instalação é avisada e autorizada pelo usuário
  antes.**

## Checagens automatizadas

```powershell
cd tv-web
npx vitest run src/lib/catalog/storageBudget.orcamento-armazenamento.contract.test.ts   # contrato 5/5
npx vitest run src/lib/catalog src/lib/epg src/features/catalog src/features/home src/features/live
npm run test; npx tsc -b; npm run lint; npm run build
powershell -NoProfile -File ..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 082-orcamento-armazenamento-tv
```

## Cenário A: simulação no PC (gate antes da TV)

1. `node scripts/bench/simular-cota-tv.mjs` (T004): 80 MiB forçados, perfil persistente, lista real.
2. **Antes** do formato novo: registre o uso por tabela (linha de base).
3. **Depois**: o catálogo da lista real fica ≤ ~5 MB e o guia ≤ ~1 MB, sem `QuotaExceededError` e sem STO-01.
4. Com o teto reduzido (`config.capBytes` pelo gancho de dev): navegue por 50 categorias sem erro, e veja a linha de
   cobertura parcial no Início (SC-005).

## Cenário B: E2E

`npm run test:e2e`, incluindo `e2e/orcamento-armazenamento.mjs` (T048) e a legibilidade da linha nova.

## Cenário C: medir algo novo na TV com a sonda (opcional)

1. Acrescente o teste em `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/app2/tests.js`.
2. Ensaie no PC servindo na mesma origem (veja `sonda-tv/README.md`).
3. **Peça autorização ao usuário.** Rode `node sonda-tv/coletor.mjs <ip-da-tv>` num terminal e
   `sonda-tv/instalar-sonda.ps1 -App app2 -AppId ccpSondaV2.Capacidades` noutro.
4. Leia `evidencias/sonda-tv2.jsonl`, registre o resultado e **desinstale** (`tizen uninstall -p <id> -t QN50Q60DAGXZD`).

## Cenário D: validação final na TV (T050, gate)

1. **Avisar e pedir permissão.** Instale o pacote normal (`deploy-tv.ps1`).
2. **SC-001**: com a lista real, a pré-carga e o guia completos, Sobre & créditos mostra ≤ 20 MiB de 80 MiB.
3. **SC-004**: troque entre 3 listas, entre em muitas categorias, abra séries, favorite, assista e faça o Atualizar da
   licença. Não pode aparecer nenhuma mensagem de armazenamento.
4. **Com o pacote de medição** (`VITE_CCPLAY_PERF=1`, avisando antes):
   - **SC-002**: entre em 5 categorias grandes e compare a 1ª página com os 178 ms de hoje;
   - **SC-003**: zero quadros > 100 ms durante a conversão e a pré-carga;
   - **SC-007**: o tempo de gravar o guia fica ≤ 3 s.
5. Volte ao pacote normal, avisando.

## Itens cross-cutting

- Segredos: as evidências e os JSON levam só números. `.amostras/` fica fora do git.
- `CCPlayTv/config.xml` sem privilégio novo.
