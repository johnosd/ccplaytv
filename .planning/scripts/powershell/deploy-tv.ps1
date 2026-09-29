<#
.SYNOPSIS
  Instala o app na TV Samsung de referência (QN50Q60DAGXZD) pela rede.

.DESCRIPTION
  Achar a TV -> preflight do sdb (para ANTES de empacotar se a TV recusa) ->
  build (opcional) -> empacotar/assinar -> instalar -> lançar -> confirmar.
  Falha de verdade sai com código != 0 e diz a causa provável; nunca imprime
  "sucesso" depois de um erro.

  Client-first (ADR-008): não precisa de backend nem de VITE_API_URL.

.PARAMETER TvIp
  IP da TV. Sem ele, varre a LAN (arp) atrás da porta 26101 aberta.
.PARAMETER SkipBuild
  Reaproveita o `dist`/`CCPlayTv` já gerados por `npm run build:tizen`.
.PARAMETER ProfileName
  Perfil de assinatura Samsung — SEM a letra "O" que a coluna [Active] do
  `tizen security-profiles list` gruda no fim do nome.
#>
param (
    [string]$TvIp,
    [string]$ProfileName = "ccplay_samsung_certificate_4",
    [string]$TargetName = "QN50Q60DAGXZD",
    [string]$AppId = "8tZqMtwANL.CCPlayTv",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Continue"   # stderr de programa nativo não pode virar exceção no PS 5.1
$tizen = "C:\tizen-studio\tools\ide\bin\tizen.bat"
$sdb = "C:\tizen-studio\tools\sdb.exe"
$SdbPort = 26101

function Fail([string]$message, [int]$code = 1) {
    Write-Host "ERRO: $message" -ForegroundColor Red
    exit $code
}

# Roda um comando nativo, mostra a saída e devolve o texto (para detectar falha por conteúdo).
function Invoke-Native([scriptblock]$command) {
    $lines = & $command 2>&1 | ForEach-Object { $_.ToString() }
    $lines | ForEach-Object { Write-Host "  $_" }
    return ($lines -join "`n")
}

# `sdb connect` derruba a sessão rápido no Windows: encadeia connect + comando, e confere `devices`.
function Connect-Tv {
    & $sdb connect "$($TvIp):$SdbPort" | Out-Null
    return ((& $sdb devices 2>&1 | Out-String) -match [regex]::Escape($TvIp))
}

Write-Host "Deploy na TV Samsung" -ForegroundColor Cyan

# 1. Achar a TV (o DHCP troca o IP entre sessões).
if (-not $TvIp) {
    Write-Host "Procurando a TV na LAN (porta $SdbPort aberta)..." -ForegroundColor Yellow
    $hosts = (arp -a | Select-String "(192\.168|10\.\d+)\.\d+\.\d+" | ForEach-Object { ($_.ToString().Trim() -split "\s+")[0] }) |
        Where-Object { $_ -match "^\d+\.\d+\.\d+\.\d+$" -and $_ -notmatch "\.(255|1)$" } | Sort-Object -Unique
    foreach ($h in $hosts) {
        if (Test-NetConnection -ComputerName $h -Port $SdbPort -InformationLevel Quiet -WarningAction SilentlyContinue) { $TvIp = $h; break }
    }
    if (-not $TvIp) { Fail "TV não encontrada com a porta $SdbPort aberta. Ligue a TV (standby profundo cai da rede) e confira Developer Mode = On (Apps -> 12345)." 2 }
}
Write-Host "TV: $TvIp" -ForegroundColor Green

# IP do PC NA MESMA SUB-REDE da TV — é este que vai no campo "Host PC IP" da TV
# (não o dos adaptadores virtuais Hyper-V/WSL/VirtualBox).
$tvPrefix = ($TvIp -split "\.")[0..2] -join "."
$PcIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "$tvPrefix.*" } | Select-Object -First 1).IPAddress
if (-not $PcIp) { $PcIp = "(não achei um adaptador na sub-rede $tvPrefix.x — PC e TV estão na mesma rede?)" }

# 2. Preflight: se o sdb não conecta, para AGORA (antes de gastar build/assinatura).
if (-not (Connect-Tv)) {
    Write-Host ""
    Write-Host "ERRO: a TV ($TvIp) tem a porta $SdbPort aberta mas recusa a conexão do sdb." -ForegroundColor Red
    Write-Host "Causa quase certa: o 'Host PC IP' salvo na TV não é o IP ATUAL deste PC, ou a TV não foi reiniciada depois de salvar." -ForegroundColor Yellow
    Write-Host "Na TV: Apps -> digitar 12345 -> Developer mode On -> Host PC IP = $PcIp -> REINICIAR a TV." -ForegroundColor Yellow
    Write-Host "Depois rode este script de novo." -ForegroundColor Yellow
    exit 3
}
Write-Host "sdb conectado." -ForegroundColor Green

# 3. Build (opcional).
if ($SkipBuild) {
    Write-Host "Build pulado (-SkipBuild): usando o CCPlayTv atual." -ForegroundColor Yellow
} else {
    Write-Host "Gerando build (npm run build:tizen)..." -ForegroundColor Yellow
    Push-Location .\tv-web
    npm run build:tizen 2>&1 | ForEach-Object { $_.ToString() } | Select-Object -Last 3 | ForEach-Object { Write-Host "  $_" }
    $buildOk = ($LASTEXITCODE -eq 0)
    Pop-Location
    if (-not $buildOk) { Fail "build:tizen falhou. Corrija antes de instalar." }
}

# 4. Empacotar e assinar (a saída do `tizen package` esconde o erro do perfil errado: confira o .wgt).
Write-Host "Empacotando com o perfil '$ProfileName'..." -ForegroundColor Yellow
Remove-Item ".\CCPlayTv\.buildResult" -Recurse -Force -ErrorAction SilentlyContinue
& $tizen build-web -e "Debug/*" -- "$PWD\CCPlayTv" | Out-Null
$packageOut = Invoke-Native { & $tizen package -t wgt -s $ProfileName -- "$PWD\CCPlayTv\.buildResult" }
if (-not (Test-Path ".\CCPlayTv\.buildResult\CCPlayTv.wgt")) { Fail "o .wgt não foi gerado. Perfil de assinatura errado? (rode: $tizen security-profiles list)" }
if ($packageOut -match "Not found tizen signature file") {
    Fail "o .wgt saiu SEM assinatura — o nome do perfil '$ProfileName' está errado (sem a letra O da coluna [Active])."
}

# 5. Instalar (connect encadeado, para o daemon não cair no meio).
Write-Host "Instalando na TV ($TargetName)..." -ForegroundColor Yellow
& $sdb connect "$($TvIp):$SdbPort" | Out-Null
$installOut = Invoke-Native { & $tizen install -n CCPlayTv.wgt -t $TargetName -- "$PWD\CCPlayTv\.buildResult" }
if ($installOut -match "-11|Author certificate not match") {
    Fail "já há um app instalado, assinado com OUTRO author. Só resolve desinstalando (apaga IndexedDB: fontes, favoritos, retomada e chave TMDB) — peça confirmação ao usuário: $tizen uninstall -p $AppId -t $TargetName" 4
}
if ($installOut -match "-12|Check certificate error") { Fail "a TV recusou a assinatura (pacote sem cadeia Samsung ou DUID fora do certificado). Ver a skill tizen-tv, seção 'O certificado'." 4 }
if ($installOut -match "There is no connected target|failed") { Fail "a instalação falhou (veja a saída acima)." }

# 6. Lançar e confirmar.
Write-Host "Lançando o app..." -ForegroundColor Yellow
& $sdb connect "$($TvIp):$SdbPort" | Out-Null
$runOut = Invoke-Native { & $tizen run -p $AppId -t $TargetName }
if ($runOut -match "There is no connected target|failed") { Fail "instalou, mas não conseguiu lançar (veja a saída acima)." }
$installed = (& $sdb -s "$($TvIp):$SdbPort" shell 0 applist 2>&1 | Out-String) -match "CCPlay"

if ($installed) { Write-Host "Pronto: CCPlay instalado e lançado na TV ($TvIp). O veredito de tela é do usuário." -ForegroundColor Cyan }
else { Fail "não vi o CCPlay no `applist` da TV depois do install." }
