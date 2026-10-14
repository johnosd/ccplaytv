<#
.SYNOPSIS
  Prepara e provoca os eventos do ensaio "backup anterior a delete" do replay do journal (T039, feature 069).

.DESCRIPTION
  Fase Setup  : cria UM dispositivo de fixture e UMA fonte (marcadores fictícios) no staging e confirma o ACK
                da TV simulada. Roda ANTES de um snapshot diário do Firestore, para que o snapshot contenha a
                fonte. O estado (ID exibido, chave, bearer) fica em -StateFile, fora do repositório.
  Fase Mutate : roda DEPOIS do snapshot: exclui a fonte pelo portal (evento `source_deleted`) e revoga o
                acesso (evento `access_revoked`). Em seguida o snapshot anterior é restaurado em banco isolado
                e `restore_replay --apply` deve aplicar os dois eventos.

  Nunca imprime chave, bearer, URL ou valores salvos. Só staging: recusa a URL de produção.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('Setup', 'Mutate')][string]$Phase,
  [Parameter(Mandatory = $true)][string]$StateFile,
  [string]$BaseUrl = 'https://ccplaytv-portal-dvpldo267q-uc.a.run.app'
)

$ErrorActionPreference = 'Stop'
$base = $BaseUrl.TrimEnd('/')
$origin = $base

function New-B64Token([int]$Bytes = 32) {
  $buffer = New-Object byte[] $Bytes
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
  [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}
function New-OperationId { 'op-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString() + '-' + (New-B64Token) }
function Send([string]$Path, [string]$Method, [hashtable]$Headers, $Body, $Session) {
  $params = @{ Uri = "$base$Path"; Method = $Method; Headers = $Headers; SkipHttpErrorCheck = $true; UseBasicParsing = $true }
  if ($null -ne $Body) { $params.Body = ($Body | ConvertTo-Json -Depth 6 -Compress); $params.ContentType = 'application/json' }
  if ($null -ne $Session) { $params.WebSession = $Session }
  Invoke-WebRequest @params
}
function Expect([string]$Step, $Response, [int[]]$Statuses) {
  if ($Response.StatusCode -notin $Statuses) { throw "$Step falhou status=$($Response.StatusCode)" }
  Write-Host "ok: $Step ($($Response.StatusCode))"
}

if ($Phase -eq 'Setup') {
  if (Test-Path $StateFile) { throw 'state_file_exists' }
  $enroll = Send '/portal/v1/devices/enroll' 'Post' @{ Origin = 'null' } @{ platformIdentity = ('rehearse-replay-' + [guid]::NewGuid().ToString()); nonce = (New-B64Token) } $null
  Expect 'enroll' $enroll 200, 201
  $device = $enroll.Content | ConvertFrom-Json
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $manual = Send '/portal/v1/sessions/manual' 'Post' @{ Origin = $origin } @{ displayId = $device.displayId; deviceKey = $device.deviceKey } $session
  Expect 'sessão manual' $manual 200
  $csrf = ($manual.Content | ConvertFrom-Json).csrfToken
  $sourceId = 'replay-' + [guid]::NewGuid().ToString('N')
  $create = Send '/portal/v1/operations' 'Post' @{ Origin = $origin; 'X-CSRF-Token' = $csrf; 'Idempotency-Key' = (New-OperationId) } @{
    action = 'source.create'; sourceId = $sourceId; expectedRevision = 0
    input = @{ type = 'm3u_url'; displayName = 'Ensaio replay'; m3uUrl = ('https://example.invalid/replay-' + [guid]::NewGuid().ToString('N') + '.m3u') } } $session
  Expect 'source.create' $create 200, 201, 202
  $operationId = ($create.Content | ConvertFrom-Json).operationId
  $tv = @{ Authorization = ('Bearer ' + $device.bearer) }
  $pending = (Send '/portal/v1/device/operations' 'Get' $tv $null $null).Content | ConvertFrom-Json
  if (@($pending.operations | Where-Object { $_.operationId -eq $operationId }).Count -ne 1) { throw 'operação não entregue' }
  Expect 'ACK' (Send "/portal/v1/device/operations/$operationId/ack" 'Post' $tv @{ state = 'applied'; revision = 1; importState = 'completed' } $null) 200
  [pscustomobject]@{
    baseUrl = $base; deviceId = $device.deviceId; displayId = $device.displayId; deviceKey = $device.deviceKey
    bearer = $device.bearer; sourceId = $sourceId; createdAt = [DateTimeOffset]::UtcNow.ToString('o')
  } | ConvertTo-Json | Set-Content -Path $StateFile -Encoding utf8
  Write-Host "setup concluído; estado salvo em $StateFile (não versionar). Rode -Phase Mutate depois do próximo snapshot."
  return
}

# Mutate
$state = Get-Content -Raw $StateFile | ConvertFrom-Json
if ($state.baseUrl -ne $base) { throw 'base_url_mismatch' }
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$manual = Send '/portal/v1/sessions/manual' 'Post' @{ Origin = $origin } @{ displayId = $state.displayId; deviceKey = $state.deviceKey } $session
Expect 'sessão manual' $manual 200
$csrf = ($manual.Content | ConvertFrom-Json).csrfToken
$delete = Send "/portal/v1/configurations/$($state.sourceId)" 'Delete' @{ Origin = $origin; 'X-CSRF-Token' = $csrf; 'Idempotency-Key' = (New-OperationId) } @{ expectedRevision = 1 } $session
Expect 'exclusão da fonte (portal)' $delete 200, 202
$revoke = Send '/portal/v1/device/revoke' 'Post' @{ Authorization = ('Bearer ' + $state.bearer) } @{ operationId = (New-B64Token); claimSecret = (New-B64Token) } $null
Expect 'revogação de acesso' $revoke 200, 202
Write-Host ("mutate concluído em " + [DateTimeOffset]::UtcNow.ToString('o') + ": eventos source_deleted e access_revoked gravados no journal.")
