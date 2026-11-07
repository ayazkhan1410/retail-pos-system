# EDB's x64 ZIP links to the Visual C++ runtime but does not carry those DLLs.
$ErrorActionPreference = 'Stop'
$desktop = Split-Path $PSScriptRoot
$required = @('vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll')

function Get-CrtDirectory {
    $versions = @()
    if ($env:VCToolsRedistDir) { $versions += $env:VCToolsRedistDir }
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
    if (Test-Path -LiteralPath $vswhere) {
        $installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        if ($installation) {
            $root = Join-Path $installation 'VC/Redist/MSVC'
            if (Test-Path -LiteralPath $root) {
                $versions += @(Get-ChildItem -Directory -LiteralPath $root |
                    Where-Object Name -match '^\d+(\.\d+)+$' |
                    Sort-Object { [version]$_.Name } -Descending | ForEach-Object FullName)
            }
        }
    }
    foreach ($version in $versions) {
        $target = Join-Path $version 'x64'
        if (-not (Test-Path -LiteralPath $target)) { continue }
        foreach ($crt in Get-ChildItem -LiteralPath $target -Directory -Filter 'Microsoft.VC*.CRT') {
            if ($crt.FullName -notmatch '\\VC\\Redist\\MSVC\\(?:[\d.]+|v\d+)\\x64\\Microsoft\.VC\d+\.CRT$') { continue }
            if (-not ($required | Where-Object { -not (Test-Path -LiteralPath (Join-Path $crt.FullName $_)) })) {
                return $crt.FullName
            }
        }
    }
    throw 'Install the x64 Visual C++ redistributable files for Visual Studio C++ Build Tools. No complete Microsoft.VC*.CRT directory was found.'
}

function Assert-X64([string] $Path) {
    $reader = [IO.BinaryReader]::new([IO.File]::OpenRead($Path))
    try {
        if ($reader.ReadUInt16() -ne 0x5A4D) { throw "Not a Windows DLL: $Path" }
        $reader.BaseStream.Position = 0x3c
        $header = $reader.ReadInt32()
        $reader.BaseStream.Position = $header
        if ($reader.ReadUInt32() -ne 0x4550 -or $reader.ReadUInt16() -ne 0x8664) { throw "Not an x64 Windows DLL: $Path" }
    } finally { $reader.Dispose() }
}

$source = Get-CrtDirectory
$server = Join-Path $desktop 'build/server'
$postgres = Join-Path $desktop 'build/postgres/bin'
if (-not (Test-Path (Join-Path $server 'tijori-server.exe')) -or -not (Test-Path (Join-Path $postgres 'postgres.exe'))) {
    throw 'Compile the server and stage the pinned PostgreSQL archive first.'
}
$dlls = @(Get-ChildItem -File -LiteralPath $source -Filter '*.dll')
foreach ($dll in $dlls) {
    Assert-X64 $dll.FullName
    $signature = Get-AuthenticodeSignature -LiteralPath $dll.FullName
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation(?:,|$)') {
        throw "Expected a Microsoft-signed release runtime in $source, found $($dll.Name) ($($signature.Status))."
    }
}
foreach ($dll in $dlls) {
    foreach ($bin in @($postgres, $server)) {
        $target = Join-Path $bin $dll.Name
        if (Test-Path -LiteralPath $target) {
            # Preserve the tested DLL already selected by Nuitka or supplied by EDB.
            Assert-X64 $target
        } else {
            Copy-Item -LiteralPath $dll.FullName -Destination $target
        }
    }
}
Write-Output "Staged app-local x64 CRT for PostgreSQL and the compiled server from $source."
