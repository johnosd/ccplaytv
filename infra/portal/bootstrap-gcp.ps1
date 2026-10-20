[CmdletBinding()]
param(
    # 081/D-001: sem padrão — homologação e produção são projetos diferentes; errar o alvo não pode ser silencioso.
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-z][a-z0-9-]{4,61}[a-z0-9]$')]
    [string]$ProjectId,
    [ValidatePattern('^[a-z]+-[a-z]+[0-9]+$')]
    [string]$Region = 'us-central1',
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'

function Invoke-Gcloud {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    $gcloud = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
    if (-not $gcloud) { $gcloud = Get-Command gcloud -ErrorAction SilentlyContinue }
    if (-not $gcloud) { throw 'gcloud_not_found' }
    & $gcloud.Source @Arguments
    if ($LASTEXITCODE -ne 0) { throw "gcloud_failed: $($Arguments -join ' ')" }
}

function Test-GcloudResource {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    $gcloud = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
    if (-not $gcloud) { $gcloud = Get-Command gcloud -ErrorAction SilentlyContinue }
    $previousErrorAction = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'SilentlyContinue'
        $null = & $gcloud.Source @Arguments 2>$null
        return ($LASTEXITCODE -eq 0)
    } finally {
        $ErrorActionPreference = $previousErrorAction
    }
}

$apis = @(
    'run.googleapis.com',
    'firestore.googleapis.com',
    'artifactregistry.googleapis.com',
    'cloudbuild.googleapis.com',
    'iamcredentials.googleapis.com',
    'cloudscheduler.googleapis.com',
    'logging.googleapis.com',
    'monitoring.googleapis.com'
)
$runtime = "portal-runtime@$ProjectId.iam.gserviceaccount.com"
$scheduler = "portal-scheduler@$ProjectId.iam.gserviceaccount.com"

Invoke-Gcloud @('projects', 'describe', $ProjectId, '--format=value(projectId)')
Write-Host "Projeto validado: $ProjectId"

if (-not $Apply) {
    [pscustomobject]@{
        project = $ProjectId
        region = $Region
        APIs = $apis
        serviceAccounts = @($runtime, $scheduler)
        firestore = "create database (default) in $Region"
        artifactRegistry = "create repository portal in $Region"
        applies = $false
    } | ConvertTo-Json -Depth 4
    exit 0
}

Invoke-Gcloud (@('services', 'enable') + $apis + @('--project', $ProjectId, '--quiet'))
Write-Host 'APIs habilitadas ou já disponíveis.'

if (-not (Test-GcloudResource @('iam', 'service-accounts', 'describe', $runtime, '--project', $ProjectId))) {
    Invoke-Gcloud @('iam', 'service-accounts', 'create', 'portal-runtime', '--display-name=CCPlayTV Portal Runtime', '--project', $ProjectId)
}
Write-Host "Conta runtime verificada: $runtime"
if (-not (Test-GcloudResource @('iam', 'service-accounts', 'describe', $scheduler, '--project', $ProjectId))) {
    Invoke-Gcloud @('iam', 'service-accounts', 'create', 'portal-scheduler', '--display-name=CCPlayTV Portal Scheduler', '--project', $ProjectId)
}
Write-Host "Conta scheduler verificada: $scheduler"

foreach ($role in @('roles/datastore.user', 'roles/logging.logWriter', 'roles/monitoring.metricWriter')) {
    Invoke-Gcloud @('projects', 'add-iam-policy-binding', $ProjectId, '--member', "serviceAccount:$runtime", '--role', $role, '--quiet')
}
Write-Host 'Papéis mínimos do runtime aplicados.'

if (-not (Test-GcloudResource @('firestore', 'databases', 'describe', '--database=(default)', '--project', $ProjectId))) {
    Invoke-Gcloud @('firestore', 'databases', 'create', '--database=(default)', '--location', $Region, '--type=firestore-native', '--project', $ProjectId, '--quiet')
}
Write-Host 'Firestore verificado ou criado.'

if (-not (Test-GcloudResource @('artifacts', 'repositories', 'describe', 'portal', '--location', $Region, '--project', $ProjectId))) {
    Invoke-Gcloud @('artifacts', 'repositories', 'create', 'portal', '--repository-format=docker', '--location', $Region, '--description=CCPlayTV Portal images', '--project', $ProjectId, '--quiet')
}
Write-Host 'Artifact Registry verificado ou criado.'

[pscustomobject]@{
    project = $ProjectId
    region = $Region
    runtime = $runtime
    scheduler = $scheduler
    firestore = 'verified-or-created'
    artifactRegistry = 'verified-or-created'
    editorRoleRemoved = $false
} | ConvertTo-Json -Depth 4
