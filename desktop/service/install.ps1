[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('Install', 'Uninstall')][string]$Mode,
    [Parameter(Mandatory)][string]$InstallDir
)
$ErrorActionPreference = 'Stop'
$env:PSModulePath = $PSHOME + '\Modules;' + $env:SystemRoot + '\System32\WindowsPowerShell\v1.0\Modules'
$name = 'TijoriRuntime'
$root = Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Tijori'
$admins = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
$system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$identity = "NT SERVICE\$name"
$exe = Join-Path $InstallDir 'resources\service\TijoriService.exe'
$utf8 = [Text.UTF8Encoding]::new($false)

function Assert-RealPath([string]$Path) {
    $info = Get-Item -LiteralPath $Path -Force
    while ($info) {
        if ($info.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Unexpected link in $Path" }
        $info = $info.Parent
    }
}
function Set-PrivateAcl([string]$Path, [bool]$Directory, $ServiceRights) {
    Assert-RealPath $Path
    $inherit = [Security.AccessControl.InheritanceFlags]::None
    if ($Directory) {
        $acl = [Security.AccessControl.DirectorySecurity]::new()
        $inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
    } else { $acl = [Security.AccessControl.FileSecurity]::new() }
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetOwner($admins)
    foreach ($sid in @($admins,$system)) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl',$inherit,'None','Allow'))
    }
    if ($ServiceRights) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity,$ServiceRights,$inherit,'None','Allow'))
    }
    $item = Get-Item -LiteralPath $Path -Force
    if ($PSVersionTable.PSEdition -eq 'Core') {
        [IO.FileSystemAclExtensions]::SetAccessControl($item, $acl)
    } else {
        $item.SetAccessControl($acl)
    }
}
function New-Secret {
    $bytes = New-Object byte[] 48
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    [Convert]::ToBase64String($bytes)
}
function Invoke-SC([string[]]$Arguments) {
    & "$env:SystemRoot\System32\sc.exe" @Arguments | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Windows service operation failed ($LASTEXITCODE)." }
}

$service = Get-Service -Name $name -ErrorAction SilentlyContinue
if ($service -and $service.Status -ne 'Stopped') {
    Stop-Service -Name $name
    $service.WaitForStatus('Stopped', [TimeSpan]::FromMinutes(3))
}
if ($Mode -eq 'Uninstall') {
    if ($service) { $service.Dispose(); Invoke-SC @('delete',$name) }
    return
}

$programFiles = [Environment]::GetFolderPath('ProgramFiles')
if (![IO.Path]::GetFullPath($InstallDir).StartsWith($programFiles + '\',[StringComparison]::OrdinalIgnoreCase)) {
    throw 'Choose a folder under Program Files for Tijori.'
}
Assert-RealPath $InstallDir
$serviceParams = @{
    PathName = '"' + $exe + '"'
    StartMode = 'Automatic'
    StartName = $identity
}
if (!$service) {
    $serviceParams.Name = $name
    $serviceParams.DisplayName = 'Tijori POS shop service'
    $serviceParams.ServiceType = [byte]16
    $serviceParams.ErrorControl = [byte]1
    $result = Invoke-CimMethod -ClassName Win32_Service -MethodName Create -Arguments $serviceParams
} else {
    $installed = Get-CimInstance -ClassName Win32_Service -Filter "Name='$name'"
    $result = Invoke-CimMethod -InputObject $installed -MethodName Change -Arguments $serviceParams
}
if ($result.ReturnValue -ne 0) { throw "Could not register the shop service (error $($result.ReturnValue))." }
Invoke-SC @('sidtype',$name,'unrestricted')
Invoke-SC @('failure',$name,'reset=','86400','actions=','restart/5000/restart/15000/restart/60000')

if (Test-Path -LiteralPath $root) {
    Assert-RealPath $root
    $existingAcl = [Security.AccessControl.DirectorySecurity]::new($root,[Security.AccessControl.AccessControlSections]::Owner)
    $owner = $existingAcl.GetOwner([Security.Principal.SecurityIdentifier])
    if ($owner -notin @($admins,$system)) { throw 'Existing Tijori data directory has an unexpected owner.' }
} else {
    [IO.Directory]::CreateDirectory($root) | Out-Null
}
# The service needs to publish its initialized pgdata folder under this directory.
# Restrict the separate plaintext file below to SYSTEM and Administrators.
Set-PrivateAcl $root $true 'Modify'
foreach ($folder in @('logs','backups','state')) {
    $path = Join-Path $root $folder
    [IO.Directory]::CreateDirectory($path) | Out-Null
    Set-PrivateAcl $path $true 'Modify'
}
$envFile = Join-Path $root 'tijori.env'
if (!(Test-Path -LiteralPath $envFile)) {
    if ((Test-Path (Join-Path $root 'pgdata')) -or (Test-Path (Join-Path $root 'state\machine.json'))) {
        throw 'Database credentials are missing for existing shop data. Restore tijori.env from the same installation.'
    }
    $ips = [Net.Dns]::GetHostAddresses([Net.Dns]::GetHostName()) |
        Where-Object AddressFamily -eq InterNetwork | ForEach-Object IPAddressToString
    $settings = @("DJANGO_SECRET_KEY=$(New-Secret)",'DJANGO_DEBUG=False','DJANGO_TIME_ZONE=Asia/Karachi',
        ('DJANGO_ALLOWED_HOSTS=' + ((@('localhost','127.0.0.1') + @($ips)) -join ',')),
        'POSTGRES_HOST=127.0.0.1','POSTGRES_PORT=55432','POSTGRES_USER=tijori','POSTGRES_DB=tijori',
        "POSTGRES_PASSWORD=$(New-Secret)","TIJORI_PG_BOOTSTRAP=$(New-Secret)","BACKUP_DIR=$root\backups")
    $temp = Join-Path $root ([Guid]::NewGuid().ToString() + '.tmp')
    [IO.File]::WriteAllText($temp,'',$utf8)
    Set-PrivateAcl $temp $false $null
    [IO.File]::WriteAllLines($temp,[string[]]$settings,$utf8)
    [IO.File]::Move($temp,$envFile)
}
Set-PrivateAcl $envFile $false $null
# Only the dedicated service account can open this DPAPI-protected bootstrap copy.
Add-Type -AssemblyName System.Security
$sealed = [Security.Cryptography.ProtectedData]::Protect([IO.File]::ReadAllBytes($envFile),$null,'LocalMachine')
$protected = Join-Path $root 'state\runtime.dpapi'
[IO.File]::WriteAllBytes($protected,$sealed)
Set-PrivateAcl $protected $false 'Read'
Start-Service -Name $name
