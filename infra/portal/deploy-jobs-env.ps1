[CmdletBinding()]
param(
  # 081/D-001: projeto e arquivo de ambiente obrigatórios — nada aponta para a homologação por padrão.
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z][a-z0-9-]{4,61}[a-z0-9]$')][string]$ProjectId,
  [Parameter(Mandatory = $true)][string]$SourceEnv,
  [string]$Region = 'us-central1',
  [string]$Image = '',
  # Primeiro deploy do jobs num projeto novo (o serviço ainda não existe): exige -Image.
  [switch]$Create,
  [string]$Gcloud = 'gcloud.cmd'
)

$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath $SourceEnv).Path
$temporary = Join-Path (Split-Path -Parent $source) 'jobs.env.yaml'
try {
  $content = Get-Content -LiteralPath $source -Raw
  # Aceita o valor com ou sem aspas (o gerador da 081 grava entre aspas).
  if ($content -notmatch '(?m)^CCPLAY_PORTAL_SERVICE_ROLE:\s*"?public"?\s*$') {
    throw 'public_service_role_not_found'
  }
  $content = $content -replace '(?m)^CCPLAY_PORTAL_SERVICE_ROLE:\s*"?public"?\s*$', 'CCPLAY_PORTAL_SERVICE_ROLE: "jobs"'
  [System.IO.File]::WriteAllText($temporary, $content, (New-Object System.Text.UTF8Encoding($false)))
  if ($Create) {
    if ([string]::IsNullOrWhiteSpace($Image)) { throw 'image_required_for_create' }
    # Privado (sem --allow-unauthenticated): só o Scheduler com OIDC invoca o tick.
    $arguments = @('run', 'deploy', 'ccplaytv-portal-jobs', "--image=$Image", "--region=$Region", "--project=$ProjectId",
      "--service-account=portal-runtime@$ProjectId.iam.gserviceaccount.com", '--no-allow-unauthenticated',
      # Dimensionamento de services.json / cloud-run-jobs.json.
      '--min=0', '--max=2', '--concurrency=20', '--memory=512Mi', '--cpu=1', '--timeout=60', '--cpu-throttling',
      "--env-vars-file=$temporary", '--quiet')
  } else {
    $arguments = @('run', 'services', 'update', 'ccplaytv-portal-jobs', "--region=$Region", "--project=$ProjectId", "--env-vars-file=$temporary", '--quiet')
    if (-not [string]::IsNullOrWhiteSpace($Image)) { $arguments += "--image=$Image" }
  }
  & $Gcloud @arguments
  if ($LASTEXITCODE -ne 0) { throw 'jobs_deploy_failed' }
} finally {
  if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
}
