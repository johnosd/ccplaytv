# Quickstart: tarefas longas fora do caminho de navegação (089)

## 1. Pré-requisitos

- `tv-web/` com dependências instaladas (`npm ci`).
- `npm run dev` **no ar** para o E2E. Sem ele a suíte dá 4/54 e parece regressão.
- Para a TV: o IP atual, o coletor de pé e **autorização do usuário para cada instalação** (FR-015). O orçamento da
  feature é de **quatro** (FR-010/SC-012) — não gaste uma sem a sonda consertada.
- Uma lista real ativa, com catálogo obtido. A linha de base foi medida com **43 549 filmes / 34 categorias** e
  **9 777 séries / 28**; numa lista muito menor o ganho pode ser imperceptível, e o alvo continua sendo o da
  referência.

## 2. Checagens automatizadas (em `tv-web/`)

```powershell
npx vitest run src/lib/perf/keyDelay.tarefas-longas-fora-navegacao.contract.test.ts src/lib/perf/autopilot.tarefas-longas-fora-navegacao.contract.test.ts   # 5/5
npx vitest run src/lib/perf src/features/vod
npm run test              # baseline 3727/3727; flake herdado: progressRecorder.falhas.test.ts (1 em 2)
npx tsc -b
npm run lint              # inclui o ratchet — ATENÇÃO ao teto de VodShowcaseScreen.tsx (733) e useRemoteNav.ts (319)
npm run build
```

Na raiz, **as nove** travas (as oito de outras features são o guarda-corpo do FR-004/FR-007):

```powershell
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 089-tarefas-longas-fora-navegacao
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 052-vitrine-filmes-series
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 053-carrosseis-filmes-series
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 057-top10-dica-tmdb
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 082-orcamento-armazenamento-tv
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 085-gravacao-carga-secao-tv
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 086-montagem-rapida-telas
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 087-top10-dica-segundo-plano
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 088-tarefas-longas-navegacao
```

E2E (use o Bash: no PowerShell o `--` some):

```bash
cd tv-web && npm run test:e2e -- --only vitrine-filmes-series,carrosseis-filmes-series,top10-dica,home-vitrine-expandida
cd tv-web && npm run test:e2e        # gate antes da TV; se falhar, --only <nome> --jobs 1 antes de chamar de flake
```

## 3. Conferir sem a TV

O navegador **não aprova fluidez** (dá 60 fps em tudo). Serve para conferir que nada de comportamento mudou:

1. Abrir Filmes, entrar nas fileiras e andar com `← → ↑ ↓`: a ordem é a mesma, e `←` no primeiro cartão volta à lista
   lateral.
2. Abrir um item com OK e voltar: o foco volta **no mesmo cartão** (por id, não por índice).
3. Card sem capa disponível: **moldura e título real**, sem nota, posição ou capa inventados (FR-007).
4. Com a instrumentação ligada no `dev`, conferir que as chaves `atrasoAte50Ms`/`atrasoAte50N`/… aparecem agregadas e
   que **nenhum nome de item** sai no lote.

### 3.1 Ensaio da sonda no PC — obrigatório antes de gastar instalação (FR-009)

O conserto do autopilot é testável sem a TV, e **tem que ser**: uma rodada perdida é 1/4 do orçamento.

- Playwright de `tv-web/node_modules`, servidor falso servindo o build de medição, `VITE_CCPLAY_AUTOPILOT=1`.
- Script no **scratchpad**, nunca no repositório.
- Verificar: a sonda alcança Filmes **e** Séries, e a linha final traz **`falhas: 0`**.
- Isto é **diagnóstico**, não aprovação: todas as variantes dão ~60 fps no PC.

## 4. TV física — as rodadas que decidem (SC-001 a SC-006)

Siga a skill `tizen-sonda`, **modo C** com a sonda automática. A TV de referência estava em `192.168.0.2` e o PC em
`192.168.0.14` na sessão de 2026-10-22 — confirme os dois antes.

```powershell
# 1. coletor de pé (só aceita o IP da TV)
node sdd\specs\082-orcamento-armazenamento-tv\sonda-tv\coletor.mjs <ip-da-tv> 8770 --app-saida sdd\specs\089-tarefas-longas-fora-navegacao\evidencias\app-metricas-tv-<data>.jsonl

# 2. build de medição com a sonda (PEDIR AUTORIZAÇÃO ANTES DE INSTALAR)
$env:VITE_CCPLAY_PERF = "1"; $env:VITE_CCPLAY_METRICS_REPORT = "http://<ip-do-pc>:8770/app-metrics"; $env:VITE_CCPLAY_AUTOPILOT = "1"
npm run build:tizen
.\.planning\scripts\powershell\deploy-tv.ps1 -TvIp <ip-da-tv> -SkipBuild    # -SkipBuild preserva os dados

# 3. ao final de CADA rodada: pacote normal de volta, e avisar o usuário
Remove-Item Env:VITE_CCPLAY_PERF,Env:VITE_CCPLAY_METRICS_REPORT,Env:VITE_CCPLAY_AUTOPILOT -ErrorAction SilentlyContinue
npm run build:tizen; .\.planning\scripts\powershell\deploy-tv.ps1 -TvIp <ip-da-tv> -SkipBuild
```

Antes de instalar, confirme que o build de medição **leva** os marcadores (`atrasoAte50Ms` em `CCPlayTv/assets`) e que
o normal **não leva** nenhum. Durante a medição, **não toque no controle**: uma tecla sua entra no portão de atividade
e contamina a janela.

A sonda roda sozinha ~4,5 min: quatro janelas de 60 s (Filmes e Séries, duas vezes). Espere a linha com `"janela":0` no
`.jsonl`. **`falhas` deve ser 0** — se vier 2, o conserto da Fase 2 não fechou: volte a ele, não insista na TV.

Ler do `.jsonl`, contra a linha de base de 2026-10-22:

| Critério | O que olhar | Linha de base | Alvo |
| --- | --- | --- | --- |
| **SC-001** | `longTaskMs / 5000` por janela | 28% (mediana) | **< 15%** |
| **SC-002** | `worstMs` | 400 ms (mediana), até 817 | **< 300 ms** |
| **SC-003** | `fps` | 41 (mediana); 36/40 nas janelas da sonda | **≥ 45** |
| **SC-006** | `falhas` na linha `"janela":0` | 2 | **0** |
| **SC-007** | `assembly` → `revealMs` | `movies` 343–376, `series` 317 | continua em 313–386 ms |
| **SC-008** | `entry` → `readMs` | mediana 239–384 ms | reportado (sem alvo) |
| atribuição | `atrasoAte50Ms` / `atrasoAte150Ms` / `atrasoAte300Ms` / `atrasoAcima300Ms` / `atrasoSemTeclaMs` | — | ler por `logic/atraso-e-sonda.md` §1 |

**Duas rodadas independentes na mesma sessão** (SC-005): o ruído na TV é de ±2–3 fps, então um ganho só conta se
aparecer nas duas.

Gravar `evidencias/medicao-tv-<data>.md` por rodada: aparelho, o que foi instalado e desinstalado, a tabela por janela,
a classificação (**gate** para SC-001 a SC-006), a atribuição e a leitura honesta. **Sem** URL, host, credencial ou
nome de item — **ler o `.jsonl` atrás de texto do provedor antes de gravar**.

## 5. Itens transversais da constituição

- **Foco**: a ordem de navegação, o que OK faz, a rolagem e a restauração ao voltar continuam iguais — é o FR-004, e as
  travas de 052/053 falham se mudar. Reduzir a janela de virtualização **não pode** desmontar o item focado (R-003).
- **Dados reais**: card em estado intermediário mostra moldura e dados reais; **nunca** título, nota, posição ou capa
  inventados (FR-007).
- **Segredos**: só números e rótulos do conjunto fechado saem no canal (FR-014).
- **Visual**: qualquer ajuste visual é medido **e mostrado ao usuário na TV antes de ficar** (FR-006) — inclusive se o
  card passar a ficar sem capa por mais tempo.
- **Honestidade**: esgotado o orçamento de quatro rodadas, ou se o alvo exigir Worker/outro formato de dados, encerrar
  declarando **não cumprido** com a causa nomeada é o resultado correto (FR-010/FR-011) — não escalar sem decisão nova.
