---
name: tizen-tv
description: Instala ou atualiza o app direto na TV Samsung física pela rede (sdb), do build ao app rodando na tela — descobre o IP atual da TV, confere Developer Mode e certificado, gera o build com `npm run build:tizen` (client-first, ADR-008 — nenhum backend envolvido), empacota e assina o `.wgt` com o perfil Samsung que cobre o DUID do aparelho, instala, lança e coleta a evidência que existe (`applist`, observação visual guiada), sem prometer a que não existe (a TV não expõe console). Use quando o usuário pedir para instalar, atualizar, reinstalar, publicar ou rodar o app na TV, testar na TV física, "manda pra TV", ou validar uma correção no aparelho de verdade. Também cobre os becos conhecidos: IP trocado pelo DHCP, `failed to connect` com a porta 26101 aberta, `Author certificate not match`, e o certificado Samsung que precisa de author próprio. NÃO use para o emulador (use `tizen-emulator`, que tem seu próprio beco documentado), para corrigir bugs encontrados no aparelho (use `sdd-bugfix`), nem para implementar feature (use `sdd-execute`).
---

# tizen-tv

Skill operacional, fora da pipeline SDD. Instala o app na TV de referência
(**Samsung QN50Q60DAGXZD**, Tizen 8.0 / Chromium 108) pela rede, sem
Apps2Samsung e sem pendrive. Procedimento verificado ponta a ponta em
17/09/2026 — foi por aqui que a porta V1 da ADR-006 (reprodução por
`webapis.avplay` com fonte IPTV real) saiu de "não executada".

**A TV é o único veredito que vale** para reprodução, codec, DRM, desempenho
e teclas do controle. O emulador não instala este app (ver `tizen-emulator`)
e o navegador não tem `webapis`. O que esta skill entrega é o ciclo curto:
do código à tela em cerca de um minuto, quando os pré-requisitos estão de pé.

## Pré-requisitos (gate — falhou, pare e peça ao usuário)

| Item | Como conferir | Se faltar |
|---|---|---|
| TV na mesma LAN, ligada | `Test-NetConnection <ip-tv> -Port 8001` | TV em standby profundo cai da rede; peça para ligar |
| Developer Mode ligado | `Test-NetConnection <ip-tv> -Port 26101` → `True` | Na TV: **Apps** → digitar **12345** → Developer mode **On** |
| Host PC IP correto na TV | campo da mesma tela de Developer Mode | Tem que ser o IP **atual** do PC; depois de salvar, **reiniciar a TV** (o daemon só relê no boot) |
| Certificado Samsung com author próprio | `Get-ChildItem $env:USERPROFILE\SamsungCertificate\<perfil>` deve ter **`author.p12` e `distributor.p12`** | Ver "O certificado" abaixo |
| DUID da TV no certificado | `device-profile.xml` → `<TestDevice>` | Idem |
| CLI apontando para o perfil certo | `tizen.bat security-profiles list` deve listar o perfil e marcá-lo ativo | Ver "O certificado" abaixo |

Shell é **Windows PowerShell 5.1** (`pwsh` não instalado): sem `&&`, sem
`??`. Encadeie com `;`.

## O certificado (a parte que mais custa quando falta)

A TV exige a cadeia Samsung nos **dois** lados da assinatura. Confira o que
está dentro do `.wgt` antes de culpar a rede ou o aparelho:

```powershell
# Extrai e lê os emissores das duas assinaturas do pacote
$tmp = "$env:TEMP\wgtcheck"; Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $tmp | Out-Null
Copy-Item ".\CCPlayTv\.buildResult\CCPlayTv.wgt" "$tmp\p.zip"
Expand-Archive "$tmp\p.zip" -DestinationPath "$tmp\x" -Force
foreach ($f in @("author-signature.xml","signature1.xml")) {
  $b64 = ([xml](Get-Content "$tmp\x\$f")).Signature.KeyInfo.X509Data.X509Certificate | Select-Object -First 1
  $c = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(,[Convert]::FromBase64String(($b64 -replace '\s','')))
  "$f -> $($c.Issuer)"
}
```

O que a TV aceita (verificado):

```
author-signature.xml -> CN=Samsung VD Author CA, ...
signature1.xml       -> CN=VD DEVELOPER Public CA Class, ...
```

Se o author sair como `CN=Tizen Developers CA`, o pacote instala em emulador
Tizen genérico e **não** na TV. Foi o caso até 17/09/2026: três perfis
Samsung existiam, todos só com distribuidor, reaproveitando o author Tizen.

**Criar o certificado completo**: pela **extensão Tizen do VS Code** — o
Certificate Manager do Tizen Studio não concluiu nesta máquina. No fluxo,
escolha **criar um author novo** (não reutilizar o existente) e inclua os
DUIDs de todos os aparelhos que vão receber o app:

```powershell
& "C:\tizen-studio\tools\sdb.exe" -s <serial> shell 0 getduid     # DUID de um alvo conectado
```

A extensão registra o perfil no SDK **dela**, não no do Tizen Studio. Aponte
o CLI clássico para lá — e note que o `.bat` engole o `=`, então passe pelo
`cmd`:

```powershell
cmd /c 'C:\tizen-studio\tools\ide\bin\tizen.bat cli-config "default.profiles.path=C:/Users/<user>/.tizen-extension-platform/server/sdktools/sdk-data/profile/profiles.xml"'
& "C:\tizen-studio\tools\ide\bin\tizen.bat" security-profiles list
```

Diferença que importa: a extensão põe o distribuidor Samsung no **slot 1**.
Perfil com distribuidor Tizen no slot 1 e Samsung no slot 2 é recusado.

## Fase 1 — Achar a TV

O DHCP troca o IP da TV entre sessões (aconteceu duas vezes num dia). Não
confie no IP da última vez:

```powershell
$sdb = "C:\tizen-studio\tools\sdb.exe"
& $sdb connect <ip-conhecido>:26101
```

Se falhar, varra a rede pela porta da API da TV (8001) e depois pela do sdb:

```powershell
$hosts = (arp -a | Select-String "192\.168\.0\." | ForEach-Object { ($_.ToString().Trim() -split "\s+")[0] }) |
  Where-Object { $_ -match "^\d+\.\d+\.\d+\.\d+$" } | Sort-Object -Unique
foreach ($h in $hosts) {
  if (Test-NetConnection -ComputerName $h -Port 26101 -InformationLevel Quiet -WarningAction SilentlyContinue) { "sdb aberto em: $h" }
}
```

`& $sdb devices` deve mostrar o modelo como nome do alvo, ex.:

```
192.168.0.4:26101   device    QN50Q60DAGXZD
```

Esse nome (`QN50Q60DAGXZD`) é o que vai em `-t` nos comandos seguintes.

## Fase 2 — Build (client-first, sem backend)

**Atualizado (24/09/2026)**: esta fase pedia `VITE_API_URL` apontando para um
backend na LAN, do tempo em que o app dependia dele para abrir a Home. Isso
ficou obsoleto com a migração client-first (feature 005, ADR-008): import,
catálogo e reprodução rodam inteiramente no IndexedDB do aparelho, sem ida à
rede além da própria fonte IPTV. Um `grep` por `VITE_API_URL`/`127.0.0.1:3000`
em `tv-web/src` não encontra nenhuma referência. Basta:

```powershell
Push-Location .\tv-web
npm run build:tizen
Pop-Location
```

`api/` continua existindo só como contorno congelado (ADR-008) para um painel
de provedor que não faz parte de nenhum caminho client-first — não presuma
que está rodando, e não é pré-requisito desta skill.

## Fase 3 — Empacotar e assinar

```powershell
$tizen = "C:\tizen-studio\tools\ide\bin\tizen.bat"
Remove-Item ".\CCPlayTv\.buildResult" -Recurse -Force -ErrorAction SilentlyContinue
& $tizen build-web -e "Debug/*" -- "$PWD\CCPlayTv"
& $tizen package -t wgt -s <perfil-samsung> -- "$PWD\CCPlayTv\.buildResult"
```

O `-e "Debug/*"` evita empacotar o build anterior dentro do novo (sem ele o
`.wgt` dobra de tamanho). Saída: `CCPlayTv\.buildResult\CCPlayTv.wgt`.

`.buildResult/` e `.tizen-rds/` são artefatos — mantenha fora do commit.

## Fase 4 — Instalar e lançar

```powershell
& $tizen install -n CCPlayTv.wgt -t QN50Q60DAGXZD -- "$PWD\CCPlayTv\.buildResult"
& $tizen run -p 8tZqMtwANL.CCPlayTv -t QN50Q60DAGXZD
```

Se aparecer **`install failed[118, -11], reason: Author certificate not
match`**: já existe o app instalado, assinado com outro author. Desinstale
pelo **id completo** e repita:

```powershell
& $tizen uninstall -p 8tZqMtwANL.CCPlayTv -t QN50Q60DAGXZD
```

Avise o usuário antes: isso apaga o IndexedDB do app na TV — que é a fonte de
verdade do catálogo (client-first, ADR-008), não um cache. A perda **não** é
temporária: fontes cadastradas e progresso gravado somem, e reimportar exige
repetir o fluxo de importação manualmente.

Atualizações seguintes, com o mesmo certificado, dispensam o uninstall: o
install sobrescreve em ~6 segundos.

## Fase 5 — Evidência do que dá para provar

A TV **não** entrega console: `sdb root on` → `Permission denied`, `dlog`
volta vazio, e a porta 7011 do Web Inspector fica fechada. Client-first
(ADR-008) também tira o log de backend que antes servia de evidência
indireta — não há requisição de API para inspecionar, porque não há API no
caminho. O que sobra:

```powershell
& $sdb -s <ip>:26101 shell 0 applist | Select-String "CCPlay"   # confirma instalação
```

Fora isso, o veredito é visual: o usuário olhando a tela.

Por isso **as perguntas ao usuário precisam ser específicas** — "a splash
apareceu?", "o foco está visível neste estado?", "mover o foco disparou
requisição?" — e não "funcionou?".

## Regras invioláveis

1. Nunca declare reprodução, codec, DRM ou desempenho a partir de "o app
   abriu". Só do que foi visto na tela, e diga quem viu.
2. Nenhuma URL de stream, host de provedor ou credencial em relatório, log
   colado ou commit. O `.wgt`, o dlog e a aba de rede carregam isso.
3. Não altere `config.xml`, `tizen_web_project.yaml` ou configuração de
   build para fazer um passo passar — diagnostique e proponha.
4. Desinstalar da TV apaga dado do usuário: avise antes, sempre.
5. Trocar o perfil de assinatura ativo ou o `cli-config` muda a máquina
   dele — comunique a mudança e como reverter.
6. Cenário não observado é "não executado", nunca "aprovado".

## Armadilhas conhecidas (todas verificadas em 17/09/2026)

- **`sdb connect` falha com a porta 26101 aberta** → o Host PC IP na TV não é
  o IP atual do PC, ou a TV não foi reiniciada depois de salvar. A conexão
  TCP abre e o daemon derruba o handshake.
- **IP da TV muda sozinho** (DHCP). Fixe um IP para ela no roteador, ou
  repita a varredura da Fase 1 a cada sessão.
- **`tizen uninstall -p 8tZqMtwANL`** responde `The package is not exist`
  mesmo com o app instalado — nesta TV o uninstall quer o **app id completo**
  (`8tZqMtwANL.CCPlayTv`). O `applist` mostra os dois valores.
- **`tz install` / `tz run` não funcionam** neste ambiente (rejeitam o serial,
  confundem-se com dois alvos, e chamam `sdb ... | grep`, que não existe no
  Windows). Use `tizen.bat` com `-t <nome do alvo>`. `tz pack` funciona, mas
  usa o `profiles.xml` do Tizen Studio, não o da extensão.
- **Certificado recém-criado, erro `Certificate in signature is not valid
  yet`** → relógio do aparelho atrás do `NotBefore` do certificado. Reinicie
  o aparelho em vez de reempacotar.
- **A TV emite RETURN como `keyCode` 10009**, não `Backspace`/`Escape`; e o
  AVPlay pinta num plano de hardware **atrás** da camada web, então fundo
  opaco dá áudio sem imagem. Os dois já estão corrigidos no código
  (`sdd/bugs/tecla-voltar-return-nao-funciona-na`,
  `sdd/bugs/live-tv-toca-audio-sem-imagem`) — mas se algum comportamento
  parecido aparecer numa tela nova, é a mesma família de causa.
- **Reinstalar preserva IndexedDB/localStorage.** Para testar primeira
  execução (splash sem cache, caminho offline-first da ADR-002), desinstale
  antes — avisando o usuário.
