# Lógica: sondas, simulação no PC e portão do híbrido (feature 082)

Fecha o "como" de US6 (FR-015 a FR-017). As sondas já rodaram duas vezes na TV (2026-10-18), e os resultados estão em
`evidencias/`. Este documento descreve a **ferramenta** que fica no repositório e como usá-la de novo.

## 1. Ferramenta (`sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/`)

| Peça | Papel |
| --- | --- |
| `app/` | Sonda 1, de cota: valor da cota, alavancas, estourar, outras APIs, `wgt-private`, compressão sintética |
| `app2/` | Sonda 2, de capacidades: ambiente e APIs, CPU, compressão e pedaços com amostras reais, Worker e travamento da tela, IndexedDB, renderização, rede local, memória |
| `coletor.mjs` | Coletor no PC: aceita só o IP da TV, grava `evidencias/*.jsonl` e serve amostras, `/ping` e `/bin` |
| `medir-lista-real.mjs` | Medição no PC com a lista real (`CCPLAY_PROBE_*`, nunca impressas). Gera `evidencias/medicao-lista-real-pc-*.json` e as amostras sanitizadas em `.amostras/` (gitignored) |
| `instalar-sonda.ps1` | Empacota e instala o app de teste (`-App app\|app2 -AppId …`) com o perfil Samsung |

Regras (FR-015/FR-017):
- é um app **separado**, com outro id e outra pasta de dados, e nunca toca o CCPlayTV;
- **avisar e esperar a autorização do usuário antes de instalar**;
- **desinstalar no fim** (`tizen uninstall -p <id> -t QN50Q60DAGXZD`);
- o relatório só leva números, nomes de API e nomes de erro;
- as amostras passam por `assertClean`: sem usuário, senha ou host do provedor, e com a URL das capas trocada para
  `img.fixture.test`;
- nada daqui entra em `tv-web/` nem no pacote da loja.

Para medir algo novo, acrescente uma função em `app2/tests.js`, ensaie no PC (§2), peça autorização e instale.

## 2. Simulação no PC (FR-016)

Script `tv-web/scripts/bench/simular-cota-tv.mjs` (T004), que segue o ensaio feito no scratch:
- Playwright com **`launchPersistentContext`** (o perfil off-the-record usa outro pool de cota);
- `--disable-features=StaticStorageQuota` (sem isso o `estimate()` informa uso + 10 GiB e ignora o override);
- CDP `Storage.overrideQuotaForOrigin` com 80 MiB **antes** de abrir o banco, na origem do dev server
  (`http://localhost:5173`);
- **Compressão**: o Chromium do PC (≥ 129) comprime os valores grandes e a TV (M120) não. Para o formato antigo, o PC
  subestima o uso. O formato novo já grava gzip, e aí a diferença some (os bytes já vêm comprimidos). Usar a simulação
  como gate de comportamento (estourar, liberar, sem erro), e a TV como gate de números.

O roteiro E2E do orçamento (T042) roda com essa simulação.

## 3. Portão do híbrido: resultado

| Critério | Resultado |
| --- | --- |
| 1. Encolher não basta | **Não**: comprimido, a lista real cai para ~3–5 MB (≤ 25 % da cota com folga) |
| 2. Ganho grande de espaço | Sim: `wgt-private` fica fora da cota (100 MB gravados com a cota cheia) |
| 3. Não mais lento que hoje | **Não**: leitura ~3× mais lenta (459 contra 140 ms) e gravação a 0,8 MB/s |
| 4. Usuário confirma | Não se aplica |

→ **Descartado** (T033 registra isso no `decision.md` da avaliação).
