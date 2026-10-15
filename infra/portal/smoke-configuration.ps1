[CmdletBinding()]
param([string]$BaseUrl = 'https://portal.ccplaytv.com')

$ErrorActionPreference='Stop'
$base=$BaseUrl.TrimEnd('/')
$origin=$base
function New-B64Token {
  $bytes=New-Object byte[] 32
  $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}

# Enroll a synthetic device; its secrets are retained only in memory.
$nonce=New-B64Token
$identity='synthetic-'+[guid]::NewGuid().ToString()
$enrollBody=@{platformIdentity=$identity;nonce=$nonce}|ConvertTo-Json
$enroll=Invoke-RestMethod -Uri "$base/portal/v1/devices/enroll" -Method Post -ContentType 'application/json' -Headers @{Origin='null'} -Body $enrollBody

$session=New-Object Microsoft.PowerShell.Commands.WebRequestSession
$manualBody=@{displayId=$enroll.displayId;deviceKey=$enroll.deviceKey}|ConvertTo-Json
$manual=Invoke-WebRequest -Uri "$base/portal/v1/sessions/manual" -Method Post -ContentType 'application/json' -Headers @{Origin=$origin} -Body $manualBody -WebSession $session -UseBasicParsing
$csrf=($manual.Content|ConvertFrom-Json).csrfToken
$headers=@{Origin=$origin;'X-CSRF-Token'=$csrf;'Idempotency-Key'=('op-'+[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString()+'-'+(New-B64Token))}
$config=@{type='m3u_url';displayName='Smoke synthetic';m3uUrl='https://example.invalid/synthetic.m3u'}
$op=@{action='source.create';sourceId=('smoke-'+[guid]::NewGuid().ToString('N'));expectedRevision=0;input=$config}|ConvertTo-Json -Depth 5
$result=Invoke-RestMethod -Uri "$base/portal/v1/operations" -Method Post -ContentType 'application/json' -Headers $headers -Body $op -WebSession $session
$operations=Invoke-RestMethod -Uri "$base/portal/v1/operations" -Method Get -Headers @{Origin=$origin} -WebSession $session
$tvHeaders=@{Authorization=('Bearer '+$enroll.bearer)}
$tvOperations=Invoke-RestMethod -Uri "$base/portal/v1/device/operations" -Method Get -Headers $tvHeaders
$deviceOperation=@($tvOperations.operations|Where-Object{$_.operationId -eq $result.operationId})|Select-Object -First 1
if($null -eq $deviceOperation){throw 'device_operation_pull_failed'}
$ackBody=@{state='applied';revision=([int]$deviceOperation.expectedRevision + 1);importState='completed'}|ConvertTo-Json
$ack=Invoke-RestMethod -Uri "$base/portal/v1/device/operations/$($result.operationId)/ack" -Method Post -ContentType 'application/json' -Headers $tvHeaders -Body $ackBody
$configs=Invoke-RestMethod -Uri "$base/portal/v1/configurations" -Method Get -Headers @{Origin=$origin} -WebSession $session
$foundOperation=@($operations.operations|Where-Object{$_.operationId -eq $result.operationId}).Count -eq 1
$foundConfiguration=@($configs.configurations|Where-Object{$_.sourceId -eq $result.sourceId}).Count -eq 1
$ackApplied=($ack.state -eq 'applied')
[pscustomobject]@{enrollment='ok';sessionStatus=$manual.StatusCode;operationId=$result.operationId;stateBeforeAck=$result.state;ackState=$ack.state;revision=$ack.receipt.revision;sourceId=$result.sourceId;operationListed=$foundOperation;deviceOperationPulled=$true;configurationListedAfterAck=$foundConfiguration;secretsPrinted=$false}|ConvertTo-Json
if(-not $foundOperation){throw 'operation_readback_failed'}
if(-not $ackApplied -or -not $foundConfiguration){throw 'configuration_ack_failed'}
