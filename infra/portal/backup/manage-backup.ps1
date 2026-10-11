[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidateSet('schedule','inspect','restore')][string]$Action,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-z][a-z0-9-]{4,61}[a-z0-9]$')][string]$ProjectId,
    [ValidatePattern('^(\(default\)|[a-z][a-z0-9-]{2,61}[a-z0-9])$')][string]$DatabaseId = '(default)',
    [ValidatePattern('^[a-z]+-[a-z]+[0-9]+$')][string]$Location = 'us-central1',
    [string]$BackupResource,
    [ValidatePattern('^portal-restore-[a-z0-9-]+[a-z0-9]$')][string]$DestinationDatabase,
    [string]$Gcloud = 'gcloud',
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$taskArgs = @('firestore')
switch ($Action) {
    'schedule' { $taskArgs += @('backups','schedules','create',"--database=$DatabaseId",'--retention=7d','--recurrence=daily') }
    'inspect' { $taskArgs += @('backups','list',"--location=$Location") }
    'restore' {
        $expectedPrefix = "projects/$ProjectId/locations/$Location/backups/"
        if (-not $BackupResource -or -not $BackupResource.StartsWith($expectedPrefix) -or
            $BackupResource.Substring($expectedPrefix.Length) -notmatch '^[A-Za-z0-9-]+$') { throw 'invalid_backup_resource' }
        if (-not $DestinationDatabase -or $DestinationDatabase -eq $DatabaseId -or $DestinationDatabase.Length -gt 63) { throw 'isolated_restore_database_required' }
        $taskArgs += @('databases','restore',"--source-backup=$BackupResource","--destination-database=$DestinationDatabase",'--encryption-type=google-default-encryption')
    }
}
$taskArgs += @("--project=$ProjectId",'--format=json','--quiet')
if (-not $Apply) {
    [pscustomobject]@{ action=$Action; executable=$Gcloud; arguments=$taskArgs; executes=$false } | ConvertTo-Json -Depth 4
    return
}
# Executavel e argumentos separados; nunca Invoke-Expression.
$raw = & $Gcloud @taskArgs 2>$null
if ($LASTEXITCODE -ne 0) { throw 'backup_command_failed' }
if ($Action -eq 'inspect') {
    $sourceName = "projects/$ProjectId/databases/$DatabaseId"
    $allBackups = $raw | ConvertFrom-Json
    $backups = @($allBackups | Where-Object { $_.database -eq $sourceName -and $_.state -eq 'READY' })
    $latest = $backups | Sort-Object snapshotTime -Descending | Select-Object -First 1
    if (-not $latest) { throw 'backup_missing' }
    $snapshot = [DateTimeOffset]::Parse($latest.snapshotTime)
    $age = ([DateTimeOffset]::UtcNow - $snapshot).TotalHours
    if ($age -lt 0) { throw 'backup_timestamp_invalid' }
    [pscustomobject]@{ code=$(if($age -gt 24){'backup_stale'}else{'backup_current'}); ageHours=[Math]::Round($age,2); snapshotAt=$snapshot.ToString('o') } | ConvertTo-Json
    if ($age -gt 24) { throw 'backup_age_above_24h' }
} else {
    [pscustomobject]@{ code='backup_operation_submitted'; action=$Action; reopenTraffic=$false } | ConvertTo-Json
}
