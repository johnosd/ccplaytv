[CmdletBinding()]
param([string]$BaseUrl = 'https://portal.ccplaytv.com')
# Smoke da feature 071 no staging: cadastro com âncora do teste (trialStartedAt) e envio TV -> site
# (POST /portal/v1/device/sources). Usa um aparelho sintético e valores fictícios; não imprime bearer nem chave.
$ErrorActionPreference = 'Stop'
$base = $BaseUrl.TrimEnd('/')
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$nonce = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$anchor = [DateTimeOffset]::UtcNow.AddDays(-1).ToUnixTimeMilliseconds()
$enroll = @{ platformIdentity = 'synthetic-071-' + [guid]::NewGuid().ToString(); nonce = $nonce; trialStartedAt = $anchor } | ConvertTo-Json
$response = Invoke-WebRequest -Uri "$base/portal/v1/devices/enroll" -Method Post -ContentType 'application/json' -Body $enroll -UseBasicParsing -TimeoutSec 30
$device = $response.Content | ConvertFrom-Json
if (-not $device.bearer) { throw 'enroll_without_bearer' }
$headers = @{ Authorization = 'Bearer ' + $device.bearer }
$item = @{ sourceId = 'smoke-071'; revision = 1; input = @{ type = 'provider_credentials'; displayName = 'Smoke 071';
    providerDns = 'https://painel.invalid:8080'; providerUsername = 'usuario-smoke-071'; providerPassword = 'senha-smoke-071' } }
$body = @{ sources = @($item) } | ConvertTo-Json -Depth 6
function Send-Upload { Invoke-WebRequest -Uri "$base/portal/v1/device/sources" -Method Post -ContentType 'application/json' -Headers $headers -Body $body -UseBasicParsing -TimeoutSec 30 }
$first = Send-Upload
$second = Send-Upload
$stateFirst = ($first.Content | ConvertFrom-Json).results[0].state
$stateSecond = ($second.Content | ConvertFrom-Json).results[0].state
$noEcho = -not ($first.Content -match 'senha-smoke-071' -or $first.Content -match 'usuario-smoke-071')
$result = [pscustomobject]@{
    enrollStatus = $response.StatusCode
    trialAnchored = ($device.trialStartedAt -le $anchor + 1000)
    firstUpload = $stateFirst
    secondUpload = $stateSecond
    noStore = ($first.Headers['Cache-Control'] -match 'no-store')
    noEcho = $noEcho
}
$result | Add-Member -NotePropertyName passed -NotePropertyValue ($result.enrollStatus -eq 200 -and $result.trialAnchored -and
    $stateFirst -eq 'stored' -and $stateSecond -eq 'unchanged' -and $result.noStore -and $noEcho)
$result | ConvertTo-Json
if (-not $result.passed) { throw 'sources_smoke_failed' }
