$ErrorActionPreference = "Stop"
$desktop = Split-Path $PSScriptRoot
$root = Join-Path ([IO.Path]::GetTempPath()) ("tijori-build-test-" + [guid]::NewGuid().ToString("N"))
$bin = Join-Path $desktop "build/postgres/bin"
$server = Join-Path $desktop "build/server/tijori-server.exe"
New-Item -ItemType Directory -Path $root | Out-Null
$data = Join-Path $root "db"
function New-TestPort {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { return $listener.LocalEndpoint.Port } finally { $listener.Stop() }
}
$port = New-TestPort
$webProcess = $null
$pgStarted = $false
try {
    $env:POSTGRES_HOST = '127.0.0.1'
    $env:POSTGRES_PORT = [string]$port
    $env:POSTGRES_DB = 'postgres'
    $env:POSTGRES_USER = 'tijori_build_test'
    $env:POSTGRES_PASSWORD = [guid]::NewGuid().ToString("N")
    $env:PGPASSWORD = $env:POSTGRES_PASSWORD
    $env:DJANGO_SECRET_KEY = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
    $env:DJANGO_DEBUG = 'False'
    $env:DJANGO_ALLOWED_HOSTS = 'localhost,127.0.0.1'
    $env:BACKUP_DIR = Join-Path $root "backups"
    $env:TIJORI_FRONTEND_DIR = (Resolve-Path (Join-Path $desktop "../frontend/dist")).Path
    $env:TIJORI_STATIC_DIR = (Resolve-Path (Join-Path $desktop "build/server/staticfiles")).Path
    $passwordFile = Join-Path $root "init-password"
    [IO.File]::WriteAllText($passwordFile, $env:PGPASSWORD)
    & "$bin/initdb.exe" -D $data -U $env:POSTGRES_USER "--pwfile=$passwordFile" '--auth=scram-sha-256' --encoding=UTF8 --locale=C
    if ($LASTEXITCODE) { throw "Could not initialize the temporary build-test database." }
    Remove-Item -LiteralPath $passwordFile
    & "$bin/pg_ctl.exe" -D $data -l (Join-Path $root "pg.log") -o "-h 127.0.0.1 -p $port" -w start
    if ($LASTEXITCODE) { throw "Could not start the temporary build-test database." }
    $pgStarted = $true
    $httpPort = New-TestPort
    $webProcess = Start-Process -WindowStyle Hidden -FilePath $server -ArgumentList @('--migrate','--host','127.0.0.1','--port',$httpPort) `
        -WorkingDirectory $root -RedirectStandardError (Join-Path $root "server.err") -RedirectStandardOutput (Join-Path $root "server.log") -PassThru
    $base = "http://127.0.0.1:$httpPort"
    $ready = $false
    for ($i = 0; $i -lt 90; $i++) {
        if ($webProcess.HasExited) { throw "Compiled server exited with code $($webProcess.ExitCode)." }
        try {
            if ((Invoke-WebRequest "$base/api/health-check/" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) {
                $ready = $true
                break
            }
        } catch { Start-Sleep -Seconds 1 }
    }
    if (-not $ready) { throw "Compiled server did not become healthy." }
    if ((Invoke-WebRequest "$base/login" -UseBasicParsing).Content -notmatch 'id="root"') { throw "SPA not served." }
    if ((Invoke-WebRequest "$base/static/admin/css/base.css" -UseBasicParsing).Headers['Content-Type'] -notmatch "text/css") {
        throw "Collected admin styles missing."
    }
    # A 200 health check alone cannot detect Nuitka missing dynamic migrations.
    $applied = & "$bin/psql.exe" -h $env:POSTGRES_HOST -p $port -U $env:POSTGRES_USER -d $env:POSTGRES_DB -Atc "SELECT app || '.' || name FROM django_migrations;"
    if ($LASTEXITCODE -ne 0) { throw "Could not query packaged migrations." }
    $backend = Join-Path (Split-Path $desktop) "backend"
    foreach ($app in "audit","auth","customers","finance","inventory","notifications","purchases","sales","suppliers") {
        $label = if ($app -eq "auth") { "custom_auth" } else { $app }
        $expected = @(Get-ChildItem -LiteralPath (Join-Path $backend "$app/migrations") -Filter "*.py" | Where-Object BaseName -match '^\d')
        if (-not $expected.Count) { throw "No migrations found in the build input for $app." }
        foreach ($migration in $expected) {
            if ("$label.$($migration.BaseName)" -notin $applied) { throw "Missing compiled migration: $label.$($migration.BaseName)" }
        }
    }
} catch {
    foreach ($log in "server.err", "server.log", "pg.log") {
        $path = Join-Path $root $log
        if (Test-Path $path) { Get-Content -LiteralPath $path -Tail 60 }
    }
    throw
} finally {
    if ($webProcess -and -not $webProcess.HasExited) { $webProcess.Kill(); $webProcess.WaitForExit() }
    if ($pgStarted) { & "$bin/pg_ctl.exe" -D $data -m fast -w stop }
    # Only the disposable directory created above can be deleted.
    if ((Split-Path $root) -eq [IO.Path]::GetTempPath().TrimEnd('\') -and (Split-Path $root -Leaf) -match '^tijori-build-test-[a-f0-9]{32}$') {
        Remove-Item -LiteralPath $root -Recurse -Force
    }
}
