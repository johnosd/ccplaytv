[CmdletBinding()]
param([string]$BaseUrl = 'https://portal.ccplaytv.com')

$ErrorActionPreference = 'Stop'
$base = $BaseUrl.TrimEnd('/')
function New-B64Token {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}
function New-OperationId {
  'op-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString() + '-' + (New-B64Token)
}

$enrollBody = @{platformIdentity=('payment-test-' + [guid]::NewGuid().ToString());nonce=(New-B64Token)} | ConvertTo-Json
$enroll = Invoke-RestMethod -Uri "$base/portal/v1/devices/enroll" -Method Post -ContentType 'application/json' -Headers @{Origin='null'} -Body $enrollBody
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$manualBody = @{displayId=$enroll.displayId;deviceKey=$enroll.deviceKey} | ConvertTo-Json
$manual = Invoke-WebRequest -Uri "$base/portal/v1/sessions/manual" -Method Post -ContentType 'application/json' -Headers @{Origin=$base} -Body $manualBody -WebSession $session -UseBasicParsing
$csrf = ($manual.Content | ConvertFrom-Json).csrfToken
$browserHeaders = @{Origin=$base;'X-CSRF-Token'=$csrf;'Idempotency-Key'=(New-B64Token)}
$offer = Invoke-RestMethod -Uri "$base/portal/v1/offer" -Method Get -Headers @{Origin=$base} -WebSession $session
$order = Invoke-RestMethod -Uri "$base/portal/v1/orders" -Method Post -ContentType 'application/json' -Headers $browserHeaders -Body '{}' -WebSession $session
[pscustomobject]@{
  offerPriceMinor = $offer.priceMinor
  offerCurrency = $offer.currency
  offerTermMonths = $offer.termMonths
  checkoutEnabled = $offer.checkoutEnabled
  orderId = $order.orderId
  orderStatus = $order.status
  checkoutUrl = $order.checkoutUrl
  secretsPrinted = $false
} | ConvertTo-Json
