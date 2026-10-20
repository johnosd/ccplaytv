# Quickstart: Gravação da carga por seção mais rápida na TV (085)

## 1. Pré-requisitos

- `tv-web/` com as dependências instaladas (`npm ci`).
- As amostras sanitizadas da sonda em `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/.amostras/` (geradas por
  `medir-lista-real.mjs`, nunca versionadas) e os brutos gerados por `memoria/gerar-vod-bruto.mjs` (filmes, séries e
  canais depois de T002).
- Para a TV: o IP atual da TV (o instalador da sonda acha), o coletor no ar e **autorização do usuário para cada
  instalação**.

## 2. Checagens automatizadas (em `tv-web/`)

```powershell
npx vitest run src/lib/catalog/storageBudget.gravacao-carga-secao.contract.test.ts src/lib/catalog/sectionLoader.gravacao-carga-secao.contract.test.ts src/lib/perf/metricsChannel.gravacao-carga-secao.contract.test.ts   # 5/5
npm run test
npx tsc -b
npm run lint
npm run build
Select-String -Path dist\assets\*.js -Pattern 'ccplay-app-metrics'      # SC-007: nenhuma linha
```

Na raiz:

```powershell
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 085-gravacao-carga-secao-tv
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 082-orcamento-armazenamento-tv
```

E2E, com `npm run dev` no ar (use o Bash: no PowerShell o `--` some):

```bash
cd tv-web && npm run test:e2e -- --only orcamento-armazenamento,carga-listas   # SC-003 e regressão da carga
cd tv-web && npm run test:e2e                                                    # gate antes da TV
```

## 3. Ensaio do canal de métricas no PC (US3)

```powershell
node sdd\specs\082-orcamento-armazenamento-tv\sonda-tv\coletor.mjs 127.0.0.1 8770 --app-saida $env:TEMP\app-metricas.jsonl
```

Em outro terminal, em `tv-web/` (Bash):

```bash
VITE_CCPLAY_PERF=1 VITE_CCPLAY_METRICS_REPORT=http://127.0.0.1:8770/app-metrics npm run dev
```

Abra o app, adicione ou atualize uma lista de teste e espere a pré-carga. O arquivo deve receber linhas
`section-load` (uma por seção, com `readMs`, `budgetMs`, `totalMs`, …), `entry` e `frames`. Procure no arquivo
qualquer nome de canal, categoria ou título, ou "http": **não pode haver nenhum**.

Sem as variáveis (`npm run dev` normal), o coletor não recebe nada.

## 4. TV física — sonda (SC-001, SC-002, SC-005)

Siga a skill `tizen-sonda`. Resumo:

1. `node sonda-tv/memoria/gerar-vod-bruto.mjs` e `node sonda-tv/memoria/empacotar.mjs`, rodados a partir da raiz, com o
   caminho completo.
2. Coletor: `node sdd\specs\082-orcamento-armazenamento-tv\sonda-tv\coletor.mjs <ip-da-tv>`.
3. **Pedir autorização** e instalar com `instalar-sonda.ps1 -App app2 -AppId ccpSondaV2.Capacidades -Only etapasSecao`.
4. Pelo menos 2 rodadas por seção (filmes, séries, canais). Critério:
   - filmes: `totalMs` ≤ 10 000 em **todas** as rodadas e `budgetMs` ≤ 1 000;
   - séries e canais: a rodada mais lenta fica ≤ 110 % da mais lenta da linha de base (T003, D-006).
5. Desinstalar a sonda e conferir que o `applist` mostra só o CCPlayTV. Gravar em
   `sdd/specs/085-gravacao-carga-secao-tv/evidencias/tv-sonda-<data>.md`.

## 5. TV física — app real (SC-006, SC-008)

1. `npm run test:e2e` verde (seção 2), que é gate antes da TV.
2. Coletor apontando para a evidência da feature:
   `node sdd\specs\082-orcamento-armazenamento-tv\sonda-tv\coletor.mjs <ip-da-tv> 8770 --app-saida sdd\specs\085-gravacao-carga-secao-tv\evidencias\app-metricas.jsonl`
3. Build de medição com `VITE_CCPLAY_PERF=1` e `VITE_CCPLAY_METRICS_REPORT=http://<ip-do-pc>:8770/app-metrics`, depois
   `npm run build:tizen`. O sync não pode recusar (R-005).
4. **Pedir autorização** e instalar pela skill `tizen-tv`. Faça ≥ 1 carga da lista real (Atualizar ou adicionar).
5. Registrar os números por seção (`totalMs`, `budgetMs`, `gateWaitMs`) e ler o `.jsonl` atrás de texto do provedor
   (SC-008).
6. **Reinstalar o pacote normal, avisando o usuário.**

## 6. Itens transversais da constituição

- **Segredos**: nenhuma linha do coletor tem URL, credencial ou texto do provedor. O destino do canal é só local, e o
  build normal não tem o canal.
- **Testes por task**: o Vitest da área tocada passa a cada task.
- **E2E antes da TV**: `npm run test:e2e` verde antes de T043/T044.
- **Documentação canônica**: `tizen-sonda` (2 cópias idênticas, `diff -q`) e o README do coletor atualizados.
