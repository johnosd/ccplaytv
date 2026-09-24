param (
    [string]$TvIp,
    [string]$ProfileName = "ccplay_samsung_certificate_4",
    [string]$TargetName = "QN50Q60DAGXZD",
    [string]$AppId = "8tZqMtwANL.CCPlayTv",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$tizen = "C:\tizen-studio\tools\ide\bin\tizen.bat"
$sdb = "C:\tizen-studio\tools\sdb.exe"

Write-Host "Iniciando deploy para a TV Samsung..." -ForegroundColor Cyan

# 1. Encontrar TV na rede se IP não foi passado
if (-not $TvIp) {
    Write-Host "Buscando TV na rede local..." -ForegroundColor Yellow
    $hosts = (arp -a | Select-String "192\.168\." | ForEach-Object { ($_.ToString().Trim() -split "\s+")[0] }) | Where-Object { $_ -match "^\d+\.\d+\.\d+\.\d+$" } | Sort-Object -Unique
    foreach ($h in $hosts) {
        if (Test-NetConnection -ComputerName $h -Port 26101 -InformationLevel Quiet -WarningAction SilentlyContinue) { 
            $TvIp = $h
            break
        }
    }
    if (-not $TvIp) {
        Write-Host "ERRO: TV não encontrada na rede. Verifique se ela está ligada e o Developer Mode ativo." -ForegroundColor Red
        exit 1
    }
}
Write-Host "TV encontrada no IP: $TvIp" -ForegroundColor Green

# 2. Encontrar IP do PC na mesma sub-rede da TV
$TvSubnet = ($TvIp -split '\.')[0..2] -join '.'
$PcIp = (Get-NetIPAddress -AddressFamily IPv4).IPAddress | Where-Object { $_ -like "$TvSubnet.*" } | Select-Object -First 1

if (-not $PcIp) {
    # Fallback caso não encontre na mesma sub-rede
    $PcIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -eq 'Dhcp' }).IPAddress | Select-Object -First 1
}
Write-Host "IP do PC (Backend): $PcIp" -ForegroundColor Green

# 3. Build do Front-end
if (-not $SkipBuild) {
    Write-Host "Gerando build de produção..." -ForegroundColor Yellow
    Push-Location .\tv-web
    $env:VITE_API_URL = "http://$($PcIp):3000"
    npm run build:tizen
    Pop-Location
} else {
    Write-Host "Pulando etapa de build (--SkipBuild)." -ForegroundColor Yellow
}

# 4. Empacotar e Assinar
Write-Host "Empacotando e assinando com o perfil: $ProfileName..." -ForegroundColor Yellow
Remove-Item ".\CCPlayTv\.buildResult" -Recurse -Force -ErrorAction SilentlyContinue
& $tizen build-web -e "Debug/*" -- "$PWD\CCPlayTv" | Out-Null
& $tizen package -t wgt -s $ProfileName -- "$PWD\CCPlayTv\.buildResult" | Out-Null

if (-not (Test-Path ".\CCPlayTv\.buildResult\CCPlayTv.wgt")) {
    Write-Host "ERRO: O pacote .wgt não foi gerado. Verifique o nome do perfil do certificado." -ForegroundColor Red
    exit 1
}

# 5. Instalar na TV (encadeado com connect para evitar queda do sdb daemon)
Write-Host "Conectando e instalando na TV ($TargetName)..." -ForegroundColor Yellow
$installCmd = "& `"$sdb`" connect $($TvIp):26101; & `"$tizen`" install -n CCPlayTv.wgt -t $TargetName -- `"$PWD\CCPlayTv\.buildResult`""
Invoke-Expression $installCmd

# 6. Iniciar app na TV (encadeado com connect para evitar queda)
Write-Host "Lançando o app na TV..." -ForegroundColor Yellow
$runCmd = "& `"$sdb`" connect $($TvIp):26101; & `"$tizen`" run -p $AppId -t $TargetName"
Invoke-Expression $runCmd

Write-Host "Deploy finalizado!" -ForegroundColor Cyan
