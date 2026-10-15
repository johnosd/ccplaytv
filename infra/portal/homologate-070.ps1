<#
.SYNOPSIS
  Homologação real e não destrutiva das rotas da feature 070 contra o serviço (T061, feature 069).

.DESCRIPTION
  Cria DOIS dispositivos de fixture (identidades `homologate-070-*`), uma fonte de fixture com
  marcadores fictícios e a remove ao final. Não lê nem escreve dados de TV real.
  Verifica: cadastro com ID no formato MAC e chave de 10 dígitos; sessão manual por ID + chave;
  recusa uniforme; limite 429; `GET /session/device`; `GET /configurations/{id}/values`
  (dono, outra TV, sem sessão, `Cache-Control: no-store`); exclusão.
  Nunca imprime chaves, tokens, URLs de fixture nem valores salvos — só nomes de checagem e status.

  Consome 2 cadastros (limite do serviço: 20/h por IP) e até 9 tentativas de sessão manual
  (limites de 15 min por par ID+IP e por IP): rode contra staging, não contra produção.
#>
[CmdletBinding()]
param(
  [string]$BaseUrl = 'https://portal.ccplaytv.com',
  [switch]$SkipRateLimit
)

$ErrorActionPreference = 'Stop'
$base = $BaseUrl.TrimEnd('/')
$origin = $base
$results = [System.Collections.Generic.List[object]]::new()

function Add-Check([string]$Name, [bool]$Passed, [string]$Detail = '') {
  $results.Add([pscustomobject]@{ Check = $Name; Passed = $Passed; Detail = $Detail })
}
function New-B64Token {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}
function New-OperationId { 'op-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString() + '-' + (New-B64Token) }
function Send([string]$Path, [string]$Method, [hashtable]$Headers, $Body, $Session) {
  $params = @{ Uri = "$base$Path"; Method = $Method; Headers = $Headers; SkipHttpErrorCheck = $true; UseBasicParsing = $true }
  if ($null -ne $Body) { $params.Body = ($Body | ConvertTo-Json -Depth 6 -Compress); $params.ContentType = 'application/json' }
  if ($null -ne $Session) { $params.WebSession = $Session }
  Invoke-WebRequest @params
}
function Json($response) { if ($response.Content) { $response.Content | ConvertFrom-Json } else { $null } }
function Enroll {
  $identity = 'homologate-070-' + [guid]::NewGuid().ToString()
  $response = Send '/portal/v1/devices/enroll' 'Post' @{ Origin = 'null' } @{ platformIdentity = $identity; nonce = (New-B64Token) } $null
  if ($response.StatusCode -ne 200 -and $response.StatusCode -ne 201) { throw "enroll_failed status=$($response.StatusCode)" }
  Json $response
}

# 1. Cadastro: ID em formato MAC e chave de 10 dígitos.
$tvA = Enroll
Add-Check 'enroll: displayId no formato MAC' ($tvA.displayId -match '^[0-9A-F]{2}(:[0-9A-F]{2}){5}$')
Add-Check 'enroll: chave de 10 dígitos' ($tvA.deviceKey -match '^\d{10}$')
$tvB = Enroll
Add-Check 'enroll: segunda TV recebe outro ID' ($tvB.displayId -ne $tvA.displayId)

# 2. Sessão manual por ID + chave.
$sessionA = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$manual = Send '/portal/v1/sessions/manual' 'Post' @{ Origin = $origin } @{ displayId = $tvA.displayId; deviceKey = $tvA.deviceKey } $sessionA
Add-Check 'sessão manual: ID + chave válidos' ($manual.StatusCode -eq 200)
$csrf = (Json $manual).csrfToken
Add-Check 'sessão manual: resposta sem chave nem ID no corpo' (-not ($manual.Content -match [regex]::Escape($tvA.deviceKey)))
$sessionB = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$manualB = Send '/portal/v1/sessions/manual' 'Post' @{ Origin = $origin } @{ displayId = $tvB.displayId; deviceKey = $tvB.deviceKey } $sessionB
Add-Check 'sessão manual da outra TV' ($manualB.StatusCode -eq 200)

# 3. Recusa uniforme (chave errada e ID inexistente produzem a mesma resposta).
$wrongKey = Send '/portal/v1/sessions/manual' 'Post' @{ Origin = $origin } @{ displayId = $tvA.displayId; deviceKey = '0000000000' } $null
$unknownId = Send '/portal/v1/sessions/manual' 'Post' @{ Origin = $origin } @{ displayId = '02:00:00:00:00:01'; deviceKey = '1234567890' } $null
Add-Check 'recusa: chave errada = 401' ($wrongKey.StatusCode -eq 401)
Add-Check 'recusa: ID inexistente = 401' ($unknownId.StatusCode -eq 401)
Add-Check 'recusa uniforme (corpos idênticos)' ($wrongKey.Content -eq $unknownId.Content)

# 4. Cabeçalho do painel.
$device = Send '/portal/v1/session/device' 'Get' @{ Origin = $origin } $null $sessionA
$deviceJson = Json $device
Add-Check 'session/device: 200 com displayId da própria TV' ($device.StatusCode -eq 200 -and $deviceJson.displayId -eq $tvA.displayId)
Add-Check 'session/device: licença presente' ($null -ne $deviceJson.license -or $null -ne $deviceJson.state -or $null -ne $deviceJson.licenseState)

# 5. Fonte de fixture e rota values.
$sourceId = 'hom070-' + [guid]::NewGuid().ToString('N')
$markerPassword = 'hom070-pw-' + [guid]::NewGuid().ToString('N')
$markerUser = 'hom070-user-' + [guid]::NewGuid().ToString('N')
$create = Send '/portal/v1/operations' 'Post' @{ Origin = $origin; 'X-CSRF-Token' = $csrf; 'Idempotency-Key' = (New-OperationId) } @{
  action = 'source.create'; sourceId = $sourceId; expectedRevision = 0
  input = @{ type = 'provider_credentials'; displayName = 'Homologacao 070'; providerDns = 'https://painel.invalid:8080'
             providerUsername = $markerUser; providerPassword = $markerPassword } } $sessionA
Add-Check 'operação source.create aceita' ($create.StatusCode -in 200, 201, 202)
$operationId = (Json $create).operationId
$tvHeaders = @{ Authorization = ('Bearer ' + $tvA.bearer) }
$pending = Json (Send '/portal/v1/device/operations' 'Get' $tvHeaders $null $null)
$delivered = @($pending.operations | Where-Object { $_.operationId -eq $operationId }).Count -eq 1
Add-Check 'TV recebe a operação' $delivered
$ack = Send "/portal/v1/device/operations/$operationId/ack" 'Post' $tvHeaders @{ state = 'applied'; revision = 1; importState = 'completed' } $null
Add-Check 'ACK da TV aplicado' ($ack.StatusCode -eq 200)

$values = Send "/portal/v1/configurations/$sourceId/values" 'Get' @{ Origin = $origin } $null $sessionA
$valuesJson = Json $values
Add-Check 'values: dono recebe 200' ($values.StatusCode -eq 200)
Add-Check 'values: Cache-Control no-store' (([string]$values.Headers['Cache-Control']) -match 'no-store')
Add-Check 'values: devolve os valores salvos' ($valuesJson.providerPassword -eq $markerPassword -and $valuesJson.providerUsername -eq $markerUser)
Add-Check 'values: só campos da allowlist' (@($valuesJson.PSObject.Properties.Name | Where-Object { $_ -notin 'type', 'displayName', 'm3uUrl', 'providerDns', 'providerUsername', 'providerPassword', 'epgManualUrl', 'epgOffsetHours' }).Count -eq 0)
$other = Send "/portal/v1/configurations/$sourceId/values" 'Get' @{ Origin = $origin } $null $sessionB
Add-Check 'values: outra TV recebe 404' ($other.StatusCode -eq 404)
Add-Check 'values: 404 sem eco dos valores' (-not ($other.Content -match [regex]::Escape($markerPassword)))
$anonymous = Send "/portal/v1/configurations/$sourceId/values" 'Get' @{ Origin = $origin } $null $null
Add-Check 'values: sem sessão recusa' ($anonymous.StatusCode -in 401, 403)
$missing = Send '/portal/v1/configurations/hom070-inexistente/values' 'Get' @{ Origin = $origin } $null $sessionA
Add-Check 'values: fonte inexistente 404' ($missing.StatusCode -eq 404)

# 6. Exclusão da fonte de fixture e depois 404.
$delete = Send "/portal/v1/configurations/$sourceId" 'Delete' @{ Origin = $origin; 'X-CSRF-Token' = $csrf; 'Idempotency-Key' = (New-OperationId) } @{ expectedRevision = 1 } $sessionA
Add-Check 'exclusão da fonte de fixture aceita' ($delete.StatusCode -in 200, 202)
$afterDelete = Send "/portal/v1/configurations/$sourceId/values" 'Get' @{ Origin = $origin } $null $sessionA
Add-Check 'values: fonte excluída 404' ($afterDelete.StatusCode -eq 404)

# 7. Limite de tentativas (por par ID+IP: 5 em 15 min). Já houve 1 tentativa errada deste par.
if (-not $SkipRateLimit) {
  $last = $null
  for ($i = 1; $i -le 6; $i++) {
    $last = Send '/portal/v1/sessions/manual' 'Post' @{ Origin = $origin } @{ displayId = $tvA.displayId; deviceKey = ('{0:D10}' -f $i) } $null
    if ($last.StatusCode -eq 429) { break }
  }
  Add-Check 'limite: bloqueio temporário 429' ($last.StatusCode -eq 429)
  Add-Check 'limite: Retry-After presente' ([int]([string]$last.Headers['Retry-After']) -gt 0)
}

$results | Format-Table -AutoSize | Out-String | Write-Host
$failed = @($results | Where-Object { -not $_.Passed })
Write-Host ("homologate-070: {0}/{1} verificações aprovadas (marcadores fictícios; nada sensível impresso)" -f ($results.Count - $failed.Count), $results.Count)
# Marcadores para a checagem de logs (não são segredos reais): só o do usuário/senha de fixture.
Write-Host "markers-for-log-check: $markerUser $markerPassword"
if ($failed.Count -gt 0) { exit 1 }
