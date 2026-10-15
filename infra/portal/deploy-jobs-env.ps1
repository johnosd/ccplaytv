[CmdletBinding()]
param(
  [string]$ProjectId = 'ccplaytv-511322',
  [string]$Region = 'us-central1',
  [string]$SourceEnv = '',
  [string]$Image = '',
  [string]$Gcloud = 'gcloud.cmd'
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($SourceEnv)) { $SourceEnv = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'staging.env.yaml' }
$source = (Resolve-Path -LiteralPath $SourceEnv).Path
$temporary = Join-Path (Split-Path -Parent $source) 'jobs.env.yaml'
try {
  $content = Get-Content -LiteralPath $source -Raw
  if ($content -notmatch '(?m)^CCPLAY_PORTAL_SERVICE_ROLE:\s*public\s*$') {
    throw 'public_service_role_not_found'
  }
  $content = $content -replace '(?m)^CCPLAY_PORTAL_SERVICE_ROLE:\s*public\s*$', 'CCPLAY_PORTAL_SERVICE_ROLE: jobs'
  [System.IO.File]::WriteAllText($temporary, $content, (New-Object System.Text.UTF8Encoding($false)))
  $arguments = @('run', 'services', 'update', 'ccplaytv-portal-jobs', "--region=$Region", "--project=$ProjectId", "--env-vars-file=$temporary", '--quiet')
  if (-not [string]::IsNullOrWhiteSpace($Image)) { $arguments += "--image=$Image" }
  & $Gcloud @arguments
  if ($LASTEXITCODE -ne 0) { throw 'jobs_deploy_failed' }
} finally {
  if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
}
