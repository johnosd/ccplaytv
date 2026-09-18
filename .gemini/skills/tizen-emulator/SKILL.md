---
name: tizen-emulator
description: Configura, empacota, instala e valida o app no TV Emulator do Tizen Studio antes de qualquer teste na TV física — confere pré-requisitos (tizen/tz/sdb/em-cli, perfil de assinatura, deps do front), gera o build com `npm run build:tizen`, empacota e assina o `.wgt` de `CCPlayTv/`, sobe a VM do emulador, instala, executa, roda um roteiro de validação de UI e navegação por D-pad ancorado na constitution, e coleta diagnóstico por `sdb dlog` e Web Inspector. Fecha com um relatório que separa cada cenário em aprovado / reprovado / não testável no emulador / obrigatório na TV física. Use quando o usuário pedir para testar, rodar, instalar ou depurar o app no emulador de TV, criar ou abrir um perfil de emulador, gerar o `.wgt` para o emulador, ou validar navegação, foco e layout 1920×1080 sem a TV em mãos. NÃO use para dar veredito sobre reprodução de vídeo, `webapis.avplay`, codecs, IPTV real, DRM, desempenho ou memória — nada disso é conclusivo no emulador, e o aceite continua sendo a TV física (Cenário C de `sdd/specs/003-live-tv-avplay/quickstart.md`, porta V1 da ADR-006). NÃO use para o ciclo de instalação na TV física via Apps2Samsung, para corrigir bugs encontrados (use `sdd-bugfix`) nem para implementar feature (use `sdd-execute`).
---

# tizen-emulator

Skill operacional, fora da pipeline `sdd-specify → sdd-plan → sdd-execute →
sdd-converge`. Não cria pasta em `sdd/`, não edita código de produção e não
mexe em coluna de status do backlog (essas são dos scripts PowerShell). O
produto desta skill é **evidência observada**, não código.

## Status conhecido: instalação no emulador de TV está bloqueada (17/09/2026)

**Leia isto antes de investir tempo.** Nesta máquina, instalar no
`T-samsung-10.0-x86_64` para com
`install failed[118, -4], reason: Operation not allowed`, no mesmo ponto
(`installing[9]`), por três caminhos independentes: `tizen.bat install`,
`tz` do Tizen Studio e `tz` do SDK da extensão do VS Code. O aparelho não
deixa investigar: `sdb root on` → `Permission denied`, `dlog` volta vazio,
`sdb shell` não devolve saída.

Já foram **descartados por evidência**, não por suposição:

| Hipótese | Como caiu |
|---|---|
| Pacote ou build corrompido | o mesmo `.wgt` instala no emulador Tizen genérico |
| DUID do emulador fora do certificado | `getduid` = `XTCJYJZXZBZVK`, presente no `device-profile.xml` |
| Cadeia do distribuidor | `signature1.xml` emitido por `VD DEVELOPER Public CA Class` (Samsung) |
| **Author fora da cadeia Samsung** | corrigido — `author-signature.xml` passou a ser emitido por `Samsung VD Author CA`, e **o erro não mudou** |
| Relógio do convidado | reiniciar a VM resolveu o `-7`; o `-4` permanece |
| `required_version="2.3"` | os samples de TV da própria Samsung usam `2.1` |

Restam sem teste: Developer Mode dentro da UI do emulador, e a metadata
`prelaunch.support` do `config.xml`. Enquanto isso não for resolvido, **o
veredito honesto é que este ambiente não valida UI no emulador de TV** — o
roteiro inteiro vai para a TV física.

## O que o emulador decide e o que ele não decide

| Área | Veredito possível aqui | Onde o veredito real acontece |
|---|---|---|
| Layout 1920×1080, tokens do design system, tipografia, overflow | aprovado / reprovado | emulador basta para regressão grosseira; cor, HDR e overscan continuam da TV |
| Navegação por setas, foco visível, ausência de beco sem saída | aprovado / reprovado | emulador cobre; **tecla RETURN do controle** só a TV confirma (ver Armadilhas) |
| Estados de carregando, vazio e erro com pelo menos um focável | aprovado / reprovado | emulador cobre |
| Chamadas HTTP, CORS, backend fora do ar, fallback offline | aprovado / reprovado | emulador cobre |
| `webapis.avplay`, codecs, HLS/TS, IPTV real, DRM, desempenho, memória, comportamento do modelo Samsung | **nenhum** — sempre "não validado" | TV física (Cenário C do quickstart da 003 = porta V1 da ADR-006) |

**"O app abriu no emulador" nunca é evidência de reprodução.** A Samsung é
explícita em que o emulador não reproduz integralmente o hardware
(`docs/guia-praticas-app-tv/12_apis_web_e_arquitetura.md` §3, fonte [5]).
Se o AVPlay não existir ou falhar no emulador, o registro é **não testável
no emulador** — nunca "reprovado" e nunca "aprovado".

## Ambiente verificado em 16/09/2026 — reconfirme, não confie

| Ferramenta | Caminho | Observado |
|---|---|---|
| Tizen CLI | `C:\tizen-studio\tools\ide\bin\tizen.bat` | 2.5.25 |
| Tizen Core CLI | `C:\tizen-studio\tools\tizen-core\tz.exe` | é o usado pelo quickstart da 003 |
| sdb | `C:\tizen-studio\tools\sdb.exe` | 4.2.36 |
| Emulator Manager CLI | `C:\tizen-studio\tools\emulator\bin\em-cli.bat` | `create` / `launch` / `list-vm` / `list-platform` |
| Painel de controle remoto | `C:\tizen-studio\tools\emulator\bin\emulator-control-panel.exe` | — |
| Perfis de assinatura | `C:\tizen-studio-data\profile\profiles.xml` | `ccplaytv`, `ccplaytv-nosamsung` (ativo) |
| VMs | `C:\tizen-studio-data\emulator\vms\` | `T-samsung-10.0-x86_64` (HD1080 TV, 1920×1080, 1 GiB RAM, 4 vCPU), `T-10.0-x86_64` |

O shell é **Windows PowerShell 5.1** (`pwsh` não está instalado): sem `&&`,
sem `??`, sem ternário. Encadeie com `;` ou `if ($?) { ... }`.

## Fase 0 — Reconhecimento (sempre, mesmo parecendo óbvio)

Confirme no repositório, não de memória:

```powershell
Get-Content .\CCPlayTv\config.xml              # id do app, perfil, privilégios
Get-Content .\CCPlayTv\.tproject               # plataforma do projeto
Get-Content .\CCPlayTv\tizen_web_project.yaml  # api_version, build_type, files:
Select-String -Path .\tv-web\vite.config.ts -Pattern "target"
Select-String -Path .\tv-web\package.json -Pattern "build:tizen"
```

Fatos que hoje valem (reconfirme): app id `8tZqMtwANL.CCPlayTv`, pacote
`8tZqMtwANL`, perfil `tv-samsung`, `api_version: "10.0"`, `build_type:
Debug`, alvo do Vite `chrome108`, sincronização por
`tv-web/scripts/sync-tizen.mjs`. **Nunca** edite `config.xml`,
`tizen_web_project.yaml`, `.project` ou `.tproject` para fazer um passo
passar — se algum deles for mesmo o problema, pare e proponha a mudança ao
usuário com a justificativa.

## Fase 1 — Pré-requisitos (gate: falhou, pare e reporte)

| Checagem | Comando | Critério |
|---|---|---|
| Tizen CLI | `& "C:\tizen-studio\tools\ide\bin\tizen.bat" version` | imprime versão |
| tz | `& "C:\tizen-studio\tools\tizen-core\tz.exe" --version` | imprime versão |
| sdb | `& "C:\tizen-studio\tools\sdb.exe" version` | imprime versão |
| TV Extension / imagem de TV | `& "C:\tizen-studio\tools\emulator\bin\em-cli.bat" list-platform` | existe algum `tv-samsung-*` |
| VM de TV | `... em-cli.bat list-vm` | existe VM de TV; senão, a Fase 3 cria |
| Certificado | `& "C:\tizen-studio\tools\ide\bin\tizen.bat" security-profiles list` | há perfil marcado como ativo (`O`) |
| Deps do front | `Test-Path .\tv-web\node_modules` | `True`; senão `cd tv-web; npm install` |
| Virtualização | `& "C:\tizen-studio\tools\emulator\bin\check-whpx.exe"` ou `check-hax.exe` | só investigue se o emulador não subir |

Se faltar TV Extension, imagem de emulador ou certificado: **informe o
usuário e pare**. Instalar pacote pelo Package Manager do Tizen Studio e
criar certificado Samsung são passos interativos e decisão dele — não
instale nada por conta própria.

**Gate extra, descoberto em 17/09/2026 e o mais caro de descobrir tarde**:
o emulador de TV exige que o **DUID dele** esteja no certificado
distribuidor Samsung. Compare antes de empacotar:

```powershell
& "C:\tizen-studio\tools\sdb.exe" -s <serial> shell 0 getduid
Get-Content "$env:USERPROFILE\SamsungCertificate\<perfil>\device-profile.xml"
```

Se o DUID do emulador não estiver na lista `<TestDevice>`, a instalação
falha com `install failed[118, -12] … Invalid certificate chain with
certificate in signature`. Não é problema do pacote nem do build — **pare
e peça ao usuário** para adicionar o DUID, o que em 17/09/2026 só deu certo
pela **extensão Tizen do VS Code** (o Certificate Manager do Tizen Studio
não concluiu).

A extensão registra o perfil no SDK **dela**, não no do Tizen Studio. Para
o CLI clássico enxergar o perfil novo, aponte a configuração — e note que
o `.bat` engole o `=`, então tem que passar pelo `cmd`:

```powershell
cmd /c 'C:\tizen-studio\tools\ide\bin\tizen.bat cli-config "default.profiles.path=C:/Users/<user>/.tizen-extension-platform/server/sdktools/sdk-data/profile/profiles.xml"'
```

Diferença relevante entre os dois: a extensão põe o distribuidor Samsung no
**slot 1**; o perfil do Tizen Studio mantinha o distribuidor Tizen no slot 1
e o Samsung no slot 2, e essa forma é recusada pela TV.

**Corrigir o DUID é necessário, mas em 17/09/2026 não foi suficiente**: com
o DUID do emulador no certificado, o erro deixou de ser cadeia inválida e
passou a `install failed[118, -4], reason: Operation not allowed`, ainda sem
causa identificada. Não prometa que adicionar o DUID resolve — verifique.

## Fase 2 — Build do front (comandos do projeto, sem gambiarra)

O emulador é outra máquina: `127.0.0.1` dentro dele aponta para ele mesmo,
não para o seu PC. Descubra o IP de LAN e passe pela env var — o fallback
de `catalogApi.ts` / `importApi.ts` é `http://127.0.0.1:3000`.

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -eq 'Dhcp' }
cd tv-web
$env:VITE_API_URL = "http://<IP-LAN>:3000"
npm run build:tizen
```

O backend precisa estar alcançável na rede: `api/.env` com `HOST=0.0.0.0`,
regra de firewall liberando TCP 3000 para `LocalSubnet`, e
`docker compose up -d postgres` + `uv run python main.py` no ar. O CORS da
API já aceita `Origin: null`, que é o que o app empacotado envia
(`api/main.py`) — se aparecer erro de CORS, o sintoma é de outra coisa
(porta, IP, backend fora do ar), não de configuração faltando.

**Se o build falhar**: diagnostique a causa real e proponha a menor
correção. Não desative `target: 'chrome108'`, não remova o type-check, não
troque `build:tizen` por `build`, não edite teste para ficar verde.

## Fase 3 — Emulador

```powershell
$em = "C:\tizen-studio\tools\emulator\bin\em-cli.bat"
& $em list-vm
& $em launch -n T-samsung-10.0-x86_64
& "C:\tizen-studio\tools\sdb.exe" devices        # aguarde o alvo aparecer
```

Se não houver VM de TV, crie uma 1920×1080 antes de sugerir qualquer outra
coisa (confirme os nomes com `list-platform` e `list-template`):

```powershell
& $em create -n ccplaytv-tv -p tv-samsung-10.0-x86_64 -t "HD1080 TV" -r 1024
```

Reuse a VM existente quando ela servir — não crie perfil novo "para
organizar". O emulador leva minutos para subir, e `sdb devices` mostra
`device` **antes** da plataforma estar pronta. O teste de prontidão de
verdade é a capability:

```powershell
& "C:\tizen-studio\tools\sdb.exe" -s emulator-26111 capability   # profile_name / platform_version
```

Instalar antes disso devolve `error: target offline`, que parece falha de
pacote e não é.

## Fase 4 — Empacotar e assinar

Mesmo empacotamento da 003, com `-w` apontando para `CCPlayTv/`:

```powershell
& "C:\tizen-studio\tools\tizen-core\tz.exe" pack -w "$PWD\CCPlayTv"
```

Saída esperada: `CCPlayTv\Debug\CCPlayTv.wgt` (`build_type: Debug` no
yaml). Alternativa pelo CLI clássico, se o `tz` falhar:

```powershell
$tizen = "C:\tizen-studio\tools\ide\bin\tizen.bat"
& $tizen build-web -- "$PWD\CCPlayTv"
& $tizen package -t wgt -s ccplaytv-nosamsung -- "$PWD\CCPlayTv\.buildResult"
```

Sobre o perfil: `ccplaytv-nosamsung` (autor + Distributor1) é o que a 003
usa; o perfil com certificado Samsung é amarrado a DUID de aparelho e já
falhou aqui ("Profile directory not found", em `logs/tizen-mcp.log`). Se a
instalação recusar por assinatura, troque com `tizen security-profiles
set-active` — e **diga ao usuário que trocou**. O `.wgt` é artefato de
build: não versione.

## Fase 5 — Instalar e executar

Use o **CLI clássico** e identifique o alvo pelo **nome da VM** (terceira
coluna de `sdb devices`), nunca pelo serial:

```powershell
$tizen = "C:\tizen-studio\tools\ide\bin\tizen.bat"
& $tizen install -n CCPlayTv.wgt -t T-samsung-10.0-x86_64 -- "$PWD\CCPlayTv\Debug"
& $tizen run -p 8tZqMtwANL.CCPlayTv -t T-samsung-10.0-x86_64
& $tizen uninstall -p 8tZqMtwANL -t T-samsung-10.0-x86_64
```

`tz install` e `tz run` falharam neste ambiente em 17/09/2026 (ver
Armadilhas); o clássico é o caminho confiável. Para o Web Inspector,
`tz run -d` continua valendo — se ele recusar o alvo, abra pelo Tizen
Studio.

Reinstalar **não** limpa IndexedDB nem localStorage do app. Para testar
primeira execução de verdade (splash sem cache, caminho offline-first da
ADR-002), desinstale antes com o `uninstall` acima.

## Fase 6 — Roteiro de validação

Cada linha recebe um dos quatro vereditos da Fase 8. Sem observação, o
veredito é **não executado** — nunca "aprovado por dedução".

| # | Cenário | Como observar | Contrato |
|---|---|---|---|
| 1 | Splash abre e sai sozinha | app lançado sem cache | feature 002 |
| 2 | Home carrega listas/fontes reais | backend no ar | feature 002 |
| 3 | Percurso completo só por setas, sem mouse | teclado do emulador / painel de controle | Constitution "Toda Ação Essencial Tem Caminho Completo por Controle Remoto" |
| 4 | Foco visível em **todo** estado, inclusive carregando, vazio e erro | force cada estado | "Foco Visível e Sem Becos Sem Saída" |
| 5 | Enter/OK seleciona; mover o foco não dispara requisição | aba Network aberta no Web Inspector | SC-006 da 003 |
| 6 | Voltar sai da tela sem fechar o app | ver Armadilhas (tecla RETURN) | "Voltar Restaura Foco e Posição" |
| 7 | Voltar restaura foco **e** rolagem, reconciliados por id | entre num item no meio da lista e volte | SC-003 da 003 |
| 8 | Telas de fontes / adicionar fonte | percurso completo por D-pad | feature 001 |
| 9 | Live TV com catálogo importado: grupos vindos da fonte, na ordem da fonte | comparar com os grupos da fonte | SC-002 da 003 |
| 10 | Backend indisponível: derrube a API e reabra o app | degradação, não tela fatal | ADR-002 |
| 11 | Console sem erro não tratado; rede sem falha silenciosa | Web Inspector | — |
| 12 | Layout a 1920×1080: nada cortado, nada fora do palco | skin HD1080 | ADR-007 |
| 13 | Nenhum segredo em tela, console ou dlog | um ciclo de sucesso **e** um de falha | SC-005 / "Segredos Fora dos Clientes e dos Logs" |
| 14 | Reprodução (Enter num canal) | — | **não testável no emulador**, ver Fase 8 |

Filmes, Séries e as duas telas de detalhe ainda renderizam
`tv-web/src/features/catalog/mockCatalog.ts`. Aprovar o layout delas é
legítimo; dizer que "o catálogo está validado" não é — registre que são
mock.

## Fase 7 — Diagnóstico

```powershell
$sdb = "C:\tizen-studio\tools\sdb.exe"
& $sdb devices
& $sdb dlog -v time | Select-String -Pattern "CCPlayTv|8tZqMtwANL"
& $sdb forward --list
```

Web Inspector: `tz run -d` é o caminho curto — use a porta que o comando
imprimir, não uma decorada. Se precisar encaminhar à mão,
`& $sdb forward tcp:<local> tcp:<porta-informada>` e abra
`http://127.0.0.1:<local>` no Chrome do host. Console, Network e Elements
cobrem quase todo o roteiro da Fase 6.

**Antes de colar qualquer log no relatório**: dlog e aba Network carregam
URL de stream, host de provedor e credenciais da fonte. Redija
(`http://***`), cite só código e mensagem de erro, e nunca reproduza
valores de `docs/m3u/dados.md`.

Os MCP `tizen-doctor-mcp` e `tizen-simulator-mcp` estão configurados neste
projeto (`docs/files/mcp/`) e encurtam o ciclo quando disponíveis na
sessão. Se as ferramentas não aparecerem, siga pelo CLI — não é bloqueio.

## Fase 8 — Relatório (formato obrigatório)

```markdown
## Comandos executados
(lista literal, na ordem)

## Build
resultado, tempo, avisos relevantes

## Empacotamento e instalação
perfil de assinatura usado, caminho do .wgt, alvo, resultado

## Cenários
| # | Cenário | Veredito | Evidência |
Vereditos permitidos: aprovado no emulador | reprovado no emulador |
não testável no emulador | obrigatório validar na TV física

## Logs e erros relevantes
(redigidos)

## Limitações encontradas

## Pendente na TV física
(lista objetiva e acionável)
```

Em **Pendente na TV física** entram sempre, no mínimo: `webapis.avplay`
(existência e ciclo prepare/play), codecs e contêineres da fonte real,
comportamento de stream IPTV ao vivo, DRM, desempenho e memória sob
catálogo grande, tecla RETURN do controle físico, e qualquer cenário que
tenha ficado "não testável".

Achou bug? Não corrija aqui — reporte e proponha `sdd-bugfix`. Se a rodada
pertence a uma feature ativa, ofereça registrar o resultado em
`sdd/specs/<slug>/plan.md` → `## Execution Notes` (texto novo ao final, sem
reescrever histórico).

## Regras invioláveis

1. Não instalar ferramenta, pacote de SDK ou imagem de emulador sem avisar
   antes e obter o "pode".
2. Não alterar código, `config.xml` ou configuração de build só para fazer
   um passo passar. Diagnostique, proponha a menor correção, espere.
3. Não declarar reprodução, AVPlay, codec, IPTV, DRM ou desempenho como
   validados a partir do emulador — em nenhuma circunstância.
4. Nenhuma credencial, senha, URL de provedor ou URL de stream em
   relatório, log colado ou commit.
5. Não editar à mão as colunas de status de `.planning/backlog.md`.
6. Cenário não observado é "não executado", não "aprovado".

## Armadilhas conhecidas

- **`tz.exe` sem argumento trava** o shell não interativo (fica esperando
  entrada). Use `tz --help` ou `tz <comando> --help`.
- **`tz install` / `tz run` não funcionam aqui** (17/09/2026, tz v10.3.9):
  com dois emuladores ligados responde `there are many connected targets`
  mesmo recebendo `-t`; com `-e emulator-26111` responde `serial number
  'emulator-26111' wrong`; e por baixo executa
  `sdb -s <serial> shell pkgcmd -l | grep …`, cujo pipe cai no shell do
  Windows, onde `grep` não existe. Use `tizen.bat install/run/uninstall`
  com `-t <nome da VM>`. `tz pack` continua bom.
- **Emulador Tizen genérico não roda este app**: o `.wgt` instala em
  `tizen-8.0-x86_64` sem erro, mas `tizen run` devolve `Could not launch`.
  O dlog mostra `tizen.org/feature/profile = common`, enquanto o widget
  declara `tv-samsung` — não há runtime de TV ali. Serve só para provar que
  o pacote e a assinatura estão íntegros; nunca para validar UI.
- **O emulador instalado é mais novo que a TV alvo**: `tv-samsung-10.0`
  contra Tizen 8.0 / Chromium 108 da QN50Q60DAGXZD. Sintaxe e API que o
  emulador aceita podem quebrar na TV — é exatamente por isso que o Vite
  fixa `target: 'chrome108'`. Passar no emulador não prova compatibilidade.
- **Não adianta procurar imagem de emulador de TV Samsung 8.0** — ela não
  existe no repositório. A imagem de TV vem de um pacote único,
  `tv-samsung-public-emulator-image-x86-64`, sempre na versão corrente
  (10.0, em 17/09/2026); não há variante por versão. Instalar o SDK base
  `tizen-8.0` traz só o perfil genérico (`tizen-8.0-x86_64`), sem
  `webapis`, sem skin de TV e sem os templates `HD1080 TV` — o `.wgt` do
  projeto declara `<tizen:profile name="tv-samsung">` e não é para ele.
  Verificado em 17/09/2026; não repita a tentativa. O jeito de fechar o gap
  de motor é medir `navigator.userAgent` dentro do emulador e manter o
  `target: 'chrome108'` no build.
- **Tecla Voltar**: `tv-web/src/lib/useRemoteNav.ts` trata `Backspace` e
  `Escape`. O controle da Samsung emite RETURN como `keyCode` 10009, que
  não casa com essas strings. Antes de aprovar o cenário 6, confira qual
  tecla o emulador está entregando (Web Inspector, listener de `keydown`) e
  registre a diferença como pendência de TV física.
- **Sem `VITE_API_URL`** o build cai em `127.0.0.1:3000`, que dentro do
  emulador é o próprio emulador — a Home fica vazia e parece bug de UI.
- **1 GiB de RAM e 4 vCPU** na VM: lentidão no emulador não é veredito de
  desempenho, nem a favor nem contra.
- **`sdb devices` vazio** logo depois do `launch` é normal; espere o boot
  terminar antes de concluir que a instalação falhou.
- **Reinstalar preserva IndexedDB/localStorage** — desinstale para testar
  primeira execução e o caminho offline-first.
- **Relógio do convidado congela quando o PC dorme.** Se o certificado for
  emitido hoje e a VM estiver de pé desde ontem, o install falha com
  `Certificate in signature is not valid yet:<-7>` — o relógio do emulador
  ficou parado antes do `NotBefore`. Reinicie a VM em vez de reempacotar.
- **A VM de TV pode afogar-se no próprio log de vídeo**: `emulator.klog`
  acumulando `drmWaitVBlank failed` e `drm fd open fail` (47 MB em minutos,
  com `serial8250: too much work for irq4`) deixa `vd_appinstall`, `getduid`
  e `dlog` pendurados — parece falha de pacote e não é. Reiniciar a VM
  restabelece. **Não** tente contornar com `em-cli modify -g no`: sem
  aceleração GL a VM nem inicia (`Failed to start this VM`).
