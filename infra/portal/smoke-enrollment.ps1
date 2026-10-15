[CmdletBinding()]
param([string]$BaseUrl = 'https://portal.ccplaytv.com')
$ErrorActionPreference='Stop'
$bytes=New-Object byte[] 32
$rng=[Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$nonce=[Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
$identity='synthetic-'+[guid]::NewGuid().ToString()
$body=@{platformIdentity=$identity;nonce=$nonce}|ConvertTo-Json
$r=Invoke-WebRequest -Uri ($BaseUrl.TrimEnd('/')+'/portal/v1/devices/enroll') -Method Post -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 30
$d=$r.Content|ConvertFrom-Json
[pscustomobject]@{status=$r.StatusCode;operationId=$d.operationId;deviceIdPresent=[bool]$d.deviceId;deviceKeyPresent=[bool]$d.deviceKey;bearerPresent=[bool]$d.bearer;recoveryCodePresent=[bool]$d.recoveryCode}|ConvertTo-Json
if($r.StatusCode -ne 200 -or -not $d.deviceId -or -not $d.deviceKey -or -not $d.bearer){throw 'enrollment_smoke_failed'}
