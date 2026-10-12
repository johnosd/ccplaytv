[CmdletBinding()]
param([string]$BaseUrl = 'https://ccplaytv-portal-dvpldo267q-uc.a.run.app', [int]$Samples = 100)

$ErrorActionPreference = 'Stop'
$base = $BaseUrl.TrimEnd('/')
$origin = $base
function New-B64Token {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}
function New-OperationId {
  'op-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString() + '-' + (New-B64Token)
}
function Invoke-Json {
  param([string]$Uri, [string]$Method, [hashtable]$Headers, [object]$Body, [Microsoft.PowerShell.Commands.WebRequestSession]$WebSession)
  $json = if ($null -ne $Body) { $Body | ConvertTo-Json -Depth 6 -Compress } else { $null }
  Invoke-RestMethod -Uri $Uri -Method $Method -ContentType 'application/json' -Headers $Headers -Body $json -WebSession $WebSession
}

if ($Samples -lt 1 -or $Samples -gt 500) { throw 'samples_must_be_between_1_and_500' }
$nonce = New-B64Token
$identity = 'measure-' + [guid]::NewGuid().ToString()
$enroll = Invoke-Json "$base/portal/v1/devices/enroll" 'Post' @{Origin='null'} @{platformIdentity=$identity;nonce=$nonce} $null
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$manual = Invoke-WebRequest -Uri "$base/portal/v1/sessions/manual" -Method Post -ContentType 'application/json' -Headers @{Origin=$origin} -Body (@{deviceId=$enroll.deviceId;deviceKey=$enroll.deviceKey}|ConvertTo-Json) -WebSession $session -UseBasicParsing
$csrf = ($manual.Content | ConvertFrom-Json).csrfToken
$tvHeaders = @{Authorization=('Bearer ' + $enroll.bearer)}
$sourceId = 'measure-' + [guid]::NewGuid().ToString('N')

# Create once so all measured operations are valid updates of the same source.
$createHeaders = @{Origin=$origin;'X-CSRF-Token'=$csrf;'Idempotency-Key'=(New-OperationId)}
$create = Invoke-Json "$base/portal/v1/operations" 'Post' $createHeaders @{action='source.create';sourceId=$sourceId;expectedRevision=0;input=@{type='m3u_url';displayName='Staging measurement';m3uUrl='https://example.invalid/measurement.m3u'}} $session
$pending = Invoke-Json "$base/portal/v1/device/operations" 'Get' $tvHeaders $null $null
$createDevice = @($pending.operations | Where-Object { $_.operationId -eq $create.operationId }) | Select-Object -First 1
if ($null -eq $createDevice) { throw 'measurement_create_not_pulled' }
Invoke-Json "$base/portal/v1/device/operations/$($create.operationId)/ack" 'Post' $tvHeaders @{state='applied';revision=1;importState='completed'} $null | Out-Null

$latencies = [System.Collections.Generic.List[double]]::new()
$revision = 1
for ($i = 1; $i -le $Samples; $i++) {
  $operationId = New-OperationId
  $headers = @{Origin=$origin;'X-CSRF-Token'=$csrf;'Idempotency-Key'=$operationId}
  $body = @{action='source.update';sourceId=$sourceId;expectedRevision=$revision;input=@{displayName=('Staging measurement ' + $i);m3uUrl=('https://example.invalid/measurement-' + $i + '.m3u')}}
  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  $submitted = Invoke-Json "$base/portal/v1/operations" 'Post' $headers $body $session
  $deviceOperation = $null
  for ($attempt = 0; $attempt -lt 20 -and $null -eq $deviceOperation; $attempt++) {
    $pending = Invoke-Json "$base/portal/v1/device/operations" 'Get' $tvHeaders $null $null
    $deviceOperation = @($pending.operations | Where-Object { $_.operationId -eq $submitted.operationId }) | Select-Object -First 1
    if ($null -eq $deviceOperation) { Start-Sleep -Milliseconds 100 }
  }
  if ($null -eq $deviceOperation) { throw ('measurement_pull_failed_' + $i) }
  $ack = Invoke-Json "$base/portal/v1/device/operations/$($submitted.operationId)/ack" 'Post' $tvHeaders @{state='applied';revision=($revision + 1);importState='completed'} $null
  $watch.Stop()
  if ($ack.state -ne 'applied' -or [int]$ack.receipt.revision -ne ($revision + 1)) { throw ('measurement_ack_failed_' + $i) }
  $latencies.Add($watch.Elapsed.TotalMilliseconds)
  $revision++
  # O endpoint de mutação aplica 30 requisições/minuto por sessão.
  if ($i -lt $Samples) { Start-Sleep -Milliseconds 2200 }
}

$ordered = @($latencies | ForEach-Object { [double]$_ } | Sort-Object)
$p50Index = [math]::Max(0, [int]([math]::Ceiling($ordered.Count * 0.50) - 1))
$p95Index = [math]::Max(0, [int]([math]::Ceiling($ordered.Count * 0.95) - 1))
[pscustomobject]@{
  samples = $latencies.Count
  successful = $latencies.Count
  sourceType = 'synthetic_m3u_url'
  p50Ms = [math]::Round($ordered[$p50Index], 2)
  p95Ms = [math]::Round($ordered[$p95Index], 2)
  minMs = [math]::Round($ordered[0], 2)
  maxMs = [math]::Round($ordered[$ordered.Count - 1], 2)
  secretsPrinted = $false
} | ConvertTo-Json
