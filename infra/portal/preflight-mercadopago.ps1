[CmdletBinding()]
param(
    # Arquivo de ambiente privado (ex.: infra/portal/production.env.yaml). Nunca é impresso.
    [Parameter(Mandatory = $true)][string]$SourceEnv
)
# 081/D-005: roda a checagem prévia das credenciais do Mercado Pago e repassa só o JSON de booleanos.
# Lê apenas três chaves de linha única; o bloco PEM e as demais chaves são ignorados.
$ErrorActionPreference = 'Stop'
$names = @('CCPLAY_PORTAL_MERCADOPAGO_ACCESS_TOKEN', 'CCPLAY_PORTAL_MERCADOPAGO_MERCHANT_ID', 'CCPLAY_PORTAL_PUBLIC_ORIGIN')
$source = (Resolve-Path -LiteralPath $SourceEnv).Path
$api = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'api'
$found = @{}
foreach ($line in [System.IO.File]::ReadAllLines($source)) {
    $match = [regex]::Match($line, '^(CCPLAY_PORTAL_[A-Z_]+):\s*"?([^"\r\n]*?)"?\s*$')
    if ($match.Success -and $names -contains $match.Groups[1].Value) { $found[$match.Groups[1].Value] = $match.Groups[2].Value }
}
$missing = @($names | Where-Object { -not $found[$_] })
if ($missing.Count) {
    [pscustomobject]@{ code = 'preflight_configuration_missing'; missing = $missing } | ConvertTo-Json -Compress
    exit 1
}
try {
    # Só o processo filho herda os valores; removidos ao terminar.
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $found[$name], 'Process') }
    & uv --directory $api run python -m app.portal.providers.mercadopago_preflight
    $code = $LASTEXITCODE
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
    $found.Clear()
}
exit $code
