<#
  Instala o app de teste "Sonda Cota 082" na TV (app SEPARADO do CCPlayTV: outro id, outra pasta de dados).
  Nao toca o CCPlayTV nem a lista do usuario. So rodar com autorizacao do usuario.
  Uso (da raiz do repo):  .\sdd\specs\082-orcamento-armazenamento-tv\sonda-tv\instalar-sonda.ps1 [-TvIp 192.168.0.2]
  Coletor (outro terminal): node .\sdd\specs\082-orcamento-armazenamento-tv\sonda-tv\coletor.mjs <ip-da-tv>
  Desinstalar depois:      tizen.bat uninstall -p ccpSonda82.CotaProbe -t QN50Q60DAGXZD
#>
param (
    [string]$TvIp,
    [string]$App = "app",
    [string]$AppId = "ccpSonda82.CotaProbe",
    [string[]]$Only = @(),
    [string]$ProfileName = "ccplay_samsung_certificate_4",
    [string]$TargetName = "QN50Q60DAGXZD",
    [int]$CollectorPort = 8770
)
$ErrorActionPreference = "Continue"
$tizen = "C:\tizen-studio\tools\ide\bin\tizen.bat"
$sdb = "C:\tizen-studio\tools\sdb.exe"
$app = Join-Path $PSScriptRoot $App
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path

if (-not $TvIp) {
    $hosts = (arp -a | Select-String "(192\.168|10\.\d+)\.\d+\.\d+" | ForEach-Object { ($_.ToString().Trim() -split "\s+")[0] }) |
        Where-Object { $_ -match "^\d+\.\d+\.\d+\.\d+$" -and $_ -notmatch "\.(255|1)$" } | Sort-Object -Unique
    foreach ($h in $hosts) { if (Test-NetConnection -ComputerName $h -Port 26101 -InformationLevel Quiet -WarningAction SilentlyContinue) { $TvIp = $h; break } }
    if (-not $TvIp) { Write-Host "ERRO: TV nao encontrada (porta 26101). Ligue a TV e confira o Developer Mode." -ForegroundColor Red; exit 2 }
}
$prefix = ($TvIp -split "\.")[0..2] -join "."
$PcIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "$prefix.*" } | Select-Object -First 1).IPAddress
if (-not $PcIp) { Write-Host "ERRO: nenhum adaptador do PC na sub-rede $prefix.x" -ForegroundColor Red; exit 2 }
Write-Host "TV: $TvIp | PC (coletor): $($PcIp):$CollectorPort" -ForegroundColor Green

# Endereco do coletor (so IP da LAN) e icone.
Set-Content -Path (Join-Path $app "report-target.js") -Value "window.PROBE_REPORT_URL = 'http://$($PcIp):$CollectorPort/storage-probe'; window.PROBE_BASE_URL = 'http://$($PcIp):$CollectorPort'; window.PROBE_ONLY = [$((@($Only) | ForEach-Object { "'$_'" }) -join ',')]" -Encoding ASCII
Copy-Item (Join-Path $repo "CCPlayTv\icon.png") (Join-Path $app "icon.png") -Force

& $sdb connect "$($TvIp):26101" | Out-Null
if (-not ((& $sdb devices 2>&1 | Out-String) -match [regex]::Escape($TvIp))) { Write-Host "ERRO: sdb nao conectou (Host PC IP na TV = $PcIp, depois reiniciar a TV)." -ForegroundColor Red; exit 3 }

Remove-Item (Join-Path $app ".buildResult") -Recurse -Force -ErrorAction SilentlyContinue
& $tizen build-web -- "$app" | Out-Null
$out = (& $tizen package -t wgt -s $ProfileName -- "$app\.buildResult" 2>&1 | Out-String); Write-Host $out
$wgt = Get-ChildItem "$app\.buildResult\*.wgt" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $wgt -or $out -match "Not found tizen signature file") { Write-Host "ERRO: .wgt nao gerado ou sem assinatura." -ForegroundColor Red; exit 4 }

& $sdb connect "$($TvIp):26101" | Out-Null
$install = (& $tizen install -n $wgt.Name -t $TargetName -- "$app\.buildResult" 2>&1 | Out-String); Write-Host $install
if ($install -match "-11|-12|failed|There is no connected target") { Write-Host "ERRO: instalacao falhou (veja acima)." -ForegroundColor Red; exit 5 }
& $sdb connect "$($TvIp):26101" | Out-Null
& $tizen run -p $AppId -t $TargetName
Write-Host "Pronto: sonda instalada e lancada. Acompanhe o coletor." -ForegroundColor Cyan
