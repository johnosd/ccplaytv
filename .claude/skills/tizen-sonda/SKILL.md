---
name: tizen-sonda
description: Avalia performance e bugs na TV Samsung física com uma sonda — um app Tizen pequeno, separado do CCPlayTV, que roda testes de medição na própria TV (fps, pior quadro, CPU, memória, IndexedDB, compressão, rede, comportamento de CSS/API) e devolve só números ao PC por um coletor local, opcionalmente com amostras sanitizadas da lista real do .env. Cobre o ciclo inteiro: formular a hipótese e o critério de aprovação, escrever o teste, ensaiar no PC, pedir autorização, instalar, coletar, repetir rodadas, desinstalar e gravar a evidência. Use quando o usuário pedir para "medir na TV", "rodar uma sonda", "avaliar a performance/um bug na TV", comparar variantes (receita de CSS, estrutura de lista, formato de gravação) com dados reais do aparelho, ou quando o navegador/emulador não puder responder. NÃO use para instalar o app em si (`tizen-tv`), para o emulador (`tizen-emulator`), nem para corrigir o bug depois de medido (`sdd-bugfix`/`sdd-execute`).
---

# tizen-sonda

Uma **sonda** é um app Tizen descartável (outro id, outra pasta de dados) que executa funções de medição **dentro da TV**
e manda só números ao PC. É o jeito mais barato de obter o veredito do aparelho: o navegador do PC dá 60 fps em tudo e
não distingue variantes; a TV de referência (QN50Q60DAGXZD, Tizen 9 / Chromium 120, `file://`, ~310 MB de RAM livres)
distingue. Provado na 082 (cota e capacidades) e na 083 (foco leve: 35 → 51 fps, escolhido por duas rodadas na TV).

Shell: os `.ps1` rodam no PowerShell do ambiente; o coletor é Node. Caminhos a partir da raiz do repositório.

## Quando usar, quando não

| Pergunta | Sonda? |
| --- | --- |
| "Qual das variantes é mais leve na TV?" (CSS, DOM, lista, animação, Worker, gzip, IndexedDB) | **Sim** — comparar lado a lado, na mesma sessão |
| "Esse bug só acontece na TV?" (API ausente, limite de memória/cota, comportamento do Chromium 120) | **Sim** — reprodução mínima no app de teste |
| "O app inteiro está lento no uso real?" | Modo C abaixo (build de medição do app + `PerfOverlay`), com a lista real |
| Reprodução, codec, DRM, teclas | Não — isso é `tizen-tv` com o app (a sonda não tem AVPlay) |

## Regras invioláveis

1. **Autorização antes de CADA instalação na TV** (memória do projeto "perguntar antes de instalar na TV"). "A TV está pronta"
   dito pelo usuário em resposta a essa pergunta vale como aval para a sonda; instalar o app real é outro aval.
2. **Só números, nomes de API e nomes de erro** saem da TV e entram em relatório. Nunca URL de stream, host de provedor,
   usuário/senha, chave, nome de item. Na dúvida, o teste devolve contagem, não conteúdo.
3. **Credenciais ficam no PC.** Dados reais entram na sonda só como **amostras sanitizadas** servidas pelo coletor
   (`medir-lista-real.mjs` lê `CCPLAY_PROBE_*` do `.env` em tempo de execução, nunca imprime, e grava `.amostras/` — pasta
   ignorada pelo git). Nunca coloque `.env`, `docs/m3u/dados.md` ou `staging.env.yaml` na sonda, no log ou no relatório.
4. **Nunca desinstalar o CCPlayTV nem apagar dados da TV.** Só se desinstala a sonda (`ccpSondaV2.Capacidades`).
5. **A sonda vive em `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/`** e nunca entra em `tv-web/` nem no pacote.
6. **O PC nunca aprova desempenho.** O ensaio no PC é diagnóstico (a sonda roda? as variantes pintam o que deveriam?).
7. Nada de "aprovado" sem número da TV; classifique cada evidência: **gate** (decide), **registro** (informa) ou
   **diagnóstico** (não aprova).

## Anatomia (já existe — reutilize, não recrie)

```text
sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/
├── app/                  # sonda 1: cota/armazenamento (padrão do instalar-sonda.ps1)
├── app2/                 # sonda 2: capacidades — a base para qualquer medição nova
│   ├── index.html        # CSS de teste (classes das variantes) + #stage + scripts
│   ├── core.js           # window.P: frames, sleep, log, status, run, send, sample, median, randomText, gzipText, openDb…
│   ├── tests.js          # window.T: uma função async por teste; tabela de retorno no fim
│   ├── main.js           # ordem dos testes; window.PROBE_ONLY roda só os nomes pedidos; Return (10009) sai
│   ├── report-target.js  # GERADO pelo instalador (IP do coletor + PROBE_ONLY) — está no git, muda a cada instalação
│   └── config.xml        # id ccpSondaV2.Capacidades (outro app, privilégios internet + unlimitedstorage)
├── coletor.mjs           # node coletor.mjs <ip-da-tv> [porta 8770]; só aceita o IP da TV; grava ../evidencias/*.jsonl
├── instalar-sonda.ps1    # build + assina + instala + lança (-App, -AppId, -Only)
└── medir-lista-real.mjs  # lista real (.env) → medição no PC + amostras sanitizadas para a sonda
```

API de medição (`core.js`): `P.frames(ms, work)` → `{frames, fps, maxGapMs, longFrames}` (`longFrames` = quadros > 50 ms,
medidos por `requestAnimationFrame`, ou seja, cadência de pintura vista pelo app); `P.log(linha)` (aparece na tela da TV);
`P.sample('movie')` baixa a amostra sanitizada do coletor; `P.run(nome, rótulo, fn)` guarda o resultado e envia.
O código da sonda é **ES5 com `var`, sem módulos** (script clássico), `async/await` pode.

## Escolha o modo

- **A — sintética**: dados e DOM gerados no teste (capas em canvas, grades 7×20, texto aleatório). Para CSS, render, CPU,
  gzip, IndexedDB, Worker. É o padrão; não precisa de `.env`.
- **B — amostras reais sanitizadas**: quando o formato/volume reais importam (tamanho de bloco, compressão, parsing,
  memória). Rode `node sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/medir-lista-real.mjs` (da raiz, precisa do `.env`)
  e leia na sonda com `P.sample('movie' | 'series' | 'channel' | 'epg')` — o coletor serve `/amostra/<nome>.json` e
  `/amostra-gz/<nome>`. A taxa de compressão e o tamanho em disco não dependem do aparelho; o custo de CPU/memória sim.
- **C — app real com lista real**: quando só o app inteiro responde (rolagem com capas reais, entrada em categoria, guia).
  `$env:VITE_CCPLAY_PERF = "1"; npm run build:tizen` (de `tv-web/`) → `deploy-tv.ps1 -SkipBuild -TvIp <ip>` (preserva os
  dados). O `PerfOverlay` mostra números (`quadros>100ms`, `parado>100ms`, `tecla: Nfps pior=Xms >50ms=Y`, tempos de entrada).
  **A leitura é do usuário** na TV, que opera a lista real dele; peça números e respostas específicas, nunca "funcionou?".
  Ao terminar, rebuild normal (sem a variável) e reinstale — e avise: `build:tizen` reescreve `CCPlayTv/assets` rastreados.
- **D — bug**: reduza ao mínimo no app de teste (um teste que reproduz e devolve o nome do erro/valor). Se a sonda não
  reproduz, a causa está no app: volte ao modo C.

## Fluxo

### 1. Defina antes de medir
Hipótese, **métrica** (fps, pior quadro, ms, MB), **critério de aprovação com número** (ex.: ≥ 50 fps e 0 quadros > 50 ms),
**quantas rodadas** (≥ 2) e a **linha de base na mesma sessão** (a variante atual, sempre ao lado das candidatas — comparar
com número de outro dia ou firmware não vale). Registre na spec/plan da feature ou no assessment do bug.

### 2. Escreva o teste em `app2/tests.js`
- Uma função `async function meuTeste()` que devolve um objeto só com números; exporte na tabela final
  (`return { …, meuTeste: meuTeste }`) — o `main.js` já roda `T[nome]` via `PROBE_ONLY`.
- **Não altere** classes/CSS/funções que testes anteriores usam (comparabilidade com a 082): acrescente classes novas.
- Para variantes de CSS: ponha um **modo na grade** (`grid.className = 'grid m-<variante>'`) para que a saída do estado
  também use a transição da variante; senão a regra de repouso comum "vaza" a transição antiga.
- Alterne o estado como o app faz (por `setInterval` de 140 ms, por exemplo) e meça com `P.frames(3000, work)`; **3 s por
  variante**, com uma medição de "parado" para referência. Registre o total de quadros e o que foi movido.
- `P.log('nome: ' + fps + ' fps | pior ' + maxGapMs + ' ms | >50ms ' + longFrames)` — uma linha por medida, legível na TV.
- Cuidado com `var` em laço + closure: capture o valor (ela é chamada de forma assíncrona).

### 3. Ensaie no PC (diagnóstico)
Playwright (de `tv-web/node_modules`) com um servidor HTTP falso que serve `app2/` e troca `report-target.js` por
`window.PROBE_ONLY=['meuTeste']`; espere `#status` começar com "Concluído". Verifique que (a) o teste roda de ponta a ponta
e (b) cada variante **pinta o que deveria** — `getComputedStyle` (inclusive de `::before/::after`) e uma captura. Isso já pegou
um bug real na 083 (regra de repouso com mais especificidade que a de foco: o brilho de duas candidatas nunca acendia).
Todas darão ~60 fps no PC: o ensaio **não** decide nada. Script de ensaio no scratchpad, nunca no repositório.

### 4. Peça autorização
`AskUserQuestion`: a TV está ligada, com Developer Mode e o Host PC IP apontando para este PC? Avise o que será instalado
(`ccpSondaV2.Capacidades`, app separado) e que será desinstalado ao final. Sem resposta afirmativa, pare.

### 5. Ache a TV e suba o coletor
```powershell
# IP: ARP + porta 26101 (o instalador faz isso, mas o coletor precisa do IP antes)
$hosts = (arp -a | Select-String "(192\.168|10\.\d+)\.\d+\.\d+" | % { ($_.ToString().Trim() -split "\s+")[0] }) | ? { $_ -match "^\d+\.\d+\.\d+\.\d+$" -and $_ -notmatch "\.(255|1)$" } | Sort-Object -Unique
foreach ($h in $hosts) { if (Test-NetConnection $h -Port 26101 -InformationLevel Quiet -WarningAction SilentlyContinue) { $h; break } }
node sdd\specs\082-orcamento-armazenamento-tv\sonda-tv\coletor.mjs <ip-da-tv>      # em segundo plano
Get-NetTCPConnection -LocalPort 8770 -State Listen                                  # confirma que está de pé
```
O coletor responde 403 a qualquer IP que não seja o da TV. A sonda 1 já gravou em `evidencias/sonda-cota-tv.jsonl` e a
sonda 2 em `sonda-tv2.jsonl` (pasta da 082) — a evidência da sua feature é uma **cópia só dos números** (passo 9).

### 6. Instale e lance
```powershell
.\sdd\specs\082-orcamento-armazenamento-tv\sonda-tv\instalar-sonda.ps1 -TvIp <ip> -App app2 -AppId ccpSondaV2.Capacidades -Only meuTeste
```
**Sem `-App app2 -AppId …` o padrão é a sonda 1** (cota). `-Only` pode listar vários testes. O script regrava
`app2/report-target.js` com o IP do PC (sub-rede da TV) e o `PROBE_ONLY`. Falhas de `sdb`/certificado: mesma tabela da
skill `tizen-tv` (Host PC IP errado, TV reiniciada, perfil `ccplay_samsung_certificate_4`).

### 7. Espere e leia **só os números**
O app envia o relatório a cada teste e `label: "fim"` no fim. Espere a última linha do `.jsonl` ter o seu teste e `fim`
(Monitor com laço `until`), e leia apenas os campos de resultado:
```bash
tail -1 sdd/specs/082-orcamento-armazenamento-tv/evidencias/sonda-tv2.jsonl | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);console.log(JSON.stringify(r.results.meuTeste,null,1))})"
```
Não despeje o registro inteiro (tem ambiente do aparelho). Um teste de ~30 s no total costuma levar ~40 s com o build.

### 8. Repita (≥ 2 rodadas)
**Relançar não reinicia**: `tizen run` com o app aberto devolve o mesmo `pid` e `sdb shell 0 kill` não o derruba. Para outra
rodada, **desinstale e reinstale a sonda** (`tizen.bat uninstall -p ccpSondaV2.Capacidades -t QN50Q60DAGXZD`, depois o
instalador) — está dentro do aval da sonda — ou peça ao usuário para apertar RETURN no controle (a sonda sai).
Compare as rodadas: a decisão só vale se a variante vencedora vence nas duas.

### 9. Limpe e grave a evidência
```powershell
tizen.bat uninstall -p ccpSondaV2.Capacidades -t QN50Q60DAGXZD
Get-NetTCPConnection -LocalPort 8770 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }   # só o seu coletor
sdb -s <ip>:26101 shell 0 applist | Select-String "CCPlay|Sonda"     # deve restar só 8tZqMtwANL.CCPlayTv
```
Grave `sdd/specs/<feature>/evidencias/<nome>-tv-AAAA-MM-DD.md` com: aparelho, o que foi instalado e desinstalado, grade/
carga usada, **tabela por variante e por rodada** (fps / pior quadro / quadros > 50 ms, ou o equivalente), a **classificação**
(gate/registro/diagnóstico), a origem (`sonda-tv2.jsonl` da 082) e a leitura honesta (margem, ruído, limite do que a medição
prova). Sem URL, host, credencial ou nome de item. Registre a decisão tomada (`R-00X` em `plan.md`, ou o assessment do bug).

## Ler os números com honestidade

- **Teto de 60 fps** e quadros em múltiplos de ~16,7 ms: 33 ms = 2 quadros, 50 ms = 3, 100 ms = 6. "Pior quadro 50 ms e 0 quadros
  > 50 ms" é aprovado por um critério `> 50`; diga a margem (51 fps contra meta de 50 é margem curta).
- Rode **sempre a linha de base e todas as variantes na mesma sessão**; o ruído entre rodadas na TV foi de ±2–3 fps e até um
  quadro lento a mais ou a menos. Uma variante só "vence" se vencer nas duas rodadas.
- A sonda mede **cadência de pintura vista pelo app**, não GPU nem o app real: grades sintéticas ≠ capas reais. Por isso o
  veredito de percepção (foco legível a ~3 m, brilho preso) e o app real são **registro/inspeção do usuário**, não substituídos.
- Um ganho na sonda sem rolagem não implica ganho com rolagem (e vice-versa): meça os dois movimentos se importam.
- Se nenhuma variante atinge a meta, **pare e reporte** (números + risco); não afrouxe o critério depois de ver o resultado.

## Armadilhas que já custaram tempo

- `instalar-sonda.ps1` sem `-App app2` instala a sonda 1 e `-Only foco083` não acha nada.
- `report-target.js` está versionado e é reescrito a cada instalação (IP da LAN); não o trate como mudança de feature.
- O coletor só conhece os schemas `sonda-cota-082/1` e `sonda-tv-082/2`; um app novo com outro schema precisa de uma linha em
  `outputs` no `coletor.mjs` e outro `schema` no `report` de `core.js`.
- Regra de repouso com seletor mais específico que a de estado "vence" e a variante nunca acende (medi o nada). Confira por
  `getComputedStyle` no ensaio.
- A TV recusa o `sdb` por um tempo depois de ligar/reiniciar (daemon subindo): tente de novo antes de mexer no Host PC IP.
- `build:tizen` e `deploy-tv.ps1` mexem em `CCPlayTv/` (rastreado): avise o usuário e rebuild normal ao final do modo C.
- O E2E e os builds sobrescrevem arquivos rastreados; não "restaure" o que não foi você que mudou.

## Checklist de fechamento

- [ ] Critério numérico e linha de base definidos **antes** da medição
- [ ] Ensaio no PC rodou e as variantes pintaram o esperado
- [ ] Autorização do usuário obtida antes de cada instalação
- [ ] ≥ 2 rodadas na TV, mesma sessão para linha de base e variantes
- [ ] Sonda desinstalada, coletor parado, `applist` só com o CCPlayTV
- [ ] Evidência gravada na feature, só números, classificada (gate/registro/diagnóstico), sem segredo
- [ ] Decisão registrada (`plan.md` ou assessment do bug) com os números
- [ ] Se usou o modo C: build normal reinstalado e o usuário avisado
