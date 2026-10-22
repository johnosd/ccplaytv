# Quickstart: tarefas longas no caminho de navegação (088)

## 1. Pré-requisitos

- `tv-web/` com dependências instaladas (`npm ci`).
- `npm run dev` **no ar** para o E2E. Sem ele a suíte dá 4/54 e parece regressão.
- Para a TV: o IP atual, o coletor de pé e **autorização do usuário para cada instalação**.
- Uma lista real ativa, com catálogo obtido. A linha de base foi medida com **31 915 filmes e 9 769 séries** — numa
  lista muito menor o ganho pode ser imperceptível, e o alvo continua sendo o da lista de referência.

## 2. Checagens automatizadas (em `tv-web/`)

```powershell
npx vitest run src/lib/perf/phaseSpans.tarefas-longas-navegacao.contract.test.ts   # 3/3
npx vitest run src/lib/perf src/features/vod
npm run test
npx tsc -b
npm run lint
npm run build
```

Na raiz, **as seis** travas (as cinco de outras features são o guarda-corpo do FR-002/FR-006):

```powershell
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 088-tarefas-longas-navegacao
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 052-vitrine-filmes-series
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 053-carrosseis-filmes-series
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 057-top10-dica-tmdb
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 086-montagem-rapida-telas
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 087-top10-dica-segundo-plano
```

E2E (use o Bash: no PowerShell o `--` some):

```bash
cd tv-web && npm run test:e2e -- --only vitrine-filmes-series,carrosseis-filmes-series,top10-dica,home-vitrine-expandida
cd tv-web && npm run test:e2e        # gate antes da TV
```

## 3. Conferir sem a TV

O navegador **não aprova fluidez** (dá 60 fps em tudo). Serve para conferir que nada de comportamento mudou:

1. Abrir Filmes, entrar nas fileiras e andar com `← → ↑ ↓`: a ordem é a mesma, e `←` no primeiro cartão volta à lista
   lateral.
2. Abrir um item com OK e voltar: o foco volta **no mesmo cartão**.
3. Com a instrumentação ligada no `dev`, conferir que as chaves `teclaN`/`teclaMs`/`teclaMax`, `renderN`/… aparecem
   agregadas e que **nenhum nome de item** sai no lote.

## 4. TV física — a medição que decide (SC-001 a SC-006)

Siga a skill `tizen-sonda`, **modo C** com a sonda automática:

```powershell
# 1. coletor de pé (só aceita o IP da TV)
node sdd\specs\082-orcamento-armazenamento-tv\sonda-tv\coletor.mjs <ip-da-tv> 8770 --app-saida sdd\specs\088-tarefas-longas-navegacao\evidencias\app-metricas-tv-<data>.jsonl

# 2. build de medição com a sonda (pedir autorização antes de instalar)
$env:VITE_CCPLAY_PERF = "1"; $env:VITE_CCPLAY_METRICS_REPORT = "http://<ip-do-pc>:8770/app-metrics"; $env:VITE_CCPLAY_AUTOPILOT = "1"
npm run build:tizen
.\.planning\scripts\powershell\deploy-tv.ps1 -TvIp <ip-da-tv> -SkipBuild    # -SkipBuild preserva os dados
```

A sonda roda sozinha ~4,5 min: quatro janelas de 60 s (Filmes e Séries, duas vezes), cadência e número de teclas fixos.
Espere a linha com `"janela":0` no `.jsonl`. **`falhas` deve ser 0** — acima disso, alguma janela foi abandonada por a
navegação não ter chegado ao destino, e aquela medida não existe.

Ler do `.jsonl`, contra a linha de base de 2026-10-22:

| Critério | O que olhar | Linha de base | Alvo |
| --- | --- | --- | --- |
| **SC-001** | `longTaskMs / 5000` por janela | 33% (mediana) | **< 15%** |
| **SC-002** | `worstMs` das janelas da sonda | 717–783 ms | **< 300 ms** |
| **SC-003** | `fps` das janelas da sonda | 33–41 | **≥ 45** |
| **SC-006** | `assembly` → `revealMs` | 331–386 ms | continua na faixa |
| **SC-007** | `entry` → `readMs` | mediana 627 ms | reportado (sem alvo) |
| atribuição | `teclaMs` / `renderMs` / `capaMs` | — | ler por `logic/atribuicao.md` §3 |

**Duas rodadas independentes na mesma sessão** (SC-005): o ruído na TV foi de ±2–3 fps, então um ganho só conta se
aparecer nas duas. Ao final, **reinstalar o pacote normal e avisar o usuário**.

Gravar em `evidencias/medicao-tv-<data>.md`: aparelho, o que foi instalado e desinstalado, a tabela por janela, a
classificação (**gate** para SC-001 a SC-006), a atribuição encontrada e a leitura honesta. **Sem** URL, host,
credencial ou nome de item — ler o `.jsonl` atrás de texto do provedor antes de gravar.

## 5. Itens transversais da constituição

- **Foco**: a ordem de navegação, o que OK faz, a rolagem e a restauração ao voltar continuam iguais — é o FR-002, e as
  travas de 052/053 falham se mudar.
- **Dados reais**: card em estado intermediário mostra moldura e dados reais; **nunca** título, nota, posição ou capa
  inventados.
- **Segredos**: só números e nomes de etapa do conjunto fechado saem no canal.
- **Visual**: qualquer ajuste visual é medido e **mostrado ao usuário antes de ficar** (FR-005).
- **Honestidade**: se o custo dominante estiver fora do alcance, encerrar declarando **não cumprido** com a causa
  nomeada é o resultado correto (FR-008) — não escalar para Worker ou outro formato de dados sem decisão nova.
