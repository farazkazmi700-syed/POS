param(
  [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{24}$')][string]$BusinessId,
  [Parameter(Mandatory)][string]$Directory,
  [switch]$Restore
)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$db = "kazmion_business_$BusinessId"
$name = "$BusinessId-invoices.csv"
$file = Join-Path $Directory $name
$tmp = '/tmp/tenant-' + [guid]::NewGuid().ToString('N')
$columns = 'tenant_id,order_id,status,pdf_path,generation,updated_at'
try {
  if ($Restore) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing business backup: $file" }
    docker compose cp $file "kazmion:$tmp"
    if ($LASTEXITCODE) { throw 'Could not stage backup' }
    docker compose exec -T kazmion chown postgres:postgres $tmp
    if ($LASTEXITCODE) { throw 'Could not prepare backup for restore' }
    $emptyCheck = 'DO $$ BEGIN IF EXISTS (SELECT FROM invoice_store.invoices) THEN RAISE EXCEPTION ''Restore requires empty invoice table''; END IF; END $$'
    docker compose exec -T -u postgres kazmion psql -X -v ON_ERROR_STOP=1 -1 -d $db -c 'LOCK invoice_store.invoices IN ACCESS EXCLUSIVE MODE' -c $emptyCheck -c "COPY invoice_store.invoices($columns) FROM '$tmp' WITH (FORMAT csv, HEADER MATCH)"
    if ($LASTEXITCODE) { throw 'Business restore failed and was rolled back' }
  } else {
    New-Item -Force -ItemType Directory -Path $Directory | Out-Null
    if (Test-Path -LiteralPath $file) { throw "Backup already exists: $file" }
    docker compose exec -T -u postgres kazmion psql -X -v ON_ERROR_STOP=1 -d $db -c "COPY (SELECT $columns FROM invoice_store.invoices ORDER BY order_id) TO '$tmp' WITH (FORMAT csv, HEADER true)"
    if ($LASTEXITCODE) { throw 'Business database export failed' }
    docker compose cp "kazmion:$tmp" $file
    if ($LASTEXITCODE) { throw 'Could not copy business backup' }
  }
} finally {
  docker compose exec -T kazmion rm -f $tmp
}

