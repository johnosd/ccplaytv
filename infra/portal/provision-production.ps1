[CmdletBinding()]
param(
    # 081/T008: recursos do projeto de produção que o bootstrap-gcp.ps1 não cria. Dry-run por padrão.
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-z][a-z0-9-]{4,61}[a-z0-9]$')][string]$ProjectId,
    # journal: bucket + papel custom + binding; scheduler: depois do deploy do jobs; backup: agenda diária 7 dias;
    # budget: orçamento de referência com avisos (não é teto).
    # indexes: índices compostos e exclusões de firestore.indexes.json (sem o índice de jobs o tick dá 500).
    [Parameter(Mandatory = $true)][ValidateSet('journal', 'indexes', 'scheduler', 'backup', 'budget')][string]$Step,
    [ValidatePattern('^[a-z]+-[a-z]+[0-9]+$')][string]$Region = 'us-central1',
    [ValidatePattern('^[a-z0-9][a-z0-9._-]{2,62}$')][string]$Bucket = '',
    [ValidatePattern('^[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{6}$')][string]$BillingAccount = '',
    [ValidatePattern('^[0-9]{1,6}$')][string]$BudgetAmount = '10',
    [ValidatePattern('^[A-Z]{3}$')][string]$BudgetCurrency = 'BRL',
    [string]$Gcloud = 'gcloud.cmd',
    [switch]$Apply
)
# Executável + argumentos separados; nunca Invoke-Expression. Nenhum segredo passa por aqui.
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
if (-not $Bucket) { $Bucket = "$ProjectId-portal-journal" }
$runtime = "portal-runtime@$ProjectId.iam.gserviceaccount.com"
$scheduler = "portal-scheduler@$ProjectId.iam.gserviceaccount.com"
$role = "projects/$ProjectId/roles/portalJournalWriter"
$planned = New-Object System.Collections.Generic.List[object]

function Test-Resource([string[]]$Arguments) {
    if (-not $Apply) { return $false }
    $previous = $ErrorActionPreference
    try { $ErrorActionPreference = 'SilentlyContinue'; $null = & $Gcloud @Arguments 2>$null; return ($LASTEXITCODE -eq 0) }
    finally { $ErrorActionPreference = $previous }
}

function Invoke-Step([string]$Name, [string[]]$Arguments, [string[]]$Exists = @()) {
    if ($Exists.Count -and (Test-Resource $Exists)) { $planned.Add([pscustomobject]@{ step = $Name; state = 'exists' }); return }
    if (-not $Apply) { $planned.Add([pscustomobject]@{ step = $Name; executable = $Gcloud; arguments = $Arguments }); return }
    & $Gcloud @Arguments
    if ($LASTEXITCODE -ne 0) { throw "provision_failed: $Name" }
    $planned.Add([pscustomobject]@{ step = $Name; state = 'applied' })
}

switch ($Step) {
    'journal' {
        Invoke-Step 'journal-bucket' @('storage', 'buckets', 'create', "gs://$Bucket", "--project=$ProjectId", "--location=$Region",
            '--uniform-bucket-level-access', '--public-access-prevention', "--lifecycle-file=$(Join-Path $here 'journal-lifecycle.json')", '--quiet') `
            @('storage', 'buckets', 'describe', "gs://$Bucket", "--project=$ProjectId")
        Invoke-Step 'journal-writer-role' @('iam', 'roles', 'create', 'portalJournalWriter', "--project=$ProjectId",
            "--file=$(Join-Path $here 'journal-writer-role.json')", '--quiet') `
            @('iam', 'roles', 'describe', 'portalJournalWriter', "--project=$ProjectId")
        Invoke-Step 'journal-writer-binding' @('storage', 'buckets', 'add-iam-policy-binding', "gs://$Bucket",
            "--member=serviceAccount:$runtime", "--role=$role", "--project=$ProjectId", '--quiet')
    }
    'indexes' {
        $spec = [System.IO.File]::ReadAllText((Join-Path $here 'firestore.indexes.json')) | ConvertFrom-Json
        # Chave "grupo:campo1,campo2" dos índices existentes (o Firestore acrescenta __name__ ao fim; ignorado).
        $existing = @()
        if ($Apply) {
            $raw = (& $Gcloud firestore indexes composite list "--project=$ProjectId" '--format=json' 2>$null) -join ''
            if ($raw -match '"name"') {
                # Parênteses: no 5.1, ConvertFrom-Json em pipeline entrega o array como um item só.
                $existing = @((ConvertFrom-Json $raw) | ForEach-Object {
                    ($_.name -replace '^.*/collectionGroups/([^/]+)/.*$', '$1') + ':' +
                    (($_.fields | Where-Object { $_.fieldPath -ne '__name__' } | ForEach-Object { $_.fieldPath }) -join ',') })
            }
        }
        foreach ($index in $spec.indexes) {
            $fields = @($index.fields | ForEach-Object { "--field-config=field-path=$($_.fieldPath),order=$($_.order.ToLower())" })
            $paths = ($index.fields | ForEach-Object { $_.fieldPath }) -join ','
            if ($existing -contains "$($index.collectionGroup):$paths") { $planned.Add([pscustomobject]@{ step = "index $($index.collectionGroup)($paths)"; state = 'exists' }); continue }
            Invoke-Step "index $($index.collectionGroup)($paths)" (@('firestore', 'indexes', 'composite', 'create', "--collection-group=$($index.collectionGroup)",
                "--query-scope=$($index.queryScope.ToLower())", "--project=$ProjectId", '--async', '--quiet') + $fields)
        }
        foreach ($override in $spec.fieldOverrides) {
            Invoke-Step "exempt $($override.collectionGroup).$($override.fieldPath)" @('firestore', 'indexes', 'fields', 'update', $override.fieldPath,
                "--collection-group=$($override.collectionGroup)", '--disable-indexes', "--project=$ProjectId", '--async', '--quiet')
        }
    }
    'scheduler' {
        $url = 'https://JOBS_SERVICE_URL'
        if ($Apply) {
            $url = (& $Gcloud run services describe ccplaytv-portal-jobs "--region=$Region" "--project=$ProjectId" '--format=value(status.url)').Trim()
            if ($LASTEXITCODE -ne 0 -or $url -notmatch '^https://[a-z0-9.-]+$') { throw 'jobs_service_required' }
        }
        Invoke-Step 'jobs-invoker' @('run', 'services', 'add-iam-policy-binding', 'ccplaytv-portal-jobs', "--region=$Region",
            "--project=$ProjectId", "--member=serviceAccount:$scheduler", '--role=roles/run.invoker', '--quiet')
        # Mesmo job de scheduler.json: tick horário, OIDC com audience = URL do jobs.
        Invoke-Step 'portal-tick' @('scheduler', 'jobs', 'create', 'http', 'portal-tick', "--location=$Region", "--project=$ProjectId",
            '--schedule=0 * * * *', '--time-zone=Etc/UTC', "--uri=$url/internal/portal/jobs/tick", '--http-method=POST',
            '--headers=Content-Type=application/json', '--message-body={}', '--attempt-deadline=60s',
            "--oidc-service-account-email=$scheduler", "--oidc-token-audience=$url", '--quiet') `
            @('scheduler', 'jobs', 'describe', 'portal-tick', "--location=$Region", "--project=$ProjectId")
    }
    'backup' {
        $exists = $false
        if ($Apply) {
            $rows = & $Gcloud firestore backups schedules list '--database=(default)' "--project=$ProjectId" '--format=json' 2>$null
            # No 5.1, @(ConvertFrom-Json '[]').Count é 1: decidir pelo texto (agenda existente tem "name").
            $exists = $LASTEXITCODE -eq 0 -and (($rows -join '') -match '"name"\s*:')
        }
        if ($exists) { $planned.Add([pscustomobject]@{ step = 'backup-schedule'; state = 'exists' }) }
        else {
            $arguments = @{ Action = 'schedule'; ProjectId = $ProjectId; Gcloud = $Gcloud; Apply = [bool]$Apply }
            & (Join-Path $here 'backup/manage-backup.ps1') @arguments | Out-Null
            $planned.Add([pscustomobject]@{ step = 'backup-schedule'; state = $(if ($Apply) { 'applied' } else { 'planned: manage-backup.ps1 -Action schedule' }) })
        }
    }
    'budget' {
        if (-not $BillingAccount) { throw 'billing_account_required' }
        # Avisos 50/90/100% do gasto e 150% previsto (budget.json); alerta não corta o serviço.
        if ($Apply) {
            $names = & $Gcloud billing budgets list "--billing-account=$BillingAccount" '--format=value(displayName)' 2>$null
            if ($LASTEXITCODE -eq 0 -and @($names) -contains "ccplaytv-portal-$ProjectId") {
                $planned.Add([pscustomobject]@{ step = 'budget'; state = 'exists' }); break
            }
        }
        Invoke-Step 'budget' @('billing', 'budgets', 'create', "--billing-account=$BillingAccount",
            "--display-name=ccplaytv-portal-$ProjectId", "--budget-amount=$BudgetAmount$BudgetCurrency",
            "--filter-projects=projects/$ProjectId", '--threshold-rule=percent=0.5', '--threshold-rule=percent=0.9',
            '--threshold-rule=percent=1.0', '--threshold-rule=percent=1.5,basis=forecasted-spend', '--quiet')
    }
}

[pscustomobject]@{ project = $ProjectId; step = $Step; applies = [bool]$Apply; actions = $planned } | ConvertTo-Json -Depth 5
