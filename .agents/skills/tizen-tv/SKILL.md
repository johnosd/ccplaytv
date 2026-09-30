---
name: tizen-tv
description: Instala ou atualiza o app direto na TV Samsung física pela rede (sdb), do build ao app rodando — um comando (`deploy-tv.ps1`) que acha o IP atual da TV, confere a conexão ANTES de gastar build, empacota/assina com o perfil Samsung, instala, lança e confirma no `applist`. Diz a causa e o que fazer quando para (Host PC IP errado, `failed to connect` com a porta 26101 aberta, `Author certificate not match`, perfil de assinatura errado). Use quando o usuário pedir para instalar, atualizar, reinstalar, publicar ou rodar o app na TV, "manda pra TV", testar na TV física ou validar uma correção no aparelho de verdade. Client-first (ADR-008): o backend não é pré-requisito. NÃO use para o emulador (`tizen-emulator`), para corrigir bugs achados no aparelho (`sdd-bugfix`) nem para implementar feature (`sdd-execute`).
---

# tizen-tv

Instala o app na TV de referência (**Samsung QN50Q60DAGXZD**, Tizen 8.0 /
Chromium 108) pela rede, sem Apps2Samsung nem pendrive. **A TV é o único
veredito** para reprodução, codec, DRM, desempenho e teclas; o navegador não
tem `webapis` e o emulador não instala este app.

Shell: **Windows PowerShell 5.1** (sem `&&`, sem `??`; encadeie com `;`).
Arquivo `.ps1` com acento/travessão precisa de **UTF-8 com BOM**, senão o 5.1
quebra as strings — e `package.json`/JSON **nunca** com BOM.

## Uso (o caminho normal — um comando)

Da raiz do repositório:

```powershell
.\.planning\scripts\powershell\deploy-tv.ps1              # build + instala
.\.planning\scripts\powershell\deploy-tv.ps1 -SkipBuild   # o build:tizen já está atual
.\.planning\scripts\powershell\deploy-tv.ps1 -TvIp 192.168.0.2   # pula a varredura da LAN
```

O script, nesta ordem: acha a TV (porta 26101 aberta) → **preflight do sdb,
que para aqui se a TV recusa** (antes de build e assinatura) → build →
empacota/assina → instala (connect encadeado) → lança → confirma no
`applist`. Sai com código ≠ 0 e a causa provável quando falha; só imprime
"Pronto" depois de confirmar. Não desinstala nada: reinstalar com o mesmo
certificado **preserva** o IndexedDB (fontes, favoritos, retomada, chave TMDB).

Antes de rodar, se o código mudou, confira que o `build:tizen` está atual (ou
não use `-SkipBuild`). Depois de instalar, o veredito é **visual**: pergunte
o específico ("a splash apareceu?", "o foco está visível nesta tela?"), nunca
"funcionou?".

## Quando o script para

| Saída (exit) | Causa | Quem resolve |
|---|---|---|
| `TV não encontrada` (2) | TV desligada/standby profundo, ou Developer Mode off | Usuário: ligar a TV; **Apps → 12345 → Developer mode On** |
| `porta 26101 aberta mas recusa o sdb` (3) | **Host PC IP** salvo na TV ≠ IP atual do PC, ou TV não reiniciada depois de salvar | Usuário: na TV, Host PC IP = o IP que o script imprime (o da MESMA sub-rede da TV, não o do Hyper-V/WSL) e **reiniciar a TV** (o daemon só relê no boot) |
| `Author certificate not match` / `-11` (4) | App já instalado, assinado com outro author | **Avisar e pedir confirmação** (apaga o IndexedDB), depois `tizen uninstall -p 8tZqMtwANL.CCPlayTv -t QN50Q60DAGXZD` — precisa do id **completo** |
| `Check certificate error` / `-12` (4), ou `.wgt` sem assinatura | Perfil errado, ou cadeia/DUID inválidos | Ver "O certificado"; perfil sem a letra `O` da coluna `[Active]` |
| `build:tizen falhou` | Erro de build (ex.: arquivo emitido fora do `tizen_web_project.yaml` — o guard lista qual) | Corrigir; não mexer em `config.xml`/yaml/build só para passar |
| `There is no connected target` solto | O daemon do sdb caiu no Windows | Já mitigado (connect encadeado); rode de novo |
| IP da TV mudou | DHCP | O script varre sozinho; ideal: IP fixo para a TV no roteador |

Cada linha "usuário" é ação **na TV** — não há como fazer daqui. Diga exatamente
o passo, o IP certo, e espere o retorno antes de tentar de novo.

## Pré-requisitos (uma vez; o script cobre o que dá para checar)

- TV na mesma LAN, ligada; Developer Mode On; Host PC IP atual + TV reiniciada.
- Certificado Samsung **com author próprio** e DUID da TV: o `.wgt` precisa de
  `author-signature.xml` → `CN=Samsung VD Author CA` **e** `signature1.xml` →
  `CN=VD DEVELOPER Public CA Class`. Author `CN=Tizen Developers CA` instala em
  emulador genérico, **não na TV**.
- CLI apontando para o perfil certo: `tizen.bat security-profiles list`.

## O certificado (só quando o script acusa assinatura)

Conferir o que está dentro do pacote:

```powershell
$tmp = "$env:TEMP\wgtcheck"; Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $tmp | Out-Null
Copy-Item ".\CCPlayTv\.buildResult\CCPlayTv.wgt" "$tmp\p.zip"; Expand-Archive "$tmp\p.zip" -DestinationPath "$tmp\x" -Force
foreach ($f in @("author-signature.xml","signature1.xml")) {
  $b64 = ([xml](Get-Content "$tmp\x\$f")).Signature.KeyInfo.X509Data.X509Certificate | Select-Object -First 1
  $c = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(,[Convert]::FromBase64String(($b64 -replace '\s','')))
  "$f -> $($c.Issuer)"
}
```

**Criar** o certificado: pela **extensão Tizen do VS Code** (o Certificate
Manager do Tizen Studio não concluiu nesta máquina). Escolha **author novo**
e inclua o DUID de cada aparelho (`sdb -s <serial> shell 0 getduid`). A
extensão grava o perfil no SDK **dela**; aponte o CLI para lá (o `.bat`
engole o `=`, passe pelo `cmd`) e confira o slot: o distribuidor **Samsung**
tem de ser o **1º**.

```powershell
cmd /c 'C:\tizen-studio\tools\ide\bin\tizen.bat cli-config "default.profiles.path=C:/Users/<user>/.tizen-extension-platform/server/sdktools/sdk-data/profile/profiles.xml"'
& "C:\tizen-studio\tools\ide\bin\tizen.bat" security-profiles list
```

Trocar o perfil ativo ou o `cli-config` muda a máquina do usuário: comunique e
diga como reverter. Relógio do aparelho atrás do `NotBefore` do certificado
(`not valid yet`) → reiniciar o aparelho, não reempacotar.

## Manual (só se o script não servir)

```powershell
$sdb = "C:\tizen-studio\tools\sdb.exe"; $tizen = "C:\tizen-studio\tools\ide\bin\tizen.bat"
Push-Location .\tv-web; npm run build:tizen; Pop-Location
Remove-Item ".\CCPlayTv\.buildResult" -Recurse -Force -ErrorAction SilentlyContinue
& $tizen build-web -e "Debug/*" -- "$PWD\CCPlayTv"       # -e evita empacotar o build anterior dentro do novo
& $tizen package -t wgt -s <perfil> -- "$PWD\CCPlayTv\.buildResult"
& $sdb connect <ip>:26101; & $tizen install -n CCPlayTv.wgt -t QN50Q60DAGXZD -- "$PWD\CCPlayTv\.buildResult"
& $sdb connect <ip>:26101; & $tizen run -p 8tZqMtwANL.CCPlayTv -t QN50Q60DAGXZD
& $sdb -s <ip>:26101 shell 0 applist | Select-String "CCPlay"    # confirma a instalação
```

`.buildResult/` e `.tizen-rds/` são artefatos: fora do commit. `tz install`/`tz run`
não funcionam aqui — use `tizen.bat` com `-t <nome do alvo>`.

## O que dá para provar

A TV **não** entrega console (`sdb root on` → `Permission denied`, `dlog` vazio,
porta 7011 fechada). `applist` prova que **está instalado**, não que abriu nem
que o catálogo carregou.

## Regras invioláveis

1. Nunca declare reprodução, codec, DRM ou desempenho a partir de "o app abriu";
   só do que foi visto na tela, dizendo **quem** viu. Cenário não observado é
   "não executado", nunca "aprovado".
2. Nenhuma URL de stream, host de provedor, credencial ou chave (TMDB/OpenAI) em
   relatório, log colado ou commit. O `.wgt`, o dlog e a aba de rede carregam isso.
3. Não altere `config.xml`, `tizen_web_project.yaml` ou a configuração de build
   para fazer um passo passar — diagnostique e proponha.
4. Desinstalar apaga dado do usuário (IndexedDB inteiro): avise antes, sempre.
5. Reinstalar **preserva** IndexedDB/localStorage. Para testar primeira execução
   (splash sem cache), desinstale — avisando.

## Armadilhas que já custaram tempo

- **A letra `O`**: `security-profiles list` cola o `O` da coluna `[Active]` no nome
  do perfil (`meu_certificadoO`). Não inclua o `O` em `-s`; com o nome errado o
  `tizen package` só avisa `Not found tizen signature file` e gera `.wgt` sem
  assinatura (a TV então dá `-12`). O script já detecta isso.
- **PC com vários adaptadores** (Hyper-V/WSL/VirtualBox): o "IP do PC" que importa
  é o da sub-rede da TV. Pegar o primeiro IP da máquina dá um endereço virtual.
- **RETURN da TV** é `keyCode` 10009, não `Backspace`/`Escape`; e o AVPlay pinta
  num plano de hardware **atrás** da camada web (fundo opaco = áudio sem imagem).
  Os dois já estão tratados no código — tela nova com raiz diferente de `.screen`
  precisa entrar na regra de transparência de `styles/player.css`.
