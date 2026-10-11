[CmdletBinding()]
param(
    [string]$BaseUrl = 'https://ccplaytv-portal-dvpldo267q-uc.a.run.app'
)

$ErrorActionPreference = 'Stop'
$base = $BaseUrl.TrimEnd('/')

function Get-Status([string]$Uri) {
    try {
        $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 30
        return [pscustomobject]@{ uri = $Uri; status = $response.StatusCode; body = $response.Content }
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status) { return [pscustomobject]@{ uri = $Uri; status = $status; body = '' } }
        throw
    }
}

$root = Get-Status "$base/"
$health = Get-Status "$base/health"
$unauthorized = Get-Status "$base/portal/v1/configurations"
$result = [pscustomobject]@{
    root = $root.status
    health = $health.status
    healthBody = $health.body
    unauthenticatedConfigurations = $unauthorized.status
    unauthenticatedBody = $unauthorized.body
    passed = ($root.status -eq 200 -and $health.status -eq 200 -and $unauthorized.status -in @(401, 403))
}
$result | ConvertTo-Json -Depth 3
if (-not $result.passed) { throw "staging_smoke_failed" }
