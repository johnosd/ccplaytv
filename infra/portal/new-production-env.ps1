[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-z][a-z0-9-]{4,61}[a-z0-9]$')][string]$ProjectId,
    [Parameter(Mandatory = $true)][ValidatePattern('^https://[a-z0-9.-]+$')][string]$PublicOrigin,
    [string]$OutFile = ''
)
# No Windows PowerShell 5.1, $PSScriptRoot ainda é vazio nos valores padrão do param().
if (-not $OutFile) { $OutFile = Join-Path $PSScriptRoot 'production.env.yaml' }
# 081/T009: chaves novas da produção (D-002). Imprime só os nomes gravados e o JWKS público (kid prod1) para o
# build comercial da TV. Recusa sobrescrever. Guarde uma cópia protegida fora do repositório.
$ErrorActionPreference = 'Stop'
$api = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'api'
$target = [System.IO.Path]::GetFullPath($OutFile)
& uv --directory $api run python -m app.portal.production_env --project-id $ProjectId --public-origin $PublicOrigin --out $target
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
# 0 = ignorado; 1 = dentro do repositório e versionável (perigo); 128 = fora do repositório.
$ErrorActionPreference = 'Continue'  # no 5.1, stderr de executável nativo viraria exceção com 'Stop'
& git -C $PSScriptRoot check-ignore -q $target 2>$null
if ($LASTEXITCODE -eq 1) { Write-Warning 'arquivo_versionavel_mova_ou_ignore'; exit 2 }
exit 0
