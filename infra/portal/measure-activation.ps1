[CmdletBinding()]
param(
  [string]$BaseUrl = 'https://ccplaytv-portal-dvpldo267q-uc.a.run.app',
  [ValidateRange(1, 100)][int]$Devices = 20,
  # Teto de espera acumulada por Retry-After do limitador de enrollment (20/h por IP).
  [ValidateRange(0, 240)][int]$MaxWaitMinutes = 75
)

# Mede a ATIVAÇÃO DE TESTE (trial de 7 dias): enroll -> POST /device/trial -> GET /device/entitlement.
# Não é ativação paga (SC-006): checkout fica desligado e nenhuma compra é criada.
$ErrorActionPreference = 'Stop'
$base = $BaseUrl.TrimEnd('/')

function New-B64Token {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}
function Read-JwsClaims([string]$Jws) {
  $part = $Jws.Split('.')[1].Replace('-','+').Replace('_','/')
  $part = $part.PadRight($part.Length + ((4 - $part.Length % 4) % 4), '=')
  [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($part)) | ConvertFrom-Json
}
function Get-Percentile([double[]]$Sorted, [double]$P) {
  $Sorted[[math]::Max(0, [int]([math]::Ceiling($Sorted.Count * $P) - 1))]
}
# Diagnóstico sem segredo: método, rota, status e Retry-After; nunca corpo nem Authorization.
function Invoke-Timed {
  param([string]$Uri, [string]$Method, [hashtable]$Headers, [string]$Body)
  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  # GET não aceita -Body (nem vazio): o corpo só entra no splat quando existe.
  $call = @{ Uri = $Uri; Method = $Method; Headers = $Headers; ContentType = 'application/json' }
  if (-not [string]::IsNullOrEmpty($Body)) { $call.Body = $Body }
  try {
    $result = Invoke-RestMethod @call
    $watch.Stop()
    [pscustomobject]@{ Ok = $true; Ms = $watch.Elapsed.TotalMilliseconds; Result = $result; Status = 200; RetryAfter = 0 }
  } catch {
    $watch.Stop()
    $response = $_.Exception.Response
    $status = if ($null -ne $response) { [int]$response.StatusCode } else { 0 }
    $retry = 0
    if ($null -ne $response -and $response.Headers) { [void][int]::TryParse([string]$response.Headers['Retry-After'], [ref]$retry) }
    [pscustomobject]@{ Ok = $false; Ms = $watch.Elapsed.TotalMilliseconds; Result = $null; Status = $status; RetryAfter = $retry
                       Route = ($Method + ' ' + ([Uri]$Uri).AbsolutePath) }
  }
}

$trialMs = [System.Collections.Generic.List[double]]::new()
$entitlementMs = [System.Collections.Generic.List[double]]::new()
$totalMs = [System.Collections.Generic.List[double]]::new()
$states = @{}
$waited = 0.0
$started = [DateTimeOffset]::UtcNow

for ($n = 1; $n -le $Devices; $n++) {
  $enroll = $null
  while ($null -eq $enroll) {
    $body = @{platformIdentity = ('measure-activation-' + [guid]::NewGuid().ToString()); nonce = (New-B64Token)} | ConvertTo-Json -Compress
    $r = Invoke-Timed "$base/portal/v1/devices/enroll" 'Post' @{Origin='null'} $body
    if ($r.Ok) { $enroll = $r.Result; break }
    if ($r.Status -ne 429) { throw ("activation_http_failed route=$($r.Route) status=$($r.Status)") }
    # A rota de enrollment nem sempre devolve Retry-After: sem ele, sondar a cada 30 s (negações não consomem cota).
    $sleep = if ($r.RetryAfter -gt 0) { $r.RetryAfter + 2 } else { 30 }
    if (($waited + $sleep / 60.0) -gt $MaxWaitMinutes) { throw ("activation_wait_budget_exceeded device=$n waitedMin=" + [math]::Round($waited, 1)) }
    Start-Sleep -Seconds $sleep
    $waited += $sleep / 60.0
  }
  $tvHeaders = @{Authorization = ('Bearer ' + $enroll.bearer)}

  $trial = Invoke-Timed "$base/portal/v1/device/trial" 'Post' $tvHeaders '{}'
  if (-not $trial.Ok) { throw ("activation_http_failed route=$($trial.Route) status=$($trial.Status) device=$n") }
  $entitlement = Invoke-Timed "$base/portal/v1/device/entitlement" 'Get' $tvHeaders $null
  if (-not $entitlement.Ok) { throw ("activation_http_failed route=$($entitlement.Route) status=$($entitlement.Status) device=$n") }

  $claims = Read-JwsClaims ([string]$entitlement.Result.jws)
  if ($claims.deviceId -ne $enroll.deviceId) { throw ("activation_device_mismatch device=$n") }
  $states[[string]$claims.state] = 1 + [int]$states[[string]$claims.state]
  $trialMs.Add($trial.Ms); $entitlementMs.Add($entitlement.Ms); $totalMs.Add($trial.Ms + $entitlement.Ms)
  # Progresso por dispositivo (sem identificadores nem tokens): sobrevive a uma interrupção.
  [Console]::Error.WriteLine(('device={0}/{1} state={2} trialMs={3} entitlementMs={4} waitedMin={5}' -f
    $n, $Devices, $claims.state, [math]::Round($trial.Ms), [math]::Round($entitlement.Ms), [math]::Round($waited, 1)))
}

$sorted = @($totalMs | ForEach-Object { [double]$_ } | Sort-Object)
$sortedTrial = @($trialMs | ForEach-Object { [double]$_ } | Sort-Object)
$sortedEntitlement = @($entitlementMs | ForEach-Object { [double]$_ } | Sort-Object)
[pscustomobject]@{
  kind = 'synthetic_trial_activation'
  paidActivation = $false
  devices = $trialMs.Count
  statesObserved = $states
  rateLimitWaitMinutes = [math]::Round($waited, 1)
  elapsedMinutes = [math]::Round(([DateTimeOffset]::UtcNow - $started).TotalMinutes, 1)
  within60sPct = [math]::Round(100.0 * @($sorted | Where-Object { $_ -le 60000 }).Count / $sorted.Count, 1)
  trialP50Ms = [math]::Round((Get-Percentile $sortedTrial 0.5), 2)
  trialP95Ms = [math]::Round((Get-Percentile $sortedTrial 0.95), 2)
  entitlementP50Ms = [math]::Round((Get-Percentile $sortedEntitlement 0.5), 2)
  entitlementP95Ms = [math]::Round((Get-Percentile $sortedEntitlement 0.95), 2)
  totalP50Ms = [math]::Round((Get-Percentile $sorted 0.5), 2)
  totalP95Ms = [math]::Round((Get-Percentile $sorted 0.95), 2)
  totalMaxMs = [math]::Round($sorted[$sorted.Count - 1], 2)
  secretsPrinted = $false
} | ConvertTo-Json -Depth 4
