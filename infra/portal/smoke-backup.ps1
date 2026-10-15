[CmdletBinding()]
param([string]$BaseUrl = 'https://portal.ccplaytv.com')
# Smoke da feature 072 no staging: backup de uso (PUT/summary/GET/DELETE + expectExisting) e reassociação pela própria
# TV (`/devices/recovery/self`). Aparelho sintético e valores fictícios; não imprime bearer, chave nem código.
$ErrorActionPreference = 'Stop'
$base = $BaseUrl.TrimEnd('/')
function New-Token { $b = New-Object byte[] 32; $r = [Security.Cryptography.RandomNumberGenerator]::Create(); try { $r.GetBytes($b) } finally { $r.Dispose() }; [Convert]::ToBase64String($b).TrimEnd('=').Replace('+', '-').Replace('/', '_') }
function Send($path, $method, $body, $bearer) {
  $headers = @{}; if ($bearer) { $headers.Authorization = 'Bearer ' + $bearer }
  $json = if ($null -ne $body) { $body | ConvertTo-Json -Depth 8 -Compress } else { $null }
  try { $r = Invoke-WebRequest -Uri "$base$path" -Method $method -ContentType 'application/json' -Headers $headers -Body $json -UseBasicParsing -TimeoutSec 30
    return [pscustomobject]@{ status = [int]$r.StatusCode; body = $r.Content; cache = [string]$r.Headers['Cache-Control'] } }
  catch { return [pscustomobject]@{ status = [int]$_.Exception.Response.StatusCode.value__; body = ''; cache = '' } }
}
$identity = 'synthetic-072-' + [guid]::NewGuid().ToString()
$enroll = Send '/portal/v1/devices/enroll' 'Post' @{ platformIdentity = $identity; nonce = (New-Token) } $null
$device = $enroll.body | ConvertFrom-Json
$marker = 'tmdbsmoke072' + [guid]::NewGuid().ToString('N')
$payload = @{ format = 1; createdAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); counts = @{ favorites = 1; history = 0; progress = 0; categoryPreferences = 0; listPins = 0 }
  usage = @{ userStates = @(@{ stableId = 'smoke:movie:1'; sourceId = 'smoke'; isFavorite = $true; createdAt = 1; updatedAt = 1 }); categoryPreferences = @(); listPins = @(); settings = @{} }
  secrets = @{ tmdb = @{ key = $marker; format = 'v3' } } }
$put = Send '/portal/v1/device/backup' 'Put' $payload $device.bearer
$summary = Send '/portal/v1/device/backup/summary' 'Get' $null $device.bearer
$read = Send '/portal/v1/device/backup' 'Get' $null $device.bearer
$deleted = Send '/portal/v1/device/backup' 'Delete' $null $device.bearer
$payload.expectExisting = $true
$recreate = Send '/portal/v1/device/backup' 'Put' $payload $device.bearer
$relink = Send '/portal/v1/devices/recovery/self' 'Post' @{ platformIdentity = $identity; nonce = (New-Token); recoveryCode = $device.recoveryCode } $null
$relinked = if ($relink.status -eq 200) { $relink.body | ConvertFrom-Json } else { $null }
$wrong = Send '/portal/v1/devices/recovery/self' 'Post' @{ platformIdentity = $identity; nonce = (New-Token); recoveryCode = '0000-0000-0000-0000-0000-0000-0000' } $null
$result = [pscustomobject]@{
  enroll = $enroll.status; put = $put.status; putNoEcho = -not $put.body.Contains($marker); noStore = $put.cache -match 'no-store'
  summary = ($summary.body | ConvertFrom-Json).exists; readBack = $read.body.Contains($marker); delete = $deleted.status
  recreateRefused = $recreate.status; relink = $relink.status; sameDevice = ($relinked.deviceId -eq $device.deviceId)
  newKey = ($relinked -and $relinked.deviceKey -ne $device.deviceKey); wrongCode = $wrong.status
}
$result | Add-Member -NotePropertyName passed -NotePropertyValue ($result.enroll -eq 200 -and $result.put -eq 200 -and $result.putNoEcho -and
  $result.noStore -and $result.summary -and $result.readBack -and $result.delete -eq 204 -and $result.recreateRefused -eq 404 -and
  $result.relink -eq 200 -and $result.sameDevice -and $result.newKey -and $result.wrongCode -eq 401)
$result | ConvertTo-Json
if (-not $result.passed) { throw 'backup_smoke_failed' }
