param(
    [string] $Python = "python",
    [ValidateSet("MSVC", "MinGW")] [string] $Compiler = "MSVC",
    [int] $Jobs = 2
)
$ErrorActionPreference = "Stop"
$desktop = Split-Path $PSScriptRoot
$backend = Join-Path (Split-Path $desktop) "backend"
$build = Join-Path $desktop "build"
$compileDir = Join-Path $build "nuitka"
$server = Join-Path $build "server"
# Rebuild into empty output. Do not delete files from a previous local run.
if (Test-Path -LiteralPath $server) { throw "Remove the previous desktop/build/server build output before rebuilding." }
$compiled = Join-Path $compileDir "serve.dist"
if (Test-Path -LiteralPath $compiled) { throw "Remove the previous desktop/build/nuitka/serve.dist output before rebuilding." }
New-Item -ItemType Directory -Force -Path $compileDir | Out-Null
$argsList = @(
    "-m", "nuitka", "--mode=standalone", "--assume-yes-for-downloads", "--jobs=$Jobs",
    "--output-dir=$compileDir", "--output-filename=tijori-server.exe", "--windows-console-mode=hide",
    "--report=$build/nuitka-report.xml", "--module-parameter=django-settings-module=smartshop_pos.settings", "--nofollow-import-to=django.contrib.gis",
    "--nofollow-import-to=django.contrib.gis.*", "--nofollow-import-to=*.tests", "--nofollow-import-to=*.tests_*"
)
if ($Compiler -eq "MinGW") { $argsList += "--mingw64" } else { $argsList += "--msvc=latest" }
# Django resolves its apps, database backend, migration modules and management commands by name.
$packages = "smartshop_pos", "audit", "auth", "customers", "finance", "inventory", "notifications", "purchases",
            "sales", "suppliers", "rest_framework", "corsheaders", "waitress", "psycopg2", "tzdata",
            "django.conf", "django.core", "django.db", "django.forms", "django.middleware", "django.template",
            "django.templatetags", "django.views", "django.contrib.admin", "django.contrib.auth",
            "django.contrib.contenttypes", "django.contrib.messages", "django.contrib.sessions", "django.contrib.staticfiles"
foreach ($pkg in $packages) { $argsList += "--include-package=$pkg" }
foreach ($pkg in @("django", "rest_framework", "tzdata")) { $argsList += "--include-package-data=$pkg" }
Push-Location $backend
try {
    # Nuitka imports settings to discover Django's dynamic dependencies. Its introspection needs no database.
    $env:DJANGO_SECRET_KEY = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
    $env:DJANGO_DEBUG = "False"
    $env:POSTGRES_HOST = "127.0.0.1"
    & $Python @argsList "serve.py"
    if ($LASTEXITCODE -ne 0) { throw "Nuitka compilation failed." }
    if (-not (Test-Path -LiteralPath (Join-Path $compiled "tijori-server.exe"))) { throw "Missing compiled server." }
    $buildPrefix = [IO.Path]::GetFullPath($build).TrimEnd('\') + '\'
    $compiled = (Resolve-Path -LiteralPath $compiled).Path
    $server = [IO.Path]::GetFullPath($server)
    if (-not $compiled.StartsWith($buildPrefix,[StringComparison]::OrdinalIgnoreCase) -or
        -not $server.StartsWith($buildPrefix,[StringComparison]::OrdinalIgnoreCase)) { throw "Unexpected build output paths." }
    Move-Item -LiteralPath $compiled -Destination $server
    $env:TIJORI_STATIC_DIR = Join-Path $server "staticfiles"
    $env:DJANGO_SETTINGS_MODULE = "smartshop_pos.settings"
    & $Python -c "import os, django; from django.conf import settings; settings.STATIC_ROOT = os.environ['TIJORI_STATIC_DIR']; django.setup(); from django.core.management import call_command; call_command('collectstatic', interactive=False, verbosity=0)"
    if ($LASTEXITCODE -ne 0) { throw "collectstatic failed." }
} finally { Pop-Location }
