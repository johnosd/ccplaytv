[CmdletBinding()]
param([string]$BaseUrl = 'https://portal.ccplaytv.com')

# Feature 073 (T030): Pix na TV contra o staging (Mercado Pago em modo teste). Cadastra uma TV fictícia, gera o Pix,
# reabre (tem que ser o mesmo), atualiza, confere o aviso no portal e a cópia do código de recuperação.
# Nunca imprime bearer, chave, código de recuperação ou o copia-e-cola inteiro (só prefixo e tamanho).
$ErrorActionPreference = 'Stop'
$base = $BaseUrl.TrimEnd('/')
function New-B64Token {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}
function Invoke-Status([scriptblock]$Call) {
  try { & $Call | Out-Null; return 200 } catch { return [int]$_.Exception.Response.StatusCode }
}

$enrollBody = @{platformIdentity=('pix-test-' + [guid]::NewGuid().ToString());nonce=(New-B64Token)} | ConvertTo-Json
$enroll = Invoke-RestMethod -Uri "$base/portal/v1/devices/enroll" -Method Post -ContentType 'application/json' -Headers @{Origin='null'} -Body $enrollBody
$tv = @{Origin='null';Authorization=('Bearer ' + $enroll.bearer)}
Invoke-RestMethod -Uri "$base/portal/v1/devices/recovery/ack" -Method Post -ContentType 'application/json' -Headers $tv -Body (@{operationId=$enroll.operationId} | ConvertTo-Json) | Out-Null

$requestId = New-B64Token
$pixStatus = 200
try {
  $first = Invoke-RestMethod -Uri "$base/portal/v1/device/orders/pix" -Method Post -ContentType 'application/json' -Headers $tv -Body (@{renew=$false;requestId=$requestId} | ConvertTo-Json)
} catch { $pixStatus = [int]$_.Exception.Response.StatusCode; $first = $null }

$again = $null; $refresh = $null
if ($first) {
  $again = Invoke-RestMethod -Uri "$base/portal/v1/device/orders/pix" -Method Post -ContentType 'application/json' -Headers $tv -Body (@{renew=$false;requestId=(New-B64Token)} | ConvertTo-Json)
  $refresh = Invoke-RestMethod -Uri "$base/portal/v1/device/orders/pix/refresh" -Method Post -ContentType 'application/json' -Headers $tv -Body (@{orderId=$first.orderId} | ConvertTo-Json)
}

# Cópia do código (D-008) e painel da mesma TV.
$escrowStatus = Invoke-Status { Invoke-WebRequest -Uri "$base/portal/v1/device/recovery-code/escrow" -Method Put -ContentType 'application/json' -Headers $tv -Body (@{recoveryCode=$enroll.recoveryCode;recoveryCodeVersion=$enroll.recoveryCodeVersion} | ConvertTo-Json) -UseBasicParsing }
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$manual = Invoke-WebRequest -Uri "$base/portal/v1/sessions/manual" -Method Post -ContentType 'application/json' -Headers @{Origin=$base} -Body (@{displayId=$enroll.displayId;deviceKey=$enroll.deviceKey} | ConvertTo-Json) -WebSession $session -UseBasicParsing
$csrf = ($manual.Content | ConvertFrom-Json).csrfToken
$device = Invoke-RestMethod -Uri "$base/portal/v1/session/device" -Method Get -Headers @{Origin=$base} -WebSession $session
$reveal = Invoke-WebRequest -Uri "$base/portal/v1/session/recovery-code" -Method Post -ContentType 'application/json' -Headers @{Origin=$base;'X-CSRF-Token'=$csrf} -Body '{}' -WebSession $session -UseBasicParsing
$revealed = $reveal.Content | ConvertFrom-Json

[pscustomobject]@{
  pixHttpStatus = $pixStatus
  orderId = if ($first) { $first.orderId.Substring(0, 6) + '…' } else { $null }
  state = $first.state
  qrPrefix = if ($first.qrCode) { $first.qrCode.Substring(0, 6) } else { $null }
  qrLength = if ($first.qrCode) { $first.qrCode.Length } else { 0 }
  priceMinor = $first.priceMinor
  expiresInMinutes = if ($first) { [math]::Round(([DateTimeOffset]::Parse($first.expiresAt) - [DateTimeOffset]::Parse($first.serverTime)).TotalMinutes, 1) } else { $null }
  reopenSameOrder = if ($again) { $again.orderId -eq $first.orderId } else { $null }
  reopenSameQr = if ($again) { $again.qrCode -eq $first.qrCode } else { $null }
  refreshState = $refresh.state
  portalPendingMethod = $device.pendingOrder.method
  portalPendingHasNoCode = -not ($device | ConvertTo-Json -Depth 5).Contains('000201')
  escrowHttpStatus = $escrowStatus
  revealCacheControl = $reveal.Headers['Cache-Control']
  revealMatchesTv = $revealed.recoveryCode -eq $enroll.recoveryCode
  secretsPrinted = $false
} | ConvertTo-Json
